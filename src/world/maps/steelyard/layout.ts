// src/world/maps/steelyard/layout.ts — denah Steel Yard (C1): halaman kontainer gurun terbengkalai, satu lantai, luar ruang.
// Layout ORISINAL (tidak meniru map game lain). Nama ekspor di file ini = ANTARMUKA (dipakai index.ts, build.ts/visual (C2),
// nav.ts, test) — pertahankan namanya.
//
// Denah (atas = Utara/Merah, Z positif; kiri = Barat, X negatif) — sketsa lengkap di notes C1:
//   • Sudut SW/SE = "Gerbang Biru" (5 slot spawn tiap sudut di balik kontainer GERBANG yang sedikit miring), sudut NW/NE = "Gerbang
//     Merah". Tiap sudut punya 2 jalan keluar: Barat (ke Sayap/Lorong Kontainer) & Timur (ke Bangkai Mobil/Halaman Belakang).
//   • Halaman Belakang (tengah Selatan/Utara): kontainer 40 ft GUDANG di pagar + peti, palet, terpal; mulut Lorong Tengah.
//   • Jalur 1 — Sayap (pagar Barat/Timur): Lorong Kontainer (20 ft terbuka dua ujung, menempel pagar; di sampingnya kini
//     pelataran terbuka) → Tumpukan Palet → Pos Jaga (10 ft terbuka satu ujung + pintu terbuka, di garis tengah) → sisi lawan.
//   • Jalur 2 — Dalam: Bangkai Mobil (sedan di tengah halaman) → celah utara → Tengah (kontainer TENGAH) → gang Pos Jaga.
//   • Jalur 3 — Tengah: Lorong Tengah (20 ft terbuka, pintu terbuka, diapit SISI) → Gudang Spool → Menara Kontainer
//     (2 × 2 kontainer 20 ft tumpuk 2, landmark pusat) dilewati di kiri/kanan.
//   • Jalur 4 — Apit: Bangkai Mobil sisi timur → samping SISI → Gudang Spool → sudut Menara.
//   Setiap jalur U–S dipotong pelindung tinggi di |z| < 30 (lihat tests/steelyard.test.ts: garis pandang > 60 u jarang).
//   Revisi "terlalu rapat" (laporan pengguna): SEKAT, PEMBATAS & halangan kecil di jalur lari (drum, ban, peti) dibuang →
//   area yang mepet halangan (< 2 u) 50% → ±34%, jarak bebas median 2.0 → 2.6 u; garis pandang > 60 u tetap jarang.
//
// Konvensi:
//  • Satuan u (1 u = 0.36 m). Tanah y = 0. Biru di Selatan (z < 0), Merah di Utara (z > 0). Area main X ±42, Z ±56.
//  • Kontainer: pusat (cx, cz) di tanah; sumbu panjang = X LOKAL, lebar = Z lokal; rotY = putaran Y (konvensi three.js,
//    lokal → dunia: x = cx + lx·cos + lz·sin, z = cz − lx·sin + lz·cos). Ujung PINTU = +X lokal (arah dunia (cos, −sin)).
//    open 'none' = tertutup; 'ends' = kedua ujung terbuka (lorong); 'one' = hanya ujung +X terbuka (−X tertutup).
//    doorsOpen = daun pintu di ujung terbuka berayun 90° keluar (melanjutkan dinding samping sepanjang W/2).
//    stack 2 = kontainer kedua (tertutup) di atasnya (y 7.2…14.4), tidak bisa dipanjat.
//  • Cermin 4 kuadran (data ditulis untuk kuadran SW lalu dicerminkan): cermin X → rotY' = π − θ, cermin Z → −θ, X+Z → π + θ
//    (posisi x → −x / z → −z) — objek berarah (pintu kontainer, moncong mobil) ikut tercermin dengan benar. Objek di sumbu
//    z = 0 hanya dicerminkan X (sufiks _W/_E), di sumbu x = 0 hanya Z (_S/_N); objek kuadran bersufiks _SW/_SE/_NW/_NE.
//  • Box collider: min/max = kotak LOKAL di sekitar pusat, rotY di pusat (MapData.Box). Turunan murni dari SY (SY_BOXES).
//  • Tinggi pelindung mengikuti aturan anti head-glitch GDD §4.4 (pita terlarang 2.95–3.75 & 4.25–5.05): palet 0.4, tumpukan
//    palet 2.0, barrier 2.2, drum 2.4, spool 2.6, peti 2.8 (bukan 3.0 — mata jongkok 3.1 tetap di atasnya), tumpukan peti 5.6,
//    mobil 4.2 (mata berdiri 4.4 di atas atap), kontainer 7.2 / 14.4, pagar 9.
import type { SurfaceMaterial } from '../../../core/EventBus';
import { distToBoxXZ, type Box, type Cat, type SpawnFloor, type Style } from '../../MapData';

export interface SYContainer { id: string; cx: number; cz: number; rotY: number; size: 10 | 20 | 40;   // kaki
  color: number; open: 'none' | 'ends' | 'one'; doorsOpen: boolean; stack: 1 | 2 }                       // open: ujung terbuka (bisa dilewati)
export interface SYProp { id: string; kind: 'pallet' | 'palletStack' | 'spool' | 'crate' | 'crateStack' | 'barrier' | 'car' | 'drum'
  | 'tire' | 'tarpPile'; x: number; z: number; rotY: number; s?: number }
export interface SYPuddle { x: number; z: number; rx: number; rz: number; rotY: number }
export interface SYFence { id: string; a: [number, number]; b: [number, number]; h: number; tarp: boolean }  // a→b di tanah (y 0)

/** Ukuran nyata dalam u (1 u = 0.36 m). Kontainer: panjang per ukuran kaki; lebar, tinggi, tebal dinding sama; post = tiang sudut
 *  (penampang persegi; daun pintu = setengah lebar dikurangi tiang). */
export const SY_DIMS = {
  container: { len: { 10: 8.3, 20: 16.8, 40: 33.9 } as Record<10 | 20 | 40, number>, w: 6.8, h: 7.2, wall: 0.15, door: 0.12, post: 0.42 },
  // tapak (panjang X lokal × lebar Z lokal) & tinggi prop; spool/drum/ban = silinder (Ø × tinggi) → collider kotak sedikit di dalam.
  // Mobil: moncong = +X lokal. Peti 2.8 (bukan 3.0): lihat aturan §4.4 di atas.
  prop: {
    pallet: [3.3, 2.8, 0.4], palletStack: [3.3, 2.8, 2.0], spool: [3.4, 3.4, 2.6], crate: [3.0, 3.0, 2.8], crateStack: [3.0, 3.0, 5.6],
    barrier: [5.5, 1.6, 2.2], car: [13, 5, 4.2], drum: [1.6, 1.6, 2.4], tire: [2.4, 2.4, 0.9], tarpPile: [4.4, 3.4, 2.6],
  } as Record<SYProp['kind'], [number, number, number]>,
  /** Kabin sedan (lokal mobil, depan = +X) — SATU sumber visual & collider: dasar y0 → atap y1; kaca depan x front[0] (dasar) →
   *  front[1] (atap), kaca belakang rear[0] → rear[1], sisi ±side[0] → ±side[1]. */
  carCabin: { y0: 2.35, y1: 4.15, front: [2.3, 0.9], rear: [-3.6, -2.5], side: [2.25, 1.85] },
  /** Profil barrier Jersey (setengah lebar Z, tinggi) dari dasar ke puncak — visual (ekstrusi) & collider (2 balok). */
  jersey: [[0.8, 0], [0.8, 0.22], [0.42, 0.8], [0.28, 2.1], [0.2, 2.2]] as [number, number][],
  fenceThick: 0.6,
};

// ───────────────────────── cermin
const PI = Math.PI, ALONG_Z = PI / 2;
const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
/** Pose (x, z, rotY) tercermin: mx = cermin X (x → −x), mz = cermin Z (z → −z). Arah lokal +X ikut tercermin. */
export function mirrorPose(x: number, z: number, rotY: number, mx: boolean, mz: boolean): [number, number, number] {
  const rot = mx !== mz ? -rotY + (mx ? PI : 0) : rotY + (mx ? PI : 0);
  return [mx ? -x : x, mz ? -z : z, wrapAngle(rot)];
}

/** Salinan cermin: 'Q' = 4 kuadran (data = SW → _SW/_SE/_NW/_NE), 'X' = sumbu z = 0 (data = W → _W/_E),
 *  'Z' = sumbu x = 0 (data = S → _S/_N). [sufiks, cermin X, cermin Z]. */
type Mode = 'Q' | 'X' | 'Z';
const COPIES: Record<Mode, [string, boolean, boolean][]> = {
  Q: [['_SW', false, false], ['_SE', true, false], ['_NW', false, true], ['_NE', true, true]],
  X: [['_W', false, false], ['_E', true, false]],
  Z: [['_S', false, false], ['_N', false, true]],
};
/** Warna per salinan: satu warna, atau satu warna per salinan (urutan COPIES). */
type KDef = Omit<SYContainer, 'color'> & { color: number | number[] };
const noNegZero = (v: number) => (v === 0 ? 0 : v);

/** Id dasar (tanpa sufiks salinan) & apakah salinan ini cermin GANJIL (hanya X atau hanya Z: kiri ↔ kanan lokal tertukar —
 *  pose cermin = putar rotY' lalu balik Z lokal). Visual beracak dengan siluet penting (tumpukan terpal) memakai benih id dasar +
 *  balik Z lokal pada salinan ganjil → bayangan cermin persis (adil Biru ↔ Merah). Salinan XZ = putar 180° (tanpa balik). */
export function mirrorInfo(id: string): { base: string; flip: boolean } {
  const m = /_(SW|SE|NW|NE|W|E|S|N)$/.exec(id);
  if (!m) return { base: id, flip: false };
  const copy = Object.values(COPIES).flat().find(([suf]) => suf === `_${m[1]}`)!;
  return { base: id.slice(0, -m[0].length), flip: copy[1] !== copy[2] };
}

const kExpand = (mode: Mode, list: KDef[]): SYContainer[] => list.flatMap(k => COPIES[mode].map(([suf, mx, mz], i) => {
  const [cx, cz, rotY] = mirrorPose(k.cx, k.cz, k.rotY, mx, mz);
  return { ...k, id: k.id + suf, cx: noNegZero(cx), cz: noNegZero(cz), rotY, color: Array.isArray(k.color) ? k.color[i] : k.color };
}));
const pExpand = (mode: Mode, list: SYProp[]): SYProp[] => list.flatMap(p => COPIES[mode].map(([suf, mx, mz]) => {
  const [x, z, rotY] = mirrorPose(p.x, p.z, p.rotY, mx, mz);
  return { ...p, id: p.id + suf, x: noNegZero(x), z: noNegZero(z), rotY };
}));

// palet cat pudar
const K = {
  krem: 0xb7a888, abu: 0x8b8f8c, coklat: 0x8a6a52, biru: 0x5f7690, biruTua: 0x4f6a7d, merah: 0x9a4c3c, merahTua: 0x84443a,
  hijau: 0x6d7a5e, karat: 0xb7703f, putih: 0xc4c0b4, kuning: 0xb59a4a, teal: 0x5d7d78,
};

// ───────────────────────── kontainer
/** Kuadran SW (dicerminkan ke SE/NW/NE). */
const C_QUAD: KDef[] = [
  // perisai spawn — sedikit miring (ujung timur naik ke utara), warna tim
  { id: 'GERBANG', cx: -27.8, cz: -40.8, rotY: -0.18, size: 20, color: [K.biru, K.biruTua, K.merah, K.merahTua], open: 'none', doorsOpen: false, stack: 1 },
  // Lorong Kontainer sayap: menempel pagar, terbuka dua ujung (dalam 6.5 × 6.9 u); pelataran di sampingnya terbuka (SEKAT dibuang)
  { id: 'LORONG', cx: -38.6, cz: -21.0, rotY: ALONG_Z, size: 20, color: [K.karat, K.hijau, K.karat, K.hijau], open: 'ends', doorsOpen: false, stack: 1 },
  // pengapit Lorong Tengah
  { id: 'SISI', cx: -6.8, cz: -28.0, rotY: ALONG_Z, size: 20, color: [K.coklat, K.teal, K.teal, K.coklat], open: 'none', doorsOpen: false, stack: 1 },
];
/** Sumbu x = 0 (Selatan, dicerminkan ke Utara). */
const C_AXIS_Z: KDef[] = [
  // Lorong Tengah: terbuka dua ujung + pintu terbuka (corong di depan mulut)
  { id: 'LORONG_T', cx: 0, cz: -28.0, rotY: ALONG_Z, size: 20, color: K.abu, open: 'ends', doorsOpen: true, stack: 1 },
  // Menara Kontainer: 2 × 2 kontainer 20 ft (tumpuk 2) — landmark pusat 16.8 × 13.6 × 14.4, dua kontainer bersentuhan di z = 0
  { id: 'MENARA', cx: 0, cz: -3.4, rotY: 0, size: 20, color: [K.biru, K.merah], open: 'none', doorsOpen: false, stack: 2 },
  // kontainer 40 ft di pagar belakang (latar Halaman Belakang, warna tim)
  { id: 'GUDANG', cx: 0, cz: -52.6, rotY: 0, size: 40, color: [K.biruTua, K.merahTua], open: 'none', doorsOpen: false, stack: 1 },
];
/** Sumbu z = 0 (Barat, dicerminkan ke Timur). */
const C_AXIS_X: KDef[] = [
  // Pos Jaga: 10 ft terbuka di ujung yang menghadap tengah map, pintu terbuka (ruang kecil 8 × 6.5 u)
  { id: 'POS', cx: -37.85, cz: 0, rotY: 0, size: 10, color: [K.hijau, K.kuning], open: 'one', doorsOpen: true, stack: 1 },
  // pelindung keras di Tengah Barat/Timur — memisahkan jalur Pos Jaga & jalur Menara
  { id: 'TENGAH', cx: -21.0, cz: 0, rotY: 0, size: 10, color: [K.krem, K.coklat], open: 'none', doorsOpen: false, stack: 1 },
];

// ───────────────────────── prop (kuadran SW + sumbu)
const P_QUAD: SYProp[] = [
  // Gerbang (sudut spawn)
  { id: 'PETI_SUDUT', kind: 'crateStack', x: -39.9, z: -53.9, rotY: 0 },
  { id: 'DRUM_A', kind: 'drum', x: -40.9, z: -45.0, rotY: 0 }, { id: 'DRUM_B', kind: 'drum', x: -40.9, z: -46.8, rotY: 0.6 },
  { id: 'BAN_SUDUT', kind: 'tire', x: -19.4, z: -54.6, rotY: 0.3 },
  // Halaman Belakang
  { id: 'PALET_BL', kind: 'palletStack', x: -5.4, z: -46.6, rotY: 0.2 },
  { id: 'PETI_BL', kind: 'crateStack', x: -9.6, z: -46.4, rotY: 0.1 },
  // Sayap (lorong antara GERBANG & Lorong Kontainer)
  { id: 'BARIER_SY', kind: 'barrier', x: -31.4, z: -30.6, rotY: 0 },
  // Bangkai Mobil (halaman dalam): sedan membujur U–S, moncong ke selatan
  { id: 'MOBIL', kind: 'car', x: -19.0, z: -26.0, rotY: ALONG_Z + 0.22 },
  { id: 'PALET_HM', kind: 'pallet', x: -16.6, z: -34.2, rotY: 0.6 }, { id: 'PALET_HM2', kind: 'pallet', x: -24.8, z: -21.6, rotY: 0.3 },
  // Tumpukan Palet (pelataran di utara Lorong Kontainer)
  { id: 'PALET_PG', kind: 'palletStack', x: -40.0, z: -7.4, rotY: 0.15 },
  { id: 'PETI_PG', kind: 'crate', x: -34.6, z: -5.6, rotY: 0.25 },
  // Gudang Spool (pelataran di depan Lorong Tengah)
  { id: 'SPOOL', kind: 'spool', x: -3.6, z: -9.4, rotY: 0 },
];
const P_AXIS_Z: SYProp[] = [
  { id: 'TERPAL', kind: 'tarpPile', x: 0, z: -46.4, rotY: 0 },
];

const containers: SYContainer[] = [...kExpand('Q', C_QUAD), ...kExpand('Z', C_AXIS_Z), ...kExpand('X', C_AXIS_X)];
const props: SYProp[] = [...pExpand('Q', P_QUAD), ...pExpand('Z', P_AXIS_Z)];

// ───────────────────────── pagar keliling (tiang kayu + terpal; dipecah per bentang agar visual bervariasi). Muka dalam collider
// tepat di |x| = 42 / |z| = 56 (tebal 0.6); LORONG, POS & GUDANG menempel muka itu. Dua bentang panel seng (tarp: false) sebagai
// penanda orientasi, simetris titik: Barat sisi Biru (W1) ↔ Timur sisi Merah (E4).
const F = 42.3, G = 56.3, FH = 9;
const fences: SYFence[] = [
  ...[[-F, -14], [-14, 14], [14, F]].flatMap(([a, b], i) => [
    { id: `PAGAR_S${i + 1}`, a: [a, -G], b: [b, -G], h: FH, tarp: true } as SYFence,
    { id: `PAGAR_N${i + 1}`, a: [a, G], b: [b, G], h: FH, tarp: true } as SYFence]),
  ...[[-G, -28], [-28, 0], [0, 28], [28, G]].flatMap(([a, b], i) => [
    { id: `PAGAR_W${i + 1}`, a: [-F, a], b: [-F, b], h: FH, tarp: i !== 0 } as SYFence,
    { id: `PAGAR_E${i + 1}`, a: [F, a], b: [F, b], h: FH, tarp: i !== 3 } as SYFence]),
];

/** Genangan (visual saja): di tanah lapang, tidak menyentuh tapak collider (diuji). */
const puddles: SYPuddle[] = [
  { x: -21.6, z: -33.6, rx: 2.4, rz: 1.2, rotY: 0.25 }, { x: -13.6, z: -22.6, rx: 1.4, rz: 0.9, rotY: 1.0 },
  { x: -36.2, z: -9.6, rx: 1.8, rz: 1.2, rotY: -0.3 }, { x: -5.6, z: -15.4, rx: 1.6, rz: 1.0, rotY: 0.4 },
  { x: -12.8, z: 3.0, rx: 1.4, rz: 2.0, rotY: 0.2 }, { x: 23.4, z: -6.6, rx: 2.0, rz: 0.9, rotY: -0.1 },
  { x: 6.0, z: -42.6, rx: 2.4, rz: 1.1, rotY: 0.1 }, { x: -4.8, z: 42.4, rx: 1.9, rz: 1.0, rotY: -0.3 },
  { x: 31.0, z: 33.4, rx: 2.2, rz: 1.1, rotY: 0.2 }, { x: -29.6, z: 34.2, rx: 1.7, rz: 1.0, rotY: -0.4 },
  { x: 14.2, z: 29.0, rx: 1.7, rz: 1.1, rotY: 0.7 }, { x: -38.6, z: 33.6, rx: 1.5, rz: 1.0, rotY: 0 },
];

const B = { x: [-42, 42] as [number, number], z: [-56, 56] as [number, number] };
export const SY: { containers: SYContainer[]; props: SYProp[]; puddles: SYPuddle[]; fences: SYFence[];
  bounds: { x: [number, number]; z: [number, number] } } = { containers, props, puddles, fences, bounds: B };

// ───────────────────────── collider (fungsi murni dari SY)
/** Kotak lokal (x0..x1 sepanjang X lokal, z0..z1 sepanjang Z lokal) objek berpusat (cx, cz) berputar rotY → Box (rotY di pusat
 *  kotak itu sendiri; pusat kotak dihitung dari offset lokal). Putaran dinormalkan ke (−π/2, π/2] (kotak simetris 180°);
 *  kelipatan π/2 → kotak sejajar sumbu tanpa rotY. */
function localBox(id: string, cat: Cat, style: Style, cx: number, cz: number, rotY: number,
  x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): Box {
  const c = Math.cos(rotY), s = Math.sin(rotY), lx = (x0 + x1) / 2, lz = (z0 + z1) / 2;
  const wx = cx + lx * c + lz * s, wz = cz - lx * s + lz * c;
  let r = rotY % PI;
  if (r > PI / 2) r -= PI; else if (r <= -PI / 2) r += PI;
  const quarter = Math.abs(Math.abs(r) - PI / 2) < 1e-6;
  const hx = (quarter ? z1 - z0 : x1 - x0) / 2, hz = (quarter ? x1 - x0 : z1 - z0) / 2;
  const b: Box = { id, cat, min: [wx - hx, y0, wz - hz], max: [wx + hx, y1, wz + hz], style };
  if (!quarter && Math.abs(r) > 1e-6) b.rotY = r;
  return b;
}

/** Collider satu kontainer: tertutup = satu balok; terbuka = dinding samping + atap (+ dinding belakang 'one') + 4 tiang sudut
 *  (penampang `post`, menonjol ke dalam melewati dinding samping tipis — sama dengan visual) + daun pintu (panjang = setengah
 *  lebar − tiang, sama dengan daun visual; engsel di sudut luar). */
export function containerBoxes(k: SYContainer): Box[] {
  const D = SY_DIMS.container, L = D.len[k.size], W = D.w, H = D.h, t = D.wall, P = D.post, hl = L / 2, hw = W / 2;
  const at = (id: string, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) =>
    localBox(`${k.id}:${id}`, 'wall', 'steel', k.cx, k.cz, k.rotY, x0, x1, y0, y1, z0, z1);
  const out: Box[] = [];
  if (k.open === 'none') out.push(at('body', -hl, hl, 0, H, -hw, hw));
  else {
    out.push(at('sideL', -hl, hl, 0, H, -hw, -hw + t), at('sideR', -hl, hl, 0, H, hw - t, hw), at('roof', -hl, hl, H - t, H, -hw + t, hw - t));
    if (k.open === 'one') out.push(at('back', -hl, -hl + t, 0, H - t, -hw + t, hw - t));
    for (const end of [1, -1]) for (const sd of [-1, 1]) {
      const x0 = end > 0 ? hl - P : -hl, z0 = sd > 0 ? hw - P : -hw;
      out.push(at(`post${end > 0 ? 'F' : 'B'}${sd > 0 ? 'R' : 'L'}`, x0, x0 + P, 0, H, z0, z0 + P));
    }
    if (k.doorsOpen) for (const end of k.open === 'ends' ? [1, -1] : [1]) {
      const x0 = end > 0 ? hl : -hl - hw + P, x1 = end > 0 ? hl + hw - P : -hl;
      out.push(at(`door${end > 0 ? 'F' : 'B'}L`, x0, x1, 0, H, -hw, -hw + D.door), at(`door${end > 0 ? 'F' : 'B'}R`, x0, x1, 0, H, hw - D.door, hw));
    }
  }
  if (k.stack === 2) out.push(at('stack', -hl, hl, H, 2 * H, -hw, hw));
  return out;
}

/** Batas tingkat kabin mobil (di atas badan h·0.55): 2.9 & 3.8 sengaja di LUAR pita head-glitch §4.4 (2.95–3.75). */
const CABIN_STEPS = [2.9, 3.8];

/** Collider prop: kotak tapak × tinggi, mengikuti visual agar tidak ada "dinding tak terlihat":
 *  • mobil = badan + kabin 3 tingkat yang meruncing mengikuti kaca depan/belakang & sisi miring (SY_DIMS.carCabin; tiap tingkat
 *    selebar profil di tengah tingginya → galat ≤ 0.35 u, dulu satu balok menonjol 1.26 u di depan kaca);
 *  • barrier Jersey = kaki lebar rendah + badan ramping setinggi penuh (keduanya dari tanah; profil SY_DIMS.jersey);
 *  • spool = dua kotak (lurus + diputar 45°) → bintang 8 di dalam piringan Ø (tidak menonjol di diagonal);
 *  • drum/ban = kotak 0.85 × Ø; sisanya kotak tapak penuh. Palet/ban kategori 'prop' (rendah), sisanya 'cover'. */
export function propBoxes(p: SYProp): Box[] {
  const s = p.s ?? 1, [l, w, h] = SY_DIMS.prop[p.kind].map(v => v * s), hl = l / 2, hw = w / 2;
  const style: Style = p.kind === 'barrier' ? 'concrete' : p.kind === 'car' ? 'vehicle' : p.kind === 'drum' ? 'steel'
    : p.kind === 'tire' ? 'rubber' : p.kind === 'tarpPile' ? 'fabric' : 'timber';
  const cat: Cat = p.kind === 'pallet' || p.kind === 'tire' ? 'prop' : 'cover';
  const at = (id: string, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, rot = p.rotY) =>
    localBox(`${p.id}:${id}`, cat, style, p.x, p.z, rot, x0, x1, y0, y1, z0, z1);
  if (p.kind === 'car') {
    const C = SY_DIMS.carCabin, ys = [h * 0.55, ...CABIN_STEPS.map(y => y * s), h];
    const out = [at('body', -hl, hl, 0, h * 0.55, -hw, hw)];
    for (let i = 0; i + 1 < ys.length; i++) {
      const f = Math.min(1, Math.max(0, ((ys[i] + ys[i + 1]) / 2 / s - C.y0) / (C.y1 - C.y0)));   // profil di tengah tingkat
      const lerp = (a: number[]) => (a[0] + (a[1] - a[0]) * f) * s;
      out.push(at(`cabin${i}`, lerp(C.rear), lerp(C.front), ys[i], ys[i + 1], -lerp(C.side), lerp(C.side)));
    }
    return out;
  }
  if (p.kind === 'barrier') {
    const J = SY_DIMS.jersey, foot = (J[1][0] + J[2][0]) / 2 * s, wall = (J[2][0] + J[3][0]) / 2 * s;   // kaki miring & badan
    return [at('foot', -hl, hl, 0, J[2][1] * s, -foot, foot), at('body', -hl, hl, 0, h, -wall, wall)];
  }
  if (p.kind === 'spool') {
    const r = hl / Math.SQRT2;                                    // sudut kotak tepat di tepi piringan
    return [at('body', -r, r, 0, h, -r, r), at('body45', -r, r, 0, h, -r, r, p.rotY + Math.PI / 4)];
  }
  const k = p.kind === 'drum' || p.kind === 'tire' ? 0.85 : 1;   // silinder → kotak di dalam
  return [at('body', -hl * k, hl * k, 0, h, -hw * k, hw * k)];
}

/** Collider pagar: balok tipis sepanjang a→b (tanpa rotY bila sejajar sumbu). */
export function fenceBox(f: SYFence): Box {
  const dx = f.b[0] - f.a[0], dz = f.b[1] - f.a[1], len = Math.hypot(dx, dz), t = SY_DIMS.fenceThick / 2;
  const cx = (f.a[0] + f.b[0]) / 2, cz = (f.a[1] + f.b[1]) / 2;
  if (Math.abs(dz) < 1e-6) return { id: f.id, cat: 'shell', min: [cx - len / 2, 0, cz - t], max: [cx + len / 2, f.h, cz + t], style: 'fence' };
  if (Math.abs(dx) < 1e-6) return { id: f.id, cat: 'shell', min: [cx - t, 0, cz - len / 2], max: [cx + t, f.h, cz + len / 2], style: 'fence' };
  return { id: f.id, cat: 'shell', min: [cx - len / 2, 0, cz - t], max: [cx + len / 2, f.h, cz + t], style: 'fence', rotY: Math.atan2(-dz, dx) };
}

/** Semua collider statis (tanah tersembunyi + pagar + kontainer + prop) — diturunkan dari SY. */
export function deriveBoxes(sy: typeof SY): Box[] {
  return [
    { id: 'GROUND', cat: 'shell', min: [-80, -1, -90], max: [80, 0, 90], style: 'hidden' },
    ...sy.fences.map(fenceBox),
    ...sy.containers.flatMap(containerBoxes),
    ...sy.props.flatMap(propBoxes),
  ];
}
export const SY_BOXES: Box[] = deriveBoxes(SY);

// ───────────────────────── spawn
/** Gerbang SW: 5 slot di balik GERBANG (≥ 1.2 u dari collider, tanpa garis pandang ke slot Merah — diuji). */
const SLOTS_SW: [number, number, number][] = [[-34, 0, -51.5], [-31, 0, -48.5], [-28, 0, -51.5], [-25, 0, -48.5], [-22, 0, -51.5]];
const mirrorSlots = (l: [number, number, number][], mx: boolean, mz: boolean) => l.map(([x, y, z]) => [mx ? -x : x, y, mz ? -z : z] as [number, number, number]);
/** 10 slot per tim di lantai dasar (5 per sudut: Biru SW+SE, Merah NW+NE); 'upper' kosong (SpawnSystem memakai 'ground'). */
export const SY_SPAWNS: Record<'blue' | 'red', Record<SpawnFloor, [number, number, number][]>> = {
  blue: { upper: [], ground: [...SLOTS_SW, ...mirrorSlots(SLOTS_SW, true, false)] },
  red: { upper: [], ground: [...mirrorSlots(SLOTS_SW, false, true), ...mirrorSlots(SLOTS_SW, true, true)] },
};

// ───────────────────────── nama area (callout di bawah radar)
/** Nama area untuk HUD. Selatan = sisi Biru, Utara = sisi Merah; Barat/Timur menurut tanda X. */
export function syZoneName(x: number, _y: number, z: number): string {
  const side = z < 0 ? 'Biru' : 'Merah', wx = x < 0 ? 'Barat' : 'Timur', ax = Math.abs(x), az = Math.abs(z);
  if (ax <= 8.4 && az <= 6.8) return 'Menara Kontainer';
  if (ax >= 25.2 && az <= 3.4) return `Pos Jaga ${wx}`;                                   // ruang pos + gang di depannya
  if (ax <= 3.4 && az >= 19.6 && az <= 36.4) return `Lorong Tengah ${side}`;
  if (ax >= 35.2 && az >= 12.6 && az <= 29.4) return `Lorong Kontainer ${wx} · ${side}`;
  if (az >= 37.4) return ax >= 17 ? `Gerbang ${side} · ${wx}` : `Halaman Belakang ${side}`;
  if (az >= 29.4) return ax >= 19.4 ? `Sayap ${wx} · ${side}` : ax >= 10.2 ? `Bangkai Mobil ${wx} · ${side}` : `Halaman Belakang ${side}`;
  if (az >= 16.4) return ax >= 28.4 ? `Sayap ${wx} · ${side}` : ax >= 10.2 ? `Bangkai Mobil ${wx} · ${side}` : `Gudang Spool ${side}`;
  if (az >= 3.4 && ax >= 28.4) return `Tumpukan Palet ${wx} · ${side}`;
  if (ax < 10.2 && az >= 6.8) return `Gudang Spool ${side}`;
  return `Tengah ${wx}`;
}

// ───────────────────────── material permukaan
/** Tapak utuh tiap kontainer (termasuk tumpukan): lantai dalam kontainer terbuka, dinding & atap = logam. */
const CONTAINER_FOOT: Box[] = SY.containers.map(k => {
  const D = SY_DIMS.container, hl = D.len[k.size] / 2;
  return localBox(k.id, 'wall', 'steel', k.cx, k.cz, k.rotY, -hl, hl, 0, D.h * k.stack, -D.w / 2, D.w / 2);
});
/** Daun pintu terbuka (di luar tapak kontainer). */
const DOOR_LEAVES: Box[] = SY.containers.flatMap(containerBoxes).filter(b => /:door/.test(b.id));
const PROP_SURFACE: Record<SYProp['kind'], SurfaceMaterial> = {
  pallet: 'wood', palletStack: 'wood', crate: 'wood', crateStack: 'wood', spool: 'wood',
  barrier: 'sand', tire: 'sand', car: 'metal', drum: 'metal', tarpPile: 'carpet',
};
const PROP_FOOT: { b: Box; m: SurfaceMaterial }[] = SY.props.flatMap(p => propBoxes(p).map(b => ({ b, m: PROP_SURFACE[p.kind] })));
const FENCE_FOOT: { b: Box; m: SurfaceMaterial }[] = SY.fences.map(f => ({ b: fenceBox(f), m: f.tarp ? 'carpet' : 'metal' }));

/** Tanah = beton berdebu ('sand'); di dalam / dinding / atas kontainer = 'metal'; palet & peti & spool = 'wood'; mobil & drum =
 *  'metal'; barrier & ban = 'sand'; terpal (tumpukan & pagar keliling) = 'carpet'; panel seng pagar = 'metal'; di atas tanah di
 *  luar pagar = latar padat (tumpukan kontainer, gudang seng — collider dari visual/backdrop) = 'metal'. */
export function sySurfaceAt(x: number, y: number, z: number): SurfaceMaterial {
  for (const b of CONTAINER_FOOT) if (y < b.max[1] + 0.5 && distToBoxXZ(b, x, z) < 0.05) return 'metal';
  for (const b of DOOR_LEAVES) if (y < b.max[1] + 0.5 && distToBoxXZ(b, x, z) < 0.05) return 'metal';
  if (y > 0.05) for (const { b, m } of PROP_FOOT) if (y < b.max[1] + 0.5 && distToBoxXZ(b, x, z) < 0.05) return m;
  if (y > 0.1 && (Math.abs(x) > 41.9 || Math.abs(z) > 55.9)) {
    for (const { b, m } of FENCE_FOOT) if (distToBoxXZ(b, x, z) < 0.15) return m;
    if (Math.abs(x) > 42.6 || Math.abs(z) > 56.6) return 'metal';
  }
  return 'sand';
}

// ───────────────────────── latihan, kamera menu, probe pantulan
/** Mode Latihan: [x, y, z, bergerak kiri-kanan ±5 u] — dummy tim Merah (menghadap Selatan). Jarak 10–70 u dari slot Biru
 *  terdekat; semuanya di titik bebas (node nav), target bergerak di Gudang Spool Selatan & Utara. */
export const SY_PRACTICE: [number, number, number, boolean][] = [
  [-25.4, 0, -33.0, false], [-14.0, 0, -34.6, false], [25.6, 0, -25.0, false], [-12.8, 0, -26.5, false],
  [-31.0, 0, -8.4, false], [-21.6, 0, -6.4, false], [7.4, 0, -12.2, false], [27.6, 0, 0, false],
  [-12.6, 0, 0, false], [-24.4, 0, 12.6, false],
  [0, 0, -13.0, true], [0, 0, 13.0, true],
];
/** Kamera menu: orbit di atas pagar mengelilingi Menara Kontainer. */
export const SY_MENU_CAM: { look: [number, number, number]; rx: number; rz: number; y: number } = { look: [0, 4, 0], rx: 36, rz: 48, y: 24 };
/** CubeCamera pantulan: udara terbuka di atas Gudang Spool Selatan (di atas atap kontainer 7.2). */
export const SY_ENV_PROBE: [number, number, number] = [0, 9.5, -18];
