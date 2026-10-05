import { vi } from 'vitest';
import { patterns } from './registry.js';
import { withEnv } from './envSandbox.js';
import { createMemoryTenantStore } from '../support/memoryTenantStore.js';
import { runWithTenant } from '../../backend/src/db/tenantContext.js';
import { dispatch } from '../support/dispatch.js';
import { WORKSPACE_CONFIG_KEYS } from '../../backend/src/config/workspaceDefaults.js';

patterns.settings_save = 'used';
patterns.scope_merge = 'used';
patterns.raid_overlap = 'used';

const TENANT_ID = 'save-tenant-1';

function baseConfig() {
  return {
    timezone: 'Asia/Manila',
    adminRoles: ['Officer'],
    guildDisplayName: 'Old Name',
    guildLogoUrl: '',
    helpEmbedUrl: 'https://old.example/help',
    items: [{ id: 'puppet', name: 'Puppet' }],
    events: {
      a: {
        title: 'Alpha',
        raid: {
          configId: 'cfg-a',
          phases: {
            1: { dayStart: 0, timeStart: '10:00' },
            3: { dayEnd: 0, timeEnd: '12:00', timeStart: '11:00' },
          },
        },
      },
    },
  };
}

const harness = vi.hoisted(() => ({
  store: null,
  savedChannels: null,
}));

vi.mock('../../backend/src/db/database.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getTenantStore: () => harness.store,
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
    loadTenantSettings: async () => ({
      configuration: harness.store
        ? ((await harness.store.ref('settings/configuration').once()).val() || {})
        : {},
      discordChannels: harness.savedChannels || {},
    }),
    saveTenantDiscordChannels: async (_id, channels) => {
      harness.savedChannels = channels;
    },
  };
});

const requestRoutes = (await import('../../backend/src/api/request.routes.js')).default;

function seed(config = baseConfig()) {
  harness.savedChannels = null;
  harness.store = createMemoryTenantStore({
    settings: { configuration: config },
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

async function savedConfig() {
  const snap = await harness.store.ref('settings/configuration').once();
  return snap.val();
}

export async function workspaceScopeMergesWorkspaceOnly() {
  return withEnv({}, async () => {
    seed();
    const res = await runWithTenant(TENANT_ID, () => dispatch(requestRoutes, {
      method: 'POST',
      path: '/settings/save',
      session: officerSession(),
      body: {
        scope: 'workspace',
        config: {
          guildDisplayName: 'New Name',
          timezone: 'Asia/Tokyo',
          adminRoles: ['Officer'],
          helpEmbedUrl: 'https://should-not-merge.example',
          items: [{ id: 'hack', name: 'Hack' }],
        },
      },
    }));
    return { res, saved: await savedConfig(), workspaceKeys: WORKSPACE_CONFIG_KEYS };
  });
}

export async function gameScopeMergesNonWorkspace() {
  return withEnv({}, async () => {
    seed();
    const res = await runWithTenant(TENANT_ID, () => dispatch(requestRoutes, {
      method: 'POST',
      path: '/settings/save',
      session: officerSession(),
      body: {
        scope: 'game',
        config: {
          helpEmbedUrl: 'https://new.example/help',
          items: [{ id: 'card', name: 'Card' }],
          guildDisplayName: 'Should Not Replace',
        },
      },
    }));
    return { res, saved: await savedConfig() };
  });
}

export async function omittedScopeDefaultsToGame() {
  return withEnv({}, async () => {
    seed();
    const res = await runWithTenant(TENANT_ID, () => dispatch(requestRoutes, {
      method: 'POST',
      path: '/settings/save',
      session: officerSession(),
      body: {
        config: {
          helpEmbedUrl: 'https://default-game.example/help',
          items: [{ id: 'orb', name: 'Orb' }],
        },
      },
    }));
    return { res, saved: await savedConfig() };
  });
}

export async function gameScopePersistsChannels() {
  return withEnv({}, async () => {
    seed();
    const channels = { auctionChannelId: '999' };
    const res = await runWithTenant(TENANT_ID, () => dispatch(requestRoutes, {
      method: 'POST',
      path: '/settings/save',
      session: officerSession(),
      body: {
        scope: 'game',
        config: { helpEmbedUrl: 'https://chan.example/help' },
        discordChannels: channels,
      },
    }));
    return { res, saved: await savedConfig(), channels: harness.savedChannels };
  });
}

export async function overlappingRaidCyclesRefuse() {
  return withEnv({}, async () => {
    seed();
    const before = await savedConfig();
    const res = await runWithTenant(TENANT_ID, () => dispatch(requestRoutes, {
      method: 'POST',
      path: '/settings/save',
      session: officerSession(),
      body: {
        scope: 'game',
        config: {
          events: {
            a: {
              title: 'Alpha',
              raid: {
                configId: 'cfg-a',
                phases: {
                  1: { dayStart: 0, timeStart: '10:00' },
                  3: { dayEnd: 0, timeEnd: '14:00', timeStart: '11:00' },
                },
              },
            },
            b: {
              title: 'Beta',
              raid: {
                configId: 'cfg-b',
                phases: {
                  1: { dayStart: 0, timeStart: '12:00' },
                  3: { dayEnd: 0, timeEnd: '16:00', timeStart: '13:00' },
                },
              },
            },
          },
        },
      },
    }));
    return { res, before, after: await savedConfig() };
  });
}

export async function nonOfficerDoesNotSave() {
  return withEnv({}, async () => {
    seed();
    const before = await savedConfig();
    const res = await runWithTenant(TENANT_ID, () => dispatch(requestRoutes, {
      method: 'POST',
      path: '/settings/save',
      session: memberSession(),
      body: { scope: 'game', config: { helpEmbedUrl: 'https://hack.example' } },
    }));
    return { res, before, after: await savedConfig() };
  });
}

export async function missingConfigDoesNotSave() {
  return withEnv({}, async () => {
    seed();
    const before = await savedConfig();
    const res = await runWithTenant(TENANT_ID, () => dispatch(requestRoutes, {
      method: 'POST',
      path: '/settings/save',
      session: officerSession(),
      body: { scope: 'game' },
    }));
    return { res, before, after: await savedConfig() };
  });
}
