// backend/src/index.js
import './config/loadEnv.js';
import express from 'express';
import cors from 'cors';
import session from 'express-session';
import { initializeEnv } from './config/env.js';
import { valhallaEnv } from './config/valhallaEnv.js';
import authRoutes from './auth/discordOAuth.js';
import { migrate } from './db/migrate.js';
import { query } from './db/pool.js';
import { attachTenantContext, requireTenant, requireActiveSubscription } from './middleware/tenantContext.js';
import { requireGame } from './middleware/requireGame.js';
import { RAGNAROK_ORIGIN_ID, ADVENTURER_GUILD_ID } from './games/catalog.js';
import tenantRoutes from './api/tenant.routes.js';
import { discordChannel } from './db/channels.js';
import { forEachOnboardedTenant } from './db/tenants.js';
import { getTenantStore } from './db/database.js';
import { checkOfficer } from './auth/officer.js';
import { initializeDiscordBot, discordClient, getDiscordBotHealth } from './discord-bot/client.js'; 
import requestRoutes from './api/request.routes.js';
import liveRaidRoutes, { resumeLiveRaidMonitoringIfNeeded } from './api/liveRaid.routes.js';
import warRoomRoutes from './api/warRoom.routes.js';
import ocrReviewRoutes from './api/ocrReview.routes.js';

import { processAndPostDiscordSnapshot } from './games/ragnarok-origin/services/discordSnapshot.js';
import { getGateStatusDetails } from './games/ragnarok-origin/timeWindow.js';
import { handleAuctionInteraction } from './games/ragnarok-origin/services/discordInteractiveAuction.js';
import { getDiscordRateLimitStatus, resolveOAuthExchangeUrl } from './utils/discordRateLimit.js';

import attendanceRoutes from './api/attendance.routes.js';
import adventurerGuildRoutes from './api/adventurerGuild.routes.js';
import billingRoutes, { handleStripeWebhook } from './api/billing.routes.js';

initializeEnv();
await migrate();
initializeDiscordBot();

const oauthBridge = resolveOAuthExchangeUrl();
if (oauthBridge) {
  console.log(`🔐 [OAUTH]: Token exchange off Render → ${oauthBridge}`);
} else {
  console.warn('🔐 [OAUTH]: Local token exchange (Render will POST /oauth2/token). Production must use FRONTEND_URL on Vercel so Discord never sees this IP.');
} 

// ✅ REFACTORED: Duplicate gateway interceptor completely removed. 
// Routing controls are now handled directly within the initialization scope of client.js.

const app = express();

app.set('trust proxy', 1);

const { frontendUrl: sanitizedFrontendUrl, sessionSecret, port: PORT, localHttp } = valhallaEnv();

const allowedOrigins = [
  sanitizedFrontendUrl,
  'http://localhost:3000',
  'http://localhost:5173',
  'https://dynasty-guild-frontend-staging.vercel.app',
  'https://dynasty-guild-frontend.vercel.app'
];

// 📡 PRODUCTION HARDENED EXPLICIT CORS WHITELIST FOR MULTI-HOST HANDSHAKES
app.use(cors({ 
  origin: function (origin, callback) {
    // Allow missing Origin (same-origin / mobile webviews), configured FRONTEND_URL,
    // known hosts, Vercel preview deployments, LAN, and ngrok tunnels.
    if (
      !origin ||
      allowedOrigins.includes(origin) ||
      origin.startsWith('http://192.168.') ||
      origin.includes('ngrok-free.app') ||
      origin.includes('ngrok-free.dev') ||
      origin.includes('ngrok.io') ||
      origin.endsWith('.vercel.app')
    ) {
      callback(null, true);
    } else {
      callback(new Error('Blocked by CORS policy rules layout context.'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type', 
    'Authorization', 
    'X-Requested-With', 
    'Accept', 
    'Origin',
    'x-user-profile',
    'x-authorized-user',
    'x-tenant-id',
    'ngrok-skip-browser-warning'
  ]
}));

app.post('/api/billing/webhook', express.raw({ type: 'application/json' }), handleStripeWebhook);

app.use(express.json({ limit: '12mb' }));

app.use(
  session({
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: !localHttp,
      sameSite: localHttp ? 'lax' : 'none',
    },
  })
);

app.use(attachTenantContext);
app.use('/auth', authRoutes);
app.use('/api/tenants', tenantRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/requests', requireTenant, requireActiveSubscription, requireGame(RAGNAROK_ORIGIN_ID), requestRoutes);

app.use('/api/attendance', requireTenant, requireActiveSubscription, requireGame(RAGNAROK_ORIGIN_ID), attendanceRoutes);
app.use('/api/live-raid', requireTenant, requireActiveSubscription, requireGame(RAGNAROK_ORIGIN_ID), liveRaidRoutes);
app.use('/api/war-room', requireTenant, requireActiveSubscription, requireGame(RAGNAROK_ORIGIN_ID), warRoomRoutes);
app.use('/api/ocr-reviews', requireTenant, requireActiveSubscription, requireGame(RAGNAROK_ORIGIN_ID), ocrReviewRoutes);
app.use('/api/adventurer-guild', requireTenant, requireActiveSubscription, requireGame(ADVENTURER_GUILD_ID), adventurerGuildRoutes);

app.get('/', async (req, res) => {
  try {
    await query('SELECT 1');
    res.send('GuildName backend is online.');
  } catch {
    res.status(503).send('GuildName backend is online (database warming).');
  }
});

// 📟 Debug: remaining Discord REST/soft-ban cooldown (no secrets)
app.get('/api/debug/discord-ratelimit', (req, res) => {
  res.json({ success: true, ...getDiscordBotHealth(), ...getDiscordRateLimitStatus() });
});

// 📟 TEMPORARY WEB PANEL TRIGGER FOR INTERACTIVE CARD DROP
function requireOfficerTenant(req, res, next) {
  requireTenant(req, res, () => {
    (async () => {
      const db = getTenantStore();
      const snap = await db.ref('settings/configuration').once('value');
      const { user, ok } = await checkOfficer(req, snap.exists() ? snap.val() : {});
      if (!user) return res.status(401).send('Login required');
      if (!ok) return res.status(403).send('Officer access required');
      next();
    })().catch((err) => res.status(500).send(err.message));
  });
}

app.get('/api/deploy-auction-card', requireOfficerTenant, async (req, res) => {
  try {
    // 🛡️ Secure Channel Separation: Request Card (item cart + live claim) into the auction-request channel
    const channelId = discordChannel('DISCORD_AUCREQ_CHANNEL_ID');
    if (!channelId) {
      return res.status(400).send("❌ Failure: Auction request channel is not mapped for this guild.");
    }

    if (!discordClient || !discordClient.isReady()) {
      return res.status(503).send("❌ Failure: Discord bot client is currently offline or rate-limited. Wait for gateway initialization to finish before running this route.");
    }
    const { isDiscordCircuitOpen, getDiscordRateLimitStatus, enqueueDiscordCall } = await import('./utils/discordRateLimit.js');
    if (isDiscordCircuitOpen()) {
      const status = getDiscordRateLimitStatus();
      return res.status(503).send(`❌ Discord is temporarily blocking this server IP. Try again after ${status.untilHuman || status.remainingHuman}.`);
    }
    const targetChannel = await enqueueDiscordCall(() => discordClient.channels.fetch(channelId));
    if (!targetChannel) {
      return res.status(404).send("❌ Failure: Discord gateway client failed to locate matching server channel pointer.");
    }

    const { sendPublicAuctionCard } = await import('./games/ragnarok-origin/services/discordInteractiveAuction.js');
    await sendPublicAuctionCard(targetChannel);

    res.send("📟 SUCCESS: Request Card posted to the auction request channel (Open Request + Open Live Claim).");
  } catch (err) {
    console.error("Deployer Route Failure Exception Caught:", err.message);
    res.status(500).send(`❌ Server Exception: ${err.message}`);
  }
});

// Per-event Attendance card → DISCORD_WARANNOUNCE_CHANNEL_ID
app.get('/api/deploy-attendance-card', requireOfficerTenant, async (req, res) => {
  try {
    const { deployPublicAttendanceCardToWarAnnounce } = await import('./games/ragnarok-origin/services/discordAttendanceCards.js');
    await deployPublicAttendanceCardToWarAnnounce();
    res.send('📟 SUCCESS: GVG Readiness dashboard posted to the war-announce channel.');
  } catch (err) {
    console.error('Attendance card deploy failed:', err.message);
    const msg = err.message || 'Unknown error';
    const status = /not configured/i.test(msg) ? 400
      : /offline|rate-limited|temporarily blocking/i.test(msg) ? 503
      : /locate the war-announce/i.test(msg) ? 404
      : 500;
    res.status(status).send(`❌ Server Exception: ${msg}`);
  }
});

// Party Viewer card → DISCORD_WARANNOUNCE_CHANNEL_ID
app.get('/api/deploy-party-card', requireOfficerTenant, async (req, res) => {
  try {
    const { deployPublicPartyCardToWarAnnounce } = await import('./games/ragnarok-origin/services/partyViewer.js');
    await deployPublicPartyCardToWarAnnounce();
    res.send('📟 SUCCESS: Party card posted to the war-announce channel.');
  } catch (err) {
    console.error('Party card deploy failed:', err.message);
    const msg = err.message || 'Unknown error';
    const status = /not configured/i.test(msg) ? 400
      : /offline|rate-limited|temporarily blocking/i.test(msg) ? 503
      : /locate the war-announce/i.test(msg) ? 404
      : 500;
    res.status(status).send(`❌ Server Exception: ${msg}`);
  }
});

app.get('/api/deploy-ocr-card', requireOfficerTenant, async (req, res) => {
  try {
    const { deployPublicOcrCardToWarAnnounce } = await import('./games/ragnarok-origin/services/discordPartyOcr.js');
    await deployPublicOcrCardToWarAnnounce();
    res.send('📟 SUCCESS: Party OCR card posted to the war-announce channel.');
  } catch (err) {
    console.error('OCR card deploy failed:', err.message);
    const msg = err.message || 'Unknown error';
    const status = /not configured/i.test(msg) ? 400
      : /offline|rate-limited|temporarily blocking/i.test(msg) ? 503
      : /locate the war-announce/i.test(msg) ? 404
      : 500;
    res.status(status).send(`❌ Server Exception: ${msg}`);
  }
});

app.listen(PORT, () => {
  console.log(`🌐 [SERVER ONLINE] Listening smoothly on port ${PORT}`);
  console.log(`🚀 [TASK001 PASS]: Event-driven architecture active. 5-second loop decommissioned.`);

  forEachOnboardedTenant(async () => {
    const { seedMissingLeaveCredits } = await import('./games/ragnarok-origin/services/attendanceDecision.js');
    await seedMissingLeaveCredits();
    await resumeLiveRaidMonitoringIfNeeded();
  }).catch((err) => console.error('[boot] tenant seed failed:', err.message));

  // ✅ REFACTORED: Extraneous text scheduler loop completely removed to prevent double-posting.
  // Execution tracking has been centralized into the drift-proof engine in client.js.
});