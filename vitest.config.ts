import { defineConfig } from 'vitest/config';

export default defineConfig({
  // css.include: impor `hud.css?raw` di test mengembalikan isi file (bawaan Vitest: CSS diganti string kosong) — tests/fonts.test.ts
  test: { include: ['tests/**/*.test.ts'], environment: 'node', css: { include: [/hud\.css/] } },
});
