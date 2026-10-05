import { vi } from 'vitest';
import { patterns } from './registry.js';
import { withEnv } from './envSandbox.js';
import { dispatch } from '../support/dispatch.js';
import { RAGNAROK_ORIGIN_ID } from '../../backend/src/games/catalog.js';

patterns.ro_channel_map = 'used';
patterns.war_rooms_1_5 = 'used';
patterns.active_seat_gate_surface = 'used';

const TENANT_ID = '121212121212121212';

const mocks = vi.hoisted(() => {
  let enabledGames = ['ragnarok-origin'];
  let seatActive = true;
  let savedChannels = null;
  return {
    setEnabled(list) { enabledGames = [...list]; },
    setSeatActive(v) { seatActive = v; },
    savedChannels: () => savedChannels,
    getTenant: vi.fn(async () => ({
      id: TENANT_ID,
      display_name: 'RO Guild',
      owner_discord_id: 'officer-1',
      onboarded: true,
      enabled_games: enabledGames,
      logo_url: '',
      subscription_status: seatActive ? 'active' : 'inactive',
      billing_source: seatActive ? 'invite' : null,
      is_platform_owner: false,
      plan: 'free',
    })),
    loadTenantSettings: vi.fn(async () => ({
      configuration: { adminRoles: ['Officer'], timezone: 'Asia/Manila', guildDisplayName: 'RO Guild' },
      discordChannels: { guildId: TENANT_ID },
    })),
    saveTenantDiscordChannels: vi.fn(async (_id, channels) => {
      savedChannels = channels;
    }),
    claimTenantOwner: vi.fn(async () => null),
    tenantHasAccess: vi.fn((tenant) => String(tenant?.subscription_status || '') === 'active'),
    storeUpdate: vi.fn(async () => undefined),
  };
});

vi.mock('../../backend/src/db/tenants.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getTenant: (...a) => mocks.getTenant(...a),
    loadTenantSettings: (...a) => mocks.loadTenantSettings(...a),
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
        update: (...a) => mocks.storeUpdate(...a),
        set: vi.fn().mockResolvedValue(undefined),
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

async function postSetup(body) {
  return dispatch(tenantRouter, {
    method: 'POST',
    path: '/game-setup',
    body,
    session: officerSession(),
  });
}

export async function persistsChannelFields() {
  return withEnv({}, async () => {
    mocks.setEnabled([RAGNAROK_ORIGIN_ID]);
    mocks.setSeatActive(true);
    const result = await postSetup({
      discordChannels: {
        auctionChannelId: 'auc',
        aucreqChannelId: 'req',
        genroomId: 'gen',
        attendanceId: 'att',
        warAnnounceChannelId: 'war',
        raidScreenshotChannelId: 'shot',
        onboardingChannelId: 'onboard',
        warRooms: {
          DISCORD_WARROOM_ID_1: 'w1',
          DISCORD_WARROOM_ID_2: 'w2',
          DISCORD_WARROOM_ID_3: 'w3',
          DISCORD_WARROOM_ID_4: 'w4',
          DISCORD_WARROOM_ID_5: 'w5',
        },
      },
    });
    return { ...result, saved: mocks.savedChannels() };
  });
}

export async function persistsWarRoomsOneThroughFive() {
  return withEnv({}, async () => {
    mocks.setEnabled([RAGNAROK_ORIGIN_ID]);
    mocks.setSeatActive(true);
    await postSetup({
      discordChannels: {
        warRooms: {
          DISCORD_WARROOM_ID_1: 'a',
          DISCORD_WARROOM_ID_2: 'b',
          DISCORD_WARROOM_ID_3: 'c',
          DISCORD_WARROOM_ID_4: 'd',
          DISCORD_WARROOM_ID_5: 'e',
        },
      },
    });
    return mocks.savedChannels()?.warRooms;
  });
}

export async function gameSetupRequiresRoEnabled() {
  return withEnv({}, async () => {
    mocks.setEnabled([/* no RO */]);
    mocks.setSeatActive(true);
    return postSetup({ discordChannels: { auctionChannelId: 'auc' } });
  });
}

export async function gameSetupInactiveSeatPaymentRequired() {
  return withEnv({}, async () => {
    mocks.setEnabled([RAGNAROK_ORIGIN_ID]);
    mocks.setSeatActive(false);
    return postSetup({ discordChannels: { auctionChannelId: 'auc' } });
  });
}
