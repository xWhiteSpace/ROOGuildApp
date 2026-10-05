import { vi } from 'vitest';
import { patterns } from './registry.js';
import { withEnv } from './envSandbox.js';
import { createMemoryTenantStore } from '../support/memoryTenantStore.js';
import { runWithTenant } from '../../backend/src/db/tenantContext.js';
import { dispatch } from '../support/dispatch.js';

patterns.roster_sync = 'used';
patterns.ghost_rules = 'used';
patterns.circuit_503 = 'used';
patterns.roster_sync_seam = 'used';

const TENANT_ID = 'roster-tenant-1';
const CONFIG = {
  timezone: 'Asia/Manila',
  adminRoles: ['Officer'],
  items: [],
  events: {},
};

const harness = vi.hoisted(() => ({
  store: null,
  circuitOpen: false,
  fetchImpl: null,
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

vi.mock('../../backend/src/utils/discordRateLimit.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    isDiscordCircuitOpen: () => harness.circuitOpen,
    getDiscordRateLimitStatus: () => ({ untilHuman: 'soon', remainingHuman: '1m' }),
    logDiscordHttpFailure: () => undefined,
  };
});

vi.mock('../../backend/src/config/discordEnv.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    discordEnv: () => ({
      ...actual.discordEnv(),
      botToken: 'unit-bot-token',
      clientId: 'unit-client-id',
      clientSecret: 'unit-client-secret',
    }),
  };
});

const requestRoutes = (await import('../../backend/src/api/request.routes.js')).default;

function seedMembers(members) {
  harness.circuitOpen = false;
  harness.store = createMemoryTenantStore({
    settings: { configuration: CONFIG },
    auction: { members, web_requests: {} },
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
      id: 'member-9',
      username: 'Member',
      displayName: 'Member',
      currentTenantId: TENANT_ID,
      isOfficer: false,
      roles: ['Member'],
    },
    currentTenantId: TENANT_ID,
  };
}

async function withFetch(impl, fn) {
  const original = globalThis.fetch;
  globalThis.fetch = impl;
  try {
    return await fn();
  } finally {
    globalThis.fetch = original;
  }
}

function okMembersPayload(list) {
  return async () => ({
    ok: true,
    status: 200,
    async json() { return list; },
    async text() { return JSON.stringify(list); },
  });
}

export async function officerSyncUpsertsAndRestoresGhost() {
  return withEnv({}, async () => {
    seedMembers({
      '111': { displayName: 'Old Ada', status: 'Ghost', joinedAt: '2024-01-01' },
      '222': { displayName: 'Ben', status: 'Active', joinedAt: '2024-02-01' },
    });
    const res = await withFetch(okMembersPayload([
      { user: { id: '111', username: 'ada', global_name: 'Ada New' }, nick: 'Ada Nick', joined_at: '2024-01-01T00:00:00.000Z' },
      { user: { id: '333', username: 'cara' }, nick: null, joined_at: '2025-01-01T00:00:00.000Z' },
    ]), () => runWithTenant(TENANT_ID, () => dispatch(requestRoutes, {
      method: 'POST',
      path: '/sync-roster',
      session: officerSession(),
      body: {},
    })));
    return { res, members: harness.store.members() };
  });
}

export async function missingDiscordBecomeGhost() {
  return withEnv({}, async () => {
    seedMembers({
      '111': { displayName: 'Ada', status: 'Active', joinedAt: '2024-01-01' },
      '222': { displayName: 'Ben', status: 'Active', joinedAt: '2024-02-01' },
    });
    const res = await withFetch(okMembersPayload([
      { user: { id: '111', username: 'ada' }, nick: 'Ada', joined_at: '2024-01-01T00:00:00.000Z' },
    ]), () => runWithTenant(TENANT_ID, () => dispatch(requestRoutes, {
      method: 'POST',
      path: '/sync-roster',
      session: officerSession(),
      body: {},
    })));
    return { res, members: harness.store.members() };
  });
}

export async function dummiesNotGhosted() {
  return withEnv({}, async () => {
    seedMembers({
      '111': { displayName: 'Ada', status: 'Active', joinedAt: '2024-01-01' },
      dummy_bot: { displayName: 'Dummy', status: 'Active', isDummy: false },
      '999': { displayName: 'Placeholder', status: 'Active', isDummy: true },
    });
    const res = await withFetch(okMembersPayload([
      { user: { id: '111', username: 'ada' }, nick: 'Ada', joined_at: '2024-01-01T00:00:00.000Z' },
    ]), () => runWithTenant(TENANT_ID, () => dispatch(requestRoutes, {
      method: 'POST',
      path: '/sync-roster',
      session: officerSession(),
      body: {},
    })));
    return { res, members: harness.store.members() };
  });
}

export async function nonOfficerDoesNotSync() {
  return withEnv({}, async () => {
    seedMembers({ '111': { displayName: 'Ada', status: 'Active' } });
    const before = harness.store.members();
    const res = await runWithTenant(TENANT_ID, () => dispatch(requestRoutes, {
      method: 'POST',
      path: '/sync-roster',
      session: memberSession(),
      body: {},
    }));
    return { res, before, after: harness.store.members() };
  });
}

export async function openCircuitDoesNotGhost() {
  return withEnv({}, async () => {
    seedMembers({ '111': { displayName: 'Ada', status: 'Active' }, '222': { displayName: 'Ben', status: 'Active' } });
    harness.circuitOpen = true;
    const before = harness.store.members();
    const res = await runWithTenant(TENANT_ID, () => dispatch(requestRoutes, {
      method: 'POST',
      path: '/sync-roster',
      session: officerSession(),
      body: {},
    }));
    return { res, before, after: harness.store.members() };
  });
}

export async function discordFetchFailureDoesNotFinish() {
  return withEnv({}, async () => {
    seedMembers({ '111': { displayName: 'Ada', status: 'Active' }, '222': { displayName: 'Ben', status: 'Active' } });
    const before = harness.store.members();
    const res = await withFetch(async () => ({
      ok: false,
      status: 500,
      async text() { return 'upstream boom'; },
      async json() { return { message: 'upstream boom' }; },
    }), () => runWithTenant(TENANT_ID, () => dispatch(requestRoutes, {
      method: 'POST',
      path: '/sync-roster',
      session: officerSession(),
      body: {},
    })));
    return { res, before, after: harness.store.members() };
  });
}
