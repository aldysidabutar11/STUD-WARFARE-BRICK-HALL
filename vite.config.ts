import { defineConfig } from 'vite';

export default defineConfig({
  server: { port: 5173, open: false },
  // rapier3d-compat menanam WASM sebagai base64 → satu chunk besar (±5 MB) adalah normal
  build: { target: 'es2022', chunkSizeWarningLimit: 6500 },
});
