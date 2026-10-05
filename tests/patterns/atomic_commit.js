import { vi } from 'vitest';
import { patterns } from './registry.js';
import { withEnv } from './envSandbox.js';
import { createMemoryTenantStore, auctionRequestsFromStore } from '../support/memoryTenantStore.js';
import { runWithTenant } from '../../backend/src/db/tenantContext.js';
import { dispatch } from '../support/dispatch.js';

patterns.atomic_commit = 'used';
patterns.status_flip = 'used';
patterns.supersede_pending = 'used';

const TENANT_ID = 'commit-tenant-1';
const CONFIG = {
  timezone: 'Asia/Manila',
  adminRoles: ['Officer'],
  items: [{ id: 'puppet', name: 'Puppet', colorTheme: 'slate', isHighValue: true }],
  events: { evt1: { title: 'Weekly', loots: { puppet: 2 } } },
};

const storeHolder = vi.hoisted(() => ({ store: null, failUpdate: false }));

vi.mock('../../backend/src/games/ragnarok-origin/timeWindow.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getGateStatusDetails: () => ({
      isGateOpen: true,
      currentPhase: 1,
      activeEventId: 'evt1',
      timezone: 'Asia/Manila',
      currentSessionLabel: '',
      nextStatusChangeMessage: '',
      phaseIntervals: {},
      activeEventTitle: 'Weekly',
      helpEmbedUrl: '',
      announcementMinutes: { phase1: [], phase2: null, phase3: null },
    }),
    readTenantConfiguration: async () => CONFIG,
  };
});

vi.mock('../../backend/src/db/database.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getTenantStore: () => {
      const store = storeHolder.store;
      if (!storeHolder.failUpdate) return store;
      const inner = store.ref.bind(store);
      return {
        ...store,
        ref(path = '') {
          const r = inner(path);
          if (!path || path === '' || path === '/') {
            return {
              ...r,
              async update(patch) {
                throw new Error('simulated commit conflict');
              },
            };
          }
          return r;
        },
      };
    },
    loadAuctionRequests: async (filters) => auctionRequestsFromStore(storeHolder.store, filters),
  };
});

vi.mock('../../backend/src/db/tenants.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getTenant: async () => ({
      id: TENANT_ID,
      owner_discord_id: 'officer-1',
      enabled_games: ['ragnarok-origin'],
    }),
    loadTenantSettings: async () => ({ configuration: CONFIG, discordChannels: {} }),
  };
});

const requestMod = await import('../../backend/src/api/request.routes.js');
const { performCommitSession } = requestMod;
const requestRoutes = requestMod.default;

function baseSeed(extraRequests = {}) {
  storeHolder.failUpdate = false;
  storeHolder.store = createMemoryTenantStore({
    settings: { configuration: CONFIG },
    auction: {
      members: {
        '111': { displayName: 'Ada', status: 'Active' },
        '222': { displayName: 'Ben', status: 'Active' },
      },
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
        p0: {
          id: 'p0',
          userId: '111',
          itemId: 'puppet',
          item: 'Puppet',
          quantity: 1,
          applicationStatus: 'Requested',
          selectionStatus: 'Pending',
        },
        ...extraRequests,
      },
      active_session: {
        version: 1,
        lastUpdated: Date.now(),
        lootSummary: { puppet: { qty: 1, limit: 2, seats: 1 } },
        categoryAllocations: { puppet: { selected: ['111'] } },
        autoCommitArmed: false,
      },
      loot_history: {},
      past_auctions: {},
    },
  });
}

function officerSession() {
  return {
    user: {
      id: 'officer-1',
      username: 'Officer',
      displayName: 'Officer',
      currentTenantId: TENANT_ID,
      isOfficer: true,
      roles: ['Officer'],
    },
    currentTenantId: TENANT_ID,
  };
}

function memberSession() {
  return {
    user: {
      id: 'member-1',
      username: 'Member',
      displayName: 'Member',
      currentTenantId: TENANT_ID,
      isOfficer: false,
      roles: ['Member'],
    },
    currentTenantId: TENANT_ID,
  };
}

const summary = { puppet: { qty: 1, limit: 2, seats: 1 } };

export async function officerCommitWritesBundle() {
  return withEnv({}, async () => {
    baseSeed();
    const allocations = {
      puppet: {
        selected: [{ userId: '111', name: 'Ada', slots: 1 }],
        absent: [],
        notSelected: [],
      },
    };
    await runWithTenant(TENANT_ID, () => performCommitSession({
      event: 'Weekly',
      date: '10/04/2026',
      allocations,
      summary,
    }));
    const snap = storeHolder.store.snapshot();
    return {
      lootHistory: snap.auction?.loot_history || {},
      pastAuctions: snap.auction?.past_auctions || {},
      webRequests: storeHolder.store.webRequests(),
      activeSession: storeHolder.store.activeSession(),
    };
  });
}

export async function commitConflictNoPartial() {
  return withEnv({}, async () => {
    baseSeed();
    storeHolder.failUpdate = true;
    const before = storeHolder.store.snapshot();
    let error = null;
    try {
      await runWithTenant(TENANT_ID, () => performCommitSession({
        event: 'Weekly',
        date: '10/04/2026',
        allocations: {
          puppet: {
            selected: [{ userId: '111', name: 'Ada', slots: 1 }],
            absent: [],
            notSelected: [],
          },
        },
        summary,
      }));
    } catch (err) {
      error = err;
    }
    storeHolder.failUpdate = false;
    return { error, before, after: storeHolder.store.snapshot() };
  });
}

export async function forcedAddWinnerWithoutPending() {
  return withEnv({}, async () => {
    baseSeed();
    // clear pending for winner 333
    await runWithTenant(TENANT_ID, () => performCommitSession({
      event: 'Weekly',
      date: '10/04/2026',
      allocations: {
        puppet: {
          selected: [{ userId: '333', name: 'Cara', slots: 1 }],
          absent: [],
          notSelected: [],
        },
      },
      summary,
    }));
    return { webRequests: storeHolder.store.webRequests() };
  });
}

export async function selectedPendingNotForcedAdd() {
  return withEnv({}, async () => {
    baseSeed();
    await runWithTenant(TENANT_ID, () => performCommitSession({
      event: 'Weekly',
      date: '10/04/2026',
      allocations: {
        puppet: {
          selected: [{ userId: '111', name: 'Ada', slots: 1 }],
          absent: [],
          notSelected: [],
        },
      },
      summary,
    }));
    return { webRequests: storeHolder.store.webRequests() };
  });
}

export async function absentAndNotSelectedAndSupersede() {
  return withEnv({}, async () => {
    baseSeed({
      b1: {
        id: 'b1',
        userId: '222',
        itemId: 'puppet',
        item: 'Puppet',
        quantity: 1,
        applicationStatus: 'Requested',
        selectionStatus: 'Pending',
      },
      b0: {
        id: 'b0',
        userId: '222',
        itemId: 'puppet',
        item: 'Puppet',
        quantity: 1,
        applicationStatus: 'Requested',
        selectionStatus: 'Pending',
      },
    });
    await runWithTenant(TENANT_ID, () => performCommitSession({
      event: 'Weekly',
      date: '10/04/2026',
      allocations: {
        puppet: {
          selected: [],
          absent: ['111'],
          notSelected: ['222'],
        },
      },
      summary: {},
    }));
    return { webRequests: storeHolder.store.webRequests() };
  });
}

export async function nonOfficerCommitRefused() {
  return withEnv({}, async () => {
    baseSeed();
    const before = storeHolder.store.snapshot();
    const res = await runWithTenant(TENANT_ID, () => dispatch(requestRoutes, {
      method: 'POST',
      path: '/commit-session',
      session: memberSession(),
      body: {
        event: 'Weekly',
        date: '10/04/2026',
        allocations: {
          puppet: { selected: [{ userId: '111', name: 'Ada', slots: 1 }], absent: [], notSelected: [] },
        },
        summary,
      },
    }));
    return { res, before, after: storeHolder.store.snapshot() };
  });
}

export async function missingAllocationsRefused() {
  return withEnv({}, async () => {
    baseSeed();
    const before = storeHolder.store.snapshot();
    const res = await runWithTenant(TENANT_ID, () => dispatch(requestRoutes, {
      method: 'POST',
      path: '/commit-session',
      session: officerSession(),
      body: { event: 'Weekly', date: '10/04/2026' },
    }));
    return { res, before, after: storeHolder.store.snapshot() };
  });
}

export async function httpAndAutoShareWriter() {
  return {
    httpUses: typeof performCommitSession === 'function',
    writerName: performCommitSession.name,
  };
}
