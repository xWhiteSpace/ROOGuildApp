import { vi } from 'vitest';
import { patterns } from './registry.js';
import { withEnv } from './envSandbox.js';
import { dispatch } from '../support/dispatch.js';

patterns.onboard_gates = 'used';
patterns.onboard_409 = 'used';
patterns.bot_not_in_guild = 'used';

const GUILD_ID = '112233445566778899';
const MANAGE_SERVER = String(32n);

const mocks = vi.hoisted(() => {
  let created = null;
  return {
    reset(existing = null) {
      created = existing;
    },
    getCreated: () => created,
    getTenant: vi.fn(async (id) => (String(id) === GUILD_ID ? created : null)),
    createTenant: vi.fn(async (args) => {
      created = {
        id: String(args.id),
        display_name: args.displayName,
        owner_discord_id: args.ownerDiscordId,
        onboarded: Boolean(args.onboarded),
        enabled_games: [],
        subscription_status: 'inactive',
        billing_source: null,
        is_platform_owner: false,
        logo_url: '',
        plan: args.plan || 'free',
      };
      return created;
    }),
    markTenantOnboarded: vi.fn(async () => {
      if (created) created = { ...created, onboarded: true };
    }),
    loadTenantSettings: vi.fn(async () => ({
      configuration: {
        adminRoles: ['Officer'],
        timezone: 'Asia/Manila',
        guildDisplayName: 'New Guild',
        guildLogoUrl: '',
      },
      discordChannels: {
        guildId: GUILD_ID,
        auctionChannelId: '',
        aucreqChannelId: '',
        genroomId: '',
        attendanceId: '',
        warAnnounceChannelId: '',
        raidScreenshotChannelId: '',
        onboardingChannelId: '',
        warRooms: {},
      },
    })),
    claimTenantOwner: vi.fn(async () => null),
    clearGuildCommands: vi.fn(async () => []),
    storeUpdate: vi.fn(async () => undefined),
    botPresent: true,
  };
});

vi.mock('../../backend/src/db/tenants.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getTenant: (...args) => mocks.getTenant(...args),
    createTenant: (...args) => mocks.createTenant(...args),
    markTenantOnboarded: (...args) => mocks.markTenantOnboarded(...args),
    loadTenantSettings: (...args) => mocks.loadTenantSettings(...args),
    claimTenantOwner: (...args) => mocks.claimTenantOwner(...args),
  };
});

vi.mock('../../backend/src/discord-bot/deployGuild.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    clearGuildCommands: (...args) => mocks.clearGuildCommands(...args),
  };
});

vi.mock('../../backend/src/db/database.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getTenantStore: () => ({
      ref: () => ({
        update: (...args) => mocks.storeUpdate(...args),
        set: vi.fn().mockResolvedValue(undefined),
        once: vi.fn().mockResolvedValue({ exists: () => false, val: () => null }),
      }),
    }),
  };
});

vi.mock('../../backend/src/discord-bot/client.js', async (importOriginal) => {
  const actual = await importOriginal();
  const cache = {
    has: (id) => mocks.botPresent && String(id) === GUILD_ID,
    get: (id) => {
      if (!mocks.botPresent || String(id) !== GUILD_ID) return undefined;
      return {
        id: GUILD_ID,
        ownerId: 'owner-1',
        members: { cache: { get: () => null }, fetch: async () => null },
        roles: { cache: { get: () => null, values: () => [] } },
      };
    },
  };
  return {
    ...actual,
    discordClient: {
      ...actual.discordClient,
      isReady: () => mocks.botPresent,
      guilds: { cache },
    },
  };
});

const { default: tenantRouter } = await import('../../backend/src/api/tenant.routes.js');

function baseSession(overrides = {}) {
  return {
    user: { id: 'owner-1', username: 'Owner', displayName: 'Owner' },
    discordGuilds: [
      {
        id: GUILD_ID,
        name: 'New Guild',
        owner: false,
        permissions: MANAGE_SERVER,
        icon: null,
      },
    ],
    ...overrides,
  };
}

function prepare({ botPresent = true, existing = null } = {}) {
  mocks.reset(existing);
  mocks.botPresent = botPresent;
  mocks.getTenant.mockClear();
  mocks.createTenant.mockClear();
  mocks.markTenantOnboarded.mockClear();
  mocks.clearGuildCommands.mockClear();
  mocks.storeUpdate.mockClear();
}

export async function onboardHappyPathCreatesTenant() {
  return withEnv({}, async () => {
    prepare({ botPresent: true, existing: null });
    const result = await dispatch(tenantRouter, {
      method: 'POST',
      path: '/onboard',
      body: {
        guildId: GUILD_ID,
        guildName: 'New Guild',
        timezone: 'Asia/Manila',
        adminRoles: ['Officer'],
      },
      session: baseSession(),
    });
    return { ...result, createSpy: mocks.createTenant, created: mocks.getCreated() };
  });
}

export async function onboardAlreadyOnboardedConflict() {
  return withEnv({}, async () => {
    prepare({
      botPresent: true,
      existing: { id: GUILD_ID, onboarded: true, display_name: 'Already' },
    });
    return dispatch(tenantRouter, {
      method: 'POST',
      path: '/onboard',
      body: { guildId: GUILD_ID, adminRoles: ['Officer'] },
      session: baseSession(),
    });
  });
}

export async function onboardBotMissingInviteUrl() {
  return withEnv({}, async () => {
    prepare({ botPresent: false, existing: null });
    return dispatch(tenantRouter, {
      method: 'POST',
      path: '/onboard',
      body: { guildId: GUILD_ID, adminRoles: ['Officer'] },
      session: baseSession(),
    });
  });
}

export async function onboardMissingOfficerRolesRefused() {
  return withEnv({}, async () => {
    prepare({ botPresent: true, existing: null });
    const result = await dispatch(tenantRouter, {
      method: 'POST',
      path: '/onboard',
      body: { guildId: GUILD_ID, adminRoles: [] },
      session: baseSession(),
    });
    return { ...result, createSpy: mocks.createTenant };
  });
}

export async function onboardRequiresManageServerNotOfficerTools() {
  return withEnv({}, async () => {
    prepare({ botPresent: true, existing: null });
    const result = await dispatch(tenantRouter, {
      method: 'POST',
      path: '/onboard',
      body: { guildId: GUILD_ID, adminRoles: ['Officer'] },
      session: baseSession({
        discordGuilds: [
          {
            id: GUILD_ID,
            name: 'New Guild',
            owner: false,
            permissions: '0',
            icon: null,
          },
        ],
      }),
    });
    return { ...result, createSpy: mocks.createTenant };
  });
}
