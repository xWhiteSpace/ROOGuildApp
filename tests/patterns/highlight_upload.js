import { vi } from 'vitest';
import { patterns } from './registry.js';
import { ASSET_CACHE_CONTROL } from '../../backend/src/services/guildLogo.js';
import {
  HIGHLIGHT_MAX_BYTES,
  uploadHighlightMedia,
} from '../../backend/src/games/adventurer-guild/services/highlightMedia.js';

patterns.highlight_upload = 'used';
patterns.highlight_cap = 'used';

const hold = vi.hoisted(() => ({ uploads: [] }));

vi.mock('../../backend/src/services/guildLogo.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getSupabaseAdmin: () => ({
      storage: {
        from: () => ({
          upload: async (objectPath, buffer, opts) => {
            hold.uploads.push({ objectPath, size: buffer?.length, opts });
            return { error: null };
          },
          getPublicUrl: (objectPath) => ({ data: { publicUrl: `https://cdn.example/${objectPath}` } }),
          remove: async () => ({ error: null }),
        }),
      },
    }),
  };
});

// Re-import upload after mock — module may already have bound getSupabaseAdmin at load.
// highlightMedia imports getSupabaseAdmin at call time, so mock works if pattern loads first.

export function galleryVideoPreloadSkipped() {
  return {
    skipped: true,
    reason: 'Gallery <video preload="metadata"> is JSX-only in HighlightsPage.jsx; no exported unit seam.',
  };
}

export async function highlightUploadStoresCacheControl() {
  hold.uploads = [];
  // minimal PNG header
  const buf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...Buffer.alloc(20)]);
  const result = await uploadHighlightMedia('tenant1', 'hl1', buf);
  return {
    result,
    cacheControl: hold.uploads[0]?.opts?.cacheControl,
    expected: ASSET_CACHE_CONTROL,
    expectedLiteral: '31536000',
  };
}

export function fileOver25MbNotWithinCap() {
  const over = HIGHLIGHT_MAX_BYTES + 1;
  return {
    maxBytes: HIGHLIGHT_MAX_BYTES,
    over,
    withinCap: over <= HIGHLIGHT_MAX_BYTES,
  };
}

export async function uploadRejectsOverCap() {
  const buf = Buffer.alloc(HIGHLIGHT_MAX_BYTES + 1, 1);
  // force png magic at start so type would pass if size did not block first
  buf[0] = 0x89; buf[1] = 0x50; buf[2] = 0x4e; buf[3] = 0x47;
  const result = await uploadHighlightMedia('tenant1', 'hl-big', buf);
  return result;
}
