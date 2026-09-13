export const RAGNAROK_ORIGIN_ID = 'ragnarok-origin';

export const RAGNAROK_ORIGIN = {
  id: RAGNAROK_ORIGIN_ID,
  label: 'Ragnarok Origin',
  shortLabel: 'Ragnarok',
  homePath: '/',
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
        { label: 'Raid Party', path: '/attendance/raidparty', icon: 'book' },
        { label: 'Raid Compose', path: '/attendance/compose', icon: 'live' },
        { label: 'Live Raid', path: '/attendance/liveraid', icon: 'live' },
        { label: 'History', path: '/attendance/history', icon: 'history' },
        { label: 'Statistics', path: '/attendance/statistics', icon: 'history' },
        { label: 'Scheduler', path: '/attendance/scheduler', icon: 'scheduler' },
      ],
    },
  ],
};

export default RAGNAROK_ORIGIN;
