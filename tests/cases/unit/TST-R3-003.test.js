import { describe, expect, it } from 'vitest';
import { r3SettingsSaveDoesNotTouchOrigin } from '../../patterns/r3_isolation.js';

describe('TST-R3-003 R3 settings save does not mutate Origin game_settings or workspace', () => {
  it('writes game_settings for ragnarok-3 only and omits workspace keys', async () => {
    const r = await r3SettingsSaveDoesNotTouchOrigin();
    expect(r.r3GameWrites).toBeGreaterThan(0);
    expect(r.originGameWrites).toBe(0);
    expect(r.workspaceWrites).toBe(0);
    expect(r.r3HasJobs).toBe(true);
    expect(r.r3HasTimezone).toBe(false);
  });
});
