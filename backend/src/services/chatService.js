import { getDatabase } from 'firebase-admin/database';
import { discordClient } from '../discord-bot/client.js';

export async function writeChatMessage(message) {
  try {
    const db = getDatabase();
    const messagesRef = db.ref('chat/messages');
    const messageRef = messagesRef.push();
    
    await messageRef.set(message);
    
    // 🌟 ADDED: This will print out in your terminal to prove Firebase accepted the data
    console.log(`💾 Success! Message securely written to Firebase path: chat/messages/${messageRef.key}`);
    return { id: messageRef.key, ...message };
  } catch (error) {
    // 🚨 ADDED: If your Firebase credentials or database URL are misconfigured, this will catch it
    console.error(`❌ Firebase Database Save Failed:`, error.message);
    throw error;
  }
}

export async function sendDiscordMessage(content) {
  if (!discordClient.isReady()) {
    throw new Error('Discord client is not ready');
  }

  const channelId = process.env.DISCORD_AUCTION_CHANNEL_ID;
  if (!channelId) {
    throw new Error('DISCORD_AUCTION_CHANNEL_ID is not configured');
  }

  const channel = await discordClient.channels.fetch(channelId);
  if (!channel || !channel.isTextBased()) {
    throw new Error('Discord auction channel is not available or not text-based');
  }

  const message = await channel.send(content);
  return message;
}