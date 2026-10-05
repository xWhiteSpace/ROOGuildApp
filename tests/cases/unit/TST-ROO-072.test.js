import { describe, expect, it } from 'vitest';
import {
  commitFailureLoggedNoSwitch,
  dueSchedulerCallsSharedWriter,
} from '../../patterns/auto_commit.js';

describe('TST-ROO-072 AutoCommitSharedWriter calls performCommitSession or no-ops', () => {
  it('Due scheduler signal commits through the shared writer', async () => {
    const { callCount, calls } = await dueSchedulerCallsSharedWriter();
    expect(callCount).toBe(1);
    expect(calls[0][0]).toMatchObject({ event: 'Weekly' });
    expect(calls[0][0].allocations).toBeTruthy();
  });

  it('Commit failure is logged and does not switch writers', async () => {
    const { errors, marker } = await commitFailureLoggedNoSwitch();
    expect(errors.some((line) => /AUTO-COMMIT/i.test(line) && /failed|Commit failed/i.test(line))).toBe(true);
    // Marker released for retry — no alternate writer substituted.
    expect(Object.keys(marker).length).toBe(0);
  });
});
