import { RAGNAROK_ORIGIN, RAGNAROK_ORIGIN_ID } from './ragnarok-origin/manifest.js';

export { RAGNAROK_ORIGIN, RAGNAROK_ORIGIN_ID };

export const GAMES = [RAGNAROK_ORIGIN];

export function getGame(gameId) {
  return GAMES.find((game) => game.id === String(gameId || '')) || null;
}

export function gamesForEnabled(enabledIds) {
  const enabled = new Set((enabledIds || []).map(String));
  return GAMES.filter((game) => enabled.has(game.id));
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
  return Boolean(gameSetup?.[gameId]);
}
