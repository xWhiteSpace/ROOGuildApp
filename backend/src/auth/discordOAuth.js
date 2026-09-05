// backend/src/auth/discordOAuth.js
import { Router } from 'express';
import { getDatabase } from 'firebase-admin/database';
import { discordClient } from '../discord-bot/client.js';

import crypto from 'crypto'; // 🛡️ Native cryptographic signature utility console
import { logDiscordHttpFailure, isDiscordCircuitOpen, getDiscordRateLimitStatus, beginOAuthAttempt, endOAuthAttempt, markOAuthLoginClick, hydrateDiscordCircuit, resolveOAuthExchangeUrl, isLocalOAuthRedirect } from '../utils/discordRateLimit.js';

const router = Router();
const discordApi = 'https://discord.com/api';

let cachedMembers = null;
let lastFetchTime = 0;
const CACHE_DURATION = 2 * 60 * 1000;

let activeFetchPromise = null;

const getFrontendUrl = () => process.env.FRONTEND_URL || 'http://localhost:3000';

function circuitRedirect(targetFrontend) {
  const status = getDiscordRateLimitStatus();
  const until = encodeURIComponent(status.untilHuman || status.remainingHuman || 'later');
  return `${targetFrontend}/landing?error=discord_rate_limited&until=${until}`;
}

/**
 * POST /oauth2/token must not run on Render's Singapore IP — Cloudflare treats
 * that as a global block and each retry extends it. Production sends the code
 * to the Vercel function (user's FRONTEND_URL). Localhost may still talk to
 * Discord directly because that is not a shared datacenter IP.
 */
function mapRoleIdsToNames(guild, roleIds) {
  if (!guild || !Array.isArray(roleIds) || roleIds.length === 0) return [];
  const names = roleIds
    .map((id) => guild.roles.cache.get(String(id))?.name)
    .filter(Boolean);
  const everyone = guild.roles.everyone?.name;
  if (everyone && !names.includes(everyone)) names.unshift(everyone);
  return names;
}

async function fetchGuildMemberWithUserToken(accessToken, guildId) {
  if (!accessToken || !guildId) return null;
  const memberResponse = await fetch(`${discordApi}/users/@me/guilds/${guildId}/member`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!memberResponse.ok) return null;
  const member = await memberResponse.json().catch(() => null);
  if (!member || !Array.isArray(member.roles)) return null;
  return { nick: member.nick || null, roles: member.roles };
}

async function exchangeCodeForDiscordUser(code) {
  const redirectUri = process.env.OAUTH_REDIRECT_URI;
  const exchangeUrl = resolveOAuthExchangeUrl();

  if (exchangeUrl) {
    const secret = String(process.env.DISCORD_CLIENT_SECRET || '').trim();
    const headers = {
      'Content-Type': 'application/json',
      'x-oauth-bridge': secret,
      Authorization: `Bearer ${secret}`,
    };
    const bypass = String(process.env.VERCEL_PROTECTION_BYPASS || process.env.VERCEL_AUTOMATION_BYPASS_SECRET || '').trim();
    if (bypass) {
      headers['x-vercel-protection-bypass'] = bypass;
    }

    const bridgeRes = await fetch(exchangeUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        code,
        redirect_uri: redirectUri,
        client_id: process.env.DISCORD_CLIENT_ID,
        guild_id: process.env.DISCORD_GUILD_ID,
      }),
    });
    const payload = await bridgeRes.json().catch(() => ({}));
    if (!bridgeRes.ok) {
      const detail = payload.error || payload.message || `http_${bridgeRes.status}`;
      console.error(`🛑 [OAUTH BRIDGE] ${bridgeRes.status} from ${exchangeUrl}: ${detail}`);
      const err = new Error(detail);
      err.bridgeStatus = bridgeRes.status;
      err.bridgeDetail = detail;
      throw err;
    }
    if (!payload.user?.id) {
      const err = new Error('OAuth bridge returned no Discord user');
      err.bridgeStatus = bridgeRes.status || 502;
      throw err;
    }
    return { user: payload.user, guildMember: payload.member || null };
  }

  if (!isLocalOAuthRedirect()) {
    const err = new Error('oauth_offload_required');
    err.code = 'oauth_offload_required';
    throw err;
  }

  const tokenResponse = await fetch(`${discordApi}/oauth2/token`, {
    method: 'POST',
    body: new URLSearchParams({
      client_id: process.env.DISCORD_CLIENT_ID,
      client_secret: process.env.DISCORD_CLIENT_SECRET,
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    }),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });

  if (!tokenResponse.ok) {
    const errorPayload = await tokenResponse.json().catch(() => ({}));
    console.error('🛑 [DISCORD OAUTH EXCEPTION DETAILS]:', JSON.stringify({
      httpStatus: tokenResponse.status,
      statusText: tokenResponse.statusText,
      ...errorPayload,
    }, null, 2));
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

  return {
    user: await userResponse.json(),
    guildMember: await fetchGuildMemberWithUserToken(tokenData.access_token, process.env.DISCORD_GUILD_ID),
  };
}

// 🛡️ REPAIRED ROSTER ENDPOINT
router.get('/discord-members', async (req, res) => {
  const guildId = process.env.DISCORD_GUILD_ID;
  if (!guildId) {
    return res.status(500).json({ error: 'DISCORD_GUILD_ID is not configured in your backend .env file' });
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
    const guild = discordClient?.guilds?.cache.get(guildId);
    const membersMap = guild?.members?.cache;
    if (membersMap && membersMap.size > 0) {
      return membersMap.map(m => ({
        id: m.user.id,
        username: m.user.username,
        globalName: m.user.globalName || m.user.username,
        nickname: m.nickname || m.displayName || m.user.username,
        avatarURL: m.user.displayAvatarURL({ dynamic: true, size: 128 }),
        joinedAt: m.joinedAt
      })).sort((a, b) => a.nickname.localeCompare(b.nickname));
    }

    // Never REST-fetch 1000 members from the Render IP. Fall back to Firebase roster.
    const fbSnap = await getDatabase().ref('auction/members').once('value');
    const rows = fbSnap.exists() ? fbSnap.val() : {};
    return Object.entries(rows)
      .filter(([, m]) => m?.displayName)
      .map(([id, m]) => ({
        id,
        username: m.displayName,
        globalName: m.displayName,
        nickname: m.displayName,
        avatarURL: null,
        joinedAt: null,
      }))
      .sort((a, b) => a.nickname.localeCompare(b.nickname));
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

router.get('/login', async (req, res) => {
  const targetFrontend = getFrontendUrl();
  await hydrateDiscordCircuit();
  const gate = markOAuthLoginClick();
  if (!gate.allowed) {
    if (gate.reason === 'oauth-offload-required') {
      return res.redirect(`${targetFrontend}/landing?error=oauth_offload_required`);
    }
    if (gate.reason === 'circuit' || gate.reason === 'oauth-lock') {
      return res.redirect(circuitRedirect(targetFrontend));
    }
    return res.redirect(`${targetFrontend}/landing?error=login_busy`);
  }
  const state = req.query.state || 'no_state';
  const clientId = process.env.DISCORD_CLIENT_ID;
  const redirectUri = encodeURIComponent(process.env.OAUTH_REDIRECT_URI);
  const scope = encodeURIComponent('identify guilds.members.read');
  res.redirect(`${discordApi}/oauth2/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=${scope}&state=${encodeURIComponent(state)}`);
});

router.get('/callback', async (req, res) => {
  const { code } = req.query;
  const targetFrontend = getFrontendUrl();

  if (!code) {
    return res.redirect(`${targetFrontend}/landing?error=missing_code`);
  }

  await hydrateDiscordCircuit();
  const gate = beginOAuthAttempt();
  if (!gate.allowed) {
    if (gate.reason === 'circuit' || gate.reason === 'oauth-lock') {
      return res.redirect(circuitRedirect(targetFrontend));
    }
    return res.redirect(`${targetFrontend}/landing?error=login_busy`);
  }

  try {
    const { user, guildMember } = await exchangeCodeForDiscordUser(code);
    let serverNickname = user.global_name || user.username;
    let memberRolesNames = [];
    const guildId = process.env.DISCORD_GUILD_ID;
    const db = getDatabase();

    // Nickname/roles: OAuth user-token member (Vercel/local IP) + gateway role
    // names. Never members.fetch on login — that REST call from the Render IP
    // is what stacked on /oauth2/token and tripped Cloudflare.
    let resolvedFromCache = false;
    const botReady = Boolean(discordClient?.isReady());
    const guild = (botReady && guildId) ? discordClient.guilds.cache.get(guildId) : null;
    const member = guild?.members?.cache.get(user.id) || null;

    const oauthRoleNames = mapRoleIdsToNames(guild, guildMember?.roles);
    if (oauthRoleNames.length) {
      memberRolesNames = oauthRoleNames;
      if (guildMember?.nick) {
        serverNickname = String(guildMember.nick).replace(/\//g, '_');
      }
    }

    if (discordClient?.isReady() && guildId) {
      if (member) {
        if (!guildMember?.nick) {
          serverNickname = (member.nickname || member.displayName || serverNickname).replace(/\//g, '_');
        }
        if (!memberRolesNames.length) {
          memberRolesNames = member.roles.cache.map((role) => role.name);
        }
        resolvedFromCache = true;
      }
    }

    const existingMemberSnap = await db.ref(`auction/members/${user.id}`).once('value');
    const existingMember = existingMemberSnap.exists() ? existingMemberSnap.val() : null;
    if (!guildMember?.nick && !resolvedFromCache && existingMember?.displayName) {
      serverNickname = String(existingMember.displayName).replace(/\//g, '_');
    }
    const firebaseRoles = existingMember?.roles;
    if (!memberRolesNames.length && Array.isArray(firebaseRoles)) {
      memberRolesNames = firebaseRoles;
    }

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
      ...(memberRolesNames.length ? { roles: memberRolesNames } : {}),
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
    if (error?.code === 'oauth_offload_required') {
      return res.redirect(`${targetFrontend}/landing?error=oauth_offload_required`);
    }
    if (error?.bridgeStatus) {
      const detail = encodeURIComponent(error.bridgeDetail || error.message || 'unknown');
      return res.redirect(`${targetFrontend}/landing?error=oauth_bridge_failed&detail=${detail}`);
    }
    if (isDiscordCircuitOpen()) {
      return res.redirect(circuitRedirect(targetFrontend));
    }
    return res.redirect(`${targetFrontend}/landing?error=discord_oauth_failed`);
  } finally {
    endOAuthAttempt();
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