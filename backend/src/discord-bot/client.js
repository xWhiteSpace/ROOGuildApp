import { Client, GatewayIntentBits, Partials } from 'discord.js';
import { writeChatMessage } from '../services/chatService.js';

export const discordClient = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
  partials: [Partials.Channel, Partials.Message],
});

export async function initializeDiscordBot() {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) {
    throw new Error('DISCORD_BOT_TOKEN is required to initialize Discord client');
  }

  discordClient.once('clientReady', () => {
    console.log(`Discord bot ready as ${discordClient.user?.tag}`);
  });

  discordClient.on('messageCreate', async (message) => {
    const auctionChannelId = process.env.DISCORD_AUCTION_CHANNEL_ID;
    if (!auctionChannelId || message.channel.id !== auctionChannelId) {
      return;
    }

    if (message.author.bot) {
      return;
    }

    await writeChatMessage({
      id: message.id,
      author: `${message.author.username}#${message.author.discriminator}`,
      content: message.content,
      timestamp: message.createdTimestamp,
      source: 'discord',
      channelId: message.channel.id,
    });
  });

  await discordClient.login(token);
}
