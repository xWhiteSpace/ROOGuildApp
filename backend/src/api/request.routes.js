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

const ITEM_LIMIT_DEFAULTS = {
  'Puppet': 1,
  'Illu': 1,
  'Light&Dark': 3,
  'Time&Space': 5
};

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
 * ⚡ OPTIMIZED PRIORITY SCORE COMPUTATION ENGINE
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
    // 🌟 REQ CHECKPOINT: Both explicit 'selected' wins and 'absent' flags drop points back to 0
    if (combinedItemTimeline[i] === 'selected' || combinedItemTimeline[i] === 'absent') {
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

    const liveCounts = { 'Puppet': 0, 'Illu': 0, 'Light&Dark': 0, 'Time&Space': 0 };
    const rankingsByItem = { 'Puppet': [], 'Illu': [], 'Light&Dark': [], 'Time&Space': [] };
    const requestsByItemDetails = { 'Puppet': {}, 'Illu': {}, 'Light&Dark': {}, 'Time&Space': {} };

    const membersListSnap = await db.ref('auction/members').once('value');
    const fullRosterArray = [];
    if (membersListSnap.exists()) {
      Object.keys(membersListSnap.val()).forEach(key => {
        if (membersListSnap.val()[key]?.displayName) {
          fullRosterArray.push(membersListSnap.val()[key].displayName);
        }
      });
    }

    const allRequestsSnap = await db.ref('auction/web_requests').once('value');
    if (allRequestsSnap.exists()) {
      const rawRequests = allRequestsSnap.val();
      const allPendingRows = [];

      Object.values(rawRequests).forEach(req => {
        const reqMember = (req.member || '').trim();

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

        if (req.selectionStatus === 'Pending') {
          allPendingRows.push(req);
        }
      });

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
        
        rankingsByItem[targetItem] = activeApplicants.map(u => u.name);
        
        activeApplicants.forEach(u => {
          requestsByItemDetails[targetItem][u.name] = { quantity: u.netQty, priority: u.priority };
        });
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
      requestsByItemDetails,
      fullRoster: fullRosterArray.sort()
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 🔄 SECURE DISCORD-TO-FIREBASE ROSTER SYNC BRIDGE
 */
router.post('/sync-roster', async (req, res) => {
  const user = resolveUserIdentity(req);
  if (!user) return res.status(401).json({ success: false, error: 'Session identity missing' });

  const botToken = process.env.DISCORD_BOT_TOKEN;
  const guildId = process.env.DISCORD_GUILD_ID;

  if (!botToken || !guildId) {
    return res.status(500).json({ success: false, error: 'Missing Discord credentials inside backend configurations (.env).' });
  }

  try {
    const discordResponse = await fetch(`https://discord.com/api/v10/guilds/${guildId}/members?limit=1000`, {
      method: 'GET',
      headers: {
        'Authorization': `Bot ${botToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (!discordResponse.ok) {
      const errorText = await discordResponse.text();
      return res.status(discordResponse.status).json({ success: false, error: `Discord API communication rejected: ${errorText}` });
    }

    const discordMembers = await discordResponse.json();
    const db = getDatabase();
    const currentGMT8Date = getGMT8DateString();
    
    const rosterUpdates = {};

    discordMembers.forEach(member => {
      const finalRosterName = (member.nick || member.user?.global_name || member.user?.username || '').trim();
      
      if (finalRosterName && finalRosterName !== '???') {
        const sanitizedFirebaseKey = finalRosterName.replace(/[\.\#\$\[\]]/g, '_');
        rosterUpdates[`auction/members/${sanitizedFirebaseKey}`] = {
          displayName: finalRosterName,
          syncedAt: currentGMT8Date
        };
      }
    });

    if (Object.keys(rosterUpdates).length === 0) {
      return res.status(422).json({ success: false, error: 'No valid user profiles extracted.' });
    }

    await db.ref().update(rosterUpdates);
    return res.json({ success: true, count: Object.keys(rosterUpdates).length });
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
 * 🚀 COMMIT SESSION LEDGER ARCHIVER
 * POST /api/requests/commit-session
 */
router.post('/commit-session', async (req, res) => {
  const user = resolveUserIdentity(req);
  if (!user) return res.status(401).json({ success: false, error: 'Session identity missing' });

  const { event, date, allocations } = req.body;
  if (!allocations) {
    return res.status(400).json({ success: false, error: 'No allocation parameters detected.' });
  }

  try {
    const db = getDatabase();
    const snapshot = await db.ref('auction/web_requests').once('value');
    const firebaseRequests = snapshot.exists() ? snapshot.val() : {};

    const categories = Object.keys(allocations);
    const timestampDate = date || getGMT8DateString();
    
    for (const cat of categories) {
      const { selected = [], absent = [], notSelected = [] } = allocations[cat];
      const maxLimit = ITEM_LIMIT_DEFAULTS[cat] || 1;

      // 🌟 UPGRADED: Store dynamic array buckets per member to clean intermediate canceled lines
      const keysByMember = {};
      Object.keys(firebaseRequests).forEach(key => {
        const r = firebaseRequests[key];
        if ((r.item || '').trim().toLowerCase() === cat.toLowerCase() && (r.selectionStatus || 'pending').toLowerCase() === 'pending') {
          if (!keysByMember[r.member]) {
            keysByMember[r.member] = [];
          }
          keysByMember[r.member].push(key);
        }
      });

      // A. Update Attendance Failures (Absentees forfeit score timeline)
      for (const name of absent) {
        const keyList = keysByMember[name] || [];
        for (const key of keyList) {
          await db.ref(`auction/web_requests/${key}`).update({
            selectionStatus: 'Absent'
          });
        }
      }

      // B. Update Skipped Entrants (NotSelected priority increments)
      for (const name of notSelected) {
        const keyList = keysByMember[name] || [];
        for (const key of keyList) {
          await db.ref(`auction/web_requests/${key}`).update({
            selectionStatus: 'NotSelected'
          });
        }
      }

      // C. Process Winners & Clean Redundant Sub-Action Pending Lines
      for (const winner of selected) {
        const { name, slots } = winner;
        const keyList = keysByMember[name] || [];

        if (keyList.length > 0) {
          // Sort list to find the absolute latest active request line to stamp as the core winner anchor
          const primaryWinnerKey = keyList[keyList.length - 1];
          await db.ref(`auction/web_requests/${primaryWinnerKey}`).update({
            selectionStatus: 'Selected',
            quantity: slots 
          });

          // 🌟 SWEEPER: Clean intermediate requested/canceled lines to closed statuses so they don't leak into subsequent raids
          const intermediateRedundantLines = keyList.slice(0, keyList.length - 1);
          for (const duplicateKey of intermediateRedundantLines) {
            const currentLine = firebaseRequests[duplicateKey];
            const fallbackStatus = (currentLine?.applicationStatus === 'Canceled') ? 'Canceled' : 'NotSelected';
            await db.ref(`auction/web_requests/${duplicateKey}`).update({
              selectionStatus: fallbackStatus
            });
          }
        } else {
          // 👻 GHOST SYNTHESIS: Inject profile for manually chosen full roster characters with unified liveStatus
          const newRequestRef = db.ref('auction/web_requests').push();
          await newRequestRef.set({
            id: newRequestRef.key,
            date: timestampDate,
            member: name,
            item: cat,
            quantity: slots,
            applicationStatus: 'ForcedAdd',
            selectionStatus: 'Selected',
            liveStatus: 'Done',
            priority: 0
          });
        }

        // Output completed transaction to permanent loot ledger database folders
        const newHistoryRef = db.ref('auction/loot_history').push();
        await newHistoryRef.set({
          id: newHistoryRef.key,
          date: timestampDate,
          event: event || 'GuildLeague',
          item: cat,
          quantity: slots,
          max: maxLimit,
          mem: name
        });
      }
    }

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
      mem: rawData[key].mem || ""
    }));

    return res.json({ success: true, history: lootHistoryArray });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

export default router;