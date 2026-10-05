import { describe, expect, it } from 'vitest';
import {
  sessionTenantPreferred,
  signedProfileWhenNoSession,
  headerWhenNoSessionNoProfile,
  loadsSettingsCache,
  remainderInsideRunWithTenant,
  operationalRowStamped,
  writeNoTenantRefused,
  publicPathNoTenantProceeds,
  boundRouteNoTenant409,
} from '../../patterns/tenant_bind.js';

describe('TST-ROO-206 AttachTenantContextOrder binds session then profile then header and runs the chain in ALS', () => {
  it('session currentTenantId is preferred', async () => {
    const r = await sessionTenantPreferred();
    expect(r.tenantId).toBe('S');
  });

  it('signed profile is used when there is no session tenant', async () => {
    const r = await signedProfileWhenNoSession();
    expect(r.tenantId).toBe('P');
  });

  it('x-tenant-id is used only when no session tenant and no signed profile', async () => {
    const r = await headerWhenNoSessionNoProfile();
    expect(r.tenantId).toBe('H');
  });

  it('a present tenant loads the request-scoped settings cache', async () => {
    const r = await loadsSettingsCache();
    expect(r.loadedFor).toBe('T-cache');
  });

  it('the rest of the handler runs inside runWithTenant', async () => {
    const r = await remainderInsideRunWithTenant();
    expect(r.insideTenant).toBe('T-als');
  });

  it('an operational row is stamped with the bound tenant_id', async () => {
    const r = await operationalRowStamped();
    expect(r.stamped).toBe(true);
  });

  it('a store write with no tenant in context is refused', async () => {
    const r = await writeNoTenantRefused();
    expect(r.refused).toBe(true);
    expect(r.message).toMatch(/No tenant in context/i);
  });

  it('a public path with no tenant proceeds', async () => {
    const r = await publicPathNoTenantProceeds();
    expect(r.nextCalled).toBe(true);
    expect(r.tenantId).toBeNull();
  });

  it('a bound route with no tenant is 409 tenant_required', async () => {
    const r = await boundRouteNoTenant409();
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('tenant_required');
    expect(r.nextCalled).toBe(false);
  });
});
