// src/world/maps/boston/layout.ts — denah Boston: kantor 2 lantai (adaptasi dokumen "Blueprint Map Boston" buatan pengguna:
// Lantai 3 "Garden Lounge" + Lantai 4 "The Veranda"). Data ditulis dalam koordinat DOKUMEN (Utara = +Z: Spawn Biru di L4 sisi
// Utara, Spawn Merah di L3 sisi Selatan) lalu DIPUTAR 180° terhadap sumbu Y (x → −x, z → −z) agar konvensi game terpenuhi:
// Biru di Z negatif, Merah di Z positif. Putaran (bukan cermin) menjaga arah tangga L & tata letak persis seperti dokumen.
// Penyesuaian terhadap dokumen (dokumen sendiri meminta "perbaiki yang kurang"):
//  - Tangga Cokelat digeser 1 u ke Utara (dokumen) → koridor kaki tangga dari pintu samping Spawn Merah 3.2 u (dulu 2.2 u: kapsul
//    1.6 u nyaris tidak lewat); flight 2 lari 9.8 u (27°).
//  - Ruang di bawah bordes & flight 2 diisi gudang padat; ruang barat koridor Merah (z −38…−30) = ruang utilitas tertutup.
//  - Barikade spawn diperpendek/dipindah agar ada lorong ≥ 2 u di kedua ujungnya; barikade tambahan di pintu Selatan & Barat
//    Spawn Biru (pintu ke Ruang Kaca & Tangga Servis) agar slot spawn tidak terlihat dari luar.
//  - Node nav dokumen yang jatuh DI DALAM meja (L3_GL_N_W/N_E) & edge yang menembus barikade dibuat ulang (nav.ts).
//  - Tambahan cover & struktur: kolom putih L3, TV kedua, resepsionis, pot tanaman, meja kerja Ruang Kaca, pantry barat,
//    kios & pot di Veranda, pagar miring tangga, pembatas tak terlihat di atas pagar Veranda (grup BARRIER: peluru tembus).
//  - 10 slot spawn per tim (dokumen 5): Biru semuanya di L4, Merah di L3.
// Tinggi pelindung patuh GDD §4.4 & dokumen: ≤ 2.4 (meja/sofa/pot), 4.0 (TV, konter, partisi, kabinet drop), ≥ 5.6 (barikade,
// pilar, lemari); pita terlarang 2.95–3.75 & 4.25–5.05 tidak dipakai (tests/boston.test.ts).
import type { SurfaceMaterial } from '../../../core/EventBus';
import { distToBoxXZ, stairFrame, stairHeightAt, type Box, type Cat, type SpawnFloor, type Stair, type Style } from '../../MapData';
import { PROP_SIZE, type PropItem, type PropKind } from '../../propKinds';

/** Baris balok dalam koordinat DOKUMEN: [id, kategori, gaya, x0, x1, y0, y1, z0, z1]. */
type DRow = [string, Cat, Style, number, number, number, number, number, number];

/** Lantai 3 (dasar), plafon L3 (= bawah pelat L4), lantai 4, plafon L4 (= bawah atap). */
export const BOS_Y = { f3: 0, c3: 9.4, f4: 10, c4: 18, roof: 18.8 } as const;

const ROWS: DRow[] = [
  // ── cangkang bangunan
  ['GROUND', 'shell', 'o_ground', -26, 26, -1, 0, -38, 38],
  ['WALL_W', 'shell', 'o_ext', -27, -26, 0, 18.8, -39, 39],
  ['WALL_N', 'shell', 'o_ext', -26, 27, 0, 18.8, 38, 39],
  ['WALL_S', 'shell', 'o_ext', -26, 27, 0, 18.8, -39, -38],
  ['WALL_E_KNEE', 'shell', 'o_ext', 26, 27, 0, 1.4, -38, 38],
  ['WIN_E', 'shell', 'o_window', 26.2, 26.6, 1.4, 9.4, -38, 38],          // jendela tinggi L3 (kaca tahan peluru)
  ['BEAM_E1', 'shell', 'o_beam', 26, 27, 9.4, 10, -38, -18],
  ['BEAM_E2', 'shell', 'o_beam', 25.7, 27, 9.4, 10, -18, -8],             // di bawah pagar Veranda sepanjang void
  ['BEAM_E3', 'shell', 'o_beam', 26, 27, 9.4, 10, -8, 38],
  ['ROOF', 'shell', 'o_roof', -26, 26, 18, 18.8, -38, 38],
  // ── pelat Lantai 4 (3 bukaan: Tangga Servis, Tangga Cokelat, Void drop-down)
  ['SLAB_B1', 'mass', 'o_slab', -26, 26, 9.4, 10, 28, 38],
  ['SLAB_B2', 'mass', 'o_slab', -18, 26, 9.4, 10, 12, 28],
  ['SLAB_B3', 'mass', 'o_slab', -26, 26, 9.4, 10, -2, 12],
  ['SLAB_B4A', 'mass', 'o_slab', -14, 26, 9.4, 10, -8, -2],
  ['SLAB_B4B', 'mass', 'o_slab', -14, 16, 9.4, 10, -18, -8],
  ['SLAB_B5', 'mass', 'o_slab', -26, 26, 9.4, 10, -38, -18],
  // ── Tangga Servis Utara (berdinding beton; inti padat di bawah bordes atas)
  ['SERV_WALL_E3', 'wall', 'o_conc', -18.4, -18, 0, 9.4, 12, 38],
  ['SERV_CORE', 'wall', 'o_conc', -26, -18.4, 0, 9.4, 28, 38],
  ['SERV_WALL_E4', 'wall', 'o_conc', -18.4, -18, 10, 18, 12, 18],
  ['SERV_WALL_S4', 'wall', 'o_conc', -26, -18.4, 10, 18, 11.6, 12],
  // ── Spawn Biru (L4): dinding Barat & Selatan, kaca lipat frosted tahan peluru di Timur; 4 pintu
  ['BS_W1', 'spawn', 'o_wall', -18.4, -18, 10, 18, 18, 29.5],
  ['BS_W2', 'spawn', 'o_wall', -18.4, -18, 10, 18, 34.5, 38],
  ['BS_W_LINTEL', 'wall', 'o_wall', -18.4, -18, 16, 18, 29.5, 34.5],
  ['BS_S1', 'spawn', 'o_wall', -18, -6, 10, 18, 17.6, 18],
  ['BS_S2', 'spawn', 'o_wall', -1.5, 10, 10, 18, 17.6, 18],
  ['BS_S_LINTEL', 'wall', 'o_wall', -6, -1.5, 16, 18, 17.6, 18],
  ['BS_GLASS_E1', 'spawn', 'o_glass', 10, 10.4, 10, 18, 18, 20],
  ['BS_GLASS_E2', 'spawn', 'o_glass', 10, 10.4, 10, 18, 24.5, 30.5],
  ['BS_GLASS_E3', 'spawn', 'o_glass', 10, 10.4, 10, 18, 35, 38],
  ['BS_E_LINTEL1', 'wall', 'o_frame', 10, 10.4, 16, 18, 20, 24.5],
  ['BS_E_LINTEL2', 'wall', 'o_frame', 10, 10.4, 16, 18, 30.5, 35],
  // barikade sepanjang kaca Timur: pintu Veranda hanya menuju "kantong" di antara kaca & barikade (keluar lewat ujung Utara/
  // Selatan) → tidak ada garis pandang lurus dari Veranda ke slot spawn; pintu Selatan & Barat juga ditutup barikade di depannya
  ['BLUE_BARR_1', 'cover', 'o_crateB', 4, 5.5, 10, 15.6, 20.5, 28],
  ['BLUE_BARR_2', 'cover', 'o_cab', 4, 5.5, 10, 15.6, 28, 35.5],
  ['BLUE_BARR_3', 'cover', 'o_cab', -11, -0.5, 10, 15.6, 20.6, 21.8],
  ['BLUE_BARR_4', 'cover', 'o_cab', -14.6, -13.4, 10, 15.6, 29.5, 34.5],
  ['BLUE_DESK_1', 'cover', 'o_desk', -13, -8, 10, 12.2, 25, 28],
  ['BLUE_DESK_2', 'cover', 'o_desk', -2, 2, 10, 12.2, 25.5, 28.5],
  // ── Ruang Kaca Tengah (L4): sekat bingkai frosted + 3 panel kaca DESTRUKTIBEL (BOS_GLASS, bukan balok statis)
  ['MID_FRAME_1', 'wall', 'o_glass', 10, 10.4, 10, 18, 14, 18],
  ['MID_FRAME_2', 'wall', 'o_glass', 10, 10.4, 10, 18, 3, 8],
  ['MID_FRAME_3', 'wall', 'o_glass', 10, 10.4, 10, 18, -8, -3],
  ['MID_FRAME_4', 'wall', 'o_glass', 10, 10.4, 10, 18, -18, -14],
  ['MID_LINTEL_1', 'wall', 'o_frame', 10, 10.4, 16, 18, 8, 14],
  ['MID_LINTEL_2', 'wall', 'o_frame', 10, 10.4, 16, 18, -3, 3],
  ['MID_LINTEL_3', 'wall', 'o_frame', 10, 10.4, 16, 18, -14, -8],
  ['L4_CUBICLE_C', 'cover', 'o_part', -4, 2, 10, 14, -1, 1],
  ['L4_DESK_NW', 'cover', 'o_desk', -11, -6, 10, 12.2, 8, 12],
  ['L4_DESK_NE', 'cover', 'o_desk', 0, 4, 10, 12.2, 8, 12],
  ['L4_DESK_SW', 'cover', 'o_desk', -11, -6, 10, 12.2, -12, -8],
  ['L4_DESK_SE', 'cover', 'o_desk', 0, 4, 10, 12.2, -12, -8],
  ['L4_CAB_W', 'cover', 'o_cab', -14.6, -13.4, 10, 15.6, 3.5, 8.5],
  // ── Lorong Barat L4 (puncak Tangga Cokelat)
  ['L4_WH_CAB', 'cover', 'o_cab', -26, -24.6, 10, 15.6, 6, 11.6],
  ['L4_WH_BENCH', 'cover', 'o_wood', -22, -18.5, 10, 12.2, 6, 7.4],
  // ── Pantry Selatan L4 (di atas Spawn Merah)
  ['L4_PANTRY_S', 'cover', 'o_counter', -6, 2, 10, 14, -29, -27],
  ['L4_PANTRY_W', 'cover', 'o_counter', -26, -24.4, 10, 14, -36, -27],
  ['L4_FRIDGE', 'cover', 'o_cab', -26, -24.2, 10, 15.6, -25, -22],
  ['L4_DINE', 'cover', 'o_marble', -19, -15, 10, 12.2, -33, -30],
  ['L4_GARDEN_DIV', 'cover', 'o_planter', -1, 5, 10, 14, -18.6, -17.4],
  // ── The Veranda (L4): pilar H-beam, meja marmer, kios, pot; pagar besi luar (+ pembatas tak terlihat: BOS_BARRIERS)
  ['VER_PILLAR_1', 'pillar', 'o_hbeam', 24.2, 25.2, 10, 18, 20, 21],
  ['VER_PILLAR_2', 'pillar', 'o_hbeam', 24.2, 25.2, 10, 18, 4, 5],
  ['VER_PILLAR_3', 'pillar', 'o_hbeam', 24.2, 25.2, 10, 18, -20, -19],
  ['VER_PILLAR_4', 'pillar', 'o_hbeam', 24.2, 25.2, 10, 18, 34, 35],
  ['VER_PILLAR_5', 'pillar', 'o_hbeam', 24.2, 25.2, 10, 18, -33, -32],
  ['VER_TABLE_1', 'cover', 'o_marble', 17, 20, 10, 12.2, 12, 16],
  ['VER_TABLE_2', 'cover', 'o_marble', 17, 20, 10, 12.2, -2, 2],
  ['VER_TABLE_3', 'cover', 'o_marble', 17, 20, 10, 12.2, -26, -22],
  ['VER_KIOSK', 'cover', 'o_kiosk', 14, 17, 10, 14, 26, 29],
  ['VER_PLANT_1', 'cover', 'o_planter', 22, 25.7, 10, 12.4, 27, 30],
  ['VER_PLANT_2', 'cover', 'o_planter', 10.5, 13, 10, 12.4, -31, -28],
  ['VER_PLANT_3', 'cover', 'o_planter', 22.5, 25.7, 10, 12.4, 8, 11],
  ['VER_RAIL_E', 'rail', 'o_rail', 25.7, 26, 10, 11.2, -38, 38],
  ['RAIL_V_W', 'rail', 'o_rail', 15.7, 16, 10, 11.2, -18, -8],
  ['RAIL_V_N', 'rail', 'o_rail', 16, 25.7, 10, 11.2, -8, -7.7],
  ['RAIL_V_S', 'rail', 'o_rail', 16, 25.7, 10, 11.2, -18.3, -18],
  // ── Tangga Cokelat (L): gudang di bawah bordes & flight 2, pagar bukaan L4
  ['BR_STORE_LAND', 'wall', 'o_store', -26, -21.5, 0, 4.5, -16.8, -11.8],
  ['BR_LANDING', 'bridge', 'o_wood', -26, -21.5, 4.5, 5, -16.8, -11.8],
  ['BR_STORE_F2', 'wall', 'o_store', -26, -21.5, 0, 5, -11.8, -2],
  ['RAIL_LAND_S', 'rail', 'o_rail', -26, -21.5, 5, 6.2, -16.8, -16.6],
  ['RAIL_BR_E', 'rail', 'o_rail', -14, -13.7, 10, 11.2, -18, -2],
  ['RAIL_BR_S', 'rail', 'o_rail', -26, -14, 10, 11.2, -18.3, -18],
  ['RAIL_BR_N', 'rail', 'o_rail', -21.5, -14, 10, 11.2, -2, -1.7],
  // ── Spawn Merah (L3): kaca geser frosted tahan peluru di Utara, dinding Barat berpintu ke koridor kaki Tangga Cokelat
  ['RS_N1', 'spawn', 'o_glass', -18, -11, 0, 9.4, -20.4, -20],
  ['RS_N2', 'spawn', 'o_glass', -6, 7, 0, 9.4, -20.4, -20],
  ['RS_N3', 'spawn', 'o_glass', 12, 26, 0, 9.4, -20.4, -20],
  ['RS_N_LINTEL1', 'wall', 'o_frame', -11, -6, 6, 9.4, -20.4, -20],
  ['RS_N_LINTEL2', 'wall', 'o_frame', 7, 12, 6, 9.4, -20.4, -20],
  ['RS_W1', 'spawn', 'o_wall', -18.4, -18, 0, 9.4, -38, -26],
  ['RS_W2', 'spawn', 'o_wall', -18.4, -18, 0, 9.4, -21.5, -20],
  ['RS_W_LINTEL', 'wall', 'o_wall', -18.4, -18, 6, 9.4, -26, -21.5],
  ['RED_BARR_1', 'cover', 'o_crateR', -12, -4.5, 0, 5.6, -25.5, -24],
  ['RED_BARR_C', 'cover', 'o_cab', -4.5, 5, 0, 5.6, -25.5, -24],          // garis barikade utuh: lajur pintu → ujung Barat/Timur
  ['RED_BARR_2', 'cover', 'o_crateR', 5, 16, 0, 5.6, -25.5, -24],
  ['RED_BARR_3', 'cover', 'o_cab', -15.6, -14.4, 0, 5.6, -29, -21],
  ['RED_MEET_TABLE', 'cover', 'o_wood', -3.5, 3.5, 0, 2.2, -31, -27.5],
  // ── Koridor Barat (L3): dari pintu samping Spawn Merah ke kaki Tangga Cokelat
  ['WC_UTIL', 'wall', 'o_wall', -26, -18.4, 0, 9.4, -38, -30],
  ['WC_CRATES', 'cover', 'o_store', -26, -23.8, 0, 2.2, -29.6, -26.4],
  // ── Garden Lounge (L3)
  ['PILLAR_L3_C', 'pillar', 'o_col', -1.5, 1.5, 0, 9.4, 2, 5],
  ['TV_STAND_L3', 'cover', 'o_tv', -3, 3, 0, 4, -6.5, -5.5],
  ['LOCKER_WALL_W', 'wall', 'o_locker', -17.5, -15.5, 0, 6.5, 0, 9],
  ['CAFE_COUNTER_W', 'cover', 'o_counter', -14.5, -10.5, 0, 4, 5, 6.5],
  ['L3_TABLE_1', 'cover', 'o_marble', -9, -5, 0, 2.2, -11, -7],
  ['L3_TABLE_2', 'cover', 'o_marble', 6, 10, 0, 2.2, -11, -7],
  ['L3_TABLE_3', 'cover', 'o_marble', -9, -5, 0, 2.2, 13, 17],
  ['L3_TABLE_4', 'cover', 'o_marble', 6, 10, 0, 2.2, 13, 17],
  ['L3_DIVIDER_N', 'cover', 'o_part', -2, 4, 0, 4, 26, 27.5],
  ['L3_COL_W1', 'pillar', 'o_col', -9.8, -8.2, 0, 9.4, -2.8, -1.2],
  ['L3_COL_E1', 'pillar', 'o_col', 8.2, 9.8, 0, 9.4, -2.8, -1.2],
  ['L3_COL_W2', 'pillar', 'o_col', -10.6, -9, 0, 9.4, 9.2, 10.8],
  ['L3_COL_E2', 'pillar', 'o_col', 9, 10.6, 0, 9.4, 9.2, 10.8],
  ['L3_COL_W3', 'pillar', 'o_col', -9.8, -8.2, 0, 9.4, 27.2, 28.8],
  ['L3_COL_E3', 'pillar', 'o_col', 8.2, 9.8, 0, 9.4, 27.2, 28.8],
  ['RECEPTION', 'cover', 'o_counter', -13, -6.5, 0, 4, 31, 33.5],
  ['PLANTER_N', 'cover', 'o_planter', 6, 9.5, 0, 2.4, 33.5, 36.5],
  ['PLANTER_S', 'cover', 'o_planter', -2, 2, 0, 2.4, -15.5, -13],
  ['PLANTER_E', 'cover', 'o_planter', 11.5, 14, 0, 2.4, 0, 4],
  ['L3_WS_BENCH', 'cover', 'o_wood', -26, -24.4, 0, 2.2, 2, 8],
  ['L3_NOOK_CRATES', 'cover', 'o_store', -21.5, -19, 0, 2.2, -12, -9.5],
  // ── Jalur Sofa & Jendela (L3): kolom tepi void, kabinet drop (puncak 4.0 = jatuh aman dari Veranda), 3 klaster sofa
  ['L3_COL_V1', 'pillar', 'o_col', 14.4, 16, 0, 9.4, -8.8, -7.2],
  ['L3_COL_V2', 'pillar', 'o_col', 14.4, 16, 0, 9.4, 11.2, 12.8],
  ['L3_COL_V3', 'pillar', 'o_col', 14.4, 16, 0, 9.4, 26.2, 27.8],
  ['DROP_CABINET_E', 'cover', 'o_wood', 18, 22, 0, 4, -15, -11],
  ['SOFA_C', 'cover', 'o_sofaO', 19.5, 25, 0, 2.4, 0, 6],
  ['SOFA_N', 'cover', 'o_sofaY', 19.5, 25, 0, 2.4, 16, 22],
  ['SOFA_NE', 'cover', 'o_sofaG', 19.5, 25, 0, 2.4, 28, 34],
];

// ───────────────────────── putaran 180° (dokumen → game)
/** Titik dokumen → game. */
export const rot = (x: number, z: number): [number, number] => [x === 0 ? 0 : -x, z === 0 ? 0 : -z];
/** Balok dokumen → game (min/max ditukar karena tanda dibalik). */
function rotBox([id, cat, style, x0, x1, y0, y1, z0, z1]: DRow): Box {
  return { id, cat, style, min: [-x1, y0, -z1], max: [-x0, y1, -z0] };
}
const rotRange = (a: number, b: number): [number, number] => [-b, -a];

export const BOS_BOXES: Box[] = ROWS.map(rotBox);

/** Batas area bermain (dalam dinding luar). */
export const BOS_BOUNDS = { x: [-26, 26] as [number, number], z: [-38, 38] as [number, number] };

// ───────────────────────── tangga (game)
/** Tangga Cokelat flight 1 (naik ke arah Barat dokumen = +X game), bordes Y 5, flight 2 (naik ke Utara dokumen = −Z game), Tangga
 *  Servis lurus (naik ke Utara dokumen). Kemiringan 33.7° / 27° / 33.7° (≤ 34°, batas lereng KCC 45°). */
export const BOS_STAIRS: Stair[] = [
  { id: 'BR_F1', x: rotRange(-21.5, -14), zFoot: 12, zTop: 16.8, openX: 0, yFoot: 0, yTop: 5,
    alongX: { z: rotRange(-16.8, -12), xFoot: 14, xTop: 21.5 } },
  { id: 'BR_F2', x: rotRange(-26, -21.5), zFoot: 11.8, zTop: 2, openX: 21.5, yFoot: 5, yTop: 10 },
  { id: 'SERV', x: rotRange(-26, -18.4), zFoot: -13, zTop: -28, openX: 18.4 },
];

/** Pagar miring (convexHull tipis setinggi 1.2 di atas ramp) — garis a → b (game). */
export const BOS_SLOPED_RAILS: { id: string; a: [number, number, number]; b: [number, number, number] }[] = [
  { id: 'HR_F1_N', a: [14, 1.2, 12.1], b: [21.5, 6.2, 12.1] },        // sisi ceruk (bukaan) flight 1
  { id: 'HR_F1_S', a: [14, 1.2, 16.7], b: [21.5, 6.2, 16.7] },        // sisi koridor flight 1
  { id: 'HR_F2_E', a: [21.6, 6.2, 11.8], b: [21.6, 11.2, 2] },        // sisi ceruk flight 2
];

/** Pembatas tak terlihat (grup BARRIER: menahan karakter, granat, benda lepas; peluru & garis pandang tembus) di atas pagar
 *  Veranda sampai plafon — pemain/granat tidak bisa keluar map lewat sisi teras yang terbuka. */
export const BOS_BARRIERS: Box[] = [rotBox(['VER_BARRIER', 'rail', 'hidden', 25.7, 26, 11.2, 18, -38, 38])];

/** Panel kaca destruktibel Ruang Kaca ↔ Veranda (60 HP; utuh = collider STATIC, pecah = collider mati + edge nav gerbang
 *  terbuka). Urutan = indeks jaringan. */
export interface GlassPanel { id: string; min: [number, number, number]; max: [number, number, number]; gate: string; hp: number }
export const BOS_GLASS: GlassPanel[] = ([
  ['MID_GLASS_1', 8, 14, 'g1'], ['MID_GLASS_2', -3, 3, 'g2'], ['MID_GLASS_3', -14, -8, 'g3'],
] as const).map(([id, z0, z1, gate]) => {
  const b = rotBox([id, 'wall', 'hidden', 10.1, 10.3, 10, 16, z0, z1]);
  return { id, min: b.min, max: b.max, gate, hp: 60 };
});

// ───────────────────────── spawn (game): Biru 10 slot di L4 (upper), Merah 10 slot di L3 (ground)
const sl = (y: number, pts: [number, number][]): [number, number, number][] => pts.map(([x, z]) => { const [gx, gz] = rot(x, z); return [gx, y, gz]; });
export const BOS_SPAWNS: Record<'blue' | 'red', Record<SpawnFloor, [number, number, number][]>> = {
  blue: {
    upper: sl(10, [[-12, 34.8], [-7.5, 34.8], [-3, 34.8], [1.5, 34.8], [-12, 30], [-7.5, 30], [-3, 30], [1.5, 30], [-15.6, 24], [-4, 24.2]]),
    ground: [],
  },
  red: {
    upper: [],
    ground: sl(0, [[-15, -35.5], [-9, -35.5], [-3, -35.5], [3, -35.5], [9, -35.5], [15, -35.5], [21, -35.5], [-11, -30.5], [10, -30.5], [18, -30.5]]),
  },
};

// ───────────────────────── nama area (radar) & permukaan
/** Nama area untuk label radar (koordinat game). */
export function bosZoneName(x: number, y: number, z: number): string {
  const dx = -x, dz = -z;                         // → koordinat dokumen
  if (y >= 8.5) {                                 // Lantai 4
    if (dx >= 10.2) {
      if (dx >= 16 && dz > -18 && dz < -8) return 'Void Drop';
      return dz > 18 ? 'Veranda Utara' : dz < -18 ? 'Veranda Selatan' : 'Veranda';
    }
    if (dx < -18.2 && dz >= 12) return 'Tangga Servis';
    if (dz >= 17.8) return 'Spawn Biru';
    if (dz <= -18) return 'Pantry';
    if (dx < -13.9 && dz < -2) return 'Tangga Cokelat';
    if (dx < -13.9) return 'Lorong Barat';
    return 'Ruang Kaca';
  }
  if (dx < -18.2 && dz > 12 && dz < 28) return 'Tangga Servis';
  if (dx < -13.9 && dz > -16.8 && dz < -2 && (y > 0.6 || dx < -21.5)) return 'Tangga Cokelat';
  if (dz <= -20.2 && dx >= -18.2) return 'Spawn Merah';
  if (dx < -18.2 && dz < -16.8) return 'Koridor Barat';
  if (dx < -18.2 && dz < 12) return 'Kaki Tangga Servis';
  if (dx >= 15.8) return 'Jalur Sofa';
  return 'Garden Lounge';
}

/** Material permukaan benda per gaya balok (tumbukan peluru, pantulan granat, langkah di atas benda). */
const STYLE_SURF: Partial<Record<Style, SurfaceMaterial>> = {
  o_glass: 'glass', o_window: 'glass',
  o_rail: 'metal', o_hbeam: 'metal', o_frame: 'metal', o_tv: 'metal', o_cab: 'metal', o_locker: 'metal', o_kiosk: 'metal',
  o_wood: 'wood', o_crateB: 'wood', o_crateR: 'wood', o_desk: 'wood', o_store: 'wood', o_counter: 'wood', o_planter: 'wood',
  o_part: 'carpet', o_sofaO: 'carpet', o_sofaY: 'carpet', o_sofaG: 'carpet',
};
/** Lantai/pelat & dinding → permukaan wilayah (bukan benda). */
const FLOORISH = new Set<Style>(['o_ground', 'o_slab', 'o_roof']);
const OBJECTS = BOS_BOXES.filter(b => !FLOORISH.has(b.style));
const STAIR_FRAMES = BOS_STAIRS.map(s => ({ s, f: stairFrame(s) }));

/** Permukaan di titik (game): benda yang disentuh titik (≤ 0.05 u) → materialnya; tangga → kayu (Cokelat) / beton (Servis);
 *  lantai: Ruang Kaca & Lorong Barat L4 berkarpet, sisanya tegel. */
export function bosSurfaceAt(x: number, y: number, z: number): SurfaceMaterial {
  for (const b of OBJECTS) {
    if (y < b.min[1] - 0.05 || y > b.max[1] + 0.05 || distToBoxXZ(b, x, z) > 0.05) continue;
    return STYLE_SURF[b.style] ?? 'tile';
  }
  for (const { s, f } of STAIR_FRAMES) {
    if (x < f.x[0] - 0.05 || x > f.x[1] + 0.05 || z < f.z[0] - 0.05 || z > f.z[1] + 0.05) continue;
    if (Math.abs(y - stairHeightAt(f, x, z)) < 0.6) return s.id === 'SERV' ? 'tile' : 'wood';
  }
  const dx = -x, dz = -z;
  if (y >= 8.5 && dx < 10 && dx > -26 && dz > -18 && dz < 17.6) return 'carpet';
  return 'tile';
}

// ───────────────────────── latihan, kamera menu, probe pantulan
/** Mode Latihan (game): [x, y, z, bergerak]. Dummy tim Merah tersebar di kedua lantai — Veranda, Ruang Kaca, Pantry, Garden
 *  Lounge, Jalur Sofa; pemain (Biru) mulai di Spawn Biru L4. */
export const BOS_PRACTICE: [number, number, number, boolean][] = ([
  [14, 10, 8, false], [21, 10, 18, false], [22.5, 10, -29, false], [-8.5, 10, 0, false], [7, 10, -11, false], [-2.5, 10, -23, false],
  [-11, 0, 0, false], [6, 0, -14, false], [16.5, 0, 3, false], [-6, 0, 20, false], [14, 10, -2, true], [0, 0, 11, true],
] as [number, number, number, boolean][]).map(([x, y, z, m]) => { const [gx, gz] = rot(x, z); return [gx, y, gz, m]; });

/** Kamera menu: orbit di dalam Garden Lounge (di bawah pelat L4) memandang pilar tengah. */
export const BOS_MENU_CAM: { look: [number, number, number]; rx: number; rz: number; y: number } = { look: [0, 3.5, -4], rx: 9, rz: 16, y: 6.5 };
/** CubeCamera pantulan: udara Garden Lounge (L3) di antara pilar tengah & TV. */
export const BOS_ENV_PROBE: [number, number, number] = [3, 5, 1];

// ───────────────────────── cahaya (bake & visual)
/** Jendela/bukaan langit untuk bake (game): jendela tinggi L3 sisi Timur dokumen (= X negatif game) & sisi teras L4 yang
 *  terbuka (lebih kuat). */
export const BOS_WINDOWS: { x: number; z: number; y: readonly [number, number]; width: number; v: number }[] = [];
for (let dz = -34.2; dz <= 34.2; dz += 9.5) {
  BOS_WINDOWS.push({ x: -26, z: -dz, y: [1.6, 9.2], width: 9.5, v: 0.75 });
  BOS_WINDOWS.push({ x: -26, z: -dz, y: [11.4, 17.6], width: 9.5, v: 1 });
}
/** Lampu plafon (balok emisif; juga sumber cahaya bake): [x, y, z, lebar X, panjang Z] game. y = bawah plafon. */
export const BOS_LAMPS: [number, number, number, number, number][] = [];
{
  const lamp = (x: number, y: number, z: number, w: number, d: number) => { const [gx, gz] = rot(x, z); BOS_LAMPS.push([gx, y, gz, w, d]); };
  // L3: Garden Lounge (hindari cincin tanaman gantung) + Spawn Merah + koridor + jalur sofa
  for (const [x, z] of [[-12, -14], [12, -14], [-12, 1], [4, 9], [-13, 20], [12, 26], [-3, 33], [13, 35], [0, -10], [-3, 23]]) lamp(x, 9.3, z, 1.4, 4);
  for (const [x, z] of [[-10, -28], [0, -34], [10, -28], [20, -34]]) lamp(x, 9.3, z, 1.4, 4);
  for (const [x, z] of [[-22, -24], [-22, 5], [-17, -18.5]]) lamp(x, 9.3, z, 1.2, 3);
  for (const [x, z] of [[21, -26], [21, -4], [21, 12], [21, 26]]) lamp(x, 9.3, z, 1.2, 3.5);
  // L4: Spawn Biru, Ruang Kaca, Lorong Barat, Pantry, bordes Tangga Servis (Veranda = cahaya siang)
  for (const [x, z] of [[-10, 33], [0, 33], [-10, 22], [3, 24]]) lamp(x, 17.9, z, 1.4, 4);
  for (const [x, z] of [[-7, 10], [2, 10], [-2, 0], [-7, -10], [2, -10], [7, 0]]) lamp(x, 17.9, z, 1.4, 4);
  for (const [x, z] of [[-20, 4], [-22, 33], [-16, 15]]) lamp(x, 17.9, z, 1.2, 3);
  for (const [x, z] of [[-18, -28], [-6, -24], [2, -33], [-14, -35]]) lamp(x, 17.9, z, 1.4, 4);
}
/** 4 cincin tanaman rambat gantung L3 (dokumen; cincin ke-2 digeser & diperkecil agar tidak menembus kolom): pusat [x, y, z] game,
 *  jari-jari. */
export const BOS_PLANT_RINGS: [number, number, number, number][] = ([[-6, -10, 3.5], [4.5, -1.5, 3], [-5, 12, 3.5], [7, 18, 3.5]] as [number, number, number][])
  .map(([x, z, r]) => { const [gx, gz] = rot(x, z); return [gx, 8.2, gz, r]; });

// ───────────────────────── benda kantor dinamis (dokumen: 16 laptop, 24 tumbler, 24 kursi — tidur sampai kena peluru/ledakan)
/** Benda di atas / di samping balok dokumen `id`: fx, fz = posisi relatif tapak (0..1, boleh di luar untuk kursi), yaw dunia game
 *  = menghadap titik (tx, tz) relatif tapak (kursi menghadap meja) atau acak terkunci. */
export const BOS_PROP_ITEMS: PropItem[] = (() => {
  const out: PropItem[] = [];
  const row = (id: string) => { const r = ROWS.find(q => q[0] === id); if (!r) throw new Error(`prop: balok ${id}`); return r; };
  let seed = 17;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const put = (id: string, kind: PropKind, fx: number, fz: number, tint?: number, onFloor = false) => {
    const r = row(id), dx = r[3] + (r[4] - r[3]) * fx, dz = r[7] + (r[8] - r[7]) * fz;
    const base = onFloor ? r[5] : r[6], [gx, gz] = rot(dx, dz);
    let yaw: number;
    if (kind === 'chair') {           // menghadap pusat meja (+Z lokal = depan dudukan)
      const [cx, cz] = rot((r[3] + r[4]) / 2, (r[7] + r[8]) / 2);
      yaw = Math.atan2(cx - gx, cz - gz);
    } else yaw = Math.floor(rnd() * 4) * Math.PI / 2 + (rnd() - 0.5) * 0.5;
    out.push({ kind, x: gx, y: base + PROP_SIZE[kind][1] / 2 + 0.01, z: gz, yaw, tint });
  };
  // laptop (16)
  for (const id of ['VER_TABLE_1', 'VER_TABLE_2', 'VER_TABLE_3']) { put(id, 'laptop', 0.5, 0.3); put(id, 'laptop', 0.5, 0.72); }
  for (const id of ['L3_TABLE_1', 'L3_TABLE_2', 'L3_TABLE_3', 'L3_TABLE_4']) put(id, 'laptop', 0.35, 0.4);
  put('RED_MEET_TABLE', 'laptop', 0.2, 0.5); put('RED_MEET_TABLE', 'laptop', 0.5, 0.35); put('RED_MEET_TABLE', 'laptop', 0.8, 0.6);
  put('L4_DINE', 'laptop', 0.5, 0.5); put('CAFE_COUNTER_W', 'laptop', 0.3, 0.5); put('RECEPTION', 'laptop', 0.7, 0.4);
  // tumbler (24)
  const cups = [0xf2efe8, 0xb03a2e, 0x2f6fb0, 0x4f8a4b, 0xe0b23a, 0x2b2e33];
  const cup = (id: string, fx: number, fz: number) => put(id, 'cup', fx, fz, cups[Math.floor(rnd() * cups.length)]);
  for (const id of ['VER_TABLE_1', 'VER_TABLE_2', 'VER_TABLE_3']) { cup(id, 0.2, 0.12); cup(id, 0.8, 0.88); }
  for (const id of ['L3_TABLE_1', 'L3_TABLE_2', 'L3_TABLE_3', 'L3_TABLE_4']) { cup(id, 0.75, 0.25); cup(id, 0.8, 0.75); }
  cup('RED_MEET_TABLE', 0.35, 0.75); cup('RED_MEET_TABLE', 0.65, 0.2); cup('RED_MEET_TABLE', 0.9, 0.3);
  cup('L4_PANTRY_S', 0.2, 0.5); cup('L4_PANTRY_S', 0.45, 0.4); cup('L4_PANTRY_S', 0.8, 0.6);
  cup('L4_DINE', 0.2, 0.3); cup('L4_DINE', 0.8, 0.7); cup('CAFE_COUNTER_W', 0.7, 0.4); cup('CAFE_COUNTER_W', 0.85, 0.6);
  // kursi (24): oranye di Garden Lounge, rotan di Veranda, kursi kantor gelap di meja kerja & ruang rapat
  const ORANGE = 0xd9733f, RATTAN = 0xc9a16b, OFFICE = 0x3d4350;
  for (const id of ['L3_TABLE_1', 'L3_TABLE_2', 'L3_TABLE_3', 'L3_TABLE_4']) { put(id, 'chair', -0.28, 0.5, ORANGE, true); put(id, 'chair', 1.28, 0.5, ORANGE, true); }
  for (const id of ['VER_TABLE_1', 'VER_TABLE_2', 'VER_TABLE_3']) { put(id, 'chair', -0.3, 0.5, RATTAN, true); put(id, 'chair', 1.3, 0.5, RATTAN, true); }
  for (const fx of [0.25, 0.75]) { put('RED_MEET_TABLE', 'chair', fx, -0.25, OFFICE, true); put('RED_MEET_TABLE', 'chair', fx, 1.25, OFFICE, true); }
  put('L4_DINE', 'chair', -0.3, 0.5, OFFICE, true); put('L4_DINE', 'chair', 1.3, 0.5, OFFICE, true);
  put('BLUE_DESK_1', 'chair', 0.5, -0.33, OFFICE, true); put('BLUE_DESK_2', 'chair', 0.5, -0.4, OFFICE, true);
  put('L4_DESK_NW', 'chair', 0.5, 1.3, OFFICE, true); put('L4_DESK_SE', 'chair', 0.5, -0.3, OFFICE, true);
  return out;
})();
