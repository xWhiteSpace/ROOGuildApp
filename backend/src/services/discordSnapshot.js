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
    if (!requestsSnap.exists()) {
      console.log("⚠️ [SNAPSHOT SKIPPED]: No active auction records logged in database folder.");
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

      if (!userCalculationsMap[reqItemId][player]) {
        userCalculationsMap[reqItemId][player] = { name: player, netQty: 0, priority: priorityScore };
      }

      if (appStatus === 'requested') userCalculationsMap[reqItemId][player].netQty += qty;
      if (appStatus === 'canceled')  userCalculationsMap[reqItemId][player].netQty -= qty;
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

    let messagePayload = isFinalThreshold
      ? `🔒 === ${resolvedEventTitle.toUpperCase()} REGISTRATION CLOSED (FINALIZED LIST - LOCKED) ===\n`
      : `📊 === ${resolvedEventTitle.toUpperCase()} CURRENT BID REQUEST LIST ===\n`;
    
    messagePayload += `⏱️ Compiled At: ${timestampString} (${targetTimezone} Time)\n`;

    // Parse the aggregated live parameters directly into the markdown snapshot string
    itemsList.forEach(item => {
      messagePayload += `\n🏷️ Item Name: ${item.name.toUpperCase()}\n`;
      
      if (activeEventObj?.loots?.[item.id] === undefined) {
        messagePayload += `   ❌ This item is not included in tonight's auction cycle.\n`;
        return;
      }

      const activeApplicants = Object.values(userCalculationsMap[item.id] || {}).filter(u => u.netQty > 0);
      activeApplicants.sort((a, b) => b.priority - a.priority);

      if (activeApplicants.length > 0) {
        activeApplicants.forEach((entry, index) => {
          messagePayload += `   [Rank ${index + 1}] ${entry.name} - Qty: ${entry.netQty} (Priority Score: ${entry.priority})\n`;
        });
      } else {
        messagePayload += `   (No active bid requests filed for this item)\n`;
      }
    });

    // Locate the target Discord channel profile securely from environment
    const auctionChannelId = process.env.DISCORD_AUCTION_CHANNEL_ID;
    if (!auctionChannelId) {
      console.error("❌ [SNAPSHOT ERROR]: DISCORD_AUCTION_CHANNEL_ID is missing from environment layout.");
      return;
    }

    const targetChannel = await discordClient.channels.fetch(auctionChannelId);
    if (targetChannel && typeof targetChannel.send === 'function') {
      await targetChannel.send(`\`\`\`text\n${messagePayload}\`\`\``);
      console.log(`✅ [SNAPSHOT BROADCAST]: Matrix successfully posted to Discord channel.`);
    } else {
      console.error("❌ [SNAPSHOT ERROR]: Target destination is not a valid text guild channel context.");
    }
  } catch (error) {
    console.error("❌ [SNAPSHOT EXCEPTION]: Internal routine failure:", error.message);
  }
}