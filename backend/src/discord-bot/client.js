import { Client, GatewayIntentBits, Partials } from 'discord.js';
import { handleAuctionInteraction } from '../services/discordInteractiveAuction.js'; // 🕹️ Route live button boards
import admin from 'firebase-admin'; // 🛰️ Connect absolute database reference paths
import { handleSlashCommand, handleComponentInteraction } from './discordSlashcmd.js';

import { ProxyAgent, setGlobalDispatcher } from 'undici';

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
  } catch (probeErr) {
    console.error("🛑 [DISCORD PROBE CRITICAL FAULT]: Raw network route is heavily rate-limited or tarpitted.");
    console.error(`   Error Reason: ${probeErr.message}`);
  }

  try {
    console.log("⚡ [DISCORD BOT]: Initiating secure gateway handshake stream...");
    await discordClient.login(token);
  } catch (loginErr) {
    console.error("🛑 [DISCORD BOT GATEWAY EXCEPTION]:");
    console.error(`   Error Message: ${loginErr.message}`);
    console.error(`   Error Code: ${loginErr.code || 'N/A'}`);
  }
}