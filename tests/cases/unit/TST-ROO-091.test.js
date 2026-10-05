import { describe, expect, it } from 'vitest';
import {
  emptySessionEtag,
  matchingIfNoneMatch304,
  realGetStillApplies24hReset,
  storedSessionVersionEtag,
} from '../../patterns/active_session_etag.js';

describe('TST-ROO-091 ActiveSessionEtag304AndReset', () => {
  // Skipped: "Leaving Mimic Book open does not repeat" / "new identity loads" — React useActiveSession effect; no unit seam without renderer.

  it("No session uses ETag empty", async () => {
    const { status, body, headers } = await emptySessionEtag();
    expect(status).toBe(200);
    expect(body.session).toBeNull();
    expect(String(headers.etag || '')).toContain('empty');
  });

  it('A stored session uses ETag s:version:lastUpdated', async () => {
    const { res, expectedTag } = await storedSessionVersionEtag();
    expect(res.status).toBe(200);
    expect(String(res.headers.etag || '')).toContain(expectedTag);
  });

  it('Matching If-None-Match returns 304 and no session body', async () => {
    const { status, body, text, headers } = await matchingIfNoneMatch304();
    expect(status).toBe(304);
    expect(body == null || body === '' || text === '').toBe(true);
    expect(String(headers['cache-control'] || '')).toMatch(/private,\s*no-cache/i);
  });

  it('A real GET still applies the 24-hour auto-reset', async () => {
    const { res, stored } = await realGetStillApplies24hReset();
    expect(res.status).toBe(200);
    expect(stored.marker).toBeUndefined();
    expect(stored.lootSummary.puppet.qty).toBe(0);
    expect(stored.lastUpdated).toBeGreaterThan(Date.now() - 60_000);
  });
});
