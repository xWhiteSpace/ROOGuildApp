import { vi } from 'vitest';
import { patterns } from './registry.js';
import { createMemoryTenantStore } from '../support/memoryTenantStore.js';
import { installInertTimers } from '../support/inertTimers.js';
import { runWithTenant, setCachedConfig, clearTenantCaches } from '../../backend/src/db/tenantContext.js';

patterns.in_process_create = 'used';
patterns.skip = 'used';
patterns.reject = 'used';
patterns.war_room_status = 'used';

const storeHolder = vi.hoisted(() => ({ store: null }));
const cycleHolder = vi.hoisted(() => ({ status: null }));
const httpCreateCalls = vi.hoisted(() => ({ n: 0 }));

vi.mock('../../backend/src/db/database.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getTenantStore: () => storeHolder.store,
    loadLiveSessionPulseMeta: async () => null,
    incrementLiveSessionPulse: vi.fn(async () => ({
      totalPulses: 1,
      userTallies: {},
      lastVoicePoll: { timestamp: Date.now(), presentUids: [] },
    })),
    touchSessionArchiveIndex: vi.fn(async () => undefined),
  };
});

vi.mock('../../backend/src/games/ragnarok-origin/raidTimeWindow.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, getRaidCycleStatus: () => cycleHolder.status };
});

vi.mock('../../backend/src/games/ragnarok-origin/services/discordAttendanceCards.js', () => ({
  ensureGvgReadinessBoardIfMissing: async () => undefined,
}));

vi.mock('../../backend/src/utils/discordRateLimit.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, isDiscordCircuitOpen: () => false };
});

const liveRaid = await import('../../backend/src/api/liveRaid.routes.js');
const warRoom = await import('../../backend/src/games/ragnarok-origin/services/warRoomAutomation.js');

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

function publishedFixture({ grids, warRooms } = {}) {
  return {
    attendance: {
      published: {
        '2026-10-06_evt1': {
          eventKey: 'evt1',
          eventDate: '2026-10-06',
          eventTitle: 'GvG Night',
          configId: 'cfg1',
          grids: grids || {
            'cfg1__tab_001': {
              parentConfigId: 'cfg1',
              slots_allocation: { '0-0': { userId: 'u1' } },
            },
          },
          selectedGridIds: ['cfg1'],
        },
      },
      compositions: {
        cfg1: {
          grids: {
            tab_001: { slots_allocation: { '0-0': { userId: 'u1' } } },
          },
        },
      },
    },
    settings: {
      configuration: {
        warRooms: warRooms || { wr1: { channelId: '123456789012345678' } },
      },
    },
    auction: { members: {} },
  };
}

function cycle(overrides = {}) {
  const now = Date.now();
  return {
    needsSetup: false,
    isForceLocked: false,
    activeEventId: 'evt1',
    activeEventTitle: 'GvG Night',
    currentPhase: 3,
    publishedId: '2026-10-06_evt1',
    configId: 'cfg1',
    warDate: '2026-10-06',
    warStartTime: '21:00',
    warRoomIds: ['wr1'],
    warStartsAt: now - 60_000,
    warEndsAt: now + 3_600_000,
    pollIntervalMinutes: 20,
    ...overrides,
  };
}

async function runAuto(tenantId = 'wr-auto') {
  clearTenantCaches(tenantId);
  setCachedConfig(tenantId, storeHolder.store.snapshot().settings.configuration);
  liveRaid.noteLiveSessionCleared();
  return runWithTenant(tenantId, () => warRoom.maybeRunWarRoomAutomation());
}

export async function readyPhase3CreatesInProcess() {
  const timers = installInertTimers();
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const publishedId = `2026-10-06_evt1_${suffix}`;
  const tenantId = `wr-create-${suffix}`;
  const fixture = publishedFixture();
  fixture.attendance.published[publishedId] = {
    ...fixture.attendance.published['2026-10-06_evt1'],
  };
  storeHolder.store = createMemoryTenantStore(fixture);
  const now = Date.now();
  cycleHolder.status = cycle({
    publishedId,
    warDate: `2026-10-${String(6 + (Date.now() % 3)).padStart(2, '0')}`,
    warStartsAt: now - 60_000,
    warEndsAt: now + 3_600_000,
    pollIntervalMinutes: 20,
  });
  httpCreateCalls.n = 0;
  try {
    await runAuto(tenantId);
    const session = storeHolder.store.snapshot().attendance?.live_session;
    const status = storeHolder.store.snapshot().attendance?.war_room_status;
    return {
      session,
      status,
      httpCreateCalls: httpCreateCalls.n,
      launchedBy: session?.launchedBy,
    };
  } finally {
    clearTickers();
    timers.restore();
    liveRaid.noteLiveSessionCleared();
  }
}

export async function skipNeedsSetup() {
  storeHolder.store = createMemoryTenantStore(publishedFixture());
  cycleHolder.status = cycle({ needsSetup: true });
  await runAuto('wr-skip-setup');
  return { session: storeHolder.store.snapshot().attendance?.live_session ?? null };
}

export async function skipForceLocked() {
  storeHolder.store = createMemoryTenantStore(publishedFixture());
  cycleHolder.status = cycle({ isForceLocked: true });
  await runAuto('wr-skip-lock');
  return { session: storeHolder.store.snapshot().attendance?.live_session ?? null };
}

export async function skipNoActiveEvent() {
  storeHolder.store = createMemoryTenantStore(publishedFixture());
  cycleHolder.status = cycle({ activeEventId: '' });
  await runAuto('wr-skip-evt');
  return { session: storeHolder.store.snapshot().attendance?.live_session ?? null };
}

export async function skipNonPhase3() {
  const timers = installInertTimers();
  storeHolder.store = createMemoryTenantStore(publishedFixture());
  cycleHolder.status = cycle({ currentPhase: 2 });
  try {
    await runAuto('wr-skip-phase');
    return { session: storeHolder.store.snapshot().attendance?.live_session ?? null };
  } finally {
    clearTickers();
    timers.restore();
  }
}

export async function skipExistingLiveSession() {
  const timers = installInertTimers();
  storeHolder.store = createMemoryTenantStore(publishedFixture());
  await storeHolder.store.ref('attendance/live_session').set({ status: 'Active', launchedBy: 'Prior' });
  liveRaid.noteLiveSessionStarted();
  cycleHolder.status = cycle();
  try {
    await runWithTenant('wr-skip-live', () => warRoom.maybeRunWarRoomAutomation());
    const session = storeHolder.store.snapshot().attendance.live_session;
    return { launchedBy: session?.launchedBy };
  } finally {
    clearTickers();
    timers.restore();
    liveRaid.noteLiveSessionCleared();
  }
}

export async function rejectDuplicateCreate() {
  const timers = installInertTimers();
  storeHolder.store = createMemoryTenantStore(publishedFixture());
  clearTenantCaches('wr-dup');
  setCachedConfig('wr-dup', { warRooms: { wr1: { channelId: '123456789012345678' } } });
  try {
    const first = await runWithTenant('wr-dup', () => liveRaid.createLiveRaidFromPublished({
      publishedId: '2026-10-06_evt1',
      selectedWarRoomIds: ['wr1'],
      launchedBy: 'War Room',
    }));
    const second = await runWithTenant('wr-dup', () => liveRaid.createLiveRaidFromPublished({
      publishedId: '2026-10-06_evt1',
      selectedWarRoomIds: ['wr1'],
      launchedBy: 'War Room',
    }));
    return { firstOk: first.ok, secondOk: second.ok, secondError: second.error };
  } finally {
    clearTickers();
    timers.restore();
    liveRaid.noteLiveSessionCleared();
  }
}

export async function rejectMissingPublishedOrGrids() {
  const timers = installInertTimers();
  storeHolder.store = createMemoryTenantStore({
    attendance: { published: {} },
    settings: { configuration: { warRooms: { wr1: { channelId: '123456789012345678' } } } },
  });
  try {
    const missingPub = await runWithTenant('wr-miss', () => liveRaid.createLiveRaidFromPublished({
      publishedId: 'nope',
      selectedWarRoomIds: ['wr1'],
    }));
    storeHolder.store = createMemoryTenantStore({
      attendance: {
        published: {
          '2026-10-06_evt1': {
            eventKey: 'evt1',
            eventDate: '2026-10-06',
            grids: {},
            selectedGridIds: [],
          },
        },
      },
      settings: { configuration: { warRooms: { wr1: { channelId: '123456789012345678' } } } },
    });
    const missingGrids = await runWithTenant('wr-miss', () => liveRaid.createLiveRaidFromPublished({
      publishedId: '2026-10-06_evt1',
      selectedWarRoomIds: ['wr1'],
    }));
    return { missingPub, missingGrids };
  } finally {
    clearTickers();
    timers.restore();
    liveRaid.noteLiveSessionCleared();
  }
}

export async function rejectCrossTabDuplicates() {
  const timers = installInertTimers();
  storeHolder.store = createMemoryTenantStore(publishedFixture({
    grids: {
      'cfg1__tab_001': { parentConfigId: 'cfg1', slots_allocation: { '0-0': { userId: 'u1' } } },
      'cfg1__tab_002': { parentConfigId: 'cfg1', slots_allocation: { '1-0': { userId: 'u1' } } },
    },
  }));
  try {
    const result = await runWithTenant('wr-xdup', () => liveRaid.createLiveRaidFromPublished({
      publishedId: '2026-10-06_evt1',
      selectedWarRoomIds: ['wr1'],
    }));
    return result;
  } finally {
    clearTickers();
    timers.restore();
    liveRaid.noteLiveSessionCleared();
  }
}

export async function rejectUnresolvedWarRooms() {
  const timers = installInertTimers();
  storeHolder.store = createMemoryTenantStore(publishedFixture({
    warRooms: { wr1: { channelId: 'not-a-snowflake' } },
  }));
  clearTenantCaches('wr-badch');
  setCachedConfig('wr-badch', { warRooms: { wr1: { channelId: 'not-a-snowflake' } } });
  try {
    const result = await runWithTenant('wr-badch', () => liveRaid.createLiveRaidFromPublished({
      publishedId: '2026-10-06_evt1',
      selectedWarRoomIds: ['wr1'],
    }));
    return result;
  } finally {
    clearTickers();
    timers.restore();
    liveRaid.noteLiveSessionCleared();
  }
}
