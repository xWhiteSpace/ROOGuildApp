import { describe, expect, it } from 'vitest';
import { rematerializeSweep } from '../../patterns/rematerialize_sweep.js';

describe('TST-ROO-189 RematerializeDeletesStaleNonSpecial removes absent non-special rows and leaves special rows in place', () => {
  it('A non-special key absent from the generated map is removed', async () => {
    const r = await rematerializeSweep();
    expect(r.stale).toBeUndefined();
  });

  it('An isSpecial true row is not deleted', async () => {
    const r = await rematerializeSweep();
    expect(r.specialFlag).toBeTruthy();
  });

  it('A source \'special\' row is not deleted', async () => {
    const r = await rematerializeSweep();
    expect(r.specialSource).toBeTruthy();
  });

  it('A key still in the generated map is not removed', async () => {
    const r = await rematerializeSweep();
    expect(r.kept).toBeTruthy();
    expect(r.resultKeys).toContain('2026-10-06_evt1');
  });
});
