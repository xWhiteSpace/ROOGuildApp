import { Router } from 'express';
import { discordClient } from '../discord-bot/client.js';

const router = Router();

// 💡 Exact low-level CSV line breaker from your syncRouter.js
function parseCSVToRawArrays(csvText, headerMatchKeyword) {
  const lines = csvText.split(/\r?\n/);
  let tableStarted = false;
  const dataRows = [];
  for (let line of lines) {
    if (!line.trim()) continue;
    const cleanLine = line.replace(/^\ufeff/, '');
    const cells = cleanLine.split(',').map(c => c.trim().replace(/^"|"$/g, '').trim());
    if (!tableStarted) {
      if (cells.map(c => c.toLowerCase()).includes(headerMatchKeyword.toLowerCase())) {
        tableStarted = true;
      }
      continue;
    }
    if (cells.every(c => c === '')) continue;
    dataRows.push(cells);
  }
  return dataRows;
}

// Looks up server nickname to match your spreadsheet 'Member' values exactly
const getGuildDisplayName = async (user) => {
  try {
    const guildId = process.env.DISCORD_GUILD_ID;
    const guild = await discordClient.guilds.fetch(guildId);
    const member = await guild.members.fetch(user.id);
    return member.nickname || member.user.globalName || user.username;
  } catch (err) {
    return user.globalName || user.username;
  }
};

/**
 * 📡 RESILIENT INITIALIZATION GATEWAY
 * GET /api/requests/init
 */
router.get('/init', async (req, res) => {
  // Check every possible session lock location your app might use
  let user = req.session?.user;
  if (!user && req.headers['x-authorized-user']) {
    try {
      user = JSON.parse(decodeURIComponent(req.headers['x-authorized-user']));
    } catch (e) {}
  }

  // Fallback profile if authentication tokens are still cross-firing during testing
  if (!user) {
    user = { id: '0000', username: 'Guild Member', globalName: 'Guild Member' };
  }

  try {
    const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
    const displayName = await getGuildDisplayName(user);
    const playerLower = displayName.toLowerCase();

    // Standard inventory parameters from your loot sheet
    const availableItems = [
      { name: 'Puppet', maxQty: 1 },
      { name: 'Illu', maxQty: 1 },
      { name: 'Light&Dark', maxQty: 3 },
      { name: 'Time&Space', maxQty: 5 }
    ];

    const requestUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv&sheet=RequestHistory&range=A1:Z1010`;
    const response = await fetch(requestUrl);
    const csvText = await response.text();
    const spreadsheetRows = parseCSVToRawArrays(csvText, 'Member');

    // Calculate dynamic ledger sums
    const liveCounts = {};
    availableItems.forEach(item => { liveCounts[item.name] = 0; });

    spreadsheetRows.forEach(row => {
      const rowMember = (row[1] || '').trim().toLowerCase();
      if (rowMember === playerLower) {
        const itemType = row[2];
        const itemQty = parseInt(row[3], 10) || 0;
        const appStatus = (row[4] || '').trim().toLowerCase();
        const selStatus = (row[5] || 'pending').trim().toLowerCase();

        if (['pending', 'standby', 'now', 'next', ''].includes(selStatus)) {
          if (appStatus === 'requested' || appStatus === 'active') {
            liveCounts[itemType] = (liveCounts[itemType] || 0) + itemQty;
          } else if (appStatus === 'canceled' || appStatus === 'cancelled') {
            liveCounts[itemType] = (liveCounts[itemType] || 0) - itemQty;
          }
        }
      }
    });

    Object.keys(liveCounts).forEach(k => {
      if (liveCounts[k] < 0) liveCounts[k] = 0;
    });

    return res.json({
      success: true,
      displayName,
      date: `${new Date().getMonth() + 1}/${new Date().getDate()}/${new Date().getFullYear()}`,
      items: availableItems,
      liveCounts
    });

  } catch (error) {
    return res.status(500).json({ success: false, error: `Spreadsheet Connection Failed: ${error.message}` });
  }
});

export default router;