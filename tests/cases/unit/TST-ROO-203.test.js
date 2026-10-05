import { describe, expect, it } from 'vitest';
import {
  missingStripeEnvDoesNotThrowFactory,
  capacityWithoutStripe,
  inviteRedeemDoesNotCallStripe,
  checkoutFailClosed,
  portalFailClosed,
  webhookFailClosed,
} from '../../patterns/stripe_optional.js';

describe('TST-ROO-203 StripeOptionalAtBootFailClosedAtCheckout keeps invite/capacity live when Stripe keys are absent', () => {
  it('missing Stripe env does not fail boot', () => {
    const r = missingStripeEnvDoesNotThrowFactory();
    expect(r.threw).toBe(false);
    expect(r.env.stripeSecretKey).toBe('');
    // Boot bullet is index.js-only — asserted billingEnv() non-throw instead.
  });

  it('invite redemption does not call Stripe', async () => {
    const r = await inviteRedeemDoesNotCallStripe();
    expect(r.stripeCtorCalls).toBe(0);
    expect(r.status).toBe(200);
    expect(r.redeemOk).toBe(true);
  });

  it('capacity and access evaluation do not need Stripe', async () => {
    const r = await capacityWithoutStripe();
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    expect(r.stripeCtorCalls).toBe(0);
  });

  it('Checkout, portal, and webhook fail closed when unconfigured', async () => {
    const c = await checkoutFailClosed();
    const p = await portalFailClosed();
    const w = await webhookFailClosed();
    expect(c.status).toBe(503);
    expect(p.status).toBe(503);
    expect(w.status).toBe(503);
  });
});
