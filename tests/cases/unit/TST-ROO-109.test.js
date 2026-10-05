import { describe, expect, it } from 'vitest';
import {
  duePhase1PostsGetReadyToGen,
  duePhase1MappedJumpIncludesWarAnnounce,
  noScheduledPhasesSendsNothing,
  phase2Or3UsesWarAnnounceNotGetReady,
} from '../../patterns/phase1_get_ready.js';

describe('TST-ROO-109 Phase1GvgGetReadyLine posts the phase-1 get-ready sentence to GEN or sends nothing', () => {
  it('A due phase-1 minute posts the get-ready sentence to GEN', async () => {
    const r = await duePhase1PostsGetReadyToGen();
    expect(r.exactMatch).toBe(true);
    expect(r.hasTitle).toBe(false);
    expect(r.hasWarStart).toBe(false);
    expect(r.hasJump).toBe(false);
    expect(r.expected).toMatch(/Get ready for the next GVG on \*\*Oct 06, 2026\*\*/);
    expect(r.warCalls).toHaveLength(0);
  });

  it('A mapped war-announce appends Jump in at the channel mention', async () => {
    const r = await duePhase1MappedJumpIncludesWarAnnounce();
    expect(r.exactMatch).toBe(true);
    expect(r.hasJump).toBe(true);
    expect(r.expected).toMatch(/Jump in at <#123456789012345678>\./);
  });

  it('No scheduled phase minutes sends nothing', async () => {
    const r = await noScheduledPhasesSendsNothing();
    expect(r.silent).toBe(true);
  });

  it('Phase 2 or phase 3 does not use the get-ready sentence', async () => {
    const r = await phase2Or3UsesWarAnnounceNotGetReady();
    expect(r.usedWar).toBe(true);
    expect(r.usedGetReady).toBe(false);
    expect(r.genCalls).toHaveLength(0);
  });
});
