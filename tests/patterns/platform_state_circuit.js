import { vi } from 'vitest';
import { patterns } from './registry.js';
import { withEnv } from './envSandbox.js';
import { clearTenantCaches } from '../../backend/src/db/tenantContext.js';
import { saveOAuthGuilds } from '../../backend/src/db/oauthGuilds.js';

patterns.platform_state_circuit = 'used';
patterns.no_tenant_platform = 'used';

const hold = vi.hoisted(() => ({ writes: [] }));

vi.mock('../../backend/src/db/pool.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    query: async (sql, params = []) => {
      hold.writes.push({ sql: String(sql), params: [...params] });
      if (/SELECT data FROM platform_state/i.test(String(sql))) {
        return { rows: [{ data: { open: false } }] };
      }
      return { rows: [], rowCount: 1 };
    },
  };
});

const { getTenantStore } = await import('../../backend/src/db/database.js');

export async function discordCircuitMapsToKey() {
  return withEnv({}, async () => {
    hold.writes = [];
    clearTenantCaches();
    const db = getTenantStore();
    await db.ref('scheduler/discord_circuit').set({ open: false, until: 0 });
    const w = hold.writes.find((row) => /INSERT INTO platform_state/i.test(row.sql));
    // Real seam: key is a SQL literal 'discord_circuit'; payload is $1 jsonb
    const keyFromSql = w?.sql?.match(/VALUES\s*\(\s*'([^']+)'/i)?.[1]
      || w?.sql?.match(/key\s*=\s*'([^']+)'/i)?.[1]
      || null;
    return {
      key: keyFromSql,
      expected: 'discord_circuit',
      sql: w?.sql || '',
      write: w,
    };
  });
}

export async function platformAccessWithoutTenant() {
  return withEnv({}, async () => {
    hold.writes = [];
    clearTenantCaches();
    let err = null;
    try {
      // DatabaseHandle with null tenantId — platform path bypasses requireTenant
      const db = getTenantStore();
      await db.ref('scheduler/discord_circuit').set({ open: true });
      await db.ref('scheduler/discord_circuit').once('value');
    } catch (e) {
      err = e;
    }
    const wrote = hold.writes.some((w) => /platform_state/i.test(w.sql));
    return { proceeded: !err && wrote, error: err?.message || null };
  });
}

export async function storedRowHasNoTenantId() {
  return withEnv({}, async () => {
    hold.writes = [];
    clearTenantCaches();
    const db = getTenantStore();
    await db.ref('scheduler/discord_circuit').set({ open: false });
    const w = hold.writes.find((row) => /INSERT INTO platform_state/i.test(row.sql));
    return {
      sql: w?.sql || '',
      params: w?.params || [],
      colocatedKeyOnly: Boolean(
        w
        && /'discord_circuit'/i.test(w.sql)
        && !/tenant_id/i.test(w.sql)
        && (w.params || []).length <= 1
      ),
    };
  });
}

export async function anotherPlatformKeyUsesPlatformState() {
  return withEnv({}, async () => {
    hold.writes = [];
    await saveOAuthGuilds('999888777666555444', [{ id: 'g1', name: 'G', permissions: '0' }]);
    const w = hold.writes.find((row) => /INSERT INTO platform_state/i.test(row.sql));
    return {
      table: 'platform_state',
      key: w?.params?.[0],
      notJsonDocs: !(w && /json_docs/i.test(w.sql)),
      notPerGuildTable: Boolean(w && /platform_state/i.test(w.sql)),
    };
  });
}
