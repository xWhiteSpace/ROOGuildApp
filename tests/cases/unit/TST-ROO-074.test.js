import { describe, expect, it } from 'vitest';
import {
  missingIdsNoReset,
  nonOfficerNoReset,
  officerInsertsAdminReset,
  priorHistoryUntouched,
} from '../../patterns/admin_reset.js';

describe('TST-ROO-074 ResetPriorityAdminReset appends an AdminReset row and keeps prior history', () => {
  it('Officer reset inserts an AdminReset/Reset row', async () => {
    const { res, rows } = await officerInsertsAdminReset();
    expect(res.status).toBe(200);
    const resetRow = Object.values(rows).find((r) => r.applicationStatus === 'AdminReset');
    expect(resetRow).toMatchObject({
      applicationStatus: 'AdminReset',
      selectionStatus: 'Reset',
      quantity: 0,
      priority: 0,
      itemId: 'puppet',
      userId: '111',
    });
  });

  it('Prior history rows stay as stored', async () => {
    const { prior, rows } = await priorHistoryUntouched();
    expect(rows.hist1).toEqual(prior);
    expect(Object.values(rows).some((r) => r.applicationStatus === 'AdminReset')).toBe(true);
  });

  it('Non-officer does not insert a reset row', async () => {
    const { res, before, after } = await nonOfficerNoReset();
    expect(res.status).toBe(403);
    expect(Object.keys(after)).toHaveLength(before);
    expect(Object.values(after).every((r) => r.applicationStatus !== 'AdminReset')).toBe(true);
  });

  it('Missing userId or itemId does not insert a reset row', async () => {
    const { res, before, after } = await missingIdsNoReset();
    expect(res.status).toBe(400);
    expect(Object.keys(after)).toHaveLength(before);
  });
});
