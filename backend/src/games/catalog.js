export const RAGNAROK_ORIGIN_ID = 'ragnarok-origin';

export const KNOWN_GAME_IDS = [RAGNAROK_ORIGIN_ID];

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
  };
}
