// src/world/maps/steelyard/visual/props.ts — prop Steel Yard (gaya blocky, material realistis), semua di bucket bersama:
//   palet (papan atas/bawah, blok, stringer) & tumpukannya, spool kabel (piringan papan, lilitan kabel, baut), peti kayu (rangka,
//   palang diagonal, stensil) & tumpukannya, barrier beton profil Jersey (lubang angkat, celah drainase, cat pudar), drum 200 L
//   (rusuk gelinding, tutup ber-chime, sumbat), ban tergeletak (tapak, bahu bulat), tumpukan bertutup terpal (tali), bangkai sedan
//   blocky berdebu (ban kempes, kaca pecah gelap, bemper, lampu), dan serpihan kecil tanpa collider.
// Bingkai lokal = layout.ts: pusat (x, z) di tanah, rotY; X lokal = panjang (mobil: depan = +X), Z lokal = lebar.
import * as THREE from 'three';
import { makeRng } from '../../../../core/Rng';
import { SY_DIMS, mirrorInfo, type SYProp } from '../layout';
import { Geo, hashStr, mixHex, shadeHex, TRY } from './geo';
import { STEEL_TEX } from './textures';

/** Tapak (panjang X × lebar Z) & tinggi prop dalam u — SATU sumber dengan collider denah (SY_DIMS di layout.ts). */
export const PDIM: Record<SYProp['kind'], [number, number, number]> = SY_DIMS.prop;

const CAR_COLORS = [0x8f9a9e, 0x9c4a3a, 0xc2b8a0, 0x5d7a8c, 0x6c7560, 0xcfcac0, 0x7a6248];
const DRUM_COLORS = [0x3e5f8a, 0x8a3a2a, 0xb8902a, 0x4f6b3a, 0x6b4a32, 0x2e3236, 0x8a8f8c];
const TARP_COLORS = [0x5e6b48, 0x46658c, 0xa08c64, 0x6f8291];
const uS = 1 / STEEL_TEX.uSpan, vS = 1 / STEEL_TEX.vSpan;
const MIRROR_Z = new THREE.Matrix4().makeScale(1, 1, -1);

/** Bangun satu prop sesuai jenisnya (dalam bingkai lokalnya). Tumpukan terpal (siluet acak = pelindung): benih id dasar + salinan
 *  cermin ganjil dibalik Z lokal → bayangan cermin persis antar-tim (layout.mirrorInfo). */
export function emitProp(geo: Geo, p: SYProp) {
  const mi = p.kind === 'tarpPile' ? mirrorInfo(p.id) : null;
  const rng = makeRng(hashStr(mi ? mi.base : p.id)), s = p.s ?? 1;
  geo.push(TRY(p.x, 0, p.z, p.rotY));
  if (mi?.flip) geo.push(MIRROR_Z);
  if (s !== 1) geo.push(new THREE.Matrix4().makeScale(s, s, s));
  switch (p.kind) {
    case 'pallet': pallet(geo, 0, rng); break;
    case 'palletStack': for (let i = 0; i < 5; i++) {
      geo.push(TRY((rng() - 0.5) * 0.1, i * 0.4, (rng() - 0.5) * 0.1, (rng() - 0.5) * 0.05));
      pallet(geo, 0, rng, i < 4); geo.pop();
    } break;
    case 'spool': spool(geo, rng); break;
    case 'crate': crate(geo, rng); break;
    case 'crateStack':
      crate(geo, rng);
      geo.push(TRY((rng() - 0.5) * 0.12, 2.8, (rng() - 0.5) * 0.12, (rng() - 0.5) * 0.08)); crate(geo, rng); geo.pop();
      break;
    case 'barrier': barrier(geo, rng); break;
    case 'car': car(geo, rng); break;
    case 'drum': drum(geo, rng); break;
    case 'tire': tire(geo, rng, 0); break;
    case 'tarpPile': tarpPile(geo, rng); break;
  }
  if (s !== 1) geo.pop();
  if (mi?.flip) geo.pop();
  geo.pop();
}

/** Proxy bayangan prop kayu kotak (palet, peti & tumpukannya): kotak sedikit di dalam permukaan — mesh detailnya tidak
 *  melempar bayangan (hemat segitiga pass bayangan; bayangan peti/palet memang berbentuk kotak). */
export function emitPropProxy(geo: Geo, p: SYProp) {
  const s = p.s ?? 1;
  const box: Partial<Record<SYProp['kind'], [number, number, number, number]>> = {
    pallet: [1.45, 0.05, 1.2, 0.3], palletStack: [1.45, 0.05, 1.2, 1.85], crate: [1.25, 0, 1.25, 2.55], crateStack: [1.2, 0, 1.2, 5.35],
  };
  const b = box[p.kind];
  if (!b) return;
  geo.push(TRY(p.x, 0, p.z, p.rotY));
  if (s !== 1) geo.push(new THREE.Matrix4().makeScale(s, s, s));
  geo.box('proxy', -b[0], b[1], -b[2], b[0], b[3], b[2], { skip: { ny: true } });
  if (s !== 1) geo.pop();
  geo.pop();
}

// ───────────────────────── palet
/** Palet EUR blocky (3.3 × 2.8 × 0.4): papan bawah, 9 blok, 3 stringer, 5 papan atas. hidden = bagian atas tertutup palet lain. */
function pallet(geo: Geo, y0: number, rng: () => number, hidden = false) {
  const base = rng() < 0.25 ? 0xb6ada0 : rng() < 0.5 ? 0xd9c3a0 : 0xe8d4b0;
  const board = (x0: number, y0b: number, z0: number, x1: number, y1: number, z1: number, grain: 0 | 2, skipTop = false) => {
    geo.color(shadeHex(base, 0.86 + rng() * 0.2));
    const zc = grain === 0 ? (z0 + z1) / 2 : (x0 + x1) / 2, k = Math.floor(rng() * 4);
    geo.box('woodN', x0, y0b, z0, x1, y1, z1, { grain, uvOff: [rng() * 4, k + 0.5 - zc], skip: { ny: y0b <= 0.001, py: skipTop } });
  };
  for (const z of [-1.2, 0, 1.2]) board(-1.65, y0, z - 0.2, 1.65, y0 + 0.06, z + 0.2, 0);
  for (const x of [-1.45, 0, 1.45]) for (const z of [-1.2, 0, 1.2]) {
    geo.color(shadeHex(base, 0.72 + rng() * 0.16));
    geo.box('woodN', x - 0.2, y0 + 0.06, z - 0.2, x + 0.2, y0 + 0.28, z + 0.2, { grain: 1, skip: { py: true, ny: true } });
  }
  for (const x of [-1.45, 0, 1.45]) board(x - 0.2, y0 + 0.28, -1.4, x + 0.2, y0 + 0.34, 1.4, 2, true);
  const tops: [number, number][] = [[-1.2, 0.4], [-0.6, 0.3], [0, 0.4], [0.6, 0.3], [1.2, 0.4]];
  for (const [z, w] of tops) board(-1.65, y0 + 0.34, z - w / 2, 1.65, y0 + 0.4, z + w / 2, 0, hidden);
}

// ───────────────────────── spool kabel (tegak)
/** Selalu berlilit kabel (lilitan Ø ≥ 2.6 ≈ bintang-8 collider di layout.propBoxes) — spool kosong dulu tembus pandang di sela
 *  piringan padahal collider-nya padat. */
function spool(geo: Geo, rng: () => number) {
  const wood = rng() < 0.5 ? 0xd2b48a : 0xb9a07c, n = 14, ph = rng();
  geo.color(wood);
  for (const [ya, yb] of [[0, 0.22], [2.38, 2.6]]) geo.prismY('wood', 0, 0, 1.7, ya, yb, n, { phase: ph, uvScale: 1, capScale: 1, bottom: false });
  // lilitan kabel di antara piringan
  const cable = rng() < 0.15 ? 0x9a5a2a : rng() < 0.5 ? 0x2c2c2c : 0x3b3d40;
  geo.color(cable);
  const fill = 1.32 + rng() * 0.2;
  geo.prismY('rubber', 0, 0, fill, 0.22, 2.38, 16, { top: false, smooth: true, uvScale: 0.0001, uOff: 0.0625, vScale: 6 });
  // bawah piringan atas terlihat di sela
  geo.color(shadeHex(wood, 0.7));
  geo.disc('wood', 0, 2.38, 0, 1.7, n, -1, ph, 1);
  // lubang poros + baut
  geo.color(0x1a1714);
  geo.disc('rubber', 0, 2.605, 0, 0.32, 10, 1, 0, 0.02);
  geo.color(0x5a5450);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3, r = 0.95;
    geo.boxC('steelP', Math.cos(a) * r, 2.63, Math.sin(a) * r, 0.14, 0.06, 0.14, { uv: () => [0.5, 0.55] });
  }
}

// ───────────────────────── peti kayu
function crate(geo: Geo, rng: () => number) {
  const tone = rng() < 0.3 ? 0x8d9070 : rng() < 0.6 ? 0xc29a68 : 0xb08860, frameC = shadeHex(tone, 0.82);
  const S = 1.5, H = 2.8, I = 0.06;
  geo.color(tone);
  geo.box('woodN', -S + I, 0, -S + I, S - I, H - I, S - I, { grain: 0, uvOff: [rng() * 4, 0.3], skip: { ny: true } });
  geo.color(frameC);
  // tiang sudut
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const x0 = sx > 0 ? S - 0.3 : -S, z0 = sz > 0 ? S - 0.3 : -S;
    geo.box('woodN', x0, 0, z0, x0 + 0.3, H, z0 + 0.3, { grain: 1, uvOff: [rng() * 4, 0.5], skip: { ny: true } });
  }
  // palang datar atas/bawah di 4 sisi + diagonal
  for (const [y0, y1] of [[0, 0.3], [H - 0.3, H]]) {
    geo.box('woodN', -S + 0.3, y0, -S, S - 0.3, y1, -S + 0.12, { grain: 0, uvOff: [rng() * 4, 0.5], skip: { ny: y0 === 0 } });
    geo.box('woodN', -S + 0.3, y0, S - 0.12, S - 0.3, y1, S, { grain: 0, uvOff: [rng() * 4, 1.5], skip: { ny: y0 === 0 } });
    geo.box('woodN', -S, y0, -S + 0.3, -S + 0.12, y1, S - 0.3, { grain: 2, uvOff: [rng() * 4, 2.5], skip: { ny: y0 === 0 } });
    geo.box('woodN', S - 0.12, y0, -S + 0.3, S, y1, S - 0.3, { grain: 2, uvOff: [rng() * 4, 3.5], skip: { ny: y0 === 0 } });
  }
  const diagLen = Math.hypot(2 * S - 0.6, H - 0.6), ang = Math.atan2(H - 0.6, 2 * S - 0.6);
  for (let f = 0; f < 4; f++) {
    geo.push(new THREE.Matrix4().makeRotationY(f * Math.PI / 2));
    const flipD = (f + (rng() < 0.5 ? 1 : 0)) % 2 ? -1 : 1;
    const m = new THREE.Matrix4().makeRotationZ(ang * flipD);
    m.setPosition(0, H / 2, S - 0.06);
    geo.push(m);
    geo.box('woodN', -diagLen / 2, -0.13, -0.05, diagLen / 2, 0.13, 0.06, { grain: 0, uvOff: [rng() * 4, 0.5], skip: { nz: true } });
    geo.pop(); geo.pop();
  }
  // tutup: 2 palang + stensil (panah "atas" & tulisan blok)
  geo.color(frameC);
  for (const x of [-0.75, 0.75]) geo.box('woodN', x - 0.15, H, -S + 0.1, x + 0.15, H + 0.06, S - 0.1, { grain: 2, uvOff: [rng() * 4, 0.5] });
  geo.color(0x2b2722);
  const st = (x0: number, y0: number, x1: number, y1: number) =>
    geo.quad('woodN', [x0, y0, S - 0.054], [x1, y0, S - 0.054], [x1, y1, S - 0.054], [x0, y1, S - 0.054], [0.2, 0.6, 0.25, 0.6, 0.25, 0.65, 0.2, 0.65]);
  if (rng() < 0.7) {
    st(-0.9, 1.55, -0.78, 2.05); st(-1.0, 2.05, -0.68, 2.2); st(0.62, 1.55, 0.74, 2.05); st(0.52, 2.05, 0.84, 2.2);
    for (let r = 0; r < 2; r++) st(-0.55, 0.85 - r * 0.22, -0.55 + 0.6 + rng() * 0.5, 0.97 - r * 0.22);
  }
}

// ───────────────────────── barrier beton (profil Jersey — SY_DIMS.jersey, sama dengan collider)
function barrier(geo: Geo, rng: () => number) {
  const tone = shadeHex(0xd6d0c4, 0.88 + rng() * 0.12), J = SY_DIMS.jersey;
  // poligon tertutup: kiri bawah → kanan naik ke puncak → kiri turun
  const prof: [number, number][] = [[-J[0][0], J[0][1]], ...J.map(([w, y]) => [w, y] as [number, number]),
    ...J.slice(1).reverse().map(([w, y]) => [-w, y] as [number, number])];
  geo.color(tone);
  geo.extrude('concrete', prof, 'zy', -2.75, 2.75, { uvScale: 1 });
  // pita cat pudar (merah-putih / kuning-hitam) di bidang miring atas
  if (rng() < 0.45) {
    const pair = rng() < 0.5 ? [0xa8473a, 0xd8d2c4] : [0xc09a32, 0x2e2c28];
    const zAt = (y: number) => J[2][0] + (J[3][0] - J[2][0]) * (y - J[2][1]) / (J[3][1] - J[2][1]);
    const ya = 1.35, yb = 1.85;
    for (const sd of [1, -1]) for (let i = 0; i < 6; i++) {
      const xa = -2.75 + i * (5.5 / 6), xb = xa + 5.5 / 6;
      geo.color(shadeHex(pair[i % 2], 0.85 + rng() * 0.1));
      const za = zAt(ya) + 0.01, zb = zAt(yb) + 0.01;
      if (sd > 0) geo.quad('concrete', [xa, ya, za], [xb, ya, za], [xb, yb, zb], [xa, yb, zb], [xa, ya, xb, ya, xb, yb, xa, yb]);
      else geo.quad('concrete', [xb, ya, -za], [xa, ya, -za], [xa, yb, -zb], [xb, yb, -zb], [xa, ya, xb, ya, xb, yb, xa, yb]);
    }
  }
  // lubang angkat (besi berkarat) & celah drainase
  geo.color(0x5a3a26);
  for (const x of [-1.6, 1.6]) {
    geo.box('steelP', x - 0.22, 2.2, -0.04, x - 0.14, 2.42, 0.04, { uv: () => [0.3, 0.5] });
    geo.box('steelP', x + 0.14, 2.2, -0.04, x + 0.22, 2.42, 0.04, { uv: () => [0.3, 0.5] });
    geo.box('steelP', x - 0.22, 2.42, -0.04, x + 0.22, 2.5, 0.04, { uv: () => [0.3, 0.5] });
  }
  geo.color(0x23201c);
  for (const sd of [1, -1]) {
    const z = sd * 0.805;
    if (sd > 0) geo.quad('concrete', [-0.6, 0.0, z], [0.6, 0.0, z], [0.6, 0.18, z], [-0.6, 0.18, z], [0, 0, 1, 0, 1, 0.2, 0, 0.2]);
    else geo.quad('concrete', [0.6, 0.0, z], [-0.6, 0.0, z], [-0.6, 0.18, z], [0.6, 0.18, z], [0, 0, 1, 0, 1, 0.2, 0, 0.2]);
  }
}

// ───────────────────────── drum 200 L
function drum(geo: Geo, rng: () => number) {
  const c = shadeHex(DRUM_COLORS[Math.floor(rng() * DRUM_COLORS.length)], 0.9 + rng() * 0.15), n = 16, uo = rng();
  const vsc = 3 * vS;
  geo.color(c);
  geo.prismY('steelP', 0, 0, 0.8, 0, 2.4, n, { smooth: true, top: false, uvScale: uS, vScale: vsc, uOff: uo });
  for (const y of [0.78, 1.56]) {
    geo.prismY('steelP', 0, 0, 0.845, y, y + 0.08, n, { smooth: true, top: false, uvScale: uS, vScale: vsc, uOff: uo });
    geo.disc('steelP', 0, y + 0.08, 0, 0.845, n, 1, 0, uS, 0.8);
  }
  // chime (bibir atas) + tutup sedikit cekung + 2 sumbat
  geo.prismY('steelP', 0, 0, 0.8, 2.4, 2.48, n, { smooth: true, top: false, uvScale: uS, vScale: vsc, uOff: uo });
  geo.disc('steelP', 0, 2.48, 0, 0.8, n, 1, 0, uS, 0.72);
  geo.prismY('steelP', 0, 0, 0.72, 2.38, 2.48, n, { smooth: true, top: false, inward: true, uvScale: uS, vScale: vsc, uOff: uo });
  geo.color(c, 0.92);
  geo.disc('steelP', 0, 2.38, 0, 0.72, n, 1, 0, uS);
  geo.color(shadeHex(c, 0.7));
  geo.boxC('steelP', 0.42, 2.41, 0.1, 0.22, 0.06, 0.22, { uv: () => [0.4, 0.6] });
  geo.boxC('steelP', -0.48, 2.4, -0.2, 0.14, 0.05, 0.14, { uv: () => [0.4, 0.6] });
}

// ───────────────────────── ban tergeletak
function tire(geo: Geo, rng: () => number, y0: number) {
  const n = 14, c = rng() < 0.5 ? 0x34332f : 0x403d38, ph = rng();
  geo.color(c);
  geo.prismY('rubber', 0, 0, 1.08, y0, y0 + 0.08, n, { smooth: true, top: false, rTop: 1.2, phase: ph, uvScale: 1, vScale: 1.1 });
  geo.prismY('rubber', 0, 0, 1.2, y0 + 0.08, y0 + 0.82, n, { smooth: true, top: false, phase: ph, uvScale: 1, vScale: 1.1 });
  geo.prismY('rubber', 0, 0, 1.2, y0 + 0.82, y0 + 0.9, n, { smooth: true, top: false, rTop: 1.08, phase: ph, uvScale: 1, vScale: 1.1 });
  geo.color(c, 0.92);
  geo.disc('rubber', 0, y0 + 0.9, 0, 1.08, n, 1, ph * 0, 0.02, 0.6);
  geo.color(c, 0.6);
  geo.prismY('rubber', 0, 0, 0.6, y0 + 0.05, y0 + 0.9, n, { smooth: true, top: false, inward: true, phase: ph, uvScale: 0.02, vScale: 0.02 });
  // pasir di dalam lubang
  geo.color(0xc4ad88);
  geo.disc('concrete', 0, y0 + 0.12, 0, 0.6, n, 1, 0, 0.5);
}

// ───────────────────────── tumpukan bertutup terpal
/** Barang bertumpuk ditutup terpal yang MENGISI tapak collider (SY_DIMS.prop.tarpPile 4.4 × 3.4 × 2.6 — dulu gundukan kecil di
 *  tengah: di 0.5 u tepi tapak kain hanya 0–0.7 u sedangkan collider 2.6 penuh): puncak hampir rata (gundukan peti di bawahnya,
 *  0.88–1 × tinggi), kain jatuh hampir tegak di keempat sisi (0.05 u di dalam muka collider) lalu melebar ke kelim di tanah 0.3 u
 *  di luar tapak; lipatan & kerut, 2 tali melintang mengikuti kain, 2 ban penahan menekan puncak (di bawah tinggi collider).
 *  Kisi 16 × 12: dua sel terluar tiap sisi = juntaian. */
function tarpPile(geo: Geo, rng: () => number) {
  const [L, W, H] = PDIM.tarpPile, col = TARP_COLORS[Math.floor(rng() * TARP_COLORS.length)];
  const NU = 16, NV = 12, eu = 1 - 4 / NU, ev = 1 - 4 / NV, IN = 0.05, HEM = 0.35;
  // gundukan peti di bawah terpal: [pusat s, pusat t (−0.5..0.5), tinggi relatif, jari-jari s, t] → puncak tidak rata
  const lumps: [number, number, number, number, number][] = [[(rng() - 0.5) * 0.1, (rng() - 0.5) * 0.1, 1, 0.3 + rng() * 0.06, 0.3 + rng() * 0.06]];
  for (let i = 0; i < 3; i++) lumps.push([(rng() - 0.5) * 0.6, (rng() - 0.5) * 0.6, 0.55 + rng() * 0.35, 0.14 + rng() * 0.1, 0.14 + rng() * 0.1]);
  const crown = (s: number, t: number) => {
    let k = 0;
    for (const [bx, bz, h, rx, rz] of lumps) {
      const d = Math.max(Math.abs(s - 0.5 - bx) / rx, Math.abs(t - 0.5 - bz) / rz);   // kotak membulat (peti tertutup kain)
      k = Math.max(k, h * (d < 1 ? 1 - Math.pow(d, 6) * 0.3 : Math.max(0, 1 - (d - 1) * 1.2) * 0.7));
    }
    return 0.88 + 0.12 * Math.min(1, k);
  };
  /** Posisi sepanjang satu sumbu (a = |2s − 1|): puncak sampai IN di dalam muka collider, lalu juntaian keluar ke kelim. */
  const along = (a: number, e: number, half: number) => a <= e ? (a / e) * (half - IN) : half - IN + HEM * ((a - e) / (1 - e)) ** 2;
  const surf = (s: number, t: number): [number, number, number] => {
    const a = Math.abs(2 * s - 1), b = Math.abs(2 * t - 1);
    const us = Math.max(0, (a - eu) / (1 - eu)), ut = Math.max(0, (b - ev) / (1 - ev)), u = Math.max(us, ut);
    const fold = 0.05 * Math.sin(s * 23 + t * 7) * u + 0.03 * Math.sin(s * 9 - t * 13) * (1 - u);   // lipatan juntaian & kerut puncak
    const y = H * crown(s, t) * (1 - u ** 1.6) + fold;
    const x = Math.sign(s - 0.5) * along(a, eu, L / 2) + 0.04 * Math.sin(t * 29 + s * 3) * us;     // kain bergelombang di kelim
    const z = Math.sign(t - 0.5) * along(b, ev, W / 2) + 0.04 * Math.sin(s * 31 + t * 5) * ut;
    return [x, Math.max(0.03, Math.min(H, y)), z];
  };
  /** Normal keluar (beda pusat; −(∂s × ∂t), sama dengan kisi flip). */
  const nrm = (s: number, t: number): [number, number, number] => {
    const e = 1e-3, a = surf(Math.max(0, s - e), t), b = surf(Math.min(1, s + e), t), c = surf(s, Math.max(0, t - e)), d = surf(s, Math.min(1, t + e));
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = d[0] - c[0], vy = d[1] - c[1], vz = d[2] - c[2];
    const nx = uz * vy - uy * vz, ny = ux * vz - uz * vx, nz = uy * vx - ux * vy, l = Math.hypot(nx, ny, nz) || 1;
    return [nx / l, ny / l, nz / l];
  };
  geo.color(col);
  geo.grid('tarp', NU, NV, surf, (s, t) => [s, t], undefined, true);
  // tali pengikat melintang (2) tepat di garis kisi (mengikuti kain), digeser keluar searah normal
  geo.color(0x8f7a55);
  for (const s0 of [5 / NU, 11 / NU]) for (let j = 0; j < NV; j++) {
    const t0 = j / NV, t1 = (j + 1) / NV, off = 0.035, hw = 0.08;
    const a = surf(s0, t0), b = surf(s0, t1), na = nrm(s0, t0), nb = nrm(s0, t1);
    const A = [a[0] + na[0] * off, a[1] + na[1] * off, a[2] + na[2] * off], B = [b[0] + nb[0] * off, b[1] + nb[1] * off, b[2] + nb[2] * off];
    geo.quad('tarp', [A[0] + hw, A[1], A[2]], [A[0] - hw, A[1], A[2]], [B[0] - hw, B[1], B[2]], [B[0] + hw, B[1], B[2]], [0.5, 0.5, 0.51, 0.5, 0.51, 0.51, 0.5, 0.51]);
  }
  // ban penahan menekan puncak (sedikit tenggelam di kain; puncak ban tetap di bawah tinggi collider)
  const SY = 0.34;
  for (const [ts, tt] of [[0.34, 0.32], [0.66, 0.7]] as const) {
    const p = surf(ts, tt);
    geo.push(TRY(p[0], Math.min(p[1], H - 0.9 * SY) - 0.05, p[2], rng() * 3));
    geo.push(new THREE.Matrix4().makeScale(0.5, SY, 0.5));
    tire(geo, rng, 0);
    geo.pop(); geo.pop();
  }
}

// ───────────────────────── bangkai sedan (depan = +X)
function car(geo: Geo, rng: () => number) {
  const paint = shadeHex(mixHex(CAR_COLORS[Math.floor(rng() * CAR_COLORS.length)], 0xb09c80, 0.25 + rng() * 0.15), 0.9 + rng() * 0.1);
  const uo = rng();
  const uvCar = (p: [number, number, number]): [number, number] => [p[0] * uS + uo, p[1] * vS * 1.7];
  // badan (profil samping, lengkung roda) — sedikit miring (ban kempes satu sisi)
  const roll = (rng() - 0.5) * 0.05, pitch = (rng() - 0.5) * 0.03;
  geo.push(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(roll, 0, pitch)));
  const arch = (cx: number): [number, number][] => {
    const pts: [number, number][] = [];
    for (let i = 0; i <= 6; i++) { const a = Math.PI - (i / 6) * Math.PI; pts.push([cx + Math.cos(a) * 1.2, 0.6 + Math.sin(a) * 1.2]); }
    return pts;
  };
  // kabin (SY_DIMS.carCabin — collider kabin bertingkat mengikuti profil yang sama)
  const C = SY_DIMS.carCabin;
  const B0 = C.y0, T = C.y1, [xf0, xf1] = C.front, [xr0, xr1] = C.rear, [zb, zt] = C.side;
  const prof: [number, number][] = [
    [-6.5, 0.75], ...arch(-3.9), ...arch(3.9), [6.5, 0.75], [6.62, 1.5], [6.3, 2.0], [xf0, B0], [xr0, B0], [-6.2, 2.25], [-6.55, 1.6],
  ];
  geo.color(paint);
  geo.extrude('steelP', prof, 'xy', -2.35, 2.35, { uv: uvCar });
  // kabin: atap, kaca depan/belakang, sisi (pilar + jendela)
  const cab = (x: number, y: number, z: number): [number, number, number] => [x, y, z];
  geo.color(paint);
  geo.quad('steelP', cab(xr1, T, zt), cab(xf1, T, zt), cab(xf1, T, -zt), cab(xr1, T, -zt), [0, 0.6, 0.15, 0.6, 0.15, 0.7, 0, 0.7]);
  const sideQ = (sd: number) => {
    const p0 = cab(xr0, B0, sd * zb), p1 = cab(xf0, B0, sd * zb), p2 = cab(xf1, T, sd * zt), p3 = cab(xr1, T, sd * zt);
    if (sd > 0) geo.quad('steelP', p0, p1, p2, p3, [...uvCar(p0), ...uvCar(p1), ...uvCar(p2), ...uvCar(p3)]);
    else geo.quad('steelP', p1, p0, p3, p2, [...uvCar(p1), ...uvCar(p0), ...uvCar(p3), ...uvCar(p2)]);
  };
  sideQ(1); sideQ(-1);
  const front = [cab(xf0, B0, zb), cab(xf0, B0, -zb), cab(xf1, T, -zt), cab(xf1, T, zt)] as [number, number, number][];
  geo.quad('steelP', front[0], front[1], front[2], front[3], [0, 0.6, 0.1, 0.6, 0.1, 0.7, 0, 0.7]);
  const rear = [cab(xr0, B0, -zb), cab(xr0, B0, zb), cab(xr1, T, zt), cab(xr1, T, -zt)] as [number, number, number][];
  geo.quad('steelP', rear[0], rear[1], rear[2], rear[3], [0, 0.6, 0.1, 0.6, 0.1, 0.7, 0, 0.7]);
  // kaca (inset dari tepi; sebagian pecah = hitam + serpih)
  const lerp3 = (a: number[], b: number[], t: number): [number, number, number] => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const off = (p: [number, number, number], n: [number, number, number], d: number): [number, number, number] => [p[0] + n[0] * d, p[1] + n[1] * d, p[2] + n[2] * d];
  const pane = (q: [number, number, number][], n: [number, number, number], inset: [number, number, number, number], broken: boolean) => {
    // q = p0..p3 CCW dari luar; inset (bawah, kanan, atas, kiri) dalam fraksi
    const [ib, ir, it, il] = inset;
    const bl = lerp3(lerp3(q[0], q[3], ib), lerp3(q[1], q[2], ib), il), br = lerp3(lerp3(q[0], q[3], ib), lerp3(q[1], q[2], ib), 1 - ir);
    const tr = lerp3(lerp3(q[0], q[3], 1 - it), lerp3(q[1], q[2], 1 - it), 1 - ir), tl = lerp3(lerp3(q[0], q[3], 1 - it), lerp3(q[1], q[2], 1 - it), il);
    const P = [bl, br, tr, tl].map(p => off(p, n, 0.02)) as [number, number, number][];
    if (!broken) { geo.color(0x1b2428); geo.quad('glass', P[0], P[1], P[2], P[3]); return; }
    geo.color(0x070707);
    geo.quad('rubber', P[0], P[1], P[2], P[3], [0, 0, 0.01, 0, 0.01, 0.01, 0, 0.01]);
    geo.color(0x26302f);
    const Q = P.map(p => off(p, n, 0.01)) as [number, number, number][];
    geo.tri('glass', Q[0], lerp3(Q[0], Q[1], 0.35), lerp3(Q[0], Q[3], 0.5));
    geo.tri('glass', Q[2], lerp3(Q[2], Q[3], 0.3), lerp3(Q[2], Q[1], 0.45));
    geo.tri('glass', Q[1], lerp3(Q[1], Q[2], 0.3), lerp3(Q[1], Q[0], 0.25));
  };
  const frontN = norm3([T - B0, xf0 - xf1, 0]);
  pane(front, frontN, [0.08, 0.1, 0.08, 0.1], rng() < 0.4);
  pane(rear, norm3([-(T - B0), xr1 - xr0, 0]), [0.1, 0.12, 0.1, 0.12], rng() < 0.5);
  for (const sd of [1, -1]) {
    const p0 = cab(xr0, B0, sd * zb), p1 = cab(xf0, B0, sd * zb), p2 = cab(xf1, T, sd * zt), p3 = cab(xr1, T, sd * zt);
    const n = norm3([0, (zb - zt) * 1, sd * (T - B0)]);
    // dua jendela samping (pintu depan & belakang), pilar B di tengah
    const q = sd > 0 ? [p0, p1, p2, p3] : [p1, p0, p3, p2];
    const L = (t: number) => sd > 0 ? t : 1 - t;
    const sub = (a: number, b: number): [number, number, number][] => {
      const A = Math.min(L(a), L(b)), Bv = Math.max(L(a), L(b));
      return [lerp3(q[0], q[1], A), lerp3(q[0], q[1], Bv), lerp3(q[3], q[2], Bv), lerp3(q[3], q[2], A)];
    };
    pane(sub(0.06, 0.47), n, [0.12, 0.04, 0.1, 0.06], rng() < 0.3);
    pane(sub(0.53, 0.95), n, [0.12, 0.06, 0.1, 0.04], rng() < 0.3);
  }
  // bemper, gril, lampu, spion, plat, gagang pintu, garis pintu
  geo.color(0x2a2a2a);
  geo.box('rubber', 6.45, 0.7, -2.3, 6.8, 1.25, 2.3, { uvScale: 0.02 });
  geo.box('rubber', -6.85, 0.7, -2.3, -6.5, 1.25, 2.3, { uvScale: 0.02 });
  geo.color(0x141414);
  geo.box('rubber', 6.45, 1.3, -1.1, 6.68, 1.72, 1.1, { uvScale: 0.02, skip: { nx: true } });
  for (const sd of [1, -1]) {
    geo.color(rng() < 0.25 ? 0x101010 : 0xc9ccc2);
    geo.box('glass', 6.36, 1.34, sd > 0 ? 1.2 : -2.1, 6.64, 1.74, sd > 0 ? 2.1 : -1.2, { skip: { nx: true } });
    geo.color(0x6e1a14);
    geo.box('glass', -6.6, 1.62, sd > 0 ? 1.4 : -2.2, -6.44, 2.0, sd > 0 ? 2.2 : -1.4, { skip: { px: true } });
    geo.color(paint, 0.85);
    geo.box('steelP', 1.85, 2.5, sd > 0 ? 2.3 : -2.6, 2.25, 2.78, sd > 0 ? 2.6 : -2.3, { uv: () => [0.2, 0.5] });
    geo.color(0x1c1b19);
    for (const x of [0.6, -1.9]) geo.box('steelP', x - 0.22, 1.95, sd > 0 ? 2.35 : -2.4, x + 0.22, 2.05, sd > 0 ? 2.4 : -2.35, { uv: () => [0.2, 0.5] });
    for (const x of [2.25, -0.55, -3.45]) {
      const z = sd * 2.357;
      if (sd > 0) geo.quad('steelP', [x - 0.025, 0.95, z], [x + 0.025, 0.95, z], [x + 0.025, 2.3, z], [x - 0.025, 2.3, z], [0.5, 0.5, 0.505, 0.5, 0.505, 0.505, 0.5, 0.505]);
      else geo.quad('steelP', [x + 0.025, 0.95, z], [x - 0.025, 0.95, z], [x - 0.025, 2.3, z], [x + 0.025, 2.3, z], [0.5, 0.5, 0.505, 0.5, 0.505, 0.505, 0.5, 0.505]);
    }
  }
  geo.color(0xd8d4c4);
  geo.box('steelP', 6.8, 0.82, -0.55, 6.84, 1.12, 0.55, { uv: () => [0.6, 0.6] });
  geo.box('steelP', -6.89, 0.82, -0.55, -6.85, 1.12, 0.55, { uv: () => [0.6, 0.6] });
  geo.pop();
  // roda kempes (sumbu Z): ban gepeng di bawah + velg berkarat
  for (const x of [3.9, -3.9]) for (const sd of [1, -1]) {
    const flat = 0.78 + rng() * 0.1;
    const m = new THREE.Matrix4().makeRotationX(sd > 0 ? Math.PI / 2 : -Math.PI / 2);
    m.premultiply(new THREE.Matrix4().makeScale(1, flat, 1));
    m.setPosition(x, 0.95 * flat, sd * 1.72);
    geo.push(m);
    geo.color(0x2d2c29);
    geo.prismY('rubber', 0, 0, 0.95, 0, 0.72, 12, { smooth: true, top: false, uvScale: 1, vScale: 1.3 });
    geo.color(0x26241f);
    geo.disc('rubber', 0, 0.72, 0, 0.95, 12, 1, 0, 0.02, 0.46);
    geo.color(0x55524c);
    geo.prismY('steelP', 0, 0, 0.46, 0.62, 0.7, 10, { smooth: false, top: true, uvScale: uS, vScale: 0.02, vOff: 0.55, capScale: 0.02, capOff: [0.3, 0.55] });
    geo.color(0x2e2a26);
    geo.prismY('steelP', 0, 0, 0.16, 0.7, 0.77, 8, { top: true, uvScale: uS, vScale: 0.02, vOff: 0.55, capScale: 0.02, capOff: [0.3, 0.55] });
    geo.pop();
  }
}

function norm3(v: [number, number, number]): [number, number, number] {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

// ───────────────────────── serpihan (tanpa collider; datar < 0.3 u)
/** Serpihan kecil: papan tergeletak, bata/pecahan beton, kaleng, batu. ok(x, z, r) = posisi bebas sejauh r (tidak menimpa objek,
 *  tidak menembus dinding tipis kontainer terbuka / pagar): papan menjangkau ±2.45 u dari pusat (panjang ≤ 3.8 + geser ±0.5),
 *  jenis lain ±1.6 u. */
export function emitDebris(geo: Geo, seed: number, bounds: { x: [number, number]; z: [number, number] }, ok: (x: number, z: number, r: number) => boolean, count = 46) {
  const rng = makeRng(seed);
  let placed = 0, tries = 0;
  while (placed < count && tries++ < count * 30) {
    const x = bounds.x[0] + 2 + rng() * (bounds.x[1] - bounds.x[0] - 4), z = bounds.z[0] + 2 + rng() * (bounds.z[1] - bounds.z[0] - 4);
    const kind = rng();
    if (!ok(x, z, kind < 0.35 ? 2.45 : 1.6)) continue;
    placed++;
    const a = rng() * Math.PI * 2;
    geo.push(TRY(x, 0, z, a));
    if (kind < 0.35) {          // papan (1–3)
      const n = 1 + Math.floor(rng() * 3);
      for (let i = 0; i < n; i++) {
        geo.color(shadeHex(0xc8a878, 0.7 + rng() * 0.3));
        const l = 1.6 + rng() * 2.2, y = i * 0.07;
        geo.push(TRY((rng() - 0.5) * 0.6, y, (rng() - 0.5) * 0.8, (rng() - 0.5) * 0.9));
        geo.box('wood', -l / 2, 0, -0.17, l / 2, 0.07, 0.17, { grain: 0, uvOff: [rng() * 4, 0.5], skip: { ny: true } });
        geo.pop();
      }
    } else if (kind < 0.6) {    // bata / pecahan beton
      const n = 2 + Math.floor(rng() * 4);
      for (let i = 0; i < n; i++) {
        const brick = rng() < 0.5;
        geo.color(brick ? shadeHex(0x9a5a40, 0.8 + rng() * 0.3) : shadeHex(0xbdb6a8, 0.8 + rng() * 0.2));
        const sx = brick ? 0.62 : 0.3 + rng() * 0.5, sz = brick ? 0.3 : 0.25 + rng() * 0.4, sy = brick ? 0.2 : 0.1 + rng() * 0.15;
        geo.push(TRY((rng() - 0.5) * 1.4, 0, (rng() - 0.5) * 1.4, rng() * 3));
        geo.box('concrete', -sx / 2, 0, -sz / 2, sx / 2, sy, sz / 2, { skip: { ny: true } });
        geo.pop();
      }
    } else if (kind < 0.78) {   // kaleng/ember berkarat (rebah atau tegak)
      geo.color(shadeHex(DRUM_COLORS[Math.floor(rng() * DRUM_COLORS.length)], 0.8));
      if (rng() < 0.5) geo.prismY('steelP', 0, 0, 0.16, 0, 0.42, 8, { smooth: true, uvScale: uS, vScale: vS, uOff: rng() });
      else {
        const m = new THREE.Matrix4().makeRotationZ(Math.PI / 2); m.setPosition(0.21, 0.16, 0);
        geo.push(m); geo.prismY('steelP', 0, 0, 0.16, 0, 0.42, 8, { smooth: true, uvScale: uS, vScale: vS, bottom: true, uOff: rng() }); geo.pop();
      }
    } else {                    // batu
      const n = 1 + Math.floor(rng() * 3);
      for (let i = 0; i < n; i++) {
        geo.color(shadeHex(0xa89880, 0.75 + rng() * 0.3));
        const r = 0.18 + rng() * 0.3;
        geo.push(TRY((rng() - 0.5) * 1.2, 0, (rng() - 0.5) * 1.2, rng() * 3));
        geo.prismY('concrete', 0, 0, r, 0, r * 0.8, 5, { rTop: r * 0.55, uvScale: 1 });
        geo.pop();
      }
    }
    geo.pop();
  }
}
