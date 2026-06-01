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
    
    const leaderboardSnap = await db.ref('leaderboards').once('value');
    if (!leaderboardSnap.exists()) {
      console.log("⚠️ [SNAPSHOT SKIPPED]: No active auction records logged in database folder.");
      return;
    }

    const leaderboards = leaderboardSnap.val();
    
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