import { vi } from 'vitest';
import { patterns } from './registry.js';
import {
  getCachedOnboardedTenants,
  setCachedOnboardedTenants,
  invalidateOnboardedTenants,
  setCachedConfig,
  setCachedChannels,
  clearTenantCaches,
} from '../../backend/src/db/tenantContext.js';

patterns.onboarded_list_cache = 'used';
patterns.settings_cache = 'used';
patterns.skip_no_access = 'used';

const access = vi.hoisted(() => ({ fn: null }));

vi.mock('../../backend/src/db/billing.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    tenantHasAccess: (tenant) => (access.fn ? access.fn(tenant) : true),
  };
});

const tenants = await import('../../backend/src/db/tenants.js');
const billing = await import('../../backend/src/db/billing.js');
const pool = await import('../../backend/src/db/pool.js');

function seedTenantCaches(rows) {
  setCachedOnboardedTenants(rows);
  for (const t of rows) {
    clearTenantCaches(t.id);
    setCachedConfig(t.id, { cached: true, id: t.id });
    setCachedChannels(t.id, { genroomId: `ch-${t.id}` });
  }
}

export async function populatedListCacheReused() {
  access.fn = () => true;
  const cached = [{ id: 't-cached-1' }, { id: 't-cached-2' }];
  seedTenantCaches(cached);
  const querySpy = vi.spyOn(pool, 'query').mockImplementation(async () => {
    throw new Error('listOnboardedTenants must not hit the database when cache is warm');
  });
  const seen = [];
  try {
    await tenants.forEachOnboardedTenant(async (tenant) => { seen.push(tenant.id); });
    return {
      sameRef: getCachedOnboardedTenants() === cached,
      seen,
      queryCalls: querySpy.mock.calls.length,
    };
  } finally {
    querySpy.mockRestore();
  }
}

export async function cachedConfigSkipsLoadSettings() {
  access.fn = () => true;
  const tenant = { id: 't-settings-cache' };
  seedTenantCaches([tenant]);
  const querySpy = vi.spyOn(pool, 'query').mockImplementation(async () => {
    throw new Error('loadTenantSettings must not query when config+channels cached');
  });
  try {
    await tenants.forEachOnboardedTenant(async () => {});
    return { queryCalls: querySpy.mock.calls.length, ok: true };
  } finally {
    querySpy.mockRestore();
  }
}

export function lifecycleClearsOnboardedListCache() {
  setCachedOnboardedTenants([{ id: 't-life' }]);
  const before = getCachedOnboardedTenants();
  invalidateOnboardedTenants();
  const after = getCachedOnboardedTenants();
  const sources = {
    createTenant: tenants.createTenant.toString().includes('invalidateOnboardedTenants'),
    markTenantOnboarded: tenants.markTenantOnboarded.toString().includes('invalidateOnboardedTenants'),
    activateTenantBilling: billing.activateTenantBilling.toString().includes('invalidateOnboardedTenants'),
    revertAutomaticFoundingSeatsOnce: billing.revertAutomaticFoundingSeatsOnce.toString().includes('invalidateOnboardedTenants'),
  };
  return { beforeLen: before?.length ?? null, after, sources };
}

export async function tenantWithoutAccessSkipped() {
  const rows = [{ id: 't-ok' }, { id: 't-blocked' }];
  seedTenantCaches(rows);
  access.fn = (t) => t.id !== 't-blocked';
  const seen = [];
  await tenants.forEachOnboardedTenant(async (tenant) => { seen.push(tenant.id); });
  return { seen };
}
