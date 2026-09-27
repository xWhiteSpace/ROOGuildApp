import { describe, expect, it } from 'vitest';
import { pushIdAt } from '../../../backend/src/games/ragnarok-origin/utils/sortingEngine.js';
import { compileLeaderboard } from '../../../backend/src/games/ragnarok-origin/utils/sortingEngine.js';
import {
  resolveSessionDate,
  scorePriority,
  toIsoDate,
  writeMsFromId,
} from '../../../backend/src/games/ragnarok-origin/services/requestLedger.js';

const TODAY = '2026-09-27';
const ITEM = 'puppet';

function row(partial) {
  return {
    userId: 'u1',
    itemId: ITEM,
    item: 'Puppet',
    ...partial,
  };
}

describe('request ledger clock', () => {
  it('parses ISO and US dates and leaves blanks blank', () => {
    expect(toIsoDate('2026-09-27')).toBe('2026-09-27');
    expect(toIsoDate('9/27/2026')).toBe('2026-09-27');
    expect(toIsoDate('9/7/2026')).toBe('2026-09-07');
    expect(toIsoDate('')).toBe('');
    expect(toIsoDate('13/40/2026')).toBe('');
  });

  it('uses the configured session date, otherwise the guild calendar day', () => {
    expect(resolveSessionDate({ targetSessionDate: '9/27/2026' }, 'Asia/Manila')).toBe('2026-09-27');
    expect(resolveSessionDate({}, 'UTC')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('reads write time from a Firebase push id', () => {
    const ms = 1_727_000_000_000;
    expect(writeMsFromId(pushIdAt(ms))).toBe(ms);
  });

  it('scores a later win ahead of an earlier loss even when the win id sorts first', () => {
    const score = scorePriority([
      row({
        id: '-P1XzfGPMx2wj4y_LnXN',
        date: '9/24/2026',
        selectionStatus: 'Selected',
      }),
      row({
        id: '-mf3k00011234567',
        date: '9/13/2026',
        selectionStatus: 'NotSelected',
      }),
    ], {
      userId: 'u1',
      itemId: ITEM,
      itemName: 'Puppet',
      isHighValue: true,
      lookbackDays: 30,
      today: TODAY,
    });
    expect(score).toBe(0);
  });

  it('counts a high-value absence and does not let it end the streak', () => {
    const rows = [
      row({ id: 'a', date: '9/20/2026', selectionStatus: 'Absent' }),
      row({ id: 'b', date: '9/22/2026', selectionStatus: 'NotSelected' }),
    ];
    expect(scorePriority(rows, {
      userId: 'u1', itemId: ITEM, isHighValue: true, lookbackDays: 30, today: TODAY,
    })).toBe(2);
    expect(scorePriority(rows, {
      userId: 'u1', itemId: ITEM, isHighValue: false, lookbackDays: 30, today: TODAY,
    })).toBe(1);
  });

  it('counts one night once and ignores pending rows', () => {
    const score = scorePriority([
      row({ id: 'a', date: '9/22/2026', selectionStatus: 'NotSelected' }),
      row({ id: 'b', date: '9/22/2026', selectionStatus: 'NotSelected' }),
      row({ id: 'c', date: '9/24/2026', selectionStatus: 'Pending' }),
      row({ id: 'd', date: '9/25/2026', selectionStatus: 'Canceled' }),
    ], {
      userId: 'u1', itemId: ITEM, isHighValue: false, lookbackDays: 30, today: TODAY,
    });
    expect(score).toBe(1);
  });

  it('lets Reset end the streak', () => {
    const score = scorePriority([
      row({ id: 'a', date: '9/20/2026', selectionStatus: 'NotSelected' }),
      row({ id: 'b', date: '9/21/2026', selectionStatus: 'Reset' }),
      row({ id: 'c', date: '9/26/2026', selectionStatus: 'NotSelected' }),
    ], {
      userId: 'u1', itemId: ITEM, isHighValue: true, lookbackDays: 30, today: TODAY,
    });
    expect(score).toBe(1);
  });

  it('replaces the stored pending priority with the live score', () => {
    const items = [{ id: ITEM, name: 'Puppet', active: true, isHighValue: true }];
    const pending = [row({
      id: 'pending-1',
      date: '9/27/2026',
      selectionStatus: 'Pending',
      applicationStatus: 'Requested',
      quantity: 1,
      priority: 2,
      member: 'QueenZ',
    })];
    const ledger = [
      ...pending,
      row({
        id: '-P1XzfGPMx2wj4y_LnXN',
        date: '9/27/2026',
        selectionStatus: 'Selected',
        priority: 2,
      }),
    ];
    const board = compileLeaderboard(pending, items, {}, {
      ledgerRows: ledger,
      lookbackDays: 30,
      today: TODAY,
    });
    expect(board.requestsByItemDetails[ITEM].u1.priority).toBe(0);
  });
});
