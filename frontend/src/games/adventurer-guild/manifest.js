export const ADVENTURER_GUILD_ID = 'adventurer-guild';

export const ADVENTURER_GUILD = {
  id: ADVENTURER_GUILD_ID,
  label: 'Adventurer Guild',
  shortLabel: 'Guild',
  description: 'Guild hall: highlights and guild-wide events',
  homePath: '/games/adventurer-guild',
  pathPrefix: '/games/adventurer-guild',
  setupPath: '',
  settingsPath: '',
  modules: [
    {
      id: 'hall',
      label: 'Hall',
      items: [
        { label: 'Highlights', path: '/games/adventurer-guild', icon: 'gallery', end: true },
        { label: 'Events', path: '/games/adventurer-guild/events', icon: 'calendar' },
      ],
    },
  ],
};

export default ADVENTURER_GUILD;
