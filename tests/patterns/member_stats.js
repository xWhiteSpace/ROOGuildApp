import { vi } from 'vitest';
import { patterns } from './registry.js';
import { withEnv } from './envSandbox.js';
import { createMemoryTenantStore } from '../support/memoryTenantStore.js';
import { runWithTenant } from '../../backend/src/db/tenantContext.js';
import { dispatch } from '../support/dispatch.js';

patterns.member_stats = 'used';
patterns.self_or_officer = 'used';

const TENANT_ID = 'stats-tenant-1';
const CONFIG = {
  timezone: 'Asia/Manila',
  adminRoles: ['Officer'],
  items: [{ id: 'item_1', name: 'Puppet', colorTheme: 'slate' }],
  events: {},
};

const harness = vi.hoisted(() => ({
  store: null,
  battles: 3,
  awardsByUid: {
    '111222333444555666': {
      a1: { id: 'a1', userId: '111222333444555666', itemId: 'item_1', item: 'Puppet', quantity: 2 },
    },
    '999888777666555444': {
      b1: { id: 'b1', userId: '999888777666555444', itemId: 'item_1', item: 'Puppet', quantity: 5 },
    },
  },
}));

vi.mock('../../backend/src/db/database.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getTenantStore: () => harness.store,
    countLootHistoryBattles: async () => harness.battles,
    loadPastAuctionsForMember: async (uid) => harness.awardsByUid[String(uid)] || {},
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
  harness.store = createMemoryTenantStore({
    settings: { configuration: CONFIG },
    auction: { members: {}, web_requests: {} },
  });
}

function callerSession(id = '111222333444555666', officer = false) {
  return {
    user: {
      id,
      username: 'Caller',
      displayName: 'Caller',
      currentTenantId: TENANT_ID,
      isOfficer: officer,
      roles: officer ? ['Officer'] : ['Member'],
    },
    currentTenantId: TENANT_ID,
  };
}

export async function omittedUidOwnStats() {
  return withEnv({}, async () => {
    seed();
    return runWithTenant(TENANT_ID, () => dispatch(requestRoutes, {
      method: 'GET',
      path: '/member-auction-stats',
      session: callerSession(),
    }));
  });
}

export async function officerReadsOther() {
  return withEnv({}, async () => {
    seed();
    return runWithTenant(TENANT_ID, () => dispatch(requestRoutes, {
      method: 'GET',
      path: '/member-auction-stats?uid=999888777666555444',
      session: callerSession('officer-1', true),
    }));
  });
}

export async function nonOfficerReadsOtherForbidden() {
  return withEnv({}, async () => {
    seed();
    return runWithTenant(TENANT_ID, () => dispatch(requestRoutes, {
      method: 'GET',
      path: '/member-auction-stats?uid=999888777666555444',
      session: callerSession('111222333444555666', false),
    }));
  });
}

export async function nonSnowflakeRejected() {
  return withEnv({}, async () => {
    seed();
    return runWithTenant(TENANT_ID, () => dispatch(requestRoutes, {
      method: 'GET',
      path: '/member-auction-stats?uid=not-a-snowflake',
      session: callerSession(),
    }));
  });
}
