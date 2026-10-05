import { describe, expect, it } from 'vitest';
import {
  nonOfficerDoesNotUnlock,
  officerUnlockStoresSessionFlags,
  unlockTenantIdIsCurrentNotOther,
} from '../../patterns/settings_unlock.js';

describe('TST-ROO-083 SettingsUnlockSession marks the current tenant session and returns the officer profile', () => {
  it('Officer unlock stores session flags for the current tenant', async () => {
    const { res, session } = await officerUnlockStoresSessionFlags();
    expect(res.status).toBe(200);
    expect(session.settingsUnlocked).toBe(true);
    expect(session.settingsUnlockedTenantId).toBe(session.currentTenantId);
    expect(res.body.user).toBeTruthy();
    expect(res.body.user._sig || res.body.user.id).toBeTruthy();
  });

  it('Unlock is not stored for a different tenant', async () => {
    const { settingsUnlockedTenantId, tenantId, otherTenant, settingsUnlocked } = await unlockTenantIdIsCurrentNotOther();
    expect(settingsUnlocked).toBe(true);
    expect(settingsUnlockedTenantId).toBe(tenantId);
    expect(settingsUnlockedTenantId).not.toBe(otherTenant);
  });

  it('Non-officer does not unlock', async () => {
    const { res, session } = await nonOfficerDoesNotUnlock();
    expect(res.status).toBe(403);
    expect(session.settingsUnlocked).toBeUndefined();
  });
});
