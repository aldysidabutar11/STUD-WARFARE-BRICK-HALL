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
| `npm run test` | Test vector GDD §16.1 + validator map/nav + logika fitur (rebind, settings, Eliminasi, medali, slot senjata & pisau, room & jaringan) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run build` / `npm run preview` | Build produksi & pratinjau |

## Mode

- **Team Deathmatch** — 5v5 vs bot, respawn 4 s; target kill 25/50/75/100 & batas waktu 5–20 menit (default GDD: 50 kill / 10:00).
- **Eliminasi** — tanpa respawn dalam ronde 2:00; yang mati menonton rekan (klik kiri/Spasi ganti rekan); menang 3/4/5/7 ronde.
- **Main Bareng (Room)** — main online dengan teman: buat room (kode + link), 2 tim × 5 slot, slot kosong diisi bot, pindah tim,
  siap, setelan host (TDM / Eliminasi). Lihat **Main Bareng online** di bawah.
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

## Main Bareng online

**Cara kerjanya (100% gratis, tanpa server game sewaan):** browser pembuat room (**host**) menjalankan match — simulasi, bot, damage, skor.
Teman tersambung langsung ke host lewat **WebRTC** (P2P, kanal *unreliable* seperti UDP). Server pihak ketiga hanya dipakai untuk
"perkenalan" (tukar kode room & alamat koneksi, ±puluhan pesan per pemain): **Supabase Realtime** (paket gratis, tanpa kartu kredit).
File game di-host gratis di **Vercel** (atau hosting statis lain).

- Gerak & tembakanmu **diprediksi** di perangkatmu (respons instan), lalu dicocokkan dengan host. Pemain lain digambar sedikit di
  belakang agar mulus: jedanya **adaptif** (±50–75 ms di jaringan bagus, naik otomatis bila koneksi goyang/paket hilang); host
  mengirim posisi 30×/detik. Host me-**rewind hitbox** ke apa yang kamu lihat saat menembak (lag compensation, maks 250 ms).
- **Hitmarker & suara kena instan** dari tembakan/pisau sendiri; damage & kill tetap ditentukan host (tanpa tampil dobel).
- **Ping** tiap teman tampil di room & papan skor (Tab): hijau < 80 ms, kuning < 150 ms, merah ≥ 150 ms + peringatan di layar.
  Upload host tersumbat → teman itu otomatis menerima 15×/detik sampai lancar lagi. F3 menampilkan ping, jeda interpolasi & koreksi.
- Host sebaiknya pemain dengan koneksi & laptop paling kuat (upload ±1.2–2.5 Mbps untuk 9 teman). Host jangan menutup tab selama main;
  pindah tab/aplikasi tetap aman (simulasi tetap jalan di latar belakang).
- Teman keluar di tengah match → slotnya diambil alih bot. Host keluar → match berakhir, semua kembali ke room.
- Belum tersedia saat online: buang/ambil senjata (G/E), mode Latihan.

### Coba tanpa akun apa pun (uji lokal)

`npm run dev` → buka dua tab/jendela `http://localhost:5173` → tab 1: **Main Bareng → Buat Room** → tab 2: **Gabung** dengan kodenya.
Tanpa Supabase, room hanya terlihat dari tab lain di browser yang sama. Uji jaringan buruk: tambahkan `?netlag=60&netjitter=15&netloss=2`
di URL kedua tab (ping ±120 ms, 2% paket hilang).

### Pasang online (sekali saja, ±10 menit)

1. **Supabase** — daftar di supabase.com (gratis) → *New project* (region terdekat, mis. Singapore) → tombol **Connect** (atau
   *Settings → API Keys*): salin **Project URL** dan **publishable key** (`sb_publishable_…`; kunci *anon* lama juga bisa). Tidak perlu
   membuat tabel apa pun; pastikan *Realtime → Settings → Allow public access* menyala (kanal room memakai kanal publik).
2. **Lokal (opsional)** — salin `.env.example` jadi `.env.local`, isi `VITE_SUPABASE_URL` & `VITE_SUPABASE_ANON_KEY`, jalankan ulang `npm run dev`.
3. **Vercel** — daftar di vercel.com dengan akun GitHub (paket Hobby, gratis) → *Add New → Project* → pilih repo ini (framework: Vite,
   otomatis) → *Environment Variables*: isi dua variabel di atas → **Deploy**. Bagikan link `https://<nama>.vercel.app`; tombol
   **Salin Link** di room membuat link langsung ke room (`…/?room=KODE`).
4. **TURN (opsional)** — bila ada teman yang selalu gagal tersambung ("koneksi tidak tersambung"), biasanya karena NAT ketat
   (jaringan kampus/kantor/sebagian operator seluler). Isi `VITE_TURN_URL`, `VITE_TURN_USERNAME`, `VITE_TURN_CREDENTIAL` dari layanan
   TURN yang punya kuota gratis, lalu deploy ulang.

Catatan paket gratis Supabase: project yang tidak dipakai ±1 minggu bisa dijeda otomatis — buka dashboard Supabase dan klik *Restore*
bila room tiba-tiba tidak bisa dibuat/ditemukan.

