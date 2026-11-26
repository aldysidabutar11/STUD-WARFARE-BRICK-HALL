// src/combat/throwArc.ts — lemparan benda lempar (K-400 & flashbang).
// - throwLaunch: titik lepas + kecepatan awal (GDD §8 + XCFG.grenadeThrow). SATU rumus untuk GrenadeManager.throw DAN garis lintasan
//   prediksi → garis selalu sama dengan lemparan sungguhan.
// - nadeStep: satu langkah benda di udara, urutan sama dengan Rapier (kecepatan += g·dt → redaman linear 1/(1 + dt·c) → posisi).
// - traceThrow: lacak lintasan sampai benturan pertama (sapuan BOLA jari-jari granat, collider STATIC + PROP + BARRIER) atau sumbu
//   habis di udara (garis lintasan HUD — permintaan pengguna 2026-11-26 — & test).
import { CFG } from '../config/gameConfig';
import { XCFG } from '../config/extraConfig';
import { G } from '../physics/groups';
import { RAPIER, physics, type V3 } from '../physics/Physics';

const GR = CFG.grenade, GT = XCFG.grenadeThrow, D2R = Math.PI / 180;

export interface LaunchIn {
  overhand: boolean;
  yaw: number;
  pitch: number;
  /** Mata (FPS / bot): titik lepas lemparan jauh = mata + depan·fpsFwd + kanan·fpsRight − atas·fpsDown. */
  eye: V3;
  /** TPS pemain: titik lepas lemparan jauh = tangan kanan rig (GDD §8); null = dari mata. */
  hand: V3 | null;
  /** Posisi kaki (gelinding: + depan·underFwd, + underUp). */
  feet: V3;
  /** Kecepatan karakter yang diwarisi × inheritVel: horizontal + vertikal (0 bila menapak tanah). */
  vx: number; vy: number; vz: number;
}

/** Titik lepas & kecepatan awal benda lempar. Jauh: arah bidik + overLiftDeg (= pitch + 8°), overSpeed; gelinding: pitch dijepit
 *  underPitchMin…Max + underPitchAdd, underSpeed. */
export function throwLaunch(i: LaunchIn, pos: V3, vel: V3): void {
  const sy = Math.sin(i.yaw), cy = Math.cos(i.yaw);
  let a: number, speed: number;
  if (i.overhand) {
    if (i.hand) { pos.x = i.hand.x; pos.y = i.hand.y; pos.z = i.hand.z; }
    else {
      // basis kamera: depan f, kanan r = (cos yaw, 0, −sin yaw), atas u = r × f
      const cp = Math.cos(i.pitch), sp = Math.sin(i.pitch);
      pos.x = i.eye.x - sy * cp * GT.fpsFwd + cy * GT.fpsRight - sy * sp * GT.fpsDown;
      pos.y = i.eye.y + sp * GT.fpsFwd - cp * GT.fpsDown;
      pos.z = i.eye.z - cy * cp * GT.fpsFwd - sy * GT.fpsRight - cy * sp * GT.fpsDown;
    }
    a = i.pitch + GR.overLiftDeg * D2R;
    speed = GR.overSpeed;
  } else {
    a = (Math.min(GR.underPitchMax, Math.max(GR.underPitchMin, i.pitch / D2R)) + GT.underPitchAdd) * D2R;
    speed = GR.underSpeed;
    pos.x = i.feet.x - sy * GT.underFwd; pos.y = i.feet.y + GT.underUp; pos.z = i.feet.z - cy * GT.underFwd;
  }
  const ca = Math.cos(a);
  vel.x = -sy * ca * speed + i.vx * GR.inheritVel;
  vel.y = Math.sin(a) * speed + i.vy * GR.inheritVel;
  vel.z = -cy * ca * speed + i.vz * GR.inheritVel;
}

/** Sub-langkah integrasi Rapier per world.step() (IntegrationParameters.numSolverIterations bawaan; dicek tests/throw.test.ts). */
export const RAPIER_SUBSTEPS = 4;

/**
 * Satu langkah fisika benda lempar di udara (tanpa benturan) — identik dengan body Rapier granat (galat ≤ 1e-4 u / 90 langkah,
 * tests/throw.test.ts): Rapier mengintegrasikan gravitasi dalam n sub-langkah (v += g·h; p += v·h, h = dt/n) lalu meredam kecepatan
 * sekali di akhir langkah (v ×= 1/(1 + dt·c)). Bentuk tertutup: p += v·dt (+ g·dt²·(n+1)/(2n) vertikal).
 */
export function nadeStep(p: V3, v: V3, dt: number) {
  const g = CFG.world.gravity, n = RAPIER_SUBSTEPS;
  p.x += v.x * dt; p.z += v.z * dt;
  p.y += v.y * dt + g * dt * dt * (n + 1) / (2 * n);
  v.y += g * dt;
  const k = 1 / (1 + dt * GR.linDamp);
  v.x *= k; v.y *= k; v.z *= k;
}

/** Grup sapuan garis lintasan: yang memantulkan granat KECUALI kapsul karakter (pelempar sendiri & orang yang lewat). */
export const ARC_GROUPS = ((G.GRENADE << 16) | (G.STATIC | G.PROP | G.BARRIER)) >>> 0;
/** Batas langkah 60 Hz yang dilacak (≥ sumbu terpanjang 3.5 s). */
export const ARC_MAX_STEPS = 240;

export type ArcEnd = 'hit' | 'fuse' | 'none';

/** Hasil pelacakan (dipakai ulang tiap frame — tanpa alokasi). */
export class ArcTrace {
  /** Pusat benda per langkah fisika: [titik lepas, langkah 1, …, titik akhir]. */
  readonly pts = new Float32Array((ARC_MAX_STEPS + 2) * 3);
  n = 0;
  /** 'hit' = benturan pertama (contact = titik di permukaan, normal = normal permukaan), 'fuse' = meledak di udara. */
  end: ArcEnd = 'none';
  readonly contact: V3 = { x: 0, y: 0, z: 0 };
  readonly normal: V3 = { x: 0, y: 1, z: 0 };
  /** Waktu terbang sampai akhir (detik). */
  t = 0;
  /** Titik akhir (pusat benda saat benturan / meledak). */
  endPoint(out: V3): V3 { const k = (this.n - 1) * 3; out.x = this.pts[k]; out.y = this.pts[k + 1]; out.z = this.pts[k + 2]; return out; }
  add(p: V3) { const k = this.n * 3; this.pts[k] = p.x; this.pts[k + 1] = p.y; this.pts[k + 2] = p.z; this.n++; }
}

const _p: V3 = { x: 0, y: 0, z: 0 }, _v: V3 = { x: 0, y: 0, z: 0 }, _c0: V3 = { x: 0, y: 0, z: 0 }, _cv: V3 = { x: 0, y: 0, z: 0 };
const _rot = { x: 0, y: 0, z: 0, w: 1 };
let ball: RAPIER.Ball | null = null;

/**
 * Lintasan dari titik lepas `pos` dengan kecepatan `vel`: langkah 60 Hz (nadeStep); benturan dicek dengan sapuan bola jari-jari
 * granat sepanjang tali busur tiap `chord` langkah (lengkung 4 langkah menyimpang ≤ 0.012 u dari tali busurnya). Berhenti di
 * benturan pertama atau saat sumbu habis (granat meledak di tick ke-⌈sisa/dt⌉ SEBELUM step → sudah melangkah ⌈sisa/dt⌉ − 1 kali).
 */
export function traceThrow(pos: V3, vel: V3, fuseLeft: number, out: ArcTrace, chord = 4): ArcTrace {
  const dt = CFG.world.fixedStep;
  ball ??= new RAPIER.Ball(GR.radius);
  _p.x = pos.x; _p.y = pos.y; _p.z = pos.z; _v.x = vel.x; _v.y = vel.y; _v.z = vel.z;
  out.n = 0; out.end = 'none'; out.t = 0;
  out.add(_p);
  const steps = Math.min(ARC_MAX_STEPS, Math.max(0, Math.ceil(fuseLeft / dt - 1e-9) - 1));
  let last = 0;                                   // langkah awal tali busur
  _c0.x = _p.x; _c0.y = _p.y; _c0.z = _p.z;
  for (let i = 1; i <= steps; i++) {
    nadeStep(_p, _v, dt);
    out.add(_p);
    if (i % chord !== 0 && i !== steps) continue;
    const T = (i - last) * dt;
    _cv.x = (_p.x - _c0.x) / T; _cv.y = (_p.y - _c0.y) / T; _cv.z = (_p.z - _c0.z) / T;
    const hit = physics.world.castShape(_c0, _rot, _cv, ball, 0, T, true, undefined, ARC_GROUPS);
    if (hit) {
      let toi = hit.time_of_impact;
      const N = out.normal, nl = Math.hypot(hit.normal1.x, hit.normal1.y, hit.normal1.z);
      if (nl > 1e-6) { N.x = hit.normal1.x / nl; N.y = hit.normal1.y / nl; N.z = hit.normal1.z / nl; } else { N.x = 0; N.y = 1; N.z = 0; }
      const W = hit.witness1;
      // TOI sapuan Rapier konservatif (pusat bola berhenti s.d. ±0.05 u sebelum menyentuh pada lintasan miring) → majukan ke titik
      // sentuh pada bidang (titik saksi, normal): jarak pusat ke bidang = jari-jari
      const vn = _cv.x * N.x + _cv.y * N.y + _cv.z * N.z;
      if (vn < -1e-6) {
        const gap = (_c0.x + _cv.x * toi - W.x) * N.x + (_c0.y + _cv.y * toi - W.y) * N.y + (_c0.z + _cv.z * toi - W.z) * N.z - GR.radius;
        if (gap > 0 && gap < 0.25) toi = Math.min(T, toi + gap / -vn);
      }
      // titik setelah benturan dibuang; titik akhir = pusat bola saat menyentuh
      out.n = last + 1 + Math.floor(toi / dt + 1e-6);
      if (out.n > i + 1) out.n = i + 1;
      _p.x = _c0.x + _cv.x * toi; _p.y = _c0.y + _cv.y * toi; _p.z = _c0.z + _cv.z * toi;
      out.add(_p);
      out.end = 'hit'; out.t = last * dt + toi;
      out.contact.x = _p.x - N.x * GR.radius; out.contact.y = _p.y - N.y * GR.radius; out.contact.z = _p.z - N.z * GR.radius;
      return out;
    }
    last = i; _c0.x = _p.x; _c0.y = _p.y; _c0.z = _p.z;
  }
  out.end = 'fuse'; out.t = steps * dt;
  return out;
}
