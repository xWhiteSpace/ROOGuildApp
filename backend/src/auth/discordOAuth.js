import { Router } from 'express';
import { discordClient } from '../discord-bot/client.js'; // LINK TO BOT INSTANCE

const router = Router();
const discordApi = 'https://discord.com/api';

// 🌟 SMART MEMORY CACHE CONFIGURATION
let cachedMembers = null;
let lastFetchTime = 0;
const CACHE_DURATION = 2 * 60 * 1000; // Keep roster in RAM for 2 minutes (Perfect for active raids)

// A quick helper function to get the correct frontend URL on demand
const getFrontendUrl = () => process.env.FRONTEND_URL || 'http://localhost:3000';

function buildDiscordLoginUrl(state) {
  const clientId = process.env.DISCORD_CLIENT_ID;
  const redirectUri = encodeURIComponent(process.env.OAUTH_REDIRECT_URI);
  const scope = encodeURIComponent('identify');
  return `${discordApi}/oauth2/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=${scope}&state=${encodeURIComponent(state)}`;
}

// 🛡️ ANTI-RATE-LIMIT EXPOSED ROSTER ENDPOINT
router.get('/discord-members', async (req, res) => {
  const guildId = process.env.DISCORD_GUILD_ID;
  if (!guildId) {
    return res.status(500).json({ error: 'DISCORD_GUILD_ID is not configured in your backend .env file' });
  }

  try {
    if (!discordClient || !discordClient.isReady()) {
      return res.status(503).json({ error: 'Discord bot client is initializing. Give it a moment...' });
    }

    const now = Date.now();

    // ⚡ STEP 1: Check if we have a valid cache in RAM that hasn't expired yet
    if (cachedMembers && (now - lastFetchTime < CACHE_DURATION)) {
      return res.json({ success: true, members: cachedMembers });
    }

    // 🌐 STEP 2: Cache expired or empty. Safely fetch fresh roster records from Discord
    const guild = await discordClient.guilds.fetch(guildId);
    const membersCollection = await guild.members.fetch();

    // Pluck data fields needed for autocomplete matching
    cachedMembers = membersCollection.map((member) => ({
      id: member.id,
      username: member.user.username,
      nickname: member.nickname || '',
      displayName: member.displayName || ''
    }));
    
    // Log timestamp of successful refresh
    lastFetchTime = now;

    return res.json({ success: true, members: cachedMembers });
  } catch (error) {
    console.error('Failed to fetch roster for layout matching:', error.message);
    
    // 🚑 STEP 3: Bulletproof Fallback Strategy
    if (cachedMembers) {
      console.log('⚠️ Discord API rate limited or errored. Serving stale cache fallback to keep UI functional.');
      return res.json({ success: true, members: cachedMembers });
    }
    
    return res.status(500).json({ error: 'Failed to sync Discord server roster' });
  }
});

router.get('/login', (req, res) => {
  const state = Math.random().toString(36).substring(2);
  req.session.oauthState = state;
  res.redirect(buildDiscordLoginUrl(state));
});

router.get('/callback', async (req, res) => {
  const code = Array.isArray(req.query.code) ? req.query.code[0] : req.query.code;
  const state = Array.isArray(req.query.state) ? req.query.state[0] : req.query.state;
  const targetFrontend = getFrontendUrl(); 

  if (!code) {
    console.error('Discord OAuth callback is missing code.', req.query);
    return res.redirect(`${targetFrontend}/login?error=discord_oauth_code_missing`);
  }

  if (req.session.oauthState && state !== req.session.oauthState) {
    console.error('Discord OAuth state mismatch.', { expected: req.session.oauthState, actual: state });
    return res.redirect(`${targetFrontend}/login?error=discord_oauth_state_mismatch`);
  }

  try {
    const body = new URLSearchParams({
      client_id: process.env.DISCORD_CLIENT_ID,
      client_secret: process.env.DISCORD_CLIENT_SECRET,
      grant_type: 'authorization_code',
      code: String(code),
      redirect_uri: process.env.OAUTH_REDIRECT_URI,
      scope: 'identify',
    });

    const tokenResponse = await fetch(`${discordApi}/oauth2/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('Discord token exchange failed:', errorText);
      return res.redirect(`${targetFrontend}/login?error=discord_token_exchange_failed`);
    }

    const tokenData = await tokenResponse.json();
    const userResponse = await fetch(`${discordApi}/users/@me`, {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
      },
    });

    if (!userResponse.ok) {
      const errorText = await userResponse.text();
      console.error('Discord user fetch failed:', errorText);
      return res.redirect(`${targetFrontend}/login?error=discord_user_fetch_failed`);
    }

    const user = await userResponse.json();
    
    // Default fallback to account name profiles
    let serverNickname = user.global_name || user.username;
    const guildId = process.env.DISCORD_GUILD_ID;

    // 🌟 INTERCEPT WITH BOT INSTANCE: Query the guild to retrieve the custom nickname
    if (discordClient && discordClient.isReady() && guildId) {
      try {
        const guild = await discordClient.guilds.fetch(guildId);
        const member = await guild.members.fetch(user.id);
        if (member) {
          serverNickname = member.nickname || member.displayName || serverNickname;
        }
      } catch (err) {
        console.warn('⚠️ Could not fetch custom server nickname profile via Bot Client. Falling back to default identity.');
      }
    }

    req.session.user = {
      id: user.id,
      username: user.username,
      discriminator: user.discriminator,
      avatar: user.avatar,
      displayName: serverNickname // 🌟 Saved true server nickname profile (e.g., "Azrielle")
    };

    return req.session.save(() => {
      // 🌟 URL Parameter Delivery: Safely pass the session data to bypass cross-origin mobile blocks
      const encodedUser = encodeURIComponent(JSON.stringify(req.session.user));
      res.redirect(`${targetFrontend}/?auth_user=${encodedUser}`);
    });
  } catch (error) {
    console.error('Discord OAuth callback error:', error);
    return res.redirect(`${targetFrontend}/login?error=discord_oauth_failed`);
  }
});

router.get('/me', (req, res) => {
  if (!req.session?.user) {
    return res.status(200).json({ authenticated: false, user: null });
  }

  return res.json({ authenticated: true, user: req.session.user });
});

router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ success: false, error: 'Failed to destroy session' });
    }

    return res.json({ success: true });
  });
});

export default router;