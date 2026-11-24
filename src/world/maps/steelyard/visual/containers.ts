// src/world/maps/steelyard/visual/containers.ts — kontainer ISO detail (gaya blocky tegas + material realistis):
//   dinding samping BERGELOMBANG (geometri trapesium: lembah–lereng–punggung) di antara tiang sudut, rel atas/bawah, corner
//   casting menonjol, atap ber-rel, ujung pintu (2 daun bergelombang, 4 batang pengunci + braket + tuas + cam keeper, engsel,
//   karet tengah, tanda ID), dinding depan bergelombang, kantong forklift (20 ft). Terbuka: interior bergelombang gelap, plafon,
//   lantai pelat; daun pintu berayun 90° keluar (sesuai collider denah). Tumpuk 2 = kontainer tertutup di atasnya.
// Bayangan: mesh detail TIDAK melempar bayangan; balok PROXY sedikit di dalam kulit (bucket 'proxy') yang melempar bayangan.
// Konvensi lokal (= layout.ts): sumbu panjang X lokal, ujung pintu +X, 'one' = hanya +X terbuka, rotY konvensi three.js.
import * as THREE from 'three';
import { makeRng } from '../../../../core/Rng';
import { SY_DIMS, type SYContainer } from '../layout';
import { Geo, hashStr, mixHex, shadeHex, TRY } from './geo';
import { STEEL_TEX } from './textures';

/** Dimensi nyata (u) — SATU sumber dengan collider denah (SY_DIMS di layout.ts). */
export const CDIM = SY_DIMS.container;
/** Palet cat pudar (kontainer tumpukan/latar). */
export const FADED = [0xb7a888, 0x8b8f8c, 0x8a6a52, 0x5f7690, 0x9a4c3c, 0x6d7a5e, 0xb7703f, 0xc4c0b4, 0x4f6a7d, 0xa58a5c];

/** Tiang sudut (= SY_DIMS.container.post: collider tiang & panjang daun pintu memakai nilai yang sama), rel bawah, rel atas. */
const POST = CDIM.post, YB = 0.48, TOPR = 0.32;
/** UV kecil di tengah mask (tanpa debu bawah) untuk detail gelap (lubang casting, tanda ID). */
const DARK_UV = [0.5, 0.5, 0.505, 0.5, 0.505, 0.505, 0.5, 0.505];
const MIRROR_Z = new THREE.Matrix4().makeScale(1, 1, -1);
const MIRROR_X = new THREE.Matrix4().makeScale(-1, 1, 1);

export interface ContainerOpts {
  /** 'lite' = latar jauh: rusuk lebih jarang, tanpa detail pintu kecil & interior. */
  detail?: 'full' | 'lite';
  /** Kontainer tumpuk: warna ditentukan hash (abaikan k.color untuk tingkat > 0). */
  stackColor?: number;
}

/** Bangun satu kontainer (termasuk tumpukan) ke geo: bucket 'steel', 'rubber', 'proxy'. */
export function emitContainer(geo: Geo, k: SYContainer, o: ContainerOpts = {}) {
  const rng = makeRng(hashStr(k.id));
  const L = CDIM.len[k.size], hl = L / 2;
  geo.push(TRY(k.cx, 0, k.cz, k.rotY));
  const paint = agePaint(k.color, rng);
  shell(geo, hl, 0, paint, k.open, k.doorsOpen, rng, o.detail ?? 'full', k.size);
  if (k.stack === 2) {
    const c2 = o.stackColor ?? FADED[hashStr(k.id + ':top') % FADED.length];
    shell(geo, hl, CDIM.h, agePaint(c2, rng), 'none', false, rng, o.detail ?? 'full', k.size);
  }
  geo.pop();
}

/** Cat pudar per kontainer: sedikit memudar ke krem debu + kecerahan acak. */
function agePaint(c: number, rng: () => number): number {
  return shadeHex(mixHex(c, 0xa99b86, 0.08 + rng() * 0.14), 0.92 + rng() * 0.12);
}

/** Proxy bayangan untuk satu kontainer (kotak sedikit di dalam kulit). */
export function emitContainerProxy(geo: Geo, k: SYContainer) {
  const L = CDIM.len[k.size], hl = L / 2, hw = CDIM.w / 2, H = CDIM.h;
  geo.push(TRY(k.cx, 0, k.cz, k.rotY));
  const pb = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) =>
    geo.box('proxy', x0, y0, z0, x1, y1, z1, { skip: { ny: true } });
  if (k.open === 'none') pb(-hl + 0.22, 0, -hw + 0.22, hl - 0.22, H - 0.12, hw - 0.22);
  else {
    for (const s of [-1, 1]) pb(-hl + 0.3, 0, s > 0 ? hw - 0.21 : -hw + 0.17, hl - 0.3, H - 0.12, s > 0 ? hw - 0.17 : -hw + 0.21);
    pb(-hl + 0.3, H - 0.14, -hw + 0.2, hl - 0.3, H - 0.1, hw - 0.2);
    if (k.open === 'one') pb(-hl + 0.14, 0, -hw + 0.2, -hl + 0.2, H - 0.12, hw - 0.2);
    if (k.doorsOpen) for (const end of k.open === 'ends' ? [1, -1] : [1]) for (const s of [-1, 1]) {
      const x0 = end > 0 ? hl + 0.1 : -hl - hw + 0.4, x1 = end > 0 ? hl + hw - 0.4 : -hl - 0.1;
      pb(x0, 0.45, s > 0 ? hw - 0.08 : -hw + 0.04, x1, H - 0.65, s > 0 ? hw - 0.04 : -hw + 0.08);
    }
  }
  if (k.stack === 2) pb(-hl + 0.22, H + 0.02, -hw + 0.22, hl - 0.22, 2 * H - 0.12, hw - 0.22);
  geo.pop();
}

// ───────────────────────── kulit satu kontainer di ketinggian y0 (lokal kontainer)
function shell(geo: Geo, hl: number, y0: number, paint: number, open: SYContainer['open'], doorsOpen: boolean,
  rng: () => number, detail: 'full' | 'lite', size: 10 | 20 | 40) {
  const H = CDIM.h, hw = CDIM.w / 2, uo = rng(), lite = detail === 'lite';
  const vS = 1 / STEEL_TEX.vSpan, uS = 1 / STEEL_TEX.uSpan;
  /** UV mask baja: u sepanjang dinding (32 u per petak) + geser acak per kontainer, v = tinggi relatif dasar kontainer. */
  const uvSide = (p: [number, number, number]): [number, number] => [p[0] * uS + uo, (p[1] - y0) * vS];
  const uvEnd = (p: [number, number, number]): [number, number] => [p[2] * uS + uo + 0.37, (p[1] - y0) * vS];
  const uvTop = (p: [number, number, number]): [number, number] => [p[0] * uS + uo, p[2] * uS * 2 + 0.5];
  /** Dinding depan (bingkai diputar: x bingkai = Z kontainer). */
  const uvF = (p: [number, number, number]): [number, number] => [p[0] * uS + uo + 0.37, (p[1] - y0) * vS];
  const frame = shadeHex(paint, 0.86), cast = shadeHex(mixHex(paint, 0x5b4636, 0.35), 0.75);
  const yT = y0 + H, isOpen = open !== 'none';
  const pitch = lite ? 2.8 : 1.15;

  // ── dinding samping bergelombang (+Z lalu cermin −Z), luar & (terbuka) dalam
  for (const side of [1, -1]) {
    if (side < 0) geo.push(MIRROR_Z);
    geo.color(paint);
    corrugate(geo, -hl + POST, hl - POST, y0 + YB, yT - TOPR, hw - 0.04, hw - 0.16, pitch, uvSide, false);
    if (isOpen && !lite) {
      geo.color(paint, 0.48);
      corrugate(geo, -hl + 0.18, hl - 0.18, y0 + 0.02, yT - 0.16, hw - 0.07, hw - 0.19, pitch, uvSide, true);
    }
    // rel atas & bawah (muka luar sedikit di dalam tiang)
    geo.color(frame);
    geo.box('steel', -hl + POST, yT - TOPR, hw - 0.2, hl - POST, yT, hw - 0.01, { uv: uvSide, skip: { nz: !isOpen } });
    geo.box('steel', -hl + POST, y0, hw - 0.22, hl - POST, y0 + YB, hw - 0.01, { uv: uvSide, skip: { ny: true, nz: !isOpen } });
    // kantong forklift (20 ft): dua bukaan gelap di rel bawah
    if (size === 20 && !lite && y0 === 0) {
      geo.color(0x1c1a17);
      for (const x of [-2.6, 2.6]) geo.quad('steel', [x - 0.8, 0.06, hw], [x + 0.8, 0.06, hw], [x + 0.8, 0.4, hw], [x - 0.8, 0.4, hw], [0, 0, 0.05, 0, 0.05, 0.05, 0, 0.05]);
    }
    if (side < 0) geo.pop();
  }

  // ── tiang sudut + corner casting (4 sudut × atas/bawah); latar: tiang utuh tanpa casting terpisah
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const x0 = sx > 0 ? hl - POST : -hl, x1 = sx > 0 ? hl : -hl + POST, z0 = sz > 0 ? hw - POST : -hw, z1 = sz > 0 ? hw : -hw + POST;
    geo.color(frame);
    if (lite) { geo.box('steel', x0, y0, z0, x1, yT + 0.02, z1, { uv: uvSide, skip: { ny: true } }); continue; }
    geo.box('steel', x0, y0 + 0.4, z0, x1, yT - 0.4, z1, { uv: uvSide, skip: { py: true, ny: true } });
    geo.color(cast);
    const e = 0.03;
    for (const top of [false, true]) {
      const ya = top ? yT - 0.4 : y0, yb = top ? yT + 0.02 : y0 + 0.4;
      geo.box('steel', x0 - (sx < 0 ? e : 0), ya, z0 - (sz < 0 ? e : 0), x1 + (sx > 0 ? e : 0), yb, z1 + (sz > 0 ? e : 0),
        { uv: uvSide, skip: { ny: !top && y0 === 0 } });
      if (!lite) {   // lubang oval gelap di muka samping & ujung
        geo.color(0x14110e);
        const yc = (ya + yb) / 2, zc = (z0 + z1) / 2, xc = (x0 + x1) / 2, zf = sz > 0 ? z1 + e + 0.005 : z0 - e - 0.005;
        const xf = sx > 0 ? x1 + e + 0.005 : x0 - e - 0.005;
        if (sz > 0) geo.quad('steel', [xc - 0.13, yc - 0.08, zf], [xc + 0.13, yc - 0.08, zf], [xc + 0.13, yc + 0.08, zf], [xc - 0.13, yc + 0.08, zf], DARK_UV);
        else geo.quad('steel', [xc + 0.13, yc - 0.08, zf], [xc - 0.13, yc - 0.08, zf], [xc - 0.13, yc + 0.08, zf], [xc + 0.13, yc + 0.08, zf], DARK_UV);
        if (sx > 0) geo.quad('steel', [xf, yc - 0.08, zc + 0.11], [xf, yc - 0.08, zc - 0.11], [xf, yc + 0.08, zc - 0.11], [xf, yc + 0.08, zc + 0.11], DARK_UV);
        else geo.quad('steel', [xf, yc - 0.08, zc - 0.11], [xf, yc - 0.08, zc + 0.11], [xf, yc + 0.08, zc + 0.11], [xf, yc + 0.08, zc - 0.11], DARK_UV);
        geo.color(cast);
      }
    }
  }

  // ── atap (sedikit lebih rendah dari rel atas) + 3 alur melintang dangkal
  geo.color(paint);
  geo.quad('steel', [-hl + POST, yT - 0.08, hw - 0.2], [hl - POST, yT - 0.08, hw - 0.2], [hl - POST, yT - 0.08, -hw + 0.2], [-hl + POST, yT - 0.08, -hw + 0.2],
    [(-hl) * uS + uo, 0.9, hl * uS + uo, 0.9, hl * uS + uo, 0.5, (-hl) * uS + uo, 0.5], 1, 1, [0, 1, 0]);
  if (!lite) {
    geo.color(paint, 0.94);
    const n = Math.max(2, Math.round(hl / 2.4));
    for (let i = 1; i < n; i++) {
      const x = -hl + POST + (2 * (hl - POST)) * i / n;
      geo.box('steel', x - 0.12, yT - 0.08, -hw + 0.2, x + 0.12, yT - 0.04, hw - 0.2, { uv: uvTop, skip: { ny: true } });
    }
  }
  if (isOpen && !lite) {   // plafon & lantai pelat dalam
    geo.color(paint, 0.36);
    geo.quad('steel', [-hl + 0.18, yT - 0.16, -hw + 0.2], [hl - 0.18, yT - 0.16, -hw + 0.2], [hl - 0.18, yT - 0.16, hw - 0.2], [-hl + 0.18, yT - 0.16, hw - 0.2],
      [0, 0.62, hl * uS, 0.62, hl * uS, 0.7, 0, 0.7], 1, 1, [0, -1, 0]);
    geo.color(0x5a4c3c);
    geo.quad('steel', [-hl + 0.18, y0 + 0.025, hw - 0.2], [hl - 0.18, y0 + 0.025, hw - 0.2], [hl - 0.18, y0 + 0.025, -hw + 0.2], [-hl + 0.18, y0 + 0.025, -hw + 0.2],
      [0, 0.02, hl * uS * 2, 0.02, hl * uS * 2, 0.12, 0, 0.12], Math.max(1, Math.round(hl / 3)), 1, [0, 1, 0]);
  }

  // ── ujung: +X (pintu) & −X (pintu bila 'ends', dinding depan bila tertutup)
  for (const end of [1, -1] as const) {
    if (end < 0) geo.push(MIRROR_X);
    const endOpen = open === 'ends' || (open === 'one' && end > 0);
    const hasDoors = end > 0 || open === 'ends';
    // rangka ujung: header & sill (sill rendah bila terbuka agar bisa dilewati)
    geo.color(frame);
    geo.box('steel', hl - 0.26, yT - 0.62, -hw + POST, hl - 0.02, yT, hw - POST, { uv: uvEnd });
    if (endOpen) geo.box('steel', hl - 0.26, y0, -hw + POST, hl - 0.02, y0 + 0.06, hw - POST, { uv: uvEnd, skip: { ny: true } });
    else geo.box('steel', hl - 0.26, y0, -hw + POST, hl - 0.02, y0 + 0.42, hw - POST, { uv: uvEnd, skip: { ny: true } });
    if (hasDoors && !lite) keepers(geo, hl, y0, yT, hw, cast, uvEnd);
    if (!hasDoors && lite) {
      geo.color(paint);
      geo.quad('steel', [hl - 0.1, y0 + 0.42, hw - POST], [hl - 0.1, y0 + 0.42, -hw + POST], [hl - 0.1, yT - 0.62, -hw + POST], [hl - 0.1, yT - 0.62, hw - POST],
        [0.2, 0.06, 0.4, 0.06, 0.4, 0.9, 0.2, 0.9]);
    } else if (!hasDoors) {
      // dinding depan bergelombang vertikal (frame: x → Z kontainer, z → −X... di sini +X setelah cermin)
      geo.push(new THREE.Matrix4().makeRotationY(Math.PI / 2));
      geo.color(paint);
      corrugate(geo, -hw + POST, hw - POST, y0 + 0.42, yT - 0.62, hl - 0.05, hl - 0.15, 1.0, uvF, false);
      if (isOpen && !lite) { geo.color(paint, 0.45); corrugate(geo, -hw + 0.2, hw - 0.2, y0 + 0.02, yT - 0.16, hl - 0.16, hl - 0.24, 1.0, uvF, true); }
      geo.pop();
    } else if (!endOpen || doorsOpen) {
      // daun pintu: tertutup di ujung, atau terbuka 90° keluar (melanjutkan dinding samping, engsel di sudut luar)
      const Lw = hw - POST - 0.01, leafY0 = y0 + 0.42, leafY1 = yT - 0.62;
      for (const s of [1, -1] as const) {
        const m = new THREE.Matrix4();
        if (!endOpen) {
          // tertutup: engsel di (hl − 0.04, ±(hw − POST)); z' menuju tengah; x' = +X
          m.makeTranslation(hl - 0.04, 0, s * (hw - POST));
          if (s > 0) m.multiply(MIRROR_Z);
        } else {
          // terbuka 90°: engsel di sudut luar (hl, ±hw); z' → +X, x' → ±Z (keluar)
          m.makeBasis(new THREE.Vector3(0, 0, s), new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0));
          m.setPosition(hl, 0, s * (hw - 0.01));
        }
        geo.push(m);
        leaf(geo, Lw, leafY0, leafY1, paint, cast, rng, lite, s, !endOpen);
        geo.pop();
      }
    }
    if (end < 0) geo.pop();
  }
}

/** Dinding bergelombang trapesium sepanjang X lokal xa..xb, tinggi y0..y1; punggung di z = zR, lembah z = zV (luar = +Z).
 *  inward = muka menghadap −Z (sisi dalam). Bucket 'steel'. */
export function corrugate(geo: Geo, xa: number, xb: number, y0: number, y1: number, zR: number, zV: number, pitch: number,
  uv: (p: [number, number, number]) => [number, number], inward: boolean) {
  const n = Math.max(1, Math.round((xb - xa) / pitch)), P = (xb - xa) / n;
  const SEG: [number, number, number, number][] = [[0, 0.3, zV, zV], [0.3, 0.42, zV, zR], [0.42, 0.88, zR, zR], [0.88, 1, zR, zV]];
  for (let i = 0; i < n; i++) for (const [t0, t1, za, zb] of SEG) {
    const xs = xa + (i + t0) * P, xe = xa + (i + t1) * P;
    const a: [number, number, number] = [xs, y0, za], b: [number, number, number] = [xe, y0, zb];
    const c: [number, number, number] = [xe, y1, zb], d: [number, number, number] = [xs, y1, za];
    if (!inward) geo.quad('steel', a, b, c, d, [...uv(a), ...uv(b), ...uv(c), ...uv(d)]);
    else geo.quad('steel', b, a, d, c, [...uv(b), ...uv(a), ...uv(d), ...uv(c)]);
  }
}

/** Cam keeper (penahan ujung batang pengunci) di header & sill pada posisi batang pintu tertutup. */
function keepers(geo: Geo, hl: number, y0: number, yT: number, hw: number, cast: number, uv: (p: [number, number, number]) => [number, number]) {
  geo.color(cast);
  // batang daun (lihat leaf): z' = Lw − 0.7 / Lw − 2.3 dari engsel di ±(hw − POST), Lw = hw − POST − 0.01 → |z| = 0.71 / 2.31
  void hw;
  for (const s of [1, -1]) for (const zz of [0.7, 2.3]) {
    const z = s * (0.01 + zz);
    for (const y of [y0 + 0.24, yT - 0.24]) geo.box('steel', hl - 0.04, y - 0.13, z - 0.14, hl + 0.2, y + 0.13, z + 0.14, { uv, skip: { nx: true } });
  }
}

/**
 * Daun pintu di bingkai daun: x' = normal luar (muka luar x' = 0), y naik, z' dari engsel (0) ke tepi bebas (Lw).
 * Panel + 4 rusuk vertikal, 2 batang pengunci + braket + tuas, 3 engsel, karet tepi, tanda ID (daun kanan).
 */
function leaf(geo: Geo, Lw: number, y0: number, y1: number, paint: number, cast: number, rng: () => number, lite: boolean, s: number, closed: boolean) {
  const uS = 1 / STEEL_TEX.uSpan, vS = 1 / STEEL_TEX.vSpan, uo = rng();
  const uv = (p: [number, number, number]): [number, number] => [p[2] * uS + uo, (p[1] - y0 + 0.42) * vS];
  geo.color(paint);
  if (lite) geo.quad('steel', [0, y0, Lw], [0, y0, 0.06], [0, y1, 0.06], [0, y1, Lw], [Lw * uS + uo, 0.06, uo, 0.06, uo, 0.9, Lw * uS + uo, 0.9]);
  else geo.box('steel', -0.1, y0, 0.06, 0, y1, Lw, { uv, skip: { nx: closed } });
  // rusuk vertikal ditekan (menonjol 0.05)
  const ribs = lite ? 0 : 4;
  geo.color(paint, 0.97);
  for (let i = 0; i < ribs; i++) {
    const z = 0.35 + (Lw - 0.6) * (i + 0.5) / ribs;
    geo.box('steel', 0, y0 + 0.25, z - 0.16, 0.05, y1 - 0.25, z + 0.16, { uv, skip: { nx: true } });
  }
  // batang pengunci + braket + tuas
  const barC = shadeHex(paint, 0.78);
  for (const zz of [Lw - 0.7, Lw - 2.3]) {
    const z = Math.max(0.3, zz);
    geo.color(barC);
    geo.box('steel', 0.1, y0 - 0.17, z - 0.06, 0.22, y1 + 0.17, z + 0.06, { uv, skip: { nx: true, py: lite, ny: lite } });
    if (lite) continue;
    geo.color(cast);
    for (const y of [y0 + 0.45, y1 - 0.45]) geo.box('steel', 0.0, y - 0.1, z - 0.14, 0.25, y + 0.1, z + 0.14, { uv, skip: { nx: true } });
    // tuas: dari batang menuju tengah (tepi bebas), sedikit miring ke bawah
    geo.color(barC);
    const yh = y0 + 2.0 + rng() * 0.3;
    geo.box('steel', 0.2, yh - 0.06, z, 0.3, yh + 0.06, Math.min(Lw - 0.1, z + 0.85), { uv, skip: { nx: true } });
    geo.box('steel', 0.0, yh - 0.12, Math.min(Lw - 0.18, z + 0.7), 0.24, yh + 0.12, Math.min(Lw - 0.04, z + 0.92), { uv, skip: { nx: true } });
  }
  if (lite) return;
  // engsel di sisi engsel (z' 0)
  geo.color(cast);
  for (const y of [y0 + 0.5, (y0 + y1) / 2, y1 - 0.5]) geo.box('steel', -0.04, y - 0.16, -0.02, 0.12, y + 0.16, 0.3, { uv });
  // karet tepi bebas (gelap)
  geo.color(0x1d1c1a);
  geo.box('rubber', -0.09, y0, Lw - 0.03, 0.015, y1, Lw + 0.015, { uvScale: 0.02, skip: { nx: true } });
  // tanda ID (blok "teks" gelap) di daun kanan saat tertutup
  if (s > 0) {
    geo.color(0x242220);
    const yy = y1 - 0.55;
    for (let r = 0; r < 3; r++) {
      const w = 0.6 + rng() * 0.9, y = yy - r * 0.26, z0 = 0.45;
      geo.quad('steel', [0.056, y - 0.08, z0 + w], [0.056, y - 0.08, z0], [0.056, y + 0.08, z0], [0.056, y + 0.08, z0 + w], DARK_UV);
    }
  }
}
