// backend/src/api/request.routes.js
import { Router } from 'express';
import { getDatabase } from 'firebase-admin/database';
import { getGateStatusDetails } from '../config/timeWindow.js';

const router = Router();

// 💡 SEED MATRIX BOUNDARIES (Only utilized to safely configure blank database tracks automatically)
const DEFAULT_SESSION_STRUCTURE = {
  activeStep: 1,
  lootRows: [
    { id: 1, itemType: 'item_001', startPage: 1, startPos: 1, endPage: 1, endPos: 4, limit: 1 }
  ],
  lootSummary: {},
  categoryAllocations: {},
  initialWinnersByItem: {},
  generatedSlots: [],
  activeMatrixFilter: 'item_001',
  sidebarTab: 'standby'
};

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
 * 🛡️ DYNAMIC ROLE INTERSECTOR
 * Compares the active Discord user profile arrays directly against authorized configurations
 */
function verifyDiscordOfficerRole(user, allowedRoles = []) {
  if (!user) return false;
  if (user.roles && Array.isArray(user.roles)) {
    return user.roles.some(roleName => allowedRoles.includes(roleName));
  }
  return user.isOfficer === true;
}

/**
 * ⚡ RELATIONAL PRIORITY SCORE ENGINE
 * Tracks historical targets strictly using unchanging relational sequence identifiers (item_001)
 */
async function calculatePriorityScore(db, playerDisplayName, itemId, itemNameFallback) {
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
    const recordItemId = record.itemId;
    
let isMatch = false;
    if (recordItemId) {
      if (recordItemId.trim().toLowerCase() === itemId.trim().toLowerCase()) isMatch = true;
    } else if (record.item && itemNameFallback) {
      if (record.item.trim().toLowerCase() === itemNameFallback.trim().toLowerCase()) isMatch = true;
    }

    if (isMatch) {
      combinedItemTimeline.push((record.selectionStatus || 'pending').toLowerCase());
    }
  });

  let lastSelectedIdx = -1;
  for (let i = combinedItemTimeline.length - 1; i >= 0; i--) {
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
 * POST /api/requests/settings/unlock
 * Verifies master password against server-side variables
 */
router.post('/settings/unlock', (req, res) => {
  const { masterKey } = req.body;
  const trueSecret = process.env.SETTINGS_MASTER_KEY;

  if (!trueSecret) {
    return res.status(500).json({ success: false, error: 'Server config mismatch: SETTINGS_MASTER_KEY is unconfigured.' });
  }

  if (masterKey === trueSecret) {
    if (req.session) {
      req.session.settingsUnlocked = true;
    }
    return res.json({ success: true, message: 'Authorization verified. Configuration channels unlocked.' });
  }

  return res.status(401).json({ success: false, error: 'Invalid configuration master verification key.' });
});

/**
 * GET /api/requests/settings/get
 * Extracts system options matrix directly out of Firebase paths
 */
router.get('/settings/get', async (req, res) => {
  try {
    const db = getDatabase();
    const configSnap = await db.ref('settings/configuration').once('value');
    
    if (!configSnap.exists()) {
      const defaultData = {
        timezone: "Asia/Manila",
        isForceLocked: false,
        adminRoles: ["GUILD LEADER", "Vice Guild Leader", "Commander"],
        items: [
          { id: "item_001", name: "Puppet Scroll", limitQty: 1, colorTheme: "purple" },
          { id: "item_002", name: "Illusion Scroll", limitQty: 1, colorTheme: "yellow" },
          { id: "item_003", name: "Light & Dark Scroll", limitQty: 3, colorTheme: "slate" },
          { id: "item_004", name: "Time & Space Scroll", limitQty: 5, colorTheme: "red" }
        ],
        announcements: {
          phase1: ["07:00", "12:00", "19:00"],
          phase2: "22:15",
          phase3: "20:55"
        },
        events: {
          "ev_001": {
            title: "GuildLeague",
            phases: {
              1: { dayStart: 0, timeStart: "22:15", dayEnd: 1, timeEnd: "22:15" }, 
              2: { dayStart: 1, timeStart: "22:15", dayEnd: 2, timeEnd: "20:55" }, 
              3: { dayStart: 2, timeStart: "20:55", dayEnd: 2, timeEnd: "22:15" }  
            }
          }
        }
      };
      await db.ref('settings/configuration').set(defaultData);
      return res.json({ success: true, config: defaultData });
    }

    return res.json({ success: true, config: configSnap.val() });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/requests/settings/save
 * Commits panel adjustments down into cloud storage nodes
 */
router.post('/settings/save', async (req, res) => {
  if (!req.session?.settingsUnlocked) {
    return res.status(403).json({ success: false, error: 'Operation rejected: Configuration desk input gates are key locked.' });
  }

  try {
    const { config } = req.body;
    if (!config) return res.status(400).json({ success: false, error: 'Omitted payload configuration parameter maps.' });

    const db = getDatabase();
    await db.ref('settings/configuration').set(config);
    return res.json({ success: true, message: 'Global parameter fields synchronized successfully.' });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/requests/active-session
 */
router.get('/active-session', async (req, res) => {
  const user = resolveUserIdentity(req);
  if (!user) return res.status(401).json({ success: false, error: 'Session identity missing' });

  try {
    const db = getDatabase();
    const configSnap = await db.ref('settings/configuration').once('value');
    const dynamicConfig = configSnap.exists() ? configSnap.val() : { items: [] };
    const itemsList = dynamicConfig.items || [];
    
    const sessionSnap = await db.ref('auction/active_session').once('value');

    if (!sessionSnap.exists()) {
      const freshReset = { ...DEFAULT_SESSION_STRUCTURE, lastUpdated: Date.now() };
      itemsList.forEach(item => {
        freshReset.lootSummary[item.id] = { qty: 0, limit: item.limitQty, seats: 0 };
        freshReset.categoryAllocations[item.id] = { selected: [] };
        freshReset.initialWinnersByItem[item.id] = [];
      });
      
      await db.ref('auction/active_session').set(freshReset);
      return res.json({ success: true, session: freshReset });
    }

    const currentSessionData = sessionSnap.val();
    const timeDeltaMilliseconds = Date.now() - (currentSessionData.lastUpdated || 0);
    const maximumAllowedAgeInMs = 24 * 60 * 60 * 1000; 

    if (timeDeltaMilliseconds > maximumAllowedAgeInMs) {
      const freshReset = { ...DEFAULT_SESSION_STRUCTURE, lastUpdated: Date.now() };
      itemsList.forEach(item => {
        freshReset.lootSummary[item.id] = { qty: 0, limit: item.limitQty, seats: 0 };
        freshReset.categoryAllocations[item.id] = { selected: [] };
        freshReset.initialWinnersByItem[item.id] = [];
      });
      await db.ref('auction/active_session').set(freshReset);
      return res.json({ success: true, session: freshReset });
    }

    if (currentSessionData.categoryAllocations) {
      itemsList.forEach(item => {
        if (!currentSessionData.categoryAllocations[item.id]) {
          currentSessionData.categoryAllocations[item.id] = { selected: [] };
        }
        if (!currentSessionData.lootSummary[item.id]) {
          currentSessionData.lootSummary[item.id] = { qty: 0, limit: item.limitQty, seats: 0 };
        }
      });
    }

    return res.json({ success: true, session: currentSessionData });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/requests/update-session
 */
router.post('/update-session', async (req, res) => {
  const user = resolveUserIdentity(req);
  if (!user) return res.status(401).json({ success: false, error: 'Session identity missing' });

  try {
    const db = getDatabase();
    const configSnap = await db.ref('settings/configuration').once('value');
    const allowedRoles = configSnap.exists() ? (configSnap.val().adminRoles || []) : ["GUILD LEADER", "Vice Guild Leader", "Commander"];

    if (!verifyDiscordOfficerRole(user, allowedRoles)) {
      return res.status(403).json({ success: false, error: 'Access Denied: Action restricted to authorized Discord Management Officers only.' });
    }

    const incomingWorkspacePayload = req.body.session;
    if (!incomingWorkspacePayload) {
      return res.status(400).json({ success: false, error: 'Payload configuration parameters missing.' });
    }

    incomingWorkspacePayload.lastUpdated = Date.now();
    await db.ref('auction/active_session').set(incomingWorkspacePayload);
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/requests/init
 */
router.get('/init', async (req, res) => {
  const user = resolveUserIdentity(req);
  if (!user) return res.status(401).json({ success: false, error: 'Session identity missing' });

  try {
    const playerDisplayName = user.displayName || user.username;
    const playerLower = playerDisplayName.trim().toLowerCase();
    
    const db = getDatabase();
    const configSnap = await db.ref('settings/configuration').once('value');
    const dynamicConfig = configSnap.exists() ? configSnap.val() : {};
    const itemsList = dynamicConfig.items || [];
    const timezone = dynamicConfig.timezone || "Asia/Manila";
    const targetSessionDate = dynamicConfig.targetSessionDate || new Date().toLocaleDateString("en-US", { timeZone: timezone });
    
    const timeGateStatus = getGateStatusDetails();
    const snapshot = await db.ref('auction/web_requests').once('value');
    const firebaseRequests = snapshot.exists() ? Object.values(snapshot.val()) : [];

    const liveCounts = {};
    const rankingsByItem = {};
    const requestsByItemDetails = {};

    itemsList.forEach(item => { 
      liveCounts[item.id] = 0; 
      rankingsByItem[item.id] = [];
      requestsByItemDetails[item.id] = {};
    });

    firebaseRequests.forEach(req => {
      if ((req.member || '').trim().toLowerCase() === playerLower) {
        const selStatus = (req.selectionStatus || 'pending').toLowerCase();
        const appStatus = (req.applicationStatus || '').toLowerCase();
        
        let targetItemId = req.itemId;
        if (!targetItemId && req.item) {
          const found = itemsList.find(i => i.name === req.item);
          if (found) targetItemId = found.id;
        }

        if (selStatus === 'pending' && targetItemId && liveCounts[targetItemId] !== undefined) {
          if (appStatus === 'requested') liveCounts[targetItemId] += req.quantity;
          if (appStatus === 'canceled')  liveCounts[targetItemId] -= req.quantity;
        }
      }
    });

    Object.keys(liveCounts).forEach(k => { if (liveCounts[k] < 0) liveCounts[k] = 0; });

    const membersListSnap = await db.ref('auction/members').once('value');
    const fullRosterArray = [];
    if (membersListSnap.exists()) {
      Object.values(membersListSnap.val()).forEach(m => {
        if (m?.displayName) fullRosterArray.push(m.displayName);
      });
    }

    const userCalculationsMap = {};
    itemsList.forEach(item => { userCalculationsMap[item.id] = {}; });

    firebaseRequests.forEach(req => {
      if (req.selectionStatus !== 'Pending') return;
      
      const player = (req.member || '').trim();
      const qty = parseInt(req.quantity, 10) || 0;
      const appStatus = (req.applicationStatus || 'requested').toLowerCase();
      const priorityScore = parseInt(req.priority, 10) || 0;

      let reqItemId = req.itemId;
      if (!reqItemId && req.item) {
        const found = itemsList.find(i => i.name === req.item);
        if (found) reqItemId = found.id;
      }

      if (!reqItemId || userCalculationsMap[reqItemId] === undefined) return;

      if (!userCalculationsMap[reqItemId][player]) {
        userCalculationsMap[reqItemId][player] = { name: player, netQty: 0, priority: priorityScore };
      }

      if (appStatus === 'requested') userCalculationsMap[reqItemId][player].netQty += qty;
      if (appStatus === 'canceled')  userCalculationsMap[reqItemId][player].netQty -= qty;
    });

    itemsList.forEach(item => {
      const activeApplicants = Object.values(userCalculationsMap[item.id]).filter(u => u.netQty > 0);
      activeApplicants.sort((a, b) => b.priority - a.priority);
      
      rankingsByItem[item.id] = activeApplicants.slice(0, 100).map(u => u.name);
      activeApplicants.forEach(u => {
        requestsByItemDetails[item.id][u.name] = { quantity: u.netQty, priority: u.priority };
      });
    });

    return res.json({
      success: true,
      displayName: playerDisplayName,
      date: targetSessionDate, 
      items: itemsList,
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
 * POST /api/requests/sync-roster
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
    
    const configSnap = await db.ref('settings/configuration').once('value');
    const timezone = configSnap.exists() ? (configSnap.val().timezone || "Asia/Manila") : "Asia/Manila";
    const currentTimestampDate = new Date().toLocaleDateString("en-US", { timeZone: timezone });
    
    const rosterUpdates = {};

    discordMembers.forEach(member => {
      const finalRosterName = (member.nick || member.user?.global_name || member.user?.username || '').trim();
      
      if (finalRosterName && finalRosterName !== '???') {
        const sanitizedFirebaseKey = finalRosterName.replace(/[\.\#\$\[\]]/g, '_');
        rosterUpdates[`auction/members/${sanitizedFirebaseKey}`] = {
          displayName: finalRosterName,
          syncedAt: currentTimestampDate
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
    const db = getDatabase();

    const configSnap = await db.ref('settings/configuration').once('value');
    const dynamicConfig = configSnap.exists() ? configSnap.val() : {};
    const itemsList = dynamicConfig.items || [];
    const timezone = dynamicConfig.timezone || "Asia/Manila";
    const targetSessionDate = dynamicConfig.targetSessionDate || "";

    const chosenItemIds = Object.keys(selections);
    for (const itemId of chosenItemIds) {
      const targetQty = parseInt(selections[itemId], 10) || 0;
      if (targetQty <= 0) continue; 

      const resolvedItemObj = itemsList.find(i => i.id === itemId) || { name: itemId };
      const dynamicPriority = await calculatePriorityScore(db, playerDisplayName, itemId, resolvedItemObj.name);

      const newRequestRef = db.ref('auction/web_requests').push();
      await newRequestRef.set({
        id: newRequestRef.key,
        date: new Date().toLocaleDateString("en-US", { timeZone: timezone }),          
        member: playerDisplayName,
        item: resolvedItemObj.name, 
        itemId: itemId,             
        quantity: targetQty,
        applicationStatus: 'Requested', 
        selectionStatus: 'Pending',     
        liveStatus: '',                 
        priority: dynamicPriority,
        eventDate: targetSessionDate    
      });
    }

    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/requests/cancel
 */
router.post('/cancel', async (req, res) => {
  const user = resolveUserIdentity(req);
  if (!user) return res.status(401).json({ success: false, error: 'Session identity missing' });

  const { itemId, itemName, cancelQty } = req.body;
  try {
    const playerDisplayName = user.displayName || user.username;
    const db = getDatabase();
    
    const configSnap = await db.ref('settings/configuration').once('value');
    const dynamicConfig = configSnap.exists() ? configSnap.val() : {};
    const timezone = dynamicConfig.timezone || "Asia/Manila";
    const targetSessionDate = dynamicConfig.targetSessionDate || "";

    const newCancelRef = db.ref('auction/web_requests').push();
    await newCancelRef.set({
      id: newCancelRef.key,
      date: new Date().toLocaleDateString("en-US", { timeZone: timezone }), 
      member: playerDisplayName,
      item: itemName || itemId,
      itemId: itemId || "item_unknown",
      quantity: parseInt(cancelQty, 10),
      applicationStatus: 'Canceled', 
      selectionStatus: 'Pending',    
      liveStatus: '',                 
      priority: 0,
      eventDate: targetSessionDate 
    });

    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/requests/commit-session
 */
router.post('/commit-session', async (req, res) => {
  const user = resolveUserIdentity(req);
  if (!user) return res.status(401).json({ success: false, error: 'Session identity missing' });

  const db = getDatabase();
  const configSnap = await db.ref('settings/configuration').once('value');
  const dynamicConfig = configSnap.exists() ? configSnap.val() : {};
  const allowedRoles = dynamicConfig.adminRoles || ["GUILD LEADER", "Vice Guild Leader", "Commander"];
  const timezone = dynamicConfig.timezone || "Asia/Manila";
  const itemsList = dynamicConfig.items || [];

  if (!verifyDiscordOfficerRole(user, allowedRoles)) {
    return res.status(403).json({ success: false, error: 'Access Denied: Action restricted to authorized Discord Management Officers only.' });
  }

  const { event, date, allocations, summary } = req.body;
  if (!allocations) {
    return res.status(400).json({ success: false, error: 'No allocation parameters detected.' });
  }

  try {
    const snapshot = await db.ref('auction/web_requests').once('value');
    const firebaseRequests = snapshot.exists() ? snapshot.val() : {};

    const itemIds = Object.keys(allocations);
    const timestampDate = date || new Date().toLocaleDateString("en-US", { timeZone: timezone });
    
    if (summary) {
      for (const itemKeyId of Object.keys(summary)) {
        const itemData = summary[itemKeyId];
        if (itemData && itemData.qty > 0) {
          const resolvedItem = itemsList.find(i => i.id === itemKeyId) || { name: itemKeyId };
          const newLootHistoryRef = db.ref('auction/loot_history').push();
          await newLootHistoryRef.set({
            id: newLootHistoryRef.key,
            date: timestampDate,
            event: event || 'GuildLeague',
            item: resolvedItem.name, // ✨ FIXED: Resolves legacy friendly description names dynamically
            itemId: itemKeyId,
            quantity: parseInt(itemData.qty, 10),
            max: parseInt(itemData.limit, 10),
            mem: parseInt(itemData.seats, 10)
          });
        }
      }
    }

    for (const targetItemId of itemIds) {
      const { selected = [], absent = [], notSelected = [] } = allocations[targetItemId];
      const resolvedItem = itemsList.find(i => i.id === targetItemId) || { name: targetItemId };

      const keysByMember = {};
      Object.keys(firebaseRequests).forEach(key => {
        const r = firebaseRequests[key];
        
        let reqItemId = r.itemId;
        if (!reqItemId && r.item) {
          const found = itemsList.find(i => i.name === r.item);
          if (found) reqItemId = found.id;
        }

        if (reqItemId === targetItemId && (r.selectionStatus || 'pending').toLowerCase() === 'pending') {
          if (!keysByMember[r.member]) {
            keysByMember[r.member] = [];
          }
          keysByMember[r.member].push(key);
        }
      });

      for (const name of absent) {
        const keyList = keysByMember[name] || [];
        for (const key of keyList) {
          await db.ref(`auction/web_requests/${key}`).update({ selectionStatus: 'Absent' });
        }
      }

      for (const name of notSelected) {
        const keyList = keysByMember[name] || [];
        for (const key of keyList) {
          await db.ref(`auction/web_requests/${key}`).update({ selectionStatus: 'NotSelected' });
        }
      }

      for (const winner of selected) {
        const { name, slots } = winner;
        const keyList = keysByMember[name] || [];

        if (keyList.length > 0) {
          const primaryWinnerKey = keyList[keyList.length - 1];
          await db.ref(`auction/web_requests/${primaryWinnerKey}`).update({
            selectionStatus: 'Selected',
            quantity: slots,
            liveStatus: 'Done'
          });

          const intermediateRedundantLines = keyList.slice(0, keyList.length - 1);
          for (const duplicateKey of intermediateRedundantLines) {
            const currentLine = firebaseRequests[duplicateKey];
            const fallbackStatus = (currentLine?.applicationStatus === 'Canceled') ? 'Canceled' : 'NotSelected';
            await db.ref(`auction/web_requests/${duplicateKey}`).update({ selectionStatus: fallbackStatus });
          }
        } else {
          const newRequestRef = db.ref('auction/web_requests').push();
          await newRequestRef.set({
            id: newRequestRef.key,
            date: timestampDate,
            member: name,
            item: resolvedItem.name, // ✨ FIXED: Resolves legacy string properties during dynamic force-add inserts
            itemId: targetItemId,
            quantity: slots,
            applicationStatus: 'ForcedAdd',
            selectionStatus: 'Selected',
            liveStatus: 'Done',
            priority: 0
          });
        }

        const newPastAuctionRef = db.ref('auction/past_auctions').push();
        await newPastAuctionRef.set({
          id: newPastAuctionRef.key,
          date: timestampDate,
          event: event || 'GuildLeague',
          item: resolvedItem.name, // ✨ FIXED: Prevents Past Auctions UI rendering empty text rows
          itemId: targetItemId,
          quantity: slots,
          mem: name
        });
      }
    }

    await db.ref('auction/active_session').remove();
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/requests/loot-history
 */
router.get('/loot-history', async (req, res) => {
  const user = resolveUserIdentity(req);
  if (!user) return res.status(401).json({ success: false, error: 'Session identity missing' });

  try {
    const db = getDatabase();
    const lootHistorySnap = await db.ref('auction/loot_history').once('value');
    if (!lootHistorySnap.exists()) return res.json({ success: true, history: [] });

    const rawData = lootHistorySnap.val();
    const sortedKeys = Object.keys(rawData).sort();
    const lootHistoryArray = sortedKeys.map(key => ({
      id: key,
      date: rawData[key].date || "",
      event: rawData[key].event || "",
      item: rawData[key].item || "", 
      itemId: rawData[key].itemId || "",
      quantity: parseInt(rawData[key].quantity, 10) || 0,
      max: parseInt(rawData[key].max, 10) || 1,
      mem: parseInt(rawData[key].mem, 10) || 0
    }));

    return res.json({ success: true, history: lootHistoryArray.reverse() });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/requests/past-auctions
 */
router.get('/past-auctions', async (req, res) => {
  const user = resolveUserIdentity(req);
  if (!user) return res.status(401).json({ success: false, error: 'Session identity missing' });

  try {
    const db = getDatabase();
    const pastAuctionsSnap = await db.ref('auction/past_auctions').once('value');
    if (!pastAuctionsSnap.exists()) return res.json({ success: true, history: [] });

    const rawData = pastAuctionsSnap.val();
    const sortedKeys = Object.keys(rawData).sort();
    const pastAuctionsArray = sortedKeys.map(key => ({
      id: key,
      date: rawData[key].date || "",
      event: rawData[key].event || "",
      item: rawData[key].item || "", 
      itemId: rawData[key].itemId || "",
      quantity: parseInt(rawData[key].quantity, 10) || 0,
      mem: rawData[key].mem || ""
    }));

    return res.json({ success: true, history: pastAuctionsArray.reverse() });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/requests/request-history
 */
router.get('/request-history', async (req, res) => {
  const user = resolveUserIdentity(req);
  if (!user) return res.status(401).json({ success: false, error: 'Session identity missing' });

  try {
    const db = getDatabase();
    const historySnap = await db.ref('auction/web_requests').once('value');
    if (!historySnap.exists()) return res.json({ success: true, history: [] });

    const rawData = historySnap.val();
    const sortedKeys = Object.keys(rawData).sort();
    const historyArray = sortedKeys.map(key => ({
      id: rawData[key].id || key,
      date: rawData[key].date || "",
      member: rawData[key].member || "",
      item: rawData[key].item || "",
      itemId: rawData[key].itemId || "",
      quantity: parseInt(rawData[key].quantity, 10) || 0,
      applicationStatus: rawData[key].applicationStatus || "Requested",
      selectionStatus: rawData[key].selectionStatus || "Pending",
      liveStatus: rawData[key].liveStatus || "", 
      priority: parseInt(rawData[key].priority, 10) || 0,
      eventDate: rawData[key].eventDate || ""
    }));

    return res.json({ success: true, history: historyArray.reverse() });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

export default router;