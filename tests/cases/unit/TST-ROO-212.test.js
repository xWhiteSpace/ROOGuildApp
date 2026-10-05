import { describe, expect, it } from 'vitest';
import {
  isolationScriptName,
  unsetDatabaseUrlSkipsCleanly,
  leakAndCleanupBulletsSkipped,
} from '../../patterns/isolation_skip.js';

describe('TST-ROO-212 TenantIsolationCheckScript skips cleanly without DATABASE_URL', () => {
  it('the check is npm run test:isolation', () => {
    const r = isolationScriptName();
    expect(r.script).toBe('node src/db/isolationCheck.js');
    expect(r.command).toBe('npm run test:isolation');
  });

  it('an unset DATABASE_URL skips cleanly', () => {
    const r = unsetDatabaseUrlSkipsCleanly();
    expect(r.skipped).toBe(true);
    expect(r.notPass).toBe(true);
    expect(r.notIsolationFailed).toBe(true);
    expect(r.exitCode).toBe(0);
  });

  it('B cannot see A\'s members or web_requests', () => {
    const r = leakAndCleanupBulletsSkipped();
    expect(r.skipped).toContain('B cannot see A\'s members or web_requests');
  });

  it('a leak is ISOLATION FAILED and non-zero', () => {
    const r = leakAndCleanupBulletsSkipped();
    expect(r.sourceThrowsIsolationFailed).toBe(true);
  });

  it('both tenants are removed after the check', () => {
    const r = leakAndCleanupBulletsSkipped();
    expect(r.sourceCleansBothTenants).toBe(true);
  });
});
