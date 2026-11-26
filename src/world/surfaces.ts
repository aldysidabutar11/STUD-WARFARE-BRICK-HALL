// src/world/surfaces.ts — daftar material permukaan (urutan = kode jaringan, JANGAN diubah urutannya) + warna serpih/kepulan
// tumbukan peluru. Dipakai Ballistics (lokal/host) dan NetMatch (klien) agar efeknya sama.
import type { SurfaceMaterial } from '../core/EventBus';

/** Kode jaringan material: indeks di daftar ini (paket tembakan u8, pantulan granat 3 bit). Tambah HANYA di akhir. */
export const SURFACES: readonly SurfaceMaterial[] = ['tile', 'carpet', 'wood', 'sand', 'metal', 'glass'];

/** Warna serpih & kepulan debu saat peluru mengenai permukaan. */
export const SURFACE_COLOR: Readonly<Record<SurfaceMaterial, number>> = {
  tile: 0x9a9a9a, carpet: 0x1f3a73, wood: 0x7c5c46, sand: 0xb59a6e, metal: 0x7d8288, glass: 0xd6e8f0,
};

/** Kode material (0 = tile bila tidak dikenal). */
export const surfaceCode = (m: SurfaceMaterial): number => Math.max(0, SURFACES.indexOf(m));
/** Material dari kode (tile bila di luar rentang). */
export const surfaceOf = (code: number): SurfaceMaterial => SURFACES[code] ?? 'tile';
