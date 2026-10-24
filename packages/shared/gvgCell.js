import { isCalendarCommitted, normalizeCommitmentStatus } from './attendanceStatus.js';

export const MAX_RAID_SCORE = 4;

export function buildSheetCell({ commitment, presentTicks, totalPulses, swords } = {}) {
  const ticks = Math.max(0, Number(presentTicks) || 0);
  const pulses = Math.max(0, Number(totalPulses) || 0);
  const duration = pulses > 0 ? ticks / pulses : 0;
  const cell = {
    calendar: normalizeCommitmentStatus(commitment),
    swords: swords === true,
    discord: ticks > 0,
    presentTicks: ticks,
    totalPulses: pulses,
    duration: Number(duration.toFixed(4)),
  };
  cell.score = scoreFromCell(cell);
  return cell;
}

export function scoreFromCell(cell) {
  if (!cell) return 0;
  const cal = isCalendarCommitted(cell.calendar) ? 1 : 0;
  const disc = cell.discord ? 1 : 0;
  const dur = Math.max(0, Number(cell.duration) || 0);
  const sword = cell.swords === true ? 1 : 0;
  const total = Number((cal + disc + dur + sword).toFixed(2));
  return total > MAX_RAID_SCORE ? MAX_RAID_SCORE : total;
}

export function cellWithSwords(cell, swords) {
  if (!cell || typeof cell !== 'object') return null;
  const next = { ...cell, swords: swords === true };
  next.score = scoreFromCell(next);
  return next;
}
