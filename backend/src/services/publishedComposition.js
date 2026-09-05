/**
 * Published (sent) Raid Compose snapshots + Set Active anchor.
 * Party / Attendance Discord cards read the anchor; Live Raid starts from a snapshot.
 */
import { getDatabase } from 'firebase-admin/database';

export const PUBLISHED_PATH = 'attendance/published';
export const ANCHOR_PATH = 'attendance/published_anchor';

export function publishedIdFromSession(session, sessionId) {
  if (sessionId) return String(sessionId);
  if (session?.eventDate && session?.eventKey) {
    return `${session.eventDate}_${session.eventKey}`;
  }
  return null;
}

function snapshotGrids(grids) {
  try {
    return JSON.parse(JSON.stringify(grids || {}));
  } catch {
    return grids || {};
  }
}

export async function resolveAnchoredComposition(dbArg) {
  const db = dbArg || getDatabase();
  const anchorSnap = await db.ref(ANCHOR_PATH).once('value');
  const id = anchorSnap.exists() ? anchorSnap.val() : null;
  if (!id) return null;
  const snap = await db.ref(`${PUBLISHED_PATH}/${id}`).once('value');
  if (!snap.exists()) return null;
  return { id, ...snap.val() };
}

export async function listPublished(dbArg) {
  const db = dbArg || getDatabase();
  const [listSnap, anchorSnap] = await Promise.all([
    db.ref(PUBLISHED_PATH).once('value'),
    db.ref(ANCHOR_PATH).once('value'),
  ]);
  return {
    published: listSnap.exists() ? listSnap.val() : {},
    anchor: anchorSnap.exists() ? anchorSnap.val() : null,
  };
}

/**
 * Persist a compose-session snapshot. First publish auto-anchors if none is set.
 */
export async function writePublishedSnapshot({ db, session, sessionId, sentBy }) {
  const database = db || getDatabase();
  const id = publishedIdFromSession(session, sessionId);
  if (!id || !session) {
    return { ok: false, error: 'No compose session to publish.' };
  }
  const grids = snapshotGrids(session.grids);
  const payload = {
    eventKey: session.eventKey || '',
    eventDate: session.eventDate || '',
    eventTitle: session.eventTitle || session.eventKey || 'Raid',
    configId: session.configId || '',
    configTitle: session.configTitle || session.configId || '',
    grids,
    selectedGridIds: session.selectedGridIds || Object.keys(grids),
    sentAt: Date.now(),
    sentBy: sentBy || 'Officer',
    sourceComposeId: id,
  };
  await database.ref(`${PUBLISHED_PATH}/${id}`).set(payload);

  const anchorSnap = await database.ref(ANCHOR_PATH).once('value');
  const currentAnchor = anchorSnap.exists() ? anchorSnap.val() : null;
  let autoAnchored = false;
  if (!currentAnchor) {
    await database.ref(ANCHOR_PATH).set(id);
    autoAnchored = true;
  }
  return { ok: true, id, autoAnchored, payload };
}

export async function setPublishedAnchor({ db, id, active }) {
  const database = db || getDatabase();
  const key = String(id || '');
  if (!key) return { ok: false, error: 'Composition id is required.' };

  if (active) {
    const snap = await database.ref(`${PUBLISHED_PATH}/${key}`).once('value');
    if (!snap.exists()) {
      return { ok: false, error: 'Published composition not found.' };
    }
    await database.ref(ANCHOR_PATH).set(key);
    return { ok: true, id: key };
  }

  const current = (await database.ref(ANCHOR_PATH).once('value')).val();
  if (current === key) {
    await database.ref(ANCHOR_PATH).remove();
  }
  return { ok: true, id: null };
}

export async function deletePublished({ db, id }) {
  const database = db || getDatabase();
  const key = String(id || '');
  if (!key) return { ok: false, error: 'Composition id is required.' };
  await database.ref(`${PUBLISHED_PATH}/${key}`).remove();
  const current = (await database.ref(ANCHOR_PATH).once('value')).val();
  if (current === key) {
    await database.ref(ANCHOR_PATH).remove();
  }
  return { ok: true };
}
