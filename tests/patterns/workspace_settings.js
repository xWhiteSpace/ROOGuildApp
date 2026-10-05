import { vi } from 'vitest';
import { patterns } from './registry.js';
import { withEnv } from './envSandbox.js';
import { dispatch } from '../support/dispatch.js';

patterns.workspace_settings = 'used';
patterns.officer_only_settings = 'used';

const TENANT_ID = '777888999000111222';

const mocks = vi.hoisted(() => {
  let configuration = {
    adminRoles: ['Officer'],
    timezone: 'Asia/Manila',
    guildDisplayName: 'Workspace Guild',
    guildLogoUrl: '',
  };
  let persisted = null;
  return {
    configuration: () => configuration,
    setConfiguration(next) { configuration = next; },
    persisted: () => persisted,
    resetPersist() { persisted = null; },
    getTenant: vi.fn(async () => ({
      id: TENANT_ID,
      display_name: 'Workspace Guild',
      owner_discord_id: 'officer-1',
      onboarded: true,
      enabled_games: ['ragnarok-origin'],
      logo_url: '',
      subscription_status: 'active',
      billing_source: 'invite',
      is_platform_owner: false,
      plan: 'free',
    })),
    loadTenantSettings: vi.fn(async () => ({
      configuration,
      discordChannels: {},
    })),
    setTenantDisplayName: vi.fn(async () => undefined),
    claimTenantOwner: vi.fn(async () => null),
    storeSet: vi.fn(async (value) => { persisted = value; }),
    storeUpdate: vi.fn(async () => undefined),
  };
});

vi.mock('../../backend/src/db/tenants.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getTenant: (...a) => mocks.getTenant(...a),
    loadTenantSettings: (...a) => mocks.loadTenantSettings(...a),
    setTenantDisplayName: (...a) => mocks.setTenantDisplayName(...a),
    claimTenantOwner: (...a) => mocks.claimTenantOwner(...a),
  };
});

vi.mock('../../backend/src/db/database.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getTenantStore: () => ({
      ref: () => ({
        set: (...a) => mocks.storeSet(...a),
        update: (...a) => mocks.storeUpdate(...a),
        once: vi.fn().mockResolvedValue({ exists: () => false, val: () => null }),
      }),
    }),
  };
});

vi.mock('../../backend/src/discord-bot/client.js', async (importOriginal) => {
  const actual = await importOriginal();
  const roles = new Map([
    ['1', { id: '1', name: '@everyone', position: 0 }],
    ['2', { id: '2', name: 'Officer', position: 5 }],
    ['3', { id: '3', name: 'Member', position: 1 }],
  ]);
  return {
    ...actual,
    discordClient: {
      ...actual.discordClient,
      isReady: () => true,
      guilds: {
        cache: {
          get: (id) => (String(id) === TENANT_ID ? {
            id: TENANT_ID,
            ownerId: 'officer-1',
            roles: {
              cache: {
                values: () => roles.values(),
                get: (rid) => roles.get(String(rid)),
              },
              fetch: async () => roles,
            },
            members: { cache: { get: () => null }, fetch: async () => null },
          } : undefined),
        },
      },
    },
  };
});

const { default: tenantRouter } = await import('../../backend/src/api/tenant.routes.js');

function officerSession() {
  return {
    user: {
      id: 'officer-1',
      username: 'Officer',
      displayName: 'Officer',
      isOfficer: true,
      currentTenantId: TENANT_ID,
      roles: ['Officer'],
    },
    currentTenantId: TENANT_ID,
  };
}

function memberSession() {
  return {
    user: {
      id: 'member-2',
      username: 'Member',
      displayName: 'Member',
      isOfficer: false,
      currentTenantId: TENANT_ID,
      roles: ['Member'],
    },
    currentTenantId: TENANT_ID,
  };
}

export async function officerReadsWorkspaceSettings() {
  return withEnv({}, async () => {
    mocks.setConfiguration({
      adminRoles: ['Officer'],
      timezone: 'Asia/Manila',
      guildDisplayName: 'Workspace Guild',
      guildLogoUrl: '',
    });
    return dispatch(tenantRouter, {
      method: 'GET',
      path: '/workspace',
      session: officerSession(),
    });
  });
}

export async function officerUpdatesWorkspaceSettings() {
  return withEnv({}, async () => {
    mocks.resetPersist();
    mocks.setConfiguration({
      adminRoles: ['Officer'],
      timezone: 'Asia/Manila',
      guildDisplayName: 'Workspace Guild',
      guildLogoUrl: '',
    });
    const result = await dispatch(tenantRouter, {
      method: 'POST',
      path: '/workspace',
      body: {
        guildDisplayName: 'Renamed Guild',
        timezone: 'Asia/Tokyo',
        adminRoles: ['Raid Lead', 'Officer'],
      },
      session: officerSession(),
    });
    return { ...result, persisted: mocks.persisted(), setName: mocks.setTenantDisplayName };
  });
}

export async function nonOfficerWorkspaceRefused() {
  return withEnv({}, async () => {
    mocks.setConfiguration({
      adminRoles: ['Officer'],
      timezone: 'Asia/Manila',
      guildDisplayName: 'Workspace Guild',
      guildLogoUrl: '',
    });
    const read = await dispatch(tenantRouter, {
      method: 'GET',
      path: '/workspace',
      session: memberSession(),
    });
    const update = await dispatch(tenantRouter, {
      method: 'POST',
      path: '/workspace',
      body: { guildDisplayName: 'Nope' },
      session: memberSession(),
    });
    return { read, update };
  });
}
