import dns from 'node:dns';
import { Client, GatewayIntentBits, Partials } from 'discord.js';
import { handleAuctionInteraction } from '../services/discordInteractiveAuction.js'; // 🕹️ Route live button boards
import admin from 'firebase-admin'; // 🛰️ Connect absolute database reference paths
import { handleSlashCommand, handleComponentInteraction } from './discordSlashcmd.js';
import { handleAttendanceCardInteraction } from '../services/discordAttendanceCards.js';
import { handlePartyCardInteraction } from '../services/partyViewer.js';

import { Agent, ProxyAgent, setGlobalDispatcher } from 'undici';
import { logDiscordRateLimit, isDiscordCircuitOpen, hydrateDiscordCircuit, getDiscordRateLimitStatus } from '../utils/discordRateLimit.js';

// Render/Node 18+ often tries IPv6 first; Discord's v6 path can hang with no error.
dns.setDefaultResultOrder('ipv4first');

const discordDispatcher = new Agent({ connect: { timeout: 10_000, family: 4 } });

// 📡 GLOBAL NETWORK TUNNEL — honor HTTPS_PROXY, HTTP_PROXY, or PROXY_URL
const resolvedProxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.PROXY_URL;
const resolvedProxyName = process.env.HTTPS_PROXY
  ? 'HTTPS_PROXY'
  : process.env.HTTP_PROXY
    ? 'HTTP_PROXY'
    : process.env.PROXY_URL
      ? 'PROXY_URL'
      : null;
if (resolvedProxyUrl) {
  console.log(`🔒 [NETWORKING]: Routing global HTTP/HTTPS through ${resolvedProxyName} tunnel.`);
  const proxyAgent = new ProxyAgent({ uri: resolvedProxyUrl });
  setGlobalDispatcher(proxyAgent);
} else {
  console.log('[DISCORD BOT] Prefer IPv4 for Discord REST + gateway (avoids silent IPv6 hangs on Render).');
  setGlobalDispatcher(discordDispatcher);
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
  rest: { retries: 1, timeout: 15_000, agent: resolvedProxyUrl ? undefined : discordDispatcher },
});

// 📉 Surface rate-limit hits with a human-readable wait (soft-ban Retry-After).
discordClient.rest.on('rateLimited', (info) => {
  logDiscordRateLimit('REST bucket', info);
});

async function preflightDiscordGateway(token) {
  const started = Date.now();
  try {
    const res = await fetch('https://discord.com/api/v10/gateway/bot', {
      headers: { Authorization: `Bot ${token}` },
      signal: AbortSignal.timeout(10_000),
    });
    const snippet = (await res.text().catch(() => '')).slice(0, 240).replace(/\s+/g, ' ');
    console.log(
      `[DISCORD BOT] Gateway REST preflight: HTTP ${res.status} in ${Date.now() - started}ms` +
      (res.ok ? '' : ` body=${snippet}`)
    );
    if (res.status === 401 || res.status === 403) {
      console.error('[DISCORD BOT] Token rejected by Discord REST. Re-copy DISCORD_BOT_TOKEN on Render.');
    }
    if (res.status === 429) {
      console.error('[DISCORD BOT] Discord is rate-limiting this host IP. Gateway login will likely hang until the block lifts.');
    }
  } catch (err) {
    console.error(
      `[DISCORD BOT] Gateway REST preflight failed after ${Date.now() - started}ms: ${err.name}: ${err.message}. ` +
      'Discord is not answering HTTPS from this host — a new bot token will not fix that.'
    );
  }
}

export async function initializeDiscordBot() {
  const token = (process.env.DISCORD_BOT_TOKEN || '').trim();
  if (!token) {
    throw new Error('DISCORD_BOT_TOKEN is required to initialize Discord client');
  }

  await hydrateDiscordCircuit();
  await preflightDiscordGateway(token);

  const bootStatus = getDiscordRateLimitStatus();
  console.log(
    `[DISCORD BOT] Boot diagnostics: tokenLength=${token.length} circuitOpen=${bootStatus.circuitOpen} ` +
    `circuitUntil=${bootStatus.circuitUntilHuman || 'none'} remaining=${bootStatus.circuitRemainingHuman}`
  );
  console.log(
    '[DISCORD BOT] Render "service is live" only means HTTP port 10000 is open — wait for "successfully deployed as" before the bot can ACK buttons.'
  );

  discordClient.on('error', (err) => {
    console.error(`🛑 [DISCORD BOT] client error: ${err.message}`);
  });
  discordClient.on('warn', (msg) => {
    console.warn(`⚠️ [DISCORD BOT] warn: ${msg}`);
  });
  discordClient.on('invalidated', () => {
    console.error('🛑 [DISCORD BOT] session invalidated — token was reset or another login kicked this process.');
  });
  discordClient.on('shardError', (err, shardId) => {
    console.error(`🛑 [DISCORD BOT] shard ${shardId} error: ${err.message}`);
  });
  discordClient.on('shardDisconnect', (event, shardId) => {
    console.error(
      `🛑 [DISCORD BOT] shard ${shardId} disconnected code=${event?.code ?? 'n/a'} reason=${event?.reason || 'none'}`
    );
  });
  discordClient.on('debug', (info) => {
    if (/Provided token/i.test(info)) return;
    if (/\[WS|Heartbeat|Identif|Ready|Session|429|Rate|Invalid|Connect|Destroy|Resume|Gateway/i.test(info)) {
      console.log(`[DISCORD BOT] ${info}`);
    }
  });

  let gatewayReadyBound = false;
  let readyWatch = null;
  const onGatewayReady = () => {
    if (gatewayReadyBound) return;
    gatewayReadyBound = true;
    if (readyWatch) clearTimeout(readyWatch);
    console.log(`🚀 Discord bot successfully deployed as: ${discordClient.user?.tag}`);

   // 🕹️ LIVE INTERACTION ROUTER: Gated exclusively to general room for slash commands and interactive boards[cite: 1]
    discordClient.on('interactionCreate', async (interaction) => {
      try {
        // Attendance card lives in the war-announce channel — route by customId
        // prefix so it bypasses the general-room gate.
        if ((interaction.isButton() || interaction.isStringSelectMenu()) && interaction.customId?.startsWith('attcard:')) {
          // ACK within Discord's 3s window before any Firebase / panel work.
          if (interaction.customId === 'attcard:open') {
            await interaction.deferReply({ ephemeral: true });
          } else if (interaction.customId.startsWith('attcard:set:')) {
            await interaction.deferUpdate();
          }
          return await handleAttendanceCardInteraction(interaction);
        }

        if ((interaction.isButton() || interaction.isStringSelectMenu()) && interaction.customId?.startsWith('partycard:')) {
          if (interaction.customId === 'partycard:open') {
            await interaction.deferReply({ ephemeral: true });
          }
          return await handlePartyCardInteraction(interaction);
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
    // First tick skips Discord announcers so identify + first announce do not stack.
    // Discord-facing jobs also skip while the 429 circuit is open.
    let skipFirstDiscordTick = true;
    setInterval(() => {
      const circuitOpen = isDiscordCircuitOpen();
      if (skipFirstDiscordTick) {
        skipFirstDiscordTick = false;
        console.log('⏭️ [SCHEDULER]: Skipping Discord announcers on the first tick after ready.');
      } else if (circuitOpen) {
        console.log('⏭️ [SCHEDULER]: Discord circuit open — skipping announcers.');
      } else {
        import('./eventAnnounce.js')
          .then((m) => m.maybeAnnounceEvents())
          .catch((err) => console.error('⚠️ Event announcement scheduler warning:', err.message));
      }

      import('../services/attendanceDecision.js')
        .then((m) => m.closeExpiredDeadlines())
        .catch((err) => console.error('⚠️ Attendance deadline closer warning:', err.message));

      import('../services/attendanceDecision.js')
        .then((m) => m.maybeRefreshMonthlyLeaveCredits())
        .catch((err) => console.error('⚠️ Monthly leave-credit refresh warning:', err.message));

      // Firebase-only jobs — safe during a Discord cooldown
      import('../api/liveRaid.routes.js')
        .then((m) => m.maybeAutoEndLiveRaid())
        .catch((err) => console.error('⚠️ Live raid auto-end scheduler warning:', err.message));

      import('./autoCommitAuction.js')
        .then((m) => m.maybeAutoCommitAuction())
        .catch((err) => console.error('⚠️ Auto-commit auction scheduler warning:', err.message));
    }, 60000);
  };

  discordClient.once('ready', onGatewayReady);
  discordClient.once('clientReady', onGatewayReady);

  readyWatch = setTimeout(() => {
    if (discordClient.isReady()) return;
    const wsStatus = discordClient.ws?.status;
    console.error(
      '🛑 [DISCORD BOT]: Gateway still not ready after 25s. ' +
      `isReady=false wsStatus=${wsStatus ?? 'n/a'} user=${discordClient.user?.tag || 'none'}. ` +
      'HTTP can be live while the bot is offline. Token and privileged intents are OK if boot diagnostics showed tokenLength~72. ' +
      'This hang is Discord TCP/WebSocket from this host (often Render IP blocked or IPv6 stall).'
    );
  }, 25000);

  try {
    if (bootStatus.circuitOpen) {
      console.warn(
        `🔌 [DISCORD BOT]: REST circuit is OPEN until ${bootStatus.circuitUntilHuman}. ` +
        `Gateway login still proceeds so buttons can ACK; card Send may stay blocked until the circuit clears.`
      );
    }
    console.log("⚡ [DISCORD BOT]: Initiating secure gateway handshake stream...");
    await discordClient.login(token);
    console.log(
      `[DISCORD BOT] login() settled. isReady=${discordClient.isReady()} user=${discordClient.user?.tag || 'none'}`
    );
  } catch (loginErr) {
    console.error("🛑 [DISCORD BOT GATEWAY EXCEPTION]:");
    console.error(`   Error Message: ${loginErr.message}`);
    console.error(`   Error Code: ${loginErr.code || 'N/A'}`);
    if (/429|rate limit|too many requests|being blocked/i.test(loginErr.message || '') || loginErr.code === 429) {
      logDiscordRateLimit('gateway login', loginErr);
    }
  }
}