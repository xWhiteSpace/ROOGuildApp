// backend/src/auth/discordOAuth.js
import { Router } from 'express';
import { discordClient } from '../discord-bot/client.js';

const router = Router();
const discordApi = 'https://discord.com/api';

let cachedMembers = null;
let lastFetchTime = 0;
const CACHE_DURATION = 2 * 60 * 1000;

let activeFetchPromise = null;

const getFrontendUrl = () => process.env.FRONTEND_URL || 'http://localhost:3000';

// 🧪 USER PROFILE CONFIGURATION ROLES MATRIX (Match this when toggling comments for testing)
const CORE_MANAGEMENT_ROLES = [
  'GUILD LEADER',
  'Vice Guild Leader',
  'Commander',
  'Discord Management',
  'Guild Management'
];

function buildDiscordLoginUrl(state) {
  const clientId = process.env.DISCORD_CLIENT_ID;
  const redirectUri = encodeURIComponent(process.env.OAUTH_REDIRECT_URI);
  const scope = encodeURIComponent('identify');
  return `${discordApi}/oauth2/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=${scope}&state=${encodeURIComponent(state)}`;
}

router.get('/discord-members', async (req, res) => {
  const guildId = process.env.DISCORD_GUILD_ID;
  if (!guildId) {
    return res.status(500).json({ error: 'DISCORD_GUILD_ID is not configured in your backend .env file' });
  }

  const now = Date.now();
  if (cachedMembers && (now - lastFetchTime < CACHE_DURATION)) {
    return res.json(cachedMembers);
  }

  if (activeFetchPromise) {
    try {
      const existingData = await activeFetchPromise;
      return res.json(existingData);
    } catch (err) {}
  }

  activeFetchPromise = (async () => {
    if (!discordClient || !discordClient.isReady()) {
      throw new Error('Discord bot client is offline or initializing gateway protocols.');
    }
    const guild = await discordClient.guilds.fetch(guildId);
    const membersMap = await guild.members.fetch({ limit: 1000 });
    
    return membersMap.map(m => ({
      id: m.user.id,
      username: m.user.username,
      globalName: m.user.globalName || m.user.username,
      nickname: m.nickname || m.displayName || m.user.username,
      avatarURL: m.user.displayAvatarURL({ dynamic: true, size: 128 }),
      joinedAt: m.joinedAt
    })).sort((a, b) => a.nickname.localeCompare(b.nickname));
  })();

  try {
    const freshMembers = await activeFetchPromise;
    cachedMembers = freshMembers;
    lastFetchTime = Date.now();
    return res.json(freshMembers);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to extract active member matrix from Discord gateway.' });
  } finally {
    activeFetchPromise = null;
  }
});

router.get('/login', (req, res) => {
  const state = req.query.state || 'no_state';
  res.redirect(buildDiscordLoginUrl(state));
});

router.get('/callback', async (req, res) => {
  const { code } = req.query;
  const targetFrontend = getFrontendUrl();

  if (!code) {
    return res.redirect(`${targetFrontend}/login?error=missing_code`);
  }

  try {
    const tokenResponse = await fetch(`${discordApi}/oauth2/token`, {
      method: 'POST',
      body: new URLSearchParams({
        client_id: process.env.DISCORD_CLIENT_ID,
        client_secret: process.env.DISCORD_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: process.env.OAUTH_REDIRECT_URI,
      }),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    if (!tokenResponse.ok) throw new Error('Token exchange failed');

    const tokenData = await tokenResponse.json();
    const userResponse = await fetch(`${discordApi}/users/@me`, {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    if (!userResponse.ok) throw new Error('Failed to fetch user profiles');

    const user = await userResponse.json();
    let serverNickname = user.global_name || user.username;
    let assignedCoreRoles = [];
    const guildId = process.env.DISCORD_GUILD_ID;

    if (discordClient && discordClient.isReady() && guildId) {
      try {
        const guild = await discordClient.guilds.fetch(guildId);
        const member = await guild.members.fetch(user.id);
        if (member) {
          serverNickname = member.nickname || member.displayName || serverNickname;
          assignedCoreRoles = member.roles.cache
            .map(role => role.name)
            .filter(roleName => CORE_MANAGEMENT_ROLES.includes(roleName));
        }
      } catch (err) {
        console.warn('⚠️ Could not fetch guild profile details.');
      }
    }

    req.session.user = {
      id: user.id,
      username: user.username,
      discriminator: user.discriminator,
      avatar: user.avatar,
      displayName: serverNickname,
      roles: assignedCoreRoles
    };

    return req.session.save(() => {
      const encodedUser = encodeURIComponent(JSON.stringify(req.session.user));
      res.redirect(`${targetFrontend}/?auth_user=${encodedUser}`);
    });
  } catch (error) {
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
    if (err) return res.status(500).json({ success: false, error: 'Could not destroy running session.' });
    res.clearCookie('connect.sid'); 
    return res.json({ success: true });
  });
});

export default router;