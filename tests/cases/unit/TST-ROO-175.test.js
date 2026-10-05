import { describe, expect, it } from 'vitest';
import {
  cycleKeyJoinsFiveFields,
  equalLastPublishKeySkipsEnsure,
  differentKeyDoesNotSkip,
  emptyWarRoomsReturnsBeforeLiveStartKey,
  failedAutoStartNotRetried,
  successfulAutoStartNotRepeated,
  failedPublishDoesNotEnsureBoard,
} from '../../patterns/war_room_publish.js';

describe('TST-ROO-175 WarRoomCycleKeysDedupPublishAndLiveStart', () => {
  it('The cycle key joins the five fields with a bar', () => {
    const r = cycleKeyJoinsFiveFields();
    expect(r.key).toBe(r.expected);
  });

  it('An equal lastPublishKey skips ensurePublishedForCycle', async () => {
    const r = await equalLastPublishKeySkipsEnsure();
    expect(r.firstBoard).toBeGreaterThanOrEqual(1);
    expect(r.secondBoard).toBe(0);
  });

  it('A different lastPublishKey does not skip ensurePublishedForCycle', async () => {
    const r = await differentKeyDoesNotSkip();
    expect(r.boardOnDifferentKey).toBeGreaterThanOrEqual(1);
  });

  it('lastLiveStartKey is recorded before create returns', async () => {
    const r = await failedAutoStartNotRetried();
    expect(r.noSession).toBe(true);
  });

  it('An empty warRoomIds list returns before the key is recorded', async () => {
    const r = await emptyWarRoomsReturnsBeforeLiveStartKey();
    expect(r.createdOnRetry).toBe(true);
  });

  it('A minute tick that is not a successful publish does not ensure the readiness board', async () => {
    const r = await failedPublishDoesNotEnsureBoard();
    expect(r.boardCalls).toBe(0);
  });

  it('The readiness board is ensured only inside a successful publish', async () => {
    const r = await equalLastPublishKeySkipsEnsure();
    expect(r.firstBoard).toBeGreaterThanOrEqual(1);
  });

  it('A failed auto-start is not retried for the same cycle key', async () => {
    const r = await failedAutoStartNotRetried();
    expect(r.noSession).toBe(true);
  });

  it('A successful auto-start is not repeated for the same cycle key', async () => {
    const r = await successfulAutoStartNotRepeated();
    expect(r.firstStarted).toBe(true);
    expect(r.secondAbsent).toBe(true);
  });
});
