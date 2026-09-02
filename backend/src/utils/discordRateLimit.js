/**
 * Discord REST rate-limit / soft-ban wait extraction + debug logging.
 *
 * Discord.js and the Discord API expose retry delays in several shapes
 * (ms vs seconds, event payload vs thrown error). This helper normalizes
 * them so every log line tells officers exactly how long to wait.
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

/**
 * Discord Retry-After is usually seconds. Values already in milliseconds
 * (discord.js timeToReset / timeout) are typically thousands+.
 */
function secondsOrMsToMs(value) {
  const n = asPositiveNumber(value);
  if (n == null) return null;
  return n > 10_000 ? n : Math.round(n * 1000);
}

function headerRetryAfterMs(headers) {
  if (!headers) return null;
  const raw = typeof headers.get === 'function'
    ? (headers.get('retry-after') || headers.get('Retry-After'))
    : (headers['retry-after'] || headers['Retry-After'] || headers['x-ratelimit-reset-after']);
  return secondsOrMsToMs(raw);
}

/**
 * Pull a wait duration (ms) from a discord.js rateLimited event, RateLimitError,
 * DiscordAPIError 429, or a raw fetch Response-like object.
 */
export function extractRetryWaitMs(source) {
  if (!source) return null;

  const msDirect = asPositiveNumber(source.timeToReset)
    ?? asPositiveNumber(source.timeout)
    ?? asPositiveNumber(source.retryAfterMs);
  if (msDirect != null) return Math.round(msDirect);

  const fromSeconds = secondsOrMsToMs(source.retryAfter)
    ?? secondsOrMsToMs(source.retry_after)
    ?? secondsOrMsToMs(source.rawError?.retry_after)
    ?? secondsOrMsToMs(source.data?.retry_after)
    ?? secondsOrMsToMs(source.body?.retry_after);
  if (fromSeconds != null) return fromSeconds;

  const fromHeader = headerRetryAfterMs(source.headers);
  if (fromHeader != null) return fromHeader;

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
  if (waitMs == null) return;
  const until = Date.now() + waitMs;
  if (until >= lastCooldownUntil) {
    lastCooldownUntil = until;
    lastCooldownMeta = { ...meta, waitMs, until };
  }
}

export function getDiscordRateLimitStatus() {
  const remainingMs = Math.max(0, lastCooldownUntil - Date.now());
  return {
    coolingDown: remainingMs > 0,
    remainingMs,
    remainingHuman: remainingMs > 0 ? formatDurationMs(remainingMs) : 'none',
    until: lastCooldownUntil || null,
    untilHuman: lastCooldownUntil ? formatUntil(lastCooldownUntil) : null,
    last: lastCooldownMeta,
  };
}

/**
 * One verbose debug line so a Discord 429/soft-ban always shows how long to wait.
 * Safe to call from the REST `rateLimited` event or any catch block.
 */
export function logDiscordRateLimit(sourceLabel, infoOrErr) {
  const waitMs = extractRetryWaitMs(infoOrErr);
  const isGlobal = infoOrErr?.global === true
    || infoOrErr?.rawError?.global === true
    || infoOrErr?.data?.global === true;
  const route = infoOrErr?.route || infoOrErr?.path || infoOrErr?.url || infoOrErr?.methodRoute || 'unknown';
  const method = infoOrErr?.method || '';
  const limit = infoOrErr?.limit;
  const message = infoOrErr?.message || infoOrErr?.rawError?.message || '';

  rememberCooldown(waitMs, { sourceLabel, isGlobal, route, method, message });

  const remaining = getDiscordRateLimitStatus();
  const waitHuman = waitMs != null ? formatDurationMs(waitMs) : 'unknown (Discord did not send Retry-After)';
  const scope = isGlobal ? 'GLOBAL (soft-ban / cloudflare-style)' : 'route-specific';

  console.warn(
    `🛑 [DISCORD RATE LIMIT DEBUG] ${sourceLabel}\n` +
    `   scope: ${scope}\n` +
    `   wait now: ${waitHuman}` +
      (waitMs != null ? `  → retry after ${formatUntil(Date.now() + waitMs)}` : '') + `\n` +
    `   cooldown remaining: ${remaining.remainingHuman}` +
      (remaining.untilHuman ? `  (until ${remaining.untilHuman})` : '') + `\n` +
    `   ${method ? `method=${method} ` : ''}route=${route}` +
      (limit != null ? `  bucketLimit=${limit}` : '') +
      (message ? `\n   message: ${message}` : '')
  );

  return remaining;
}
