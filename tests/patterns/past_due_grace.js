import { vi } from 'vitest';
import { patterns } from './registry.js';
import { withEnv } from './envSandbox.js';

patterns.past_due_grace = 'used';
patterns.grace_window = 'used';

const hold = vi.hoisted(() => ({
  tenants: new Map(),
  activateCalls: [],
}));

vi.mock('stripe', () => ({
  default: class MockStripe {
    constructor() {
      this.webhooks = {
        constructEvent: (body) => (typeof body === 'string' || Buffer.isBuffer(body)
          ? JSON.parse(Buffer.isBuffer(body) ? body.toString('utf8') : body)
          : body),
      };
      this.subscriptions = { retrieve: async () => null, cancel: async () => ({}) };
      this.refunds = { create: async () => ({}) };
      this.invoices = { retrieve: async () => null };
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
          if (/stripe_subscription_id/i.test(String(sql))) {
            for (const t of hold.tenants.values()) {
              if (String(t.stripe_subscription_id) === String(params[0])) return { rows: [t] };
            }
            return { rows: [] };
          }
          return { rows: [] };
        },
      };
      return fn(client);
    },
    activateTenantBilling: async (_c, tenantId, fields) => {
      hold.activateCalls.push({ tenantId: String(tenantId), fields });
      const prior = hold.tenants.get(String(tenantId)) || { id: String(tenantId) };
      hold.tenants.set(String(tenantId), {
        ...prior,
        subscription_status: fields.subscriptionStatus ?? prior.subscription_status,
        billing_source: fields.billingSource ?? prior.billing_source,
        grace_until: Object.prototype.hasOwnProperty.call(fields, 'graceUntil')
          ? fields.graceUntil
          : prior.grace_until,
        stripe_customer_id: fields.stripeCustomerId ?? prior.stripe_customer_id,
        stripe_subscription_id: fields.stripeSubscriptionId ?? prior.stripe_subscription_id,
        current_period_end: fields.currentPeriodEnd ?? prior.current_period_end,
        cancel_at_period_end: fields.cancelAtPeriodEnd ?? prior.cancel_at_period_end,
      });
    },
    getTenantByStripeSubscription: async (client, subscriptionId) => {
      for (const t of hold.tenants.values()) {
        if (String(t.stripe_subscription_id) === String(subscriptionId)) return t;
      }
      return null;
    },
  };
});

const { handleStripeWebhook } = await import('../../backend/src/api/billing.routes.js');

function reset(row) {
  hold.tenants.clear();
  hold.activateCalls = [];
  if (row) hold.tenants.set(row.id, { ...row });
}

async function fireFailed(row, envExtra = {}) {
  return withEnv({
    STRIPE_SECRET_KEY: 'sk_test_unit',
    STRIPE_WEBHOOK_SECRET: 'whsec_unit',
    STRIPE_PRICE_ID: 'price_unit',
    ...envExtra,
  }, async () => {
    reset(row);
    const before = { ...hold.tenants.get(row.id) };
    const event = {
      type: 'invoice.payment_failed',
      data: {
        object: {
          subscription: row.stripe_subscription_id,
          parent: { subscription_details: { subscription: row.stripe_subscription_id } },
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
    const after = hold.tenants.get(row.id);
    return {
      before,
      after,
      activateCalls: [...hold.activateCalls],
      unchanged:
        before.subscription_status === after.subscription_status
        && String(before.grace_until) === String(after.grace_until),
    };
  });
}

export function permanentDoesNotEnterPastDue() {
  return fireFailed({
    id: 'g-invite',
    billing_source: 'invite',
    subscription_status: 'active',
    grace_until: null,
    stripe_subscription_id: 'sub_inv',
    stripe_customer_id: 'cus_inv',
  });
}

export function openFutureGraceNotReset() {
  const grace = new Date(Date.now() + 2 * 86_400_000).toISOString();
  return fireFailed({
    id: 'g-grace',
    billing_source: 'stripe',
    subscription_status: 'past_due',
    grace_until: grace,
    stripe_subscription_id: 'sub_grace',
    stripe_customer_id: 'cus_g',
  });
}

export function otherwisePastDueWithConfiguredDays() {
  return fireFailed({
    id: 'g-fail',
    billing_source: 'stripe',
    subscription_status: 'active',
    grace_until: null,
    stripe_subscription_id: 'sub_fail',
    stripe_customer_id: 'cus_f',
    cancel_at_period_end: false,
    current_period_end: null,
  }, { BILLING_PAST_DUE_GRACE_DAYS: '5' });
}

export function unsetGraceDaysDefault3() {
  return fireFailed({
    id: 'g-def',
    billing_source: 'stripe',
    subscription_status: 'active',
    grace_until: null,
    stripe_subscription_id: 'sub_def',
    stripe_customer_id: 'cus_d',
  }, { BILLING_PAST_DUE_GRACE_DAYS: '' });
}
