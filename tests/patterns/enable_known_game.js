import { vi } from 'vitest';
import { patterns } from './registry.js';
import { withEnv } from './envSandbox.js';
import { dispatch } from '../support/dispatch.js';
import { setupPathForGame, RAGNAROK_ORIGIN_ID, ADVENTURER_GUILD_ID, RAGNAROK_3_ID } from '../../backend/src/games/catalog.js';

patterns.enable_known_game = 'used';
patterns.setup_path_for_game = 'used';
patterns.active_seat_gate_surface = 'used';

const TENANT_ID = '333444555666777888';

const mocks = vi.hoisted(() => {
  let enabledGames = [];
  let seatActive = true;
  return {
    getEnabled: () => enabledGames,
    setEnabled(list) { enabledGames = [...list]; },
    setSeatActive(v) { seatActive = v; },
    getTenant: vi.fn(async () => ({
      id: TENANT_ID,
      display_name: 'Games Guild',
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
      configuration: { adminRoles: ['Officer'], timezone: 'Asia/Manila', guildDisplayName: 'Games Guild' },
      discordChannels: {},
    })),
    setTenantEnabledGames: vi.fn(async (_id, list) => {
      enabledGames = [...list];
      return { id: TENANT_ID, enabled_games: enabledGames };
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
    setTenantEnabledGames: (...a) => mocks.setTenantEnabledGames(...a),
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

async function enable(gameId) {
  return dispatch(tenantRouter, {
    method: 'POST',
    path: '/enable-game',
    body: { gameId },
    session: officerSession(),
  });
}

export async function enableKnownGameIdempotent() {
  return withEnv({}, async () => {
    mocks.setSeatActive(true);
    mocks.setEnabled([]);
    mocks.setTenantEnabledGames.mockClear();
    const first = await enable(RAGNAROK_ORIGIN_ID);
    const second = await enable(RAGNAROK_ORIGIN_ID);
    return { first, second, enabled: mocks.getEnabled(), setCalls: mocks.setTenantEnabledGames.mock.calls };
  });
}

export function setupPathForRo() {
  return setupPathForGame(RAGNAROK_ORIGIN_ID);
}

export function setupPathForAg() {
  return setupPathForGame(ADVENTURER_GUILD_ID);
}

export function setupPathForR3() {
  return setupPathForGame(RAGNAROK_3_ID);
}

export async function enableInactiveSeatPaymentRequired() {
  return withEnv({}, async () => {
    mocks.setSeatActive(false);
    mocks.setEnabled([]);
    return enable(RAGNAROK_ORIGIN_ID);
  });
}

export async function enableUnknownGameRefused() {
  return withEnv({}, async () => {
    mocks.setSeatActive(true);
    mocks.setEnabled([RAGNAROK_ORIGIN_ID]);
    mocks.setTenantEnabledGames.mockClear();
    const result = await enable('minecraft');
    return { ...result, enabled: mocks.getEnabled(), setCalls: mocks.setTenantEnabledGames.mock.calls };
  });
}

export async function enableReturnsSetupPathInBody(gameId) {
  return withEnv({}, async () => {
    mocks.setSeatActive(true);
    mocks.setEnabled([]);
    return enable(gameId);
  });
}
