import { Router } from 'express';
import { getDatabase } from 'firebase-admin/database';
import { getGateStatusDetails } from '../config/timeWindow.js';

const router = Router();

/**
 * 🕒 GMT+8 DATE GENERATOR HELPER
 * Standardizes calendar days to Asia/Manila zone formatting (MM/DD/YYYY)
 */
function getGMT8DateString() {
  const gmt8String = new Date().toLocaleString("en-US", { timeZone: "Asia/Manila" });
  const gmt8Date = new Date(gmt8String);
  const month = gmt8Date.getMonth() + 1;
  const day = gmt8Date.getDate();
  const year = gmt8Date.getFullYear();
  return `${month}/${day}/${year}`;
}

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

function resolveUserIdentity(req) {
  if (req.session?.user) return req.session.user;
  const mobileHeaderToken = req.headers['x-user-profile'];
  if (mobileHeaderToken) {
    try {
      return JSON.parse(decodeURIComponent(mobileHeaderToken));
    } catch (e) {
      console.error("Failed to parse mobile authorization header token:", e.message);
    }
  }
  return null;
}

/**
 * 📡 INITIALIZATION PATHWAY
 * GET /api/requests/init
 */
router.get('/init', async (req, res) => {
  const user = resolveUserIdentity(req);
  if (!user) return res.status(401).json({ success: false, error: 'Session identity missing' });

  try {
    const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
    const playerDisplayName = user.displayName || user.username;
    const playerLower = playerDisplayName.trim().toLowerCase();
    
    const timeGateStatus = getGateStatusDetails();
    const currentGMT8Date = getGMT8DateString(); // Aligned to GMT+8

    const availableItems = [
      { name: 'Puppet', maxQty: 1 },
      { name: 'Illu', maxQty: 1 },
      { name: 'Light&Dark', maxQty: 3 },
      { name: 'Time&Space', maxQty: 5 }
    ];

    const requestUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv&sheet=RequestHistory`;
    const response = await fetch(requestUrl);
    const csvText = await response.text();
    const spreadsheetRows = parseCSVToRawArrays(csvText, 'Member');

    const db = getDatabase();
    const snapshot = await db.ref('auction/web_requests').once('value');
    const firebaseRequests = snapshot.exists() ? Object.values(snapshot.val()) : [];

    const liveCounts = {};
    availableItems.forEach(item => { liveCounts[item.name] = 0; });

    spreadsheetRows.forEach(row => {
      if ((row[1] || '').trim().toLowerCase() === playerLower) {
        const itemType = row[2];
        const appStatus = (row[4] || '').trim().toLowerCase();
        const selStatus = (row[5] || 'pending').trim().toLowerCase();
        const liveStatus = (row[6] || '').trim().toLowerCase();
        const itemQty = parseInt(row[3], 10) || 0;

        const isAwaitingEvaluation = (selStatus === 'pending');
        const isLiveInCurrentSession = (selStatus === 'selected' && ['now', 'next', 'standby'].includes(liveStatus));

        if (isAwaitingEvaluation || isLiveInCurrentSession) {
          if (appStatus === 'requested' && liveCounts[itemType] !== undefined) liveCounts[itemType] += itemQty;
          if (appStatus === 'canceled' && liveCounts[itemType] !== undefined)  liveCounts[itemType] -= itemQty;
        }
      }
    });

    firebaseRequests.forEach(req => {
      if ((req.member || '').trim().toLowerCase() === playerLower) {
        const selStatus = (req.selectionStatus || 'pending').toLowerCase();
        const appStatus = (req.applicationStatus || '').toLowerCase();

        if (selStatus === 'pending') {
          if (appStatus === 'requested' && liveCounts[req.item] !== undefined) liveCounts[req.item] += req.quantity;
          if (appStatus === 'canceled' && liveCounts[req.item] !== undefined)  liveCounts[req.item] -= req.quantity;
        }
      }
    });

    Object.keys(liveCounts).forEach(k => { if (liveCounts[k] < 0) liveCounts[k] = 0; });

    // 📋 LIVE REQUEST LIST MATRIX COMPILER
    const rankingsByItem = { 'Puppet': [], 'Illu': [], 'Light&Dark': [], 'Time&Space': [] };
    
    Object.keys(rankingsByItem).forEach(targetItem => {
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
      rankingsByItem[targetItem] = activeApplicants.slice(0, 100).map(u => u.name);
    });

    return res.json({
      success: true,
      displayName: playerDisplayName,
      date: currentGMT8Date, // Delivers the correct localized calendar date string to header dashboard banners
      items: availableItems,
      liveCounts,
      isGateOpen: timeGateStatus.isGateOpen,
      currentSessionLabel: timeGateStatus.currentSessionLabel,
      nextStatusChangeMessage: timeGateStatus.nextStatusChangeMessage,
      currentPhase: timeGateStatus.currentPhase,
      phaseIntervals: timeGateStatus.phaseIntervals,
      rankingsByItem
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 📡 SUBMIT GATE REQUISITION PORTER
 * POST /api/requests/submit
 */
router.post('/submit', async (req, res) => {
  const timeGateStatus = getGateStatusDetails();
  if (!timeGateStatus.isGateOpen) {
    return res.status(423).json({ success: false, error: `Action Denied: Bidding registration is closed for this session. ${timeGateStatus.nextStatusChangeMessage}` });
  }

  const user = resolveUserIdentity(req);
  if (!user) return res.status(401).json({ success: false, error: 'Session identity missing' });

  const { selections } = req.body; 
  if (!selections || Object.keys(selections).length === 0) {
    return res.status(400).json({ success: false, error: 'No item selections detected.' });
  }

  try {
    const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
    const playerDisplayName = user.displayName || user.username;
    const playerLower = playerDisplayName.trim().toLowerCase();
    const currentGMT8Date = getGMT8DateString(); // Aligned to GMT+8

    const requestUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv&sheet=RequestHistory`;
    const response = await fetch(requestUrl);
    const spreadsheetRows = parseCSVToRawArrays(await response.text(), 'Member');

    const db = getDatabase();
    const snapshot = await db.ref('auction/web_requests').once('value');
    const firebaseRequests = snapshot.exists() ? Object.values(snapshot.val()) : [];

    const chosenItemNames = Object.keys(selections);
    
    for (const itemName of chosenItemNames) {
      const targetQty = parseInt(selections[itemName], 10) || 0;
      if (targetQty <= 0) continue; 

      const combinedItemTimeline = [];
      const itemLower = itemName.trim().toLowerCase();

      spreadsheetRows.forEach(row => {
        if ((row[1] || '').trim().toLowerCase() === playerLower && (row[2] || '').trim().toLowerCase() === itemLower) {
          combinedItemTimeline.push((row[5] || 'pending').trim().toLowerCase());
        }
      });

      firebaseRequests.forEach(req => {
        if ((req.member || '').trim().toLowerCase() === playerLower && (req.item || '').trim().toLowerCase() === itemLower) {
          combinedItemTimeline.push((req.selectionStatus || 'pending').trim().toLowerCase());
        }
      });

      let lastSelectedIdx = -1;
      for (let i = combinedItemTimeline.length - 1; i >= 0; i--) {
        if (combinedItemTimeline[i] === 'selected') {
          lastSelectedIdx = i;
          break;
        }
      }

      let dynamicPriority = 0;
      const searchStart = lastSelectedIdx !== -1 ? lastSelectedIdx + 1 : 0;
      for (let i = searchStart; i < combinedItemTimeline.length; i++) {
        if (combinedItemTimeline[i] === 'notselected') {
          dynamicPriority++;
        }
      }

      const newRequestRef = db.ref('auction/web_requests').push();
      await newRequestRef.set({
        id: newRequestRef.key,
        date: currentGMT8Date, // Database logs write true GMT+8 strings
        member: playerDisplayName,
        item: itemName,
        quantity: targetQty,
        applicationStatus: 'Requested', 
        selectionStatus: 'Pending',     
        priority: dynamicPriority
      });
    }

    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 📡 CANCEL GATE REQUISITION PORTER
 * POST /api/requests/cancel
 */
router.post('/cancel', async (req, res) => {
  const user = resolveUserIdentity(req);
  if (!user) return res.status(401).json({ success: false, error: 'Session identity missing' });

  const { itemName, cancelQty } = req.body;
  try {
    const playerDisplayName = user.displayName || user.username;
    const currentGMT8Date = getGMT8DateString(); // Aligned to GMT+8
    const db = getDatabase();
    
    const newCancelRef = db.ref('auction/web_requests').push();
    await newCancelRef.set({
      id: newCancelRef.key,
      date: currentGMT8Date, // Database cancellations write true GMT+8 strings
      member: playerDisplayName,
      item: itemName,
      quantity: parseInt(cancelQty, 10),
      applicationStatus: 'Canceled', 
      selectionStatus: 'Pending',    
      priority: 0
    });

    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

export default router;