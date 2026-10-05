import { describe, expect, it } from 'vitest';
import {
  disablePreservesStoresAndChannels,
  disableRemovesKnownGameId,
  disableUnknownGameValidation,
  disableWithoutActiveSeat,
} from '../../patterns/disable_game_preserve_data.js';
import { RAGNAROK_ORIGIN_ID } from '../../../backend/src/games/catalog.js';

describe('TST-ROO-048 DisableGamePreserveData removes enabled id without wiping stores', () => {
  it('Officer removes known gameId from enabled_games', async () => {
    const { status, body, enabled } = await disableRemovesKnownGameId();
    expect(status).toBe(200);
    expect(enabled).not.toContain(RAGNAROK_ORIGIN_ID);
    expect(body.enabledGames).not.toContain(RAGNAROK_ORIGIN_ID);
  });

  it('Stored game documents / channel map retained', async () => {
    const result = await disablePreservesStoresAndChannels();
    expect(result.saveChannelsCalls).toBe(0);
    expect(result.channelMap).toEqual(result.beforeChannels);
  });

  it('Unknown gameId → 400-shaped validation', async () => {
    const { status, body, enabled, setCalls } = await disableUnknownGameValidation();
    expect(status).toBe(400);
    expect(body.success).toBe(false);
    expect(setCalls).toHaveLength(0);
    expect(enabled).toEqual([RAGNAROK_ORIGIN_ID]);
  });

  it('Active seat not required for disable', async () => {
    const { status, body, enabled } = await disableWithoutActiveSeat();
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(enabled).not.toContain(RAGNAROK_ORIGIN_ID);
  });
});
