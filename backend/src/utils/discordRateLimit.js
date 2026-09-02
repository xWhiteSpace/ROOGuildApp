/**
 * Discord REST rate-limit / soft-ban wait extraction + debug logging.
 *
 * Discord global IP blocks often send HTTP 429 with a message but NO JSON
 * `retry_after`. The wait (if any) lives on response headers: Retry-After
 * (seconds or HTTP-date), x-ratelimit-reset-after, x-ratelimit-reset.
 */

let lastCooldownUntil = 0;
let lastCooldownMeta = null;

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
  lastCooldownMeta = { ...meta, waitMs: waitMs ?? null, until: waitMs != null ? Date.now() + waitMs : null };
  if (waitMs == null) return;
  const until = Date.now() + waitMs;
  if (until >= lastCooldownUntil) lastCooldownUntil = until;
}

export function getDiscordRateLimitStatus() {
  const remainingMs = Math.max(0, lastCooldownUntil - Date.now());
  return {
    coolingDown: remainingMs > 0,
    remainingMs,
    remainingHuman: remainingMs > 0 ? formatDurationMs(remainingMs) : (lastCooldownMeta && lastCooldownMeta.waitMs == null ? 'unknown (Discord sent no Retry-After)' : 'none'),
    until: lastCooldownUntil || lastCooldownMeta?.until || null,
    untilHuman: (lastCooldownUntil || lastCooldownMeta?.until) ? formatUntil(lastCooldownUntil || lastCooldownMeta.until) : null,
    last: lastCooldownMeta,
  };
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

  rememberCooldown(waitMs, { sourceLabel, isGlobal, route, method, message, httpStatus, headers: interestingHeaders(headerMap) });

  const remaining = getDiscordRateLimitStatus();
  const waitHuman = waitMs != null ? formatDurationMs(waitMs) : 'UNKNOWN — Discord did not send Retry-After';
  const untilHuman = waitMs != null ? formatUntil(Date.now() + waitMs) : null;
  const shownHeaders = interestingHeaders(headerMap);
  const headerLine = Object.keys(shownHeaders).length
    ? Object.entries(shownHeaders).map(([k, v]) => `${k}=${v}`).join(' | ')
    : '(none — body-only block, typical of a Cloudflare/global IP soft-ban)';

  console.warn('============================================================');
  console.warn(`🛑 DISCORD RATE LIMIT / SOFT-BAN  [${sourceLabel}]`);
  console.warn(`   HTTP: ${httpStatus || 'n/a'}   scope: ${isGlobal ? 'GLOBAL IP BLOCK' : 'route bucket'}`);
  console.warn(`   WAIT: ${waitHuman}${untilHuman ? `  → retry after ${untilHuman}` : ''}`);
  if (waitMs == null) {
    console.warn('   Discord omitted a wait time. Global IP blocks are often 10 min–1 hour+.');
    console.warn('   Do NOT retry login/broadcast until it clears — retries extend the ban.');
  } else {
    console.warn(`   cooldown remaining: ${remaining.remainingHuman}  (until ${remaining.untilHuman})`);
  }
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
