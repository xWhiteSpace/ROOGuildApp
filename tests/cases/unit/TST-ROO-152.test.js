import { describe, expect, it } from 'vitest';
import {
  singlePlacementEmpty,
  userOnTwoTabs,
  multipleCoordsSameTab,
} from '../../patterns/cross_tab_dupes.js';

describe('TST-ROO-152 CrossTabDuplicateScan returns empty or {userId, placements[]} duplicates', () => {
  it('A single placement does not count', () => {
    const r = singlePlacementEmpty();
    expect(r.duplicates).toEqual([]);
  });

  it('A userId on more than one tab is a duplicate', () => {
    const r = userOnTwoTabs();
    expect(r.duplicates).toHaveLength(1);
    expect(r.duplicates[0].userId).toBe('u1');
    expect(r.duplicates[0].placements).toHaveLength(2);
  });

  it('Multiple coords for one userId are a duplicate', () => {
    const r = multipleCoordsSameTab();
    expect(r.duplicates).toHaveLength(1);
    expect(r.duplicates[0].userId).toBe('u1');
    expect(r.duplicates[0].placements).toHaveLength(2);
  });
});
