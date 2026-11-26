// src/ui/fonts.ts — tipografi UI bergaya game FPS (permintaan pengguna 2026-11-27: "font UI seperti game FPS, gaming banget").
// FONT SISTEM saja (aturan "100% prosedural — tanpa file aset"; CSP font-src 'self' data:): Bahnschrift = DIN bawaan Windows 10/11
// dengan sumbu lebar variabel (condensed / semi-condensed), DIN / Avenir Next Condensed (macOS), Roboto Condensed (Android/ChromeOS
// lewat alias 'sans-serif-condensed'), lalu font sempit umum. Nilai SAMA dengan --font-ui / --font-display di hud.css (dijaga test).

/** Teks UI umum (paragraf, isian, daftar) — dipakai dengan font-stretch semi-condensed. */
export const UI_FONT = `Bahnschrift, 'DIN Alternate', 'Avenir Next Condensed', 'Roboto Condensed', 'sans-serif-condensed', 'Arial Narrow', 'Segoe UI', system-ui, sans-serif`;
/** Judul, angka HUD, tombol & label — condensed tebal (kapital di CSS). */
export const DISPLAY_FONT = `Bahnschrift, 'DIN Condensed', 'Avenir Next Condensed', 'Roboto Condensed', 'sans-serif-condensed', 'Arial Narrow', Impact, sans-serif`;

/** Shorthand font kanvas 2D bergaya display: `berat condensed ukuran keluarga` (kata kunci lebar diterima ctx.font). */
export const canvasFont = (px: number, weight = 700): string => `${weight} condensed ${Math.round(px)}px ${DISPLAY_FONT}`;
