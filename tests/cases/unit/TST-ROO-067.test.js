import { describe, expect, it } from 'vitest';
import {
  closedGateRefusesSelections,
  emptySelectionsRefused,
  httpAndDiscordShareSubmitWriter,
  missingMemberRefusedOnDiscordCard,
  openGateWritesPendingDeltas,
  overCapRejected,
} from '../../patterns/submit_selections.js';

describe('TST-ROO-067 SubmitRequestSelections writes Pending deltas only while the registration gate is open', () => {
  it('Open gate and in-cap selections write Pending Requested or Canceled deltas', async () => {
    const { result, lobby, before, deltas } = await openGateWritesPendingDeltas();
    expect(result.success).toBe(true);
    expect(deltas.length).toBeGreaterThan(before);
    expect(deltas.some((d) => d.applicationStatus === 'Requested' && d.selectionStatus === 'Pending')).toBe(true);
    expect(lobby.liveCounts.puppet).toBe(1);
  });

  it('Closed gate does not accept selections', async () => {
    const { error, before, after, isDeckError } = await closedGateRefusesSelections();
    expect(isDeckError).toBe(true);
    expect(error.status).toBe(423);
    expect(Object.keys(after)).toEqual(Object.keys(before));
  });

  it('Empty selections do not write deltas', async () => {
    const { error, before, after, isDeckError } = await emptySelectionsRefused();
    expect(isDeckError).toBe(true);
    expect(error.status).toBe(400);
    expect(after).toBe(before);
  });

  it('Quantity above the event loot cap is rejected', async () => {
    const { error, before, after, isDeckError } = await overCapRejected();
    expect(isDeckError).toBe(true);
    expect(error.status).toBe(422);
    expect(after).toBe(before);
  });

  it('Missing member is refused', async () => {
    const { replies, webRequests } = await missingMemberRefusedOnDiscordCard();
    expect(replies.length).toBeGreaterThan(0);
    expect(Object.keys(webRequests)).toHaveLength(0);
  });

  it('HTTP submit and Discord Request Card use the same writer', async () => {
    const { http, direct, writerName } = await httpAndDiscordShareSubmitWriter();
    expect(http.status).toBe(200);
    expect(http.body.success).toBe(true);
    expect(direct.success).toBe(true);
    expect(writerName).toBe('submitSelections');
  });
});
