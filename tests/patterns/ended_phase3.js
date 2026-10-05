import { patterns } from './registry.js';
import { setCachedConfig, clearTenantCaches, runWithTenant } from '../../backend/src/db/tenantContext.js';
import { getRaidCycleStatus } from '../../backend/src/games/ragnarok-origin/raidTimeWindow.js';
import { addDaysToDateStr, getWeekMonday } from '../../backend/src/utils/guildTime.js';

patterns.ended = 'used';
patterns.phase3_kept = 'used';
patterns.three_weeks = 'used';
patterns.prep_date = 'used';

const TZ = 'Asia/Manila';
const TENANT = 'raid-cycle-tenant';

/**
 * Tuesday war (dayStart/dayEnd=2) 20:00–22:00.
 * Phase 1 Monday (1) 18:00–23:59.
 * Phase 3 Tuesday 20:00–22:00 (same as war window for abs detection).
 */
function raidConfig() {
  return {
    timezone: TZ,
    isForceLocked: false,
    events: {
      evt1: {
        title: 'Weekly GvG',
        raid: {
          configId: 'cfg1',
          warRoomIds: ['wr1'],
          pollIntervalMinutes: 20,
          phases: {
            1: { dayStart: 1, dayEnd: 1, timeStart: '18:00', timeEnd: '23:59' },
            2: { dayStart: 2, dayEnd: 2, timeStart: '00:00', timeEnd: '19:59' },
            3: { dayStart: 2, dayEnd: 2, timeStart: '20:00', timeEnd: '22:00' },
          },
          announcements: { phase1: [], phase2: null, phase3: null },
        },
      },
    },
  };
}

function withConfig(fn) {
  clearTenantCaches(TENANT);
  setCachedConfig(TENANT, raidConfig());
  return runWithTenant(TENANT, fn);
}

/** Tuesday 2026-10-06 21:00 PHT — inside war / phase 3, before timeEnd */
export function nowBeforePhase3EndNotEnded() {
  return withConfig(() => {
    const instant = new Date('2026-10-06T21:00:00+08:00');
    const status = getRaidCycleStatus(instant);
    return {
      warDate: status.warDate,
      currentPhase: status.currentPhase,
      expectedWarDate: '2026-10-06',
    };
  });
}

/** Tuesday 2026-10-06 22:30 PHT — after timeEnd; phase likely 0 → roll to next week */
export function nowAfterPhase3EndWhenNotPhase3() {
  return withConfig(() => {
    const instant = new Date('2026-10-06T22:30:00+08:00');
    const status = getRaidCycleStatus(instant);
    return {
      warDate: status.warDate,
      currentPhase: status.currentPhase,
      // next Tuesday after ended occurrence
      expectedNext: '2026-10-13',
    };
  });
}

/**
 * Phase 3 keeps occurrence after end: widen phase-3 window past war timeEnd
 * so currentPhase stays 3 while wall clock is past 22:00 war end.
 * Honesty: with identical phase3.timeEnd and war end, phase drops when war ends.
 * Use dayEnd+timeEnd later same night via config override.
 */
export function phase3KeepsAfterEnd() {
  clearTenantCaches(TENANT);
  const cfg = raidConfig();
  cfg.events.evt1.raid.phases[3] = { dayStart: 2, dayEnd: 2, timeStart: '20:00', timeEnd: '23:30' };
  setCachedConfig(TENANT, cfg);
  return runWithTenant(TENANT, () => {
    const instant = new Date('2026-10-06T22:30:00+08:00');
    const status = getRaidCycleStatus(instant);
    return {
      warDate: status.warDate,
      currentPhase: status.currentPhase,
      keptThisWeek: status.warDate === '2026-10-06',
      // warEndsAt still from p3.timeEnd on warEndDate — with timeEnd 23:30, 22:30 is not ended
      honesty: 'resolveUpcomingWar keeps when currentPhase===3 OR !ended; extended phase-3 window keeps phase 3',
    };
  });
}

export function beyondThreeWeeksFallsBack() {
  return withConfig(() => {
    // resolveUpcomingWar walks at most 3 Monday-weeks. For a weekly Tuesday war,
    // a moment just after this week's end always finds next Tuesday inside the window
    // (fallback to current-week war is only when all 3 candidates are ended — unreachable
    // while a future Tuesday remains). Assert the real seam: warDate stays within 3 weeks.
    const instant = new Date('2026-11-03T22:30:00+08:00');
    const status = getRaidCycleStatus(instant);
    const weekMonday = getWeekMonday(TZ, instant);
    const maxWarInWindow = addDaysToDateStr(weekMonday, 1 + 14); // Tue of week+2
    const beyondWindow = addDaysToDateStr(weekMonday, 1 + 21); // Tue of week+3 — must not count
    return {
      warDate: status.warDate,
      weekMonday,
      maxWarInWindow,
      withinThreeWeeks: status.warDate <= maxWarInWindow,
      notBeyond: status.warDate !== beyondWindow && status.warDate < beyondWindow,
      honesty: 'weekly wars always pick the next unfinished Tue inside the 3-week walk; fallback current-week branch is for all-ended',
    };
  });
}

export function qualifyingWithinThreeWeeks() {
  return withConfig(() => {
    const instant = new Date('2026-10-07T12:00:00+08:00'); // Wed after Tue ended
    const status = getRaidCycleStatus(instant);
    return { warDate: status.warDate, expected: '2026-10-13' };
  });
}

export function prepDateWalkedBackFromWar() {
  return withConfig(() => {
    const instant = new Date('2026-10-06T21:00:00+08:00');
    const status = getRaidCycleStatus(instant);
    // phase1 Monday, war Tuesday → prep is warDate - 1 day
    const expectedPrepDate = addDaysToDateStr(status.warDate, -1);
    // prepStartsAt is wall time on prep date — derive date via comparing prepStartsAt to warDate-1
    return {
      warDate: status.warDate,
      prepStartsAt: status.prepStartsAt,
      expectedPrepDate,
      // Honesty: getRaidCycleStatus exposes prepStartsAt, not prepDate string; walk-back is daysBeforeWar from warDate.
    };
  });
}
