import { vi } from 'vitest';
import { patterns } from './registry.js';
import { withEnv } from './envSandbox.js';
import { createMemoryTenantStore } from '../support/memoryTenantStore.js';
import { runWithTenant } from '../../backend/src/db/tenantContext.js';
import { dispatch } from '../support/dispatch.js';

patterns.optimistic_version = 'used';
patterns.officer_session = 'used';

const TENANT_ID = 'opt-tenant-1';
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

function seed(session) {
  storeHolder.store = createMemoryTenantStore({
    settings: { configuration: CONFIG },
    auction: {
      members: {},
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

export async function officerWriteStoresSession() {
  return withEnv({}, async () => {
    seed({ version: 1, lastUpdated: 1, marker: 'old' });
    const payload = { version: 2, marker: 'new', lootSummary: {}, categoryAllocations: {} };
    const res = await runWithTenant(TENANT_ID, () => dispatch(requestRoutes, {
      method: 'POST',
      path: '/update-session',
      session: officerSession(),
      body: { session: payload },
    }));
    return { res, stored: storeHolder.store.activeSession() };
  });
}

export async function lowerVersionDoesNotOverwrite() {
  return withEnv({}, async () => {
    const original = { version: 5, lastUpdated: 100, marker: 'keep' };
    seed(original);
    const res = await runWithTenant(TENANT_ID, () => dispatch(requestRoutes, {
      method: 'POST',
      path: '/update-session',
      session: officerSession(),
      body: { session: { version: 3, marker: 'stale' } },
    }));
    return { res, stored: storeHolder.store.activeSession() };
  });
}

export async function nonOfficerDoesNotWrite() {
  return withEnv({}, async () => {
    seed({ version: 1, lastUpdated: 1, marker: 'keep' });
    const res = await runWithTenant(TENANT_ID, () => dispatch(requestRoutes, {
      method: 'POST',
      path: '/update-session',
      session: memberSession(),
      body: { session: { version: 2, marker: 'hack' } },
    }));
    return { res, stored: storeHolder.store.activeSession() };
  });
}

export async function missingPayloadDoesNotWrite() {
  return withEnv({}, async () => {
    seed({ version: 1, lastUpdated: 1, marker: 'keep' });
    const res = await runWithTenant(TENANT_ID, () => dispatch(requestRoutes, {
      method: 'POST',
      path: '/update-session',
      session: officerSession(),
      body: {},
    }));
    return { res, stored: storeHolder.store.activeSession() };
  });
}
