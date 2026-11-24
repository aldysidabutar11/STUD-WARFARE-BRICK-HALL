// src/world/maps/brickhall.ts — MapDef Brick Hall: membungkus data & builder yang sudah ada (MapData, BrickHallBuilder, Decor,
// LightBake) TANPA mengubah perilaku/tampilan. Template graf nav (GDD §11.6) & jalur bot (§11.1/§11.7) dipindah ke sini dari
// NavGraph.ts / BotDirector.ts; dummy Latihan, kamera menu, probe pantulan & kabut dari Game.ts.
import { XCFG } from '../../config/extraConfig';
import type { EdgeKind } from '../NavGraph';
import {
  BOOK_PILES, BOXES, FLOOR_AREA, SPAWN_SLOTS, STAIRS, groundObstacles, surfaceAt, zoneName,
} from '../MapData';
import { buildBrickHall } from '../BrickHallBuilder';
import type { LaneDef, MapDef, NavTemplate } from './types';

// {H} = S (Biru, Z negatif) / N (Merah); {X} = W (X negatif) / E; C_ = garis tengah Z = 0. Koordinat untuk H=S, X=W.
const NODE_T: [string, number, number, number][] = [
  ['{H}_SPAWN', 0, -47, 10], ['{H}_DOORIN_{X}', -7, -44.6, 10], ['{H}_DOOR_{X}', -7, -42, 10],
  ['{H}_FRONT', 0, -40.5, 10], ['{H}_LOOK', 0, -36.5, 10], ['{H}_BRMOUTH_{X}', -8, -37, 10],
  ['{H}_BR0_{X}', -8, -33, 10], ['{H}_BR1_{X}', -8, -25, 10], ['{H}_BR2_{X}', -8, -12, 10],
  ['{H}_ROT_{X}', -8, -5, 10], ['C_ROT_{X}', -4.5, 0, 10], ['{H}_ROTC', 0, -4, 10],
  ['{H}_DOOROUT_{X}', -10.8, -42, 10], ['{H}_YARD_{X}', -12, -38.5, 10], ['{H}_WING_{X}', -24, -45, 10],
  ['{H}_LANDIN_{X}', -19.5, -36.3, 10], ['{H}_CORNER_{X}', -24, -37.5, 10], ['{H}_INNER_{X}', -28.1, -37.5, 10],
  ['{H}_LAND_{X}', -19.5, -33.9, 10], ['{H}_WALK_{X}', -24.05, -20, 10], ['{H}_HALL_{X}', -28.1, -20, 10],
  ['{H}_WALKB_{X}', -24.05, -10, 10], ['C_WALK_{X}', -24.05, 0, 10], ['C_HALL_{X}', -28.1, 0, 10],
  ['{H}_F_STAIR_{X}', -19.5, -17, 0], ['{H}_F_SIDE_{X}', -19.5, -7, 0], ['C_F_SIDE_{X}', -19.5, 0, 0],
  ['{H}_F_TABLE_{X}', -9.5, -6, 0], ['C_F_TABLE_{X}', -11, 0, 0], ['{H}_F_MID_{X}', -10.5, -16, 0],
  ['{H}_F_SHELFA_{X}', -10.5, -25, 0], ['{H}_F_END_{X}', -10.5, -31.5, 0], ['{H}_F_END', 0, -33.2, 0],
  ['{H}_F_PILLAR_{X}', -4.5, -21.5, 0], ['{H}_F_CEN_{X}', -4, -10, 0],
  ['{H}_F_DESK', 0, -5, 0], ['C_F_GAP_{X}', -4, 0, 0],
  // v2: ruang spawn bawah (lantai 1) → pintu aula (X ±4…7) & lorong ke arsip; arsip zig-zag di bawah balkon;
  //     lorong tengah kini dibelah rak tinggi (F_VOID dihapus → jalur lewat F_SOUTH)
  ['{H}_GSPAWN', 0, -46.5, 0], ['{H}_GDOOR_{X}', -5.5, -44.6, 0], ['{H}_GEXIT_{X}', -5.5, -38.5, 0], ['{H}_F_EXIT_{X}', -5.5, -33, 0],
  ['{H}_GWEST_{X}', -11, -45.5, 0], ['{H}_GCORNER_{X}', -28.5, -45.5, 0], ['{H}_GNORTH_{X}', -28.5, -38.5, 0], ['{H}_GARC_{X}', -28.5, -33, 0],
  ['{H}_ARC1_{X}', -24.4, -30.5, 0], ['{H}_ARC2_{X}', -24.4, -25, 0], ['{H}_ARC3_{X}', -28.2, -20.2, 0], ['{H}_ARC4_{X}', -26.3, -16, 0],
  ['{H}_ARCDOOR_{X}', -24.6, -13.5, 0], ['{H}_F_ARCDOOR_{X}', -19.8, -13.5, 0], ['{H}_ARC5_{X}', -26.3, -10.5, 0],
  ['{H}_ARC6_{X}', -24.4, -5, 0], ['C_ARC_{X}', -26.3, 0, 0], ['{H}_F_SOUTH_{X}', -3.3, -32.6, 0],
];

const EDGE_T: [string, string, EdgeKind][] = [
  ['{H}_SPAWN', '{H}_DOORIN_{X}', 'walk'], ['{H}_DOORIN_{X}', '{H}_DOOR_{X}', 'door'],
  ['{H}_DOOR_{X}', '{H}_FRONT', 'walk'], ['{H}_DOOR_{X}', '{H}_DOOROUT_{X}', 'walk'],
  ['{H}_DOOROUT_{X}', '{H}_YARD_{X}', 'walk'], ['{H}_DOOROUT_{X}', '{H}_WING_{X}', 'walk'],
  ['{H}_FRONT', '{H}_LOOK', 'walk'], ['{H}_YARD_{X}', '{H}_BRMOUTH_{X}', 'walk'], ['{H}_LOOK', '{H}_BRMOUTH_{X}', 'walk'],
  ['{H}_BRMOUTH_{X}', '{H}_BR0_{X}', 'walk'], ['{H}_BR0_{X}', '{H}_BR1_{X}', 'walk'], ['{H}_BR1_{X}', '{H}_BR2_{X}', 'walk'],
  ['{H}_BR2_{X}', '{H}_ROT_{X}', 'walk'], ['{H}_ROT_{X}', 'C_ROT_{X}', 'walk'], ['{H}_ROT_{X}', '{H}_ROTC', 'walk'],
  ['{H}_YARD_{X}', '{H}_LANDIN_{X}', 'walk'], ['{H}_LANDIN_{X}', '{H}_LAND_{X}', 'walk'], ['{H}_YARD_{X}', '{H}_CORNER_{X}', 'walk'],
  ['{H}_WING_{X}', '{H}_INNER_{X}', 'walk'], ['{H}_WING_{X}', '{H}_CORNER_{X}', 'walk'], ['{H}_CORNER_{X}', '{H}_INNER_{X}', 'walk'],
  ['{H}_CORNER_{X}', '{H}_LAND_{X}', 'walk'], ['{H}_CORNER_{X}', '{H}_WALK_{X}', 'walk'], ['{H}_INNER_{X}', '{H}_HALL_{X}', 'walk'],
  ['{H}_WALK_{X}', '{H}_HALL_{X}', 'door'], ['{H}_WALK_{X}', '{H}_WALKB_{X}', 'walk'], ['{H}_WALKB_{X}', 'C_WALK_{X}', 'walk'],
  ['{H}_HALL_{X}', 'C_HALL_{X}', 'walk'], ['C_WALK_{X}', 'C_HALL_{X}', 'door'],
  ['{H}_LAND_{X}', '{H}_F_STAIR_{X}', 'stair'],
  ['{H}_F_STAIR_{X}', '{H}_F_SIDE_{X}', 'walk'], ['{H}_F_STAIR_{X}', '{H}_F_MID_{X}', 'walk'],
  ['{H}_F_SIDE_{X}', 'C_F_SIDE_{X}', 'walk'], ['{H}_F_SIDE_{X}', '{H}_F_TABLE_{X}', 'walk'],
  ['{H}_F_MID_{X}', '{H}_F_TABLE_{X}', 'walk'], ['{H}_F_MID_{X}', '{H}_F_SHELFA_{X}', 'walk'],
  ['{H}_F_SHELFA_{X}', '{H}_F_END_{X}', 'walk'], ['{H}_F_END_{X}', '{H}_F_END', 'walk'],
  ['{H}_F_END', '{H}_F_SOUTH_{X}', 'walk'], ['{H}_F_SOUTH_{X}', '{H}_F_PILLAR_{X}', 'walk'], ['{H}_F_PILLAR_{X}', '{H}_F_CEN_{X}', 'walk'],
  ['{H}_F_CEN_{X}', '{H}_F_DESK', 'walk'], ['{H}_F_CEN_{X}', 'C_F_GAP_{X}', 'walk'],
  ['{H}_F_TABLE_{X}', 'C_F_TABLE_{X}', 'walk'], ['C_F_TABLE_{X}', 'C_F_GAP_{X}', 'walk'],
  // v2: ruang spawn bawah
  ['{H}_GSPAWN', '{H}_GDOOR_{X}', 'walk'], ['{H}_GDOOR_{X}', '{H}_GEXIT_{X}', 'door'], ['{H}_GEXIT_{X}', '{H}_F_EXIT_{X}', 'walk'],
  ['{H}_F_EXIT_{X}', '{H}_F_SOUTH_{X}', 'walk'], ['{H}_F_EXIT_{X}', '{H}_F_END_{X}', 'walk'],
  ['{H}_GSPAWN', '{H}_GWEST_{X}', 'walk'], ['{H}_GWEST_{X}', '{H}_GCORNER_{X}', 'walk'], ['{H}_GCORNER_{X}', '{H}_GNORTH_{X}', 'walk'],
  ['{H}_GNORTH_{X}', '{H}_GARC_{X}', 'door'],
  // v2: arsip (zig-zag melewati lemari) + pintu ke aula
  ['{H}_GARC_{X}', '{H}_ARC1_{X}', 'walk'], ['{H}_ARC1_{X}', '{H}_ARC2_{X}', 'walk'], ['{H}_ARC2_{X}', '{H}_ARC3_{X}', 'walk'],
  ['{H}_ARC3_{X}', '{H}_ARC4_{X}', 'walk'], ['{H}_ARC4_{X}', '{H}_ARCDOOR_{X}', 'walk'], ['{H}_ARC4_{X}', '{H}_ARC5_{X}', 'walk'],
  ['{H}_ARCDOOR_{X}', '{H}_ARC5_{X}', 'walk'], ['{H}_ARCDOOR_{X}', '{H}_F_ARCDOOR_{X}', 'door'],
  ['{H}_ARC5_{X}', '{H}_ARC6_{X}', 'walk'], ['{H}_ARC6_{X}', 'C_ARC_{X}', 'walk'], ['C_ARC_{X}', 'C_F_SIDE_{X}', 'door'],
  ['{H}_F_ARCDOOR_{X}', '{H}_F_STAIR_{X}', 'walk'], ['{H}_F_ARCDOOR_{X}', '{H}_F_SIDE_{X}', 'walk'], ['{H}_F_ARCDOOR_{X}', '{H}_F_MID_{X}', 'walk'],
];

// Drop-down satu arah (opsional, bot Sulit): lompat pagar → atas rak (Y 4.0) → lantai.
const DROP_T: [string, string, string][] = [
  ['{H}_BR1_{X}', '{H}_F_SHELFA_{X}', 'SHELF_A'],
  ['{H}_WALKB_{X}', '{H}_F_MID_{X}', 'SHELF_B'],
];

const COVER_T = ['{H}_F_SHELFA_{X}', '{H}_F_PILLAR_{X}', '{H}_F_MID_{X}', '{H}_F_TABLE_{X}', 'C_F_GAP_{X}', 'C_F_TABLE_{X}',
  '{H}_F_END_{X}', '{H}_YARD_{X}', '{H}_DOOR_{X}', '{H}_HALL_{X}', 'C_HALL_{X}', '{H}_WING_{X}', '{H}_ROTC', 'C_ROT_{X}', '{H}_BRMOUTH_{X}',
  // v2
  '{H}_LOOK', '{H}_F_SOUTH_{X}', '{H}_GEXIT_{X}', '{H}_ARC2_{X}', '{H}_ARC4_{X}', '{H}_ARC6_{X}', '{H}_ARCDOOR_{X}', '{H}_F_ARCDOOR_{X}'];

/** Template graf navigasi Brick Hall (192 node setelah ekspansi, 8 drop). */
export const BRICKHALL_NAV: NavTemplate = { nodes: NODE_T, edges: EDGE_T, drops: DROP_T, cover: COVER_T };

/** Jalur bot Brick Hall (rute template: {H} = sisi sendiri, {E} = sisi lawan, {X} = W/E acak). Sama persis dengan
 *  BotDirector.laneRoute lama (urutan panggilan Math.random juga sama). */
function laneRoute(lane: string, own: 'S' | 'N'): string[] {
  const E = own === 'S' ? 'N' : 'S', X = Math.random() < 0.5 ? 'W' : 'E';
  const r = (s: string) => s.replace(/\{H\}/g, own).replace(/\{E\}/g, E).replace(/\{X\}/g, X);
  switch (lane) {
    case 'west': case 'east': {
      const side = lane === 'west' ? 'W' : 'E';
      const inner = Math.random() < 0.5;
      const walk = inner ? 'HALL' : 'WALK';
      return [`${own}_CORNER_${side}`, `${own}_${walk}_${side}`, `C_${walk}_${side}`, `${E}_${walk}_${side}`, inner ? `${E}_INNER_${side}` : `${E}_CORNER_${side}`];
    }
    case 'floor': return ['{H}_LAND_{X}', '{H}_F_STAIR_{X}', '{H}_F_MID_{X}', 'C_F_TABLE_{X}', '{E}_F_MID_{X}', '{E}_F_STAIR_{X}', '{E}_LAND_{X}'].map(r);
    // v2: jalur apit beratap lewat arsip (lantai 1, di bawah balkon), keluar lewat pintu aula di sisi lawan
    case 'archive': return ['{H}_ARC2_{X}', '{H}_ARC4_{X}', 'C_ARC_{X}', '{E}_ARC5_{X}', '{E}_ARCDOOR_{X}', '{E}_F_ARCDOOR_{X}', '{E}_F_MID_{X}'].map(r);
    default: return ['{H}_BRMOUTH_{X}', '{H}_BR1_{X}', '{H}_ROT_{X}', 'C_ROT_{X}', '{E}_ROT_{X}', '{E}_BR1_{X}', '{E}_BRMOUTH_{X}'].map(r); // bridge
  }
}

/** Bobot tetap XCFG.bots.lanes (dibaca saat dipakai); urutan = urutan undian lama (jembatan, barat, timur, lantai, arsip). */
const lane = (id: 'bridge' | 'west' | 'east' | 'floor' | 'archive'): LaneDef =>
  ({ id, get weight() { return XCFG.bots.lanes[id]; }, route: (own) => laneRoute(id, own) });
export const BRICKHALL_LANES: LaneDef[] = [lane('bridge'), lane('west'), lane('east'), lane('floor'), lane('archive')];

/** Dummy Latihan (tim Merah, menghadap Selatan): [x, y, z, bergerak kiri-kanan]. */
export const BRICKHALL_PRACTICE: [number, number, number, boolean][] = [
  [-8, 10, -25.5, false], [-8, 10, 4.5, false], [-8, 10, 34.5, false],   // jembatan Barat: 10/40/70 u dari mulut jembatan
  [8, 10, -20, false], [8, 10, 15, false],                               // jembatan Timur
  [-3.4, 0, -24, false], [-11, 0, 1, false], [11, 0, 1, false], [3.4, 0, 24, false], // lantai dasar (v2: di samping rak tengah)
  [0, 0, -11, true], [0, 0, 11, true],                                   // target bergerak (v2: di depan ujung rak tengah)
  [0, 10, 38, false],                                                    // mezanin Utara
];

export const BRICKHALL: MapDef = {
  id: 'brickhall',
  name: 'Brick Hall',
  desc: 'Perpustakaan bata dua lantai: jembatan kembar, rotunda bermenara jam, arsip beratap & rak setinggi plafon.',
  bounds: { x: [-30, 30], z: [-50, 50] },
  boxes: BOXES,
  stairs: STAIRS,
  spawnSlots: SPAWN_SLOTS,
  nav: BRICKHALL_NAV,
  lanes: BRICKHALL_LANES,
  surfaceAt,
  zoneName,
  practice: BRICKHALL_PRACTICE,
  menuCam: { look: [0, 6, 0], rx: 17, rz: 34, y: 21 },
  envProbe: [0, 20, -18],                   // udara terbuka di atas rak tengah
  atmosphere: { outdoor: false, fogColor: XCFG.gfx.fog.color, fogDensity: XCFG.gfx.fog.density, background: 0x2a1d14 },
  props: { bookPiles: BOOK_PILES, floorArea: FLOOR_AREA, groundObstacles },
  build: buildBrickHall,
};
