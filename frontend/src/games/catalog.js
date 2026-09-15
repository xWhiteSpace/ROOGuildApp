import { RAGNAROK_ORIGIN, RAGNAROK_ORIGIN_ID } from './ragnarok-origin/manifest.js';
import { ADVENTURER_GUILD, ADVENTURER_GUILD_ID } from './adventurer-guild/manifest.js';

export { RAGNAROK_ORIGIN, RAGNAROK_ORIGIN_ID, ADVENTURER_GUILD, ADVENTURER_GUILD_ID };

export const GAMES = [ADVENTURER_GUILD, RAGNAROK_ORIGIN];

export function getGame(gameId) {
  return GAMES.find((game) => game.id === String(gameId || '')) || null;
}

export function gamesForEnabled(enabledIds) {
  const byId = new Map(GAMES.map((game) => [game.id, game]));
  return (enabledIds || []).map(String).map((id) => byId.get(id)).filter(Boolean);
}

export function firstEnabledGameId(enabledIds) {
  return gamesForEnabled(enabledIds)[0]?.id || null;
}

export function moduleForPath(pathname, game) {
  if (!game) return null;
  for (const mod of game.modules) {
    const hit = mod.items.some((item) => {
      if (item.path === '/') return pathname === '/';
      return pathname === item.path || pathname.startsWith(`${item.path}/`);
    });
    if (hit) return mod;
  }
  if (pathname === game.settingsPath || pathname === '/settings-configuration') return null;
  return game.modules[0] || null;
}

export function isGameSetupComplete(gameId, gameSetup) {
  const game = getGame(gameId);
  if (!game?.setupPath) return true;
  return Boolean(gameSetup?.[gameId]);
}

export function gameIdForPath(pathname) {
  const path = String(pathname || '');
  if (path === '/games/adventurer-guild' || path.startsWith('/games/adventurer-guild/')) {
    return ADVENTURER_GUILD_ID;
  }
  if (path === '/games/ragnarok-origin' || path.startsWith('/games/ragnarok-origin/')) {
    return RAGNAROK_ORIGIN_ID;
  }
  if (
    path === '/workspace'
    || path.startsWith('/workspace/')
    || path === '/select-guild'
    || path === '/onboard'
    || path === '/landing'
    || path === '/login'
  ) {
    return null;
  }
  return RAGNAROK_ORIGIN_ID;
}

export function resolvePostLoginPath(user) {
  if (!user?.currentTenantId) return '/select-guild';
  const enabled = user.enabledGames || [];
  if (!enabled.length) return '/workspace/games';
  for (const id of enabled) {
    const game = getGame(id);
    if (game?.setupPath && !isGameSetupComplete(id, user.gameSetup)) {
      return game.setupPath;
    }
  }
  return getGame(firstEnabledGameId(enabled))?.homePath || '/';
}
