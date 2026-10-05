import { vi } from 'vitest';
import { patterns } from './registry.js';
import { withEnv } from './envSandbox.js';
import { createMemoryTenantStore } from '../support/memoryTenantStore.js';
import { runWithTenant } from '../../backend/src/db/tenantContext.js';
import { dispatch } from '../support/dispatch.js';

patterns.settings_unlock = 'used';
patterns.session_tenant = 'used';

const TENANT_ID = 'unlock-tenant-1';
const OTHER_TENANT = 'unlock-tenant-OTHER';
const CONFIG = {
  timezone: 'Asia/Manila',
  adminRoles: ['Officer'],
};

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
    loadTenantSettings: async () => ({ configuration: CONFIG, discordChannels: {} }),
  };
});

const requestRoutes = (await import('../../backend/src/api/request.routes.js')).default;

function seed() {
  storeHolder.store = createMemoryTenantStore({
    settings: { configuration: CONFIG },
    auction: { members: {}, web_requests: {} },
  });
}

export async function officerUnlockStoresSessionFlags() {
  return withEnv({}, async () => {
    seed();
    const session = {
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
    const res = await runWithTenant(TENANT_ID, () => dispatch(requestRoutes, {
      method: 'POST',
      path: '/settings/unlock',
      session,
      body: {},
    }));
    return { res, session };
  });
}

export async function unlockTenantIdIsCurrentNotOther() {
  return withEnv({}, async () => {
    seed();
    const session = {
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
    await runWithTenant(TENANT_ID, () => dispatch(requestRoutes, {
      method: 'POST',
      path: '/settings/unlock',
      session,
      body: {},
    }));
    return {
      settingsUnlockedTenantId: session.settingsUnlockedTenantId,
      tenantId: TENANT_ID,
      otherTenant: OTHER_TENANT,
      settingsUnlocked: session.settingsUnlocked,
    };
  });
}

export async function nonOfficerDoesNotUnlock() {
  return withEnv({}, async () => {
    seed();
    const session = {
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
    const res = await runWithTenant(TENANT_ID, () => dispatch(requestRoutes, {
      method: 'POST',
      path: '/settings/unlock',
      session,
      body: {},
    }));
    return { res, session };
  });
}
