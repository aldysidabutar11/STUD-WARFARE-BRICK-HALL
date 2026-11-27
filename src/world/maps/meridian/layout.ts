// src/world/maps/meridian/layout.ts — denah Meridian Vault (bank sentral 2 tingkat, map Bomb Mission; adaptasi dokumen
// "Blueprint Map Meridian Vault & Mode Bomb Mission" buatan pengguna — layout orisinal). Koordinat game = koordinat dokumen × 2 di XZ
// (Merah/penyerang babak 1 di Barat Laut = Z positif, Biru/bertahan di Tenggara = Z negatif; Barat = −X).
// DENAH x2 (umpan balik pengguna 2026-11-27 setelah mencoba: map terlalu kecil → cepat ketemu musuh, C4 tidak terpakai; jalan terlalu
// sempit): arsitektur (dinding, massa, pintu, pelat, tangga, zona) dikali 2 di XZ, TINGGI TETAP (pita cover, lompat, plafon, ambang &
// balkon sama); prop (peti, meja, kios, etalase) tetap ukuran asli di pusat × 2 (yang menempel dinding tetap menempel); barikade spawn
// tetap setebal 1–1.2; +34 benda baru (pilar marmer m_col, peti, kios, etalase, pulau lemari deposit) — ditandai komentar "tambahan".
// Penyesuaian atas dokumen (dilaporkan & disetujui pengguna 2026-11-27, "gas"):
//  - Manifest dokumen tidak lengkap (±40 dari "74" balok): ruang yang tidak didefinisikan diisi massa padat (MASS_*), dinding
//    zona setinggi plafon global 16 (dokumen 9–12 → celah di atas dinding: granat/peluru lewat antar-zona), plafon rendah zona
//    (spawn 11–12, Site A 10, South Connector & Mid-West 9, terowongan B 8) = massa di atasnya.
//  - Lubang ditutup: ambang pintu Mid → Balkon B (lantai Y 6.5), bordes puncak Tangga Biru (Z −5…−4), ambang pintu Mid-West
//    (Y 3; dulu parit 1 u sedalam 3 u), celah dinding di samping pintu brankas; dinding timur Site A ≠ dinding barat Mid (dulu
//    dobel → z-fighting). Ruang kosong di bawah dek Mid Utara & ramp utara diisi padat (dulu ruang tertutup tak terjangkau).
//  - Garis pandang ke spawn (1 nyawa per ronde): barikade papan di dalam pintu Selatan Spawn Merah (gerbang bank yang didobrak),
//    barikade di dalam pintu Barat Spawn Biru, sekat kotak deposit di Site A (dulu garis lurus West Long → pintu brankas → Site A
//    → South Connector → Spawn Biru ±52 u). Konter Site A digeser 1.5 u ke Barat (celah ke sisi Timur sekat ≥ 2.5 u).
//  - Panggung B diperpanjang setinggi 1.5 di antara & di bawah tangga kembar (dulu celah 2 u setinggi lantai); etalase Timur
//    digeser ke dinding Timur (kaki ramp panggung Timur tidak terhalang).
// Tinggi pelindung patuh GDD §4.4: ≤ 2.4, 4.0, ≥ 5.6 (pita terlarang 2.95–3.75 & 4.25–5.05 relatif lantainya; tests/meridian.test.ts).
import type { SurfaceMaterial } from '../../../core/EventBus';
import { distToBoxXZ, stairFrame, stairHeightAt, type Box, type Cat, type SpawnFloor, type Stair, type Style } from '../../MapData';
import { PROP_SIZE, type PropItem, type PropKind } from '../../propKinds';

/** Baris balok: [id, kategori, gaya, x0, x1, y0, y1, z0, z1]. */
type Row = [string, Cat, Style, number, number, number, number, number, number];

/** Lantai, panggung B, platform Mid, dek/balkon, bawah pelat balkon, plafon global (bawah), atap. */
export const MV_Y = { floor: 0, stage: 1.5, plat: 3, deck: 6.5, slabBot: 5.9, ceil: 16, roof: 16.8 } as const;

const ROWS: Row[] = [
  // ── cangkang bangunan
  ['GROUND', 'shell', 'm_ground', -76, 76, -1, 0, -68, 68],
  ['OUT_W', 'shell', 'm_ext', -76, -72, 0, 16.8, -68, 68],
  ['OUT_E', 'shell', 'm_ext', 72, 76, 0, 16.8, -68, 68],
  ['OUT_N', 'shell', 'm_ext', -72, 72, 0, 16.8, 64, 68],
  ['OUT_S', 'shell', 'm_ext', -72, 72, 0, 16.8, -68, -64],
  ['CEIL', 'shell', 'm_ceil', -72, 72, 16, 16.8, -64, 64],
  // ── Spawn Merah (Barat Laut, plafon 12): pintu Selatan ke West Long (barikade papan di dalamnya), pintu Timur ke Tangga Utara
  ['RS_TOP', 'mass', 'm_mass', -72, -30, 12, 16, 34, 64],
  ['RS_S1', 'spawn', 'm_wall', -72, -68, 0, 12, 34, 36],
  ['RS_S2', 'spawn', 'm_wall', -56, -32, 0, 12, 34, 36],
  ['RS_S_LINTEL', 'wall', 'm_lintel', -68, -56, 7, 12, 34, 36],
  ['RS_E1', 'spawn', 'm_wall', -32, -30, 0, 12, 34, 42],
  ['RS_E2', 'spawn', 'm_wall', -32, -30, 0, 12, 54, 64],
  ['RS_E_LINTEL', 'wall', 'm_lintel', -32, -30, 7, 12, 42, 54],
  ['RS_BARR', 'cover', 'm_barr', -71, -48, 0, 6, 41.5, 42.5],
  ['RS_BARR_E', 'cover', 'm_barr', -37.9, -36.9, 0, 7, 40.5, 59],      // di dalam pintu Timur, setinggi ambang pintu (garis pandang menurun dari dek)
  ['RS_CRATES', 'cover', 'm_crateR', -51.5, -46.5, 0, 4, 47.5, 50.5],
  ['RS_TABLE', 'cover', 'm_desk', -68.75, -66.25, 0, 2.2, 45.75, 49.25],
  // ── West Long (koridor marmer, plafon tinggi + skylight; jendela melengkung di dinding Barat)
  ['WL_E1', 'wall', 'm_wall', -52, -50, 0, 16, 4, 34],
  ['WL_E2', 'wall', 'm_wall', -52, -50, 0, 16, -37, -8],
  ['WL_E3', 'wall', 'm_wall', -52, -50, 0, 16, -54, -51],
  ['WL_ARCH_LINTEL', 'wall', 'm_lintel', -52, -50, 9, 16, -8, 4],
  ['VAULT_JAMB_S', 'wall', 'm_vault', -52.4, -49.6, 0, 7.2, -51, -49],
  ['VAULT_JAMB_N', 'wall', 'm_vault', -52.4, -49.6, 0, 7.2, -39, -37],
  ['VAULT_TOP', 'wall', 'm_vault', -52.4, -49.6, 6.2, 7.2, -49, -39],
  ['VAULT_LINTEL', 'wall', 'm_wall', -52, -50, 7.2, 16, -51, -37],
  ['WL_KIOSK_N', 'cover', 'm_kiosk', -56, -52, 0, 2.4, 14, 18],
  ['WL_CRATE_C', 'cover', 'm_crateG', -63.5, -60.5, 0, 4, -14, -10],
  ['WL_BARR_S', 'cover', 'm_kiosk', -69, -65, 0, 2.4, -34.75, -32.25],
  // cover tambahan West Long (map x2): pilar marmer setinggi plafon di tengah aula + peti/kios/etalase berselang kiri-kanan
  ['WL_CR_N', 'cover', 'm_crateG', -58.5, -55.5, 0, 4, 25, 28],
  ['WL_COL_N', 'wall', 'm_col', -65.5, -62.5, 0, 16, 18.5, 21.5],
  ['WL_CR_NW', 'cover', 'm_crateB', -71, -68, 0, 4, 12, 15],
  ['WL_BENCH_W', 'cover', 'm_kiosk', -70, -67, 0, 2.4, 1, 7],
  ['WL_CASE_E', 'cover', 'm_case', -56, -53, 0, 2.4, -22, -17],
  ['WL_COL_S', 'wall', 'm_col', -63.5, -60.5, 0, 16, -31.5, -28.5],
  ['WL_CR_V', 'cover', 'm_crateG', -61, -57, 0, 4, -52, -49],
  ['MASS_WL_S', 'mass', 'm_mass', -72, -50, 0, 16, -64, -54],
  // ── Mid-West (lorong West Long → platform Mid, plafon 9) & massa di sekitarnya
  ['MASS_A_N', 'mass', 'm_mass', -50, -14, 0, 16, -24, -8],
  ['MASS_MW_N', 'mass', 'm_mass', -50, -14, 0, 16, 4, 34],
  ['MASS_RN_S', 'mass', 'm_mass', -30, -14, 0, 16, 34, 42],
  ['MW_TOP', 'mass', 'm_mass', -50, -14, 9, 16, -8, 4],
  ['MW_SILL', 'wall', 'm_sill', -14, -12, 0, 3, -8, 4],
  ['MID_W_LINTEL1', 'wall', 'm_lintel', -14, -12, 9, 16, -8, 4],
  ['MW_CR', 'cover', 'm_crateG', -45, -42, 0, 4, 0.5, 4],
  ['MW_KIOSK', 'cover', 'm_kiosk', -38, -35, 0, 2.4, -8, -5.5],
  // ── Tangga Utara (Spawn Merah → dek Mid Utara Y 6.5)
  ['MASS_RN_N', 'mass', 'm_mass', -30, -14, 0, 16, 54, 64],
  ['MID_W_LINTEL2', 'wall', 'm_lintel', -14, -12, 13.5, 16, 42, 54],
  // ── Mid Concourse (3 elevasi: lantai Y 0 → platform Y 3 → dek Utara Y 6.5; plafon tinggi + skylight)
  ['MID_W1', 'wall', 'm_wall', -14, -12, 0, 16, -24, -8],
  ['MID_W2', 'wall', 'm_wall', -14, -12, 0, 16, 4, 42],
  ['MID_W3', 'wall', 'm_wall', -14, -12, 0, 16, 54, 56],
  ['MID_E1', 'wall', 'm_wall', 16, 20, 0, 16, -36, -4],
  ['MID_E_LINTEL1', 'wall', 'm_lintel', 16, 20, 10, 16, -4, 8],
  ['MID_E2', 'wall', 'm_wall', 16, 20, 0, 16, 8, 34],
  ['MID_E_SILL2', 'wall', 'm_sill', 16, 20, 0, 6.5, 34, 46],
  ['MID_E_LINTEL2', 'wall', 'm_lintel', 16, 20, 13.5, 16, 34, 46],
  ['MID_E3', 'wall', 'm_wall', 16, 20, 0, 16, 46, 56],
  ['MASS_MID_N', 'mass', 'm_mass', -14, 20, 0, 16, 56, 64],
  ['MID_PLAT_C', 'mass', 'm_plat', -12, 16, 0, 3, -8, 8],
  ['MID_UNDER_N', 'mass', 'm_mass', -12, 16, 0, 3, 8, 22],
  ['MID_DECK_N', 'mass', 'm_plat', -12, 16, 0, 6.5, 22, 56],
  ['MID_CRATE_W', 'cover', 'm_crateG', -5.75, -3.25, 3, 7, -3.5, -0.5],          // dokumen −4.5…−2 → 1 u ke Timur: lajur 2.5 u dari pintu Mid-West
  ['MID_CRATE_E', 'cover', 'm_crateG', 8.25, 10.75, 3, 5.4, 2.25, 4.75],
  ['MID_DECK_CASE', 'cover', 'm_case', 1.75, 5.25, 6.5, 8.9, 37, 39],
  ['MID_S_CR1', 'cover', 'm_crateG', -10, -7, 0, 4, -31, -28],
  ['MID_S_CR2', 'cover', 'm_crateR', 10.5, 14, 0, 2.4, -33, -30],
  ['MID_P_KIOSK', 'cover', 'm_kiosk', 6, 10, 3, 5.4, -6.5, -4.5],
  ['MID_D_CR_W', 'cover', 'm_crateG', -10, -7, 6.5, 10.5, 36, 39],
  ['MID_D_CR_E', 'cover', 'm_crateR', 9, 12, 6.5, 8.9, 47, 50],
  // ── Site A — The Security Vault (plafon kaset emas Y 10)
  ['A_TOP', 'mass', 'm_mass', -50, -14, 10, 16, -64, -24],
  ['A_E1', 'wall', 'm_wall', -14, -12, 0, 16, -64, -50],
  ['A_E2', 'wall', 'm_wall', -14, -12, 0, 16, -38, -24],
  ['A_E_LINTEL', 'wall', 'm_lintel', -14, -12, 7, 16, -50, -38],
  ['VAULT_DOOR', 'cover', 'm_vdoor', -49.6, -47.6, 0, 6.2, -37, -30.8],
  ['A_DESK_C', 'cover', 'm_desk', -36, -30, 0, 2.4, -51.75, -49.25],
  ['A_CRATES_E', 'cover', 'm_crateG', -21.75, -19.25, 0, 4, -35, -31],
  ['A_CRATES_SW', 'cover', 'm_crateG', -41.75, -39.25, 0, 4, -57.5, -54.5],
  ['A_PART', 'cover', 'm_deposit', -22, -19, 0, 6.2, -49.8, -38.2],
  // cover tambahan Site A: pulau lemari deposit (6.2) + peti
  ['A_CAB_N', 'cover', 'm_deposit', -44, -38, 0, 6.2, -30, -27.5],
  ['A_CAB_S', 'cover', 'm_deposit', -32, -26, 0, 6.2, -59.5, -57],
  ['A_CR_W', 'cover', 'm_crateG', -42, -39, 0, 4, -49, -46],
  ['A_CR_N', 'cover', 'm_crateR', -30, -27, 0, 2.4, -33, -30],
  ['A_CR_SE', 'cover', 'm_crateB', -20, -17, 0, 4, -61, -58],
  // ── South Connector (koridor rotasi bertahan, plafon 9)
  ['SC_N1', 'wall', 'm_wall', -12, -8, 0, 16, -36, -34],
  ['SC_N2', 'wall', 'm_wall', 12, 16, 0, 16, -36, -34],
  ['SC_N_LINTEL', 'wall', 'm_lintel', -8, 12, 9, 16, -36, -34],
  ['SC_TOP', 'mass', 'm_mass', -12, 26, 9, 16, -52, -36],
  ['MASS_SC_S', 'mass', 'm_mass', -12, 26, 0, 16, -64, -52],
  ['SC_CR1', 'cover', 'm_crateG', -4, -1, 0, 4, -52, -49],
  ['SC_CR2', 'cover', 'm_crateR', 12, 15, 0, 2.4, -52, -48.5],
  ['SC_KIOSK', 'cover', 'm_kiosk', 16, 20, 0, 2.4, -39, -36],
  // ── Spawn Biru (Tenggara, ruang komando CCTV, plafon 11): pintu Barat ke South Connector (barikade di dalamnya), utara ke
  //    terowongan Site B & Tangga Biru ke balkon
  ['BS_TOP', 'mass', 'm_mass', 26, 72, 11, 16, -64, -36],
  ['BS_N_TOP', 'mass', 'm_mass', 30, 72, 11, 16, -36, -34],
  ['BS_W1', 'spawn', 'm_wall', 26, 28, 0, 11, -64, -50],
  ['BS_W2', 'spawn', 'm_wall', 26, 28, 0, 11, -38, -36],
  ['BS_W_LINTEL', 'wall', 'm_lintel', 26, 28, 7, 11, -50, -38],
  ['BS_N1', 'spawn', 'm_wall', 30, 32, 0, 11, -36, -34],
  ['BS_N2', 'spawn', 'm_wall', 44, 52, 0, 11, -36, -34],
  ['BS_N3', 'spawn', 'm_wall', 68, 72, 0, 11, -36, -34],
  ['BS_N_LINTEL1', 'wall', 'm_lintel', 32, 44, 8, 11, -36, -34],
  ['BS_N_LINTEL2', 'wall', 'm_lintel', 52, 68, 8, 11, -36, -34],
  // ruang slot (Selatan) dipisah dinding monitor CCTV dari lobi keluar (Utara: terowongan & Tangga Biru); sambungan = celah Timur
  // & kantong Barat (pintu South Connector, di balik barikade) -> tidak ada garis pandang dari luar ke slot
  ['BS_BARR', 'cover', 'm_barrB', 34.2, 35.4, 0, 6, -56, -36],
  ['BS_INWALL', 'wall', 'm_cctv', 35.4, 67, 0, 11, -48, -46],
  ['BS_DESK', 'cover', 'm_desk', 47, 53, 0, 2.4, -56, -54],
  ['BS_CRATE', 'cover', 'm_crateB', 69.5, 72, 0, 4, -63.5, -61],
  // ── terowongan Site B (plafon 8) & Tangga Biru ke balkon Timur
  ['MASS_BT_W', 'mass', 'm_mass', 20, 30, 0, 16, -36, -8],
  ['BT_W', 'wall', 'm_wall', 30, 32, 0, 16, -34, -8],
  ['BT_E', 'wall', 'm_wall', 44, 52, 0, 16, -34, -8],
  ['BT_TOP', 'mass', 'm_mass', 32, 44, 8, 16, -34, -8],
  ['MASS_BU_E', 'mass', 'm_mass', 68, 72, 0, 16, -34, -8],
  ['BU_LANDING', 'mass', 'm_plat', 52, 68, 0, 6.5, -10, -8],
  ['BT_CR', 'cover', 'm_crateB', 40, 43, 0, 4, -24, -20],
  ['BT_CR2', 'cover', 'm_crateG', 33, 36, 0, 2.4, -17, -14],
  // ── Site B — Grand Atrium (2 lantai, balkon U Y 6.5, panggung bom Y 1.5, tangga kembar, plafon tinggi + 6 skylight)
  ['MASS_B_N', 'mass', 'm_mass', 20, 72, 0, 16, 56, 64],
  ['B_BALC_N', 'bridge', 'm_slab', 20, 72, 5.9, 6.5, 44, 56],
  ['B_BALC_W', 'bridge', 'm_slab', 20, 32, 5.9, 6.5, 8, 44],
  ['B_BALC_E', 'bridge', 'm_slab', 60, 72, 5.9, 6.5, -8, 44],
  ['B_BALC_SE', 'bridge', 'm_slab', 52, 60, 5.9, 6.5, -8, 4],
  ['B_STAGE', 'mass', 'm_stage', 38, 54, 0, 1.5, 14, 28],
  ['B_STAGE_N', 'mass', 'm_stage', 38, 54, 0, 1.5, 28, 44],
  ['B_CRATES_STAGE', 'cover', 'm_crateG', 39.65, 42.15, 1.5, 5.5, 19, 23],
  ['B_CASE_W', 'cover', 'm_case', 25.5, 28.5, 0, 2.4, 18.5, 23.5],
  ['B_CASE_E', 'cover', 'm_case', 69, 72, 0, 2.4, 18.5, 23.5],
  ['B_TELLER', 'cover', 'm_kiosk', 55, 59, 0, 2.4, -3, -1],
  ['B_BALC_CRATE', 'cover', 'm_crateG', 44.5, 47.5, 6.5, 10.5, 50.25, 52.75],
  // cover tambahan Atrium B: pilar penyangga balkon (lantai → bawah pelat 5.9), peti, kios, etalase panggung
  ['B_COL_W1', 'wall', 'm_col', 29, 31, 0, 5.9, 15, 17],
  ['B_COL_W2', 'wall', 'm_col', 29, 31, 0, 5.9, 27, 29],
  ['B_CR_SW', 'cover', 'm_crateG', 34.5, 37.5, 0, 4, 5, 8],
  ['B_CR_NW', 'cover', 'm_crateR', 20.5, 23, 0, 4, 38, 41],
  ['B_KIOSK_N', 'cover', 'm_kiosk', 56, 60, 0, 2.4, 53, 55.5],
  ['B_CR_E', 'cover', 'm_crateG', 64, 67, 0, 4, 1, 4],
  ['B_STG_CASE', 'cover', 'm_case', 50.5, 53.5, 1.5, 3.9, 16, 19],
  ['B_BW_CR', 'cover', 'm_crateG', 21, 24, 6.5, 10.5, 22, 25],
  ['B_BN_CR', 'cover', 'm_crateR', 30, 33, 6.5, 8.9, 51, 54],
  ['B_BE_CR', 'cover', 'm_crateB', 68, 71, 6.5, 10.5, 22, 25],
  // pagar marmer-emas 1.2 di tepi dalam balkon (terbuka di puncak tangga kembar & pintu)
  ['RAIL_W', 'rail', 'm_rail', 31.7, 32, 6.5, 7.7, 8.3, 44],
  ['RAIL_W_S', 'rail', 'm_rail', 20, 32, 6.5, 7.7, 8, 8.3],
  ['RAIL_N_1', 'rail', 'm_rail', 32, 38, 6.5, 7.7, 43.7, 44],
  ['RAIL_N_2', 'rail', 'm_rail', 44, 48, 6.5, 7.7, 43.7, 44],
  ['RAIL_N_3', 'rail', 'm_rail', 54, 60, 6.5, 7.7, 43.7, 44],
  ['RAIL_E', 'rail', 'm_rail', 60, 60.3, 6.5, 7.7, 4, 43.7],
  ['RAIL_SE_N', 'rail', 'm_rail', 52, 60, 6.5, 7.7, 3.7, 4],
  ['RAIL_SE_W', 'rail', 'm_rail', 52, 52.3, 6.5, 7.7, -8, 3.7],
];

export const MV_BOXES: Box[] = ROWS.map(([id, cat, style, x0, x1, y0, y1, z0, z1]) => ({ id, cat, style, min: [x0, y0, z0], max: [x1, y1, z1] }));

/** Batas area bermain (dalam dinding luar). */
export const MV_BOUNDS = { x: [-72, 72] as [number, number], z: [-64, 64] as [number, number] };

// ───────────────────────── tangga (ramp convexHull; dokumen §4)
export const MV_STAIRS: Stair[] = [
  // Spawn Merah → dek Mid Utara: naik ke Timur 0 → 6.5 sepanjang 20 u (18.0°)
  { id: 'RAMP_RED_NORTH', x: [-32, -12], zFoot: 42, zTop: 54, openX: 0, yFoot: 0, yTop: 6.5, alongX: { z: [42, 54], xFoot: -32, xTop: -12 } },
  // Spawn Biru → balkon Timur Site B: naik ke Utara 0 → 6.5 sepanjang 24 u (15.2°) + bordes BU_LANDING
  { id: 'RAMP_BLUE_B_UP', x: [52, 68], zFoot: -34, zTop: -10, openX: 0, yFoot: 0, yTop: 6.5 },
  // Mid: Selatan 0 → 3 (14.0°), Utara 3 → 6.5 (14.0°), Barat dari Mid-West 0 → 3 (10.6°), Timur turun ke Site B 3 → 0 (14.0°)
  { id: 'RAMP_MID_SOUTH', x: [-12, 16], zFoot: -20, zTop: -8, openX: 0, yFoot: 0, yTop: 3 },
  { id: 'RAMP_MID_NORTH', x: [-12, 16], zFoot: 8, zTop: 22, openX: 0, yFoot: 3, yTop: 6.5 },
  { id: 'RAMP_MID_WEST', x: [-30, -14], zFoot: -8, zTop: 4, openX: 0, yFoot: 0, yTop: 3, alongX: { z: [-8, 4], xFoot: -30, xTop: -14 } },
  { id: 'RAMP_MID_B_LOW', x: [16, 28], zFoot: -4, zTop: 8, openX: 0, yFoot: 0, yTop: 3, alongX: { z: [-4, 8], xFoot: 28, xTop: 16 } },
  // panggung B: anak tangga rendah Selatan & Timur 0 → 1.5 (14.0°); tangga kembar panggung → balkon Utara 1.5 → 6.5 (17.4°)
  { id: 'RAMP_B_STAGE_S', x: [40, 52], zFoot: 8, zTop: 14, openX: 0, yFoot: 0, yTop: 1.5 },
  { id: 'RAMP_B_STAGE_E', x: [54, 60], zFoot: 16, zTop: 26, openX: 0, yFoot: 0, yTop: 1.5, alongX: { z: [16, 26], xFoot: 60, xTop: 54 } },
  { id: 'RAMP_B_TWIN_W', x: [38, 44], zFoot: 28, zTop: 44, openX: 0, yFoot: 1.5, yTop: 6.5 },
  { id: 'RAMP_B_TWIN_E', x: [48, 54], zFoot: 28, zTop: 44, openX: 0, yFoot: 1.5, yTop: 6.5 },
];

// ───────────────────────── spawn (5 slot per kelompok; dokumen §5) — kelompok 'red' = Barat Laut (penyerang babak 1),
// 'blue' = Tenggara (bertahan babak 1). Mode Bomb Mission menukar kelompok slot saat tukar sisi.
export const MV_SPAWNS: Record<'blue' | 'red', Record<SpawnFloor, [number, number, number][]>> = {
  blue: { upper: [], ground: [[39, 0, -59], [39, 0, -51], [50, 0, -50.5], [61, 0, -51], [61, 0, -59]] },
  red: { upper: [], ground: [[-67, 0, 60], [-58, 0, 61], [-49, 0, 61], [-40.5, 0, 61.5], [-60, 0, 53]] },
};
/** Arah hadap per kelompok slot: Tenggara menghadap Utara (+Z, yaw π), Barat Laut menghadap Selatan (−Z, yaw 0). */
export const MV_SPAWN_YAW: Record<'blue' | 'red', number> = { blue: Math.PI, red: 0 };

// ───────────────────────── zona bom (AABB pemicu tanam; dokumen §5 / §8.1) & titik tanam bawaan bot
export interface BombSite { id: 'A' | 'B'; min: [number, number, number]; max: [number, number, number]; botPlant: [number, number, number] }
export const MV_SITES: readonly BombSite[] = [
  { id: 'A', min: [-38, 0, -50], max: [-22, 4, -34], botPlant: [-29, 0, -41] },
  { id: 'B', min: [38, 1.5, 14], max: [54, 5.5, 28], botPlant: [47, 1.5, 22] },
];

// ───────────────────────── nama area (radar) & permukaan
export function mvZoneName(x: number, y: number, z: number): string {
  if (y >= 5.5) {
    if (x >= 19 && z >= -8) return 'Balkon B';
    if (x >= 51 && z < -8) return 'Tangga Biru';
    if (x < -12 && z > 40) return 'Tangga Utara';
    return 'Mid Atas';
  }
  if (x <= -31 && z >= 35) return 'Spawn Merah';
  if (x <= -51) return 'West Long';
  if (z >= 41 && x < -12) return 'Tangga Utara';
  if (x < -13 && z >= -9 && z <= 5) return 'Mid-West';
  if (x < -13 && z <= -23) return 'Site A';
  if (x >= 27 && z <= -35) return 'Spawn Biru';
  if (z <= -35 && x >= -13) return 'South Connector';
  if (x >= 31 && x <= 45 && z < -8) return 'Terowongan B';
  if (x >= 51 && z < -8) return 'Tangga Biru';
  if (x >= 19) return 'Site B';
  return 'Mid';
}

const STYLE_SURF: Partial<Record<Style, SurfaceMaterial>> = {
  m_vault: 'metal', m_vdoor: 'metal', m_deposit: 'metal', m_crateG: 'metal', m_cctv: 'metal',
  m_crateR: 'wood', m_crateB: 'wood', m_desk: 'wood', m_barr: 'wood', m_barrB: 'metal',
  m_case: 'glass', m_slab: 'carpet', m_stage: 'carpet', m_plat: 'carpet',
};
const FLOORISH = new Set<Style>(['m_ground', 'm_ceil']);
const OBJECTS = MV_BOXES.filter(b => !FLOORISH.has(b.style));
const STAIR_FRAMES = MV_STAIRS.map(s => ({ s, f: stairFrame(s) }));
/** Tangga marmer (bukan karpet). */
const MARBLE_STAIRS = new Set(['RAMP_RED_NORTH', 'RAMP_BLUE_B_UP']);

/** Permukaan di titik: benda yang disentuh (≤ 0.05 u) → materialnya; atas pelat/platform/panggung → karpet; tangga karpet biru
 *  (Mid, panggung, kembar) / marmer (Tangga Utara & Biru); lantai dasar marmer catur → tegel. */
export function mvSurfaceAt(x: number, y: number, z: number): SurfaceMaterial {
  for (const b of OBJECTS) {
    if (y < b.min[1] - 0.05 || y > b.max[1] + 0.05 || distToBoxXZ(b, x, z) > 0.05) continue;
    return STYLE_SURF[b.style] ?? 'tile';
  }
  for (const { s, f } of STAIR_FRAMES) {
    if (x < f.x[0] - 0.05 || x > f.x[1] + 0.05 || z < f.z[0] - 0.05 || z > f.z[1] + 0.05) continue;
    if (Math.abs(y - stairHeightAt(f, x, z)) < 0.6) return MARBLE_STAIRS.has(s.id) ? 'tile' : 'carpet';
  }
  return 'tile';
}

// ───────────────────────── latihan, kamera menu, probe pantulan
/** Mode Latihan: dummy tim Merah di semua zona & elevasi; pemain (Biru) mulai di Spawn Biru. */
export const MV_PRACTICE: [number, number, number, boolean][] = [
  [-62, 0, -20, false], [-66, 0, 8, false], [-34, 0, -36, false], [-46, 0, -61.5, false], [2, 0, -28, false], [2, 3, -4, false],
  [2, 6.5, 48, false], [28, 6.5, 50, false], [34, 0, 2, false], [49, 1.5, 22, false], [6, 0, -44, true], [38, 0, -20, true],
];
/** Kamera menu: orbit di udara Atrium B memandang panggung bom. */
export const MV_MENU_CAM: { look: [number, number, number]; rx: number; rz: number; y: number } = { look: [46, 3, 22], rx: 16, rz: 18, y: 9.5 };
/** CubeCamera pantulan: udara Atrium B di atas panggung. */
export const MV_ENV_PROBE: [number, number, number] = [46, 9.5, 18];

// ───────────────────────── cahaya (bake & visual)
/** 14 skylight plafon global 8 × 8 (dokumen 12; denah x2 → West Long +2 di ujung): West Long 5, Mid 3, Atrium B 6 — pusat x, z, ukuran. */
export const MV_SKYLIGHTS: { x: number; z: number; size: number }[] = [
  { x: -62, z: -48, size: 8 }, { x: -62, z: -36, size: 8 }, { x: -62, z: -10, size: 8 }, { x: -62, z: 18, size: 8 }, { x: -62, z: 30, size: 8 },
  { x: 2, z: -26, size: 8 }, { x: 2, z: 0, size: 8 }, { x: 2, z: 38, size: 8 },
  { x: 39, z: 2, size: 8 }, { x: 53, z: 2, size: 8 }, { x: 39, z: 20, size: 8 }, { x: 53, z: 20, size: 8 },
  { x: 39, z: 38, size: 8 }, { x: 53, z: 38, size: 8 },
];
/** Jendela melengkung dinding Barat West Long, 10 buah tiap 8 u (bake: sumber langit + titik jatuh matahari; visual: kusen & kaca). */
export const MV_WINDOWS: { x: number; z: number; y: readonly [number, number]; width: number; v: number }[] =
  [-44, -36, -28, -20, -12, -4, 4, 12, 20, 28].map(z => ({ x: -72, z, y: [1.4, 10.6] as const, width: 5, v: 0.85 }));
/** Lampu plafon (balok emisif; juga sumber bake): [x, y bawah plafon, z, lebar X, panjang Z]. */
export const MV_LAMPS: [number, number, number, number, number][] = [
  // Spawn Merah (plafon 12)
  [-64, 11.9, 42, 1.8, 5], [-52, 11.9, 42, 1.8, 5], [-40, 11.9, 42, 1.8, 5], [-64, 11.9, 56, 1.8, 5], [-52, 11.9, 56, 1.8, 5], [-40, 11.9, 56, 1.8, 5],
  // Spawn Biru (11): ruang slot & lobi
  [38, 10.9, -56, 5, 1.8], [50, 10.9, -59, 5, 1.8], [62, 10.9, -56, 5, 1.8], [40, 10.9, -41, 5, 1.8], [52, 10.9, -41, 5, 1.8], [64, 10.9, -41, 5, 1.8],
  // Site A (10): 4 × 4 di sel plafon kaset
  [-44, 9.9, -58, 1.6, 1.6], [-36, 9.9, -58, 1.6, 1.6], [-28, 9.9, -58, 1.6, 1.6], [-20, 9.9, -58, 1.6, 1.6],
  [-44, 9.9, -50, 1.6, 1.6], [-36, 9.9, -50, 1.6, 1.6], [-28, 9.9, -50, 1.6, 1.6], [-20, 9.9, -50, 1.6, 1.6],
  [-44, 9.9, -42, 1.6, 1.6], [-36, 9.9, -42, 1.6, 1.6], [-28, 9.9, -42, 1.6, 1.6], [-20, 9.9, -42, 1.6, 1.6],
  [-44, 9.9, -34, 1.6, 1.6], [-36, 9.9, -34, 1.6, 1.6], [-28, 9.9, -34, 1.6, 1.6], [-20, 9.9, -34, 1.6, 1.6],
  // South Connector & Mid-West (9), terowongan B (8)
  [-4, 8.9, -44, 5, 1.4], [8, 8.9, -44, 5, 1.4], [20, 8.9, -44, 5, 1.4],
  [-44, 8.9, -2, 5, 1.4], [-34, 8.9, -2, 5, 1.4], [-22, 8.9, -2, 5, 1.4],
  [38, 7.9, -28, 1.4, 5], [38, 7.9, -20, 1.4, 5], [38, 7.9, -12, 1.4, 5],
  // lampu gantung ruang tinggi (Y 15.9): West Long, Mid, Atrium B, Tangga Utara & Biru
  [-62, 15.9, -24, 2, 2], [-62, 15.9, 4, 2, 2],
  [2, 15.9, -14, 2, 2], [2, 15.9, 18, 2, 2], [2, 15.9, 50, 2, 2], [-6, 15.9, 30, 2, 2],
  [46, 15.9, 10, 2.5, 2.5], [46, 15.9, 30, 2.5, 2.5], [26, 15.9, 26, 2, 2], [66, 15.9, 26, 2, 2], [46, 15.9, 50, 2, 2], [26, 15.9, 50, 2, 2],
  [66, 15.9, 50, 2, 2], [-22, 15.9, 48, 2, 2], [60, 15.9, -22, 2, 2],
];

// ───────────────────────── benda dinamis (laptop, tumbler, kursi — tidur sampai kena peluru/ledakan)
export const MV_PROP_ITEMS: PropItem[] = (() => {
  const out: PropItem[] = [];
  const row = (id: string) => { const r = ROWS.find(q => q[0] === id); if (!r) throw new Error(`prop: balok ${id}`); return r; };
  let seed = 23;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const put = (id: string, kind: PropKind, fx: number, fz: number, tint?: number, onFloor = false) => {
    const r = row(id), x = r[3] + (r[4] - r[3]) * fx, z = r[7] + (r[8] - r[7]) * fz, base = onFloor ? r[5] : r[6];
    let yaw: number;
    if (kind === 'chair') yaw = Math.atan2((r[3] + r[4]) / 2 - x, (r[7] + r[8]) / 2 - z);
    else yaw = Math.floor(rnd() * 4) * Math.PI / 2 + (rnd() - 0.5) * 0.5;
    out.push({ kind, x, y: base + PROP_SIZE[kind][1] / 2 + 0.01, z, yaw, tint });
  };
  const cups = [0xf2efe8, 0x2b2e33, 0xb03a2e, 0x2f6fb0, 0xd9b45a];
  const cup = (id: string, fx: number, fz: number) => put(id, 'cup', fx, fz, cups[Math.floor(rnd() * cups.length)]);
  const NAVY = 0x283246, BLACK = 0x2b2d31;
  // Spawn Biru: meja komando CCTV
  put('BS_DESK', 'laptop', 0.2, 0.5); put('BS_DESK', 'laptop', 0.5, 0.3); put('BS_DESK', 'laptop', 0.8, 0.55);
  cup('BS_DESK', 0.35, 0.75); cup('BS_DESK', 0.65, 0.7);
  for (const fx of [0.25, 0.75]) { put('BS_DESK', 'chair', fx, -0.35, NAVY, true); put('BS_DESK', 'chair', fx, 1.35, NAVY, true); }
  // Site A: konter keamanan
  put('A_DESK_C', 'laptop', 0.3, 0.5); put('A_DESK_C', 'laptop', 0.7, 0.45); cup('A_DESK_C', 0.5, 0.7);
  put('A_DESK_C', 'chair', 0.3, 1.45, BLACK, true); put('A_DESK_C', 'chair', 0.7, 1.45, BLACK, true);
  // Spawn Merah: meja briefing
  put('RS_TABLE', 'laptop', 0.5, 0.3); cup('RS_TABLE', 0.4, 0.6); cup('RS_TABLE', 0.6, 0.8);
  put('RS_TABLE', 'chair', 1.45, 0.3, BLACK, true); put('RS_TABLE', 'chair', 1.45, 0.75, BLACK, true);
  // West Long & Atrium B: kios / konter teller
  put('WL_KIOSK_N', 'laptop', 0.5, 0.5); cup('WL_KIOSK_N', 0.3, 0.25); cup('WL_BARR_S', 0.5, 0.5);
  put('B_TELLER', 'laptop', 0.35, 0.5); cup('B_TELLER', 0.75, 0.5);
  return out;
})();
