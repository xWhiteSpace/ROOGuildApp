import { describe, expect, it } from 'vitest';
import { publishedGameIds, unknownGameRejected } from '../../patterns/known_game_ids.js';
import { filterStoredGames } from '../../patterns/parse_enabled_games_filter.js';

describe('TST-ROO-046 GamesWhitelist accepts only adventurer-guild and ragnarok-origin', () => {
  it('KNOWN_GAME_IDS is exactly adventurer-guild and ragnarok-origin', () => {
    expect(publishedGameIds()).toEqual(['adventurer-guild', 'ragnarok-origin']);
  });

  it('isKnownGame rejects unknown id', () => {
    expect(unknownGameRejected('minecraft')).toBe(false);
    expect(unknownGameRejected('adventurer-guild')).toBe(true);
    expect(unknownGameRejected('ragnarok-origin')).toBe(true);
  });

  it('parseEnabledGames drops unknown stored ids', () => {
    expect(filterStoredGames(['adventurer-guild', 'minecraft', 'ragnarok-origin'])).toEqual([
      'adventurer-guild',
      'ragnarok-origin',
    ]);
    expect(filterStoredGames('["ragnarok-origin","not-a-game"]')).toEqual(['ragnarok-origin']);
  });
});
