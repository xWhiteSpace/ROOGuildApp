/** Billing cap and Stripe. None of these are fatal at boot — invite codes still work. */

function trim(value) {
  return String(value || '').trim();
}

export const BILLING_ADVISORY_LOCK = 8202020;

export function billingEnv() {
  const cap = Number(process.env.BILLING_MAX_ACTIVE_GUILDS);
  const graceDays = Number(process.env.BILLING_PAST_DUE_GRACE_DAYS);
  return {
    stripeSecretKey: trim(process.env.STRIPE_SECRET_KEY),
    stripeWebhookSecret: trim(process.env.STRIPE_WEBHOOK_SECRET),
    stripePriceId: trim(process.env.STRIPE_PRICE_ID),
    maxActiveGuilds: Number.isFinite(cap) && cap > 0 ? cap : 20,
    pastDueGraceDays: Number.isFinite(graceDays) && graceDays >= 0 ? graceDays : 3,
  };
}
