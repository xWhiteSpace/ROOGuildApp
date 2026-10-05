import { describe, expect, it } from 'vitest';
import {
  day1ResetsEligible,
  notDay1Skipped,
  existingMarkerSkipped,
  runStoresYmMarker,
} from '../../patterns/day1_reset.js';

describe('TST-ROO-139 MonthlyLeaveCreditRefresh resets raid-roster credits on guild day 1 once per year-month and skips otherwise', () => {
  it('Day 1 with no marker resets eligible leave credits', async () => {
    const r = await day1ResetsEligible();
    expect(r.result.skipped).toBe(false);
    expect(r.u1).toBe(4);
  });

  it('Ghost and non-raid members are not reset', async () => {
    const r = await day1ResetsEligible();
    expect(r.ghost).toBe(1);
    expect(r.casual).toBe(1);
  });

  it('A day that is not guild day 1 does not count', async () => {
    const r = await notDay1Skipped();
    expect(r.result.skipped).toBe(true);
    expect(r.result.reason).toBe('not-first');
    expect(r.u1).toBe(1);
    expect(r.markers).toBeNull();
  });

  it('An existing year-month marker does not count as another refresh', async () => {
    const r = await existingMarkerSkipped();
    expect(r.result.skipped).toBe(true);
    expect(r.result.reason).toBe('already-ran');
    expect(r.u1).toBe(1);
  });

  it('A run stores the year-month marker', async () => {
    const r = await runStoresYmMarker();
    expect(r.marker.defaultCredits).toBe(4);
    expect(r.marker.count).toBe(2);
    expect(r.marker.ranAt).toBeGreaterThan(0);
  });
});
