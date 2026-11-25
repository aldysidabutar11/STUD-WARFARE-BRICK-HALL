import { describe, expect, it } from 'vitest';
import { fallDamage, moveTarget, simulateJumpApex } from '../src/combat/Damage';
import { CFG } from '../src/config/gameConfig';
import { Spring, mapTempo } from '../src/entities/moveFeel';
import { strideYaw } from '../src/entities/BlockyCharacter';

const base = { sprinting: false, crouched: false, ads: false };

describe('movement (GDD §3.4, §3.5, §16.1) — tabel dasar (moveSpeedScale 1)', () => {
  it('fall damage', () => {
    expect(fallDamage(11.38)).toBe(31);
    expect(fallDamage(10.0)).toBe(20);
    expect(fallDamage(7.38)).toBe(0);
  });
  it('W+D target speed (elliptic normalisation)', () => {
    const v = moveTarget({ ix: 1, iz: 1, ...base }, undefined, 1);
    expect(Math.hypot(v.vx, v.vz)).toBeCloseTo(5.71, 2);
  });
  it('basic speeds', () => {
    expect(moveTarget({ ix: 0, iz: 1, ...base }, undefined, 1).vz).toBeCloseTo(6.0, 5);
    expect(moveTarget({ ix: 0, iz: -1, ...base }, undefined, 1).vz).toBeCloseTo(-4.5, 5);
    expect(moveTarget({ ix: 1, iz: 0, ...base }, undefined, 1).vx).toBeCloseTo(5.4, 5);
    expect(moveTarget({ ix: 0, iz: 1, ...base, sprinting: true }, undefined, 1).vz).toBeCloseTo(8.5, 5);
    expect(moveTarget({ ix: 0, iz: 1, ...base, crouched: true }, undefined, 1).vz).toBeCloseTo(3.2, 5);
  });
  it('jump apex (fixed-step simulation)', () => {
    expect(Math.abs(simulateJumpApex() - 1.383)).toBeLessThanOrEqual(0.05);
  });
});

describe('tempo gerak (moveSpeedScale sebagai skala waktu)', () => {
  const T = CFG.player.moveSpeedScale;
  it('tempo aktif di rentang uji GDD (1.25–1.5) dan kecepatan dikali tempo', () => {
    expect(T).toBeGreaterThanOrEqual(1.25); expect(T).toBeLessThanOrEqual(1.5);
    expect(moveTarget({ ix: 0, iz: 1, ...base }).vz).toBeCloseTo(6.0 * T, 5);
    expect(moveTarget({ ix: 0, iz: 1, ...base, sprinting: true }).vz).toBeCloseTo(8.5 * T, 5);
  });
  it('puncak lompat tetap 1.383 untuk tempo berapa pun; durasi udara 0.71/T', () => {
    for (const t of [1, 1.25, T, 1.6]) {
      const out = { airTime: 0 };
      expect(Math.abs(simulateJumpApex(t, out) - 1.383)).toBeLessThanOrEqual(0.05);
      expect(out.airTime).toBeCloseTo(2 * 7.8 / 22 / t, 1);
    }
  });
  it('jarak lompat sprint di ruang tidak berubah (pagar jembatan, rak A/B tetap terjangkau persis seperti GDD)', () => {
    const d = (t: number) => { const o = { airTime: 0 }; simulateJumpApex(t, o); return 8.5 * t * o.airTime; };
    expect(Math.abs(d(T) - d(1))).toBeLessThan(0.15);
    expect(d(1)).toBeGreaterThan(5); // sprint-jump ke rak B (5 u dari pagar balkon)
  });
});

describe('tempo gerak per map', () => {
  it('Steel Yard (ruang terbuka) memakai tempo lebih cepat tapi tetap di rentang uji GDD §3.4; map lain = tempo dasar', () => {
    const base = CFG.player.moveSpeedScale, sy = mapTempo('steelyard');
    expect(sy).toBeGreaterThan(base);
    expect(sy).toBeGreaterThanOrEqual(1.25); expect(sy).toBeLessThanOrEqual(1.5);
    expect(mapTempo('brickhall')).toBe(base);
    expect(mapTempo('tidak-ada')).toBe(base);
  });
  it('tempo Steel Yard: puncak lompat & jarak lompat sprint di ruang sama dengan tempo dasar (tidak membuka tempat baru)', () => {
    const sy = mapTempo('steelyard'), o = { airTime: 0 };
    expect(Math.abs(simulateJumpApex(sy, o) - 1.383)).toBeLessThanOrEqual(0.05);
    const d = (t: number) => { const q = { airTime: 0 }; simulateJumpApex(t, q); return 8.5 * t * q.airTime; };
    expect(Math.abs(d(sy) - d(CFG.player.moveSpeedScale))).toBeLessThan(0.15);
  });
});

describe('rasa gerak', () => {
  it('pegas hentakan mencapai simpangan puncak yang diminta lalu kembali ke nol', () => {
    const s = new Spring(14, 0.6);
    s.kick(-0.2);
    let min = 0;
    for (let i = 0; i < 120; i++) min = Math.min(min, s.update(1 / 120));
    expect(min).toBeCloseTo(-0.2, 2);
    for (let i = 0; i < 240; i++) s.update(1 / 120);
    expect(Math.abs(s.x)).toBeLessThan(0.005);
  });
  it('arah langkah kaki: maju lurus, strafe diputar ke arah gerak, mundur dicerminkan', () => {
    expect(strideYaw(0, 1, false).yaw).toBeCloseTo(0, 5);                        // maju
    expect(strideYaw(1, 0, false).yaw).toBeLessThan(-0.8);                       // kanan → putar kanan (yaw negatif)
    expect(strideYaw(-1, 0, false).yaw).toBeGreaterThan(0.8);                    // kiri → putar kiri
    const br = strideYaw(1, -1, false);                                          // mundur-kanan
    expect(br.back).toBe(true); expect(br.yaw).toBeGreaterThan(0);
    expect(strideYaw(0, -1, false).yaw).toBeCloseTo(0, 5);                       // mundur lurus
    expect(strideYaw(1, 0, true).back).toBe(false);                              // strafe murni selalu "depan" (kaki ke kanan)
    expect(strideYaw(1, 0, true).yaw).toBeLessThan(-0.8);
    expect(strideYaw(1, -0.2, true).back).toBe(true);                            // pita histeresis 97°–110°: tetap
    expect(strideYaw(1, -0.2, false).back).toBe(false);
  });
});
