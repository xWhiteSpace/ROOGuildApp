// backend/src/api/request.routes.js
import { Router } from 'express';
import { getTenantStore } from '../db/database.js';
import { getGateStatusDetails, readTenantConfiguration } from '../games/ragnarok-origin/timeWindow.js';
import { findOverlappingRaidCyclePair } from '@guildname/shared/raidCycle';
import { DEFAULT_CONFIGURATION } from '../config/defaultConfiguration.js';
import { getCurrentTenantId } from '../db/tenantContext.js';
import { checkOfficer, configNeedsSetup, publicSettingsView, helpSettingsView } from '../auth/officer.js';
import { loadTenantSettings, saveTenantDiscordChannels } from '../db/tenants.js';
import { resolveUserIdentity, signUserProfile } from '../auth/identity.js';
import { discordEnv } from '../config/discordEnv.js';

import { isDiscordCircuitOpen, getDiscordRateLimitStatus, logDiscordHttpFailure } from '../utils/discordRateLimit.js';

import { WORKSPACE_CONFIG_KEYS } from '../config/workspaceDefaults.js';
import { asItemsList, buildMemberAuctionStats } from '../utils/memberAuctionStats.js';
import { buildRequestLobby, submitSelections, cancelPending, RequestDeckError } from '../games/ragnarok-origin/services/requestDeck.js';

function pickKeys(source, keys) {
  const out = {};
  for (const key of keys) {
    if (source && Object.prototype.hasOwnProperty.call(source, key)) out[key] = source[key];
  }
  return out;
}

function omitKeys(source, keys) {
  const skip = new Set(keys);
  const out = {};
  for (const [key, value] of Object.entries(source || {})) {
    if (!skip.has(key)) out[key] = value;
  }
  return out;
}

const router = Router();

// 💡 SEED MATRIX BOUNDARIES (Only utilized to safely configure blank database tracks automatically)
const DEFAULT_SESSION_STRUCTURE = {
  activeStep: 1,
  qtyPerPage: 4,
  lootRows: [],
  lootSummary: {},
  categoryAllocations: {},
  initialWinnersByItem: {},
  isDiscordGateOpen: false 
};

function getGMT8DateString() {
  // 🚀 DYNAMIC TIMEZONE PIPELINE: Authoritatively bind date string resolutions straight to the user-configured settings tab parameters
  const timeGateStatus = getGateStatusDetails() || {};
  const targetTimezone = timeGateStatus.timezone; 

  try {
    const localString = new Date().toLocaleString("en-US", { timeZone: targetTimezone });
    const tzDate = new Date(localString);
    const month = tzDate.getMonth() + 1;
    const day = tzDate.getDate();
    const year = tzDate.getFullYear();
    return `${month}/${day}/${year}`;
  } catch (e) {
    // Structural runtime environmental fallback if the database parameters are completely empty during application boot
    const d = new Date();
    return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
  }
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

/**
 * 🛡️ DYNAMIC ROLE INTERSECTOR
 * Compares the active Discord user profile arrays directly against authorized configurations
 */
async function verifyDiscordOfficerRole(req, allowedRoles = []) {
  const { user, ok } = await checkOfficer(req, { adminRoles: allowedRoles });
  return Boolean(user && ok);
}

function parseMemberUid(raw) {
  const uid = String(raw ?? '').trim();
  if (/^\d{5,22}$/.test(uid) || /^dummy_\d+$/.test(uid)) return uid;
  return null;
}

/**
 * POST /api/requests/settings/unlock
 */
router.post('/settings/unlock', async (req, res) => {
  try {
    const db = getTenantStore();
    const configSnap = await db.ref('settings/configuration').once('value');
    const config = configSnap.exists() ? configSnap.val() : {};
    const { user, ok } = await checkOfficer(req, config);
    if (!user) return res.status(401).json({ success: false, error: 'Login required' });
    if (!ok) {
      return res.status(403).json({
        success: false,
        error: 'Officers of this Discord server can unlock Settings. Ask the person who set up the guild to add your Discord role name in Settings.',
      });
    }
    const tenantId = req.tenantId || getCurrentTenantId();
    const signedUser = user ? signUserProfile(user) : null;
    const payload = { success: true, message: 'Officer configuration desk unlocked.', user: signedUser };
    if (req.session) {
      req.session.settingsUnlocked = true;
      req.session.settingsUnlockedTenantId = tenantId;
      return req.session.save(() => res.json(payload));
    }
    return res.json({ success: true, message: 'Officer configuration desk unlocked.', user: signedUser });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/requests/settings/help
 * Member-safe Help URLs + clock timezone. Does not include adminRoles or channels.
 */
router.get('/settings/help', async (req, res) => {
  try {
    const db = getTenantStore();
    const configSnap = await db.ref('settings/configuration').once('value');
    const config = configSnap.exists() ? configSnap.val() : { ...DEFAULT_CONFIGURATION };
    return res.json({ success: true, ...helpSettingsView(config) });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/requests/settings/get
 */
router.get('/settings/get', async (req, res) => {
  try {
    const db = getTenantStore();
    const configSnap = await db.ref('settings/configuration').once('value');
    const config = configSnap.exists() ? configSnap.val() : { ...DEFAULT_CONFIGURATION };
    const needsSetup = configNeedsSetup(config);
    const { ok } = await checkOfficer(req, config);
    const tenantId = req.tenantId || getCurrentTenantId();
    const { discordChannels } = tenantId
      ? await loadTenantSettings(tenantId)
      : { discordChannels: {} };
    if (!ok) {
      return res.json({
        success: true,
        config: publicSettingsView(config),
        help: helpSettingsView(config),
        needsSetup,
        publicOnly: true,
      });
    }
    return res.json({ success: true, config, needsSetup, publicOnly: false, discordChannels });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/requests/settings/save
 */
router.post('/settings/save', async (req, res) => {
  try {
    const { config } = req.body;
    if (!config) return res.status(400).json({ success: false, error: 'Omitted payload configuration parameter maps.' });

    const db = getTenantStore();
    const storedSnap = await db.ref('settings/configuration').once('value');
    const storedConfig = storedSnap.exists() ? storedSnap.val() : {};
    const { user, ok } = await checkOfficer(req, storedConfig);
    if (!user) return res.status(401).json({ success: false, error: 'Login required' });
    if (!ok) {
      return res.status(403).json({ success: false, error: 'Officer access required to save Settings.' });
    }

    const scope = req.body.scope === 'workspace' ? 'workspace' : 'game';
    let nextConfig;
    if (scope === 'workspace') {
      nextConfig = {
        ...storedConfig,
        ...pickKeys(config, WORKSPACE_CONFIG_KEYS),
        guildLogoUrl: storedConfig.guildLogoUrl || '',
      };
    } else {
      nextConfig = {
        ...storedConfig,
        ...omitKeys(config, WORKSPACE_CONFIG_KEYS),
        guildLogoUrl: storedConfig.guildLogoUrl || '',
      };
    }
    if (scope === 'game') {
      const overlap = findOverlappingRaidCyclePair(nextConfig.events || {});
      if (overlap) {
        const titleA = nextConfig.events?.[overlap.a]?.title || overlap.a;
        const titleB = nextConfig.events?.[overlap.b]?.title || overlap.b;
        return res.status(400).json({
          success: false,
          error: `Raid cycles overlap between ${titleA} (${overlap.a}) and ${titleB} (${overlap.b}). Adjust Start/End so raid-enabled events do not overlap.`,
        });
      }
    }
    await db.ref('settings/configuration').set(nextConfig);
    if (scope === 'game' && req.body.discordChannels) {
      const tenantId = req.tenantId || getCurrentTenantId();
      if (tenantId) await saveTenantDiscordChannels(tenantId, req.body.discordChannels);
    }
    return res.json({ success: true, message: scope === 'workspace' ? 'Workspace saved.' : 'Game settings saved.' });
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
    const db = getTenantStore();
    const sessionSnap = await db.ref('auction/active_session').once('value');

    if (!sessionSnap.exists()) {
      return res.json({ success: true, session: null });
    }

    const dynamicConfig = await readTenantConfiguration(db);
    const itemsList = dynamicConfig.items || [];

    const currentSessionData = sessionSnap.val();
    const timeDeltaMilliseconds = Date.now() - (currentSessionData.lastUpdated || 0);
    const maximumAllowedAgeInMs = 24 * 60 * 60 * 1000; 

    if (timeDeltaMilliseconds > maximumAllowedAgeInMs) {
      const gateDetails = getGateStatusDetails() || {};
      const activeLoots = dynamicConfig.events?.[gateDetails.activeEventId]?.loots || {};
      const firstItemId = itemsList.length > 0 ? itemsList[0].id : '';

      // 🛡️ SEPARATION COMPLETE: The server seeds transactional variables without cluttering cloud nodes with visual metadata
      const freshReset = {
        ...DEFAULT_SESSION_STRUCTURE,
        lootRows: firstItemId ? [{ id: 1, itemType: firstItemId, startPage: 1, startPos: 1, endPage: 1, endPos: 4, limit: activeLoots[firstItemId] || 1 }] : [],
        lastUpdated: Date.now()
      };

      itemsList.forEach(item => {
        freshReset.lootSummary[item.id] = { qty: 0, limit: activeLoots[item.id] || 1, seats: 0 };
        freshReset.categoryAllocations[item.id] = { selected: [] };
        freshReset.initialWinnersByItem[item.id] = [];
      });
      await db.ref('auction/active_session').set(freshReset);
      return res.json({ success: true, session: freshReset });
    }

    if (currentSessionData.categoryAllocations) {
        const gateDetails = getGateStatusDetails() || {};
        const activeLoots = dynamicConfig.events?.[gateDetails.activeEventId]?.loots || {};
        itemsList.forEach(item => {
          if (!currentSessionData.categoryAllocations[item.id]) {
            currentSessionData.categoryAllocations[item.id] = { selected: [] };
          }
          if (!currentSessionData.lootSummary[item.id]) {
            currentSessionData.lootSummary[item.id] = { qty: 0, limit: activeLoots[item.id] || 1, seats: 0 };
          }
        });
    }

    // 🛡️ Ensure default geometric layout parameter maps are never undefined
    if (currentSessionData.qtyPerPage === undefined) {
      currentSessionData.qtyPerPage = 4;
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
    const db = getTenantStore();
    const configSnap = await db.ref('settings/configuration').once('value');
    const allowedRoles = configSnap.exists() ? (configSnap.val().adminRoles || []) : [];

    if (!await verifyDiscordOfficerRole(req, allowedRoles)) {
      console.error(`🛑 [SECURITY OVERRIDE REJECTION]: User "${user.displayName || user.username}" lacks authorized management roles. Write blocked.`);
      return res.status(403).json({ success: false, error: 'Access Denied: Action restricted to authorized Discord Management Officers only.' });
    }

    console.log(`📡 [SERVER SESSION UPDATE]: Writing payload data. Gate Override Status: ${req.body.session?.isDiscordGateOpen}`);
    const incomingWorkspacePayload = req.body.session;
    if (!incomingWorkspacePayload) {
      return res.status(400).json({ success: false, error: 'Payload configuration parameters missing.' });
    }

    // Run an atomic transaction to ensure out-of-order network packets can never degrade the state version
    const activeSessionNodeRef = db.ref('auction/active_session');
    await activeSessionNodeRef.transaction((currentDatabaseState) => {
      if (currentDatabaseState) {
        // Abort write smoothly if the incoming packet version is less than what is already committed in the database
        if (incomingWorkspacePayload.version !== undefined && currentDatabaseState.version !== undefined) {
          if (incomingWorkspacePayload.version < currentDatabaseState.version) {
            return; 
          }
        }
      }
      incomingWorkspacePayload.lastUpdated = Date.now();
      return incomingWorkspacePayload;
    });

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
    const payload = await buildRequestLobby(user.id, user.displayName || user.username);
    return res.json({ success: true, ...payload });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/requests/sync-roster
 * Industry-standard Leaf-Level Synchronization Pass with Ghost Account Evaluation Rules
 */
router.post('/sync-roster', async (req, res) => {
  const user = resolveUserIdentity(req);
  if (!user) return res.status(401).json({ success: false, error: 'Session identity missing' });

  const db = getTenantStore();
  const configSnap = await db.ref('settings/configuration').once('value');
  const { ok } = await checkOfficer(req, configSnap.exists() ? configSnap.val() : {});
  if (!ok) return res.status(403).json({ success: false, error: 'Officer access required' });

  const botToken = discordEnv().botToken;
  const guildId = getCurrentTenantId();

  if (!botToken || !guildId) {
    return res.status(500).json({ success: false, error: 'Missing Discord credentials inside backend configurations.' });
  }

  if (isDiscordCircuitOpen()) {
    const status = getDiscordRateLimitStatus();
    return res.status(503).json({
      success: false,
      error: `Discord is temporarily blocking this server IP. Try again after ${status.untilHuman || status.remainingHuman}.`,
    });
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
      let parsed = null;
      try { parsed = JSON.parse(errorText); } catch { parsed = { message: errorText }; }
      logDiscordHttpFailure('sync-roster members fetch', discordResponse, parsed);
      const status = getDiscordRateLimitStatus();
      if (isDiscordCircuitOpen()) {
        return res.status(503).json({
          success: false,
          error: `Discord is temporarily blocking this server IP. Try again after ${status.untilHuman || status.remainingHuman}.`,
        });
      }
      return res.status(discordResponse.status).json({ success: false, error: `Discord API communication rejected: ${errorText}` });
    }

    const discordMembers = await discordResponse.json();
    const db = getTenantStore();
    
    const configSnap = await db.ref('settings/configuration').once('value');
    const timezone = configSnap.exists() ? (configSnap.val().timezone || "Asia/Manila") : "Asia/Manila";
    const currentTimestampDate = new Date().toLocaleDateString("en-US", { timeZone: timezone });
    
    const currentDbMembersSnap = await db.ref('auction/members').once('value');
    const currentDbMembers = currentDbMembersSnap.exists() ? currentDbMembersSnap.val() : {};

    const structuralLeafPatches = {};
    const discordActiveSnowflakeIds = new Set();

    discordMembers.forEach(member => {
      if (member.user?.id) {
        const uid = member.user.id;
        discordActiveSnowflakeIds.add(uid);

        const serverNickname = (member.nick || member.user?.global_name || member.user?.username || '').trim();
        const resolvedName = serverNickname || member.user.username || 'Unknown Member';
        const rawJoinedAt = member.joined_at ? new Date(member.joined_at).toISOString().slice(0, 10) : currentTimestampDate;

        structuralLeafPatches[`auction/members/${uid}/displayName`] = resolvedName;
        structuralLeafPatches[`auction/members/${uid}/syncedAt`] = currentTimestampDate;
        
        if (!currentDbMembers[uid]?.joinedAt) {
          structuralLeafPatches[`auction/members/${uid}/joinedAt`] = rawJoinedAt;
        }

        if (currentDbMembers[uid]?.status === 'Ghost') {
          structuralLeafPatches[`auction/members/${uid}/status`] = "Active";
        }
      }
    });

    Object.keys(currentDbMembers).forEach(dbUid => {
      // Dummies have no Discord identity, so the sync pass must never touch or Ghost them
      if (dbUid.startsWith('dummy_') || currentDbMembers[dbUid]?.isDummy === true) return;
      if (!discordActiveSnowflakeIds.has(dbUid)) {
        structuralLeafPatches[`auction/members/${dbUid}/status`] = "Ghost";
      }
    });

    if (Object.keys(structuralLeafPatches).length === 0) {
      return res.status(422).json({ success: false, error: 'No valid user profiles extracted.' });
    }

    await db.ref().update(structuralLeafPatches);
    return res.json({ success: true, count: Object.keys(structuralLeafPatches).length });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/requests/submit
 */
router.post('/submit', async (req, res) => {
  const user = resolveUserIdentity(req);
  if (!user) return res.status(401).json({ success: false, error: 'Session identity missing' });

  try {
    const result = await submitSelections(user.id, user.displayName || user.username, req.body?.selections);
    return res.json(result);
  } catch (error) {
    if (error instanceof RequestDeckError) {
      return res.status(error.status).json({ success: false, error: error.message });
    }
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/requests/cancel
 */
router.post('/cancel', async (req, res) => {
  const user = resolveUserIdentity(req);
  if (!user) return res.status(401).json({ success: false, error: 'Session identity missing' });

  const { itemId, itemName } = req.body || {};
  try {
    const result = await cancelPending(user.id, user.displayName || user.username, { itemId, itemName });
    return res.json(result);
  } catch (error) {
    if (error instanceof RequestDeckError) {
      return res.status(error.status).json({ success: false, error: error.message });
    }
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Shared commit-session ledger writer. Consumed by the POST /commit-session route
 * and by the automatic auto-commit scheduler so both paths write an identical
 * atomic bundle (loot_history, past_auctions, web_request status flips) and clear
 * the active staging session. Throws on failure; callers own the HTTP/logging shell.
 */
export async function performCommitSession({ event, date, allocations, summary }) {
  const db = getTenantStore();
  const configSnap = await db.ref('settings/configuration').once('value');
  const dynamicConfig = configSnap.exists() ? configSnap.val() : {};
  const timezone = dynamicConfig.timezone || "Asia/Manila";
  const itemsList = dynamicConfig.items || [];

  if (!allocations) {
    throw new Error('No allocation parameters detected.');
  }

  {
    const snapshot = await db.ref('auction/web_requests').once('value');
    const firebaseRequests = snapshot.exists() ? snapshot.val() : {};

    const itemIds = Object.keys(allocations);
        let timestampDate = date || new Date().toLocaleDateString("en-US", { timeZone: timezone });
        
        // Normalize the frontend's raw HTML5 YYYY-MM-DD picker values down to standard MM/DD/YYYY slashes
        if (timestampDate && timestampDate.includes('-')) {
          const dParts = timestampDate.split('-');
          if (dParts.length === 3 && dParts[0].length === 4) {
            timestampDate = `${parseInt(dParts[1], 10)}/${parseInt(dParts[2], 10)}/${dParts[0]}`;
          }
        }
    
    // 🛡️ ATOMIC TRANSACTION BUNDLE: Consolidate all database actions into a single operational pass
    const atomicUpdates = {};

    const membersListSnap = await db.ref('auction/members').once('value');
    const membersData = membersListSnap.exists() ? membersListSnap.val() : {};
    const nameToUidMap = {};
    Object.entries(membersData).forEach(([uid, m]) => {
      if (m?.displayName) {
        // Strict Guard: Only map pure numeric Discord Snowflake UIDs
        if (/^\d+$/.test(uid)) {
          nameToUidMap[m.displayName.trim().toLowerCase()] = uid;
        }
      }
    });

    if (summary) {
      for (const itemKeyId of Object.keys(summary)) {
        const itemData = summary[itemKeyId];
        if (itemData && itemData.qty > 0) {
          const resolvedItem = itemsList.find(i => i.id === itemKeyId) || { name: itemKeyId };
          const newPushKey = db.ref('auction/loot_history').push().key;
          
          atomicUpdates[`auction/loot_history/${newPushKey}`] = {
            id: newPushKey,
            date: timestampDate,
            event: event || '',
            item: resolvedItem.name,
            itemId: itemKeyId,
            quantity: parseInt(itemData.qty, 10),
            max: parseInt(itemData.limit, 10),
            mem: parseInt(itemData.seats, 10)
          };
        }
      }
    }

    for (const targetItemId of itemIds) {
      const { selected = [], absent = [], notSelected = [] } = allocations[targetItemId];
      const resolvedItem = itemsList.find(i => i.id === targetItemId) || { name: targetItemId };

      const keysByTrackingKey = {};
      Object.keys(firebaseRequests).forEach(key => {
        const r = firebaseRequests[key];
        let reqItemId = r.itemId;
        if (!reqItemId && r.item) {
          const found = itemsList.find(i => i.name === r.item);
          if (found) reqItemId = found.id;
        }

        if (reqItemId === targetItemId && (r.selectionStatus || 'pending').toLowerCase() === 'pending') {
          const tKey = r.userId;
          if (tKey) {
            if (!keysByTrackingKey[tKey]) keysByTrackingKey[tKey] = [];
            keysByTrackingKey[tKey].push(key);
          }
        }
      });

      const getKeysForUid = (uid) => {
        return keysByTrackingKey[uid] || [];
      };

      for (const uid of absent) {
        const keyList = getKeysForUid(uid);
        if (keyList.length > 0) {
          const finalKey = keyList[keyList.length - 1];
          atomicUpdates[`auction/web_requests/${finalKey}/selectionStatus`] = 'Absent';
          const redundant = keyList.slice(0, keyList.length - 1);
          for (const k of redundant) atomicUpdates[`auction/web_requests/${k}/selectionStatus`] = 'Superseded';
        }
      }

      for (const uid of notSelected) {
        const keyList = getKeysForUid(uid);
        if (keyList.length > 0) {
          const finalKey = keyList[keyList.length - 1];
          atomicUpdates[`auction/web_requests/${finalKey}/selectionStatus`] = 'NotSelected';
          const redundant = keyList.slice(0, keyList.length - 1);
          for (const k of redundant) atomicUpdates[`auction/web_requests/${k}/selectionStatus`] = 'Superseded';
        }
      }

      for (const winner of selected) {
        const { userId, name, slots } = winner;
        const keyList = getKeysForUid(userId);
        const resolvedName = name || membersData[userId]?.displayName || 'Unknown Member';

        if (keyList.length > 0) {
          const primaryWinnerKey = keyList[keyList.length - 1];
          atomicUpdates[`auction/web_requests/${primaryWinnerKey}/selectionStatus`] = 'Selected';
          atomicUpdates[`auction/web_requests/${primaryWinnerKey}/quantity`] = slots;
          atomicUpdates[`auction/web_requests/${primaryWinnerKey}/liveStatus`] = 'Done';

          const intermediateRedundantLines = keyList.slice(0, keyList.length - 1);
          for (const duplicateKey of intermediateRedundantLines) {
            atomicUpdates[`auction/web_requests/${duplicateKey}/selectionStatus`] = 'Superseded';
          }
        } else {
          const newRequestKey = db.ref('auction/web_requests').push().key;
          atomicUpdates[`auction/web_requests/${newRequestKey}`] = {
            id: newRequestKey,
            userId: userId,
            date: timestampDate,
            member: resolvedName,
            item: resolvedItem.name,
            itemId: targetItemId,
            quantity: slots,
            applicationStatus: 'ForcedAdd',
            selectionStatus: 'Selected',
            liveStatus: 'Done',
            priority: 0
          };
        }

        const newPastAuctionKey = db.ref('auction/past_auctions').push().key;
        atomicUpdates[`auction/past_auctions/${newPastAuctionKey}`] = {
          id: newPastAuctionKey,
          date: timestampDate,
          event: event || '',
          item: resolvedItem.name,
          itemId: targetItemId,
          quantity: slots,
          userId: userId,
          mem: resolvedName
        };
      }
    }

    // 🧹 Tear down the active staging cache concurrently alongside our master updates payload block
    atomicUpdates['auction/active_session'] = null;

    // Fire everything down to Firebase in a single synchronized network pass
    await db.ref().update(atomicUpdates);
  }
}

/**
 * POST /api/requests/commit-session
 */
router.post('/commit-session', async (req, res) => {
  const user = resolveUserIdentity(req);
  if (!user) return res.status(401).json({ success: false, error: 'Session identity missing' });

  const db = getTenantStore();
  const configSnap = await db.ref('settings/configuration').once('value');
  const dynamicConfig = configSnap.exists() ? configSnap.val() : {};
  const allowedRoles = dynamicConfig.adminRoles || [];

  if (!await verifyDiscordOfficerRole(req, allowedRoles)) {
    return res.status(403).json({ success: false, error: 'Access Denied: Action restricted to authorized Discord Management Officers only.' });
  }

  const { event, date, allocations, summary } = req.body;
  if (!allocations) {
    return res.status(400).json({ success: false, error: 'No allocation parameters detected.' });
  }

  try {
    await performCommitSession({ event, date, allocations, summary });
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/requests/reset-priority
 * 🛡️ OFFICER GUARDRAIL: Manual override for the High Value retained-priority ruling.
 * Writes a terminal 'Reset' marker into the ledger so calculatePriorityScore zeroes
 * the streak out from this point forward, without touching prior historical rows.
 */
router.post('/reset-priority', async (req, res) => {
  const user = resolveUserIdentity(req);
  if (!user) return res.status(401).json({ success: false, error: 'Session identity missing' });

  const db = getTenantStore();
  const configSnap = await db.ref('settings/configuration').once('value');
  const dynamicConfig = configSnap.exists() ? configSnap.val() : {};
  const allowedRoles = dynamicConfig.adminRoles || [];
  const timezone = dynamicConfig.timezone || "Asia/Manila";
  const itemsList = dynamicConfig.items || [];

  if (!await verifyDiscordOfficerRole(req, allowedRoles)) {
    return res.status(403).json({ success: false, error: 'Access Denied: Action restricted to authorized Discord Management Officers only.' });
  }

  const { userId: targetUserId, itemId } = req.body;
  if (!targetUserId || !itemId) {
    return res.status(400).json({ success: false, error: 'Missing target member or item identifier.' });
  }

  try {
    const resolvedItem = itemsList.find(i => i.id === itemId) || { name: itemId };
    const membersSnap = await db.ref('auction/members').once('value');
    const membersMap = membersSnap.exists() ? membersSnap.val() : {};
    const resolvedName = membersMap[targetUserId]?.displayName || 'Unknown Member';

    const newResetRef = db.ref('auction/web_requests').push();
    await newResetRef.set({
      id: newResetRef.key,
      userId: targetUserId,
      date: new Date().toLocaleDateString("en-US", { timeZone: timezone }),
      member: resolvedName,
      item: resolvedItem.name,
      itemId,
      quantity: 0,
      applicationStatus: 'AdminReset',
      selectionStatus: 'Reset',
      liveStatus: '',
      priority: 0
    });

    return res.json({ success: true, message: `Priority for ${resolvedName} on ${resolvedItem.name} has been manually reset.` });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/requests/clear-history
 * 🛡️ OFFICER GUARDRAIL: Permanently deletes Request History ledger rows whose
 * request Timestamp falls within an officer-selected date range (inclusive).
 */
router.post('/clear-history', async (req, res) => {
  const user = resolveUserIdentity(req);
  if (!user) return res.status(401).json({ success: false, error: 'Session identity missing' });

  const db = getTenantStore();
  const configSnap = await db.ref('settings/configuration').once('value');
  const dynamicConfig = configSnap.exists() ? configSnap.val() : {};
  const allowedRoles = dynamicConfig.adminRoles || [];

  if (!await verifyDiscordOfficerRole(req, allowedRoles)) {
    return res.status(403).json({ success: false, error: 'Access Denied: Action restricted to authorized Discord Management Officers only.' });
  }

  const { startDate, endDate } = req.body;
  if (!startDate || !endDate) {
    return res.status(400).json({ success: false, error: 'Both a start and end date are required.' });
  }

  const rangeStart = new Date(startDate);
  const rangeEnd = new Date(`${endDate}T23:59:59.999`);
  if (isNaN(rangeStart) || isNaN(rangeEnd) || rangeStart > rangeEnd) {
    return res.status(400).json({ success: false, error: 'Invalid date range.' });
  }

  try {
    const snapshot = await db.ref('auction/web_requests').once('value');
    const records = snapshot.exists() ? snapshot.val() : {};

    const atomicUpdates = {};
    let deletedCount = 0;
    Object.entries(records).forEach(([key, record]) => {
      const recordDate = new Date(record.date || '');
      if (!isNaN(recordDate) && recordDate >= rangeStart && recordDate <= rangeEnd) {
        atomicUpdates[`auction/web_requests/${key}`] = null;
        deletedCount++;
      }
    });

    if (deletedCount > 0) {
      await db.ref().update(atomicUpdates);
    }

    return res.json({ success: true, deletedCount });
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
    const db = getTenantStore();
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
    const db = getTenantStore();
    const pastAuctionsSnap = await db.ref('auction/past_auctions').once('value');
    const membersSnap = await db.ref('auction/members').once('value');
    const membersMap = membersSnap.exists() ? membersSnap.val() : {};

    if (!pastAuctionsSnap.exists()) return res.json({ success: true, history: [], members: membersMap });

    const rawData = pastAuctionsSnap.val();
    const sortedKeys = Object.keys(rawData).sort();
    const pastAuctionsArray = sortedKeys.map(key => ({
      id: key,
      date: rawData[key].date || "",
      event: rawData[key].event || "",
      item: rawData[key].item || "", 
      itemId: rawData[key].itemId || "",
      quantity: parseInt(rawData[key].quantity, 10) || 0,
      userId: rawData[key].userId || "",
      // Read the historical member name directly from the row's 'mem' attribute fallback
      mem: rawData[key].mem || "Unknown Member"
    }));

    return res.json({ success: true, history: pastAuctionsArray.reverse(), members: membersMap });
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
    const db = getTenantStore();
    const historySnap = await db.ref('auction/web_requests').once('value');
    if (!historySnap.exists()) return res.json({ success: true, history: [] });

    // Grab the live presentation directory to resolve past names dynamically
    const membersSnap = await db.ref('auction/members').once('value');
    const membersMap = membersSnap.exists() ? membersSnap.val() : {};

    const rawData = historySnap.val();
    const sortedKeys = Object.keys(rawData).sort();
    const historyArray = sortedKeys.map(key => ({
      id: rawData[key].id || key,
      userId: rawData[key].userId || "",
      date: rawData[key].date || "",
      member: rawData[key].member || "Unknown Member",
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

/**
 * GET /api/requests/member-auction-stats?uid=
 * Self or officer. Guild-wide loot_history battle count + this member's past_auctions qty.
 */
router.get('/member-auction-stats', async (req, res) => {
  const user = resolveUserIdentity(req);
  if (!user) return res.status(401).json({ success: false, error: 'Session identity missing' });

  try {
    const db = getTenantStore();
    const configSnap = await db.ref('settings/configuration').once('value');
    const dynamicConfig = configSnap.exists() ? configSnap.val() : {};
    const allowedRoles = dynamicConfig.adminRoles || [];

    const uid = parseMemberUid(req.query.uid || user.id);
    if (!uid) {
      return res.status(400).json({
        success: false,
        error: 'Invalid member id. Expected a Discord snowflake.',
        received: req.query.uid || user.id || null,
      });
    }

    if (uid !== String(user.id) && !await verifyDiscordOfficerRole(req, allowedRoles)) {
      return res.status(403).json({ success: false, error: 'Access Denied.' });
    }

    const [lootSnap, awardsSnap] = await Promise.all([
      db.ref('auction/loot_history').once('value'),
      db.ref('auction/past_auctions').once('value'),
    ]);

    const stats = buildMemberAuctionStats({
      lootHistory: lootSnap.exists() ? lootSnap.val() : {},
      pastAuctions: awardsSnap.exists() ? awardsSnap.val() : {},
      memberUid: uid,
      itemsList: asItemsList(dynamicConfig.items),
    });

    return res.json({ success: true, ...stats });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

export default router;