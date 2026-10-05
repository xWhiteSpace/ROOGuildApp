import { parseEnabledGames } from '../../backend/src/games/catalog.js';
import { patterns } from './registry.js';

patterns.parse_enabled_games_filter = 'used';

export function filterStoredGames(raw) {
  return parseEnabledGames(raw);
}
