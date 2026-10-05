import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { patterns } from './registry.js';
import { withEnv } from './envSandbox.js';

patterns.isolation_skip = 'used';

const BACKEND_PKG = new URL('../../backend/package.json', import.meta.url);
const SCRIPT = new URL('../../backend/src/db/isolationCheck.js', import.meta.url);

export function isolationScriptName() {
  const pkg = JSON.parse(readFileSync(BACKEND_PKG, 'utf8'));
  return {
    script: pkg.scripts?.['test:isolation'],
    // Real seam: lives on backend package as `npm run test:isolation` (from backend cwd)
    // Root package.json has no test:isolation — assert backend script.
    command: 'npm run test:isolation',
    honesty: 'Script is backend/package.json "test:isolation"; run via npm --prefix backend run test:isolation',
  };
}

export function unsetDatabaseUrlSkipsCleanly() {
  return withEnv({ DATABASE_URL: '' }, () => {
    const result = spawnSync(process.execPath, [SCRIPT.pathname], {
      env: { ...process.env, DATABASE_URL: '' },
      encoding: 'utf8',
      cwd: new URL('../../backend', import.meta.url).pathname,
    });
    const out = `${result.stdout || ''}${result.stderr || ''}`;
    return {
      exitCode: result.status,
      out,
      skipped: /SKIP:\s*DATABASE_URL is not set/i.test(out),
      notPass: !/\bPASS\b/.test(out),
      notIsolationFailed: !/ISOLATION FAILED/i.test(out),
    };
  });
}

export function leakAndCleanupBulletsSkipped() {
  const src = readFileSync(SCRIPT, 'utf8');
  return {
    skipped: [
      'B cannot see A\'s members or web_requests',
      'a leak is ISOLATION FAILED and non-zero',
      'both tenants are removed after the check',
    ],
    reason: 'Those bullets need a live DATABASE_URL / throwaway DB; not connected per instructions.',
    // Source-level evidence without running against a DB:
    sourceThrowsIsolationFailed: /ISOLATION FAILED/.test(src),
    sourceCleansBothTenants: /DELETE FROM tenants WHERE id = ANY/.test(src)
      && /isolation-guild-a/.test(src)
      && /isolation-guild-b/.test(src),
  };
}
