// src/world/maps/boston/nav.ts — graf navigasi bot Boston (map ASIMETRIS: tanpa cermin {H}/{X}; sisi node dari posisinya).
// Node ditulis dalam koordinat DOKUMEN (sama seperti layout.ts) lalu diputar 180° ke koordinat game. Dibangun ulang dari dokumen:
// node dokumen yang jatuh di dalam meja / edge yang menembus barikade diganti; tambahan node pintu & ceruk agar semua edge lurus
// bebas selebar kapsul (tests/boston.test.ts: sapuan 2D ≥ 0.85 u + raycast Rapier lutut/dada/kepala).
// Konektor antar-lantai: Tangga Servis (L3 Barat-Laut ↔ bordes Spawn Biru), Tangga Cokelat L (L3 kaki ↔ bordes Y 5 ↔ Lorong
// Barat L4), drop satu arah Veranda → kabinet → Jalur Sofa (bot Sulit, GDD §11.5 dropDown). Edge kaca [gerbang g1..g3] antara
// Ruang Kaca & Veranda hanya dilalui setelah panelnya pecah (NavGraph.setGate).
import type { EdgeKind } from '../../NavGraph';
import type { LaneDef, NavTemplate } from '../types';
import { XCFG } from '../../../config/extraConfig';
import { rot } from './layout';

/** [id, x, z, lantai] dokumen. Lantai 0 = L3, 10 = L4, 5 = bordes Tangga Cokelat. */
const N: [string, number, number, number][] = [
  // ── L4: Spawn Biru
  ['BS_C', -5.5, 32.4, 10], ['BS_WN', -16.3, 37, 10], ['BS_WIN', -16.3, 32, 10], ['BS_DOOR_W', -18.2, 32, 10],
  ['BS_MID', -4.5, 24.5, 10], ['BS_SW', -12.5, 23.3, 10], ['BS_S_W', -13, 19.6, 10], ['BS_S_IN', -3.75, 19.3, 10],
  ['BS_S_E', 1.5, 19.4, 10], ['BS_SE', 2, 23.5, 10], ['BS_PK_S', 7, 19.25, 10], ['BS_PK_N', 7, 36.75, 10], ['BS_PK_NW', 3, 36.75, 10],
  ['BS_IN_N', 7.75, 32.75, 10], ['BS_IN_S', 7.75, 22.25, 10], ['BS_DOOR_N', 10.2, 32.75, 10], ['BS_DOOR_S', 10.2, 22.25, 10],
  ['BS_DOOR_MID', -3.75, 17.8, 10],
  // ── L4: bordes atas Tangga Servis
  ['ST_TOP', -22.2, 30, 10],
  // ── L4: Ruang Kaca Tengah
  ['OFF_N', -3, 14, 10], ['OFF_NE', 5.5, 14.5, 10], ['OFF_E_N', 7, 11, 10], ['OFF_CN', -3, 5, 10], ['OFF_C_W', -8.5, 0, 10],
  ['OFF_C_E', 7, 0, 10], ['OFF_CS', -3, -5, 10], ['OFF_E_S', 7, -11, 10], ['OFF_SE', 5.5, -14.5, 10], ['OFF_S', -3, -14, 10],
  // ── L4: Lorong Barat (puncak Tangga Cokelat)
  ['WH_C', -18, 3, 10], ['WH_NE', -15.5, 15, 10], ['BR_TOP', -23.75, 0.5, 10],
  // ── L4: Pantry
  ['PANTRY_S', -2.5, -23, 10], ['PANTRY_W', -18, -24, 10], ['PANTRY_NE', 7.5, -21, 10], ['PANTRY_SE', 6, -33, 10],
  // ── L4: The Veranda
  ['VER_N', 12.5, 32.75, 10], ['VER_N2', 12.5, 22.25, 10], ['VER_NE', 20, 32.5, 10], ['VER_E1', 21.5, 16, 10],
  ['VER_M1', 13.5, 11, 10], ['VER_E2', 21, 4.5, 10], ['VER_C', 13.5, 0, 10], ['VER_M2', 13.2, -11.5, 10],
  ['VER_DROP', 13.6, -14, 10], ['VER_S1', 14.5, -21, 10], ['VER_SE2', 22, -20, 10], ['VER_SE', 21.5, -28.5, 10],
  ['VER_S2', 14.5, -34.5, 10],
  // ── bordes Tangga Cokelat (Y 5)
  ['BR_MID', -23.75, -14.3, 5],
  // ── L3: Spawn Merah
  ['RS_C', 0, -34.5, 0], ['RS_SW', -16.8, -31, 0], ['RS_SW2', -13.2, -28, 0], ['RS_GAP_W', -13.2, -23, 0], ['RS_SE', 17.5, -28.5, 0],
  ['RS_NW', -16.8, -24, 0], ['RS_NE', 17.5, -22.5, 0], ['RS_IN_W', -8.5, -22.2, 0], ['RS_NC', 0, -22.5, 0], ['RS_IN_E', 9.5, -22.2, 0],
  ['RS_DOOR_W', -8.5, -20.2, 0], ['RS_DOOR_E', 9.5, -20.2, 0], ['RS_DOOR_SIDE', -18.2, -23.75, 0],
  // ── L3: Koridor Barat & kaki Tangga Cokelat
  ['WC', -22, -24.5, 0], ['WC_N', -21.5, -18.4, 0], ['WC_E', -15.5, -18.4, 0], ['BR_FOOT', -12.5, -14.4, 0],
  // ── L3: Garden Lounge
  ['GL_DW', -8.5, -17.5, 0], ['GL_S', 0, -17.5, 0], ['GL_DE', 9.5, -17.5, 0], ['GL_SW', -12, -12, 0], ['GL_SE', 12.5, -12, 0],
  ['GL_W', -12.5, -5, 0], ['GL_E', 12.5, -4, 0], ['GL_TV_W', -6.5, -4, 0], ['GL_TV_E', 6.5, -4, 0],
  ['GL_PIL_W', -5, 4.5, 0], ['GL_PIL_E', 5, 4.5, 0], ['GL_C_N', 0, 8, 0], ['GL_W2', -7, 6.5, 0], ['GL_E2', 12.5, 8, 0],
  ['GL_CAFE', -12.5, 8.8, 0], ['GL_LK', -16.5, 10.6, 0], ['GL_NW2', -12, 15, 0], ['GL_N_W', -9, 20.5, 0], ['GL_N_E', 11.5, 18, 0], ['GL_NN', 1, 22, 0],
  ['GL_NE2', 6.5, 25.5, 0], ['GL_NW', -14, 25, 0], ['NORTH_LANE', 4, 31.5, 0], ['N_LOBBY', -3, 34, 0], ['GL_NWN', -15, 35.5, 0],
  ['NOOK', -17, -6.5, 0], ['WS_S', -20, -0.5, 0], ['SERV_FOOT', -22.2, 11, 0],
  // ── L3: Jalur Sofa
  ['SOFA_S', 17, -16, 0], ['SOFA_C', 17.5, 3, 0], ['SOFA_N', 17.5, 19, 0], ['SOFA_NE', 17, 31, 0],
];

type E = [string, string, EdgeKind] | [string, string, EdgeKind, string];
const EDGES: E[] = [
  // Spawn Biru
  ['BS_C', 'BS_WN', 'walk'], ['BS_WN', 'BS_WIN', 'walk'], ['BS_WIN', 'BS_DOOR_W', 'door'], ['BS_C', 'BS_MID', 'walk'],
  ['BS_MID', 'BS_SW', 'walk'], ['BS_SW', 'BS_S_W', 'walk'], ['BS_S_W', 'BS_S_IN', 'walk'], ['BS_S_IN', 'BS_S_E', 'walk'],
  ['BS_S_E', 'BS_SE', 'walk'], ['BS_SE', 'BS_MID', 'walk'], ['BS_S_E', 'BS_PK_S', 'walk'], ['BS_PK_S', 'BS_IN_S', 'walk'],
  ['BS_IN_S', 'BS_IN_N', 'walk'], ['BS_IN_N', 'BS_PK_N', 'walk'], ['BS_PK_N', 'BS_PK_NW', 'walk'], ['BS_PK_NW', 'BS_C', 'walk'],
  ['BS_IN_N', 'BS_DOOR_N', 'door'], ['BS_IN_S', 'BS_DOOR_S', 'door'],
  ['BS_S_IN', 'BS_DOOR_MID', 'door'], ['BS_DOOR_W', 'ST_TOP', 'door'],
  // Ruang Kaca
  ['BS_DOOR_MID', 'OFF_N', 'door'], ['OFF_N', 'OFF_NE', 'walk'], ['OFF_NE', 'OFF_E_N', 'walk'], ['OFF_E_N', 'OFF_C_E', 'walk'],
  ['OFF_C_E', 'OFF_E_S', 'walk'], ['OFF_E_S', 'OFF_SE', 'walk'], ['OFF_SE', 'OFF_S', 'walk'], ['OFF_N', 'OFF_CN', 'walk'],
  ['OFF_CN', 'OFF_C_W', 'walk'], ['OFF_CN', 'OFF_C_E', 'walk'], ['OFF_CS', 'OFF_C_W', 'walk'], ['OFF_CS', 'OFF_C_E', 'walk'],
  ['OFF_CS', 'OFF_S', 'walk'],
  // kaca destruktibel (gerbang terbuka setelah panel pecah)
  ['OFF_E_N', 'VER_M1', 'walk', 'g1'], ['OFF_C_E', 'VER_C', 'walk', 'g2'], ['OFF_E_S', 'VER_M2', 'walk', 'g3'],
  // Lorong Barat
  ['OFF_C_W', 'WH_C', 'walk'], ['WH_C', 'BR_TOP', 'walk'], ['WH_C', 'WH_NE', 'walk'], ['WH_NE', 'OFF_N', 'walk'],
  // Pantry
  ['OFF_S', 'PANTRY_S', 'walk'], ['OFF_SE', 'PANTRY_NE', 'walk'], ['PANTRY_NE', 'PANTRY_S', 'walk'], ['PANTRY_S', 'PANTRY_W', 'walk'],
  ['PANTRY_NE', 'PANTRY_SE', 'walk'], ['PANTRY_NE', 'VER_S1', 'walk'], ['PANTRY_SE', 'VER_S2', 'walk'],
  // Veranda
  ['BS_DOOR_N', 'VER_N', 'walk'], ['BS_DOOR_S', 'VER_N2', 'walk'], ['VER_N', 'VER_N2', 'walk'], ['VER_N', 'VER_NE', 'walk'],
  ['VER_NE', 'VER_E1', 'walk'], ['VER_N2', 'VER_E1', 'walk'], ['VER_N2', 'VER_M1', 'walk'], ['VER_M1', 'VER_C', 'walk'],
  ['VER_M1', 'VER_E2', 'walk'], ['VER_E2', 'VER_E1', 'walk'], ['VER_C', 'VER_M2', 'walk'], ['VER_M2', 'VER_DROP', 'walk'],
  ['VER_DROP', 'VER_S1', 'walk'], ['VER_S1', 'VER_SE2', 'walk'], ['VER_SE2', 'VER_SE', 'walk'], ['VER_SE', 'VER_S2', 'walk'],
  ['VER_S1', 'VER_S2', 'walk'],
  // konektor antar-lantai
  ['ST_TOP', 'SERV_FOOT', 'stair'], ['BR_TOP', 'BR_MID', 'stair'], ['BR_MID', 'BR_FOOT', 'stair'],
  // Spawn Merah
  ['RS_C', 'RS_SW', 'walk'], ['RS_C', 'RS_SW2', 'walk'], ['RS_C', 'RS_SE', 'walk'], ['RS_SW', 'RS_NW', 'walk'],
  ['RS_SW2', 'RS_GAP_W', 'walk'], ['RS_GAP_W', 'RS_IN_W', 'walk'], ['RS_SE', 'RS_NE', 'walk'],
  ['RS_IN_W', 'RS_NC', 'walk'], ['RS_NC', 'RS_IN_E', 'walk'], ['RS_IN_E', 'RS_NE', 'walk'],
  ['RS_IN_W', 'RS_DOOR_W', 'door'], ['RS_IN_E', 'RS_DOOR_E', 'door'], ['RS_NW', 'RS_DOOR_SIDE', 'door'],
  // Koridor Barat & kaki tangga
  ['RS_DOOR_SIDE', 'WC', 'door'], ['WC', 'WC_N', 'walk'], ['WC_N', 'WC_E', 'walk'], ['WC_E', 'BR_FOOT', 'walk'],
  ['WC_E', 'GL_DW', 'walk'],
  // Garden Lounge
  ['RS_DOOR_W', 'GL_DW', 'walk'], ['RS_DOOR_E', 'GL_DE', 'walk'], ['GL_DW', 'GL_S', 'walk'], ['GL_S', 'GL_DE', 'walk'],
  ['GL_DW', 'GL_SW', 'walk'], ['GL_DW', 'BR_FOOT', 'walk'], ['GL_SW', 'BR_FOOT', 'walk'], ['GL_SW', 'GL_W', 'walk'],
  ['GL_W', 'GL_TV_W', 'walk'], ['GL_W', 'NOOK', 'walk'], ['NOOK', 'WS_S', 'walk'], ['WS_S', 'SERV_FOOT', 'walk'],
  ['SERV_FOOT', 'GL_LK', 'walk'], ['GL_LK', 'GL_CAFE', 'walk'], ['GL_CAFE', 'GL_W2', 'walk'], ['GL_W2', 'GL_PIL_W', 'walk'], ['GL_CAFE', 'GL_NW2', 'walk'],
  ['GL_NW2', 'GL_NW', 'walk'], ['GL_NW2', 'GL_N_W', 'walk'], ['GL_N_W', 'GL_NW', 'walk'], ['GL_N_W', 'GL_NN', 'walk'],
  ['GL_N_W', 'N_LOBBY', 'walk'], ['GL_NW', 'GL_NWN', 'walk'], ['GL_NWN', 'N_LOBBY', 'walk'], ['N_LOBBY', 'NORTH_LANE', 'walk'],
  ['GL_NN', 'GL_NE2', 'walk'], ['GL_NE2', 'NORTH_LANE', 'walk'], ['GL_N_E', 'GL_NN', 'walk'], ['GL_N_E', 'GL_NE2', 'walk'],
  ['GL_TV_W', 'GL_TV_E', 'walk'], ['GL_TV_W', 'GL_PIL_W', 'walk'], ['GL_TV_E', 'GL_PIL_E', 'walk'], ['GL_PIL_W', 'GL_C_N', 'walk'],
  ['GL_C_N', 'GL_PIL_E', 'walk'], ['GL_C_N', 'GL_NN', 'walk'], ['GL_PIL_E', 'GL_E2', 'walk'], ['GL_E2', 'GL_N_E', 'walk'],
  ['GL_DE', 'GL_SE', 'walk'], ['GL_SE', 'GL_E', 'walk'], ['GL_E', 'GL_TV_E', 'walk'],
  // Jalur Sofa
  ['GL_SE', 'SOFA_S', 'walk'], ['GL_DE', 'SOFA_S', 'walk'], ['SOFA_S', 'SOFA_C', 'walk'], ['GL_E', 'SOFA_C', 'walk'],
  ['GL_E2', 'SOFA_C', 'walk'], ['SOFA_C', 'SOFA_N', 'walk'], ['GL_N_E', 'SOFA_N', 'walk'], ['SOFA_N', 'SOFA_NE', 'walk'],
  ['NORTH_LANE', 'SOFA_NE', 'walk'],
];

/** Sisi node (game): Z < −10 = setengah Biru ('S'), Z > 10 = setengah Merah ('N'), sisanya tengah. */
function side(_x: number, z: number): 'S' | 'N' | 'C' { return z < -10 ? 'S' : z > 10 ? 'N' : 'C'; }

export const BOS_NAV: NavTemplate = {
  nodes: N.map(([id, x, z, l]) => { const [gx, gz] = rot(x, z); return [id, gx, gz, l]; }),
  edges: EDGES,
  asym: { side },
  drops: [['VER_DROP', 'SOFA_S', 'DROP_CABINET_E']],
  cover: ['OFF_C_W', 'OFF_N', 'OFF_S', 'WH_C', 'PANTRY_S', 'PANTRY_W', 'VER_E1', 'VER_E2', 'VER_SE', 'VER_S1', 'BS_SW', 'BS_SE',
    'RS_SW', 'RS_SE', 'WC', 'NOOK', 'GL_SW', 'GL_SE', 'GL_TV_W', 'GL_TV_E', 'GL_PIL_W', 'GL_PIL_E', 'GL_N_W', 'GL_N_E',
    'GL_NE2', 'NORTH_LANE', 'SOFA_C', 'SOFA_N', 'SOFA_S'],
};

/** Drop Veranda → kabinet: jalan (bukan sprint), lompat 5.6 u sebelum pusat kabinet (pagar void 1.3 u di depan), rem di udara. */
export const BOS_DROP_SPEC = { jumpDist: 5.6, sprint: false, brake: true };

const pickOne = <T,>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)];

/** Rute jalur bot (dokumen §7: Veranda 35%, Garden Lounge tengah 30%, Tangga Cokelat/Servis flank 20%, Sofa Timur 15%).
 *  Map asimetris → rute Biru ('S', mulai L4) & Merah ('N', mulai L3) ditulis terpisah; berakhir di setengah lawan. */
const ROUTES: Record<string, { S: string[][]; N: string[][] }> = {
  veranda: {
    S: [['BS_PK_S', 'BS_IN_S', 'VER_N2', 'VER_M1', 'VER_C', 'VER_M2', 'VER_DROP', 'VER_S1', 'PANTRY_NE', 'PANTRY_S'],
      ['BS_PK_N', 'BS_IN_N', 'VER_N', 'VER_NE', 'VER_E1', 'VER_E2', 'VER_M1', 'VER_C', 'VER_M2', 'VER_S1', 'VER_SE2', 'VER_SE', 'VER_S2']],
    N: [['RS_NW', 'RS_DOOR_SIDE', 'WC', 'BR_FOOT', 'BR_MID', 'BR_TOP', 'WH_C', 'OFF_C_W', 'OFF_CS', 'OFF_S', 'PANTRY_S', 'PANTRY_NE',
      'VER_S1', 'VER_DROP', 'VER_M2', 'VER_C', 'VER_M1', 'VER_N2']],
  },
  lounge: {
    S: [['BS_WIN', 'BS_DOOR_W', 'ST_TOP', 'SERV_FOOT', 'GL_LK', 'GL_CAFE', 'GL_W2', 'GL_PIL_W', 'GL_TV_W', 'GL_W', 'GL_SW', 'GL_DW'],
      ['BS_WIN', 'BS_DOOR_W', 'ST_TOP', 'SERV_FOOT', 'GL_LK', 'GL_CAFE', 'GL_W2', 'GL_PIL_W', 'GL_C_N', 'GL_PIL_E', 'GL_TV_E', 'GL_E', 'GL_SE']],
    N: [['RS_IN_W', 'RS_DOOR_W', 'GL_DW', 'GL_SW', 'GL_W', 'GL_TV_W', 'GL_PIL_W', 'GL_C_N', 'GL_NN', 'GL_N_W'],
      ['RS_IN_E', 'RS_DOOR_E', 'GL_DE', 'GL_SE', 'GL_E', 'GL_TV_E', 'GL_PIL_E', 'GL_E2', 'GL_N_E', 'GL_NN', 'GL_NE2']],
  },
  flank: {
    S: [['BS_DOOR_MID', 'OFF_N', 'OFF_CN', 'OFF_C_W', 'WH_C', 'BR_TOP', 'BR_MID', 'BR_FOOT', 'WC_E', 'WC_N', 'WC'],
      ['BS_DOOR_MID', 'OFF_N', 'OFF_CN', 'OFF_CS', 'OFF_S', 'PANTRY_S', 'PANTRY_W']],
    N: [['RS_NW', 'RS_DOOR_SIDE', 'WC', 'WC_N', 'WC_E', 'BR_FOOT', 'BR_MID', 'BR_TOP', 'WH_C', 'WH_NE', 'OFF_N', 'BS_DOOR_MID'],
      ['RS_IN_W', 'RS_DOOR_W', 'GL_DW', 'GL_SW', 'GL_W', 'NOOK', 'WS_S', 'SERV_FOOT', 'ST_TOP']],
  },
  sofa: {
    S: [['BS_WIN', 'BS_DOOR_W', 'ST_TOP', 'SERV_FOOT', 'GL_LK', 'GL_CAFE', 'GL_NW2', 'GL_N_W', 'GL_NN', 'GL_NE2', 'NORTH_LANE', 'SOFA_NE',
      'SOFA_N', 'SOFA_C', 'SOFA_S', 'GL_DE']],
    N: [['RS_IN_E', 'RS_DOOR_E', 'GL_DE', 'SOFA_S', 'SOFA_C', 'SOFA_N', 'SOFA_NE', 'NORTH_LANE']],
  },
};

export const BOS_LANES: LaneDef[] = Object.entries(XCFG.bots.lanesBoston).map(([id, weight]) => ({
  id, weight, route: (own: 'S' | 'N') => [...pickOne(ROUTES[id][own])],
}));
