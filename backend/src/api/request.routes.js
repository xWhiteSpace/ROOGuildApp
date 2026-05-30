// backend/src/api/request.routes.js
import { Router } from 'express';
import { getDatabase } from 'firebase-admin/database';
import { getGateStatusDetails } from '../config/timeWindow.js';

const router = Router();

const AVAILABLE_ITEMS = [
  { name: 'Puppet', maxQty: 1 },
  { name: 'Illu', maxQty: 1 },
  { name: 'Light&Dark', maxQty: 3 },
  { name: 'Time&Space', maxQty: 5 }
];

/**
 * 📅 GMT+8 DATE GENERATOR HELPER
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
 * ⚡ OPTIMIZED PRIORITY SCORE COMPUTATION ENGINE (REQ013)
 * Uses the player name index rule to query ONLY this specific user's historical milestones.
 */
async function calculatePriorityScore(db, playerDisplayName, itemName) {
  const playerHistorySnap = await db.ref('auction/web_requests')
    .orderByChild('member')
    .equalTo(playerDisplayName)
    .once('value');

  if (!playerHistorySnap.exists()) return 0;

  const records = playerHistorySnap.val();
  
  // Firebase push IDs are naturally chronological. Sorting the tracking keys matches the timeline perfectly.
  const sortedKeys = Object.keys(records).sort();
  const combinedItemTimeline = [];

  sortedKeys.forEach(key => {
    const record = records[key];
    if ((record.item || '').trim() === itemName.trim()) {
      combinedItemTimeline.push((record.selectionStatus || 'pending').toLowerCase());
    }
  });

  let lastSelectedIdx = -1;
  for (let i = combinedItemTimeline.length - 1; i >= 0; i--) {
    if (combinedItemTimeline[i] === 'selected') {
      lastSelectedIdx = i;
      break;
    }
  }

  let priorityPoints = 0;
  const searchStart = lastSelectedIdx !== -1 ? lastSelectedIdx + 1 : 0;
  for (let i = searchStart; i < combinedItemTimeline.length; i++) {
    if (combinedItemTimeline[i] === 'notselected') {
      priorityPoints++;
    }
  }

  return priorityPoints;
}

/**
 * 🚀 INITIALIZATION PATHWAY
 * GET /api/requests/init
 */
router.get('/init', async (req, res) => {
  const user = resolveUserIdentity(req);
  if (!user) return res.status(401).json({ success: false, error: 'Session identity missing' });

  try {
    const playerDisplayName = user.displayName || user.username;
    const timeGateStatus = getGateStatusDetails();
    const currentGMT8Date = getGMT8DateString();
    const db = getDatabase();

    // REQ009 & REQ010: Query ONLY this player's data footprint to calculate live limits
    const playerRequestsSnap = await db.ref('auction/web_requests')
      .orderByChild('member')
      .equalTo(playerDisplayName)
      .once('value');

    const liveCounts = { 'Puppet': 0, 'Illu': 0, 'Light&Dark': 0, 'Time&Space': 0 };
    if (playerRequestsSnap.exists()) {
      Object.values(playerRequestsSnap.val()).forEach(req => {
        const itemType = req.item;
        const appStatus = (req.applicationStatus || '').trim().toLowerCase();
        const selStatus = (req.selectionStatus || 'pending').trim().toLowerCase();
        const liveStatus = (req.liveStatus || '').trim().toLowerCase();
        const itemQty = parseInt(req.quantity, 10) || 0;

        const isAwaitingEvaluation = (selStatus === 'pending');
        const isLiveInCurrentSession = (selStatus === 'selected' && ['now', 'next', 'standby'].includes(liveStatus));

        if (isAwaitingEvaluation || isLiveInCurrentSession) {
          if (appStatus === 'requested' && liveCounts[itemType] !== undefined) liveCounts[itemType] += itemQty;
          if (appStatus === 'canceled' && liveCounts[itemType] !== undefined)  liveCounts[itemType] -= itemQty;
        }
      });
    }
    // Safety boundary clamping
    Object.keys(liveCounts).forEach(k => { if (liveCounts[k] < 0) liveCounts[k] = 0; });

    // 📊 OPTIMIZED LEADERBOARD COMPILER (REQ024 & REQ025)
    // Queries ONLY rows marked 'Pending' across the entire guild, completely ignoring old history records.
    const pendingRequestsSnap = await db.ref('auction/web_requests')
      .orderByChild('selectionStatus')
      .equalTo('Pending')
      .once('value');

    const rankingsByItem = { 'Puppet': [], 'Illu': [], 'Light&Dark': [], 'Time&Space': [] };
    
    if (pendingRequestsSnap.exists()) {
      const allPendingRows = Object.values(pendingRequestsSnap.val());

      Object.keys(rankingsByItem).forEach(targetItem => {
        const userCalculationsMap = {};

        allPendingRows.forEach(req => {
          const player = (req.member || '').trim();
          const itemType = (req.item || '').trim();
          const qty = parseInt(req.quantity, 10) || 0;
          const appStatus = (req.applicationStatus || 'requested').toLowerCase();
          const priorityScore = parseInt(req.priority, 10) || 0;

          if (!player || player === '???' || itemType !== targetItem) return;

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
    }

    return res.json({
      success: true,
      displayName: playerDisplayName,
      date: currentGMT8Date, 
      items: AVAILABLE_ITEMS,
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
 * 📥 SUBMIT GATE REQUISITION PORTER
 * POST /api/requests/submit
 */
router.post('/submit', async (req, res) => {
  const timeGateStatus = getGateStatusDetails();
  if (!timeGateStatus.isGateOpen) {
    return res.status(423).json({ success: false, error: `Bidding registration is closed. ${timeGateStatus.nextStatusChangeMessage}` });
  }

  const user = resolveUserIdentity(req);
  if (!user) return res.status(401).json({ success: false, error: 'Session identity missing' });

  const { selections } = req.body; 
  if (!selections || Object.keys(selections).length === 0) {
    return res.status(400).json({ success: false, error: 'No item selections detected.' });
  }

  try {
    const playerDisplayName = user.displayName || user.username;
    const currentGMT8Date = getGMT8DateString();
    const db = getDatabase();

    // 🔒 CHOSEN ACTION: Read the officer session configuration. If empty, leave it as "" (blank)
    const activeSessionSnap = await db.ref('settings/activeSessionDate').once('value');
    const targetedEventDate = activeSessionSnap.exists() ? activeSessionSnap.val() : "";

    const chosenItemNames = Object.keys(selections);
    for (const itemName of chosenItemNames) {
      const targetQty = parseInt(selections[itemName], 10) || 0;
      if (targetQty <= 0) continue; 

      const dynamicPriority = await calculatePriorityScore(db, playerDisplayName, itemName);

      const newRequestRef = db.ref('auction/web_requests').push();
      await newRequestRef.set({
        id: newRequestRef.key,
        date: currentGMT8Date,          
        member: playerDisplayName,
        item: itemName,
        quantity: targetQty,
        applicationStatus: 'Requested', 
        selectionStatus: 'Pending',     
        priority: dynamicPriority,
        eventDate: targetedEventDate    
      });
    }

    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 🛑 CANCEL GATE REQUISITION PORTER
 * POST /api/requests/cancel
 */
router.post('/cancel', async (req, res) => {
  const user = resolveUserIdentity(req);
  if (!user) return res.status(401).json({ success: false, error: 'Session identity missing' });

  const { itemName, cancelQty } = req.body;
  try {
    const playerDisplayName = user.displayName || user.username;
    const currentGMT8Date = getGMT8DateString();
    const db = getDatabase();
    
    // Read the officer session configuration. If empty, leave it as "" (blank)
    const activeSessionSnap = await db.ref('settings/activeSessionDate').once('value');
    const targetedEventDate = activeSessionSnap.exists() ? activeSessionSnap.val() : "";

    const newCancelRef = db.ref('auction/web_requests').push();
    await newCancelRef.set({
      id: newCancelRef.key,
      date: currentGMT8Date, 
      member: playerDisplayName,
      item: itemName,
      quantity: parseInt(cancelQty, 10),
      applicationStatus: 'Canceled', 
      selectionStatus: 'Pending',    
      priority: 0,
      eventDate: targetedEventDate 
    });

    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 📊 GLOBAL REQUEST HISTORY LOGS PIPELINE
 * GET /api/requests/history
 */
router.get('/history', async (req, res) => {
  const user = resolveUserIdentity(req);
  if (!user) return res.status(401).json({ success: false, error: 'Session identity missing' });

  try {
    const db = getDatabase();
    const historySnap = await db.ref('auction/web_requests').once('value');
    
    if (!historySnap.exists()) {
      return res.json({ success: true, history: [] });
    }

    const rawData = historySnap.val();
    const sortedKeys = Object.keys(rawData).sort();
    
    const historyArray = sortedKeys.map(key => ({
      id: rawData[key].id || key,
      date: rawData[key].date || "",
      member: rawData[key].member || "",
      item: rawData[key].item || "",
      quantity: parseInt(rawData[key].quantity, 10) || 0,
      applicationStatus: rawData[key].applicationStatus || "Requested",
      selectionStatus: rawData[key].selectionStatus || "Pending",
      liveStatus: rawData[key].liveStatus || "Done",
      priority: parseInt(rawData[key].priority, 10) || 0,
      eventDate: rawData[key].eventDate || ""
    }));

    return res.json({ success: true, history: historyArray });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 📦 PERMANENT LOOT HISTORY ARCHIVE LEDGER ENDPOINT
 * GET /api/requests/loot-history
 */
router.get('/loot-history', async (req, res) => {
  const user = resolveUserIdentity(req);
  if (!user) return res.status(401).json({ success: false, error: 'Session identity missing' });

  try {
    const db = getDatabase();
    const lootHistorySnap = await db.ref('auction/loot_history').once('value');
    
    if (!lootHistorySnap.exists()) {
      return res.json({ success: true, history: [] });
    }

    const rawData = lootHistorySnap.val();
    const sortedKeys = Object.keys(rawData).sort();
    
    const lootHistoryArray = sortedKeys.map(key => ({
      id: key,
      date: rawData[key].date || "",
      event: rawData[key].event || "",
      item: rawData[key].item || "",
      quantity: parseInt(rawData[key].quantity, 10) || 0,
      max: parseInt(rawData[key].max, 10) || 1,
      mem: parseInt(rawData[key].mem, 10) || 0
    }));

    return res.json({ success: true, history: lootHistoryArray });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

export default router;