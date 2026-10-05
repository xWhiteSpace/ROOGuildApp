import { describe, expect, it } from 'vitest';
import {
  nowBeforePhase3EndNotEnded,
  nowAfterPhase3EndWhenNotPhase3,
  phase3KeepsAfterEnd,
  beyondThreeWeeksFallsBack,
  qualifyingWithinThreeWeeks,
  prepDateWalkedBackFromWar,
} from '../../patterns/ended_phase3.js';

describe('TST-ROO-171 NextUnfinishedWarCycle keeps an in-progress phase-3 war and otherwise walks at most three Monday-weeks', () => {
  it('Now at or before phase-3 timeEnd is not ended', () => {
    const r = nowBeforePhase3EndNotEnded();
    expect(r.warDate).toBe(r.expectedWarDate);
    expect(r.currentPhase).toBe(3);
  });

  it('Now strictly after phase-3 timeEnd is ended when not in phase 3', () => {
    const r = nowAfterPhase3EndWhenNotPhase3();
    expect(r.currentPhase).not.toBe(3);
    expect(r.warDate).toBe(r.expectedNext);
  });

  it('Phase 3 keeps the occurrence after its end', () => {
    const r = phase3KeepsAfterEnd();
    expect(r.currentPhase).toBe(3);
    expect(r.keptThisWeek).toBe(true);
  });

  it('An occurrence beyond three Monday-weeks does not count', () => {
    const r = beyondThreeWeeksFallsBack();
    expect(r.withinThreeWeeks).toBe(true);
    expect(r.notBeyond).toBe(true);
    expect(r.warDate <= r.maxWarInWindow).toBe(true);
  });

  it('A qualifying occurrence within three weeks is the warDate', () => {
    const r = qualifyingWithinThreeWeeks();
    expect(r.warDate).toBe(r.expected);
  });

  it('The phase-1 prep date is walked back from the chosen war date', () => {
    const r = prepDateWalkedBackFromWar();
    expect(r.warDate).toBe('2026-10-06');
    expect(r.expectedPrepDate).toBe('2026-10-05');
    expect(r.prepStartsAt).toBeTruthy();
  });
});
