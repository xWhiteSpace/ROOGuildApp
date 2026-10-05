import { vi } from 'vitest';
import { patterns } from './registry.js';
import { withEnv } from './envSandbox.js';
import { WORKSPACE_DEFAULTS } from '../../backend/src/config/workspaceDefaults.js';
import { getGuildNowParts, formatGuildDate } from '../../backend/src/utils/guildTime.js';
import { readFileSync } from 'node:fs';

patterns.workspace_defaults = 'used';
patterns.format_to_parts = 'used';

const hold = vi.hoisted(() => ({ inserts: [] }));

vi.mock('../../backend/src/db/pool.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    query: async (sql, params = []) => {
      if (/INSERT INTO tenant_settings/i.test(String(sql))) {
        hold.inserts.push({ sql: String(sql), params: [...params] });
      }
      if (/INSERT INTO tenants/i.test(String(sql))) return { rows: [] };
      if (/FROM tenants WHERE id/i.test(String(sql))) {
        return {
          rows: [{
            id: String(params[0]),
            display_name: 'G',
            onboarded: true,
            subscription_status: 'inactive',
            billing_source: null,
            enabled_games: [],
          }],
        };
      }
      return { rows: [] };
    },
  };
});

const { createTenant } = await import('../../backend/src/db/tenants.js');

export function workspaceDefaultsShape() {
  return { ...WORKSPACE_DEFAULTS };
}

export function omittedTimezoneDefaultsManila() {
  const parts = getGuildNowParts(undefined, new Date('2026-10-07T12:00:00Z'));
  return { parts, usedDefault: true };
}

export function providedTimezoneIsUsed() {
  const parts = getGuildNowParts('America/New_York', new Date('2026-10-07T12:00:00Z'));
  const date = formatGuildDate(new Date('2026-10-07T12:00:00Z'), 'America/New_York');
  return { parts, date, timezone: 'America/New_York' };
}

export function formattingUsesFormatToParts() {
  const src = readFileSync(new URL('../../backend/src/utils/guildTime.js', import.meta.url), 'utf8');
  return {
    usesFormatToParts: /formatToParts/.test(src),
    bansToIsoDateKeys: /never toISOString/.test(src) || !/toISOString\(\)\.slice\(0,\s*10\)/.test(src),
    sample: formatGuildDate(new Date('2026-10-07T12:00:00Z'), 'Asia/Manila'),
  };
}

export async function seededSettingsPersistDefaults() {
  return withEnv({}, async () => {
    hold.inserts = [];
    await createTenant({ id: 'seed-guild-1', displayName: 'Seed', onboarded: true });
    const row = hold.inserts[0];
    const config = row ? JSON.parse(row.params[1]) : null;
    return {
      persisted: Boolean(row),
      timezone: config?.timezone,
      guildDisplayName: config?.guildDisplayName,
      guildLogoUrl: config?.guildLogoUrl,
      adminRoles: config?.adminRoles,
    };
  });
}
