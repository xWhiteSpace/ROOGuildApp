// backend/src/auth/discordOAuth.js
import { Router } from 'express';
import { getDatabase } from 'firebase-admin/database';
import { discordClient } from '../discord-bot/client.js';

import crypto from 'crypto'; // 🛡️ Native cryptographic signature utility console
import { logDiscordRateLimit, logDiscordHttpFailure } from '../utils/discordRateLimit.js';

const router = Router();
const discordApi = 'https://discord.com/api';

let cachedMembers = null;
let lastFetchTime = 0;
const CACHE_DURATION = 2 * 60 * 1000;

let activeFetchPromise = null;

const getFrontendUrl = () => process.env.FRONTEND_URL || 'http://localhost:3000';

// 🛡️ REPAIRED ROSTER ENDPOINT
router.get('/discord-members', async (req, res) => {
  const guildId = process.env.DISCORD_GUILD_ID;
  if (!guildId) {
    return res.status(500).json({ error: 'DISCORD_GUILD_ID is not configured in your backend .env file' });
  }

  if (!discordClient || !discordClient.isReady()) {
    return res.status(503).json({ success: false, error: 'Discord bot client is offline or initializing gateway protocols.' });
  }

  const now = Date.now();
  if (cachedMembers && (now - lastFetchTime < CACHE_DURATION)) {
    return res.json({ success: true, members: cachedMembers });
  }

  if (activeFetchPromise) {
    try {
      const members = await activeFetchPromise;
      return res.json({ success: true, members });
    } catch (err) {}
  }

  activeFetchPromise = (async () => {
    const guild = await discordClient.guilds.fetch(guildId);
    // 🚀 CACHE PRIORITIZATION: Check memory cache first to shield against Discord REST gateway rate limits
    let membersMap = guild.members.cache;
    if (!membersMap || membersMap.size === 0) {
      membersMap = await guild.members.fetch({ limit: 1000 });
    }
    
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
    return res.json({ success: true, members: freshMembers });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to extract active member matrix from Discord gateway.' });
  } finally {
    activeFetchPromise = null;
  }
});

router.get('/login', (req, res) => {
  const state = req.query.state || 'no_state';
  const clientId = process.env.DISCORD_CLIENT_ID;
  const redirectUri = encodeURIComponent(process.env.OAUTH_REDIRECT_URI);
  const scope = encodeURIComponent('identify');
  res.redirect(`${discordApi}/oauth2/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=${scope}&state=${encodeURIComponent(state)}`);
});

router.get('/callback', async (req, res) => {
  const { code } = req.query;
  const targetFrontend = getFrontendUrl();

  if (!code) {
    return res.redirect(`${targetFrontend}/landing?error=missing_code`);
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

    if (!tokenResponse.ok) {
      const errorPayload = await tokenResponse.json().catch(() => ({}));
      console.error("🛑 [DISCORD OAUTH EXCEPTION DETAILS]:", JSON.stringify({
        httpStatus: tokenResponse.status,
        statusText: tokenResponse.statusText,
        ...errorPayload,
      }, null, 2));
      // Always dump wait/headers on OAuth failure — Discord global IP blocks
      // often omit JSON retry_after and sometimes aren't labeled as 429 in logs.
      logDiscordHttpFailure('oauth token exchange', tokenResponse, errorPayload);
      throw new Error(`Token exchange failed: ${errorPayload.error_description || errorPayload.error || errorPayload.message || tokenResponse.statusText}`);
    }

    const tokenData = await tokenResponse.json();
    const userResponse = await fetch(`${discordApi}/users/@me`, {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    if (!userResponse.ok) {
      const userErrBody = await userResponse.json().catch(() => ({}));
      logDiscordHttpFailure('oauth users/@me', userResponse, userErrBody);
      throw new Error('Failed to fetch user profiles');
    }

    const user = await userResponse.json();
    let serverNickname = user.global_name || user.username;
    let memberRolesNames = [];
    const guildId = process.env.DISCORD_GUILD_ID;

    if (discordClient && guildId) {
      try {
        const guild = await discordClient.guilds.fetch(guildId);
        const member = await guild.members.fetch(user.id);
        if (member) {
          let rawName = member.nickname || member.displayName || serverNickname;
          // 🛡️ OAUTH NICKNAME SHIELD: Convert slashes into clean underscores right at the source
          serverNickname = rawName.replace(/\//g, '_');
          memberRolesNames = member.roles.cache.map(role => role.name);
        }
      } catch (err) {
        console.warn('⚠️ Could not fetch guild profile details via REST API:', err.message);
        logDiscordRateLimit('oauth guild member fetch', err);
      }
    }

    const db = getDatabase();
    const configSnap = await db.ref('settings/configuration').once('value');
    const dynamicAdminRoles = configSnap.exists() ? (configSnap.val().adminRoles || []) : ["GUILD LEADER", "Vice Guild Leader", "Commander"];

    const isOfficerMatch = memberRolesNames.some(roleName => dynamicAdminRoles.includes(roleName));

    req.session.user = {
      id: user.id,
      username: user.username,
      discriminator: user.discriminator,
      avatar: user.avatar,
      displayName: serverNickname,
      isOfficer: isOfficerMatch, 
      roles: memberRolesNames
    };

    const systemTimezone = configSnap.exists() ? (configSnap.val().timezone || "Asia/Manila") : "Asia/Manila";

    await db.ref(`auction/members/${user.id}`).update({
      displayName: serverNickname,
      syncedAt: new Date().toLocaleDateString("en-US", { timeZone: systemTimezone })
    });

    // 🔒 SIGNATURE ENGINE: Hash the user data layout using your private client secret to create a secure token
    const tokenSigningSecret = process.env.DISCORD_CLIENT_SECRET || 'backup_fallback_secret_key';
    const computedPayloadHash = crypto
      .createHmac('sha256', tokenSigningSecret)
      .update(JSON.stringify(req.session.user))
      .digest('hex');

    return req.session.save(() => {
      // Keep the object completely flat so your frontend display components can read it without structural changes
      const leanOutboundProfile = {
        ...req.session.user,
        _sig: computedPayloadHash // Attaches the tamper-proof verification seal
      };
      const encodedUser = encodeURIComponent(JSON.stringify(leanOutboundProfile));
      res.redirect(`${targetFrontend}/?auth_user=${encodedUser}`);
    });
  } catch (error) {
    console.error("❌ OAuth callback processing failed:", error);
    return res.redirect(`${targetFrontend}/landing?error=discord_oauth_failed`);
  }
});

router.get('/me', (req, res) => {
  let user = req.session?.user;
  
  if (!user) {
    const fallbackToken = req.headers['x-user-profile'];
    if (fallbackToken) {
      try {
        const decodedPayload = JSON.parse(decodeURIComponent(fallbackToken));
        
        if (decodedPayload && decodedPayload._sig) {
          const clientSignature = decodedPayload._sig;
          
          // Re-serialize the profile to reconstruct and verify the signature hash
          const profileToVerify = { ...decodedPayload };
          delete profileToVerify._sig; // Isolate the signature from the verification payload
          
          const tokenSigningSecret = process.env.DISCORD_CLIENT_SECRET || 'backup_fallback_secret_key';
          const expectedSignature = crypto
            .createHmac('sha256', tokenSigningSecret)
            .update(JSON.stringify(profileToVerify))
            .digest('hex');
            
          // 🛡️ TAMPER CHECK: Grant access only if the client signature matches our cryptographic backend hash
                  if (clientSignature === expectedSignature) {
                    user = {
                      ...profileToVerify,
                      _sig: clientSignature
                    };
                  } else {
                    console.error("🛑 [SECURITY MONITOR]: Unauthorized modification detected on x-user-profile token header payload!");
                  }
        }
      } catch (e) {
        console.error("❌ Failed to decode cross-domain profile header token inside /me check:", e.message);
      }
    }
  }

  if (!user) {
    return res.status(200).json({ authenticated: false, user: null });
  }
  
  return res.json({ authenticated: true, user });
});

router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) return res.status(500).json({ success: false, error: 'Could not destroy running session.' });
    res.clearCookie('connect.sid'); 
    return res.json({ success: true });
  });
});

export default router;