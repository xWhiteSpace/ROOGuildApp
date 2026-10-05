import { vi } from 'vitest';
import { patterns } from './registry.js';
import { withEnv } from './envSandbox.js';
import { createMemoryTenantStore } from '../support/memoryTenantStore.js';
import { runWithTenant } from '../../backend/src/db/tenantContext.js';
import { dispatch } from '../support/dispatch.js';

patterns.settings_fields_pick = 'used';

const TENANT_ID = 'fields-tenant-1';
const CONFIG = {
  timezone: 'Asia/Manila',
  adminRoles: ['Officer', 'Admin'],
  jobs: { knight: { name: 'Knight' } },
  items: [{ id: 'puppet', name: 'Puppet' }],
  events: { evt1: { title: 'Weekly' } },
  helpEmbedUrl: 'https://example.com/help',
  guildDisplayName: 'Guild',
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

export async function allowListedJobsAndTimezoneOnly() {
  return withEnv({}, async () => {
    seed();
    return runWithTenant(TENANT_ID, () => dispatch(requestRoutes, {
      method: 'GET',
      path: '/settings/get?fields=jobs,timezone',
      session: officerSession(),
    }));
  });
}

export async function unknownFieldsDropped() {
  return withEnv({}, async () => {
    seed();
    return runWithTenant(TENANT_ID, () => dispatch(requestRoutes, {
      method: 'GET',
      path: '/settings/get?fields=jobs,notARealField,adminRoles',
      session: officerSession(),
    }));
  });
}

export async function nonOfficerPickFromPublicView() {
  return withEnv({}, async () => {
    seed();
    return runWithTenant(TENANT_ID, () => dispatch(requestRoutes, {
      method: 'GET',
      path: '/settings/get?fields=jobs,timezone,adminRoles',
      session: memberSession(),
    }));
  });
}

export async function omittedFieldsFullViews() {
  return withEnv({}, async () => {
    seed();
    const officer = await runWithTenant(TENANT_ID, () => dispatch(requestRoutes, {
      method: 'GET',
      path: '/settings/get',
      session: officerSession(),
    }));
    const member = await runWithTenant(TENANT_ID, () => dispatch(requestRoutes, {
      method: 'GET',
      path: '/settings/get',
      session: memberSession(),
    }));
    return { officer, member };
  });
}
