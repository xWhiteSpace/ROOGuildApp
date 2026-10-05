import { describe, expect, it } from 'vitest';
import {
  pointerEmbedShowsEventCountsStatus,
  draftEmbedIncludesOpenValhalla,
  missingIdsAreNoOp,
  failedDiscordEditSwallowed,
  pointerDoesNotWriteSwords,
} from '../../patterns/ocr_pointer.js';

describe('TST-ROO-238 OcrPointerEmbedRefresh edits Discord pointer without writing swords', () => {
  it('The pointer embed shows event, OCR counts, and status', async () => {
    const r = await pointerEmbedShowsEventCountsStatus();
    expect(r.edits).toBe(1);
    expect(r.desc).toMatch(/GvG Night/);
    expect(r.desc).toMatch(/OCR match/i);
    expect(r.desc).toMatch(/Committed on VALHALLA|swords/i);
  });

  it('A draft embed includes the Open VALHALLA link', async () => {
    const r = await draftEmbedIncludesOpenValhalla();
    expect(r.hasOpen).toBe(true);
  });

  it('Missing channel or message ids are a no-op', async () => {
    const r = await missingIdsAreNoOp();
    expect(r.edits).toBe(0);
  });

  it('A failed Discord edit is swallowed and does not fail the HTTP writer', async () => {
    const r = await failedDiscordEditSwallowed();
    expect(r.httpWriterContinues).toBe(true);
  });

  it('The pointer does not write in-game swords', async () => {
    const r = await pointerDoesNotWriteSwords();
    expect(r.swordCalls).toBe(0);
    expect(r.edits).toBe(1);
  });
});
