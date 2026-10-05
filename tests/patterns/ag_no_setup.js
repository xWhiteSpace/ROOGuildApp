import {
  ADVENTURER_GUILD_ID,
  GAME_SETUP_PATHS,
  gameSetupMap,
} from '../../backend/src/games/catalog.js';
import { patterns } from './registry.js';

patterns.ag_no_setup = 'used';
patterns.game_setup_paths_absent = 'used';

export function gameSetupPathsHasNoAdventurerGuild() {
  return Object.prototype.hasOwnProperty.call(GAME_SETUP_PATHS, ADVENTURER_GUILD_ID);
}

export function enabledAgAloneReady() {
  return gameSetupMap([ADVENTURER_GUILD_ID], {});
}

export function agIgnoresDiscordChannelMap() {
  return gameSetupMap([ADVENTURER_GUILD_ID], {
    aucreqChannelId: '',
    auctionChannelId: '',
    warAnnounceChannelId: '',
  });
}
