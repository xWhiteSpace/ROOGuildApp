// backend/src/services/discordSnapshot.js
import admin from 'firebase-admin';
import { discordClient } from '../discord-bot/client.js';

/**
 * 📣 REQ024 & REQ025: Live Automated Snapshots Controller
 * Reconciles the connection link with index.js. Builds the leaderboard
 * data matrix and posts it directly to your Discord guild channel.
 */
export async function processAndPostDiscordSnapshot(isFinalThreshold = false) {
  try {
    // Access database instance securely from the firebase-admin module scope
    const db = admin.database();
    
    // FETCH LIVE SOURCE ROWS FROM SOURCE-OF-TRUTH DATA PATH
    const allRequestsSnap = await db.ref('auction/web_requests').once('value');
    if (!allRequestsSnap.exists()) {
      console.log("⚠️ [SNAPSHOT SKIPPED]: No active auction records logged in database folder.");
      return;
    }

    const rawRequests = allRequestsSnap.val();
    const allPendingRows = [];

    // Filter strictly for lines awaiting operational action
    Object.values(rawRequests).forEach(req => {
      if (req && req.selectionStatus === 'Pending') {
        allPendingRows.push(req);
      }
    });

    const targetCategories = ['Puppet', 'Illu', 'Light&Dark', 'Time&Space'];
    const leaderboards = { 'Puppet': [], 'Illu': [], 'Light&Dark': [], 'Time&Space': [] };

    // Dynamically compile active net requests per scroll type category
    targetCategories.forEach(targetItem => {
      const userCalculationsMap = {};

      allPendingRows.forEach(req => {
        const player = (req.member || '').trim();
        const itemType = (req.item || '').trim();
        const qty = parseInt(req.quantity, 10) || 0;
        const appStatus = (req.applicationStatus || 'requested').toLowerCase();
        const priorityScore = parseInt(req.priority, 10) || 0;

        if (itemType !== targetItem || !player) return;

        if (!userCalculationsMap[player]) {
          userCalculationsMap[player] = { name: player, netQty: 0, priority: priorityScore };
        }

        if (appStatus === 'requested') userCalculationsMap[player].netQty += qty;
        if (appStatus === 'canceled')  userCalculationsMap[player].netQty -= qty;
      });

      // Filter out empty balances, sort by priority descending, and clamp to the top 100
      const activeApplicants = Object.values(userCalculationsMap).filter(u => u.netQty > 0);
      activeApplicants.sort((a, b) => b.priority - a.priority);
      
      leaderboards[targetItem] = activeApplicants.slice(0, 100).map(u => ({
        name: u.name,
        quantity: u.netQty,
        priority: u.priority
      }));
    });
    
    // Establish the text template header layout
    let messagePayload = isFinalThreshold
      ? `🔒 === REQUISITION REGISTRATION CLOSED (FINAL LIST) ===\n`
      : `📊 === LIVE DYNASTY GUILD REQUEST MATRIX ===\n`;
    
    // Parse records directly into the text template layout string
    Object.keys(leaderboards).forEach(itemKey => {
      messagePayload += `\n🏷️ Scroll Type: ${itemKey.toUpperCase()}\n`;
      if (Array.isArray(leaderboards[itemKey])) {
        leaderboards[itemKey].forEach((entry, index) => {
          messagePayload += `   [Rank ${index + 1}] ${entry.name} - Qty: ${entry.quantity} (Priority Score: ${entry.priorityScore || entry.priority || 0})\n`;
        });
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