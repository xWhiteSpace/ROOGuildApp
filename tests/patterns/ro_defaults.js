import { patterns } from './registry.js';
import { RAGNAROK_ORIGIN_DEFAULTS } from '../../backend/src/games/ragnarok-origin/defaults.js';
import { WORKSPACE_DEFAULTS } from '../../backend/src/config/workspaceDefaults.js';
import { DEFAULT_CONFIGURATION } from '../../backend/src/config/defaultConfiguration.js';

patterns.ro_defaults = 'used';

export function itemsAndEventsEmpty() {
  return {
    items: RAGNAROK_ORIGIN_DEFAULTS.items,
    events: RAGNAROK_ORIGIN_DEFAULTS.events,
  };
}

export function leaveCreditsAndLiveRaidCaps() {
  return {
    defaultLeaveCredits: RAGNAROK_ORIGIN_DEFAULTS.defaultLeaveCredits,
    liveRaidMaxConfigs: RAGNAROK_ORIGIN_DEFAULTS.liveRaidMaxConfigs,
    liveRaidMaxWarRooms: RAGNAROK_ORIGIN_DEFAULTS.liveRaidMaxWarRooms,
  };
}

export function specialEventCategoriesFour() {
  return RAGNAROK_ORIGIN_DEFAULTS.specialEventCategories;
}

export function emptyPlaceholders() {
  return {
    warRooms: RAGNAROK_ORIGIN_DEFAULTS.warRooms,
    jobs: RAGNAROK_ORIGIN_DEFAULTS.jobs,
    roles: RAGNAROK_ORIGIN_DEFAULTS.roles,
  };
}

export function helpEmbedUrlsEmpty() {
  return {
    helpEmbedUrl: RAGNAROK_ORIGIN_DEFAULTS.helpEmbedUrl,
    raidHelpEmbedUrl: RAGNAROK_ORIGIN_DEFAULTS.raidHelpEmbedUrl,
  };
}

export function roMergedWithWorkspace() {
  return {
    defaults: DEFAULT_CONFIGURATION,
    expected: { ...WORKSPACE_DEFAULTS, ...RAGNAROK_ORIGIN_DEFAULTS },
  };
}
