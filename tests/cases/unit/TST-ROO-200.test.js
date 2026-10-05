import { describe, expect, it } from 'vitest';
import {
  missingTenantNotActivated,
  permanentSourceNotActivated,
  capacityFullNotActivated,
  alreadyActiveStripeSeatNotOverflow,
} from '../../patterns/overflow_checkout.js';

describe('TST-ROO-200 CheckoutOverflowReject cancels and refunds when a seat cannot activate', () => {
  it('a missing tenant is not activated', async () => {
    const r = await missingTenantNotActivated();
    expect(r.activateCalls).toHaveLength(0);
    expect(r.canceled).toContain('sub_overflow_1');
    expect(r.refunds.some((x) => x.payment_intent === 'pi_overflow')).toBe(true);
  });

  it('a permanent source is not activated', async () => {
    const r = await permanentSourceNotActivated();
    expect(r.activateCalls).toHaveLength(0);
    expect(r.canceled).toContain('sub_overflow_1');
    expect(r.refunds.length).toBeGreaterThan(0);
    expect(r.tenant.billing_source).toBe('invite');
  });

  it('capacity already full is not activated', async () => {
    const r = await capacityFullNotActivated();
    expect(r.activateCalls).toHaveLength(0);
    expect(r.canceled).toContain('sub_overflow_1');
    expect(r.refunds.length).toBeGreaterThan(0);
  });

  it('an already-active stripe seat for the same tenant is not an overflow reject', async () => {
    const r = await alreadyActiveStripeSeatNotOverflow();
    expect(r.activateCalls).toHaveLength(0);
    expect(r.canceled).toHaveLength(0);
    expect(r.refunds).toHaveLength(0);
  });
});
