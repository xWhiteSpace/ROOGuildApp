import { describe, expect, it } from 'vitest';
import {
  blankMissingSkipsDictionary,
  linkMissingMarksPresent,
  linkUnmatchMarksPresent,
  moveClearsPrevious,
  namedGapSkipsDictionary,
  resultWheel,
  unlinkRestoresGap,
} from '../../patterns/ocr_link_present.js';

describe('GVG Attendance link marks present', () => {
  it('marks the linked member present and drops the unmatched gap', () => {
    const linked = linkUnmatchMarksPresent();
    expect(linked.ok).toBe(true);
    expect(linked.text).toBe('Beee');
    expect(linked.source).toBe('officer');
    expect(linked.col).toBe(2);
    expect(linked.absent).toEqual(['cy']);
    expect(linked.gapIds).toEqual(['m1']);
  });

  it('marks a missing slot present without a name to remember', async () => {
    const linked = linkMissingMarksPresent();
    expect(linked.text).toBe('');
    expect(linked.source).toBe('officer');
    expect(linked.col).toBe(3);
    expect(linked.row).toBe(1);
    expect(linked.absent).toEqual(['bea']);
    expect(linked.gapIds).toEqual(['u1']);
    const claim = await blankMissingSkipsDictionary();
    expect(claim.text).toBe('');
    expect(claim.updates).toEqual([]);
    const named = await namedGapSkipsDictionary();
    expect(named.source).toBe('officer');
    expect(named.updates).toEqual([]);
  });

  it('clears the previous member when a reading moves', () => {
    const moved = moveClearsPrevious();
    expect(moved.adaPresent).toBe(false);
    expect(moved.adaMatch).toBeNull();
    expect(moved.beaText).toBe('Ada');
    expect(moved.source).toBe('dictionary');
    expect(moved.absent).toEqual(['cy', 'ada']);
  });

  it('puts an unlinked reading back in the slot gaps and forgets the saved spelling', () => {
    const undone = unlinkRestoresGap();
    expect(undone.gapText).toBe('Beee');
    expect(undone.category).toBe('unmatch');
    expect(undone.col).toBe(2);
    expect(undone.stillPresent).toBe(true);
    expect(undone.presentText).toBe('');
    expect(undone.match).toBeNull();
    expect(undone.gapIds).toContain('Beee');
    expect(undone.forgotten).toEqual(['Bee']);
  });

  it('keeps the GvG result wheel to the eight war outcomes', () => {
    const wheel = resultWheel();
    expect(wheel.win).toBe('Win');
    expect(wheel.down).toBe('↓5th');
    expect(wheel.other).toBe('');
  });
});
