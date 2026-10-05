import { vi } from 'vitest';
import { patterns } from './registry.js';
import { withEnv } from './envSandbox.js';

patterns.overflow_checkout = 'used';
patterns.checkout_reject = 'used';

const hold = vi.hoisted(() => ({
  tenants: new Map(),
  activateCalls: [],
  cancel: vi.fn(async (id) => ({ id, canceled: true })),
  refund: vi.fn(async (args) => ({ id: 're_1', ...args })),
  retrieveSub: vi.fn(async () => ({ id: 'sub_1', current_period_end: Math.floor(Date.now() / 1000) + 86400 })),
  retrieveInv: vi.fn(async () => ({ payment_intent: 'pi_1', charge: 'ch_1' })),
  occupying: 0,
}));

vi.mock('stripe', () => ({
  default: class MockStripe {
    constructor() {
      this.subscriptions = {
        cancel: (...a) => hold.cancel(...a),
        retrieve: (...a) => hold.retrieveSub(...a),
      };
      this.refunds = { create: (...a) => hold.refund(...a) };
      this.invoices = { retrieve: (...a) => hold.retrieveInv(...a) };
      this.webhooks = {
        constructEvent: (body) => (typeof body === 'string' || Buffer.isBuffer(body)
          ? JSON.parse(Buffer.isBuffer(body) ? body.toString('utf8') : body)
          : body),
      };
    }
  },
}));

vi.mock('../../backend/src/db/billing.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    withBillingLock: async (fn) => {
      const client = {
        query: async (sql, params = []) => {
          const s = String(sql);
          if (/SELECT \* FROM tenants WHERE id/i.test(s)) {
            const t = hold.tenants.get(String(params[0]));
            return { rows: t ? [t] : [] };
          }
          if (/COUNT\(\*\)/i.test(s)) {
            return { rows: [{ n: hold.occupying }] };
          }
          return { rows: [] };
        },
      };
      return fn(client);
    },
    activateTenantBilling: async (_client, tenantId, fields) => {
      hold.activateCalls.push({ tenantId: String(tenantId), fields });
      const prior = hold.tenants.get(String(tenantId)) || { id: String(tenantId) };
      hold.tenants.set(String(tenantId), {
        ...prior,
        subscription_status: fields.subscriptionStatus,
        billing_source: fields.billingSource,
        stripe_customer_id: fields.stripeCustomerId,
        stripe_subscription_id: fields.stripeSubscriptionId,
        current_period_end: fields.currentPeriodEnd,
        grace_until: fields.graceUntil,
        cancel_at_period_end: fields.cancelAtPeriodEnd,
      });
    },
    countOccupyingGuilds: async () => hold.occupying,
  };
});

const { handleStripeWebhook } = await import('../../backend/src/api/billing.routes.js');

function reset() {
  hold.tenants.clear();
  hold.activateCalls = [];
  hold.cancel.mockClear();
  hold.refund.mockClear();
  hold.occupying = 0;
}

async function fireCheckout({ tenantId, tenantRow, occupying = 0, payment_intent = 'pi_overflow' }) {
  return withEnv({
    STRIPE_SECRET_KEY: 'sk_test_unit',
    STRIPE_WEBHOOK_SECRET: 'whsec_unit',
    STRIPE_PRICE_ID: 'price_unit',
    BILLING_MAX_ACTIVE_GUILDS: '2',
  }, async () => {
    reset();
    hold.occupying = occupying;
    if (tenantRow) hold.tenants.set(String(tenantId || tenantRow.id), { ...tenantRow });
    const event = {
      type: 'checkout.session.completed',
      data: {
        object: {
          metadata: { tenantId: tenantId || tenantRow?.id },
          client_reference_id: tenantId || tenantRow?.id,
          subscription: 'sub_overflow_1',
          customer: 'cus_1',
          payment_intent,
          invoice: null,
        },
      },
    };
    const req = {
      body: Buffer.from(JSON.stringify(event)),
      headers: { 'stripe-signature': 'sig' },
    };
    const res = {
      statusCode: 200,
      body: null,
      status(c) { this.statusCode = c; return this; },
      json(b) { this.body = b; return this; },
    };
    await handleStripeWebhook(req, res);
    return {
      status: res.statusCode,
      body: res.body,
      activateCalls: [...hold.activateCalls],
      canceled: hold.cancel.mock.calls.map((c) => c[0]),
      refunds: hold.refund.mock.calls.map((c) => c[0]),
      tenant: hold.tenants.get(String(tenantId || tenantRow?.id)) || null,
    };
  });
}

export function missingTenantNotActivated() {
  return fireCheckout({ tenantId: 'missing-guild', tenantRow: null, occupying: 0 });
}

export function permanentSourceNotActivated() {
  return fireCheckout({
    tenantId: 'invite-guild',
    tenantRow: {
      id: 'invite-guild',
      subscription_status: 'active',
      billing_source: 'invite',
    },
    occupying: 0,
  });
}

export function capacityFullNotActivated() {
  return fireCheckout({
    tenantId: 'new-guild',
    tenantRow: {
      id: 'new-guild',
      subscription_status: 'inactive',
      billing_source: null,
    },
    occupying: 2,
  });
}

export function alreadyActiveStripeSeatNotOverflow() {
  return fireCheckout({
    tenantId: 'stripe-guild',
    tenantRow: {
      id: 'stripe-guild',
      subscription_status: 'active',
      billing_source: 'stripe',
      stripe_subscription_id: 'sub_existing',
    },
    occupying: 2,
  });
}
