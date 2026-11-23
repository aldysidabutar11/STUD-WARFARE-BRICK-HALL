// src/world/MapData.ts — manifest geometri Brick Hall sebagai data + aturan mirror (GDD §4.2).
// Layout ORISINAL: shell/markas/ruang spawn/selasar/lorong/tangga mengikuti spesifikasi §4,
// bagian tengah = jembatan kembar + rotunda bertiang dengan menara katalog (lihat CLAUDE.md).

export type Cat = 'shell' | 'mass' | 'bridge' | 'rail' | 'pillar' | 'wall' | 'spawn' | 'cover' | 'shelf' | 'prop';
export type Mirror = '-' | 'X' | 'Z' | 'XZ';
export type Style = 'hidden' | 'plaster' | 'ceiling' | 'balc' | 'base' | 'deck' | 'darkwood' | 'panel' | 'table'
  | 'crate' | 'tower' | 'rail' | 'shelf';

export interface Row { id: string; cat: Cat; x: [number, number]; y: [number, number]; z: [number, number]; m: Mirror; style: Style }
export interface Box { id: string; cat: Cat; min: [number, number, number]; max: [number, number, number]; style: Style }

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
  // ── masa pejal lantai 2
  R('BALC_W', 'mass', [-30, -22], [0, 10], [-35, 35], 'X', 'balc'),
  R('BASE_S', 'mass', [-30, 30], [0, 10], [-50, -35], 'Z', 'base'),
  R('LANDING_SW', 'mass', [-22, -17], [0, 10], [-35, -32.8], 'XZ', 'base'),
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
  R('RAIL_BASE_SW', 'rail', [-17, -10], [10, 11.2], [-35.3, -35], 'XZ', 'rail'),
  R('RAIL_BASE_S', 'rail', [-6, 6], [10, 11.2], [-35.3, -35], 'Z', 'rail'),
  R('RAIL_LAND_SW', 'rail', [-17.3, -17], [10, 11.2], [-35, -32.8], 'XZ', 'rail'),
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
  R('SR_FRONT_1_S', 'spawn', [-9.4, -8.5], [10, 17], [-43.5, -43.1], 'Z', 'panel'),
  R('SR_FRONT_2_S', 'spawn', [-5.5, 5.5], [10, 17], [-43.5, -43.1], 'Z', 'panel'),
  R('SR_FRONT_3_S', 'spawn', [8.5, 9.4], [10, 17], [-43.5, -43.1], 'Z', 'panel'),
  R('SR_LINTEL_W_S', 'spawn', [-8.5, -5.5], [16, 17], [-43.5, -43.1], 'Z', 'panel'),
  R('SR_LINTEL_E_S', 'spawn', [5.5, 8.5], [16, 17], [-43.5, -43.1], 'Z', 'panel'),
  R('SR_SIDE_W_S', 'spawn', [-9.4, -9], [10, 17], [-50, -43.5], 'Z', 'panel'),
  R('SR_SIDE_E_S', 'spawn', [9, 9.4], [10, 17], [-50, -43.5], 'Z', 'panel'),
  R('SR_CEIL_S', 'spawn', [-9.4, 9.4], [17, 17.5], [-50, -43.1], 'Z', 'panel'),
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

/** Ekspansi aturan mirror: X (x0,x1)→(−x1,−x0) _W→_E; Z (z0,z1)→(−z1,−z0) _S→_N; XZ empat salinan. */
export function expandRows(rows: Row[]): Box[] {
  const out: Box[] = [];
  for (const r of rows) {
    const variants: { id: string; x: [number, number]; z: [number, number] }[] = [{ id: r.id, x: r.x, z: r.z }];
    if (r.m === 'X' || r.m === 'XZ') variants.push({ id: mirrorXId(r.id), x: [-r.x[1], -r.x[0]], z: r.z });
    if (r.m === 'Z' || r.m === 'XZ') {
      const n = variants.length;
      for (let i = 0; i < n; i++) {
        const v = variants[i];
        variants.push({ id: mirrorZId(v.id), x: v.x, z: [-r.z[1], -r.z[0]] });
      }
    }
    for (const v of variants) out.push({ id: v.id, cat: r.cat, min: [v.x[0], r.y[0], v.z[0]], max: [v.x[1], r.y[1], v.z[1]], style: r.style });
  }
  return out;
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

// ── karpet (tanpa studs): jembatan, rotunda, tangga (lebar 3)
export interface Rect { x: [number, number]; z: [number, number]; y: number }
export const CARPETS: Rect[] = [
  { x: [-9.0, -7.0], z: [-35, -8], y: 10 }, { x: [7.0, 9.0], z: [-35, -8], y: 10 },
  { x: [-9.0, -7.0], z: [8, 35], y: 10 }, { x: [7.0, 9.0], z: [8, 35], y: 10 },
  { x: [-8.5, 8.5], z: [-7.0, 7.0], y: 10 },
];

// ── bukaan plafon & jendela (GDD §4.7)
export const SKYLIGHTS: { x: number; z: number; size: number }[] = [-25, 0, 25].flatMap(z => [-10, 10].map(x => ({ x, z, size: 8 })));
export const WINDOWS: { x: number; z: number; y: [number, number]; width: number }[] =
  [-15, 15].flatMap(z => [-30, 30].map(x => ({ x, z, y: [18.5, 26.5] as [number, number], width: 4 })));
export const CORRIDOR_LAMPS: { x: number; y: number; z: number }[] =
  [-30, -20, -10, 0, 10, 20, 30].flatMap(z => [-29.85, 29.85].map(x => ({ x, y: 15.5, z })));

// ── slot spawn (GDD §4.6) — Biru yaw = π, Merah yaw = 0
export const SPAWN_SLOTS: Record<'blue' | 'red', [number, number, number][]> = {
  blue: [[-6, 10, -48], [-3, 10, -46], [0, 10, -48], [3, 10, -46], [6, 10, -48]],
  red: [[-6, 10, 48], [-3, 10, 46], [0, 10, 48], [3, 10, 46], [6, 10, 48]],
};

// ── tumpukan buku lantai (6 × 4) dan area acak kertas
export const BOOK_PILES: [number, number][] = [[0, -12], [0, 12], [-15, -16], [15, -16], [-15, 16], [15, 16]];
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
  if (y < 1) return 'tile';
  for (const c of CARPETS) if (Math.abs(y - c.y) < 1 && x > c.x[0] && x < c.x[1] && z > c.z[0] && z < c.z[1]) return 'carpet';
  return 'wood';
}
