import { describe, expect, it } from 'vitest';
import { SCOPES, WEAPONS, scopeAllowed } from '../src/config/weaponsData';
import { effectiveZoom, sensRatio } from '../src/combat/Damage';

describe('scope sensitivity (GDD §6, §16.1)', () => {
  it('sensRatio at base FOV 75°', () => {
    expect(sensRatio(SCOPES.x4.fov)).toBeCloseTo(0.2298, 4);
    expect(sensRatio(SCOPES.x6.fov)).toBeCloseTo(0.1542, 4);
    expect(sensRatio(SCOPES.iron.fov)).toBeCloseTo(0.8790, 4);
    expect(sensRatio(SCOPES.reddot.fov)).toBeCloseTo(0.7524, 4);
    expect(sensRatio(SCOPES.x2.fov)).toBeCloseTo(0.4743, 4);
    expect(sensRatio(SCOPES.x3.fov)).toBeCloseTo(0.3249, 4);
  });
  it('effective magnification', () => {
    expect(effectiveZoom(SCOPES.x6.fov)).toBeCloseTo(6.48, 2);
    expect(effectiveZoom(SCOPES.x4.fov)).toBeCloseTo(4.35, 2);
  });
  it('Groza is locked out of 4x/6x', () => {
    expect(scopeAllowed(WEAPONS.groza, 'x3')).toBe(true);
    expect(scopeAllowed(WEAPONS.groza, 'x4')).toBe(false);
    expect(scopeAllowed(WEAPONS.groza, 'x6')).toBe(false);
    expect(scopeAllowed(WEAPONS.m416, 'x6')).toBe(true);
  });
});
