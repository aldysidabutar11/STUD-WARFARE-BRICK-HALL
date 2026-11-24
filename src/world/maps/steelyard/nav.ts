// src/world/maps/steelyard/nav.ts — graf navigasi & jalur bot Steel Yard (C1). Template gaya GDD §11.6 (sama dengan Brick Hall):
// {H} = S (Biru, Z negatif) / N (Merah), {X} = W (X negatif) / E, awalan C_ = garis tengah Z = 0. Koordinat ditulis untuk kuadran
// SW (H = S, X = W); NavGraph mencerminkan otomatis (N: z → −z, E: x → −x). Satu lantai: level 0.
// 104 node / 134 edge setelah ekspansi. Semua edge lolos NavGraph.validate (raycast Rapier) & sapuan kapsul 2D (tests/steelyard).
// Nama ekspor = ANTARMUKA (dipakai index.ts): SY_NAV, SY_LANES. Bobot jalur di XCFG.bots.lanesSteelYard.
import { XCFG } from '../../../config/extraConfig';
import type { EdgeKind } from '../../NavGraph';
import type { LaneDef, NavTemplate } from '../types';

const NODES: [string, number, number, number][] = [
  // Gerbang (sudut spawn) — keluar Barat (ke Sayap) & Timur (ke Bangkai Mobil / Halaman Belakang)
  ['{H}_SPAWN_{X}', -28, -47.8, 0], ['{H}_SPAWNW_{X}', -38.6, -48.4, 0], ['{H}_WEXIT_{X}', -39.2, -40.6, 0],
  ['{H}_SPAWNE_{X}', -16.6, -45.4, 0], ['{H}_EEXIT_{X}', -15.6, -41.2, 0],
  // Sayap + Lorong Kontainer + Tumpukan Palet + Pos Jaga
  ['{H}_SAYAP_{X}', -38.6, -33.0, 0], ['{H}_AISLE_{X}', -25.4, -33.0, 0],
  ['{H}_TUNS_{X}', -38.6, -27.4, 0], ['{H}_TUNN_{X}', -38.6, -11.6, 0], ['{H}_COURT_{X}', -31.0, -8.4, 0],
  ['C_WING_{X}', -27.6, 0, 0], ['C_POS_{X}', -36.4, 0, 0],
  // Bangkai Mobil (halaman dalam: barat & timur sedan) + celah utara
  ['{H}_YARDS_{X}', -14.0, -34.6, 0], ['{H}_YARDW_{X}', -25.6, -25.0, 0], ['{H}_YARDE_{X}', -12.8, -26.5, 0],
  ['{H}_YARDN_{X}', -24.4, -12.6, 0],
  // Tengah (TENGAH + tumpukan peti) & jalur samping Menara
  ['{H}_HUB_{X}', -21.6, -6.4, 0], ['{H}_HUBW_{X}', -27.0, -4.4, 0], ['{H}_HUBE_{X}', -13.6, -5.8, 0], ['C_TOWER_{X}', -12.6, 0, 0],
  ['{H}_TWS_{X}', -9.6, -7.6, 0],
  // Apit (sisi timur Bangkai Mobil → samping SISI) + Gudang Spool + Lorong Tengah + Halaman Belakang
  ['{H}_CHOKE_{X}', -12.4, -17.6, 0], ['{H}_PLAZAS_{X}', -7.2, -17.6, 0], ['{H}_PLAZAW_{X}', -7.4, -12.2, 0],
  ['{H}_PLAZA', 0, -13.0, 0], ['{H}_TWF', 0, -8.2, 0], ['{H}_CTUNN', 0, -21.6, 0], ['{H}_CTUNS', 0, -33.6, 0],
  ['{H}_BACK', 0, -41.8, 0], ['{H}_BACKW_{X}', -8.2, -42.6, 0],
];

const EDGES: [string, string, EdgeKind][] = [
  // Gerbang
  ['{H}_SPAWN_{X}', '{H}_SPAWNW_{X}', 'walk'], ['{H}_SPAWNW_{X}', '{H}_WEXIT_{X}', 'walk'], ['{H}_WEXIT_{X}', '{H}_SAYAP_{X}', 'walk'],
  ['{H}_SPAWN_{X}', '{H}_SPAWNE_{X}', 'walk'], ['{H}_SPAWNE_{X}', '{H}_EEXIT_{X}', 'walk'], ['{H}_SPAWNE_{X}', '{H}_BACKW_{X}', 'walk'],
  // Sayap → Lorong Kontainer → Tumpukan Palet → Pos Jaga
  ['{H}_SAYAP_{X}', '{H}_TUNS_{X}', 'door'], ['{H}_TUNS_{X}', '{H}_TUNN_{X}', 'walk'], ['{H}_TUNN_{X}', '{H}_COURT_{X}', 'door'],
  ['{H}_COURT_{X}', 'C_WING_{X}', 'walk'], ['C_WING_{X}', 'C_POS_{X}', 'door'], ['{H}_COURT_{X}', '{H}_HUBW_{X}', 'walk'],
  // Sayap → Bangkai Mobil → Tengah
  ['{H}_SAYAP_{X}', '{H}_AISLE_{X}', 'walk'], ['{H}_AISLE_{X}', '{H}_YARDW_{X}', 'walk'], ['{H}_AISLE_{X}', '{H}_YARDS_{X}', 'walk'],
  ['{H}_YARDW_{X}', '{H}_YARDN_{X}', 'walk'], ['{H}_YARDN_{X}', '{H}_HUB_{X}', 'walk'],
  ['{H}_HUB_{X}', '{H}_HUBW_{X}', 'walk'], ['{H}_HUBW_{X}', 'C_WING_{X}', 'walk'],
  ['{H}_HUB_{X}', '{H}_HUBE_{X}', 'walk'], ['{H}_HUBE_{X}', 'C_TOWER_{X}', 'walk'], ['{H}_HUBE_{X}', '{H}_TWS_{X}', 'walk'],
  ['{H}_TWS_{X}', 'C_TOWER_{X}', 'walk'],
  // Gerbang Timur → Bangkai Mobil timur → Apit → Gudang Spool
  ['{H}_EEXIT_{X}', '{H}_YARDS_{X}', 'walk'], ['{H}_YARDS_{X}', '{H}_YARDE_{X}', 'walk'], ['{H}_YARDE_{X}', '{H}_CHOKE_{X}', 'walk'],
  ['{H}_CHOKE_{X}', '{H}_PLAZAS_{X}', 'walk'], ['{H}_PLAZAS_{X}', '{H}_PLAZAW_{X}', 'walk'], ['{H}_PLAZAW_{X}', '{H}_TWS_{X}', 'walk'],
  ['{H}_PLAZAW_{X}', '{H}_PLAZA', 'walk'], ['{H}_PLAZA', '{H}_TWF', 'walk'],
  // Lorong Tengah ↔ Halaman Belakang
  ['{H}_PLAZA', '{H}_CTUNN', 'door'], ['{H}_CTUNN', '{H}_CTUNS', 'walk'], ['{H}_CTUNS', '{H}_BACK', 'door'],
  ['{H}_BACK', '{H}_BACKW_{X}', 'walk'], ['{H}_BACKW_{X}', '{H}_EEXIT_{X}', 'walk'],
];

/** Node posisi berlindung (bot TAKE_COVER mencari node yang tidak terlihat ancaman dari tinggi mata jongkok). */
const COVER = ['{H}_AISLE_{X}', '{H}_YARDS_{X}', '{H}_YARDW_{X}', '{H}_YARDE_{X}', '{H}_HUB_{X}', '{H}_HUBW_{X}', '{H}_HUBE_{X}',
  '{H}_TWS_{X}', '{H}_TWF', '{H}_COURT_{X}', '{H}_PLAZAW_{X}', '{H}_PLAZAS_{X}', '{H}_CHOKE_{X}', 'C_POS_{X}', '{H}_BACKW_{X}',
  '{H}_EEXIT_{X}', '{H}_TUNS_{X}', '{H}_TUNN_{X}'];

export const SY_NAV: NavTemplate = { nodes: NODES, edges: EDGES, cover: COVER };

/** Rute template → id node ({H} sisi sendiri, {E} sisi lawan, {X} = W/E — sama untuk seluruh rute). Spawn di SUDUT (SW/SE,
 *  NW/NE ±50 u terpisah): {X} = sisi tempat bot berada (x < 0 → W) agar bot tidak menyeberangi halaman sendiri dulu (±55 u
 *  sia-sia dari sudut seberang); tanpa x → undian W/E. */
const route = (ids: string[]) => (own: 'S' | 'N', x?: number): string[] => {
  const E = own === 'S' ? 'N' : 'S', X = x === undefined ? (Math.random() < 0.5 ? 'W' : 'E') : x < 0 ? 'W' : 'E';
  return ids.map(s => s.replace(/\{H\}/g, own).replace(/\{E\}/g, E).replace(/\{X\}/g, X));
};
type SyLane = keyof typeof XCFG.bots.lanesSteelYard;
/** Bobot dibaca saat dipakai (XCFG.bots.lanesSteelYard). */
const lane = (id: SyLane, ids: string[]): LaneDef => ({ id, get weight() { return XCFG.bots.lanesSteelYard[id]; }, route: route(ids) });

/** Jalur bot (bobot pemilihan; maks 2 bot per jalur per tim — BotDirector). Empat penyeberangan garis tengah: Pos Jaga W/E
 *  (C_WING: sayap & dalam) dan samping Menara W/E (C_TOWER: tengah & apit) — bot tersebar ±seimbang di keduanya. */
export const SY_LANES: LaneDef[] = [
  // Sayap: Lorong Kontainer → Tumpukan Palet → Pos Jaga → Tumpukan Palet & Lorong Kontainer lawan
  lane('sayap', ['{H}_SAYAP_{X}', '{H}_TUNS_{X}', '{H}_TUNN_{X}', '{H}_COURT_{X}', 'C_WING_{X}',
    '{E}_COURT_{X}', '{E}_TUNN_{X}', '{E}_TUNS_{X}', '{E}_SAYAP_{X}']),
  // Dalam: Bangkai Mobil → celah utara → Tengah → gang Pos Jaga (C_WING) → Tengah & Bangkai Mobil lawan
  lane('dalam', ['{H}_AISLE_{X}', '{H}_YARDW_{X}', '{H}_YARDN_{X}', '{H}_HUB_{X}', '{H}_HUBW_{X}', 'C_WING_{X}',
    '{E}_HUBW_{X}', '{E}_HUB_{X}', '{E}_YARDN_{X}', '{E}_YARDW_{X}', '{E}_AISLE_{X}']),
  // Tengah: Lorong Tengah → Gudang Spool → sudut Menara → Gudang Spool & Lorong Tengah lawan
  lane('tengah', ['{H}_BACK', '{H}_CTUNS', '{H}_CTUNN', '{H}_PLAZA', '{H}_PLAZAW_{X}', '{H}_TWS_{X}',
    'C_TOWER_{X}', '{E}_TWS_{X}', '{E}_PLAZAW_{X}', '{E}_PLAZA', '{E}_CTUNN', '{E}_CTUNS', '{E}_BACK']),
  // Apit: Bangkai Mobil timur → celah Apit → Gudang Spool → samping Menara → memutar ke Tumpukan Palet & Lorong Kontainer lawan
  lane('apit', ['{H}_YARDS_{X}', '{H}_YARDE_{X}', '{H}_CHOKE_{X}', '{H}_PLAZAS_{X}', '{H}_PLAZAW_{X}',
    '{H}_TWS_{X}', 'C_TOWER_{X}', '{E}_HUBE_{X}', '{E}_HUB_{X}', '{E}_HUBW_{X}', '{E}_COURT_{X}', '{E}_TUNN_{X}']),
];
