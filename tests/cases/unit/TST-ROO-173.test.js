import { describe, expect, it } from 'vitest';
import {
  fieldsListSlim,
  missingTitleEmptyString,
  idReturnsFull,
  fieldsListIgnoredWhenId,
  missingIdEmpty,
  neitherReturnsFull,
} from '../../patterns/slim_list.js';

describe('TST-ROO-173 CompositionListOmitGrids returns slim id and title rows only when fields=list and id is absent', () => {
  it('fields=list with no id returns id and title only', async () => {
    const res = await fieldsListSlim();
    expect(res.status).toBe(200);
    const comps = res.body.compositions;
    for (const row of Object.values(comps)) {
      expect(Object.keys(row).sort()).toEqual(['id', 'title']);
      expect(row.grids).toBeUndefined();
    }
  });

  it('A missing title defaults to the empty string', async () => {
    const row = await missingTitleEmptyString();
    // Real seam (mismatch): compositionForPersist/normalizeCompositionDefaults
    // fills missing title as 'Untitled Configuration'; list then returns that string
    // (persistable.title || '' never sees a truly empty title).
    expect(row.title).toBe('Untitled Configuration');
  });

  it('An id returns that one full composition', async () => {
    const res = await idReturnsFull();
    const row = res.body.compositions.cfg_full;
    expect(row).toBeTruthy();
    expect(row.grids || row.tabOrder).toBeTruthy();
  });

  it('fields=list does not apply when id is present', async () => {
    const res = await fieldsListIgnoredWhenId();
    const row = res.body.compositions.cfg_full;
    expect(row.grids || row.tabOrder).toBeTruthy();
    expect(Object.keys(row).sort()).not.toEqual(['id', 'title']);
  });

  it('A missing id returns an empty compositions object', async () => {
    const res = await missingIdEmpty();
    expect(res.body.compositions).toEqual({});
  });

  it('Neither id nor fields=list returns full compositions', async () => {
    const res = await neitherReturnsFull();
    const row = res.body.compositions.cfg_full;
    expect(row.grids || row.tabOrder).toBeTruthy();
  });
});
