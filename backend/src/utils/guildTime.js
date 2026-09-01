/**
 * Guild timezone date math — SSOT for YYYY-MM-DD keys and week bounds.
 * Uses Intl.formatToParts only (never toISOString / toLocaleString→Date).
 */

const DAY_MAP = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const DEFAULT_TZ = 'Asia/Manila';

function pad(n) {
  return String(n).padStart(2, '0');
}

/**
 * @param {string} [timezone]
 * @param {Date} [date]
 * @returns {{ year: string, month: string, day: string, weekday: string, dayOfWeek: number }}
 */
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

/**
 * @param {Date|string|number} date
 * @param {string} [timezone]
 * @returns {string} YYYY-MM-DD
 */
export function formatGuildDate(date, timezone = DEFAULT_TZ) {
  const d = date instanceof Date ? date : new Date(date);
  const parts = getGuildNowParts(timezone, d);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/**
 * Monday of the guild-TZ week containing `anchor` (or now).
 * @param {string} [timezone]
 * @param {Date|string} [anchor]
 * @returns {string} YYYY-MM-DD (Monday)
 */
export function getWeekMonday(timezone = DEFAULT_TZ, anchor) {
  let anchorDate;
  if (typeof anchor === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(anchor)) {
    // Treat date-only strings as noon UTC to avoid DST edge flips when formatting back
    anchorDate = new Date(`${anchor}T12:00:00Z`);
  } else if (anchor) {
    anchorDate = anchor instanceof Date ? anchor : new Date(anchor);
  } else {
    anchorDate = new Date();
  }

  const parts = getGuildNowParts(timezone, anchorDate);
  const distanceToMonday = parts.dayOfWeek === 0 ? -6 : 1 - parts.dayOfWeek;
  // Walk calendar days via UTC noon anchors derived from guild date
  const base = new Date(`${parts.year}-${parts.month}-${parts.day}T12:00:00Z`);
  base.setUTCDate(base.getUTCDate() + distanceToMonday);
  return `${base.getUTCFullYear()}-${pad(base.getUTCMonth() + 1)}-${pad(base.getUTCDate())}`;
}

/**
 * @param {string} dateStr YYYY-MM-DD
 * @param {string} eventId
 * @returns {string}
 */
export function buildCompositeKey(dateStr, eventId) {
  return `${dateStr}_${eventId}`;
}

/**
 * Parse composite key into dateStr + eventId (eventId may contain underscores).
 * @param {string} compositeKey
 * @returns {{ dateStr: string, eventId: string } | null}
 */
export function parseCompositeKey(compositeKey) {
  if (!compositeKey || typeof compositeKey !== 'string') return null;
  const idx = compositeKey.indexOf('_');
  if (idx <= 0) return null;
  return {
    dateStr: compositeKey.slice(0, idx),
    eventId: compositeKey.slice(idx + 1),
  };
}

/**
 * @param {string} weekMonday YYYY-MM-DD
 * @returns {Array<{ dateStr: string, dayOfWeek: number }>}
 */
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

/**
 * Next N occurrences of a target weekday in guild TZ (including today if match).
 * @param {number} targetDayOfWeek 0=Sun..6=Sat
 * @param {string} [timezone]
 * @param {number} [weeksAhead] how many weeks to include (0 = this week only occurrence)
 * @returns {string[]} YYYY-MM-DD list
 */
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

/**
 * Guild-timezone week-minute (0–10079) and calendar date for an instant.
 * week-minute = dayOfWeek*1440 + hour*60 + minute, matching the phase-window
 * math in settings (dayStart*1440 + timeStart). Used by time-driven schedulers
 * (event announcements, auto-commit) so all "is it this minute yet?" checks
 * share one definition.
 * @param {string} [timezone]
 * @param {Date} [instant]
 * @returns {{ absMinute: number, dateStr: string }}
 */
export function getGuildWeekMinute(timezone = DEFAULT_TZ, instant = new Date()) {
  const { dayOfWeek } = getGuildNowParts(timezone, instant);

  const hmParts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone || DEFAULT_TZ,
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(instant);
  const t = Object.fromEntries(hmParts.map((p) => [p.type, p.value]));

  const hour = parseInt(t.hour, 10) % 24;
  const minute = parseInt(t.minute, 10);

  const absMinute = dayOfWeek * 1440 + hour * 60 + minute;
  const dateStr = formatGuildDate(instant, timezone);
  return { absMinute, dateStr };
}

export { DEFAULT_TZ };
