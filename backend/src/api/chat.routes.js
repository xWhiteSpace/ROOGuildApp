import { Router } from 'express';
import { sendWebhookMessage } from '../services/webhookService.js';
import { writeChatMessage } from '../services/chatService.js';
import { discordClient } from '../discord-bot/client.js';

const router = Router();

router.post('/send', async (req, res) => {
  const { content } = req.body;

  // 🔍 TRUTH LOG: Monitors incoming packets inside your computer terminal
  console.log('📡 [CHAT ROUTE ENTRY] Received an incoming chat transmission packet!');
  console.log('   👉 Raw Cookie Session Present:', req.session?.user ? '✅ YES' : '❌ NO');
  console.log('   👉 Raw X-Authorized-User Header:', req.headers['x-authorized-user'] ? '✅ PRESENT' : '❌ MISSING/EMPTY');

  if (!content || typeof content !== 'string' || content.trim().length === 0) {
    return res.status(400).json({ success: false, error: 'Message content is required' });
  }

  // Check cookie session first, fallback to decoding the header payload for mobile/tablets
  let user = req.session?.user;
  
  if (!user && req.headers['x-authorized-user']) {
    try {
      user = JSON.parse(decodeURIComponent(req.headers['x-authorized-user']));
      console.log('   👉 Header Decoded Successfully! Identity recognized:', user.displayName || user.username);
    } catch (e) {
      console.error("❌ [CHAT ROUTE ERROR] Failed to parse or decode header authentication token:", e.message);
    }
  }

  if (!user) {
    console.warn('⚠️ [CHAT ROUTE REJECTION] Request dropped: No valid authentication credentials found.');
    return res.status(401).json({ success: false, error: 'Not authenticated' });
  }

  // Restart Warm-up Guard
  if (!discordClient || !discordClient.readyAt) {
    return res.status(503).json({ 
      success: false, 
      error: 'Discord bot is still warming up after server restart. Give it 2 seconds and try again!' 
    });
  }

  try {
    const guildId = process.env.DISCORD_GUILD_ID;
    const guild = await discordClient.guilds.fetch(guildId);
    const member = await guild.members.fetch(user.id);
    
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