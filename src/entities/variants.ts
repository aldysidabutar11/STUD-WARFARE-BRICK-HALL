// src/entities/variants.ts — varian tampilan karakter (modul daun tanpa three.js: dipakai juga oleh logika room/jaringan).
//   'm' pria · 'f' wanita · 'v' Venny = karakter khusus desain pengguna (Karakter/ROBLOX-VENNY-*-TIM (KHUSUS).png).
//   10 karakter operator desain pengguna (Karakter/<NAMA>.png, permintaan 2026-11-27): warna desain tetap sama di kedua tim, tim
//   ditandai ban lengan warna tim (entities/skins/). Venny & operator hanya dipilih pemain sendiri di Loadout; bot tetap campuran
//   pria/wanita berpakaian tim klasik (botVariant) — keputusan pengguna.
export const SKIN_IDS = ['pharaoh', 'frost', 'ignis', 'ghost09', 'nova', 'spectre', 'titan', 'valkyrie', 'valiant', 'reaper'] as const;
export type SkinId = typeof SKIN_IDS[number];
export type Variant = 'm' | 'f' | 'v' | SkinId;

export const VARIANTS: readonly Variant[] = ['m', 'f', 'v', ...SKIN_IDS];

/** Nama tampilan karakter operator (Loadout, room). */
export const SKIN_NAME: Record<SkinId, string> = {
  pharaoh: 'Pharaoh', frost: 'Frost', ignis: 'Ignis', ghost09: 'Ghost-09', nova: 'Nova', spectre: 'Spectre', titan: 'Titan',
  valkyrie: 'Valkyrie', valiant: 'Valiant', reaper: 'Reaper',
};

export const isVariant = (v: unknown): v is Variant => typeof v === 'string' && (VARIANTS as readonly string[]).includes(v);

/** Karakter operator (bukan pakaian tim klasik / Venny). */
export const isSkin = (v: unknown): v is SkinId => typeof v === 'string' && (SKIN_IDS as readonly string[]).includes(v);

/** Varian dari data luar (settings, pesan jaringan, cadangan pindah host): tak dikenal → pria. */
export const cleanVariant = (v: unknown): Variant => (isVariant(v) ? v : 'm');
