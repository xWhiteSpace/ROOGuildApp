import { describe, expect, it } from 'vitest';
import {
  inclusiveRangeDeletes,
  invertedRangeRefused,
  lootAndPastAuctionsUntouched,
  nonOfficerDoesNotClear,
  outsideRangePreserved,
} from '../../patterns/clear_history.js';

describe('TST-ROO-075 ClearRequestHistoryByDate deletes only web_requests inside an inclusive range', () => {
  it('Inclusive start and end dates are deleted', async () => {
    const { res, rows } = await inclusiveRangeDeletes();
    expect(res.status).toBe(200);
    expect(res.body.deletedCount).toBe(2);
    expect(rows.in1).toBeUndefined();
    expect(rows.in2).toBeUndefined();
  });

  it('Dates outside the range are not deleted', async () => {
    const { res, rows } = await outsideRangePreserved();
    expect(res.status).toBe(200);
    expect(rows.out1).toBeTruthy();
    expect(rows.out2).toBeTruthy();
    expect(res.body.deletedCount).toBe(2);
  });

  it('Inverted or invalid range deletes nothing', async () => {
    const { res, before, after } = await invertedRangeRefused();
    expect(res.status).toBe(400);
    expect(after).toBe(before);
  });

  it('Non-officer does not delete', async () => {
    const { res, before, after } = await nonOfficerDoesNotClear();
    expect(res.status).toBe(403);
    expect(after).toBe(before);
  });

  it('Loot history and past auctions are not deleted by this unit', async () => {
    const { res, beforeLoot, beforePast, afterLoot, afterPast } = await lootAndPastAuctionsUntouched();
    expect(res.status).toBe(200);
    expect(res.body.deletedCount).toBe(2);
    expect(afterLoot).toEqual(beforeLoot);
    expect(afterPast).toEqual(beforePast);
  });
});
