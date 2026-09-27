/** Ragnarok Origin game settings stored on tenant_settings.configuration. */

export const RAGNAROK_ORIGIN_DEFAULTS = {
  isForceLocked: false,
  helpEmbedUrl: '',
  raidHelpEmbedUrl: '',
  priorityLookbackDays: 30,
  specialEventCategories: ['Raid', 'Meeting', 'PVP', 'Casual'],
  items: [],
  events: {},
  liveRaidMaxConfigs: 5,
  liveRaidMaxWarRooms: 2,
  attendancePollInterval: 5,
  attendanceMaxDuration: 40,
  defaultLeaveCredits: 3,
  warRooms: {},
  jobs: {},
  roles: {},
};

export default RAGNAROK_ORIGIN_DEFAULTS;

/** Same 1–365 window as Game Settings `priorityLookbackDays`. */
export function clampLookbackDays(raw) {
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n)) return RAGNAROK_ORIGIN_DEFAULTS.priorityLookbackDays;
  return Math.min(365, Math.max(1, n));
}
