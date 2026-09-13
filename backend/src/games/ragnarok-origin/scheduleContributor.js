import { RAGNAROK_ORIGIN_ID } from '../catalog.js';
import { getWeekMonday, enumerateWeekDates, guildWallTimeToUtcMs, DEFAULT_TZ } from '../../utils/guildTime.js';
import { getWeekInstances } from './services/scheduleService.js';

function addDays(dateStr, days) {
  const base = new Date(`${dateStr}T12:00:00Z`);
  base.setUTCDate(base.getUTCDate() + days);
  const y = base.getUTCFullYear();
  const m = String(base.getUTCMonth() + 1).padStart(2, '0');
  const d = String(base.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function instanceToEvent(id, inst, timezone) {
  if (!inst || inst.isCancelled) return null;
  const date = String(inst.date || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const startMs = guildWallTimeToUtcMs(inst.timeStart || '20:55', timezone, date);
  const endMs = guildWallTimeToUtcMs(inst.timeEnd || '22:15', timezone, date);
  return {
    id: `${RAGNAROK_ORIGIN_ID}:${id}`,
    title: inst.title || 'Raid',
    start: new Date(Number.isNaN(startMs) ? Date.parse(`${date}T00:00:00Z`) : startMs).toISOString(),
    end: new Date(Number.isNaN(endMs) ? Date.parse(`${date}T00:00:00Z`) : endMs).toISOString(),
    allDay: false,
    sourceGameId: RAGNAROK_ORIGIN_ID,
    sourceLabel: 'Ragnarok Origin',
    href: '/attendance/scheduler',
    readOnly: true,
  };
}

export async function contributeRagnarokOriginSchedule({ from, to, timezone = DEFAULT_TZ }) {
  const events = [];
  let cursor = getWeekMonday(timezone, from);
  const seen = new Set();
  while (cursor <= to && seen.size < 8) {
    if (seen.has(cursor)) break;
    seen.add(cursor);
    const weekDates = enumerateWeekDates(cursor).map((row) => row.dateStr);
    if (weekDates[weekDates.length - 1] < from || weekDates[0] > to) {
      cursor = addDays(cursor, 7);
      continue;
    }
    const { instances } = await getWeekInstances(cursor);
    for (const [id, inst] of Object.entries(instances || {})) {
      if (inst?.date && (inst.date < from || inst.date > to)) continue;
      const mapped = instanceToEvent(id, inst, timezone);
      if (mapped) events.push(mapped);
    }
    cursor = addDays(cursor, 7);
  }
  return events;
}
