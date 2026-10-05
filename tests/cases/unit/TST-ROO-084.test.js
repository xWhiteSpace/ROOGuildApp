import { describe, expect, it } from 'vitest';
import {
  gateLockdownNoSecondWrite,
  reqcardDropUsesCancelPending,
  reqcardOpenBuildsPrivatePanel,
  reqcardSubmitUsesSharedWriter,
  rosterDisconnectNoLedgerWrite,
} from '../../patterns/reqcard.js';

describe('TST-ROO-084 DiscordRequestCardInteractions open, submit, and drop through the shared deck', () => {
  it('reqcard open builds a private panel from the shared lobby', async () => {
    const { replies, webRequests } = await reqcardOpenBuildsPrivatePanel();
    expect(replies.length).toBeGreaterThan(0);
    expect(replies[0].embeds?.length || replies[0].components?.length).toBeGreaterThan(0);
    expect(Object.keys(webRequests)).toHaveLength(0);
  });

  it('reqcard submit writes through SubmitRequestSelections', async () => {
    const { deltas, writerName } = await reqcardSubmitUsesSharedWriter();
    expect(writerName).toBe('submitSelections');
    expect(deltas.some((d) => d.itemId === 'puppet' && d.applicationStatus === 'Requested')).toBe(true);
  });

  it('reqcard drop writes through CancelPendingRequest', async () => {
    const { canceled, writerName } = await reqcardDropUsesCancelPending();
    expect(writerName).toBe('cancelPending');
    expect(canceled.some((d) => d.itemId === 'puppet')).toBe(true);
  });

  it('Roster disconnect does not write a Discord-only ledger', async () => {
    const { replies, webRequests } = await rosterDisconnectNoLedgerWrite();
    expect(replies[0].content).toMatch(/ROSTER DISCONNECT/i);
    expect(Object.keys(webRequests)).toHaveLength(0);
  });

  it('Gate lockdown follows deck/gate rules instead of a local write', async () => {
    const { replies, before, after } = await gateLockdownNoSecondWrite();
    expect(replies[0].content).toMatch(/ADMINISTRATIVE LOCKDOWN/i);
    expect(after).toEqual(before);
  });
});
