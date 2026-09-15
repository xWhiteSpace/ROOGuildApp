import { query } from './pool.js';

function snapshotKey(discordUserId) {
  return `oauth_guilds:${discordUserId}`;
}

export function compactDiscordGuilds(guilds) {
  return (Array.isArray(guilds) ? guilds : []).map((g) => ({
    id: String(g.id),
    name: g.name || '',
    icon: g.icon || null,
    owner: Boolean(g.owner),
    permissions: String(g.permissions || '0'),
  }));
}

export async function saveOAuthGuilds(discordUserId, guilds) {
  const id = String(discordUserId || '');
  if (!id) return;
  await query(
    `INSERT INTO platform_state (key, data, updated_at)
     VALUES ($1, $2::jsonb, NOW())
     ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
    [snapshotKey(id), JSON.stringify(compactDiscordGuilds(guilds))]
  );
}

export async function loadOAuthGuilds(discordUserId) {
  const id = String(discordUserId || '');
  if (!id) return [];
  const { rows } = await query('SELECT data FROM platform_state WHERE key = $1', [snapshotKey(id)]);
  const data = rows[0]?.data;
  return Array.isArray(data) ? compactDiscordGuilds(data) : [];
}

/** Cookie session first; else the guild list saved at last Discord login. */
export async function discordGuildsForRequest(req, identity) {
  const fromSession = req.session?.discordGuilds;
  if (Array.isArray(fromSession) && fromSession.length) return compactDiscordGuilds(fromSession);
  const stored = await loadOAuthGuilds(identity?.id);
  if (stored.length && req.session) req.session.discordGuilds = stored;
  return stored;
}
