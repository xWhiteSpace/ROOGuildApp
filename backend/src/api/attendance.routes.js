// backend/src/api/attendance.routes.js
import { Router } from 'express';
import { getDatabase } from 'firebase-admin/database';
import { getGateStatusDetails } from '../config/timeWindow.js';
import crypto from 'crypto';

const router = Router();

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
          console.error("🛑 [API ROUTE INTERCEPT]: Detected forged header signature tamper attempt!");
        }
      }
    } catch (e) {
      console.error("Failed to parse mobile authorization header token:", e.message);
    }
  }
  return null;
}

function verifyOfficerPrivileges(user, allowedRoles = []) {
  if (!user) return false;
  if (user.roles && Array.isArray(user.roles)) {
    return user.roles.some(r => allowedRoles.includes(r));
  }
  return user.isOfficer === true;
}

// Alias the name so it safely matches your existing dashboard checks across systems
const verifyDiscordOfficerRole = verifyOfficerPrivileges;

// 🚪 POST /api/attendance/vanish -> Bot-Driven Server Eviction Gate
router.post('/vanish', async (req, res) => {
  const user = resolveUserIdentity(req);
  if (!user) return res.status(401).json({ success: false, error: 'Session identity missing' });

  try {
    const db = getDatabase();
    const configSnap = await db.ref('settings/configuration').once('value');
    const roles = configSnap.exists() ? (configSnap.val().adminRoles || []) : ["GUILD LEADER", "Vice Guild Leader", "Commander"];

    if (!verifyDiscordOfficerRole(user, roles)) {
      return res.status(403).json({ success: false, error: 'Access Denied: Action restricted to Officers.' });
    }

    const { targetUid } = req.body;
    if (!targetUid) return res.status(400).json({ success: false, error: 'Missing user ID parameter.' });

    // 1. Kick member straight off the active Discord Server Guild
    if (discordClient && discordClient.isReady()) {
      const guild = await discordClient.guilds.fetch(process.env.DISCORD_GUILD_ID).catch(() => null);
      if (guild) {
        const member = await guild.members.fetch(targetUid).catch(() => null);
        if (member) {
          await member.kick('Vanished from guild via administrative dashboard web request');
        }
      }
    }

    // 2. Clear out identity document variables from cloud nodes
    await db.ref(`auction/members/${targetUid}`).remove();
    return res.json({ success: true, message: 'Server kick completed and database profile record purged.' });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ✍️ POST /api/attendance/update-roster-status -> Atomic Property Updates
router.post('/update-roster-status', async (req, res) => {
  const user = resolveUserIdentity(req);
  if (!user) return res.status(401).json({ success: false, error: 'Session identity missing' });

  try {
    const db = getDatabase();
    const configSnap = await db.ref('settings/configuration').once('value');
    const roles = configSnap.exists() ? (configSnap.val().adminRoles || []) : ["GUILD LEADER", "Vice Guild Leader", "Commander"];

    if (!verifyDiscordOfficerRole(user, roles)) {
      return res.status(403).json({ success: false, error: 'Access Denied.' });
    }

    const { targetUid, updates } = req.body;
    if (!targetUid || !updates) return res.status(400).json({ success: false, error: 'Missing tracking payloads.' });

    await db.ref(`auction/members/${targetUid}`).update(updates);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// 🟢 GET /api/attendance/active-session
router.get('/active-session', async (req, res) => {
  const user = resolveUserIdentity(req);
  if (!user) return res.status(401).json({ success: false, error: 'Authentication token missing' });

  try {
    const db = getDatabase();
    const sessionSnap = await db.ref('attendance/active_session').once('value');
    return res.json({ success: true, session: sessionSnap.exists() ? snapshot.val() : null });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ⚔️ POST /api/attendance/begin-raid
router.post('/begin-raid', async (req, res) => {
  const user = resolveUserIdentity(req);
  if (!user) return res.status(401).json({ success: false, error: 'Authentication missing' });

  try {
    const db = getDatabase();
    const configSnap = await db.ref('settings/configuration').once('value');
    const roles = configSnap.exists() ? (configSnap.val().adminRoles || []) : ["GUILD LEADER", "Vice Guild Leader", "Commander"];

    if (!verifyDiscordOfficerRole(user, roles)) {
      return res.status(403).json({ success: false, error: 'Action restricted to authorized Officers.' });
    }

    const { initialGrid } = req.body;
    const sessionPayload = {
      status: 'Active',
      launchedBy: user.displayName || user.username,
      startedAt: Date.now(),
      gridTopology: initialGridStructure || { columns: 8, rows: 5 },
      checksPresent: 0
    };

    // Define an in-memory or single state node tracker to eliminate DB limit exhaustion
    sessionPayload.totalPulses = 0;
    sessionPayload.userTallies = {};

    await db.ref('attendance/active_session').set(sessionPayload);

    // Fetch adjustable polling interval from settings or default strictly to 5 minutes (300000ms)
    const settingsSnap = await db.ref('settings/configuration').once('value');
    const pollIntervalMinutes = settingsSnap.exists() ? (parseInt(settingsSnap.val().attendancePollInterval, 10) || 5) : 5;
    const pollIntervalMs = pollIntervalMinutes * 60 * 1000;

    // Initialize the low-overhead synchronous connection-state polling routine
    if (global.attendanceIntervalTicker) clearInterval(global.attendanceIntervalTicker);
    
    global.attendanceIntervalTicker = setInterval(async () => {
      try {
        const activeSnap = await db.ref('attendance/active_session').once('value');
        if (!activeSnap.exists() || activeSnap.val().status !== 'Active') {
          return clearInterval(global.attendanceIntervalTicker);
        }

        const currentSession = activeSnap.val();
        const nextTotalPulses = (currentSession.totalPulses || 0) + 1;
        const updatedTallies = currentSession.userTallies || {};

        const whitelistedRooms = [
          process.env.DISCORD_WARROOM_ID_1,
          process.env.DISCORD_WARROOM_ID_2,
          process.env.DISCORD_WARROOM_ID_3,
          process.env.DISCORD_WARROOM_ID_4,
          process.env.DISCORD_WARROOM_ID_5
        ].filter(Boolean);

        // Scan whitelisted channels purely for connection metadata arrays
        const presentUserIds = [];
        for (const channelId of whitelistedRooms) {
          const channel = await discordClient.channels.fetch(channelId).catch(() => null);
          if (channel && channel.isVoiceBased()) {
            channel.members.forEach(member => {
              if (!member.user.bot) {
                presentUserIds.push(member.user.id);
              }
            });
          }
        }

        // Low-overhead incremental indexing pass: Avoids separate document logs per tick
        presentUserIds.forEach(uid => {
          updatedTallies[uid] = (updatedTallies[uid] || 0) + 1;
        });

        await db.ref('attendance/active_session').update({
          checksPresent: nextTotalPulses,
          userTallies: updatedTallies
        });
      } catch (loopErr) {
        console.error("⚠️ Presence polling ticker exception caught:", loopTargetMin.message);
      }
    }, pollIntervalMs);

    return res.json({ success: true, message: 'Live Raid active. Polling initialized.' });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// 🛑 POST /api/attendance/end-raid
router.post('/end-raid', async (req, res) => {
  const user = resolveUserIdentity(req);
  if (!user) return res.status(401).json({ success: false, error: 'Authentication token missing' });

  try {
    const db = getDatabase();
    const configSnap = await db.ref('settings/configuration').once('value');
    const roles = configSnap.exists() ? (configSnap.val().adminRoles || []) : ["GUILD LEADER", "Vice Guild Leader", "Commander"];

    if (!verifyDiscordOfficerRole(user, roles)) {
      return res.status(403).json({ success: false, error: 'Access Denied: Action restricted to Officers.' });
    }

    const sessionSnap = await db.ref('attendance/active_session').once('value');
    if (!sessionSnap.exists()) {
      return res.status(400).json({ success: false, error: 'No active streaming session to commit.' });
    }

    const s = sessionSnap.val();
    const totalPulses = parseInt(s.checksPresent, 10) || 0;

    // Kill the background execution timer loop instantly
    if (global.attendanceIntervalTicker) {
      clearInterval(global.attendanceIntervalTicker);
      global.attendanceIntervalTicker = undefined;
    }

    const membersSnap = await db.ref('auction/members').once('value');
    const membersData = membersSnap.exists() ? membersSnap.val() : {};
    
    const { compositionMatrix = {}, excusedUids = [] } = req.body;
    const timestampDate = new Date().toLocaleDateString("en-US", { timeZone: configSnap.exists() ? (configSnap.val().timezone || "Asia/Manila") : "Asia/Manila" });

    const atomicUpdates = {};
    const sessionHistoryId = db.ref('attendance/history').push().key;

    Object.keys(membersData).forEach(uid => {
      const userTicksCount = s.userTallies?.[uid] || 0;
      const calculatedAttendanceRatio = totalPulses > 0 ? (userTicksCount / totalPulses) * 100 : 0;
      
      let finalStatusOutcome = "Unexcused Absence";
      if (compositionMatrix[uid] || calculatedAttendanceRatio >= 75) {
        finalStatusOutcome = "Selected/Present";
      } else if (excusedUids.includes(uid)) {
        finalStatusOutcome = "Excused Absence";
      }

      const historicalLogEntryKey = db.ref(`attendance/history_ledger/${uid}`).push().key;
      atomicUpdates[`attendance/history_ledger/${uid}/${historicalLogEntryKey}`] = {
        id: historicalLogEntryKey,
        date: timestampDate,
        sessionId: sessionHistoryId,
        status: finalStatusOutcome,
        ratio: Math.round(calculatedAttendanceRatio)
      };
    });

    // Archive overall layout layout metadata cleanly
    atomicUpdates[`attendance/session_archive/${sessionHistoryId}`] = {
      id: sessionHistoryId,
      date: timestampDate,
      committedBy: user.displayName || user.username,
      totalPulses: totalPulses,
      finalComposition: compositionMatrix
    };

    // 🧼 Sandbox Cleansing: Permanently clear scratchpad nodes
    atomicUpdates['attendance/active_session'] = null;

    await db.ref().update(atomicUpdates);
    return res.json({ success: true, message: 'Raid session successfully finalized and archived to Firebase.' });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// 📊 POST /api/attendance/update-job-target -> Save Recruitment Goals
router.post('/update-job-target', async (req, res) => {
  const user = resolveUserIdentity(req);
  if (!user) return res.status(401).json({ success: false, error: 'Session identity missing' });

  try {
    const db = getDatabase();
    const configSnap = await db.ref('settings/configuration').once('value');
    const roles = configSnap.exists() ? (configSnap.val().adminRoles || []) : ["GUILD LEADER", "Vice Guild Leader", "Commander"];

    if (!verifyDiscordOfficerRole(user, roles)) {
      return res.status(403).json({ success: false, error: 'Access Denied: Action restricted to Officers.' });
    }

    const { jobCode, desiredCount } = req.body;
    if (!jobCode) return res.status(400).json({ success: false, error: 'Missing required jobCode parameter.' });

    // Commit the parameter straight into the global SSOT settings tree
    await db.ref(`settings/configuration/jobs/${jobCode}/desiredCount`).set(parseInt(desiredCount, 10) || 0);
    return res.json({ success: true, message: 'Recruitment benchmark updated successfully.' });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// 📅 POST /api/attendance/commit-availability -> Log Raider Presence/Leave
router.post('/commit-availability', async (req, res) => {
  const user = resolveUserIdentity(req);
  if (!user) return res.status(401).json({ success: false, error: 'Session identity missing' });

  try {
    const { dateStr, eventId, status } = req.body;
    if (!dateStr || !eventId || !status) {
      return res.status(400).json({ success: false, error: 'Missing scheduling configuration vectors.' });
    }

    const db = getDatabase();
    const compositeKey = `${dateStr}_${eventId}`;

    // Toggle-Off Safeguard: If status targets None, completely wipe the user record node from the tree
    if (status === 'None') {
      await db.ref(`attendance/commitments/${compositeKey}/${user.id}`).remove();
      return res.json({ success: true, message: 'Schedule commitment removed successfully.' });
    }

    const commitmentPayload = {
      displayName: user.displayName || user.username || 'Unknown Raider',
      status: status,
      declaredAt: Date.now()
    };

    // Atomic set directly under the targeted composite tracking node
    await db.ref(`attendance/commitments/${compositeKey}/${user.id}`).set(commitmentPayload);
    return res.json({ success: true, message: 'Schedule commitment logged.' });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// 📅 GET /api/attendance/special-events -> Retrieve Ad-Hoc Special Instances
router.get('/special-events', async (req, res) => {
  const user = resolveUserIdentity(req);
  if (!user) return res.status(401).json({ success: false, error: 'Session identity missing' });
  try {
    const db = getDatabase();
    const snap = await db.ref('scheduler/special_events').once('value');
    return res.json({ success: true, specialEvents: snap.exists() ? snap.val() : {} });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ➕ POST /api/attendance/special-events/add -> Authorize & Save Ad-Hoc Instances
router.post('/special-events/add', async (req, res) => {
  const user = resolveUserIdentity(req);
  if (!user) return res.status(401).json({ success: false, error: 'Session identity missing' });
  try {
    const db = getDatabase();
    const configSnap = await db.ref('settings/configuration').once('value');
    const roles = configSnap.exists() ? (configSnap.val().adminRoles || []) : ["GUILD LEADER", "Vice Guild Leader", "Commander"];
    
    if (!verifyDiscordOfficerRole(user, roles)) {
      return res.status(403).json({ success: false, error: 'Access Denied: Action restricted to Officers.' });
    }
    const { title, description, date, dateEnd, timeStart, timeEnd, type, isAttendanceTracked, daysOfWeek, allDay } = req.body;
    if (!title || !date || !dateEnd || !timeStart || !timeEnd) {
      return res.status(400).json({ success: false, error: 'Missing required configuration fields.' });
    }
    
    const newEventRef = db.ref('scheduler/special_events').push();
    const eventPayload = {
      id: newEventRef.key,
      title,
      description: description || '',
      date, 
      dateEnd,
      timeStart,
      timeEnd,
      type: type || 'Raid',
      isAttendanceTracked: !!isAttendanceTracked,
      daysOfWeek: daysOfWeek || null,
      allDay: !!allDay,
      createdBy: user.displayName || user.username || 'Authorized Officer',
      createdAt: Date.now()
    };
    
    await newEventRef.set(eventPayload);
    return res.json({ success: true, event: eventPayload });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ❌ DELETE /api/attendance/special-events/:id -> Purge Ad-Hoc Special Instance & Signs
router.delete('/special-events/:id', async (req, res) => {
  const user = resolveUserIdentity(req);
  if (!user) return res.status(401).json({ success: false, error: 'Session identity missing' });
  try {
    const db = getDatabase();
    const configSnap = await db.ref('settings/configuration').once('value');
    const roles = configSnap.exists() ? (configSnap.val().adminRoles || []) : ["GUILD LEADER", "Vice Guild Leader", "Commander"];
    
    if (!verifyDiscordOfficerRole(user, roles)) {
      return res.status(403).json({ success: false, error: 'Access Denied: Action restricted to Officers.' });
    }
    const { id } = req.params;
    if (!id) return res.status(400).json({ success: false, error: 'Missing event ID.' });

    // 1. Remove the core special event node
    await db.ref(`scheduler/special_events/${id}`).remove();
    
    // 2. Perform a targeted cleanup on commitments matching this event ID
    const commitmentsSnap = await db.ref('attendance/commitments').once('value');
    if (commitmentsSnap.exists()) {
      const commitments = commitmentsSnap.val();
      const updates = {};
      Object.keys(commitments).forEach(key => {
        if (key.endsWith(`_${id}`)) {
          updates[`attendance/commitments/${key}`] = null;
        }
      });
      if (Object.keys(updates).length > 0) {
        await db.ref().update(updates);
      }
    }

    return res.json({ success: true, message: 'Special event and localized sign-ups purged successfully.' });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// 📝 PUT /api/attendance/special-events/:id -> Authorize & Modify Existing Ad-Hoc Instances
router.put('/special-events/:id', async (req, res) => {
  const user = resolveUserIdentity(req);
  if (!user) return res.status(401).json({ success: false, error: 'Session identity missing' });
  try {
    const db = getDatabase();
    const configSnap = await db.ref('settings/configuration').once('value');
    const roles = configSnap.exists() ? (configSnap.val().adminRoles || []) : ["GUILD LEADER", "Vice Guild Leader", "Commander"];
    
    if (!verifyDiscordOfficerRole(user, roles)) {
      return res.status(403).json({ success: false, error: 'Access Denied: Action restricted to Officers.' });
    }
    const { id } = req.params;
    const { title, description, date, dateEnd, timeStart, timeEnd, type, isAttendanceTracked, daysOfWeek, allDay } = req.body;
    if (!title || !date || !dateEnd || !timeStart || !timeEnd) {
      return res.status(400).json({ success: false, error: 'Missing required configuration fields.' });
    }

    await db.ref(`scheduler/special_events/${id}`).update({
      title,
      description: description || '',
      date,
      dateEnd,
      timeStart,
      timeEnd,
      type: type || 'Raid',
      isAttendanceTracked: !!isAttendanceTracked,
      daysOfWeek: daysOfWeek || null,
      allDay: !!allDay,
      updatedBy: user.displayName || user.username || 'Authorized Officer',
      updatedAt: Date.now()
    });

    return res.json({ success: true, message: 'Special event configuration modified successfully.' });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});
// 📁 GET /api/attendance/compositions -> Read Compositions via Admin SDK (Bypasses rules)
router.get('/compositions', async (req, res) => {
  const user = resolveUserIdentity(req);
  if (!user) return res.status(401).json({ success: false, error: 'Session identity missing' });
  try {
    const db = getDatabase();
    const snap = await db.ref('attendance/compositions').once('value');
    return res.json({ success: true, compositions: snap.exists() ? snap.val() : {} });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// 📁 POST /api/attendance/compositions/create -> Create Blank Configuration via Admin SDK (Bypasses rules)
router.post('/compositions/create', async (req, res) => {
  const user = resolveUserIdentity(req);
  if (!user) return res.status(401).json({ success: false, error: 'Session identity missing' });

  try {
    const db = getDatabase();
    const configSnap = await db.ref('settings/configuration').once('value');
    const roles = configSnap.exists() ? (configSnap.val().adminRoles || []) : ["GUILD LEADER", "Vice Guild Leader", "Commander"];

    if (!verifyDiscordOfficerRole(user, roles)) {
      return res.status(403).json({ success: false, error: 'Access Denied.' });
    }

    const compsSnap = await db.ref('attendance/compositions').once('value');
    let nextIndex = 1;
    if (compsSnap.exists()) {
      const existingKeys = Object.keys(compsSnap.val());
  const numericIds = existingKeys.map(k => {
    const match = k.match(/^raid_(\d+)$/);
    return match ? parseInt(match[1], 10) : 0;
  });
  nextIndex = Math.max(...numericIds, 0) + 1;
}

const sequentialConfigId = `raid_${String(nextIndex).padStart(3, '0')}`;
    const targetConfigRef = db.ref(`attendance/compositions/${sequentialConfigId}`);
    
    const blankPayload = {
      id: sequentialConfigId,
      title: `Raid Setup Configuration ${nextIndex}`,
      lastUpdated: Date.now(),
      updatedBy: user.displayName || user.username || 'Officer',
      gridTopology: { columns: 8, rows: 5 },
      slots_allocation: {}
    };

    await targetConfigRef.set(blankPayload);
    return res.json({ success: true, id: sequentialConfigId });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// 💾 POST /api/attendance/compositions/save -> Save Configuration Matrix via Admin SDK (Bypasses rules)
router.post('/compositions/save', async (req, res) => {
  const user = resolveUserIdentity(req);
  if (!user) return res.status(401).json({ success: false, error: 'Session identity missing' });

  try {
    const db = getDatabase();
    const configSnap = await db.ref('settings/configuration').once('value');
    const roles = configSnap.exists() ? (configSnap.val().adminRoles || []) : ["GUILD LEADER", "Vice Guild Leader", "Commander"];

    if (!verifyDiscordOfficerRole(user, roles)) {
      return res.status(403).json({ success: false, error: 'Access Denied.' });
    }

    const { configId, title, gridMatrix } = req.body;
    if (!configId) return res.status(400).json({ success: false, error: 'Missing configId parameter.' });

    await db.ref(`attendance/compositions/${configId}`).update({
      title: title,
      lastUpdated: Date.now(),
      updatedBy: user.displayName || user.username || 'Officer',
      slots_allocation: gridMatrix
    });

    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// 🖨️ POST /api/attendance/compositions/duplicate -> Duplicate Matrix via Admin SDK (Bypasses rules)
router.post('/compositions/duplicate', async (req, res) => {
  const user = resolveUserIdentity(req);
  if (!user) return res.status(401).json({ success: false, error: 'Session identity missing' });

  try {
    const db = getDatabase();
    const configSnap = await db.ref('settings/configuration').once('value');
    const roles = configSnap.exists() ? (configSnap.val().adminRoles || []) : ["GUILD LEADER", "Vice Guild Leader", "Commander"];

    if (!verifyDiscordOfficerRole(user, roles)) {
      return res.status(403).json({ success: false, error: 'Access Denied.' });
    }

    const { sourceId, cleanAllocationPayload } = req.body;
    if (!sourceId) return res.status(400).json({ success: false, error: 'Missing sourceId parameter.' });

    const sourceSnap = await db.ref(`attendance/compositions/${sourceId}`).once('value');
    if (!sourceSnap.exists()) return res.status(404).json({ success: false, error: 'Source config not found' });

    const sourceConfig = sourceSnap.val();
    const compsSnap = await db.ref('attendance/compositions').once('value');
    let nextIndex = 1;
    if (compsSnap.exists()) {
      const existingKeys = Object.keys(compsSnap.val());
  const numericIds = existingKeys.map(k => {
    const match = k.match(/^raid_(\d+)$/);
    return match ? parseInt(match[1], 10) : 0;
  });
  nextIndex = Math.max(...numericIds, 0) + 1;
}

const sequentialConfigId = `raid_${String(nextIndex).padStart(3, '0')}`;
    const duplicatePayload = {
      id: sequentialConfigId,
      title: `${sourceConfig.title || 'Untitled'} (Copy)`,
      lastUpdated: Date.now(),
      updatedBy: user.displayName || user.username || 'Officer',
      gridTopology: { columns: 8, rows: 5 },
      slots_allocation: cleanAllocationPayload || {}
    };

    await db.ref(`attendance/compositions/${sequentialConfigId}`).set(duplicatePayload);
    return res.json({ success: true, id: sequentialConfigId });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// 🗑️ DELETE /api/attendance/compositions/delete/:id -> Delete Configuration via Admin SDK (Bypasses rules)
router.delete('/compositions/delete/:id', async (req, res) => {
  const user = resolveUserIdentity(req);
  if (!user) return res.status(401).json({ success: false, error: 'Session identity missing' });

  try {
    const db = getDatabase();
    const configSnap = await db.ref('settings/configuration').once('value');
    const roles = configSnap.exists() ? (configSnap.val().adminRoles || []) : ["GUILD LEADER", "Vice Guild Leader", "Commander"];

    if (!verifyDiscordOfficerRole(user, roles)) {
      return res.status(403).json({ success: false, error: 'Access Denied.' });
    }

    const { id } = req.params;
    if (!id) return res.status(400).json({ success: false, error: 'Missing configuration ID.' });

    await db.ref(`attendance/compositions/${id}`).remove();
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// 💾 POST /api/attendance/roster/save-batch -> Bulk Leaf-Level Persistence Optimizer
router.post('/roster/save-batch', async (req, res) => {
  const user = resolveUserIdentity(req);
  if (!user) return res.status(401).json({ success: false, error: 'Session identity missing' });

  try {
    const db = getDatabase();
    const configSnap = await db.ref('settings/configuration').once('value');
    const roles = configSnap.exists() ? (configSnap.val().adminRoles || []) : ["GUILD LEADER", "Vice Guild Leader", "Commander"];

    if (!verifyDiscordOfficerRole(user, roles)) {
      return res.status(403).json({ success: false, error: 'Access Denied: Action restricted to Officers.' });
    }

    const { stagedMembers } = req.body;
    if (!stagedMembers) return res.status(400).json({ success: false, error: 'Omitted staged roster dataset.' });

    const batchAtomicUpdates = {};
    Object.entries(stagedMembers).forEach(([uid, m]) => {
      batchAtomicUpdates[`auction/members/${uid}/isRaidRoster`] = m.isRaidRoster === true;
      batchAtomicUpdates[`auction/members/${uid}/jobCode`] = m.jobCode || "";
      batchAtomicUpdates[`auction/members/${uid}/roleCode`] = m.roleCode || "";
      batchAtomicUpdates[`auction/members/${uid}/groupTag`] = m.groupTag || "";
      batchAtomicUpdates[`auction/members/${uid}/joinedAt`] = m.joinedAt || "";
      
      if (m.status) {
        batchAtomicUpdates[`auction/members/${uid}/status`] = m.status;
      }
    });

    if (Object.keys(batchAtomicUpdates).length > 0) {
      await db.ref().update(batchAtomicUpdates);
    }

    return res.json({ success: true, message: 'Roster directory batch saved successfully.' });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

export default router;