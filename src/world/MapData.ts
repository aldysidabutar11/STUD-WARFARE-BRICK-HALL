// src/world/MapData.ts — manifest geometri Brick Hall sebagai data + aturan mirror (GDD §4.2).
// Layout ORISINAL: shell/markas/ruang spawn/selasar/lorong/tangga mengikuti spesifikasi §4,
// bagian tengah = jembatan kembar + rotunda bertiang dengan menara katalog (lihat CLAUDE.md).

export type Cat = 'shell' | 'mass' | 'bridge' | 'rail' | 'pillar' | 'wall' | 'spawn' | 'cover' | 'shelf' | 'prop';
export type Mirror = '-' | 'X' | 'Z' | 'XZ';
export type Style = 'hidden' | 'plaster' | 'ceiling' | 'balc' | 'base' | 'deck' | 'darkwood' | 'panel' | 'table'
  | 'crate' | 'tower' | 'rail' | 'shelf'
  // v2 (rombak map atas permintaan pengguna): rak tinggi/lemari bersisi buku, dinding arsip, panel berwarna tim (Z<0 biru, Z>0 merah)
  | 'stack' | 'arcwall' | 'teampanel'
  // multi-map (map luar ruang, mis. Steel Yard): label permukaan generik — dipakai builder map itu sendiri (Brick Hall tidak)
  | OutdoorStyle;
export type OutdoorStyle = 'steel' | 'fence' | 'concrete' | 'timber' | 'rubber' | 'vehicle' | 'fabric';

/** rotY (opsional, radian): putaran balok di PUSATNYA terhadap sumbu Y (konvensi three.js). x/z = rentang LOKAL sebelum diputar. */
export interface Row { id: string; cat: Cat; x: [number, number]; y: [number, number]; z: [number, number]; m: Mirror; style: Style; rotY?: number }
/** min/max = kotak LOKAL (sebelum diputar) — dengan rotY ≠ 0 balok diputar rotY radian di pusat (min+max)/2 (OBB). */
export interface Box { id: string; cat: Cat; min: [number, number, number]; max: [number, number, number]; style: Style; rotY?: number }

const R = (id: string, cat: Cat, x: [number, number], y: [number, number], z: [number, number], m: Mirror, style: Style): Row =>
  ({ id, cat, x, y, z, m, style });

export const ROWS: Row[] = [
  // ── shell
  R('GROUND', 'shell', [-30, 30], [-1, 0], [-50, 50], '-', 'hidden'),
  R('WALL_OUT_W1', 'shell', [-31, -30], [0, 30], [-51, -17], 'XZ', 'plaster'),
  R('WALL_OUT_W2', 'shell', [-31, -30], [0, 30], [-13, 13], 'X', 'plaster'),
  R('WALL_WIN_LO_W', 'shell', [-31, -30], [0, 18.5], [-17, -13], 'XZ', 'plaster'),
  R('WALL_WIN_HI_W', 'shell', [-31, -30], [26.5, 30], [-17, -13], 'XZ', 'plaster'),
  R('ARCH1A_W', 'shell', [-31, -30], [25.7, 26.5], [-17, -15.8], 'XZ', 'plaster'),
  R('ARCH1B_W', 'shell', [-31, -30], [25.7, 26.5], [-14.2, -13], 'XZ', 'plaster'),
  R('ARCH2A_W', 'shell', [-31, -30], [25.0, 25.7], [-17, -16.4], 'XZ', 'plaster'),
  R('ARCH2B_W', 'shell', [-31, -30], [25.0, 25.7], [-13.6, -13], 'XZ', 'plaster'),
  R('ARCH3A_W', 'shell', [-31, -30], [24.4, 25.0], [-17, -16.75], 'XZ', 'plaster'),
  R('ARCH3B_W', 'shell', [-31, -30], [24.4, 25.0], [-13.25, -13], 'XZ', 'plaster'),
  R('WALL_OUT_S', 'shell', [-31, 31], [0, 30], [-51, -50], 'Z', 'plaster'),
  R('CEILING', 'shell', [-30, 30], [28, 28.8], [-50, 50], '-', 'ceiling'),
  // ── lantai 2 (v2): balkon & markas kini PELAT 0.6 — ruang di bawahnya dipakai (arsip, ruang spawn bawah)
  R('BALC_SLAB_W', 'mass', [-30, -22], [9.4, 10], [-35, 35], 'X', 'balc'),
  R('BASE_SLAB_S', 'mass', [-30, 30], [9.4, 10], [-50, -35], 'Z', 'base'),
  R('LANDING_SW', 'mass', [-22, -17], [0, 10], [-35, -32.8], 'XZ', 'base'),
  // isi markas di lantai dasar, menyisakan ruang spawn bawah (X ±9, Z −50…−43), pintu ke aula (X ±4…7)
  // dan lorong ke arsip (Z −47…−44 lalu X ±27…30 ke utara)
  R('BASE_F1_SW', 'mass', [-30, -9], [0, 9.4], [-50, -47], 'XZ', 'base'),
  R('BASE_F2_SW', 'mass', [-27, -9], [0, 9.4], [-44, -43], 'XZ', 'base'),
  R('BASE_F3_SW', 'mass', [-27, -7], [0, 9.4], [-43, -35], 'XZ', 'base'),
  R('BASE_F4_S', 'mass', [-4, 4], [0, 9.4], [-43, -35], 'Z', 'base'),
  // arsip (lantai dasar di bawah balkon): dinding sisi aula + pintu Z ±12…15 & tengah, lemari setinggi plafon zig-zag
  R('ARCW_1_SW', 'wall', [-22.6, -22], [0, 9.4], [-35, -15], 'XZ', 'arcwall'),
  R('ARCW_2_SW', 'wall', [-22.6, -22], [0, 9.4], [-12, -1.5], 'XZ', 'arcwall'),
  R('ARCW_L1_SW', 'wall', [-22.6, -22], [6, 9.4], [-15, -12], 'XZ', 'arcwall'),
  R('ARCW_LC_W', 'wall', [-22.6, -22], [6, 9.4], [-1.5, 1.5], 'X', 'arcwall'),
  R('ARC_CAB1_SW', 'wall', [-30, -26.4], [0, 9.4], [-29, -27.5], 'XZ', 'stack'),
  R('ARC_CAB2_SW', 'wall', [-26.2, -22.6], [0, 9.4], [-21, -19.5], 'XZ', 'stack'),
  R('ARC_CAB3_SW', 'wall', [-30, -26.4], [0, 9.4], [-8, -6.5], 'XZ', 'stack'),
  // ── tengah: jembatan kembar + rotunda
  R('BRIDGE_SW', 'bridge', [-10, -6], [9.4, 10], [-35, -8], 'XZ', 'deck'),
  R('ROTUNDA', 'bridge', [-10, 10], [9.4, 10], [-8, 8], '-', 'deck'),
  R('TOWER', 'cover', [-2.5, 2.5], [10, 15.6], [-2.5, 2.5], '-', 'tower'),
  R('ROT_DESK_S', 'cover', [-3, 3], [10, 12.2], [-6.6, -5.4], 'Z', 'table'),
  R('PILLAR_ROT_SW', 'pillar', [-8, -5], [0, 9.4], [-7, -4], 'XZ', 'darkwood'),
  R('PILLAR_BR_SW', 'pillar', [-9.5, -6.5], [0, 9.4], [-23, -20], 'XZ', 'darkwood'),
  // ── pagar (tinggi 1.2)
  R('RAIL_BR_OUT_SW', 'rail', [-10, -9.7], [10, 11.2], [-35, -8], 'XZ', 'rail'),
  R('RAIL_BR_IN_SW', 'rail', [-6.3, -6], [10, 11.2], [-35, -8], 'XZ', 'rail'),
  R('RAIL_ROT_S', 'rail', [-6, 6], [10, 11.2], [-8, -7.7], 'Z', 'rail'),
  R('RAIL_ROT_W', 'rail', [-10, -9.7], [10, 11.2], [-7.7, 7.7], 'X', 'rail'),
  R('RAIL_BALC_W', 'rail', [-22.3, -22], [10, 11.2], [-32.8, 32.8], 'X', 'rail'),
  R('RAIL_LAND_SW', 'rail', [-17.3, -17], [10, 11.2], [-35, -32.8], 'XZ', 'rail'),
  // markas (v2): lobi ditutup dinding depan — pintu ke jembatan (X ±6…10) & puncak tangga (X ±17…22), jendela intip tengah
  // (ambang 1.2 seperti pagar, atas 5.6 di atas lantai → aman aturan head-glitch §4.4). Menggantikan pagar tepi markas.
  R('BASEWALL_A_SW', 'wall', [-17, -10], [10, 17.5], [-35.4, -35], 'XZ', 'teampanel'),
  R('BASEWALL_B_SW', 'wall', [-6, -3], [10, 17.5], [-35.4, -35], 'XZ', 'teampanel'),
  R('BASEWALL_SILL_S', 'wall', [-3, 3], [10, 11.2], [-35.4, -35], 'Z', 'teampanel'),
  R('BASEWALL_TOP_S', 'wall', [-3, 3], [15.6, 17.5], [-35.4, -35], 'Z', 'teampanel'),
  // rotunda (v2): lemari katalog memutus garis pandang lurus sepanjang jembatan (Selatan ↔ Utara)
  R('ROT_CAB_W', 'cover', [-9.4, -6.6], [10, 15.6], [-1.6, 1.6], 'X', 'stack'),
  // rak tinggi 2 lantai (v2): memecah garis pandang lintas aula & melindungi lantai dasar dari atas
  R('SPINE_S', 'cover', [-0.8, 0.8], [0, 16], [-31, -13], 'Z', 'stack'),
  R('STACK_SW', 'cover', [-17, -15.6], [0, 16], [-28.5, -19.5], 'XZ', 'stack'),
  // ── partisi selasar / lorong dalam (GDD §4.2)
  R('PART_1_W', 'wall', [-26.2, -25.8], [10, 17], [-35, -21.5], 'X', 'panel'),
  R('PART_2_W', 'wall', [-26.2, -25.8], [10, 17], [-18.5, -1.5], 'X', 'panel'),
  R('PART_3_W', 'wall', [-26.2, -25.8], [10, 17], [1.5, 18.5], 'X', 'panel'),
  R('PART_4_W', 'wall', [-26.2, -25.8], [10, 17], [21.5, 35], 'X', 'panel'),
  R('LINTEL_a_W', 'wall', [-26.2, -25.8], [16, 17], [-21.5, -18.5], 'X', 'panel'),
  R('LINTEL_b_W', 'wall', [-26.2, -25.8], [16, 17], [-1.5, 1.5], 'X', 'panel'),
  R('LINTEL_c_W', 'wall', [-26.2, -25.8], [16, 17], [18.5, 21.5], 'X', 'panel'),
  R('INNER_CEIL_W', 'wall', [-30, -25.8], [17, 17.5], [-35, 35], 'X', 'panel'),
  // ── ruang spawn (GDD §4.2)
  R('SR_FRONT_1_S', 'spawn', [-9.4, -8.5], [10, 17], [-43.5, -43.1], 'Z', 'teampanel'),
  R('SR_FRONT_2_S', 'spawn', [-5.5, 5.5], [10, 17], [-43.5, -43.1], 'Z', 'teampanel'),
  R('SR_FRONT_3_S', 'spawn', [8.5, 9.4], [10, 17], [-43.5, -43.1], 'Z', 'teampanel'),
  R('SR_LINTEL_W_S', 'spawn', [-8.5, -5.5], [16, 17], [-43.5, -43.1], 'Z', 'teampanel'),
  R('SR_LINTEL_E_S', 'spawn', [5.5, 8.5], [16, 17], [-43.5, -43.1], 'Z', 'teampanel'),
  R('SR_SIDE_W_S', 'spawn', [-9.4, -9], [10, 17], [-50, -43.5], 'Z', 'teampanel'),
  R('SR_SIDE_E_S', 'spawn', [9, 9.4], [10, 17], [-50, -43.5], 'Z', 'teampanel'),
  R('SR_CEIL_S', 'spawn', [-9.4, 9.4], [17, 17.5], [-50, -43.1], 'Z', 'teampanel'),
  // ── cover mezanin (GDD §4.2)
  R('BARRICADE_SW', 'cover', [-8.6, -5.4], [10, 15.6], [-40.4, -39.2], 'XZ', 'darkwood'),
  R('CRATE1_SW', 'cover', [-18.2, -15.8], [10, 12.4], [-48.2, -45.8], 'XZ', 'crate'),
  R('CRATE2_SW', 'cover', [-21.2, -18.8], [10, 12.4], [-41.2, -38.8], 'XZ', 'crate'),
  // ── lantai dasar
  R('SHELF_A_SW', 'shelf', [-13.5, -12], [0, 4], [-28, -22], 'XZ', 'shelf'),
  R('SHELF_B_SW', 'shelf', [-17, -11], [0, 4], [-10.75, -9.25], 'XZ', 'shelf'),
  R('DESK_C', 'prop', [-3, 3], [0, 2.4], [-1.5, 1.5], '-', 'table'),
  R('TABLE_W', 'prop', [-16, -13.5], [0, 2.2], [-4, 4], 'X', 'table'),
];

const mirrorXId = (id: string) => /_W$/.test(id) ? id.replace(/_W$/, '_E') : /_[SN]W$/.test(id) ? id.replace(/W$/, 'E') : id + '_E';
const mirrorZId = (id: string) => /_S([WE]?)$/.test(id) ? id.replace(/_S([WE]?)$/, '_N$1') : id + '_N';

/** Ekspansi aturan mirror: X (x0,x1)→(−x1,−x0) _W→_E; Z (z0,z1)→(−z1,−z0) _S→_N; XZ empat salinan.
 *  Balok berputar (rotY): cermin satu sumbu membalik arah putaran (rotY → −rotY); cermin X lalu Z = putar 180° (rotY tetap). */
export function expandRows(rows: Row[]): Box[] {
  const out: Box[] = [];
  for (const r of rows) {
    const variants: { id: string; x: [number, number]; z: [number, number]; flip: boolean }[] = [{ id: r.id, x: r.x, z: r.z, flip: false }];
    if (r.m === 'X' || r.m === 'XZ') variants.push({ id: mirrorXId(r.id), x: [-r.x[1], -r.x[0]], z: r.z, flip: true });
    if (r.m === 'Z' || r.m === 'XZ') {
      const n = variants.length;
      for (let i = 0; i < n; i++) {
        const v = variants[i];
        variants.push({ id: mirrorZId(v.id), x: v.x, z: [-r.z[1], -r.z[0]], flip: !v.flip });
      }
    }
    for (const v of variants) {
      const b: Box = { id: v.id, cat: r.cat, min: [v.x[0], r.y[0], v.z[0]], max: [v.x[1], r.y[1], v.z[1]], style: r.style };
      if (r.rotY) b.rotY = v.flip ? -r.rotY : r.rotY;
      out.push(b);
    }
  }
  return out;
}

/** Cermin satu balok (berputar atau tidak) terhadap bidang x = 0 ('X') / z = 0 ('Z') / keduanya ('XZ'). Id tidak diubah. */
export function mirrorBox(b: Box, axis: 'X' | 'Z' | 'XZ'): Box {
  const mx = axis !== 'Z', mz = axis !== 'X';
  const out: Box = { ...b,
    min: [mx ? -b.max[0] : b.min[0], b.min[1], mz ? -b.max[2] : b.min[2]],
    max: [mx ? -b.min[0] : b.max[0], b.max[1], mz ? -b.min[2] : b.max[2]] };
  if (b.rotY) out.rotY = mx !== mz ? -b.rotY : b.rotY; else delete out.rotY;
  return out;
}

/** 4 sudut tapak (x, z) balok di dunia (urutan: −x−z, +x−z, +x+z, −x+z lokal) — memperhitungkan rotY. */
export function boxCorners(b: Box): [number, number][] {
  const cx = (b.min[0] + b.max[0]) / 2, cz = (b.min[2] + b.max[2]) / 2, hx = (b.max[0] - b.min[0]) / 2, hz = (b.max[2] - b.min[2]) / 2;
  const c = Math.cos(b.rotY ?? 0), s = Math.sin(b.rotY ?? 0);
  // R_y(θ): lokal (lx, lz) → dunia (lx·cos + lz·sin, −lx·sin + lz·cos)
  return ([[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]] as const).map(([lx, lz]) => [cx + lx * c + lz * s, cz - lx * s + lz * c] as [number, number]);
}

/** AABB dunia (x, z) dari tapak balok (sama dengan min/max bila tanpa rotY). */
export function boxAabbXZ(b: Box): { x: [number, number]; z: [number, number] } {
  if (!b.rotY) return { x: [b.min[0], b.max[0]], z: [b.min[2], b.max[2]] };
  const p = boxCorners(b);
  return { x: [Math.min(...p.map(q => q[0])), Math.max(...p.map(q => q[0]))], z: [Math.min(...p.map(q => q[1])), Math.max(...p.map(q => q[1]))] };
}

/** Jarak 2D titik (x, z) ke tapak balok (0 bila di dalam) — mendukung rotY. */
export function distToBoxXZ(b: Box, x: number, z: number): number {
  const cx = (b.min[0] + b.max[0]) / 2, cz = (b.min[2] + b.max[2]) / 2, hx = (b.max[0] - b.min[0]) / 2, hz = (b.max[2] - b.min[2]) / 2;
  const c = Math.cos(b.rotY ?? 0), s = Math.sin(b.rotY ?? 0), dx = x - cx, dz = z - cz;
  const lx = dx * c - dz * s, lz = dx * s + dz * c;   // dunia → lokal (R_y(−θ))
  return Math.hypot(Math.max(Math.abs(lx) - hx, 0), Math.max(Math.abs(lz) - hz, 0));
}

export const BOXES: Box[] = expandRows(ROWS);

// ── tangga samping (GDD §4.3): ramp convexHull, kaki di Z ±18.5 (Y 0) → puncak di Z ±32.8 (Y 10)
export interface Stair { id: string; x: [number, number]; zFoot: number; zTop: number; openX: number }
export const STAIRS: Stair[] = [
  { id: 'STAIR_SW', x: [-22, -17], zFoot: -18.5, zTop: -32.8, openX: -17.15 },
  { id: 'STAIR_SE', x: [17, 22], zFoot: -18.5, zTop: -32.8, openX: 17.15 },
  { id: 'STAIR_NW', x: [-22, -17], zFoot: 18.5, zTop: 32.8, openX: -17.15 },
  { id: 'STAIR_NE', x: [17, 22], zFoot: 18.5, zTop: 32.8, openX: 17.15 },
];
export const STAIR_STEPS = 20, STAIR_RISE = 0.5, STAIR_RUN = 0.715;

// ── karpet (tanpa studs): jembatan, rotunda, tangga (lebar 3). v2: warna sisi tim (Selatan biru, Utara merah, rotunda netral)
export interface Rect { x: [number, number]; z: [number, number]; y: number; tone?: 'blue' | 'red' | 'gold' }
export const CARPETS: Rect[] = [
  { x: [-9.0, -7.0], z: [-35, -8], y: 10, tone: 'blue' }, { x: [7.0, 9.0], z: [-35, -8], y: 10, tone: 'blue' },
  { x: [-9.0, -7.0], z: [8, 35], y: 10, tone: 'red' }, { x: [7.0, 9.0], z: [8, 35], y: 10, tone: 'red' },
  { x: [-8.5, 8.5], z: [-7.0, 7.0], y: 10, tone: 'gold' },
];

/** Lantai visual ruang dalam (di luar pelat ubin aula 44 × 70): arsip & lantai dasar markas. */
export const INTERIOR_FLOORS: { x: [number, number]; z: [number, number] }[] = [
  { x: [-30, -22], z: [-35, 35] }, { x: [22, 30], z: [-35, 35] },
  { x: [-30, 30], z: [-50, -35] }, { x: [-30, 30], z: [35, 50] },
];

// ── bukaan plafon & jendela (GDD §4.7)
export const SKYLIGHTS: { x: number; z: number; size: number }[] = [-25, 0, 25].flatMap(z => [-10, 10].map(x => ({ x, z, size: 8 })));
export const WINDOWS: { x: number; z: number; y: [number, number]; width: number }[] =
  [-15, 15].flatMap(z => [-30, 30].map(x => ({ x, z, y: [18.5, 26.5] as [number, number], width: 4 })));
export const CORRIDOR_LAMPS: { x: number; y: number; z: number }[] =
  [-30, -20, -10, 0, 10, 20, 30].flatMap(z => [-29.85, 29.85].map(x => ({ x, y: 15.5, z })));

// ── slot spawn (GDD §4.6) — Biru yaw = π, Merah yaw = 0. v2 (permintaan pengguna): dua lantai, dipilih acak tiap respawn
//    lantai 2 = ruang spawn atas (GDD), lantai 1 = ruang spawn bawah di bawah markas (4 pintu: 2 ke aula, 2 lewat lorong ke arsip)
export type SpawnFloor = 'upper' | 'ground';
const slotRow = (y: number, s: number): [number, number, number][] =>
  [[-6, y, -48 * s], [-3, y, -46 * s], [0, y, -48 * s], [3, y, -46 * s], [6, y, -48 * s]];
export const SPAWN_SLOTS: Record<'blue' | 'red', Record<SpawnFloor, [number, number, number][]>> = {
  blue: { upper: slotRow(10, 1), ground: slotRow(0, 1) },
  red: { upper: slotRow(10, -1), ground: slotRow(0, -1) },
};

// ── tumpukan buku lantai (6 × 4) dan area acak kertas
export const BOOK_PILES: [number, number][] = [[0, -7.5], [0, 7.5], [-15, -16], [15, -16], [-15, 16], [15, 16]];
export const FLOOR_AREA = { x: [-22, 22] as [number, number], z: [-35, 35] as [number, number] };

/** Footprint 2D (lantai dasar) yang menghalangi: dipakai penempatan kertas & validator nav. */
export function groundObstacles(): { x: [number, number]; z: [number, number]; top: number }[] {
  return obstaclesAtLevel(0);
}

/** Footprint 2D yang menghalangi karakter (pita tinggi badan 0.1–4.9 di atas lantai `level`). */
export function obstaclesAtLevel(level: number): { x: [number, number]; z: [number, number]; top: number }[] {
  const list = BOXES.filter(b => b.cat !== 'shell' && b.min[1] < level + 4.9 && b.max[1] > level + 0.1)
    .map(b => ({ x: [b.min[0], b.max[0]] as [number, number], z: [b.min[2], b.max[2]] as [number, number], top: b.max[1] }));
  if (level > 5) return list;
  for (const s of STAIRS) {
    const z0 = Math.min(s.zFoot, s.zTop), z1 = Math.max(s.zFoot, s.zTop);
    list.push({ x: s.x, z: [z0, z1], top: 10 });
  }
  return list;
}

/** Material permukaan berbasis posisi (fallback §10.6). */
export function surfaceAt(x: number, y: number, z: number): 'wood' | 'tile' | 'carpet' {
  for (const s of STAIRS) {
    const z0 = Math.min(s.zFoot, s.zTop), z1 = Math.max(s.zFoot, s.zTop);
    if (x > s.x[0] && x < s.x[1] && z > z0 && z < z1) return Math.abs(x - (s.x[0] + s.x[1]) / 2) < 1.5 ? 'carpet' : 'wood';
  }
  if (y < 1) return Math.abs(x) > 22 || Math.abs(z) > 35 ? 'wood' : 'tile'; // arsip & markas lantai dasar berlantai kayu
  for (const c of CARPETS) if (Math.abs(y - c.y) < 1 && x > c.x[0] && x < c.x[1] && z > c.z[0] && z < c.z[1]) return 'carpet';
  return 'wood';
}

/** Ikon di puncak rak tinggi per kuadran — juga nama area aula lantai dasar untuk callout. */
export const QUADRANT_LANDMARK: Record<'SW' | 'SE' | 'NW' | 'NE', string> = {
  SW: 'Bola Dunia', SE: 'Teleskop', NW: 'Ksatria', NE: 'Jam Pasir',
};

/** Nama area untuk HUD (callout/orientasi). Selatan = sisi Biru, Utara = sisi Merah. */
export function zoneName(x: number, y: number, z: number): string {
  const side = z < 0 ? 'Biru' : 'Merah', wx = x < 0 ? 'Barat' : 'Timur', ax = Math.abs(x), az = Math.abs(z);
  if (y > 8.5) {
    if (az > 43.1 && ax < 9.4) return `Ruang Spawn ${side}`;
    if (az > 35) return ax > 22 ? `Sayap Markas ${side}` : `Lobi Markas ${side}`;
    if (ax < 10 && az <= 8) return 'Rotunda';
    if (ax >= 26) return `Lorong ${wx} · ${side}`;
    if (ax >= 22) return `Balkon ${wx} · ${side}`;
    if (ax >= 17 && az > 30) return `Puncak Tangga ${wx} · ${side}`;
    if (ax >= 5.5 && ax <= 10.5) return `Jembatan ${wx} · ${side}`;
    return 'Aula';
  }
  if (az > 43) return `Ruang Spawn Bawah ${side}`;
  if (az > 35) return `Lorong Markas ${side}`;
  if (ax > 22) return `Arsip ${wx} · ${side}`;
  if (ax >= 17 && az >= 18.5) return `Tangga ${wx} · ${side}`;
  if (ax < 10 && az < 8) return 'Bawah Rotunda';
  if (ax < 6) return `Lorong Tengah ${side}`;
  return `Aula ${QUADRANT_LANDMARK[`${z < 0 ? 'S' : 'N'}${x < 0 ? 'W' : 'E'}`]}`;
}
