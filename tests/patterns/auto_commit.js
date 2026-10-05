import { vi } from 'vitest';
import { patterns } from './registry.js';
import { withEnv } from './envSandbox.js';
import { createMemoryTenantStore, auctionRequestsFromStore } from '../support/memoryTenantStore.js';
import { runWithTenant } from '../../backend/src/db/tenantContext.js';

patterns.auto_commit = 'used';
patterns.shared_writer = 'used';

const TENANT_ID = 'auto-tenant-1';
const CONFIG = {
  timezone: 'Asia/Manila',
  isForceLocked: false,
  items: [{ id: 'puppet', name: 'Puppet' }],
  events: {
    evt1: {
      title: 'Weekly',
      loots: { puppet: 2 },
      phases: {
        3: { dayEnd: 0, timeEnd: '12:00' },
      },
    },
  },
};

const commitMock = vi.hoisted(() => ({
  impl: vi.fn(async () => undefined),
  fail: false,
}));

const storeHolder = vi.hoisted(() => ({ store: null }));

vi.mock('../../backend/src/games/ragnarok-origin/timeWindow.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getGateStatusDetails: () => ({
      isGateOpen: false,
      currentPhase: 3,
      activeEventId: 'evt1',
      timezone: 'Asia/Manila',
      activeEventTitle: 'Weekly',
      eventName: 'Weekly',
      currentSessionLabel: '',
      nextStatusChangeMessage: '',
      phaseIntervals: {},
      helpEmbedUrl: '',
      announcementMinutes: { phase1: [], phase2: null, phase3: null },
    }),
    readTenantConfiguration: async () => CONFIG,
  };
});

vi.mock('../../backend/src/utils/guildTime.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    // triggerMinute = (12:00 week-min on day 0) - 1 = 719; distance 0 ⇒ due
    getGuildWeekMinute: () => ({ absMinute: 719, dateStr: '2026-10-04' }),
  };
});

vi.mock('../../backend/src/db/database.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getTenantStore: () => storeHolder.store,
    loadAuctionRequests: async (filters) => auctionRequestsFromStore(storeHolder.store, filters),
  };
});

vi.mock('../../backend/src/api/request.routes.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    performCommitSession: async (...args) => {
      if (commitMock.fail) throw new Error('commit blew up');
      return commitMock.impl(...args);
    },
  };
});

const { maybeAutoCommitAuction } = await import('../../backend/src/discord-bot/autoCommitAuction.js');

function seedArmed() {
  commitMock.fail = false;
  commitMock.impl.mockClear();
  storeHolder.store = createMemoryTenantStore({
    settings: { configuration: CONFIG },
    auction: {
      members: { '111': { displayName: 'Ada', status: 'Active' } },
      web_requests: {
        p1: {
          id: 'p1',
          userId: '111',
          itemId: 'puppet',
          item: 'Puppet',
          quantity: 1,
          applicationStatus: 'Requested',
          selectionStatus: 'Pending',
        },
      },
      active_session: {
        autoCommitArmed: true,
        lootSummary: { puppet: { qty: 1, limit: 2, seats: 1 } },
        categoryAllocations: { puppet: { selected: ['111'] } },
        initialWinnersByItem: { puppet: ['111'] },
      },
    },
    scheduler: { auto_commit: {} },
  });
}

export async function dueSchedulerCallsSharedWriter() {
  return withEnv({}, async () => {
    seedArmed();
    await runWithTenant(TENANT_ID, () => maybeAutoCommitAuction());
    return {
      calls: commitMock.impl.mock.calls,
      callCount: commitMock.impl.mock.calls.length,
    };
  });
}

export async function commitFailureLoggedNoSwitch() {
  return withEnv({}, async () => {
    seedArmed();
    commitMock.fail = true;
    const errors = [];
    const spy = vi.spyOn(console, 'error').mockImplementation((...a) => { errors.push(a.map(String).join(' ')); });
    try {
      await runWithTenant(TENANT_ID, () => maybeAutoCommitAuction());
    } finally {
      spy.mockRestore();
    }
    const marker = storeHolder.store.snapshot()?.scheduler?.auto_commit || {};
    return { errors, marker, callCount: commitMock.impl.mock.calls.length };
  });
}
