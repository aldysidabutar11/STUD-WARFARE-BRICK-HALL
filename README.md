# Stud Warfare: Brick Hall

Shooter hybrid FPS/TPS bergaya blocky klasik — TypeScript + Vite + Three.js + Rapier3D + Web Audio (100% prosedural, tanpa file aset).
Spesifikasi: GDD v2.0 (dokumen privat, tidak disertakan di repo ini). Catatan implementasi & keputusan: `CLAUDE.md`.

## Menjalankan

```bash
npm install
npm run dev        # buka http://localhost:5173
```

Klik **Main** → pilih mode → **Mulai**, lalu klik layar untuk mengunci mouse. Untuk performa terbaik di laptop Iris Xe: colok charger,
Power mode = Best performance, Chrome/Edge terbaru dengan hardware acceleration (cek `chrome://gpu` → WebGL2 *Hardware accelerated*).
Bila masih berat: Pengaturan → Grafik → preset LOW atau Skala resolusi 70–85%. Di layar 90/120/144 Hz, F3 menampilkan % frame
tepat waktu; bila preset berat tidak stabil di refresh penuh, pilih **Batas FPS ½ layar** (frame rata) — resolusi otomatis menyesuaikan.

| Perintah | Fungsi |
| :--- | :--- |
| `npm run test` | Test vector GDD §16.1 + validator map/nav + logika fitur (rebind, settings, Eliminasi, medali, slot senjata & pisau) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run build` / `npm run preview` | Build produksi & pratinjau |

## Mode

- **Team Deathmatch** — 5v5 vs bot, respawn 4 s; target kill 25/50/75/100 & batas waktu 5–20 menit (default GDD: 50 kill / 10:00).
- **Eliminasi** — tanpa respawn dalam ronde 2:00; yang mati menonton rekan (klik kiri/Spasi ganti rekan); menang 3/4/5/7 ronde.
- **Latihan Menembak** — 12 dummy (jembatan 10/40/70 u, lantai dasar, mezanin, 2 target bergerak), amunisi & granat tak terbatas, angka damage.

## Map: Brick Hall (v2)

Perpustakaan dua lantai 60 × 100 u: jembatan kembar di lantai 2, rotunda bertiang dengan menara jam di tengah, tangga 35° di keempat sudut.

- **Spawn di dua lantai** — tiap tim punya ruang spawn atas (lantai 2) dan ruang spawn bawah (lantai 1). Setiap respawn memilih
  lantai secara acak, lalu slot yang paling jauh dari musuh yang bisa melihatnya (pindah ke lantai lain bila semua slot terisi).
- **Kantong & jalur** — arsip di bawah balkon (lemari zig-zag, pintu ke aula), rak tinggi 2 lantai di tengah & tiap kuadran, lemari katalog
  di rotunda yang memotong garis tembak sepanjang jembatan, dinding depan markas dengan dua pintu + jendela intip.
- **Identitas & orientasi** — sisi Selatan biru / Utara merah (panel, karpet, spanduk, lentera), ikon di puncak rak tinggi
  (Bola Dunia, Teleskop, Ksatria, Jam Pasir), dan nama area di bawah radar (mis. *Jembatan Barat · Biru*, *Arsip Timur · Merah*, *Aula Ksatria*).

## Grafik

Gaya blocky tetap, tapi pencahayaan & material dibuat realistis (semua prosedural, tanpa file gambar):
tone mapping ala film, cahaya skylight & jendela yang "dipanggang" (sudut & kolong rak gelap alami, cahaya pantul hangat),
kabut tipis, material PBR dengan stud/nat/serat timbul (normal map prosedural), pantulan lantai & logam, berkas cahaya + debu melayang,
kepulan debu saat peluru kena permukaan. Preset: **LOW** · **MEDIUM** (laptop Iris Xe, 60 fps) · **HIGH** (+ bloom, grading, kilat
moncong) · **ULTRA** (+ SSAO, MSAA, bayangan 4096 — untuk GPU kuat). Tiap efek bisa dimatikan di Pengaturan → Grafik.

## Kontrol utama (bisa diubah di menu Kontrol)

WASD gerak · Shift sprint · C jongkok · Space lompat · Klik kiri tembak / tebas pisau / masak granat → lempar jauh ·
Klik kanan ADS / tusuk pisau / masak granat → gelinding · **1 senjata utama · 2 pisau · 3 granat K-400 · Q senjata sebelumnya** · scroll ganti senjata ·
G buang senjata utama · E ambil/tukar senjata tim · R reload · F pukul (melee) · B mode tembak · V FPS/TPS · X tukar bahu · Tab skor · L loadout ·
Esc pause · F3 statistik · ` debug.

**Gamepad** (layout standar): stik kiri/kanan gerak/bidik · RT/LT tembak/ADS (pisau: tebas/tusuk) · A lompat · B jongkok · X reload (dekat senjata tim:
ambil/tukar) · Y senjata sebelumnya · RB granat · LB mode tembak · L3 sprint · R3 pukul · D-pad ↑ FPS/TPS · → tukar bahu · ↓ pisau · ← loadout ·
View skor · Menu pause. Menu bisa dinavigasi dengan D-pad + A/B.

Setelan tombol lama (sebelum ada slot pisau) dimigrasi otomatis: Q pindah ke "senjata sebelumnya", tukar bahu ke X, granat ke 3, G jadi buang senjata.

## Senjata

- **Slot 1 — senjata utama** (pilihan di Loadout), **slot 2 — pisau**, **slot 3 — granat K-400** (1 per nyawa). **Q** kembali ke senjata sebelumnya.
- **Pisau**: klik kiri tebas (45, dari belakang 90, tiap 0.45 s), klik kanan tusuk (70, dari belakang 100 = langsung mati, tiap 1.0 s);
  lari 10% lebih cepat selama memegang pisau, tapi kembali ke senapan butuh 0.55 s.
- **Buang & ambil**: **G** membuang senjata utama ke lantai (isi magazine & optik ikut). Hanya **tim sendiri** yang bisa mengambil atau
  menukarnya (**E**); musuh tidak bisa. Senjata yang dibuang hilang setelah 60 s; respawn selalu kembali ke senjata pilihan Loadout.

## Fitur HUD & umpan balik

Radar berputar (musuh muncul saat menembak/terlihat), nama rekan di atas kepala + nama musuh saat dibidik, killcam (replay ±3 s dari mata
pembunuh, bisa dilewati) + kartu "Dibunuh oleh", medali multi-kill/streak/first blood, popup skor & assist, indikator granat di dekatmu,
kilat merah saat terkena, detak jantung saat HP < 30, prompt reload, kecerahan, skala resolusi, guncangan kamera.

**Crosshair kustom** (Pengaturan → Crosshair, dengan pratinjau langsung): 5 bentuk (Klasik +, Klasik + titik, Titik, Lingkaran, T),
3 perilaku (Statis, Dinamis — melebar saat bergerak/lompat/menembak, Hybrid — garis dalam tetap, garis luar mengembang),
warna bebas + transparansi, outline (tebal & kepekatan), ukuran garis/celah/titik/lingkaran, pengali dinamis, dan 6 preset.

## Karakter

Tim **Biru** = pasukan taktis (helm, goggles oranye, rompi, pelindung), tim **Merah** = gerilyawan (topi loreng, kacamata hitam,
bandana, sabuk peluru, jins sobek); masing-masing pria & wanita — semuanya prosedural (acuan desain di folder `Karakter/`).
Pilih karakter kamu di **Loadout → Karakter: Pria / Wanita**.

## Rasa gerak

Tempo gerak 1.35× (jalan 8.1, sprint 11.5 u/s; lompat tetap setinggi 1.38 u tapi tidak melayang), ayunan kepala sinkron langkah,
kamera miring saat strafe, FOV melebar saat sprint, hentakan saat mendarat, senjata berinersia, dan animasi karakter yang halus
(kaki mengikuti arah gerak). Kurangi/matikan lewat Pengaturan → *Gerak kamera & senjata*. Untuk menyetel langsung saat main:
panel debug `` ` `` → **RASA GERAK** (slider uji coba, tidak disimpan).
