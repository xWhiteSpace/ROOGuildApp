/**
 * War Room automation: publish + set-active during GvG Prep, auto-start live raid at War.
 * Isolated from auction auto-commit / eventAnnounce.
 */
import { getTenantStore } from '../../../db/database.js';
import { getRaidCycleStatus } from '../raidTimeWindow.js';
import {
  addConfigToPublished,
  setPublishedAnchor,
  writePublishedSnapshot,
} from './publishedComposition.js';
import { createLiveRaidFromPublished } from '../../../api/liveRaid.routes.js';

const STATUS_PATH = 'attendance/war_room_status';

async function writeStatus(db, patch) {
  await db.ref(STATUS_PATH).update({
    ...patch,
    updatedAt: Date.now(),
  }).catch(() => {});
}

async function ensurePublishedForCycle(db, cycle) {
  const publishedId = cycle.publishedId;
  if (!publishedId || !cycle.activeEventId) return { ok: false, error: 'No published id for cycle.' };

  const existingSnap = await db.ref(`attendance/published/${publishedId}`).once('value');
  if (!existingSnap.exists()) {
    const written = await writePublishedSnapshot({
      db,
      session: {
        eventKey: cycle.activeEventId,
        eventDate: cycle.warDate,
        eventTitle: cycle.activeEventTitle,
        timeStart: cycle.warStartTime,
        configId: cycle.configId,
        grids: {},
        selectedGridIds: [],
      },
      sessionId: publishedId,
      sentBy: 'War Room',
    });
    if (!written.ok) return written;
  }

  const compositionSnap = await db.ref(`attendance/compositions/${cycle.configId}`).once('value');
  if (!compositionSnap.exists()) {
    return { ok: false, error: `Raid Party config ${cycle.configId} was not found.` };
  }

  const added = await addConfigToPublished({
    db,
    id: publishedId,
    configId: cycle.configId,
    composition: compositionSnap.val(),
  });
  if (!added.ok && !/already on this composition/i.test(added.error || '')) {
    return added;
  }

  await setPublishedAnchor({ db, id: publishedId, active: true });
  return { ok: true, id: publishedId };
}

export async function maybeRunWarRoomAutomation() {
  const db = getTenantStore();
  const cycle = getRaidCycleStatus();
  if (!cycle || cycle.needsSetup || cycle.isForceLocked || !cycle.activeEventId) return;

  if (cycle.currentPhase >= 1 && cycle.currentPhase <= 3) {
    const ensured = await ensurePublishedForCycle(db, cycle);
    if (!ensured.ok) {
      await writeStatus(db, { lastError: ensured.error, lastErrorAt: Date.now(), publishedId: cycle.publishedId });
      console.error('[war-room] publish/set-active failed:', ensured.error);
    } else {
      await writeStatus(db, { lastError: null, publishedId: cycle.publishedId, eventId: cycle.activeEventId });
    }
    try {
      const { ensureGvgReadinessBoardIfMissing } = await import('./discordAttendanceCards.js');
      await ensureGvgReadinessBoardIfMissing();
    } catch (err) {
      console.error('[war-room] GVG Readiness board sync failed:', err.message);
    }
  }

  if (cycle.currentPhase !== 3) return;

  const liveSnap = await db.ref('attendance/live_session').once('value');
  if (liveSnap.exists()) return;

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
