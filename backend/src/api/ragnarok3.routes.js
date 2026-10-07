import { Router } from 'express';
import attendanceRoutes from './ragnarok3Attendance.routes.js';
import warRoomRoutes from './ragnarok3WarRoom.routes.js';
import ocrRoutes from './ragnarok3Ocr.routes.js';
import liveRaidRoutes from './ragnarok3LiveRaid.routes.js';
import settingsRoutes from './ragnarok3Settings.routes.js';

const router = Router();

router.get('/health', (_req, res) => {
  res.json({ success: true, gameId: 'ragnarok-3' });
});

router.use('/settings', settingsRoutes);
router.use('/war-room', warRoomRoutes);
router.use('/ocr-reviews', ocrRoutes);
router.use('/live-raid', liveRaidRoutes);
router.use(attendanceRoutes);

export default router;
