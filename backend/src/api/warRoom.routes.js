/**
 * War Room status + init. Raid cycle math stays on the server.
 */
import { Router } from 'express';
import { getTenantStore } from '../db/database.js';
import { resolveUserIdentity } from '../auth/identity.js';
import { getRaidCycleStatus } from '../games/ragnarok-origin/raidTimeWindow.js';
import { refreshTenantConfigCache } from '../games/ragnarok-origin/timeWindow.js';
import { listPublished } from '../games/ragnarok-origin/services/publishedComposition.js';
import { resolveWarRoomChannelIds } from '../games/ragnarok-origin/utils/warRoomResolver.js';

const router = Router();

router.get('/init', async (req, res) => {
  const user = resolveUserIdentity(req);
  if (!user) return res.status(401).json({ success: false, error: 'Session identity missing' });

  try {
    await refreshTenantConfigCache().catch(() => {});
    const db = getTenantStore();
    const cycle = getRaidCycleStatus();

    const [configSnap, membersSnap, commitmentsSnap, liveSnap, statusSnap, compositionsSnap] = await Promise.all([
      db.ref('settings/configuration').once('value'),
      db.ref('auction/members').once('value'),
      db.ref('attendance/commitments').once('value'),
      db.ref('attendance/live_session').once('value'),
      db.ref('attendance/war_room_status').once('value'),
      db.ref('attendance/compositions').once('value'),
    ]);

    const config = configSnap.exists() ? configSnap.val() : {};
    const compositions = compositionsSnap.exists() ? compositionsSnap.val() : {};
    const { published, anchor } = await listPublished(db);
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

    return res.json({
      success: true,
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
      commitments: commitmentsSnap.exists() ? commitmentsSnap.val() : {},
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
