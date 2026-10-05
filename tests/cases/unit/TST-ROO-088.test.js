import { describe, expect, it } from 'vitest';
import {
  afterTodayDoesNotCount,
  beforeWindowDoesNotCount,
  highValueAbsentCountsAndContinues,
  laterSelectedEndsStreakDespiteIdOrder,
  nonHvAbsentEndsNoNight,
  notSelectedAfterNonHvAbsent,
  parsedDateOrEventDateCounts,
  pendingSupersededCanceledIgnored,
  resetEndsStreak,
  returnsComputedNotStoredPriority,
  rowLookbackFieldIgnored,
  twoNotSelectedSameDayOnce,
  unparseableDoesNotCount,
} from '../../patterns/pity_score.js';

describe('TST-ROO-088 PityGuildCalendarDayScore returns night points and does not write stored priority', () => {
  it('Parsed date or else eventDate, in YYYY-MM-DD or M/D/YYYY, sets the calendar day', () => {
    expect(parsedDateOrEventDateCounts().points).toBe(2);
  });

  it('Unparseable date and eventDate do not count', () => {
    expect(unparseableDoesNotCount().points).toBe(0);
  });

  it('Days before the inclusive window do not count', () => {
    expect(beforeWindowDoesNotCount().points).toBe(0);
  });

  it('A row lookbackDays field does not replace the call argument', () => {
    expect(rowLookbackFieldIgnored().points).toBe(0);
  });

  it('Days after today do not count', () => {
    expect(afterTodayDoesNotCount().points).toBe(0);
  });

  it('A later-day Selected ends the streak even when its id sorts first', () => {
    expect(laterSelectedEndsStreakDespiteIdOrder().points).toBe(0);
  });

  it('Reset ends the streak', () => {
    expect(resetEndsStreak().points).toBe(0);
  });

  it('Non-high-value Absent ends the streak and does not count as a night', () => {
    expect(nonHvAbsentEndsNoNight().points).toBe(0);
  });

  it('NotSelected after a non-high-value Absent counts, and the Absent night does not', () => {
    expect(notSelectedAfterNonHvAbsent().points).toBe(1);
  });

  it('High-value Absent counts as one night and does not end the streak', () => {
    expect(highValueAbsentCountsAndContinues().points).toBe(2);
  });

  it('Two NotSelected rows on the same calendar day count once', () => {
    expect(twoNotSelectedSameDayOnce().points).toBe(1);
  });

  it('Pending, Superseded, and Canceled neither count nor end', () => {
    expect(pendingSupersededCanceledIgnored().points).toBe(1);
  });

  it('Returned points are computed; stored history.priority is not written', () => {
    const { points, storedPriorities } = returnsComputedNotStoredPriority();
    expect(points).toBe(1);
    expect(storedPriorities.every((p) => p === 9)).toBe(true);
  });
});
