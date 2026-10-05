import { vi } from 'vitest';
import { patterns } from './registry.js';
import { withEnv } from './envSandbox.js';
import { createMemoryTenantStore } from '../support/memoryTenantStore.js';
import { runWithTenant } from '../../backend/src/db/tenantContext.js';
import { dispatch } from '../support/dispatch.js';

patterns.admin_reset = 'used';
patterns.append_only = 'used';

const TENANT_ID = 'reset-tenant-1';
const CONFIG = {
  timezone: 'Asia/Manila',
  adminRoles: ['Officer'],
  items: [{ id: 'puppet', name: 'Puppet', isHighValue: true }],
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

const requestRoutes = (await import('../../backend/src/api/request.routes.js')).default;

function seed() {
  storeHolder.store = createMemoryTenantStore({
    settings: { configuration: CONFIG },
    auction: {
      members: { '111': { displayName: 'Ada', status: 'Active' } },
      web_requests: {
        hist1: {
          id: 'hist1',
          userId: '111',
          itemId: 'puppet',
          item: 'Puppet',
          quantity: 1,
          applicationStatus: 'Requested',
          selectionStatus: 'Selected',
          priority: 3,
        },
      },
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

export async function officerInsertsAdminReset() {
  return withEnv({}, async () => {
    seed();
    const res = await runWithTenant(TENANT_ID, () => dispatch(requestRoutes, {
      method: 'POST',
      path: '/reset-priority',
      session: officerSession(),
      body: { userId: '111', itemId: 'puppet' },
    }));
    return { res, rows: storeHolder.store.webRequests() };
  });
}

export async function priorHistoryUntouched() {
  return withEnv({}, async () => {
    seed();
    const prior = JSON.parse(JSON.stringify(storeHolder.store.webRequests().hist1));
    await runWithTenant(TENANT_ID, () => dispatch(requestRoutes, {
      method: 'POST',
      path: '/reset-priority',
      session: officerSession(),
      body: { userId: '111', itemId: 'puppet' },
    }));
    return { prior, rows: storeHolder.store.webRequests() };
  });
}

export async function nonOfficerNoReset() {
  return withEnv({}, async () => {
    seed();
    const before = Object.keys(storeHolder.store.webRequests()).length;
    const res = await runWithTenant(TENANT_ID, () => dispatch(requestRoutes, {
      method: 'POST',
      path: '/reset-priority',
      session: memberSession(),
      body: { userId: '111', itemId: 'puppet' },
    }));
    return { res, before, after: storeHolder.store.webRequests() };
  });
}

export async function missingIdsNoReset() {
  return withEnv({}, async () => {
    seed();
    const before = Object.keys(storeHolder.store.webRequests()).length;
    const res = await runWithTenant(TENANT_ID, () => dispatch(requestRoutes, {
      method: 'POST',
      path: '/reset-priority',
      session: officerSession(),
      body: { userId: '111' },
    }));
    return { res, before, after: storeHolder.store.webRequests() };
  });
}
