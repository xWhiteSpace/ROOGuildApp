import { randomBytes } from 'crypto';
import { buildSnapshot, prepareReadings } from '@guildname/shared/gvgStatSheet';

const DRAFTS = 'attendance/gvg_stat_drafts';
const SNAPSHOTS = 'attendance/gvg_stat_snapshots';

function docId(prefix) {
  return `${prefix}_${Date.now().toString(36)}${randomBytes(3).toString('hex')}`;
}

function asMap(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value;
}

export async function listStatSnapshots(db) {
  const snap = await db.ref(SNAPSHOTS).once('value');
  return Object.values(asMap(snap.exists() ? snap.val() : null)).filter((row) => row && row.status === 'confirmed');
}

export async function loadStatDraft(db, id) {
  const snap = await db.ref(`${DRAFTS}/${id}`).once('value');
  return snap.exists() ? snap.val() : null;
}

export async function saveStatDraft(db, draft) {
  await db.ref(`${DRAFTS}/${draft.id}`).set(draft);
  return draft;
}

export function createDraft({ memberUid, capturedAt, shareCode, readings, warnings }) {
  return {
    id: docId('draft'),
    status: 'draft',
    memberUid: String(memberUid || ''),
    capturedAt: String(capturedAt || ''),
    shareCode: shareCode || '',
    readings: prepareReadings(readings),
    warnings: Array.isArray(warnings) ? warnings : [],
    createdAt: new Date().toISOString(),
  };
}

export async function deleteStatSnapshot(db, id) {
  const key = String(id || '').trim();
  if (!key) return false;
  const ref = db.ref(`${SNAPSHOTS}/${key}`);
  const snap = await ref.once('value');
  if (!snap.exists()) return false;
  await ref.remove();
  return true;
}

export async function clearStatStore(db) {
  await db.ref(SNAPSHOTS).remove();
  await db.ref(DRAFTS).remove();
}

export async function confirmStatDraft(db, draft, member) {
  if (!draft || draft.status === 'confirmed') {
    return { ok: false, error: 'This sheet was already confirmed.' };
  }
  const built = buildSnapshot({
    draft,
    member,
    id: docId('snap'),
    confirmedAt: new Date().toISOString(),
  });
  if (!built.ok) return built;
  await db.ref(`${SNAPSHOTS}/${built.snapshot.id}`).set(built.snapshot);
  const next = { ...draft, status: 'confirmed', snapshotId: built.snapshot.id };
  await saveStatDraft(db, next);
  return { ok: true, snapshot: built.snapshot, draft: next };
}
