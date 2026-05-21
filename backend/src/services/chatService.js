import { getDatabase } from 'firebase-admin/database';
import { discordClient } from '../discord-bot/client.js';

export async function writeChatMessage(message) {
  const db = getDatabase();
  const messagesRef = db.ref('chat/messages');
  const messageRef = messagesRef.push();
  await messageRef.set(message);
  return { id: messageRef.key, ...message };
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

  // Send message to Discord
  const message = await channel.send(content);
  return message;
}
