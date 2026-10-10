import { describe, expect, it } from 'vitest';
import {
  cardRosterRaidReturnsRaidOnly,
  newItemAllocationIsAdded,
  oneSlotPatchKeepsOtherItems,
  raidRosterSqlPredicate,
  sortedRaidNamesSkipEmpty,
  unchangedAllocationsKeepPrevRef,
  unfilteredCardStillReturnsAll,
} from '../../patterns/mimic_book_roster.js';

describe('Mimic Book raid-roster slice and live-claim patch', () => {
  it('roster names are raid-only, sorted, and skip empty', () => {
    expect(sortedRaidNamesSkipEmpty()).toEqual(['Ada', 'Zed']);
  });

  it('one claim patches one slot and leaves other items untouched', () => {
    const { prev, patched, sameCardRef } = oneSlotPatchKeepsOtherItems();
    expect(patched.puppet.selected).toEqual(['222', '']);
    expect(patched.card.selected).toEqual(['111']);
    expect(sameCardRef).toBe(true);
    expect(patched).not.toBe(prev);
  });

  it('unchanged allocations keep the previous object', () => {
    const { prev, patched } = unchangedAllocationsKeepPrevRef();
    expect(patched).toBe(prev);
  });

  it('a new item allocation is added', () => {
    const patched = newItemAllocationIsAdded();
    expect(patched.card.selected).toEqual(['333']);
    expect(patched.puppet.selected).toEqual(['']);
  });

  it('raid SQL predicate matches the stored isRaidRoster flag', () => {
    expect(raidRosterSqlPredicate()).toContain("data->>'isRaidRoster'");
  });

  it('view=card&roster=raid returns only isRaidRoster rows', async () => {
    const { res, calls } = await cardRosterRaidReturnsRaidOnly();
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Object.keys(res.body.members)).toEqual(['u1']);
    expect(res.body.members.u1.isRaidRoster).toBe(true);
    expect(calls).toEqual([{ view: 'card', raidRosterOnly: true }]);
  });

  it('unfiltered view=card still returns every stored member', async () => {
    const { res, calls } = await unfilteredCardStillReturnsAll();
    expect(res.status).toBe(200);
    expect(Object.keys(res.body.members).sort()).toEqual(['u1', 'u2']);
    expect(res.body.members.u2.isRaidRoster).toBe(false);
    expect(calls).toEqual([{ view: 'card', raidRosterOnly: false }]);
  });
});
