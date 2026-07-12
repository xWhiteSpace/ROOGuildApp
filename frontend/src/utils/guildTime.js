/**
 * Guild timezone date math — frontend mirror of backend/src/utils/guildTime.js
 */

const DAY_MAP = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
export const DEFAULT_TZ = 'Asia/Manila';

function pad(n) {
  return String(n).padStart(2, '0');
}

export function getGuildNowParts(timezone = DEFAULT_TZ, date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone || DEFAULT_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  });
  const partMap = Object.fromEntries(formatter.formatToParts(date).map((p) => [p.type, p.value]));
  return {
    year: partMap.year,
    month: partMap.month,
    day: partMap.day,
    weekday: partMap.weekday,
    dayOfWeek: DAY_MAP[partMap.weekday] ?? 0,
  };
}

export function formatGuildDate(date, timezone = DEFAULT_TZ) {
  const d = date instanceof Date ? date : new Date(date);
  const parts = getGuildNowParts(timezone, d);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/** Today's calendar date (YYYY-MM-DD) in the guild timezone. */
export function getGuildTodayDateStr(timezone = DEFAULT_TZ, date = new Date()) {
  return formatGuildDate(date, timezone);
}

/**
 * Convert a guild-local wall clock HH:MM on a given guild date to UTC unix ms.
 * Uses settings timezone (DB), not the browser's local timezone.
 */
export function guildWallTimeToUtcMs(hhmm, timezone = DEFAULT_TZ, dateStr = null) {
  const tz = timezone || DEFAULT_TZ;
  const day = dateStr || getGuildTodayDateStr(tz);
  const [hh, mm] = String(hhmm).split(':').map(Number);
  if (Number.isNaN(hh) || Number.isNaN(mm)) return NaN;

  // We want the UTC instant whose wall clock in `tz` equals the requested HH:MM.
  // `targetAsUtc` is that wall time interpreted as-if-UTC (fixed anchor).
  const [y, mo, d] = day.split('-').map(Number);
  const targetAsUtc = Date.UTC(y, mo - 1, d, hh, mm, 0);

  const wallAsUtc = (utc) => {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
      })
        .formatToParts(new Date(utc))
        .map((p) => [p.type, p.value])
    );
    return Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour) % 24,
      Number(parts.minute),
      Number(parts.second)
    );
  };

  // Fixed-point iteration anchored on targetAsUtc (converges in <=2 steps, DST-safe).
  let utc = targetAsUtc;
  for (let i = 0; i < 2; i++) {
    const offset = wallAsUtc(utc) - utc; // tz offset from UTC at this instant
    utc = targetAsUtc - offset;
  }

  return utc;
}

/** Format a utc ms timestamp as HH:MM in the guild timezone. */
export function formatGuildTimeHhMm(ms, timezone = DEFAULT_TZ) {
  if (!ms) return '';
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: timezone || DEFAULT_TZ,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(new Date(Number(ms)))
      .map((p) => [p.type, p.value])
  );
  return `${parts.hour}:${parts.minute}`;
}

export function getWeekMonday(timezone = DEFAULT_TZ, anchor) {
  let anchorDate;
  if (typeof anchor === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(anchor)) {
    anchorDate = new Date(`${anchor}T12:00:00Z`);
  } else if (anchor) {
    anchorDate = anchor instanceof Date ? anchor : new Date(anchor);
  } else {
    anchorDate = new Date();
  }

  const parts = getGuildNowParts(timezone, anchorDate);
  const distanceToMonday = parts.dayOfWeek === 0 ? -6 : 1 - parts.dayOfWeek;
  const base = new Date(`${parts.year}-${parts.month}-${parts.day}T12:00:00Z`);
  base.setUTCDate(base.getUTCDate() + distanceToMonday);
  return `${base.getUTCFullYear()}-${pad(base.getUTCMonth() + 1)}-${pad(base.getUTCDate())}`;
}

export function buildCompositeKey(dateStr, eventId) {
  return `${dateStr}_${eventId}`;
}

export function parseCompositeKey(compositeKey) {
  if (!compositeKey || typeof compositeKey !== 'string') return null;
  const idx = compositeKey.indexOf('_');
  if (idx <= 0) return null;
  return {
    dateStr: compositeKey.slice(0, idx),
    eventId: compositeKey.slice(idx + 1),
  };
}

export function enumerateWeekDates(weekMonday) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekMonday)) {
    throw new Error(`Invalid weekMonday: ${weekMonday}`);
  }
  const result = [];
  const base = new Date(`${weekMonday}T12:00:00Z`);
  for (let i = 0; i < 7; i++) {
    const d = new Date(base);
    d.setUTCDate(base.getUTCDate() + i);
    const dateStr = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
    result.push({ dateStr, dayOfWeek: d.getUTCDay() });
  }
  return result;
}

export function upcomingDatesForWeekday(targetDayOfWeek, timezone = DEFAULT_TZ, weeksAhead = 1) {
  const monday = getWeekMonday(timezone);
  const weekDates = enumerateWeekDates(monday);
  const dates = [];
  for (let w = 0; w <= weeksAhead; w++) {
    for (const { dateStr, dayOfWeek } of weekDates) {
      if (dayOfWeek !== targetDayOfWeek) continue;
      if (w === 0) {
        dates.push(dateStr);
      } else {
        const base = new Date(`${dateStr}T12:00:00Z`);
        base.setUTCDate(base.getUTCDate() + w * 7);
        dates.push(`${base.getUTCFullYear()}-${pad(base.getUTCMonth() + 1)}-${pad(base.getUTCDate())}`);
      }
    }
  }
  return dates;
}
