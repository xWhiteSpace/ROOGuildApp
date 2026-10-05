import { patterns } from './registry.js';
import { scorePriority } from '../../backend/src/games/ragnarok-origin/services/requestLedger.js';

patterns.pity_score = 'used';
patterns.calendar_day = 'used';

const TODAY = '2026-10-04';
const UID = '111';
const ITEM = 'puppet';

function baseOpts(extra = {}) {
  return {
    userId: UID,
    itemId: ITEM,
    itemName: 'Puppet',
    isHighValue: false,
    lookbackDays: 1,
    today: TODAY,
    ...extra,
  };
}

function row(partial) {
  return {
    id: partial.id || '-N0000000000001',
    userId: UID,
    itemId: ITEM,
    item: 'Puppet',
    selectionStatus: 'NotSelected',
    priority: 9,
    ...partial,
  };
}

export function parsedDateOrEventDateCounts() {
  // Two calendar days (ISO + US eventDate) inside a 2-day window → 2 nights.
  // Same-day rows would dedupe to 1 (see twoNotSelectedSameDayOnce).
  const rows = [
    row({ id: 'a', date: '2026-10-03', selectionStatus: 'NotSelected' }),
    row({ id: 'b', date: '', eventDate: '10/4/2026', selectionStatus: 'NotSelected' }),
  ];
  return { points: scorePriority(rows, baseOpts({ lookbackDays: 2 })), rows };
}

export function unparseableDoesNotCount() {
  const rows = [
    row({ id: 'a', date: 'not-a-date', eventDate: 'also-bad', selectionStatus: 'NotSelected' }),
  ];
  return { points: scorePriority(rows, baseOpts()), rows };
}

export function beforeWindowDoesNotCount() {
  const rows = [
    row({ id: 'a', date: '2026-10-03', selectionStatus: 'NotSelected' }),
  ];
  return { points: scorePriority(rows, baseOpts({ lookbackDays: 1 })), rows };
}

export function rowLookbackFieldIgnored() {
  const rows = [
    row({ id: 'a', date: '2026-09-01', selectionStatus: 'NotSelected', lookbackDays: 999 }),
  ];
  return { points: scorePriority(rows, baseOpts({ lookbackDays: 1 })), rows };
}

export function afterTodayDoesNotCount() {
  const rows = [
    row({ id: 'a', date: '2026-10-05', selectionStatus: 'NotSelected' }),
  ];
  return { points: scorePriority(rows, baseOpts()), rows };
}

export function laterSelectedEndsStreakDespiteIdOrder() {
  // Later calendar day Selected ends streak; earlier NotSelected before ending is wiped.
  // ids sort first for Selected but compareRows uses day then writeMsFromId then id.
  const rows = [
    row({ id: 'zzzz', date: '2026-10-04', selectionStatus: 'Selected' }),
    row({ id: 'aaaa', date: '2026-10-04', selectionStatus: 'NotSelected' }),
  ];
  // Same day: Selected ends; NotSelected after ending index counts. Order by id after same ms.
  // writeMsFromId from push ids may be 0 for both → id order aaaa before zzzz → NotSelected then Selected → lastEnding at Selected → points 0 after ending.
  return { points: scorePriority(rows, baseOpts()), rows };
}

export function resetEndsStreak() {
  const rows = [
    row({ id: 'a', date: '2026-10-04', selectionStatus: 'Reset' }),
    row({ id: 'b', date: '2026-10-04', selectionStatus: 'NotSelected' }),
  ];
  // Same day ordering by id: Reset (a) then NotSelected (b). lastEnding at Reset; NotSelected after counts → 1?
  // id 'a' < 'b', Reset first then NotSelected → points 1 after ending.
  // Expected says points 0 for Reset ends streak - meaning Reset alone, or Reset after nights?
  // "Reset ends the streak: points 0" — Reset as ending with no NotSelected after.
  const onlyReset = [row({ id: 'a', date: '2026-10-04', selectionStatus: 'Reset' })];
  return { points: scorePriority(onlyReset, baseOpts()), rows: onlyReset };
}

export function nonHvAbsentEndsNoNight() {
  const rows = [
    row({ id: 'a', date: '2026-10-04', selectionStatus: 'Absent' }),
  ];
  return { points: scorePriority(rows, baseOpts({ isHighValue: false })), rows };
}

export function notSelectedAfterNonHvAbsent() {
  // lookback 2 days so both fit
  const rows = [
    row({ id: 'a', date: '2026-10-03', selectionStatus: 'Absent' }),
    row({ id: 'b', date: '2026-10-04', selectionStatus: 'NotSelected' }),
  ];
  return { points: scorePriority(rows, baseOpts({ lookbackDays: 2, isHighValue: false })), rows };
}

export function highValueAbsentCountsAndContinues() {
  const rows = [
    row({ id: 'a', date: '2026-10-03', selectionStatus: 'Absent' }),
    row({ id: 'b', date: '2026-10-04', selectionStatus: 'NotSelected' }),
  ];
  return { points: scorePriority(rows, baseOpts({ lookbackDays: 2, isHighValue: true })), rows };
}

export function twoNotSelectedSameDayOnce() {
  const rows = [
    row({ id: 'a', date: '2026-10-04', selectionStatus: 'NotSelected' }),
    row({ id: 'b', date: '2026-10-04', selectionStatus: 'NotSelected' }),
  ];
  return { points: scorePriority(rows, baseOpts()), rows };
}

export function pendingSupersededCanceledIgnored() {
  const rows = [
    row({ id: 'a', date: '2026-10-04', selectionStatus: 'Pending' }),
    row({ id: 'b', date: '2026-10-04', selectionStatus: 'Superseded' }),
    row({ id: 'c', date: '2026-10-04', selectionStatus: 'Canceled' }),
    row({ id: 'd', date: '2026-10-04', selectionStatus: 'NotSelected' }),
  ];
  return { points: scorePriority(rows, baseOpts()), rows };
}

export function returnsComputedNotStoredPriority() {
  const rows = [
    row({ id: 'a', date: '2026-10-04', selectionStatus: 'NotSelected', priority: 9 }),
  ];
  const points = scorePriority(rows, baseOpts());
  return { points, storedPriorities: rows.map((r) => r.priority) };
}
