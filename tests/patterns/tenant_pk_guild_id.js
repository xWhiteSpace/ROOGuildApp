import { vi } from 'vitest';
import * as pool from '../../backend/src/db/pool.js';
import { createTenant, getTenant } from '../../backend/src/db/tenants.js';
import { patterns } from './registry.js';
import { withEnv } from './envSandbox.js';

patterns.tenant_pk_guild_id = 'used';
patterns.identity_key_equality = 'used';

function memoryTenantDb() {
  const tenants = new Map();
  return vi.spyOn(pool, 'query').mockImplementation(async (text, params = []) => {
    const sql = String(text);
    if (/INSERT INTO tenants/i.test(sql)) {
      const [id, displayName, ownerDiscordId, plan, isPlatformOwner, onboarded] = params;
      const row = {
        id: String(id),
        display_name: displayName,
        owner_discord_id: ownerDiscordId,
        plan,
        is_platform_owner: isPlatformOwner,
        onboarded: Boolean(onboarded),
        created_at: new Date().toISOString(),
        logo_url: null,
        enabled_games: [],
        subscription_status: 'inactive',
        billing_source: null,
      };
      const prior = tenants.get(row.id);
      tenants.set(row.id, prior ? { ...prior, ...row, onboarded: prior.onboarded || row.onboarded } : row);
      return { rows: [] };
    }
    if (/INSERT INTO tenant_settings/i.test(sql) || /UPDATE tenant_settings/i.test(sql)) {
      return { rows: [] };
    }
    if (/FROM tenants WHERE id = \$1/i.test(sql)) {
      const row = tenants.get(String(params[0]));
      return { rows: row ? [row] : [] };
    }
    if (/UPDATE tenants/i.test(sql)) {
      return { rows: [] };
    }
    return { rows: [] };
  });
}

export async function guildIdBecomesTenantPk(guildId = '111222333444555666') {
  return withEnv({}, async () => {
    const spy = memoryTenantDb();
    try {
      const created = await createTenant({ id: guildId, displayName: 'Raid Guild', onboarded: true });
      return { created, guildId: String(guildId) };
    } finally {
      spy.mockRestore();
    }
  });
}

export async function refuseNonGuildTenantPk() {
  return withEnv({}, async () => {
    const spy = memoryTenantDb();
    try {
      const missing = await getTenant(null);
      const empty = await getTenant('');
      const unknown = await getTenant('synthetic-not-created');
      return { missing, empty, unknown };
    } finally {
      spy.mockRestore();
    }
  });
}

export async function roundTripTenantByGuildId(guildId = '999888777666555444') {
  return withEnv({}, async () => {
    const spy = memoryTenantDb();
    try {
      const created = await createTenant({ id: guildId, displayName: 'Round Trip', onboarded: true });
      const loaded = await getTenant(guildId);
      return { created, loaded, guildId: String(guildId) };
    } finally {
      spy.mockRestore();
    }
  });
}
