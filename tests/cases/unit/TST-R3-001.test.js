import { describe, expect, it } from 'vitest';
import { r3MountWithoutR3GameRequired } from '../../patterns/require_game_gate.js';
import { RAGNAROK_3_ID } from '../../../backend/src/games/catalog.js';

describe('TST-R3-001 RequireGameGate returns 403 game_required for Ragnarok 3 mounts', () => {
  it('R3 middleware without ragnarok-3 → 403 game_required', async () => {
    const { status, body, nextCalled } = await r3MountWithoutR3GameRequired();
    expect(status).toBe(403);
    expect(body).toMatchObject({ code: 'game_required', gameId: RAGNAROK_3_ID });
    expect(nextCalled).toBe(false);
  });
});
