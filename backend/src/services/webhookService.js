import { discordClient } from '../discord-bot/client.js';

let webhookUrl = null;

export async function getOrCreateWebhook() {
  // If we already have the webhook URL, use it
  if (webhookUrl) {
    return webhookUrl;
  }

  const guildId = process.env.DISCORD_GUILD_ID;
  const channelId = process.env.DISCORD_AUCTION_CHANNEL_ID;

  if (!guildId || !channelId) {
    throw new Error('Missing DISCORD_GUILD_ID or DISCORD_AUCTION_CHANNEL_ID');
  }

  try {
    const guild = await discordClient.guilds.fetch(guildId);
    const channel = await guild.channels.fetch(channelId);

    if (!channel || !channel.isTextBased()) {
      throw new Error('Channel is not text-based');
    }

    // Try to find existing webhook named "DynastyGuild"
    const webhooks = await channel.fetchWebhooks();
    let webhook = webhooks.find((w) => w.name === 'DynastyGuild');

    // If no webhook exists, create one
    if (!webhook) {
      webhook = await channel.createWebhook({
        name: 'DynastyGuild',
        avatar: null,
      });
    }

    webhookUrl = webhook.url;
    return webhookUrl;
  } catch (error) {
    throw new Error(`Failed to get or create webhook: ${error.message}`);
  }
}

export async function sendWebhookMessage(content, username, avatarUrl) {
  const webhook = await getOrCreateWebhook();

  try {
    const webhookUrl = webhook.includes('?') ? `${webhook}&wait=true` : `${webhook}?wait=true`;
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        content,
        username,
        avatar_url: avatarUrl,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Webhook send failed: ${error}`);
    }

    const text = await response.text();
    if (!text) {
      return { id: null, content, username, avatar_url: avatarUrl };
    }

    const result = JSON.parse(text);
    return result;
  } catch (error) {
    throw new Error(`Failed to send webhook message: ${error.message}`);
  }
}
