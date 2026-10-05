import { patterns } from './registry.js';
import { isRaidEnabled } from '@guildname/shared/raidCycle';
import { buildWeekInstanceMap } from '../../backend/src/games/ragnarok-origin/services/scheduleService.js';

patterns.phase3_select = 'used';
patterns.raid_enabled = 'used';
patterns.fallbacks = 'used';

/** Same selector as Scheduler.jsx schedulePhase3 — mirrored for unit without React. */
export function schedulePhase3(ev) {
  if (isRaidEnabled(ev)) return ev.raid.phases[3];
  return ev?.phases?.[3];
}

export function raidEnabledSelectsRaidPhases() {
  const ev = {
    title: 'GvG',
    phases: { 3: { dayStart: 2, timeStart: '19:00', timeEnd: '20:00' } },
    raid: {
      configId: 'cfg1',
      phases: { 3: { dayStart: 2, dayEnd: 2, timeStart: '20:10', timeEnd: '22:40' } },
    },
  };
  return {
    enabled: isRaidEnabled(ev),
    selected: schedulePhase3(ev),
  };
}

export function raidDisabledSelectsEventPhases() {
  const ev = {
    title: 'Auction',
    phases: { 3: { dayStart: 3, timeStart: '19:30', timeEnd: '21:00' } },
    raid: { configId: '', phases: { 3: { dayStart: 2, timeStart: '20:10', timeEnd: '22:40' } } },
  };
  return {
    enabled: isRaidEnabled(ev),
    selected: schedulePhase3(ev),
  };
}

export function weeklyFallbacks2055() {
  // isRaidEnabled requires timeStart+timeEnd on raid.phases[3]; without them
  // buildWeekInstanceMap uses ev.phases[3] and applies 20:55-22:15 defaults.
  const weekMonday = '2026-10-05';
  const events = {
    evt1: {
      title: 'Raid',
      phases: { 3: { dayStart: 2, dayEnd: 2 } }, // Tue; missing times
    },
  };
  const map = buildWeekInstanceMap({ weekMonday, events, specialEvents: {}, existingInstances: {} });
  const row = Object.values(map).find((i) => i.eventId === 'evt1');
  return { row, timeStart: row?.timeStart, timeEnd: row?.timeEnd };
}

export function specialFallbacks2130() {
  const weekMonday = '2026-10-05';
  const specialEvents = {
    sp1: { title: 'Special Night', date: '2026-10-07' },
  };
  const map = buildWeekInstanceMap({ weekMonday, events: {}, specialEvents, existingInstances: {} });
  const row = map['2026-10-07_sp1'] || Object.values(map).find((i) => i.eventId === 'sp1');
  return {
    row,
    timeStart: row?.timeStart,
    timeEnd: row?.timeEnd,
    honesty: 'day-focus 21:30-23:00 is special-event fallback in buildWeekInstanceMap; React day-focus UI uses the same defaults',
  };
}

export function schedulerUsesSelectedPhase3() {
  const weekMonday = '2026-10-05';
  const events = {
    raidOn: {
      title: 'Raid',
      phases: { 3: { dayStart: 2, timeStart: '19:00', timeEnd: '20:00' } },
      raid: {
        configId: 'cfg1',
        phases: { 3: { dayStart: 2, dayEnd: 2, timeStart: '20:15', timeEnd: '22:45' } },
      },
    },
  };
  const map = buildWeekInstanceMap({ weekMonday, events, specialEvents: {}, existingInstances: {} });
  const row = Object.values(map).find((i) => i.eventId === 'raidOn');
  return {
    timeStart: row?.timeStart,
    timeEnd: row?.timeEnd,
    honesty: 'weekly blocks/RSVP instance times come from buildWeekInstanceMap; React shading/calendar render skipped',
  };
}
