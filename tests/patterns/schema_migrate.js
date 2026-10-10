import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { vi } from 'vitest';
import { patterns } from './registry.js';

patterns.schema_migrate = 'used';

const hold = vi.hoisted(() => ({ sql: null, queries: [] }));

vi.mock('../../backend/src/db/pool.js', () => ({
  getPool: () => ({
    query: async (sql) => {
      hold.sql = String(sql);
      hold.queries.push(String(sql));
      return { rows: [], rowCount: 0 };
    },
  }),
  query: async (sql) => {
    hold.queries.push(String(sql));
    return { rows: [], rowCount: 0 };
  },
}));

vi.mock('../../backend/src/db/billing.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    revertAutomaticFoundingSeatsOnce: async () => 0,
  };
});

const { migrate } = await import('../../backend/src/db/migrate.js');

const SCHEMA_PATH = join(dirname(fileURLToPath(import.meta.url)), '../../backend/src/db/schema.sql');

export async function migrateAppliesNamedTables() {
  hold.sql = null;
  hold.queries = [];
  await migrate();
  const sql = hold.sql || '';
  const required = [
    'tenants',
    'invite_codes',
    'tenant_settings',
    'members',
    'auction_requests',
    'past_auction_awards',
    'loot_history',
    'attendance_commitments',
    'schedule_instances',
    'special_events',
    'json_docs',
    'platform_state',
    'game_settings',
  ];
  const missing = required.filter((t) => !new RegExp(`CREATE TABLE IF NOT EXISTS ${t}\\b`, 'i').test(sql));
  return { applied: missing.length === 0, missing, sqlLen: sql.length };
}

export function originGameSettingsBackfillCopiesThenStrips() {
  const sql = readFileSync(SCHEMA_PATH, 'utf8');
  const originInsert = sql.match(/INSERT INTO game_settings[\s\S]*?FROM tenant_settings/i)?.[0] || '';
  return {
    copiesOrigin: /INSERT INTO game_settings[\s\S]*'ragnarok-origin'[\s\S]*FROM tenant_settings/i.test(sql),
    leftoverTenantCatalogsWin: /ON CONFLICT \(tenant_id, game_id\) DO UPDATE\s+SET configuration = EXCLUDED\.configuration/i.test(sql)
      && !/WHERE COALESCE\(game_settings\.configuration, '\{\}'::jsonb\) = '\{\}'::jsonb/i.test(sql),
    stripsLeftoverGameKeys: /WHERE \(configuration - 'guildDisplayName'[\s\S]*<> '\{\}'::jsonb/i.test(sql),
    noR3Insert: originInsert.length > 0 && !/'ragnarok-3'/.test(originInsert),
  };
}

export function tenantScopedTablesKeyTenantId() {
  const sql = readFileSync(SCHEMA_PATH, 'utf8');
  const tables = [
    'members',
    'auction_requests',
    'past_auction_awards',
    'loot_history',
    'attendance_commitments',
    'schedule_instances',
    'special_events',
    'json_docs',
    'tenant_settings',
    'game_settings',
  ];
  const details = tables.map((t) => {
    const block = sql.match(new RegExp(`CREATE TABLE IF NOT EXISTS ${t}[\\s\\S]*?;`, 'i'))?.[0] || '';
    const hasTenantFk = /tenant_id TEXT NOT NULL REFERENCES tenants\(id\)/i.test(block)
      || /tenant_id TEXT PRIMARY KEY REFERENCES tenants\(id\)/i.test(block);
    const pkHasTenant = /PRIMARY KEY \(tenant_id/i.test(block)
      || /tenant_id TEXT PRIMARY KEY/i.test(block);
    return { table: t, hasTenantFk, pkHasTenant, ok: hasTenantFk && pkHasTenant };
  });
  return { details, allOk: details.every((d) => d.ok) };
}

export function platformStateKeyedByKeyOnly() {
  const sql = readFileSync(SCHEMA_PATH, 'utf8');
  const block = sql.match(/CREATE TABLE IF NOT EXISTS platform_state[\s\S]*?;/i)?.[0] || '';
  return {
    block,
    keyPk: /key TEXT PRIMARY KEY/i.test(block),
    noTenantInPk: !/PRIMARY KEY \(.*tenant_id/i.test(block) && !/tenant_id/i.test(block.split('PRIMARY KEY')[0] + 'PRIMARY KEY'),
    hasTenantCol: /tenant_id/i.test(block),
  };
}

export function tenantsIdIsGuildPk() {
  const sql = readFileSync(SCHEMA_PATH, 'utf8');
  const block = sql.match(/CREATE TABLE IF NOT EXISTS tenants[\s\S]*?;/i)?.[0] || '';
  return {
    block,
    idTextPk: /id TEXT PRIMARY KEY/i.test(block),
    honesty: 'tenants.id is the Discord guild id primary key (TEXT PK); documented by schema + createTenant callers',
  };
}

export async function schemaAppliedViaMigrate() {
  hold.sql = null;
  await migrate();
  const fileSql = readFileSync(SCHEMA_PATH, 'utf8');
  return {
    migrateSentSchemaFile: hold.sql === fileSql,
    honesty: 'migrate() reads schema.sql and applies via pool.query — no index.js boot',
  };
}
