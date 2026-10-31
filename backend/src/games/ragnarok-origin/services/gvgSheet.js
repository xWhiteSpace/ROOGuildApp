import { buildSheetCell, cellWithSwords } from '@guildname/shared/gvgCell';
import { loadSessionArchive } from '../../../db/database.js';
import { getCurrentGameId, getCurrentTenantId } from '../../../db/tenantContext.js';
import { membershipWindows, warInWindow } from './memberHistory.js';

export const GVG_SHEET_PATH = 'attendance/gvg_sheet';
export const SHEET_PAGE = 8;
const SHEET_INDEX_MAX = 50;

const inflight = new Map();

export function identityFromMember(uid, member) {
  const id = String(uid);
  const source = member && typeof member === 'object' ? member : {};
  return {
    uid: id,
    displayName: String(source.displayName || ''),
    alias: String(source.inGameName || ''),
    jobCode: String(source.jobCode || ''),
    roleCode: String(source.roleCode || ''),
    snowflake: id,
  };
}

export function blankIdentity(uid) {
  const id = String(uid);
  return { uid: id, displayName: '', alias: '', jobCode: '', roleCode: '', snowflake: id };
}

export function raidRosterIdentities(members) {
  return Object.entries(members || {})
    .filter(([, member]) => member?.isRaidRoster === true)
    .map(([uid, member]) => identityFromMember(uid, member));
}

export function appendRows(rows, identities) {
  const list = Array.isArray(rows) ? rows.slice() : [];
  const seen = new Set(list.map((row) => String(row?.uid || '')));
  for (const identity of identities || []) {
    const uid = String(identity?.uid || '');
    if (!uid || seen.has(uid)) continue;
    list.push(identity);
    seen.add(uid);
  }
  return list;
}

function cellForUid(uid, session) {
  const id = String(uid);
  return buildSheetCell({
    commitment: session?.commitments?.[id],
    presentTicks: session?.userTallies?.[id] || 0,
    totalPulses: session?.totalPulses || 0,
    swords: session?.inGameStatus?.[id] === true,
  });
}

function hasTrace(uid, session) {
  const id = String(uid);
  if (session?.inGameStatus?.[id] === true) return true;
  if (session?.userTallies && Object.prototype.hasOwnProperty.call(session.userTallies, id)) return true;
  if (session?.commitments && Object.prototype.hasOwnProperty.call(session.commitments, id)) return true;
  return false;
}

export function backfillCells(session) {
  const cells = {};
  const seen = new Set([
    ...Object.keys(session?.userTallies || {}),
    ...Object.keys(session?.commitments || {}),
    ...Object.keys(session?.inGameStatus || {}),
  ]);
  for (const uid of seen) {
    if (!hasTrace(uid, session)) continue;
    cells[String(uid)] = cellForUid(uid, session);
  }
  return cells;
}

export function freshWarCells(identities, session) {
  const cells = {};
  for (const row of identities || []) {
    cells[row.uid] = cellForUid(row.uid, session);
  }
  return cells;
}

export function warSheetFromRoster(members, session) {
  const roster = raidRosterIdentities(members);
  return {
    rows: roster,
    sheet: {
      ready: true,
      backfill: false,
      cells: freshWarCells(roster, session),
    },
  };
}

function byNewest(a, b) {
  const date = String(b.eventDate || '').localeCompare(String(a.eventDate || ''));
  if (date !== 0) return date;
  return (Number(b.endedAt) || 0) - (Number(a.endedAt) || 0);
}

function scoreMap(sheet) {
  const scores = {};
  for (const [uid, cell] of Object.entries(sheet?.cells || {})) {
    const score = Number(cell?.score);
    if (!Number.isFinite(score)) continue;
    scores[String(uid)] = score;
  }
  return scores;
}

function orderKey(war) {
  const date = String(war?.eventDate || '');
  const ended = String(Number(war?.endedAt) || 0).padStart(16, '0');
  return `${date}|${ended}`;
}

const GVG_RESULTS = ['Win', 'Lose', '1st', '2nd', '3rd', '4th', '5th', '↓5th'];

function sheetGvgResult(value) {
  const text = String(value || '').trim();
  return GVG_RESULTS.includes(text) ? text : '';
}

function dateMeta(session) {
  return {
    id: session.id,
    eventDate: session.eventDate || '',
    eventTitle: session.eventTitle || '',
    endedAt: Number(session.endedAt) || 0,
    totalPulses: Number(session.totalPulses) || 0,
    gvgResult: sheetGvgResult(session.gvgResult),
    backfill: session.sheet?.backfill === true,
    orderKey: orderKey(session),
  };
}

function scoresForWar(war, windows, allowed) {
  const scores = scoreMap(war?.sheet);
  for (const uid of allowed || []) {
    const id = String(uid || '');
    if (!id || Object.prototype.hasOwnProperty.call(scores, id)) continue;
    if (war?.sheet?.cells && Object.prototype.hasOwnProperty.call(war.sheet.cells, id)) continue;
    if (warInWindow(war?.eventDate, windows, id)) scores[id] = 0;
  }
  return scores;
}

function derivedCell(war) {
  return {
    calendar: 'None',
    swords: false,
    discord: false,
    duration: 0,
    presentTicks: 0,
    totalPulses: Number(war?.totalPulses) || 0,
    score: 0,
    derived: true,
  };
}

function cellsForWar(war, scores) {
  const cells = {};
  for (const [uid, cell] of Object.entries(war?.sheet?.cells || {})) {
    if (!Object.prototype.hasOwnProperty.call(scores, uid)) continue;
    cells[uid] = publicCell(cell);
  }
  for (const uid of Object.keys(scores || {})) {
    if (cells[uid] || scores[uid] !== 0) continue;
    cells[uid] = derivedCell(war);
  }
  return cells;
}

function publicCell(cell) {
  return {
    calendar: cell?.calendar || 'None',
    swords: cell?.swords === true,
    discord: cell?.discord === true,
    duration: Number(cell?.duration) || 0,
    presentTicks: Number(cell?.presentTicks) || 0,
    totalPulses: Number(cell?.totalPulses) || 0,
    score: Number(cell?.score) || 0,
  };
}

async function loadRows(db) {
  const snap = await db.ref(GVG_SHEET_PATH).once('value');
  const rows = snap.exists() ? snap.val()?.rows : null;
  return Array.isArray(rows) ? rows : [];
}

function rowLabel(row, members) {
  const live = members?.[row?.uid];
  return String(live?.displayName || row?.displayName || row?.alias || row?.snowflake || row?.uid || '').toLowerCase();
}

function finiteScore(value) {
  const score = Number(value);
  return Number.isFinite(score) ? score : null;
}

export function sortEventRows(rows, scores) {
  return (rows || []).slice().sort((a, b) => {
    const scoreA = finiteScore(scores?.[a?.uid]);
    const scoreB = finiteScore(scores?.[b?.uid]);
    if (scoreA == null && scoreB == null) return 0;
    if (scoreA == null) return 1;
    if (scoreB == null) return -1;
    if (scoreA !== scoreB) return scoreB - scoreA;
    return 0;
  });
}

async function arrangeSheetRows(db, sheetRows) {
  const snap = await db.ref('auction/members').once('value');
  const members = snap.exists() ? snap.val() || {} : {};
  const byUid = new Map((sheetRows || []).map((row) => [String(row.uid), row]));
  const roster = [];
  const seen = new Set();
  for (const [uid, member] of Object.entries(members)) {
    if (member?.isRaidRoster !== true) continue;
    const id = String(uid);
    roster.push(byUid.get(id) || identityFromMember(id, member));
    seen.add(id);
  }
  roster.sort((a, b) => rowLabel(a, members).localeCompare(rowLabel(b, members)));
  const archived = (sheetRows || [])
    .filter((row) => !seen.has(String(row.uid)))
    .map((row) => ({ ...row, archived: true }))
    .sort((a, b) => rowLabel(a, members).localeCompare(rowLabel(b, members)));
  return [...roster, ...archived];
}

async function identitiesForGaps(db, wars, rows) {
  const seen = new Set(rows.map((row) => String(row?.uid || '')));
  const oldestFirst = wars.slice().sort((a, b) => byNewest(b, a));
  const missing = [];
  for (const war of oldestFirst) {
    for (const uid of Object.keys(war.sheet?.cells || {})) {
      if (seen.has(uid)) continue;
      missing.push(uid);
      seen.add(uid);
    }
  }
  if (!missing.length) return [];
  const membersSnap = await db.ref('auction/members').once('value');
  const members = membersSnap.exists() ? membersSnap.val() || {} : {};
  return missing.map((uid) => (members[uid] ? identityFromMember(uid, members[uid]) : blankIdentity(uid)));
}

async function repairRows(db, wars) {
  const rows = await loadRows(db);
  const identities = await identitiesForGaps(db, wars, rows);
  if (!identities.length) return;
  await db.ref(GVG_SHEET_PATH).set({ rows: appendRows(rows, identities) });
}

async function runEnsure(db) {
  const slim = await loadSessionArchive({ limit: SHEET_INDEX_MAX, fields: 'sheet' });
  const wars = Object.values(slim || {}).filter((war) => war?.id);
  const missing = wars.filter((war) => war.sheet?.ready !== true);
  if (!missing.length) {
    await repairRows(db, wars);
    return wars;
  }

  const [membersSnap, trend, rows] = await Promise.all([
    db.ref('auction/members').once('value'),
    loadSessionArchive({ limit: SHEET_INDEX_MAX, fields: 'trend' }),
    loadRows(db),
  ]);
  const members = membersSnap.exists() ? membersSnap.val() || {} : {};
  let nextRows = rows;
  const oldestFirst = missing.slice().sort((a, b) => byNewest(b, a));
  for (const war of oldestFirst) {
    const session = trend?.[war.id];
    if (!session) continue;
    const flagSnap = await db.ref(`attendance/session_archive/${war.id}/inGameStatus`).once('value');
    if (flagSnap.exists() && flagSnap.val() && typeof flagSnap.val() === 'object') {
      session.inGameStatus = flagSnap.val();
    }
    const cells = backfillCells(session);
    const identities = Object.keys(cells).map((uid) => (
      members[uid] ? identityFromMember(uid, members[uid]) : blankIdentity(uid)
    ));
    nextRows = appendRows(nextRows, identities);
    const sheet = { ready: true, backfill: true, cells };
    await db.ref(`attendance/session_archive/${war.id}/sheet`).set(sheet);
    war.sheet = sheet;
  }
  await db.ref(GVG_SHEET_PATH).set({ rows: nextRows });
  await repairRows(db, wars);
  return wars;
}

export function ensureGvgSheets(db) {
  const key = `${getCurrentTenantId() || ''}:${getCurrentGameId() || ''}`;
  if (!inflight.has(key)) {
    const job = runEnsure(db).finally(() => inflight.delete(key));
    inflight.set(key, job);
  }
  return inflight.get(key);
}

async function loadSheetWars(db) {
  const wars = await ensureGvgSheets(db);
  return (wars || []).filter((war) => war?.id).sort(byNewest);
}

function warPulses(cells) {
  for (const cell of Object.values(cells || {})) {
    const pulses = Number(cell?.totalPulses);
    if (pulses > 0) return pulses;
  }
  return 0;
}

export async function syncSheetSwords(db, sessionId, statusMap) {
  const id = String(sessionId || '').trim();
  if (!id) return null;
  const ref = db.ref(`attendance/session_archive/${id}/sheet`);
  const snap = await ref.once('value');
  const sheet = snap.exists() ? snap.val() : null;
  if (!sheet?.cells || typeof sheet.cells !== 'object') return null;
  const pulses = warPulses(sheet.cells);
  const cells = {};
  for (const [uid, cell] of Object.entries(sheet.cells)) {
    cells[uid] = cellWithSwords(cell, statusMap?.[uid] === true);
  }
  for (const [uid, on] of Object.entries(statusMap || {})) {
    if (on !== true || cells[uid]) continue;
    cells[uid] = buildSheetCell({ presentTicks: 0, totalPulses: pulses, swords: true });
  }
  const next = { ...sheet, ready: true, cells };
  await ref.set(next);
  return next;
}

export async function readGvgAttendance(db, offset = 0) {
  const wars = await loadSheetWars(db);
  const rows = await arrangeSheetRows(db, await loadRows(db));
  const start = Math.max(0, Number(offset) || 0);
  const page = wars.slice(start, start + SHEET_PAGE);
  const windows = await membershipWindows(db);
  const allowed = rows.map((row) => row.uid);
  const scores = {};
  const cells = {};
  for (const war of page) {
    const warScores = scoresForWar(war, windows, allowed);
    scores[war.id] = warScores;
    cells[war.id] = cellsForWar(war, warScores);
  }
  return {
    rows,
    dates: page.map(dateMeta),
    scores,
    cells,
    offset: start,
    limit: SHEET_PAGE,
    total: wars.length,
  };
}

export async function readGvgCatalog(db) {
  const wars = await loadSheetWars(db);
  return {
    dates: wars.map((war) => ({
      id: war.id,
      eventDate: war.eventDate || '',
      eventTitle: war.eventTitle || '',
      endedAt: Number(war.endedAt) || 0,
    })),
  };
}

export async function readGvgRows(db) {
  await ensureGvgSheets(db);
  return { rows: await arrangeSheetRows(db, await loadRows(db)) };
}

export async function readGvgEvent(db, sessionId) {
  const id = String(sessionId || '').trim();
  if (!id) return null;
  const wars = await loadSheetWars(db);
  const war = wars.find((item) => item.id === id);
  if (!war?.id) return null;
  const rows = await arrangeSheetRows(db, await loadRows(db));
  const scores = scoresForWar(war, await membershipWindows(db), rows.map((row) => row.uid));
  const visible = sortEventRows(
    rows.filter((row) => Object.prototype.hasOwnProperty.call(scores, row.uid)),
    scores,
  );
  const cells = cellsForWar(war, scores);
  return {
    date: dateMeta(war),
    rows: visible,
    scores: { [war.id]: scores },
    cells,
  };
}

export async function readGvgMember(db, uid, offset = 0) {
  const id = String(uid || '').trim();
  if (!id) return null;
  const wars = await loadSheetWars(db);
  const rows = await loadRows(db);
  const start = Math.max(0, Number(offset) || 0);
  const page = wars.slice(start, start + SHEET_PAGE);
  const row = rows.find((item) => item.uid === id) || blankIdentity(id);
  const windows = await membershipWindows(db);
  const scores = {};
  for (const war of page) {
    const cell = war.sheet?.cells?.[id];
    if (cell && Number.isFinite(Number(cell.score))) {
      scores[war.id] = Number(cell.score);
      continue;
    }
    if (warInWindow(war.eventDate, windows, id)) scores[war.id] = 0;
  }
  return {
    row,
    dates: page.map(dateMeta),
    scores,
    offset: start,
    limit: SHEET_PAGE,
    total: wars.length,
  };
}

export async function readGvgDetails(db, sessionId) {
  const id = String(sessionId || '').trim();
  if (!id) return null;
  const wars = await loadSheetWars(db);
  const war = wars.find((item) => item.id === id);
  if (!war?.id) return null;
  const rows = await arrangeSheetRows(db, await loadRows(db));
  const scores = scoresForWar(war, await membershipWindows(db), rows.map((row) => row.uid));
  return { id, cells: cellsForWar(war, scores) };
}

export async function readGvgStats(db, limit = 12) {
  const wars = await loadSheetWars(db);
  const rows = await arrangeSheetRows(db, await loadRows(db));
  const n = Math.min(SHEET_INDEX_MAX, Math.max(1, parseInt(limit, 10) || 12));
  const page = wars.slice(0, n);
  const windows = await membershipWindows(db);
  const allowed = rows.map((row) => row.uid);
  const scores = {};
  const dates = page.map((war) => {
    const map = scoresForWar(war, windows, allowed);
    scores[war.id] = map;
    const values = Object.values(map);
    const guildPct = values.length
      ? (values.reduce((sum, score) => sum + score, 0) / values.length / 4) * 100
      : 0;
    return {
      id: war.id,
      eventDate: war.eventDate || '',
      endedAt: Number(war.endedAt) || 0,
      guildPct,
      count: values.length,
    };
  });
  return { rows, dates, scores };
}

export function summarizeGvgWinRate(wars) {
  let win = 0;
  let first = 0;
  let other = 0;
  let unmarked = 0;
  let previous = '';
  for (const war of wars || []) {
    const result = sheetGvgResult(war?.gvgResult);
    if (!result) unmarked += 1;
    else if (result === 'Win') win += 1;
    else if (result === '1st') first += 1;
    else other += 1;
    if (!previous && result) previous = result;
  }
  const marked = win + first + other;
  const percent = marked ? Math.round(((win + first) / marked) * 100) : null;
  return { percent, win, first, other, unmarked, marked, previous };
}

export async function readGvgWinRate(db) {
  const wars = await loadSheetWars(db);
  return summarizeGvgWinRate(wars);
}
