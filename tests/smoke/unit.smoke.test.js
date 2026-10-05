import { describe, expect, it } from 'vitest';
import { patterns } from '../patterns/registry.js';

describe('unit runner', () => {
  it('loads the pattern registry', () => {
    expect(Object.keys(patterns).length).toBeGreaterThan(0);
    expect(patterns.env_gate_refusal).toBe('unused');
  });
});
