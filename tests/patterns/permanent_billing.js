import { vi } from 'vitest';
import { patterns } from './registry.js';
import { withEnv } from './envSandbox.js';
import { PERMANENT_BILLING_SOURCES } from '../../backend/src/db/billing.js';

patterns.permanent_billing = 'used';
patterns.stripe_refresh = 'used';

const hold = vi.hoisted(() => ({
  tenants: new Map(),
  activateCalls: [],
  retrieveCalls: 0,
}));

vi.mock('stripe', () => ({
  default: class MockStripe {
    constructor() {
      this.webhooks = {
        constructEvent: (body) => (typeof body === 'string' || Buffer.isBuffer(body)
          ? JSON.parse(Buffer.isBuffer(body) ? body.toString('utf8') : body)
          : body),
      };
      this.subscriptions = {
        retrieve: async (id) => {
          hold.retrieveCalls += 1;
          return {
            id,
            status: 'active',
            customer: 'cus_live',
            cancel_at_period_end: false,
            current_period_end: Math.floor(Date.now() / 1000) + 86400,
          };
        },
        list: async () => ({ data: [] }),
        cancel: async () => ({}),
      };
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
          if (/SELECT \* FROM tenants WHERE id/i.test(String(sql))) {
            const t = hold.tenants.get(String(params[0]));
            return { rows: t ? [t] : [] };
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
    getTenantByStripeSubscriptionId: async (subscriptionId) => {
      for (const t of hold.tenants.values()) {
        if (String(t.stripe_subscription_id) === String(subscriptionId)) return t;
      }
      return null;
    },
    getTenantByStripeSubscription: async (_c, subscriptionId) => {
      for (const t of hold.tenants.values()) {
        if (String(t.stripe_subscription_id) === String(subscriptionId)) return t;
      }
      return null;
    },
    countOccupyingGuilds: async () => 0,
  };
});

vi.mock('../../backend/src/db/tenants.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getTenant: async (id) => hold.tenants.get(String(id)) || null,
  };
});

const { handleStripeWebhook } = await import('../../backend/src/api/billing.routes.js');
const billingRouter = (await import('../../backend/src/api/billing.routes.js')).default;
const { dispatch } = await import('../support/dispatch.js');

export function inviteIsPermanent() {
  return {
    has: PERMANENT_BILLING_SOURCES.has('invite'),
    set: [...PERMANENT_BILLING_SOURCES],
  };
}

export function grandfatheredIsPermanent() {
  return PERMANENT_BILLING_SOURCES.has('grandfathered');
}

export function stripeNotPermanent() {
  return {
    stripe: PERMANENT_BILLING_SOURCES.has('stripe'),
    nullish: PERMANENT_BILLING_SOURCES.has(null),
    empty: PERMANENT_BILLING_SOURCES.has(''),
  };
}

async function fireSubUpdated(row) {
  return withEnv({
    STRIPE_SECRET_KEY: 'sk_test_unit',
    STRIPE_WEBHOOK_SECRET: 'whsec_unit',
    STRIPE_PRICE_ID: 'price_unit',
  }, async () => {
    hold.tenants.clear();
    hold.activateCalls = [];
    hold.retrieveCalls = 0;
    hold.tenants.set(row.id, { ...row });
    const before = { ...row };
    const event = {
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: row.stripe_subscription_id,
          status: 'past_due',
          customer: 'cus_x',
          cancel_at_period_end: false,
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
        && before.billing_source === after.billing_source
        && String(before.grace_until) === String(after.grace_until),
    };
  });
}

export function inviteNotOverwritten() {
  return fireSubUpdated({
    id: 'perm-invite',
    billing_source: 'invite',
    subscription_status: 'active',
    grace_until: null,
    stripe_subscription_id: 'sub_pi',
    stripe_customer_id: 'cus_pi',
  });
}

export function grandfatheredNotOverwritten() {
  return fireSubUpdated({
    id: 'perm-gf',
    billing_source: 'grandfathered',
    subscription_status: 'active',
    grace_until: null,
    stripe_subscription_id: 'sub_gf',
    stripe_customer_id: 'cus_gf',
  });
}

export function stripeStatusRefreshRuns() {
  return withEnv({
    STRIPE_SECRET_KEY: 'sk_test_unit',
    STRIPE_WEBHOOK_SECRET: 'whsec_unit',
    STRIPE_PRICE_ID: 'price_unit',
  }, async () => {
    hold.tenants.clear();
    hold.activateCalls = [];
    hold.retrieveCalls = 0;
    hold.tenants.set('stripe-t', {
      id: 'stripe-t',
      billing_source: 'stripe',
      subscription_status: 'past_due',
      grace_until: new Date(Date.now() + 86400000).toISOString(),
      stripe_subscription_id: 'sub_refresh',
      stripe_customer_id: 'cus_r',
    });
    const res = await dispatch(billingRouter, {
      method: 'GET',
      path: '/status',
      session: {
        user: { id: 'u1', currentTenantId: 'stripe-t' },
        currentTenantId: 'stripe-t',
        passport: { user: { id: 'u1' } },
      },
    });
    return {
      status: res.status,
      activateCalls: [...hold.activateCalls],
      retrieveCalls: hold.retrieveCalls,
      tenant: hold.tenants.get('stripe-t'),
    };
  });
}

export function nonStripeStatusRefreshSkipped() {
  return withEnv({
    STRIPE_SECRET_KEY: 'sk_test_unit',
    STRIPE_WEBHOOK_SECRET: 'whsec_unit',
    STRIPE_PRICE_ID: 'price_unit',
  }, async () => {
    hold.tenants.clear();
    hold.activateCalls = [];
    hold.retrieveCalls = 0;
    hold.tenants.set('invite-t', {
      id: 'invite-t',
      billing_source: 'invite',
      subscription_status: 'active',
      grace_until: null,
      stripe_subscription_id: null,
      stripe_customer_id: null,
    });
    const res = await dispatch(billingRouter, {
      method: 'GET',
      path: '/status',
      session: {
        user: { id: 'u1', currentTenantId: 'invite-t' },
        currentTenantId: 'invite-t',
      },
    });
    return {
      status: res.status,
      activateCalls: [...hold.activateCalls],
      retrieveCalls: hold.retrieveCalls,
    };
  });
}
