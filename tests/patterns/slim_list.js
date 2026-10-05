import { vi } from 'vitest';
import { patterns } from './registry.js';
import { withEnv } from './envSandbox.js';
import { createMemoryTenantStore } from '../support/memoryTenantStore.js';
import { dispatch } from '../support/dispatch.js';
import { RAGNAROK_ORIGIN_ID } from '../../backend/src/games/catalog.js';

patterns.slim_list = 'used';
patterns.title_default = 'used';
patterns.id_full = 'used';
patterns.neither = 'used';

const TENANT = 'comp-list-tenant';
const storeHolder = vi.hoisted(() => ({ store: null }));

vi.mock('../../backend/src/db/database.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, getTenantStore: () => storeHolder.store };
});

vi.mock('../../backend/src/db/tenants.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getTenant: async (id) => (id ? {
      id,
      enabled_games: [RAGNAROK_ORIGIN_ID],
      subscription_status: 'active',
      billing_source: 'invite',
      owner_discord_id: 'u1',
    } : null),
    loadTenantSettings: async () => ({
      configuration: { timezone: 'Asia/Manila', adminRoles: ['Officer'] },
      discordChannels: {},
    }),
  };
});

vi.mock('../../backend/src/db/billing.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, tenantHasAccess: () => true };
});

const { createApp } = await import('../../backend/src/createApp.js');

function seedComps() {
  storeHolder.store = createMemoryTenantStore({
    attendance: {
      compositions: {
        cfg_full: {
          id: 'cfg_full',
          title: 'Main Party',
          grids: {
            tab_001: { slots_allocation: { '0-0': { userId: 'u1' } } },
          },
          tabOrder: ['tab_001'],
        },
        cfg_empty_title: {
          id: 'cfg_empty_title',
          grids: { tab_001: { slots_allocation: {} } },
          tabOrder: ['tab_001'],
        },
      },
    },
    settings: { configuration: { timezone: 'Asia/Manila' } },
  });
}

function session() {
  return {
    user: {
      id: 'u1',
      username: 'Ada',
      displayName: 'Ada',
      currentTenantId: TENANT,
      isOfficer: true,
      roles: ['Officer'],
    },
    currentTenantId: TENANT,
  };
}

async function get(path) {
  return withEnv({}, async () => {
    seedComps();
    const app = createApp();
    return dispatch(app, { method: 'GET', path, session: session() });
  });
}

export async function fieldsListSlim() {
  return get('/api/attendance/compositions?fields=list');
}

export async function missingTitleEmptyString() {
  const res = await get('/api/attendance/compositions?fields=list');
  return res.body?.compositions?.cfg_empty_title;
}

export async function idReturnsFull() {
  return get('/api/attendance/compositions?id=cfg_full');
}

export async function fieldsListIgnoredWhenId() {
  return get('/api/attendance/compositions?id=cfg_full&fields=list');
}

export async function missingIdEmpty() {
  return get('/api/attendance/compositions?id=does-not-exist');
}

export async function neitherReturnsFull() {
  return get('/api/attendance/compositions');
}
