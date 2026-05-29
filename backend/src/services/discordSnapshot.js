// backend/src/services/discordSnapshot.js (Partial Refactoring Pass)
const db = require('../config/firebase');

async function generateDiscordSnapshotMessage() {
  // REQ024 & REQ025: Read directly from the unified calculated leaderboard table
  const leaderboardSnap = await db.ref('leaderboards').once('value');
  if (!leaderboardSnap.exists()) return "No active requests logged for tonight's session.";

  const leaderboards = leaderboardSnap.val();
  let messagePayload = `=== DYNASTY GUILD REQUEST MATRIX ===\n`;
  
  // Parse clean unified records directly into the text template layout string
  Object.keys(leaderboards).forEach(itemKey => {
    messagePayload += `\n🏷️ Scroll: ${itemKey.toUpperCase()}\n`;
    leaderboards[itemKey].forEach((entry, index) => {
      messagePayload += `[Rank ${index + 1}] ${entry.name} - Qty: ${entry.quantity} (Priority: ${entry.priorityScore})\n`;
    });
  });

  return messagePayload;
}