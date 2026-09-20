/**
 * In-game sword SSOT: session_archive.inGameStatus/{uid} = true | omitted.
 * OCR Commit and History toggles both write through these helpers.
 */
import { buildCompositeKey } from '../../../utils/guildTime.js';
import { isOcrRaidRosterMember } from '@guildname/shared/inGameAlias';

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
  const flagValue = confirmed === true ? true : null;
  await db.ref(`attendance/session_archive/${sessionId}/inGameStatus/${userId}`).set(flagValue);
  return flagValue === true;
}

export async function replaceArchiveInGameStatus(db, sessionId, statusMap) {
  await db.ref(`attendance/session_archive/${sessionId}/inGameStatus`).set(statusMap && Object.keys(statusMap).length ? statusMap : null);
}

export async function findLatestArchiveForEvent(db, eventDate, eventKey) {
  const snap = await db.ref('attendance/session_archive').once('value');
  if (!snap.exists()) return null;
  const archives = snap.val() || {};
  const matches = Object.values(archives).filter((s) => (
    s && String(s.eventDate || '') === String(eventDate || '') && String(s.eventKey || '') === String(eventKey || '')
  ));
  if (!matches.length) return null;
  matches.sort((a, b) => (Number(b.endedAt) || 0) - (Number(a.endedAt) || 0));
  return matches[0];
}

export function pendingOcrKey(eventDate, eventKey) {
  return buildCompositeKey(eventDate, eventKey);
}

export async function commitInGameForEvent(db, {
  eventDate,
  eventKey,
  statusMap,
  reviewId,
  committedBy,
} = {}) {
  const archive = await findLatestArchiveForEvent(db, eventDate, eventKey);
  if (archive?.id) {
    await replaceArchiveInGameStatus(db, archive.id, statusMap);
    return { mode: 'archive', sessionId: archive.id };
  }
  const key = pendingOcrKey(eventDate, eventKey);
  await db.ref(`attendance/ocr_pending/${key}`).set({
    inGameStatus: statusMap || {},
    reviewId: reviewId || '',
    committedAt: Date.now(),
    committedBy: committedBy || '',
    eventDate,
    eventKey,
  });
  return { mode: 'pending', pendingKey: key };
}

export async function consumePendingInGameStatus(db, eventDate, eventKey) {
  const key = pendingOcrKey(eventDate, eventKey);
  const snap = await db.ref(`attendance/ocr_pending/${key}`).once('value');
  if (!snap.exists()) return { inGameStatus: null, clearPath: null };
  const val = snap.val() || {};
  return {
    inGameStatus: val.inGameStatus && typeof val.inGameStatus === 'object' ? val.inGameStatus : null,
    clearPath: `attendance/ocr_pending/${key}`,
  };
}
