import fetch from 'node-fetch';
import { getDatabase } from 'firebase-admin/database';
import { getGateStatusDetails } from '../config/timeWindow.js';
import { discordClient } from '../discord-bot/client.js';

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

export async function processAndPostDiscordSnapshot(isFinalizedCall = false) {
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  const auctionChannelId = process.env.DISCORD_AUCTION_CHANNEL_ID;
  
  if (!spreadsheetId || !auctionChannelId || !discordClient || !discordClient.isReady()) {
    console.log(`[SNAPSHOT ERROR]: Prerequisites failed. Check bot client ready state.`);
    return;
  }

  const statusGate = getGateStatusDetails();
  
  // If this is a standard hour reminder check (7am, 12pm, 7pm) but the gate has closed, skip it entirely
  if (!isFinalizedCall && !statusGate.isGateOpen) {
    console.log(`[SNAPSHOT SKIP]: Post omitted. Regular updates are silent during lock period.`);
    return;
  }

  try {
    const requestUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv&sheet=RequestHistory`;
    const res = await fetch(requestUrl);
    const text = await res.text();
    const spreadsheetRows = parseCSVToRawArrays(text, 'Member');

    const db = getDatabase();
    const snapshot = await db.ref('auction/web_requests').once('value');
    const firebaseRequests = snapshot.exists() ? Object.values(snapshot.val()) : [];

    const categories = ['Puppet', 'Illu', 'Light&Dark', 'Time&Space'];
    const rankingsByItem = { 'Puppet': [], 'Illu': [], 'Light&Dark': [], 'Time&Space': [] };

    categories.forEach(targetItem => {
      const userCalculationsMap = {};

      spreadsheetRows.forEach(row => {
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

      firebaseRequests.forEach(req => {
        const player = (req.member || '').trim();
        const itemType = (req.item || '').trim();
        const qty = parseInt(req.quantity, 10) || 0;
        const appStatus = (req.applicationStatus || 'requested').toLowerCase();
        const selStatus = (req.selectionStatus || 'pending').toLowerCase();
        const priorityScore = parseInt(req.priority, 10) || 0;

        if (!player || itemType !== targetItem || selStatus !== 'pending') return;

        if (!userCalculationsMap[player]) {
          userCalculationsMap[player] = { name: player, netQty: 0, priority: priorityScore };
        }

        if (appStatus === 'requested') userCalculationsMap[player].netQty += qty;
        if (appStatus === 'canceled')  userCalculationsMap[player].netQty -= qty;
      });

      const activeApplicants = Object.values(userCalculationsMap).filter(u => u.netQty > 0);
      activeApplicants.sort((a, b) => b.priority - a.priority);
      
      // Mirror the 100-player roster visibility index cleanly
      rankingsByItem[targetItem] = activeApplicants.slice(0, 100).map(u => u.name);
    });

    // 📋 ASSEMBLE CLEAN DISCORD TEXT STRING DISPLAY MATCHING CONCISE LAYOUT RULES
    const gmt8TimeStr = new Date().toLocaleString("en-US", { timeZone: "Asia/Manila" });
    const formattedTimestamp = new Date(gmt8TimeStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    let appendLockLabel = isFinalizedCall ? " (FINALIZED LIST - LOCKED)" : "";
    let msg = `Current Bid Request as of ${formattedTimestamp} GMT+8${appendLockLabel}\n\n`;

    categories.forEach(item => {
      msg += `${item}\n`;
      const playerList = rankingsByItem[item];

      if (playerList.length === 0) {
        msg += `No request filed yet.\n`;
      } else {
        playerList.forEach((name, index) => {
          const positionNum = String(index + 1).padStart(2, '0');
          msg += `${positionNum}. ${name}\n`;
        });
      }
      msg += `\n`;
    });

    // 🚀 Bot Client uses channel ID directly to post text packages natively 
    const channel = await discordClient.channels.fetch(auctionChannelId);
    if (channel && typeof channel.send === 'function') {
      await channel.send(msg);
      console.log(`✅ [BOT SNAPSHOT SUCCESS]: Broadcast sent through native client.`);
    } else {
      console.error(`❌ [BOT SNAPSHOT ERROR]: Channel target missing valid send permissions.`);
    }

  } catch (err) {
    console.error(`❌ [DISCORD SNAPSHOT FAULT]:`, err.message);
  }
}