import { vi } from 'vitest';
import { patterns } from './registry.js';
import { withEnv } from './envSandbox.js';
import { dispatch } from '../support/dispatch.js';

patterns.disable_game_preserve_data = 'used';
patterns.enabled_games_remove = 'used';

const TENANT_ID = '444555666777888999';
const RO = 'ragnarok-origin';
const AG = 'adventurer-guild';

const mocks = vi.hoisted(() => {
  let enabledGames = ['ragnarok-origin', 'adventurer-guild'];
  const channelMap = {
    guildId: '444555666777888999',
    auctionChannelId: 'auc-1',
    warRooms: { DISCORD_WARROOM_ID_1: 'wr-1' },
  };
  let jsonDocsTouched = false;
  let channelsSaved = false;
  return {
    getEnabled: () => enabledGames,
    setEnabled(list) { enabledGames = [...list]; },
    channelMap: () => channelMap,
    jsonDocsTouched: () => jsonDocsTouched,
    channelsSaved: () => channelsSaved,
    resetFlags() { jsonDocsTouched = false; channelsSaved = false; },
    markJsonDocs() { jsonDocsTouched = true; },
    getTenant: vi.fn(async () => ({
      id: '444555666777888999',
      display_name: 'Games Guild',
      owner_discord_id: 'officer-1',
      onboarded: true,
      enabled_games: enabledGames,
      logo_url: '',
      subscription_status: 'inactive',
      billing_source: null,
      is_platform_owner: false,
      plan: 'free',
    })),
    loadTenantSettings: vi.fn(async () => ({
      configuration: { adminRoles: ['Officer'], timezone: 'Asia/Manila', guildDisplayName: 'Games Guild' },
      discordChannels: channelMap,
    })),
    setTenantEnabledGames: vi.fn(async (_id, list) => {
      enabledGames = [...list];
      return { id: '444555666777888999', enabled_games: enabledGames };
    }),
    saveTenantDiscordChannels: vi.fn(async () => { channelsSaved = true; }),
    claimTenantOwner: vi.fn(async () => null),
    tenantHasAccess: vi.fn(() => false),
    storeUpdate: vi.fn(async () => { jsonDocsTouched = true; }),
    storeSet: vi.fn(async () => { jsonDocsTouched = true; }),
  };
});

vi.mock('../../backend/src/db/tenants.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getTenant: (...a) => mocks.getTenant(...a),
    loadTenantSettings: (...a) => mocks.loadTenantSettings(...a),
    setTenantEnabledGames: (...a) => mocks.setTenantEnabledGames(...a),
    saveTenantDiscordChannels: (...a) => mocks.saveTenantDiscordChannels(...a),
    claimTenantOwner: (...a) => mocks.claimTenantOwner(...a),
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
  return {
    ...actual,
    getTenantStore: () => ({
      ref: () => ({
        update: async (...a) => mocks.storeUpdate(...a),
        set: async (...a) => mocks.storeSet(...a),
        once: vi.fn().mockResolvedValue({ exists: () => false, val: () => null }),
      }),
    }),
  };
});

vi.mock('../../backend/src/discord-bot/client.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    discordClient: {
      ...actual.discordClient,
      isReady: () => false,
      guilds: { cache: { get: () => undefined, has: () => false } },
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

async function disable(gameId) {
  return dispatch(tenantRouter, {
    method: 'POST',
    path: '/disable-game',
    body: { gameId },
    session: officerSession(),
  });
}

export async function disableRemovesKnownGameId() {
  return withEnv({}, async () => {
    mocks.setEnabled([RO, AG]);
    mocks.resetFlags();
    const result = await disable(RO);
    return { ...result, enabled: mocks.getEnabled() };
  });
}

export async function disablePreservesStoresAndChannels() {
  return withEnv({}, async () => {
    mocks.setEnabled([RO, AG]);
    mocks.resetFlags();
    mocks.saveTenantDiscordChannels.mockClear();
    const beforeChannels = {
      guildId: mocks.channelMap().guildId,
      auctionChannelId: mocks.channelMap().auctionChannelId,
      warRooms: { ...mocks.channelMap().warRooms },
    };
    await disable(AG);
    return {
      channelsSaved: mocks.channelsSaved(),
      channelMap: mocks.channelMap(),
      beforeChannels,
      saveChannelsCalls: mocks.saveTenantDiscordChannels.mock.calls.length,
    };
  });
}

export async function disableUnknownGameValidation() {
  return withEnv({}, async () => {
    mocks.setEnabled([RO]);
    mocks.setTenantEnabledGames.mockClear();
    const result = await disable('minecraft');
    return { ...result, enabled: mocks.getEnabled(), setCalls: mocks.setTenantEnabledGames.mock.calls };
  });
}

export async function disableWithoutActiveSeat() {
  return withEnv({}, async () => {
    mocks.setEnabled([RO, AG]);
    mocks.tenantHasAccess.mockReturnValue(false);
    const result = await disable(RO);
    return { ...result, enabled: mocks.getEnabled() };
  });
}
