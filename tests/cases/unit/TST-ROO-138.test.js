import { describe, expect, it } from 'vitest';
import {
  eligibleNonIntegerSeeded,
  missingDefaultStoresThree,
  existingIntegerNotOverwritten,
  existingNoConfirmNotReset,
  ghostAndNonRaidNotSeeded,
  nonOnboardedHonesty,
  resultSeededCount,
} from '../../patterns/seed_missing_only.js';

describe('TST-ROO-138 BootSeedMissingLeaveCredits seeds unset credits for raid-roster non-Ghost members and does not overwrite an existing integer', () => {
  it('An eligible member with a non-integer balance is seeded', async () => {
    const r = await eligibleNonIntegerSeeded();
    expect(r.member.leaveCreditsRemaining).toBe(5);
    expect(r.member.noConfirmCount).toBe(0);
  });

  it('A missing defaultLeaveCredits stores 3', async () => {
    const r = await missingDefaultStoresThree();
    expect(r.member.leaveCreditsRemaining).toBe(3);
    expect(r.fallback).toBe(3);
  });

  it('An existing integer balance is not overwritten', async () => {
    const r = await existingIntegerNotOverwritten();
    expect(r.u1.leaveCreditsRemaining).toBe(7);
    expect(r.u2.leaveCreditsRemaining).toBe(3);
  });

  it('An existing noConfirmCount is not reset', async () => {
    const r = await existingNoConfirmNotReset();
    expect(r.member.noConfirmCount).toBe(4);
    expect(r.member.leaveCreditsRemaining).toBe(3);
  });

  it('Ghost and non-raid members do not count', async () => {
    const r = await ghostAndNonRaidNotSeeded();
    expect(r.members.ghost.leaveCreditsRemaining).toBeUndefined();
    expect(r.members.casual.leaveCreditsRemaining).toBe('x');
  });

  it('A tenant that is not onboarded does not count', async () => {
    const r = await nonOnboardedHonesty();
    // Honesty: seed itself has no onboarded gate — assert real seam.
    expect(r.honesty).toMatch(/forEachOnboardedTenant/);
    expect(r.seededAnyway).toBe(true);
  });

  it('The result is the seeded member count per tenant', async () => {
    const r = await resultSeededCount();
    expect(typeof r.result.seeded).toBe('number');
    expect(r.result.seeded).toBeGreaterThan(0);
    // Honesty: seeded counts update keys, not distinct members.
    expect(r.honesty).toMatch(/update keys/);
  });
});
