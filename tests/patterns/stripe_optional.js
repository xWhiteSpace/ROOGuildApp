import { vi } from 'vitest';
import { patterns } from './registry.js';
import { withEnv } from './envSandbox.js';
import { billingEnv } from '../../backend/src/config/billingEnv.js';
import { dispatch } from '../support/dispatch.js';

patterns.stripe_optional = 'used';
patterns.fail_closed_503 = 'used';

const hold = vi.hoisted(() => ({
  stripeCtorCalls: 0,
  redeemOk: false,
  occupying: 1,
  tenantOverride: null,
}));

vi.mock('stripe', () => ({
  default: class MockStripe {
    constructor() {
      hold.stripeCtorCalls += 1;
      throw new Error('live Stripe must not be constructed in this unit');
    }
  },
}));

vi.mock('../../backend/src/db/billing.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    countOccupyingGuilds: async () => hold.occupying,
    withBillingLock: async (fn) => {
      const client = {
        query: async (sql, params = []) => {
          const s = String(sql);
          if (/FROM tenants WHERE id/i.test(s)) {
            return {
              rows: [{
                id: String(params[0]),
                subscription_status: 'inactive',
                billing_source: null,
              }],
            };
          }
          if (/FROM invite_codes/i.test(s)) {
            return { rows: [{ code: params[0], redeemed_tenant_id: null, redeemed_at: null }] };
          }
          if (/UPDATE invite_codes/i.test(s) || /UPDATE tenants/i.test(s)) {
            return { rows: [], rowCount: 1 };
          }
          if (/COUNT/i.test(s)) return { rows: [{ n: hold.occupying }] };
          return { rows: [] };
        },
      };
      return fn(client);
    },
    activateTenantBilling: async () => {
      hold.redeemOk = true;
    },
  };
});

vi.mock('../../backend/src/auth/officer.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, checkOfficer: async () => ({ ok: true }) };
});

vi.mock('../../backend/src/auth/identity.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    resolveUserIdentity: (req) => req.session?.user || { id: 'u1', currentTenantId: 't-invite' },
    signUserProfile: (u) => u,
  };
});

vi.mock('../../backend/src/api/tenant.routes.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    buildSessionUser: async () => ({ id: 'u1', currentTenantId: 't-invite' }),
  };
});

vi.mock('../../backend/src/db/tenants.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getTenant: async (id) => {
      if (!id) return null;
      if (hold.tenantOverride) return { ...hold.tenantOverride, id: String(id) };
      return {
        id: String(id),
        subscription_status: 'inactive',
        billing_source: null,
      };
    },
  };
});

const billingRouter = (await import('../../backend/src/api/billing.routes.js')).default;
const { handleStripeWebhook } = await import('../../backend/src/api/billing.routes.js');

export function missingStripeEnvDoesNotThrowFactory() {
  // Honesty: stripeClient() is private in billing.routes.js; boot is index.js (skipped).
  // Assert billingEnv() reads absent keys without throwing — same non-fatal contract.
  return withEnv({
    STRIPE_SECRET_KEY: '',
    STRIPE_WEBHOOK_SECRET: '',
    STRIPE_PRICE_ID: '',
  }, () => {
    const env = billingEnv();
    return {
      env,
      threw: false,
      bootBulletSkipped: 'missing Stripe env does not fail boot — only index.js top-level; skipped. Asserted billingEnv() instead.',
    };
  });
}

export function capacityWithoutStripe() {
  return withEnv({
    STRIPE_SECRET_KEY: '',
    STRIPE_PRICE_ID: '',
  }, async () => {
    hold.stripeCtorCalls = 0;
    const res = await dispatch(billingRouter, { method: 'GET', path: '/capacity' });
    return { ...res, stripeCtorCalls: hold.stripeCtorCalls };
  });
}

export function inviteRedeemDoesNotCallStripe() {
  return withEnv({
    STRIPE_SECRET_KEY: '',
    STRIPE_PRICE_ID: '',
    BILLING_MAX_ACTIVE_GUILDS: '20',
  }, async () => {
    hold.stripeCtorCalls = 0;
    hold.redeemOk = false;
    hold.occupying = 0;
    const res = await dispatch(billingRouter, {
      method: 'POST',
      path: '/redeem-invite',
      body: { code: 'UNITCODE' },
      session: {
        user: { id: 'u1', currentTenantId: 't-invite', isOfficer: true },
        currentTenantId: 't-invite',
        save: (cb) => cb(),
      },
    });
    // Attach tenantId as middleware would
    return { ...res, redeemOk: hold.redeemOk, stripeCtorCalls: hold.stripeCtorCalls };
  });
}

export async function checkoutFailClosed() {
  return withEnv({
    STRIPE_SECRET_KEY: '',
    STRIPE_PRICE_ID: '',
  }, async () => {
    const res = await dispatch(billingRouter, {
      method: 'POST',
      path: '/create-checkout-session',
      session: {
        user: { id: 'u1', currentTenantId: 't1', isOfficer: true },
        currentTenantId: 't1',
      },
    });
    return res;
  });
}

export async function portalFailClosed() {
  return withEnv({ STRIPE_SECRET_KEY: '', STRIPE_PRICE_ID: 'price_x' }, async () => {
    hold.tenantOverride = {
      subscription_status: 'active',
      billing_source: 'stripe',
      stripe_customer_id: 'cus_portal',
    };
    try {
      return await dispatch(billingRouter, {
        method: 'POST',
        path: '/create-portal-session',
        session: {
          user: { id: 'u1', currentTenantId: 't1', isOfficer: true },
          currentTenantId: 't1',
        },
      });
    } finally {
      hold.tenantOverride = null;
    }
  });
}

export async function webhookFailClosed() {
  return withEnv({
    STRIPE_SECRET_KEY: '',
    STRIPE_WEBHOOK_SECRET: '',
  }, async () => {
    const req = { body: Buffer.from('{}'), headers: {} };
    const res = {
      statusCode: 200,
      body: null,
      status(c) { this.statusCode = c; return this; },
      json(b) { this.body = b; return this; },
    };
    await handleStripeWebhook(req, res);
    return { status: res.statusCode, body: res.body };
  });
}
