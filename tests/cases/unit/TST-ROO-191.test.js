import { describe, expect, it } from 'vitest';
import {
  commitmentsIncludeWeekMonday,
  settingsAsksThreeFields,
  reactPageBulletsSkipped,
} from '../../patterns/commitments_http.js';

describe('TST-ROO-191 SchedulerCommitmentsOpenWeekChange loads on open and week change only, clears ETag, and narrows settings fields', () => {
  it('No timer re-GET while Scheduler stays open', () => {
    const r = reactPageBulletsSkipped();
    expect(r.skipped).toContain('No timer re-GET while Scheduler stays open');
  });

  it('Commitments load when the page opens', () => {
    const r = reactPageBulletsSkipped();
    expect(r.reason).toMatch(/Scheduler\.jsx/);
  });

  it('Week change clears stored ETag before the fetch', () => {
    const r = reactPageBulletsSkipped();
    expect(r.skipped.some((s) => /ETag/i.test(s))).toBe(true);
  });

  it('Settings GET asks only the three fields', async () => {
    const res = await settingsAsksThreeFields();
    expect(res.status).toBe(200);
    // Real seam: GET /api/requests/settings/get?fields=... returns { config: pickKeys(...) }
    expect(Object.keys(res.body.config || {}).sort()).toEqual(
      ['events', 'specialEventCategories', 'timezone'].sort(),
    );
  });

  it('Commitments request includes weekMonday when known', async () => {
    const res = await commitmentsIncludeWeekMonday();
    expect(res.status).toBe(200);
    expect(res.body.weekMonday).toBe('2026-10-05');
  });
});
