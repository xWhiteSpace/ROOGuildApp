import { vi } from 'vitest';
import { RAGNAROK_ORIGIN_ID, ADVENTURER_GUILD_ID, RAGNAROK_3_ID } from '../../backend/src/games/catalog.js';
import { patterns } from './registry.js';
import { withEnv } from './envSandbox.js';

patterns.require_game_gate = 'used';
patterns.game_required_403 = 'used';
patterns.tenant_required_409 = 'used';

const mocks = vi.hoisted(() => ({
  enabledGames: [],
  getTenant: vi.fn(async (id) => (id ? { id, enabled_games: mocks.enabledGames } : null)),
}));

vi.mock('../../backend/src/db/tenants.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getTenant: (...a) => mocks.getTenant(...a),
  };
});

const { requireGame } = await import('../../backend/src/middleware/requireGame.js');
const { requireTenant } = await import('../../backend/src/middleware/tenantContext.js');

function mockRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
}

async function runGameGate(gameId, { tenantId, enabledGames }) {
  return withEnv({}, async () => {
    mocks.enabledGames = enabledGames;
    mocks.getTenant.mockClear();
    const req = {
      tenantId: tenantId || undefined,
      session: tenantId ? { currentTenantId: tenantId } : {},
    };
    const res = mockRes();
    let nextCalled = false;
    await requireGame(gameId)(req, res, () => { nextCalled = true; });
    return { status: res.statusCode, body: res.body, nextCalled };
  });
}

export function roMountWithoutRoGameRequired() {
  return runGameGate(RAGNAROK_ORIGIN_ID, {
    tenantId: 't1',
    enabledGames: [ADVENTURER_GUILD_ID],
  });
}

export function agMountWithoutAgGameRequired() {
  return runGameGate(ADVENTURER_GUILD_ID, {
    tenantId: 't1',
    enabledGames: [RAGNAROK_ORIGIN_ID],
  });
}

export function r3MountWithoutR3GameRequired() {
  return runGameGate(RAGNAROK_3_ID, {
    tenantId: 't1',
    enabledGames: [RAGNAROK_ORIGIN_ID, ADVENTURER_GUILD_ID],
  });
}

export function enabledGamePassesRequireGame() {
  return runGameGate(RAGNAROK_ORIGIN_ID, {
    tenantId: 't1',
    enabledGames: [RAGNAROK_ORIGIN_ID],
  });
}

export function missingTenantRequired409() {
  return withEnv({}, async () => {
    const req = { session: {} };
    const res = mockRes();
    let nextCalled = false;
    requireTenant(req, res, () => { nextCalled = true; });
    return { status: res.statusCode, body: res.body, nextCalled };
  });
}
