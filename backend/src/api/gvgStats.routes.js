import { Router } from 'express';
import multer from 'multer';
import { getTenantStore } from '../db/database.js';
import { resolveUserIdentity } from '../auth/identity.js';
import { checkOfficer } from '../auth/officer.js';
import { SHOT_KINDS, SHOT_LABELS, applyStatKeywords, cohortAsOf, mergeShotReadings, progressionFor, unifyReadings } from '@guildname/shared/gvgStatSheet';
import { readStatShots } from '../games/ragnarok-origin/services/statSheetOcr.js';
import {
  confirmStatDraft,
  createDraft,
  clearStatStore,
  listStatSnapshots,
  loadStatDraft,
  saveStatDraft,
} from '../games/ragnarok-origin/services/statSnapshots.js';

const router = Router();
const MAX_SHOTS = SHOT_KINDS.length;

const shotUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: MAX_SHOTS },
});

function handleShotUpload(req, res, next) {
  shotUpload.array('files', MAX_SHOTS)(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ success: false, error: 'Each screenshot must be 8 MB or smaller.' });
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({ success: false, error: 'Upload at most 4 screenshots.' });
    }
    return res.status(400).json({ success: false, error: err.message || 'Upload failed.' });
  });
}

function requireUser(req, res) {
  const user = resolveUserIdentity(req);
  if (!user) {
    res.status(401).json({ success: false, error: 'Session identity missing' });
    return null;
  }
  return user;
}

function parseKinds(body, count) {
  let kinds = body?.kinds;
  if (typeof kinds === 'string') {
    try {
      kinds = JSON.parse(kinds);
    } catch {
      kinds = String(kinds).split(',');
    }
  }
  if (!Array.isArray(kinds) || kinds.length !== count) return null;
  const cleaned = kinds.map((kind) => String(kind || '').trim());
  if (cleaned.some((kind) => !SHOT_KINDS.includes(kind))) return null;
  return cleaned;
}

router.get('/snapshots', async (req, res) => {
  if (!requireUser(req, res)) return;
  try {
    const snapshots = await listStatSnapshots(getTenantStore());
    const memberUid = String(req.query.memberUid || '').trim();
    const rows = memberUid ? snapshots.filter((row) => String(row.memberUid) === memberUid) : snapshots;
    return res.json({ success: true, snapshots: rows });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/progression/:uid', async (req, res) => {
  if (!requireUser(req, res)) return;
  try {
    const snapshots = await listStatSnapshots(getTenantStore());
    const series = progressionFor(snapshots, req.params.uid);
    const jobCode = String(req.query.jobCode || '').trim();
    const roleCode = String(req.query.roleCode || '').trim();
    const capturedAt = String(req.query.capturedAt || '').trim();
    const from = String(req.query.from || '').trim();
    const cohort = jobCode && roleCode && capturedAt
      ? cohortAsOf(snapshots, jobCode, roleCode, capturedAt, from)
      : [];
    return res.json({ success: true, series, cohort });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/drafts', handleShotUpload, async (req, res) => {
  if (!requireUser(req, res)) return;
  try {
    const files = Array.isArray(req.files) ? req.files : [];
    if (!files.length) return res.status(400).json({ success: false, error: 'Upload at least one Character screenshot.' });
    const kinds = parseKinds(req.body, files.length);
    if (!kinds) return res.status(400).json({ success: false, error: 'Each screenshot needs a section.' });
    const memberUid = String(req.body.memberUid || '').trim();
    if (!memberUid) return res.status(400).json({ success: false, error: 'Pick a member first.' });
    const read = await readStatShots(files.map((file, index) => ({
      buffer: file.buffer,
      kind: kinds[index],
    })));
    if (!read.readings.length) {
      const detail = read.warnings.map((row) => `${SHOT_LABELS[row.kind] || row.kind}: ${row.warning}`).join(' ');
      return res.status(422).json({ success: false, error: detail || 'No stat rows were read.' });
    }
    const db = getTenantStore();
    const configSnap = await db.ref('settings/configuration').once('value');
    const config = configSnap.exists() ? configSnap.val() || {} : {};
    const lists = {
      general: {
        col1: config.gvgGeneralStatsCol1 || config.gvgGeneralStats,
        col2: config.gvgGeneralStatsCol2 || config.gvgGeneralStats,
      },
      quasi: {
        col1: config.gvgQuasiStatsCol1 || config.gvgQuasiStats,
        col2: config.gvgQuasiStatsCol2 || config.gvgQuasiStats,
      },
    };
    const shots = (read.shots || [{ kind: 'general', readings: read.readings }]).map((shot) => ({
      ...shot,
      readings: applyStatKeywords(shot.readings, lists),
    }));
    const readings = unifyReadings(mergeShotReadings(shots));
    const draft = createDraft({
      memberUid,
      capturedAt: req.body.capturedAt,
      shareCode: read.shareCode,
      readings,
      warnings: read.warnings,
    });
    await saveStatDraft(db, draft);
    return res.json({ success: true, draft });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.patch('/drafts/:id', async (req, res) => {
  if (!requireUser(req, res)) return;
  try {
    const db = getTenantStore();
    const draft = await loadStatDraft(db, req.params.id);
    if (!draft) return res.status(404).json({ success: false, error: 'Draft not found.' });
    if (draft.status === 'confirmed') return res.status(400).json({ success: false, error: 'This sheet was already confirmed.' });
    const next = createDraft({
      memberUid: draft.memberUid,
      capturedAt: req.body.capturedAt || draft.capturedAt,
      shareCode: req.body.shareCode != null ? req.body.shareCode : draft.shareCode,
      readings: req.body.readings || draft.readings,
      warnings: draft.warnings,
    });
    next.id = draft.id;
    next.createdAt = draft.createdAt;
    await saveStatDraft(db, next);
    return res.json({ success: true, draft: next });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/clear', async (req, res) => {
  if (!requireUser(req, res)) return;
  if (String(req.body?.confirm || '').trim().toLowerCase() !== 'clear') {
    return res.status(400).json({ success: false, error: 'Type Clear to delete the saved sheets.' });
  }
  try {
    const { ok } = await checkOfficer(req);
    if (!ok) return res.status(403).json({ success: false, error: 'Access Denied: Action restricted to Officers.' });
    await clearStatStore(getTenantStore());
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/drafts/:id/confirm', async (req, res) => {
  if (!requireUser(req, res)) return;
  try {
    const db = getTenantStore();
    const existing = await loadStatDraft(db, req.params.id);
    if (!existing) return res.status(404).json({ success: false, error: 'Draft not found.' });
    const draft = req.body.readings ? {
      ...existing,
      memberUid: req.body.memberUid != null ? String(req.body.memberUid).trim() : existing.memberUid,
      capturedAt: req.body.capturedAt || existing.capturedAt,
      shareCode: req.body.shareCode != null ? req.body.shareCode : existing.shareCode,
      jobCode: req.body.jobCode != null ? String(req.body.jobCode).trim() : existing.jobCode,
      roleCode: req.body.roleCode != null ? String(req.body.roleCode).trim() : existing.roleCode,
      readings: req.body.readings,
    } : existing;
    const memberSnap = await db.ref(`auction/members/${draft.memberUid}`).once('value');
    const member = memberSnap.exists() ? memberSnap.val() : null;
    const result = await confirmStatDraft(db, draft, member);
    if (!result.ok) return res.status(400).json({ success: false, error: result.error });
    return res.json({ success: true, snapshot: result.snapshot });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
