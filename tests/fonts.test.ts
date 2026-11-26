// tests/fonts.test.ts — tipografi FPS: font SISTEM saja (aturan "tanpa file aset" + CSP font-src 'self' data:), CSS & kanvas sama.
import { describe, expect, it } from 'vitest';
import CSS from '../src/ui/hud.css?raw';
import { DISPLAY_FONT, UI_FONT, canvasFont } from '../src/ui/fonts';

const cssVar = (name: string) => (new RegExp(`--${name}:\\s*([^;]+);`).exec(CSS)?.[1] ?? '').trim();

describe('tipografi UI', () => {
  it('variabel CSS --font-ui / --font-display = konstanta TS (kanvas radar, kartu map, angka damage memakai yang sama)', () => {
    expect(cssVar('font-ui')).toBe(UI_FONT);
    expect(cssVar('font-display')).toBe(DISPLAY_FONT);
  });
  it('font sistem saja: tanpa @font-face / url() font / Google Fonts; Bahnschrift dulu, generik sans-serif terakhir', () => {
    expect(CSS).not.toMatch(/@font-face|fonts\.googleapis|fonts\.gstatic|\.woff2?|\.ttf|\.otf/);
    for (const f of [UI_FONT, DISPLAY_FONT]) {
      expect(f.startsWith('Bahnschrift')).toBe(true);
      expect(f.endsWith('sans-serif')).toBe(true);
    }
    expect(CSS).not.toMatch(/'Segoe UI', sans-serif|font: 700 12px\/1\.3 'Segoe UI'/);   // sisa font lama di radar
  });
  it('shorthand font kanvas: berat + condensed + ukuran bulat + keluarga display', () => {
    expect(canvasFont(12.4)).toBe(`700 condensed 12px ${DISPLAY_FONT}`);
    expect(canvasFont(40, 900)).toMatch(/^900 condensed 40px Bahnschrift/);
  });
});
