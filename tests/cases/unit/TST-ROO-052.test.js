import { describe, expect, it } from 'vitest';
import {
  agMountWithoutAgGameRequired,
  enabledGamePassesRequireGame,
  missingTenantRequired409,
  roMountWithoutRoGameRequired,
} from '../../patterns/require_game_gate.js';
import { ADVENTURER_GUILD_ID, RAGNAROK_ORIGIN_ID } from '../../../backend/src/games/catalog.js';

describe('TST-ROO-052 RequireGameGate returns 403 game_required for RO and AG mounts', () => {
  it('RO mount without ragnarok-origin → 403 game_required', async () => {
    const { status, body, nextCalled } = await roMountWithoutRoGameRequired();
    expect(status).toBe(403);
    expect(body).toMatchObject({ code: 'game_required', gameId: RAGNAROK_ORIGIN_ID });
    expect(nextCalled).toBe(false);
  });

  it('AG mount without adventurer-guild → 403 game_required', async () => {
    const { status, body, nextCalled } = await agMountWithoutAgGameRequired();
    expect(status).toBe(403);
    expect(body).toMatchObject({ code: 'game_required', gameId: ADVENTURER_GUILD_ID });
    expect(nextCalled).toBe(false);
  });

  it('Enabled game passes requireGame', async () => {
    const { nextCalled, status } = await enabledGamePassesRequireGame();
    expect(nextCalled).toBe(true);
    expect(status).toBe(200);
  });

  it('No current tenant → 409 tenant_required', async () => {
    const { status, body, nextCalled } = await missingTenantRequired409();
    expect(status).toBe(409);
    expect(body.code).toBe('tenant_required');
    expect(nextCalled).toBe(false);
  });
});
