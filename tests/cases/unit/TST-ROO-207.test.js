import { describe, expect, it } from 'vitest';
import {
  mismatchedHeaderDoesNotReplaceSession,
  headerSeedsWhenNoSession,
} from '../../patterns/header_seed.js';

describe('TST-ROO-207 XTenantIdDoesNotOverrideSession keeps the session tenant when the header mismatches', () => {
  it('a mismatched x-tenant-id does not replace the session tenant', async () => {
    const r = await mismatchedHeaderDoesNotReplaceSession();
    expect(r.tenantId).toBe('SESSION');
  });

  it('the header seeds a tenant only when no session tenant is established', async () => {
    const r = await headerSeedsWhenNoSession();
    expect(r.tenantId).toBe('HEADER');
  });
});
