import { vi } from 'vitest';
import { patterns } from './registry.js';
import { withEnv } from './envSandbox.js';
import { createMemoryTenantStore } from '../support/memoryTenantStore.js';
import { runWithTenant } from '../../backend/src/db/tenantContext.js';
import { dispatch } from '../support/dispatch.js';

patterns.active_session = 'used';
patterns.stale_24h = 'used';

const TENANT_ID = 'session-tenant-1';
const CONFIG = {
  timezone: 'Asia/Manila',
  adminRoles: ['Officer'],
  items: [
    { id: 'puppet', name: 'Puppet', colorTheme: 'slate', isHighValue: true },
    { id: 'card', name: 'Card', colorTheme: 'blue', isHighValue: false },
  ],
  events: { evt1: { title: 'Weekly', loots: { puppet: 2, card: 3 } } },
};

const gate = vi.hoisted(() => ({
  current: {
    isGateOpen: true,
    currentSessionLabel: 'Open',
    nextStatusChangeMessage: 'later',
    currentPhase: 1,
    phaseIntervals: {},
    activeEventId: 'evt1',
    activeEventTitle: 'Weekly',
    helpEmbedUrl: '',
    announcementMinutes: { phase1: [], phase2: null, phase3: null },
    timezone: 'Asia/Manila',
  },
}));

const storeHolder = vi.hoisted(() => ({ store: null }));

vi.mock('../../backend/src/games/ragnarok-origin/timeWindow.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getGateStatusDetails: () => gate.current,
    readTenantConfiguration: async () => CONFIG,
  };
});

vi.mock('../../backend/src/db/database.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getTenantStore: () => storeHolder.store,
    loadAuctionRequests: async () => ({}),
    loadMembersByIds: async (ids) => {
      const members = storeHolder.store?.members?.() || {};
      const out = {};
      for (const id of ids || []) if (members[id]) out[id] = members[id];
      return out;
    },
  };
});

const requestRoutes = (await import('../../backend/src/api/request.routes.js')).default;

function sessionUser() {
  return {
    user: {
      id: '111',
      username: 'Ada',
      displayName: 'Ada',
      currentTenantId: TENANT_ID,
      isOfficer: true,
      roles: ['Officer'],
    },
    currentTenantId: TENANT_ID,
  };
}

export async function missingSessionIsNull() {
  return withEnv({}, async () => {
    storeHolder.store = createMemoryTenantStore({
      settings: { configuration: CONFIG },
      auction: { members: {}, web_requests: {} },
    });
    return runWithTenant(TENANT_ID, () => dispatch(requestRoutes, {
      method: 'GET',
      path: '/active-session',
      session: sessionUser(),
    }));
  });
}

export async function staleSessionResetsFromCatalog() {
  return withEnv({}, async () => {
    const stale = {
      version: 3,
      activeStep: 2,
      qtyPerPage: 4,
      lootRows: [{ id: 1, itemType: 'puppet' }],
      lootSummary: { puppet: { qty: 5, limit: 2, seats: 1 } },
      categoryAllocations: { puppet: { selected: ['111'] } },
      initialWinnersByItem: {},
      isDiscordGateOpen: true,
      lastUpdated: Date.now() - (25 * 60 * 60 * 1000),
    };
    storeHolder.store = createMemoryTenantStore({
      settings: { configuration: CONFIG },
      auction: { members: {}, web_requests: {}, active_session: stale },
    });
    const res = await runWithTenant(TENANT_ID, () => dispatch(requestRoutes, {
      method: 'GET',
      path: '/active-session',
      session: sessionUser(),
    }));
    return { res, stored: storeHolder.store.activeSession() };
  });
}

export async function freshSessionReturnedNotReset() {
  return withEnv({}, async () => {
    const fresh = {
      version: 7,
      activeStep: 1,
      qtyPerPage: undefined,
      lootRows: [],
      lootSummary: {},
      categoryAllocations: {},
      initialWinnersByItem: {},
      isDiscordGateOpen: false,
      lastUpdated: Date.now() - (60 * 60 * 1000),
      marker: 'keep-me',
    };
    storeHolder.store = createMemoryTenantStore({
      settings: { configuration: CONFIG },
      auction: { members: {}, web_requests: {}, active_session: fresh },
    });
    const res = await runWithTenant(TENANT_ID, () => dispatch(requestRoutes, {
      method: 'GET',
      path: '/active-session',
      session: sessionUser(),
    }));
    return { res, stored: storeHolder.store.activeSession() };
  });
}

export async function occupiedSessionReturnsOccupantMembers() {
  return withEnv({}, async () => {
    const occupied = {
      version: 4,
      activeStep: 2,
      qtyPerPage: 4,
      lootRows: [],
      lootSummary: { puppet: { qty: 1, limit: 2, seats: 1 } },
      categoryAllocations: { puppet: { selected: ['111', '', '222'] } },
      initialWinnersByItem: {},
      isDiscordGateOpen: true,
      lastUpdated: Date.now() - (60 * 60 * 1000),
    };
    storeHolder.store = createMemoryTenantStore({
      settings: { configuration: CONFIG },
      auction: {
        members: {
          '111': { displayName: 'Ada', status: 'Active' },
          '222': { displayName: 'Ben', status: 'Active' },
          '999': { displayName: 'NotOnBoard', status: 'Active' },
        },
        web_requests: {},
        active_session: occupied,
      },
    });
    const res = await runWithTenant(TENANT_ID, () => dispatch(requestRoutes, {
      method: 'GET',
      path: '/active-session',
      session: sessionUser(),
    }));
    return { res, stored: storeHolder.store.activeSession() };
  });
}
