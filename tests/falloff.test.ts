import { describe, expect, it } from 'vitest';
import { falloff } from '../src/combat/Damage';

describe('falloff (GDD §5.2, §16.1)', () => {
  it('matches test vectors', () => {
    expect(falloff(40)).toBe(1.0);
    expect(falloff(70)).toBe(0.8125);
    expect(falloff(96)).toBe(0.65);
    expect(falloff(150)).toBe(0.65);
  });
  it('is 1.0 up to 40 units', () => {
    expect(falloff(0)).toBe(1);
    expect(falloff(39.9)).toBe(1);
  });
});
