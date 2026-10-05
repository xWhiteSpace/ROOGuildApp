import { describe, expect, it } from 'vitest';
import {
  permanentDoesNotEnterPastDue,
  openFutureGraceNotReset,
  otherwisePastDueWithConfiguredDays,
  unsetGraceDaysDefault3,
} from '../../patterns/past_due_grace.js';

describe('TST-ROO-201 InvoicePaymentFailedSetsPastDueGrace sets past_due and grace_until unless permanent or open grace', () => {
  it('a permanent source does not enter past_due on this path', async () => {
    const r = await permanentDoesNotEnterPastDue();
    expect(r.unchanged).toBe(true);
    expect(r.activateCalls).toHaveLength(0);
  });

  it('an open future grace window is not reset', async () => {
    const r = await openFutureGraceNotReset();
    expect(r.unchanged).toBe(true);
    expect(r.activateCalls).toHaveLength(0);
  });

  it('otherwise status becomes past_due and grace_until is now plus the configured days', async () => {
    const before = Date.now();
    const r = await otherwisePastDueWithConfiguredDays();
    expect(r.after.subscription_status).toBe('past_due');
    const grace = new Date(r.after.grace_until).getTime();
    const expected = before + 5 * 86_400_000;
    expect(Math.abs(grace - expected)).toBeLessThan(10_000);
  });

  it('unset grace days default to 3', async () => {
    const before = Date.now();
    const r = await unsetGraceDaysDefault3();
    expect(r.after.subscription_status).toBe('past_due');
    const grace = new Date(r.after.grace_until).getTime();
    const expected = before + 3 * 86_400_000;
    expect(Math.abs(grace - expected)).toBeLessThan(10_000);
  });
});
