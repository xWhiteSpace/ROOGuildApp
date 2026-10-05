import { vi } from 'vitest';
import { patterns } from './registry.js';
import { createMemoryTenantStore } from '../support/memoryTenantStore.js';
import { installInertTimers } from '../support/inertTimers.js';
import { runWithTenant } from '../../backend/src/db/tenantContext.js';

patterns.boot_rearm = 'used';
patterns.past_window_archive = 'used';
patterns.boot_noop = 'used';

const storeHolder = vi.hoisted(() => ({ store: null }));
const metaHolder = vi.hoisted(() => ({ meta: null }));

vi.mock('../../backend/src/db/database.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getTenantStore: () => storeHolder.store,
    loadLiveSessionPulseMeta: async () => metaHolder.meta,
    incrementLiveSessionPulse: vi.fn(async () => ({
      totalPulses: 1,
      userTallies: {},
      lastVoicePoll: { timestamp: Date.now(), presentUids: [] },
    })),
    touchSessionArchiveIndex: vi.fn(async () => undefined),
  };
});

vi.mock('../../backend/src/utils/discordRateLimit.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, isDiscordCircuitOpen: () => false };
});

const liveRaid = await import('../../backend/src/api/liveRaid.routes.js');

function clearTickers() {
  if (global.liveRaidIntervalTicker) {
    clearInterval(global.liveRaidIntervalTicker);
    global.liveRaidIntervalTicker = undefined;
  }
  if (global.monitoringSchedulerTicker) {
    clearInterval(global.monitoringSchedulerTicker);
    global.monitoringSchedulerTicker = undefined;
  }
}

export async function rearmActiveInWindow() {
  const timers = installInertTimers();
  const now = Date.now();
  metaHolder.meta = {
    status: 'Active',
    monitoringStartsAt: now - 60_000,
    monitoringEndsAt: now + 3_600_000,
    pollIntervalMinutes: 15,
    selectedWarRooms: ['123456789012345678'],
    selectedWarRoomIds: ['wr1'],
  };
  storeHolder.store = createMemoryTenantStore({
    attendance: { live_session: { ...metaHolder.meta, userTallies: {}, totalPulses: 0 } },
    settings: { configuration: { warRooms: { wr1: { channelId: '123456789012345678' } } } },
  });
  try {
    await runWithTenant('boot-rearm-tenant', () => liveRaid.resumeLiveRaidMonitoringIfNeeded());
    const armed = timers.intervals.some((t) => t.ms === 15 * 60 * 1000)
      || Boolean(global.liveRaidIntervalTicker)
      || timers.intervals.length > 0;
    // Honesty: ArmLiveRaidMonitoringSchedule is private; seam is resume → startTicker / scheduler.
    return {
      armed,
      intervalMs: timers.intervals.map((t) => t.ms),
      meta: metaHolder.meta,
    };
  } finally {
    clearTickers();
    timers.restore();
    liveRaid.noteLiveSessionCleared();
  }
}

export async function pastWindowArchivesNoRearm() {
  const timers = installInertTimers();
  const now = Date.now();
  metaHolder.meta = {
    status: 'Active',
    monitoringStartsAt: now - 3_600_000,
    monitoringEndsAt: now - 60_000,
    pollIntervalMinutes: 15,
    selectedWarRooms: ['123456789012345678'],
    selectedWarRoomIds: ['wr1'],
  };
  storeHolder.store = createMemoryTenantStore({
    attendance: {
      live_session: {
        ...metaHolder.meta,
        eventDate: '2026-10-06',
        eventKey: 'evt1',
        eventTitle: 'GvG',
        grids: {},
        userTallies: {},
        totalPulses: 2,
        launchedBy: 'Officer',
      },
    },
    auction: { members: {} },
    settings: { configuration: { attendancePresentThreshold: 75, warRooms: {} } },
  });
  try {
    await runWithTenant('boot-past-tenant', () => liveRaid.resumeLiveRaidMonitoringIfNeeded());
    const snap = storeHolder.store.snapshot();
    const archives = snap?.attendance?.session_archive || {};
    return {
      liveSession: snap?.attendance?.live_session ?? null,
      archiveCount: Object.keys(archives).length,
      tickerRunning: Boolean(global.liveRaidIntervalTicker),
      intervalCount: timers.intervals.length,
    };
  } finally {
    clearTickers();
    timers.restore();
    liveRaid.noteLiveSessionCleared();
  }
}

export async function noopMissingOrInactive() {
  const timers = installInertTimers();
  try {
    metaHolder.meta = null;
    storeHolder.store = createMemoryTenantStore({});
    await runWithTenant('boot-noop-1', () => liveRaid.resumeLiveRaidMonitoringIfNeeded());
    const noMeta = {
      ticker: Boolean(global.liveRaidIntervalTicker),
      archives: Object.keys(storeHolder.store.snapshot()?.attendance?.session_archive || {}).length,
    };

    metaHolder.meta = {
      status: 'Active',
      monitoringStartsAt: null,
      monitoringEndsAt: Date.now() + 1000,
      pollIntervalMinutes: 15,
    };
    await runWithTenant('boot-noop-2', () => liveRaid.resumeLiveRaidMonitoringIfNeeded());
    const missingFields = {
      ticker: Boolean(global.liveRaidIntervalTicker),
      archives: Object.keys(storeHolder.store.snapshot()?.attendance?.session_archive || {}).length,
    };

    metaHolder.meta = { status: 'Ended', monitoringStartsAt: 1, monitoringEndsAt: 2, pollIntervalMinutes: 15 };
    await runWithTenant('boot-noop-3', () => liveRaid.resumeLiveRaidMonitoringIfNeeded());
    const inactive = {
      ticker: Boolean(global.liveRaidIntervalTicker),
      archives: Object.keys(storeHolder.store.snapshot()?.attendance?.session_archive || {}).length,
    };

    return { noMeta, missingFields, inactive, intervalCount: timers.intervals.length };
  } finally {
    clearTickers();
    timers.restore();
    liveRaid.noteLiveSessionCleared();
  }
}
