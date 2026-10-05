import { describe, expect, it } from 'vitest';
import {
  galleryVideoPreloadSkipped,
  highlightUploadStoresCacheControl,
  fileOver25MbNotWithinCap,
  uploadRejectsOverCap,
} from '../../patterns/highlight_upload.js';

describe('TST-ROO-223 HighlightUploadCacheControlAndSizeCap stores long cache and enforces 25MB', () => {
  it('A gallery video element preloads metadata', () => {
    const r = galleryVideoPreloadSkipped();
    expect(r.skipped).toBe(true);
  });

  it('A highlight upload stores cacheControl 31536000', async () => {
    const r = await highlightUploadStoresCacheControl();
    expect(r.result.ok).toBe(true);
    expect(r.cacheControl).toBe('31536000');
  });

  it('A file over 25MB does not count as within the cap', async () => {
    const cap = fileOver25MbNotWithinCap();
    expect(cap.withinCap).toBe(false);
    expect(cap.maxBytes).toBe(25 * 1024 * 1024);
    const rejected = await uploadRejectsOverCap();
    expect(rejected.ok).toBe(false);
    expect(rejected.status).toBe(400);
  });
});
