// src/world/propKinds.ts — jenis benda kantor dinamis (modul daun tanpa three.js/Rapier: dipakai data map & Props).
/** Benda kantor (Boston). Posisi = pusat collider (dunia), yaw = putaran Y, tint = warna instance (× warna verteks bagian). */
export type PropKind = 'laptop' | 'cup' | 'chair';
export interface PropItem { kind: PropKind; x: number; y: number; z: number; yaw: number; tint?: number }
/** Ukuran collider per jenis (u; dokumen: laptop 0.9×0.6×0.7, tumbler 0.25×0.5×0.25, kursi 1.2×2.0×1.2). */
export const PROP_SIZE: Record<PropKind, [number, number, number]> = { laptop: [0.9, 0.6, 0.7], cup: [0.25, 0.5, 0.25], chair: [1.2, 2.0, 1.2] };
