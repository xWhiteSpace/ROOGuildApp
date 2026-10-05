import { describe, expect, it } from 'vitest';
import {
  agIgnoresDiscordChannelMap,
  enabledAgAloneReady,
  gameSetupPathsHasNoAdventurerGuild,
} from '../../patterns/ag_no_setup.js';
import { ADVENTURER_GUILD_ID } from '../../../backend/src/games/catalog.js';

describe('TST-ROO-050 AgNoSetupReadiness marks AG ready on enable alone', () => {
  it('GAME_SETUP_PATHS has no adventurer-guild entry', () => {
    expect(gameSetupPathsHasNoAdventurerGuild()).toBe(false);
  });

  it('Enabled AG alone → gameSetupMap ready', () => {
    expect(enabledAgAloneReady()[ADVENTURER_GUILD_ID]).toBe(true);
  });

  it('No channel ids required for AG', () => {
    expect(agIgnoresDiscordChannelMap()[ADVENTURER_GUILD_ID]).toBe(true);
  });
});
