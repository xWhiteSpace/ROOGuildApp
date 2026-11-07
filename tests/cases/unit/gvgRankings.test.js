import { describe, expect, it } from 'vitest';
import { sortRankingRows } from '@guildname/shared/gvgRank';
import { rankGvgAttendance, sumGvgRankingTotals } from '../../../backend/src/games/ragnarok-origin/services/gvgSheet.js';
import { rosterMembershipPatch, warInWindow, windowsFrom } from '../../../backend/src/games/ragnarok-origin/services/memberHistory.js';

describe('gvg attendance point rankings', () => {
  it('sums every war, drops ghosts, keeps dummies, and ranks highest first', () => {
    const summed = sumGvgRankingTotals({
      a: {
        id: 'a',
        eventDate: '2026-10-01',
        sheet: { cells: { ada: { score: 4 }, ben: { score: 1 }, ghost: { score: 4 }, dummy: { score: 2 } } },
      },
      b: {
        id: 'b',
        eventDate: '2026-10-04',
        sheet: { cells: { ada: { score: 1.5 }, ben: { score: 3 }, zero: { score: 0 } } },
      },
      c: { id: 'c', eventDate: '2026-10-06' },
    });

    expect(summed.wars).toBe(3);
    expect(summed.totals.ada).toBe(5.5);
    expect(summed.totals.ben).toBe(4);
    expect(summed.totals.dummy).toBe(2);
    expect(summed.totals.zero).toBe(0);

    const rows = rankGvgAttendance({
      ada: { isRaidRoster: true, status: 'Active', displayName: 'Ada' },
      ben: { isRaidRoster: true, status: '', displayName: 'Ben' },
      ghost: { isRaidRoster: true, status: 'Ghost', displayName: 'Ghost' },
      dummy: { isRaidRoster: true, status: 'Active', displayName: 'Kyogami', isDummy: true },
      zero: { isRaidRoster: true, status: 'Active', displayName: 'Zero' },
      pool: { isRaidRoster: false, status: 'Active', displayName: 'Pool' },
    }, summed);

    expect(rows.map((row) => row.displayName)).toEqual(['Ada', 'Ben', 'Kyogami', 'Zero']);
    expect(rows.find((row) => row.displayName === 'Kyogami').isDummy).toBe(true);
    expect(rows.find((row) => row.displayName === 'Zero').total).toBe(0);
    expect(rows.map((row) => row.rank)).toEqual([1, 2, 3, 4]);
    expect(rows.some((row) => row.displayName === 'Ghost' || row.displayName === 'Pool')).toBe(false);
  });

  it('breaks equal totals by name and keeps separate ranks', () => {
    const summed = sumGvgRankingTotals({
      a: { id: 'a', sheet: { cells: { k: { score: 2 }, s: { score: 2 } } } },
    });
    const rows = rankGvgAttendance({
      s: { isRaidRoster: true, displayName: 'SaintZero' },
      k: { isRaidRoster: true, displayName: 'Kyrio' },
    }, summed);
    expect(rows.map((row) => [row.rank, row.displayName, row.total])).toEqual([
      [1, 'Kyrio', 2],
      [2, 'SaintZero', 2],
    ]);
  });

  it('counts only the wars on or after the join date', () => {
    const summed = sumGvgRankingTotals({
      a: { id: 'a', eventDate: '2026-10-01', sheet: { cells: { neu: { score: 1 }, vet: { score: 4 } } } },
      b: { id: 'b', eventDate: '2026-10-20', sheet: { cells: { neu: { score: 2 }, vet: { score: 3 } } } },
      c: { id: 'c', eventDate: '2026-11-03', sheet: { cells: { neu: { score: 1 }, vet: { score: 1 } } } },
    });
    const members = {
      neu: { isRaidRoster: true, displayName: 'New', joinedAt: '2026-10-18' },
      vet: { isRaidRoster: true, displayName: 'Vet', joinedAt: '2026-07-01' },
      blank: { isRaidRoster: true, displayName: 'Blank' },
    };
    const rows = rankGvgAttendance(members, summed, windowsFrom(members, []));
    expect(rows.find((row) => row.displayName === 'New').sinceJoined).toBe(2);
    expect(rows.find((row) => row.displayName === 'New').rate).toBe(37.5);
    expect(rows.find((row) => row.displayName === 'Vet').sinceJoined).toBe(3);
    expect(rows.find((row) => row.displayName === 'Vet').rate).toBe(66.67);
    expect(rows.find((row) => row.displayName === 'Blank').sinceJoined).toBeNull();
    expect(rows.find((row) => row.displayName === 'Blank').rate).toBeNull();
  });

  it('closes a membership on the leave date and opens the same stay when that date is cleared', () => {
    const left = windowsFrom({
      ada: { joinedAt: '2026-10-01', leftAt: '2026-10-20', isRaidRoster: false },
    }, [{ uid: 'ada', joinedAt: '2026-07-01', leftAt: '2026-08-01' }]);
    expect(warInWindow('2026-10-01', left, 'ada')).toBe(true);
    expect(warInWindow('2026-10-19', left, 'ada')).toBe(true);
    expect(warInWindow('2026-10-20', left, 'ada')).toBe(false);
    expect(warInWindow('2026-07-15', left, 'ada')).toBe(false);

    const back = windowsFrom({
      ada: { joinedAt: '2026-10-01', leftAt: '', isRaidRoster: true },
    }, []);
    expect(warInWindow('2026-10-20', back, 'ada')).toBe(true);
    expect(warInWindow('2026-11-03', back, 'ada')).toBe(true);
  });

  it('writes the leave date only when a save takes someone off the roster', () => {
    const today = '2026-11-07';
    expect(rosterMembershipPatch(
      { isRaidRoster: true, joinedAt: '2026-10-01' },
      { isRaidRoster: false, joinedAt: '2026-10-01' },
      today,
    )).toEqual({ leftAt: today });
    expect(rosterMembershipPatch(
      { isRaidRoster: false, joinedAt: '2026-10-01', leftAt: today },
      { isRaidRoster: true, joinedAt: '2026-10-01' },
      '2026-11-08',
    )).toEqual({ leftAt: null, joinedAt: '2026-10-01' });
    expect(rosterMembershipPatch(
      { isRaidRoster: true, joinedAt: '2026-10-01' },
      { isRaidRoster: true, joinedAt: '2026-10-01' },
      today,
    )).toEqual({});
  });

  it('ranks total and rate as two separate leaderboards', () => {
    const rows = [
      { uid: 'vet', displayName: 'Vet', total: 80, rate: 50, sinceJoined: 40 },
      { uid: 'neu', displayName: 'New', total: 8, rate: 100, sinceJoined: 2 },
      { uid: 'ace', displayName: 'Ace', total: 8, rate: 100, sinceJoined: 2 },
      { uid: 'blank', displayName: 'Blank', total: 4, rate: null, sinceJoined: null },
    ];
    expect(sortRankingRows(rows, 'total').map((row) => row.displayName)).toEqual(['Vet', 'Ace', 'New', 'Blank']);
    expect(sortRankingRows(rows, 'rate').map((row) => [row.rank, row.displayName])).toEqual([
      [1, 'Ace'],
      [2, 'New'],
      [3, 'Vet'],
      [4, 'Blank'],
    ]);
  });
});
