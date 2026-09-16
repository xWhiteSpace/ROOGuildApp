import Stripe from 'stripe';
import { Router } from 'express';
import { resolveUserIdentity, signUserProfile } from '../auth/identity.js';
import { checkOfficer } from '../auth/officer.js';
import { billingEnv } from '../config/billingEnv.js';
import { valhallaEnv } from '../config/valhallaEnv.js';
import {
  activateTenantBilling,
  billingPublicView,
  countOccupyingGuilds,
  getTenantByStripeSubscription,
  getTenantByStripeSubscriptionId,
  PERMANENT_BILLING_SOURCES,
  tenantHasAccess,
  withBillingLock,
} from '../db/billing.js';
import { getTenant } from '../db/tenants.js';
import { buildSessionUser } from './tenant.routes.js';

const router = Router();

function stripeClient() {
  const { stripeSecretKey } = billingEnv();
  if (!stripeSecretKey) return null;
  return new Stripe(stripeSecretKey);
}

function graceUntilDate() {
  const { pastDueGraceDays } = billingEnv();
  return new Date(Date.now() + pastDueGraceDays * 24 * 60 * 60 * 1000);
}

function stripeId(value) {
  if (!value) return null;
  return typeof value === 'string' ? value : value.id || null;
}

function periodEndFromSubscription(sub) {
  if (!sub) return null;
  if (sub.current_period_end) return new Date(sub.current_period_end * 1000);
  const end = sub.items?.data?.[0]?.current_period?.end;
  if (end) return new Date(end * 1000);
  return null;
}

function stripeSubscriptionIdFromInvoice(invoice) {
  return stripeId(invoice?.subscription)
    || stripeId(invoice?.parent?.subscription_details?.subscription);
}

async function applyLiveSubscription(tenant, sub) {
  if (!tenant || !sub || PERMANENT_BILLING_SOURCES.has(tenant.billing_source)) return tenant;
  const stripeStatus = String(sub.status || '');
  const periodEnd = periodEndFromSubscription(sub) || tenant.current_period_end;
  const cancelAtPeriodEnd = Boolean(sub.cancel_at_period_end);
  if (stripeStatus === 'canceled' || stripeStatus === 'incomplete_expired') {
    await withBillingLock(async (client) => {
      await activateTenantBilling(client, tenant.id, {
        subscriptionStatus: 'canceled',
        billingSource: 'stripe',
        stripeCustomerId: stripeId(sub.customer) || tenant.stripe_customer_id,
        stripeSubscriptionId: null,
        currentPeriodEnd: periodEnd,
        graceUntil: null,
        cancelAtPeriodEnd: false,
      });
    });
    return getTenant(tenant.id);
  }
  const restored = stripeStatus === 'active' || stripeStatus === 'trialing';
  await withBillingLock(async (client) => {
    await activateTenantBilling(client, tenant.id, {
      subscriptionStatus: restored ? 'active' : (stripeStatus === 'past_due' || stripeStatus === 'unpaid' ? 'past_due' : tenant.subscription_status),
      billingSource: 'stripe',
      stripeCustomerId: stripeId(sub.customer) || tenant.stripe_customer_id,
      stripeSubscriptionId: sub.id || tenant.stripe_subscription_id,
      currentPeriodEnd: periodEnd,
      graceUntil: restored ? null : tenant.grace_until,
      cancelAtPeriodEnd,
    });
  });
  return getTenant(tenant.id);
}

async function refreshTenantFromStripe(tenant) {
  if (!tenant || tenant.billing_source !== 'stripe') return tenant;
  const stripe = stripeClient();
  if (!stripe) return tenant;
  let sub = null;
  if (tenant.stripe_subscription_id) {
    sub = await stripe.subscriptions.retrieve(tenant.stripe_subscription_id).catch(() => null);
  }
  if (!sub && tenant.stripe_customer_id) {
    const listed = await stripe.subscriptions.list({
      customer: tenant.stripe_customer_id,
      status: 'all',
      limit: 5,
    }).catch(() => null);
    sub = (listed?.data || []).find((row) => row.status === 'active' || row.status === 'trialing' || row.status === 'past_due')
      || listed?.data?.[0]
      || null;
  }
  if (!sub) return tenant;
  return applyLiveSubscription(tenant, sub);
}

async function requireLogin(req, res) {
  const identity = resolveUserIdentity(req);
  if (!identity?.id) {
    res.status(401).json({ success: false, error: 'Login required' });
    return null;
  }
  return identity;
}

router.get('/capacity', async (_req, res) => {
  try {
    const { maxActiveGuilds } = billingEnv();
    const activeCount = await countOccupyingGuilds();
    return res.json({ success: true, activeCount, cap: maxActiveGuilds, full: activeCount >= maxActiveGuilds });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/status', async (req, res) => {
  const identity = await requireLogin(req, res);
  if (!identity) return undefined;
  try {
    const tenantId = req.tenantId || identity.currentTenantId || req.session?.currentTenantId;
    let tenant = tenantId ? await getTenant(tenantId) : null;
    if (tenant?.billing_source === 'stripe') {
      tenant = await refreshTenantFromStripe(tenant);
    }
    const activeCount = await countOccupyingGuilds();
    return res.json({
      success: true,
      ...billingPublicView(tenant, activeCount),
      tenantId: tenantId ? String(tenantId) : null,
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/create-checkout-session', async (req, res) => {
  const identity = await requireLogin(req, res);
  if (!identity) return undefined;
  const tenantId = req.tenantId || identity.currentTenantId || req.session?.currentTenantId;
  if (!tenantId) {
    return res.status(409).json({ success: false, error: 'Select a Discord server first.', code: 'tenant_required' });
  }
  const { ok } = await checkOfficer(req);
  if (!ok) {
    return res.status(403).json({ success: false, error: 'Officer access required to subscribe.' });
  }
  const tenant = await getTenant(tenantId);
  if (!tenant) return res.status(404).json({ success: false, error: 'Unknown tenant' });
  if (tenantHasAccess(tenant)) {
    return res.status(400).json({ success: false, error: 'This guild already has an active seat.' });
  }

  const { stripePriceId, maxActiveGuilds } = billingEnv();
  const stripe = stripeClient();
  if (!stripe || !stripePriceId) {
    return res.status(503).json({ success: false, error: 'Stripe is not configured (STRIPE_SECRET_KEY / STRIPE_PRICE_ID).' });
  }

  try {
    const activeCount = await countOccupyingGuilds();
    if (activeCount >= maxActiveGuilds) {
      return res.status(409).json({
        success: false,
        error: `Capacity reached (${maxActiveGuilds}/${maxActiveGuilds}).`,
        code: 'capacity_reached',
        activeCount,
        cap: maxActiveGuilds,
      });
    }

    const { frontendUrl } = valhallaEnv();
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: stripePriceId, quantity: 1 }],
      success_url: `${frontendUrl}/workspace/billing?checkout=success`,
      cancel_url: `${frontendUrl}/workspace/billing?checkout=cancel`,
      client_reference_id: String(tenantId),
      metadata: { tenantId: String(tenantId) },
      subscription_data: { metadata: { tenantId: String(tenantId) } },
      ...(tenant.stripe_customer_id ? { customer: tenant.stripe_customer_id } : {}),
    });
    return res.json({ success: true, url: session.url });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message || 'Could not start Checkout.' });
  }
});

router.post('/create-portal-session', async (req, res) => {
  const identity = await requireLogin(req, res);
  if (!identity) return undefined;
  const tenantId = req.tenantId || identity.currentTenantId || req.session?.currentTenantId;
  if (!tenantId) {
    return res.status(409).json({ success: false, error: 'Select a Discord server first.', code: 'tenant_required' });
  }
  const { ok } = await checkOfficer(req);
  if (!ok) {
    return res.status(403).json({ success: false, error: 'Officer access required to manage billing.' });
  }
  const tenant = await getTenant(tenantId);
  if (!tenant) return res.status(404).json({ success: false, error: 'Unknown tenant' });
  if (tenant.billing_source !== 'stripe' || !tenant.stripe_customer_id) {
    return res.status(400).json({ success: false, error: 'This guild has no Stripe subscription to manage.' });
  }
  const stripe = stripeClient();
  if (!stripe) {
    return res.status(503).json({ success: false, error: 'Stripe is not configured (STRIPE_SECRET_KEY).' });
  }
  try {
    const { frontendUrl } = valhallaEnv();
    const session = await stripe.billingPortal.sessions.create({
      customer: tenant.stripe_customer_id,
      return_url: `${frontendUrl}/workspace/billing`,
    });
    return res.json({ success: true, url: session.url });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message || 'Could not open billing portal. Enable Customer Portal in the Stripe Dashboard.',
    });
  }
});

router.post('/redeem-invite', async (req, res) => {
  const identity = await requireLogin(req, res);
  if (!identity) return undefined;
  const tenantId = req.tenantId || identity.currentTenantId || req.session?.currentTenantId;
  if (!tenantId) {
    return res.status(409).json({ success: false, error: 'Select a Discord server first.', code: 'tenant_required' });
  }
  const { ok } = await checkOfficer(req);
  if (!ok) {
    return res.status(403).json({ success: false, error: 'Officer access required to redeem an invite code.' });
  }
  const code = String(req.body?.code || '').trim().toUpperCase();
  if (!code) {
    return res.status(400).json({ success: false, error: 'Enter an invite code.' });
  }

  try {
    const result = await withBillingLock(async (client) => {
      const tenantRes = await client.query('SELECT * FROM tenants WHERE id = $1 FOR UPDATE', [String(tenantId)]);
      const tenant = tenantRes.rows[0];
      if (!tenant) return { error: 'Unknown tenant', status: 404 };
      if (tenantHasAccess(tenant)) {
        return { error: 'This guild already has an active seat.', status: 400 };
      }
      const { maxActiveGuilds } = billingEnv();
      const occupying = await countOccupyingGuilds(client);
      if (occupying >= maxActiveGuilds) {
        return {
          error: `Capacity reached (${maxActiveGuilds}/${maxActiveGuilds}).`,
          status: 409,
          code: 'capacity_reached',
          occupying,
        };
      }
      const codeRes = await client.query(
        'SELECT code, redeemed_tenant_id, redeemed_at FROM invite_codes WHERE upper(code) = $1 FOR UPDATE',
        [code]
      );
      const row = codeRes.rows[0];
      if (!row) return { error: 'That invite code is not valid.', status: 400 };
      if (row.redeemed_tenant_id || row.redeemed_at) {
        return { error: 'That invite code was already used.', status: 400 };
      }

      await activateTenantBilling(client, tenantId, {
        subscriptionStatus: 'active',
        billingSource: 'invite',
      });
      await client.query(
        `UPDATE invite_codes SET redeemed_tenant_id = $2, redeemed_at = NOW() WHERE code = $1`,
        [row.code, String(tenantId)]
      );
      return { ok: true };
    });

    if (!result.ok) {
      return res.status(result.status || 400).json({
        success: false,
        error: result.error,
        code: result.code,
      });
    }

    const user = await buildSessionUser(req, tenantId, identity);
    const signed = signUserProfile(user);
    return req.session.save(() => {
      res.json({ success: true, user: signed });
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

export async function handleStripeWebhook(req, res) {
  const { stripeWebhookSecret } = billingEnv();
  const stripe = stripeClient();
  if (!stripe || !stripeWebhookSecret) {
    return res.status(503).json({ success: false, error: 'Stripe webhook is not configured.' });
  }
  const signature = req.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, signature, stripeWebhookSecret);
  } catch (err) {
    return res.status(400).json({ success: false, error: `Webhook signature failed: ${err.message}` });
  }

  try {
    if (event.type === 'checkout.session.completed') {
      await onCheckoutCompleted(stripe, event.data.object);
    } else if (event.type === 'invoice.paid' || event.type === 'invoice.payment_succeeded') {
      await onInvoicePaid(event.data.object);
    } else if (event.type === 'invoice.payment_failed') {
      await onInvoicePaymentFailed(event.data.object);
    } else if (event.type === 'customer.subscription.updated') {
      await onSubscriptionUpdated(event.data.object);
    } else if (event.type === 'customer.subscription.deleted') {
      await onSubscriptionDeleted(event.data.object);
    }
    return res.json({ received: true });
  } catch (err) {
    console.error('Stripe webhook handler:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
}

async function rejectOverflowCheckout(stripe, session, subscriptionId) {
  if (subscriptionId) {
    await stripe.subscriptions.cancel(subscriptionId).catch((err) => {
      console.error('Stripe cancel overflow sub:', err.message);
    });
  }
  let paymentIntent = stripeId(session.payment_intent);
  let chargeId = null;
  const invoiceId = stripeId(session.invoice);
  if (!paymentIntent && invoiceId) {
    const invoice = await stripe.invoices.retrieve(invoiceId).catch(() => null);
    paymentIntent = stripeId(invoice?.payment_intent);
    chargeId = stripeId(invoice?.charge);
  }
  if (paymentIntent) {
    await stripe.refunds.create({ payment_intent: paymentIntent }).catch((err) => {
      console.error('Stripe overflow refund:', err.message);
    });
    return;
  }
  if (chargeId) {
    await stripe.refunds.create({ charge: chargeId }).catch((err) => {
      console.error('Stripe overflow refund:', err.message);
    });
  }
}

async function onCheckoutCompleted(stripe, session) {
  const tenantId = session.metadata?.tenantId || session.client_reference_id;
  if (!tenantId) return;
  const subscriptionId = stripeId(session.subscription);
  const customerId = stripeId(session.customer);

  let periodEnd = null;
  if (subscriptionId) {
    const sub = await stripe.subscriptions.retrieve(subscriptionId).catch(() => null);
    if (sub) periodEnd = periodEndFromSubscription(sub);
  }

  const outcome = await withBillingLock(async (client) => {
    const tenantRes = await client.query('SELECT * FROM tenants WHERE id = $1 FOR UPDATE', [String(tenantId)]);
    const tenant = tenantRes.rows[0];
    if (!tenant) return { reject: true };
    if (PERMANENT_BILLING_SOURCES.has(tenant.billing_source)) return { reject: true };
    if (tenantHasAccess(tenant) && tenant.billing_source === 'stripe') return { reject: false };
    const { maxActiveGuilds } = billingEnv();
    const occupying = await countOccupyingGuilds(client);
    if (occupying >= maxActiveGuilds) return { reject: true };
    await activateTenantBilling(client, tenantId, {
      subscriptionStatus: 'active',
      billingSource: 'stripe',
      stripeCustomerId: customerId || tenant.stripe_customer_id,
      stripeSubscriptionId: subscriptionId || tenant.stripe_subscription_id,
      currentPeriodEnd: periodEnd,
      graceUntil: null,
      cancelAtPeriodEnd: false,
    });
    return { reject: false };
  });
  if (outcome?.reject) {
    await rejectOverflowCheckout(stripe, session, subscriptionId);
  }
}

async function onInvoicePaid(invoice) {
  const subscriptionId = stripeSubscriptionIdFromInvoice(invoice);
  if (!subscriptionId) return;
  await withBillingLock(async (client) => {
    const tenant = await getTenantByStripeSubscription(client, subscriptionId);
    if (!tenant || PERMANENT_BILLING_SOURCES.has(tenant.billing_source)) return;
    if (tenant.subscription_status === 'canceled') return;
    const periodEnd = invoice.lines?.data?.[0]?.period?.end
      ? new Date(invoice.lines.data[0].period.end * 1000)
      : tenant.current_period_end;
    await activateTenantBilling(client, tenant.id, {
      subscriptionStatus: 'active',
      billingSource: 'stripe',
      stripeCustomerId: tenant.stripe_customer_id,
      stripeSubscriptionId: tenant.stripe_subscription_id,
      currentPeriodEnd: periodEnd,
      graceUntil: null,
      cancelAtPeriodEnd: Boolean(tenant.cancel_at_period_end),
    });
  });
}

async function onInvoicePaymentFailed(invoice) {
  const subscriptionId = stripeSubscriptionIdFromInvoice(invoice);
  if (!subscriptionId) return;
  await withBillingLock(async (client) => {
    const tenant = await getTenantByStripeSubscription(client, subscriptionId);
    if (!tenant || PERMANENT_BILLING_SOURCES.has(tenant.billing_source)) return;
    if (
      tenant.subscription_status === 'past_due'
      && tenant.grace_until
      && new Date(tenant.grace_until).getTime() > Date.now()
    ) {
      return;
    }
    await activateTenantBilling(client, tenant.id, {
      subscriptionStatus: 'past_due',
      billingSource: 'stripe',
      stripeCustomerId: tenant.stripe_customer_id,
      stripeSubscriptionId: tenant.stripe_subscription_id,
      currentPeriodEnd: tenant.current_period_end,
      graceUntil: graceUntilDate(),
      cancelAtPeriodEnd: Boolean(tenant.cancel_at_period_end),
    });
  });
}

async function onSubscriptionDeleted(subscription) {
  const subscriptionId = subscription.id;
  if (!subscriptionId) return;
  await withBillingLock(async (client) => {
    const tenant = await getTenantByStripeSubscription(client, subscriptionId);
    if (!tenant || PERMANENT_BILLING_SOURCES.has(tenant.billing_source)) return;
    await activateTenantBilling(client, tenant.id, {
      subscriptionStatus: 'canceled',
      billingSource: 'stripe',
      stripeCustomerId: tenant.stripe_customer_id,
      stripeSubscriptionId: null,
      currentPeriodEnd: tenant.current_period_end,
      graceUntil: null,
      cancelAtPeriodEnd: false,
    });
  });
}

async function onSubscriptionUpdated(subscription) {
  const subscriptionId = subscription.id;
  if (!subscriptionId) return;
  const stripe = stripeClient();
  const live = stripe
    ? await stripe.subscriptions.retrieve(subscriptionId).catch(() => subscription)
    : subscription;
  const tenant = await getTenantByStripeSubscriptionId(subscriptionId);
  if (!tenant) return;
  await applyLiveSubscription(tenant, live);
}

export default router;
