/**
 * War Room status + init. Raid cycle math stays on the server.
 */
import { Router } from 'express';
import { getTenantStore, loadCommitmentsForWeek, sqlFingerprint } from '../db/database.js';
import { getCachedConfig, getCurrentTenantId } from '../db/tenantContext.js';
import { DEFAULT_TZ, getWeekMonday } from '../utils/guildTime.js';
import { resolveUserIdentity } from '../auth/identity.js';
import { getRaidCycleStatus } from '../games/ragnarok-origin/raidTimeWindow.js';
import { refreshTenantConfigCache } from '../games/ragnarok-origin/timeWindow.js';
import { listPublished } from '../games/ragnarok-origin/services/publishedComposition.js';
import { resolveWarRoomChannelIds } from '../games/ragnarok-origin/utils/warRoomResolver.js';
import { normalizeEtag, sendNotModified, setEtag } from '../utils/httpCache.js';

const router = Router();

const WAR_ROOM_DOC_PATHS = [
  'attendance/live_session',
  'attendance/war_room_status',
  'attendance/compositions',
  'attendance/published',
  'attendance/published_anchor',
];

router.get('/init', async (req, res) => {
  const user = resolveUserIdentity(req);
  if (!user) return res.status(401).json({ success: false, error: 'Session identity missing' });

  try {
    await refreshTenantConfigCache().catch(() => {});
    const db = getTenantStore();
    const cycle = getRaidCycleStatus();
    let config = getCachedConfig();
    if (!config) {
      const configSnap = await db.ref('settings/configuration').once('value');
      config = configSnap.exists() ? configSnap.val() : {};
    }
    const weekMonday = getWeekMonday(config.timezone || DEFAULT_TZ);
    const tenantId = getCurrentTenantId();
    const incoming = normalizeEtag(req.headers['if-none-match']);
    let fp = '';
    if (tenantId) {
      const boardFp = await sqlFingerprint(tenantId, {
        members: true,
        commitments: true,
        config: true,
        docPaths: WAR_ROOM_DOC_PATHS,
        commitmentWeekMonday: weekMonday,
      });
      fp = [boardFp, cycle.publishedId || '', cycle.currentPhase || 0, cycle.warDate || ''].join(':');
      if (incoming && fp && fp === incoming) {
        return sendNotModified(res, fp);
      }
    }

    const [membersSnap, commitments, liveSnap, statusSnap, compositionsSnap, publishedBundle] = await Promise.all([
      db.ref('auction/members').once('value'),
      loadCommitmentsForWeek(weekMonday),
      db.ref('attendance/live_session').once('value'),
      db.ref('attendance/war_room_status').once('value'),
      db.ref('attendance/compositions').once('value'),
      listPublished(db, { ids: [cycle.publishedId] }),
    ]);
    const compositions = compositionsSnap.exists() ? compositionsSnap.val() : {};
    const { published, anchor } = publishedBundle;
    const publishedRecord = cycle.publishedId && published?.[cycle.publishedId]
      ? { id: cycle.publishedId, ...published[cycle.publishedId] }
      : null;

    const configTitle = publishedRecord?.configTitle
      || compositions[cycle.configId]?.title
      || cycle.configId
      || '';

    const warRoomsCatalog = config.warRooms || {};
    const selectedRooms = (cycle.warRoomIds || []).map((id) => ({
      id,
      name: warRoomsCatalog[id]?.name || id,
    }));

    if (fp) setEtag(res, fp);

    return res.json({
      success: true,
      etag: fp,
      displayName: user.displayName || user.username || '',
      cycle: {
        ...cycle,
        configTitle,
      },
      published: publishedRecord,
      anchor: anchor || null,
      session: liveSnap.exists() ? liveSnap.val() : null,
      members: membersSnap.exists() ? membersSnap.val() : {},
      jobs: config.jobs || {},
      commitments,
      warRooms: selectedRooms,
      warRoomsCatalog,
      automation: statusSnap.exists() ? statusSnap.val() : null,
      resolvedWarRoomChannelIds: resolveWarRoomChannelIds(cycle.warRoomIds || [], warRoomsCatalog),
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
