/**
 * Request ledger clock.
 * Timestamp (`date`) is when the line was written. Event date is the raid night.
 * Pity walks by calendar day, never by raw id text.
 */
import { clampLookbackDays } from '../defaults.js';
import { DEFAULT_TZ, formatGuildDate } from '../../../utils/guildTime.js';
import { PUSH_CHARS } from '../utils/sortingEngine.js';

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})/;
const US_RE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;

export function toIsoDate(raw) {
  const value = String(raw || '').trim();
  const iso = value.match(ISO_RE);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const us = value.match(US_RE);
  if (!us) return '';
  const month = us[1].padStart(2, '0');
  const day = us[2].padStart(2, '0');
  if (Number(month) < 1 || Number(month) > 12 || Number(day) < 1 || Number(day) > 31) return '';
  return `${us[3]}-${month}-${day}`;
}

export function addIsoDays(iso, delta) {
  const match = String(iso || '').match(ISO_RE);
  if (!match) return '';
  const dt = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return dt.toISOString().slice(0, 10);
}

export function lookbackStartDay(today, lookbackDays) {
  const days = clampLookbackDays(lookbackDays);
  return addIsoDays(today, -(days - 1));
}

/**
 * SQL expression for the Timestamp calendar day (YYYY-MM-DD). Null when the
 * stored date is not ISO or M/D/YYYY. Used so history and lookback do not
 * ORDER BY id.
 */
export function ledgerCalendarDaySql(expr = `data->>'date'`) {
  return `(CASE
    WHEN ${expr} ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' THEN substring(${expr} from 1 for 10)
    WHEN ${expr} ~ '^[0-9]{1,2}/[0-9]{1,2}/[0-9]{4}$' THEN
      substring(${expr} from '([0-9]{4})$') || '-' ||
      lpad(split_part(${expr}, '/', 1), 2, '0') || '-' ||
      lpad(split_part(${expr}, '/', 2), 2, '0')
    ELSE NULL
  END)`;
}

export function resolveSessionDate(dynamicConfig, timezone = DEFAULT_TZ) {
  const configured = toIsoDate(dynamicConfig?.targetSessionDate);
  if (configured) return configured;
  return formatGuildDate(new Date(), timezone || DEFAULT_TZ);
}

/** Write-time milliseconds from a Firebase push id or a legacy 17-char base36 id. */
export function writeMsFromId(id) {
  const raw = String(id || '');
  if (raw.length === 17 && raw.startsWith('-')) {
    const n = parseInt(raw.slice(1, 9), 36);
    return Number.isFinite(n) ? n : 0;
  }
  if (raw.length < 8) return 0;
  let ms = 0;
  for (let i = 0; i < 8; i++) {
    const idx = PUSH_CHARS.indexOf(raw.charAt(i));
    if (idx < 0) return 0;
    ms = ms * 64 + idx;
  }
  return ms;
}

export function ledgerCalendarDay(row) {
  return toIsoDate(row?.date) || toIsoDate(row?.eventDate) || '';
}

function itemMatches(row, itemId, itemName) {
  const rowId = String(row?.itemId || '').trim().toLowerCase();
  const wantId = String(itemId || '').trim().toLowerCase();
  if (rowId && wantId && rowId === wantId) return true;
  const rowName = String(row?.item || '').trim().toLowerCase();
  const wantName = String(itemName || '').trim().toLowerCase();
  return !rowId && !!rowName && !!wantName && rowName === wantName;
}

function compareRows(a, b) {
  const dayA = ledgerCalendarDay(a);
  const dayB = ledgerCalendarDay(b);
  if (dayA !== dayB) return dayA < dayB ? -1 : 1;
  const msA = writeMsFromId(a?.id);
  const msB = writeMsFromId(b?.id);
  if (msA !== msB) return msA - msB;
  const idA = String(a?.id || '');
  const idB = String(b?.id || '');
  if (idA === idB) return 0;
  return idA < idB ? -1 : 1;
}

/**
 * Pity for one member and one item.
 * Selected and Reset end the streak. Absent ends it unless the item is high value.
 * A high-value Absent counts as one night and does not end the streak.
 * After the last ending outcome, each later NotSelected night counts once.
 * Pending, Superseded, and Canceled do neither.
 */
export function scorePriority(rows, {
  userId,
  itemId,
  itemName,
  isHighValue = false,
  lookbackDays = 30,
  today,
} = {}) {
  const horizon = today ? lookbackStartDay(today, lookbackDays) : '';
  const matched = [];
  for (const row of rows || []) {
    if (userId != null && userId !== '' && String(row?.userId || '') !== String(userId)) continue;
    if (!itemMatches(row, itemId, itemName)) continue;
    const day = ledgerCalendarDay(row);
    if (!day) continue;
    if (horizon && day < horizon) continue;
    if (today && day > today) continue;
    matched.push(row);
  }
  matched.sort(compareRows);

  let lastEnding = -1;
  for (let i = matched.length - 1; i >= 0; i--) {
    const status = String(matched[i].selectionStatus || 'pending').toLowerCase();
    const ends = status === 'selected' || status === 'reset' || (status === 'absent' && !isHighValue);
    if (ends) {
      lastEnding = i;
      break;
    }
  }

  let points = 0;
  const nights = new Set();
  for (let i = lastEnding + 1; i < matched.length; i++) {
    const status = String(matched[i].selectionStatus || 'pending').toLowerCase();
    const counts = status === 'notselected' || (status === 'absent' && isHighValue);
    const night = ledgerCalendarDay(matched[i]);
    if (counts && night && !nights.has(night)) {
      nights.add(night);
      points += 1;
    }
  }
  return points;
}
