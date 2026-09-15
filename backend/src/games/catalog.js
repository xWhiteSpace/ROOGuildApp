export const RAGNAROK_ORIGIN_ID = 'ragnarok-origin';
export const ADVENTURER_GUILD_ID = 'adventurer-guild';

export const KNOWN_GAME_IDS = [ADVENTURER_GUILD_ID, RAGNAROK_ORIGIN_ID];

export const GAME_HOME_PATHS = {
  [ADVENTURER_GUILD_ID]: '/games/adventurer-guild',
  [RAGNAROK_ORIGIN_ID]: '/',
};

export const GAME_SETUP_PATHS = {
  [RAGNAROK_ORIGIN_ID]: '/games/ragnarok-origin/setup',
};

export function setupPathForGame(gameId) {
  return GAME_SETUP_PATHS[gameId] || GAME_HOME_PATHS[gameId] || '/';
}

export function isKnownGame(gameId) {
  return KNOWN_GAME_IDS.includes(String(gameId || ''));
}

export function parseEnabledGames(raw) {
  let list = raw;
  if (typeof raw === 'string') {
    try {
      list = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(list)) return [];
  return [...new Set(list.map((id) => String(id)).filter((id) => isKnownGame(id)))];
}

export function isRagnarokSetupComplete(discordChannels = {}) {
  return Boolean(
    discordChannels.aucreqChannelId
    || discordChannels.auctionChannelId
    || discordChannels.warAnnounceChannelId
  );
}

export function gameSetupMap(enabledGames, discordChannels) {
  const enabled = new Set(parseEnabledGames(enabledGames));
  return {
    [RAGNAROK_ORIGIN_ID]: enabled.has(RAGNAROK_ORIGIN_ID) && isRagnarokSetupComplete(discordChannels),
    [ADVENTURER_GUILD_ID]: enabled.has(ADVENTURER_GUILD_ID),
  };
}
