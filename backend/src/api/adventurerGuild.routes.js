import { Router } from 'express';
import multer from 'multer';
import { randomUUID } from 'crypto';
import { resolveUserIdentity } from '../auth/identity.js';
import { checkOfficer } from '../auth/officer.js';
import { getTenantStore } from '../db/database.js';
import { getTenant } from '../db/tenants.js';
import { getCurrentTenantId } from '../db/tenantContext.js';
import { DEFAULT_TZ, guildWallTimeToUtcMs } from '../utils/guildTime.js';
import { collectScheduleContributions } from '../games/scheduleContributors.js';
import {
  HIGHLIGHT_MAX_BYTES,
  deleteHighlightMedia,
  uploadHighlightMedia,
} from '../games/adventurer-guild/services/highlightMedia.js';

const router = Router();
const HIGHLIGHTS_PATH = 'adventurer-guild/highlights';
const EVENTS_PATH = 'adventurer-guild/events';

const mediaUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: HIGHLIGHT_MAX_BYTES, files: 1 },
});

function handleMediaUpload(req, res, next) {
  mediaUpload.single('file')(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ success: false, error: 'File must be 25 MB or smaller.' });
    }
    return res.status(400).json({ success: false, error: err.message || 'Upload failed.' });
  });
}

function asMap(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value;
}

function highlightList(map) {
  return Object.values(asMap(map)).sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
}

function ymd(value) {
  const text = String(value || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : '';
}

function hhmm(value, fallback = '18:00') {
  const text = String(value || '').trim();
  return /^\d{2}:\d{2}$/.test(text) ? text : fallback;
}

function nativeToCalendarEvent(row, timezone) {
  const date = ymd(row.date);
  const dateEnd = ymd(row.dateEnd) || date;
  if (!date) return null;
  const extra = {
    description: row.description || '',
    native: true,
    date,
    dateEnd,
    timeStart: row.timeStart || '',
    timeEnd: row.timeEnd || '',
  };
  if (row.allDay) {
    return {
      id: row.id,
      title: row.title,
      start: date,
      end: dateEnd,
      allDay: true,
      sourceGameId: 'adventurer-guild',
      sourceLabel: 'Adventurer Guild',
      readOnly: false,
      ...extra,
    };
  }
  const startMs = guildWallTimeToUtcMs(hhmm(row.timeStart), timezone, date);
  const endMs = guildWallTimeToUtcMs(hhmm(row.timeEnd, '19:00'), timezone, dateEnd);
  return {
    id: row.id,
    title: row.title,
    start: new Date(startMs).toISOString(),
    end: new Date(endMs).toISOString(),
    allDay: false,
    sourceGameId: 'adventurer-guild',
    sourceLabel: 'Adventurer Guild',
    readOnly: false,
    ...extra,
  };
}

async function readTimezone(db) {
  const snap = await db.ref('settings/configuration/timezone').once('value');
  return snap.exists() ? (snap.val() || DEFAULT_TZ) : DEFAULT_TZ;
}

router.get('/highlights', async (req, res) => {
  const user = resolveUserIdentity(req);
  if (!user?.id) return res.status(401).json({ success: false, error: 'Login required' });
  try {
    const db = getTenantStore();
    const snap = await db.ref(HIGHLIGHTS_PATH).once('value');
    return res.json({ success: true, highlights: highlightList(snap.exists() ? snap.val() : {}) });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/highlights', handleMediaUpload, async (req, res) => {
  const user = resolveUserIdentity(req);
  if (!user?.id) return res.status(401).json({ success: false, error: 'Login required' });
  if (!req.file?.buffer) {
    return res.status(400).json({ success: false, error: 'Choose an image or video to upload.' });
  }
  const tenantId = req.tenantId || getCurrentTenantId();
  const id = randomUUID();
  try {
    const stored = await uploadHighlightMedia(tenantId, id, req.file.buffer);
    if (!stored.ok) return res.status(stored.status).json({ success: false, error: stored.error });
    const record = {
      id,
      caption: String(req.body?.caption || '').trim().slice(0, 280),
      url: stored.url,
      mime: stored.mime,
      ext: stored.ext,
      kind: stored.kind,
      objectPath: stored.objectPath,
      size: stored.size,
      createdBy: String(user.id),
      createdByName: user.displayName || user.username || 'Adventurer',
      createdAt: Date.now(),
    };
    const db = getTenantStore();
    await db.ref(`${HIGHLIGHTS_PATH}/${id}`).set(record);
    return res.json({ success: true, highlight: record });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/highlights/:id', async (req, res) => {
  const user = resolveUserIdentity(req);
  if (!user?.id) return res.status(401).json({ success: false, error: 'Login required' });
  const id = String(req.params.id || '');
  try {
    const db = getTenantStore();
    const snap = await db.ref(`${HIGHLIGHTS_PATH}/${id}`).once('value');
    if (!snap.exists()) return res.status(404).json({ success: false, error: 'Highlight not found.' });
    const record = snap.val();
    const { ok } = await checkOfficer(req);
    if (String(record.createdBy) !== String(user.id) && !ok) {
      return res.status(403).json({ success: false, error: 'You can only delete your own highlights.' });
    }
    await deleteHighlightMedia(record.objectPath);
    await db.ref(`${HIGHLIGHTS_PATH}/${id}`).remove();
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/events', async (req, res) => {
  const user = resolveUserIdentity(req);
  if (!user?.id) return res.status(401).json({ success: false, error: 'Login required' });
  try {
    const db = getTenantStore();
    const timezone = await readTimezone(db);
    const from = ymd(req.query.from) || new Date().toISOString().slice(0, 10);
    const to = ymd(req.query.to) || from;
    const snap = await db.ref(EVENTS_PATH).once('value');
    const nativeRows = Object.values(asMap(snap.exists() ? snap.val() : {}))
      .filter((row) => {
        const startDay = ymd(row.date);
        const endDay = ymd(row.dateEnd) || startDay;
        return startDay && endDay >= from && startDay <= to;
      });
    const native = nativeRows
      .map((row) => nativeToCalendarEvent(row, timezone))
      .filter(Boolean);
    const tenantId = req.tenantId || getCurrentTenantId();
    const tenant = tenantId ? await getTenant(tenantId) : null;
    const contributed = await collectScheduleContributions({
      enabledGameIds: tenant?.enabled_games,
      from,
      to,
      timezone,
    });
    return res.json({
      success: true,
      timezone,
      native,
      contributed,
      events: [...native, ...contributed],
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/events', async (req, res) => {
  const { user, ok } = await checkOfficer(req);
  if (!user?.id) return res.status(401).json({ success: false, error: 'Login required' });
  if (!ok) return res.status(403).json({ success: false, error: 'Officer access required to add guild events.' });
  const title = String(req.body?.title || '').trim();
  const date = ymd(req.body?.date);
  if (!title || !date) {
    return res.status(400).json({ success: false, error: 'Title and date are required.' });
  }
  const id = randomUUID();
  const record = {
    id,
    title: title.slice(0, 120),
    description: String(req.body?.description || '').trim().slice(0, 500),
    date,
    dateEnd: ymd(req.body?.dateEnd) || date,
    timeStart: hhmm(req.body?.timeStart),
    timeEnd: hhmm(req.body?.timeEnd, '19:00'),
    allDay: req.body?.allDay === true,
    createdBy: String(user.id),
    createdByName: user.displayName || user.username || 'Officer',
    createdAt: Date.now(),
  };
  try {
    const db = getTenantStore();
    await db.ref(`${EVENTS_PATH}/${id}`).set(record);
    const timezone = await readTimezone(db);
    return res.json({ success: true, event: nativeToCalendarEvent(record, timezone), record });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/events/:id', async (req, res) => {
  const { user, ok } = await checkOfficer(req);
  if (!user?.id) return res.status(401).json({ success: false, error: 'Login required' });
  if (!ok) return res.status(403).json({ success: false, error: 'Officer access required to edit guild events.' });
  const id = String(req.params.id || '');
  try {
    const db = getTenantStore();
    const snap = await db.ref(`${EVENTS_PATH}/${id}`).once('value');
    if (!snap.exists()) return res.status(404).json({ success: false, error: 'Event not found.' });
    const current = snap.val();
    const next = {
      ...current,
      title: String(req.body?.title || current.title || '').trim().slice(0, 120),
      description: String(req.body?.description ?? current.description ?? '').trim().slice(0, 500),
      date: ymd(req.body?.date) || current.date,
      dateEnd: ymd(req.body?.dateEnd) || ymd(req.body?.date) || current.dateEnd || current.date,
      timeStart: req.body?.timeStart ? hhmm(req.body.timeStart) : current.timeStart,
      timeEnd: req.body?.timeEnd ? hhmm(req.body.timeEnd, '19:00') : current.timeEnd,
      allDay: req.body?.allDay === undefined ? current.allDay === true : req.body.allDay === true,
      updatedAt: Date.now(),
    };
    await db.ref(`${EVENTS_PATH}/${id}`).set(next);
    const timezone = await readTimezone(db);
    return res.json({ success: true, event: nativeToCalendarEvent(next, timezone), record: next });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/events/:id', async (req, res) => {
  const { user, ok } = await checkOfficer(req);
  if (!user?.id) return res.status(401).json({ success: false, error: 'Login required' });
  if (!ok) return res.status(403).json({ success: false, error: 'Officer access required to delete guild events.' });
  const id = String(req.params.id || '');
  try {
    const db = getTenantStore();
    await db.ref(`${EVENTS_PATH}/${id}`).remove();
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
