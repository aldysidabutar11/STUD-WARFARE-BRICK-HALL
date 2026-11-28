// src/world/maps/arunika/layout.ts — denah CANDI ARUNIKA: kompleks candi di hutan tropis saat matahari terbit (map Bomb Mission ke-2,
// desain bebas Claude atas permintaan pengguna 2026-11-28 "sekreatif mungkin"; gaya candi Jawa, layout orisinal).
// Utara = +Z (penyerang / slot 'red': dermaga sungai), Selatan = −Z (bertahan / slot 'blue': wihara). Barat = −X.
//  • Zona A "Teras Stupa" (barat daya): teras batu Y 3 dengan stupa induk + 4 stupa kecil berkisi, tangga utara/timur/selatan.
//  • Zona B "Taman Air" (tenggara): pendopo bertiang beratap joglo di panggung 1.5, 2 kolam teratai, arca, kamboja.
//  • Tengah: Pasar Desa → Gapura Bentar (2 menara + pintu samping) → Pelataran dengan Candi Induk (memecah garis pandang tengah),
//    kolam pantul, 4 candi perwara, arca dwarapala → A-pendek (sudut barat daya) & B-pendek (sudut tenggara); lorong biksu ke wihara.
//  • Jalur barat "Jalan Beringin" (pohon beringin, lentera batu, reruntuhan) & jalur timur "Gua Air Terjun" (atap batu, pilar).
// Ukuran area main 120 × 160 u (±43 × 58 m) — sekelas Meridian Vault x2. Tinggi pelindung patuh GDD §4.4 (≤ 2.4, 4.0, ≥ 5.6).
import type { SurfaceMaterial } from '../../../core/EventBus';
import { distToBoxXZ, stairFrame, stairHeightAt, type Box, type Cat, type SpawnFloor, type Stair, type Style } from '../../MapData';

/** Baris balok: [id, kategori, gaya, x0, x1, y0, y1, z0, z1]. */
type Row = [string, Cat, Style, number, number, number, number, number, number];

/** Lantai, panggung pendopo, teras stupa. */
export const AR_Y = { floor: 0, plinth: 1.5, terrace: 3 } as const;

/** Bangunan bertingkat (candi, menara gapura, cetiya, stupa): tiap tingkat = balok yang menyempit; visual dibangun dari balok yang
 *  sama (collider = visual). Tingkat = [y0, y1, sisip −X, sisip +X, sisip −Z, sisip +Z] dari tapak dasar. */
function tiers(id: string, cat: Cat, style: Style, x0: number, x1: number, z0: number, z1: number,
  levels: [number, number, number, number, number, number][]): Row[] {
  return levels.map(([y0, y1, a, b, c, d], i): Row => [`${id}_${i + 1}`, cat, style, x0 + a, x1 - b, y0, y1, z0 + c, z1 - d]);
}
/** Cetiya/candi perwara 6 × 6 × 8: kaki 2.4, tubuh, 2 tingkat atap. */
const SHRINE_TIERS: [number, number, number, number, number, number][] = [
  [0, 2.4, 0, 0, 0, 0], [2.4, 5.6, 0.6, 0.6, 0.6, 0.6], [5.6, 6.8, 1.1, 1.1, 1.1, 1.1], [6.8, 8, 1.8, 1.8, 1.8, 1.8],
];

const ROWS: Row[] = [
  // ── batas: tebing hutan Barat/Timur/Selatan, tanggul sungai Utara (di atasnya pembatas tak terlihat AR_BARRIERS → sungai terlihat)
  ['GROUND', 'shell', 'a_ground', -64, 64, -1, 0, -84, 82],
  ['OUT_W', 'shell', 'a_cliff', -64, -60, 0, 14, -84, 84],
  ['OUT_E', 'shell', 'a_cliff', 60, 64, 0, 14, -84, 84],
  ['OUT_S', 'shell', 'a_cliff', -60, 60, 0, 14, -84, -80],
  ['OUT_N_LOW', 'shell', 'a_embank', -60, 60, 0, 1.2, 80, 82],

  // ── Spawn Merah "Dermaga" (X −38…38, Z 66…80): 2 gerbang Selatan ke pasar, gerbang Barat & Timur ke jalur samping;
  //    tiap gerbang dibentengi aling-aling (tembok penghalang) di dalamnya → slot tidak terlihat dari luar
  ['RS_S1', 'spawn', 'a_wall', -38, -16, 0, 8, 64, 66],
  ['RS_S2', 'spawn', 'a_wall', -8, 8, 0, 8, 64, 66],
  ['RS_S3', 'spawn', 'a_wall', 16, 38, 0, 8, 64, 66],
  ['RS_W1', 'spawn', 'a_wall', -40, -38, 0, 8, 64, 69],
  ['RS_W2', 'spawn', 'a_wall', -40, -38, 0, 8, 77, 80],
  ['RS_E1', 'spawn', 'a_wall', 38, 40, 0, 8, 64, 69],
  ['RS_E2', 'spawn', 'a_wall', 38, 40, 0, 8, 77, 80],
  ['RS_GT_W1', 'spawn', 'a_bentar', -44, -38, 0, 12, 69, 71],
  ['RS_GT_W2', 'spawn', 'a_bentar', -44, -38, 0, 12, 75, 77],
  ['RS_GT_E1', 'spawn', 'a_bentar', 38, 44, 0, 12, 69, 71],
  ['RS_GT_E2', 'spawn', 'a_bentar', 38, 44, 0, 12, 75, 77],
  ['RS_AL_W', 'spawn', 'a_aling', -35, -34, 0, 6, 68.5, 77.5],
  ['RS_AL_E', 'spawn', 'a_aling', 34, 35, 0, 6, 68.5, 77.5],
  ['RS_AL_S', 'spawn', 'a_aling', -19, 19, 0, 6, 69, 70],

  // ── Jalur Barat "Jalan Beringin" (X −60…−38): beringin, batu, reruntuhan, pilar rebah, lentera, candi kecil di tebing
  ['W_TRUNK_1', 'cover', 'a_trunk', -54, -50, 0, 9, 54, 58],
  ['W_ROCK_1', 'cover', 'a_rock', -44, -40, 0, 4, 44, 48],
  ...tiers('W_SHRINE', 'wall', 'a_shrine', -60, -55, 38, 46, [[0, 2.4, 0, 0, 0, 0], [2.4, 5.6, 0, 0.6, 0.6, 0.6], [5.6, 6.8, 0, 1.1, 1.2, 1.2], [6.8, 8, 0, 1.6, 2, 2]]),
  ['W_RUIN_1', 'cover', 'a_ruin', -52, -46, 0, 4, 32, 34],
  ['W_PILLAR', 'cover', 'a_pillar', -60, -58, 0, 2.4, 24, 30],
  ...tiers('W_RG_1', 'wall', 'a_ruinT', -60, -54, 14, 20, [[0, 4.5, 0, 0, 0, 0], [4.5, 7.5, 0, 0.8, 0.6, 0.6], [7.5, 9, 0, 2.6, 0.9, 2.4]]),
  ...tiers('W_RG_2', 'wall', 'a_ruinT', -44, -38, 14, 20, [[0, 4.5, 0, 0, 0, 0], [4.5, 7.5, 0.8, 0, 0.6, 0.6], [7.5, 8.4, 2.2, 0, 2.6, 0.8]]),
  ['W_TRUNK_2', 'cover', 'a_trunk', -52, -48, 0, 9, 2, 6],
  ['W_RUIN_2', 'cover', 'a_ruin', -58, -54, 0, 2.4, -4, 0],
  ['W_TRUNK_3', 'cover', 'a_trunk', -54, -50, 0, 9, -16, -12],
  ['W_LANT_1', 'cover', 'a_lantern', -44, -42.8, 0, 2.4, 62, 63.2],
  ['W_LANT_2', 'cover', 'a_lantern', -58.8, -57.6, 0, 2.4, 48, 49.2],
  ['W_LANT_3', 'cover', 'a_lantern', -43, -41.8, 0, 2.4, 0, 1.2],

  // ── deret bangunan pemisah (rumah desa di sisi pasar, tembok candi di sisi pelataran & A/B-pendek) + gang Z 46…52
  ['W_ROW_C', 'wall', 'a_wall', -38, -30, 0, 9, -34, 22],
  ['W_ROW_M', 'wall', 'a_house', -38, -30, 0, 6, 22, 46],
  ['W_ROW_N', 'wall', 'a_house', -38, -30, 0, 6, 52, 64],
  ['E_ROW_C', 'wall', 'a_wall', 30, 38, 0, 9, -34, 22],
  ['E_ROW_M', 'wall', 'a_house', 30, 38, 0, 6, 22, 46],
  ['E_ROW_N', 'wall', 'a_house', 30, 38, 0, 6, 52, 64],

  // ── Pasar Desa (X −30…30, Z 30…64): lapak, sumur, gerobak, tumpukan peti & keranjang
  ['M_STALL_W1', 'cover', 'a_stall', -28, -22, 0, 2.4, 57, 59],
  ['M_STALL_W2', 'cover', 'a_stall', -28, -22, 0, 2.4, 40, 42],
  ['M_STALL_E1', 'cover', 'a_stall', 22, 28, 0, 2.4, 54, 56],
  ['M_STALL_E2', 'cover', 'a_stall', 22, 28, 0, 2.4, 37, 39],
  ['M_BANYAN', 'cover', 'a_trunk', -3, 3, 0, 9, 48, 54],
  ['M_WELL', 'cover', 'a_well', -20, -16, 0, 1.2, 46, 50],
  ['M_CART', 'cover', 'a_cart', 8, 13, 0, 2.4, 45, 48],
  ['M_CRATES_1', 'cover', 'a_crate', -15, -12, 0, 4, 54, 57],
  ['M_BASKETS', 'cover', 'a_basket', 15, 18, 0, 2.4, 57, 60],
  ['M_CRATES_2', 'cover', 'a_crate', -15, -12, 0, 4, 35, 38],

  // ── Gapura Bentar (Z 22…34): 2 menara (lorong tengah 10 u) + tembok bertepi pintu samping 4 u
  // candi bentar: tiap menara menyempit ke atas di 3 sisi, sisi dalam (bidang "terbelah") tegak rata
  ...tiers('G_TOWER_W', 'wall', 'a_tower', -15, -5, 22, 34, [[0, 5, 0, 0, 0, 0], [5, 9, 1, 0, 1, 1], [9, 12, 2, 0, 2, 2], [12, 14, 3.5, 0, 3.5, 3.5]]),
  ...tiers('G_TOWER_E', 'wall', 'a_tower', 5, 15, 22, 34, [[0, 5, 0, 0, 0, 0], [5, 9, 0, 1, 1, 1], [9, 12, 0, 2, 2, 2], [12, 14, 0, 3.5, 3.5, 3.5]]),
  ['G_WALL_W1', 'wall', 'a_wall', -30, -26, 0, 10, 26, 30],
  ['G_WALL_W2', 'wall', 'a_wall', -22, -15, 0, 10, 26, 30],
  ['G_LINT_W', 'wall', 'a_lintel', -26, -22, 6, 10, 26, 30],
  ['G_WALL_E1', 'wall', 'a_wall', 15, 22, 0, 10, 26, 30],
  ['G_WALL_E2', 'wall', 'a_wall', 26, 30, 0, 10, 26, 30],
  ['G_LINT_E', 'wall', 'a_lintel', 22, 26, 6, 10, 26, 30],

  // ── Pelataran (X −30…30, Z −22…22): Candi Induk, kolam pantul (airnya dangkal, bisa diseberangi), 4 candi perwara, dwarapala
  // Candi Induk: kaki 4, tubuh, 3 tingkat atap + ratna
  ...tiers('C_TEMPLE', 'wall', 'a_temple', -8, 8, -10, 6, [[0, 4, 0, 0, 0, 0], [4, 9, 1.5, 1.5, 1.5, 1.5], [9, 12, 3, 3, 3, 3],
    [12, 14.5, 4.5, 4.5, 4.5, 4.5], [14.5, 16.5, 6, 6, 6, 6], [16.5, 18.5, 7.4, 7.4, 7.4, 7.4]]),
  ['C_POOL_N', 'cover', 'a_pond', -8, 8, 0, 0.5, 14.4, 15],
  ['C_POOL_S', 'cover', 'a_pond', -8, 8, 0, 0.5, 9, 9.6],
  ['C_POOL_W', 'cover', 'a_pond', -8, -7.4, 0, 0.5, 9.6, 14.4],
  ['C_POOL_E', 'cover', 'a_pond', 7.4, 8, 0, 0.5, 9.6, 14.4],
  ['C_STATUE_GW', 'cover', 'a_statue', -11, -8, 0, 4, 17, 20],
  ['C_STATUE_GE', 'cover', 'a_statue', 8, 11, 0, 4, 17, 20],
  ...tiers('C_SHRINE_NW', 'wall', 'a_shrine', -28, -22, 12, 18, SHRINE_TIERS),
  ...tiers('C_SHRINE_NE', 'wall', 'a_shrine', 22, 28, 12, 18, SHRINE_TIERS),
  ...tiers('C_SHRINE_SW', 'wall', 'a_shrine', -28, -22, -18, -12, SHRINE_TIERS),
  ...tiers('C_SHRINE_SE', 'wall', 'a_shrine', 22, 28, -18, -12, SHRINE_TIERS),
  ['C_STATUE_W', 'cover', 'a_statue', -19, -16, 0, 4, -4, -1],
  ['C_STATUE_E', 'cover', 'a_statue', 16, 19, 0, 4, -4, -1],
  ['C_LANT_1', 'cover', 'a_lantern', -14, -12.8, 0, 2.4, 10, 11.2],
  ['C_LANT_2', 'cover', 'a_lantern', 12.8, 14, 0, 2.4, 10, 11.2],
  ['C_LANT_3', 'cover', 'a_lantern', -14, -12.8, 0, 2.4, -17, -15.8],
  ['C_LANT_4', 'cover', 'a_lantern', 12.8, 14, 0, 2.4, -17, -15.8],
  ['C_PLANT_W', 'cover', 'a_planter', -26, -22, 0, 2.4, -2, 4],
  ['C_PLANT_E', 'cover', 'a_planter', 22, 26, 0, 2.4, -2, 4],

  // ── Wihara (X −19…19, Z −64…−22): blok asrama + Lorong Biksu 10 u; Balai Genta bertiang (Z −46…−38) dengan pintu samping
  //    ke A-pendek & B-pendek (rotasi bertahan antar zona, jalur tengah penyerang)
  ['MON_W1', 'wall', 'a_wall', -19, -5, 0, 10, -64, -46],
  ['MON_W2', 'wall', 'a_wall', -19, -5, 0, 10, -38, -22],
  ['MON_WH_S', 'wall', 'a_wall', -19, -12, 0, 10, -46, -44],
  ['MON_WH_N', 'wall', 'a_wall', -19, -12, 0, 10, -40, -38],
  ['MON_WH_L', 'wall', 'a_lintel', -19, -12, 6, 10, -44, -40],
  ['MON_E1', 'wall', 'a_wall', 5, 19, 0, 10, -64, -46],
  ['MON_E2', 'wall', 'a_wall', 5, 19, 0, 10, -38, -22],
  ['MON_EH_S', 'wall', 'a_wall', 12, 19, 0, 10, -46, -44],
  ['MON_EH_N', 'wall', 'a_wall', 12, 19, 0, 10, -40, -38],
  ['MON_EH_L', 'wall', 'a_lintel', 12, 19, 6, 10, -44, -40],
  ['MON_COL_1', 'pillar', 'a_column', -9, -8, 0, 7, -46, -45],
  ['MON_COL_2', 'pillar', 'a_column', 8, 9, 0, 7, -46, -45],
  ['MON_COL_3', 'pillar', 'a_column', -9, -8, 0, 7, -39, -38],
  ['MON_COL_4', 'pillar', 'a_column', 8, 9, 0, 7, -39, -38],
  ['MON_ROOF', 'wall', 'a_roof', -12, 12, 7, 8, -46, -38],
  ['MON_BELL', 'cover', 'a_bell', -1.5, 1.5, 0, 6, -43.5, -40.5],
  ['MON_GATE', 'wall', 'a_lintel', -5, 5, 7, 10, -24, -22],
  ['MON_URN_1', 'cover', 'a_urn', -3, -1, 0, 2.4, -31, -29],
  ['MON_URN_2', 'cover', 'a_urn', 1, 3, 0, 2.4, -58, -56],

  // ── Zona A "Teras Stupa" (X −60…−19, Z −64…−34): teras batu Y 3, stupa induk + 4 stupa kecil berkisi, 3 tangga
  ['A_TERRACE', 'mass', 'a_terrace', -54, -30, 0, 3, -52, -34],
  // stupa induk: lapik 8 × 8 + genta (hull AR_HULLS) + harmika + yasti; 4 stupa kecil = lapik 3 × 3 + genta berkisi (hull)
  ...tiers('A_STUPA', 'wall', 'a_stupa', -46, -38, -47, -39, [[3, 5.5, 0, 0, 0, 0], [10, 11, 3.2, 3.2, 3.2, 3.2], [11, 15, 3.6, 3.6, 3.6, 3.6]]),
  ['A_SST_1', 'cover', 'a_stupaS', -53.4, -50.4, 3, 4, -51.4, -48.4],
  ['A_SST_2', 'cover', 'a_stupaS', -33.6, -30.6, 3, 4, -51.4, -48.4],
  ['A_SST_3', 'cover', 'a_stupaS', -53.4, -50.4, 3, 4, -37.6, -34.6],
  ['A_SST_4', 'cover', 'a_stupaS', -33.6, -30.6, 3, 4, -37.6, -34.6],
  ['A_BAL_N1', 'rail', 'a_balus', -54, -46, 3, 4.2, -34.6, -34],
  ['A_BAL_N2', 'rail', 'a_balus', -38, -30, 3, 4.2, -34.6, -34],
  ['A_BAL_S1', 'rail', 'a_balus', -54, -46, 3, 4.2, -52, -51.4],
  ['A_BAL_S2', 'rail', 'a_balus', -38, -30, 3, 4.2, -52, -51.4],
  ['A_BAL_E1', 'rail', 'a_balus', -30.6, -30, 3, 4.2, -51.4, -47],
  ['A_BAL_E2', 'rail', 'a_balus', -30.6, -30, 3, 4.2, -39, -34.6],
  ['A_BAL_W', 'rail', 'a_balus', -54, -53.4, 3, 4.2, -51.4, -34.6],
  ['A_STONE', 'cover', 'a_rock', -52, -48, 0, 2.4, -31, -28],
  ['A_RUIN', 'cover', 'a_ruin', -60, -57, 0, 4, -50, -42],
  ['A_LANT_1', 'cover', 'a_lantern', -29.4, -28.2, 0, 2.4, -21, -19.8],
  ['A_CRATES', 'cover', 'a_crate', -29, -26, 0, 4, -58, -55],
  ['A_ROCK', 'cover', 'a_rock', -59, -56, 0, 2.4, -63, -60],

  // ── Zona B "Taman Air" (X 19…60, Z −64…−34): pendopo bertiang beratap joglo di panggung 1.5, 2 kolam teratai, arca, kamboja
  ['B_PLAT', 'mass', 'a_plinth', 36, 52, 0, 1.5, -50, -38],
  ['B_COL_1', 'pillar', 'a_column', 37.5, 38.5, 1.5, 8, -48.5, -47.5],
  ['B_COL_2', 'pillar', 'a_column', 43.5, 44.5, 1.5, 8, -48.5, -47.5],
  ['B_COL_3', 'pillar', 'a_column', 49.5, 50.5, 1.5, 8, -48.5, -47.5],
  ['B_COL_4', 'pillar', 'a_column', 37.5, 38.5, 1.5, 8, -40.5, -39.5],
  ['B_COL_5', 'pillar', 'a_column', 43.5, 44.5, 1.5, 8, -40.5, -39.5],
  ['B_COL_6', 'pillar', 'a_column', 49.5, 50.5, 1.5, 8, -40.5, -39.5],
  ['B_ROOF', 'wall', 'a_roof', 35, 53, 8, 9, -51, -37],
  ['B_ALTAR', 'cover', 'a_altar', 43, 45, 1.5, 3.9, -46.5, -44.5],
  ['B_POND1_N', 'cover', 'a_pond', 20, 25.8, 0, 0.4, -56.6, -56],
  ['B_POND1_S', 'cover', 'a_pond', 20, 25.8, 0, 0.4, -62, -61.4],
  ['B_POND1_W', 'cover', 'a_pond', 20, 20.6, 0, 0.4, -61.4, -56.6],
  ['B_POND1_E', 'cover', 'a_pond', 25.2, 25.8, 0, 0.4, -61.4, -56.6],
  ['B_POND2_N', 'cover', 'a_pond', 52, 59, 0, 0.4, -56.6, -56],
  ['B_POND2_S', 'cover', 'a_pond', 52, 59, 0, 0.4, -62, -61.4],
  ['B_POND2_W', 'cover', 'a_pond', 52, 52.6, 0, 0.4, -61.4, -56.6],
  ['B_POND2_E', 'cover', 'a_pond', 58.4, 59, 0, 0.4, -61.4, -56.6],
  ['B_STATUE', 'cover', 'a_statue', 24, 27, 0, 4, -50, -47],
  ['B_TRUNK_1', 'cover', 'a_trunk', 56, 57.2, 0, 8, -53, -51.8],
  ['B_TRUNK_2', 'cover', 'a_trunk', 26.5, 27.7, 0, 8, -41, -39.8],
  ['B_PLANTER', 'cover', 'a_planter', 53, 57, 0, 2.4, -32, -28],
  ['B_LANT', 'cover', 'a_lantern', 33, 34.2, 0, 2.4, -55, -53.8],
  ['B_CRATES', 'cover', 'a_crate', 26, 29, 0, 4, -27, -24],

  // ── Jalur Timur "Gua Air Terjun" (X 38…60): atap batu Z −10…28 berlubang (sumur cahaya di atas kolam air terjun X 50…60 Z 3…15
  //    + lubang Z 20…25), pilar batu, batu, beringin, lentera
  ['E_CAVE_R1', 'wall', 'a_cave', 38, 60, 9, 12, -10, 3],
  ['E_CAVE_R2', 'wall', 'a_cave', 38, 50, 9, 12, 3, 15],
  ['E_CAVE_R3', 'wall', 'a_cave', 38, 60, 9, 12, 15, 20],
  ['E_CAVE_R4', 'wall', 'a_cave', 38, 41, 9, 12, 20, 25],
  ['E_CAVE_R5', 'wall', 'a_cave', 47, 60, 9, 12, 20, 25],
  ['E_CAVE_R6', 'wall', 'a_cave', 38, 60, 9, 12, 25, 28],
  ['E_PIL_1', 'wall', 'a_rock', 46, 50, 0, 9, 2, 6],
  ['E_PIL_2', 'wall', 'a_rock', 52, 56, 0, 9, 16, 20],
  ['E_POOL_W', 'cover', 'a_pond', 52.4, 53, 0, 0.4, 3.4, 14.6],
  ['E_POOL_N', 'cover', 'a_pond', 53, 60, 0, 0.4, 14, 14.6],
  ['E_POOL_S', 'cover', 'a_pond', 53, 60, 0, 0.4, 3.4, 4],
  ['E_ROCK_1', 'cover', 'a_rock', 40, 43, 0, 2.4, 10, 13],
  ['E_ROCK_2', 'cover', 'a_rock', 54, 57, 0, 4, -6, -3],
  ['E_ROCK_3', 'cover', 'a_rock', 41, 45, 0, 4, 44, 48],
  ['E_TRUNK_1', 'cover', 'a_trunk', 44, 47, 0, 8, 58, 61],
  ['E_TRUNK_2', 'cover', 'a_trunk', 52, 55, 0, 8, 36, 39],
  ['E_LANT_1', 'cover', 'a_lantern', 42.8, 44, 0, 2.4, 62, 63.2],

  // ── Spawn Biru "Wihara" (X −40…40, Z −80…−66): tembok Utara dengan 3 gerbang (A, Lorong Biksu, B), 3 aling-aling 3 u di
  //    belakangnya (celah 4.5 u di antaranya, tidak segaris gerbang mana pun), cetiya di belakang
  ['BS_N1', 'spawn', 'a_wall', -40, -36, 0, 8, -66, -64],
  ['BS_N2', 'spawn', 'a_wall', -28, -5, 0, 8, -66, -64],
  ['BS_N3', 'spawn', 'a_wall', 5, 28, 0, 8, -66, -64],
  ['BS_N4', 'spawn', 'a_wall', 36, 40, 0, 8, -66, -64],
  ['BLK_SW', 'mass', 'a_cliff', -60, -40, 0, 12, -80, -64],
  ['BLK_SE', 'mass', 'a_cliff', 40, 60, 0, 12, -80, -64],
  ['BS_AL_A', 'spawn', 'a_aling', -40, -20.5, 0, 6, -70, -69],
  ['BS_AL_C', 'spawn', 'a_aling', -16, 16, 0, 6, -70, -69],
  ['BS_AL_B', 'spawn', 'a_aling', 20.5, 40, 0, 6, -70, -69],
  ...tiers('BS_SHRINE', 'wall', 'a_shrine', -4, 4, -80, -76, [[0, 2, 0, 0, 0, 0], [2, 4.6, 0.6, 0.6, 0, 0.6], [4.6, 6, 1.6, 1.6, 0, 1.2]]),
];

export const AR_BOXES: Box[] = ROWS.map(([id, cat, style, x0, x1, y0, y1, z0, z1]) => ({ id, cat, style, min: [x0, y0, z0], max: [x1, y1, z1] }));

// ───────────────────────── bentuk bulat/miring (collider convexHull, visual dari profil yang SAMA)
/** Collider cembung (Rapier convexHull) — genta stupa, atap pelana rumah, atap joglo. `cover` = dihitung pelindung (tinggi §4.4). */
export interface ArHull { id: string; style: Style; pts: number[]; cover?: boolean }
/** Profil genta [y, jari-jari] (dari dasar ke puncak). */
export type BellProfile = readonly (readonly [number, number])[];
/** Genta stupa induk (Borobudur): mangkuk menggembung lalu membulat ke harmika. */
export const STUPA_BELL: BellProfile = [[5.5, 3.3], [6.2, 3.6], [7.4, 3.65], [8.4, 3.35], [9.2, 2.7], [9.8, 1.8], [10, 1.2]];
/** Genta stupa kecil berkisi (lapik 3 × 3, puncak 7.0 = 4.0 di atas teras → pita cover §4.4 aman). */
export const SMALL_BELL: BellProfile = [[4, 1.15], [4.5, 1.38], [5.4, 1.42], [6.2, 1.15], [6.7, 0.75], [7, 0.4]];
export const BELL_SEG = 16;
export function bellPts(cx: number, cz: number, prof: BellProfile): number[] {
  const out: number[] = [];
  for (const [y, r] of prof) for (let i = 0; i < BELL_SEG; i++) {
    const a = (i / BELL_SEG) * Math.PI * 2;
    out.push(cx + Math.cos(a) * r, y, cz + Math.sin(a) * r);
  }
  return out;
}
/** Atap pelana sepanjang Z (rumah desa): lis 0.5 di luar tembok samping, ujung pelana `oz0/oz1` (0 = menempel tembok tetangga). */
export function gablePts(x0: number, x1: number, z0: number, z1: number, yEave: number, yRidge: number, oz0: number, oz1: number): number[] {
  const o = 0.5, cx = (x0 + x1) / 2, a = z0 - oz0, b = z1 + oz1;
  return [x0 - o, yEave, a, x1 + o, yEave, a, x0 - o, yEave, b, x1 + o, yEave, b, cx, yRidge, a, cx, yRidge, b];
}
/** Limas terpancung (rok joglo / brunjung): alas (x0..x1, z0..z1) di y0, atas menyempit `ins` di y1 (ins ≥ setengah lebar → puncak). */
export function frustumPts(x0: number, x1: number, z0: number, z1: number, y0: number, y1: number, insX: number, insZ: number): number[] {
  const tx0 = Math.min(x0 + insX, (x0 + x1) / 2 - 0.05), tx1 = Math.max(x1 - insX, (x0 + x1) / 2 + 0.05);
  const tz0 = Math.min(z0 + insZ, (z0 + z1) / 2 - 0.05), tz1 = Math.max(z1 - insZ, (z0 + z1) / 2 + 0.05);
  return [x0, y0, z0, x1, y0, z0, x0, y0, z1, x1, y0, z1, tx0, y1, tz0, tx1, y1, tz0, tx0, y1, tz1, tx1, y1, tz1];
}
export const AR_HULLS: ArHull[] = [
  { id: 'A_STUPA_BELL', style: 'a_stupa', pts: bellPts(-42, -43, STUPA_BELL) },
  ...([[-51.9, -49.9], [-32.1, -49.9], [-51.9, -36.1], [-32.1, -36.1]] as const).map(([x, z], i): ArHull =>
    ({ id: `A_SST_${i + 1}_BELL`, style: 'a_stupaS', pts: bellPts(x, z, SMALL_BELL), cover: true })),
  // rumah desa: atap pelana genteng (tembok 6, bubungan 10)
  { id: 'W_ROW_M_ROOF', style: 'a_house', pts: gablePts(-38, -30, 22, 46, 6, 10, 0, 0.5) },
  { id: 'W_ROW_N_ROOF', style: 'a_house', pts: gablePts(-38, -30, 52, 64, 6, 10, 0.5, 0) },
  { id: 'E_ROW_M_ROOF', style: 'a_house', pts: gablePts(30, 38, 22, 46, 6, 10, 0, 0.5) },
  { id: 'E_ROW_N_ROOF', style: 'a_house', pts: gablePts(30, 38, 52, 64, 6, 10, 0.5, 0) },
  // atap joglo: rok landai di atas pelat + brunjung curam
  { id: 'B_ROOF_SKIRT', style: 'a_roof', pts: frustumPts(35, 53, -51, -37, 9, 10.4, 4.5, 3.5) },
  { id: 'B_ROOF_PEAK', style: 'a_roof', pts: frustumPts(39.5, 48.5, -47.5, -40.5, 10.4, 13.4, 3.9, 3.0) },
  { id: 'MON_ROOF_SKIRT', style: 'a_roof', pts: frustumPts(-12, 12, -46, -38, 8, 9.2, 5, 2) },
  { id: 'MON_ROOF_PEAK', style: 'a_roof', pts: frustumPts(-7, 7, -44, -40, 9.2, 11.6, 6.2, 1.7) },
];

/** Pembatas tak terlihat di atas tanggul sungai (grup BARRIER: menahan karakter/granat/benda lepas; peluru & garis pandang tembus
 *  → tidak ada bekas peluru melayang di udara, sungai & perahu tetap terlihat). */
export const AR_BARRIERS: { min: [number, number, number]; max: [number, number, number] }[] = [
  { min: [-60, 1.2, 80], max: [60, 30, 84] },
];

/** Batas area bermain (dalam tebing / tanggul). */
export const AR_BOUNDS = { x: [-60, 60] as [number, number], z: [-80, 80] as [number, number] };

// ───────────────────────── tangga (ramp convexHull)
export const AR_STAIRS: Stair[] = [
  // teras stupa A: Utara (dari Jalan Beringin) & Selatan (dari gerbang wihara) naik ke teras Y 3; Timur dari A-pendek
  { id: 'A_STAIR_N', x: [-46, -38], zFoot: -26, zTop: -34, openX: 0, yFoot: 0, yTop: 3 },
  { id: 'A_STAIR_S', x: [-46, -38], zFoot: -60, zTop: -52, openX: 0, yFoot: 0, yTop: 3 },
  { id: 'A_STAIR_E', x: [-30, -23], zFoot: -47, zTop: -39, openX: 0, yFoot: 0, yTop: 3, alongX: { z: [-47, -39], xFoot: -23, xTop: -30 } },
  // panggung pendopo B 0 → 1.5 dari 4 sisi
  { id: 'B_STEP_N', x: [40, 48], zFoot: -34, zTop: -38, openX: 0, yFoot: 0, yTop: 1.5 },
  { id: 'B_STEP_S', x: [40, 48], zFoot: -54, zTop: -50, openX: 0, yFoot: 0, yTop: 1.5 },
  { id: 'B_STEP_W', x: [32, 36], zFoot: -47, zTop: -41, openX: 0, yFoot: 0, yTop: 1.5, alongX: { z: [-47, -41], xFoot: 32, xTop: 36 } },
  { id: 'B_STEP_E', x: [52, 56], zFoot: -47, zTop: -41, openX: 0, yFoot: 0, yTop: 1.5, alongX: { z: [-47, -41], xFoot: 56, xTop: 52 } },
];

// ───────────────────────── spawn (5 slot per kelompok) — 'red' = dermaga Utara (penyerang babak 1), 'blue' = wihara Selatan
export const AR_SPAWNS: Record<'blue' | 'red', Record<SpawnFloor, [number, number, number][]>> = {
  blue: { upper: [], ground: [[-22, 0, -74], [-11, 0, -77], [0, 0, -73.5], [11, 0, -77], [22, 0, -74]] },
  red: { upper: [], ground: [[-22, 0, 75], [-11, 0, 77], [0, 0, 74], [11, 0, 77], [22, 0, 75]] },
};
/** Arah hadap: Selatan menghadap Utara (+Z, yaw π), Utara menghadap Selatan (−Z, yaw 0). */
export const AR_SPAWN_YAW: Record<'blue' | 'red', number> = { blue: Math.PI, red: 0 };

// ───────────────────────── zona bom (AABB pemicu tanam) & titik tanam bawaan bot
export interface BombSite { id: 'A' | 'B'; min: [number, number, number]; max: [number, number, number]; botPlant: [number, number, number] }
export const AR_SITES: readonly BombSite[] = [
  { id: 'A', min: [-54, 3, -52], max: [-30, 7, -34], botPlant: [-42, 3, -36.5] },
  { id: 'B', min: [34, 0, -54], max: [54, 5, -34], botPlant: [40.5, 1.5, -44] },
];

// ───────────────────────── nama area (radar) & permukaan
export function arZoneName(x: number, y: number, z: number): string {
  const ax = Math.abs(x);
  if ((z >= 64 && ax < 38) || (ax >= 38 && ax <= 44 && z >= 69 && z <= 77)) return 'Dermaga';
  if (z <= -64 && ax < 40) return 'Wihara';
  if (x <= -38 && z > -22) return 'Jalan Beringin';
  if (x >= 38 && z > -22) return z < 29 ? 'Gua Air Terjun' : 'Hutan Timur';
  if (z <= -22 && z > -34) {
    if (x <= -38) return 'A Utama';
    if (x >= 38) return 'B Utama';
    if (x < -19) return 'A-Pendek';
    if (x > 19) return 'B-Pendek';
  }
  if (z <= -34 && x < -19) return y >= 2.5 ? 'Teras Stupa (A)' : 'Zona A';
  if (z <= -34 && x > 19) return 'Taman Air (B)';
  if (z <= -38 && z >= -46 && ax < 19) return 'Balai Genta';
  if (z <= -22) return 'Lorong Biksu';
  if (z >= 34) return 'Pasar Desa';
  if (z >= 22) return 'Gapura';
  return 'Pelataran';
}

const STYLE_SURF: Partial<Record<Style, SurfaceMaterial>> = {
  a_column: 'wood', a_stall: 'wood', a_crate: 'wood', a_cart: 'wood', a_basket: 'wood', a_roof: 'wood', a_plinth: 'wood',
  a_bell: 'metal', a_trunk: 'wood',
};
const FLOORISH = new Set<Style>(['a_ground']);
const OBJECTS = AR_BOXES.filter(b => !FLOORISH.has(b.style));
const STAIR_FRAMES = AR_STAIRS.map(s => ({ s, f: stairFrame(s) }));
/** Area tanah (jalur rumput/tanah) vs paving batu: jalur samping & hutan = pasir/tanah, dermaga = kayu, sisanya batu. */
function groundSurf(x: number, z: number): SurfaceMaterial {
  if (z >= 66 && x > -38 && x < 38) return 'wood';
  if (x <= -38 || x >= 38) return z > -22 ? 'sand' : 'tile';
  return 'tile';
}
/** Permukaan di titik: benda yang disentuh → materialnya; tangga batu; lantai sesuai area. */
export function arSurfaceAt(x: number, y: number, z: number): SurfaceMaterial {
  for (const w of AR_WATER) if (y < w.y + 0.2 && x > w.x[0] && x < w.x[1] && z > w.z[0] && z < w.z[1]) return 'water';
  for (const b of OBJECTS) {
    if (y < b.min[1] - 0.05 || y > b.max[1] + 0.05 || distToBoxXZ(b, x, z) > 0.05) continue;
    return STYLE_SURF[b.style] ?? 'tile';
  }
  for (const { f } of STAIR_FRAMES) {
    if (x < f.x[0] - 0.05 || x > f.x[1] + 0.05 || z < f.z[0] - 0.05 || z > f.z[1] + 0.05) continue;
    if (Math.abs(y - stairHeightAt(f, x, z)) < 0.6) return 'tile';
  }
  return y < 0.3 ? groundSurf(x, z) : 'tile';
}

// ───────────────────────── latihan, kamera menu, probe pantulan
/** Mode Latihan: dummy Merah di semua area & elevasi; pemain (Biru) mulai di wihara. */
export const AR_PRACTICE: [number, number, number, boolean][] = [
  [-48, 0, 40, false], [-46, 0, -2, false], [-42, 3, -36.5, false], [-26, 0, -36, false], [0, 0, 44, false], [-20, 0, 12, false],
  [20, 0, -8, false], [48, 1.5, -44, false], [27, 0, -36, false], [48, 0, 12, false], [0, 0, -16, true], [6, 0, 58, true],
];
/** Kamera menu: orbit di atas pelataran memandang kolam pantul & Candi Induk. */
export const AR_MENU_CAM: { look: [number, number, number]; rx: number; rz: number; y: number } = { look: [0, 8, 12], rx: 26, rz: 30, y: 18 };
/** CubeCamera pantulan: udara pelataran di depan candi. */
export const AR_ENV_PROBE: [number, number, number] = [0, 7, 16];

// ───────────────────────── air (visual): kolam pantul, kolam teratai, sungai di luar tanggul
export const AR_WATER: { x: [number, number]; z: [number, number]; y: number; lotus: number }[] = [
  { x: [-7.4, 7.4], z: [9.6, 14.4], y: 0.28, lotus: 5 },
  { x: [20.6, 25.2], z: [-61.4, -56.6], y: 0.22, lotus: 5 },
  { x: [52.6, 58.4], z: [-61.4, -56.6], y: 0.22, lotus: 6 },
  { x: [53, 60], z: [4, 14], y: 0.24, lotus: 0 },
];

/** Pohon latar (visual, tanpa collider): kelapa & kamboja di balik tebing/tanggul dan sudut taman. [x, z, tinggi, jenis]. */
export const AR_PALMS: [number, number, number, 'palm' | 'kamboja'][] = [
  [-56, 86, 13, 'palm'], [-40, 88, 15, 'palm'], [-18, 87, 12, 'palm'], [12, 89, 14, 'palm'], [34, 86, 13, 'palm'], [54, 88, 15, 'palm'],
  [-68, 60, 14, 'palm'], [-69, 20, 16, 'palm'], [-67, -30, 13, 'palm'], [68, 54, 15, 'palm'], [69, 4, 13, 'palm'], [67, -48, 16, 'palm'],
  [-40, -86, 14, 'palm'], [-6, -88, 13, 'palm'], [30, -87, 15, 'palm'],
];
