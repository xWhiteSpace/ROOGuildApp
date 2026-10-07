import { describe, expect, it } from 'vitest';
import { publishedGameIds, unknownGameRejected } from '../../patterns/known_game_ids.js';
import { filterStoredGames } from '../../patterns/parse_enabled_games_filter.js';
import { setupPathForR3 } from '../../patterns/enable_known_game.js';
import { gameIdForPath } from '../../../frontend/src/games/catalog.js';

describe('TST-ROO-046 GamesWhitelist accepts adventurer-guild, ragnarok-origin, and ragnarok-3', () => {
  it('KNOWN_GAME_IDS includes adventurer-guild, ragnarok-origin, and ragnarok-3', () => {
    expect(publishedGameIds()).toEqual(['adventurer-guild', 'ragnarok-origin', 'ragnarok-3']);
  });

  it('isKnownGame rejects unknown id', () => {
    expect(unknownGameRejected('minecraft')).toBe(false);
    expect(unknownGameRejected('adventurer-guild')).toBe(true);
    expect(unknownGameRejected('ragnarok-origin')).toBe(true);
    expect(unknownGameRejected('ragnarok-3')).toBe(true);
  });

  it('parseEnabledGames drops unknown stored ids', () => {
    expect(filterStoredGames(['adventurer-guild', 'minecraft', 'ragnarok-origin', 'ragnarok-3'])).toEqual([
      'adventurer-guild',
      'ragnarok-origin',
      'ragnarok-3',
    ]);
    expect(filterStoredGames('["ragnarok-origin","not-a-game"]')).toEqual(['ragnarok-origin']);
  });

  it('R3 has no setupPath and gameIdForPath matches /games/ragnarok-3 first', () => {
    expect(setupPathForR3()).toBe('/games/ragnarok-3');
    expect(gameIdForPath('/games/ragnarok-3')).toBe('ragnarok-3');
    expect(gameIdForPath('/games/ragnarok-3/war-room')).toBe('ragnarok-3');
    expect(gameIdForPath('/attendance/masterlist')).toBe('ragnarok-origin');
    expect(gameIdForPath('/games/adventurer-guild/events')).toBe('adventurer-guild');
  });
});
