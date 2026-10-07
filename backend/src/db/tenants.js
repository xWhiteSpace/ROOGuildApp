import { query } from './pool.js';
import {
  getCachedChannels,
  getCachedConfig,
  getCachedOnboardedTenants,
  getCurrentTenantId,
  hasCachedChannels,
  hasCachedConfig,
  invalidateOnboardedTenants,
  runWithGame,
  runWithTenant,
  setCachedChannels,
  setCachedConfig,
  setCachedOnboardedTenants,
} from './tenantContext.js';
import { DEFAULT_CONFIGURATION } from '../config/defaultConfiguration.js';
import { parseEnabledGames, RAGNAROK_ORIGIN_ID } from '../games/catalog.js';
import { tenantHasAccess } from './billing.js';
import { mergeGameConfiguration, omitWorkspaceConfig, pickWorkspaceConfig } from '../config/gameConfiguration.js';
import { WORKSPACE_DEFAULTS } from '../config/workspaceDefaults.js';

const TENANT_COLUMNS = `id, display_name, owner_discord_id, plan, is_platform_owner, onboarded, created_at, logo_url, enabled_games,
  stripe_customer_id, stripe_subscription_id, subscription_status, current_period_end, billing_source, grace_until, cancel_at_period_end`;

export async function listTenants() {
  const { rows } = await query(
    `SELECT ${TENANT_COLUMNS} FROM tenants ORDER BY created_at ASC`
  );
  return rows;
}

export async function listOnboardedTenants() {
  const { rows } = await query(
    `SELECT ${TENANT_COLUMNS} FROM tenants WHERE onboarded = TRUE`
  );
  return rows;
}

export async function getTenant(id) {
  if (!id) return null;
  const { rows } = await query(
    `SELECT ${TENANT_COLUMNS} FROM tenants WHERE id = $1`,
    [String(id)]
  );
  return rows[0] || null;
}

export async function getTenantsByIds(ids) {
  const list = (ids || []).map(String).filter(Boolean);
  if (!list.length) return [];
  const { rows } = await query(
    `SELECT ${TENANT_COLUMNS} FROM tenants WHERE id = ANY($1::text[])`,
    [list]
  );
  return rows;
}

export async function getTenantsForMember(discordUserId) {
  if (!discordUserId) return [];
  const { rows } = await query(
    `SELECT DISTINCT t.id, t.display_name, t.owner_discord_id, t.plan, t.is_platform_owner, t.onboarded, t.created_at, t.logo_url, t.enabled_games,
            t.stripe_customer_id, t.stripe_subscription_id, t.subscription_status, t.current_period_end, t.billing_source, t.grace_until, t.cancel_at_period_end
     FROM tenants t
     INNER JOIN members m ON m.tenant_id = t.id
     WHERE m.discord_id = $1`,
    [String(discordUserId)]
  );
  return rows;
}

export async function createTenant({
  id,
  displayName = '',
  ownerDiscordId = null,
  plan = 'free',
  isPlatformOwner = false,
  onboarded = false,
  configuration = DEFAULT_CONFIGURATION,
  discordChannels = {},
}) {
  const tenantId = String(id);
  invalidateOnboardedTenants();
  await query(
    `INSERT INTO tenants (id, display_name, owner_discord_id, plan, is_platform_owner, onboarded, enabled_games)
     VALUES ($1, $2, $3, $4, $5, $6, '[]'::jsonb)
     ON CONFLICT (id) DO UPDATE SET
       display_name = EXCLUDED.display_name,
       owner_discord_id = COALESCE(EXCLUDED.owner_discord_id, tenants.owner_discord_id),
       onboarded = tenants.onboarded OR EXCLUDED.onboarded`,
    [tenantId, displayName, ownerDiscordId, plan, isPlatformOwner, onboarded]
  );
  const incoming = configuration || DEFAULT_CONFIGURATION;
  const workspace = { ...WORKSPACE_DEFAULTS, ...pickWorkspaceConfig(incoming) };
  const game = omitWorkspaceConfig(incoming);
  await query(
    `INSERT INTO tenant_settings (tenant_id, configuration, discord_channels)
     VALUES ($1, $2::jsonb, $3::jsonb)
     ON CONFLICT (tenant_id) DO UPDATE SET
       configuration = COALESCE(tenant_settings.configuration, EXCLUDED.configuration),
       discord_channels = CASE
         WHEN tenant_settings.discord_channels = '{}'::jsonb THEN EXCLUDED.discord_channels
         ELSE tenant_settings.discord_channels
       END,
       updated_at = NOW()`,
    [tenantId, JSON.stringify(workspace), JSON.stringify(discordChannels || {})]
  );
  if (Object.keys(game).length) {
    await query(
      `INSERT INTO game_settings (tenant_id, game_id, configuration, updated_at)
       VALUES ($1, $2, $3::jsonb, NOW())
       ON CONFLICT (tenant_id, game_id) DO NOTHING`,
      [tenantId, RAGNAROK_ORIGIN_ID, JSON.stringify(game)]
    );
  }
  const merged = mergeGameConfiguration(workspace, game, RAGNAROK_ORIGIN_ID);
  setCachedConfig(tenantId, merged, RAGNAROK_ORIGIN_ID);
  setCachedChannels(tenantId, discordChannels || {});
  return getTenant(tenantId);
}

export async function claimTenantOwner(tenantId, discordUserId) {
  if (!tenantId || !discordUserId) return null;
  await query(
    `UPDATE tenants
     SET owner_discord_id = $2
     WHERE id = $1 AND (owner_discord_id IS NULL OR owner_discord_id = '')`,
    [String(tenantId), String(discordUserId)]
  );
  return getTenant(tenantId);
}

export async function markTenantOnboarded(id, { displayName, discordChannels, configuration } = {}) {
  invalidateOnboardedTenants();
  const tenantId = String(id);
  if (displayName) {
    await query('UPDATE tenants SET display_name = $2, onboarded = TRUE WHERE id = $1', [tenantId, displayName]);
  } else {
    await query('UPDATE tenants SET onboarded = TRUE WHERE id = $1', [tenantId]);
  }
  const sets = [];
  const params = [tenantId];
  if (discordChannels) {
    params.push(JSON.stringify(discordChannels));
    sets.push(`discord_channels = $${params.length}::jsonb`);
  }
  if (configuration) {
    params.push(JSON.stringify({ ...WORKSPACE_DEFAULTS, ...pickWorkspaceConfig(configuration) }));
    sets.push(`configuration = $${params.length}::jsonb`);
  }
  if (sets.length) {
    sets.push('updated_at = NOW()');
    await query(
      `INSERT INTO tenant_settings (tenant_id, configuration, discord_channels)
       VALUES ($1, '{}'::jsonb, '{}'::jsonb)
       ON CONFLICT (tenant_id) DO NOTHING`,
      [tenantId]
    );
    await query(`UPDATE tenant_settings SET ${sets.join(', ')} WHERE tenant_id = $1`, params);
  }
  if (configuration) {
    const game = omitWorkspaceConfig(configuration);
    if (Object.keys(game).length) {
      await query(
        `INSERT INTO game_settings (tenant_id, game_id, configuration, updated_at)
         VALUES ($1, $2, $3::jsonb, NOW())
         ON CONFLICT (tenant_id, game_id) DO UPDATE SET configuration = EXCLUDED.configuration, updated_at = NOW()`,
        [tenantId, RAGNAROK_ORIGIN_ID, JSON.stringify(game)]
      );
    }
    setCachedConfig(tenantId, mergeGameConfiguration(
      pickWorkspaceConfig(configuration),
      omitWorkspaceConfig(configuration),
      RAGNAROK_ORIGIN_ID,
    ), RAGNAROK_ORIGIN_ID);
  }
  if (discordChannels) setCachedChannels(tenantId, discordChannels);
}

export async function loadTenantSettings(tenantId) {
  if (!tenantId) {
    return { configuration: { ...DEFAULT_CONFIGURATION }, discordChannels: {} };
  }
  const [wsRes, gameRes] = await Promise.all([
    query(
      'SELECT configuration, discord_channels FROM tenant_settings WHERE tenant_id = $1',
      [String(tenantId)]
    ),
    query(
      'SELECT configuration FROM game_settings WHERE tenant_id = $1 AND game_id = $2',
      [String(tenantId), RAGNAROK_ORIGIN_ID]
    ),
  ]);
  const stored = wsRes.rows[0]?.configuration || {};
  const workspace = pickWorkspaceConfig(stored);
  const leftover = omitWorkspaceConfig(stored);
  const gameRow = gameRes.rows[0]?.configuration;
  const game = gameRow && Object.keys(gameRow).length ? gameRow : leftover;
  const configuration = mergeGameConfiguration(workspace, game, RAGNAROK_ORIGIN_ID);
  const discordChannels = wsRes.rows[0]?.discord_channels || {};
  setCachedConfig(tenantId, configuration, RAGNAROK_ORIGIN_ID);
  setCachedChannels(tenantId, discordChannels);
  return { configuration, discordChannels };
}

export async function setTenantLogoUrl(tenantId, logoUrl) {
  const id = String(tenantId);
  const url = logoUrl ? String(logoUrl) : null;
  await query('UPDATE tenants SET logo_url = $2 WHERE id = $1', [id, url]);
  await query(
    `INSERT INTO tenant_settings (tenant_id, configuration, discord_channels)
     VALUES ($1, jsonb_build_object('guildLogoUrl', COALESCE($2::text, '')), '{}'::jsonb)
     ON CONFLICT (tenant_id) DO UPDATE SET
       configuration = tenant_settings.configuration || jsonb_build_object('guildLogoUrl', COALESCE($2::text, '')),
       updated_at = NOW()`,
    [id, url]
  );
  const { configuration } = await loadTenantSettings(id);
  setCachedConfig(id, configuration);
  return url || '';
}

export async function saveTenantDiscordChannels(tenantId, discordChannels) {
  const id = String(tenantId);
  const payload = mergeChannelFallback(discordChannels || {});
  await query(
    `INSERT INTO tenant_settings (tenant_id, configuration, discord_channels)
     VALUES ($1, '{}'::jsonb, $2::jsonb)
     ON CONFLICT (tenant_id) DO UPDATE SET discord_channels = $2::jsonb, updated_at = NOW()`,
    [id, JSON.stringify(payload)]
  );
  setCachedChannels(id, payload);
  return payload;
}

export async function setTenantEnabledGames(tenantId, gameIds) {
  const id = String(tenantId);
  const enabled = parseEnabledGames(gameIds);
  await query(
    'UPDATE tenants SET enabled_games = $2::jsonb WHERE id = $1',
    [id, JSON.stringify(enabled)]
  );
  return getTenant(id);
}

export async function setTenantDisplayName(tenantId, displayName) {
  const id = String(tenantId);
  const name = String(displayName || '').trim();
  await query('UPDATE tenants SET display_name = $2 WHERE id = $1', [id, name]);
  return getTenant(id);
}

export async function forEachOnboardedTenant(fn) {
  let tenants = getCachedOnboardedTenants();
  if (!tenants) {
    tenants = await listOnboardedTenants();
    setCachedOnboardedTenants(tenants);
  }
  for (const tenant of tenants) {
    if (!tenantHasAccess(tenant)) continue;
    try {
      let configuration;
      let discordChannels;
      if (hasCachedConfig(tenant.id) && hasCachedChannels(tenant.id)) {
        configuration = getCachedConfig(tenant.id);
        discordChannels = getCachedChannels(tenant.id);
      } else {
        ({ configuration, discordChannels } = await loadTenantSettings(tenant.id));
      }
      setCachedConfig(tenant.id, configuration, RAGNAROK_ORIGIN_ID);
      setCachedChannels(tenant.id, mergeChannelFallback(discordChannels));
      await runWithTenant(tenant.id, () => fn(tenant));
    } catch (err) {
      console.error(`⚠️ Tenant job failed for ${tenant.id}:`, err.message);
    }
  }
}

export async function forEachEnabledGameTenant(gameId, fn) {
  const wanted = String(gameId || '');
  await forEachOnboardedTenant(async (tenant) => {
    const enabled = parseEnabledGames(tenant.enabled_games);
    if (!enabled.includes(wanted)) return;
    await runWithGame(wanted, () => fn(tenant));
  });
}

export function mergeChannelFallback(fromDb) {
  return {
    guildId: fromDb?.guildId || '',
    auctionChannelId: fromDb?.auctionChannelId || '',
    aucreqChannelId: fromDb?.aucreqChannelId || '',
    genroomId: fromDb?.genroomId || '',
    attendanceId: fromDb?.attendanceId || '',
    warAnnounceChannelId: fromDb?.warAnnounceChannelId || '',
    raidScreenshotChannelId: fromDb?.raidScreenshotChannelId || '',
    onboardingChannelId: fromDb?.onboardingChannelId || '',
    warRooms: { ...(fromDb?.warRooms || {}) },
  };
}
