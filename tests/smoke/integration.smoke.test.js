import { describe, expect, it } from 'vitest';
import { patternStatus } from '../patterns/registry.js';

describe('integration runner', () => {
  it('resolves a published pattern name', () => {
    expect(patternStatus('health_seam')).toBe('unused');
    expect(patternStatus('not-a-pattern')).toBeNull();
  });
});
