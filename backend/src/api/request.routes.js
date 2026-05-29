// backend/src/api/request.routes.js
import { Router } from 'express';
import { getDatabase } from 'firebase-admin/database';
import { getGateStatusDetails } from '../config/timeWindow.js'; // Preserved for phase management

const router = Router();

const AVAILABLE_ITEMS = [
  { name: 'Puppet', maxQty: 1 },
  { name: 'Illu', maxQty: 1 },
  { name: 'Light&Dark', maxQty: 3 },
  { name: 'Time&Space', maxQty: 5 }
];

/**
 * 🗺️ GMT+8 DATE GENERATOR HELPER
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
 * REQ013: Priority Score Computation Engine
 * Scans backward inside a user's Firebase history archive node until a 'selected' win is caught,
 * counting all subsequent 'notselected' appearances.
 */
async function calculatePriorityScore(db, playerLower, itemName) {
  const historySnap = await db.ref(`auction/history_archive/${playerLower}/${itemName}`).once('value');
  if (!historySnap.exists()) return 0;

  const records = historySnap.val(); // Expects chronological array or sequence object
  const sortedRecords = Array.isArray(records) ? [...records].reverse() : Object.values(records).reverse();

  let priorityPoints = 0;
  for (const record of sortedRecords) {
    const selStatus = (record.selectionStatus || 'pending').toLowerCase();
    if (selStatus === 'selected') {
      break; // Found the most recent selection win milestone; exit loop sequence
    }
    if (selStatus === 'notselected') {
      priorityPoints++; // Award +1 priority point for every missed sequence session
    }
  }
  return priorityPoints;
}

/**
 * REQ024 & REQ025: Centralized Leaderboard Compiler Engine
 * Calculates sorted lists once on the backend, updating the central read-only table node.
 */
async function rebuildLeaderboards(db) {
  const liveQueueSnap = await db.ref('auction/live_requests').once('value');
  const finalizedLeaderboards = { 'Puppet': [], 'Illu': [], 'Light&Dark': [], 'Time&Space': [] };

  if (liveQueueSnap.exists()) {
    const allRequests = liveQueueSnap.val();
    const temporaryBins = { 'Puppet': [], 'Illu': [], 'Light&Dark': [], 'Time&Space': [] };

    // Group items data models consecutively by category tabs
    Object.values(allRequests).forEach(entry => {
      const appStatus = (entry.applicationStatus || '').toLowerCase();
      if (appStatus === 'canceled') return;

      const itemKey = entry.item;
      if (temporaryBins[itemKey] !== undefined && entry.quantity > 0) {
        temporaryBins[itemKey].push({
          name: entry.member,
          priority: parseInt(entry.priority, 10) || 0
        });
      }
    });

    // Sort categories strictly by priority points descending and map string arrays
    Object.keys(temporaryBins).forEach(itemKey => {
      finalizedLeaderboards[itemKey] = temporaryBins[itemKey]
        .sort((a, b) => b.priority - a.priority)
        .slice(0, 100) // REQ025: Truncate output lists strictly to top 100 raiders
        .map(user => user.name);
    });
  }

  await db.ref('auction/leaderboards').set(finalizedLeaderboards);
}

/**
 * REQ092: INITIALIZATION PATHWAY
 * GET /api/requests/init
 */
router.get('/init', async (req, res) => {
  const user = resolveUserIdentity(req);
  if (!user) return res.status(401).json({ success: false, error: 'Session identity missing' });

  try {
    const db = getDatabase();
    const playerDisplayName = user.displayName || user.username;
    const playerLower = playerDisplayName.trim().toLowerCase();
    
    // REQ012: Check dynamic gate overrides directly from Firebase settings root folder node
    const gateSnap = await db.ref('settings/registrationGate').once('value');
    const dynamicGate = gateSnap.exists() ? gateSnap.val() : null;

    const timeGateStatus = getGateStatusDetails();
    const currentGMT8Date = getGMT8DateString();

    // Fetch user basket values and pre-compiled unified leaderboards concurrently
    const [liveRequestsSnap, leaderboardSnap] = await Promise.all([
      db.ref('auction/live_requests').once('value'),
      db.ref('auction/leaderboards').once('value')
    ]);

    const liveCounts = { 'Puppet': 0, 'Illu': 0, 'Light&Dark': 0, 'Time&Space': 0 };
    if (liveRequestsSnap.exists()) {
      Object.values(liveRequestsSnap.val()).forEach(req => {
        if ((req.member || '').trim().toLowerCase() === playerLower) {
          const appStatus = (req.applicationStatus || '').toLowerCase();
          if (appStatus === 'requested') liveCounts[req.item] += req.quantity;
        }
      });
    }

    const rankingsByItem = leaderboardSnap.exists() 
      ? leaderboardSnap.val() 
      : { 'Puppet': [], 'Illu': [], 'Light&Dark': [], 'Time&Space': [] };

    // Delivers perfect matching parameters directly expected by RequestTab.jsx destructuring assignments
    return res.json({
      success: true,
      displayName: playerDisplayName,
      date: currentGMT8Date,
      items: AVAILABLE_ITEMS,
      liveCounts,
      isGateOpen: dynamicGate ? (dynamicGate.status === 'open') : timeGateStatus.isGateOpen,
      currentSessionLabel: timeGateStatus.currentSessionLabel,
      nextStatusChangeMessage: dynamicGate?.message || timeGateStatus.nextStatusChangeMessage,
      currentPhase: timeGateStatus.currentPhase,
      phaseIntervals: timeGateStatus.phaseIntervals,
      rankingsByItem
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * REQ093: SUBMIT GATE REQUISITION PORTER
 * POST /api/requests/submit
 */
router.post('/submit', async (req, res) => {
  const db = getDatabase();
  
  // REQ012: Enforce server-side clock evaluation against Firebase overrides to bypass client UTC drift issues
  const gateSnap = await db.ref('settings/registrationGate').once('value');
  const dynamicGate = gateSnap.exists() ? gateSnap.val() : null;
  const systemGateOpen = dynamicGate ? (dynamicGate.status === 'open') : getGateStatusDetails().isGateOpen;

  if (!systemGateOpen) {
    return res.status(423).json({ success: false, error: 'Action Denied: Bidding registration is closed for this session.' });
  }

  const user = resolveUserIdentity(req);
  if (!user) return res.status(401).json({ success: false, error: 'Session identity missing' });

  const { selections } = req.body; 
  if (!selections || Object.keys(selections).length === 0) {
    return res.status(400).json({ success: false, error: 'No item selections detected.' });
  }

  try {
    const playerDisplayName = user.displayName || user.username;
    const playerLower = playerDisplayName.trim().toLowerCase();
    const currentGMT8Date = getGMT8DateString();

    const chosenItemNames = Object.keys(selections);
    for (const itemName of chosenItemNames) {
      const targetQty = parseInt(selections[itemName], 10) || 0;
      if (targetQty <= 0) continue; 

      // REQ013: Run mathematical point metrics calculation against historical node folders
      const dynamicPriority = await calculatePriorityScore(db, playerLower, itemName);

      // REQ014: Commit entry cleanly as a permanent data configuration item block row
      const userItemTrackingKey = `${playerLower}_${itemName.replace(/[^a-zA-Z0-9]/g, '')}`;
      await db.ref(`auction/live_requests/${userItemTrackingKey}`).set({
        id: userItemTrackingKey,
        date: currentGMT8Date,
        member: playerDisplayName,
        item: itemName,
        quantity: targetQty,
        applicationStatus: 'Requested', 
        selectionStatus: 'Pending',     
        priority: dynamicPriority
      });
    }

    // Force re-indexing of central rank tables immediately after committing updates
    await rebuildLeaderboards(db);
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * REQ094 & REQ015: INSTANT UNLOCKED CANCELLATION OVERRIDE ROUTE
 * POST /api/requests/cancel
 */
router.post('/cancel', async (req, res) => {
  const user = resolveUserIdentity(req);
  if (!user) return res.status(401).json({ success: false, error: 'Session identity missing' });

  const { itemName } = req.body;
  try {
    const db = getDatabase();
    const playerDisplayName = user.displayName || user.username;
    const playerLower = playerDisplayName.trim().toLowerCase();
    const currentGMT8Date = getGMT8DateString();
    
    const userItemTrackingKey = `${playerLower}_${itemName.replace(/[^a-zA-Z0-9]/g, '')}`;
    
    // REQ015: Instantly push cancellation state data structures with absolute 0 priority weights
    await db.ref(`auction/live_requests/${userItemTrackingKey}`).set({
      id: userItemTrackingKey,
      date: currentGMT8Date,
      member: playerDisplayName,
      item: itemName,
      quantity: 0,
      applicationStatus: 'Canceled', 
      selectionStatus: 'Pending',    
      priority: 0
    });

    await rebuildLeaderboards(db);
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

export default router;