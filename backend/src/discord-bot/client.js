import { Client, GatewayIntentBits, Partials } from 'discord.js';
import { handleAuctionInteraction } from '../services/discordInteractiveAuction.js'; // 🕹️ Route live button boards
import admin from 'firebase-admin'; // 🛰️ Connect absolute database reference paths

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

   // 🕹️ LIVE INTERACTION ROUTER: Catches and processes rapid-fire button board claims and select menu shifts
    discordClient.on('interactionCreate', async (interaction) => {
      try {
        await handleAuctionInteraction(interaction);
      } catch (err) {
        console.error("❌ [GATEWAY INTERACTION ROUTE ERROR]: Failed to resolve click event:", err.message);
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ 
            content: '❌ An internal processing failure occurred while verifying your item slot assignment command.', 
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
    setInterval(async () => {
      try {
        // 🚨 FORCED LOCK ANNOUNCEMENT SILENCER: Suppress all cron updates if manual absolute lockdown mode is toggled
        const db = admin.database();
        const configSnap = await db.ref('settings/configuration').once('value');
        if (configSnap.exists() && configSnap.val().isForceLocked === true) {
          return; // Abort execution loop cleanly to freeze channel notifications
        }

        const { getGateStatusDetails } = await import('../config/timeWindow.js');
        const status = getGateStatusDetails(); // Pull synchronization baselines
        if (!status || !status.announcementMinutes) return; // Safeguard if tree returns empty payload

        // 🚀 EFFICIENCY GAIN: Pull the verified timezone directly from your synchronous memory cache
        const targetTimezone = status.timezone || "Asia/Manila";

        const now = new Date();
        const parts = new Intl.DateTimeFormat('en-US', {
          timeZone: targetTimezone,
          hour12: false,
          year: 'numeric',
          month: 'numeric',
          day: 'numeric',
          hour: 'numeric',
          minute: 'numeric'
        }).formatToParts(now);

        const timeObj = {};
        parts.forEach(p => { timeObj[p.type] = p.value; });

        const year = parseInt(timeObj.year, 10);
        const month = parseInt(timeObj.month, 10) - 1;
        const day = parseInt(timeObj.day, 10);
        const trueHours = parseInt(timeObj.hour, 10) % 24;
        const trueMinutes = parseInt(timeObj.minute, 10);

        const weekdayStr = new Intl.DateTimeFormat('en-US', { timeZone: targetTimezone, weekday: 'short' }).format(now);
        const shortNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
        const dayOfWeek = shortNames.indexOf(weekdayStr) >= 0 ? shortNames.indexOf(weekdayStr) : 0;
        const currentAbs = (dayOfWeek * 1440) + (trueHours * 60) + trueMinutes;

        // 🛰️ SECURE CHANNEL SEPARATION: Pull distinct channel pointers from environment files
        const aucreqChannelId = process.env.DISCORD_AUCREQ_CHANNEL_ID;     // Request/Signup Lobby
        const auctionChannelId = process.env.DISCORD_AUCTION_CHANNEL_ID;   // Live Arena Deck

        const { phase1, phase2, phase3 } = status.announcementMinutes; // Destructure targeted milestone integers

        // 🛡️ DRIFT-PROOF TRACKING MATRIX: Initialize tracker or scan historical intervals to protect against skipped ticks
        if (typeof global.lastProcessedAbs === 'undefined') {
          global.lastProcessedAbs = (currentAbs - 1 + 10080) % 10080;
        }

        const minutesToCheck = [];
        let cursorMin = (global.lastProcessedAbs + 1) % 10080;
        const loopTargetMin = (currentAbs + 1) % 10080;

        // Backfill the queue with any minutes that elapsed during processing lag or event loop drift
        while (cursorMin !== loopTargetMin) {
          minutesToCheck.push(cursorMin);
          cursorMin = (cursorMin + 1) % 10080;
        }

        // Evaluate the sequential backfill timeline step-by-step
        for (const minuteCode of minutesToCheck) {
          if (phase1.includes(minuteCode)) {
            if (auctionChannelId) {
              const reqChannel = await discordClient.channels.fetch(auctionChannelId).catch(() => null);
              if (reqChannel && reqChannel.isTextBased()) {
                await reqChannel.send(`📢 **${status.eventName} Registration Update**:\nBid requests are currently **OPEN**! Remember to check your basket modifications and confirm your item choices on the request deck.`);
              }
            }
            
            // 📊 SNAPSHOT INTEGRATION: Automatically dispense live item demands
            const { processAndPostDiscordSnapshot } = await import('../services/discordSnapshot.js');
            await processAndPostDiscordSnapshot(false).catch(() => {});
          }
          if (minuteCode === phase2) {
            if (auctionChannelId) {
              const reqChannel = await discordClient.channels.fetch(auctionChannelId).catch(() => null);
              if (reqChannel && reqChannel.isTextBased()) {
                await reqChannel.send(`🔒 **${status.eventName} Registration Locked**:\nSubmissions are now closed! Bidding selections are frozen for list allocation processing by Management Officers.`);
              }
            }
            
            // 📊 SNAPSHOT INTEGRATION: Automatically lock and publish finalized lists
            const { processAndPostDiscordSnapshot } = await import('../services/discordSnapshot.js');
            await processAndPostDiscordSnapshot(true).catch(() => {});
          }
          if (minuteCode === phase3) {
            // 📍 Live Auction Arena Announcement: Directed exclusively into DISCORD_AUCTION_CHANNEL_ID
            if (auctionChannelId) {
              const auctionChannel = await discordClient.channels.fetch(auctionChannelId).catch(() => null);
              if (auctionChannel && auctionChannel.isTextBased()) {
                await auctionChannel.send(`⚡ **${status.eventName} Auction Arena LIVE**:\nThe raid session has commenced! Stand by for interactive live bidding controls.`);
              }
            }
            
            // 📊 SNAPSHOT INTEGRATION: Publish the opening live auction board notice
            const { processAndPostDiscordSnapshot } = await import('../services/discordSnapshot.js');
            await processAndPostDiscordSnapshot(false).catch(() => {});
          }
        }

        global.lastProcessedAbs = currentAbs; // Pin down anchor for next interval comparison loop
      } catch (err) {
        console.error("⚠️ Automated notification scheduler loop warning:", err.message);
      }
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