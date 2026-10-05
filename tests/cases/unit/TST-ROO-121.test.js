import { describe, expect, it } from 'vitest';
import {
  rearmActiveInWindow,
  pastWindowArchivesNoRearm,
  noopMissingOrInactive,
} from '../../patterns/boot_rearm.js';

describe('TST-ROO-121 ResumeMonitoringOnBoot re-arms inside the window, archives when the window has passed, and no-ops otherwise', () => {
  it('An Active session still in the window is re-armed from stored fields', async () => {
    const r = await rearmActiveInWindow();
    expect(r.armed).toBe(true);
    expect(r.meta.pollIntervalMinutes).toBe(15);
    expect(r.intervalMs.some((ms) => ms === 15 * 60 * 1000 || ms === 15_000)).toBe(true);
  });

  it('A window already past does not count as a resumed ticker', async () => {
    const r = await pastWindowArchivesNoRearm();
    expect(r.liveSession).toBeNull();
    expect(r.archiveCount).toBeGreaterThanOrEqual(1);
    expect(r.tickerRunning).toBe(false);
  });

  it('No Active session or missing monitoring fields do not count', async () => {
    const r = await noopMissingOrInactive();
    expect(r.noMeta.ticker).toBe(false);
    expect(r.noMeta.archives).toBe(0);
    expect(r.missingFields.ticker).toBe(false);
    expect(r.inactive.ticker).toBe(false);
    expect(r.intervalCount).toBe(0);
  });
});
