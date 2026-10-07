import { WORKSPACE_CONFIG_KEYS, WORKSPACE_DEFAULTS } from './workspaceDefaults.js';
import { RAGNAROK_ORIGIN_DEFAULTS } from '../games/ragnarok-origin/defaults.js';
import { RAGNAROK_3_DEFAULTS } from '../games/ragnarok-3/defaults.js';
import { RAGNAROK_ORIGIN_ID, RAGNAROK_3_ID } from '../games/catalog.js';

export function pickWorkspaceConfig(config = {}) {
  const out = {};
  for (const key of WORKSPACE_CONFIG_KEYS) {
    if (Object.prototype.hasOwnProperty.call(config || {}, key)) out[key] = config[key];
  }
  return out;
}

export function omitWorkspaceConfig(config = {}) {
  const out = { ...(config || {}) };
  for (const key of WORKSPACE_CONFIG_KEYS) delete out[key];
  return out;
}

export function defaultsForGame(gameId) {
  const id = String(gameId || '');
  if (id === RAGNAROK_ORIGIN_ID) return { ...RAGNAROK_ORIGIN_DEFAULTS };
  if (id === RAGNAROK_3_ID) return { ...RAGNAROK_3_DEFAULTS };
  return {};
}

export function mergeGameConfiguration(workspace, game, gameId) {
  return {
    ...WORKSPACE_DEFAULTS,
    ...defaultsForGame(gameId),
    ...(workspace || {}),
    ...(game || {}),
  };
}
