/**
 * Independent raid/War Room clock.
 * Auction gating stays in timeWindow.js (ev.phases). This only reads ev.raid.
 */
import { WORKSPACE_DEFAULTS } from '../../config/workspaceDefaults.js';
import { RAGNAROK_3_DEFAULTS } from './defaults.js';
import { getCachedConfig } from '../../db/tenantContext.js';
import {
  DEFAULT_TZ,
  addDaysToDateStr,
  enumerateWeekDates,
  formatGuildDate,
  getGuildNowParts,
  getGuildWeekMinute,
  getWeekMonday,
  guildWallTimeToUtcMs,
} from '../../utils/guildTime.js';
import {
  RAID_PHASE_LABELS,
  clampRaidPollMinutes,
  computeRaidAnnouncementMinutes,
  getAbsoluteMinutes,
  getModularDistance,
  isPhaseWindowActive,
  isRaidEnabled,
  publishedIdForRaid,
} from '@guildname/shared/raidCycle';

const DAYS_OF_WEEK_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAYS_SHORT_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function activeConfig() {
  return getCachedConfig() || { ...WORKSPACE_DEFAULTS, ...RAGNAROK_3_DEFAULTS };
}

function dateForWeekdayInWeek(weekMonday, dayOfWeek) {
  const dates = enumerateWeekDates(weekMonday);
  const match = dates.find((d) => d.dayOfWeek === Number(dayOfWeek));
  return match?.dateStr || null;
}

/** Days to walk backward from the war weekday to this phase weekday, wrapping the week. */
function daysBeforeWar(warDayStart, phaseDay) {
  return (Number(warDayStart) - Number(phaseDay) + 7) % 7;
}

/**
 * War date is the next occurrence whose end is still ahead.
 * Sunday sits at the start of the minute circle and at the end of the Monday week,
 * so a Tuesday war already on the calendar must roll to next week once it has ended.
 * Phase 3 keeps the war that is in progress.
 */
function resolveUpcomingWar(timezone, instant, p3, currentPhase) {
  let weekMonday = getWeekMonday(timezone, instant);
  for (let i = 0; i < 3; i += 1) {
    const warDate = dateForWeekdayInWeek(weekMonday, p3.dayStart);
    const warEndDate = warDate
      ? addDaysToDateStr(warDate, dayDelta(p3.dayStart, p3.dayEnd))
      : null;
    const warEndsAt = warEndDate
      ? guildWallTimeToUtcMs(p3.timeEnd, timezone, warEndDate)
      : NaN;
    const ended = Number.isFinite(warEndsAt) && instant.getTime() > warEndsAt;
    if (warDate && (currentPhase === 3 || !ended)) {
      return { warDate, warEndDate, warEndsAt };
    }
    weekMonday = addDaysToDateStr(weekMonday, 7);
  }
  const fallbackMonday = getWeekMonday(timezone, instant);
  const warDate = dateForWeekdayInWeek(fallbackMonday, p3.dayStart);
  const warEndDate = warDate
    ? addDaysToDateStr(warDate, dayDelta(p3.dayStart, p3.dayEnd))
    : null;
  return {
    warDate,
    warEndDate,
    warEndsAt: warEndDate ? guildWallTimeToUtcMs(p3.timeEnd, timezone, warEndDate) : NaN,
  };
}

function dayDelta(dayStart, dayEnd) {
  const start = Number(dayStart) || 0;
  const end = Number(dayEnd) || 0;
  if (end >= start) return end - start;
  return (end + 7) - start;
}

function gmtIndicatorFor(timezone) {
  try {
    const formatterShort = new Intl.DateTimeFormat('en-US', { timeZone: timezone, timeZoneName: 'short' });
    const tzParts = formatterShort.formatToParts(new Date());
    const foundPart = tzParts.find((p) => p.type === 'timeZoneName');
    return foundPart?.value || 'UTC';
  } catch {
    return 'UTC';
  }
}

function formatPhaseInterval(phase, gmtIndicator) {
  if (!phase) return 'Unconfigured';
  const startDay = DAYS_SHORT_NAMES[Number(phase.dayStart)] || '—';
  const endDay = DAYS_SHORT_NAMES[Number(phase.dayEnd)] || '—';
  return `${startDay} ${phase.timeStart} ~ ${endDay} ${phase.timeEnd} ${gmtIndicator}`;
}

export function getRaidCycleStatus(instant = new Date()) {
  const cachedConfig = activeConfig();
  const timezone = cachedConfig.timezone || DEFAULT_TZ;
  const events = cachedConfig.events || {};
  const { absMinute: currentAbs, dateStr: todayStr } = getGuildWeekMinute(timezone, instant);
  const { dayOfWeek } = getGuildNowParts(timezone, instant);

  const empty = {
    needsSetup: true,
    isForceLocked: false,
    currentPhase: 0,
    activeEventId: '',
    activeEventTitle: '',
    eventId: '',
    eventName: '',
    nextStatusChangeMessage: 'Set up a Raid config on an event in Settings → Events.',
    currentSessionLabel: 'No raid event',
    phaseIntervals: { phase1: 'Unconfigured', phase2: 'Unconfigured', phase3: 'Unconfigured' },
    timezone,
    warDate: '',
    publishedId: '',
    configId: '',
    configTitle: '',
    warRoomIds: [],
    pollIntervalMinutes: 20,
    announcementMinutes: { phase1: [], phase2: null, phase3: null },
    announcements: { phase1: [], phase2: null, phase3: null },
    phaseStartTime: '',
    phaseEndTime: '',
    warStartTime: '',
    warEndTime: '',
    warStartsAt: null,
    warEndsAt: null,
    prepStartsAt: null,
    canEditGrid: false,
    helpEmbedUrl: cachedConfig.helpEmbedUrl || '',
    raidHelpEmbedUrl: cachedConfig.raidHelpEmbedUrl || '',
  };

  if (cachedConfig.isForceLocked) {
    return {
      ...empty,
      needsSetup: false,
      isForceLocked: true,
      currentPhase: 0,
      currentSessionLabel: 'Forced Operational Lockdown',
      nextStatusChangeMessage: 'War Room automation is locked by Management Officers.',
      canEditGrid: false,
    };
  }

  const raidEventIds = Object.keys(events).filter((id) => isRaidEnabled(events[id]));
  if (raidEventIds.length === 0) {
    return empty;
  }

  let minWarEndDistance = Infinity;
  let targetEventId = '';

  raidEventIds.forEach((evId) => {
    const p3 = events[evId].raid.phases[3];
    const warEndAbs = getAbsoluteMinutes(p3.dayEnd, p3.timeEnd);
    const distance = getModularDistance(currentAbs, warEndAbs);
    if (distance < minWarEndDistance) {
      minWarEndDistance = distance;
      targetEventId = evId;
    }
  });

  if (!targetEventId) {
    return empty;
  }

  const selected = events[targetEventId];
  const raid = selected.raid;
  const activeEventTitle = selected.title || targetEventId;
  let currentPhase = 0;
  let activePhaseConfig = null;

  for (const phaseKey of [1, 2, 3]) {
    const p = raid.phases?.[phaseKey];
    if (!p) continue;
    const startAbs = getAbsoluteMinutes(p.dayStart, p.timeStart);
    const endAbs = getAbsoluteMinutes(p.dayEnd, p.timeEnd);
    if (isPhaseWindowActive(currentAbs, startAbs, endAbs)) {
      currentPhase = Number(phaseKey);
      activePhaseConfig = p;
      break;
    }
  }

  const p3 = raid.phases[3];
  const upcoming = resolveUpcomingWar(timezone, instant, p3, currentPhase);
  const warDate = upcoming.warDate || todayStr;
  const warEndDate = upcoming.warEndDate || addDaysToDateStr(warDate, dayDelta(p3.dayStart, p3.dayEnd));
  const warStartsAt = guildWallTimeToUtcMs(p3.timeStart, timezone, warDate);
  const warEndsAt = Number.isFinite(upcoming.warEndsAt)
    ? upcoming.warEndsAt
    : guildWallTimeToUtcMs(p3.timeEnd, timezone, warEndDate);
  const publishedId = publishedIdForRaid(warDate, targetEventId);

  const p1 = raid.phases?.[1];
  const prepDate = p1
    ? addDaysToDateStr(warDate, -daysBeforeWar(p3.dayStart, p1.dayStart))
    : null;
  const prepStartsAt = p1 && prepDate
    ? guildWallTimeToUtcMs(p1.timeStart, timezone, prepDate)
    : null;

  const gmtIndicator = gmtIndicatorFor(timezone);
  const phaseIntervals = {
    phase1: formatPhaseInterval(raid.phases?.[1], gmtIndicator),
    phase2: formatPhaseInterval(raid.phases?.[2], gmtIndicator),
    phase3: formatPhaseInterval(raid.phases?.[3], gmtIndicator),
  };

  let nextStatusChangeMessage = '';
  if (currentPhase === 0) {
    const p1 = raid.phases?.[1];
    const startDayName = p1 ? DAYS_OF_WEEK_NAMES[p1.dayStart] : 'Target Day';
    const openTime = p1 ? p1.timeStart : '00:00';
    nextStatusChangeMessage = `Preparing next raid. GvG Preparation for ${activeEventTitle} starts on ${startDayName} at ${openTime} (${timezone}).`;
  } else if (activePhaseConfig) {
    const endDayName = DAYS_OF_WEEK_NAMES[activePhaseConfig.dayEnd] || 'Target Day';
    const label = RAID_PHASE_LABELS[currentPhase] || `Phase ${currentPhase}`;
    nextStatusChangeMessage = `${label} for ${activeEventTitle} until ${endDayName} ${activePhaseConfig.timeEnd} (${timezone}).`;
  }

  const phaseLabels = {
    0: `${activeEventTitle} No Active Raid`,
    1: `${activeEventTitle} GvG Preparation`,
    2: `${activeEventTitle} Party Adjustments`,
    3: `${activeEventTitle} War`,
  };

  return {
    needsSetup: false,
    isForceLocked: false,
    currentPhase,
    activeEventId: targetEventId,
    activeEventTitle,
    eventId: targetEventId,
    eventName: activeEventTitle,
    nextStatusChangeMessage,
    phaseLabels,
    phaseIntervals,
    timezone,
    warDate,
    publishedId,
    configId: raid.configId,
    configTitle: '',
    warRoomIds: Array.isArray(raid.warRoomIds) ? raid.warRoomIds : [],
    pollIntervalMinutes: clampRaidPollMinutes(raid.pollIntervalMinutes),
    announcementMinutes: computeRaidAnnouncementMinutes(raid),
    announcements: raid.announcements || { phase1: [], phase2: null, phase3: null },
    phaseStartTime: activePhaseConfig?.timeStart || '',
    phaseEndTime: activePhaseConfig?.timeEnd || '',
    warStartTime: p3.timeStart || '',
    warEndTime: p3.timeEnd || '',
    warStartsAt: Number.isFinite(warStartsAt) ? warStartsAt : null,
    warEndsAt: Number.isFinite(warEndsAt) ? warEndsAt : null,
    prepStartsAt: Number.isFinite(prepStartsAt) ? prepStartsAt : null,
    canEditGrid: currentPhase >= 1 && currentPhase <= 3,
    currentAbs,
    dayOfWeek,
    todayStr,
    helpEmbedUrl: cachedConfig.helpEmbedUrl || '',
    raidHelpEmbedUrl: cachedConfig.raidHelpEmbedUrl || '',
  };
}
