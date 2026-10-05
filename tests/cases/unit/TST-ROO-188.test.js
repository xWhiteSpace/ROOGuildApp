import { describe, expect, it } from 'vitest';
import {
  cycleTargetsWarWhenSetupPasses,
  instanceForWarDateWeek,
  afterDeadlineKeptAndLocked,
  missingCancelledNoFallthrough,
  preferAnchoredElseNext,
  fingerprintIncludesStatedFields,
} from '../../patterns/gvg_readiness.js';

describe('TST-ROO-188 GvgReadinessCardStaysOnCycleWar keeps the cycle war after deadline and does not fall through when missing', () => {
  it('A cycle targets the war only when setup fields pass', async () => {
    const r = await cycleTargetsWarWhenSetupPasses();
    expect(r.missing).toBe(false);
    expect(r.date).toBe('2026-10-07');
    expect(r.key).toBe(r.expectedKey);
  });

  it('The instance is for the war date\'s week, not blindly the current week', async () => {
    const r = await instanceForWarDateWeek();
    expect(r.date).toBe('2026-10-14');
    expect(r.title).not.toBe('Wrong week');
  });

  it('After the RSVP deadline the war is kept and confirm/leave are locked', async () => {
    const r = await afterDeadlineKeptAndLocked();
    expect(r.targetDate).toBe('2026-10-07');
    expect(r.pastDeadline).toBe(true);
  });

  it('A missing or cancelled instance does not fall through', async () => {
    const r = await missingCancelledNoFallthrough();
    expect(r.missing).toBe(true);
    expect(r.event).toBeNull();
  });

  it('Otherwise prefer anchored published composition, else next open RSVP', async () => {
    const r = await preferAnchoredElseNext();
    expect(r.anchored).toBe(true);
    expect(r.anchoredTitle).toMatch(/Anchored/);
  });

  it('Board fingerprint includes the stated fields', () => {
    const r = fingerprintIncludesStatedFields();
    expect(r.schedule).toContain('locked');
    expect(r.rsvps).toContain('u1:Confirmed');
    expect(r.fp).toMatch(/^[a-f0-9]{40}$/);
  });
});
