export const SHOT_KINDS = ['general', 'quasi', 'special'];

export const SHOT_LABELS = {
  general: 'General Stats',
  quasi: 'Quasi-Stats',
  special: 'Special Stats',
};

export const SPECIAL_STAT_NAMES = [
  'Max HP',
  'Max SP',
  'Equipment PATK',
  'Equipment MATK',
  'Equipment PDEF',
  'Equipment MDEF',
  'Global CD%',
  'DMG vs Small Enemies',
  'DMG Reduction vs Small Enemies',
  'DMG vs Medium Enemies',
  'DMG Reduction vs Medium Enemies',
  'DMG vs Large Enemies',
  'DMG Reduction vs Large Enemies',
];

const COLUMNS = ['left', 'right', 'stats', 'bonus'];
const SECTIONS = ['general', 'quasi', 'special', 'attributes'];

const CHROME = /^(general stats|quasi-stats|quasi stats|special|stats|bonus|req|points|auto-build|auto build|none|character|basic|details|auto-assign|job advance|preset)$/i;

const RANGES = {
  hp: 2000000,
  aspd: 400,
};

export const ROLE_STAT_PACKS = {
  phy: ['PATK', 'PDMG', 'PDMG.R', 'Ignore PDEF', 'ASPD', 'CRIT', 'CRIT DMG', 'HIT'],
  mgc: ['MATK', 'MDMG', 'MDMG.R', 'Ignore MDEF', 'Variable CT', 'Fixed CT'],
  tank: ['HP', 'PDEF', 'MDEF', 'PvE DMG Redu', 'PvP DMG Redu', 'VIT'],
  heal: ['Healing Done', 'INT', 'MATK', 'SP', 'SP Recovery', 'Variable CT', 'Fixed CT'],
};

export function tidyLabel(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

export function isChromeLabel(text) {
  return CHROME.test(tidyLabel(text));
}

export function foldLabel(text) {
  return tidyLabel(text).toLowerCase();
}

export function foldStatKey(text) {
  return foldLabel(text).replace(/[^a-z0-9]/g, '');
}

export function parseStatKeywordList(text) {
  const source = Array.isArray(text) ? text.join('\n') : String(text || '');
  const seen = new Set();
  const out = [];
  for (const piece of source.split(/\n+/)) {
    const label = tidyLabel(piece).replace(/^[-*•]\s*/, '');
    if (!label || isChromeLabel(label)) continue;
    const key = foldStatKey(label);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(label);
  }
  return out;
}

function editDistance(a, b) {
  const rows = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j += 1) rows[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      rows[i][j] = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + cost);
    }
  }
  return rows[a.length][b.length];
}

function keywordScore(ocrKey, keywordKey) {
  if (!ocrKey || !keywordKey) return 0;
  if (ocrKey === keywordKey) return 100;
  const dist = editDistance(ocrKey, keywordKey);
  const longer = Math.max(ocrKey.length, keywordKey.length);
  const shorter = Math.min(ocrKey.length, keywordKey.length);
  const allowance = longer <= 5 ? 1 : longer <= 10 ? 2 : 3;
  if (dist > allowance) return 0;
  if (shorter < longer * 0.6) return 0;
  return 90 - dist * 15;
}

function coversKeyword(piece, keywordKey) {
  return piece.length >= 8 && keywordKey.length > piece.length && piece.length >= keywordKey.length * 0.7;
}

function keywordsCoveredBy(piece, list) {
  if (!piece || piece.length < 8) return [];
  return list.filter((item) => {
    const key = foldStatKey(item);
    return coversKeyword(piece, key) && (key.endsWith(piece) || key.startsWith(piece));
  });
}

function clippedStatKeyword(folded, list) {
  if (!folded || folded.length < 8) return { label: null, ambiguous: false };
  const full = keywordsCoveredBy(folded, list);
  if (full.length === 1) return { label: full[0], ambiguous: false };
  if (full.length > 1) return { label: null, ambiguous: true };
  const dropped = keywordsCoveredBy(folded.slice(1), list);
  if (dropped.length === 1) return { label: dropped[0], ambiguous: false };
  if (dropped.length > 1) return { label: null, ambiguous: true };
  return { label: null, ambiguous: false };
}

export function matchStatKeyword(label, keywords) {
  const list = parseStatKeywordList(keywords);
  const raw = tidyLabel(label);
  if (!list.length || !raw) return raw;
  const folded = foldStatKey(raw);
  const clipped = clippedStatKeyword(folded, list);
  if (clipped.label) return clipped.label;
  if (clipped.ambiguous) return raw;
  let best = null;
  let bestScore = 0;
  let second = 0;
  for (const item of list) {
    const score = keywordScore(folded, foldStatKey(item));
    if (score > bestScore) {
      second = bestScore;
      bestScore = score;
      best = item;
    } else if (score > second) {
      second = score;
    }
  }
  const typoIsClear = best && bestScore >= 70 && (bestScore === 100 || bestScore - second >= 15);
  return typoIsClear ? best : raw;
}

function columnList(sectionLists, column) {
  if (sectionLists == null || sectionLists === '') return '';
  if (typeof sectionLists === 'string' || Array.isArray(sectionLists)) return sectionLists;
  return column === 'right' ? sectionLists.col2 : sectionLists.col1;
}

function withStatLabel(row, label) {
  if (foldLabel(label) === foldLabel(row.label)) return row;
  const next = {
    ...row,
    label,
    ocrLabel: row.ocrLabel || tidyLabel(row.label),
    flag: row.flag === 'conflict' ? 'conflict' : rangeFlag(label, { ok: true, value: row.value }),
  };
  next.key = readingKey(next);
  return next;
}

function keywordRename(row, source) {
  if (source == null || source === '') return row;
  return withStatLabel(row, matchStatKeyword(row.label, source));
}

function anchorsSequence(label, first) {
  const folded = foldStatKey(label);
  const key = foldStatKey(first);
  return Boolean(folded && key && (folded === key || folded.startsWith(key)));
}

function applyColumnSequence(rows, source) {
  const list = parseStatKeywordList(source);
  if (!list.length) return rows;
  const anchorAt = rows.findIndex((row) => anchorsSequence(row.label, list[0]));
  if (anchorAt < 0) return rows.map((row) => keywordRename(row, source));
  return rows.map((row, index) => {
    if (index < anchorAt) return keywordRename(row, source);
    const name = list[index - anchorAt];
    if (!name) return keywordRename(row, source);
    return withStatLabel(row, name);
  });
}

function listsForSection(section, lists) {
  if (section === 'quasi') return lists.quasi;
  if (section === 'special') return lists.special;
  return lists.general;
}

function knownSection(row) {
  if (row?.section === 'quasi' || row?.section === 'general' || row?.section === 'special') return row.section;
  return '';
}

export function applyStatKeywords(readings, lists = {}) {
  const next = (readings || []).slice();
  const groups = new Map();
  next.forEach((row, index) => {
    const section = knownSection(row);
    const column = row?.column === 'right' ? 'right' : row?.column === 'left' ? 'left' : '';
    if (!section || !column) return;
    const key = `${section}|${column}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(index);
  });
  for (const [key, indexes] of groups) {
    const [section, column] = key.split('|');
    const sequenced = applyColumnSequence(indexes.map((index) => next[index]), columnList(listsForSection(section, lists), column));
    indexes.forEach((index, place) => {
      next[index] = sequenced[place];
    });
  }
  const allowed = parseStatKeywordList(lists.special);
  if (!allowed.length) return next;
  return next.filter((row) => row?.section !== 'special' || allowed.some((label) => labelsMatch(label, row.label)));
}

export function unifyReadings(readings) {
  const map = new Map();
  for (const reading of readings || []) {
    const row = { ...reading, key: readingKey(reading) };
    const prev = map.get(row.key);
    if (!prev) {
      map.set(row.key, row);
      continue;
    }
    if (!prev.ocrLabel && row.ocrLabel) prev.ocrLabel = row.ocrLabel;
    const weaker = lowestConfidence([prev.confidence, row.confidence]);
    if (weaker != null) prev.confidence = weaker;
    const same = prev.value === row.value && prev.unit === row.unit;
    if (!same) {
      prev.flag = 'conflict';
      prev.alts = [...new Set([...(prev.alts || [prev.raw]), row.raw])];
    }
  }
  return [...map.values()];
}

export function labelsMatch(a, b) {
  return foldLabel(a) === foldLabel(b);
}

export function parseStatValue(text) {
  const raw = tidyLabel(text).replace(/,/g, '').replace(/\s+/g, '');
  if (!raw || !/^-?\d+(\.\d+)?%?$/.test(raw)) return { ok: false, raw: tidyLabel(text) };
  const percent = raw.endsWith('%');
  const value = Number(raw.replace('%', ''));
  if (!Number.isFinite(value)) return { ok: false, raw };
  return { ok: true, raw, value, unit: percent ? 'percent' : 'number' };
}

export function rangeFlag(label, parsed) {
  const cap = RANGES[foldLabel(label).replace(/[^a-z]/g, '')];
  if (cap == null || !parsed?.ok) return '';
  if (parsed.value < 0 || parsed.value > cap) return 'out_of_range';
  return '';
}

export function readingKey(reading) {
  return `${reading.section}|${reading.column}|${foldLabel(reading.label)}`;
}

function sectionForKind(kind) {
  if (kind === 'quasi' || kind === 'special') return kind;
  return 'general';
}

function lowestConfidence(values) {
  const nums = (values || [])
    .filter((value) => value != null && value !== '')
    .map(Number)
    .filter((value) => Number.isFinite(value));
  if (!nums.length) return null;
  return Math.max(0, Math.min(100, Math.round(Math.min(...nums))));
}

function clusterText(item) {
  if (item && typeof item === 'object') return tidyLabel(item.text);
  return tidyLabel(item);
}

function clusterConfidence(item) {
  if (!item || typeof item !== 'object') return null;
  return lowestConfidence([item.confidence]);
}

function advanceColumn(section, column) {
  if (section === 'special') return 'left';
  return column === 'left' ? 'right' : 'left';
}

function emitPair(readings, section, column, label, parsed, confidence) {
  const placed = section === 'special' ? 'left' : column;
  if (!label || isChromeLabel(label)) return advanceColumn(section, placed);
  const row = {
    label,
    column: placed,
    section,
    raw: parsed.raw,
    value: parsed.value,
    unit: parsed.unit,
    flag: rangeFlag(label, parsed),
  };
  const score = lowestConfidence([confidence]);
  if (score != null) row.confidence = score;
  readings.push(row);
  return advanceColumn(section, placed);
}

export function pairsFromClusterTexts(texts, section) {
  const readings = [];
  let chunks = [];
  let scores = [];
  let column = 'left';
  const consumeLine = (line, confidence) => {
    const found = pairsFromLine(line, section, confidence);
    for (const row of found) {
      column = emitPair(readings, section, column, row.label, row, row.confidence);
    }
    return found.length;
  };
  for (const item of texts || []) {
    const text = clusterText(item);
    const parsed = parseStatValue(text);
    if (parsed.ok && chunks.length) {
      column = emitPair(readings, section, column, tidyLabel(chunks.join(' ')), parsed, lowestConfidence([...scores, clusterConfidence(item)]));
      chunks = [];
      scores = [];
      continue;
    }
    if (parsed.ok) continue;
    const bit = tidyLabel(text);
    if (!bit || isChromeLabel(bit)) continue;
    if (pairsFromLine(bit, section).length) {
      if (chunks.length) consumeLine(chunks.join(' '), lowestConfidence(scores));
      chunks = [];
      scores = [];
      consumeLine(bit, clusterConfidence(item));
      continue;
    }
    chunks.push(bit);
    const score = clusterConfidence(item);
    if (score != null) scores.push(score);
  }
  if (chunks.length) consumeLine(chunks.join(' '), lowestConfidence(scores));
  return readings.map((row) => ({ ...row, key: readingKey(row) }));
}

function statLinePattern(section) {
  const extra = section === 'special' ? 4 : 3;
  const token = section === 'special' ? '[A-Za-z][A-Za-z.]*%?' : '[A-Za-z][A-Za-z.]*';
  return new RegExp(`(${token}(?: ${token}){0,${extra}})\\s+(-?\\d+(?:\\.\\d+)?%?)`, 'g');
}

export function pairsFromLine(line, section, confidence) {
  const text = tidyLabel(line);
  const re = statLinePattern(section);
  const texts = [];
  let match = re.exec(text);
  while (match) {
    texts.push(match[1], match[2]);
    match = re.exec(text);
  }
  const rows = pairsFromClusterTexts(texts, section);
  const score = lowestConfidence([confidence]);
  if (score == null) return rows;
  return rows.map((row) => (row.confidence == null ? { ...row, confidence: score } : row));
}

function looksLikeAttrName(token) {
  return /^[A-Za-z]{2,4}$/.test(token) && !isChromeLabel(token);
}

export function attributeFromClusterTexts(texts) {
  let name = '';
  const numbers = [];
  for (const text of texts || []) {
    const token = tidyLabel(text);
    if (!token || isChromeLabel(token)) continue;
    if (looksLikeAttrName(token) && !numbers.length) {
      name = token.toUpperCase();
      continue;
    }
    const parsed = parseStatValue(token);
    if (parsed.ok && name) numbers.push(parsed);
  }
  if (!name || numbers.length < 2) return [];
  const rows = [
    { label: name, column: 'stats', parsed: numbers[0] },
    { label: name, column: 'bonus', parsed: numbers[1] },
  ];
  return rows.map((row) => ({
    label: row.label,
    column: row.column,
    section: 'attributes',
    raw: row.parsed.raw,
    value: row.parsed.value,
    unit: row.parsed.unit,
    flag: rangeFlag(row.label, row.parsed),
    key: readingKey({ label: row.label, column: row.column, section: 'attributes' }),
  }));
}

export function attributeFromLine(line) {
  return attributeFromClusterTexts(tidyLabel(line).split(' '));
}

export function mergeShotReadings(shots) {
  const map = new Map();
  for (const shot of shots || []) {
    const section = sectionForKind(shot.kind);
    for (const reading of shot.readings || []) {
      const row = {
        ...reading,
        section: reading.section === 'attributes' ? 'attributes' : section,
      };
      row.key = readingKey(row);
      const prev = map.get(row.key);
      if (!prev) {
        map.set(row.key, row);
        continue;
      }
      const same = prev.value === row.value && prev.unit === row.unit;
      if (!same) {
        prev.flag = 'conflict';
        prev.alts = [...new Set([...(prev.alts || [prev.raw]), row.raw])];
      }
    }
  }
  return [...map.values()];
}

export function prepareReadings(readings) {
  const clean = [];
  for (const row of readings || []) {
    const label = tidyLabel(row?.label);
    if (!label || isChromeLabel(label) || row?.section === 'attributes') continue;
    const column = COLUMNS.includes(row.column) ? row.column : 'left';
    const section = SECTIONS.includes(row.section) ? row.section : 'general';
    const parsed = parseStatValue(row.raw != null && row.raw !== '' ? row.raw : row.value);
    const keepConflict = row.flag === 'conflict';
    const confidence = lowestConfidence([row.confidence]);
    if (!parsed.ok) {
      const blank = { label, column, section, raw: tidyLabel(row.raw), value: null, unit: 'number', flag: 'unreadable' };
      if (confidence != null) blank.confidence = confidence;
      blank.key = readingKey(blank);
      clean.push(blank);
      continue;
    }
    const heard = tidyLabel(row.ocrLabel);
    const next = {
      label,
      column,
      section,
      raw: parsed.raw,
      value: parsed.value,
      unit: parsed.unit,
      flag: keepConflict ? 'conflict' : rangeFlag(label, parsed),
      alts: keepConflict && Array.isArray(row.alts) ? row.alts.map((alt) => tidyLabel(alt)) : [],
      ocrLabel: heard && foldLabel(heard) !== foldLabel(label) ? heard : '',
    };
    if (confidence != null) next.confidence = confidence;
    next.key = readingKey(next);
    clean.push(next);
  }
  return clean;
}

export function statPackForRole(roleName) {
  const name = String(roleName || '').toUpperCase().replace(/[\s_]+/g, '');
  if (!name) return null;
  if (name.includes('MGC') || name.includes('MAGIC')) return ROLE_STAT_PACKS.mgc;
  if (name.includes('PHY') || name.includes('PHYS')) return ROLE_STAT_PACKS.phy;
  if (name.includes('TANK')) return ROLE_STAT_PACKS.tank;
  if (name.includes('HEAL') || name.includes('SUPPORT')) return ROLE_STAT_PACKS.heal;
  return null;
}

export function readingsForLabel(readings, label) {
  return (readings || []).filter((row) => labelsMatch(row.label, label));
}

export function columnLabels(readings, roleName) {
  const pack = statPackForRole(roleName) || [];
  const extras = [];
  for (const row of readings || []) {
    if (pack.some((label) => labelsMatch(label, row.label))) continue;
    if (!extras.some((label) => labelsMatch(label, row.label))) extras.push(row.label);
  }
  return [...pack, ...extras];
}

function dayKey(value) {
  const text = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : '';
}

export function buildSnapshot({ draft, member, id, confirmedAt }) {
  if (!draft?.memberUid) return { ok: false, error: 'Pick a member first.' };
  const capturedAt = dayKey(draft.capturedAt);
  if (!capturedAt) return { ok: false, error: 'Pick the day the sheet was taken.' };
  const jobCode = String(draft.jobCode ?? member?.jobCode ?? '').trim();
  const roleCode = String(draft.roleCode ?? member?.roleCode ?? '').trim();
  if (!jobCode || !roleCode) {
    return { ok: false, error: 'This member needs a job and a role before the sheet can be confirmed.' };
  }
  const readings = prepareReadings(draft.readings);
  if (!readings.length) return { ok: false, error: 'The sheet has no readings to confirm.' };
  if (readings.some((row) => row.flag === 'conflict')) {
    return { ok: false, error: 'Resolve conflicting readings before confirm.' };
  }
  if (readings.some((row) => row.flag === 'unreadable')) {
    return { ok: false, error: 'Fix or remove unreadable values before confirm.' };
  }
  return {
    ok: true,
    snapshot: {
      id,
      status: 'confirmed',
      memberUid: String(draft.memberUid),
      capturedAt,
      confirmedAt: confirmedAt || '',
      jobCode,
      roleCode,
      shareCode: tidyLabel(draft.shareCode),
      readings,
      extras: normalizeExtras(draft.extras),
      draftId: draft.id || '',
    },
  };
}

function byCapture(a, b) {
  const day = String(a.capturedAt).localeCompare(String(b.capturedAt));
  if (day !== 0) return day;
  return String(a.id || '').localeCompare(String(b.id || ''));
}

export function progressionFor(snapshots, memberUid) {
  const rows = (snapshots || [])
    .filter((row) => row && row.status === 'confirmed' && String(row.memberUid) === String(memberUid))
    .sort(byCapture);
  const series = [];
  for (const snap of rows) {
    const cohort = `${snap.jobCode}|${snap.roleCode}`;
    let current = series[series.length - 1];
    if (!current || current.cohort !== cohort) {
      current = { cohort, jobCode: snap.jobCode, roleCode: snap.roleCode, rows: [] };
      series.push(current);
    }
    const previous = current.rows[current.rows.length - 1];
    const deltas = {};
    if (previous) {
      for (const reading of snap.readings || []) {
        const before = (previous.readings || []).find((row) => row.key === reading.key);
        if (before && before.value != null && reading.value != null) {
          deltas[reading.key] = reading.value - before.value;
        }
      }
    }
    current.rows.push({ ...snap, deltas });
  }
  return series;
}

export function peerLatest(snapshots, jobCode, roleCode) {
  const latest = new Map();
  for (const snap of snapshots || []) {
    if (!snap || snap.status !== 'confirmed') continue;
    if (String(snap.jobCode) !== String(jobCode) || String(snap.roleCode) !== String(roleCode)) continue;
    const prev = latest.get(String(snap.memberUid));
    if (!prev || byCapture(prev, snap) < 0) latest.set(String(snap.memberUid), snap);
  }
  return [...latest.values()].sort((a, b) => String(a.memberUid).localeCompare(String(b.memberUid)));
}

export function cohortAsOf(snapshots, jobCode, roleCode, day, from) {
  const cutoff = String(day || '');
  const start = String(from || '');
  const latest = new Map();
  for (const snap of snapshots || []) {
    if (!snap || snap.status !== 'confirmed') continue;
    if (String(snap.jobCode) !== String(jobCode) || String(snap.roleCode) !== String(roleCode)) continue;
    const at = String(snap.capturedAt || '');
    if (cutoff && at > cutoff) continue;
    if (start && at < start) continue;
    const prev = latest.get(String(snap.memberUid));
    if (!prev || byCapture(prev, snap) < 0) latest.set(String(snap.memberUid), snap);
  }
  return [...latest.values()].sort((a, b) => String(a.memberUid).localeCompare(String(b.memberUid)));
}

function readingForStat(sheet, section, column, label) {
  return (sheet?.readings || []).find((row) => (
    row.section === section
    && row.column === column
    && labelsMatch(row.label, label)
    && row.value != null
    && !Number.isNaN(row.value)
  ));
}

export function cohortStatAverage(snapshots, { jobCode, roleCode, day, from, section, column, label }) {
  const values = [];
  let unit = '';
  for (const sheet of cohortAsOf(snapshots, jobCode, roleCode, day, from)) {
    const reading = readingForStat(sheet, section, column, label);
    if (!reading) continue;
    values.push(reading.value);
    unit = reading.unit || unit;
  }
  if (!values.length) return { average: null, count: 0, unit };
  const sum = values.reduce((total, value) => total + value, 0);
  return { average: sum / values.length, count: values.length, unit };
}

export function formatStatValue(reading) {
  if (!reading || reading.value == null || Number.isNaN(reading.value)) return reading?.raw || '—';
  const text = String(reading.value);
  return reading.unit === 'percent' ? `${text}%` : text;
}

export function formatDelta(delta, unit) {
  if (delta == null || Number.isNaN(delta) || delta === 0) return '';
  const sign = delta > 0 ? '+' : '';
  const text = `${sign}${delta}`;
  return unit === 'percent' ? `${text}%` : text;
}

const CSV_LEAD = ['Name', 'Discord id', 'Taken on', 'Confirmed at', 'Job', 'Role'];

export const SHEET_EXTRA_FIELDS = [
  { key: 'basePdef', label: 'Base PDEF', kind: 'number' },
  { key: 'baseMdef', label: 'Base MDEF', kind: 'number' },
  { key: 'equipmentPdef', label: 'Flat Equipment PDEF', kind: 'number' },
  { key: 'equipmentMdef', label: 'Flat Equipment MDEF', kind: 'number' },
  { key: 'elementReduction', label: 'Element reduction %', kind: 'number' },
  { key: 'reductionDemi', label: 'Reduction vs Demi-Human %', kind: 'number' },
  { key: 'weaponAtk', label: 'Weapon ATK', kind: 'number' },
  { key: 'elementDmg', label: 'Element damage %', kind: 'number' },
  { key: 'dmgDemi', label: 'DMG vs Demi-Human %', kind: 'number' },
];

export function emptyExtras() {
  return {
    basePdef: 0,
    baseMdef: 0,
    equipmentPdef: 0,
    equipmentMdef: 0,
    elementReduction: 0,
    reductionDemi: 0,
    weaponAtk: 0,
    elementDmg: 0,
    dmgDemi: 0,
  };
}

export function normalizeExtras(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const next = emptyExtras();
  for (const field of SHEET_EXTRA_FIELDS) {
    const number = Number(source[field.key]);
    next[field.key] = Number.isFinite(number) ? number : 0;
  }
  return next;
}

function extraCell(extras, field) {
  if (!extras || typeof extras !== 'object') return '';
  return String(normalizeExtras(extras)[field.key]);
}

function csvStatHeader(stats, column, label) {
  const shared = stats.filter((row) => foldStatKey(row[2]) === foldStatKey(label)).length > 1;
  return shared ? `${label} ${column}` : label;
}

function csvStatCell(reading) {
  if (!reading || reading.value == null || Number.isNaN(Number(reading.value))) return '';
  const text = String(reading.value);
  return reading.unit === 'percent' ? `${text}%` : text;
}

export function gvgStatsCsv(snapshots, { members = {}, jobs = {}, roles = {}, lists = {} } = {}) {
  const confirmed = (snapshots || []).filter((row) => row && row.status === 'confirmed');
  const stats = [
    ...parseStatKeywordList(lists.generalLeft).map((label) => ['general', 'left', label]),
    ...parseStatKeywordList(lists.generalRight).map((label) => ['general', 'right', label]),
    ...parseStatKeywordList(lists.quasiLeft).map((label) => ['quasi', 'left', label]),
    ...parseStatKeywordList(lists.quasiRight).map((label) => ['quasi', 'right', label]),
    ...parseStatKeywordList(lists.special).map((label) => ['special', 'left', label]),
  ];
  const headers = [
    ...CSV_LEAD,
    ...stats.map(([, column, label]) => csvStatHeader(stats, column, label)),
    ...SHEET_EXTRA_FIELDS.map((field) => field.label),
  ];
  const entries = confirmed
    .map((sheet) => {
      const uid = String(sheet.memberUid || '');
      const member = members[uid] || {};
      const name = member.displayName || member.inGameName || uid;
      const cells = [
        name,
        uid,
        sheet.capturedAt || '',
        sheet.confirmedAt || '',
        jobs?.[sheet.jobCode]?.name || sheet.jobCode || '',
        roles?.[sheet.roleCode]?.name || sheet.roleCode || '',
      ];
      for (const [section, column, label] of stats) {
        const reading = (sheet.readings || []).find((row) => (
          row.section === section
          && row.column === column
          && labelsMatch(row.label, label)
        ));
        cells.push(csvStatCell(reading));
      }
      for (const field of SHEET_EXTRA_FIELDS) cells.push(extraCell(sheet.extras, field));
      return {
        name,
        capturedAt: String(sheet.capturedAt || ''),
        confirmedAt: String(sheet.confirmedAt || ''),
        id: String(sheet.id || ''),
        cells,
      };
    })
    .sort((a, b) => {
      const day = a.capturedAt.localeCompare(b.capturedAt);
      if (day) return day;
      const who = a.name.localeCompare(b.name);
      if (who) return who;
      const when = a.confirmedAt.localeCompare(b.confirmedAt);
      if (when) return when;
      return a.id.localeCompare(b.id);
    });
  return {
    headers,
    rows: entries.map((row) => row.cells),
    ids: entries.map((row) => row.id),
  };
}
