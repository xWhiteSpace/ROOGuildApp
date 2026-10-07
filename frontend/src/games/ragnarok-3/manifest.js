export const RAGNAROK_3_ID = 'ragnarok-3';

export const RAGNAROK_3 = {
  id: RAGNAROK_3_ID,
  label: 'Ragnarok 3',
  shortLabel: 'RO3',
  description: 'Raid attendance, party grids, War Room, GvG OCR',
  homePath: '/games/ragnarok-3',
  pathPrefix: '/games/ragnarok-3',
  setupPath: '',
  settingsPath: '/games/ragnarok-3/settings',
  modules: [
    {
      id: 'raid',
      label: 'Raid',
      helpKey: 'raid',
      items: [
        { label: 'MasterList', path: '/games/ragnarok-3', icon: 'request', end: true },
        { label: 'Profile', path: '/games/ragnarok-3/profile', icon: 'user' },
        { label: 'Peak Hours', path: '/games/ragnarok-3/peak-hours', icon: 'peak' },
        { label: 'Raid Config', path: '/games/ragnarok-3/raid-config', icon: 'book' },
        { label: 'War Room', path: '/games/ragnarok-3/war-room', icon: 'swords' },
        { label: 'GVG Attendance', path: '/games/ragnarok-3/gvg-attendance', icon: 'gallery' },
        { label: 'Calendar', path: '/games/ragnarok-3/calendar', icon: 'scheduler' },
        { label: 'Help Guide', path: '/games/ragnarok-3/help', icon: 'history' },
      ],
    },
  ],
};

export default RAGNAROK_3;
