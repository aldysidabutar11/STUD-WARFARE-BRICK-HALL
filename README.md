# Stud Warfare: Brick Hall

Shooter hybrid FPS/TPS bergaya blocky klasik — TypeScript + Vite + Three.js + Rapier3D + Web Audio (100% prosedural, tanpa file aset).
Spesifikasi: `Stud_Warfare_Brick_Hall_GDD_v2.pdf` (GDD v2.0). Catatan implementasi & keputusan: `CLAUDE.md`.

## Menjalankan

```bash
npm install
npm run dev        # buka http://localhost:5173
```

Klik **Main (TDM 5v5)**, lalu klik layar untuk mengunci mouse. Untuk performa terbaik di laptop Iris Xe: colok charger,
Power mode = Best performance, Chrome/Edge terbaru dengan hardware acceleration (cek `chrome://gpu` → WebGL2 *Hardware accelerated*).

| Perintah | Fungsi |
| :--- | :--- |
| `npm run test` | Test vector GDD §16.1 + validator map/nav |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run build` / `npm run preview` | Build produksi & pratinjau |

## Kontrol utama

WASD gerak · Shift sprint · C jongkok · Space lompat · Klik kiri tembak / masak granat → lempar jauh · Klik kanan ADS / masak granat → gelinding ·
R reload · B mode tembak · V FPS/TPS · Q tukar bahu · 1 senjata · G/4 granat · Tab skor · L loadout · Esc pause · F3 statistik · ` debug.
