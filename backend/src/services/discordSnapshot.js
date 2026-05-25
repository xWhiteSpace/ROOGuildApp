import fetch from 'node-fetch';
import { getGateStatusDetails } from '../config/timeWindow.js';

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

export async function processAndPostDiscordSnapshot() {
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!spreadsheetId || !webhookUrl) return;

  // 🛡️ CRITICAL GATE OVERLAY: Confirm that the gate is OPEN before broadcasting
  const statusGate = getGateStatusDetails();
  if (!statusGate.isGateOpen) {
    console.log(`[SNAPSHOT SKIP]: Post omitted. The gate is currently locked.`);
    return;
  }

  try {
    const requestUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv&sheet=RequestHistory`;
    const res = await fetch(requestUrl);
    const text = await res.text();
    const rows = parseCSVToRawArrays(text, 'Member');

    const categories = ['Puppet', 'Illu', 'Light&Dark', 'Time&Space'];
    const rankingsByItem = { 'Puppet': [], 'Illu': [], 'Light&Dark': [], 'Time&Space': [] };

    // Process every item category independently to prevent pity leaks
    categories.forEach(targetItem => {
      const userCalculationsMap = {};

      rows.forEach(row => {
        const player = (row[1] || '').trim();
        const itemType = (row[2] || '').trim();
        const qty = parseInt(row[3], 10) || 0;
        const appStatus = (row[4] || '').trim().toLowerCase();
        const selStatus = (row[5] || 'pending').trim().toLowerCase();
        const priorityScore = parseInt(row[7], 10) || 0;

        if (!player || player === '???' || itemType !== targetItem || selStatus !== 'pending') return;

        if (!userCalculationsMap[player]) {
          userCalculationsMap[player] = { name: player, netQty: 0, priority: priorityScore };
        }

        if (appStatus === 'requested') userCalculationsMap[player].netQty += qty;
        if (appStatus === 'canceled')  userCalculationsMap[player].netQty -= qty;
      });

      // Filter to only retain players with a standing net balance greater than 0
      const activeApplicants = Object.values(userCalculationsMap).filter(u => u.netQty > 0);
      
      // Sort descending by priority math cleanly
      activeApplicants.sort((a, b) => b.priority - a.priority);
      rankingsByItem[targetItem] = activeApplicants;
    });

    // 📋 ASSEMBLE CLEAN DISCORD TEXT STRING DISPLAY 
    const jstTimeString = new Date().toLocaleString("en-US", { timeZone: "Asia/Tokyo" });
    const formattedTimestamp = new Date(jstTimeString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    let msg = `⏳ **TONIGHT'S AUCTION ROSTER PREVIEW** (Update: **${formattedTimestamp} JST**)\n`;
    msg += `*Requests are currently open. Roster will lock tightly at 23:15 JST.*\n\n`;

    categories.forEach(item => {
      let emoji = item === 'Puppet' ? '🔴' : item === 'Illu' ? '🟡' : item === 'Light&Dark' ? '🔵' : '🟢';
      msg += `${emoji} **CATEGORY: ${item} (Max 20 Display Slots)**\n`;

      const list = rankingsByItem[item];
      if (list.length === 0) {
        // 🎯 EMPTY ROSTER FALLBACK APPLIED
        msg += `  *1. No request filed yet.*\n`;
      } else {
        // Cap displays strictly at 20 slots row-by-row hiding priority numbers
        const totalItemsToPrint = Math.min(list.length, 20);
        for (let i = 0; i < totalItemsToPrint; i++) {
          const positionLabel = String(i + 1).padStart(2, '0');
          msg += `  \`${positionLabel}\`. **${list[i].name}**\n`;
        }
      }
      msg += `\n`;
    });

    // 🚀 Post a fresh new message every time
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: msg })
    });

    console.log(`✅ [DISCORD BROADCAST SUCCESS] Fresh live leaderboard published.`);
  } catch (err) {
    console.error(`❌ [DISCORD SNAPSHOT FAULT]:`, err.message);
  }
}