/**
 * Single default settings/configuration seed — imported by request.routes + timeWindow.
 */
export const DEFAULT_CONFIGURATION = {
  timezone: 'Asia/Manila',
  isForceLocked: false,
  adminRoles: ['GUILD LEADER', 'Vice Guild Leader', 'Commander'],
  helpEmbedUrl: '',
  raidHelpEmbedUrl: '',
  priorityLookbackDays: 30,
  specialEventCategories: ['Raid', 'Meeting', 'PVP', 'Casual'],
  items: [
    { id: 'item_001', name: 'Puppet Scroll', colorTheme: 'purple', isHighValue: false },
    { id: 'item_002', name: 'Illusion Scroll', colorTheme: 'yellow', isHighValue: false },
    { id: 'item_003', name: 'Light & Dark Scroll', colorTheme: 'slate', isHighValue: false },
    { id: 'item_004', name: 'Time & Space Scroll', colorTheme: 'red', isHighValue: false },
  ],
  events: {
    ev_001: {
      title: 'GuildLeague',
      phases: {
        1: { dayStart: 0, timeStart: '22:15', dayEnd: 1, timeEnd: '22:15' },
        2: { dayStart: 1, timeStart: '22:15', dayEnd: 2, timeEnd: '20:55' },
        3: { dayStart: 2, timeStart: '20:55', dayEnd: 2, timeEnd: '22:15' },
      },
      loots: {
        item_001: 1,
        item_002: 1,
        item_003: 3,
        item_004: 5,
      },
      announcements: {
        phase1: ['07:00', '12:00', '19:00'],
        phase2: '22:15',
        phase3: '20:55',
      },
    },
  },
  liveRaidMaxConfigs: 5,
  liveRaidMaxWarRooms: 2,
  attendancePollInterval: 5,
  attendanceMaxDuration: 40,
  warRooms: {
    room_001: { name: 'Guild League Main', envKey: 'DISCORD_WARROOM_ID_1' },
    room_002: { name: 'Guild League Main 2', envKey: 'DISCORD_WARROOM_ID_2' },
    room_003: { name: 'Guild League Main 3', envKey: 'DISCORD_WARROOM_ID_3' },
    room_004: { name: 'Guild League Main 4', envKey: 'DISCORD_WARROOM_ID_4' },
    room_005: { name: 'Guild League Main 5', envKey: 'DISCORD_WARROOM_ID_5' },
  },
  jobs: {},
  roles: {},
};

export default DEFAULT_CONFIGURATION;
