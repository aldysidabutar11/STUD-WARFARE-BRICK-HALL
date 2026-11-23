# Stud Warfare: Brick Hall — memori proyek untuk Claude Code

## Sumber kebenaran
- Spesifikasi lengkap: Stud_Warfare_Brick_Hall_GDD_v2.pdf (versi teks: stud_warfare_brick_hall_gdd_v2_0.md — hasil konversi, PDF menang bila beda).
- BACA bagian yang disebut di prompt SEBELUM menulis kode.
- Semua angka gameplay hanya di src/config/gameConfig.ts dan src/config/weaponsData.ts (salinan verbatim §15 PDF),
  ditambah src/config/extraConfig.ts untuk angka dari prosa/tabel GDD yang tidak punya key di §15.
- Jangan mengubah nilai desain dari GDD tanpa persetujuan. Bila menemukan inkonsistensi, laporkan dulu.

## Perintah
- npm run dev        # dev server Vite (http://localhost:5173)
- npm run build      # typecheck + build produksi
- npm run test       # vitest (test vector GDD §16.1)
- npm run typecheck  # tsc --noEmit

## Konvensi WAJIB
- Three.js right-handed, Y-up. Depan karakter = -Z lokal, kanan = +X. Biru di Z negatif, Merah di Z positif.
- yaw = 0 menghadap -Z; forward = (-sin yaw, 0, -cos yaw); Euler kamera 'YXZ'; rotation.x positif = ayun ke depan.
- Satuan: 1 unit = 1 stud (~0.36 m); waktu dalam detik; sudut di config dalam derajat (degToRad di kode).
- Damage: Math.round(base * hitbox * falloff) dengan urutan perkalian tersebut.
- 100% prosedural: tidak ada file gambar/audio/model eksternal.
- Hot loop (fixedUpdate/update) tanpa alokasi objek baru bila memungkinkan: reuse Vector3/Quaternion sementara dan pool.
- Cek signature API Three.js/Rapier di node_modules/**/*.d.ts sebelum memakainya.
- localStorage hanya untuk settings (key: studwarfare.settings.v1).

## Keputusan implementasi (menyimpang minimal dari teks PDF, dengan alasan)
- Layout map Brick Hall = layout ORISINAL (bukan replika map game lain): aturan §4 tetap dipakai
  (ukuran, lantai 0/10, ruang spawn, tangga 35°, aturan tinggi cover, rak 7-bagian + 144 buku, material, lampu),
  tetapi tengah map = jembatan kembar + rotunda bertiang dengan menara katalog. Graf nav dibuat ulang untuk layout ini.
- Dinding luar Utara/Selatan ditambahkan (manifest PDF hanya punya Barat/Timur; gambar 4.1/4.2 menggambarnya).
- Kode recoil §7.2 memakai CFG.combat.recoil.* (bentuk di §15.2 — §15 menang).
- KCC: integrasi vertikal parabola eksak (y += v·dt + ½·g·dt²) agar lulus test vector puncak lompat 1.383 ± 0.05;
  gaya tempel tanah kecil + proyeksi lereng agar tidak nyangkut dan kecepatan di tangga sesuai §3.4.
- Rapier: world.step() dijalankan sekali setelah membangun map sebelum raycast/validator; setelah teleport/respawn
  panggil world.propagateModifiedBodyPositionsToColliders().
- PCFSoftShadowMap deprecated sejak three r186 → HIGH memakai PCFShadowMap + shadow.radius.
- Warna kaki tim Biru = navy (bukan hijau) agar karakter tidak identik dengan avatar bawaan platform lain.

## Cara kerja per fase
1. Baca bagian GDD yang disebut.
2. Tulis rencana singkat (file dibuat/diubah) dan tunggu persetujuan.
3. Implementasi.
4. Tambah/jalankan test + typecheck sampai hijau.
5. Jelaskan cara verifikasi manual di browser.
6. Jangan menyentuh modul di luar fase aktif.

## Status
- Fase selesai: (diperbarui di akhir setiap fase)
- Catatan teknis penting: lihat "Keputusan implementasi".
