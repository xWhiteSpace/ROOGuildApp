import { Router } from 'express';
import { sendWebhookMessage } from '../services/webhookService.js';
import { writeChatMessage } from '../services/chatService.js';
import { discordClient } from '../discord-bot/client.js';

const router = Router();

router.post('/send', async (req, res) => {
  const { content } = req.body;
  if (!content || typeof content !== 'string' || content.trim().length === 0) {
    return res.status(400).json({ success: false, error: 'Message content is required' });
  }

  const user = req.session?.user;
  if (!user) {
    return res.status(401).json({ success: false, error: 'Not authenticated' });
  }

  try {
    // Get the server nickname from the guild member
    const guildId = process.env.DISCORD_GUILD_ID;
    const guild = await discordClient.guilds.fetch(guildId);
    const member = await guild.members.fetch(user.id);
    
    // Use server nickname if available, otherwise fall back to display name or username
    const displayName = member.nickname || member.user.globalName || user.username;
    const avatarUrl = user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png` : null;

    // Send via webhook (appears from the user, not the bot)
    const webhookResult = await sendWebhookMessage(content.trim(), displayName, avatarUrl);
    
    // Write to Firebase
    const dbMessage = {
      id: webhookResult.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      author: displayName,
      content: content.trim(),
      timestamp: new Date().getTime(),
      source: 'app',
      channelId: process.env.DISCORD_AUCTION_CHANNEL_ID,
    };
    await writeChatMessage(dbMessage);
    
    return res.json({ success: true, message: dbMessage });
  } catch (error) {
    console.error('Chat send error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
