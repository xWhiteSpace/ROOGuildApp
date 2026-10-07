import { describe, expect, it } from 'vitest';
import { dualRosterSameDiscordId } from '../../patterns/r3_isolation.js';
import { RAGNAROK_3_ID, RAGNAROK_ORIGIN_ID } from '../../../backend/src/games/catalog.js';

describe('TST-R3-002 Dual roster allows the same discord_id on Origin and R3', () => {
  it('two members rows for the same discord_id with distinct game_id', async () => {
    const r = await dualRosterSameDiscordId();
    expect(r.count).toBe(2);
    expect(r.discordIds).toEqual(['u1', 'u1']);
    expect(r.games).toEqual([RAGNAROK_ORIGIN_ID, RAGNAROK_3_ID]);
  });
});
