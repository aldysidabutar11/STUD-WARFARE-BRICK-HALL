// src/world/maps/meridian/nav.ts — graf navigasi bot Meridian Vault (map ASIMETRIS diagonal: sisi node dari posisinya). Dibangun
// ulang dari dokumen (node dokumen A_NE / BS_C / MID_C_W / B_BALC_N jatuh DI DALAM peti/meja; 4 lainnya menempel benda): semua
// node ≥ 0.9 u dari penghalang lantainya, edge datar lurus selebar kapsul (tests/meridian.test.ts: sapuan 2D + raycast Rapier).
// Elevasi: lantai 0, panggung B 1.5, platform Mid 3, dek Mid & balkon B 6.5 — konektor = edge 'stair' (ramp).
// Denah x2: semua node × 2 + RS_MID (jalan pintas slot → pintu Selatan spawn Merah), WL_NE / WL_W (West Long 2 lajur di kiri-kanan
// pilar), A_S2 (Site A Selatan di balik pulau lemari deposit).
import type { EdgeKind } from '../../NavGraph';
import type { LaneDef, NavTemplate } from '../types';
import { XCFG } from '../../../config/extraConfig';

/** [id, x, z, lantai]. */
const N: [string, number, number, number][] = [
  // ── Spawn Merah (Barat Laut)
  ['RS_C', -49, 57.5, 0], ['RS_NE', -41.5, 61, 0], ['RS_W', -61, 51, 0], ['RS_E_N', -34.2, 61.5, 0], ['RS_E', -34.2, 48, 0],
  ['RS_E_S', -34.2, 38.2, 0], ['RS_SE', -43, 38.5, 0], ['RS_DOOR_IN', -62, 38.5, 0], ['RS_MID', -43, 46, 0],
  // ── West Long
  ['WL_N', -62, 30, 0], ['WL_N2', -68, 21, 0], ['WL_NE', -59, 21, 0], ['WL_W', -63.5, 4, 0], ['WL_ARCH', -56, -2, 0], ['WL_C_W', -68.5, -12, 0], ['WL_C_E', -55.5, -12, 0],
  ['WL_S1', -66, -24, 0], ['WL_S1E', -59.5, -24, 0], ['WL_S2', -59, -42, 0], ['WL_SW', -67, -44, 0], ['WL_VAULT', -55, -44, 0],
  // ── Mid-West
  ['MW_W', -46, -2, 0], ['MW_E', -33, -2, 0],
  // ── Mid: lantai Selatan (0), platform tengah (3), dek Utara (6.5)
  ['MID_S_W', -6, -27, 0], ['MID_S_E', 10, -27, 0], ['MID_S_C', 2, -22, 0],
  ['MID_P_W', -9.5, -2, 3], ['MID_P_WN', -9.5, 5.8, 3], ['MID_P_WS', -9.5, -7, 3], ['MID_P_C', 3, -2, 3], ['MID_P_N', 2, 6.6, 3],
  ['MID_P_S', 2, -7, 3], ['MID_P_E', 14, -2, 3],
  ['MID_D_S', 2, 26, 6.5], ['MID_D_C', -4, 31, 6.5], ['MID_D_W', -8, 48, 6.5], ['MID_D_E', 12, 40, 6.5], ['MID_B_DOOR', 18, 40, 6.5],
  // ── Site A
  ['A_VAULT_IN', -44, -44, 0], ['A_N', -34, -27, 0], ['A_NE', -16, -26.5, 0], ['A_E_N', -16, -34, 0], ['A_E_IN', -16.5, -44, 0],
  ['A_DOOR_E', -13, -44, 0], ['A_SE', -16.5, -55, 0], ['A_PLANT', -30, -41, 0], ['A_PLANT2', -24.5, -43, 0], ['A_SC', -24.5, -54, 0],
  ['A_S', -36, -61.5, 0], ['A_S2', -22, -61.5, 0], ['A_SW', -46.5, -61.5, 0],
  // ── South Connector
  ['SC_W', -8, -44, 0], ['SC_M', 6, -44, 0], ['SC_E', 22, -44, 0], ['SC_N', 2, -39, 0],
  // ── Spawn Biru (Tenggara)
  ['BS_DOOR', 27, -44, 0], ['BS_W_IN', 30.5, -46, 0], ['BS_W_S', 30.5, -60, 0], ['BS_S', 41, -60.5, 0], ['BS_R_W', 40, -51, 0],
  ['BS_R_C', 50, -50.5, 0], ['BS_R_E', 62, -52, 0], ['BS_R_SE', 69.5, -53, 0], ['BS_S2', 61, -60.5, 0], ['BS_GAP', 69.5, -47, 0],
  ['BS_L_E', 69.5, -40, 0], ['BS_U', 60, -41, 0], ['BS_L_C', 50, -41, 0], ['BS_T', 39, -41, 0],
  // ── terowongan B & Tangga Biru
  ['BT_S', 38, -30, 0], ['BT_N', 38, -12, 0], ['BU_TOP', 63, -4, 6.5],
  // ── Site B lantai dasar, panggung (1.5), balkon (6.5)
  ['B_T_EXIT', 38, -4, 0], ['B_LOW_FOOT', 31.5, 2, 0], ['B_C_W', 34, 19, 0], ['B_W_N', 34, 33, 0], ['B_GND_W', 25, 34, 0],
  ['B_GND_NW', 26, 50, 0],
  ['B_GND_N', 46, 50, 0], ['B_GND_NE', 64, 50, 0], ['B_GND_E', 63, 34, 0], ['B_E_FOOT', 63, 21, 0], ['B_SE', 60, 8, 0],
  ['B_S_FOOT', 46, 4, 0],
  ['B_STG_S', 46, 16, 1.5], ['B_PLANT', 48, 22, 1.5], ['B_STG_N', 46, 27, 1.5], ['B_STG_NW', 41, 27.5, 1.5], ['B_STG_NE', 51, 27.5, 1.5],
  ['BALC_W_N', 26, 39, 6.5], ['BALC_W_S', 26, 14, 6.5], ['BALC_NW', 26, 50, 6.5], ['BALC_N_W', 40.5, 46.5, 6.5], ['BALC_N_C', 46, 46.5, 6.5],
  ['BALC_N_E', 51.5, 46.5, 6.5], ['BALC_NE', 66, 50, 6.5], ['BALC_E_N', 66, 34, 6.5], ['BALC_E_S', 66, 12, 6.5], ['BALC_SE', 56, -2, 6.5],
];

type E = [string, string, EdgeKind];
const EDGES: E[] = [
  // Spawn Merah
  ['RS_C', 'RS_W', 'walk'], ['RS_C', 'RS_NE', 'walk'], ['RS_NE', 'RS_E_N', 'walk'], ['RS_E_N', 'RS_E', 'walk'], ['RS_E', 'RS_E_S', 'walk'],
  ['RS_E_S', 'RS_SE', 'walk'], ['RS_SE', 'RS_DOOR_IN', 'walk'], ['RS_C', 'RS_MID', 'walk'], ['RS_MID', 'RS_SE', 'walk'],
  ['RS_DOOR_IN', 'WL_N', 'door'],
  // West Long
  ['WL_N', 'WL_N2', 'walk'], ['WL_N', 'WL_NE', 'walk'], ['WL_NE', 'WL_ARCH', 'walk'], ['WL_N2', 'WL_W', 'walk'], ['WL_W', 'WL_ARCH', 'walk'],
  ['WL_W', 'WL_C_W', 'walk'], ['WL_ARCH', 'WL_C_E', 'walk'],
  ['WL_C_W', 'WL_S1', 'walk'], ['WL_S1', 'WL_S1E', 'walk'], ['WL_C_E', 'WL_S1E', 'walk'], ['WL_S1E', 'WL_S2', 'walk'],
  ['WL_S2', 'WL_SW', 'walk'], ['WL_S2', 'WL_VAULT', 'walk'], ['WL_VAULT', 'A_VAULT_IN', 'door'],
  // Mid-West → platform Mid
  ['WL_ARCH', 'MW_W', 'door'], ['MW_W', 'MW_E', 'walk'], ['MW_E', 'MID_P_W', 'stair'],
  // platform Mid
  ['MID_P_W', 'MID_P_WN', 'walk'], ['MID_P_W', 'MID_P_WS', 'walk'], ['MID_P_WN', 'MID_P_N', 'walk'], ['MID_P_WS', 'MID_P_S', 'walk'],
  ['MID_P_S', 'MID_P_C', 'walk'], ['MID_P_C', 'MID_P_N', 'walk'], ['MID_P_C', 'MID_P_E', 'walk'],
  ['MID_S_C', 'MID_P_S', 'stair'], ['MID_P_N', 'MID_D_S', 'stair'], ['MID_P_E', 'B_LOW_FOOT', 'stair'],
  // lantai Selatan Mid ↔ South Connector
  ['MID_S_C', 'MID_S_W', 'walk'], ['MID_S_C', 'MID_S_E', 'walk'], ['MID_S_C', 'SC_N', 'walk'], ['MID_S_W', 'SC_N', 'walk'], ['MID_S_E', 'SC_N', 'walk'],
  // dek Utara Mid
  ['MID_D_S', 'MID_D_C', 'walk'], ['MID_D_C', 'MID_D_W', 'walk'], ['MID_D_S', 'MID_D_E', 'walk'], ['MID_D_W', 'MID_D_E', 'walk'],
  ['MID_D_E', 'MID_B_DOOR', 'walk'], ['RS_E', 'MID_D_W', 'stair'],
  // Site A
  ['A_VAULT_IN', 'A_N', 'walk'], ['A_VAULT_IN', 'A_PLANT', 'walk'], ['A_VAULT_IN', 'A_SW', 'walk'], ['A_N', 'A_PLANT', 'walk'],
  ['A_N', 'A_NE', 'walk'], ['A_NE', 'A_E_N', 'walk'], ['A_E_N', 'A_E_IN', 'walk'], ['A_E_IN', 'A_DOOR_E', 'door'],
  ['A_PLANT', 'A_PLANT2', 'walk'], ['A_PLANT2', 'A_SC', 'walk'], ['A_SC', 'A_SE', 'walk'], ['A_SC', 'A_S2', 'walk'],
  ['A_SE', 'A_E_IN', 'walk'], ['A_S', 'A_SW', 'walk'], ['A_S2', 'A_S', 'walk'],
  // South Connector
  ['A_DOOR_E', 'SC_W', 'door'], ['SC_W', 'SC_M', 'walk'], ['SC_M', 'SC_E', 'walk'], ['SC_M', 'SC_N', 'walk'], ['SC_W', 'SC_N', 'walk'],
  ['SC_E', 'BS_DOOR', 'door'],
  // Spawn Biru
  ['BS_DOOR', 'BS_W_IN', 'door'], ['BS_W_IN', 'BS_W_S', 'walk'], ['BS_W_S', 'BS_S', 'walk'], ['BS_S', 'BS_R_W', 'walk'],
  ['BS_R_W', 'BS_R_C', 'walk'], ['BS_R_C', 'BS_R_E', 'walk'], ['BS_R_E', 'BS_S2', 'walk'], ['BS_S2', 'BS_S', 'walk'],
  ['BS_R_E', 'BS_R_SE', 'walk'], ['BS_R_SE', 'BS_GAP', 'walk'], ['BS_GAP', 'BS_L_E', 'walk'], ['BS_L_E', 'BS_U', 'walk'],
  ['BS_U', 'BS_L_C', 'walk'], ['BS_L_C', 'BS_T', 'walk'],
  // terowongan B & Tangga Biru
  ['BS_T', 'BT_S', 'door'], ['BT_S', 'BT_N', 'walk'], ['BT_N', 'B_T_EXIT', 'door'], ['BS_U', 'BU_TOP', 'stair'],
  // Site B lantai dasar
  ['B_T_EXIT', 'B_LOW_FOOT', 'walk'], ['B_T_EXIT', 'B_S_FOOT', 'walk'], ['B_LOW_FOOT', 'B_C_W', 'walk'], ['B_C_W', 'B_W_N', 'walk'],
  ['B_W_N', 'B_GND_W', 'walk'], ['B_W_N', 'B_GND_NW', 'walk'], ['B_GND_W', 'B_GND_NW', 'walk'], ['B_GND_NW', 'B_GND_N', 'walk'], ['B_GND_N', 'B_GND_NE', 'walk'], ['B_GND_NE', 'B_GND_E', 'walk'],
  ['B_GND_E', 'B_E_FOOT', 'walk'], ['B_E_FOOT', 'B_SE', 'walk'], ['B_SE', 'B_S_FOOT', 'walk'],
  // panggung B
  ['B_S_FOOT', 'B_STG_S', 'stair'], ['B_E_FOOT', 'B_PLANT', 'stair'], ['B_STG_S', 'B_PLANT', 'walk'], ['B_PLANT', 'B_STG_N', 'walk'],
  ['B_STG_N', 'B_STG_NW', 'walk'], ['B_STG_N', 'B_STG_NE', 'walk'], ['B_PLANT', 'B_STG_NE', 'walk'], ['B_STG_NW', 'BALC_N_W', 'stair'], ['B_STG_NE', 'BALC_N_E', 'stair'],
  // balkon U
  ['MID_B_DOOR', 'BALC_W_N', 'walk'], ['BALC_W_N', 'BALC_W_S', 'walk'], ['BALC_W_N', 'BALC_NW', 'walk'], ['BALC_NW', 'BALC_N_W', 'walk'],
  ['BALC_N_W', 'BALC_N_C', 'walk'], ['BALC_N_C', 'BALC_N_E', 'walk'], ['BALC_N_E', 'BALC_NE', 'walk'], ['BALC_NE', 'BALC_E_N', 'walk'],
  ['BALC_E_N', 'BALC_E_S', 'walk'], ['BALC_E_S', 'BU_TOP', 'walk'], ['BU_TOP', 'BALC_SE', 'walk'],
];

/** Sisi node (diagonal): Tenggara (x − z besar) = setengah Biru 'S', Barat Laut = Merah 'N', sisanya tengah. */
function side(x: number, z: number): 'S' | 'N' | 'C' { const d = x - z; return d > 30 ? 'S' : d < -30 ? 'N' : 'C'; }

export const MV_NAV: NavTemplate = {
  nodes: N,
  edges: EDGES,
  asym: { side },
  levelTol: 1.6,
  cover: ['RS_W', 'WL_C_W', 'WL_C_E', 'WL_S2', 'MID_P_WN', 'MID_P_WS', 'MID_P_E', 'MID_D_C', 'MID_D_E', 'A_N', 'A_SC', 'A_SW', 'A_E_N',
    'A_PLANT2', 'SC_W', 'SC_E', 'BS_R_W', 'BS_L_C', 'B_C_W', 'B_GND_W', 'B_GND_E', 'B_STG_S', 'B_PLANT', 'BALC_N_C', 'BALC_W_N', 'BALC_E_N',
    // denah x2: node di samping benda baru
    'WL_NE', 'WL_W', 'MW_W', 'MID_S_W', 'MID_S_E', 'A_S2', 'BT_N', 'B_LOW_FOOT'],
};

const pickOne = <T,>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)];

/** Rute jalur bot TDM / Eliminasi (dokumen §1: West Long → A, Mid bertingkat, North Upper → B; + jalur bawah B lewat terowongan).
 *  Map asimetris → rute Biru ('S', Tenggara) & Merah ('N', Barat Laut) ditulis terpisah; berakhir di setengah lawan. */
const ROUTES: Record<string, { S: string[][]; N: string[][] }> = {
  west: {
    S: [['BS_S', 'BS_W_S', 'BS_W_IN', 'BS_DOOR', 'SC_E', 'SC_M', 'SC_W', 'A_DOOR_E', 'A_E_IN', 'A_E_N', 'A_NE', 'A_N', 'A_VAULT_IN', 'WL_VAULT',
      'WL_S2', 'WL_S1E', 'WL_C_E', 'WL_ARCH', 'WL_NE', 'WL_N']],
    N: [['RS_W', 'RS_DOOR_IN', 'WL_N', 'WL_N2', 'WL_W', 'WL_C_W', 'WL_S1', 'WL_S1E', 'WL_S2', 'WL_VAULT', 'A_VAULT_IN', 'A_PLANT', 'A_PLANT2', 'A_SC',
      'A_SE', 'A_E_IN', 'A_DOOR_E', 'SC_W', 'SC_M']],
  },
  mid: {
    S: [['BS_S', 'BS_W_S', 'BS_W_IN', 'BS_DOOR', 'SC_E', 'SC_M', 'SC_N', 'MID_S_C', 'MID_P_S', 'MID_P_C', 'MID_P_W', 'MW_E', 'MW_W', 'WL_ARCH', 'WL_W', 'WL_N2']],
    N: [['RS_SE', 'RS_DOOR_IN', 'WL_N', 'WL_NE', 'WL_ARCH', 'MW_W', 'MW_E', 'MID_P_W', 'MID_P_WS', 'MID_P_S', 'MID_S_C', 'SC_N', 'SC_M', 'SC_E']],
  },
  north: {
    S: [['BS_R_E', 'BS_R_SE', 'BS_GAP', 'BS_L_E', 'BS_U', 'BU_TOP', 'BALC_E_S', 'BALC_E_N', 'BALC_NE', 'BALC_N_E', 'BALC_N_C', 'BALC_N_W', 'BALC_NW', 'BALC_W_N', 'MID_B_DOOR',
      'MID_D_E', 'MID_D_W']],
    N: [['RS_E', 'MID_D_W', 'MID_D_E', 'MID_B_DOOR', 'BALC_W_N', 'BALC_NW', 'BALC_N_W', 'B_STG_NW', 'B_STG_N', 'B_PLANT', 'B_STG_S', 'B_S_FOOT',
      'B_T_EXIT']],
  },
  b: {
    S: [['BS_GAP', 'BS_L_E', 'BS_U', 'BS_L_C', 'BS_T', 'BT_S', 'BT_N', 'B_T_EXIT', 'B_LOW_FOOT', 'MID_P_E', 'MID_P_C', 'MID_P_N', 'MID_D_S', 'MID_D_C', 'MID_D_W']],
    N: [['RS_E', 'MID_D_W', 'MID_D_C', 'MID_D_S', 'MID_P_N', 'MID_P_C', 'MID_P_E', 'B_LOW_FOOT', 'B_T_EXIT', 'BT_N', 'BT_S']],
  },
};

export const MV_LANES: LaneDef[] = Object.entries(XCFG.bots.lanesMeridian).map(([id, weight]) => ({
  id, weight, route: (own: 'S' | 'N') => [...pickOne(ROUTES[id][own])],
}));
