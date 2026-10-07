import { describe, expect, it } from 'vitest';
import { r3MountWithoutR3 } from '../../patterns/unit_require_game_mount_tree.js';
import { RAGNAROK_3_ID } from '../../../backend/src/games/catalog.js';

describe('TST-R3-006 R3 API tree without ragnarok-3 returns 403 game_required', () => {
  it('R3 API tree without ragnarok-3 → 403 game_required', async () => {
    const { status, body } = await r3MountWithoutR3();
    expect(status).toBe(403);
    expect(body).toMatchObject({ code: 'game_required', gameId: RAGNAROK_3_ID });
  });
});
