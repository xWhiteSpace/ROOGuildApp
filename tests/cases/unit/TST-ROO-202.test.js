import { describe, expect, it } from 'vitest';
import {
  inviteIsPermanent,
  grandfatheredIsPermanent,
  stripeNotPermanent,
  inviteNotOverwritten,
  grandfatheredNotOverwritten,
  stripeStatusRefreshRuns,
  nonStripeStatusRefreshSkipped,
} from '../../patterns/permanent_billing.js';

describe('TST-ROO-202 PermanentBillingSourcesAreNotOverwritten keeps invite/grandfathered seats off Stripe overwrite', () => {
  it('invite is permanent and is not overwritten', async () => {
    expect(inviteIsPermanent().has).toBe(true);
    const r = await inviteNotOverwritten();
    expect(r.unchanged).toBe(true);
    expect(r.activateCalls).toHaveLength(0);
  });

  it('grandfathered is permanent and is not overwritten', async () => {
    expect(grandfatheredIsPermanent()).toBe(true);
    const r = await grandfatheredNotOverwritten();
    expect(r.unchanged).toBe(true);
    expect(r.activateCalls).toHaveLength(0);
  });

  it('a source that is neither invite nor grandfathered is not permanent', () => {
    const r = stripeNotPermanent();
    expect(r.stripe).toBe(false);
  });

  it('status refresh from Stripe runs only for billing_source stripe', async () => {
    const r = await stripeStatusRefreshRuns();
    expect(r.retrieveCalls).toBeGreaterThan(0);
    expect(r.activateCalls.length).toBeGreaterThan(0);
    expect(r.tenant.subscription_status).toBe('active');
  });

  it('status refresh from Stripe does not run for a non-stripe source', async () => {
    const r = await nonStripeStatusRefreshSkipped();
    expect(r.retrieveCalls).toBe(0);
    expect(r.activateCalls).toHaveLength(0);
  });
});
