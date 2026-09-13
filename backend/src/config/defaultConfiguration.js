import { WORKSPACE_DEFAULTS } from './workspaceDefaults.js';
import { RAGNAROK_ORIGIN_DEFAULTS } from '../games/ragnarok-origin/defaults.js';

/** Merged tenant configuration seed. Workspace + RO keys share one JSON document. */
export const DEFAULT_CONFIGURATION = {
  ...WORKSPACE_DEFAULTS,
  ...RAGNAROK_ORIGIN_DEFAULTS,
};

export default DEFAULT_CONFIGURATION;
