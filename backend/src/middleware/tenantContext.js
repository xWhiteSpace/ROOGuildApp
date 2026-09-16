import { getCurrentTenantId, runWithTenant, setCachedConfig, setCachedChannels } from '../db/tenantContext.js';
import { loadTenantSettings, mergeChannelFallback, getTenant } from '../db/tenants.js';
import { resolveUserIdentity } from '../auth/identity.js';
import { tenantHasAccess } from '../db/billing.js';

const PUBLIC_PREFIXES = [
  '/auth/login',
  '/auth/callback',
  '/auth/logout',
  '/auth/me',
  '/auth/tenants',
  '/auth/select-tenant',
  '/auth/onboard',
  '/api/debug/',
  '/api/tenants/invite-url',
  '/api/billing/capacity',
  '/api/billing/webhook',
];

function isPublicPath(path) {
  if (path === '/') return true;
  return PUBLIC_PREFIXES.some((p) => path === p || path.startsWith(p));
}

export async function attachTenantContext(req, res, next) {
  try {
    const user = resolveUserIdentity(req);
    const headerTenant = req.headers['x-tenant-id'];
    let tenantId =
      req.session?.currentTenantId ||
      user?.currentTenantId ||
      (typeof headerTenant === 'string' ? headerTenant : null);

    if (headerTenant && user?.currentTenantId && String(headerTenant) !== String(user.currentTenantId)) {
      if (!req.session?.currentTenantId || String(headerTenant) !== String(req.session.currentTenantId)) {
        tenantId = req.session?.currentTenantId || user.currentTenantId;
      }
    }

    if (!tenantId) {
      if (isPublicPath(req.path)) return next();
      return next();
    }

    const { configuration, discordChannels } = await loadTenantSettings(tenantId);
    setCachedConfig(tenantId, configuration);
    setCachedChannels(tenantId, mergeChannelFallback(discordChannels));
    req.tenantId = tenantId;
    const tenant = await getTenant(tenantId);
    req.billing = tenant
      ? {
          status: tenant.subscription_status || 'inactive',
          source: tenant.billing_source || null,
          allowed: tenantHasAccess(tenant),
          graceUntil: tenant.grace_until || null,
        }
      : null;
    return runWithTenant(tenantId, () => next());
  } catch (err) {
    console.error('tenant middleware:', err.message);
    return next(err);
  }
}

export function requireTenant(req, res, next) {
  const tenantId = req.tenantId || getCurrentTenantId() || req.session?.currentTenantId;
  if (!tenantId) {
    return res.status(409).json({
      success: false,
      error: 'Select a Discord server first.',
      code: 'tenant_required',
    });
  }
  req.tenantId = tenantId;
  next();
}

export async function requireActiveSubscription(req, res, next) {
  const tenantId = req.tenantId || getCurrentTenantId() || req.session?.currentTenantId;
  if (!tenantId) {
    return res.status(409).json({
      success: false,
      error: 'Select a Discord server first.',
      code: 'tenant_required',
    });
  }
  try {
    const tenant = await getTenant(tenantId);
    if (tenantHasAccess(tenant)) return next();
    return res.status(402).json({
      success: false,
      error: 'This guild needs an active seat. Subscribe or redeem an invite code.',
      code: 'payment_required',
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}
