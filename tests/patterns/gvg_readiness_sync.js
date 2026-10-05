import { patterns } from './registry.js';
import { gvgReadinessSyncMode } from '../../backend/src/games/ragnarok-origin/services/gvgReadinessSync.js';

patterns.gvg_readiness_sync = 'used';

export function phase1MatchingKeySkips() {
  return gvgReadinessSyncMode({
    currentPhase: 1,
    storedEventKey: '2026-10-06_evt1',
    cycleEventKey: '2026-10-06_evt1',
    messageId: 'm1',
  });
}

export function phase1LastWeekKeyRematerializes() {
  return gvgReadinessSyncMode({
    currentPhase: 1,
    storedEventKey: '2026-09-29_evt1',
    cycleEventKey: '2026-10-06_evt1',
    messageId: 'm1',
  });
}

export function phase1MissingPointerRematerializes() {
  return gvgReadinessSyncMode({
    currentPhase: 1,
    storedEventKey: '',
    cycleEventKey: '2026-10-06_evt1',
    messageId: '',
  });
}

export function phase2Or3IfMissing() {
  return {
    p2: gvgReadinessSyncMode({
      currentPhase: 2,
      storedEventKey: '2026-10-06_evt1',
      cycleEventKey: '2026-10-06_evt1',
      messageId: 'm1',
    }),
    p3: gvgReadinessSyncMode({
      currentPhase: 3,
      storedEventKey: '2026-10-06_evt1',
      cycleEventKey: '2026-10-06_evt1',
      messageId: 'm1',
    }),
  };
}

export function idlePhaseSkips() {
  return gvgReadinessSyncMode({
    currentPhase: 0,
    storedEventKey: '2026-10-06_evt1',
    cycleEventKey: '2026-10-06_evt1',
    messageId: 'm1',
  });
}
