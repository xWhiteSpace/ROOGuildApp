import { getPool, query } from './pool.js';
import { BILLING_ADVISORY_LOCK, billingEnv } from '../config/billingEnv.js';

export const PERMANENT_BILLING_SOURCES = new Set(['invite', 'grandfathered']);

const OCCUPYING_SQL = `(
  subscription_status = 'active'
  OR (subscription_status = 'past_due' AND grace_until IS NOT NULL AND grace_until > NOW())
)`;

export function tenantOccupiesSlot(tenant) {
  if (!tenant) return false;
  const status = String(tenant.subscription_status || 'inactive');
  if (status === 'active') return true;
  if (status === 'past_due' && tenant.grace_until && new Date(tenant.grace_until).getTime() > Date.now()) {
    return true;
  }
  return false;
}

export function tenantHasAccess(tenant) {
  return tenantOccupiesSlot(tenant);
}

export async function countOccupyingGuilds(client) {
  const exec = client ? client.query.bind(client) : query;
  const { rows } = await exec(`SELECT COUNT(*)::int AS n FROM tenants WHERE ${OCCUPYING_SQL}`);
  return rows[0]?.n || 0;
}

export async function withBillingLock(fn) {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1)', [BILLING_ADVISORY_LOCK]);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* ignore */
    }
    throw err;
  } finally {
    client.release();
  }
}

export async function activateTenantBilling(client, tenantId, fields) {
  const id = String(tenantId);
  const {
    subscriptionStatus = 'active',
    billingSource = null,
    stripeCustomerId = null,
    stripeSubscriptionId = null,
    currentPeriodEnd = null,
    graceUntil = null,
    cancelAtPeriodEnd = false,
  } = fields || {};
  await client.query(
    `UPDATE tenants SET
       subscription_status = $2,
       billing_source = $3,
       stripe_customer_id = $4,
       stripe_subscription_id = $5,
       current_period_end = $6,
       grace_until = $7,
       cancel_at_period_end = $8
     WHERE id = $1`,
    [
      id,
      subscriptionStatus,
      billingSource,
      stripeCustomerId,
      stripeSubscriptionId,
      currentPeriodEnd,
      graceUntil,
      Boolean(cancelAtPeriodEnd),
    ]
  );
}

export async function getTenantByStripeSubscription(client, subscriptionId) {
  if (!subscriptionId) return null;
  const { rows } = await client.query(
    'SELECT * FROM tenants WHERE stripe_subscription_id = $1',
    [String(subscriptionId)]
  );
  return rows[0] || null;
}

export async function getTenantByStripeSubscriptionId(subscriptionId) {
  if (!subscriptionId) return null;
  const { rows } = await query(
    'SELECT * FROM tenants WHERE stripe_subscription_id = $1',
    [String(subscriptionId)]
  );
  return rows[0] || null;
}

async function markPlatformFlag(key) {
  await query(
    `INSERT INTO platform_state (key, data, updated_at)
     VALUES ($1, '{"done":true}'::jsonb, NOW())
     ON CONFLICT (key) DO UPDATE SET data = '{"done":true}'::jsonb, updated_at = NOW()`,
    [key]
  );
}

/** Founding seats are operator-chosen. Never auto-grant; undo the old one-shot if it already ran. */
export async function revertAutomaticFoundingSeatsOnce() {
  await markPlatformFlag('billing_grandfather_v1');
  const { rows } = await query(
    `SELECT data FROM platform_state WHERE key = 'billing_auto_grandfather_reverted_v1'`
  );
  if (rows[0]?.data?.done) return 0;
  const updated = await query(
    `UPDATE tenants
     SET subscription_status = 'inactive',
         billing_source = NULL
     WHERE billing_source = 'grandfathered'`
  );
  await markPlatformFlag('billing_auto_grandfather_reverted_v1');
  return updated.rowCount || 0;
}

export function billingPublicView(tenant, activeCount) {
  const { maxActiveGuilds, stripeSecretKey, stripePriceId } = billingEnv();
  const status = String(tenant?.subscription_status || 'inactive');
  return {
    activeCount,
    cap: maxActiveGuilds,
    tenantStatus: status,
    source: tenant?.billing_source || null,
    allowed: tenantHasAccess(tenant),
    graceUntil: tenant?.grace_until || null,
    currentPeriodEnd: tenant?.current_period_end || null,
    cancelAtPeriodEnd: Boolean(tenant?.cancel_at_period_end),
    stripeCustomer: Boolean(tenant?.stripe_customer_id),
    stripeConfigured: Boolean(stripeSecretKey && stripePriceId),
  };
}
