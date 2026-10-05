import { describe, expect, it } from 'vitest';
import {
  getTenantStoreBindsAls,
  getTenantStoreForBindsExplicit,
  mappedCollectionsUseDedicatedTables,
  dedicatedRowStampsTenantId,
  commitmentsMapToAttendanceCommitments,
  settingsMapToTenantSettingsConfiguration,
  otherNestedUsesJsonDocsRoot,
  adapterOperationsAvailable,
  writeNoTenantRefused,
} from '../../patterns/store_adapter.js';

describe('TST-ROO-209 TenantStorePathMapping routes collections to dedicated tables and refuses unbound writes', () => {
  it('getTenantStore binds the ALS tenant', async () => {
    const r = await getTenantStoreBindsAls();
    expect(r.bound).toBe(true);
  });

  it('getTenantStoreFor binds the explicit tenant', () => {
    const r = getTenantStoreForBindsExplicit();
    expect(r.bound).toBe(true);
  });

  it('mapped collection paths use dedicated tables, not json_docs', async () => {
    const r = await mappedCollectionsUseDedicatedTables();
    expect(r.usedJsonDocs).toBe(false);
    expect(r.dedicatedOnly).toBe(true);
  });

  it('a dedicated collection row stores tenant_id', async () => {
    const r = await dedicatedRowStampsTenantId();
    expect(r.stamped).toBe(true);
  });

  it('attendance/commitments maps to attendance_commitments', async () => {
    const r = await commitmentsMapToAttendanceCommitments();
    expect(r.hit).toBe(true);
  });

  it('settings/configuration maps to tenant_settings.configuration', async () => {
    const r = await settingsMapToTenantSettingsConfiguration();
    expect(r.hit).toBe(true);
    expect(r.usesConfigurationCol).toBe(true);
  });

  it('any other nested tree uses json_docs rooted at the first two segments', async () => {
    const r = await otherNestedUsesJsonDocsRoot();
    expect(r.hit).toBe(true);
    expect(r.docRoot).toBe('compositions/board');
  });

  it('the store exposes the Firebase-style adapter operations', () => {
    const r = adapterOperationsAvailable();
    expect(r.once && r.set && r.update && r.remove && r.transaction && r.push && r.child).toBe(true);
  });

  it('a write with no tenant in context is refused', async () => {
    const r = await writeNoTenantRefused();
    expect(r.refused).toBe(true);
  });
});
