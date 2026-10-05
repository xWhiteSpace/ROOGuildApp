import { describe, expect, it } from 'vitest';
import {
  allowedPhaseCancelsFullPending,
  missingItemIdentityDoesNotCancel,
  phase3DoesNotCancel,
} from '../../patterns/cancel_pending.js';

describe('TST-ROO-068 CancelPendingRequest drops one item\'s pending qty and locks phase 3', () => {
  it('Allowed phase cancels the full pending quantity for the item', async () => {
    const { result, canceled } = await allowedPhaseCancelsFullPending();
    expect(result.success).toBe(true);
    expect(canceled.some((r) => r.itemId === 'puppet' && r.quantity === 2)).toBe(true);
  });

  it('Phase 3 does not cancel', async () => {
    const { error, before, after, isDeckError } = await phase3DoesNotCancel();
    expect(isDeckError).toBe(true);
    expect(error.status).toBe(423);
    expect(Object.keys(after)).toEqual(Object.keys(before));
  });

  it('Missing item identity does not cancel', async () => {
    const { canceled, beforeKeys, afterKeys } = await missingItemIdentityDoesNotCancel();
    expect(canceled).toHaveLength(0);
    expect(afterKeys).toEqual(beforeKeys);
  });
});
