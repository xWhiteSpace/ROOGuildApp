import { query } from './pool.js';
import { getCurrentTenantId, setCachedConfig } from './tenantContext.js';
import { DEFAULT_CONFIGURATION } from '../config/defaultConfiguration.js';
import { DEFAULT_TZ, formatGuildDate, getWeekMonday, weekKeyBounds } from '../utils/guildTime.js';
import { clampLookbackDays } from '../games/ragnarok-origin/defaults.js';
import { PUSH_CHARS, pushIdAt } from '../games/ragnarok-origin/utils/sortingEngine.js';
import { ledgerCalendarDaySql, lookbackStartDay } from '../games/ragnarok-origin/services/requestLedger.js';

const COLLECTION_MAP = {
  'auction/members': { table: 'members', idCol: 'discord_id' },
  'auction/web_requests': { table: 'auction_requests', idCol: 'id' },
  'auction/past_auctions': { table: 'past_auction_awards', idCol: 'id' },
  'auction/loot_history': { table: 'loot_history', idCol: 'id' },
  'scheduler/instances': { table: 'schedule_instances', idCol: 'id' },
  'scheduler/special_events': { table: 'special_events', idCol: 'id' },
};

function normalizePath(path) {
  if (!path) return '';
  return String(path).replace(/^\/+/, '').replace(/\/+$/, '');
}

function pathParts(path) {
  return normalizePath(path).split('/').filter(Boolean);
}

function cloneJson(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function getNested(obj, parts) {
  let cur = obj;
  for (const part of parts) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = cur[part];
  }
  return cur;
}

function setNested(target, parts, value) {
  if (parts.length === 0) return value === undefined ? null : value;
  const root = target && typeof target === 'object' && !Array.isArray(target) ? { ...target } : {};
  if (parts.length === 1) {
    if (value === null || value === undefined) {
      delete root[parts[0]];
    } else {
      root[parts[0]] = value;
    }
    return root;
  }
  root[parts[0]] = setNested(root[parts[0]], parts.slice(1), value);
  return root;
}

function mergeDeep(base, patch) {
  if (patch === null || patch === undefined) return patch;
  if (typeof patch !== 'object' || Array.isArray(patch)) return cloneJson(patch);
  const out = (base && typeof base === 'object' && !Array.isArray(base)) ? { ...base } : {};
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) delete out[k];
    else if (v && typeof v === 'object' && !Array.isArray(v)) out[k] = mergeDeep(out[k], v);
    else out[k] = cloneJson(v);
  }
  return out;
}

function resolveTenantId(tenantId) {
  return tenantId || getCurrentTenantId() || null;
}

function requireTenant(tenantId) {
  const id = resolveTenantId(tenantId);
  if (!id) {
    throw new Error('No tenant in context. Log in and select a Discord server first.');
  }
  return String(id);
}

function isPlatformPath(path) {
  const parts = pathParts(path);
  return parts[0] === 'scheduler' && parts[1] === 'discord_circuit';
}

function encodePushKey() {
  const time = pushIdAt(Date.now()).slice(0, 8);
  let tail = '';
  for (let i = 0; i < 12; i++) {
    tail += PUSH_CHARS.charAt(Math.floor(Math.random() * PUSH_CHARS.length));
  }
  return time + tail;
}

class DataSnapshot {
  constructor(key, value) {
    this.key = key ?? null;
    this._value = value === undefined ? null : value;
  }

  exists() {
    return this._value !== null && this._value !== undefined;
  }

  val() {
    return this._value === undefined ? null : cloneJson(this._value);
  }

  forEach(cb) {
    if (!this._value || typeof this._value !== 'object' || Array.isArray(this._value)) return false;
    for (const [key, child] of Object.entries(this._value)) {
      const stop = cb(new DataSnapshot(key, child));
      if (stop) return true;
    }
    return false;
  }
}

async function loadCollection(tenantId, spec) {
  const { rows } = await query(
    `SELECT ${spec.idCol} AS id, data FROM ${spec.table} WHERE tenant_id = $1`,
    [tenantId]
  );
  if (!rows.length) return null;
  const out = {};
  for (const row of rows) out[row.id] = row.data;
  return out;
}

function rowsToMap(rows) {
  if (!rows.length) return null;
  const out = {};
  for (const row of rows) out[row.id] = row.data;
  return out;
}

async function loadCollectionFiltered(tenantId, spec, field, value) {
  if (!/^[A-Za-z0-9_]+$/.test(String(field || ''))) {
    const all = await loadCollection(tenantId, spec);
    if (!all) return all;
    const filtered = {};
    for (const [k, row] of Object.entries(all)) {
      if (row && typeof row === 'object' && row[field] === value) filtered[k] = row;
    }
    return Object.keys(filtered).length ? filtered : null;
  }
  const { rows } = await query(
    `SELECT ${spec.idCol} AS id, data FROM ${spec.table}
     WHERE tenant_id = $1 AND data->>$2 = $3`,
    [tenantId, field, value == null ? '' : String(value)]
  );
  return rowsToMap(rows);
}

export async function loadAuctionRequests({
  status,
  userId,
  sinceDays,
  sinceCalendarDay,
  sinceId,
  untilId,
} = {}, tenantId) {
  const id = requireTenant(tenantId);
  const clauses = ['tenant_id = $1'];
  const params = [id];
  let i = 2;
  if (status != null && status !== '') {
    clauses.push(`data->>'selectionStatus' = $${i++}`);
    params.push(String(status));
  }
  if (userId != null && userId !== '') {
    clauses.push(`data->>'userId' = $${i++}`);
    params.push(String(userId));
  }
  let calendarStart = sinceCalendarDay ? String(sinceCalendarDay) : '';
  if (!calendarStart && sinceDays != null && !sinceId) {
    const today = formatGuildDate(new Date(), DEFAULT_TZ);
    calendarStart = lookbackStartDay(today, sinceDays);
  }
  if (calendarStart) {
    clauses.push(`${ledgerCalendarDaySql(`data->>'date'`)} >= $${i++}`);
    params.push(calendarStart);
  }
  if (sinceId) {
    clauses.push(`id >= $${i++}`);
    params.push(sinceId);
  }
  if (untilId) {
    clauses.push(`id <= $${i++}`);
    params.push(untilId);
  }
  const { rows } = await query(
    `SELECT id, data FROM auction_requests WHERE ${clauses.join(' AND ')}`,
    params
  );
  return rowsToMap(rows) || {};
}

const HISTORY_SORT = {
  member: `data->>'member'`,
  item: `data->>'item'`,
  priority: `COALESCE((data->>'priority')::int, 0)`,
};

function mapAuctionHistoryRow(row) {
  const data = row.data || {};
  return {
    id: data.id || row.id,
    userId: data.userId || '',
    date: data.date || '',
    member: data.member || 'Unknown Member',
    item: data.item || '',
    itemId: data.itemId || '',
    quantity: parseInt(data.quantity, 10) || 0,
    applicationStatus: data.applicationStatus || 'Requested',
    selectionStatus: data.selectionStatus || 'Pending',
    liveStatus: data.liveStatus || '',
    priority: parseInt(data.priority, 10) || 0,
    eventDate: data.eventDate || '',
  };
}

export async function listAuctionHistory({
  userId,
  status,
  q,
  sort = 'date',
  dir = 'desc',
  limit = 20,
  page = 1,
  sinceId,
  untilId,
  countOnly = false,
} = {}, tenantId) {
  const id = requireTenant(tenantId);
  const clauses = ['tenant_id = $1'];
  const params = [id];
  let i = 2;
  if (userId) {
    clauses.push(`data->>'userId' = $${i++}`);
    params.push(String(userId));
  }
  if (status) {
    clauses.push(`lower(data->>'selectionStatus') = $${i++}`);
    params.push(String(status).toLowerCase());
  }
  const queryText = String(q || '').trim();
  if (queryText) {
    clauses.push(`(data->>'member' ILIKE $${i} OR data->>'item' ILIKE $${i})`);
    params.push(`%${queryText}%`);
    i += 1;
  }
  if (sinceId) {
    clauses.push(`id >= $${i++}`);
    params.push(sinceId);
  }
  if (untilId) {
    clauses.push(`id <= $${i++}`);
    params.push(untilId);
  }
  const where = clauses.join(' AND ');
  const countRes = await query(`SELECT COUNT(*)::int AS n FROM auction_requests WHERE ${where}`, params);
  const total = countRes.rows[0]?.n || 0;
  if (countOnly) return { history: [], total, page: 1, limit: 0 };

  const orderByDate = !sort || sort === 'date' || !HISTORY_SORT[sort];
  const orderCol = orderByDate ? ledgerCalendarDaySql(`data->>'date'`) : HISTORY_SORT[sort];
  const orderDir = String(dir).toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  const nulls = orderByDate ? (orderDir === 'DESC' ? 'NULLS LAST' : 'NULLS FIRST') : '';
  const safeLimit = Math.min(10000, Math.max(1, parseInt(limit, 10) || 20));
  const safePage = Math.max(1, parseInt(page, 10) || 1);
  const offset = (safePage - 1) * safeLimit;
  const { rows } = await query(
    `SELECT id, data FROM auction_requests WHERE ${where}
     ORDER BY ${orderCol} ${orderDir} ${nulls}, id ${orderDir}
     LIMIT $${i} OFFSET $${i + 1}`,
    [...params, safeLimit, offset]
  );
  return {
    history: rows.map(mapAuctionHistoryRow),
    total,
    page: safePage,
    limit: safeLimit,
  };
}

export async function loadCollectionSince(path, { sinceDays, userId, sinceId } = {}, tenantId) {
  const id = requireTenant(tenantId);
  const spec = COLLECTION_MAP[path];
  if (!spec) return {};
  const clauses = ['tenant_id = $1'];
  const params = [id];
  let i = 2;
  if (userId != null && userId !== '') {
    clauses.push(`data->>'userId' = $${i++}`);
    params.push(String(userId));
  }
  const minId = sinceId || (sinceDays != null ? pushIdAt(Date.now() - clampLookbackDays(sinceDays) * 86400000) : null);
  if (minId) {
    clauses.push(`${spec.idCol} >= $${i++}`);
    params.push(minId);
  }
  const { rows } = await query(
    `SELECT ${spec.idCol} AS id, data FROM ${spec.table} WHERE ${clauses.join(' AND ')}`,
    params
  );
  return rowsToMap(rows) || {};
}

function pastAuctionDateVariants(raw) {
  const value = String(raw || '').trim();
  if (!value) return [];
  const variants = new Set([value]);
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const us = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (iso) {
    const year = iso[1];
    const month = parseInt(iso[2], 10);
    const day = parseInt(iso[3], 10);
    variants.add(`${month}/${day}/${year}`);
    variants.add(`${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}/${year}`);
  } else if (us) {
    const month = parseInt(us[1], 10);
    const day = parseInt(us[2], 10);
    const year = us[3];
    variants.add(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
    variants.add(`${month}/${day}/${year}`);
  }
  return [...variants];
}

function pastAuctionIso(raw) {
  const value = String(raw || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const us = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!us) return value;
  return `${us[3]}-${String(us[1]).padStart(2, '0')}-${String(us[2]).padStart(2, '0')}`;
}

function mapPastAuctionRow(row) {
  const data = row.data || {};
  return {
    id: data.id || row.id,
    date: data.date || '',
    event: data.event || '',
    item: data.item || '',
    itemId: data.itemId || '',
    quantity: parseInt(data.quantity, 10) || 0,
    userId: data.userId || '',
    mem: data.mem || 'Unknown Member',
  };
}

export async function listPastAuctionDates(tenantId) {
  const id = requireTenant(tenantId);
  const { rows } = await query(
    `SELECT data->>'date' AS date, COUNT(*)::int AS n
     FROM past_auction_awards
     WHERE tenant_id = $1 AND COALESCE(data->>'date', '') <> ''
     GROUP BY 1`,
    [id]
  );
  return rows
    .map((row) => ({
      date: row.date,
      iso: pastAuctionIso(row.date),
      count: row.n,
    }))
    .sort((a, b) => String(b.iso).localeCompare(String(a.iso)) || String(b.date).localeCompare(String(a.date)));
}

export async function listPastAuctionsForDate(date, tenantId) {
  const id = requireTenant(tenantId);
  const variants = pastAuctionDateVariants(date);
  if (!variants.length) return [];
  const { rows } = await query(
    `SELECT id, data FROM past_auction_awards
     WHERE tenant_id = $1 AND data->>'date' = ANY($2::text[])
     ORDER BY id DESC`,
    [id, variants]
  );
  return rows.map(mapPastAuctionRow);
}

export async function listLootHistoryDates(tenantId) {
  const id = requireTenant(tenantId);
  const { rows } = await query(
    `SELECT data->>'date' AS date, COUNT(*)::int AS n
     FROM loot_history
     WHERE tenant_id = $1 AND COALESCE(data->>'date', '') <> ''
     GROUP BY 1`,
    [id]
  );
  return rows
    .map((row) => ({
      date: row.date,
      iso: pastAuctionIso(row.date),
      count: row.n,
    }))
    .sort((a, b) => String(b.iso).localeCompare(String(a.iso)) || String(b.date).localeCompare(String(a.date)));
}

export async function listLootHistoryForDate(date, tenantId) {
  const id = requireTenant(tenantId);
  const variants = pastAuctionDateVariants(date);
  if (!variants.length) return [];
  const { rows } = await query(
    `SELECT id, data FROM loot_history
     WHERE tenant_id = $1 AND data->>'date' = ANY($2::text[])
     ORDER BY id DESC`,
    [id, variants]
  );
  return rows.map((row) => {
    const data = row.data || {};
    return {
      id: data.id || row.id,
      date: data.date || '',
      event: data.event || '',
      item: data.item || '',
      itemId: data.itemId || '',
      quantity: parseInt(data.quantity, 10) || 0,
      max: parseInt(data.max, 10) || 1,
      mem: parseInt(data.mem, 10) || 0,
    };
  });
}

export async function countLootHistoryBattles(tenantId) {
  const id = requireTenant(tenantId);
  const { rows } = await query(
    `SELECT COUNT(*)::int AS n FROM (
       SELECT DISTINCT COALESCE(data->>'date', ''), COALESCE(data->>'event', '')
       FROM loot_history WHERE tenant_id = $1
     ) t`,
    [id]
  );
  return rows[0]?.n || 0;
}

export async function loadPastAuctionsForMember(userId, tenantId) {
  const id = requireTenant(tenantId);
  const { rows } = await query(
    `SELECT id, data FROM past_auction_awards
     WHERE tenant_id = $1 AND data->>'userId' = $2`,
    [id, String(userId)]
  );
  return rowsToMap(rows) || {};
}

export async function loadInstancesForWeek(weekMonday, tenantId) {
  const id = requireTenant(tenantId);
  const bounds = weekKeyBounds(weekMonday);
  if (!bounds) return {};
  const { rows } = await query(
    `SELECT id, data FROM schedule_instances
     WHERE tenant_id = $1
       AND (data->>'weekMonday' = $2 OR (id >= $2 AND id < $3))`,
    [id, bounds.start, bounds.endExclusive]
  );
  return rowsToMap(rows) || {};
}

export async function loadCommitmentsForWeek(weekMonday, tenantId) {
  const id = requireTenant(tenantId);
  return (await loadCommitments(id, null, null, weekMonday)) || {};
}

export async function listCommitmentKeysForEventId(eventId, tenantId) {
  const id = requireTenant(tenantId);
  const suffix = `_${String(eventId || '')}`;
  if (suffix === '_') return [];
  const { rows } = await query(
    `SELECT DISTINCT event_key FROM attendance_commitments
     WHERE tenant_id = $1 AND event_key LIKE $2`,
    [id, `%${suffix}`]
  );
  return rows.map((row) => row.event_key);
}

export async function loadPublishedByIds(ids, tenantId) {
  const id = requireTenant(tenantId);
  const keys = [...new Set((ids || []).map((key) => String(key || '').trim()).filter(Boolean))];
  if (!keys.length) return {};
  const { rows } = await query(
    `SELECT e.key AS id, e.value AS data
     FROM json_docs d
     CROSS JOIN LATERAL jsonb_each(d.data) e
     WHERE d.tenant_id = $1 AND d.path = 'attendance/published' AND e.key = ANY($2::text[])`,
    [id, keys]
  );
  return rowsToMap(rows) || {};
}

function sessionArchiveTrend(row, sessionId) {
  if (!row || typeof row !== 'object') return { id: sessionId };
  return {
    id: row.id || sessionId,
    eventTitle: row.eventTitle || '',
    eventDate: row.eventDate || '',
    eventKey: row.eventKey || '',
    endedAt: row.endedAt || 0,
    endedEarly: row.endedEarly === true,
    committedBy: row.committedBy || '',
    totalPulses: row.totalPulses || 0,
    expectedPulses: row.expectedPulses || 0,
    userTallies: row.userTallies || {},
    commitments: row.commitments || {},
    inGameStatus: row.inGameStatus || {},
  };
}

export async function loadSessionArchive({ limit, sessionId, fields = 'trend' } = {}, tenantId) {
  const id = requireTenant(tenantId);
  const full = fields === 'full';
  if (sessionId) {
    const { rows } = await query(
      `SELECT data -> $2 AS data FROM json_docs
       WHERE tenant_id = $1 AND path = 'attendance/session_archive'`,
      [id, String(sessionId)]
    );
    const data = rows[0]?.data;
    if (data == null) return {};
    return { [sessionId]: full ? data : sessionArchiveTrend(data, sessionId) };
  }
  const n = Math.min(50, Math.max(1, parseInt(limit, 10) || 12));
  const { rows } = await query(
    `SELECT e.key AS id, e.value AS data
     FROM json_docs d
     CROSS JOIN LATERAL jsonb_each(d.data) e
     WHERE d.tenant_id = $1 AND d.path = 'attendance/session_archive'
     ORDER BY COALESCE((NULLIF(e.value->>'endedAt', ''))::bigint, 0) DESC
     LIMIT $2`,
    [id, n]
  );
  const mapped = rowsToMap(rows) || {};
  if (full) return mapped;
  const slim = {};
  for (const [key, row] of Object.entries(mapped)) {
    slim[key] = sessionArchiveTrend(row, key);
  }
  return slim;
}

export async function findArchiveForEvent(eventDate, eventKey, tenantId) {
  const id = requireTenant(tenantId);
  const { rows } = await query(
    `SELECT e.key AS id, e.value AS data
     FROM json_docs d
     CROSS JOIN LATERAL jsonb_each(d.data) e
     WHERE d.tenant_id = $1 AND d.path = 'attendance/session_archive'
       AND e.value->>'eventDate' = $2 AND e.value->>'eventKey' = $3
     ORDER BY COALESCE((NULLIF(e.value->>'endedAt', ''))::bigint, 0) DESC
     LIMIT 1`,
    [id, String(eventDate || ''), String(eventKey || '')]
  );
  if (!rows[0]?.data) return null;
  return { ...rows[0].data, id: rows[0].id };
}

export async function sqlFingerprint(tenantId, {
  members = false,
  commitments = false,
  docPaths = [],
  config = false,
  commitmentWeekMonday = null,
} = {}) {
  const id = requireTenant(tenantId);
  const paths = Array.isArray(docPaths) ? docPaths.filter(Boolean) : [];
  const bounds = commitmentWeekMonday ? weekKeyBounds(commitmentWeekMonday) : null;
  const { rows } = await query(
    `SELECT md5(concat(
       CASE WHEN $2 THEN COALESCE((SELECT md5(string_agg(discord_id || data::text, chr(30) ORDER BY discord_id)) FROM members WHERE tenant_id = $1), '') ELSE '' END,
       CASE WHEN $3 THEN COALESCE((SELECT md5(string_agg(event_key || member_id || data::text, chr(30) ORDER BY event_key, member_id))
         FROM attendance_commitments
         WHERE tenant_id = $1
           AND ($7::text IS NULL OR (event_key >= $7 AND event_key < $8))), '') ELSE '' END,
       CASE WHEN $4 THEN COALESCE((SELECT md5(string_agg(
         path || CASE
           WHEN path = 'attendance/live_session'
           THEN (data - 'lastVoicePoll' - 'userTallies' - 'totalPulses' - 'expectedPulses')::text
           ELSE data::text
         END, chr(30) ORDER BY path)) FROM json_docs WHERE tenant_id = $1 AND path = ANY($6::text[])), '') ELSE '' END,
       CASE WHEN $5 THEN COALESCE((SELECT md5(configuration::text) FROM tenant_settings WHERE tenant_id = $1), '') ELSE '' END
     )) AS fp`,
    [id, members, commitments, paths.length > 0, config, paths, bounds?.start || null, bounds?.endExclusive || null]
  );
  return String(rows[0]?.fp || '');
}

async function loadCollectionRow(tenantId, spec, id) {
  const { rows } = await query(
    `SELECT data FROM ${spec.table} WHERE tenant_id = $1 AND ${spec.idCol} = $2`,
    [tenantId, id]
  );
  return rows[0]?.data;
}

async function upsertCollectionRow(tenantId, spec, id, data) {
  if (data === null || data === undefined) {
    await query(`DELETE FROM ${spec.table} WHERE tenant_id = $1 AND ${spec.idCol} = $2`, [tenantId, id]);
    return;
  }
  await query(
    `INSERT INTO ${spec.table} (tenant_id, ${spec.idCol}, data)
     VALUES ($1, $2, $3::jsonb)
     ON CONFLICT (tenant_id, ${spec.idCol}) DO UPDATE SET data = EXCLUDED.data`,
    [tenantId, id, JSON.stringify(data)]
  );
}

async function replaceCollection(tenantId, spec, obj) {
  await query(`DELETE FROM ${spec.table} WHERE tenant_id = $1`, [tenantId]);
  if (!obj || typeof obj !== 'object') return;
  for (const [id, data] of Object.entries(obj)) {
    if (data === null || data === undefined) continue;
    await upsertCollectionRow(tenantId, spec, id, data);
  }
}

async function loadCommitments(tenantId, eventKey, memberId, weekMonday) {
  if (!eventKey) {
    const config = await loadConfig(tenantId);
    const monday = weekMonday || getWeekMonday(config?.timezone || DEFAULT_TZ);
    const bounds = weekKeyBounds(monday);
    if (!bounds) return {};
    const { rows } = await query(
      `SELECT event_key, member_id, data FROM attendance_commitments
       WHERE tenant_id = $1 AND event_key >= $2 AND event_key < $3`,
      [tenantId, bounds.start, bounds.endExclusive]
    );
    const tree = {};
    for (const row of rows) {
      if (!tree[row.event_key]) tree[row.event_key] = {};
      tree[row.event_key][row.member_id] = row.data;
    }
    return tree;
  }
  if (!memberId) {
    const { rows } = await query(
      'SELECT member_id, data FROM attendance_commitments WHERE tenant_id = $1 AND event_key = $2',
      [tenantId, eventKey]
    );
    const out = {};
    for (const row of rows) out[row.member_id] = row.data;
    return out;
  }
  const { rows } = await query(
    'SELECT data FROM attendance_commitments WHERE tenant_id = $1 AND event_key = $2 AND member_id = $3',
    [tenantId, eventKey, memberId]
  );
  return rows[0]?.data;
}

async function writeCommitment(tenantId, eventKey, memberId, data) {
  if (!memberId) {
    await query('DELETE FROM attendance_commitments WHERE tenant_id = $1 AND event_key = $2', [tenantId, eventKey]);
    if (data && typeof data === 'object') {
      for (const [uid, row] of Object.entries(data)) {
        if (row == null) continue;
        await query(
          `INSERT INTO attendance_commitments (tenant_id, event_key, member_id, data)
           VALUES ($1, $2, $3, $4::jsonb)
           ON CONFLICT (tenant_id, event_key, member_id) DO UPDATE SET data = EXCLUDED.data`,
          [tenantId, eventKey, uid, JSON.stringify(row)]
        );
      }
    }
    return;
  }
  if (data === null || data === undefined) {
    await query(
      'DELETE FROM attendance_commitments WHERE tenant_id = $1 AND event_key = $2 AND member_id = $3',
      [tenantId, eventKey, memberId]
    );
    return;
  }
  await query(
    `INSERT INTO attendance_commitments (tenant_id, event_key, member_id, data)
     VALUES ($1, $2, $3, $4::jsonb)
     ON CONFLICT (tenant_id, event_key, member_id) DO UPDATE SET data = EXCLUDED.data`,
    [tenantId, eventKey, memberId, JSON.stringify(data)]
  );
}

async function loadConfig(tenantId) {
  const { rows } = await query(
    'SELECT configuration FROM tenant_settings WHERE tenant_id = $1',
    [tenantId]
  );
  if (!rows[0]) return null;
  return rows[0].configuration;
}

async function saveConfig(tenantId, configuration) {
  await query(
    `INSERT INTO tenant_settings (tenant_id, configuration, discord_channels)
     VALUES ($1, $2::jsonb, '{}'::jsonb)
     ON CONFLICT (tenant_id) DO UPDATE SET configuration = $2::jsonb, updated_at = NOW()`,
    [tenantId, JSON.stringify(configuration || {})]
  );
  setCachedConfig(tenantId, { ...DEFAULT_CONFIGURATION, ...(configuration || {}) });
}

function docRootFor(parts) {
  if (parts.length <= 2) return parts.join('/');
  return `${parts[0]}/${parts[1]}`;
}

async function loadDoc(tenantId, docPath) {
  const { rows } = await query(
    'SELECT data FROM json_docs WHERE tenant_id = $1 AND path = $2',
    [tenantId, docPath]
  );
  if (!rows[0]) return undefined;
  return rows[0].data;
}

function jsonKeyPath(keyPath) {
  return JSON.stringify(keyPath);
}

const JSON_KEY_ARRAY = `ARRAY(SELECT jsonb_array_elements_text($3::jsonb))`;

async function loadDocKey(tenantId, docPath, keyPath) {
  const { rows } = await query(
    `SELECT data #> ${JSON_KEY_ARRAY} AS data FROM json_docs WHERE tenant_id = $1 AND path = $2`,
    [tenantId, docPath, jsonKeyPath(keyPath)]
  );
  if (!rows[0] || rows[0].data == null) return null;
  return rows[0].data;
}

async function upsertDocKey(tenantId, docPath, keyPath, value) {
  const payload = JSON.stringify(value ?? null);
  await query(
    `INSERT INTO json_docs (tenant_id, path, data)
     VALUES ($1, $2, jsonb_set('{}'::jsonb, ${JSON_KEY_ARRAY}, $4::jsonb, true))
     ON CONFLICT (tenant_id, path) DO UPDATE
     SET data = jsonb_set(COALESCE(json_docs.data, '{}'::jsonb), ${JSON_KEY_ARRAY}, $4::jsonb, true)`,
    [tenantId, docPath, jsonKeyPath(keyPath), payload]
  );
}

async function deleteDocKey(tenantId, docPath, keyPath) {
  await query(
    `UPDATE json_docs SET data = data #- ${JSON_KEY_ARRAY} WHERE tenant_id = $1 AND path = $2`,
    [tenantId, docPath, jsonKeyPath(keyPath)]
  );
}

async function saveDoc(tenantId, docPath, data) {
  if (data === null || data === undefined || (typeof data === 'object' && !Array.isArray(data) && Object.keys(data).length === 0 && docPath.includes('/'))) {
    if (data === null || data === undefined) {
      await query('DELETE FROM json_docs WHERE tenant_id = $1 AND path = $2', [tenantId, docPath]);
      return;
    }
  }
  await query(
    `INSERT INTO json_docs (tenant_id, path, data)
     VALUES ($1, $2, $3::jsonb)
     ON CONFLICT (tenant_id, path) DO UPDATE SET data = EXCLUDED.data`,
    [tenantId, docPath, JSON.stringify(data ?? null)]
  );
}

async function readPath(tenantId, path) {
  const parts = pathParts(path);
  if (parts.length === 0) {
    throw new Error('Root read is not supported; read a specific node');
  }

  if (isPlatformPath(path)) {
    const { rows } = await query('SELECT data FROM platform_state WHERE key = $1', ['discord_circuit']);
    const data = rows[0]?.data;
    if (parts.length === 2) return data ?? null;
    return getNested(data, parts.slice(2)) ?? null;
  }

  tenantId = requireTenant(tenantId);

  if (parts[0] === 'settings' && parts[1] === 'configuration') {
    const config = await loadConfig(tenantId);
    if (parts.length === 2) return config ?? null;
    return getNested(config, parts.slice(2)) ?? null;
  }

  if (parts[0] === 'attendance' && parts[1] === 'commitments') {
    const value = await loadCommitments(tenantId, parts[2], parts[3]);
    if (parts.length <= 4) return value ?? null;
    return getNested(value, parts.slice(4)) ?? null;
  }

  const two = parts.length >= 2 ? `${parts[0]}/${parts[1]}` : parts[0];
  const spec = COLLECTION_MAP[two];
  if (spec) {
    if (parts.length === 2) return await loadCollection(tenantId, spec);
    const row = await loadCollectionRow(tenantId, spec, parts[2]);
    if (parts.length === 3) return row ?? null;
    return getNested(row, parts.slice(3)) ?? null;
  }

  const docPath = docRootFor(parts);
  const rest = parts.slice(pathParts(docPath).length);
  if (rest.length) return await loadDocKey(tenantId, docPath, rest);
  const doc = await loadDoc(tenantId, docPath);
  return doc === undefined ? null : doc;
}

async function writePath(tenantId, path, value) {
  const parts = pathParts(path);
  if (parts.length === 0) {
    throw new Error('Cannot set the database root');
  }

  if (isPlatformPath(path)) {
    if (parts.length === 2) {
      if (value === null) {
        await query('DELETE FROM platform_state WHERE key = $1', ['discord_circuit']);
      } else {
        await query(
          `INSERT INTO platform_state (key, data, updated_at) VALUES ('discord_circuit', $1::jsonb, NOW())
           ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
          [JSON.stringify(value)]
        );
      }
      return;
    }
    const current = (await readPath(tenantId, 'scheduler/discord_circuit')) || {};
    const next = setNested(current, parts.slice(2), value);
    await writePath(tenantId, 'scheduler/discord_circuit', next);
    return;
  }

  tenantId = requireTenant(tenantId);

  if (parts[0] === 'settings' && parts[1] === 'configuration') {
    if (parts.length === 2) {
      await saveConfig(tenantId, value || {});
      return;
    }
    const current = (await loadConfig(tenantId)) || { ...DEFAULT_CONFIGURATION };
    const next = setNested(current, parts.slice(2), value);
    await saveConfig(tenantId, next);
    return;
  }

  if (parts[0] === 'attendance' && parts[1] === 'commitments') {
    if (parts.length === 2) {
      await query('DELETE FROM attendance_commitments WHERE tenant_id = $1', [tenantId]);
      if (value && typeof value === 'object') {
        for (const [eventKey, members] of Object.entries(value)) {
          await writeCommitment(tenantId, eventKey, null, members);
        }
      }
      return;
    }
    if (parts.length === 3) {
      await writeCommitment(tenantId, parts[2], null, value);
      return;
    }
    if (parts.length === 4) {
      await writeCommitment(tenantId, parts[2], parts[3], value);
      return;
    }
    const current = (await loadCommitments(tenantId, parts[2], parts[3])) || {};
    const next = setNested(current, parts.slice(4), value);
    await writeCommitment(tenantId, parts[2], parts[3], next);
    return;
  }

  const two = parts.length >= 2 ? `${parts[0]}/${parts[1]}` : parts[0];
  const spec = COLLECTION_MAP[two];
  if (spec) {
    if (parts.length === 2) {
      await replaceCollection(tenantId, spec, value);
      return;
    }
    if (parts.length === 3) {
      await upsertCollectionRow(tenantId, spec, parts[2], value);
      return;
    }
    const current = (await loadCollectionRow(tenantId, spec, parts[2])) || {};
    const next = setNested(current, parts.slice(3), value);
    await upsertCollectionRow(tenantId, spec, parts[2], next);
    return;
  }

  const docPath = docRootFor(parts);
  const rest = parts.slice(pathParts(docPath).length);
  if (!rest.length) {
    await saveDoc(tenantId, docPath, value);
    return;
  }
  if (value === null || value === undefined) {
    await deleteDocKey(tenantId, docPath, rest);
    return;
  }
  await upsertDocKey(tenantId, docPath, rest, value);
}

async function updateAtPath(tenantId, path, patch) {
  if (patch === null || typeof patch !== 'object' || Array.isArray(patch)) {
    await writePath(tenantId, path, patch);
    return;
  }
  const current = await readPath(tenantId, path);
  const next = mergeDeep(current && typeof current === 'object' ? current : {}, patch);
  await writePath(tenantId, path, next);
}

class QueryRef {
  constructor(tenantId, path, filters = []) {
    this._tenantId = tenantId;
    this.path = normalizePath(path);
    this._filters = filters;
    this.key = pathParts(this.path).slice(-1)[0] || null;
  }

  child(childPath) {
    const suffix = normalizePath(childPath);
    const next = this.path ? `${this.path}/${suffix}` : suffix;
    return new QueryRef(this._tenantId, next);
  }

  orderByChild(field) {
    return new QueryRef(this._tenantId, this.path, [...this._filters, { type: 'orderByChild', field }]);
  }

  equalTo(value) {
    return new QueryRef(this._tenantId, this.path, [...this._filters, { type: 'equalTo', value }]);
  }

  push() {
    const key = encodePushKey();
    const child = this.child(key);
    child.key = key;
    return child;
  }

  async once() {
    const parts = pathParts(this.path);
    const two = parts.length >= 2 ? `${parts[0]}/${parts[1]}` : parts[0];
    const spec = COLLECTION_MAP[two];
    const order = this._filters.find((f) => f.type === 'orderByChild');
    const eq = this._filters.find((f) => f.type === 'equalTo');
    let value;
    if (spec && parts.length === 2 && order && eq) {
      value = await loadCollectionFiltered(this._tenantId, spec, order.field, eq.value);
    } else {
      value = await readPath(this._tenantId, this.path);
      if (order && eq && value && typeof value === 'object' && !Array.isArray(value)) {
        const filtered = {};
        for (const [k, row] of Object.entries(value)) {
          if (row && typeof row === 'object' && row[order.field] === eq.value) filtered[k] = row;
        }
        value = filtered;
      }
    }
    const key = this.key;
    return new DataSnapshot(key, value);
  }

  async set(value) {
    await writePath(this._tenantId, this.path, value);
  }

  async update(patch) {
    if (this.path === '' || this.path === '/') {
      const entries = Object.entries(patch || {});
      for (const [subPath, val] of entries) {
        await writePath(this._tenantId, subPath, val);
      }
      return;
    }
    await updateAtPath(this._tenantId, this.path, patch);
  }

  async remove() {
    await writePath(this._tenantId, this.path, null);
  }

  async transaction(updater) {
    const current = await readPath(this._tenantId, this.path);
    const next = updater(current === null ? null : cloneJson(current));
    if (next === undefined) return { committed: false, snapshot: new DataSnapshot(this.key, current) };
    await writePath(this._tenantId, this.path, next);
    return { committed: true, snapshot: new DataSnapshot(this.key, next) };
  }

  on() {
    return () => {};
  }

  off() {}
}

class DatabaseHandle {
  constructor(tenantId) {
    this._tenantId = tenantId;
  }

  ref(path = '') {
    return new QueryRef(this._tenantId, path);
  }
}

export function getTenantStore() {
  return new DatabaseHandle(resolveTenantId(null));
}

export function getTenantStoreFor(tenantId) {
  return new DatabaseHandle(resolveTenantId(tenantId));
}

export { QueryRef, DataSnapshot };
