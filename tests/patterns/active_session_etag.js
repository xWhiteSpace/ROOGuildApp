import { vi } from 'vitest';
import { patterns } from './registry.js';
import { withEnv } from './envSandbox.js';
import { createMemoryTenantStore } from '../support/memoryTenantStore.js';
import { runWithTenant } from '../../backend/src/db/tenantContext.js';
import { dispatch } from '../support/dispatch.js';

patterns.active_session_etag = 'used';
patterns.session_304 = 'used';
patterns.stale_24h = 'used';

const TENANT_ID = 'etag-tenant-1';
const CONFIG = {
  timezone: 'Asia/Manila',
  adminRoles: ['Officer'],
  items: [{ id: 'puppet', name: 'Puppet' }],
  events: { evt1: { title: 'Weekly', loots: { puppet: 2 } } },
};

const storeHolder = vi.hoisted(() => ({ store: null }));

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

export async function emptySessionEtag() {
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

export async function storedSessionVersionEtag() {
  return withEnv({}, async () => {
    const lastUpdated = Date.now() - (60 * 60 * 1000);
    storeHolder.store = createMemoryTenantStore({
      settings: { configuration: CONFIG },
      auction: {
        members: {},
        web_requests: {},
        active_session: {
          version: 4,
          lastUpdated,
          qtyPerPage: 4,
          lootSummary: {},
          categoryAllocations: {},
        },
      },
    });
    const res = await runWithTenant(TENANT_ID, () => dispatch(requestRoutes, {
      method: 'GET',
      path: '/active-session',
      session: sessionUser(),
    }));
    return { res, expectedTag: `s:4:${lastUpdated}`, stored: storeHolder.store.activeSession() };
  });
}

export async function matchingIfNoneMatch304() {
  return withEnv({}, async () => {
    const lastUpdated = Date.now() - (30 * 60 * 1000);
    storeHolder.store = createMemoryTenantStore({
      settings: { configuration: CONFIG },
      auction: {
        members: {},
        web_requests: {},
        active_session: {
          version: 2,
          lastUpdated,
          qtyPerPage: 4,
          lootSummary: {},
          categoryAllocations: {},
        },
      },
    });
    const tag = `s:2:${lastUpdated}`;
    return runWithTenant(TENANT_ID, () => dispatch(requestRoutes, {
      method: 'GET',
      path: '/active-session',
      session: sessionUser(),
      headers: { 'if-none-match': `"${tag}"` },
    }));
  });
}

export async function realGetStillApplies24hReset() {
  return withEnv({}, async () => {
    storeHolder.store = createMemoryTenantStore({
      settings: { configuration: CONFIG },
      auction: {
        members: {},
        web_requests: {},
        active_session: {
          version: 9,
          lastUpdated: Date.now() - (25 * 60 * 60 * 1000),
          marker: 'stale',
          lootSummary: { puppet: { qty: 9, limit: 2, seats: 1 } },
          categoryAllocations: { puppet: { selected: ['111'] } },
        },
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
