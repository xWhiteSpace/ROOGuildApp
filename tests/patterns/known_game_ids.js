import { isKnownGame, KNOWN_GAME_IDS } from '../../backend/src/games/catalog.js';
import { patterns } from './registry.js';

patterns.known_game_ids = 'used';

export function publishedGameIds() {
  return [...KNOWN_GAME_IDS];
}

export function unknownGameRejected(gameId) {
  return isKnownGame(gameId);
}
