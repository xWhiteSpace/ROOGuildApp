import { describe, expect, it } from 'vitest';
import {
  collectionUpsertSql,
  idsNeedingRead,
  reduceCollectionEntries,
} from '../../../backend/src/db/database.js';
import { sortEventRows } from '../../../backend/src/games/ragnarok-origin/services/gvgSheet.js';

function applyOneByOne(existing, entries) {
  return entries.reduce((state, entry) => reduceCollectionEntries(state, [entry]), existing);
}

describe('root collection updates keep the same documents', () => {
  const start = {
    'auction/members': {
      a: { displayName: 'Ann', jobCode: 'knight', note: 'keep', profile: { name: 'Ann', rank: 1 } },
      b: { displayName: 'Bea', jobCode: 'priest' },
    },
    'auction/web_requests': {
      r1: { selectionStatus: 'Pending', quantity: 1, itemId: 'puppet', secret: 'stay' },
    },
  };

  const fields = ['isRaidRoster', 'jobCode', 'roleCode', 'groupTag', 'joinedAt', 'inGameName', 'status', 'leaveCreditsRemaining'];

  const entries = [
    ...fields.map((field, index) => [`auction/members/a/${field}`, field === 'isRaidRoster' ? true : `a-${index}`]),
    ['auction/members/a/note', null],
    ['auction/members/a/profile/name', 'Anne'],
    ['auction/members/b/jobCode', 'wizard'],
    ['auction/members/c/displayName', 'Cee'],
    ['auction/web_requests/r1/selectionStatus', 'Selected'],
    ['auction/web_requests/r1/eventDate', '2026-10-28'],
    ['auction/web_requests/r1/quantity', 2],
    ['auction/web_requests/r1/liveStatus', 'Done'],
    ['auction/web_requests/r2', { id: 'r2', selectionStatus: 'Selected', itemId: 'sword' }],
    ['auction/past_auctions/p1', { id: 'p1', userId: 'a', quantity: 2 }],
    ['auction/loot_history/l1', { id: 'l1', quantity: 1 }],
    ['auction/active_session', null],
    ['auction/members/b', null],
  ];

  it('matches applying each path on its own', () => {
    const batched = reduceCollectionEntries(start, entries);
    const sequential = applyOneByOne(start, entries);
    expect(batched).toEqual(sequential);
  });

  it('keeps untouched fields, removes null keys, and replaces a whole row', () => {
    const batched = reduceCollectionEntries(start, entries);
    expect(batched['auction/members'].a).toEqual({
      displayName: 'Ann',
      jobCode: 'a-1',
      profile: { name: 'Anne', rank: 1 },
      isRaidRoster: true,
      roleCode: 'a-2',
      groupTag: 'a-3',
      joinedAt: 'a-4',
      inGameName: 'a-5',
      status: 'a-6',
      leaveCreditsRemaining: 'a-7',
    });
    expect(batched['auction/members'].a.note).toBeUndefined();
    expect(batched['auction/members'].b).toBeUndefined();
    expect(batched['auction/members'].c).toEqual({ displayName: 'Cee' });
    expect(batched['auction/web_requests'].r1).toEqual({
      selectionStatus: 'Selected',
      quantity: 2,
      itemId: 'puppet',
      secret: 'stay',
      eventDate: '2026-10-28',
      liveStatus: 'Done',
    });
    expect(batched['auction/web_requests'].r2).toEqual({ id: 'r2', selectionStatus: 'Selected', itemId: 'sword' });
    expect(batched['auction/past_auctions'].p1).toEqual({ id: 'p1', userId: 'a', quantity: 2 });
    expect(batched['auction/loot_history'].l1).toEqual({ id: 'l1', quantity: 1 });
    expect(batched['auction/active_session']).toBeUndefined();
  });

  it('reads a row once when fields change and skips the read for a full document', () => {
    const memberOps = fields.map((field) => ({ id: 'a', rest: [field] }));
    memberOps.push({ id: 'b', rest: ['jobCode'] });
    expect(idsNeedingRead(memberOps)).toEqual(['a', 'b']);
    expect(idsNeedingRead([
      { id: 'p1', rest: [] },
      { id: 'l1', rest: [] },
      { id: 'r2', rest: [] },
    ])).toEqual([]);
    expect(idsNeedingRead([
      { id: 'r1', rest: [] },
      { id: 'r1', rest: ['quantity'] },
    ])).toEqual([]);
  });

  it('writes each table in one statement and does not return the row', () => {
    const sql = collectionUpsertSql('members', 'discord_id');
    expect(sql).toMatch(/unnest\(\$3::text\[\], \$4::text\[\]\)/);
    expect(sql).toMatch(/DO UPDATE SET data = EXCLUDED\.data/);
    expect(sql.toLowerCase()).not.toContain('returning');
    expect(collectionUpsertSql('auction_requests', 'id').toLowerCase()).not.toContain('returning');
    expect(collectionUpsertSql('past_auction_awards', 'id').toLowerCase()).not.toContain('returning');
    expect(collectionUpsertSql('loot_history', 'id').toLowerCase()).not.toContain('returning');
  });
});

describe('GvG history by event sorts by score', () => {
  it('puts the highest score first and keeps name order for a tie', () => {
    const rows = [
      { uid: 'ann', displayName: 'Ann' },
      { uid: 'bea', displayName: 'Bea' },
      { uid: 'cy', displayName: 'Cy' },
      { uid: 'dee', displayName: 'Dee' },
    ];
    const sorted = sortEventRows(rows, { ann: 1, bea: 4, cy: 4 });
    expect(sorted.map((row) => row.uid)).toEqual(['bea', 'cy', 'ann', 'dee']);
  });
});
