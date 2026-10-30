/**
 * In-game sword SSOT: session_archive.inGameStatus/{uid} = true | omitted.
 * OCR Commit and History toggles both write through these helpers.
 */
import { buildCompositeKey } from '../../../utils/guildTime.js';
import { isOcrRaidRosterMember } from '@guildname/shared/inGameAlias';
import { syncSheetSwords } from './gvgSheet.js';

export function raidRosterUids(members) {
  return Object.entries(members || {})
    .filter(([, m]) => isOcrRaidRosterMember(m))
    .map(([uid]) => uid);
}

export function inGameStatusMapFromPresent(presentUids, rosterUids) {
  let list = [];
  if (presentUids instanceof Set) list = [...presentUids];
  else if (Array.isArray(presentUids)) list = presentUids;
  else if (presentUids && typeof presentUids === 'object') list = Object.keys(presentUids);
  const present = new Set(list.map(String));
  const next = {};
  for (const uid of rosterUids || []) {
    if (present.has(String(uid))) next[uid] = true;
  }
  return next;
}

export async function setInGameStatusFlag(db, sessionId, userId, confirmed) {
  const uid = String(userId || '').trim();
  const flagValue = confirmed === true ? true : null;
  if (!sessionId || !uid) return flagValue === true;
  const statusRef = db.ref(`attendance/session_archive/${sessionId}/inGameStatus`);
  const snap = await statusRef.once('value');
  const current = snap.exists() && snap.val() && typeof snap.val() === 'object' && !Array.isArray(snap.val())
    ? snap.val()
    : {};
  const next = { ...current };
  if (flagValue === true) next[uid] = true;
  else delete next[uid];
  await statusRef.set(Object.keys(next).length ? next : null);
  await syncSheetSwords(db, sessionId, next);
  return flagValue === true;
}

export async function replaceArchiveInGameStatus(db, sessionId, statusMap) {
  const map = statusMap && typeof statusMap === 'object' ? statusMap : {};
  await db.ref(`attendance/session_archive/${sessionId}/inGameStatus`).set(Object.keys(map).length ? map : null);
  await syncSheetSwords(db, sessionId, map);
}

export async function findLatestArchiveForEvent(db, eventDate, eventKey) {
  const { findArchiveForEvent } = await import('../../../db/database.js');
  return findArchiveForEvent(eventDate, eventKey);
}

export function pendingOcrKey(eventDate, eventKey) {
  return buildCompositeKey(eventDate, eventKey);
}

export const GVG_RESULTS = ['Win', 'Lose', '1st', '2nd', '3rd', '4th', '5th', '↓5th'];

export function gvgResultValue(value) {
  const text = String(value || '').trim();
  return GVG_RESULTS.includes(text) ? text : '';
}

export async function commitInGameForEvent(db, {
  eventDate,
  eventKey,
  statusMap,
  reviewId,
  committedBy,
  gvgResult,
} = {}) {
  const result = gvgResultValue(gvgResult);
  const archive = await findLatestArchiveForEvent(db, eventDate, eventKey);
  if (archive?.id) {
    await replaceArchiveInGameStatus(db, archive.id, statusMap);
    if (result) await db.ref(`attendance/session_archive/${archive.id}/gvgResult`).set(result);
    return { mode: 'archive', sessionId: archive.id };
  }
  const key = pendingOcrKey(eventDate, eventKey);
  const pending = {
    inGameStatus: statusMap || {},
    reviewId: reviewId || '',
    committedAt: Date.now(),
    committedBy: committedBy || '',
    eventDate,
    eventKey,
  };
  if (result) pending.gvgResult = result;
  await db.ref(`attendance/ocr_pending/${key}`).set(pending);
  return { mode: 'pending', pendingKey: key };
}

export async function consumePendingInGameStatus(db, eventDate, eventKey) {
  const key = pendingOcrKey(eventDate, eventKey);
  const snap = await db.ref(`attendance/ocr_pending/${key}`).once('value');
  if (!snap.exists()) return { inGameStatus: null, clearPath: null };
  const val = snap.val() || {};
  return {
    inGameStatus: val.inGameStatus && typeof val.inGameStatus === 'object' ? val.inGameStatus : null,
    gvgResult: gvgResultValue(val.gvgResult),
    clearPath: `attendance/ocr_pending/${key}`,
  };
}
