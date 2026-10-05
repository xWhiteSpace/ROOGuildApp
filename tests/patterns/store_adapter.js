import { vi } from 'vitest';
import { patterns } from './registry.js';
import { withEnv } from './envSandbox.js';
import { runWithTenant, clearTenantCaches } from '../../backend/src/db/tenantContext.js';

patterns.store_adapter = 'used';
patterns.dedicated_tables = 'used';
patterns.json_docs_root = 'used';
patterns.als_bind = 'used';

const hold = vi.hoisted(() => ({ writes: [] }));

vi.mock('../../backend/src/db/pool.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    query: async (sql, params = []) => {
      hold.writes.push({ sql: String(sql), params: [...params] });
      if (/SELECT configuration FROM tenant_settings/i.test(String(sql))) {
        return { rows: [{ configuration: { timezone: 'Asia/Manila' } }] };
      }
      if (/SELECT data FROM json_docs/i.test(String(sql))) {
        return { rows: [] };
      }
      if (/SELECT .* FROM members/i.test(String(sql))) {
        return { rows: [] };
      }
      if (/SELECT .* FROM attendance_commitments/i.test(String(sql))) {
        return { rows: [] };
      }
      return { rows: [], rowCount: 1 };
    },
  };
});

const { getTenantStore, getTenantStoreFor, QueryRef } = await import('../../backend/src/db/database.js');

function lastMatching(re) {
  return [...hold.writes].reverse().find((w) => re.test(w.sql)) || null;
}

export function getTenantStoreBindsAls() {
  return withEnv({}, async () => {
    clearTenantCaches();
    return runWithTenant('T', async () => {
      const store = getTenantStore();
      return { bound: store._tenantId === 'T', tenantId: store._tenantId };
    });
  });
}

export function getTenantStoreForBindsExplicit() {
  clearTenantCaches();
  const store = getTenantStoreFor('E');
  return { bound: store._tenantId === 'E', tenantId: store._tenantId };
}

export async function mappedCollectionsUseDedicatedTables() {
  return withEnv({}, async () => {
    hold.writes = [];
    clearTenantCaches();
    await runWithTenant('T', async () => {
      const store = getTenantStore();
      await store.ref('auction/members/u1').set({ name: 'Ada' });
      await store.ref('auction/web_requests/r1').set({ item: 'x' });
      await store.ref('auction/past_auctions/p1').set({ item: 'y' });
      await store.ref('auction/loot_history/l1').set({ item: 'z' });
      await store.ref('scheduler/instances/i1').set({ title: 'Raid' });
      await store.ref('scheduler/special_events/s1').set({ title: 'Special' });
    });
    const tables = hold.writes
      .map((w) => {
        const m = w.sql.match(/INSERT INTO (\w+)/i);
        return m ? m[1] : null;
      })
      .filter(Boolean);
    const usedJsonDocs = tables.includes('json_docs');
    return {
      tables: [...new Set(tables)],
      usedJsonDocs,
      dedicatedOnly: !usedJsonDocs && tables.length > 0,
    };
  });
}

export async function dedicatedRowStampsTenantId() {
  return withEnv({}, async () => {
    hold.writes = [];
    clearTenantCaches();
    await runWithTenant('T', async () => {
      await getTenantStore().ref('auction/members/u9').set({ displayName: 'Bo' });
    });
    const w = lastMatching(/INSERT INTO members/i);
    return { stamped: Boolean(w && w.params[0] === 'T'), write: w };
  });
}

export async function commitmentsMapToAttendanceCommitments() {
  return withEnv({}, async () => {
    hold.writes = [];
    clearTenantCaches();
    await runWithTenant('T', async () => {
      await getTenantStore().ref('attendance/commitments/2026-10-07_evt/u1').set({ status: 'Confirmed' });
    });
    const w = lastMatching(/INSERT INTO attendance_commitments/i);
    return { table: 'attendance_commitments', hit: Boolean(w), write: w };
  });
}

export async function settingsMapToTenantSettingsConfiguration() {
  return withEnv({}, async () => {
    hold.writes = [];
    clearTenantCaches();
    await runWithTenant('T', async () => {
      await getTenantStore().ref('settings/configuration').set({ timezone: 'Asia/Tokyo' });
    });
    const w = lastMatching(/INSERT INTO tenant_settings/i);
    return {
      hit: Boolean(w),
      usesConfigurationCol: Boolean(w && /configuration/i.test(w.sql)),
      write: w,
    };
  });
}

export async function otherNestedUsesJsonDocsRoot() {
  return withEnv({}, async () => {
    hold.writes = [];
    clearTenantCaches();
    await runWithTenant('T', async () => {
      await getTenantStore().ref('compositions/board/tab1').set({ slots: {} });
    });
    const w = lastMatching(/INSERT INTO json_docs/i);
    const pathParam = w?.params?.[1];
    return {
      hit: Boolean(w),
      docRoot: pathParam,
      expectedRoot: 'compositions/board',
    };
  });
}

export function adapterOperationsAvailable() {
  const store = getTenantStoreFor('E');
  const ref = store.ref('auction/members');
  return {
    once: typeof ref.once === 'function',
    set: typeof ref.set === 'function',
    update: typeof ref.update === 'function',
    remove: typeof ref.remove === 'function',
    transaction: typeof ref.transaction === 'function',
    push: typeof ref.push === 'function',
    child: typeof ref.child === 'function',
    isQueryRef: ref instanceof QueryRef || ref.constructor?.name === 'QueryRef',
  };
}

export async function writeNoTenantRefused() {
  return withEnv({}, async () => {
    clearTenantCaches();
    let err = null;
    try {
      await getTenantStore().ref('auction/members/u1').set({ x: 1 });
    } catch (e) {
      err = e;
    }
    return { refused: Boolean(err), message: err?.message || null };
  });
}
