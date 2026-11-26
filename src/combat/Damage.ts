// src/combat/Damage.ts — fungsi murni balancing (GDD §5.2, §5.3, §6, §7.1, §8.2, §3.4, §3.5)
import { CFG } from '../config/gameConfig';
import type { FireMode, WeaponDef } from '../config/weaponsData';
import type { HitPart } from '../core/EventBus';

const C = CFG.combat;

/** F(d): 1.0 bila d ≤ 40; max(0.65, 1 − (d − 40)/160) bila d > 40. Senjata tambahan: [mulai, rentang, min] sendiri (rumus sama). */
export function falloff(d: number, w?: WeaponDef): number {
  const [start, span, min] = w?.falloff ?? [C.falloffStart, C.falloffSpan, C.falloffMin];
  if (d <= start) return 1.0;
  return Math.max(min, 1.0 - (d - start) / span);
}

/** Pengali hitbox: GDD §5.2; shotgun memakai pengali kepala sendiri (headMult). */
export const hitMultOf = (w: WeaponDef, part: HitPart) => (part === 'head' && w.headMult !== undefined ? w.headMult : C.hitMult[part]);

/** D_final = round(D_base × M_hitbox × F(d)) — urutan perkalian WAJIB seperti ini (shotgun: per pellet). */
export function damage(w: WeaponDef, part: HitPart, d: number): number {
  return Math.round(w.baseDamage * hitMultOf(w, part) * falloff(d, w));
}

/** D_K400(r) = round(135 × max(0, 1 − (r/12)²) × O). */
export function k400(r: number, O = 1): number {
  const g = CFG.grenade;
  return Math.round(g.maxDamage * Math.max(0, 1.0 - (r / g.blastRadius) ** 2) * O);
}

/** S_ADS/S_hip = tan(FOV_ADS/2) / tan(FOV_base/2) × pengaliADS. */
export function sensRatio(fovAds: number, fovBase: number = CFG.camera.baseFov, adsMult = 1): number {
  return (Math.tan(fovAds * Math.PI / 360) / Math.tan(fovBase * Math.PI / 360)) * adsMult;
}

/** Pembesaran efektif = tan(FOV_base/2) / tan(FOV/2). */
export function effectiveZoom(fov: number, fovBase: number = CFG.camera.baseFov): number {
  return Math.tan(fovBase * Math.PI / 360) / Math.tan(fov * Math.PI / 360);
}

/** ΔPitch_n (derajat) — n mulai 0. */
export function recoilKick(w: WeaponDef, n: number, stance = 1, scale: number = C.recoil.scale): number {
  return w.recoilVert * (1 + Math.min(n * C.recoil.ramp, C.recoil.rampMax)) * stance * scale;
}

export function recoilSum(w: WeaponDef, count: number, stance = 1): number {
  let s = 0;
  for (let n = 0; n < count; n++) s += recoilKick(w, n, stance);
  return s;
}

export function fallDamage(H: number): number {
  const p = CFG.player;
  return H <= p.fallSafeHeight ? 0 : Math.round((H - p.fallSafeHeight) * p.fallDamagePerUnit);
}

export function shotsToKill(dmg: number, hp: number = CFG.player.hp): number {
  return dmg <= 0 ? Infinity : Math.ceil(hp / dmg);
}

/** Waktu tembakan ke-k (mulai 0) menurut aturan §5.1 untuk mode yang dipilih. */
export function shotTime(w: WeaponDef, mode: FireMode, k: number): number {
  const interval = 60 / w.rpm;
  if (mode === 'AUTO') return k * interval;
  if (mode === 'SINGLE') return k * Math.max(interval, C.singleMinInterval);
  const size = mode === 'BURST2' ? 2 : 3;
  const burst = Math.floor(k / size), inBurst = k % size;
  const cycle = (size - 1) * interval + Math.max(interval, C.burstDelay);
  return burst * cycle + inBurst * interval;
}

/** TTK teoretis (s): waktu tembakan ke-STK (tembakan pertama di t = 0). */
export function timeToKill(w: WeaponDef, part: HitPart, d: number, mode: FireMode = w.modes[0]): number {
  const stk = shotsToKill(damage(w, part, d));
  return shotTime(w, mode, stk - 1);
}

export interface MoveInput { ix: number; iz: number; sprinting: boolean; crouched: boolean; ads: boolean }

/**
 * Kecepatan target lokal (vx kanan, vz maju) — kode §3.4 (normalisasi eliptis).
 * scale = CFG.player.moveSpeedScale (tempo); test vector §16.1 memakai tabel dasar (scale 1).
 */
export function moveTarget(m: MoveInput, out = { vx: 0, vz: 0 }, scale: number = CFG.player.moveSpeedScale) {
  const s = CFG.player.speed;
  const len = Math.hypot(m.ix, m.iz) || 1, nx = m.ix / len, nz = m.iz / len;
  let vx = nx * s.strafe;
  let vz = nz > 0 ? nz * (m.sprinting ? s.sprint : s.forward) : nz * s.back;
  const mult = (m.crouched ? s.crouchCap / s.forward : 1) * (m.ads ? s.adsMult : 1) * scale;
  vx *= mult; vz *= mult;
  out.vx = vx; out.vz = vz;
  return out;
}

/** Integrasi vertikal parabola eksak per langkah tetap (dipakai PlayerController; g karakter = g dunia·tempo²). */
export function integrateVertical(velY: number, dt: number, g: number = CFG.world.gravity) {
  return { dy: velY * dt + 0.5 * g * dt * dt, velY: velY + g * dt };
}

/**
 * Simulasi lompat fixed-step (test vector §16.1 jumpApex). tempo T: v = 7.8·T, g = −22·T² → puncak tetap 1.383,
 * durasi udara 0.71/T. Mengembalikan puncak; `out` (opsional) menerima durasi udara.
 */
export function simulateJumpApex(tempo = 1, out?: { airTime: number }): number {
  let y = 0, v: number = CFG.player.jumpVelocity * tempo, apex = 0, t = 0;
  const dt = CFG.world.fixedStep, g = CFG.world.gravity * tempo * tempo;
  for (let i = 0; i < 240; i++) {
    const s = integrateVertical(v, dt, g);
    y += s.dy; v = s.velY; t += dt;
    if (y > apex) apex = y;
    if (y < 0) break;
  }
  if (out) out.airTime = t;
  return apex;
}
