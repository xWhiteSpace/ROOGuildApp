/**
 * In-game name / alias SSOT helpers for Masterlist, Attendance card, and Party OCR.
 * OCR matching prefers aliases, then displayName, then a Latin-core fallback so
 * mixed IGNs like "Akeno愛" can still hit OCR text "Akeno".
 */

export const IN_GAME_NAME_MAX_LEN = 100;
export const OCR_MATCH_THRESHOLD = 0.70;
const MIN_LATIN_CORE = 3;

export function sanitizeInGameName(raw) {
  return String(raw || '').trim().slice(0, IN_GAME_NAME_MAX_LEN);
}

export function splitAliases(inGameName) {
  return String(inGameName || '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

export function normalizeNameToken(value) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/\s+/g, '')
    .replace(/afk$/i, '')
    .toLowerCase();
}

export function latinCore(value) {
  return normalizeNameToken(value)
    .replace(/[^\x00-\x7F]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

/** Fold OCR lookalikes before comparing (0/O, 1/l, 5/S). */
export function foldConfusable(value) {
  return latinCore(value)
    .replace(/0/g, 'o')
    .replace(/1/g, 'l')
    .replace(/5/g, 's')
    .replace(/8/g, 'b')
    .replace(/\$/g, 's');
}

export function levenshtein(a, b) {
  const s = String(a || '');
  const t = String(b || '');
  if (s === t) return 0;
  if (!s.length) return t.length;
  if (!t.length) return s.length;
  const prev = new Array(t.length + 1);
  const cur = new Array(t.length + 1);
  for (let j = 0; j <= t.length; j += 1) prev[j] = j;
  for (let i = 1; i <= s.length; i += 1) {
    cur[0] = i;
    for (let j = 1; j <= t.length; j += 1) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      cur[j] = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= t.length; j += 1) prev[j] = cur[j];
  }
  return prev[t.length];
}

function fuzzyScore(left, right) {
  if (!left || !right) return 0;
  if (left === right) return 1;
  const dist = levenshtein(left, right);
  const maxLen = Math.max(left.length, right.length);
  if (maxLen < MIN_LATIN_CORE) return 0;
  if (dist <= 1 && maxLen <= 3) return 0.74;
  if (dist <= 2) return 1 - dist / maxLen;
  if (dist === 3 && maxLen >= 7) return 1 - dist / maxLen;
  return 0;
}

export function scoreNameMatch(ocrText, candidate) {
  const ocrN = normalizeNameToken(ocrText);
  const candN = normalizeNameToken(candidate);
  let best = fuzzyScore(ocrN, candN);
  if (best >= 1) return 1;

  const ocrL = latinCore(ocrText);
  const candL = latinCore(candidate);
  if (ocrL.length >= MIN_LATIN_CORE && candL.length >= MIN_LATIN_CORE) {
    best = Math.max(best, fuzzyScore(ocrL, candL) * 0.94);
  }

  const ocrF = foldConfusable(ocrText);
  const candF = foldConfusable(candidate);
  if (ocrF.length >= MIN_LATIN_CORE && candF.length >= MIN_LATIN_CORE) {
    best = Math.max(best, fuzzyScore(ocrF, candF) * 0.9);
  }

  const prefixes = ['partyof', 'party', 'teamof', 'team', 'guild'];
  let stripped = ocrF;
  for (const prefix of prefixes) {
    if (stripped.startsWith(prefix) && stripped.length - prefix.length >= MIN_LATIN_CORE) {
      stripped = stripped.slice(prefix.length);
      break;
    }
  }
  if (stripped !== ocrF && candF.length >= MIN_LATIN_CORE) {
    best = Math.max(best, fuzzyScore(stripped, candF) * 0.93);
  }

  if (candF.length >= 5 && candF[0] === 'i') {
    best = Math.max(best, fuzzyScore(ocrF, candF.slice(1)) * 0.9);
  }

  const ocrTrim = ocrF.replace(/[o0]+$/g, '');
  const candTrim = candF.replace(/[o0]+$/g, '');
  if (ocrTrim !== ocrF || candTrim !== candF) {
    if (ocrTrim.length >= MIN_LATIN_CORE && candTrim.length >= MIN_LATIN_CORE) {
      best = Math.max(best, fuzzyScore(ocrTrim, candTrim) * 0.92);
    }
  }

  if (ocrF.length >= 4 && candF.length >= 4) {
    if (ocrF.endsWith(candF) || candF.endsWith(ocrF) || ocrF.startsWith(candF) || candF.startsWith(ocrF)) {
      const extra = Math.abs(ocrF.length - candF.length);
      const ratio = Math.min(ocrF.length, candF.length) / Math.max(ocrF.length, candF.length);
      if (extra <= 2) best = Math.max(best, 0.86);
      else if (ratio >= 0.45) best = Math.max(best, 0.82 + 0.15 * ratio);
    } else if (ocrF.includes(candF) || candF.includes(ocrF)) {
      const ratio = Math.min(ocrF.length, candF.length) / Math.max(ocrF.length, candF.length);
      if (ratio >= 0.5) best = Math.max(best, 0.78 * ratio + 0.16);
    }
  }

  if (ocrF.length >= 6 && candF.length >= 6 && ocrF.slice(-4) === candF.slice(-4)) {
    const ratio = 4 / Math.max(ocrF.length, candF.length);
    if (ratio >= 0.4) best = Math.max(best, 0.72 + 0.12 * ratio);
  }

  return best;
}

export function memberMatchCandidates(member) {
  const names = [
    ...splitAliases(member?.inGameName),
    member?.displayName,
    member?.name,
  ].filter(Boolean);
  return [...new Set(names.map((n) => String(n)))];
}

export function isOcrRaidRosterMember(member) {
  return member?.isRaidRoster === true && member?.status !== 'Ghost';
}

export function bestRosterMatch(ocrText, members) {
  let best = null;
  for (const [uid, member] of Object.entries(members || {})) {
    if (!isOcrRaidRosterMember(member)) continue;
    for (const candidate of memberMatchCandidates(member)) {
      const score = scoreNameMatch(ocrText, candidate);
      if (!best || score > best.score) best = { uid, ocrText, score, candidate };
    }
  }
  return best;
}

/**
 * Greedy 1:1 match of OCR tokens onto raid-roster members.
 * Accepts strings or { text, col, row, imageSource, imageIndex }.
 * Returns { matched: [{ uid, ocrText, score, ...meta }], unmatched: [{ text, ...meta }] }.
 */
export function matchOcrTokensToRoster(ocrTexts, members) {
  const roster = Object.entries(members || {}).filter(([, m]) => isOcrRaidRosterMember(m));
  const taken = new Set();
  const matched = [];
  const unmatched = [];

  const uniqueRecords = [];
  const seen = new Set();
  for (const raw of Array.isArray(ocrTexts) ? ocrTexts : []) {
    const rec = typeof raw === 'string' ? { text: raw } : { ...(raw || {}) };
    const text = String(rec.text || '').trim();
    if (!text) continue;
    const key = foldConfusable(text) || normalizeNameToken(text);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    uniqueRecords.push({ ...rec, text });
  }

  const scored = [];
  for (const rec of uniqueRecords) {
    let best = null;
    for (const [uid, member] of roster) {
      for (const candidate of memberMatchCandidates(member)) {
        const score = scoreNameMatch(rec.text, candidate);
        if (score >= OCR_MATCH_THRESHOLD && (!best || score > best.score)) {
          best = {
            uid,
            ocrText: rec.text,
            score,
            candidate,
            col: rec.col ?? null,
            row: rec.row ?? null,
            imageSource: rec.imageSource || '',
            imageIndex: Number.isInteger(rec.imageIndex) ? rec.imageIndex : null,
          };
        }
      }
    }
    if (best) scored.push(best);
    else unmatched.push({
      text: rec.text,
      col: rec.col ?? null,
      row: rec.row ?? null,
      imageSource: rec.imageSource || '',
      imageIndex: Number.isInteger(rec.imageIndex) ? rec.imageIndex : null,
    });
  }

  scored.sort((a, b) => b.score - a.score);
  for (const hit of scored) {
    if (taken.has(hit.uid)) {
      unmatched.push({
        text: hit.ocrText,
        col: hit.col ?? null,
        row: hit.row ?? null,
        imageSource: hit.imageSource || '',
        imageIndex: hit.imageIndex,
      });
      continue;
    }
    taken.add(hit.uid);
    matched.push({
      uid: hit.uid,
      ocrText: hit.ocrText,
      score: hit.score,
      col: hit.col ?? null,
      row: hit.row ?? null,
      imageSource: hit.imageSource || '',
      imageIndex: hit.imageIndex,
    });
  }

  return { matched, unmatched };
}
