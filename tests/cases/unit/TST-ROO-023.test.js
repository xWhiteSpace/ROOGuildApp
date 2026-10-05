import { describe, expect, it } from 'vitest';
import {
  guildIdBecomesTenantPk,
  refuseNonGuildTenantPk,
  roundTripTenantByGuildId,
} from '../../patterns/tenant_pk_guild_id.js';

describe('TST-ROO-023 TenantIdentityKey treats Discord guild id as tenants.id PK', () => {
  it('Guild id string becomes tenants.id', async () => {
    const { created, guildId } = await guildIdBecomesTenantPk('111222333444555666');
    expect(created.id).toBe(guildId);
    expect(created.id).toBe('111222333444555666');
  });

  it('Non-guild synthetic id refused as tenant PK', async () => {
    const { missing, empty, unknown } = await refuseNonGuildTenantPk();
    expect(missing).toBeNull();
    expect(empty).toBeNull();
    expect(unknown).toBeNull();
  });

  it('Round-trip: load by guild id returns same tenant', async () => {
    const { created, loaded, guildId } = await roundTripTenantByGuildId('999888777666555444');
    expect(loaded).toMatchObject({ id: guildId });
    expect(loaded.id).toBe(created.id);
  });
});
