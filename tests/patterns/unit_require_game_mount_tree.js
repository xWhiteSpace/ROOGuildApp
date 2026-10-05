import { vi } from 'vitest';
import { patterns } from './registry.js';
import { withEnv } from './envSandbox.js';
import { dispatch } from '../support/dispatch.js';
import { RAGNAROK_ORIGIN_ID, ADVENTURER_GUILD_ID } from '../../backend/src/games/catalog.js';

patterns.unit_require_game_mount_tree = 'used';
patterns.ro_ag_mount_gate = 'used';

const TENANT_ID = 'mount-tenant-1';

const mocks = vi.hoisted(() => ({
  enabledGames: [],
  getTenant: vi.fn(async (id) => (id ? {
    id,
    enabled_games: mocks.enabledGames,
    subscription_status: 'active',
    billing_source: 'invite',
  } : null)),
  tenantHasAccess: vi.fn(() => true),
  loadTenantSettings: vi.fn(async () => ({
    configuration: { adminRoles: [], timezone: 'Asia/Manila' },
    discordChannels: {},
  })),
}));

vi.mock('../../backend/src/db/tenants.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getTenant: (...a) => mocks.getTenant(...a),
    loadTenantSettings: (...a) => mocks.loadTenantSettings(...a),
  };
});

vi.mock('../../backend/src/db/billing.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    tenantHasAccess: (...a) => mocks.tenantHasAccess(...a),
  };
});


vi.mock('../../backend/src/db/database.js', async (importOriginal) => {
  const actual = await importOriginal();
  const { createMemoryTenantStore } = await import('../support/memoryTenantStore.js');
  const store = createMemoryTenantStore({
    settings: { configuration: { adminRoles: [], timezone: 'Asia/Manila', items: [], events: {} } },
    auction: { members: {}, web_requests: {} },
  });
  return {
    ...actual,
    getTenantStore: () => store,
    loadAuctionRequests: async () => ({}),
  };
});

const { createApp } = await import('../../backend/src/createApp.js');

function sessionWithTenant(enabled) {
  mocks.enabledGames = enabled;
  return {
    user: {
      id: 'user-1',
      username: 'Ada',
      displayName: 'Ada',
      currentTenantId: TENANT_ID,
      isOfficer: true,
      roles: ['Officer'],
    },
    currentTenantId: TENANT_ID,
  };
}

export async function roMountWithoutRo() {
  return withEnv({}, async () => {
    const app = createApp();
    return dispatch(app, {
      method: 'GET',
      path: '/api/requests/init',
      session: sessionWithTenant([ADVENTURER_GUILD_ID]),
    });
  });
}

export async function agMountWithoutAg() {
  return withEnv({}, async () => {
    const app = createApp();
    return dispatch(app, {
      method: 'GET',
      path: '/api/adventurer-guild/highlights',
      session: sessionWithTenant([RAGNAROK_ORIGIN_ID]),
    });
  });
}

export async function enabledRoPassesMountGate() {
  return withEnv({}, async () => {
    const app = createApp();
    return dispatch(app, {
      method: 'GET',
      path: '/api/requests/init',
      session: sessionWithTenant([RAGNAROK_ORIGIN_ID]),
    });
  });
}

export async function missingTenantAtMount() {
  return withEnv({}, async () => {
    const app = createApp();
    return dispatch(app, {
      method: 'GET',
      path: '/api/requests/init',
      session: { user: { id: 'user-1', username: 'Ada' } },
    });
  });
}
