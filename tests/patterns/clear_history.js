import { vi } from 'vitest';
import { patterns } from './registry.js';
import { withEnv } from './envSandbox.js';
import { createMemoryTenantStore, auctionRequestsFromStore } from '../support/memoryTenantStore.js';
import { runWithTenant } from '../../backend/src/db/tenantContext.js';
import { dispatch } from '../support/dispatch.js';

patterns.clear_history = 'used';
patterns.inclusive_range = 'used';

const TENANT_ID = 'clear-tenant-1';
const CONFIG = {
  timezone: 'Asia/Manila',
  adminRoles: ['Officer'],
  items: [{ id: 'puppet', name: 'Puppet' }],
  events: {},
};

const storeHolder = vi.hoisted(() => ({ store: null }));

vi.mock('../../backend/src/db/database.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getTenantStore: () => storeHolder.store,
    // Route also filters by record.date; return full ledger so date window is the unit under test.
    loadAuctionRequests: async () => auctionRequestsFromStore(storeHolder.store),
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
      members: {},
      web_requests: {
        in1: { id: 'in1', date: '2026-10-02', userId: '111', item: 'Puppet', itemId: 'puppet', quantity: 1, selectionStatus: 'Selected' },
        in2: { id: 'in2', date: '2026-10-03', userId: '111', item: 'Puppet', itemId: 'puppet', quantity: 1, selectionStatus: 'Selected' },
        out1: { id: 'out1', date: '2026-09-01', userId: '111', item: 'Puppet', itemId: 'puppet', quantity: 1, selectionStatus: 'Selected' },
        out2: { id: 'out2', date: '2026-11-01', userId: '222', item: 'Puppet', itemId: 'puppet', quantity: 1, selectionStatus: 'Selected' },
      },
      loot_history: {
        lh1: { id: 'lh1', date: '2026-10-02', event: 'Weekly', item: 'Puppet', quantity: 1 },
      },
      past_auctions: {
        pa1: { id: 'pa1', date: '2026-10-02', item: 'Puppet', userId: '111', quantity: 1 },
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

export async function inclusiveRangeDeletes() {
  return withEnv({}, async () => {
    seed();
    const res = await runWithTenant(TENANT_ID, () => dispatch(requestRoutes, {
      method: 'POST',
      path: '/clear-history',
      session: officerSession(),
      body: { startDate: '2026-10-02', endDate: '2026-10-03' },
    }));
    return { res, rows: storeHolder.store.webRequests(), snap: storeHolder.store.snapshot() };
  });
}

export async function outsideRangePreserved() {
  return withEnv({}, async () => {
    seed();
    const res = await runWithTenant(TENANT_ID, () => dispatch(requestRoutes, {
      method: 'POST',
      path: '/clear-history',
      session: officerSession(),
      body: { startDate: '2026-10-02', endDate: '2026-10-03' },
    }));
    return { res, rows: storeHolder.store.webRequests() };
  });
}

export async function invertedRangeRefused() {
  return withEnv({}, async () => {
    seed();
    const before = Object.keys(storeHolder.store.webRequests()).length;
    const res = await runWithTenant(TENANT_ID, () => dispatch(requestRoutes, {
      method: 'POST',
      path: '/clear-history',
      session: officerSession(),
      body: { startDate: '2026-10-10', endDate: '2026-10-01' },
    }));
    return { res, before, after: Object.keys(storeHolder.store.webRequests()).length };
  });
}

export async function nonOfficerDoesNotClear() {
  return withEnv({}, async () => {
    seed();
    const before = Object.keys(storeHolder.store.webRequests()).length;
    const res = await runWithTenant(TENANT_ID, () => dispatch(requestRoutes, {
      method: 'POST',
      path: '/clear-history',
      session: memberSession(),
      body: { startDate: '2026-10-02', endDate: '2026-10-03' },
    }));
    return { res, before, after: Object.keys(storeHolder.store.webRequests()).length };
  });
}

export async function lootAndPastAuctionsUntouched() {
  return withEnv({}, async () => {
    seed();
    const beforeLoot = storeHolder.store.snapshot().auction.loot_history;
    const beforePast = storeHolder.store.snapshot().auction.past_auctions;
    const res = await runWithTenant(TENANT_ID, () => dispatch(requestRoutes, {
      method: 'POST',
      path: '/clear-history',
      session: officerSession(),
      body: { startDate: '2026-10-02', endDate: '2026-10-03' },
    }));
    const snap = storeHolder.store.snapshot();
    return {
      res,
      beforeLoot,
      beforePast,
      afterLoot: snap.auction.loot_history,
      afterPast: snap.auction.past_auctions,
    };
  });
}
