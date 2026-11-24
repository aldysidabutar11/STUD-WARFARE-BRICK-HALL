// src/entities/knifeAnim.ts — animasi pisau berbasis keyframe (dipakai viewmodel FPS, rig TPS, killcam).
// Tebasan: ancang-ancang cepat → sapuan diagonal yang berpuncak di titik kena (XCFG.knife.slash.hitDelay) → ayunan lanjut →
// kembali. Tebasan bergantian kanan→kiri (A) dan kiri→kanan (B, backhand). Tusukan: tarik ke belakang → sodokan eksplosif
// (selesai tepat di titik kena) → tahan → tarik kembali. Nilai = offset terhadap pose diam.

export type Ease = (t: number) => number;
export const EASE = {
  linear: (t: number) => t,
  outQuad: (t: number) => 1 - (1 - t) * (1 - t),
  outCubic: (t: number) => 1 - (1 - t) ** 3,
  outQuart: (t: number) => 1 - (1 - t) ** 4,
  inOutCubic: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
} as const;

/** Keyframe: waktu ternormalisasi 0..1, nilai, easing segmen yang BERAKHIR di key ini. */
export interface Key { t: number; v: readonly number[]; ease?: Ease }

/** Sampel keyframe pada progres p (0..1) ke `out` (tanpa alokasi). */
export function sampleKeys(keys: readonly Key[], p: number, out: number[]): number[] {
  const n = keys[0].v.length;
  if (p <= keys[0].t) { for (let i = 0; i < n; i++) out[i] = keys[0].v[i]; return out; }
  for (let k = 1; k < keys.length; k++) {
    const b = keys[k];
    if (p <= b.t || k === keys.length - 1) {
      const a = keys[k - 1], span = b.t - a.t;
      const u = span > 0 ? Math.min(1, Math.max(0, (p - a.t) / span)) : 1, e = (b.ease ?? EASE.linear)(u);
      for (let i = 0; i < n; i++) out[i] = a.v[i] + (b.v[i] - a.v[i]) * e;
      return out;
    }
  }
  return out;
}

const Z6 = [0, 0, 0, 0, 0, 0] as const;

// ── FPS (viewmodel): [x, y, z tangan, yaw, pitch, roll bilah] relatif pose diam. Posisi tangan dijaga di dalam layar
//    (tebasan melintasi tengah-bawah), lengan bawah tersambung otomatis ke bahu di luar layar (kanan-bawah).
export const VM_SLASH_A: readonly Key[] = [
  { t: 0, v: Z6 },
  { t: 0.12, v: [0.08, 0.1, 0.06, -0.7, 0.5, -0.6], ease: EASE.outCubic },          // ancang-ancang: kanan-atas, bilah ke kanan
  { t: 0.3, v: [-0.32, 0.0, -0.06, 1.0, -0.35, 0.9], ease: EASE.inOutCubic },       // sapuan melintasi tengah layar (titik kena)
  { t: 0.48, v: [-0.42, -0.08, -0.02, 1.2, -0.5, 1.05], ease: EASE.outQuad },       // ayunan lanjut keluar kiri-bawah
  { t: 1, v: Z6, ease: EASE.inOutCubic },
];
export const VM_SLASH_B: readonly Key[] = [
  { t: 0, v: Z6 },
  { t: 0.12, v: [-0.3, 0.06, 0.03, 1.1, 0.3, 0.9], ease: EASE.outCubic },          // backhand: tarik ke kiri-tengah
  { t: 0.3, v: [-0.02, 0.02, -0.08, -0.9, -0.15, -1.1], ease: EASE.inOutCubic },    // sapu ke kanan, bilah menyamping terlihat
  { t: 0.48, v: [0.08, -0.06, -0.02, -1.15, -0.3, -1.25], ease: EASE.outQuad },
  { t: 1, v: Z6, ease: EASE.inOutCubic },
];
export const VM_STAB: readonly Key[] = [
  { t: 0, v: Z6 },
  { t: 0.18, v: [0.03, 0.03, 0.14, -0.15, 0.3, -0.3], ease: EASE.outCubic },        // tarik ke belakang, ujung naik
  { t: 0.27, v: [-0.12, 0.05, -0.3, 0.2, -0.05, 0.5], ease: EASE.outQuart },        // sodok eksplosif ke tengah + puntir
  { t: 0.45, v: [-0.11, 0.04, -0.28, 0.18, -0.04, 0.46], ease: EASE.linear },       // tahan
  { t: 1, v: Z6, ease: EASE.inOutCubic },
];

// ── TPS (rig): [bahuKanan.x offset, bahuKanan.z, yaw dada, pitch dada (condong), putar pergelangan, turun pinggul]
export const RIG_SLASH_A: readonly Key[] = [
  { t: 0, v: Z6 },
  { t: 0.12, v: [0.35, 1.25, -0.5, 0, -0.6, 0], ease: EASE.outCubic },
  { t: 0.3, v: [0.1, -1.05, 0.6, 0.12, 0.5, 0.15], ease: EASE.inOutCubic },
  { t: 0.48, v: [0, -1.2, 0.65, 0.15, 0.55, 0.18], ease: EASE.outQuad },
  { t: 1, v: Z6, ease: EASE.inOutCubic },
];
export const RIG_SLASH_B: readonly Key[] = [
  { t: 0, v: Z6 },
  { t: 0.12, v: [0.3, -0.95, 0.45, 0, 0.55, 0], ease: EASE.outCubic },
  { t: 0.3, v: [0.1, 1.1, -0.55, 0.1, -0.5, 0.12], ease: EASE.inOutCubic },
  { t: 0.48, v: [0, 1.22, -0.6, 0.12, -0.55, 0.15], ease: EASE.outQuad },
  { t: 1, v: Z6, ease: EASE.inOutCubic },
];
export const RIG_STAB: readonly Key[] = [
  { t: 0, v: Z6 },
  { t: 0.18, v: [-0.65, 0.2, -0.3, -0.05, 0, 0.05], ease: EASE.outCubic },
  { t: 0.27, v: [0.5, -0.05, 0.25, 0.28, 0, 0.32], ease: EASE.outQuart },
  { t: 0.45, v: [0.46, -0.05, 0.22, 0.25, 0, 0.3], ease: EASE.linear },
  { t: 1, v: Z6, ease: EASE.inOutCubic },
];

/** Jendela waktu bilah bergerak cepat (untuk jejak kilatan): tebasan & tusukan. */
export const TRAIL_WINDOW = { slash: [0.1, 0.42], stab: [0.17, 0.3] } as const;

/** Kode rekaman killcam: −1 tidak; tebas A 0..1; tusuk 2..3; tebas B 4..5. */
export const encodeKnife = (p: number, stab: boolean, alt: boolean) => (p < 0 ? -1 : stab ? 2 + p : alt ? 4 + p : p);
export interface KnifeCode { p: number; stab: boolean; alt: boolean }
const _dk: KnifeCode = { p: -1, stab: false, alt: false };
export function decodeKnife(v: number, out: KnifeCode = _dk): KnifeCode {
  out.stab = v >= 2 && v < 4; out.alt = v >= 4;
  out.p = v < 0 ? -1 : Math.min(1, v >= 4 ? v - 4 : v >= 2 ? v - 2 : v);
  return out;
}
