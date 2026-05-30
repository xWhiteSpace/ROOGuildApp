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
 */
async function calculatePriorityScore(db, playerDisplayName, itemName) {
  const playerHistorySnap = await db.ref('auction/web_requests')
    .orderByChild('member')
    .equalTo(playerDisplayName)
    .once('value');

  if (!playerHistorySnap.exists()) return 0;

  const records = playerHistorySnap.val();
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

    // Pull all requests to dynamically harvest unique roster names
    const allRequestsSnap = await db.ref('auction/web_requests').once('value');
    const uniqueMembersSet = new Set();
    
    const liveCounts = { 'Puppet': 0, 'Illu': 0, 'Light&Dark': 0, 'Time&Space': 0 };
    const rankingsByItem = { 'Puppet': [], 'Illu': [], 'Light&Dark': [], 'Time&Space': [] };

    if (allRequestsSnap.exists()) {
      const rawRequests = allRequestsSnap.val();
      const allPendingRows = [];

      Object.values(rawRequests).forEach(req => {
        const reqMember = (req.member || '').trim();
        if (reqMember && reqMember !== '???') {
          uniqueMembersSet.add(reqMember);
        }

        // Calculate personal live counts if this row belongs to the current logged-in agent
        if (reqMember.toLowerCase() === playerDisplayName.toLowerCase()) {
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
        }

        // Collect rows marked 'Pending' for live leaderboard compilation
        if (req.selectionStatus === 'Pending') {
          allPendingRows.push(req);
        }
      });

      // Build out live item queue priority lists
      Object.keys(rankingsByItem).forEach(targetItem => {
        const userCalculationsMap = {};

        allPendingRows.forEach(req => {
          const player = (req.member || '').trim();
          const itemType = (req.item || '').trim();
          const qty = parseInt(req.quantity, 10) || 0;
          const appStatus = (req.applicationStatus || 'requested').toLowerCase();
          const priorityScore = parseInt(req.priority, 10) || 0;

          if (itemType !== targetItem) return;

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

    Object.keys(liveCounts).forEach(k => { if (liveCounts[k] < 0) liveCounts[k] = 0; });

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
      rankingsByItem,
      fullRoster: Array.from(uniqueMembersSet).sort() // 🌟 NEW: Alphabetical master array of all guild characters
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 📥 SUBMIT GATE REQUISITION PORTER
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
        liveStatus: '',                 
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
 */
router.post('/cancel', async (req, res) => {
  const user = resolveUserIdentity(req);
  if (!user) return res.status(401).json({ success: false, error: 'Session identity missing' });

  const { itemName, cancelQty } = req.body;
  try {
    const playerDisplayName = user.displayName || user.username;
    const currentGMT8Date = getGMT8DateString();
    const db = getDatabase();
    
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
      liveStatus: '',                 
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
      liveStatus: rawData[key].liveStatus || "", 
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

/**
 * 🚀 PRODUCTION COMMIT TRANSACTION RUNNER
 */
router.post('/commit-session', async (req, res) => {
  const user = resolveUserIdentity(req);
  if (!user) return res.status(401).json({ success: false, error: 'Session identity missing' });

  const { event, date, allocations, summary } = req.body;
  if (!event || !date || !allocations || !summary) {
    return res.status(400).json({ success: false, error: 'Incomplete session configuration data payload.' });
  }

  try {
    const db = getDatabase();
    const updates = {};

    Object.keys(summary).forEach(itemKey => {
      const entry = summary[itemKey];
      if (entry.qty > 0) {
        const newHistoryRef = db.ref('auction/loot_history').push();
        updates[`auction/loot_history/${newHistoryRef.key}`] = {
          date: date,
          event: event,
          item: itemKey,
          quantity: parseInt(entry.qty, 10),
          max: parseInt(entry.limit, 10),
          mem: parseInt(entry.seats, 10)
        };
      }
    });

    const requestsSnap = await db.ref('auction/web_requests').once('value');
    if (requestsSnap.exists()) {
      const allRequests = requestsSnap.val();
      
      Object.keys(allRequests).forEach(reqKey => {
        const record = allRequests[reqKey];
        const recordItem = record.item;
        const recordMember = record.member;
        
        if (record.selectionStatus === 'Pending' && allocations[recordItem]) {
          const winnersList = allocations[recordItem].selected || [];
          const standbyList = allocations[recordItem].notSelected || [];

          if (winnersList.includes(recordMember)) {
            updates[`auction/web_requests/${reqKey}/selectionStatus`] = 'Selected';
            updates[`auction/web_requests/${reqKey}/liveStatus`] = 'Done';
          } else if (standbyList.includes(recordMember)) {
            updates[`auction/web_requests/${reqKey}/selectionStatus`] = 'NotSelected';
            updates[`auction/web_requests/${reqKey}/liveStatus`] = 'Done';
          }
        }
      });
    }

    updates['auction/active_session'] = null;

    await db.ref().update(updates);
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

export default router;