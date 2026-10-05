import { describe, expect, it } from 'vitest';
import {
  populatedListCacheReused,
  cachedConfigSkipsLoadSettings,
  lifecycleClearsOnboardedListCache,
  tenantWithoutAccessSkipped,
} from '../../patterns/onboarded_list_cache.js';

describe('TST-ROO-110 CachedOnboardedTenants reuses the list and settings caches and clears the list on lifecycle events', () => {
  it('A populated list cache is reused', async () => {
    const r = await populatedListCacheReused();
    expect(r.sameRef).toBe(true);
    expect(r.seen).toEqual(['t-cached-1', 't-cached-2']);
    expect(r.queryCalls).toBe(0);
  });

  it('Cached configuration and channels skip loadTenantSettings', async () => {
    const r = await cachedConfigSkipsLoadSettings();
    expect(r.ok).toBe(true);
    expect(r.queryCalls).toBe(0);
  });

  it('Lifecycle events clear the onboarded list cache', () => {
    const r = lifecycleClearsOnboardedListCache();
    expect(r.beforeLen).toBe(1);
    expect(r.after).toBeNull();
    expect(Object.values(r.sources).every(Boolean)).toBe(true);
  });

  it('A tenant without access is skipped', async () => {
    const r = await tenantWithoutAccessSkipped();
    expect(r.seen).toEqual(['t-ok']);
  });
});
