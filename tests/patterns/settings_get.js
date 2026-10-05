import { vi } from 'vitest';
import { patterns } from './registry.js';
import { withEnv } from './envSandbox.js';
import { createMemoryTenantStore } from '../support/memoryTenantStore.js';
import { runWithTenant } from '../../backend/src/db/tenantContext.js';
import { dispatch } from '../support/dispatch.js';

patterns.settings_get = 'used';
patterns.public_only = 'used';

const TENANT_ID = 'get-tenant-1';
const CONFIG = {
  timezone: 'Asia/Manila',
  adminRoles: ['Officer'],
  helpEmbedUrl: 'https://example.com/help',
  raidHelpEmbedUrl: '',
  guildDisplayName: 'Guild',
  guildLogoUrl: '',
  items: [{ id: 'puppet', name: 'Puppet' }],
  events: { evt1: { title: 'Weekly' } },
  isForceLocked: false,
};

const CHANNELS = { requestChannelId: 'chan-1' };
const storeHolder = vi.hoisted(() => ({ store: null }));

vi.mock('../../backend/src/db/database.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getTenantStore: () => storeHolder.store,
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
    loadTenantSettings: async () => ({ configuration: CONFIG, discordChannels: CHANNELS }),
  };
});

const requestRoutes = (await import('../../backend/src/api/request.routes.js')).default;

function seed() {
  storeHolder.store = createMemoryTenantStore({
    settings: { configuration: CONFIG },
    auction: { members: {}, web_requests: {} },
  });
}

export async function nonOfficerPublicView() {
  return withEnv({}, async () => {
    seed();
    return runWithTenant(TENANT_ID, () => dispatch(requestRoutes, {
      method: 'GET',
      path: '/settings/get',
      session: {
        user: {
          id: 'member-1',
          username: 'Member',
          displayName: 'Member',
          currentTenantId: TENANT_ID,
          isOfficer: false,
          roles: ['Member'],
        },
        currentTenantId: TENANT_ID,
      },
    }));
  });
}

export async function officerFullView() {
  return withEnv({}, async () => {
    seed();
    return runWithTenant(TENANT_ID, () => dispatch(requestRoutes, {
      method: 'GET',
      path: '/settings/get',
      session: {
        user: {
          id: 'officer-1',
          username: 'Officer',
          displayName: 'Officer',
          currentTenantId: TENANT_ID,
          isOfficer: true,
          roles: ['Officer'],
        },
        currentTenantId: TENANT_ID,
      },
    }));
  });
}

export async function unauthenticatedSettingsGet() {
  return withEnv({}, async () => {
    seed();
    // Real seam: no identity → checkOfficer ok=false → public view (not 401).
    return runWithTenant(TENANT_ID, () => dispatch(requestRoutes, {
      method: 'GET',
      path: '/settings/get',
      session: {},
    }));
  });
}
