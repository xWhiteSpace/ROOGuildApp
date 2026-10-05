import { describe, expect, it } from 'vitest';
import { collectQueueMemberUids } from '../../../backend/src/games/ragnarok-origin/services/requestDeck.js';
import { compileLeaderboard } from '../../../backend/src/games/ragnarok-origin/utils/sortingEngine.js';

describe('request lobby split', () => {
  it('compiles a single item queue without other item boards', () => {
    const pending = [
      {
        id: 'a',
        userId: 'u1',
        itemId: 'puppet',
        item: 'Puppet',
        quantity: 1,
        applicationStatus: 'Requested',
        selectionStatus: 'Pending',
        member: 'Ada',
        time: '10:00',
      },
      {
        id: 'b',
        userId: 'u2',
        itemId: 'other',
        item: 'Other',
        quantity: 2,
        applicationStatus: 'Requested',
        selectionStatus: 'Pending',
        member: 'Ben',
        time: '10:01',
      },
    ];
    const computed = compileLeaderboard(
      pending,
      [{ id: 'puppet', name: 'Puppet', isHighValue: false }],
      { u1: { displayName: 'Ada' } },
    );
    expect(Object.keys(computed.rankingsByItem)).toEqual(['puppet']);
    expect(computed.rankingsByItem.puppet).toEqual(['u1']);
    expect(computed.requestsByItemDetails.other).toBeUndefined();
    expect(computed.requestsByItemDetails.puppet.u1.quantity).toBe(1);
  });

  it('collects only UIDs on that item board, not the rest of the roster', () => {
    const pending = [
      { userId: 'u1', itemId: 'puppet' },
      { userId: 'u2', itemId: 'puppet' },
    ];
    const lookback = [
      { userId: 'u1', itemId: 'puppet' },
      { userId: 'u3', itemId: 'puppet' },
    ];
    expect(collectQueueMemberUids(pending, lookback).sort()).toEqual(['u1', 'u2', 'u3']);
    expect(collectQueueMemberUids(pending, lookback)).not.toContain('u99');
  });
});
