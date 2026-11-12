/** Ragnarok Origin game settings stored on tenant_settings.configuration. */
import { DEFAULT_DISCORD_CARD_COPY } from '@guildname/shared/discordCardCopy';

export { CARD_COPY_MAX, DEFAULT_DISCORD_CARD_COPY, resolveDiscordCardCopy } from '@guildname/shared/discordCardCopy';

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
  gvgGeneralStatsCol1: ['HP', 'PATK', 'MATK', 'Refine PATK', 'Refine MATK', 'HP recover', 'HIT'].join('\n'),
  gvgGeneralStatsCol2: ['SP', 'PDEF', 'MDEF', 'Refine PDEF', 'Refine MDEF', 'SP Recovery', 'FLEE'].join('\n'),
  gvgQuasiStatsCol1: [
    'ASPD',
    'Variable CT',
    'Fixed CT',
    'Healing Done',
    'CRIT',
    'CRIT DMG',
    'PDMG',
    'MDMG',
    'Ignore PDEF',
    'Ignore MDEF',
    'PDMG Bonus',
    'PvE DMG Redu',
    'PvP DMG Redu',
  ].join('\n'),
  gvgQuasiStatsCol2: [
    'MSPD',
    'Variable CT',
    'Fixed CT',
    'Healing Taken',
    'CRIT RES',
    'CRIT DMG RES',
    'PDMG.R',
    'MDMG.R',
    'Ignore PDEF',
    'Ignore MDEF',
    'MDMG Bonus',
    'PvE DMG Bonus',
    'PvP DMG Bonus',
  ].join('\n'),
  discordCardCopy: DEFAULT_DISCORD_CARD_COPY,
};

export default RAGNAROK_ORIGIN_DEFAULTS;

/** Same 1–365 window as Game Settings `priorityLookbackDays`. */
export function clampLookbackDays(raw) {
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n)) return RAGNAROK_ORIGIN_DEFAULTS.priorityLookbackDays;
  return Math.min(365, Math.max(1, n));
}
