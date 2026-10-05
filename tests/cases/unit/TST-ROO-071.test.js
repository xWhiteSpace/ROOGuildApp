import { describe, expect, it } from 'vitest';
import {
  absentAndNotSelectedAndSupersede,
  commitConflictNoPartial,
  forcedAddWinnerWithoutPending,
  httpAndAutoShareWriter,
  missingAllocationsRefused,
  nonOfficerCommitRefused,
  officerCommitWritesBundle,
  selectedPendingNotForcedAdd,
} from '../../patterns/atomic_commit.js';

describe('TST-ROO-071 PerformCommitSession atomically writes history, flips statuses, and clears the session', () => {
  it('Officer commit writes history and clears the session in one bundle', async () => {
    const { lootHistory, pastAuctions, webRequests, activeSession } = await officerCommitWritesBundle();
    expect(Object.keys(lootHistory).length).toBeGreaterThan(0);
    expect(Object.keys(pastAuctions).length).toBeGreaterThan(0);
    expect(activeSession).toBeNull();
    const terminal = Object.values(webRequests).filter((r) => r.selectionStatus === 'Selected');
    expect(terminal.length).toBeGreaterThan(0);
  });

  it('Commit conflict leaves no partial writes', async () => {
    const { error, before, after } = await commitConflictNoPartial();
    expect(error).toBeTruthy();
    expect(after.auction?.active_session).toEqual(before.auction?.active_session);
    expect(after.auction?.loot_history || {}).toEqual(before.auction?.loot_history || {});
    expect(after.auction?.past_auctions || {}).toEqual(before.auction?.past_auctions || {});
    expect(after.auction?.web_requests).toEqual(before.auction?.web_requests);
  });

  it('Selected winner with no pending becomes Selected and ForcedAdd', async () => {
    const { webRequests } = await forcedAddWinnerWithoutPending();
    const forced = Object.values(webRequests).find((r) => r.userId === '333');
    expect(forced).toMatchObject({
      applicationStatus: 'ForcedAdd',
      selectionStatus: 'Selected',
      liveStatus: 'Done',
    });
  });

  it('Selected winner who already has a pending is not ForcedAdd', async () => {
    const { webRequests } = await selectedPendingNotForcedAdd();
    const selected = Object.values(webRequests).filter((r) => r.userId === '111' && r.selectionStatus === 'Selected');
    expect(selected.length).toBeGreaterThan(0);
    expect(selected.every((r) => r.applicationStatus !== 'ForcedAdd')).toBe(true);
    expect(selected.some((r) => r.liveStatus === 'Done')).toBe(true);
  });

  it('Absent allocation becomes Absent', async () => {
    const { webRequests } = await absentAndNotSelectedAndSupersede();
    expect(Object.values(webRequests).some((r) => r.userId === '111' && r.selectionStatus === 'Absent')).toBe(true);
  });

  it('Not-selected allocation becomes NotSelected', async () => {
    const { webRequests } = await absentAndNotSelectedAndSupersede();
    expect(Object.values(webRequests).some((r) => r.userId === '222' && r.selectionStatus === 'NotSelected')).toBe(true);
  });

  it('Earlier Pending rows are Superseded; the latest becomes terminal', async () => {
    const { webRequests } = await absentAndNotSelectedAndSupersede();
    const for222 = Object.entries(webRequests)
      .filter(([, r]) => r.userId === '222')
      .map(([id, r]) => ({ id, ...r }));
    expect(for222.some((r) => r.selectionStatus === 'Superseded')).toBe(true);
    expect(for222.some((r) => r.selectionStatus === 'NotSelected')).toBe(true);
  });

  it('Non-officer does not commit', async () => {
    const { res, before, after } = await nonOfficerCommitRefused();
    expect(res.status).toBe(403);
    expect(after.auction?.active_session).toEqual(before.auction?.active_session);
    expect(after.auction?.loot_history || {}).toEqual(before.auction?.loot_history || {});
  });

  it('Missing allocations do not commit', async () => {
    const { res, before, after } = await missingAllocationsRefused();
    expect(res.status).toBe(400);
    expect(after.auction?.active_session).toEqual(before.auction?.active_session);
    expect(after.auction?.loot_history || {}).toEqual(before.auction?.loot_history || {});
  });

  it('HTTP commit and auto-commit share this writer only', async () => {
    const { httpUses, writerName } = await httpAndAutoShareWriter();
    expect(httpUses).toBe(true);
    expect(writerName).toBe('performCommitSession');
  });
});
