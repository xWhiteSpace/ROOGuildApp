import { describe, expect, it } from 'vitest';
import {
  migrateAppliesNamedTables,
  originGameSettingsBackfillCopiesThenStrips,
  tenantScopedTablesKeyTenantId,
  platformStateKeyedByKeyOnly,
  tenantsIdIsGuildPk,
  schemaAppliedViaMigrate,
} from '../../patterns/schema_migrate.js';

describe('TST-ROO-208 PostgresSchemaOwnershipIsMigrateApplied owns the named tables via migrate without booting the process', () => {
  it('migrate applies the named tables', async () => {
    const r = await migrateAppliesNamedTables();
    expect(r.applied).toBe(true);
    expect(r.missing).toEqual([]);
  });

  it('a tenant-scoped operational table keys tenant_id', () => {
    const r = tenantScopedTablesKeyTenantId();
    expect(r.allOk).toBe(true);
  });

  it('platform_state is keyed by key only', () => {
    const r = platformStateKeyedByKeyOnly();
    expect(r.keyPk).toBe(true);
    expect(r.hasTenantCol).toBe(false);
  });

  it('tenants.id is the Discord guild id', () => {
    const r = tenantsIdIsGuildPk();
    expect(r.idTextPk).toBe(true);
  });

  it('schema ownership is applied by migrate on boot', async () => {
    const r = await schemaAppliedViaMigrate();
    expect(r.migrateSentSchemaFile).toBe(true);
  });

  it('Origin catalogs copy into game_settings then leave workspace keys on tenant_settings', () => {
    const r = originGameSettingsBackfillCopiesThenStrips();
    expect(r.copiesOrigin).toBe(true);
    expect(r.fillsEmptyOnly).toBe(true);
    expect(r.stripsLeftoverGameKeys).toBe(true);
  });
});
