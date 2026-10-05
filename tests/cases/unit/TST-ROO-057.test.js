import { describe, expect, it } from 'vitest';
import {
  agMountWithoutAg,
  enabledRoPassesMountGate,
  missingTenantAtMount,
  roMountWithoutRo,
} from '../../patterns/unit_require_game_mount_tree.js';
import { ADVENTURER_GUILD_ID, RAGNAROK_ORIGIN_ID } from '../../../backend/src/games/catalog.js';

describe('TST-ROO-057 RequireGame mount/API-tree wiring under CMP-008 for RO and AG', () => {
  it('RO API tree without RO enabled → 403 game_required', async () => {
    const { status, body } = await roMountWithoutRo();
    expect(status).toBe(403);
    expect(body).toMatchObject({ code: 'game_required', gameId: RAGNAROK_ORIGIN_ID });
  });

  it('AG API tree without AG enabled → 403 game_required', async () => {
    const { status, body } = await agMountWithoutAg();
    expect(status).toBe(403);
    expect(body).toMatchObject({ code: 'game_required', gameId: ADVENTURER_GUILD_ID });
  });

  it('Enabled game allows mount through gate', async () => {
    const { status, body } = await enabledRoPassesMountGate();
    expect(body?.code).not.toBe('game_required');
    expect(!(status === 403 && body?.code === 'game_required')).toBe(true);
  });

  it('Missing tenant → 409 tenant_required', async () => {
    const { status, body } = await missingTenantAtMount();
    expect(status).toBe(409);
    expect(body.code).toBe('tenant_required');
  });
});
