import { describe, expect, it } from 'vitest';
import {
  phase1MatchingKeySkips,
  phase1LastWeekKeyRematerializes,
  phase1MissingPointerRematerializes,
  phase2Or3IfMissing,
  idlePhaseSkips,
} from '../../patterns/gvg_readiness_sync.js';
import {
  phase1LastWeekEventKeyRematerializes,
  phase1ThisCycleEventKeySkipsBoard,
  phase2StoredMessageUsesIfMissing,
  failedPublishDoesNotEnsureBoard,
} from '../../patterns/war_room_publish.js';

describe('TST-ROO-248 GvgReadinessSyncMode rematerializes once at Preparation start', () => {
  it('Phase 1 with a matching stored eventKey and messageId is skip', () => {
    expect(phase1MatchingKeySkips()).toBe('skip');
  });

  it('Phase 1 with last week’s eventKey is rematerialize', () => {
    expect(phase1LastWeekKeyRematerializes()).toBe('rematerialize');
  });

  it('Phase 1 with no stored pointer is rematerialize', () => {
    expect(phase1MissingPointerRematerializes()).toBe('rematerialize');
  });

  it('Phase 2 or 3 is ifMissing', () => {
    const r = phase2Or3IfMissing();
    expect(r.p2).toBe('ifMissing');
    expect(r.p3).toBe('ifMissing');
  });

  it('A non-prep phase is skip', () => {
    expect(idlePhaseSkips()).toBe('skip');
  });

  it('Phase 1 + successful publish + last week’s eventKey rematerializes', async () => {
    const r = await phase1LastWeekEventKeyRematerializes();
    expect(r.ensure).toBeGreaterThanOrEqual(1);
    expect(r.ifMissing).toBe(0);
  });

  it('Phase 1 + successful publish + this cycle’s eventKey skips the board', async () => {
    const r = await phase1ThisCycleEventKeySkipsBoard();
    expect(r.ensure).toBe(0);
    expect(r.ifMissing).toBe(0);
  });

  it('Phase 2 with a stored messageId uses IfMissing', async () => {
    const r = await phase2StoredMessageUsesIfMissing();
    expect(r.ifMissing).toBeGreaterThanOrEqual(1);
    expect(r.ensure).toBe(0);
  });

  it('A failed publish does not call either board function', async () => {
    const r = await failedPublishDoesNotEnsureBoard();
    expect(r.boardCalls).toBe(0);
    expect(r.ensure).toBe(0);
    expect(r.ifMissing).toBe(0);
  });
});
