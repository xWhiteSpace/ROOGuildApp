/**
 * War Room automation: publish + set-active during GvG Prep, auto-start live raid at War.
 * Isolated from auction auto-commit / eventAnnounce.
 */
import { getTenantStore } from '../../../db/database.js';
import { getCurrentTenantId } from '../../../db/tenantContext.js';
import { getRaidCycleStatus } from '../raidTimeWindow.js';
import {
  addConfigToPublished,
  configIdFromGridKey,
  removeConfigFromPublished,
  setPublishedAnchor,
  writePublishedSnapshot,
} from './publishedComposition.js';
import { createLiveRaidFromPublished } from '../../../api/liveRaid.routes.js';

const STATUS_PATH = 'attendance/war_room_status';
const lastWrittenStatus = new Map();

function statusSignature(patch) {
  return JSON.stringify({
    lastError: patch.lastError ?? null,
    publishedId: patch.publishedId ?? null,
    eventId: patch.eventId ?? null,
  });
}

async function writeStatus(db, patch) {
  const tenantId = getCurrentTenantId() || '_';
  const signature = statusSignature(patch);
  const isLiveStart = patch.liveStartedAt != null;
  if (!isLiveStart && lastWrittenStatus.get(tenantId) === signature) return;
  lastWrittenStatus.set(tenantId, signature);
  await db.ref(STATUS_PATH).update({
    ...patch,
    updatedAt: Date.now(),
  }).catch(() => {});
}

function collectPublishedConfigIds(published) {
  const ids = new Set();
  Object.entries(published?.grids || {}).forEach(([gridKey, grid]) => {
    const id = configIdFromGridKey(gridKey) || String(grid?.parentConfigId || '').trim();
    if (id) ids.add(id);
  });
  return [...ids];
}

async function ensurePublishedForCycle(db, cycle) {
  const publishedId = cycle.publishedId;
  const targetConfigId = String(cycle.configId || '').trim();
  if (!publishedId || !cycle.activeEventId) return { ok: false, error: 'No published id for cycle.' };
  if (!targetConfigId) return { ok: false, error: 'No Raid Party config is assigned in Game Settings.' };

  let existingSnap = await db.ref(`attendance/published/${publishedId}`).once('value');
  if (!existingSnap.exists()) {
    const written = await writePublishedSnapshot({
      db,
      session: {
        eventKey: cycle.activeEventId,
        eventDate: cycle.warDate,
        eventTitle: cycle.activeEventTitle,
        timeStart: cycle.warStartTime,
        configId: targetConfigId,
        grids: {},
        selectedGridIds: [],
      },
      sessionId: publishedId,
      sentBy: 'War Room',
    });
    if (!written.ok) return written;
    existingSnap = await db.ref(`attendance/published/${publishedId}`).once('value');
  }

  const published = existingSnap.exists() ? existingSnap.val() : {};
  const presentIds = collectPublishedConfigIds(published);
  const alreadySynced = presentIds.length === 1 && presentIds[0] === targetConfigId;
  if (alreadySynced) {
    return { ok: true, id: publishedId };
  }

  const compositionSnap = await db.ref(`attendance/compositions/${targetConfigId}`).once('value');
  if (!compositionSnap.exists()) {
    return { ok: false, error: `Raid Party config ${targetConfigId} was not found.` };
  }

  if (!presentIds.includes(targetConfigId)) {
    const added = await addConfigToPublished({
      db,
      id: publishedId,
      configId: targetConfigId,
      composition: compositionSnap.val(),
    });
    if (!added.ok && !/already on this composition/i.test(added.error || '')) {
      return added;
    }
  }

  for (const extraId of presentIds) {
    if (extraId === targetConfigId) continue;
    const removed = await removeConfigFromPublished({
      db,
      id: publishedId,
      configId: extraId,
    });
    if (!removed.ok && !/not on this composition/i.test(removed.error || '')) {
      return removed;
    }
  }

  await setPublishedAnchor({ db, id: publishedId, active: true });
  return { ok: true, id: publishedId };
}

export async function maybeRunWarRoomAutomation() {
  const db = getTenantStore();
  const cycle = getRaidCycleStatus();
  if (!cycle || cycle.needsSetup || cycle.isForceLocked || !cycle.activeEventId) return;

  let liveExists = false;
  if (cycle.currentPhase === 3) {
    const liveSnap = await db.ref('attendance/live_session').once('value');
    liveExists = liveSnap.exists();
  }

  if (cycle.currentPhase >= 1 && cycle.currentPhase <= 3) {
    const shouldSyncPublished = cycle.currentPhase <= 2 || !liveExists;
    if (shouldSyncPublished) {
      const ensured = await ensurePublishedForCycle(db, cycle);
      if (!ensured.ok) {
        await writeStatus(db, { lastError: ensured.error, lastErrorAt: Date.now(), publishedId: cycle.publishedId });
        console.error('[war-room] publish/set-active failed:', ensured.error);
      } else {
        await writeStatus(db, { lastError: null, publishedId: cycle.publishedId, eventId: cycle.activeEventId });
      }
    }
    try {
      const { ensureGvgReadinessBoardIfMissing } = await import('./discordAttendanceCards.js');
      await ensureGvgReadinessBoardIfMissing();
    } catch (err) {
      console.error('[war-room] GVG Readiness board sync failed:', err.message);
    }
  }

  if (cycle.currentPhase !== 3) return;
  if (liveExists) return;

  const warRoomIds = cycle.warRoomIds || [];
  if (warRoomIds.length === 0) {
    const msg = `War started for ${cycle.activeEventTitle} but no war rooms are selected on this event.`;
    await writeStatus(db, { lastError: msg, lastErrorAt: Date.now() });
    console.warn('[war-room]', msg);
    return;
  }

  if (!cycle.warStartsAt || !cycle.warEndsAt) {
    const msg = `War window timestamps are invalid for ${cycle.activeEventTitle}.`;
    await writeStatus(db, { lastError: msg, lastErrorAt: Date.now() });
    return;
  }

  const created = await createLiveRaidFromPublished({
    publishedId: cycle.publishedId,
    selectedWarRoomIds: warRoomIds,
    monitoringStartsAt: cycle.warStartsAt,
    monitoringEndsAt: cycle.warEndsAt,
    pollIntervalMinutes: cycle.pollIntervalMinutes,
    launchedBy: 'War Room',
  });

  if (!created.ok) {
    await writeStatus(db, { lastError: created.error, lastErrorAt: Date.now() });
    console.error('[war-room] auto-start live raid failed:', created.error);
    return;
  }

  await writeStatus(db, {
    lastError: null,
    liveStartedAt: Date.now(),
    publishedId: cycle.publishedId,
    eventId: cycle.activeEventId,
  });
  console.log(`[war-room] auto-started live raid for ${cycle.activeEventId} ${cycle.warDate}`);
}
