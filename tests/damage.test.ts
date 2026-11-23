import { describe, expect, it } from 'vitest';
import { WEAPONS } from '../src/config/weaponsData';
import { damage, recoilSum, shotsToKill, timeToKill } from '../src/combat/Damage';

const W = WEAPONS;

describe('damage (GDD §16.1)', () => {
  it('headshots', () => {
    expect(damage(W.m416, 'head', 30)).toBe(96);   // 2 headshot (5.56)
    expect(damage(W.akm, 'head', 30)).toBe(113);   // one-tap
    expect(damage(W.akm, 'head', 60)).toBe(99);    // di luar batas one-tap 58.9
    expect(damage(W.m16a4, 'head', 42)).toBe(100); // masih one-tap
    expect(damage(W.m16a4, 'head', 43)).toBe(99);  // presisi falloff
  });
  it('limbs use Math.round (half up)', () => {
    expect(damage(W.m416, 'limb', 30)).toBe(21);   // 20.5 -> 21
    expect(damage(W.mk47, 'limb', 30)).toBe(25);   // 24.5 -> 25
  });
  it('falloff applied to body shots', () => {
    expect(damage(W.m416, 'upper', 70)).toBe(33);  // falloff 0.8125
    expect(damage(W.akm, 'upper', 100)).toBe(31);  // lantai 0.65
  });
  it('STK / TTK', () => {
    expect(shotsToKill(damage(W.m416, 'upper', 30))).toBe(3);
    expect(timeToKill(W.m416, 'upper', 30)).toBeCloseTo(0.1714, 4);   // 2 × 60/700
    expect(shotsToKill(damage(W.groza, 'upper', 30))).toBe(3);
    expect(timeToKill(W.groza, 'upper', 30)).toBeCloseTo(0.1600, 4);  // TTK sustained tercepat
    expect(shotsToKill(damage(W.m16a4, 'upper', 30))).toBe(3);
    expect(timeToKill(W.m16a4, 'upper', 30)).toBeCloseTo(0.1500, 4);  // satu burst penuh
    expect(timeToKill(W.mk47, 'upper', 30)).toBeCloseTo(0.3000, 4);   // burst-2 + jeda 0.20
  });
  it('recoil sums (n starts at 0)', () => {
    expect(recoilSum(W.m416, 10)).toBeCloseTo(14.16, 2);
    expect(recoilSum(W.akm, 30)).toBeCloseTo(77.0, 2);
  });
});
