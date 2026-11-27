// src/world/maps/meridian/emit.ts — geometri visual Meridian Vault (koordinat DUNIA, ke bucket Geo per material). Rupa dari gaya
// balok denah (MV_BOXES 'm_*') + tangga + dekorasi tanpa collider (skylight, jendela melengkung, lampu, plafon kaset Site A, panel
// kotak deposit, strip lampu merah brankas, monitor CCTV, decal A/B, papan nama). Rupa mengikuti tapak collider. Dipanggil saat
// membangun map (alokasi bebas).
import { stairFrame, type Box } from '../../MapData';
import { Geo, type BoxOpts } from '../steelyard/visual/geo';
import { MV_BOUNDS, MV_LAMPS, MV_SKYLIGHTS, MV_SITES, MV_STAIRS, MV_WINDOWS } from './layout';
import type { MvMat } from './visual';

const C = {
  navy: 0x24324f, navyDark: 0x1b263d, cream: 0xe8dfcf, white: 0xf3efe8, ceil: 0xf1ece2, gold: 0xf0cf72, goldDark: 0xc9a04a,
  steel: 0x8e959d, steelDark: 0x4a5058, marble: 0xffffff, marbleGrey: 0xc9c6c0, carpet: 0x2f4f99, carpetDark: 0x24396f,
  crateG: 0xa6b3ad, crateR: 0x7d2620, crateBlack: 0x26282b, crateB: 0x2f5f9e, woodBarr: 0x9b6b43, woodDark: 0x6a4a30,
  sky: 0xd6ecff, skyEdge: 0xf6fbff, lamp: 0xfff1d2, redStrip: 0xff3b30, screen: 0x6fa8e0, screen2: 0x9fd0ff,
  windowSky: 0xe4f1ff, deskTop: 0xece6da,
} as const;

type K = MvMat;
const SUB: BoxOpts = { sub: 2 };

function bx(g: Geo, key: K, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, col: number, o: BoxOpts = {}, mul = 1) {
  if (x1 - x0 < 1e-4 || y1 - y0 < 1e-4 || z1 - z0 < 1e-4) return;
  g.color(col, mul);
  g.box(key, x0, y0, z0, x1, y1, z1, o);
}

/** Bidang mendatar dipecah petak 2 u; skip(cx, cz) = lewati petak (tertutup massa / lubang skylight). */
function flat(g: Geo, key: K, col: number, x0: number, x1: number, z0: number, z1: number, y: number, up: boolean, skip: (cx: number, cz: number) => boolean) {
  g.color(col);
  for (let x = x0; x < x1 - 1e-6; x += 2) for (let z = z0; z < z1 - 1e-6; z += 2) {
    const a = x, b = Math.min(x1, x + 2), c = z, d = Math.min(z1, z + 2);
    if (skip((a + b) / 2, (c + d) / 2)) continue;
    if (up) g.quad(key, [a, y, d], [b, y, d], [b, y, c], [a, y, c], [a, d, b, d, b, c, a, c], 1, 1, [0, 1, 0]);
    else g.quad(key, [a, y, c], [b, y, c], [b, y, d], [a, y, d], [a, c, b, c, b, d, a, d], 1, 1, [0, -1, 0]);
  }
}

const inside = (b: Box, x: number, y: number, z: number) =>
  x > b.min[0] && x < b.max[0] && y > b.min[1] && y < b.max[1] && z > b.min[2] && z < b.max[2];

/** Dinding/massa: wainscot navy 0…3.2 di atas lantai, lis emas, plester krem di atasnya; lantai atas (dek/balkon 6.5) juga
 *  mendapat wainscot bila dinding berbatasan dengan ruang tinggi Mid/Atrium. */
function wall(g: Geo, b: Box) {
  const [x0, y0, z0] = b.min, [x1, y1, z1] = b.max;
  const bands: [number, number, number, K][] = [];   // [ya, yb, warna, bucket]
  const levels = [0];
  if (y0 <= 6.5 && y1 >= 9.8 && x1 > -14 && z1 > 4) levels.push(6.5);
  let y = y0;
  for (const L of levels) {
    if (y1 <= L || y0 >= L + 3.35) continue;
    if (y < L) { bands.push([y, L, C.cream, 'plaster']); y = L; }
    const top = Math.min(y1, L + 3.2);
    if (top > y) { bands.push([y, top, C.navy, 'plaster']); y = top; }
    const gt = Math.min(y1, L + 3.35);
    if (gt > y) { bands.push([y, gt, C.gold, 'gold']); y = gt; }
  }
  if (y < y1) bands.push([y, y1, C.cream, 'plaster']);
  for (const [a, c, col, key] of bands) bx(g, key, x0, a, z0, x1, c, z1, col, key === 'plaster' ? SUB : {});
}

/** Pilar marmer persegi (map x2: aula West Long & penyangga balkon Atrium B): umpak marmer + lis emas, batang marmer dengan lis
 *  emas setinggi wainscot, kepala pilar emas. Rupa di dalam tapak collider (umpak & kepala = tapak penuh, batang menjorok 0.15). */
function column(g: Geo, b: Box) {
  const [x0, y0, z0] = b.min, [x1, y1, z1] = b.max, e = 0.15, top = y1 - 0.55;
  bx(g, 'marble', x0, y0, z0, x1, y0 + 0.35, z1, C.marbleGrey);
  bx(g, 'gold', x0 + 0.05, y0 + 0.35, z0 + 0.05, x1 - 0.05, y0 + 0.5, z1 - 0.05, C.goldDark);
  bx(g, 'marble', x0 + e, y0 + 0.5, z0 + e, x1 - e, top, z1 - e, C.marble, SUB);
  if (top > 3.4) bx(g, 'gold', x0 + e - 0.03, 3.2, z0 + e - 0.03, x1 - e + 0.03, 3.35, z1 - e + 0.03, C.gold);
  bx(g, 'gold', x0 + 0.05, top, z0 + 0.05, x1 - 0.05, top + 0.2, z1 - 0.05, C.gold);
  bx(g, 'marble', x0, top + 0.2, z0, x1, y1, z1, C.white);
}

/** Ambang pintu (lintel): plester krem + lis emas di tepi bawah. */
function lintel(g: Geo, b: Box) {
  const [x0, y0, z0] = b.min, [x1, y1, z1] = b.max;
  bx(g, 'gold', x0, y0, z0, x1, Math.min(y1, y0 + 0.18), z1, C.gold);
  bx(g, 'plaster', x0, Math.min(y1, y0 + 0.18), z0, x1, y1, z1, C.cream, SUB);
}

/** Platform/dek/panggung: sisi marmer + lis emas, atas karpet biru dengan pinggiran marmer. */
function platform(g: Geo, b: Box, carpetCol: number) {
  const [x0, y0, z0] = b.min, [x1, y1, z1] = b.max;
  bx(g, 'marble', x0, y0, z0, x1, y1 - 0.12, z1, C.marbleGrey, SUB);
  bx(g, 'gold', x0, y1 - 0.12, z0, x1, y1 - 0.02, z1, C.goldDark, { skip: { py: true, ny: true } });
  bx(g, 'marble', x0, y1 - 0.02, z0, x1, y1, z1, C.marble, { skip: { py: true, ny: true } });
  g.color(C.marble);
  g.quad('marble', [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [x0, z1, x1, z1, x1, z0, x0, z0], 1, 1, [0, 1, 0]);
  const e = 0.35;
  if (x1 - x0 > 2 * e && z1 - z0 > 2 * e) {
    g.color(carpetCol);
    const yy = y1 + 0.006;
    for (let x = x0 + e; x < x1 - e - 1e-6; x += 2) for (let z = z0 + e; z < z1 - e - 1e-6; z += 2) {
      const a = x, bb = Math.min(x1 - e, x + 2), c = z, d = Math.min(z1 - e, z + 2);
      g.quad('carpet', [a, yy, d], [bb, yy, d], [bb, yy, c], [a, yy, c], [a, d, bb, d, bb, c, a, c], 1, 1, [0, 1, 0]);
    }
  }
}

/** Pelat balkon: bawah plester putih (plafon galeri), tepi marmer + lis emas, atas karpet. */
function slab(g: Geo, b: Box) {
  const [x0, y0, z0] = b.min, [x1, y1, z1] = b.max;
  bx(g, 'plaster', x0, y0, z0, x1, y1 - 0.12, z1, C.ceil, SUB);
  bx(g, 'gold', x0, y1 - 0.12, z0, x1, y1 - 0.04, z1, C.gold, { skip: { py: true, ny: true } });
  bx(g, 'marble', x0, y1 - 0.04, z0, x1, y1, z1, C.marble, { skip: { ny: true, py: true } });
  g.color(C.carpet);
  for (let x = x0; x < x1 - 1e-6; x += 2) for (let z = z0; z < z1 - 1e-6; z += 2) {
    const a = x, bb = Math.min(x1, x + 2), c = z, d = Math.min(z1, z + 2);
    g.quad('carpet', [a, y1, d], [bb, y1, d], [bb, y1, c], [a, y1, c], [a, d, bb, d, bb, c, a, c], 1, 1, [0, 1, 0]);
  }
}

/** Pagar balkon: dasar marmer, baluster marmer tiap 0.6 u, pegangan emas. */
function rail(g: Geo, b: Box) {
  const [x0, y0, z0] = b.min, [x1, y1, z1] = b.max, alongX = x1 - x0 >= z1 - z0;
  const L0 = alongX ? x0 : z0, L1 = alongX ? x1 : z1, tm = alongX ? (z0 + z1) / 2 : (x0 + x1) / 2;
  const put = (key: K, l0: number, ya: number, t0: number, l1: number, yb: number, t1: number, col: number) =>
    alongX ? bx(g, key, l0, ya, t0, l1, yb, t1, col) : bx(g, key, t0, ya, l0, t1, yb, l1, col);
  put('marble', L0, y0, tm - 0.16, L1, y0 + 0.16, tm + 0.16, C.marbleGrey);
  put('gold', L0, y1 - 0.14, tm - 0.13, L1, y1, tm + 0.13, C.gold);
  put('marble', L0, y1 - 0.22, tm - 0.1, L1, y1 - 0.14, tm + 0.1, C.marble);
  const n = Math.max(1, Math.round((L1 - L0) / 0.6));
  for (let i = 0; i <= n; i++) {
    const l = L0 + (L1 - L0) * i / n, w = i === 0 || i === n ? 0.12 : 0.075;
    put('marble', Math.max(L0, l - w), y0 + 0.16, tm - w, Math.min(L1, l + w), y1 - 0.22, tm + w, C.marble);
  }
}

/** Barikade papan kayu (Spawn Merah): tiang + papan mendatar berselang, sedikit miring tidak rata. */
function planks(g: Geo, b: Box) {
  const [x0, y0, z0] = b.min, [x1, y1, z1] = b.max, alongX = x1 - x0 >= z1 - z0;
  const L0 = alongX ? x0 : z0, L1 = alongX ? x1 : z1, T0 = alongX ? z0 : x0, T1 = alongX ? z1 : x1;
  const put = (key: K, l0: number, ya: number, t0: number, l1: number, yb: number, t1: number, col: number, mul = 1) =>
    alongX ? bx(g, key, l0, ya, t0, l1, yb, t1, col, {}, mul) : bx(g, key, t0, ya, l0, t1, yb, l1, col, {}, mul);
  const tm = (T0 + T1) / 2;
  put('wood', L0, y0, T0 + 0.15, L1, y1, T1 - 0.15, C.woodDark, 0.6);                       // inti (tapak collider)
  for (let l = L0; l < L1 - 0.1; l += 2.2) put('wood', l, y0, T0, Math.min(L1, l + 0.3), y1, T1, C.woodDark);
  let k = 0;
  for (let y = y0 + 0.2; y < y1 - 0.1; y += 0.55, k++) {
    const side = k % 2 === 0 ? T0 : tm + 0.05, mul = 0.85 + ((k * 37) % 7) / 20;
    put('wood', L0 - 0.05, y, side, L1 + 0.05, Math.min(y1, y + 0.42), side + (tm - T0) - 0.05, C.woodBarr, mul);
  }
}

/** Barikade baja Spawn Biru: rangka baja + panel bergaris biru. */
function steelBarrier(g: Geo, b: Box) {
  const [x0, y0, z0] = b.min, [x1, y1, z1] = b.max;
  bx(g, 'steel', x0, y0, z0, x1, y1, z1, C.steelDark, SUB);
  const alongZ = z1 - z0 > x1 - x0;
  for (let y = y0 + 0.8; y < y1 - 0.3; y += 1.6) {
    if (alongZ) { bx(g, 'steel', x0 - 0.03, y, z0, x1 + 0.03, y + 0.35, z1, C.crateB); }
    else bx(g, 'steel', x0, y, z0 - 0.03, x1, y + 0.35, z1 + 0.03, C.crateB);
  }
}

/** Peti: G = lapis baja berbantalan hijau-abu (tumpukan), R = merah-hitam, B = biru. Sudut berbingkai gelap. */
function crate(g: Geo, b: Box, kind: 'G' | 'R' | 'B') {
  const [x0, y0, z0] = b.min, [x1, y1, z1] = b.max, f = 0.09;
  if (kind === 'G') {
    const levels = Math.max(1, Math.round((y1 - y0) / 2));
    for (let i = 0; i < levels; i++) {
      const ya = y0 + (y1 - y0) * i / levels, yb = y0 + (y1 - y0) * (i + 1) / levels;
      bx(g, 'padded', x0, ya, z0, x1, yb - 0.02, z1, C.crateG);
      bx(g, 'steel', x0 - 0.02, yb - 0.08, z0 - 0.02, x1 + 0.02, yb, z1 + 0.02, C.steelDark);
    }
    return;
  }
  const body = kind === 'R' ? C.crateR : C.crateB;
  bx(g, 'wood', x0 + f, y0, z0 + f, x1 - f, y1 - f, z1 - f, body, SUB);
  for (const [xa, xb] of [[x0, x0 + f * 2], [x1 - f * 2, x1]] as const) for (const [za, zb] of [[z0, z0 + f * 2], [z1 - f * 2, z1]] as const)
    bx(g, 'steel', xa, y0, za, xb, y1, zb, C.crateBlack);
  bx(g, 'steel', x0, y1 - f, z0, x1, y1, z1, C.crateBlack);
  for (let y = y0 + 1; y < y1 - 0.5; y += 1.4) bx(g, 'steel', x0 - 0.02, y, z0 - 0.02, x1 + 0.02, y + 0.12, z1 + 0.02, C.crateBlack);
}

/** Meja keamanan / briefing: badan navy berlis emas, puncak marmer. */
function desk(g: Geo, b: Box) {
  const [x0, y0, z0] = b.min, [x1, y1, z1] = b.max, t = 0.14;
  bx(g, 'plaster', x0 + 0.1, y0, z0 + 0.1, x1 - 0.1, y1 - t, z1 - 0.1, C.navy);
  bx(g, 'gold', x0 + 0.08, y1 - t - 0.1, z0 + 0.08, x1 - 0.08, y1 - t, z1 - 0.08, C.gold);
  bx(g, 'gold', x0 + 0.08, y0, z0 + 0.08, x1 - 0.08, y0 + 0.12, z1 - 0.08, C.goldDark);
  bx(g, 'marble', x0, y1 - t, z0, x1, y1, z1, C.deskTop);
}

/** Kios / konter marmer: badan marmer, kaki gelap, lis emas. */
function kiosk(g: Geo, b: Box) {
  const [x0, y0, z0] = b.min, [x1, y1, z1] = b.max;
  bx(g, 'marble', x0, y0, z0, x1, y0 + 0.18, z1, C.marbleGrey, {}, 0.6);
  bx(g, 'marble', x0 + 0.05, y0 + 0.18, z0 + 0.05, x1 - 0.05, y1 - 0.16, z1 - 0.05, C.marble);
  bx(g, 'gold', x0 + 0.03, y1 - 0.26, z0 + 0.03, x1 - 0.03, y1 - 0.16, z1 - 0.03, C.gold);
  bx(g, 'marble', x0, y1 - 0.16, z0, x1, y1, z1, C.marble);
}

/** Etalase: dasar marmer, kotak kaca berbingkai emas, tutup marmer. */
function displayCase(g: Geo, b: Box) {
  const [x0, y0, z0] = b.min, [x1, y1, z1] = b.max, mid = y0 + (y1 - y0) * 0.5, f = 0.07;
  bx(g, 'marble', x0, y0, z0, x1, mid, z1, C.marble);
  bx(g, 'gold', x0, mid, z0, x1, mid + 0.06, z1, C.gold);
  bx(g, 'glass', x0 + f, mid + 0.06, z0 + f, x1 - f, y1 - 0.1, z1 - f, 0xffffff);
  for (const [xa, xb] of [[x0, x0 + f], [x1 - f, x1]] as const) for (const [za, zb] of [[z0, z0 + f], [z1 - f, z1]] as const)
    bx(g, 'gold', xa, mid, za, xb, y1, zb, C.gold);
  bx(g, 'marble', x0, y1 - 0.1, z0, x1, y1, z1, C.marble);
  // barang pajangan (batangan emas) di dalam kaca
  for (let i = 0; i < 3; i++) {
    const cx = x0 + (x1 - x0) * (0.25 + i * 0.25), cz = (z0 + z1) / 2;
    bx(g, 'gold', cx - 0.25, mid + 0.06, cz - 0.15, cx + 0.25, mid + 0.26, cz + 0.15, C.gold);
  }
}

/** Kabinet / sekat kotak deposit (Site A): muka loker baja di sisi tegak, lis emas, puncak baja. */
function deposit(g: Geo, b: Box) {
  const [x0, y0, z0] = b.min, [x1, y1, z1] = b.max;
  bx(g, 'deposit', x0, y0 + 0.2, z0, x1, y1 - 0.25, z1, C.steel, { skip: { py: true, ny: true } });
  bx(g, 'steel', x0, y0, z0, x1, y0 + 0.2, z1, C.steelDark);
  bx(g, 'gold', x0 - 0.02, y1 - 0.25, z0 - 0.02, x1 + 0.02, y1 - 0.15, z1 + 0.02, C.gold);
  bx(g, 'steel', x0, y1 - 0.15, z0, x1, y1, z1, C.steelDark);
}

/** Pintu brankas bundar terbuka (daun tebal 1.6 u, radius 2.4) — cakram segi-24 sejajar sumbu X + hub, 12 baut pengunci,
 *  roda pemutar; engsel atas/bawah mengisi sudut tapak collider. */
function vaultDoor(g: Geo, b: Box) {
  const [x0, y0, z0] = b.min, [x1, y1, z1] = b.max, cy = (y0 + y1) / 2, cz = (z0 + z1) / 2, r = Math.min(z1 - z0, y1 - y0) / 2;
  g.pushAt(x0, cy, cz, 0, 0, -Math.PI / 2);                  // sumbu Y lokal → +X dunia
  g.color(C.steel);
  g.prismY('steel', 0, 0, r, 0.2, x1 - x0, 24, { bottom: true, smooth: true });
  g.color(C.steelDark);
  g.prismY('steel', 0, 0, r * 0.82, x1 - x0, x1 - x0 + 0.08, 24, {});
  g.color(C.steel);
  g.prismY('steel', 0, 0, r * 0.3, x1 - x0, x1 - x0 + 0.35, 12, {});
  g.color(C.gold);
  g.prismY('gold', 0, 0, r * 0.12, x1 - x0 + 0.35, x1 - x0 + 0.55, 10, {});
  for (let i = 0; i < 12; i++) {                              // baut pengunci di tepi
    const a = (i / 12) * Math.PI * 2;
    g.color(C.steelDark);
    g.prismY('steel', Math.cos(a) * r * 0.9, Math.sin(a) * r * 0.9, 0.16, x1 - x0, x1 - x0 + 0.22, 8, {});
  }
  g.pop();
  const ex = x1 + 0.4, l = r * 0.55;                         // roda pemutar (palang silang)
  bx(g, 'gold', ex - 0.06, cy - l, cz - 0.07, ex + 0.06, cy + l, cz + 0.07, C.gold);
  bx(g, 'gold', ex - 0.06, cy - 0.07, cz - l, ex + 0.06, cy + 0.07, cz + l, C.gold);
  bx(g, 'steel', x0, y0, cz - 0.6, x0 + 0.6, y0 + 0.75, cz + 0.6, C.steelDark);          // engsel bawah & atas (sudut tapak)
  bx(g, 'steel', x0, y1 - 0.75, cz - 0.6, x0 + 0.6, y1, cz + 0.6, C.steelDark);
}

/** Rangka baja pintu brankas (kusen tebal berpaku keling). */
function vaultFrame(g: Geo, b: Box) {
  const [x0, y0, z0] = b.min, [x1, y1, z1] = b.max;
  bx(g, 'steel', x0, y0, z0, x1, y1, z1, C.steel, SUB);
  const alongZ = z1 - z0 > y1 - y0;
  for (let i = 0; i < 6; i++) {
    const t = (i + 0.5) / 6;
    if (alongZ) { const z = z0 + (z1 - z0) * t; for (const x of [x0 - 0.05, x1]) bx(g, 'steel', x, y0 + 0.2, z - 0.08, x + 0.05, y0 + 0.36, z + 0.08, C.steelDark); }
    else { const y = y0 + (y1 - y0) * t; for (const x of [x0 - 0.05, x1]) bx(g, 'steel', x, y - 0.08, (z0 + z1) / 2 - 0.08, x + 0.05, y + 0.08, (z0 + z1) / 2 + 0.08, C.steelDark); }
  }
}

/** Dinding monitor CCTV (Spawn Biru): dinding + 2 baris monitor di kedua sisi (layar emisif). */
function cctvWall(g: Geo, b: Box) {
  wall(g, b);
  const [x0, , z0] = b.min, [x1, , z1] = b.max;
  for (const [face, dz] of [[z0, -1], [z1, 1]] as const) {
    for (let x = x0 + 0.8; x + 1.6 < x1 - 0.4; x += 2.1) for (const y of [1.6, 3.15]) {
      const zf = face + dz * 0.06;
      bx(g, 'steel', x, y, Math.min(face, zf), x + 1.9, y + 1.3, Math.max(face, zf), C.steelDark);
      g.color(((x * 7 + y * 3) | 0) % 3 === 0 ? C.screen2 : C.screen);
      const zs = face + dz * 0.065;
      if (dz < 0) g.quad('glow', [x + 1.8, y + 0.1, zs], [x + 0.1, y + 0.1, zs], [x + 0.1, y + 1.2, zs], [x + 1.8, y + 1.2, zs], undefined, 1, 1, [0, 0, -1]);
      else g.quad('glow', [x + 0.1, y + 0.1, zs], [x + 1.8, y + 0.1, zs], [x + 1.8, y + 1.2, zs], [x + 0.1, y + 1.2, zs], undefined, 1, 1, [0, 0, 1]);
    }
  }
}

// ───────────────────────── tangga (anak tangga visual; collider = ramp convexHull)
function stairs(g: Geo) {
  for (const s of MV_STAIRS) {
    const f = stairFrame(s), rise = f.y1 - f.y0, run = Math.abs(f.top - f.foot), n = Math.max(2, Math.round(rise / 0.3));
    const marbleSteps = s.id === 'RAMP_RED_NORTH' || s.id === 'RAMP_BLUE_B_UP';
    const dir = Math.sign(f.top - f.foot);
    for (let i = 0; i < n; i++) {
      const a = f.foot + dir * run * (i / n), b = f.foot + dir * run * ((i + 1) / n), y = f.y0 + rise * ((i + 1) / n);
      const lo = Math.min(a, b), hi = Math.max(a, b);
      if (f.axis === 'z') {
        if (marbleSteps) bx(g, 'marble', f.x[0], f.y0, lo, f.x[1], y, hi, i % 2 ? C.marble : C.marbleGrey, {}, i % 2 ? 1 : 0.97);
        else { bx(g, 'marble', f.x[0], f.y0, lo, f.x[1], y - 0.04, hi, C.marbleGrey); bx(g, 'carpet', f.x[0] + 0.25, y - 0.04, lo, f.x[1] - 0.25, y, hi, C.carpet); }
      } else {
        if (marbleSteps) bx(g, 'marble', lo, f.y0, f.z[0], hi, y, f.z[1], i % 2 ? C.marble : C.marbleGrey, {}, i % 2 ? 1 : 0.97);
        else { bx(g, 'marble', lo, f.y0, f.z[0], hi, y - 0.04, f.z[1], C.marbleGrey); bx(g, 'carpet', lo, y - 0.04, f.z[0] + 0.25, hi, y, f.z[1] - 0.25, C.carpet); }
      }
    }
  }
}

// ───────────────────────── dekorasi
function skylights(g: Geo) {
  for (const s of MV_SKYLIGHTS) {
    const h = s.size / 2, x0 = s.x - h, x1 = s.x + h, z0 = s.z - h, z1 = s.z + h;
    g.color(C.sky);                                                         // langit di balik kaca (emisif)
    g.quad('glow', [x0, 16.7, z0], [x1, 16.7, z0], [x1, 16.7, z1], [x0, 16.7, z1], undefined, 1, 1, [0, -1, 0]);
    for (const [a, b, c, d] of [[x0, x1, z0 - 0.3, z0], [x0, x1, z1, z1 + 0.3], [x0 - 0.3, x0, z0 - 0.3, z1 + 0.3], [x1, x1 + 0.3, z0 - 0.3, z1 + 0.3]] as const)
      bx(g, 'gold', a, 15.75, c, b, 16, d, C.gold);                         // bingkai emas
    for (const t of [1 / 3, 2 / 3]) {                                       // kisi kaca
      bx(g, 'plaster', x0 + s.size * t - 0.06, 16.3, z0, x0 + s.size * t + 0.06, 16.7, z1, C.white);
      bx(g, 'plaster', x0, 16.3, z0 + s.size * t - 0.06, x1, 16.7, z0 + s.size * t + 0.06, C.white);
    }
    // dinding sumur skylight (plafon 16 → kaca 16.7)
    bx(g, 'plaster', x0 - 0.05, 16, z0 - 0.05, x0, 16.7, z1 + 0.05, C.white);
    bx(g, 'plaster', x1, 16, z0 - 0.05, x1 + 0.05, 16.7, z1 + 0.05, C.white);
    bx(g, 'plaster', x0, 16, z0 - 0.05, x1, 16.7, z0, C.white);
    bx(g, 'plaster', x0, 16, z1, x1, 16.7, z1 + 0.05, C.white);
  }
}

function windows(g: Geo) {
  for (const w of MV_WINDOWS) {
    const W = MV_BOUNDS.x[0], x = W + 0.06, z0 = w.z - w.width / 2, z1 = w.z + w.width / 2, [ya, yb] = w.y, archTop = yb + w.width / 2;
    g.color(C.windowSky);
    g.quad('glow', [x, ya, z1], [x, ya, z0], [x, yb, z0], [x, yb, z1], undefined, 1, 1, [1, 0, 0]);
    const n = 8;                                                            // lengkung (kipas)
    for (let i = 0; i < n; i++) {
      const a0 = Math.PI * i / n, a1 = Math.PI * (i + 1) / n, r = w.width / 2;
      g.quad('glow', [x, yb, w.z], [x, yb, w.z], [x, yb + Math.sin(a0) * r, w.z - Math.cos(a0) * r], [x, yb + Math.sin(a1) * r, w.z - Math.cos(a1) * r], undefined, 1, 1, [1, 0, 0]);
    }
    bx(g, 'marble', W, ya - 0.3, z0 - 0.3, W + 0.4, ya, z1 + 0.3, C.marble);                 // ambang marmer
    for (const zz of [z0, w.z, z1]) bx(g, 'gold', W, ya, zz - 0.07, W + 0.12, yb, zz + 0.07, C.gold);   // kusen tegak
    for (let y = ya + 1.6; y < yb; y += 1.6) bx(g, 'gold', W, y - 0.05, z0, W + 0.12, y + 0.05, z1, C.gold);
    for (let i = 0; i <= 6; i++) {                                          // bingkai lengkung
      const a = Math.PI * i / 6, r = w.width / 2, yy = yb + Math.sin(a) * r, zz = w.z - Math.cos(a) * r;
      bx(g, 'gold', W, yy - 0.08, zz - 0.08, W + 0.14, yy + 0.08, zz + 0.08, C.gold);
    }
    bx(g, 'plaster', W, archTop - 0.1, z0 - 0.35, W + 0.25, archTop + 0.25, z1 + 0.35, C.white);  // kepala jendela
  }
}

function lamps(g: Geo) {
  for (const [x, y, z, w, d] of MV_LAMPS) {
    bx(g, 'gold', x - w / 2 - 0.08, y - 0.05, z - d / 2 - 0.08, x + w / 2 + 0.08, y + 0.1, z + d / 2 + 0.08, C.goldDark);
    g.color(C.lamp);
    g.quad('glow', [x - w / 2, y - 0.06, z - d / 2], [x + w / 2, y - 0.06, z - d / 2], [x + w / 2, y - 0.06, z + d / 2], [x - w / 2, y - 0.06, z + d / 2], undefined, 1, 1, [0, -1, 0]);
  }
}

/** Plafon kaset emas Site A (ruang X −50…−14, Z −64…−24): kisi balok tiap 4 u di bawah plafon Y 10. */
const SA = { x0: -50, x1: -14, z0: -64, z1: -24 } as const;
function siteACoffers(g: Geo) {
  for (let x = SA.x0 + 4; x <= SA.x1 - 3.99; x += 4) bx(g, 'gold', x - 0.12, 9.6, SA.z0, x + 0.12, 10, SA.z1, C.gold);
  for (let z = SA.z0 + 4; z <= SA.z1 - 3.99; z += 4) bx(g, 'gold', SA.x0, 9.6, z - 0.12, SA.x1, 10, z + 0.12, C.gold);
  // strip lampu merah di dinding brankas (gambar referensi)
  g.color(C.redStrip);
  const n = SA.z1 - 0.02, s = SA.z0 + 0.02;
  g.quad('glow', [SA.x1, 9.2, n], [SA.x0, 9.2, n], [SA.x0, 9.35, n], [SA.x1, 9.35, n], undefined, 1, 1, [0, 0, -1]);
  g.quad('glow', [SA.x0, 9.2, s], [SA.x1, 9.2, s], [SA.x1, 9.35, s], [SA.x0, 9.35, s], undefined, 1, 1, [0, 0, 1]);
}

/** Panel kotak deposit menempel di dinding Site A (rupa saja, 0.12 u). */
function depositWalls(g: Geo) {
  const panel = (x0: number, z0: number, x1: number, z1: number) => {
    bx(g, 'deposit', x0, 0.5, z0, x1, 6.4, z1, C.steel, { skip: { py: true, ny: true } });
    bx(g, 'gold', x0 - 0.02, 6.4, z0 - 0.02, x1 + 0.02, 6.55, z1 + 0.02, C.gold);
  };
  panel(-49, -24.12, -26, -24);                        // Utara (sisi barat)
  panel(-24, -64, -16, -63.88);                        // Selatan sudut timur (kecil)
  panel(-49, -64, -35, -63.88);                        // Selatan (sisi barat)
}

/** Decal A & B + papan nama Atrium. */
function decals(g: Geo) {
  for (const s of MV_SITES) {
    const [x, y, z] = s.botPlant, r = 4, yy = y + 0.012;
    g.color(0xffffff);
    g.quad(s.id === 'A' ? 'decalA' : 'decalB', [x - r, yy, z + r], [x + r, yy, z + r], [x + r, yy, z - r], [x - r, yy, z - r], [0, 0, 1, 0, 1, 1, 0, 1], 1, 1, [0, 1, 0]);
  }
  const zf = 55.88;                                    // dinding Utara Atrium (Z 56) di atas balkon Utara
  g.color(0xffffff);
  g.quad('sign', [54, 8.5, zf], [38, 8.5, zf], [38, 12.5, zf], [54, 12.5, zf], [0, 0, 1, 0, 1, 1, 0, 1], 1, 1, [0, 0, -1]);
  bx(g, 'gold', 37.8, 8.3, 55.92, 54.2, 12.7, 56, C.gold);
}

/** Semua geometri Meridian Vault ke Geo. */
export function emitMeridian(g: Geo, boxes: readonly Box[]) {
  const solid = boxes.filter(b => b.style !== 'm_ground' && b.style !== 'm_ceil');
  const fullHeight = solid.filter(b => b.min[1] <= 0.01 && b.max[1] >= 2);
  const reachesCeil = solid.filter(b => b.max[1] >= 15.99 && b.min[1] <= 15);
  const inSky = (x: number, z: number) => MV_SKYLIGHTS.some(s => Math.abs(x - s.x) < s.size / 2 && Math.abs(z - s.z) < s.size / 2);
  // lantai dasar marmer catur & plafon global (petak yang tertutup massa dilewati; plafon berlubang di skylight)
  const [X0, X1] = MV_BOUNDS.x, [Z0, Z1] = MV_BOUNDS.z;
  flat(g, 'floor', 0xffffff, X0, X1, Z0, Z1, 0, true, (cx, cz) => fullHeight.some(b => inside(b, cx, 1, cz)));
  flat(g, 'plaster', C.ceil, X0, X1, Z0, Z1, 16, false, (cx, cz) => inSky(cx, cz) || reachesCeil.some(b => inside(b, cx, 15.5, cz)));
  for (const b of solid) {
    switch (b.style) {
      case 'm_ext': case 'm_wall': case 'm_mass': wall(g, b); break;
      case 'm_lintel': lintel(g, b); break;
      case 'm_sill': platform(g, b, C.carpetDark); break;
      case 'm_plat': platform(g, b, C.carpet); break;
      case 'm_stage': platform(g, b, C.carpet); break;
      case 'm_slab': slab(g, b); break;
      case 'm_rail': rail(g, b); break;
      case 'm_barr': planks(g, b); break;
      case 'm_barrB': steelBarrier(g, b); break;
      case 'm_crateG': crate(g, b, 'G'); break;
      case 'm_crateR': crate(g, b, 'R'); break;
      case 'm_crateB': crate(g, b, 'B'); break;
      case 'm_desk': desk(g, b); break;
      case 'm_kiosk': kiosk(g, b); break;
      case 'm_case': displayCase(g, b); break;
      case 'm_deposit': deposit(g, b); break;
      case 'm_vdoor': vaultDoor(g, b); break;
      case 'm_vault': vaultFrame(g, b); break;
      case 'm_cctv': cctvWall(g, b); break;
      case 'm_col': column(g, b); break;
      default: bx(g, 'plaster', b.min[0], b.min[1], b.min[2], b.max[0], b.max[1], b.max[2], C.cream, SUB);
    }
  }
  stairs(g);
  skylights(g);
  windows(g);
  lamps(g);
  siteACoffers(g);
  depositWalls(g);
  decals(g);
}
