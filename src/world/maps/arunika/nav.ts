// src/world/maps/arunika/nav.ts — graf navigasi bot Candi Arunika (map asimetris Utara–Selatan: penyerang babak 1 = Merah di dermaga
// Utara, bertahan = Biru di wihara Selatan; sisi node dari Z). Semua node ≥ 0.9 u dari penghalang lantainya, edge datar lurus selebar
// kapsul (tests/arunika.test.ts: sapuan 2D + raycast Rapier). Elevasi: tanah 0, panggung pendopo B 1.5, teras stupa A 3 — konektor
// = edge 'stair' (ramp). Bibir kolam (≤ 0.4) bisa dilangkahi → beberapa edge pelataran memotong sudut kolam pantul.
import type { EdgeKind } from '../../NavGraph';
import type { LaneDef, NavTemplate } from '../types';
import { XCFG } from '../../../config/extraConfig';

/** [id, x, z, lantai]. */
const N: [string, number, number, number][] = [
  // ── Spawn Merah "Dermaga"
  ['RS_C', 0, 75.5, 0], ['RS_W', -22, 77.5, 0], ['RS_E', 22, 77.5, 0], ['RS_SW', -24, 67.5, 0], ['RS_SE', 24, 67.5, 0],
  ['RS_GW_IN', -12, 67.5, 0], ['RS_GW_OUT', -12, 61, 0], ['RS_GE_IN', 12, 67.5, 0], ['RS_GE_OUT', 12, 61, 0],
  ['RS_WN', -36.5, 78.75, 0], ['RS_WS', -36.5, 67.25, 0], ['RS_WG_IN', -36.5, 73, 0], ['RS_WG_OUT', -47, 73, 0],
  ['RS_EN', 36.5, 78.75, 0], ['RS_ES', 36.5, 67.25, 0], ['RS_EG_IN', 36.5, 73, 0], ['RS_EG_OUT', 47, 73, 0],
  // ── Jalan Beringin (Barat)
  ['WL_N2', -48, 64, 0], ['WL_W1', -53, 50, 0], ['WL_ALLEY_W', -44, 50, 0], ['WL_ALLEY', -34, 49, 0], ['WL_MID1', -49, 40, 0],
  ['WL_MID2', -42, 31, 0], ['WL_MID3', -56, 33, 0], ['WL_MID3S', -56, 22.5, 0], ['WL_GATE_N', -49, 23.5, 0], ['WL_GATE_S', -46, 10, 0], ['WL_S2', -46, -8, 0],
  ['WL_S3', -56.5, -6, 0], ['WL_S4', -46, -22, 0], ['WL_S5', -56, -24, 0], ['WL_TW_N', -57, -33, 0], ['WL_TW', -55.5, -46, 0], ['A_SW', -56, -57, 0],
  // ── Zona A: kaki & puncak 3 tangga teras (3), sisi Selatan
  ['A_N_FOOT', -42, -23.5, 0], ['A_N_TOP', -42, -36.5, 3], ['A_T_NW', -49, -36.5, 3], ['A_T_W', -49, -43, 3], ['A_T_SW', -49, -49.5, 3],
  ['A_S_TOP', -42, -49.5, 3], ['A_T_SE', -35, -49.5, 3], ['A_T_NE', -35, -36.5, 3], ['A_S_FOOT', -42, -62, 0], ['A_GATE_OUT', -32, -59, 0], ['A_SE', -24, -62, 0],
  // ── A-pendek & sisi Timur teras
  ['AS_N', -22, -20.5, 0], ['AS_MID', -24.5, -29, 0], ['AS_S', -24.5, -37, 0], ['AS_E_FOOT', -21, -43, 0], ['AS_E_TOP', -33, -43, 3],
  ['AS_S2', -22, -52, 0],
  // ── Pasar
  ['MK_NW', -20, 61, 0], ['MK_N', 0, 59, 0], ['MK_NE', 20, 61, 0], ['MK_W2', -17, 53, 0], ['MK_W', -25, 49, 0], ['MK_C', -8, 46, 0],
  ['MK_CE', 8, 52, 0], ['MK_E2', 19, 52, 0], ['MK_E', 25, 49, 0], ['MK_SW2', -19, 41, 0], ['MK_SE2', 19, 41, 0], ['MK_SW', -22, 34, 0],
  ['MK_S', 0, 38, 0], ['MK_SE', 22, 34, 0],
  // ── Gapura & Pelataran
  ['G_C', 0, 28, 0], ['GD_W', -24, 28, 0], ['GD_E', 24, 28, 0], ['GD_W_S', -24, 23, 0], ['GD_E_S', 24, 23, 0],
  ['CY_N', 0, 19, 0], ['CY_NW', -18, 20, 0], ['CY_NE', 18, 20, 0], ['CY_W', -15, 6, 0], ['CY_E', 15, 6, 0],
  ['CY_SW', -14, -14, 0], ['CY_SE', 14, -14, 0], ['CY_S', 0, -16, 0],
  // ── Lorong Biksu & Balai Genta
  ['CR_N', 0, -20, 0], ['CR_1', 0, -34, 0], ['H_N', 0, -36.5, 0], ['H_W', -5.5, -42, 0], ['H_E', 5.5, -42, 0], ['H_S', 0, -48, 0],
  ['HC_W', -15.5, -42, 0], ['HC_E', 15.5, -42, 0], ['CR_S', -1.5, -61.5, 0],
  // ── Spawn Biru "Wihara"
  ['BS_C', 0, -74, 0], ['BS_W', -18, -75, 0], ['BS_E', 18, -75, 0], ['BS_GA_IN', -32, -67.5, 0], ['BS_GC_IN', 0, -67.5, 0],
  ['BS_GB_IN', 32, -67.5, 0], ['BS_GAW', -18, -67.5, 0], ['BS_GBE', 18, -67.5, 0],
  // ── B-pendek, Taman Air, pendopo (1.5)
  ['BH_N', 22, -20.5, 0], ['BH_MID', 24.5, -30, 0], ['BH_S', 24.5, -37, 0], ['BH_E_IN', 21.5, -42, 0], ['B_NW', 22, -52, 0],
  ['B_W_FOOT', 30, -44, 0], ['B_W_TOP', 37.5, -44, 1.5], ['B_P_W', 40.5, -43, 1.5], ['B_P_E', 47.5, -43, 1.5], ['B_P_N', 41, -39, 1.5],
  ['B_P_S', 41, -49, 1.5], ['B_E_TOP', 50.5, -44, 1.5], ['B_N_FOOT', 41, -31.5, 0], ['B_S_FOOT', 41, -56.5, 0], ['B_E_FOOT', 58, -44, 0],
  ['B_GATE_OUT', 32, -59, 0], ['B_SE', 50, -62, 0], ['B_NE', 52, -36, 0],
  // ── Gua Air Terjun & Hutan Timur
  ['EL_S1', 46, -26, 0], ['EL_S2', 48, -14, 0], ['EL_C1', 44, -2, 0], ['EL_C2', 43, 8, 0], ['EL_C3', 47, 14, 0], ['EL_C4', 46, 24, 0],
  ['EL_PS', 52.5, -1, 0], ['EL_POOL', 56.5, 9, 0], ['EL_PN', 57.5, 22, 0],
  ['EL_N1', 47, 32, 0], ['EL_N2', 48.5, 44, 0], ['EL_ALLEY_E', 45.5, 51, 0], ['EL_ALLEY', 34, 49, 0], ['EL_N3', 51, 54, 0], ['EL_N4', 48, 64, 0],
];

type E = [string, string, EdgeKind];
const EDGES: E[] = [
  // Spawn Merah
  ['RS_C', 'RS_W', 'walk'], ['RS_C', 'RS_E', 'walk'], ['RS_W', 'RS_WN', 'walk'], ['RS_WN', 'RS_WG_IN', 'walk'], ['RS_WS', 'RS_WG_IN', 'walk'],
  ['RS_W', 'RS_SW', 'walk'], ['RS_SW', 'RS_WS', 'walk'], ['RS_SW', 'RS_GW_IN', 'walk'], ['RS_GW_IN', 'RS_GE_IN', 'walk'],
  ['RS_E', 'RS_EN', 'walk'], ['RS_EN', 'RS_EG_IN', 'walk'], ['RS_ES', 'RS_EG_IN', 'walk'], ['RS_E', 'RS_SE', 'walk'], ['RS_SE', 'RS_ES', 'walk'],
  ['RS_SE', 'RS_GE_IN', 'walk'],
  ['RS_GW_IN', 'RS_GW_OUT', 'door'], ['RS_GE_IN', 'RS_GE_OUT', 'door'], ['RS_WG_IN', 'RS_WG_OUT', 'door'], ['RS_EG_IN', 'RS_EG_OUT', 'door'],
  // Jalan Beringin
  ['RS_WG_OUT', 'WL_N2', 'walk'], ['WL_N2', 'WL_ALLEY_W', 'walk'], ['WL_ALLEY_W', 'WL_ALLEY', 'walk'],
  ['WL_W1', 'WL_ALLEY_W', 'walk'], ['WL_ALLEY_W', 'WL_MID1', 'walk'], ['WL_W1', 'WL_MID1', 'walk'], ['WL_MID1', 'WL_MID2', 'walk'],
  ['WL_MID1', 'WL_MID3', 'walk'], ['WL_MID2', 'WL_GATE_N', 'walk'], ['WL_MID3', 'WL_MID3S', 'walk'], ['WL_MID3S', 'WL_GATE_N', 'walk'], ['WL_GATE_N', 'WL_GATE_S', 'walk'],
  ['WL_GATE_S', 'WL_S2', 'walk'], ['WL_S2', 'WL_S3', 'walk'], ['WL_S2', 'WL_S4', 'walk'], ['WL_S3', 'WL_S5', 'walk'],
  ['WL_S4', 'A_N_FOOT', 'walk'], ['WL_S4', 'WL_S5', 'walk'], ['WL_S5', 'WL_TW_N', 'walk'], ['WL_TW_N', 'WL_TW', 'walk'], ['WL_TW', 'A_SW', 'walk'],
  ['A_SW', 'A_S_FOOT', 'walk'],
  // Zona A
  ['A_N_FOOT', 'A_N_TOP', 'stair'], ['A_N_TOP', 'A_T_NW', 'walk'], ['A_T_NW', 'A_T_W', 'walk'], ['A_T_W', 'A_T_SW', 'walk'],
  ['A_T_SW', 'A_S_TOP', 'walk'], ['A_S_TOP', 'A_T_SE', 'walk'], ['A_T_SE', 'AS_E_TOP', 'walk'], ['AS_E_TOP', 'A_T_NE', 'walk'],
  ['A_T_NE', 'A_N_TOP', 'walk'], ['A_S_TOP', 'A_S_FOOT', 'stair'], ['A_S_FOOT', 'A_GATE_OUT', 'walk'],
  ['A_GATE_OUT', 'A_SE', 'walk'], ['A_GATE_OUT', 'BS_GA_IN', 'door'],
  // A-pendek
  ['AS_N', 'AS_MID', 'walk'], ['AS_MID', 'AS_S', 'walk'], ['AS_S', 'AS_E_FOOT', 'walk'], ['AS_E_FOOT', 'AS_E_TOP', 'stair'],
  ['AS_E_FOOT', 'AS_S2', 'walk'], ['AS_S2', 'A_SE', 'walk'], ['AS_E_FOOT', 'HC_W', 'door'],
  // Pasar
  ['RS_GW_OUT', 'MK_NW', 'walk'], ['RS_GW_OUT', 'MK_N', 'walk'], ['RS_GW_OUT', 'MK_C', 'walk'], ['RS_GE_OUT', 'MK_NE', 'walk'],
  ['RS_GE_OUT', 'MK_N', 'walk'], ['RS_GE_OUT', 'MK_CE', 'walk'], ['MK_N', 'MK_CE', 'walk'],
  ['MK_NW', 'MK_W2', 'walk'], ['MK_W2', 'MK_W', 'walk'], ['MK_W2', 'MK_C', 'walk'], ['MK_W', 'WL_ALLEY', 'walk'], ['MK_W', 'MK_SW2', 'walk'],
  ['MK_C', 'MK_SW2', 'walk'], ['MK_SW2', 'MK_SW', 'walk'], ['MK_SW2', 'MK_S', 'walk'], ['MK_C', 'MK_S', 'walk'], ['MK_CE', 'MK_S', 'walk'],
  ['MK_NE', 'MK_E2', 'walk'], ['MK_E2', 'MK_E', 'walk'], ['MK_E2', 'MK_CE', 'walk'], ['MK_E', 'EL_ALLEY', 'walk'], ['MK_E', 'MK_SE2', 'walk'],
  ['MK_SE2', 'MK_SE', 'walk'], ['MK_SE2', 'MK_S', 'walk'],
  // Gapura & Pelataran
  ['MK_S', 'G_C', 'walk'], ['G_C', 'CY_N', 'walk'], ['MK_SW', 'GD_W', 'door'], ['GD_W', 'GD_W_S', 'door'], ['MK_SE', 'GD_E', 'door'],
  ['GD_E', 'GD_E_S', 'door'], ['GD_W_S', 'CY_NW', 'walk'], ['GD_E_S', 'CY_NE', 'walk'],
  ['CY_N', 'CY_W', 'walk'], ['CY_N', 'CY_E', 'walk'], ['CY_NW', 'CY_W', 'walk'], ['CY_NE', 'CY_E', 'walk'], ['CY_W', 'CY_SW', 'walk'],
  ['CY_E', 'CY_SE', 'walk'], ['CY_SW', 'CY_S', 'walk'], ['CY_SE', 'CY_S', 'walk'], ['CY_SW', 'AS_N', 'walk'], ['CY_SE', 'BH_N', 'walk'],
  ['CY_S', 'CR_N', 'walk'], ['CY_SW', 'CR_N', 'walk'], ['CY_SE', 'CR_N', 'walk'],
  // Lorong Biksu & Balai Genta
  ['CR_N', 'CR_1', 'walk'], ['CR_1', 'H_N', 'walk'], ['H_N', 'H_W', 'walk'], ['H_N', 'H_E', 'walk'], ['H_W', 'H_S', 'walk'], ['H_E', 'H_S', 'walk'],
  ['H_W', 'HC_W', 'walk'], ['H_E', 'HC_E', 'walk'], ['H_S', 'CR_S', 'walk'], ['CR_S', 'BS_GC_IN', 'door'],
  // Spawn Biru
  ['BS_GC_IN', 'BS_GAW', 'walk'], ['BS_GC_IN', 'BS_GBE', 'walk'], ['BS_GA_IN', 'BS_GAW', 'walk'], ['BS_GB_IN', 'BS_GBE', 'walk'],
  ['BS_GAW', 'BS_W', 'walk'], ['BS_GBE', 'BS_E', 'walk'], ['BS_W', 'BS_C', 'walk'], ['BS_E', 'BS_C', 'walk'],
  // B-pendek & Taman Air
  ['BH_N', 'BH_MID', 'walk'], ['BH_MID', 'BH_S', 'walk'], ['BH_S', 'BH_E_IN', 'walk'], ['BH_E_IN', 'HC_E', 'door'], ['BH_E_IN', 'B_W_FOOT', 'walk'],
  ['BH_E_IN', 'B_NW', 'walk'], ['B_NW', 'B_GATE_OUT', 'walk'], ['B_W_FOOT', 'B_W_TOP', 'stair'], ['B_W_TOP', 'B_P_W', 'walk'],
  ['B_P_W', 'B_P_N', 'walk'], ['B_P_W', 'B_P_S', 'walk'], ['B_P_W', 'B_P_E', 'walk'], ['B_P_E', 'B_E_TOP', 'walk'],
  ['B_P_N', 'B_N_FOOT', 'stair'], ['B_P_S', 'B_S_FOOT', 'stair'], ['B_E_TOP', 'B_E_FOOT', 'stair'], ['B_S_FOOT', 'B_GATE_OUT', 'walk'],
  ['B_GATE_OUT', 'BS_GB_IN', 'door'], ['B_S_FOOT', 'B_SE', 'walk'], ['B_SE', 'B_E_FOOT', 'walk'], ['B_E_FOOT', 'B_NE', 'walk'],
  ['B_NE', 'B_N_FOOT', 'walk'], ['B_N_FOOT', 'EL_S1', 'walk'], ['B_NE', 'EL_S1', 'walk'],
  // Gua & Hutan Timur
  ['EL_S1', 'EL_S2', 'walk'], ['EL_S2', 'EL_C1', 'walk'], ['EL_C1', 'EL_C2', 'walk'], ['EL_C2', 'EL_C3', 'walk'], ['EL_C3', 'EL_C4', 'walk'],
  ['EL_C1', 'EL_PS', 'walk'], ['EL_S2', 'EL_PS', 'walk'], ['EL_PS', 'EL_POOL', 'walk'], ['EL_POOL', 'EL_PN', 'walk'], ['EL_PN', 'EL_C4', 'walk'],
  ['EL_C4', 'EL_N1', 'walk'], ['EL_N1', 'EL_N2', 'walk'], ['EL_N2', 'EL_ALLEY_E', 'walk'], ['EL_ALLEY_E', 'EL_ALLEY', 'walk'],
  ['EL_N2', 'EL_N3', 'walk'], ['EL_ALLEY_E', 'EL_N3', 'walk'], ['EL_N3', 'EL_N4', 'walk'], ['EL_N4', 'RS_EG_OUT', 'walk'],
];

/** Sisi node: Utara (Z > 20) = setengah Merah 'N', Selatan (Z < −20) = setengah Biru 'S', pelataran = tengah. */
function side(_x: number, z: number): 'S' | 'N' | 'C' { return z > 20 ? 'N' : z < -20 ? 'S' : 'C'; }

export const AR_NAV: NavTemplate = {
  nodes: N,
  edges: EDGES,
  asym: { side },
  levelTol: 1,
  cover: ['RS_SW', 'RS_SE', 'WL_ALLEY_W', 'WL_MID2', 'WL_MID3', 'WL_GATE_N', 'WL_GATE_S', 'WL_S3', 'WL_TW_N', 'A_T_W', 'A_T_NE', 'A_T_SE', 'A_S_TOP',
    'A_N_TOP', 'AS_E_TOP', 'AS_MID', 'A_SE', 'MK_C', 'MK_CE', 'MK_W2', 'MK_E2', 'MK_SW2', 'MK_SE2', 'CY_W', 'CY_E', 'CY_SW', 'CY_SE',
    'GD_W_S', 'GD_E_S', 'CR_1', 'H_W', 'H_E', 'BH_MID', 'BH_S', 'B_NW', 'B_P_W', 'B_P_E', 'B_W_FOOT', 'B_NE', 'EL_C2', 'EL_C3', 'EL_PS', 'WL_S5',
    'EL_N2', 'EL_N3'],
};

const pickOne = <T,>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)];

/** Rute jalur bot TDM / Eliminasi: Barat (Jalan Beringin → teras A), tengah (pasar → gapura → pelataran → Lorong Biksu), pendek
 *  (pintu samping gapura → A-pendek / B-pendek), Timur (gua → Taman Air B). Rute Biru ('S') & Merah ('N') ditulis terpisah;
 *  berakhir di setengah lawan. */
const ROUTES: Record<string, { S: string[][]; N: string[][] }> = {
  west: {
    N: [['RS_W', 'RS_WN', 'RS_WG_IN', 'RS_WG_OUT', 'WL_N2', 'WL_ALLEY_W', 'WL_MID1', 'WL_MID2', 'WL_GATE_N', 'WL_GATE_S', 'WL_S2', 'WL_S4',
      'A_N_FOOT', 'A_N_TOP', 'A_T_NW', 'A_T_W', 'A_T_SW', 'A_S_TOP', 'A_S_FOOT', 'A_GATE_OUT'],
    ['RS_W', 'RS_WN', 'RS_WG_IN', 'RS_WG_OUT', 'WL_N2', 'WL_ALLEY_W', 'WL_W1', 'WL_MID1', 'WL_MID3', 'WL_MID3S', 'WL_GATE_N', 'WL_GATE_S',
      'WL_S2', 'WL_S3', 'WL_S5', 'WL_TW_N', 'WL_TW', 'A_SW', 'A_S_FOOT', 'A_GATE_OUT']],
    S: [['BS_W', 'BS_GAW', 'BS_GA_IN', 'A_GATE_OUT', 'A_S_FOOT', 'A_S_TOP', 'A_T_SW', 'A_T_W', 'A_T_NW', 'A_N_TOP', 'A_N_FOOT', 'WL_S4',
      'WL_S2', 'WL_GATE_S',
      'WL_GATE_N', 'WL_MID2', 'WL_MID1', 'WL_ALLEY_W', 'WL_N2']],
  },
  mid: {
    N: [['RS_C', 'RS_W', 'RS_SW', 'RS_GW_IN', 'RS_GW_OUT', 'MK_C', 'MK_S', 'G_C', 'CY_N', 'CY_W', 'CY_SW', 'CY_S', 'CR_N', 'CR_1', 'H_N',
      'H_W', 'H_S', 'CR_S'],
    ['RS_C', 'RS_E', 'RS_SE', 'RS_GE_IN', 'RS_GE_OUT', 'MK_CE', 'MK_S', 'G_C', 'CY_N', 'CY_E', 'CY_SE', 'CY_S', 'CR_N', 'CR_1', 'H_N',
      'H_E', 'H_S', 'CR_S']],
    S: [['BS_C', 'BS_W', 'BS_GAW', 'BS_GC_IN', 'CR_S', 'H_S', 'H_E', 'H_N', 'CR_1', 'CR_N', 'CY_S', 'CY_SE', 'CY_E', 'CY_N', 'G_C', 'MK_S',
      'MK_C', 'MK_W2'],
    ['BS_C', 'BS_E', 'BS_GBE', 'BS_GC_IN', 'CR_S', 'H_S', 'H_W', 'H_N', 'CR_1', 'CR_N', 'CY_S', 'CY_SW', 'CY_W', 'CY_N', 'G_C', 'MK_S',
      'MK_CE', 'MK_E2']],
  },
  short: {
    N: [['RS_W', 'RS_SW', 'RS_GW_IN', 'RS_GW_OUT', 'MK_NW', 'MK_W2', 'MK_W', 'MK_SW2', 'MK_SW', 'GD_W', 'GD_W_S', 'CY_NW', 'CY_W', 'CY_SW',
      'AS_N', 'AS_MID', 'AS_S', 'AS_E_FOOT', 'AS_E_TOP', 'A_T_NE'],
    ['RS_E', 'RS_SE', 'RS_GE_IN', 'RS_GE_OUT', 'MK_NE', 'MK_E2', 'MK_E', 'MK_SE2', 'MK_SE', 'GD_E', 'GD_E_S', 'CY_NE', 'CY_E', 'CY_SE',
      'BH_N', 'BH_MID', 'BH_S', 'BH_E_IN', 'B_W_FOOT', 'B_W_TOP', 'B_P_W']],
    S: [['BS_W', 'BS_GAW', 'BS_GA_IN', 'A_GATE_OUT', 'A_SE', 'AS_S2', 'AS_E_FOOT', 'AS_S', 'AS_MID', 'AS_N', 'CY_SW', 'CY_W', 'CY_NW', 'GD_W_S',
      'GD_W', 'MK_SW', 'MK_SW2', 'MK_W'],
    ['BS_E', 'BS_GBE', 'BS_GB_IN', 'B_GATE_OUT', 'B_NW', 'BH_E_IN', 'BH_S', 'BH_MID', 'BH_N', 'CY_SE', 'CY_E', 'CY_NE', 'GD_E_S', 'GD_E',
      'MK_SE', 'MK_SE2', 'MK_E']],
  },
  east: {
    N: [['RS_E', 'RS_EN', 'RS_EG_IN', 'RS_EG_OUT', 'EL_N4', 'EL_N3', 'EL_N2', 'EL_N1', 'EL_C4', 'EL_C3', 'EL_C2', 'EL_C1', 'EL_S2', 'EL_S1',
      'B_N_FOOT', 'B_P_N', 'B_P_W', 'B_P_E', 'B_E_TOP'],
    ['RS_E', 'RS_EN', 'RS_EG_IN', 'RS_EG_OUT', 'EL_N4', 'EL_ALLEY_E', 'EL_N2', 'EL_N1', 'EL_C4', 'EL_PN', 'EL_POOL', 'EL_PS', 'EL_S2', 'EL_S1',
      'B_NE', 'B_E_FOOT', 'B_E_TOP', 'B_P_E']],
    S: [['BS_E', 'BS_GBE', 'BS_GB_IN', 'B_GATE_OUT', 'B_S_FOOT', 'B_P_S', 'B_P_W', 'B_P_N', 'B_N_FOOT', 'EL_S1', 'EL_S2', 'EL_C1', 'EL_C2',
      'EL_C3', 'EL_C4', 'EL_N1', 'EL_N2', 'EL_N3']],
  },
};

export const AR_LANES: LaneDef[] = Object.entries(XCFG.bots.lanesArunika).map(([id, weight]) => ({
  id, weight, route: (own: 'S' | 'N') => [...pickOne(ROUTES[id][own])],
}));
