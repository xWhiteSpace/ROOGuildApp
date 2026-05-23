import { Client, GatewayIntentBits, Partials } from 'discord.js';
import { writeChatMessage } from '../services/chatService.js';

export const discordClient = new Client({
  intents: [
    GatewayIntentBits.Guilds, 
    GatewayIntentBits.GuildMessages, 
    GatewayIntentBits.MessageContent, 
    GatewayIntentBits.GuildMembers 
  ],
  partials: [Partials.Channel, Partials.Message],
});

export async function initializeDiscordBot() {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) {
    throw new Error('DISCORD_BOT_TOKEN is required to initialize Discord client');
  }

  discordClient.once('clientReady', () => {
    console.log(`🚀 Discord bot successfully deployed as: ${discordClient.user?.tag}`);
  });

  discordClient.on('messageCreate', async (message) => {
    const auctionChannelId = process.env.DISCORD_AUCTION_CHANNEL_ID;
    if (!auctionChannelId || message.channel.id !== auctionChannelId) {
      return;
    }

    if (message.author.bot) {
      return;
    }

    // 🌟 FORCE EXPLICIT SERVER NICKNAME RESOLUTION
    let serverDisplayName = message.author.username;
    try {
      // Pull member data from active guild context
      const member = message.member || await message.guild?.members.fetch(message.author.id);
      if (member) {
        serverDisplayName = member.displayName || member.nickname || message.author.username;
      }
    } catch (err) {
      // Clean fallback if user leaves server mid-stream
      serverDisplayName = message.author.displayName || message.author.username;
    }

    console.log(`📥 Intercepted Discord Message: [${serverDisplayName}]: ${message.content}`);

    await writeChatMessage({
      id: message.id,
      author: serverDisplayName, // 🌟 Now populated with game/server nickname
      content: message.content,
      timestamp: message.createdTimestamp,
      source: 'discord',
      channelId: message.channel.id,
    });
  });

  await discordClient.login(token);
}