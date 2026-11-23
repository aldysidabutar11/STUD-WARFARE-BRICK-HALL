import { describe, expect, it } from 'vitest';
import { k400 } from '../src/combat/Damage';

describe('K-400 (GDD §8.2, §16.1)', () => {
  it('damage vs distance', () => {
    expect(k400(0)).toBe(135);
    expect(k400(4.2)).toBe(118);
    expect(k400(6)).toBe(101);
    expect(k400(6.15)).toBe(100);
    expect(k400(6.2)).toBe(99);
    expect(k400(12)).toBe(0);
  });
  it('fractional occlusion', () => {
    expect(k400(3, 1 / 3)).toBe(42);
  });
  it('table §8.2 (O = 2/3, 1/3)', () => {
    expect([k400(0, 2 / 3), k400(2, 2 / 3), k400(4, 2 / 3), k400(6, 2 / 3), k400(8, 2 / 3), k400(10, 2 / 3)])
      .toEqual([90, 88, 80, 68, 50, 27]);
    expect([k400(0, 1 / 3), k400(2, 1 / 3), k400(4.2, 1 / 3), k400(6.15, 1 / 3), k400(10, 1 / 3)])
      .toEqual([45, 44, 39, 33, 14]);
  });
});
