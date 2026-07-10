// backend/src/api/liveRaid.routes.js
import { Router } from 'express';
import { getDatabase } from 'firebase-admin/database';
import { discordClient } from '../discord-bot/client.js';
import crypto from 'crypto';
import {
  resolveWarRoomChannelIds,
  inferWarRoomRelationalIds,
  fetchVoiceChannelPresentUids
} from '../utils/warRoomResolver.js';

const router = Router();

// Helper definitions for user token authentication
function resolveUserIdentity(req) {
  if (req.session?.user) return req.session.user;
  const mobileHeaderToken = req.headers['x-user-profile'];
  if (mobileHeaderToken) {
    try {
      const decodedPayload = JSON.parse(decodeURIComponent(mobileHeaderToken));
      if (decodedPayload && decodedPayload._sig) {
        const clientSignature = decodedPayload._sig;
        const profileToVerify = { ...decodedPayload };
        delete profileToVerify._sig;

        const tokenSigningSecret = process.env.DISCORD_CLIENT_SECRET || 'backup_fallback_secret_key';
        const expectedSignature = crypto
          .createHmac('sha256', tokenSigningSecret)
          .update(JSON.stringify(profileToVerify))
          .digest('hex');

        if (clientSignature === expectedSignature) {
          return profileToVerify;
        } else {
          console.error("🛑 [LIVE RAID INTERCEPT]: Detected forged header signature tamper attempt!");
        }
      }
    } catch (e) {
      console.error("Failed to parse mobile authorization header token:", e.message);
    }
  }
  return null;
}

function verifyDiscordOfficerRole(user, allowedRoles = []) {
  if (!user) return false;
  if (user.roles && Array.isArray(user.roles)) {
    return user.roles.some(r => allowedRoles.includes(r));
  }
  return user.isOfficer === true;
}

// Timezone End Timestamp Parser
function getPhase3EndTimestamp(eventDate, timezone, phase3) {
  const [year, month, day] = eventDate.split('-').map(Number);
  const [hours, minutes] = (phase3.timeEnd || "22:15").split(':').map(Number);
  
  let dayOffset = 0;
  const dayStart = parseInt(phase3.dayStart, 10) || 0;
  const dayEnd = parseInt(phase3.dayEnd, 10) || 0;
  if (dayEnd > dayStart) {
    dayOffset = dayEnd - dayStart;
  } else if (dayEnd < dayStart) {
    dayOffset = (dayEnd + 7) - dayStart;
  }

  // Establish target wall-clock parameters directly as an immutable UTC baseline frame
  const wallClockUtc = new Date(Date.UTC(year, month - 1, day, hours, minutes, 0));
  
  // Calculate the true timezone offset variance using native local string parsers
  let offsetMs = 0;
  try {
    const formatProxy = new Date(wallClockUtc.getTime());
    const tzString = formatProxy.toLocaleString("en-US", { timeZone: timezone });
    const tzParsed = new Date(tzString);
    offsetMs = tzParsed.getTime() - formatProxy.getTime();
  } catch (err) {
    console.error("Deterministic timezone structural offset parsing exception caught:", err);
  }

  // Shifting backwards via absolute numeric millisecond integers fixes runtime host drift completely
  let targetMs = wallClockUtc.getTime() - offsetMs;

  if (dayOffset > 0) {
    targetMs += dayOffset * 24 * 60 * 60 * 1000;
  }
  return targetMs;
}

async function loadWarRoomsCatalog(db) {
  const configSnap = await db.ref('settings/configuration').once('value');
  return configSnap.exists() ? (configSnap.val().warRooms || {}) : {};
}

async function normalizeLiveSessionWarRooms(db, session) {
  if (!session) return session;

  const warRooms = await loadWarRoomsCatalog(db);
  const sourceIdentifiers = [
    ...(session.selectedWarRoomIds || []),
    ...(session.selectedWarRooms || [])
  ];

  const resolvedChannelIds = resolveWarRoomChannelIds(sourceIdentifiers, warRooms);
  if (resolvedChannelIds.length === 0) return session;

  const hasLegacyWarRoomRefs = (session.selectedWarRooms || []).some(
    (id) => !/^\d{17,20}$/.test(String(id))
  );

  const normalizedSession = {
    ...session,
    selectedWarRooms: resolvedChannelIds,
    selectedWarRoomIds: session.selectedWarRoomIds?.length
      ? session.selectedWarRoomIds
      : inferWarRoomRelationalIds(session.selectedWarRooms || [], warRooms)
  };

  if (hasLegacyWarRoomRefs || !session.selectedWarRoomIds?.length) {
    await db.ref('attendance/live_session').update({
      selectedWarRooms: normalizedSession.selectedWarRooms,
      selectedWarRoomIds: normalizedSession.selectedWarRoomIds
    });
  }

  return normalizedSession;
}

async function pollLiveSessionVoicePresence(session) {
  const db = getDatabase();
  const warRooms = await loadWarRoomsCatalog(db);
  const channelIds = resolveWarRoomChannelIds(session.selectedWarRooms || [], warRooms);
  return fetchVoiceChannelPresentUids(discordClient, channelIds);
}

// Internal end live raid handler
async function endLiveRaidSessionInternal(s) {
  const db = getDatabase();
  
  if (global.liveRaidIntervalTicker) {
    clearInterval(global.liveRaidIntervalTicker);
    global.liveRaidIntervalTicker = undefined;
  }

  const totalPulses = parseInt(s.totalPulses, 10) || 0;
  const membersSnap = await db.ref('auction/members').once('value');
  const membersData = membersSnap.exists() ? membersSnap.val() : {};

  const excusedUids = [];
  const commitmentsSnap = await db.ref('attendance/commitments').once('value');
  const eventCommitmentsKey = `${s.eventDate}_${s.eventKey}`;
  let commitmentsData = {};
  if (commitmentsSnap.exists() && commitmentsSnap.val()[eventCommitmentsKey]) {
    commitmentsData = commitmentsSnap.val()[eventCommitmentsKey];
    Object.entries(commitmentsData).forEach(([uid, commitment]) => {
      if (commitment.status === 'Leave') {
        excusedUids.push(uid);
      }
    });
  }

  const gridAssignedUids = new Set();
  if (s.grids) {
    Object.values(s.grids).forEach(grid => {
      if (grid.slots_allocation) {
        Object.entries(grid.slots_allocation).forEach(([coord, slot]) => {
          if (!coord.startsWith("meta_") && !coord.startsWith("party_name_") && slot?.userId) {
            gridAssignedUids.add(slot.userId);
          }
        });
      }
    });
  }

  const atomicUpdates = {};
  const sessionHistoryId = db.ref('attendance/history').push().key;

  const configSnap = await db.ref('settings/configuration').once('value');
  const systemThreshold = configSnap.exists() ? (parseInt(configSnap.val().attendancePresentThreshold, 10) || 75) : 75;

  Object.keys(membersData).forEach(uid => {
    const userTicksCount = s.userTallies?.[uid] || 0;
    const calculatedAttendanceRatio = totalPulses > 0 ? (userTicksCount / totalPulses) * 100 : 0;
    
    let finalStatusOutcome = "Unexcused Absence";
    const isExcused = excusedUids.includes(uid);
    const isAssigned = gridAssignedUids.has(uid);
    const ratioVal = Math.round(calculatedAttendanceRatio);

    if (isAssigned && ratioVal >= systemThreshold) {
      finalStatusOutcome = "Selected/Present";
    } else if (isAssigned && ratioVal < systemThreshold) {
      finalStatusOutcome = "Selected/Partial Present";
    } else if (isExcused) {
      finalStatusOutcome = "Excused Absence";
    } else {
      const comm = commitmentsData[uid]?.status || "None";
      if (comm === 'Confirmed') {
        finalStatusOutcome = "Confirmed Absence";
      } else {
        finalStatusOutcome = "Uncommitted Absence";
      }
    }

    const commitmentStatus = commitmentsData[uid]?.status || "None";
    const member = membersData[uid] || {};

    const historicalLogEntryKey = db.ref(`attendance/history_ledger/${uid}`).push().key;
    atomicUpdates[`attendance/history_ledger/${uid}/${historicalLogEntryKey}`] = {
      id: historicalLogEntryKey,
      date: s.eventDate,
      sessionId: sessionHistoryId,
      status: finalStatusOutcome,
      ratio: ratioVal,
      eventName: s.eventTitle || "Raid",
      jobCode: member.jobCode || "",
      roleCode: member.roleCode || "",
      commitmentStatus: commitmentStatus
    };
  });

  atomicUpdates[`attendance/session_archive/${sessionHistoryId}`] = {
    id: sessionHistoryId,
    eventDate: s.eventDate,
    eventTitle: s.eventTitle,
    eventKey: s.eventKey,
    committedBy: s.launchedBy || "System",
    totalPulses: totalPulses,
    grids: s.grids || {},
    selectedWarRooms: s.selectedWarRooms || [],
    selectedWarRoomIds: s.selectedWarRoomIds || [],
    userTallies: s.userTallies || {},
    endedAt: Date.now()
  };

  atomicUpdates['attendance/live_session'] = null;
  await db.ref().update(atomicUpdates);
}

// Endpoints
router.get('/session', async (req, res) => {
  const user = resolveUserIdentity(req);
  if (!user) return res.status(401).json({ success: false, error: 'Authentication missing' });

  try {
    const db = getDatabase();
    const sessionSnap = await db.ref('attendance/live_session').once('value');
    if (!sessionSnap.exists()) {
      return res.json({ success: true, session: null });
    }

    const s = sessionSnap.val();
    
    const normalizedSession = await normalizeLiveSessionWarRooms(db, s);
    return res.json({ success: true, session: normalizedSession });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/create', async (req, res) => {
  const user = resolveUserIdentity(req);
  if (!user) return res.status(401).json({ success: false, error: 'Authentication missing' });

  try {
    const db = getDatabase();
    const configSnap = await db.ref('settings/configuration').once('value');
    const allowedRoles = configSnap.exists() ? (configSnap.val().adminRoles || []) : ["GUILD LEADER", "Vice Guild Leader", "Commander"];

    if (!verifyDiscordOfficerRole(user, allowedRoles)) {
      return res.status(403).json({ success: false, error: 'Access Denied: Action restricted to Officers.' });
    }

    const activeSnap = await db.ref('attendance/live_session').once('value');
    if (activeSnap.exists()) {
      return res.status(400).json({ success: false, error: 'An active Live Raid session is already running.' });
    }

    const { eventKey, eventDate, eventTitle, selectedConfigIds, selectedWarRooms: selectedWarRoomIds } = req.body;
    if (!eventKey || !eventDate || !eventTitle || !selectedConfigIds || !selectedWarRoomIds?.length) {
      return res.status(400).json({ success: false, error: 'Missing required configuration fields.' });
    }

    const settingsObj = configSnap.exists() ? configSnap.val() : {};
    const resolvedWarRoomChannelIds = resolveWarRoomChannelIds(
      selectedWarRoomIds,
      settingsObj.warRooms || {}
    );

    if (resolvedWarRoomChannelIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No valid Discord war room channels resolved. Verify Settings war room registry and backend DISCORD_WARROOM_ID_* environment variables.'
      });
    }

    // Clone configuration grids
    const gridsPayload = {};
    for (const configId of selectedConfigIds) {
      const compSnap = await db.ref(`attendance/compositions/${configId}`).once('value');
      if (compSnap.exists()) {
        gridsPayload[configId] = compSnap.val();
      }
    }

    // Pull the duration directly from your saved Settings Panel configurations
    const customMaxMinutes = parseInt(settingsObj.attendanceMaxDuration, 10);
    if (!customMaxMinutes || isNaN(customMaxMinutes)) {
      return res.status(400).json({ success: false, error: "Missing master attendanceMaxDuration parameter map in Settings." });
    }
    const endTimestamp = Date.now() + (customMaxMinutes * 60 * 1000);
    const sessionPayload = {
      status: 'Active',
      launchedBy: user.displayName || user.username || 'Officer',
      startedAt: Date.now(),
      eventKey,
      eventDate,
      eventTitle,
      selectedConfigIds,
      selectedWarRoomIds,
      selectedWarRooms: resolvedWarRoomChannelIds,
      grids: gridsPayload,
      endTimestamp,
      totalPulses: 0,
      userTallies: {},
      version: 1
    };

    await db.ref('attendance/live_session').set(sessionPayload);

    // Start Ticker
    const pollIntervalMinutes = settingsObj.attendancePollInterval || 5;
    const pollIntervalMs = pollIntervalMinutes * 60 * 1000;

    if (global.liveRaidIntervalTicker) clearInterval(global.liveRaidIntervalTicker);

    global.liveRaidIntervalTicker = setInterval(async () => {
      try {
        const activeSnap = await db.ref('attendance/live_session').once('value');
        if (!activeSnap.exists() || activeSnap.val().status !== 'Active') {
          clearInterval(global.liveRaidIntervalTicker);
          global.liveRaidIntervalTicker = undefined;
          return;
        }

        const s = activeSnap.val();
        if (s.endTimestamp && Date.now() > s.endTimestamp) {
          console.log("⏰ Headcount tracking duration reached. Disabling background voice polling ticker...");
          if (global.liveRaidIntervalTicker) {
            clearInterval(global.liveRaidIntervalTicker);
            global.liveRaidIntervalTicker = undefined;
          }
          return;
        }

        const now = Date.now();
        const dynamicPollIntervalMs = (parseInt(settingsObj.attendancePollInterval, 10) || 5) * 60 * 1000;
        
        if (s.lastVoicePoll?.timestamp && (now - s.lastVoicePoll.timestamp) < (dynamicPollIntervalMs - 10000)) {
          return;
        }

        const nextTotalPulses = (s.totalPulses || 0) + 1;
        const updatedTallies = { ...(s.userTallies || {}) };
        const presentUserIds = await pollLiveSessionVoicePresence(s);

        presentUserIds.forEach(uid => {
          updatedTallies[uid] = (updatedTallies[uid] || 0) + 1;
        });

        await db.ref('attendance/live_session').update({
          totalPulses: nextTotalPulses,
          userTallies: updatedTallies,
          lastVoicePoll: {
            timestamp: Date.now(),
            presentUids: presentUserIds
          }
        });
      } catch (err) {
        console.error("⚠️ Ticker loop error in live_session:", err.message);
      }
    }, pollIntervalMs);

    return res.json({ success: true, session: sessionPayload });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/update', async (req, res) => {
  const user = resolveUserIdentity(req);
  if (!user) return res.status(401).json({ success: false, error: 'Authentication missing' });

  try {
    const db = getDatabase();
    const configSnap = await db.ref('settings/configuration').once('value');
    const allowedRoles = configSnap.exists() ? (configSnap.val().adminRoles || []) : ["GUILD LEADER", "Vice Guild Leader", "Commander"];

    if (!verifyDiscordOfficerRole(user, allowedRoles)) {
      return res.status(403).json({ success: false, error: 'Access Denied.' });
    }

    const { session } = req.body;
    if (!session) return res.status(400).json({ success: false, error: 'Missing session parameters.' });

    await db.ref('attendance/live_session').update(session);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/cell-update', async (req, res) => {
  const user = resolveUserIdentity(req);
  if (!user) return res.status(401).json({ success: false, error: 'Authentication missing' });
  try {
    const db = getDatabase();
    const { configId, coordKey, userId } = req.body;
    
    // Target and rewrite exclusively the single coordinate slot address path inside Firebase
    await db.ref(`attendance/live_session/grids/${configId}/slots_allocation/${coordKey}`).update({
      userId: userId
    });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/voice-presence', async (req, res) => {
  const user = resolveUserIdentity(req);
  if (!user) return res.status(401).json({ success: false, error: 'Authentication missing' });

  try {
    const channelsParam = req.query.channels || '';
    const channelIdentifiers = channelsParam.split(',').filter(Boolean);
    const db = getDatabase();
    const warRooms = await loadWarRoomsCatalog(db);
    const resolvedChannelIds = resolveWarRoomChannelIds(channelIdentifiers, warRooms);
    const presentUserIds = await fetchVoiceChannelPresentUids(discordClient, resolvedChannelIds);

    return res.json({ success: true, presentUids: presentUserIds });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/end', async (req, res) => {
  const user = resolveUserIdentity(req);
  if (!user) return res.status(401).json({ success: false, error: 'Authentication missing' });

  try {
    const db = getDatabase();
    const configSnap = await db.ref('settings/configuration').once('value');
    const allowedRoles = configSnap.exists() ? (configSnap.val().adminRoles || []) : ["GUILD LEADER", "Vice Guild Leader", "Commander"];

    if (!verifyDiscordOfficerRole(user, allowedRoles)) {
      return res.status(403).json({ success: false, error: 'Access Denied.' });
    }

    const sessionSnap = await db.ref('attendance/live_session').once('value');
    if (!sessionSnap.exists()) {
      return res.status(400).json({ success: false, error: 'No active Live Raid session found.' });
    }

    const s = sessionSnap.val();
    await endLiveRaidSessionInternal(s);

    return res.json({ success: true, message: 'Live Raid ended and archived successfully.' });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/cancel', async (req, res) => {
  const user = resolveUserIdentity(req);
  if (!user) return res.status(401).json({ success: false, error: 'Authentication missing' });

  try {
    const db = getDatabase();
    const configSnap = await db.ref('settings/configuration').once('value');
    const allowedRoles = configSnap.exists() ? (configSnap.val().adminRoles || []) : ["GUILD LEADER", "Vice Guild Leader", "Commander"];

    if (!verifyDiscordOfficerRole(user, allowedRoles)) {
      return res.status(403).json({ success: false, error: 'Access Denied.' });
    }

    if (global.liveRaidIntervalTicker) {
      clearInterval(global.liveRaidIntervalTicker);
      global.liveRaidIntervalTicker = undefined;
    }

    await db.ref('attendance/live_session').set(null);
    return res.json({ success: true, message: 'Live Raid session terminated and cleared without archiving.' });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/history/all', async (req, res) => {
  const user = resolveUserIdentity(req);
  if (!user) return res.status(401).json({ success: false, error: 'Authentication missing' });

  try {
    const db = getDatabase();
    const archiveSnap = await db.ref('attendance/session_archive').once('value');
    const ledgerSnap = await db.ref('attendance/history_ledger').once('value');

    return res.json({
      success: true,
      sessions: archiveSnap.exists() ? archiveSnap.val() : {},
      ledger: ledgerSnap.exists() ? ledgerSnap.val() : {}
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
