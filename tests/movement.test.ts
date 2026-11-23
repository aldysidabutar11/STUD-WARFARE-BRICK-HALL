import { describe, expect, it } from 'vitest';
import { fallDamage, moveTarget, simulateJumpApex } from '../src/combat/Damage';

describe('movement (GDD §3.4, §3.5, §16.1)', () => {
  it('fall damage', () => {
    expect(fallDamage(11.38)).toBe(31);
    expect(fallDamage(10.0)).toBe(20);
    expect(fallDamage(7.38)).toBe(0);
  });
  it('W+D target speed (elliptic normalisation)', () => {
    const v = moveTarget({ ix: 1, iz: 1, sprinting: false, crouched: false, ads: false });
    expect(Math.hypot(v.vx, v.vz)).toBeCloseTo(5.71, 2);
  });
  it('basic speeds', () => {
    expect(moveTarget({ ix: 0, iz: 1, sprinting: false, crouched: false, ads: false }).vz).toBeCloseTo(6.0, 5);
    expect(moveTarget({ ix: 0, iz: -1, sprinting: false, crouched: false, ads: false }).vz).toBeCloseTo(-4.5, 5);
    expect(moveTarget({ ix: 1, iz: 0, sprinting: false, crouched: false, ads: false }).vx).toBeCloseTo(5.4, 5);
    expect(moveTarget({ ix: 0, iz: 1, sprinting: true, crouched: false, ads: false }).vz).toBeCloseTo(8.5, 5);
    expect(moveTarget({ ix: 0, iz: 1, sprinting: false, crouched: true, ads: false }).vz).toBeCloseTo(3.2, 5);
  });
  it('jump apex (fixed-step simulation)', () => {
    expect(Math.abs(simulateJumpApex() - 1.383)).toBeLessThanOrEqual(0.05);
  });
});
