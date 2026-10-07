import { describe, expect, it } from 'vitest';
import {
  closedGateDoesNotMutateViaOpenPanel,
  collisionDoesNotOverwrite,
  missingMemberRosterDisconnect,
  openGateClaimUpdatesSession,
  perItemLimitDoesNotWriteExtra,
} from '../../patterns/claim_panel.js';

describe('TST-ROO-085 InteractiveClaimPanel updates claims only while the live-claim gate is open', () => {
  it('Open gate and rostered member update the session claim', async () => {
    const { claimed, after, members } = await openGateClaimUpdatesSession();
    expect(claimed).toBe('111');
    expect(after.version).toBeGreaterThan(1);
    expect(after.categoryAllocations.puppet.selected[0]).toBe('111');
    expect(members['111'].displayName).toBe('Ada');
  });

  it('Closed live-claim gate does not change the session', async () => {
    // Open panel with gate closed: paused UI, no claim write. (claim_slot itself does not re-check gate.)
    const { before, after, replies } = await closedGateDoesNotMutateViaOpenPanel();
    expect(after.categoryAllocations).toEqual(before.categoryAllocations);
    expect(after.version).toBe(before.version);
    expect(replies[0]?.content || '').toMatch(/AUCTION PAUSED|USER INFORMATION/i);
  });

  it('Member missing from the roster does not claim', async () => {
    const { before, after, replies } = await missingMemberRosterDisconnect();
    expect(replies[0]?.content || '').toMatch(/ROSTER DISCONNECT/i);
    expect(after.categoryAllocations).toEqual(before.categoryAllocations);
  });

  it('Collision or per-item limit does not write the conflicting claim', async () => {
    const collision = await collisionDoesNotOverwrite();
    expect(collision.selected[0]).toBe('222');
    expect(collision.replies.some((r) => /SLOT OCCUPIED|CLAIM RESTRICTED|LIMIT/i.test(r.content || ''))).toBe(true);

    const limit = await perItemLimitDoesNotWriteExtra();
    expect(limit.selected[1]).toBe('');
    expect(limit.replies.some((r) => /CLAIM RESTRICTED|LIMIT|capacity/i.test(r.content || ''))).toBe(true);
  });
});
