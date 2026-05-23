import { Router } from 'express';
import { discordClient } from '../discord-bot/client.js';

const router = Router();
const discordApi = 'https://discord.com/api';

let cachedMembers = null;
let lastFetchTime = 0;
const CACHE_DURATION = 2 * 60 * 1000;

// 🌟 CONCURRENCY CHANNEL: Merges multi-device/tablet loading requests into a single flight
let activeFetchPromise = null;

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
  const requestOrigin = req.headers.origin || 'No Origin Header';

  if (!guildId) {
    return res.status(500).json({ error: 'DISCORD_GUILD_ID is not configured in your backend .env file' });
  }

  const now = Date.now();

  // 1. Serve immediately if the local memory cache is fresh
  if (cachedMembers && (now - lastFetchTime < CACHE_DURATION)) {
    return res.json({ success: true, members: cachedMembers });
  }

  // 2. 🛡️ CONCURRENCY LOCK: If a parallel device thread is actively requesting chunks, attach to its promise
  if (activeFetchPromise) {
    try {
      const members = await activeFetchPromise;
      return res.json({ success: true, members });
    } catch (err) {
      if (cachedMembers) return res.json({ success: true, members: cachedMembers });
      return res.status(500).json({ error: err.message });
    }
  }

  // 3. Define the single execution block for fetching from Discord
  activeFetchPromise = (async () => {
    if (!discordClient || !discordClient.isReady()) {
      throw new Error('Discord bot client is initializing. Give it a moment...');
    }
    const guild = await discordClient.guilds.fetch(guildId);
    const membersCollection = await guild.members.fetch();

    return membersCollection.map((member) => ({
      id: member.id,
      username: member.user.username,
      nickname: member.nickname || '',
      displayName: member.displayName || ''
    }));
  })();

  try {
    console.log('🌐 [SERVER DIAGNOSTIC] Launching coordinated roster handshake with Discord API...');
    const members = await activeFetchPromise;

    cachedMembers = members;
    lastFetchTime = Date.now();

    console.log(`✅ [SERVER DIAGNOSTIC] Successfully synchronized and shared ${cachedMembers.length} user records.`);
    return res.json({ success: true, members });
  } catch (error) {
    console.error('💥 [SERVER DIAGNOSTIC] Roster sync exception:', error.message);
    
    if (cachedMembers) {
      console.warn('🚑 [SERVER DIAGNOSTIC] Serving stale backup cache array to prevent client layout crash.');
      return res.json({ success: true, members: cachedMembers });
    }

    return res.status(503).json({ error: `Roster sync failed: ${error.message}` });
  } finally {
    // Reset execution lock state when processing completes
    activeFetchPromise = null;
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
    
    let serverNickname = user.global_name || user.username;
    const guildId = process.env.DISCORD_GUILD_ID;

    if (discordClient && discordClient.isReady() && guildId) {
      try {
        const guild = await discordClient.guilds.fetch(guildId);
        const member = await guild.members.fetch(user.id);
        if (member) {
          serverNickname = member.nickname || member.displayName || serverNickname;
        }
      } catch (err) {
        console.warn('⚠️ Could not fetch guild nickname, falling back to global account tags.');
      }
    }

    req.session.user = {
      id: user.id,
      username: user.username,
      discriminator: user.discriminator,
      avatar: user.avatar,
      displayName: serverNickname
    };

    return req.session.save(() => {
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