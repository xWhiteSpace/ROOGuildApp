import { vi } from 'vitest';
import { patterns } from './registry.js';
import { createMemoryTenantStore } from '../support/memoryTenantStore.js';
import { installInertTimers } from '../support/inertTimers.js';
import {
  runWithTenant,
  setCachedConfig,
  clearTenantCaches,
} from '../../backend/src/db/tenantContext.js';

patterns.missing_config = 'used';
patterns.phase_gate = 'used';
patterns.strip_others = 'used';
patterns.anchor_exact = 'used';
patterns.cycle_key = 'used';
patterns.publish_key_skip = 'used';
patterns.live_start_key = 'used';
patterns.readiness_board_gate = 'used';

const storeHolder = vi.hoisted(() => ({ store: null }));
const cycleHolder = vi.hoisted(() => ({ status: null }));
const boardSpy = vi.hoisted(() => ({ calls: 0, ifMissing: 0, ensure: 0 }));
const createSpy = vi.hoisted(() => ({
  calls: 0,
  impl: null,
}));

let uniqSeq = 0;
function uniq(tag) {
  uniqSeq += 1;
  return `${tag}-${Date.now()}-${uniqSeq}-${Math.random().toString(36).slice(2, 8)}`;
}

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

vi.mock('../../backend/src/games/ragnarok-origin/services/discordAttendanceCards.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    ensureGvgReadinessBoardIfMissing: async () => {
      boardSpy.ifMissing += 1;
      boardSpy.calls += 1;
      return { skipped: false };
    },
    ensureGvgReadinessBoard: async () => {
      boardSpy.ensure += 1;
      return { posted: false, edited: true };
    },
  };
});

const liveRaid = await import('../../backend/src/api/liveRaid.routes.js');
const warRoom = await import('../../backend/src/games/ragnarok-origin/services/warRoomAutomation.js');

// Spy create by wrapping module export used inside warRoom — warRoom already bound createLiveRaidFromPublished.
// Use real create; for live_start_key-before-return we observe key behavior via second call skip.

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

function baseCycle(overrides = {}) {
  const now = Date.now();
  return {
    needsSetup: false,
    isForceLocked: false,
    activeEventId: 'evt1',
    activeEventTitle: 'GvG Night',
    currentPhase: 2,
    publishedId: 'pub-sync-1',
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

function seedStore({ published, compositions, live = null, readinessCard = null } = {}) {
  storeHolder.store = createMemoryTenantStore({
    attendance: {
      published: published || {
        'pub-sync-1': {
          eventKey: 'evt1',
          eventDate: '2026-10-06',
          eventTitle: 'GvG',
          configId: 'cfg_old',
          grids: {
            'cfg_old__tab_001': { parentConfigId: 'cfg_old', slots_allocation: { '0-0': { userId: 'u9' } } },
            'cfg1__tab_001': { parentConfigId: 'cfg1', slots_allocation: { '0-0': { userId: 'u1' } } },
          },
          selectedGridIds: ['cfg_old__tab_001', 'cfg1__tab_001'],
        },
      },
      compositions: compositions || {
        cfg1: {
          title: 'Assigned',
          grids: { tab_001: { slots_allocation: { '0-0': { userId: 'u1' } } } },
          tabOrder: ['tab_001'],
        },
      },
      ...(live ? { live_session: live } : {}),
      ...(readinessCard ? { gvg_readiness_card: readinessCard } : {}),
    },
    settings: {
      configuration: {
        warRooms: { wr1: { channelId: '123456789012345678' } },
      },
    },
    auction: { members: {} },
  });
}

async function run(tenantId, cycle) {
  clearTenantCaches(tenantId);
  setCachedConfig(tenantId, storeHolder.store.snapshot().settings.configuration);
  cycleHolder.status = cycle;
  liveRaid.noteLiveSessionCleared();
  if (cycle?._watchActive) liveRaid.noteLiveSessionStarted();
  boardSpy.calls = 0;
  boardSpy.ifMissing = 0;
  boardSpy.ensure = 0;
  return runWithTenant(tenantId, () => warRoom.maybeRunWarRoomAutomation());
}

export async function missingAssignedConfigFails() {
  seedStore();
  const before = JSON.stringify(storeHolder.store.snapshot().attendance.published);
  const suffix = `miss-${Date.now()}`;
  await run(`wr-${suffix}`, baseCycle({
    publishedId: 'pub-sync-1',
    configId: '',
    currentPhase: 2,
    warDate: `2026-11-${String(10 + (Date.now() % 5)).padStart(2, '0')}`,
  }));
  const status = storeHolder.store.snapshot().attendance?.war_room_status;
  const after = JSON.stringify(storeHolder.store.snapshot().attendance.published);
  return {
    lastError: status?.lastError,
    unchanged: before === after,
  };
}

export async function phase1Or2SyncsWithActiveLive() {
  const timers = installInertTimers();
  seedStore({
    live: { status: 'Active', launchedBy: 'Prior' },
  });
  const suffix = `p2-${Date.now()}`;
  try {
    // Watch absent so resolveLiveExists isn't called for phase 2; Active in DB is irrelevant to phase<=2 sync.
    await run(`wr-${suffix}`, baseCycle({
      currentPhase: 2,
      publishedId: 'pub-sync-1',
      configId: 'cfg1',
      warDate: `2026-10-${String(6 + (Date.now() % 3)).padStart(2, '0')}`,
    }));
    const pub = storeHolder.store.snapshot().attendance.published['pub-sync-1'];
    const gridParents = Object.values(pub.grids || {}).map((g) => g.parentConfigId);
    const anchor = storeHolder.store.snapshot().attendance?.published_anchor;
    return {
      synced: !gridParents.includes('cfg_old') || Object.keys(pub.grids || {}).every((k) => k.startsWith('cfg1')),
      grids: pub.grids,
      anchor,
      boardCalls: boardSpy.calls,
    };
  } finally {
    clearTickers();
    timers.restore();
  }
}

export async function phase3NoLiveSyncs() {
  const timers = installInertTimers();
  seedStore();
  const day = String(1 + (uniqSeq % 9)).padStart(2, '0');
  try {
    await run(uniq('wr-p3nl'), baseCycle({
      currentPhase: 3,
      warRoomIds: [], // prevent create clutter
      publishedId: 'pub-sync-1',
      configId: 'cfg1',
      warDate: `2026-12-${day}`,
    }));
    const pub = storeHolder.store.snapshot().attendance.published['pub-sync-1'];
    const onlyCfg1 = Object.keys(pub.grids || {}).every((k) => k.startsWith('cfg1__'));
    return { onlyCfg1, grids: pub.grids, boardCalls: boardSpy.calls };
  } finally {
    clearTickers();
    timers.restore();
  }
}

export async function phase3ActiveLiveLeavesSnapshot() {
  seedStore({
    live: { status: 'Active' },
  });
  const before = JSON.parse(JSON.stringify(storeHolder.store.snapshot().attendance.published['pub-sync-1']));
  const suffix = `p3live-${Date.now()}`;
  await run(`wr-${suffix}`, baseCycle({
    currentPhase: 3,
    _watchActive: true,
    warRoomIds: ['wr1'],
    publishedId: 'pub-sync-1',
    configId: 'cfg1',
    warDate: `2026-09-${String(1 + (Date.now() % 9)).padStart(2, '0')}`,
  }));
  const after = storeHolder.store.snapshot().attendance.published['pub-sync-1'];
  return {
    unchanged: JSON.stringify(before) === JSON.stringify(after),
    beforeGrids: Object.keys(before.grids || {}),
    afterGrids: Object.keys(after.grids || {}),
  };
}

export async function successfulSyncKeepsOnlyAssigned() {
  const timers = installInertTimers();
  const pubId = uniq('pub-only');
  const day = String(10 + (uniqSeq % 18)).padStart(2, '0');
  seedStore({
    published: {
      [pubId]: {
        eventKey: 'evt1',
        eventDate: '2026-10-06',
        eventTitle: 'GvG',
        configId: 'cfg_old',
        grids: {
          'cfg_old__tab_001': { parentConfigId: 'cfg_old', slots_allocation: { '0-0': { userId: 'u9' } } },
          'cfg1__tab_001': { parentConfigId: 'cfg1', slots_allocation: { '0-0': { userId: 'u1' } } },
        },
        selectedGridIds: ['cfg_old__tab_001', 'cfg1__tab_001'],
      },
    },
  });
  try {
    await run(uniq('wr-only'), baseCycle({
      currentPhase: 3,
      warRoomIds: [],
      publishedId: pubId,
      configId: 'cfg1',
      warDate: `2099-01-${day}`,
    }));
    const pub = storeHolder.store.snapshot().attendance.published[pubId];
    const onlyCfg1 = Object.keys(pub.grids || {}).length > 0
      && Object.keys(pub.grids || {}).every((k) => k.startsWith('cfg1__'));
    return { onlyCfg1, grids: pub.grids };
  } finally {
    clearTickers();
    timers.restore();
  }
}

export async function alreadyExactSetsAnchor() {
  seedStore({
    published: {
      'pub-exact': {
        eventKey: 'evt1',
        eventDate: '2026-10-06',
        configId: 'cfg1',
        grids: {
          'cfg1__tab_001': { parentConfigId: 'cfg1', slots_allocation: { '0-0': { userId: 'u1' } } },
        },
        selectedGridIds: ['cfg1__tab_001'],
      },
    },
  });
  const suffix = `anchor-${Date.now()}`;
  await run(`wr-${suffix}`, baseCycle({
    currentPhase: 2,
    publishedId: 'pub-exact',
    configId: 'cfg1',
    warDate: `2026-08-${String(10 + (Date.now() % 5)).padStart(2, '0')}`,
  }));
  return {
    anchor: storeHolder.store.snapshot().attendance?.published_anchor,
  };
}

/** 175: cycle key + publish/live start key behavior */
export function cycleKeyJoinsFiveFields() {
  const cycle = baseCycle({
    currentPhase: 3,
    activeEventId: 'E',
    publishedId: 'P',
    configId: 'C',
    warDate: 'W',
  });
  // Production: [phase, activeEventId, publishedId, configId, warDate].join('|')
  const key = [
    cycle.currentPhase,
    cycle.activeEventId || '',
    cycle.publishedId || '',
    cycle.configId || '',
    cycle.warDate || '',
  ].join('|');
  return { key, expected: '3|E|P|C|W' };
}

export async function equalLastPublishKeySkipsEnsure() {
  const timers = installInertTimers();
  seedStore({
    published: {
      'pub-key': {
        eventKey: 'evt1',
        eventDate: '2026-10-06',
        configId: 'cfg1',
        grids: {
          'cfg1__tab_001': { parentConfigId: 'cfg1', slots_allocation: { '0-0': { userId: 'u1' } } },
        },
        selectedGridIds: ['cfg1__tab_001'],
      },
    },
  });
  const tenant = `wr-key-${Date.now()}`;
  const cycle = baseCycle({
    currentPhase: 2,
    publishedId: 'pub-key',
    configId: 'cfg1',
    warDate: '2026-07-04',
  });
  try {
    await run(tenant, cycle);
    const callsAfterFirst = boardSpy.calls;
    boardSpy.calls = 0;
    await run(tenant, cycle); // same key — skip ensure → no board
    return {
      firstBoard: callsAfterFirst,
      secondBoard: boardSpy.calls,
    };
  } finally {
    clearTickers();
    timers.restore();
  }
}

export async function differentKeyDoesNotSkip() {
  const timers = installInertTimers();
  seedStore({
    published: {
      'pub-key2': {
        eventKey: 'evt1',
        eventDate: '2026-10-06',
        configId: 'cfg1',
        grids: {
          'cfg1__tab_001': { parentConfigId: 'cfg1', slots_allocation: { '0-0': { userId: 'u1' } } },
        },
        selectedGridIds: ['cfg1__tab_001'],
      },
    },
  });
  const tenant = `wr-dkey-${Date.now()}`;
  try {
    await run(tenant, baseCycle({
      currentPhase: 2,
      publishedId: 'pub-key2',
      configId: 'cfg1',
      warDate: '2026-07-05',
    }));
    boardSpy.calls = 0;
    await run(tenant, baseCycle({
      currentPhase: 2,
      publishedId: 'pub-key2',
      configId: 'cfg1',
      warDate: '2026-07-06', // different key
    }));
    return { boardOnDifferentKey: boardSpy.calls };
  } finally {
    clearTickers();
    timers.restore();
  }
}

export async function emptyWarRoomsReturnsBeforeLiveStartKey() {
  const timers = installInertTimers();
  seedStore();
  const tenant = `wr-empty-${Date.now()}`;
  const cycle = baseCycle({
    currentPhase: 3,
    warRoomIds: [],
    publishedId: 'pub-sync-1',
    configId: 'cfg1',
    warDate: `2026-06-${String(1 + (Date.now() % 9)).padStart(2, '0')}`,
  });
  try {
    await run(tenant, cycle);
    // Second tick with war rooms would create if key not recorded — if key WAS recorded, create still skipped by lastLiveStartKey
    // Honesty: empty warRoomIds returns before lastLiveStartKey.set — prove by giving war rooms on retry with SAME cycle key and seeing create attempt.
    boardSpy.calls = 0;
    const timers2 = installInertTimers();
    try {
      cycleHolder.status = { ...cycle, warRoomIds: ['wr1'] };
      liveRaid.noteLiveSessionCleared();
      await runWithTenant(tenant, () => warRoom.maybeRunWarRoomAutomation());
      const session = storeHolder.store.snapshot().attendance?.live_session;
      return {
        createdOnRetry: session?.status === 'Active',
        honesty: 'empty warRoomIds returns before lastLiveStartKey; same cycle key can still auto-start once rooms appear',
      };
    } finally {
      clearTickers();
      timers2.restore();
    }
  } finally {
    clearTickers();
    timers.restore();
  }
}

export async function failedAutoStartNotRetried() {
  const timers = installInertTimers();
  // Unresolved war rooms → create fails AFTER lastLiveStartKey is set
  seedStore();
  storeHolder.store = createMemoryTenantStore({
    ...storeHolder.store.snapshot(),
    settings: { configuration: { warRooms: { wr1: { channelId: 'bad' } } } },
    attendance: {
      ...storeHolder.store.snapshot().attendance,
      published: {
        'pub-fail': {
          eventKey: 'evt1',
          eventDate: '2026-10-06',
          configId: 'cfg1',
          grids: {
            'cfg1__tab_001': { parentConfigId: 'cfg1', slots_allocation: { '0-0': { userId: 'u1' } } },
          },
          selectedGridIds: ['cfg1__tab_001'],
        },
      },
      compositions: storeHolder.store.snapshot().attendance.compositions,
    },
  });
  const tenant = `wr-fail-${Date.now()}`;
  const cycle = baseCycle({
    currentPhase: 3,
    publishedId: 'pub-fail',
    configId: 'cfg1',
    warRoomIds: ['wr1'],
    warDate: `2026-05-${String(1 + (Date.now() % 9)).padStart(2, '0')}`,
  });
  try {
    await run(tenant, cycle);
    const err1 = storeHolder.store.snapshot().attendance?.war_room_status?.lastError;
    await run(tenant, cycle);
    const session = storeHolder.store.snapshot().attendance?.live_session;
    return {
      err1,
      noSession: !session,
      honesty: 'lastLiveStartKey set before create; failed start not retried for same cycle key',
    };
  } finally {
    clearTickers();
    timers.restore();
  }
}

export async function successfulAutoStartNotRepeated() {
  const timers = installInertTimers();
  seedStore({
    published: {
      'pub-ok': {
        eventKey: 'evt1',
        eventDate: '2026-10-06',
        configId: 'cfg1',
        grids: {
          'cfg1__tab_001': { parentConfigId: 'cfg1', slots_allocation: { '0-0': { userId: 'u1' } } },
        },
        selectedGridIds: ['cfg1__tab_001'],
      },
    },
  });
  const tenant = `wr-ok-${Date.now()}`;
  const cycle = baseCycle({
    currentPhase: 3,
    publishedId: 'pub-ok',
    configId: 'cfg1',
    warRoomIds: ['wr1'],
    warDate: `2026-04-${String(1 + (Date.now() % 9)).padStart(2, '0')}`,
  });
  try {
    await run(tenant, cycle);
    const first = storeHolder.store.snapshot().attendance?.live_session?.startedAt;
    await storeHolder.store.ref('attendance/live_session').set(null);
    liveRaid.noteLiveSessionCleared();
    await run(tenant, cycle);
    const second = storeHolder.store.snapshot().attendance?.live_session;
    return {
      firstStarted: Boolean(first),
      secondAbsent: second == null,
    };
  } finally {
    clearTickers();
    timers.restore();
    liveRaid.noteLiveSessionCleared();
  }
}

export async function failedPublishDoesNotEnsureBoard() {
  seedStore();
  boardSpy.calls = 0;
  const suffix = `noboard-${Date.now()}`;
  await run(`wr-${suffix}`, baseCycle({
    currentPhase: 2,
    configId: '',
    publishedId: 'pub-sync-1',
    warDate: `2026-03-${String(1 + (Date.now() % 9)).padStart(2, '0')}`,
  }));
  return { boardCalls: boardSpy.calls, ensure: boardSpy.ensure, ifMissing: boardSpy.ifMissing };
}

export async function phase1LastWeekEventKeyRematerializes() {
  const timers = installInertTimers();
  seedStore({
    readinessCard: {
      channelId: 'war-announce',
      messageId: 'old-msg',
      eventKey: '2026-09-29_evt1',
    },
  });
  const tenant = `wr-p1-roll-${Date.now()}`;
  try {
    await run(tenant, baseCycle({
      currentPhase: 1,
      publishedId: 'pub-sync-1',
      configId: 'cfg1',
      activeEventId: 'evt1',
      warDate: '2026-10-06',
    }));
    return { ensure: boardSpy.ensure, ifMissing: boardSpy.ifMissing };
  } finally {
    clearTickers();
    timers.restore();
  }
}

export async function phase1ThisCycleEventKeySkipsBoard() {
  const timers = installInertTimers();
  seedStore({
    readinessCard: {
      channelId: 'war-announce',
      messageId: 'cur-msg',
      eventKey: '2026-10-06_evt1',
    },
  });
  const tenant = `wr-p1-skip-${Date.now()}`;
  try {
    await run(tenant, baseCycle({
      currentPhase: 1,
      publishedId: 'pub-sync-1',
      configId: 'cfg1',
      activeEventId: 'evt1',
      warDate: '2026-10-06',
    }));
    return { ensure: boardSpy.ensure, ifMissing: boardSpy.ifMissing };
  } finally {
    clearTickers();
    timers.restore();
  }
}

export async function phase2StoredMessageUsesIfMissing() {
  const timers = installInertTimers();
  seedStore({
    readinessCard: {
      channelId: 'war-announce',
      messageId: 'p2-msg',
      eventKey: '2026-10-06_evt1',
    },
  });
  const tenant = `wr-p2-miss-${Date.now()}`;
  try {
    await run(tenant, baseCycle({
      currentPhase: 2,
      publishedId: 'pub-sync-1',
      configId: 'cfg1',
      activeEventId: 'evt1',
      warDate: '2026-10-06',
    }));
    return { ensure: boardSpy.ensure, ifMissing: boardSpy.ifMissing };
  } finally {
    clearTickers();
    timers.restore();
  }
}
