// src/world/maps/boston/visual/emit.ts — geometri visual Boston (koordinat DUNIA game, ke bucket Geo per material). Semua benda
// dibangun dari balok denah (BOS_BOXES: gaya 'o_*' menentukan rupa) + tangga + dekorasi tanpa collider (lampu plafon, cincin
// tanaman gantung, teralis & krey bambu Veranda, taman vertikal, papan nama, fasad luar, latar kota). Rupa mengikuti tapak collider
// (meja/konter/TV/sofa berbadan padat — tidak ada "dinding tak terlihat" di kolong). Dipanggil saat membangun map (alokasi bebas).
import * as THREE from 'three';
import { stairFrame, type Box } from '../../../MapData';
import { Geo, hashStr, type BoxOpts, type V3 } from '../../steelyard/visual/geo';
import { makeRng } from '../../../../core/Rng';
import { BOS_LAMPS, BOS_PLANT_RINGS, BOS_SLOPED_RAILS, BOS_STAIRS } from '../layout';
import type { BosMat } from './materials';

// ───────────────────────── palet (hex sRGB)
const C = {
  plaster: 0xddd5c7, white: 0xf2efea, ceil: 0xeeeae2, facade: 0xcfc6b6, conc: 0xb9b4ab,
  black: 0x26292e, alu: 0xb9bec4, steelG: 0x8d939a, fridge: 0xe8e8e4, darkGlass: 0x2a3440,
  woodWarm: 0xb07a4e, woodDark: 0x6e4a32, woodLight: 0xe2c9a6, cardboard: 0xc49a66,
  crateB: 0x2a5c99, crateR: 0xa83832, blue: 0x2f6fb0, red: 0xb03a2e,
  sofaO: 0xd97343, sofaY: 0xd6b847, sofaG: 0x6e9b4b, part: 0x5d6b7a,
  leaf1: 0x3b6e38, leaf2: 0x528c43, leaf3: 0x6f9e4c, soil: 0x3b2a1e,
  frost: 0xbfd6e0, clear: 0xd8ecf4, lamp: 0xfff2d6, screen: 0x5f93c4,
} as const;

type K = BosMat;
const SUB: BoxOpts = { sub: 2 };

/** Balok dunia dengan warna. */
function bx(g: Geo, key: K, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, col: number, o: BoxOpts = {}, mul = 1) {
  if (x1 - x0 < 1e-4 || y1 - y0 < 1e-4 || z1 - z0 < 1e-4) return;
  g.color(col, mul);
  g.box(key, x0, y0, z0, x1, y1, z1, o);
}

/** Tapak balok dalam sistem (L = sumbu panjang, T = sumbu tebal) → pemancar balok di ruang (l, y, t). */
function frameOf(b: Box) {
  const alongX = b.max[0] - b.min[0] >= b.max[2] - b.min[2];
  const L0 = alongX ? b.min[0] : b.min[2], L1 = alongX ? b.max[0] : b.max[2];
  const T0 = alongX ? b.min[2] : b.min[0], T1 = alongX ? b.max[2] : b.max[0];
  const put = (g: Geo, key: K, l0: number, y0: number, t0: number, l1: number, y1: number, t1: number, col: number, o: BoxOpts = {}, mul = 1) =>
    alongX ? bx(g, key, l0, y0, t0, l1, y1, t1, col, o, mul) : bx(g, key, t0, y0, l0, t1, y1, l1, col, o, mul);
  return { alongX, L0, L1, T0, T1, put };
}

/** Balok miring dari a ke b (penampang w × h) — pegangan tangga, kabel. */
function beam(g: Geo, key: K, a: V3, b: V3, w: number, h: number, col: number) {
  const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), L = d.length();
  if (L < 1e-4) return;
  d.normalize();
  const up = Math.abs(d.y) > 0.95 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const side = new THREE.Vector3().crossVectors(d, up).normalize(), up2 = new THREE.Vector3().crossVectors(side, d).normalize();
  const m = new THREE.Matrix4().makeBasis(d, up2, side).setPosition((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
  g.push(m);
  bx(g, key, -L / 2, -h / 2, -w / 2, L / 2, h / 2, w / 2, col);
  g.pop();
}

// ───────────────────────── lantai & plafon
/** Wilayah lantai (game): L3 tegel motif di tengah aula; L4 Veranda motif, Ruang Kaca & Lorong Barat karpet, sisanya putih. */
function floorKey(x: number, z: number, y: number): K {
  if (y < 5) return Math.abs(x) <= 14 && Math.abs(z) <= 18 ? 'tileV' : 'tileW';
  if (x <= -10.2) return 'tileV';
  if (z > -17.6 && z < 18) return 'carpet';
  return 'tileW';
}
const FLOOR_BREAKS_X = [-14, 14, -10.2], FLOOR_BREAKS_Z = [-18, 18, -17.6];

/** Bidang mendatar persegi dipecah ≤ 2 u di batas wilayah; up = menghadap atas (lantai) / bawah (plafon). */
function flat(g: Geo, x0: number, x1: number, z0: number, z1: number, y: number, up: boolean, pick: (cx: number, cz: number) => [K, number]) {
  const brk = (a: number, b: number, extra: number[]) => {
    const s = new Set<number>([a, b]);
    for (const e of extra) if (e > a && e < b) s.add(e);
    for (let v = Math.ceil(a / 2) * 2; v < b; v += 2) if (v > a) s.add(v);
    return [...s].sort((p, q) => p - q);
  };
  const xs = brk(x0, x1, FLOOR_BREAKS_X), zs = brk(z0, z1, FLOOR_BREAKS_Z);
  for (let i = 0; i + 1 < xs.length; i++) for (let k = 0; k + 1 < zs.length; k++) {
    const a = xs[i], b = xs[i + 1], c = zs[k], d = zs[k + 1];
    const [key, col] = pick((a + b) / 2, (c + d) / 2);
    g.color(col);
    if (up) g.quad(key, [a, y, d], [b, y, d], [b, y, c], [a, y, c], [a, d, b, d, b, c, a, c], 1, 1, [0, 1, 0]);
    else g.quad(key, [a, y, c], [b, y, c], [b, y, d], [a, y, d], [a, c, b, c, b, d, a, d], 1, 1, [0, -1, 0]);
  }
}

// ───────────────────────── kaca & pagar
/** Dinding kaca berbingkai hitam: frosted bawah (privasi) + bening atas, kusen keliling, tiang tengah tiap ±2.6 u. */
function glassWall(g: Geo, b: Box, frostTop: number) {
  const { L0, L1, T0, T1, put } = frameOf(b), y0 = b.min[1], y1 = b.max[1], f = 0.12, tm = (T0 + T1) / 2;
  const split = Math.min(y1 - f, y0 + frostTop);
  put(g, 'glassF', L0 + f / 2, y0 + f, tm - 0.04, L1 - f / 2, split, tm + 0.04, C.frost);
  if (split < y1 - f - 0.05) put(g, 'glassC', L0 + f / 2, split, tm - 0.03, L1 - f / 2, y1 - f, tm + 0.03, C.clear);
  put(g, 'metal', L0, y0, T0, L1, y0 + f, T1, C.black);
  put(g, 'metal', L0, y1 - f, T0, L1, y1, T1, C.black);
  put(g, 'metal', L0, split - 0.05, T0 + 0.08, L1, split + 0.05, T1 - 0.08, C.black);
  const n = Math.max(1, Math.round((L1 - L0) / 2.6));
  for (let i = 0; i <= n; i++) {
    const l = L0 + (L1 - L0) * i / n, a = Math.max(L0, l - f / 2), c = Math.min(L1, l + f / 2);
    put(g, 'metal', a, y0, T0, c, y1, T1, C.black);
  }
}

/** Pagar: 'glass' = balustrade kaca (tiang + pegangan) — konsisten dengan collider padat; 'iron' = jeruji besi hitam. */
function railing(g: Geo, b: Box, kind: 'glass' | 'iron') {
  const { L0, L1, T0, T1, put } = frameOf(b), y0 = b.min[1], y1 = b.max[1], tm = (T0 + T1) / 2;
  put(g, 'metal', L0, y1 - 0.1, T0, L1, y1, T1, C.black);                       // pegangan atas
  const posts = Math.max(1, Math.round((L1 - L0) / (kind === 'glass' ? 2 : 2.5)));
  for (let i = 0; i <= posts; i++) {
    const l = L0 + (L1 - L0) * i / posts;
    put(g, 'metal', Math.max(L0, l - 0.06), y0, tm - 0.07, Math.min(L1, l + 0.06), y1, tm + 0.07, C.black);
  }
  if (kind === 'glass') { put(g, 'glassC', L0, y0 + 0.08, tm - 0.025, L1, y1 - 0.1, tm + 0.025, C.clear); return; }
  put(g, 'metal', L0, y0 + 0.05, tm - 0.05, L1, y0 + 0.15, tm + 0.05, C.black);   // ambang bawah
  for (let l = L0 + 0.3; l < L1 - 0.1; l += 0.32) put(g, 'metal', l - 0.025, y0 + 0.15, tm - 0.025, l + 0.025, y1 - 0.1, tm + 0.025, C.black);
}

// ───────────────────────── perabot
function plantCluster(g: Geo, x0: number, z0: number, x1: number, z1: number, y: number, h: number, seed: number) {
  const r = makeRng(seed), n = Math.max(3, Math.round((x1 - x0) * (z1 - z0) * 1.6));
  for (let i = 0; i < n; i++) {
    const s = 0.28 + r() * 0.35, x = x0 + s / 2 + r() * Math.max(0, x1 - x0 - s), z = z0 + s / 2 + r() * Math.max(0, z1 - z0 - s);
    const yy = y + r() * h, col = [C.leaf1, C.leaf2, C.leaf3][Math.floor(r() * 3)];
    g.pushAt(x, yy, z, r() * Math.PI);
    bx(g, 'plant', -s / 2, 0, -s / 2, s / 2, s * (0.8 + r() * 0.6), s / 2, col, {}, 0.85 + r() * 0.3);
    g.pop();
  }
}

function planter(g: Geo, b: Box) {
  const [x0, y0, z0] = b.min, [x1, y1, z1] = b.max;
  bx(g, 'wood', x0, y0, z0, x1, y1, z1, C.woodDark, { skip: { ny: true, py: true } });
  bx(g, 'wood', x0, y1 - 0.12, z0, x1, y1, z0 + 0.12, C.woodDark); bx(g, 'wood', x0, y1 - 0.12, z1 - 0.12, x1, y1, z1, C.woodDark);
  bx(g, 'wood', x0, y1 - 0.12, z0, x0 + 0.12, y1, z1, C.woodDark); bx(g, 'wood', x1 - 0.12, y1 - 0.12, z0, x1, y1, z1, C.woodDark);
  bx(g, 'plaster', x0 + 0.12, y1 - 0.25, z0 + 0.12, x1 - 0.12, y1 - 0.2, z1 - 0.12, C.soil, { skip: { ny: true } });
  const tall = y1 - y0 > 3;                                       // dinding tanaman (taman vertikal) setinggi 4.0
  plantCluster(g, x0 + 0.1, z0 + 0.1, x1 - 0.1, z1 - 0.1, y1 - 0.2, tall ? 0.6 : 1.1, hashStr(b.id));
  if (tall) {                                                     // daun di kedua muka panjang
    const { L0, L1, T0, T1, alongX } = frameOf(b), r = makeRng(hashStr(b.id) + 7);
    for (const tFace of [T0 - 0.12, T1 + 0.02]) for (let l = L0 + 0.2; l < L1 - 0.2; l += 0.45) for (let y = y0 + 0.4; y < y1 - 0.3; y += 0.45) {
      if (r() < 0.25) continue;
      const s = 0.3 + r() * 0.15, col = [C.leaf1, C.leaf2, C.leaf3][Math.floor(r() * 3)];
      if (alongX) bx(g, 'plant', l, y, tFace, l + s, y + s, tFace + 0.1, col);
      else bx(g, 'plant', tFace, y, l, tFace + 0.1, y + s, l + s, col);
    }
  }
}

function desk(g: Geo, b: Box, monitors: boolean) {
  const [x0, y0, z0] = b.min, [x1, y1, z1] = b.max;
  bx(g, 'metal', x0 + 0.06, y0, z0 + 0.06, x1 - 0.06, y1 - 0.12, z1 - 0.06, 0xc9cdd2, { skip: { ny: true } });
  bx(g, 'wood', x0, y1 - 0.12, z0, x1, y1, z1, C.woodLight, { skip: { ny: true } });
  if (!monitors) return;
  const { L0, L1, T0, T1, alongX } = frameOf(b), tm = (T0 + T1) / 2, n = Math.max(1, Math.floor((L1 - L0) / 2));
  const r = makeRng(hashStr(b.id));
  for (let i = 0; i < n; i++) for (const side of [-1, 1]) {
    if (r() < 0.2) continue;
    const l = L0 + (L1 - L0) * (i + 0.5) / n, t = tm + side * (T1 - T0) * 0.12, face = side;
    const put = (a: number, ya: number, ta: number, c: number, yb: number, tb: number, k: K, col: number, mul = 1) =>
      alongX ? bx(g, k, a, ya, Math.min(ta, tb), c, yb, Math.max(ta, tb), col, {}, mul) : bx(g, k, Math.min(ta, tb), ya, a, Math.max(ta, tb), yb, c, col, {}, mul);
    put(l - 0.06, y1, t - 0.06, l + 0.06, y1 + 0.35, t + 0.06, 'metal', C.black);                          // kaki monitor
    put(l - 0.55, y1 + 0.3, t - 0.04, l + 0.55, y1 + 0.95, t + 0.04, 'metal', C.black);                    // bingkai
    put(l - 0.5, y1 + 0.34, t + face * 0.045, l + 0.5, y1 + 0.91, t + face * 0.05, 'glow', C.screen, 0.55); // layar
    put(l - 0.4, y1, t + face * 0.5, l + 0.4, y1 + 0.05, t + face * 0.75, 'metal', 0x3a3d42);              // papan ketik
  }
}

function cabinet(g: Geo, b: Box, col: number, key: K = 'metal') {
  const [x0, y0, z0] = b.min, [x1, y1, z1] = b.max;
  bx(g, key, x0, y0, z0, x1, y1, z1, col, { skip: { ny: true }, sub: 2 });
  const { L0, L1, T0, T1, put } = frameOf(b), h = y1 - y0, rows = Math.max(1, Math.round(h / 1.15));
  for (let i = 1; i < rows; i++) {
    const y = y0 + h * i / rows;
    put(g, 'metal', L0 + 0.05, y - 0.03, T0 - 0.02, L1 - 0.05, y + 0.03, T0, 0x2e3136);
    put(g, 'metal', L0 + 0.05, y - 0.03, T1, L1 - 0.05, y + 0.03, T1 + 0.02, 0x2e3136);
  }
  const cols = Math.max(1, Math.round((L1 - L0) / 1.2));
  for (let c = 1; c < cols; c++) {
    const l = L0 + (L1 - L0) * c / cols;
    put(g, 'metal', l - 0.02, y0 + 0.1, T0 - 0.02, l + 0.02, y1 - 0.1, T0, 0x2e3136);
    put(g, 'metal', l - 0.02, y0 + 0.1, T1, l + 0.02, y1 - 0.1, T1 + 0.02, 0x2e3136);
  }
}

function crates(g: Geo, b: Box, col: number) {
  const { L0, L1, T0, T1, put } = frameOf(b), y0 = b.min[1], y1 = b.max[1];
  const n = Math.max(1, Math.round((L1 - L0) / 1.6)), tiers = Math.max(1, Math.round((y1 - y0) / 1.85)), r = makeRng(hashStr(b.id));
  const edge = 0x3d2a1c;
  for (let i = 0; i < n; i++) for (let k = 0; k < tiers; k++) {
    const l0 = L0 + (L1 - L0) * i / n, l1 = L0 + (L1 - L0) * (i + 1) / n, ya = y0 + (y1 - y0) * k / tiers, yb = y0 + (y1 - y0) * (k + 1) / tiers;
    const shade = 0.82 + r() * 0.3, ins = 0.02;
    put(g, 'wood', l0 + ins, ya, T0 + ins, l1 - ins, yb - 0.01, T1 - ins, col, {}, shade);
    // rangka tepi (papan lebih gelap) + palang silang di muka panjang
    for (const t of [T0, T1 - 0.06]) {
      put(g, 'wood', l0, ya, t, l0 + 0.14, yb, t + 0.06, edge); put(g, 'wood', l1 - 0.14, ya, t, l1, yb, t + 0.06, edge);
      put(g, 'wood', l0, ya, t, l1, ya + 0.14, t + 0.06, edge); put(g, 'wood', l0, yb - 0.15, t, l1, yb - 0.01, t + 0.06, edge);
    }
    put(g, 'plaster', (l0 + l1) / 2 - 0.35, (ya + yb) / 2 - 0.12, T0 - 0.01, (l0 + l1) / 2 + 0.35, (ya + yb) / 2 + 0.12, T0, 0xf2efe6);
    put(g, 'plaster', (l0 + l1) / 2 - 0.35, (ya + yb) / 2 - 0.12, T1, (l0 + l1) / 2 + 0.35, (ya + yb) / 2 + 0.12, T1 + 0.01, 0xf2efe6);
  }
}

/** Sofa booth: dua bangku berhadapan (sandaran di kedua ujung) + meja di tengah, semuanya di dalam tapak 2.4 u. */
function sofa(g: Geo, b: Box, col: number) {
  const { L0, L1, T0, T1, put } = frameOf(b), y0 = b.min[1], y1 = b.max[1];
  // sumbu panjang = arah berhadapan; sandaran di L0 & L1
  put(g, 'fabric', L0, y0, T0, L0 + 0.7, y1, T1, col, { sub: 2 }, 0.9);
  put(g, 'fabric', L1 - 0.7, y0, T0, L1, y1, T1, col, { sub: 2 }, 0.9);
  put(g, 'fabric', L0 + 0.7, y0, T0, L0 + 2.0, y0 + 1.25, T1, col);
  put(g, 'fabric', L1 - 2.0, y0, T0, L1 - 0.7, y0 + 1.25, T1, col);
  put(g, 'wood', L0 + 2.0, y0, T0 + 0.6, L1 - 2.0, y0 + 0.9, T1 - 0.6, C.woodDark);                   // kaki meja (panel)
  put(g, 'marble', L0 + 1.9, y0 + 0.9, T0 + 0.3, L1 - 1.9, y0 + 1.05, T1 - 0.3, 0xffffff);              // daun meja
  put(g, 'wood', L0 + 2.0, y0, T0, L1 - 2.0, y0 + 0.25, T1, C.woodDark);                                // alas
}

function counter(g: Geo, b: Box, base: number) {
  const [x0, y0, z0] = b.min, [x1, y1, z1] = b.max;
  bx(g, 'wood', x0 + 0.08, y0, z0 + 0.08, x1 - 0.08, y1 - 0.15, z1 - 0.08, base, { skip: { ny: true }, sub: 2 });
  bx(g, 'marble', x0, y1 - 0.15, z0, x1, y1, z1, 0xffffff, { skip: { ny: true } });
  bx(g, 'wood', x0 + 0.08, y0, z0 + 0.08, x1 - 0.08, y0 + 0.2, z1 - 0.08, C.woodDark);
}

function tvStand(g: Geo, b: Box) {
  const { L0, L1, T0, T1, put } = frameOf(b), y0 = b.min[1], y1 = b.max[1], tm = (T0 + T1) / 2;
  put(g, 'wood', L0, y0, T0, L1, y0 + 1.2, T1, C.woodDark, { skip: { ny: true } });                     // konsol media
  put(g, 'metal', L0 + 0.05, y0 + 1.2, T0 + 0.25, L1 - 0.05, y1, T1 - 0.25, C.black);                   // badan TV
  put(g, 'glow', L0 + 0.2, y0 + 1.4, T0 + 0.24, L1 - 0.2, y1 - 0.2, T0 + 0.25, C.screen, {}, 0.8);     // layar depan
  put(g, 'glow', L0 + 0.2, y0 + 1.4, T1 - 0.25, L1 - 0.2, y1 - 0.2, T1 - 0.24, C.screen, {}, 0.8);     // layar belakang
  put(g, 'metal', L0 - 0.02, y0 + 0.1, tm - 0.1, L0 + 0.3, y0 + 0.3, tm + 0.1, C.black);                // roda
  put(g, 'metal', L1 - 0.3, y0 + 0.1, tm - 0.1, L1 + 0.02, y0 + 0.3, tm + 0.1, C.black);
}

function partition(g: Geo, b: Box) {
  const { L0, L1, T0, T1, put } = frameOf(b), y0 = b.min[1], y1 = b.max[1];
  put(g, 'fabric', L0 + 0.08, y0 + 0.15, T0 + 0.02, L1 - 0.08, y1 - 0.1, T1 - 0.02, C.part, { sub: 2 });
  put(g, 'metal', L0, y1 - 0.1, T0, L1, y1, T1, C.alu);
  put(g, 'metal', L0, y0, T0, L0 + 0.08, y1, T1, C.alu); put(g, 'metal', L1 - 0.08, y0, T0, L1, y1, T1, C.alu);
  put(g, 'metal', L0, y0, T0, L1, y0 + 0.15, T1, C.alu);
}

function column(g: Geo, b: Box) {
  const [x0, y0, z0] = b.min, [x1, y1, z1] = b.max;
  bx(g, 'plaster', x0, y0, z0, x1, y1, z1, C.white, { skip: { ny: true, py: true }, sub: 2 });
  bx(g, 'marble', x0 - 0.08, y0, z0 - 0.08, x1 + 0.08, y0 + 0.4, z1 + 0.08, 0xd9d4cc, { skip: { ny: true } });
  bx(g, 'plaster', x0 - 0.08, y1 - 0.35, z0 - 0.08, x1 + 0.08, y1, z1 + 0.08, C.white, { skip: { py: true } });
}

function hBeam(g: Geo, b: Box) {
  const [x0, y0, z0] = b.min, [x1, y1, z1] = b.max, cz = (z0 + z1) / 2;
  bx(g, 'metal', x0, y0, z0, x0 + 0.14, y1, z1, C.black);
  bx(g, 'metal', x1 - 0.14, y0, z0, x1, y1, z1, C.black);
  bx(g, 'metal', x0 + 0.14, y0, cz - 0.06, x1 - 0.14, y1, cz + 0.06, C.black);
  bx(g, 'metal', x0 - 0.1, y0, z0 - 0.1, x1 + 0.1, y0 + 0.08, z1 + 0.1, C.black);
}

function lockerWall(g: Geo, b: Box) {
  const [x0, y0, z0] = b.min, [x1, y1, z1] = b.max, { alongX } = frameOf(b);
  bx(g, 'locker', x0, y0, z0, x1, y1, z1, C.plaster, { skip: alongX ? { ny: true, py: true, px: true, nx: true } : { ny: true, py: true, pz: true, nz: true } });
  bx(g, 'plaster', x0, y0, z0, x1, y1, z1, C.plaster, { skip: alongX ? { ny: true, pz: true, nz: true } : { ny: true, px: true, nx: true } });
}

// ───────────────────────── tangga
function stairs(g: Geo) {
  for (const s of BOS_STAIRS) {
    const f = stairFrame(s), brown = s.id !== 'SERV', n = Math.round((f.y1 - f.y0) / 0.5), dir = Math.sign(f.top - f.foot);
    const run = Math.abs(f.top - f.foot) / n, key: K = brown ? 'wood' : 'conc', col = brown ? C.woodWarm : C.conc;
    for (let i = 0; i < n; i++) {
      const a = f.foot + dir * run * i, b = f.foot + dir * run * (i + 1), lo = Math.min(a, b), hi = Math.max(a, b), y = f.y0 + 0.5 * (i + 1);
      const base = f.y0;
      if (f.axis === 'z') {
        bx(g, key, f.x[0], base, lo, f.x[1], y, hi, col, { skip: { ny: true } });
        const nz = dir > 0 ? lo : hi - 0.12;
        bx(g, 'metal', f.x[0] + 0.05, y - 0.03, nz, f.x[1] - 0.05, y + 0.005, nz + 0.12, brown ? C.woodDark : C.black);
      } else {
        bx(g, key, lo, base, f.z[0], hi, y, f.z[1], col, { skip: { ny: true } });
        const nx = dir > 0 ? lo : hi - 0.12;
        bx(g, 'metal', nx, y - 0.03, f.z[0] + 0.05, nx + 0.12, y + 0.005, f.z[1] - 0.05, brown ? C.woodDark : C.black);
      }
    }
    if (!brown) continue;
    // stringer baja hitam di sisi yang terbuka (sisi menempel dinding luar dilewati)
    const sides = f.axis === 'z' ? [f.x[0] - 0.05, f.x[1] + 0.05] : [f.z[0] - 0.05, f.z[1] + 0.05];
    for (const t of sides) {
      if (Math.abs(t) > 25.9) continue;
      const a: V3 = f.axis === 'z' ? [t, f.y0 + 0.05, f.foot] : [f.foot, f.y0 + 0.05, t];
      const b: V3 = f.axis === 'z' ? [t, f.y1 + 0.05, f.top] : [f.top, f.y1 + 0.05, t];
      beam(g, 'metal', a, b, 0.1, 0.55, C.black);
    }
  }
  // pegangan miring + tiang
  for (const r of BOS_SLOPED_RAILS) {
    beam(g, 'metal', r.a, r.b, 0.12, 0.1, C.black);
    const n = Math.max(2, Math.round(Math.hypot(r.b[0] - r.a[0], r.b[2] - r.a[2]) / 2));
    for (let i = 0; i <= n; i++) {
      const t = i / n, x = r.a[0] + (r.b[0] - r.a[0]) * t, y = r.a[1] + (r.b[1] - r.a[1]) * t, z = r.a[2] + (r.b[2] - r.a[2]) * t;
      bx(g, 'metal', x - 0.04, y - 1.2, z - 0.04, x + 0.04, y, z + 0.04, C.black);
    }
  }
}

// ───────────────────────── dekorasi tanpa collider
function lamps(g: Geo) {
  for (const [x, y, z, w, d] of BOS_LAMPS) {
    bx(g, 'metal', x - w / 2 - 0.08, y - 0.08, z - d / 2 - 0.08, x + w / 2 + 0.08, y, z + d / 2 + 0.08, C.alu, { skip: { py: true } });
    bx(g, 'glow', x - w / 2, y - 0.1, z - d / 2, x + w / 2, y - 0.07, z + d / 2, C.lamp, { skip: { py: true } }, 1.5);
  }
}

function plantRings(g: Geo) {
  for (const [cx, cy, cz, R] of BOS_PLANT_RINGS) {
    const r = makeRng(hashStr(`ring${cx}${cz}`)), segs = 12;
    for (let i = 0; i < segs; i++) {
      const a0 = i / segs * Math.PI * 2, a1 = (i + 1) / segs * Math.PI * 2;
      beam(g, 'wood', [cx + Math.cos(a0) * R, cy, cz + Math.sin(a0) * R], [cx + Math.cos(a1) * R, cy, cz + Math.sin(a1) * R], 0.35, 0.3, C.woodWarm);
    }
    for (let k = 0; k < 4; k++) {                                     // kabel gantung ke plafon
      const a = k * Math.PI / 2 + 0.4;
      beam(g, 'metal', [cx + Math.cos(a) * R, cy, cz + Math.sin(a) * R], [cx + Math.cos(a) * R * 0.9, 9.35, cz + Math.sin(a) * R * 0.9], 0.03, 0.03, C.black);
    }
    for (let i = 0; i < 100; i++) {                                   // daun (dokumen: 100 kubus per cincin) + sulur menjuntai
      const a = r() * Math.PI * 2, rr = R + (r() - 0.5) * 0.7, s = 0.22 + r() * 0.25;
      const x = cx + Math.cos(a) * rr, z = cz + Math.sin(a) * rr, y = cy - 0.25 + r() * 0.75;
      const col = [C.leaf1, C.leaf2, C.leaf3][Math.floor(r() * 3)];
      g.pushAt(x, y, z, r() * Math.PI);
      bx(g, 'plant', -s / 2, -s / 2, -s / 2, s / 2, s / 2, s / 2, col, {}, 0.85 + r() * 0.3);
      g.pop();
      if (i % 6 === 0) {
        const len = 0.6 + r() * 1.3;
        bx(g, 'plant', x - 0.05, y - len, z - 0.05, x + 0.05, y, z + 0.05, C.leaf1);
        bx(g, 'plant', x - 0.13, y - len - 0.12, z - 0.13, x + 0.13, y - len + 0.14, z + 0.13, C.leaf2);
      }
    }
  }
}

/** Teralis kayu + daun di atas Veranda, krey bambu bergulung (tanpa collider: peluru tembus — dokumen "penetrable"). */
function verandaEdge(g: Geo) {
  const X0 = -26, X1 = -25.7;
  bx(g, 'wood', X0, 16.2, -38, X1, 16.35, 38, C.woodWarm);
  bx(g, 'wood', X0, 17.85, -38, X1, 18, 38, C.woodWarm);
  for (let z = -38; z < 38; z += 0.8) bx(g, 'wood', X0 + 0.05, 16.35, z, X1 - 0.05, 17.85, z + 0.08, C.woodWarm);
  const r = makeRng(9091);
  for (let z = -37.5; z < 37.5; z += 0.55) {
    if (r() < 0.35) continue;
    const s = 0.25 + r() * 0.3, y = 16.2 + r() * 1.6, col = [C.leaf1, C.leaf2, C.leaf3][Math.floor(r() * 3)];
    bx(g, 'plant', X1 - 0.05, y, z, X1 + 0.2, y + s, z + s, col);
    if (r() < 0.3) { const len = 0.5 + r() * 1.4; bx(g, 'plant', X1 + 0.02, y - len, z + 0.05, X1 + 0.1, y, z + 0.13, C.leaf1); }
  }
  // krey per teluk di antara pilar (game z −36…16, dokumen z −16…36), turun bervariasi
  const bays: [number, number][] = [[-36, -34.4], [-33.6, -20.6], [-19.4, -5.4], [-4.6, 15.6]];
  for (const [z0, z1] of bays) {
    const bottom = 12.4 + r() * 1.6, x = -25.88;
    g.color(0xffffff);
    g.quad('bamboo', [x, bottom, z0], [x, bottom, z1], [x, 16.05, z1], [x, 16.05, z0], [z0, bottom, z1, bottom, z1, 16.05, z0, 16.05]);
    beam(g, 'wood', [x, 16.12, z0], [x, 16.12, z1], 0.16, 0.16, C.woodWarm);
  }
  // lampu sorot rel di plafon kayu Veranda
  for (let z = -34; z <= 34; z += 6) {
    bx(g, 'metal', -19.5, 17.85, z - 1.5, -19.3, 18, z + 1.5, C.black);
    for (const dz of [-1, 0, 1]) {
      bx(g, 'metal', -19.55, 17.45, z + dz - 0.12, -19.25, 17.85, z + dz + 0.12, C.black);
      bx(g, 'glow', -19.53, 17.43, z + dz - 0.1, -19.27, 17.46, z + dz + 0.1, C.lamp, {}, 2.5);
    }
  }
}

/** 5 × 7 piksel huruf papan nama. */
const FONT: Record<string, string[]> = {
  B: ['1110', '1001', '1001', '1110', '1001', '1001', '1110'], O: ['0110', '1001', '1001', '1001', '1001', '1001', '0110'],
  S: ['0111', '1000', '1000', '0110', '0001', '0001', '1110'], T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  N: ['1001', '1101', '1101', '1011', '1011', '1001', '1001'],
};
/** Papan nama "BOSTON" menyala di muka depan meja resepsionis (L3, menghadap aula). */
function sign(g: Geo, boxes: readonly Box[]) {
  const rc = boxes.find(b => b.id === 'RECEPTION');
  if (!rc) return;
  const z = rc.max[2] + 0.01, px = 0.16, word = 'BOSTON';
  let w = 0;
  for (const ch of word) w += (FONT[ch][0].length + 1) * px;
  let x = (rc.min[0] + rc.max[0]) / 2 - w / 2;                    // muka +Z: pembaca menghadap −Z (kanannya +X) → huruf ke +X
  for (const ch of word) {
    const rows = FONT[ch], cw = rows[0].length;
    for (let ry = 0; ry < 7; ry++) for (let cx = 0; cx < cw; cx++) if (rows[ry][cx] === '1') {
      const x0 = x + cx * px, y0 = 1.6 + (6 - ry) * px;
      bx(g, 'glow', x0, y0, z, x0 + px * 0.9, y0 + px * 0.9, z + 0.05, 0xffe2b0, {}, 1.8);
    }
    x += (cw + 1) * px;
  }
}

/** Aksen tim: pita warna di dinding dalam ruang spawn + panel lambang (cakram stud) di dinding ujung. */
function teamAccents(g: Geo) {
  // Spawn Biru (L4, game z −38…−17.6, x −10…18): pita di dinding Utara dokumen (game z −38) & Barat dokumen (game x 18)
  bx(g, 'plaster', -10, 11.6, -37.98, 18, 12.1, -37.94, C.blue);
  bx(g, 'plaster', 17.94, 11.6, -38, 17.98, 12.1, -18, C.blue);
  emblem(g, 4, 14.5, -37.93, 1, C.blue);
  // Spawn Merah (L3, game z 20…38, x −26…18): pita di dinding Selatan dokumen (game z 38)
  bx(g, 'plaster', -26, 1.6, 37.94, 18, 2.1, 37.98, C.red);
  emblem(g, -4, 5, 37.93, -1, C.red);
}
function emblem(g: Geo, x: number, y: number, z: number, face: 1 | -1, col: number) {
  bx(g, 'plaster', x - 2, y - 2, Math.min(z, z + face * 0.05), x + 2, y + 2, Math.max(z, z + face * 0.05), col, {}, 0.9);
  g.pushAt(x, y, z + face * 0.05, 0, face * Math.PI / 2);
  g.prismY('plaster', 0, 0, 1.2, 0, 0.12, 16, { smooth: true });
  g.color(0xf2efea);
  g.prismY('plaster', 0, 0, 0.6, 0.12, 0.3, 16, { smooth: true });
  g.pop();
}

/** Fasad luar sisi teras (dari Veranda terlihat saat menengok ke bawah): pita beton & jendela gelap 2 lantai di bawah L3. */
function facade(g: Geo) {
  for (const [y0, y1] of [[-18.8, -9.4], [-9.4, 0]] as const) {
    bx(g, 'plaster', -27.2, y0, -39, -27, y0 + 1.6, 39, C.facade, { sub: 4 });
    bx(g, 'metal', -27.1, y0 + 1.6, -39, -27, y1 - 0.6, 39, C.darkGlass);
    bx(g, 'plaster', -27.2, y1 - 0.6, -39, -27, y1, 39, C.facade, { sub: 4 });
    for (let z = -39; z <= 39; z += 3) bx(g, 'metal', -27.2, y0 + 1.6, z - 0.08, -27.05, y1 - 0.6, z + 0.08, C.black);
  }
  // kusen jendela tinggi L3 (tiang tiap 3 u) + gulungan krey di atas (dokumen: roller blind Y 7.2–9.4)
  for (let z = -38; z <= 38; z += 3) bx(g, 'metal', -26.65, 1.4, z - 0.07, -26.15, 9.4, z + 0.07, C.black);
  bx(g, 'metal', -26.65, 1.4, -38, -26.15, 1.5, 38, C.black);
  const r = makeRng(5150);
  for (let z = -38; z < 38; z += 6) {
    const drop = 7.2 + r() * 1.6 * (r() < 0.6 ? 1 : 0);
    bx(g, 'fabric', -26.12, Math.min(drop, 9.1), z + 0.1, -26.06, 9.3, z + 5.9, 0xe8dcc6);
    bx(g, 'wood', -26.14, 9.22, z + 0.05, -26.0, 9.38, z + 5.95, C.woodLight);
  }
}

/** Latar kota: silinder panorama (u = sudut) + lantai jalan di bawah. */
function backdrop(g: Geo) {
  const R = 200, y0 = -24, y1 = 120, n = 48;
  g.color(0xffffff);
  for (let i = 0; i < n; i++) {
    const a0 = i / n * Math.PI * 2, a1 = (i + 1) / n * Math.PI * 2;
    const p0: V3 = [Math.cos(a0) * R, y0, Math.sin(a0) * R], p1: V3 = [Math.cos(a1) * R, y0, Math.sin(a1) * R];
    const p2: V3 = [p1[0], y1, p1[2]], p3: V3 = [p0[0], y1, p0[2]];
    const u0 = 1 - i / n, u1 = 1 - (i + 1) / n;
    // muka menghadap ke dalam (pusat)
    g.quad('city', p0, p1, p2, p3, [u0, 0, u1, 0, u1, 1, u0, 1]);
  }
  // jalan & plaza di bawah (warna kabut cakrawala tekstur: v ≈ 0.01)
  for (let i = 0; i < n; i++) {
    const a0 = i / n * Math.PI * 2, a1 = (i + 1) / n * Math.PI * 2;
    g.tri('city', [0, y0, 0], [Math.cos(a1) * R, y0, Math.sin(a1) * R], [Math.cos(a0) * R, y0, Math.sin(a0) * R], [0.5, 0.01, 0.5, 0.01, 0.5, 0.01]);
  }
}

// ───────────────────────── perakit
/** Pancarkan semua geometri statis Boston ke `g` (bucket = BosMat). */
export function emitBoston(g: Geo, boxes: readonly Box[]) {
  for (const b of boxes) {
    const [x0, y0, z0] = b.min, [x1, y1, z1] = b.max;
    switch (b.style) {
      case 'o_ground':
        flat(g, x0, x1, z0, z1, y1, true, (cx, cz) => [floorKey(cx, cz, 0), 0xffffff]);
        break;
      case 'o_slab':
        flat(g, x0, x1, z0, z1, y1, true, (cx, cz) => [floorKey(cx, cz, 10), 0xffffff]);
        flat(g, x0, x1, z0, z1, y0, false, () => ['plaster', C.ceil]);
        bx(g, 'plaster', x0, y0, z0, x1, y1, z1, C.white, { skip: { py: true, ny: true }, sub: 2 });
        break;
      case 'o_roof':
        flat(g, x0, x1, z0, z1, y0, false, (cx) => cx <= -10.2 ? ['wood', C.woodWarm] : ['plaster', C.ceil]);
        break;
      case 'o_ext': {
        const skip: BoxOpts['skip'] = { py: true, ny: true };
        if (x0 >= 25.9) skip.px = true; if (z1 <= -37.9) skip.nz = true; if (z0 >= 37.9) skip.pz = true;
        bx(g, 'plaster', x0, y0, z0, x1, y1, z1, C.plaster, { skip, sub: 2 });
        // plint kayu di kaki dinding dalam tiap lantai
        for (const fy of [0, 10]) {
          if (y1 <= fy + 0.5 || y0 > fy) continue;
          if (x0 >= 25.9) bx(g, 'wood', x0 - 0.05, fy, z0, x0, fy + 0.35, z1, C.woodDark);
          else if (z1 <= -37.9) bx(g, 'wood', x0, fy, z1, x1, fy + 0.35, z1 + 0.05, C.woodDark);
          else if (z0 >= 37.9) bx(g, 'wood', x0, fy, z0 - 0.05, x1, fy + 0.35, z0, C.woodDark);
        }
        break;
      }
      case 'o_beam': bx(g, 'plaster', x0, y0, z0, x1, y1, z1, C.facade, { sub: 2 }); break;
      case 'o_window': bx(g, 'glassC', x0, y0, z0, x1, y1, z1, C.clear); break;
      case 'o_wall':
        bx(g, 'plaster', x0, y0, z0, x1, y1, z1, C.plaster, { skip: { ny: true }, ...SUB });
        if (y0 === 0 || y0 === 10) {
          const { L0, L1, T0, T1, put } = frameOf(b);
          if (L1 - L0 > 1.5) { put(g, 'wood', L0, y0, T0 - 0.05, L1, y0 + 0.35, T0, C.woodDark); put(g, 'wood', L0, y0, T1, L1, y0 + 0.35, T1 + 0.05, C.woodDark); }
        }
        break;
      case 'o_conc': bx(g, 'conc', x0, y0, z0, x1, y1, z1, C.conc, { skip: { ny: true }, ...SUB }); break;
      case 'o_glass': glassWall(g, b, 6.2); break;
      case 'o_frame': bx(g, 'metal', x0, y0, z0, x1, y1, z1, C.black); break;
      case 'o_rail': railing(g, b, b.id.startsWith('RAIL_V') ? 'glass' : 'iron'); break;
      case 'o_col': column(g, b); break;
      case 'o_hbeam': hBeam(g, b); break;
      case 'o_wood':
        if (y1 - y0 >= 3) cabinet(g, b, C.woodWarm, 'wood');
        else if (y1 - y0 <= 0.6) bx(g, 'wood', x0, y0, z0, x1, y1, z1, C.woodWarm, { sub: 2 });
        else {
          bx(g, 'wood', x0, y0, z0, x1, y1 - 0.12, z1, C.woodWarm, { skip: { ny: true }, sub: 2 });
          bx(g, 'wood', x0 - 0.04, y1 - 0.12, z0 - 0.04, x1 + 0.04, y1, z1 + 0.04, C.woodDark, { skip: { ny: true } });
        }
        break;
      case 'o_marble':
        bx(g, 'metal', x0 + 0.3, y0, z0 + 0.3, x1 - 0.3, y1 - 0.15, z1 - 0.3, 0x3a3d42, { skip: { ny: true } });
        bx(g, 'marble', x0, y1 - 0.15, z0, x1, y1, z1, 0xffffff, { skip: { ny: true } });
        break;
      case 'o_locker': lockerWall(g, b); break;
      case 'o_counter': counter(g, b, b.id === 'RECEPTION' ? C.woodDark : C.woodLight); break;
      case 'o_part': partition(g, b); break;
      case 'o_desk': desk(g, b, true); break;
      case 'o_tv': tvStand(g, b); break;
      case 'o_cab': cabinet(g, b, b.id === 'L4_FRIDGE' ? C.fridge : b.id.startsWith('BLUE') ? 0x9aa7b4 : b.id.startsWith('RED') ? 0xa4958e : C.steelG); break;
      case 'o_crateB': crates(g, b, C.crateB); break;
      case 'o_crateR': crates(g, b, C.crateR); break;
      case 'o_sofaO': sofa(g, b, C.sofaO); break;
      case 'o_sofaY': sofa(g, b, C.sofaY); break;
      case 'o_sofaG': sofa(g, b, C.sofaG); break;
      case 'o_planter': planter(g, b); break;
      case 'o_store':
        if (b.cat === 'wall') bx(g, 'wood', x0, y0, z0, x1, y1, z1, C.woodDark, { skip: { ny: true }, ...SUB });
        else crates(g, b, C.cardboard);
        break;
      case 'o_kiosk':
        counter(g, b, C.woodWarm);
        bx(g, 'metal', x0 + 0.4, y1, z0 + 0.4, x0 + 1.4, y1 + 0.9, z0 + 1.2, C.black);             // mesin kopi
        bx(g, 'metal', (x0 + x1) / 2 - 0.9, y1 + 0.2, z1 - 0.04, (x0 + x1) / 2 + 0.9, y1 + 1.1, z1, 0x1f2a24);       // papan menu
        bx(g, 'glow', (x0 + x1) / 2 - 0.8, y1 + 0.95, z1, (x0 + x1) / 2 + 0.8, y1 + 1.0, z1 + 0.02, 0xffe2b0, {}, 1.4);
        for (const [px, pz] of [[x0 + 0.1, z0 + 0.1], [x1 - 0.2, z0 + 0.1], [x0 + 0.1, z1 - 0.2], [x1 - 0.2, z1 - 0.2]])
          bx(g, 'metal', px, y1, pz, px + 0.1, y1 + 2.2, pz + 0.1, C.black);
        bx(g, 'fabric', x0 - 0.3, y1 + 2.2, z0 - 0.3, x1 + 0.3, y1 + 2.35, z1 + 0.3, 0x2f6b5a);
        break;
      default: break;
    }
  }
  stairs(g);
  lamps(g);
  plantRings(g);
  verandaEdge(g);
  sign(g, boxes);
  teamAccents(g);
  facade(g);
  backdrop(g);
}
