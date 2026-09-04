/**
 * Discord REST rate-limit / soft-ban wait extraction + debug logging.
 *
 * Discord global IP blocks often send HTTP 429 with a message but NO JSON
 * `retry_after`. The wait (if any) lives on response headers: Retry-After
 * (seconds or HTTP-date), x-ratelimit-reset-after, x-ratelimit-reset.
 */
import { getDatabase } from 'firebase-admin/database';

const DEFAULT_CIRCUIT_MS = 15 * 60 * 1000;
const MIN_GAP_MS = 1500;
const OAUTH_COOLDOWN_MS = 5 * 60 * 1000;
const LOGIN_CLICK_DEBOUNCE_MS = 45 * 1000;
const OAUTH_QUIET_AFTER_BURST_MS = 3 * 60 * 1000;

let lastCooldownUntil = 0;
let lastCooldownMeta = null;
let queueTail = Promise.resolve();
let lastCallAt = 0;
let lastOAuthAttemptAt = 0;
let lastLoginRedirectAt = 0;
let lastDiscordBurstAt = 0;
let oauthInFlight = false;

export function formatDurationMs(ms) {
  if (!Number.isFinite(ms) || ms < 0) return 'unknown';
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function asPositiveNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function headersToObject(headers) {
  if (!headers) return {};
  if (typeof headers.forEach === 'function') {
    const out = {};
    headers.forEach((value, key) => { out[String(key).toLowerCase()] = value; });
    return out;
  }
  if (typeof headers === 'object') {
    const out = {};
    for (const [key, value] of Object.entries(headers)) {
      if (value != null) out[String(key).toLowerCase()] = String(value);
    }
    return out;
  }
  return {};
}

function headerLookup(headerMap, ...names) {
  for (const name of names) {
    const v = headerMap[name.toLowerCase()];
    if (v != null && String(v).trim() !== '') return String(v).trim();
  }
  return null;
}

/** Retry-After: delta-seconds OR HTTP-date. x-ratelimit-reset: unix seconds. */
function parseWaitHeaderMs(raw, { unixSeconds = false } = {}) {
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  if (unixSeconds) {
    const unix = asPositiveNumber(trimmed);
    if (unix == null) return null;
    const epochMs = unix > 1e12 ? unix : unix * 1000;
    return Math.max(0, epochMs - Date.now());
  }
  const numeric = asPositiveNumber(trimmed);
  if (numeric != null) {
    // Discord.js timeToReset is already ms (typically thousands+). HTTP Retry-After
    // delta-seconds is almost always < 10000 except multi-hour bans (still seconds).
    return numeric > 1e12 ? Math.max(0, numeric - Date.now()) : Math.round(numeric * 1000);
  }
  const parsed = Date.parse(trimmed);
  if (!Number.isNaN(parsed)) return Math.max(0, parsed - Date.now());
  return null;
}

export function extractRetryWaitMs(source) {
  if (!source) return null;

  const msDirect = asPositiveNumber(source.timeToReset)
    ?? asPositiveNumber(source.timeout)
    ?? asPositiveNumber(source.retryAfterMs);
  if (msDirect != null) return Math.round(msDirect);

  const fromSeconds = (() => {
    const n = asPositiveNumber(source.retryAfter)
      ?? asPositiveNumber(source.retry_after)
      ?? asPositiveNumber(source.rawError?.retry_after)
      ?? asPositiveNumber(source.data?.retry_after)
      ?? asPositiveNumber(source.body?.retry_after);
    if (n == null) return null;
    return n > 10_000 ? n : Math.round(n * 1000);
  })();
  if (fromSeconds != null) return fromSeconds;

  const headerMap = headersToObject(source.headers);
  const retryAfter = parseWaitHeaderMs(headerLookup(headerMap, 'retry-after', 'cf-retry-after'));
  if (retryAfter != null) return retryAfter;
  const resetAfter = parseWaitHeaderMs(headerLookup(headerMap, 'x-ratelimit-reset-after'));
  if (resetAfter != null) return resetAfter;
  const resetAt = parseWaitHeaderMs(headerLookup(headerMap, 'x-ratelimit-reset'), { unixSeconds: true });
  if (resetAt != null) return resetAt;

  return null;
}

function formatUntil(epochMs) {
  if (!epochMs) return 'unknown';
  try {
    return new Date(epochMs).toLocaleString('en-US', {
      timeZone: 'Asia/Manila',
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }) + ' PHT';
  } catch {
    return new Date(epochMs).toISOString();
  }
}

function rememberCooldown(waitMs, meta) {
  const resolvedMs = waitMs != null && waitMs > 0 ? waitMs : null;
  const until = resolvedMs != null ? Date.now() + resolvedMs : null;
  lastCooldownMeta = { ...meta, waitMs: resolvedMs, until };
  if (until != null && until >= lastCooldownUntil) lastCooldownUntil = until;
  persistCircuit();
}

function persistCircuit() {
  try {
    getDatabase().ref('scheduler/discord_circuit').set({
      until: lastCooldownUntil || null,
      lastOAuthAttemptAt: lastOAuthAttemptAt || null,
      lastDiscordBurstAt: lastDiscordBurstAt || null,
      updatedAt: Date.now(),
      last: lastCooldownMeta,
    }).catch((err) => {
      console.warn('⚠️ [DISCORD CIRCUIT]: persist failed:', err.message);
    });
  } catch (err) {
    console.warn('⚠️ [DISCORD CIRCUIT]: persist skipped:', err.message);
  }
}

/** Restore Cloudflare/Discord cooldown after a Render restart so we do not immediately POST /oauth2/token again. */
export async function hydrateDiscordCircuit() {
  try {
    const snap = await getDatabase().ref('scheduler/discord_circuit').once('value');
    if (!snap.exists()) return;
    const data = snap.val() || {};
    const until = Number(data.until) || 0;
    if (until > Date.now()) {
      lastCooldownUntil = until;
      lastCooldownMeta = data.last || { sourceLabel: 'hydrated-from-firebase' };
      console.warn(`🔌 [DISCORD CIRCUIT] Restored from Firebase — OPEN until ${formatUntil(until)}`);
    }
    const priorOauth = Number(data.lastOAuthAttemptAt) || 0;
    if (priorOauth > lastOAuthAttemptAt) lastOAuthAttemptAt = priorOauth;
    const priorBurst = Number(data.lastDiscordBurstAt) || 0;
    if (priorBurst > lastDiscordBurstAt) lastDiscordBurstAt = priorBurst;
  } catch (err) {
    console.warn('⚠️ [DISCORD CIRCUIT]: hydrate failed:', err.message);
  }
}

export function noteDiscordBurst() {
  lastDiscordBurstAt = Date.now();
  persistCircuit();
}

function oauthQuietRemainingMs() {
  if (!lastDiscordBurstAt) return 0;
  return Math.max(0, lastDiscordBurstAt + OAUTH_QUIET_AFTER_BURST_MS - Date.now());
}

export function getDiscordRateLimitStatus() {
  const remainingMs = Math.max(0, lastCooldownUntil - Date.now());
  const oauthRemaining = lastOAuthAttemptAt
    ? Math.max(0, lastOAuthAttemptAt + OAUTH_COOLDOWN_MS - Date.now())
    : 0;
  const quietMs = oauthQuietRemainingMs();
  const blockedMs = Math.max(remainingMs, oauthRemaining, quietMs);
  return {
    coolingDown: blockedMs > 0,
    circuitOpen: remainingMs > 0,
    remainingMs: blockedMs,
    remainingHuman: blockedMs > 0 ? formatDurationMs(blockedMs) : 'none',
    until: lastCooldownUntil || (quietMs > 0 ? Date.now() + quietMs : null) || (oauthRemaining > 0 ? Date.now() + oauthRemaining : null),
    untilHuman: blockedMs > 0 ? formatUntil(Date.now() + blockedMs) : null,
    last: lastCooldownMeta,
    oauthCooldownMs: oauthRemaining,
    oauthCooldownHuman: oauthRemaining > 0 ? formatDurationMs(oauthRemaining) : 'none',
    oauthQuietMs: quietMs,
    oauthInFlight,
  };
}

/**
 * One OAuth token-exchange at a time. Gaps: 5 min between token POSTs, 45s between
 * Sign-in clicks, 3 min quiet after a snapshot burst. Rapid Sign-in from a
 * Render IP is what turns Cloudflare 429s into a global block.
 */
export function beginOAuthAttempt() {
  if (isDiscordCircuitOpen()) {
    return { allowed: false, reason: 'circuit', status: getDiscordRateLimitStatus() };
  }
  if (oauthInFlight) {
    return { allowed: false, reason: 'inflight', status: getDiscordRateLimitStatus() };
  }
  const oauthRemaining = lastOAuthAttemptAt
    ? Math.max(0, lastOAuthAttemptAt + OAUTH_COOLDOWN_MS - Date.now())
    : 0;
  if (oauthRemaining > 0) {
    return { allowed: false, reason: 'oauth-cooldown', status: getDiscordRateLimitStatus() };
  }
  if (oauthQuietRemainingMs() > 0) {
    return { allowed: false, reason: 'oauth-quiet', status: getDiscordRateLimitStatus() };
  }
  oauthInFlight = true;
  lastOAuthAttemptAt = Date.now();
  persistCircuit();
  return { allowed: true, status: getDiscordRateLimitStatus() };
}

export function endOAuthAttempt() {
  oauthInFlight = false;
}

/** Debounce Sign-in clicks without blocking the later /callback token exchange. */
export function markOAuthLoginClick() {
  if (isDiscordCircuitOpen()) {
    return { allowed: false, reason: 'circuit', status: getDiscordRateLimitStatus() };
  }
  if (oauthInFlight) {
    return { allowed: false, reason: 'inflight', status: getDiscordRateLimitStatus() };
  }
  const oauthRemaining = lastOAuthAttemptAt
    ? Math.max(0, lastOAuthAttemptAt + OAUTH_COOLDOWN_MS - Date.now())
    : 0;
  if (oauthRemaining > 0 || oauthQuietRemainingMs() > 0) {
    return { allowed: false, reason: 'oauth-cooldown', status: getDiscordRateLimitStatus() };
  }
  const clickRemaining = lastLoginRedirectAt
    ? Math.max(0, lastLoginRedirectAt + LOGIN_CLICK_DEBOUNCE_MS - Date.now())
    : 0;
  if (clickRemaining > 0) {
    return { allowed: false, reason: 'oauth-cooldown', status: getDiscordRateLimitStatus() };
  }
  lastLoginRedirectAt = Date.now();
  return { allowed: true, status: getDiscordRateLimitStatus() };
}

/**
 * Open the process-wide Discord REST circuit. If Discord omitted Retry-After
 * (typical of a Cloudflare/global IP block), hold for 15 minutes.
 */
export function tripDiscordCircuit(infoOrErr, sourceLabel = 'unknown') {
  let waitMs = extractRetryWaitMs(infoOrErr);
  let guessed = false;
  if (waitMs == null || waitMs <= 0) {
    waitMs = DEFAULT_CIRCUIT_MS;
    guessed = true;
  }
  rememberCooldown(waitMs, {
    sourceLabel,
    guessed,
    message: infoOrErr?.message || '',
  });
  const untilHuman = formatUntil(Date.now() + waitMs);
  console.warn(
    `🔌 [DISCORD CIRCUIT] OPEN for ${formatDurationMs(waitMs)}` +
    `${guessed ? ' (default 15m — Discord sent no Retry-After)' : ''} until ${untilHuman}`
  );
  return getDiscordRateLimitStatus();
}

export function isDiscordCircuitOpen() {
  return Date.now() < lastCooldownUntil;
}

export function getDiscordCircuitWait() {
  return getDiscordRateLimitStatus();
}

export class DiscordCircuitOpenError extends Error {
  constructor(status) {
    super(`Discord circuit open — retry after ${status.untilHuman || status.remainingHuman}`);
    this.name = 'DiscordCircuitOpenError';
    this.status = status;
  }
}

export function assertDiscordAllowed() {
  if (isDiscordCircuitOpen()) {
    throw new DiscordCircuitOpenError(getDiscordRateLimitStatus());
  }
}

/**
 * Single-flight outbound Discord REST queue. Enforces ≥1500ms between calls
 * and refuses work while the 429 circuit is open.
 */
export function enqueueDiscordCall(fn) {
  const run = async () => {
    assertDiscordAllowed();
    const wait = Math.max(0, lastCallAt + MIN_GAP_MS - Date.now());
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    assertDiscordAllowed();
    lastCallAt = Date.now();
    try {
      return await fn();
    } catch (err) {
      if (looksLikeDiscordRateLimit(err)) {
        logDiscordRateLimit('queued Discord call', err);
      }
      throw err;
    }
  };
  const next = queueTail.then(run, run);
  queueTail = next.catch(() => {});
  return next;
}

export function looksLikeDiscordRateLimit(source) {
  if (!source) return false;
  const status = Number(source.status ?? source.httpStatus);
  if (status === 429) return true;
  if (Number(source.code) === 429) return true;
  const text = `${source.message || ''} ${source.rawError?.message || ''} ${source.statusText || ''} ${source.error || ''} ${source.error_description || ''}`;
  return /rate limit|too many requests|being blocked|exceeding global/i.test(text);
}

function interestingHeaders(headerMap) {
  const keys = [
    'retry-after', 'cf-retry-after', 'x-ratelimit-limit', 'x-ratelimit-remaining',
    'x-ratelimit-reset', 'x-ratelimit-reset-after', 'x-ratelimit-global', 'x-ratelimit-scope',
    'cf-ray', 'date', 'via', 'server',
  ];
  const out = {};
  for (const k of keys) {
    if (headerMap[k] != null) out[k] = headerMap[k];
  }
  return out;
}

/**
 * Loud, line-by-line debug so Render logs cannot swallow a single multiline warn.
 * Always prints even when Discord omits Retry-After (global IP blocks do this).
 */
export function logDiscordRateLimit(sourceLabel, infoOrErr) {
  const headerMap = headersToObject(infoOrErr?.headers);
  const waitMs = extractRetryWaitMs(infoOrErr);
  const message = infoOrErr?.message || infoOrErr?.rawError?.message || infoOrErr?.statusText || '';
  const isGlobal = infoOrErr?.global === true
    || infoOrErr?.rawError?.global === true
    || infoOrErr?.data?.global === true
    || headerMap['x-ratelimit-global'] === 'true'
    || /being blocked|exceeding global/i.test(message);
  const route = infoOrErr?.route || infoOrErr?.path || infoOrErr?.url || 'unknown';
  const method = infoOrErr?.method || '';
  const httpStatus = infoOrErr?.status ?? infoOrErr?.httpStatus ?? infoOrErr?.code ?? '';

  const circuitWaitMs = waitMs != null && waitMs > 0 ? waitMs : DEFAULT_CIRCUIT_MS;
  const guessed = waitMs == null || waitMs <= 0;
  rememberCooldown(circuitWaitMs, { sourceLabel, isGlobal, route, method, message, httpStatus, headers: interestingHeaders(headerMap), guessed });

  const remaining = getDiscordRateLimitStatus();
  const waitHuman = !guessed ? formatDurationMs(waitMs) : `UNKNOWN — using default ${formatDurationMs(DEFAULT_CIRCUIT_MS)}`;
  const untilHuman = formatUntil(Date.now() + circuitWaitMs);
  const shownHeaders = interestingHeaders(headerMap);
  const headerLine = Object.keys(shownHeaders).length
    ? Object.entries(shownHeaders).map(([k, v]) => `${k}=${v}`).join(' | ')
    : '(none — body-only block, typical of a Cloudflare/global IP soft-ban)';

  console.warn('============================================================');
  console.warn(`🛑 DISCORD RATE LIMIT / SOFT-BAN  [${sourceLabel}]`);
  console.warn(`   HTTP: ${httpStatus || 'n/a'}   scope: ${isGlobal ? 'GLOBAL IP BLOCK' : 'route bucket'}`);
  console.warn(`   WAIT: ${waitHuman}  → retry after ${untilHuman}`);
  if (guessed) {
    console.warn('   Discord omitted a wait time. Circuit held for the default 15 minutes.');
    console.warn('   Do NOT retry login/broadcast until it clears — retries extend the ban.');
  }
  console.warn(`   CIRCUIT OPEN — outbound Discord REST + OAuth blocked for ${remaining.remainingHuman}`);
  console.warn(`   ${method ? `method=${method} ` : ''}route=${route}`);
  console.warn(`   headers: ${headerLine}`);
  if (message) console.warn(`   message: ${message}`);
  console.warn('============================================================');

  return remaining;
}

/** Dump a fetch Response even when the JSON body has no retry_after. */
export function logDiscordHttpFailure(sourceLabel, response, body) {
  const payload = {
    ...(body && typeof body === 'object' ? body : { rawBody: body }),
    headers: response?.headers,
    status: response?.status,
    statusText: response?.statusText,
    url: response?.url,
    message: (body && body.message) || response?.statusText || '',
  };
  if (looksLikeDiscordRateLimit(payload) || Number(response?.status) === 429) {
    return logDiscordRateLimit(sourceLabel, payload);
  }
  const headerMap = headersToObject(response?.headers);
  console.warn(`⚠️ [DISCORD HTTP ${response?.status} ${response?.statusText}] ${sourceLabel}`);
  console.warn(`   headers: ${JSON.stringify(interestingHeaders(headerMap))}`);
  if (body) console.warn(`   body: ${typeof body === 'string' ? body : JSON.stringify(body)}`);
  return null;
}
