// src/audio/Recipes.ts — resep sintesis prosedural (GDD §10.4). Setiap resep menulis ke `out` mulai t0, mengembalikan durasi (s).
import type { SurfaceMaterial } from '../core/EventBus';
import type { GunSound } from '../config/weaponsData';

export interface SynthCtx { ac: AudioContext; noise: AudioBuffer }
export type Recipe = (s: SynthCtx, out: AudioNode, t0: number) => number;

function noiseSrc(s: SynthCtx, t0: number, dur: number) {
  const n = s.ac.createBufferSource();
  n.buffer = s.noise;
  const off = Math.random() * Math.max(0, s.noise.duration - dur - 0.05);
  n.start(t0, off, dur + 0.05);
  return n;
}
function env(s: SynthCtx, out: AudioNode, t0: number, peak: number, attack: number, decay: number, floor = 0.001) {
  const g = s.ac.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t0 + attack);
  g.gain.exponentialRampToValueAtTime(floor, t0 + attack + decay);
  g.connect(out);
  return g;
}
function osc(s: SynthCtx, type: OscillatorType, f0: number, f1: number, t0: number, dur: number) {
  const o = s.ac.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t0);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
  o.start(t0); o.stop(t0 + dur + 0.02);
  return o;
}
function filt(s: SynthCtx, type: BiquadFilterType, f: number, q = 0.7) {
  const b = s.ac.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b;
}

/** Profil tembakan: badan noise bandpass [min, max] Hz, klik square, ekor lowpass, punch sawtooth (f0→f1, puncak, durasi),
 *  retak supersonik (sniper). 556 & 762 = resep GDD §10.4 (5.56: bandpass 1200–2400 + klik 3200 4 ms + ekor lowpass 700;
 *  7.62 menambah punch sawtooth 180→90 Hz). */
interface ShotProfile {
  bp: readonly [number, number]; q: number; peak: number; body: number;
  click: number; clickPeak: number;
  tail: number; tailLp: number; tailPeak: number;
  punch?: readonly [number, number, number, number];
  crack?: readonly [number, number];
}
const SHOT: Record<GunSound, ShotProfile> = {
  '556': { bp: [1200, 2400], q: 0.9, peak: 1.0, body: 0.12, click: 3200, clickPeak: 0.35, tail: 0.35, tailLp: 700, tailPeak: 0.22 },
  '762': { bp: [900, 1800], q: 0.9, peak: 1.0, body: 0.12, click: 3200, clickPeak: 0.35, tail: 0.5, tailLp: 500, tailPeak: 0.3,
    punch: [180, 90, 0.8, 0.16] },
  '9mm': { bp: [1600, 2800], q: 1.0, peak: 0.85, body: 0.08, click: 3700, clickPeak: 0.3, tail: 0.24, tailLp: 950, tailPeak: 0.16 },
  '45': { bp: [1100, 1900], q: 0.9, peak: 0.9, body: 0.1, click: 3000, clickPeak: 0.3, tail: 0.3, tailLp: 650, tailPeak: 0.2,
    punch: [230, 120, 0.4, 0.09] },
  '57': { bp: [2000, 3300], q: 1.1, peak: 0.85, body: 0.07, click: 4000, clickPeak: 0.3, tail: 0.24, tailLp: 1100, tailPeak: 0.15 },
  '12ga': { bp: [450, 950], q: 0.7, peak: 1.0, body: 0.18, click: 2400, clickPeak: 0.3, tail: 0.65, tailLp: 420, tailPeak: 0.38,
    punch: [125, 52, 1.0, 0.22] },
  magnum: { bp: [700, 1300], q: 0.8, peak: 1.0, body: 0.14, click: 3000, clickPeak: 0.35, tail: 0.48, tailLp: 560, tailPeak: 0.3,
    punch: [165, 70, 0.85, 0.17] },
  sniper: { bp: [600, 1100], q: 0.8, peak: 1.0, body: 0.16, click: 3400, clickPeak: 0.4, tail: 0.95, tailLp: 360, tailPeak: 0.4,
    punch: [115, 45, 1.0, 0.24], crack: [2600, 0.7] },
  heavy: { bp: [420, 800], q: 0.7, peak: 1.0, body: 0.2, click: 2800, clickPeak: 0.4, tail: 1.1, tailLp: 300, tailPeak: 0.45,
    punch: [95, 38, 1.0, 0.3], crack: [2200, 0.6] },
  suppressed: { bp: [500, 900], q: 1.2, peak: 0.45, body: 0.07, click: 2500, clickPeak: 0.35, tail: 0.12, tailLp: 1200, tailPeak: 0.08 },
};

/** Tembakan sintesis sesuai profil senjata (weaponStats.soundOf). */
export function gunshot(sound: GunSound, pitch: number): Recipe {
  const P = SHOT[sound];
  return (s, out, t0) => {
    const bpF = (P.bp[0] + Math.random() * (P.bp[1] - P.bp[0])) * pitch;
    noiseSrc(s, t0, P.body + 0.02).connect(filt(s, 'bandpass', bpF, P.q)).connect(env(s, out, t0, P.peak, 0.001, P.body));
    osc(s, 'square', P.click * pitch, P.click * pitch, t0, 0.004).connect(env(s, out, t0, P.clickPeak, 0.0005, 0.004));
    noiseSrc(s, t0, P.tail).connect(filt(s, 'lowpass', P.tailLp * pitch)).connect(env(s, out, t0, P.tailPeak, 0.004, P.tail));
    if (P.punch) {
      const [f0, f1, pk, d] = P.punch;
      osc(s, 'sawtooth', f0 * pitch, f1 * pitch, t0, d * 0.6).connect(filt(s, 'lowpass', 400)).connect(env(s, out, t0, pk, 0.002, d));
    }
    if (P.crack) noiseSrc(s, t0, 0.03).connect(filt(s, 'highpass', P.crack[0], 0.8)).connect(env(s, out, t0, P.crack[1], 0.0005, 0.025));
    return P.tail + 0.05;
  };
}

/** Kokang pompa: tarik (gesek + klak) lalu dorong (klak lebih keras). */
export const pumpAction: Recipe = (s, out, t0) => {
  noiseSrc(s, t0, 0.06).connect(filt(s, 'bandpass', 1400, 1.4)).connect(env(s, out, t0, 0.45, 0.002, 0.05));
  osc(s, 'square', 900, 700, t0 + 0.04, 0.012).connect(env(s, out, t0 + 0.04, 0.3, 0.001, 0.012));
  noiseSrc(s, t0 + 0.17, 0.05).connect(filt(s, 'bandpass', 1900, 1.6)).connect(env(s, out, t0 + 0.17, 0.6, 0.001, 0.045));
  osc(s, 'square', 1300, 1000, t0 + 0.18, 0.01).connect(env(s, out, t0 + 0.18, 0.35, 0.001, 0.01));
  return 0.28;
};

/** Kokang bolt: angkat (klik), tarik (gesek logam), dorong, kunci (klik). */
export const boltAction: Recipe = (s, out, t0) => {
  const clk = (t: number, f: number, g: number) => osc(s, 'square', f, f * 0.8, t, 0.008).connect(env(s, out, t, g, 0.001, 0.008));
  clk(t0, 2200, 0.3);
  noiseSrc(s, t0 + 0.12, 0.12).connect(filt(s, 'bandpass', 3000, 2)).connect(env(s, out, t0 + 0.12, 0.25, 0.01, 0.1));
  noiseSrc(s, t0 + 0.42, 0.1).connect(filt(s, 'bandpass', 2600, 2)).connect(env(s, out, t0 + 0.42, 0.28, 0.01, 0.08));
  clk(t0 + 0.58, 1800, 0.4);
  return 0.65;
};

/** Selongsong shotgun masuk ke tabung: gesek pendek + klik. */
export const shellInsert: Recipe = (s, out, t0) => {
  noiseSrc(s, t0, 0.04).connect(filt(s, 'bandpass', 2200, 1.8)).connect(env(s, out, t0, 0.35, 0.002, 0.035));
  osc(s, 'square', 1500, 1200, t0 + 0.03, 0.008).connect(env(s, out, t0 + 0.03, 0.25, 0.001, 0.008));
  return 0.08;
};

/** Langkah kaki sadar-material; land = mendarat (gain ×1.8, nada ×0.8). */
export function footstep(mat: SurfaceMaterial, land = false): Recipe {
  return (s, out, t0) => {
    const g = land ? 1.8 : 1, p = land ? 0.8 : 1;
    if (mat === 'wood') {
      osc(s, 'sine', 160 * p, 110 * p, t0, 0.06).connect(env(s, out, t0, 0.5 * g, 0.002, 0.08));
      noiseSrc(s, t0, 0.04).connect(filt(s, 'lowpass', 800 * p)).connect(env(s, out, t0, 0.3 * g, 0.002, 0.04));
      return 0.1;
    }
    if (mat === 'tile') {
      noiseSrc(s, t0, 0.035).connect(filt(s, 'bandpass', 950 * p, 4)).connect(env(s, out, t0, 0.9 * g, 0.001, 0.035));
      osc(s, 'triangle', 1900 * p, 1900 * p, t0, 0.01).connect(env(s, out, t0, 0.2 * g, 0.001, 0.01));
      return 0.06;
    }
    if (mat === 'sand') {
      // beton berpasir/kerikil: "kres" pendek & renyah — gesekan bandpass 45 ms + 4 butir kerikil di 30 ms pertama + ketuk tipis.
      // (Dulu desis lowpass 80 ms + dentum 95 Hz: di map terbuka langkah terdengar berat & lambat — laporan pengguna 2026-11-25.)
      noiseSrc(s, t0, 0.045).connect(filt(s, 'bandpass', 1800 * p, 1.1)).connect(env(s, out, t0, 0.5 * g, 0.002, 0.04));
      for (let i = 0; i < 4; i++) {
        const t = t0 + 0.002 + Math.random() * 0.028, f = (3000 + Math.random() * 2600) * p;
        noiseSrc(s, t, 0.01).connect(filt(s, 'bandpass', f, 3)).connect(env(s, out, t, 0.3 * g, 0.0006, 0.01));
      }
      osc(s, 'sine', 130 * p, 100 * p, t0, 0.03).connect(env(s, out, t0, 0.14 * g, 0.002, 0.03));
      return 0.06;
    }
    if (mat === 'metal') {
      // lantai/atap kontainer baja: dentang berongga (parsial tak harmonis berdengung) + transien + dentum lantai
      for (const [f, a, d] of [[210, 0.3, 0.22], [537, 0.16, 0.16], [913, 0.09, 0.11]] as const)
        osc(s, 'triangle', f * p, f * p * 0.985, t0, d).connect(env(s, out, t0, a * g, 0.002, d));
      noiseSrc(s, t0, 0.02).connect(filt(s, 'bandpass', 2400 * p, 2)).connect(env(s, out, t0, 0.45 * g, 0.001, 0.02));
      osc(s, 'sine', 140 * p, 85 * p, t0, 0.06).connect(env(s, out, t0, 0.4 * g, 0.002, 0.07));
      return 0.24;
    }
    osc(s, 'sine', 120 * p, 120 * p, t0, 0.05).connect(env(s, out, t0, 0.35 * g, 0.003, 0.05));
    noiseSrc(s, t0, 0.05).connect(filt(s, 'lowpass', 400 * p)).connect(env(s, out, t0, 0.5 * g, 0.003, 0.05));
    return 0.07;
  };
}

export const reloadStage = (stage: 0 | 1 | 2): Recipe => (s, out, t0) => {
  if (stage === 0) noiseSrc(s, t0, 0.03).connect(filt(s, 'bandpass', 2500, 2)).connect(env(s, out, t0, 0.5, 0.001, 0.03));
  else if (stage === 1) {
    osc(s, 'square', 1200, 1200, t0, 0.015).connect(env(s, out, t0, 0.25, 0.001, 0.015));
    noiseSrc(s, t0, 0.03).connect(filt(s, 'bandpass', 1800, 1.5)).connect(env(s, out, t0, 0.3, 0.001, 0.03));
  } else {
    noiseSrc(s, t0, 0.05).connect(filt(s, 'bandpass', 3500, 2)).connect(env(s, out, t0, 0.5, 0.001, 0.05));
    osc(s, 'square', 2800, 2800, t0 + 0.01, 0.006).connect(env(s, out, t0 + 0.01, 0.3, 0.001, 0.006));
  }
  return 0.08;
};

/** Pesan chat masuk: dua nada lembut pendek (tidak tertukar dengan bunyi game). */
export const chatBlip: Recipe = (s, out, t0) => {
  osc(s, 'sine', 1320, 1320, t0, 0.05).connect(env(s, out, t0, 0.16, 0.003, 0.05));
  osc(s, 'sine', 990, 990, t0 + 0.06, 0.06).connect(env(s, out, t0 + 0.06, 0.12, 0.003, 0.06));
  return 0.13;
};

export const dryFire: Recipe = (s, out, t0) => { osc(s, 'square', 2000, 2000, t0, 0.01).connect(env(s, out, t0, 0.3, 0.001, 0.01)); return 0.03; };

export const pin: Recipe = (s, out, t0) => {
  for (const dt of [0, 0.06]) osc(s, 'square', 4000, 4000, t0 + dt, 0.003).connect(env(s, out, t0 + dt, 0.25, 0.0005, 0.003));
  return 0.1;
};

export const bounce = (mat: SurfaceMaterial, speed: number): Recipe => (s, out, t0) => {
  const a = Math.min(1, speed / 12);
  if (mat === 'metal') {        // granat memantul di baja: denting berdengung
    for (const [f, k, d] of [[1650, 1, 0.12], [2480, 0.55, 0.09]] as const) osc(s, 'triangle', f, f * 0.97, t0, d).connect(env(s, out, t0, a * 0.8 * k, 0.001, d));
    return 0.14;
  }
  if (mat === 'sand') {         // di tanah berdebu: debam tumpul + desir pasir
    osc(s, 'sine', 260, 170, t0, 0.04).connect(env(s, out, t0, a * 0.8, 0.002, 0.04));
    noiseSrc(s, t0, 0.05).connect(filt(s, 'lowpass', 900)).connect(env(s, out, t0, a * 0.4, 0.002, 0.05));
    return 0.07;
  }
  if (mat === 'glass') {        // di kaca: denting tinggi bening
    for (const [f, k] of [[3900, 1], [5200, 0.5]] as const) osc(s, 'sine', f, f * 0.99, t0, 0.08).connect(env(s, out, t0, a * 0.45 * k, 0.0008, 0.08));
    return 0.1;
  }
  const f = mat === 'tile' ? 1400 : 600;
  osc(s, 'triangle', f, f * 0.9, t0, 0.03).connect(env(s, out, t0, a, 0.001, 0.03));
  return 0.05;
};

/** Ledakan: noise lowpass sapuan 2000→150 Hz 0.8 s + sub sine 55→30 Hz 0.5 s + 6 derak highpass 2 kHz. */
export const explosion: Recipe = (s, out, t0) => {
  const n = noiseSrc(s, t0, 1.25);
  const lp = filt(s, 'lowpass', 2000);
  lp.frequency.setValueAtTime(2000, t0); lp.frequency.exponentialRampToValueAtTime(150, t0 + 0.8);
  n.connect(lp).connect(env(s, out, t0, 1.0, 0.004, 1.2));
  osc(s, 'sine', 55, 30, t0, 0.5).connect(env(s, out, t0, 0.9, 0.005, 0.5));
  for (let i = 0; i < 6; i++) {
    const t = t0 + 0.1 + Math.random() * 0.5;
    noiseSrc(s, t, 0.02).connect(filt(s, 'highpass', 2000)).connect(env(s, out, t, 0.35, 0.001, 0.02));
  }
  return 1.25;
};

/** Flashbang: letupan tajam & keras (transien lebar + "krak" frekuensi tinggi), ekor pendek — beda jelas dari dentum K-400. */
export const flashBang: Recipe = (s, out, t0) => {
  noiseSrc(s, t0, 0.35).connect(filt(s, 'highpass', 900)).connect(env(s, out, t0, 1.0, 0.001, 0.3));
  noiseSrc(s, t0, 0.12).connect(filt(s, 'bandpass', 3200, 0.9)).connect(env(s, out, t0, 0.9, 0.0005, 0.1));
  osc(s, 'sine', 140, 60, t0, 0.18).connect(env(s, out, t0, 0.6, 0.002, 0.18));
  for (let i = 0; i < 4; i++) {
    const t = t0 + 0.05 + Math.random() * 0.25;
    noiseSrc(s, t, 0.015).connect(filt(s, 'highpass', 3000)).connect(env(s, out, t, 0.25, 0.001, 0.015));
  }
  return 0.45;
};

export const hitBody: Recipe = (s, out, t0) => { osc(s, 'sine', 1800, 1800, t0, 0.025).connect(env(s, out, t0, 0.35, 0.001, 0.025)); return 0.04; };
export const hitHead: Recipe = (s, out, t0) => {
  osc(s, 'sine', 2600, 2600, t0, 0.25).connect(env(s, out, t0, 0.5, 0.001, 0.25));
  osc(s, 'sine', 3900, 3900, t0, 0.25).connect(env(s, out, t0, 0.5 * 0.5, 0.001, 0.25));
  return 0.27;
};
export const killTone: Recipe = (s, out, t0) => {
  osc(s, 'sine', 880, 880, t0, 0.06).connect(env(s, out, t0, 0.45, 0.002, 0.06));
  osc(s, 'sine', 1320, 1320, t0 + 0.06, 0.06).connect(env(s, out, t0 + 0.06, 0.45, 0.002, 0.06));
  return 0.14;
};
/** Kematian orisinal: "pop" sine 420→180 Hz 120 ms + 4 "clack" triangle 900–1300 Hz 15 ms. */
export const deathPopClack: Recipe = (s, out, t0) => {
  osc(s, 'sine', 420, 180, t0, 0.12).connect(env(s, out, t0, 0.7, 0.002, 0.12));
  for (let i = 0; i < 4; i++) {
    const t = t0 + 0.25 + Math.random() * 0.45, f = 900 + Math.random() * 400;
    osc(s, 'triangle', f, f, t, 0.015).connect(env(s, out, t, 0.3, 0.001, 0.015));
  }
  return 0.8;
};
export const uiClick: Recipe = (s, out, t0) => { osc(s, 'triangle', 1000, 1000, t0, 0.02).connect(env(s, out, t0, 0.3, 0.001, 0.02)); return 0.03; };
export const spawnChime: Recipe = (s, out, t0) => {
  osc(s, 'sine', 660, 660, t0, 0.3).connect(env(s, out, t0, 0.25, 0.005, 0.3));
  osc(s, 'sine', 990, 990, t0, 0.3).connect(env(s, out, t0, 0.18, 0.005, 0.3));
  return 0.32;
};
export const impactTick = (mat: SurfaceMaterial | 'book' | 'body'): Recipe => (s, out, t0) => {
  if (mat === 'metal') {        // peluru kena baja: "ting" pendek
    osc(s, 'sine', 3300, 3150, t0, 0.07).connect(env(s, out, t0, 0.22, 0.0008, 0.07));
    noiseSrc(s, t0, 0.025).connect(filt(s, 'bandpass', 4200, 2)).connect(env(s, out, t0, 0.3, 0.001, 0.025));
    return 0.09;
  }
  if (mat === 'glass') {        // peluru kena kaca anti-peluru: "tik" keras + gemerincing halus
    noiseSrc(s, t0, 0.02).connect(filt(s, 'highpass', 4500, 1)).connect(env(s, out, t0, 0.35, 0.0006, 0.02));
    osc(s, 'sine', 4700, 4500, t0 + 0.01, 0.06).connect(env(s, out, t0 + 0.01, 0.12, 0.001, 0.06));
    return 0.08;
  }
  const f = mat === 'tile' ? 2600 : mat === 'book' ? 900 : mat === 'sand' ? 700 : 1500;
  noiseSrc(s, t0, 0.03).connect(filt(s, 'bandpass', f, 2)).connect(env(s, out, t0, 0.35, 0.001, 0.03));
  return 0.04;
};

/** Kaca pecah (panel destruktibel Boston): noise bandpass 3200 Hz + 5 klik tinggi acak 4–6 kHz + gemerincing yang jatuh. */
export const glassBreak: Recipe = (s, out, t0) => {
  noiseSrc(s, t0, 0.35).connect(filt(s, 'bandpass', 3200, 0.9)).connect(env(s, out, t0, 0.9, 0.002, 0.32));
  for (let i = 0; i < 5; i++) {
    const t = t0 + Math.random() * 0.12, f = 4000 + Math.random() * 2000;
    osc(s, 'square', f, f * 0.95, t, 0.012).connect(env(s, out, t, 0.25, 0.0006, 0.012));
  }
  for (let i = 0; i < 7; i++) {
    const t = t0 + 0.15 + Math.random() * 0.45, f = 3500 + Math.random() * 3000;
    osc(s, 'sine', f, f, t, 0.05).connect(env(s, out, t, 0.08, 0.001, 0.05));
  }
  return 0.7;
};

// ── tambahan pasca-MVP (umpan balik ala FPS lain) — tetap 100% sintesis
/** Detak jantung HP rendah: dua dentum sine 62→44 Hz. */
export const heartbeat: Recipe = (s, out, t0) => {
  for (const [dt, a] of [[0, 0.9], [0.17, 0.6]] as const) osc(s, 'sine', 62, 44, t0 + dt, 0.13).connect(env(s, out, t0 + dt, a, 0.008, 0.13));
  return 0.34;
};
/** Medali multi-kill/streak: arpeggio square naik, nada dasar naik per tingkat. */
export const medal = (tier: number): Recipe => (s, out, t0) => {
  const base = 520 * Math.pow(2, Math.min(tier, 6) * 2 / 12);
  [0, 4, 7, 12].forEach((st, i) => {
    const f = base * Math.pow(2, st / 12), t = t0 + i * 0.055;
    osc(s, 'square', f, f, t, 0.09).connect(filt(s, 'lowpass', 3200)).connect(env(s, out, t, 0.14, 0.003, 0.09));
  });
  return 0.34;
};
export const assistTick: Recipe = (s, out, t0) => {
  osc(s, 'sine', 990, 990, t0, 0.05).connect(env(s, out, t0, 0.25, 0.002, 0.05));
  osc(s, 'sine', 1320, 1320, t0 + 0.05, 0.05).connect(env(s, out, t0 + 0.05, 0.2, 0.002, 0.05));
  return 0.12;
};
/** Ayunan melee: noise bandpass menyapu 500→2200 Hz. */
export const whoosh: Recipe = (s, out, t0) => {
  const bp = filt(s, 'bandpass', 500, 1.2);
  bp.frequency.setValueAtTime(500, t0); bp.frequency.exponentialRampToValueAtTime(2200, t0 + 0.16);
  noiseSrc(s, t0, 0.18).connect(bp).connect(env(s, out, t0, 0.45, 0.03, 0.15));
  return 0.2;
};
/** Pukulan kena: dentum sine 150→60 Hz + klak noise lowpass. */
export const meleeThud: Recipe = (s, out, t0) => {
  osc(s, 'sine', 150, 60, t0, 0.1).connect(env(s, out, t0, 0.9, 0.002, 0.12));
  noiseSrc(s, t0, 0.05).connect(filt(s, 'lowpass', 900)).connect(env(s, out, t0, 0.6, 0.001, 0.05));
  return 0.15;
};
/** Bip hitung mundur (final = nada "mulai" lebih tinggi & panjang). */
export const countBeep = (final: boolean): Recipe => (s, out, t0) => {
  const f = final ? 1320 : 880, d = final ? 0.35 : 0.12;
  osc(s, 'triangle', f, f, t0, d).connect(env(s, out, t0, 0.3, 0.004, d));
  return d + 0.02;
};
/** Jingle akhir match/ronde: mayor naik (menang) atau minor turun (kalah); seri = dua nada datar. */
export const stinger = (kind: 'win' | 'lose' | 'draw'): Recipe => (s, out, t0) => {
  const seq = kind === 'win' ? [0, 4, 7, 12] : kind === 'lose' ? [7, 3, 0, -5] : [0, 0, 5, 5];
  seq.forEach((st, i) => {
    const f = 440 * Math.pow(2, st / 12), t = t0 + i * 0.13, d = i === seq.length - 1 ? 0.5 : 0.14;
    osc(s, 'triangle', f, f, t, d).connect(env(s, out, t, 0.28, 0.006, d));
    osc(s, 'sine', f * 2, f * 2, t, d).connect(env(s, out, t, 0.08, 0.006, d));
  });
  return 0.13 * seq.length + 0.5;
};

// ── pisau & buang/ambil senjata (fitur slot 2 / tombol G-E)
/** Tebasan pisau: desis tipis cepat 1500→5000 Hz. */
export const slashWhoosh: Recipe = (s, out, t0) => {
  const bp = filt(s, 'bandpass', 1500, 1.6);
  bp.frequency.setValueAtTime(1500, t0); bp.frequency.exponentialRampToValueAtTime(5000, t0 + 0.12);
  noiseSrc(s, t0, 0.14).connect(bp).connect(env(s, out, t0, 0.35, 0.015, 0.11));
  return 0.16;
};
/** Tusukan pisau: desis pendek 700→2400 Hz. */
export const stabWhoosh: Recipe = (s, out, t0) => {
  const bp = filt(s, 'bandpass', 700, 1.4);
  bp.frequency.setValueAtTime(700, t0); bp.frequency.exponentialRampToValueAtTime(2400, t0 + 0.09);
  noiseSrc(s, t0, 0.1).connect(bp).connect(env(s, out, t0, 0.4, 0.01, 0.08));
  return 0.12;
};
/** Pisau kena tubuh: "shk" noise highpass + dentum lembut. */
export const knifeHit: Recipe = (s, out, t0) => {
  noiseSrc(s, t0, 0.06).connect(filt(s, 'highpass', 2500)).connect(env(s, out, t0, 0.5, 0.001, 0.06));
  osc(s, 'sine', 220, 90, t0, 0.07).connect(env(s, out, t0, 0.5, 0.002, 0.08));
  return 0.1;
};
/** Pisau kena dinding: dentang logam pendek. */
export const knifeWall: Recipe = (s, out, t0) => {
  osc(s, 'triangle', 2600, 2350, t0, 0.06).connect(env(s, out, t0, 0.25, 0.001, 0.06));
  noiseSrc(s, t0, 0.03).connect(filt(s, 'bandpass', 3500, 2)).connect(env(s, out, t0, 0.3, 0.001, 0.03));
  return 0.08;
};
/** Senjata dibuang: dua klak jatuh. */
export const weaponDrop: Recipe = (s, out, t0) => {
  for (const [dt, g] of [[0, 0.5], [0.09, 0.3]] as const) {
    noiseSrc(s, t0 + dt, 0.05).connect(filt(s, 'bandpass', 1200, 1.5)).connect(env(s, out, t0 + dt, g, 0.001, 0.05));
    osc(s, 'square', 340, 260, t0 + dt, 0.04).connect(env(s, out, t0 + dt, g * 0.25, 0.001, 0.04));
  }
  return 0.18;
};
/** Ambil senjata: dua klik kokang. */
export const weaponPickup: Recipe = (s, out, t0) => {
  for (const [dt, f] of [[0, 1800], [0.08, 1300]] as const) {
    osc(s, 'square', f, f, t0 + dt, 0.012).connect(env(s, out, t0 + dt, 0.25, 0.001, 0.012));
    noiseSrc(s, t0 + dt, 0.03).connect(filt(s, 'bandpass', 2500, 1.2)).connect(env(s, out, t0 + dt, 0.3, 0.001, 0.03));
  }
  return 0.14;
};

// ───────────────────────── Bomb Mission (dokumen pengguna §8.2)
/** Keypad saat menanam: dual-tone sine 1209 + 697 Hz 40 ms. */
export const c4Keypad: Recipe = (s, out, t0) => {
  for (const f of [1209, 697]) osc(s, 'sine', f, f, t0, 0.04).connect(env(s, out, t0, 0.35, 0.002, 0.04));
  return 0.06;
};
/** Beep C4 tertanam: sine 2800 Hz 55 ms (attack 2 ms, decay 50 ms). */
export const c4Beep: Recipe = (s, out, t0) => {
  osc(s, 'sine', 2800, 2800, t0, 0.055).connect(env(s, out, t0, 0.6, 0.002, 0.05));
  return 0.06;
};
/** Klik mulai menjinakkan: square 1800 Hz 20 ms + noise bandpass 3000 Hz 30 ms. */
export const c4DefuseClick: Recipe = (s, out, t0) => {
  osc(s, 'square', 1800, 1800, t0, 0.02).connect(env(s, out, t0, 0.45, 0.001, 0.02));
  noiseSrc(s, t0, 0.03).connect(filt(s, 'bandpass', 3000, 2)).connect(env(s, out, t0, 0.45, 0.001, 0.03));
  return 0.05;
};
/** Ledakan C4: sub sine 45 → 18 Hz 1.4 s + noise lowpass 1800 → 100 Hz 2.2 s + 8 derak highpass 2.5 kHz. */
export const c4Explosion: Recipe = (s, out, t0) => {
  osc(s, 'sine', 45, 18, t0, 1.4).connect(env(s, out, t0, 1.0, 0.005, 1.4));
  const n = noiseSrc(s, t0, 2.3), lp = filt(s, 'lowpass', 1800);
  lp.frequency.setValueAtTime(1800, t0); lp.frequency.exponentialRampToValueAtTime(100, t0 + 2.2);
  n.connect(lp).connect(env(s, out, t0, 1.0, 0.004, 2.2));
  for (let i = 0; i < 8; i++) {
    const t = t0 + 0.08 + Math.random() * 0.9;
    noiseSrc(s, t, 0.06).connect(filt(s, 'highpass', 2500)).connect(env(s, out, t, 0.4, 0.002, 0.06));
  }
  return 2.4;
};
