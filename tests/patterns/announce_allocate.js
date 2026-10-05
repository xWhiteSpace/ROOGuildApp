import { vi } from 'vitest';
import { patterns } from './registry.js';
import { withEnv } from './envSandbox.js';
import { createMemoryTenantStore } from '../support/memoryTenantStore.js';
import { runWithTenant } from '../../backend/src/db/tenantContext.js';
import { dispatch } from '../support/dispatch.js';

patterns.announce_allocate = 'used';
patterns.allocate_confirm = 'used';

const TENANT_ID = 'announce-tenant-1';
const CONFIG = {
  timezone: 'Asia/Manila',
  adminRoles: ['Officer'],
  items: [{ id: 'puppet', name: 'Puppet' }],
  events: { evt1: { title: 'Weekly', loots: { puppet: 2 } } },
};

const harness = vi.hoisted(() => ({
  store: null,
  sendImpl: vi.fn(async () => ({ posted: true })),
  sentChunks: [],
}));

vi.mock('../../backend/src/db/database.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getTenantStore: () => harness.store,
    loadAuctionRequests: async () => ({}),
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

vi.mock('../../backend/src/games/ragnarok-origin/services/requestDeck.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    buildRequestBoard: async () => ({
      items: [{ id: 'puppet', name: 'Puppet', limitQty: 2 }],
      rankingsByItem: { puppet: ['111'] },
      requestsByItemDetails: { puppet: { '111': { name: 'Ada', priority: 2 } } },
      members: { '111': { displayName: 'Ada' } },
    }),
  };
});

vi.mock('../../backend/src/games/ragnarok-origin/services/discordGenAnnounce.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    buildAllocateOpenAnnounceChunks: ({ selectedRows, notSelectedRows }) => {
      harness.sentChunks.push({ selectedRows, notSelectedRows });
      return ['chunk-1'];
    },
    sendGenRoomMessage: (...args) => harness.sendImpl(...args),
  };
});

vi.mock('../../backend/src/games/ragnarok-origin/timeWindow.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getGateStatusDetails: () => ({
      isGateOpen: true,
      currentPhase: 3,
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

const requestRoutes = (await import('../../backend/src/api/request.routes.js')).default;

function seed(session = {
  version: 1,
  lastUpdated: Date.now(),
  lootSummary: { puppet: { qty: 1, limit: 2, seats: 1 } },
  categoryAllocations: { puppet: { selected: ['111'] } },
  activeStep: 2,
  initialWinnersByItem: { puppet: ['111'] },
  activeMatrixFilter: 'puppet',
  sidebarTab: 'standby',
}) {
  harness.sendImpl.mockReset();
  harness.sendImpl.mockImplementation(async () => ({ posted: true }));
  harness.sentChunks = [];
  harness.store = createMemoryTenantStore({
    settings: { configuration: CONFIG },
    auction: {
      members: { '111': { displayName: 'Ada' } },
      web_requests: {},
      active_session: session,
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

export async function confirmStoresNamedSessionFields() {
  return withEnv({}, async () => {
    seed({ version: 1, lastUpdated: 1 });
    const payload = {
      version: 2,
      activeStep: 2,
      lootSummary: { puppet: { qty: 1, limit: 2, seats: 1 } },
      categoryAllocations: { puppet: { selected: ['111'] } },
      initialWinnersByItem: { puppet: ['111'] },
      activeMatrixFilter: 'puppet',
      sidebarTab: 'standby',
    };
    const res = await runWithTenant(TENANT_ID, () => dispatch(requestRoutes, {
      method: 'POST',
      path: '/update-session',
      session: officerSession(),
      body: { session: payload },
    }));
    return { res, stored: harness.store.activeSession() };
  });
}

export async function announceEmptyBodyRebuilds() {
  return withEnv({}, async () => {
    seed();
    const res = await runWithTenant(TENANT_ID, () => dispatch(requestRoutes, {
      method: 'POST',
      path: '/announce-allocate',
      session: officerSession(),
      body: {},
    }));
    return {
      res,
      sendCalls: harness.sendImpl.mock.calls,
      chunks: harness.sentChunks,
      requestBodyWasEmpty: true,
    };
  });
}

export async function announceUnauthenticated() {
  return withEnv({}, async () => {
    seed();
    return runWithTenant(TENANT_ID, () => dispatch(requestRoutes, {
      method: 'POST',
      path: '/announce-allocate',
      session: {},
      body: {},
    }));
  });
}

export async function announceNonOfficer() {
  return withEnv({}, async () => {
    seed();
    return runWithTenant(TENANT_ID, () => dispatch(requestRoutes, {
      method: 'POST',
      path: '/announce-allocate',
      session: memberSession(),
      body: {},
    }));
  });
}

export async function announceNoSession() {
  return withEnv({}, async () => {
    seed(null);
    harness.store = createMemoryTenantStore({
      settings: { configuration: CONFIG },
      auction: { members: {}, web_requests: {} },
    });
    return runWithTenant(TENANT_ID, () => dispatch(requestRoutes, {
      method: 'POST',
      path: '/announce-allocate',
      session: officerSession(),
      body: {},
    }));
  });
}

export async function announceNotConfigured() {
  return withEnv({}, async () => {
    seed();
    harness.sendImpl.mockRejectedValueOnce(new Error('DISCORD_GENROOM_ID_1 is not configured.'));
    return runWithTenant(TENANT_ID, () => dispatch(requestRoutes, {
      method: 'POST',
      path: '/announce-allocate',
      session: officerSession(),
      body: {},
    }));
  });
}

export async function announceOffline503() {
  return withEnv({}, async () => {
    seed();
    harness.sendImpl.mockRejectedValueOnce(new Error('Discord bot gateway is not connected on this backend.'));
    return runWithTenant(TENANT_ID, () => dispatch(requestRoutes, {
      method: 'POST',
      path: '/announce-allocate',
      session: officerSession(),
      body: {},
    }));
  });
}

export async function announceRateLimited503() {
  return withEnv({}, async () => {
    seed();
    harness.sendImpl.mockRejectedValueOnce(new Error('Discord is rate-limited. Try again shortly.'));
    return runWithTenant(TENANT_ID, () => dispatch(requestRoutes, {
      method: 'POST',
      path: '/announce-allocate',
      session: officerSession(),
      body: {},
    }));
  });
}

export async function announceNotFound404() {
  return withEnv({}, async () => {
    seed();
    harness.sendImpl.mockRejectedValueOnce(new Error('GEN Room channel not found.'));
    return runWithTenant(TENANT_ID, () => dispatch(requestRoutes, {
      method: 'POST',
      path: '/announce-allocate',
      session: officerSession(),
      body: {},
    }));
  });
}
