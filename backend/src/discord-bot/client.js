import { Client, GatewayIntentBits, Partials } from 'discord.js';
import { handleAuctionInteraction } from '../services/discordInteractiveAuction.js'; // 🕹️ Route live button boards
import admin from 'firebase-admin'; // 🛰️ Connect absolute database reference paths
import { handleSlashCommand, handleComponentInteraction } from './discordSlashcmd.js';

import { ProxyAgent, setGlobalDispatcher } from 'undici';
import { logDiscordRateLimit } from '../utils/discordRateLimit.js';

// 📡 GLOBAL NETWORK TUNNEL OVERRIDE — IMMUNE TO DATACENTER IP BLOCKS
if (process.env.PROXY_URL) {
  console.log("🔒 [NETWORKING]: Routing global HTTP/HTTPS engines through secure proxy tunnel...");
  const proxyAgent = new ProxyAgent({ uri: process.env.PROXY_URL });
  setGlobalDispatcher(proxyAgent);
}

export const discordClient = new Client({
  intents: [
    GatewayIntentBits.Guilds, 
    GatewayIntentBits.GuildMessages, 
    GatewayIntentBits.MessageContent, 
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates
  ],
  partials: [Partials.Channel, Partials.Message],
  // 🛑 RATE-LIMIT SHIELD: cap automatic REST retries so a single 429 can't
  // silently snowball into repeated requests that deepen a global soft-ban.
  rest: { retries: 1 },
});

// 📉 Surface rate-limit hits with a human-readable wait (soft-ban Retry-After).
discordClient.rest.on('rateLimited', (info) => {
  logDiscordRateLimit('REST bucket', info);
});

export async function initializeDiscordBot() {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) {
    throw new Error('DISCORD_BOT_TOKEN is required to initialize Discord client');
  }

  // 🌟 FIXED: Changed 'clientReady' to 'ready' so discord.js triggers it properly
  discordClient.once('ready', () => {
    console.log(`🚀 Discord bot successfully deployed as: ${discordClient.user?.tag}`);

   // 🕹️ LIVE INTERACTION ROUTER: Gated exclusively to general room for slash commands and interactive boards[cite: 1]
    discordClient.on('interactionCreate', async (interaction) => {
      try {
        // 📅 Weekly attendance lives in its own channel/thread — route by customId
        // prefix so it bypasses the general-room gate (buttons fire inside a thread).
        if ((interaction.isButton() || interaction.isStringSelectMenu()) && interaction.customId?.startsWith('att:')) {
          const { handleAttendanceInteraction } = await import('./attendanceAnnounce.js');
          return await handleAttendanceInteraction(interaction);
        }

        // ⚔️ Live Auction panel lives in its own auction-request channel — route by
        // customId so it bypasses the general-room gate (self-service loot claiming).
        if (
          (interaction.isButton() || interaction.isStringSelectMenu()) &&
          (
            interaction.customId === 'open_auction_panel' ||
            interaction.customId === 'open_auction_panel_back' ||
            interaction.customId === 'auction_select_item_type' ||
            interaction.customId?.startsWith('claim_slot_btn_')
          )
        ) {
          return await handleAuctionInteraction(interaction);
        }

        if (interaction.channelId !== process.env.DISCORD_GENROOM_ID_1) {
          return await interaction.reply({
            content: '❌ System commands are strictly locked to the designated general room channel.',
            ephemeral: true
          }).catch(() => {});
        }

        if (interaction.isChatInputCommand()) {
          await handleSlashCommand(interaction);
        } else if (interaction.isStringSelectMenu() || interaction.isButton()) {
          await handleComponentInteraction(interaction);
        }
      } catch (err) {
        console.error("❌ [GATEWAY INTERACTION ROUTE ERROR]: Failed to resolve command event:", err.message);

        // Discord 10062 = Unknown interaction (token already expired), 40060 =
        // interaction already acknowledged. In both cases the token is dead, so
        // a fallback reply is another doomed REST call that only burns rate-limit
        // quota — skip it. Only attempt a fallback for still-valid, un-acked ones.
        const deadInteractionCodes = [10062, 40060];
        if (deadInteractionCodes.includes(err?.code)) return;

        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ 
            content: '❌ An internal processing failure occurred while verifying your tracking command.', 
            ephemeral: true 
          }).catch(() => {});
        }
      }
    });

    // 🛡️ Foundational Job Assignment Message Interceptor
    discordClient.on('messageCreate', async (message) => {
      try {
        if (message.author.bot) return;
        if (message.channelId !== process.env.DISCORD_GENROOM_ID_1) return;

        const content = message.content.trim();
        if (content.startsWith('/job ') || content.startsWith('/jobchange ')) {
          const parts = content.split(' ');
          const inputJobName = parts.slice(1).join(' ').trim();
          
          if (!inputJobName) {
            return await message.reply("❌ Please provide a job name. Example: `/job High Priest`").catch(() => {});
          }

          const db = admin.database();
          const configSnap = await db.ref('settings/configuration/jobs').once('value');
          let matchedJobCode = null;
          let matchedJobName = "";

          if (configSnap.exists()) {
            const jobsData = configSnap.val();
            for (const [code, jobObj] of Object.entries(jobsData)) {
              if (jobObj?.name?.toLowerCase() === inputJobName.toLowerCase()) {
                matchedJobCode = code;
                matchedJobName = jobObj.name;
                break;
              }
            }
          }

          if (!matchedJobCode) {
            return await message.reply(`❌ Job \`${inputJobName}\` is not registered in the system settings catalog by officers.`).catch(() => {});
          }

          // Atomically append property straight into the core global profile SSOT row
          await db.ref(`auction/members/${message.author.id}`).update({
            jobCode: matchedJobCode
          });

          await message.reply(`✅ Success! Your job specialization has been successfully updated to **${matchedJobName}** (\`${matchedJobCode}\`).`).catch(() => {});
        }
      } catch (err) {
        console.error("⚠️ Error handling job text command trigger:", err.message);
      }
    });

    // 📢 Automated Modular Announcement Scheduler Ticker (Evaluated every 60 seconds)
    // Each announcer is self-gated on the force-lock flag and fully idempotent
    // (backed by Firebase markers), so ticks are safe to fire-and-forget and
    // announcements self-heal across restarts/redeploys instead of being lost.
    setInterval(() => {
      // 📅 Weekly attendance auto-announce (Sunday + hour + marker; idempotent)
      import('./attendanceAnnounce.js')
        .then((m) => m.maybeAnnounceWeekly())
        .catch((err) => console.error('⚠️ Weekly attendance auto-announce warning:', err.message));

      // 🚀 Event phase announcements (restart-safe + idempotent via Firebase markers)
      import('./eventAnnounce.js')
        .then((m) => m.maybeAnnounceEvents())
        .catch((err) => console.error('⚠️ Event announcement scheduler warning:', err.message));

      // ⏰ Auto-end a Live Raid once its monitoring End Time passes (idempotent via status guard)
      import('../api/liveRaid.routes.js')
        .then((m) => m.maybeAutoEndLiveRaid())
        .catch((err) => console.error('⚠️ Live raid auto-end scheduler warning:', err.message));

      // 🧾 Opt-in auto-commit of the MimicBook auction ~1 min before Phase 3 ends (marker-idempotent)
      import('./autoCommitAuction.js')
        .then((m) => m.maybeAutoCommitAuction())
        .catch((err) => console.error('⚠️ Auto-commit auction scheduler warning:', err.message));
    }, 60000);
  });

  
  // 📡 DYNAMIC PRE-FLIGHT ROUTE TELEMETRY PROBE
  try {
    console.log("🔍 [DISCORD PROBE]: Testing raw network path visibility to Discord edge routers...");
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000); // Strict 6-second hard socket cutoff

    const probeResponse = await fetch("https://discord.com/api/v10/gateway", {
      signal: controller.signal,
      headers: { 'Accept': 'application/json' }
    });
    clearTimeout(timeoutId);

    console.log(`📡 [DISCORD PROBE RAW RESULT]: HTTP Status ${probeResponse.status} (${probeResponse.statusText})`);
    const bodyText = await probeResponse.text();
    console.log(`📄 [DISCORD PROBE BODY SNIPPET]: ${bodyText.slice(0, 250)}`);
    if (probeResponse.status === 429) {
      let retryPayload = { headers: probeResponse.headers, message: bodyText };
      try { retryPayload = { ...retryPayload, ...JSON.parse(bodyText) }; } catch { /* body may not be JSON */ }
      logDiscordRateLimit('boot gateway probe', retryPayload);
    }
  } catch (probeErr) {
    console.error("🛑 [DISCORD PROBE CRITICAL FAULT]: Raw network route is heavily rate-limited or tarpitted.");
    console.error(`   Error Reason: ${probeErr.message}`);
    logDiscordRateLimit('boot gateway probe exception', probeErr);
  }

  try {
    console.log("⚡ [DISCORD BOT]: Initiating secure gateway handshake stream...");
    await discordClient.login(token);
  } catch (loginErr) {
    console.error("🛑 [DISCORD BOT GATEWAY EXCEPTION]:");
    console.error(`   Error Message: ${loginErr.message}`);
    console.error(`   Error Code: ${loginErr.code || 'N/A'}`);
    logDiscordRateLimit('gateway login', loginErr);
  }
}