import { describe, expect, it } from 'vitest';
import { r3NotInScheduleContributors, r3PathCatalog } from '../../patterns/r3_isolation.js';

describe('TST-R3-005 R3 calendar does not leak into scheduleContributors', () => {
  it('no ragnarok-3 contributor is registered', () => {
    const r = r3NotInScheduleContributors();
    expect(r.hasR3).toBe(false);
    expect(r.ids).not.toContain('ragnarok-3');
  });

  it('leftover Origin root paths still resolve to Origin', () => {
    expect(r3PathCatalog().originRoot).toBe('ragnarok-origin');
  });
});
