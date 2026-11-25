// src/combat/Flash.ts — efek silau flashbang (permintaan pengguna 2026-11-25). MURNI (tanpa Three/Rapier/DOM) → tests/flash.test.ts.
// Kekuatan s (0..1) = faktor ARAH pandang × faktor JARAK, 0 bila garis pandang mata → titik ledak terhalang dinding.
// Durasi dari pengguna: s ≥ fullAt → putih total 1.5–3 s lalu pulih bertahap 1.5–2 s (total 3–5 s); s lebih kecil → silau sebagian.
import { XCFG } from '../config/extraConfig';

export type NadeKind = 'frag' | 'flash';

export interface V3 { x: number; y: number; z: number }

/** Paparan flash: tingkat putih puncak (1 = buta total), lama tahan putih, lama pulih (detik). */
export interface FlashExposure { peak: number; hold: number; fade: number }

/** Kekuatan silau dari posisi mata, arah pandang (vektor satuan), titik ledak, dan apakah terhalang. */
export function flashStrength(eye: V3, fwd: V3, at: V3, blocked: boolean): number {
  if (blocked) return 0;
  const F = XCFG.flash;
  const dx = at.x - eye.x, dy = at.y - eye.y, dz = at.z - eye.z, d = Math.hypot(dx, dy, dz);
  const dist = d <= F.nearFull ? 1 : d >= F.far ? 0 : 1 - (d - F.nearFull) / (F.far - F.nearFull);
  if (dist <= 0) return 0;
  const cos = d < 1e-3 ? 1 : (dx * fwd.x + dy * fwd.y + dz * fwd.z) / d;
  const face = cos >= F.faceFull ? 1 : cos <= F.faceBackCos ? F.faceBack
    : F.faceBack + (1 - F.faceBack) * (cos - F.faceBackCos) / (F.faceFull - F.faceBackCos);
  return face * dist;
}

/** Kekuatan → paparan (null = tidak berefek). */
export function flashExposure(s: number): FlashExposure | null {
  const F = XCFG.flash;
  if (!(s >= F.mildMin)) return null;
  if (s >= F.fullAt) {
    const k = Math.min(1, (s - F.fullAt) / (1 - F.fullAt));
    return { peak: 1, hold: F.holdMin + (F.holdMax - F.holdMin) * k, fade: F.fadeMin + (F.fadeMax - F.fadeMin) * k };
  }
  const k = s / F.fullAt;
  return { peak: k, hold: 0, fade: F.mildFade[0] + (F.mildFade[1] - F.mildFade[0]) * k };
}

/** Tingkat putih (0..1) t detik setelah ledakan: tahan di puncak, lalu pulih (1 − u)^fadePow. */
export function flashWhite(x: FlashExposure, t: number): number {
  if (t < 0) return 0;
  if (t <= x.hold) return x.peak;
  const u = (t - x.hold) / x.fade;
  return u >= 1 ? 0 : x.peak * Math.pow(1 - u, XCFG.flash.fadePow);
}

/** Lama total sampai jernih (detik). */
export const flashTotal = (x: FlashExposure) => x.hold + x.fade;

/**
 * Flash kedua saat masih silau: yang lebih terang SEKARANG yang dipakai (tidak saling menjumlah).
 * cur = paparan lama + detik sejak ledakan lama. true = pakai paparan baru, false = paparan lama tetap.
 */
export function combineFlash(cur: { x: FlashExposure; t: number } | null, next: FlashExposure): boolean {
  return !cur || next.peak >= flashWhite(cur.x, cur.t);
}
