export const RAGNAROK_ORIGIN_ID = 'ragnarok-origin';

export const RAGNAROK_ORIGIN = {
  id: RAGNAROK_ORIGIN_ID,
  label: 'Ragnarok Origin',
  shortLabel: 'Ragnarok',
  description: 'Auction, raid attendance, party grids, Mimic Book',
  homePath: '/',
  pathPrefix: '',
  setupPath: '/games/ragnarok-origin/setup',
  settingsPath: '/games/ragnarok-origin/settings',
  modules: [
    {
      id: 'auction',
      label: 'Auction',
      helpKey: 'auction',
      items: [
        { label: 'Request', path: '/', icon: 'request' },
        { label: 'Mimic Book', path: '/mimic-book', icon: 'book' },
        { label: 'Request History', path: '/request-history', icon: 'history' },
        { label: 'Past Auction', path: '/past-auction', icon: 'past' },
      ],
    },
    {
      id: 'raid',
      label: 'Raid',
      helpKey: 'raid',
      items: [
        { label: 'MasterList', path: '/attendance/masterlist', icon: 'request' },
        { label: 'Profile', path: '/attendance/profile', icon: 'user' },
        { label: 'Peak Hours', path: '/attendance/peak-hours', icon: 'peak' },
        { label: 'Raid Config', path: '/attendance/raidparty', icon: 'book' },
        { label: 'War Room', path: '/attendance/war-room', icon: 'swords' },
        { label: 'GVG Attendance', path: '/attendance/ocr-review', icon: 'gallery' },
        { label: 'GVG History', path: '/attendance/history', icon: 'history' },
        { label: 'Attendance', path: '/attendance/statistics', icon: 'stats' },
        { label: 'Calendar', path: '/attendance/scheduler', icon: 'scheduler' },
      ],
    },
  ],
};

export default RAGNAROK_ORIGIN;
