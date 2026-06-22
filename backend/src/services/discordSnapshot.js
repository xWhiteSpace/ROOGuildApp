// backend/src/services/discordSnapshot.js
import admin from 'firebase-admin';
import { discordClient } from '../discord-bot/client.js';
import { getGateStatusDetails } from '../config/timeWindow.js';

/**
 * 📣 REQ024 & REQ025: Live Automated Snapshots Controller
 * Reconciles the connection link with index.js. Builds the leaderboard
 * data matrix and posts it directly to your Discord guild channel.
 */
export async function processAndPostDiscordSnapshot(isFinalThreshold = false) {
  try {
    // Access database instance securely from the firebase-admin module scope
    const db = admin.database();
    
    // Fetch dynamic item templates and live web requests to compile the matrix dynamically
    const configSnap = await db.ref('settings/configuration').once('value');
    const dynamicConfig = configSnap.exists() ? configSnap.val() : {};
    const itemsList = dynamicConfig.items || [];

    const requestsSnap = await db.ref('auction/web_requests').once('value');
    const membersSnap = await db.ref('auction/members').once('value');
    const membersData = membersSnap.exists() ? membersSnap.val() : {};

    if (!requestsSnap.exists()) {
      console.log("⚠️ [NO ANNOUNCEMENT]: No active auction records logged in database folder.");
      return;
    }

    const firebaseRequests = Object.values(requestsSnap.val());
    const userCalculationsMap = {};
    itemsList.forEach(item => { userCalculationsMap[item.id] = {}; });

    // Aggregate user net quantities and filter for pending entries sequentially
    firebaseRequests.forEach(req => {
      if ((req.selectionStatus || 'Pending').toLowerCase() !== 'pending') return;
      
      const player = (req.member || '').trim();
      const qty = parseInt(req.quantity, 10) || 0;
      const appStatus = (req.applicationStatus || 'requested').toLowerCase();
      const priorityScore = parseInt(req.priority, 10) || 0;

      let reqItemId = req.itemId;
      if (!reqItemId && req.item) {
        const found = itemsList.find(i => i.name.toLowerCase() === req.item.toLowerCase());
        if (found) reqItemId = found.id;
      }

      if (!reqItemId || userCalculationsMap[reqItemId] === undefined) return;

      // Use userId as the absolute tracking key, falling back to name for older unmigrated data
      const playerTrackingKey = req.userId || player;
      if (!playerTrackingKey) return;

      if (!userCalculationsMap[reqItemId][playerTrackingKey]) {
        userCalculationsMap[reqItemId][playerTrackingKey] = { userId: playerTrackingKey, name: player, netQty: 0, priority: priorityScore, latestKey: req.id };
      }

      if (appStatus === 'requested') {
        userCalculationsMap[reqItemId][playerTrackingKey].netQty += qty;
        userCalculationsMap[reqItemId][playerTrackingKey].latestKey = req.id; 
      }
      if (appStatus === 'canceled') {
        userCalculationsMap[reqItemId][playerTrackingKey].netQty -= qty;
      }
    });

    // Establish the text template header layout
    const gateDetails = getGateStatusDetails() || {};
    const activeEventObj = dynamicConfig.events?.[gateDetails.activeEventId];
    const resolvedEventTitle = gateDetails.activeEventTitle || "Raid Session";
    const targetTimezone = dynamicConfig.timezone || "Asia/Manila";

    const timestampString = new Date().toLocaleString("en-US", { 
      timeZone: targetTimezone,
      dateStyle: "short",
      timeStyle: "short"
    });

    const embedsPayload = [];

    // 🎨 CHROMATIC CONSOLE SYNC: Converts hex strings or theme keywords into Discord decimal integers
    const resolveColorThemeToInteger = (colorTheme) => {
      if (colorTheme && colorTheme.startsWith('#')) {
        return parseInt(colorTheme.replace('#', ''), 16);
      }
      const PRESET_MAP = {
        purple: 0x8b5cf6,
        yellow: 0xeab308,
        slate: 0x64748b,
        red: 0xef4444,
        orange: 0xf97316,
        emerald: 0x10b981,
        blue: 0x3b82f6
      };
      return PRESET_MAP[colorTheme] || 0x64748b;
    };

    const currentUnixTimestamp = Math.floor(Date.now() / 1000);
    // ✨ RE-VALUED TYPOGRAPHY: Stripped out debug symbols to form clean, high-contrast dashboard notification status headers
    let broadcastHeadlineText = isFinalThreshold
      ? `🔒 **LOCKED • ${resolvedEventTitle.toUpperCase()} FINALIZED ALLOCATION SHEET**\n`
      : `📊 **CURRENT LIST • ${resolvedEventTitle.toUpperCase()} ONGOING BID REGISTER**\n`;
    
    // 🕒 TIMELINE STREAMLINING: Dropped the custom relative timestamp row to clean up the card header space
    broadcastHeadlineText += `🕒 **Time:** \`${timestampString}\` (${targetTimezone})`;
    // Process aggregated data into separate stylized embed blocks
    itemsList.forEach(item => {
      // 🔇 NOISE SUPPRESSION: Completely skip item cards that are not declared in tonight's auction drop pool
      if (activeEventObj?.loots?.[item.id] === undefined) return;

      const embedColorInteger = resolveColorThemeToInteger(item.colorTheme);
      let contentSummaryString = '';
      const activeApplicants = Object.values(userCalculationsMap[item.id] || {}).filter(u => u.netQty > 0);
      
      activeApplicants.sort((a, b) => {
        if (b.priority !== a.priority) {
          return b.priority - a.priority;
        }
        return a.latestKey.localeCompare(b.latestKey);
      });

      if (activeApplicants.length > 0) {
        // 📊 MONOSPACED TABLE ARCHITECTURE: Open an integrated block to align layout pillars perfectly
        contentSummaryString += "```wl\n";
        
        activeApplicants.forEach((entry, index) => {
          const linePositionLabel = `#${String(index + 1).padStart(2, '0')}`;
          
          // Resolve name dynamically via the pure numerical user account ID
          const resolvedDisplayName = (/^\d+$/.test(entry.userId))
            ? (membersData[entry.userId]?.displayName || entry.name)
            : entry.name;

          // Pad names out to 25 fixed columns to absorb variable string lengths smoothly
          const paddedName = resolvedDisplayName.padEnd(27, ' ');
          const paddedQty = `Qty: ${entry.netQty}`.padEnd(6, ' ');
          
          contentSummaryString += `${linePositionLabel}  ${paddedName}  ${paddedQty}  [P: ${entry.priority}]\n`;
        });
        
        contentSummaryString += "```";
      } else {
        // Clearer aesthetic representation of empty drop buckets
        contentSummaryString = `🍃 *Request List Clear • Standing by for next session...*`;
      }

      embedsPayload.push({
        title: `🏷️ ${item.name.toUpperCase()}`,
        description: contentSummaryString,
        color: embedColorInteger,
        footer: { 
          text: `⏱️ Timestamp: ${timestampString} | Item ID: ${item.id}` 
        }
      });
    });
    // Locate the target Discord channel profile securely from environment
    const auctionChannelId = process.env.DISCORD_AUCTION_CHANNEL_ID;
    if (!auctionChannelId) {
      console.error("❌ [SNAPSHOT ERROR]: DISCORD_AUCTION_CHANNEL_ID is missing from environment layout.");
      return;
    }

    const targetChannel = await discordClient.channels.fetch(auctionChannelId);
    if (targetChannel && typeof targetChannel.send === 'function') {
      
      // Handle fallback case where zero items are dropping tonight
      if (embedsPayload.length === 0) {
        await targetChannel.send({ 
          content: `${broadcastHeadlineText}\n\n⚠️ *No active items or active bid registrations are mapped for tonight's auction pool cycle.*` 
        });
        console.log(`✅ [SNAPSHOT BROADCAST]: Empty state posted to Discord channel.`);
        return;
      }

      const EMBED_CHUNK_SIZE = 8; // 🛡️ Safe size buffer (Discord max absolute limit is 10 embeds per single text post)
      
      for (let i = 0; i < embedsPayload.length; i += EMBED_CHUNK_SIZE) {
        const structuralChunk = embedsPayload.slice(i, i + EMBED_CHUNK_SIZE);
        
        if (i === 0) {
          // Send the headline banner strictly inside the first payload frame message
          await targetChannel.send({ 
            content: broadcastHeadlineText, 
            embeds: structuralChunk 
          });
        } else {
          // Stream subsequent item blocks cleanly down the tracking feed channel
          await targetChannel.send({ 
            embeds: structuralChunk 
          });
        }
      }
      
      console.log(`✅ [BROADCAST]: List is successfully sent to Discord.`);
    } else {
      console.error("❌ [BROADCAST ERROR]: Target destination is not a valid text guild channel context.");
    }
  } catch (error) {
    console.error("❌ [BROADCAST EXCEPTION]: Internal routine failure:", error.message);
  }
}