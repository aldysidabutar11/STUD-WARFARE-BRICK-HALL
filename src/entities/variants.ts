// src/entities/variants.ts — varian tampilan karakter (modul daun tanpa three.js: dipakai juga oleh logika room/jaringan).
//   'm' pria · 'f' wanita · 'v' Venny = karakter khusus desain pengguna (Karakter/ROBLOX-VENNY-*-TIM (KHUSUS).png).
//   Venny hanya dipilih pemain sendiri di Loadout; bot tetap campuran pria/wanita (botVariant).
export type Variant = 'm' | 'f' | 'v';

export const VARIANTS: readonly Variant[] = ['m', 'f', 'v'];

export const isVariant = (v: unknown): v is Variant => v === 'm' || v === 'f' || v === 'v';

/** Varian dari data luar (settings, pesan jaringan, cadangan pindah host): tak dikenal → pria. */
export const cleanVariant = (v: unknown): Variant => (isVariant(v) ? v : 'm');
