// src/world/maps/arunika/visual/nature.ts — alam Candi Arunika: tanah (paving / tanah hutan / dek kayu dermaga) per petak 2 u dengan
// warna verteks makro, tebing batu berlumut (dipahat MASUK ke balok collider), pohon beringin & kamboja (batang di dalam collider,
// tajuk kartu daun alpha di atas kepala), kelapa & hutan latar di luar tebing, sungai + jukung di luar tanggul, kolam & teratai,
// air terjun dari celah tebing gua, rumput & pakis, decal zona, prasasti, penjor. Semua tanpa collider kecuali yang ada di AR_BOXES.
import * as THREE from 'three';
import type { Box } from '../../../MapData';
import type { Geo, V3 } from '../../steelyard/visual/geo';
import { hashStr } from '../../steelyard/visual/geo';
import { makeRng, type Rng } from '../../../../core/Rng';
import { vnoise } from '../../steelyard/visual/textures';
import { AR_BOUNDS, AR_PALMS, AR_WATER } from '../layout';
import { COL } from './emit';
import type { ArMat } from './materials';

type K = ArMat;

// ───────────────────────── tanah
type Surf = 'wood' | 'paving' | 'ground' | 'pond';
function inWater(x: number, z: number): boolean {
  for (const w of AR_WATER) if (x > w.x[0] - 0.05 && x < w.x[1] + 0.05 && z > w.z[0] - 0.05 && z < w.z[1] + 0.05) return true;
  return false;
}
/** Jenis permukaan tanah di titik (x, z). */
export function surfKind(x: number, z: number): Surf {
  const ax = Math.abs(x);
  if (inWater(x, z)) return 'pond';
  if (z >= 66 && ax < 38) return 'wood';
  if (ax < 30 && z > -22 && z < 22) return 'paving';                         // pelataran
  if (ax < 5 && z >= 22 && z <= 34) return 'paving';                         // lorong gapura
  if (ax >= 22 && ax <= 26 && z >= 26 && z <= 30) return 'paving';           // pintu samping gapura
  if (ax < 5 && z <= -22 && z > -64) return 'paving';                        // Lorong Biksu
  if (ax < 19 && z <= -38 && z >= -46) return 'paving';                      // Balai Genta + pintu samping
  if (z <= -64 && ax < 40) return 'paving';                                  // halaman wihara (spawn Biru)
  // jalan setapak batu di zona A & B: gerbang spawn → tangga
  if (z < -52 && z > -64 && ((x > -47 && x < -27) || (x > 27 && x < 49))) return 'paving';
  if (x > 33.5 && x < 54.5 && z > -52.5 && z < -35.5) return 'paving';       // pelataran pendopo
  return 'ground';
}
/** Warna verteks makro tanah (sRGB hex): jalur hutan hijau-cokelat, pasar debu cokelat, taman B rumput, dek kayu lapuk. */
const _nz = vnoise(16, 16, 7171), _nz2 = vnoise(64, 64, 7173);
function groundTint(x: number, z: number, s: Surf): number {
  const n = _nz((x + 200) / 160, (z + 200) / 160), m = _nz2((x + 200) / 60, (z + 200) / 60);
  if (s === 'wood') return mix(0x9c9184, 0xb5a998, m);
  if (s === 'paving') return mix(0xb1aca2, 0xc9c3b7, n * 0.6 + m * 0.4);
  if (s === 'pond') return 0x4c5a52;
  const ax = Math.abs(x);
  if (ax >= 38 && z > -34) return mix(0x9aa07c, 0xb6b08c, n);               // jalur hutan
  if (z > 34 && ax < 38) return mix(0xc2ab8a, 0xd4bf9c, n * 0.5 + m * 0.5);  // pasar: tanah padat
  if (z <= -34 && x > 19) return mix(0x9fb07e, 0xb9c290, n);                 // taman air: rumput
  return mix(0xa9a888, 0xbeb796, n);
}
function mix(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255, br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  const k = Math.max(0, Math.min(1, t));
  return (Math.round(ar + (br - ar) * k) << 16) | (Math.round(ag + (bg - ag) * k) << 8) | Math.round(ab + (bb - ab) * k);
}

/** Petak tanah 2 × 2 u di area main (petak tertutup penuh balok padat besar dilewati). */
export function emitGround(g: Geo, boxes: readonly Box[]) {
  const solid = boxes.filter(b => b.style !== 'hidden' && b.style !== 'a_ground' && b.min[1] <= 0.01 && b.max[1] >= 3 &&
    (b.max[0] - b.min[0]) * (b.max[2] - b.min[2]) >= 16);
  const covered = (x0: number, z0: number, x1: number, z1: number) =>
    solid.some(b => b.min[0] <= x0 && b.max[0] >= x1 && b.min[2] <= z0 && b.max[2] >= z1);
  const S = 2;
  for (let x = AR_BOUNDS.x[0]; x < AR_BOUNDS.x[1]; x += S) for (let z = AR_BOUNDS.z[0]; z < AR_BOUNDS.z[1]; z += S) {
    if (covered(x, z, x + S, z + S)) continue;
    const s = surfKind(x + S / 2, z + S / 2);
    const k: K = s === 'wood' ? 'wood' : s === 'paving' ? 'paving' : s === 'pond' ? 'stone' : 'ground';
    // warna per sudut (gradasi halus antar petak)
    const c = (px: number, pz: number) => new THREE.Color().setHex(groundTint(px, pz, s), THREE.SRGBColorSpace);
    const c00 = c(x, z), c10 = c(x + S, z), c11 = c(x + S, z + S), c01 = c(x, z + S);
    const avg = c00.clone().add(c10).add(c11).add(c01).multiplyScalar(0.25);
    g.colorC(avg);
    const y = 0.001;
    g.quad(k, [x, y, z + S], [x + S, y, z + S], [x + S, y, z], [x, y, z], [x, z + S, x + S, z + S, x + S, z, x, z]);
  }
  // tepi dek dermaga: balok lis kayu di sisi Selatan (menempel tembok spawn) tidak perlu; jalur tengah dek = papan lebih terang
}

// ───────────────────────── tebing batu (dipahat ke dalam balok collider)
/** Muka tebing: kisi berderau yang menjorok MASUK (−normal) maks `depth` u dari bidang muka. o = titik awal muka (bawah), u = arah
 *  sepanjang muka (satuan), n = normal keluar muka. */
function rockFace(g: Geo, o: V3, u: V3, n: V3, L: number, H: number, depth: number, seed: number) {
  const nA = vnoise(8, 4, seed), nB = vnoise(32, 12, seed + 1);
  const nu = Math.max(2, Math.round(L / 1.4)), nv = Math.max(2, Math.round(H / 1.1));
  g.color(0xcfc8b8);
  g.grid('rock', nu, nv, (s, t) => {
    const foot = Math.min(1, t / 0.06);                               // kaki tebing rata dengan tepi tanah (tanpa celah)
    const d = (nA(s * L / 40, t) * 0.75 + nB(s * L / 12, t * 3) * 0.35) * depth * foot * foot;
    const y = t * H - (t > 0.98 ? nB(s * 7, 0.3) * 1.2 : 0);
    return [o[0] + u[0] * s * L - n[0] * d, y, o[2] + u[2] * s * L - n[2] * d];
  }, (s, t) => [s * L, t * H]);
}
/** Semak & pakis yang tumbuh di lis-lis tebing (kartu daun menempel muka, di atas kepala) + rumpun pakis di kaki tebing. */
function cliffPlants(g: Geo, o: V3, u: V3, n: V3, L: number, H: number, rng: Rng) {
  for (let y = 3.2; y < H - 1; y += 3.3) for (let s = rng() * 6; s < L; s += 4 + rng() * 9) {
    const x = o[0] + u[0] * s + n[0] * 0.4, z = o[2] + u[2] * s + n[2] * 0.4;
    g.color(0x9cbc74, 0.8 + rng() * 0.35);
    card(g, rng() < 0.3 ? 'leafK' : 'leafB', [x, y + rng() * 1.2, z], 1.6 + rng() * 1.6, rng, [x - n[0] * 2, y - 1, z - n[2] * 2]);
  }
  for (let s = rng() * 3; s < L; s += 2.2 + rng() * 3.5) {
    const x = o[0] + u[0] * s + n[0] * 0.5, z = o[2] + u[2] * s + n[2] * 0.5;
    g.color(0xa8c27a, 0.8 + rng() * 0.3);
    card(g, 'leafG', [x, 0.55, z], 1.2 + rng() * 0.9, rng, [x, -1, z]);
  }
}
/** Tutup rumput di atas balok tebing + semak tepi. */
function cliffTop(g: Geo, b: Box, rng: Rng) {
  const [x0, , z0] = b.min, [x1, y1, z1] = b.max;
  g.color(0x7f9a5c);
  g.quad('ground', [x0, y1 - 0.05, z1], [x1, y1 - 0.05, z1], [x1, y1 - 0.05, z0], [x0, y1 - 0.05, z0], [x0, z1, x1, z1, x1, z0, x0, z0]);
  const n = Math.round(Math.max(x1 - x0, z1 - z0) / 3.5);
  for (let i = 0; i < n; i++) {
    const t = (i + rng()) / n;
    const x = x1 - x0 > z1 - z0 ? x0 + t * (x1 - x0) : (x0 + x1) / 2, z = x1 - x0 > z1 - z0 ? (z0 + z1) / 2 : z0 + t * (z1 - z0);
    bush(g, 'leafB', x, y1 - 0.3, z, 2.2 + rng() * 1.8, rng);
  }
}
export function emitCliffs(g: Geo, boxes: readonly Box[]) {
  const rng = makeRng(4401);
  const by = (id: string) => boxes.find(b => b.id === id)!;
  const W = by('OUT_W'), E = by('OUT_E'), S = by('OUT_S'), SW = by('BLK_SW'), SE = by('BLK_SE');
  rockFace(g, [-60, 0, 84], [0, 0, -1], [1, 0, 0], 164, W.max[1], 1.1, 4411);       // muka Timur tebing Barat (x = −60)
  rockFace(g, [60, 0, -84], [0, 0, 1], [-1, 0, 0], 164, E.max[1], 1.1, 4413);       // muka Barat tebing Timur
  rockFace(g, [-40, 0, -80], [1, 0, 0], [0, 0, 1], 80, S.max[1], 1.1, 4415);        // muka Utara tebing Selatan
  rockFace(g, [-40, 0, -64], [0, 0, -1], [1, 0, 0], 16, SW.max[1], 0.9, 4417);      // blok SW: muka Timur & Utara
  rockFace(g, [-60, 0, -64], [1, 0, 0], [0, 0, 1], 20, SW.max[1], 0.9, 4419);
  rockFace(g, [40, 0, -80], [0, 0, 1], [-1, 0, 0], 16, SE.max[1], 0.9, 4421);
  rockFace(g, [40, 0, -64], [1, 0, 0], [0, 0, 1], 20, SE.max[1], 0.9, 4423);
  for (const b of [W, E, S, SW, SE]) cliffTop(g, b, rng);
  cliffPlants(g, [-60, 0, 84], [0, 0, -1], [1, 0, 0], 148, W.max[1], rng);
  cliffPlants(g, [60, 0, -64], [0, 0, 1], [-1, 0, 0], 148, E.max[1], rng);
  cliffPlants(g, [-40, 0, -80], [1, 0, 0], [0, 0, 1], 80, S.max[1], rng);
  cliffPlants(g, [-60, 0, -64], [1, 0, 0], [0, 0, 1], 20, SW.max[1], rng);
  cliffPlants(g, [40, 0, -64], [1, 0, 0], [0, 0, 1], 20, SE.max[1], rng);
  // akar & sulur menjuntai di muka tebing (kartu daun sempit, di atas kepala)
  for (let i = 0; i < 70; i++) {
    const side = i % 3, t = rng();
    const x = side === 0 ? -59.7 : side === 1 ? 59.7 : -38 + t * 76, z = side === 2 ? -79.7 : -78 + t * 156;
    const top = side === 2 ? S.max[1] : W.max[1], len = 3 + rng() * 5;
    vine(g, x, top, z, len, side === 0 ? [1, 0, 0] : side === 1 ? [-1, 0, 0] : [0, 0, 1], rng);
  }
}
function vine(g: Geo, x: number, top: number, z: number, len: number, n: V3, rng: Rng) {
  const w = 0.5 + rng() * 0.5, tx = n[2] !== 0 ? 1 : 0, tz = n[0] !== 0 ? 1 : 0;
  g.color(0x6f9a52, 0.85 + rng() * 0.3);
  const y0 = Math.max(6, top - len);
  g.quad('leafB', [x - tx * w + n[0] * 0.05, y0, z - tz * w + n[2] * 0.05], [x + tx * w + n[0] * 0.05, y0, z + tz * w + n[2] * 0.05],
    [x + tx * w + n[0] * 0.05, top, z + tz * w + n[2] * 0.05], [x - tx * w + n[0] * 0.05, top, z - tz * w + n[2] * 0.05], [0, 0, 1, 0, 1, 1, 0, 1], 1, 1, n);
}

// ───────────────────────── tumbuhan
/** Gerombol kartu daun (silang 2 bidang) berpusat c, lebar s; normal mengarah keluar dari pusat tajuk `center` (bayangan lembut). */
function card(g: Geo, k: K, c: V3, s: number, rng: Rng, center?: V3) {
  const a = rng() * Math.PI, h = s / 2;
  const nrm: V3 | undefined = center ? (() => {
    const v = new THREE.Vector3(c[0] - center[0], c[1] - center[1] + 0.6, c[2] - center[2]).normalize();
    return [v.x, v.y, v.z] as V3;
  })() : undefined;
  for (const off of [0, Math.PI / 2]) {
    const dx = Math.cos(a + off) * h, dz = Math.sin(a + off) * h, tilt = (rng() - 0.5) * h * 0.6;
    g.quad(k, [c[0] - dx, c[1] - h + tilt, c[2] - dz], [c[0] + dx, c[1] - h - tilt, c[2] + dz], [c[0] + dx, c[1] + h - tilt, c[2] + dz],
      [c[0] - dx, c[1] + h + tilt, c[2] - dz], [0, 0, 1, 0, 1, 1, 0, 1], 1, 1, nrm);
  }
  // bidang datar (dari atas/bawah tajuk tampak penuh)
  g.quad(k, [c[0] - h, c[1], c[2] + h], [c[0] + h, c[1], c[2] + h], [c[0] + h, c[1], c[2] - h], [c[0] - h, c[1], c[2] - h], [0, 0, 1, 0, 1, 1, 0, 1], 1, 1, nrm ?? [0, 1, 0]);
}
/** Semak/pakis rendah. */
function bush(g: Geo, k: K, x: number, y: number, z: number, s: number, rng: Rng) {
  g.color(0xa8c27e, 0.82 + rng() * 0.3);
  card(g, k, [x, y + s * 0.42, z], s, rng, [x, y - s, z]);
}
/** Dahan meruncing antara dua titik (silinder segi-6). */
function limb(g: Geo, k: K, a: V3, b: V3, r0: number, r1: number) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A), L = d.length();
  const up = new THREE.Vector3(0, 1, 0), q = new THREE.Quaternion().setFromUnitVectors(up, d.clone().normalize());
  const m = new THREE.Matrix4().compose(A, q, new THREE.Vector3(1, 1, 1));
  g.push(m);
  g.prismY(k, 0, 0, r0, 0, L, 6, { rTop: r1, smooth: true, top: false, uvScale: 1, vScale: 1 });
  g.pop();
}
/** Tajuk: kartu daun di kulit elipsoid (rx, ry, rz) + isi. */
function crown(g: Geo, k: K, c: V3, rx: number, ry: number, rz: number, n: number, s: number, rng: Rng, tint: number) {
  for (let i = 0; i < n; i++) {
    const u = rng() * Math.PI * 2, v = Math.acos(1 - rng() * 1.7), r = 0.7 + rng() * 0.35;   // lebih banyak di bagian atas
    const p: V3 = [c[0] + Math.cos(u) * Math.sin(v) * rx * r, c[1] + Math.cos(v) * ry * r, c[2] + Math.sin(u) * Math.sin(v) * rz * r];
    g.color(tint, 0.78 + rng() * 0.4 + (p[1] > c[1] ? 0.12 : -0.1));
    card(g, k, p, s * (0.8 + rng() * 0.5), rng, c);
  }
}
/** Beringin: batang utama + akar napas (tiang-tiang menyatu) di DALAM tapak collider, dahan menyebar di atas kepala, tajuk lebar,
 *  akar gantung pendek. */
export function banyan(g: Geo, b: Box) {
  const [x0, y0, z0] = b.min, [x1, y1, z1] = b.max, rng = makeRng(hashStr(b.id)), cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const hw = (x1 - x0) / 2, hd = (z1 - z0) / 2;
  g.color(0x9a9282);
  g.prismY('bark', cx, cz, Math.min(hw, hd) * 0.62, y0, y1, 10, { smooth: true, rTop: Math.min(hw, hd) * 0.5, uvScale: 1, vScale: 1 });
  for (let i = 0; i < 9; i++) {                                   // akar napas (di dalam tapak)
    const r = 0.22 + rng() * 0.35, px = cx + (rng() * 2 - 1) * (hw - r - 0.05), pz = cz + (rng() * 2 - 1) * (hd - r - 0.05);
    g.color(0x8f8676, 0.9 + rng() * 0.2);
    g.prismY('bark', px, pz, r, y0, y1, 6, { smooth: true, top: false, uvScale: 1, vScale: 1 });
  }
  g.color(0x928a7a);
  for (let i = 0; i < 4; i++) {                                   // akar banir di kaki
    const a = i * Math.PI / 2 + rng() * 0.4, ex = Math.cos(a) * (hw - 0.1), ez = Math.sin(a) * (hd - 0.1);
    g.tri('bark', [cx + ex, y0, cz + ez], [cx + ex * 0.2 - ez * 0.25, y0, cz + ez * 0.2 + ex * 0.25], [cx + ex * 0.1, y0 + 2.4, cz + ez * 0.1]);
    g.tri('bark', [cx + ex * 0.2 + ez * 0.25, y0, cz + ez * 0.2 - ex * 0.25], [cx + ex, y0, cz + ez], [cx + ex * 0.1, y0 + 2.4, cz + ez * 0.1]);
  }
  // dahan
  const top = y1, spread = 6 + hw * 1.2, tips: V3[] = [];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + rng() * 0.5, L = spread * (0.6 + rng() * 0.4);
    const tip: V3 = [cx + Math.cos(a) * L, top + 1.5 + rng() * 2.5, cz + Math.sin(a) * L];
    g.color(0x8a8272);
    limb(g, 'bark', [cx, top - 1.5, cz], tip, Math.min(hw, hd) * 0.32, 0.18);
    tips.push(tip);
    // akar gantung pendek dari dahan (berakhir ≥ 5.6 di atas tanah)
    for (let j = 0; j < 3; j++) {
      const t = 0.35 + rng() * 0.55, p: V3 = [cx + (tip[0] - cx) * t, top - 1.5 + (tip[1] - top + 1.5) * t, cz + (tip[2] - cz) * t];
      g.color(0x7c7464);
      limb(g, 'bark', p, [p[0], Math.max(5.8, p[1] - 2 - rng() * 2.5), p[2]], 0.06, 0.03);
    }
  }
  crown(g, 'leafB', [cx, top + 4, cz], spread + 1.5, 4.2, spread + 1.5, 70 + Math.round(hw * 10), 3.6, rng, 0xa6c486);
  for (const t of tips) crown(g, 'leafB', t, 2.6, 1.6, 2.6, 9, 3.0, rng, 0x9cba7c);
}
/** Kamboja: batang meliuk bercabang di atas kepala, gerombol daun lebar + bunga putih di ujung dahan. */
export function kamboja(g: Geo, b: Box) {
  const [x0, y0, z0] = b.min, [x1, y1, z1] = b.max, rng = makeRng(hashStr(b.id)), cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, r = (x1 - x0) * 0.4;
  g.color(0x9d958a);
  g.prismY('bark', cx, cz, r, y0, 5, 8, { smooth: true, rTop: r * 0.8, top: false, uvScale: 1, vScale: 1 });
  const tips: V3[] = [];
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2 + rng() * 0.6, L = 1.6 + rng() * 1.4, tip: V3 = [cx + Math.cos(a) * L, y1 - 0.5 + rng() * 1.2, cz + Math.sin(a) * L];
    limb(g, 'bark', [cx, 4.6, cz], tip, r * 0.6, 0.1);
    tips.push(tip);
  }
  for (const t of tips) crown(g, 'leafK', t, 1.5, 0.9, 1.5, 8, 2.2, rng, 0xa6c080);
}
/** Kelapa (latar): batang melengkung + pelepah menjuntai. */
function palm(g: Geo, x: number, z: number, h: number, rng: Rng) {
  const lean = rng() * Math.PI * 2, lx = Math.cos(lean) * h * 0.12, lz = Math.sin(lean) * h * 0.12;
  const pts: V3[] = [];
  for (let i = 0; i <= 5; i++) { const t = i / 5; pts.push([x + lx * t * t, t * h, z + lz * t * t]); }
  g.color(0x9b8e78);
  for (let i = 0; i < 5; i++) limb(g, 'bark', pts[i], pts[i + 1], 0.42 - i * 0.04, 0.38 - i * 0.04);
  const top = pts[5];
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + rng() * 0.3, L = 4.5 + rng() * 1.5;
    const dx = Math.cos(a), dz = Math.sin(a), w = 1.0;
    const mid: V3 = [top[0] + dx * L * 0.5, top[1] + 0.8, top[2] + dz * L * 0.5], end: V3 = [top[0] + dx * L, top[1] - 1.6, top[2] + dz * L];
    g.color(0x7e9a54, 0.85 + rng() * 0.3);
    g.quad('leafP', [top[0] - dz * w, top[1], top[2] + dx * w], [top[0] + dz * w, top[1], top[2] - dx * w], [mid[0] + dz * w, mid[1], mid[2] - dx * w], [mid[0] - dz * w, mid[1], mid[2] + dx * w], [0, 0, 1, 0, 1, 0.5, 0, 0.5], 1, 1, [0, 1, 0]);
    g.quad('leafP', [mid[0] - dz * w, mid[1], mid[2] + dx * w], [mid[0] + dz * w, mid[1], mid[2] - dx * w], [end[0] + dz * w * 0.6, end[1], end[2] - dx * w * 0.6], [end[0] - dz * w * 0.6, end[1], end[2] + dx * w * 0.6], [0, 0.5, 1, 0.5, 1, 1, 0, 1], 1, 1, [0, 1, 0]);
  }
  g.color(0x6b5a3a); g.boxC('paint', top[0], top[1] - 0.3, top[2], 0.7, 0.6, 0.7);
}
/** Pohon hutan latar (di luar tebing): batang + tajuk bulat besar. */
function jungleTree(g: Geo, x: number, y: number, z: number, s: number, rng: Rng) {
  g.color(0x8a8070);
  g.prismY('bark', x, z, 0.5 * s, y, y + 6 * s, 6, { smooth: true, rTop: 0.35 * s, top: false });
  crown(g, 'leafB', [x, y + 7.5 * s, z], 4.2 * s, 3.2 * s, 4.2 * s, 26, 3.6 * s, rng, rng() < 0.5 ? 0x8eae74 : 0x9cbc7e);
}

/** Pohon di jalur (balok a_trunk): beringin (≥ 3 u) / kamboja (tipis). Hutan latar, kelapa. */
export function emitTrees(g: Geo, boxes: readonly Box[]) {
  for (const b of boxes) {
    if (b.style !== 'a_trunk') continue;
    if (b.max[0] - b.min[0] >= 3) banyan(g, b); else kamboja(g, b);
  }
  const rng = makeRng(4501);
  for (const [x, z, h, kind] of AR_PALMS) {
    if (kind === 'palm') palm(g, x, z, h, rng);
  }
  // hutan latar di balik tebing Barat/Timur/Selatan (di luar area main)
  for (let i = 0; i < 52; i++) {
    const side = i % 3, t = rng();
    if (side === 0) jungleTree(g, -66 - rng() * 16, 14, -84 + t * 168, 1.1 + rng() * 0.6, rng);
    else if (side === 1) jungleTree(g, 66 + rng() * 16, 14, -84 + t * 168, 1.1 + rng() * 0.6, rng);
    else jungleTree(g, -60 + t * 120, 14, -86 - rng() * 14, 1.1 + rng() * 0.6, rng);
  }
  // perdu di bak tanaman & semak di kaki tembok jalur
  for (const b of boxes) {
    if (b.style === 'a_planter') {
      const r = makeRng(hashStr(b.id)), cx = (b.min[0] + b.max[0]) / 2, cz = (b.min[2] + b.max[2]) / 2;
      for (let i = 0; i < 3; i++) bush(g, 'leafK', cx + (r() - 0.5) * 2, b.max[1], cz + (r() - 0.5) * 2, 1.8 + r(), r);
    }
  }
}

/** Rumput & pakis di tanah hutan/taman (visual, tanpa collider): hanya di petak 'ground' yang jauh dari balok & jalur nav utama. */
export function emitGrass(g: Geo, boxes: readonly Box[]) {
  const rng = makeRng(4601);
  const obs = boxes.filter(b => b.style !== 'hidden' && b.style !== 'a_ground' && b.max[1] > 0.3);
  const near = (x: number, z: number, r: number) => obs.some(b => x > b.min[0] - r && x < b.max[0] + r && z > b.min[2] - r && z < b.max[2] + r);
  let placed = 0;
  for (let i = 0; i < 4000 && placed < 520; i++) {
    const x = AR_BOUNDS.x[0] + 1 + rng() * (AR_BOUNDS.x[1] - AR_BOUNDS.x[0] - 2), z = AR_BOUNDS.z[0] + 1 + rng() * (AR_BOUNDS.z[1] - AR_BOUNDS.z[0] - 2);
    if (surfKind(x, z) !== 'ground') continue;
    // rumput tumbuh di tepi (dekat tembok/tebing) dan di jalur samping; jarang di tengah pasar
    const edge = near(x, z, 1.6) && !near(x, z, 0.35);
    const lane = Math.abs(x) > 40 || (z < -34 && Math.abs(x) > 19);
    if (!edge && !(lane && rng() < 0.35)) continue;
    g.color(0xb4cc84, 0.8 + rng() * 0.35);
    card(g, 'leafG', [x, 0.42, z], 0.9 + rng() * 0.7, rng, [x, -1, z]);
    placed++;
  }
}

// ───────────────────────── air
/** Permukaan air kolam (AR_WATER) + teratai; sungai lebar di luar tanggul. */
export function emitWater(g: Geo) {
  const rng = makeRng(4701);
  g.color(0xffffff);
  for (const w of AR_WATER) {
    g.quad('water', [w.x[0], w.y, w.z[1]], [w.x[1], w.y, w.z[1]], [w.x[1], w.y, w.z[0]], [w.x[0], w.y, w.z[0]], [w.x[0], w.z[1], w.x[1], w.z[1], w.x[1], w.z[0], w.x[0], w.z[0]]);
    for (let i = 0; i < w.lotus; i++) {                          // daun teratai bertakik + bunga merah muda
      const x = w.x[0] + 0.6 + rng() * (w.x[1] - w.x[0] - 1.2), z = w.z[0] + 0.6 + rng() * (w.z[1] - w.z[0] - 1.2), r = 0.35 + rng() * 0.3;
      const ring: [number, number][] = [];
      for (let k = 0; k < 10; k++) { const a = (k / 10) * Math.PI * 1.85 + 0.2; ring.push([x + Math.cos(a) * r, z + Math.sin(a) * r]); }
      ring.push([x, z]);
      g.color(0x4f8a3c, 0.85 + rng() * 0.3); g.fan('paint', w.y + 0.012, ring);
      if (rng() < 0.5) { g.color(0xf09ab8); g.prismY('paint', x + 0.1, z, 0.12, w.y + 0.01, w.y + 0.22, 6, { rTop: 0.18 }); }
    }
  }
  // sungai (Utara, di luar tanggul): permukaan air lebar + tepi seberang
  g.color(0xffffff);
  g.quad('water', [-400, -0.7, 330], [400, -0.7, 330], [400, -0.7, 82], [-400, -0.7, 82], [-400, 330, 400, 330, 400, 82, -400, 82]);
  g.color(0x6f7a5a);
  g.quad('ground', [-400, -1.4, 82], [400, -1.4, 82], [400, -1.4, 81.9], [-400, -1.4, 81.9]);
}

/** Air terjun dari puncak tebing Timur, jatuh lewat sumur cahaya atap gua ke kolam: lembar aliran melengkung keluar dari bibir
 *  tebing + buih di kaki. */
export function emitWaterfall(g: Geo) {
  const x = 59.88, z0 = 6, z1 = 12, top = 13.9, bottom = 0.24;
  g.color(0xffffff);
  g.grid('fall', 6, 10, (s, t) => {
    const y = top - (top - bottom) * t, bulge = Math.sin(Math.min(1, t * 1.6) * Math.PI * 0.5) * 1.1 + t * 0.2;
    return [x - bulge, y, z0 + (z1 - z0) * s];
  }, (s, t) => [s * 2, t * 6], undefined, true);
  g.color(0xf4fbff);
  g.grid('fall', 8, 3, (s, t) => {
    const a = s * Math.PI, r = 1.2 + t * 2.4;
    return [x - 0.3 - Math.sin(a) * r, bottom + 0.03, (z0 + z1) / 2 - Math.cos(a) * (r + 2.2)];
  }, (s, t) => [s * 3, t * 2], undefined, true);
}

// ───────────────────────── tepian sungai, perahu, hiasan
/** Tanggul sungai: lis batu + tiang tambat kayu + tangga turun ke air (di luar area main). Jukung bercadik di sungai. */
export function emitRiverbank(g: Geo) {
  const rng = makeRng(4801);
  g.color(COL.andDark); g.box('stone', -60, 0, 80, 60, 1.05, 82, { sub: 4 });
  g.color(COL.andLight); g.box('stone', -60, 1.05, 80, 60, 1.2, 82.1, { sub: 4 });
  g.color(COL.andDark); g.box('stone', -60, -1.4, 82, 60, 1.05, 82.4, { skip: { ny: true } });
  g.color(COL.teakDark);
  for (let x = -56; x <= 56; x += 8) g.prismY('wood', x + rng(), 81, 0.16, 1.2, 2.3 + rng() * 0.4, 8, { smooth: true });
  // jukung: lambung ramping + cadik bambu kiri-kanan
  for (const [x, z, a] of [[-24, 88, 0.15], [-6, 92, -0.1], [18, 89, 0.3], [40, 94, -0.25], [-44, 95, 0.05]] as const) {
    g.pushAt(x, -0.65, z, a);
    g.color(0x6a4a34); g.box('wood', -3.4, 0, -0.45, 3.4, 0.55, 0.45, { grain: 0 });
    g.color(0xc9473a); g.box('paint', -3.6, 0.35, -0.48, 3.6, 0.5, 0.48);
    g.color(0x3a2a20); g.box('paint', -2.8, 0.45, -0.32, 2.8, 0.56, 0.32);
    g.color(COL.bamboo);
    for (const s of [-1, 1]) {
      g.box('wood', -2.2, 0.15, s * 2.1 - 0.12, 2.2, 0.32, s * 2.1 + 0.12, { grain: 0 });
      for (const bx of [-1.4, 1.4]) g.box('wood', bx - 0.08, 0.5, s < 0 ? -2.1 : 0.3, bx + 0.08, 0.6, s < 0 ? -0.3 : 2.1);
    }
    g.pop();
  }
  // tepi seberang: tanah berpohon kelapa & gubuk (siluet jauh)
  g.color(0x5f6e48); g.box('ground', -400, -1.2, 175, 400, 0.4, 330, { skip: { ny: true } });
  for (let i = 0; i < 26; i++) palm(g, -150 + i * 12 + rng() * 6, 178 + rng() * 10, 10 + rng() * 6, rng);
  for (let i = 0; i < 7; i++) {
    const x = -110 + i * 34 + rng() * 10;
    g.color(0x8a6a4a); g.box('wood', x - 2.5, 0.4, 180, x + 2.5, 3.2, 184);
    g.color(0x9a7a50); g.quad('weave', [x - 3, 3.2, 179.5], [x + 3, 3.2, 179.5], [x + 3, 5.2, 182], [x - 3, 5.2, 182]);
    g.quad('weave', [x + 3, 3.2, 184.5], [x - 3, 3.2, 184.5], [x - 3, 5.2, 182], [x + 3, 5.2, 182]);
  }
}

/** Penjor (bambu melengkung berhias janur) di kiri-kanan gerbang — tipis, tanpa collider. */
function penjor(g: Geo, x: number, z: number, lean: V3) {
  g.color(COL.bamboo);
  const pts: V3[] = [];
  for (let i = 0; i <= 6; i++) { const t = i / 6; pts.push([x + lean[0] * t * t * 3.2, t * 9, z + lean[2] * t * t * 3.2]); }
  for (let i = 0; i < 6; i++) limb(g, 'wood', pts[i], pts[i + 1], 0.09, 0.07);
  const top = pts[6];
  // sampian (hiasan janur) di ujung + rumbai janur menjuntai di sepanjang lengkung atas, kain poleng di tiang bawah
  g.color(0xead98e);
  for (let i = 2; i <= 6; i++) {
    const p = pts[i];
    for (const s of [-1, 1]) {
      const dx = s * 0.22, len = 0.7 + (6 - i) * 0.12;
      g.quad('paint', [p[0] + dx - 0.07, p[1] - len, p[2]], [p[0] + dx + 0.07, p[1] - len, p[2]], [p[0] + dx + 0.07, p[1], p[2]], [p[0] + dx - 0.07, p[1], p[2]], [0, 0, 1, 0, 1, 1, 0, 1], 1, 1, [0, 0, 1]);
      g.quad('paint', [p[0], p[1] - len, p[2] + dx - 0.07], [p[0], p[1] - len, p[2] + dx + 0.07], [p[0], p[1], p[2] + dx + 0.07], [p[0], p[1], p[2] + dx - 0.07], [0, 0, 1, 0, 1, 1, 0, 1], 1, 1, [1, 0, 0]);
    }
  }
  g.color(0xf0e2a0); g.prismY('paint', top[0], top[2], 0.32, top[1] - 1.1, top[1] - 0.2, 8, { rTop: 0.12 });
  g.color(0xd9473a); g.prismY('paint', top[0], top[2], 0.1, top[1] - 0.2, top[1] + 0.25, 6, { rTop: 0.02 });
  for (let i = 0; i < 4; i++) { g.color(i % 2 ? 0x1e1e1e : 0xf2f0ea); g.prismY('paint', x, z, 0.13, 0.6 + i * 0.3, 0.9 + i * 0.3, 8); }
}

/** Decal zona bom, prasasti gapura, penjor, sesaji, papan arah. */
export function emitDecor(g: Geo) {
  // decal zona: A di teras sisi Timur stupa, B di lantai pendopo
  const decal = (k: K, x: number, y: number, z: number, r: number) =>
    g.quad(k, [x - r, y, z + r], [x + r, y, z + r], [x + r, y, z - r], [x - r, y, z - r], [0, 1, 1, 1, 1, 0, 0, 0]);
  g.color(0xffffff);
  decal('decalA', -34.2, 3.015, -43, 2.6);
  decal('decalB', 40.9, 1.515, -43.5, 1.9);
  // prasasti di muka Utara menara gapura Barat (menghadap pasar)
  g.quad('sign', [-13.8, 2.6, 34.015], [-6.2, 2.6, 34.015], [-6.2, 4.5, 34.015], [-13.8, 4.5, 34.015], [0, 0, 1, 0, 1, 1, 0, 1], 1, 1, [0, 0, 1]);
  // penjor di gerbang tengah gapura (sisi pasar), gerbang wihara, gerbang dermaga
  penjor(g, -5.6, 34.6, [0.12, 0, 0.3]); penjor(g, 5.6, 34.6, [-0.12, 0, 0.3]);
  penjor(g, -5.6, -63.4, [0.1, 0, 0.3]); penjor(g, 5.6, -63.4, [-0.1, 0, 0.3]);
  penjor(g, -16.6, 63.4, [0.1, 0, -0.3]); penjor(g, 16.6, 63.4, [-0.1, 0, -0.3]);
  // sesaji (canang) di depan candi perwara & cetiya
  const rng = makeRng(4901);
  for (const [x, z] of [[-25, 19], [25, 19], [-25, -19.2], [25, -19.2], [0, -75.4], [0, 7], [-57.5, 42]] as const) {
    for (let i = 0; i < 3; i++) {
      const dx = (rng() - 0.5) * 1.2, dz = (rng() - 0.5) * 0.6;
      g.color(0x8ab05a); g.box('paint', x + dx - 0.16, 0.002, z + dz - 0.16, x + dx + 0.16, 0.05, z + dz + 0.16);
      g.color([0xf4f0e8, 0xe9572c, 0xf2c23a, 0xd8346a][i % 4]); g.box('paint', x + dx - 0.08, 0.05, z + dz - 0.08, x + dx + 0.08, 0.1, z + dz + 0.08);
    }
  }
}
