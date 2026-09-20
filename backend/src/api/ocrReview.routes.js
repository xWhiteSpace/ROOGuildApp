/**
 * Officer Party OCR on VALHALLA: upload/scan, list drafts, O/X, Commit.
 */
import { Router } from 'express';
import multer from 'multer';
import { getTenantStore } from '../db/database.js';
import { resolveUserIdentity } from '../auth/identity.js';
import { checkOfficer } from '../auth/officer.js';
import {
  loadReview,
  saveReview,
  deleteReview,
  applyPresentUids,
  assignUnmatched,
  finalizeOcrCommit,
  refreshReviewMessage,
  reviewRosterUids,
  ocrMatchForUid,
  ocrConfidencePct,
  listOcrEvents,
  resolveOcrEvent,
  createReviewFromBuffers,
} from '../games/ragnarok-origin/services/discordPartyOcr.js';
import { resolveReviewShotUrls } from '../games/ragnarok-origin/services/ocrShotStaging.js';

const router = Router();
const MAX_SHOT_BYTES = 8 * 1024 * 1024;
const MAX_SHOTS = 8;

const shotUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_SHOT_BYTES, files: MAX_SHOTS },
});

function handleShotUpload(req, res, next) {
  shotUpload.array('files', MAX_SHOTS)(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ success: false, error: 'Each screenshot must be 8 MB or smaller.' });
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({ success: false, error: 'Upload at most 8 screenshots.' });
    }
    return res.status(400).json({ success: false, error: err.message || 'Upload failed.' });
  });
}

async function requireOfficerUser(req, res) {
  const user = resolveUserIdentity(req);
  if (!user) {
    res.status(401).json({ success: false, error: 'Session identity missing' });
    return null;
  }
  const db = getTenantStore();
  const configSnap = await db.ref('settings/configuration').once('value');
  const { ok } = await checkOfficer(req, configSnap.exists() ? configSnap.val() : {});
  if (!ok) {
    res.status(403).json({ success: false, error: 'Officer access required' });
    return null;
  }
  return { user, db };
}

function slimMember(uid, member) {
  return {
    uid,
    displayName: member?.displayName || member?.name || uid,
    inGameName: member?.inGameName || '',
  };
}

function rosterRows(review, members) {
  return reviewRosterUids(review, members).map((uid) => {
    const hit = ocrMatchForUid(review, uid);
    const present = Boolean(review.present?.[uid]);
    return {
      ...slimMember(uid, members[uid]),
      present,
      ocrState: hit ? 'match' : 'unmatch',
      ocrConfidence: hit ? ocrConfidencePct(hit) : 0,
      ocrText: hit?.ocrText || '',
      imageSource: hit?.imageSource || '',
      imageIndex: Number.isInteger(hit?.imageIndex) ? hit.imageIndex : null,
      ocrCol: hit?.ocrCol ?? null,
      ocrRow: hit?.ocrRow ?? null,
      ocrPosition: hit?.ocrCol && hit?.ocrRow ? `C${hit.ocrCol} R${hit.ocrRow}` : '',
    };
  });
}

function reviewSlotGaps(review) {
  if (Array.isArray(review.slotGaps)) return review.slotGaps;
  return (Array.isArray(review.unmatched) ? review.unmatched : []).map((row) => ({
    ...row,
    category: row.category || 'unmatch',
  }));
}

function summarizeReview(review, members) {
  const present = Object.keys(review.present || {});
  const absent = Array.isArray(review.absent) ? review.absent : [];
  const unmatched = Array.isArray(review.unmatched) ? review.unmatched : [];
  const matches = Object.keys(review.ocrMatches || {}).length || present.filter((uid) => ocrMatchForUid(review, uid)).length;
  return {
    id: review.id,
    status: review.status,
    eventTitle: review.eventTitle,
    eventDate: review.eventDate,
    eventKey: review.eventKey,
    createdAt: review.createdAt,
    createdByName: review.createdByName,
    committedAt: review.committedAt,
    presentCount: present.length,
    absentCount: absent.length,
    matchCount: matches,
    unmatchedCount: unmatched.length,
    screenshotUrl: review.source?.attachmentUrls?.[0] || '',
    screenshotUrls: review.source?.attachmentUrls || [],
    fileNames: Array.isArray(review.source?.fileNames) ? review.source.fileNames : [],
    rosterCount: reviewRosterUids(review, members).length,
  };
}

router.get('/events', async (req, res) => {
  try {
    const ctx = await requireOfficerUser(req, res);
    if (!ctx) return;
    const events = await listOcrEvents();
    return res.json({ success: true, events });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/scan', handleShotUpload, async (req, res) => {
  const buffers = (req.files || []).map((file) => file.buffer).filter(Boolean);
  try {
    const ctx = await requireOfficerUser(req, res);
    if (!ctx) return;
    const files = req.files || [];
    if (!files.length) {
      return res.status(400).json({ success: false, error: 'Choose a Team Party screenshot first.' });
    }
    const bad = files.find((file) => !String(file.mimetype || '').startsWith('image/'));
    if (bad) {
      return res.status(400).json({ success: false, error: 'Upload image files only (png/jpg/webp).' });
    }
    const eventKey = String(req.body?.eventKey || '').trim();
    const event = await resolveOcrEvent(eventKey);
    if (!event) {
      return res.status(400).json({ success: false, error: 'Pick a calendar raid event for this screenshot.' });
    }
    const createdByName = ctx.user.displayName || ctx.user.username || ctx.user.id;
    const { review } = await createReviewFromBuffers({
      buffers,
      fileNames: files.map((file) => file.originalname || `screenshot.png`),
      event,
      createdBy: ctx.user.id,
      createdByName,
      source: { kind: 'website' },
    });
    return res.json({ success: true, id: review.id });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  } finally {
    buffers.forEach((buf) => {
      if (buf) buf.fill(0);
    });
  }
});

router.get('/', async (req, res) => {
  try {
    const ctx = await requireOfficerUser(req, res);
    if (!ctx) return;
    const membersSnap = await ctx.db.ref('auction/members').once('value');
    const members = membersSnap.exists() ? membersSnap.val() : {};
    const snap = await ctx.db.ref('attendance/ocr_reviews').once('value');
    const all = snap.exists() ? snap.val() : {};
    const reviews = Object.values(all || {})
      .filter((row) => row && row.id && row.status !== 'cancelled')
      .sort((a, b) => (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0))
      .slice(0, 40)
      .map((row) => summarizeReview(row, members));
    return res.json({ success: true, reviews });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const ctx = await requireOfficerUser(req, res);
    if (!ctx) return;
    const review = await loadReview(req.params.id);
    if (!review) return res.status(404).json({ success: false, error: 'Review not found.' });
    const membersSnap = await ctx.db.ref('auction/members').once('value');
    const members = membersSnap.exists() ? membersSnap.val() : {};
    const screenshotUrls = await resolveReviewShotUrls(review);
    return res.json({
      success: true,
      review: {
        ...summarizeReview(review, members),
        unmatched: Array.isArray(review.unmatched) ? review.unmatched : [],
        slotGaps: reviewSlotGaps(review),
        occupied: Number.isFinite(review.occupied) ? review.occupied : null,
        screenshotUrl: screenshotUrls[0] || '',
        screenshotUrls,
        fileNames: Array.isArray(review.source?.fileNames) ? review.source.fileNames : [],
      },
      roster: rosterRows(review, members),
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const ctx = await requireOfficerUser(req, res);
    if (!ctx) return;
    const review = await loadReview(req.params.id);
    if (!review || review.status !== 'draft') {
      return res.status(409).json({ success: false, error: 'This review is no longer editable.' });
    }
    const membersSnap = await ctx.db.ref('auction/members').once('value');
    const members = membersSnap.exists() ? membersSnap.val() : {};
    if (Array.isArray(req.body?.presentUids)) {
      applyPresentUids(review, req.body.presentUids, members);
    }
    if (req.body?.unmatchedId && req.body?.uid) {
      assignUnmatched(review, req.body.unmatchedId, req.body.uid);
    }
    await saveReview(review);
    await refreshReviewMessage(review, members, null).catch(() => {});
    return res.json({ success: true, id: review.id, presentCount: Object.keys(review.present || {}).length });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/:id/commit', async (req, res) => {
  try {
    const ctx = await requireOfficerUser(req, res);
    if (!ctx) return;
    const review = await loadReview(req.params.id);
    if (!review || review.status !== 'draft') {
      return res.status(409).json({ success: false, error: 'This review is no longer editable.' });
    }
    const membersSnap = await ctx.db.ref('auction/members').once('value');
    const members = membersSnap.exists() ? membersSnap.val() : {};
    if (Array.isArray(req.body?.presentUids)) {
      applyPresentUids(review, req.body.presentUids, members);
    }
    const committedBy = ctx.user.displayName || ctx.user.username || ctx.user.id;
    const { statusMap, swordNote, galleryNote } = await finalizeOcrCommit(review, members, committedBy);
    await refreshReviewMessage(review, members, null).catch(() => {});
    return res.json({
      success: true,
      presentCount: Object.keys(statusMap).length,
      message: `${swordNote}${galleryNote}`,
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/:id/cancel', async (req, res) => {
  try {
    const ctx = await requireOfficerUser(req, res);
    if (!ctx) return;
    const review = await loadReview(req.params.id);
    if (!review || review.status !== 'draft') {
      return res.status(409).json({ success: false, error: 'This review is no longer editable.' });
    }
    const membersSnap = await ctx.db.ref('auction/members').once('value');
    const members = membersSnap.exists() ? membersSnap.val() : {};
    await deleteReview(review, members);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const ctx = await requireOfficerUser(req, res);
    if (!ctx) return;
    const review = await loadReview(req.params.id);
    if (!review) return res.status(404).json({ success: false, error: 'Review not found.' });
    const membersSnap = await ctx.db.ref('auction/members').once('value');
    const members = membersSnap.exists() ? membersSnap.val() : {};
    await deleteReview(review, members);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
