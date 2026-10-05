import { patterns } from './registry.js';
import { findCrossTabDuplicates } from '@guildname/shared/compositionTabs';

patterns.cross_tab_dupes = 'used';
patterns.single_placement = 'used';

export function singlePlacementEmpty() {
  const duplicates = findCrossTabDuplicates({
    tab_a: { slots_allocation: { '0-0': { userId: 'u1' }, meta_x: { userId: 'u1' } } },
    tab_b: { slots_allocation: { '0-0': { userId: 'u2' } } },
  });
  return { duplicates };
}

export function userOnTwoTabs() {
  const duplicates = findCrossTabDuplicates({
    tab_a: { slots_allocation: { '0-0': { userId: 'u1' } } },
    tab_b: { slots_allocation: { '1-2': { userId: 'u1' } } },
  });
  return { duplicates };
}

export function multipleCoordsSameTab() {
  const duplicates = findCrossTabDuplicates({
    tab_a: {
      slots_allocation: {
        '0-0': { userId: 'u1' },
        '0-1': { userId: 'u1' },
      },
    },
  });
  return { duplicates };
}
