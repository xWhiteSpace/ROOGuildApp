import { vi } from 'vitest';
import { patterns } from './registry.js';
import { withEnv } from './envSandbox.js';
import { clearTenantCaches } from '../../backend/src/db/tenantContext.js';

patterns.header_seed = 'used';

vi.mock('../../backend/src/db/tenants.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    loadTenantSettings: async () => ({
      configuration: { timezone: 'Asia/Manila' },
      discordChannels: {},
    }),
    getTenant: async (id) => (id ? {
      id: String(id),
      subscription_status: 'active',
      billing_source: 'invite',
    } : null),
    mergeChannelFallback: (c) => c || {},
  };
});

vi.mock('../../backend/src/auth/identity.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    resolveUserIdentity: (req) => req._identity || null,
  };
});

const { attachTenantContext } = await import('../../backend/src/middleware/tenantContext.js');

async function attach({ session, identity, header }) {
  clearTenantCaches();
  const req = {
    path: '/api/foo',
    headers: header ? { 'x-tenant-id': header } : {},
    session: session || {},
    _identity: identity,
  };
  const res = { status() { return this; }, json() { return this; } };
  await attachTenantContext(req, res, () => {});
  return { tenantId: req.tenantId || null };
}

export function mismatchedHeaderDoesNotReplaceSession() {
  return withEnv({}, () => attach({
    session: { currentTenantId: 'SESSION' },
    identity: { id: 'u1', currentTenantId: 'SESSION' },
    header: 'HEADER',
  }));
}

export function headerSeedsWhenNoSession() {
  return withEnv({}, () => attach({
    session: {},
    identity: null,
    header: 'HEADER',
  }));
}
