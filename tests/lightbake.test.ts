// tests/lightbake.test.ts — bake cahaya map (AO + langit + pantul) masuk akal secara fisik & material bake tidak merusak aslinya.
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { LightField, bakedMaterial } from '../src/world/LightBake';

const field = new LightField();
const ls = { sky: 0, bounce: 0 };

/** Bake satu verteks (posisi, normal) → [ao, langit, pantul]. */
function bakeAt(p: [number, number, number], n: [number, number, number]) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(n, 3));
  field.bakeGeometry(g);
  const b = g.attributes.bake;
  return [b.getX(0), b.getY(0), b.getZ(0)];
}

describe('Bake cahaya map', () => {
  it('selesai cepat saat loading (< 1.5 s)', () => {
    expect(field.ms).toBeLessThan(1500);
  });
  it('lantai di bawah skylight lebih terang dari dalam arsip tertutup', () => {
    const underSky = field.sample(-12, 4, -25, { ...ls }).sky, archive = field.sample(-26.3, 4, -25, { ...ls }).sky;
    expect(underSky).toBeGreaterThan(0.18);
    expect(archive).toBeLessThan(underSky * 0.6);
  });
  it('sudut lantai–dinding lebih gelap (AO) daripada lantai terbuka', () => {
    const corner = bakeAt([-21.95, 0, -24], [0, 1, 0]), open = bakeAt([-12, 0, -16], [0, 1, 0]);
    expect(corner[0]).toBeLessThan(open[0] - 0.1);
    expect(open[0]).toBeGreaterThan(0.85);
  });
  it('nilai bake selalu 0..1', () => {
    for (const [p, n] of [[[0, 10, -40], [0, 1, 0]], [[-30, 18, 0], [1, 0, 0]], [[5, 0, 30], [0, 1, 0]]] as const) {
      for (const v of bakeAt(p as never, n as never)) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(1); }
    }
  });
  it('ada cahaya pantul hangat di dekat bercak matahari skylight', () => {
    let best = 0;
    for (let x = -30; x <= 0; x += 1) for (let z = -30; z <= -20; z += 1) best = Math.max(best, field.sample(x, 1, z, { ...ls }).bounce);
    expect(best).toBeGreaterThan(0.3);
  });
  it('material bake = salinan dengan program terpisah; material asli tidak berubah', () => {
    const m = new THREE.MeshStandardMaterial({ roughness: 0.5 }), b = bakedMaterial(m);
    expect(b).not.toBe(m);
    expect(b.customProgramCacheKey()).toBe('baked-v1');
    expect(m.onBeforeCompile).not.toBe(b.onBeforeCompile);
    expect((b as THREE.MeshStandardMaterial).roughness).toBe(0.5);
  });
});
