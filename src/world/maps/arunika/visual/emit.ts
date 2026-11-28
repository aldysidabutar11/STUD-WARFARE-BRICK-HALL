// src/world/maps/arunika/visual/emit.ts — geometri bangunan Candi Arunika (koordinat dunia, bucket per material = 1 draw call).
// Setiap balok denah (AR_BOXES) digambar sesuai gayanya DI DALAM tapak collider-nya (collider = visual): candi andesit bertingkat
// dengan relief & ratna, gapura candi bentar bata merah, tembok kompleks, wihara berplester, rumah desa, pendopo jati, stupa
// (genta = hull yang sama dengan collider), tangga batu berundak di atas ramp, prop pasar. Alam (tanah, pohon, tebing, air, latar)
// ada di nature.ts.
import * as THREE from 'three';
import type { Box } from '../../../MapData';
import { stairFrame } from '../../../MapData';
import type { Geo, V3 } from '../../steelyard/visual/geo';
import { hashStr } from '../../steelyard/visual/geo';
import { makeRng } from '../../../../core/Rng';
import { AR_HULLS, AR_STAIRS, BELL_SEG, SMALL_BELL, STUPA_BELL, type ArHull, type BellProfile } from '../layout';
import type { ArMat } from './materials';

type K = ArMat;
export const COL = {
  and: 0xa7a49c, andDark: 0x84827b, andMoss: 0x9aa08a, andLight: 0xc2beb3, andWarm: 0xb0a596,
  brick: 0xf4e6df, brickDark: 0xd2bdb4, plaster: 0xf4eee3, plasterDirt: 0xd8cfbf,
  tile: 0xf2e4da, teak: 0xa06e48, teakDark: 0x6c4830, woodGray: 0xa49a8c, bamboo: 0xe4c98e, cloth: 0xc9473a,
  bronze: 0xc09060, gold: 0xf0c868, dark: 0x2a2622, flame: 0xffc070,
} as const;

/** Pita mendatar mengelilingi tapak (lis/cornice): balok di (x0..x1, z0..z1) membesar `out` (≤ 0 → di dalam tapak). */
function band(g: Geo, k: K, x0: number, x1: number, z0: number, z1: number, y0: number, y1: number, out = 0) {
  g.box(k, x0 - out, y0, z0 - out, x1 + out, y1, z1 + out);
}

/** Panel relief di 4 muka balok (quad menempel 0.012 u di luar muka). Tinggi panel dibagi pita ±1.1 u (v = jumlah pita) → motif
 *  tidak melar di panel tinggi (aling-aling). */
function reliefPanels(g: Geo, x0: number, x1: number, z0: number, z1: number, y0: number, y1: number, margin = 0.4, faces = 'nsew') {
  const o = 0.012, nb = Math.max(1, Math.round((y1 - y0) / 1.1));
  const run = (len: number) => Math.max(0.5, len - margin * 2);
  if (faces.includes('s')) {        // muka −Z
    const L = run(x1 - x0), a = (x0 + x1) / 2 - L / 2, b = a + L;
    g.quad('relief', [b, y0, z0 - o], [a, y0, z0 - o], [a, y1, z0 - o], [b, y1, z0 - o], [0, 0, L, 0, L, nb, 0, nb]);
  }
  if (faces.includes('n')) {
    const L = run(x1 - x0), a = (x0 + x1) / 2 - L / 2, b = a + L;
    g.quad('relief', [a, y0, z1 + o], [b, y0, z1 + o], [b, y1, z1 + o], [a, y1, z1 + o], [0, 0, L, 0, L, nb, 0, nb]);
  }
  if (faces.includes('w')) {
    const L = run(z1 - z0), a = (z0 + z1) / 2 - L / 2, b = a + L;
    g.quad('relief', [x0 - o, y0, a], [x0 - o, y0, b], [x0 - o, y1, b], [x0 - o, y1, a], [0, 0, L, 0, L, nb, 0, nb]);
  }
  if (faces.includes('e')) {
    const L = run(z1 - z0), a = (z0 + z1) / 2 - L / 2, b = a + L;
    g.quad('relief', [x1 + o, y0, b], [x1 + o, y0, a], [x1 + o, y1, a], [x1 + o, y1, b], [0, 0, L, 0, L, nb, 0, nb]);
  }
}

/** Ratna kecil (finial berbentuk permata/stupa mini) di (x, y, z), lebar w, tinggi h — prisma segi-8 menyempit. */
function ratna(g: Geo, k: K, x: number, y: number, z: number, w: number, h: number) {
  const r = w / 2;
  g.prismY(k, x, z, r, y, y + h * 0.25, 8, { phase: Math.PI / 8 });
  g.prismY(k, x, z, r * 0.92, y + h * 0.25, y + h * 0.55, 8, { phase: Math.PI / 8, rTop: r * 0.7 });
  g.prismY(k, x, z, r * 0.7, y + h * 0.55, y + h, 8, { phase: Math.PI / 8, rTop: r * 0.08 });
}

/** Pintu semu candi: bingkai cekung gelap + ambang + kepala kala di atasnya, di muka balok (dir = normal muka). */
function falseDoor(g: Geo, cx: number, cz: number, dir: 'n' | 's' | 'e' | 'w', y0: number, w: number, h: number) {
  const o = 0.014, dx = dir === 'e' ? 1 : dir === 'w' ? -1 : 0, dz = dir === 'n' ? 1 : dir === 's' ? -1 : 0;
  const tx = dz !== 0 ? 1 : 0, tz = dx !== 0 ? 1 : 0;              // arah sepanjang muka
  const P = (s: number, y: number, d = 0): V3 => [cx + tx * s + dx * (o + d), y, cz + tz * s + dz * (o + d)];
  const flip = dir === 's' || dir === 'e';
  const q = (k: K, s0: number, s1: number, ya: number, yb: number, d = 0) => {
    if (flip) g.quad(k, P(s1, ya, d), P(s0, ya, d), P(s0, yb, d), P(s1, yb, d));
    else g.quad(k, P(s0, ya, d), P(s1, ya, d), P(s1, yb, d), P(s0, yb, d));
  };
  g.color(COL.andLight); q('stone', -w / 2 - 0.35, w / 2 + 0.35, y0, y0 + h + 0.35, 0.002);    // bingkai
  g.color(COL.dark); q('paint', -w / 2, w / 2, y0, y0 + h, 0.004);                                  // ceruk gelap
  g.color(COL.andDark); q('relief', -w / 2 - 0.5, w / 2 + 0.5, y0 + h + 0.35, y0 + h + 1.25, 0.006);   // kepala kala
}

// ───────────────────────── emiter per gaya
type Emit = (g: Geo, b: Box) => void;
const EMIT: Partial<Record<string, Emit>> = {};

/** Candi Induk, candi perwara, cetiya: tingkat andesit. Kaki = lis + panel relief; tubuh = pintu semu + pilaster; atap = cornice +
 *  ratna di sudut; puncak (tingkat paling kecil, ≤ 1.5 u) = ratna. */
function templeTier(g: Geo, b: Box, color: number) {
  const [x0, y0, z0] = b.min, [x1, y1, z1] = b.max, w = x1 - x0, d = z1 - z0, h = y1 - y0;
  const n = Number(b.id.split('_').pop());
  g.color(color);
  if (w <= 1.5 && d <= 1.5) { ratna(g, 'stone', (x0 + x1) / 2, y0, (z0 + z1) / 2, Math.min(w, d), h); return; }
  if (n === 1) {                                                   // kaki
    g.box('stone', x0, y0, z0, x1, y0 + 0.35, z1, { sub: 2 });
    g.color(COL.andDark); band(g, 'stone', x0 + 0.12, x1 - 0.12, z0 + 0.12, z1 - 0.12, y0 + 0.35, y1 - 0.45);
    g.color(color); band(g, 'stone', x0, x1, z0, z1, y1 - 0.45, y1);
    if (h >= 2) reliefPanels(g, x0 + 0.12, x1 - 0.12, z0 + 0.12, z1 - 0.12, y0 + 0.6, y1 - 0.7, 0.6);
    return;
  }
  const body = h >= 2.6 && n === 2;
  g.box('stone', x0, y0, z0, x1, y1 - 0.3, z1, { sub: 2 });
  g.color(COL.andLight); band(g, 'stone', x0 - 0, x1, z0, z1, y1 - 0.3, y1);
  if (body) {
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, dw = Math.min(2.2, w * 0.32), dh = Math.min(3.0, h * 0.62);
    if (!b.id.startsWith('BS_')) falseDoor(g, cx, z0, 's', y0 + 0.2, dw, dh);
    falseDoor(g, cx, z1, 'n', y0 + 0.2, dw, dh);
    if (!b.id.startsWith('W_SHRINE')) falseDoor(g, x0, cz, 'w', y0 + 0.2, dw, dh);
    falseDoor(g, x1, cz, 'e', y0 + 0.2, dw, dh);
  } else if (w > 2.5) {                                           // atap: ratna kecil di sudut (di dalam tapak)
    g.color(COL.and);
    const r = Math.min(0.5, w * 0.1), hh = Math.min(0.9, h * 0.5);
    for (const [x, z] of [[x0 + r, z0 + r], [x1 - r, z0 + r], [x0 + r, z1 - r], [x1 - r, z1 - r]] as const)
      ratna(g, 'stone', x, y1 - hh - 0.3, z, r * 2, hh);
  }
}
EMIT.a_temple = (g, b) => templeTier(g, b, COL.and);
EMIT.a_shrine = (g, b) => templeTier(g, b, b.id.startsWith('W_') ? COL.andMoss : COL.andWarm);

/** Menara candi bentar (bata merah Majapahit): tingkat menyempit, lis andesit di tiap peralihan, bidang dalam rata. */
function bentarTier(g: Geo, b: Box) {
  const [x0, y0, z0] = b.min, [x1, y1, z1] = b.max, n = Number(b.id.split('_').pop() ?? '1');
  g.color(COL.brick);
  g.box('brick', x0, y0, z0, x1, y1 - 0.35, z1, { sub: 3 });
  g.color(COL.andLight); g.box('stone', x0, y1 - 0.35, z0, x1, y1, z1);
  if (n === 1 || isNaN(n)) { g.color(COL.andDark); g.box('stone', x0, y0, z0, x1, y0 + 0.5, z1); }
}
EMIT.a_tower = bentarTier;
EMIT.a_bentar = (g, b) => {
  const [x0, y0, z0] = b.min, [x1, y1, z1] = b.max;
  g.color(COL.andDark); g.box('stone', x0, y0, z0, x1, y0 + 0.6, z1);
  g.color(COL.brick); g.box('brick', x0, y0 + 0.6, z0, x1, 7, z1, { sub: 3 });
  g.color(COL.andLight); g.box('stone', x0, 7, z0, x1, 7.4, z1);
  g.color(COL.brick); g.box('brick', x0 + 0.4, 7.4, z0, x1 - 0.4, 10.4, z1);
  g.color(COL.andLight); g.box('stone', x0 + 0.4, 10.4, z0, x1 - 0.4, 10.8, z1);
  g.color(COL.brick); g.box('brick', x0 + 1.2, 10.8, z0, x1 - 1.2, y1, z1);
};

/** Tembok: bata (kompleks candi, gapura), plester + lis genteng (wihara & spawn Biru), pagar papan jati (dermaga). */
EMIT.a_wall = (g, b) => {
  const [x0, y0, z0] = b.min, [x1, y1, z1] = b.max, id = b.id;
  if (id.startsWith('MON_') || id.startsWith('BS_')) {             // wihara: plester putih di kaki andesit, lis genteng
    g.color(COL.andDark); g.box('stone', x0, y0, z0, x1, y0 + 1.2, z1, { sub: 4 });
    g.color(COL.plaster); g.box('plaster', x0, y0 + 1.2, z0, x1, y1 - 0.7, z1, { sub: 3, skip: { py: true } });
    g.color(COL.tile); roofCap(g, x0, x1, z0, z1, y1 - 0.7, y1);
    if (id.startsWith('MON_') && (y1 - y0) >= 9 && (x1 - x0) * (z1 - z0) > 60) windows(g, b);
    return;
  }
  if (id.startsWith('RS_')) {                                      // dermaga: kaki batu + papan jati tegak + atap kecil
    g.color(COL.andDark); g.box('stone', x0, y0, z0, x1, y0 + 0.7, z1, { sub: 4 });
    g.color(COL.woodGray); g.box('wood', x0, y0 + 0.7, z0, x1, y1 - 0.5, z1, { sub: 3, grain: 1, skip: { py: true } });
    g.color(COL.teakDark); for (let x = x0 + 2; x < x1 - 0.5; x += 4) g.box('wood', x - 0.15, y0 + 0.7, z0 - 0.0, x + 0.15, y1 - 0.5, z1, { grain: 1 });
    for (let z = z0 + 2; z < z1 - 0.5; z += 4) g.box('wood', x0, y0 + 0.7, z - 0.15, x1, y1 - 0.5, z + 0.15, { grain: 1 });
    g.color(COL.tile); roofCap(g, x0, x1, z0, z1, y1 - 0.5, y1);
    return;
  }
  // kompleks candi / gapura: bata merah, kaki & lis andesit, panel relief setiap ±8 u, pilaster
  g.color(COL.andDark); g.box('stone', x0, y0, z0, x1, y0 + 1.0, z1, { sub: 4 });
  g.color(COL.brick); g.box('brick', x0, y0 + 1.0, z0, x1, y1 - 0.6, z1, { sub: 3, skip: { py: true } });
  g.color(COL.andLight); g.box('stone', x0, y1 - 0.6, z0, x1, y1, z1, { sub: 4 });
  const long = Math.max(x1 - x0, z1 - z0);
  if (long >= 12 && y1 - y0 >= 8) {
    const alongZ = z1 - z0 > x1 - x0, n = Math.floor(long / 8);
    for (let i = 0; i < n; i++) {
      const s0 = (alongZ ? z0 : x0) + (long - n * 8) / 2 + i * 8 + 1.2, s1 = s0 + 5.6;
      if (alongZ) reliefPanels(g, x0, x1, s0, s1, y0 + 3.2, y0 + 4.4, 0, 'we');
      else reliefPanels(g, s0, s1, z0, z1, y0 + 3.2, y0 + 4.4, 0, 'ns');
    }
  }
};

/** Lis atap genteng di puncak tembok: lereng dua sisi dari tepi (y0) ke bubungan tengah (y1) — di dalam tapak tembok. */
function roofCap(g: Geo, x0: number, x1: number, z0: number, z1: number, y0: number, y1: number) {
  const alongZ = z1 - z0 >= x1 - x0;
  if (alongZ) {
    const cx = (x0 + x1) / 2;
    g.quad('tile', [x0, y0, z1], [x0, y0, z0], [cx, y1, z0], [cx, y1, z1]);
    g.quad('tile', [x1, y0, z0], [x1, y0, z1], [cx, y1, z1], [cx, y1, z0]);
    g.tri('tile', [x0, y0, z0], [x1, y0, z0], [cx, y1, z0]);
    g.tri('tile', [x1, y0, z1], [x0, y0, z1], [cx, y1, z1]);
  } else {
    const cz = (z0 + z1) / 2;
    g.quad('tile', [x0, y0, z0], [x1, y0, z0], [x1, y1, cz], [x0, y1, cz]);
    g.quad('tile', [x1, y0, z1], [x0, y0, z1], [x0, y1, cz], [x1, y1, cz]);
    g.tri('tile', [x0, y0, z1], [x0, y0, z0], [x0, y1, cz]);
    g.tri('tile', [x1, y0, z0], [x1, y0, z1], [x1, y1, cz]);
  }
}

/** Jendela berkisi kayu di muka panjang tembok wihara (ceruk gelap + kisi). */
function windows(g: Geo, b: Box) {
  const [x0, , z0] = b.min, [x1, , z1] = b.max, alongZ = z1 - z0 > x1 - x0, L = alongZ ? z1 - z0 : x1 - x0;
  const o = 0.016;
  for (let s = 3; s < L - 2; s += 5) {
    const a = (alongZ ? z0 : x0) + s, c = a + 1.6, ya = 4.2, yb = 6.4;
    for (const side of [0, 1]) {
      if (alongZ) {
        const x = side ? x1 + o : x0 - o;
        g.color(COL.dark);
        if (side) g.quad('paint', [x, ya, c], [x, ya, a], [x, yb, a], [x, yb, c]); else g.quad('paint', [x, ya, a], [x, ya, c], [x, yb, c], [x, yb, a]);
        g.color(COL.teakDark);
        for (let t = a + 0.3; t < c; t += 0.4) g.box('wood', x - 0.04, ya, t - 0.05, x + 0.04, yb, t + 0.05, { grain: 1 });
      } else {
        const z = side ? z1 + o : z0 - o;
        g.color(COL.dark);
        if (side) g.quad('paint', [a, ya, z], [c, ya, z], [c, yb, z], [a, yb, z]); else g.quad('paint', [c, ya, z], [a, ya, z], [a, yb, z], [c, yb, z]);
        g.color(COL.teakDark);
        for (let t = a + 0.3; t < c; t += 0.4) g.box('wood', t - 0.05, ya, z - 0.04, t + 0.05, yb, z + 0.04, { grain: 1 });
      }
    }
  }
}

/** Ambang gerbang (bata/andesit) dengan kepala kala di kedua muka. */
EMIT.a_lintel = (g, b) => {
  const [x0, y0, z0] = b.min, [x1, y1, z1] = b.max;
  const mon = b.id.startsWith('MON_');
  g.color(mon ? COL.plaster : COL.brick);
  g.box(mon ? 'plaster' : 'brick', x0, y0 + 0.4, z0, x1, y1 - 0.6, z1);
  g.color(COL.andLight); g.box('stone', x0, y0, z0, x1, y0 + 0.4, z1); g.box('stone', x0, y1 - 0.6, z0, x1, y1, z1);
  if (mon) { g.color(COL.tile); roofCap(g, x0, x1, z0, z1, y1 - 0.6, y1); }
  const alongZ = z1 - z0 > x1 - x0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  if (alongZ) { reliefPanels(g, x0, x1, cz - 1.2, cz + 1.2, y0 + 0.7, y0 + 2.1, 0, 'we'); }
  else reliefPanels(g, cx - 1.2, cx + 1.2, z0, z1, y0 + 0.7, y0 + 2.1, 0, 'ns');
};

/** Rumah desa (tembok 6): kaki andesit, dinding papan jati berpanel (gebyok) di sisi pasar/jalur, pintu & jendela. Atap = hull. */
EMIT.a_house = (g, b) => {
  const [x0, y0, z0] = b.min, [x1, y1, z1] = b.max;
  g.color(COL.andDark); g.box('stone', x0, y0, z0, x1, y0 + 0.8, z1, { sub: 4 });
  g.color(COL.plasterDirt); g.box('plaster', x0, y0 + 0.8, z0, x1, y1, z1, { sub: 3, skip: { py: true } });
  g.color(COL.teakDark); g.box('wood', x0 - 0.0, y1 - 0.35, z0, x1, y1, z1);
  // panel kayu, pintu & jendela di kedua muka panjang (X tetap)
  const o = 0.015;
  for (const side of [0, 1]) {
    const x = side ? x1 + o : x0 - o;
    for (let z = z0 + 1.5; z < z1 - 1.5; z += 6) {
      const door = Math.floor((z - z0) / 6) % 2 === 0;
      g.color(COL.teak);
      const za = z, zb = z + (door ? 2.2 : 2.6), ya = door ? y0 + 0.8 : 2.4, yb = door ? 4.4 : 4.4;
      if (side) g.quad('wood', [x, ya, zb], [x, ya, za], [x, yb, za], [x, yb, zb]); else g.quad('wood', [x, ya, za], [x, ya, zb], [x, yb, zb], [x, yb, za]);
      g.color(COL.teakDark);
      g.box('wood', x - 0.06, ya - 0.12, za - 0.12, x + 0.06, yb + 0.12, za);
      g.box('wood', x - 0.06, ya - 0.12, zb, x + 0.06, yb + 0.12, zb + 0.12);
      g.box('wood', x - 0.06, yb, za - 0.12, x + 0.06, yb + 0.14, zb + 0.12);
      if (!door) for (let t = za + 0.4; t < zb; t += 0.45) g.box('wood', x - 0.05, ya, t - 0.04, x + 0.05, yb, t + 0.04, { grain: 1 });
    }
  }
};

/** Teras stupa: sisi andesit (kaki, pita relief, cornice), puncak berlantai batu besar. */
EMIT.a_terrace = (g, b) => {
  const [x0, y0, z0] = b.min, [x1, y1, z1] = b.max;
  g.color(COL.andDark); g.box('stone', x0, y0, z0, x1, y0 + 0.5, z1, { sub: 3, skip: { py: true } });
  g.color(COL.and); g.box('stone', x0, y0 + 0.5, z0, x1, y1 - 0.4, z1, { sub: 3, skip: { py: true, ny: true } });
  g.color(COL.andLight); g.box('stone', x0, y1 - 0.4, z0, x1, y1, z1, { sub: 3, skip: { py: true, ny: true } });
  g.color(COL.and); g.box('paving', x0, y1 - 0.01, z0, x1, y1, z1, { skip: { ny: true, px: true, nx: true, pz: true, nz: true }, sub: 4 });
  reliefPanels(g, x0, x1, z0, z1, y0 + 0.9, y0 + 2.1, 0.8);
};

/** Pagar batu teras (1.2): dinding rendah berelief + lis atas bergerigi kecil (di dalam tapak). */
EMIT.a_balus = (g, b) => {
  const [x0, y0, z0] = b.min, [x1, y1, z1] = b.max;
  g.color(COL.andDark); g.box('stone', x0, y0, z0, x1, y0 + 0.15, z1);
  g.color(COL.and); g.box('stone', x0 + 0.06, y0 + 0.15, z0 + 0.06, x1 - 0.06, y1 - 0.25, z1 - 0.06, { skip: { ny: true } });
  g.color(COL.andLight); g.box('stone', x0, y1 - 0.25, z0, x1, y1, z1);
  const alongZ = z1 - z0 > x1 - x0;
  if (alongZ) reliefPanels(g, x0 + 0.06, x1 - 0.06, z0, z1, y0 + 0.3, y1 - 0.35, 0.3, 'we');
  else reliefPanels(g, x0, x1, z0 + 0.06, z1 - 0.06, y0 + 0.3, y1 - 0.35, 0.3, 'ns');
};

/** Panggung pendopo: kaki andesit berlis, lantai papan jati. */
EMIT.a_plinth = (g, b) => {
  const [x0, y0, z0] = b.min, [x1, y1, z1] = b.max;
  g.color(COL.andDark); g.box('stone', x0, y0, z0, x1, y0 + 0.3, z1, { sub: 3, skip: { py: true } });
  g.color(COL.and); g.box('stone', x0, y0 + 0.3, z0, x1, y1 - 0.25, z1, { sub: 3, skip: { py: true, ny: true } });
  g.color(COL.andLight); g.box('stone', x0, y1 - 0.25, z0, x1, y1 - 0.02, z1, { skip: { py: true, ny: true } });
  g.color(COL.teak); g.box('wood', x0, y1 - 0.02, z0, x1, y1, z1, { grain: 0, sub: 4, skip: { ny: true } });
};

/** Tiang jati di atas umpak batu, sunduk (kepala) berukir. */
EMIT.a_column = (g, b) => {
  const [x0, y0, z0] = b.min, [x1, y1, z1] = b.max, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, w = Math.min(x1 - x0, z1 - z0);
  g.color(COL.andDark); g.box('stone', cx - w * 0.46, y0, cz - w * 0.46, cx + w * 0.46, y0 + 0.45, cz + w * 0.46);
  g.color(COL.and); g.prismY('stone', cx, cz, w * 0.4, y0 + 0.45, y0 + 0.7, 8, { phase: Math.PI / 8, rTop: w * 0.32 });
  g.color(COL.teak); g.prismY('wood', cx, cz, w * 0.34, y0 + 0.7, y1 - 0.6, 12, { smooth: true, uvScale: 1, vScale: 1 });
  g.color(COL.teakDark); g.box('wood', cx - w * 0.5, y1 - 0.6, cz - w * 0.5, cx + w * 0.5, y1, cz + w * 0.5);
  g.color(COL.gold); g.prismY('gold', cx, cz, w * 0.36, y1 - 0.75, y1 - 0.6, 12, { smooth: true });
};

/** Pelat langit-langit pendopo / balai genta: plafon tumpang sari berundak (kayu) di bawah, lis tepi. */
EMIT.a_roof = (g, b) => {
  const [x0, y0, z0] = b.min, [x1, y1, z1] = b.max;
  g.color(COL.teakDark); g.box('wood', x0, y0, z0, x1, y1, z1, { sub: 4 });
  g.color(COL.teak);
  for (let i = 1; i <= 3; i++) {                                   // bingkai berundak di sisi bawah (sedikit di bawah pelat)
    const ins = i * 1.6, yy = y0 - 0.01 * i;
    if (x1 - x0 - ins * 2 < 1 || z1 - z0 - ins * 2 < 1) break;
    g.quad('wood', [x0 + ins, yy, z0 + ins], [x1 - ins, yy, z0 + ins], [x1 - ins, yy, z1 - ins], [x0 + ins, yy, z1 - ins]);
  }
  g.color(COL.gold); g.box('gold', x0, y0 + 0.35, z0 - 0.0, x1, y0 + 0.5, z1);
};

/** Lapak pasar: meja jati berkaki + dagangan (buah, kain, keranjang) + kanopi kain di tiang bambu (di atas kepala, tanpa collider). */
EMIT.a_stall = (g, b) => {
  const [x0, y0, z0] = b.min, [x1, y1, z1] = b.max, rng = makeRng(hashStr(b.id));
  g.color(COL.teak);
  g.box('wood', x0, y1 - 1.3, z0, x1, y1 - 1.05, z1, { grain: 0 });
  g.color(COL.teakDark);
  g.box('wood', x0 + 0.05, y0, z0 + 0.05, x1 - 0.05, y1 - 1.3, z1 - 0.05, { grain: 1 });
  // dagangan: tumpukan buah/sayur berwarna & gulungan kain, menutup bagian atas tapak
  const goods = [0xd94b2b, 0xe6a122, 0x7bae3a, 0x9b3fa0, 0xf2d24a, 0x3c8c4e];
  for (let x = x0 + 0.15; x < x1 - 0.1; x += 0.95) for (let z = z0 + 0.15; z < z1 - 0.1; z += 0.95) {
    const c = goods[Math.floor(rng() * goods.length)], hh = 0.45 + rng() * 0.6;
    g.color(0xc8a464); g.box('weave', x, y1 - 1.05, z, Math.min(x + 0.85, x1 - 0.05), y1 - 0.85, Math.min(z + 0.85, z1 - 0.05));
    g.color(c); g.box('paint', x + 0.1, y1 - 0.85, z + 0.1, Math.min(x + 0.75, x1 - 0.15), Math.min(y1, y1 - 0.85 + hh), Math.min(z + 0.75, z1 - 0.15));
  }
  // kanopi kain + tiang bambu
  const cloth = [0xc9473a, 0x2f6fae, 0xe0a33c, 0x3f8f5a][Math.floor(rng() * 4)];
  g.color(COL.bamboo);
  for (const [x, z] of [[x0 + 0.1, z0 + 0.1], [x1 - 0.1, z0 + 0.1], [x0 + 0.1, z1 - 0.1], [x1 - 0.1, z1 - 0.1]] as const)
    g.prismY('wood', x, z, 0.07, y1, 5.4, 6);
  g.color(cloth);
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, alongX = x1 - x0 >= z1 - z0;
  if (alongX) {
    g.quad('weave', [x0 - 0.3, 5.2, z0 - 0.4], [x1 + 0.3, 5.2, z0 - 0.4], [x1 + 0.3, 5.75, cz], [x0 - 0.3, 5.75, cz]);
    g.quad('weave', [x1 + 0.3, 5.2, z1 + 0.4], [x0 - 0.3, 5.2, z1 + 0.4], [x0 - 0.3, 5.75, cz], [x1 + 0.3, 5.75, cz]);
    g.quad('weave', [x0 - 0.3, 5.75, cz], [x1 + 0.3, 5.75, cz], [x1 + 0.3, 5.2, z0 - 0.4], [x0 - 0.3, 5.2, z0 - 0.4]);
    g.quad('weave', [x1 + 0.3, 5.75, cz], [x0 - 0.3, 5.75, cz], [x0 - 0.3, 5.2, z1 + 0.4], [x1 + 0.3, 5.2, z1 + 0.4]);
  } else {
    g.quad('weave', [x0 - 0.4, 5.2, z1 + 0.3], [x0 - 0.4, 5.2, z0 - 0.3], [cx, 5.75, z0 - 0.3], [cx, 5.75, z1 + 0.3]);
    g.quad('weave', [x1 + 0.4, 5.2, z0 - 0.3], [x1 + 0.4, 5.2, z1 + 0.3], [cx, 5.75, z1 + 0.3], [cx, 5.75, z0 - 0.3]);
  }
};

/** Tumpukan peti kayu: 2 × 2 × 2 peti berbingkai (memenuhi tapak). */
EMIT.a_crate = (g, b) => {
  const [x0, y0, z0] = b.min, [x1, y1, z1] = b.max, nx = Math.max(1, Math.round((x1 - x0) / 1.5)), nz = Math.max(1, Math.round((z1 - z0) / 1.5));
  const ny = Math.max(1, Math.round((y1 - y0) / 2)), sx = (x1 - x0) / nx, sy = (y1 - y0) / ny, sz = (z1 - z0) / nz;
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) for (let k = 0; k < nz; k++) {
    const a = x0 + i * sx, c = y0 + j * sy, e = z0 + k * sz, t = ((i * 7 + j * 3 + k * 5) % 4) / 10;
    g.color(COL.teak, 0.85 + t); g.box('wood', a + 0.04, c, e + 0.04, a + sx - 0.04, c + sy - 0.02, e + sz - 0.04, { grain: 0 });
    g.color(COL.teakDark, 0.9 + t);
    const f = 0.12;
    g.box('wood', a, c, e, a + sx, c + f, e + sz); g.box('wood', a, c + sy - f - 0.02, e, a + sx, c + sy - 0.02, e + sz);
    for (const [px, pz] of [[a, e], [a + sx - f, e], [a, e + sz - f], [a + sx - f, e + sz - f]] as const) g.box('wood', px, c, pz, px + f, c + sy - 0.02, pz + f, { grain: 1 });
  }
};

/** Besek (wadah anyaman bambu persegi) bertumpuk memenuhi tapak. */
EMIT.a_basket = (g, b) => {
  const [x0, y0, z0] = b.min, [x1, y1, z1] = b.max, ny = Math.round((y1 - y0) / 0.6);
  for (let j = 0; j < ny; j++) {
    const y = y0 + j * (y1 - y0) / ny, yy = y + (y1 - y0) / ny, ins = (j % 2) * 0.06;
    g.color(COL.bamboo, 0.88 + (j % 3) * 0.06); g.box('weave', x0 + ins, y, z0 + ins, x1 - ins, yy - 0.04, z1 - ins);
    g.color(0x9c7a44); g.box('weave', x0 + ins, yy - 0.04, z0 + ins, x1 - ins, yy, z1 - ins);
  }
};

/** Gerobak kayu: bak papan sampai tanah (collider penuh), 2 roda besar di sisi, kayu penarik. */
EMIT.a_cart = (g, b) => {
  const [x0, y0, z0] = b.min, [x1, y1, z1] = b.max;
  g.color(COL.teakDark); g.box('wood', x0 + 0.1, y0, z0 + 0.35, x1 - 0.1, y1 - 0.5, z1 - 0.35, { grain: 0 });
  g.color(COL.teak); g.box('wood', x0, y1 - 0.5, z0 + 0.25, x1, y1, z1 - 0.25, { grain: 0 });
  // roda (cakram jari-jari tebal) di kedua sisi Z
  const r = 1.05, cx = (x0 + x1) / 2;
  for (const s of [-1, 1]) {
    const z = s < 0 ? z0 + 0.18 : z1 - 0.18;
    g.color(COL.teakDark);
    for (let i = 0; i < 12; i++) {
      const a0 = (i / 12) * Math.PI * 2, a1 = ((i + 1) / 12) * Math.PI * 2;
      const P = (a: number, rr: number, dz: number): V3 => [cx + Math.cos(a) * rr, r + Math.sin(a) * rr, z + dz];
      g.quad('wood', P(a0, r, -0.18 * s), P(a1, r, -0.18 * s), P(a1, r, 0.18 * s), P(a0, r, 0.18 * s));
      const out = s * 0.18;
      g.tri('wood', [cx, r, z + out], P(a0, r, out), P(a1, r, out));
    }
  }
};

/** Lentera batu: alas, tiang, rumah lampu berjendela (api menyala), atap kecil. */
EMIT.a_lantern = (g, b) => {
  const [x0, y0, z0] = b.min, [x1, y1, z1] = b.max, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, w = x1 - x0;
  g.color(COL.andDark); g.box('stone', x0, y0, z0, x1, y0 + 0.3, z1);
  g.color(COL.and); g.box('stone', cx - w * 0.28, y0 + 0.3, cz - w * 0.28, cx + w * 0.28, y1 - 1.0, cz + w * 0.28);
  g.color(COL.andLight); g.box('stone', x0 + 0.05, y1 - 1.0, z0 + 0.05, x1 - 0.05, y1 - 0.92, z1 - 0.05);
  // rumah lampu: 4 tiang sudut + api
  const h0 = y1 - 0.92, h1 = y1 - 0.4, p = 0.14;
  g.color(COL.and);
  for (const [x, z] of [[x0 + 0.08, z0 + 0.08], [x1 - 0.08 - p, z0 + 0.08], [x0 + 0.08, z1 - 0.08 - p], [x1 - 0.08 - p, z1 - 0.08 - p]] as const)
    g.box('stone', x, h0, z, x + p, h1, z + p);
  g.color(COL.flame, 1.6); g.boxC('glow', cx, (h0 + h1) / 2, cz, w * 0.36, (h1 - h0) * 0.7, w * 0.36);
  g.color(COL.andLight); g.box('stone', x0, h1, z0, x1, h1 + 0.12, z1);
  g.color(COL.and); g.prismY('stone', cx, cz, w * 0.5, h1 + 0.12, y1, 4, { phase: Math.PI / 4, rTop: 0.05 });
};

/** Arca: dwarapala (penjaga berlutut, gada, mata melotot) di gapura; Buddha duduk di atas teratai di taman B. */
EMIT.a_statue = (g, b) => {
  const [x0, y0, z0] = b.min, [x1, y1, z1] = b.max, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, w = x1 - x0;
  g.color(COL.andDark); g.box('stone', x0, y0, z0, x1, y0 + 1.1, z1);
  g.color(COL.andMoss);
  if (b.id === 'B_STATUE') {                                      // Buddha bersila
    g.prismY('stone', cx, cz, w * 0.46, y0 + 1.1, y0 + 1.45, 12, { smooth: true });
    g.color(COL.and);
    g.box('stone', cx - w * 0.42, y0 + 1.45, cz - w * 0.3, cx + w * 0.42, y0 + 1.95, cz + w * 0.3);   // pangkuan
    g.box('stone', cx - w * 0.22, y0 + 1.95, cz - w * 0.16, cx + w * 0.22, y0 + 3.0, cz + w * 0.16);  // badan
    g.prismY('stone', cx, cz, w * 0.15, y0 + 3.0, y0 + 3.62, 10, { smooth: true, rTop: w * 0.12 });   // kepala
    g.prismY('stone', cx, cz, w * 0.08, y0 + 3.62, y1 - 0.02, 8, { rTop: 0.02 });                     // ushnisha
    return;
  }
  // dwarapala: menghadap ke luar gapura (Utara, +Z)
  g.box('stone', cx - w * 0.36, y0 + 1.1, cz - w * 0.32, cx + w * 0.36, y0 + 1.7, cz + w * 0.36);     // lutut/kaki
  g.color(COL.and);
  g.box('stone', cx - w * 0.3, y0 + 1.7, cz - w * 0.28, cx + w * 0.3, y0 + 3.0, cz + w * 0.2);       // badan gemuk
  g.box('stone', cx - w * 0.24, y0 + 3.0, cz - w * 0.2, cx + w * 0.24, y1 - 0.05, cz + w * 0.24);    // kepala besar
  g.color(COL.andLight);
  g.box('stone', cx - w * 0.26, y1 - 0.25, cz - w * 0.22, cx + w * 0.26, y1, cz + w * 0.22);         // mahkota rambut ikal
  g.color(COL.dark);
  for (const s of [-1, 1]) g.boxC('paint', cx + s * w * 0.1, y0 + 3.45, cz + w * 0.245, 0.22, 0.2, 0.02);   // mata melotot
  g.color(COL.andDark);
  g.box('stone', cx + w * 0.3, y0 + 1.1, cz + w * 0.1, cx + w * 0.46, y0 + 3.1, cz + w * 0.3);       // gada
};

/** Bibir kolam: lis batu berpuncak membulat. */
EMIT.a_pond = (g, b) => {
  const [x0, y0, z0] = b.min, [x1, y1, z1] = b.max;
  g.color(COL.andDark); g.box('stone', x0, y0, z0, x1, y1 - 0.08, z1);
  g.color(COL.andLight); g.box('stone', x0, y1 - 0.08, z0, x1, y1, z1);
};

/** Sumur batu segi-8 + rangka kayu & kerekan (di atas collider 1.2). */
EMIT.a_well = (g, b) => {
  const [x0, y0, z0] = b.min, [x1, y1, z1] = b.max, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, r = (x1 - x0) / 2 / Math.cos(Math.PI / 8);
  g.color(COL.andDark); g.prismY('stone', cx, cz, r, y0, y1 - 0.15, 8, { phase: Math.PI / 8, top: false });
  g.color(COL.andLight); g.prismY('stone', cx, cz, r, y1 - 0.15, y1, 8, { phase: Math.PI / 8, top: false });
  g.color(COL.dark); g.disc('paint', cx, y1 - 0.25, cz, r * 0.82, 8, 1, Math.PI / 8);
  g.color(0x40585a); g.disc('paint', cx, y1 - 0.6, cz, r * 0.8, 8, 1, Math.PI / 8);
  g.color(COL.teakDark);
  for (const s of [-1, 1]) g.box('wood', cx + s * (r * 0.8) - 0.12, y1, cz - 0.12, cx + s * (r * 0.8) + 0.12, 3.6, cz + 0.12, { grain: 1 });
  g.box('wood', cx - r * 0.85, 3.4, cz - 0.1, cx + r * 0.85, 3.6, cz + 0.1);
  g.color(COL.teak); g.prismY('wood', cx, cz, 0.18, 2.2, 2.7, 8);
};

/** Altar persembahan pendopo: meja batu + sesaji (keranjang bunga) + lilin menyala. */
EMIT.a_altar = (g, b) => {
  const [x0, y0, z0] = b.min, [x1, y1, z1] = b.max, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  g.color(COL.andDark); g.box('stone', x0, y0, z0, x1, y0 + 0.3, z1);
  g.color(COL.and); g.box('stone', x0 + 0.15, y0 + 0.3, z0 + 0.15, x1 - 0.15, y1 - 0.5, z1 - 0.15);
  g.color(COL.andLight); g.box('stone', x0, y1 - 0.5, z0, x1, y1 - 0.3, z1);
  g.color(0xc8a464); g.box('weave', cx - 0.5, y1 - 0.3, cz - 0.5, cx + 0.5, y1 - 0.12, cz + 0.5);
  for (const [dx, dz, c] of [[-0.25, -0.2, 0xf4f0e8], [0.2, -0.22, 0xe9572c], [-0.18, 0.24, 0xf2c23a], [0.24, 0.2, 0xd8346a]] as const) {
    g.color(c); g.boxC('paint', cx + dx, y1 - 0.06, cz + dz, 0.22, 0.12, 0.22);
  }
  for (const s of [-1, 1]) {
    g.color(0xf2ead6); g.prismY('paint', cx + s * 0.75, z0 + 0.35, 0.05, y1 - 0.3, y1 - 0.1, 6);
    g.color(COL.flame, 1.8); g.boxC('glow', cx + s * 0.75, y1 - 0.05, z0 + 0.35, 0.05, 0.1, 0.05);
  }
};

/** Genta perunggu di rangka jati (balai genta). */
EMIT.a_bell = (g, b) => {
  const [x0, y0] = b.min, [x1, y1] = b.max, cx = (x0 + x1) / 2, cz = (b.min[2] + b.max[2]) / 2;
  g.color(COL.teakDark);
  for (const s of [-1, 1]) {
    g.box('wood', s < 0 ? x0 : x1 - 0.4, y0, cz - 0.25, s < 0 ? x0 + 0.4 : x1, y1 - 0.4, cz + 0.25, { grain: 1 });
    g.color(COL.andDark); g.box('stone', s < 0 ? x0 : x1 - 0.5, y0, cz - 0.35, s < 0 ? x0 + 0.5 : x1, y0 + 0.4, cz + 0.35); g.color(COL.teakDark);
  }
  g.box('wood', x0, y1 - 0.5, cz - 0.3, x1, y1, cz + 0.3);
  g.color(COL.gold); g.box('gold', x0 + 0.4, y1 - 0.55, cz - 0.32, x1 - 0.4, y1 - 0.5, cz + 0.32);
  // genta: lathe
  const prof: [number, number][] = [[1.25, 1.18], [1.5, 1.12], [2.2, 0.98], [3.4, 0.9], [4.3, 0.86], [4.65, 0.6], [4.8, 0.2]];
  g.color(COL.bronze); lathe(g, 'bronze', cx, cz, prof, 16, true);
  g.color(COL.bronze, 0.6); g.box('bronze', cx - 0.08, 4.8, cz - 0.08, cx + 0.08, y1 - 0.5, cz + 0.08);
};

/** Pilar batu rebah (berukir) sepanjang Z + kepala pilar patah. */
EMIT.a_pillar = (g, b) => {
  const [x0, y0, z0] = b.min, [x1, y1, z1] = b.max, cx = (x0 + x1) / 2, r = (x1 - x0) / 2;
  g.color(COL.andMoss);
  g.push(rotX90(cx, y0 + r, (z0 + z1) / 2));
  g.prismY('stone', 0, 0, r, -(z1 - z0) / 2 + 1.1, (z1 - z0) / 2, 10, { smooth: true, bottom: true });
  g.pop();
  g.color(COL.and); g.box('stone', x0, y0, z0, x1, y1, z0 + 1.1);
};

/** Transform: sumbu Y lokal → sumbu Z dunia, pusat (x, y, z). */
function rotX90(x: number, y: number, z: number) { return new THREE.Matrix4().makeRotationX(Math.PI / 2).setPosition(x, y, z); }

/** Bak tanaman batu + perdu kamboja kecil di atasnya (daun di atas collider). */
EMIT.a_planter = (g, b) => {
  const [x0, y0, z0] = b.min, [x1, y1, z1] = b.max;
  g.color(COL.andDark); g.box('stone', x0, y0, z0, x1, y1 - 0.3, z1);
  g.color(COL.andLight); g.box('stone', x0, y1 - 0.3, z0, x1, y1, z1);
  g.color(0x4a3a2a); g.box('paint', x0 + 0.25, y1 - 0.01, z0 + 0.25, x1 - 0.25, y1, z1 - 0.25);
};

/** Aling-aling: batu berelief (wihara) / sekat anyaman bambu berbingkai jati (dermaga). */
EMIT.a_aling = (g, b) => {
  const [x0, y0, z0] = b.min, [x1, y1, z1] = b.max, alongZ = z1 - z0 > x1 - x0;
  if (b.id.startsWith('RS_')) {
    g.color(COL.andDark); g.box('stone', x0, y0, z0, x1, y0 + 0.4, z1);
    g.color(COL.bamboo); g.box('weave', x0 + 0.08, y0 + 0.4, z0 + 0.08, x1 - 0.08, y1 - 0.3, z1 - 0.08, { sub: 2 });
    g.color(COL.teakDark); g.box('wood', x0, y1 - 0.3, z0, x1, y1, z1);
    const L = alongZ ? z1 - z0 : x1 - x0;
    for (let s = 0; s <= L + 0.01; s += L / Math.max(1, Math.round(L / 3))) {
      if (alongZ) g.box('wood', x0, y0 + 0.4, Math.min(z1 - 0.2, z0 + s), x1, y1 - 0.3, Math.min(z1, z0 + s + 0.2), { grain: 1 });
      else g.box('wood', Math.min(x1 - 0.2, x0 + s), y0 + 0.4, z0, Math.min(x1, x0 + s + 0.2), y1 - 0.3, z1, { grain: 1 });
    }
    return;
  }
  g.color(COL.andDark); g.box('stone', x0, y0, z0, x1, y0 + 0.6, z1);
  g.color(COL.and); g.box('stone', x0, y0 + 0.6, z0, x1, y1 - 0.5, z1, { sub: 3 });
  g.color(COL.andLight); g.box('stone', x0, y1 - 0.5, z0, x1, y1, z1);
  if (alongZ) reliefPanels(g, x0, x1, z0, z1, y0 + 1.2, y1 - 1.0, 0.6, 'we');
  else reliefPanels(g, x0, x1, z0, z1, y0 + 1.2, y1 - 1.0, 0.6, 'ns');
};

/** Tungku dupa perunggu di atas umpak batu (asap: partikel di build.ts). */
EMIT.a_urn = (g, b) => {
  const [x0, y0, z0] = b.min, [x1, , z1] = b.max, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, w = x1 - x0;
  g.color(COL.andDark); g.box('stone', x0, y0, z0, x1, y0 + 0.9, z1);
  g.color(COL.bronze);
  lathe(g, 'bronze', cx, cz, [[0.9, w * 0.22], [1.05, w * 0.42], [1.6, w * 0.48], [2.0, w * 0.4], [2.15, w * 0.44], [2.2, w * 0.3]], 12, true);
  g.color(0x5a4a3a); g.disc('paint', cx, 2.18, cz, w * 0.3, 12, 1);
  g.color(0xff8040, 1.4); g.boxC('glow', cx, 2.22, cz, 0.3, 0.06, 0.3);
};

// ───────────────────────── lathe & hull
/** Permukaan putar (genta, umpak bulat): profil [y, r] dari bawah ke atas, `seg` segi, normal halus; cap = tutup atas. */
export function lathe(g: Geo, k: K, cx: number, cz: number, prof: readonly (readonly [number, number])[], seg: number, cap = false, uvU = 1) {
  const n = prof.length;
  g.grid(k, seg, n - 1, (s, t) => {
    const a = s * Math.PI * 2, f = t * (n - 1), i = Math.min(n - 2, Math.floor(f)), u = f - i;
    const y = prof[i][0] + (prof[i + 1][0] - prof[i][0]) * u, r = prof[i][1] + (prof[i + 1][1] - prof[i][1]) * u;
    return [cx + Math.cos(a) * r, y, cz + Math.sin(a) * r];
  }, (s, t) => [s * uvU, t], undefined, true);
  if (cap) g.disc(k, cx, prof[n - 1][0], cz, prof[n - 1][1], seg, 1);
}

/** Genta stupa (profil = collider hull, segi BELL_SEG): induk andesit polos + sabuk; kecil = kisi wajik. */
function bell(g: Geo, cx: number, cz: number, prof: BellProfile, small: boolean) {
  g.color(small ? COL.andLight : COL.and);
  // fase segi sama dengan bellPts (sudut 0 di +X) → permukaan visual = collider
  lathe(g, small ? 'lattice' : 'stone', cx, cz, prof, BELL_SEG, true, small ? 8 : 6);
  if (!small) { g.color(COL.andLight); g.prismY('stone', cx, cz, prof[1][1] + 0.01, prof[1][0] - 0.18, prof[1][0] + 0.12, BELL_SEG, { smooth: true }); }
}

/** Atap pelana genteng (rumah desa): 2 lereng + tutup pelana kayu + bubungan. pts = gablePts (6 titik). */
function gableRoof(g: Geo, pts: number[]) {
  const P = (i: number): V3 => [pts[i * 3], pts[i * 3 + 1], pts[i * 3 + 2]];
  const [a, b, c, d, r0, r1] = [P(0), P(1), P(2), P(3), P(4), P(5)];   // a(x0,z0) b(x1,z0) c(x0,z1) d(x1,z1) r0(z0) r1(z1)
  g.color(COL.tile);
  const L = Math.hypot(r0[0] - a[0], r0[1] - a[1]), Z = c[2] - a[2];
  g.quad('tile', c, a, r0, r1, [0, 0, Z, 0, Z, L, 0, L]);
  g.quad('tile', b, d, r1, r0, [0, 0, Z, 0, Z, L, 0, L]);
  g.color(COL.plasterDirt);
  g.tri('plaster', a, b, r0); g.tri('plaster', d, c, r1);
  g.color(COL.tile, 0.8);
  g.box('tile', r0[0] - 0.25, r0[1] - 0.15, r0[2], r0[0] + 0.25, r0[1] + 0.05, r1[2]);
  g.color(COL.teakDark);
  g.box('wood', a[0], a[1] - 0.3, a[2], c[0] + 0.25, a[1], c[2]);
  g.box('wood', b[0] - 0.25, b[1] - 0.3, b[2], d[0], b[1], d[2]);
}

/** Limas terpancung (rok / brunjung joglo): 4 lereng genteng + tutup atas; mahkota (mustaka) bila puncak runcing. */
function frustumRoof(g: Geo, pts: number[], top: boolean) {
  const P = (i: number): V3 => [pts[i * 3], pts[i * 3 + 1], pts[i * 3 + 2]];
  const [b0, b1, b2, b3, t0, t1, t2, t3] = [P(0), P(1), P(2), P(3), P(4), P(5), P(6), P(7)];
  g.color(COL.tile);
  const slope = (p0: V3, p1: V3, p2: V3, p3: V3) => {
    const W = Math.hypot(p1[0] - p0[0], p1[2] - p0[2]), H = Math.hypot((p3[0] + p2[0]) / 2 - (p0[0] + p1[0]) / 2, p3[1] - p0[1], (p3[2] + p2[2]) / 2 - (p0[2] + p1[2]) / 2);
    g.quad('tile', p0, p1, p2, p3, [0, 0, W, 0, W, H, 0, H]);
  };
  slope(b1, b0, t0, t1);       // −Z
  slope(b2, b3, t3, t2);       // +Z
  slope(b0, b2, t2, t0);       // −X
  slope(b3, b1, t1, t3);       // +X
  g.quad('tile', t0, t2, t3, t1);
  g.color(COL.tile, 0.75);
  // jurai (bubungan miring) di 4 sudut
  for (const [p, q] of [[b0, t0], [b1, t1], [b2, t2], [b3, t3]] as const) {
    const mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2, mz = (p[2] + q[2]) / 2;
    g.boxC('tile', mx, my + 0.05, mz, 0.22, 0.12, 0.22);
  }
  if (top) {
    const cx = (t0[0] + t3[0]) / 2, cz = (t0[2] + t3[2]) / 2, y = t0[1];
    g.color(COL.tile, 0.7); g.box('tile', t0[0], y, t0[2] + 0.2, t3[0], y + 0.2, t3[2] - 0.2);
    g.color(COL.gold); ratna(g, 'gold', cx, y + 0.18, cz, 0.6, 1.1);
  }
}

export function emitHull(g: Geo, h: ArHull) {
  if (h.id === 'A_STUPA_BELL') { bell(g, -42, -43, STUPA_BELL, false); return; }
  if (h.id.endsWith('_BELL')) {
    let cx = 0, cz = 0;
    const n = h.pts.length / 3;
    for (let i = 0; i < n; i++) { cx += h.pts[i * 3]; cz += h.pts[i * 3 + 2]; }
    bell(g, cx / n, cz / n, SMALL_BELL, true);
    return;
  }
  if (h.id.endsWith('_ROOF')) { gableRoof(g, h.pts); return; }
  if (h.id.endsWith('_SKIRT')) { frustumRoof(g, h.pts, false); return; }
  if (h.id.endsWith('_PEAK')) frustumRoof(g, h.pts, true);
}

/** Stupa induk: lapik bertingkat (lis teratai), harmika, yasti + payung (chattra) — di dalam balok collider masing-masing. */
EMIT.a_stupa = (g, b) => {
  const [x0, y0, z0] = b.min, [x1, y1, z1] = b.max, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, w = x1 - x0;
  if (b.id === 'A_STUPA_1') {
    g.color(COL.andDark); g.box('stone', x0, y0, z0, x1, y0 + 0.6, z1);
    g.color(COL.and); g.box('stone', x0 + 0.3, y0 + 0.6, z0 + 0.3, x1 - 0.3, y0 + 1.5, z1 - 0.3);
    g.color(COL.andLight); g.box('stone', x0 + 0.15, y0 + 1.5, z0 + 0.15, x1 - 0.15, y1, z1 - 0.15);
    reliefPanels(g, x0 + 0.3, x1 - 0.3, z0 + 0.3, z1 - 0.3, y0 + 0.65, y0 + 1.45, 0.2);
    return;
  }
  if (b.id === 'A_STUPA_2') {                                       // harmika
    g.color(COL.andLight); g.box('stone', x0, y0, z0, x1, y1, z1);
    g.color(COL.and); g.box('stone', x0 - 0.0, y0 + 0.3, z0, x1, y0 + 0.7, z1);
    return;
  }
  g.color(COL.and);                                                 // yasti + chattra (payung bertumpuk) di dalam 0.8 u
  g.prismY('stone', cx, cz, w * 0.35, y0, y1 - 0.4, 8, { rTop: w * 0.18 });
  for (let i = 0; i < 3; i++) { const y = y0 + 0.6 + i * 1.0; g.color(COL.andLight); g.prismY('stone', cx, cz, w * 0.5 - i * 0.06, y, y + 0.18, 8); }
  g.color(COL.gold); ratna(g, 'gold', cx, y1 - 0.4, cz, w * 0.5, 0.4);
};
/** Lapik stupa kecil 3 × 3 (genta = hull kisi). */
EMIT.a_stupaS = (g, b) => {
  const [x0, y0, z0] = b.min, [x1, y1, z1] = b.max;
  g.color(COL.andDark); g.box('stone', x0, y0, z0, x1, y0 + 0.4, z1);
  g.color(COL.and); g.box('stone', x0 + 0.1, y0 + 0.4, z0 + 0.1, x1 - 0.1, y1, z1 - 0.1);
};

/** Reruntuhan: tembok batu lumutan, tepi atas gompal sedikit (di dalam tapak). */
EMIT.a_ruin = (g, b) => {
  const [x0, y0, z0] = b.min, [x1, y1, z1] = b.max, rng = makeRng(hashStr(b.id));
  g.color(COL.andMoss); g.box('stone', x0, y0, z0, x1, y1 - 0.35, z1, { sub: 2 });
  const alongZ = z1 - z0 > x1 - x0, L = alongZ ? z1 - z0 : x1 - x0, n = Math.max(2, Math.round(L / 1.1));
  for (let i = 0; i < n; i++) {
    const a = (alongZ ? z0 : x0) + (i / n) * L, c = a + L / n, hh = y1 - 0.35 * rng();
    g.color(i % 2 ? COL.andMoss : COL.andDark);
    if (alongZ) g.box('stone', x0, y1 - 0.35, a, x1, hh, c); else g.box('stone', a, y1 - 0.35, z0, c, hh, z1);
  }
};
EMIT.a_ruinT = (g, b) => {
  const [x0, y0, z0] = b.min, [x1, y1, z1] = b.max;
  g.color(COL.andMoss); g.box('stone', x0, y0, z0, x1, y1 - 0.4, z1, { sub: 2 });
  g.color(COL.and); g.box('stone', x0, y1 - 0.4, z0, x1, y1, z1);
  if (b.id.endsWith('_1')) reliefPanels(g, x0, x1, z0, z1, y0 + 1.6, y0 + 2.8, 0.6, b.min[0] < -50 ? 'nse' : 'nsw');
};

/** Batu besar: 2–3 blok bersudut terpotong (chamfer) menyatu di dalam tapak. */
EMIT.a_rock = (g, b) => {
  const [x0, y0, z0] = b.min, [x1, y1, z1] = b.max, rng = makeRng(hashStr(b.id));
  g.color(0xa39c90);
  chamferBox(g, 'rock', x0, y0, z0, x1, y1 - (y1 - y0) * 0.25, z1, 0.45);
  g.color(0x9a948a);
  const ix = (x1 - x0) * (0.12 + rng() * 0.12), iz = (z1 - z0) * (0.12 + rng() * 0.12);
  chamferBox(g, 'rock', x0 + ix, y1 - (y1 - y0) * 0.3, z0 + iz, x1 - ix * 0.6, y1, z1 - iz * 0.8, 0.35);
};
function chamferBox(g: Geo, k: K, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, c: number) {
  const cc = Math.min(c, (x1 - x0) / 3, (z1 - z0) / 3, (y1 - y0) / 3);
  // badan oktagonal (sudut tegak terpotong) + tepi atas miring
  const ring = (y: number, ins: number): V3[] => [
    [x0 + cc + ins, y, z0 + ins], [x1 - cc - ins, y, z0 + ins], [x1 - ins, y, z0 + cc + ins], [x1 - ins, y, z1 - cc - ins],
    [x1 - cc - ins, y, z1 - ins], [x0 + cc + ins, y, z1 - ins], [x0 + ins, y, z1 - cc - ins], [x0 + ins, y, z0 + cc + ins]];
  const A = ring(y0, 0), B = ring(y1 - cc, 0), C = ring(y1, cc);
  for (let i = 0; i < 8; i++) {
    const j = (i + 1) % 8;
    g.quad(k, A[j], A[i], B[i], B[j]);
    g.quad(k, B[j], B[i], C[i], C[j]);
  }
  g.fan(k, y1, C.map(p => [p[0], p[2]] as [number, number]), 1);
}

/** Atap gua: lempeng batu kasar + stalaktit di bawah + tepi bergerigi. */
EMIT.a_cave = (g, b) => {
  const [x0, y0, z0] = b.min, [x1, y1, z1] = b.max, rng = makeRng(hashStr(b.id));
  g.color(0x8f897e); g.box('rock', x0, y0, z0, x1, y1, z1, { sub: 3 });
  g.color(0x857f74);
  const n = Math.round((x1 - x0) * (z1 - z0) / 26);
  for (let i = 0; i < n; i++) {
    const x = x0 + 1 + rng() * (x1 - x0 - 2), z = z0 + 1 + rng() * (z1 - z0 - 2), r = 0.18 + rng() * 0.32, L = 0.4 + rng() * 1.1;
    g.prismY('rock', x, z, r * 0.12, y0 - L, y0 + 0.01, 6, { rTop: r, top: false });
  }
};

/** Dispatcher: gambar satu balok menurut gayanya (gaya tak dikenal → balok andesit polos). */
export function emitBox(g: Geo, b: Box) {
  if (b.style === 'hidden' || b.style === 'a_ground' || b.style === 'a_cliff' || b.style === 'a_embank' || b.style === 'a_trunk') return;
  const f = EMIT[b.style];
  if (f) { f(g, b); return; }
  g.color(COL.and); g.box('stone', b.min[0], b.min[1], b.min[2], b.max[0], b.max[1], b.max[2]);
}

/** Tangga batu berundak di atas ramp (collider = ramp licin; anak tangga visual). Sisi = blok andesit penuh. */
export function emitStairs(g: Geo) {
  for (const s of AR_STAIRS) {
    const f = stairFrame(s), rise = f.y1 - f.y0, steps = Math.max(2, Math.round(rise / 0.3));
    const along = f.top - f.foot, run = along / steps;
    for (let i = 0; i < steps; i++) {
      const a = f.foot + run * i, c = a + run, yTop = f.y0 + rise * (i + 1) / steps;
      g.color(i % 2 ? COL.and : COL.andLight);
      if (f.axis === 'z') g.box('stone', f.x[0], f.y0, Math.min(a, c), f.x[1], yTop, Math.max(a, c), { skip: { ny: true } });
      else g.box('stone', Math.min(a, c), f.y0, f.z[0], Math.max(a, c), yTop, f.z[1], { skip: { ny: true } });
    }
  }
}

/** Semua bangunan & hull. */
export function emitArchitecture(g: Geo, boxes: readonly Box[]) {
  for (const b of boxes) emitBox(g, b);
  for (const h of AR_HULLS) emitHull(g, h);
  emitStairs(g);
}
