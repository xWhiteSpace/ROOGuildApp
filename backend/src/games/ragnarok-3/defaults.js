/** Ragnarok 3 game settings stored on game_settings.configuration. */

export const RAGNAROK_3_DEFAULTS = {
  isForceLocked: false,
  helpEmbedUrl: '',
  raidHelpEmbedUrl: '',
  specialEventCategories: ['Raid', 'Meeting', 'PVP', 'Casual'],
  events: {},
  liveRaidMaxConfigs: 5,
  liveRaidMaxWarRooms: 2,
  attendancePollInterval: 5,
  attendanceMaxDuration: 40,
  defaultLeaveCredits: 3,
  warRooms: {},
  jobs: {},
  roles: {},
  gridTopology: { columns: 8, rows: 5 },
};

export default RAGNAROK_3_DEFAULTS;
