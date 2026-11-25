# Stud Warfare: Brick Hall — memori proyek untuk Claude Code

## Sumber kebenaran
- Spesifikasi lengkap: Stud_Warfare_Brick_Hall_GDD_v2.pdf (versi teks: stud_warfare_brick_hall_gdd_v2_0.md — hasil konversi, PDF menang bila beda).
  Keduanya HANYA lokal: di-.gitignore & tidak ikut di repo GitHub publik (github.com/aldysidabutar11/STUD-WARFARE-BRICK-HALL). Begitu juga Karakter/.
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
- Resolusi dinamis §2.3 sadar refresh layar (disetujui pengguna): ambang GDD 17.5/13 ms mengasumsikan layar 60 Hz (di 90 Hz game diam
  di 60–80 FPS dengan judder). Target = vsync × batas FPS; min/max/langkah/jeda 2 s/waktu baik 4 s tetap nilai GDD (lihat "Kehalusan frame").
- Preset ULTRA di luar §15 (CFG.render.presets tetap verbatim): `presetOf()` di src/config/presets.ts; tipe `Preset` dilebarkan jadi interface.
- Tampilan karakter = desain pengguna (Karakter/*.png, HANYA acuan; tidak dimuat game): Biru = pasukan taktis, Merah = gerilyawan,
  masing-masing pria/wanita. Dibangun 100% prosedural di src/entities/CharacterArt.ts (lihat "Fitur pasca-MVP").
- Multi-map (Brick Hall + Steel Yard, lihat "Multi-map & Steel Yard"): modul game membaca data map HANYA lewat `currentMap()`
  (src/world/maps/registry.ts; Physics lewat maps/current.ts agar tidak impor melingkar) — jangan impor data Brick Hall langsung.
  Steel Yard = layout ORISINAL (gaya "halaman kontainer gurun" hanya inspirasi, bukan replika map game lain); peti 2.8 u, bukan 3.0
  dari brief (3.0 jatuh di pita cover terlarang GDD §4.4 2.95–3.75; tumpukan 2 = 5.6).

## Cara kerja per fase
1. Baca bagian GDD yang disebut.
2. Tulis rencana singkat (file dibuat/diubah) dan tunggu persetujuan.
3. Implementasi.
4. Tambah/jalankan test + typecheck sampai hijau.
5. Jelaskan cara verifikasi manual di browser.
6. Jangan menyentuh modul di luar fase aktif.

## Fitur pasca-MVP (atas permintaan pengguna: "perbaiki kekurangan dibanding game FPS lain") — angka baru di XCFG
- GDD §1 menyebut minimap, killcam, mode Elimination, dukungan gamepad sebagai pasca-MVP opsional → kini diimplementasi:
  src/ui/Minimap.ts, src/game/Killcam.ts (rig "ghost" terpisah, rig asli tetap untuk simulasi), MatchManager (tdm/elim/practice),
  src/core/Bindings.ts + Input (rebind tombol, gamepad standar, navigasi menu).
- Tambahan lain (bukan dari GDD, angka di XCFG.melee/elim/practice/killcam/radar/nameplate/announce/pad/heartbeat/landKick):
  melee popor (F, 55 / belakang 100), assist (+50, 10 s), kredit kill untuk korban jatuh ≤ 5 s setelah ditembak, medali multi-kill/streak,
  nama di atas kepala, indikator granat, crosshair kustom (default = GDD), kecerahan, skala resolusi tetap, guncangan kamera,
  mode Latihan (dummy + target bergerak), setelan match (target kill/waktu/ronde), MVP & streak di layar hasil.
- Bug lama yang diperbaiki: fall damage §3.5 tidak pernah diterapkan (onFallDamage tak tersambung); optik senjata dunia pemain
  mengambang di kamera FPS (mesh optik dibuat setelah setLayer(1)); vektor tracer tembakan meleset tertimpa (tmp dipakai ulang).
- Garis bidik ADS (laporan pengguna: "red dot tidak tembus pandang"): kaca red dot/holo dulu balok opaque di geometri optik →
  kini mesh anak terpisah `OPTIC_GLASS_MATERIAL` (bening 0.14, tanpa depthWrite/bayangan) lewat `createOpticMesh()` (viewmodel,
  senjata dunia, killcam). Penyesuaian model §5.4 agar sumbu bidik bersih: gagang angkat QBZ/G36C = tiang terbelah + palang di atas
  garis bidik (dilepas bila optik terpasang), pipa gas AKM & menara sight depan M16A4 di bawah garis bidik besi.
  Dijaga tests/sightline.test.ts (raycast dari mata ADS untuk 10 AR × iron/red dot/holo).
- Rasa gerak (laporan pengguna: "pergerakan karakter terlalu kaku"; disetujui mengubah nilai inti):
  - `CFG.player.moveSpeedScale` = 1.35 dipakai sebagai TEMPO T (src/entities/moveFeel.ts): kecepatan ×T, gravitasi KARAKTER
    −22·T² (≈ −40), lompat 7.8·T, akselerasi udara 12·T², airMinSpeedCap ×T. Akibatnya lintasan lompat/jatuh di RUANG identik
    dengan GDD (puncak 1.383, lewat pagar 1.2, mendarat di rak A/B, tinggi jatuh & fall damage sama), hanya waktunya ÷T
    (udara 0.71 → 0.53 s). Terverifikasi: test + manuver drop rak A di engine (titik mendarat T=1 vs T=1.35 beda 0.1 u).
    Gravitasi dunia (granat, buku, debris) tetap −22. Akselerasi darat 80/90 tetap (0→penuh 0.10 s). Test vector §16.1 diuji
    pada tabel dasar (scale 1). Ambang kecepatan drop bot ×T.
  - Lapisan visual (XCFG.feel, semua × pengaturan "Gerak kamera & senjata" = `shake`): kamera — ayunan kepala sinkron langkah,
    miring strafe 1.2°, FOV sprint +6°, pegas mendarat; viewmodel — inersia pegas (strafe/maju), ayun vertikal di udara, pegas
    mendarat, napas saat diam (sangat dikurangi saat ADS); rig — transisi pose halus, kaki menghadap arah gerak (dada dibalik),
    putar di tempat (kaki menyusul bila puntiran > 50°), hentakan pinggul saat mendarat, ayun lengan saat sprint.
  - Langkah kaki kini dari fase kontinu `PlayerController.stepPhase` (bilangan bulat = suara langkah = kamera terendah = kaki
    terbuka penuh); fase berhenti saat diam/di udara.
  - Panel debug (`) → "RASA GERAK": slider tempo/ayunan/miring/FOV sprint/inersia untuk uji langsung (tidak disimpan).
  - Tempo per map (laporan pengguna 2026-11-25: "di Steel Yard lari/jalan terasa lambat/berat, beda banget dengan Brick Hall"):
    terukur kecepatan (jalan 8.1 / sprint 11.48 u/s) & FPS identik, tapi di ruang terbuka pemandangan "mengalir" 27–33% lebih lambat
    pada kecepatan sama (raycast grid layar dari node nav: median 0.71 vs 0.98 rad/s; langit 22% layar, benda < 8 u 32% vs 43%).
    `XCFG.feel.mapTempo` { steelyard: 1.5 } = batas atas rentang uji GDD §3.4 → `moveFeel.mapTempo(id)` dipasang `Game.loadMap`
    (host & klien memuat map yang sama → prediksi cocok; reset panel debug = tempo map). SY kini jalan 9.0 / sprint 12.75 u/s;
    lintasan lompat di ruang tetap (tests/movement.test.ts). Langkah pasir dibuat renyah (bandpass 45 ms + 4 butir kerikil + ketuk
    130 Hz tipis; dulu desis 80 ms + dentum 95 Hz). Online terukur: tempo host = klien (1.5 / 1.35), posisi akhir 0.000 u.
- Tampilan karakter (permintaan pengguna, acuan Karakter/*.png):
  - Biru pria: helm 2 tingkat + rel, goggles oranye, balaclava, headset+mic, baju biru, rompi pelat + 3 kantong magasin + radio + granat,
    pelindung bahu/siku/lutut, sarung tangan (jari kulit), sabuk, celana & sepatu bot hitam, holster paha kanan, kantong kargo kiri.
  - Biru wanita (desain baru pengguna, Karakter/ROBLOX-WANITA-BLUE-TIM.png; `buildBlueFemale`, palet XCFG.rig.colors.blueF): baret marun
    miring + lencana perak (perisai hitam), rambut bob hitam (samping lebih panjang di depan, tepi cutout) + poni samping, wajah (alis,
    eyeliner bersayap, iris cokelat, bibir tersenyum, pipi merona), jaket loreng biru organik (bercak kurva halus) ritsleting V berlis marun
    + kerah ber-pin emas, harness hitam (tali bahu, tali dada bergesper, H di punggung), ujung jaket rajut navy, perut terbuka (pusar + tato
    kecil), kantong bahu (gelap kanan, krem kiri), manset rajut berlis marun, sarung tangan tanpa jari, sabuk taktis (gesper, 2 kantong,
    senter berpita marun, kantong belakang), celana pendek loreng berlis marun, tato mawar di paha (depan + sisi luar kanan), holster paha
    KIRI (tali dari sabuk, panel MOLLE, sarung pistol, 2 tali bergesper), sepatu bot tinggi bertali. Lengan FPS: loreng (tekstur bisa
    diulang `sleeveTexture`, UV lengan diskalakan `tileUV`) + manset navy; `setOutfit(team, variant)` (juga saat killcam).
  - Merah: topi patroli loreng + visor, kacamata aviator (cutout), bandana merah (segitiga cutout + simpul), tank top (pria loreng gelap,
    wanita abu + perut terbuka), sabuk peluru selempang bahu kanan, tato ular lengan kanan, balutan kain, sarung tangan tanpa jari,
    jins sobek, sepatu bot cokelat, holster. Pria: brewok + senyum; wanita: rambut merah-cokelat dikuncir, bibir.
  - Teknik: per (tim, varian) 1 atlas kanvas 1024² (80 px/unit, ±40 ms, disiapkan saat menu idle) + 1 geometri gabungan per bagian
    (balok tubuh + aksesoris) → 7 draw call per karakter (decal wajah lama dihapus). HITBOX tetap balok GDD persis, material
    `visible:false` (tidak digambar, Mesh.raycast tetap menguji); tampilan = mesh anak hitbox. alphaTest 0.5 untuk cutout.
  - Varian: bot campuran (`botVariant`), pemain pilih Pria/Wanita di Loadout (`settings.charVariant`, langsung berlaku). Lengan FPS
    mengikuti kostum tim (`Viewmodel.setOutfit`), killcam & balok mati (DeathFx) memakai geometri/atlas yang sama.
  - Terukur (TDM 15 s, Iris Xe): frame 11.1 ms (tak berubah), draw call rata-rata 103 / maks 117 (≤150), segitiga maks ±35k.
- Aturan Eliminasi: skor tim = ronde dimenangkan (kill tidak menambah skor tim); ronde 2:00, waktu habis → jumlah hidup, lalu total HP.
- Slot senjata + pisau + buang/ambil senjata (permintaan pengguna, disetujui; angka di XCFG.knife / XCFG.drop):
  - Tombol: 1 senjata utama · 2 pisau · 3 granat K-400 · Q senjata sebelumnya · scroll siklus · G buang senjata utama · E ambil/tukar.
    Menyimpang dari GDD: granat G/4 (§8) → 3; tukar bahu Q (§9) → X. Waktu angkat GDD tetap (senapan 0.55 s, granat 0.35 s, setelah
    lempar 0.40 s); pisau 0.30 s. Ganti senjata membatalkan reload sebelum komit (§5.1); tetap terkunci selama memasak granat.
  - Logika murni src/combat/Slots.ts (quickSwitchTarget/cycleTarget/returnSlot/heldOf/canPickUp). WeaponSystem.slot 'ar'|'knife'|'grenade'
    + prevSlot + hasPrimary + equipTotal; granat kembali ke slot sebelumnya (GrenadeInput.toSlot). Setelan tombol bermigrasi
    (Settings.bindsVer, Bindings.migrateBinds v1→v2: hanya tombol yang masih default lama dipindah). Gamepad: Y sebelumnya, D-pad ↓ pisau,
    X = ambil saat dekat senjata tim (menggantikan reload saat itu); buang senjata tidak dipetakan di gamepad.
  - Pisau: Melee.ts jenis 'butt' (F, popor) | 'slash' (45 / belakang 90, 0.45 s) | 'stab' (70 / belakang 100, 1.0 s); jangkauan/kerucut/aturan
    belakang = XCFG.melee. Lari ×1.10 lewat MoveIntent.speedMult (lintasan lompat ±10% lebih jauh; dicek: tidak membuka area baru — celah
    terdekat landing tangga ↔ jembatan 7 u, keduanya sudah tersambung). Killfeed "Pisau", medali "AHLI PISAU". Bot tidak memakai pisau.
  - Tampilan (revisi atas laporan pengguna "pisau jelek, animasi kurang dramatis"): model pisau = profil asli diekstrusi
    (ExtrudeGeometry: bilah clip-point berperut + bevel tajam berkilat, alur bilah, punggung bergerigi, pelindung, gagang karet beralur
    jari, pommel; non-indexed + vertex color, 1 draw call). FPS: kepalan menggenggam gagang (punggung tangan, 4 jari melingkar, jempol),
    posisi tangan + yaw/pitch/roll bilah di-keyframe (src/entities/knifeAnim.ts) agar selalu di layar; lengan bawah direntang tiap frame
    dari pergelangan ke bahu di luar layar. Tebasan: ancang-ancang → sapuan diagonal yang berpuncak di titik kena → ayunan lanjut,
    bergantian kanan→kiri / balik (Entity.slashAlt, reset setelah 1 s). Tusukan: tarik → sodok eksplosif → tahan. Efek: jejak kilatan
    bilah (pita aditif RGBA, sampel ujung/tengah bilah), hentakan kamera berpegas (CameraRig.punch: yaw/pitch/roll + FOV) tepat sebelum
    titik kena + getar ekstra saat kena. TPS: pisau ×1.4, keyframe bahu/dada/pergelangan/pinggul (badan memuntir, condong saat menusuk).
    Rig TPS `setGun` + `setHeld` (mesh pisau & granat dibuat di konstruktor agar ikut setLayer); killcam merekam FHELD/FKNIFE
    (kode −1 / tebas 0..1 / tusuk 2..3 / tebas balik 4..5). Angka tampilan di XCFG.knife (vmScale, tpsScale, trail, punch).
    HUD: bar slot 1/2/3 (tombol mengikuti binds), panel pisau tanpa amunisi, prompt "[E] Ambil/Tukar …", pesan singkat (Hud.toast).
  - Buang/ambil: src/combat/WeaponDrops.ts — Rapier dynamic + CCD, grup DEBRIS (tidak menahan peluru/karakter), keadaan senjata ikut
    (jenis, optik, isi, cadangan, mode). Hanya tim sendiri (`canPickUp`); tukar = senjata sekarang ikut dibuang. Respawn kembali ke loadout
    pilihan (pendingLoadout diisi saat buang/ambil pertama). Maks 6, hilang 60 s, dibersihkan tiap ronde / keluar ke menu.
- Grafik realistis (permintaan pengguna: "lebih realistis, detail, pencahayaan lebih real" — gaya blocky GDD tetap; nilai di XCFG.gfx):
  - Semua preset: tone mapping ACES + eksposur (Engine), kabut FogExp2 tipis, cahaya "dipanggang" saat loading (src/world/LightBake.ts:
    grid okupansi 0.5 u → AO per verteks; medan cahaya langit dari skylight & jendela + pantul hangat dari bercak matahari, jarak
    geodesik 26-tetangga di grid 1 u; ±120–340 ms). Shader map (`bakedMaterial`) hanya memodulasi cahaya TIDAK langsung → matahari &
    bayangan tetap dinamis. Muka balok besar dipecah ≤ 2 u (MeshBuckets.maxCell) agar gradasi halus; lantai ubin juga dipecah.
  - MEDIUM+: material PBR (MeshStandard, kekasaran per permukaan), normal map prosedural (src/world/SurfaceMaps.ts: stud timbul, inlet,
    plester, nat ubin, punggung buku, kain), logam dekorasi (metalM: kuningan/besi/baja/tembaga/emas), peta lingkungan ditangkap dari
    aula sendiri (CubeCamera → PMREM, Game.captureEnvironment) untuk pantulan, berkas cahaya skylight (shader pudar di ujung/tepi) +
    debu melayang (Points), probe cahaya karakter (BlockyCharacter.setProbe dari medan bake), senjata PBR setengah logam.
  - HIGH+: pasca-proses (src/core/PostFX.ts): bloom ¼ resolusi + OutputPass + grading (vignette, saturasi, kontras, hangat) + FXAA
    (MSAA HDR terlalu mahal di iGPU: 27 → 54 ms); lampu kilat moncong juga untuk tembakan FPS (Vfx.flashLight). ULTRA (preset baru,
    XCFG.gfx.ultra, config/presets.ts): MSAA 4× + GTAO (SSAO) + bayangan 4096 — untuk GPU kuat.
  - Saklar Pengaturan → Grafik: gfxReflect, gfxFog, gfxDust, gfxBloom, gfxSsao (berlaku bila preset mendukung). Kepulan debu benturan
    peluru (Vfx.puff, 1 draw call). Plint kayu di kaki dinding luar lantai 2 & dinding arsip.
  - Terukur (Iris Xe, TDM): MEDIUM 11.2 ms (p95 13.3), draw call 109 / maks 121, segitiga maks ±155k (< 200k GDD);
    HIGH 22 ms resolusi penuh → ±16 ms dengan resolusi dinamis 0.7; ULTRA ±90 ms (bukan untuk iGPU).
- Crosshair kustom (spesifikasi pengguna dari "Google AI mode"; default tetap GDD §13 = Klasik, Dinamis, 8×2 px putih, outline 1 px):
  - src/ui/Crosshair.ts: 5 bentuk (Klasik, Klasik + titik, Titik, Lingkaran, T), 3 perilaku (Statis / Dinamis = gap & jari-jari ikut
    spread senjata §7 + mekar visual tiap tembakan pemain / Hybrid = garis dalam & titik tetap, garis luar & lingkaran mengembang),
    `xhGeometry` murni (diuji), `XH_PRESETS` (6 contoh), kelas `Crosshair` (apply / setSpread(px) / kick / update) dipakai HUD & pratinjau.
  - Setelan (localStorage settings): xhShape, xhMode, xhColor (#rrggbb bebas) + xhAlpha, xhLen/Thick/Gap, xhDotSize/Alpha,
    xhCircleR/Thick, xhOutline + Thick + Alpha, xhDynMult. Setelan lama dimigrasi (xhDot → Klasik + titik, xhLen 0 → Titik, xhDynamic false → Statis).
  - Pengaturan → Crosshair: pratinjau langsung skala piksel asli (latar gelap | terang), simulasi Diam/Jalan/Lompat (spread hipfire GDD)
    + Tembak ×6, preset, warna cepat (Cyan/Hijau neon/Kuning/Putih/Merah/Magenta) + pemilih warna; baris yang tidak relevan disembunyikan.
  - Mekar tembakan = visual saja (akurasi peluru tetap GDD): XCFG.hud.xhFireKick/Max/Recover, jarak garis luar Hybrid xhSplitGap.
- Pindah aplikasi / kunci mouse ulang (laporan pengguna: "kursor kebawa masuk ke game", "senjata menembak terus" setelah alt-tab):
  - Lanjut dari pause / mulai match: game baru berjalan setelah mouse BENAR-BENAR terkunci (Input.requestLock menunggu
    pointerLockElement ≤ XCFG.input.lockWaitMs); bila Chrome menolak → tetap pause + layar "Klik di mana saja untuk lanjut main".
    Klik area gelap menu pause = lanjut. Kunci yang datang terlambat saat layar itu tampil → lanjut otomatis.
  - Setelah terkunci: gerak mouse diabaikan XCFG.input.lockSettleMs (sisa gerak kursor dari aplikasi lain), lonjakan > spikePx dibuang,
    klik dalam fireGuardMs diabaikan (klik yang mengembalikan ke game tidak jadi tembakan); state tombol dibersihkan saat lock/blur/focus.
  - window blur → selalu pause (juga mode controller). Controller: hanya pemetaan 'standard', mode aktif hanya lewat tekan tombol
    (bukan stik/derau sumbu), mati saat blur; RT/LT harus dilepas (< padRearm) dulu setelah fokus/lanjut sebelum bisa menembak.
  - Tombol yang masih ditahan saat kembali (keydown repeat) ditandai ditahan. Dijaga tests/input.test.ts (DOM tiruan EventTarget).
- Brick Hall v2 (permintaan pengguna: "map kurang", disetujui 7 ide + spawn 2 lantai). Ukuran, lantai 0/10, tangga 35°, rak §4 tetap:
  - Kantong: arsip di bawah balkon (X ±22…30, lemari zig-zag lantai–plafon, pintu ke aula di Z ±13.5 dan Z 0 (C_ARC ↔ C_F_SIDE));
    pelat lantai 2 kini slab (BALC_SLAB/BASE_SLAB, Y 9.4…10) + isian markas bawah; rak tinggi 2 lantai ('stack', Y 0…16): SPINE tengah
    Z ±13…31 + satu per kuadran (X ±15.6…17); lemari katalog rotunda (ROT_CAB) memotong sumbu panjang jembatan; dinding depan markas
    (BASEWALL, |Z| 35…35.4) dengan pintu X ±6…10 + jendela intip (sill 1.2, atas 5.6).
  - Spawn: `SPAWN_SLOTS[team].upper|ground` (5 slot/lantai); `SpawnSystem.pickSlot` memilih lantai acak 50/50, lalu slot terjauh dari
    musuh ber-LOS; fallback ke lantai lain bila penuh. Ruang spawn bawah (|Z| 43…50) → pintu GDOOR ke aula & lorong ke arsip.
  - Identitas: gaya 'teampanel' (warna menurut tanda Z), karpet biru (S) / merah (N) / emas (rotunda), dekorasi di src/world/Decor.ts
    (spanduk, lambang dinding ujung, bingkai + lambang dinding markas, galeri rak buku dinding atas, balok atap, 3 lampu gantung,
    menara jam (collider) + muka jam kanvas, ikon puncak rak, lentera tim, lampu arsip/spawn bawah; 1 PointLight rotunda bila
    shadowMap > 0, tanpa bayangan). Dekorasi = balok vertex-color di bucket map (tanpa draw call tambahan) kecuali muka jam.
  - Nama area: `zoneName(x,y,z)` di MapData → label di bawah radar (Minimap). Landmark kuadran: SW Bola Dunia, SE Teleskop, NW Ksatria, NE Jam Pasir.
  - Nav: 192 node (GSPAWN/GDOOR/GEXIT, rantai ARC1…6, F_SOUTH; F_VOID dihapus); jalur bot 'archive' ditambah →
    XCFG.bots.lanes = bridge .30 / west .15 / east .15 / floor .20 / archive .20 (GDD: .35/.20/.20/.25 — disetujui sebagai bagian rework map).
  - Terukur (TDM, bot Normal, node v1 yang sama): visibilitas rata-rata 43.7% → 22.7%, pasangan terlihat > 40 u 39% → 26.7%,
    kill/menit 37 → 20, median jarak kill 53 → 24 u, spawn→kontak median 2.4 → 2.8 s; bot keluar spawn bawah (3 sekaligus) 2–5 s, 0 bot macet.
  - Ide 7 (map kedua) = Steel Yard — lihat "Multi-map & Steel Yard".
- Kehalusan frame (laporan pengguna: "FPS 60–80 tapi rasanya tidak seperti 60–80"):
  - Akar masalah (terukur, layar laptop 90 Hz): preset HIGH butuh GPU ±11 ms = batas vsync 11.1 ms → ±28% frame tampil 2 vsync
    (22.2 ms) berselang-seling (judder); FPS rata-rata 70 tapi terasa patah. Resolusi dinamis GDD §2.3 (17.5/13 ms) dirancang untuk 60 Hz
    → di zona 60–80 FPS tidak pernah turun. MEDIUM: GPU ±6 ms → 90 FPS, ≥ 99% tepat waktu.
  - Resolusi dinamis sadar refresh (disetujui pengguna; `DynResController` murni + `DynamicResolution`, angka XCFG.pacing): target = vsync
    (FramePacing, ditaksir dari SETIAP callback rAF) × batas FPS. Turun 0.1 bila > 5% frame (±1 s) telat ≥ 1 vsync DAN GPU p90 > 50% target
    (telat karena CPU tidak diobati resolusi), atau GPU p90 > 95% target. Naik bila ≤ 1% telat selama 4 s DAN prediksi CPU p50 + GPU p90 ×
    (piksel berikut / piksel kini) ≤ target — di Chrome JS lalu GPU praktis berurutan per vsync (terukur HIGH: CPU 4–5 + GPU 7–8.5 ms).
    Naik yang gagal (turun lagi ≤ 6 s) memblok level itu 15 → 30 → … 120 s (reset setelah level baru bertahan 30 s). Tanpa timer GPU:
    turun karena frame telat, naik dengan mencoba + backoff. GpuTimer.need('dynres'|'stats') — query hanya bila dipakai.
  - Batas FPS (Pengaturan → Grafik, `settings.fpsCap` 1/2/3 = ikut layar / ½ / ⅓ refresh; label menampilkan angka FPS dari refresh
    terdeteksi): GameLoop melewati tick vsync (`capSkips`: jalan bila ≥ (div − 0.5) vsync sejak frame terakhir) → setiap frame tampil sama
    lama (60 di layar 90 Hz pasti berselang-seling, jadi tidak ditawarkan). Terukur HIGH + batas ½: 44.2 FPS, 97% tepat waktu.
  - Catatan pengukuran: GPU laptop bisa melambat/berfluktuasi (aplikasi lain, panas, baterai) — MEDIUM sempat terbaca GPU p50 7.4 / p90 12.5 ms
    padahal awal sesi 5.6 ms; resolusi dinamis menyesuaikan, jadi bandingkan angka hanya dalam satu sesi ukur.
  - Diperbaiki: pra-kompilasi shader `Engine.warmup()` (dipanggil di akhir applyVisual; scene dunia + viewmodel, pool tersembunyi, material
    debris yang meshnya dibuat belakangan; HIGH dikompilasi untuk target HDR pasca-proses) → tidak ada frame macet ±40 ms saat granat/kematian
    pertama. Interpolasi benda fisika 60 Hz ke frame render (`core/BodyLerp.ts`: granat, senjata dibuang, buku, balok tubuh; pose disimpan
    setelah world.step → `postStep()`/`fixedUpdate`, diterapkan per frame dengan alpha). Material viewmodel terpisah (`VM_WEAPON_MATERIAL`,
    `VM_OPTIC_GLASS_MATERIAL`, `createOpticMesh(id, true)`) + `customDepthMaterial` buku → three.js tidak menghitung ulang program shader tiap
    frame (getProgram ±0.9 → 0.06 MB/s). Listener audio ≤ 30 Hz, hanya saat kamera berubah & konteks running (XCFG.audio.listener).
    NavGraph.nearest tanpa Math.hypot (jarak kuadrat, urutan identik).
  - Overlay F3: refresh layar (`core/FramePacing.ts`, median frame tepat waktu), % tepat waktu, 1% low, GPU ms (`core/GpuTimer.ts`,
    EXT_disjoint_timer_query_webgl2, aktif hanya saat overlay terbuka), CPU ms, grafik interval frame (hijau/kuning/merah).

- Main Bareng / room (permintaan pengguna: kumpul teman dalam 1 lobby, 5v5, slot kosong diisi bot) + ONLINE (disetujui pengguna: stack
  100% gratis — WebRTC host–client P2P, signaling Supabase Realtime, frontend Vercel, TURN opsional; GDD §1 menyebut WebSocket —
  menyimpang karena syarat gratis tanpa server game). Akun Supabase/Vercel milik pengguna: JANGAN membuat/menyambung akun sendiri.
  - Logika murni `game/Lobby.ts` (diuji tests/lobby.test.ts): kode room 6 karakter (alfabet tanpa I/O/0/1, tampil "XXX-XXX", link `?room=`),
    2 tim × XCFG.lobby.teamSize (5) slot, pemain pertama = host (selalu siap), masuk ke tim yang manusianya lebih sedikit, maks 10 orang;
    slot kosong = bot (nama tetap per slot: Biru names[0..4], Merah names[5..9]) bila `fillBots`; pindah tim (reset siap), siap, keluarkan,
    acak tim seimbang, setelan (mode/target/waktu/ronde/kesulitan/isi bot) hanya host; canStart = host + semua siap + tiap tim ≥ 1;
    `roster(meId)` → susunan match; `toState()` / `Lobby.fromState(s, meId)` = cermin room di klien. `cleanName` (huruf/angka/spasi/_.-,
    maks 16) → aman untuk innerHTML (HUD killfeed!); nama dari jaringan tetap di-escape (Menus `esc`).
  - Jaringan (`src/net/`, angka di XCFG.net): `Signaling.ts` (LocalSignaling = BroadcastChannel antar-tab untuk uji tanpa akun;
    SupabaseSignaling = kanal broadcast per kode room, pustaka dimuat lazy (chunk terpisah); `onlineConfigured()` = env VITE_SUPABASE_URL +
    VITE_SUPABASE_ANON_KEY dan bukan `?signal=local`; `iceServers` = STUN Google/Cloudflare + VITE_TURN_*); `Peer.ts` (RTCPeerConnection,
    kanal 'r' reliable JSON + 'u' unreliable biner maxRetransmits 0; simulator debug `?netlag=&netjitter=&netloss=`); `Session.ts`
    (NetHost: hello → welcome/deny started|full → offer/answer → 'join' → room disiarkan; aksi klien team/ready/loadout divalidasi host,
    `cleanLoadout`; NetClient.join: hello diulang 1×, tanpa jawaban XCFG.net.helloTimeout → notfound, total connectTimeout);
    `protocol.ts` (perintah 17 B: seq, gerak, yaw/pitch 16-bit, tombol ditahan H + impuls I, viewTick; snapshot: entitas ±40 B, keadaan
    gerak SENDIRI f64 (f32 membuat KCC yang menempel dinding berbeda hasil → koreksi berantai), granat, efek tembakan & lain-lain);
    `sync.ts` (HostClock, InterpBuffer, CommandHistory, CommandQueue: perintah telat → pemain remote DITAHAN (tanpa mengarang masukan),
    antrean > cmdCatchUp → 2 perintah/tick, idle > 0.25 s → masukan nol); `start.ts` (susunan match + `parseStart` memvalidasi pesan host);
    `NetMatch.ts` (HostRep: perintah → niat gerak sebelum KCC, senjata remote SETELAH world.step lewat `game/PlayerActions.driveWeapons`
    (aturan senjata sama persis dengan pemain lokal), snapshot 30 Hz per klien (ack + keadaan sendiri; antrean kirim klien > backlogSlow
    → klien itu 15 Hz selama slowHold s, efek tembakan dibawa ke snapshot berikut), event reliable spawn (+loadout/varian)
    / kill / assist / hit (hanya penyerang & korban) / mstate / boom / stats tiap 1 s / notice / abort, lag compensation = riwayat
    matrixWorld hitbox per frame (jarak ≥ ½ tick, label `fixedIndex − 1 + alpha`) di-rewind ke viewTick penembak ≤ 250 ms;
    ClientRep: perintah per tick (dikirim tiap tick + 2 sebelumnya), rekonsiliasi (setState host + putar ulang `quiet`), koreksi visual
    `smooth` meluruh 120 ms, boneka diinterpolasi dengan jeda ADAPTIF `SnapStats` (interval median + keterlambatan p95 + 1 tick
    + 1 interval bila paket hilang, 3…12 tick, naik cepat/turun pelan) + ekstrapolasi ≤ 3 tick saat snapshot telat, efek tembakan/
    granat/suara dari snapshot, HP sendiri dari snapshot; serangan sendiri yang kena → `ctx.net.predictHit` (dari TeamManager.applyDamage
    di klien) → 'hit' {predicted} instan, `HitLedger` melewati konfirmasi host yang sudah tampil (prediksi meleset → tampil saat konfirmasi)).
  - Ping (permintaan pengguna "perbaikan ping"): NetHost ping/pong reliable tiap XCFG.net.pingEvery s (EMA), siaran 'pings' →
    room (chip per pemain, `Menus.updatePings` tanpa menggambar ulang), `Entity.ping` lewat 'stats' (−1 bot, −2 host, −3 belum terukur)
    → kolom Ping papan skor online, peringatan HUD `.ping-warn` ≥ pingWarn (150 ms), overlay F3 (ping, interp, Hz snapshot, koreksi).
  - Game: `ctx.net.role` offline|host|client (+ seed spread `shotRandom` = seed ^ id ^ tembakan ke-n per nyawa → spread prediksi = host).
    Room yang dibuat selalu membuka NetHost; Mulai dengan ≥ 1 teman terhubung → match online (id entitas per slot: Biru 1…5, Merah 6…10;
    pesan 'start' dulu, lalu spawn tersiar); tanpa teman → match lokal seperti biasa. Klien: semua entitas lain `puppet` (tanpa KCC/AI),
    damage/spawn hanya dari host (TeamManager.applyDamage return di klien), `MatchManager.startPuppet/applyNet`. Online: tanpa jeda penuh,
    slow-mo akhir match & slowmo debug (waktu host = klien); buang/ambil senjata & Latihan offline saja; killcam tetap jalan.
    Host memilih "Akhiri Match" → 'abort' (semua ke room, pesan di status room); host HILANG → pindah host (lihat "Pindah host & AFK");
    klien keluar / terputus di tengah match → slotnya dimainkan bot (HostRep.onPeerLeft → setAfk 'gone'; bisa bergabung ulang).
    Hasil: host "Main Lagi" (mulai lagi untuk semua; status siap tidak direset online) / klien menunggu.
    `GameLoop.setKeepAlive(true)` saat host: Worker (blob) menjalankan frame tanpa render bila rAF berhenti > 100 ms (tab di belakang).
  - UI (Menus.showLobbyHome(back, code, message) / showRoom(notice) / refreshRoom, CSS hud.css): Gabung = koneksi sungguhan dengan pesan
    gagal (notfound/full/started/timeout/failed); badge status (Menyiapkan / Online — n teman / Uji lokal / Terhubung ke host);
    aksi room lewat `MenuApi.roomAct` (host: ubah + siarkan; klien: kirim ke host); "＋ Teman (simulasi)" hanya host (dimainkan bot).
  - Terukur (2 jendela Chromium, signaling antar-tab): gabung ±0.8 s; posisi klien = host (< 0.002 u); koreksi prediksi: f32 → 7 per
    5 s gerak menempel rak, f64 → 1 per 8 s; dengan `?netlag=55&netjitter=15&netloss=2` (ping ±120 ms) 0 koreksi; tembak target strafe
    12 u: kena 98% dengan lag compensation vs 86% tanpa; keep-alive: rAF host dimatikan → tetap 59 tick/s & 19.9 snapshot/s.
    Perbaikan ping: 30 Hz; jeda interpolasi 56–74 ms (jaringan lokal) / 88–107 ms (ping ±140, jitter 15, hilang 2%) — dulu tetap 117 ms;
    hitmarker prediksi ≤ 1 ms setelah tembakan, 8–9 dari 9 kena terprediksi, 0 ganda; mode hemat upload → 14 Hz lalu kembali 29–30 Hz.
    Supabase asli (project milik pengguna; URL + publishable key di `.env.local`, di-.gitignore — jangan ditulis ke file yang di-commit):
    room siap ±2.1 s (termasuk memuat chunk Supabase), gabung ±1.9 s, WebRTC tersambung, 20 snapshot/s, "Host menutup room." sampai.
    Belum diuji: dua perangkat/jaringan berbeda (NAT sungguhan), 3+ pemain, TURN; deploy Vercel (env harus diisi sebelum build).
  - Keep-alive Supabase (permintaan pengguna): `api/keepalive.js` (Vercel Function, Node, `export default (req, res)`) dipanggil Vercel Cron
    `vercel.json` "0 3 * * *" (Hobby: maks sekali sehari) → GET `/rest/v1/keepalive?select=id&limit=1` dengan header `apikey` saja
    (publishable key bukan JWT). Tabel dari `supabase/keepalive.sql` (1 baris, RLS select anon) — dijalankan pengguna di SQL Editor.
    Alasan: paket gratis dijeda setelah ±7 hari tanpa aktivitas DATABASE; signaling Realtime tidak dihitung. CRON_SECRET opsional.
  - Input: keydown di kolom teks (input non-range / textarea) tidak dicegah & tidak jadi input game (Spasi bisa diketik).
  - Ketahanan sesi (laporan pengguna 2026-11-25: game ke-7 Eliminasi, pengguna = HOST, "halaman ke-refresh sendiri" & SEMUA pemain
    terlempar bersamaan = halaman host berakhir). Penelusuran: log Windows host (System 4101, Application 1000–1002, DxgKrnl/Intel
    Graphics, WER, Crashpad Chrome/Edge) bersih selama sesi; 4101 teman kosong; uji 8 match offline + 7 match online berturut-turut →
    memori stabil (DeathFx = pool per id entitas, maks 70 body — bukan kebocoran). Sebab pasti tak terbukti; dua jalur yang kini ditutup:
    (a) F5/Ctrl+R tidak dicegah (Ctrl+R = kelingking melorot dari Shift/sprint ke Ctrl saat R/reload), (b) `webglcontextrestored` →
    `location.reload()` (Engine). Perbaikan:
    - `Game.unloadGuarded` → `beforeunload` (dialog bawaan "Yakin keluar?") saat match berjalan (bukan RESULTS) atau room online (host
      dengan teman / klien); tidak untuk `autoTest` & muat ulang disengaja (`allowUnload`: ganti preset, tombol grafis).
    - Input: saat mouse terkunci → preventDefault F1/F5/F6/F7/F10 + semua kombinasi Ctrl/⌘/Alt (`reloadCombo` dicatat ke kotak hitam);
      Ctrl+W/T/N tak bisa dicegah Chrome → tertangkap dialog beforeunload.
    - Grafis: konteks pulih → `Engine.onContextRestored` (bukan reload; three.js membangun ulang state GL di listener-nya yang terpasang
      lebih dulu) → `Game.onGfxRestored`: `recaptureEnvironment` (peta lingkungan = render target GPU, ditangkap ulang tanpa karakter &
      balok tubuh) + `applyVisual` (warmup) + `GpuTimer.restore`. Selama hilang: simulasi jalan, layar `#gfx-recover`; > `XCFG.gfx.recoverWaitS`
      (10 s) → tombol "Muat ulang halaman" + `exitLock()` (pointer lock membuat klik tidak sampai ke tombol — terukur di browser).
    - Kotak hitam `src/core/BlackBox.ts`: sessionStorage `studwarfare.blackbox.v1` (+ `.prev.v1` sampai ditutup) — bertahan saat refresh,
      hilang saat tab ditutup; localStorage tetap khusus settings. Maks 80 entri: boot (versi bundle index-HASH, preset, GPU, UA), match
      mulai/selesai/hasil/main lagi, room, status koneksi WebRTC (`Peer` connectionState), teman keluar, koneksi ke host (klien), host
      mengakhiri, grafis hilang/pulih, pintasan dicegah, dialog keluar halaman, tab tersembunyi, error JS/promise, perf tiap 60 s (fps,
      memori JS, geometri/tekstur, teman). `endSummary` (murni, diuji) → banner di menu utama ("Sesi sebelumnya berakhir tidak normal" +
      sebab: di-refresh/ditutup, crash/memori, grafis tak pulih, muat ulang game) + "Salin laporan" (clipboard; gagal → textarea);
      tombol kecil "Salin laporan teknis" selalu ada.
    - Terukur (Chromium headless + Iris Xe asli, skrip lokal): konteks hilang ±1.5–2 s lalu pulih di tengah Eliminasi MEDIUM & HIGH →
      tanpa muat ulang, waktu game jalan terus, render lanjut, peta lingkungan baru, 0 error konsol; host online kehilangan konteks →
      teman tetap tersambung & match lanjut; refresh di tengah match → dialog, Batal → tetap main, diterima → banner sebab + laporan
      tersalin; refresh di menu → tanpa dialog; konteks tak pulih → tombol tampil 10 s, klik mouse mentah → muat ulang → banner
      "grafis tidak pulih". Tests: tests/blackbox.test.ts, tests/input.test.ts (pintasan saat terkunci / di menu, label).
  - Pindah host & AFK (permintaan pengguna 2026-11-25: "kalau gue sebagai host tiba-tiba keluar, langsung otomatis pindah host"; disetujui
    "gas kerjain semua": wake lock, AFK → bot, serahkan host manual, pindah host otomatis + bergabung ulang + gabung balik). Angka di XCFG.net
    (saveEvery…claimEvery, afkAfter, silentAfk, stallShow, ticketTtl, lonelyAfter).
    - Murni (tests/migration.test.ts): `net/Migration.ts` — `makePlan` (teman tersambung, ping terkecil dulu, belum terukur terakhir, seri →
      urutan room), `parsePlan`, `migrationTimes(plan, me, handover)` → rank / promoteAt (= rejoinWait (0 bila serah-terima) + rank ×
      migrateStep) / giveUpAt (≥ migrateMax, tiap anggota kebagian giliran), `MatchSave` (v, state, ronde, waktu, hitung mundur, skor,
      pemenang, entitas: hidup/HP/respawnT/protectT/posisi/yaw/pitch/loadout/isi/cadangan/mode/granat/10 statistik/streak/varian) +
      `parseSave` (validasi & batas: data teman tidak dipercaya). `Session.claimBeats/parseClaim`, `net/Ticket.parseTicket`.
    - Host: cadangan `{t:'save'}` tiap saveEvery (1 s, HostRep.afterStep, `net/Resume.captureSave`) + rencana `{t:'plan', code: nextCode,
      order}` tiap planEvery (5 s) & saat room berubah. Kode room BARU dibuat host sejak createRoom (`nextCode`) — kode lama tidak dipakai
      ulang agar host lama yang ternyata masih hidup tidak bentrok.
    - Klien mendeteksi host hilang: kanal tertutup (instan) atau diam > hostSilence (5 s; ICE baru menyatakan gagal ±30 s; > stallShow 2 s
      → overlay "Koneksi ke host tersendat"). `Game.migrate()`: (1) bukan serah-terima → coba host LAMA dulu (rejoinWait 3 s; mungkin hanya
      koneksi kita yang putus) → (2) gabung ke `plan.code` sampai giliran → (3) giliran tiba → `promote()`: salinan lobby (kode baru, kita
      host, pemain lain tetap tercatat), `openHost(code, claim)`, `play(…, {...netStart, resume: save})` (cadangan = cadangan host terakhir
      + snapshot TERBARU yang diterima (`ClientRep.latestState`) — serah-terima memakai cadangan dari pesan handover). Naik jadi host HANYA
      bila percobaan terakhir sampai ke kanal signaling (`JoinFail` dibedakan: 'failed' = signaling tak tersambung = internet KITA,
      'notfound' = tidak ada host, 'timeout' = host menjawab tapi WebRTC gagal → host ada, jangan bikin tandingan) & `navigator.onLine`;
      internet kita putus → bergantian coba host lama / kode baru sampai giveUpAt, lalu layar Main Bareng + tiket.
    - Di layar room (belum main): `promote` membuang pemain yang tidak ada di rencana (termasuk host lama) → tidak ada "pemain hantu";
      host room yang semua temannya terputus (bukan keluar) → pesan kode room baru (ditunda setTimeout 0: NetHost menggambar ulang room
      lewat onLobbyChanged tepat setelah onPeerLeft). Host baru memakai kesulitan ROOM untuk bot match lanjutan (`settings.difficulty`).
    - `NetClient.join`: hello diulang tiap helloEvery (1 s) selama belum dijawab; batas sambung dihitung ulang sejak host menjawab
      (timeoutSec − helloSec, migrasi: joinConnect 5 s). Dua pengganti naik bersamaan (rencana berbeda / host baru lambat) → host hasil
      pindah host menyiarkan klaim `'host'` {pid, rank, peers} di signaling tiap claimEvery (3 s) + saat dibuka; kalah (`claimBeats`: teman
      tersambung lebih banyak → rank lebih kecil → pid) → `yieldHost`: serah-terima teman-temannya ke pemenang, lalu ikut migrate
      (handover). Terukur: dua host di 3.20 s → satu host 3.74 s.
    - Bergabung ulang: hello/join membawa `rejoin: pid` → host menerima bila `canRejoin` (pid ada di lobby, bukan lokal/simulasi) — juga di
      tengah match / room penuh, dan walau koneksi lama pid itu masih tampak hidup (dibuang tanpa "teman keluar"). Di tengah match pemain
      yang terputus TETAP di lobby (kecuali 'leave' sengaja); `prune()` saat kembali ke room / Mulai. Host → 'start' + `resume:
      captureSave()` ke dia (`onPeerRejoined`; `CommandQueue.restart()` karena seq mulai dari 1). `parseStart` memvalidasi `resume`.
      `MatchManager.resume`, `SpawnSystem.restore` (tanpa event spawn/isi ulang/perlindungan), `applySaveEntities`.
    - AFK pemain remote (`RemoteHuman.afk`: 'client' lapor sendiri / 'silent' tanpa perintah ≥ silentAfk / 'gone' terputus / 'connecting'
      menunggu perintah pertama): TacticalBot memegang entitasnya, perintah yang masuk dibuang tapi tetap di-ack, tembakan bot tidak di-rewind,
      ping −1. AFK lokal (`Game.updateAfk`: pause / tab tersembunyi / jendela tanpa fokus ≥ afkAfter 10 s di match online; `awayTest` uji):
      klien → act 'afk'; host → TacticalBot di `ctx.player` (kamera mengikuti yaw/pitch bot, playerWeapon dilewati). Status AFK terbawa
      saat match dilanjutkan.
    - Serahkan host (pause host online, klik dua kali): `NetHost.handover(plan, save, start)` → 'handover' lalu tutup 400 ms → penerima
      promoteAt 0, yang lain menyusul. Host lama → layar Main Bareng dengan kode baru + `rejoinHint` (Gabung = pid lama → slotnya).
    - Gabung balik: host yang semua temannya terputus sekaligus di tengah match (internet kita sempat putus) → pause "Gabung ke host baru"
      (`nextCode`); naik jadi host tapi tak ada yang menyusul ≥ lonelyAfter → toast + "Gabung ke host lama" (`promotedFrom`). Gagal →
      room dibuka lagi & `HostRep.rebind`. Di layar room: semua terputus → pesan kode room baru.
    - Tiket kembali ke match (`net/Ticket.ts`, sessionStorage `studwarfare.rejoin.v1`, ttl 15 menit; localStorage tetap khusus settings):
      klien = kode host (+ kode rencana), host = nextCode (hanya bila ada teman). Menu utama → kartu "Kembali ke match" → `useTicket`
      (gabung dengan pid lama). Dihapus saat keluar room dengan sengaja / dipakai / buat room baru.
    - Wake lock (`navigator.wakeLock`, 'screen') selama match online / room online, diminta ulang saat tab terlihat lagi.
    - Kotak hitam: pindah-host, serah-host, afk, teman-kembali, match-lanjut, kembali-ke-match, wake-lock; teks sebab "host di-refresh"
      kini "teman-teman dipindah ke host baru".
    - Terukur (Chromium headless, signaling antar-tab, host + 2 teman): halaman host ditutup → host baru 3.22 s (TDM; ronde/skor/waktu/
      statistik utuh, id entitas sama, host lama [bot]{gone}); internet host putus (Eliminasi) → 9.0–9.6 s, host lama "Gabung ke host baru"
      0.32–0.34 s ke slotnya; koneksi teman mati diam-diam → sambung ulang otomatis 6.1 s; AFK teman/host → bot ±10 s, kembali instan;
      serah-terima 0.56 s, host lama gabung lagi ke slotnya; host di-refresh → kartu → kembali 0.44 s setelah klik; teman di-refresh → 0.44 s;
      host diam 3.2 s → overlay tampil lalu hilang tanpa pindah host; gabung balik ke kode kosong → gagal 5 s, room dibuka lagi +
      `HostRep.rebind`, match jalan terus; layar room: host ditutup → host room baru 3.14 s tanpa pemain hantu, internet host room putus →
      8.0 s + pesan kode di host lama; host AFK: kamera tertinggal 1 frame dari bot (median 0.1°, maks 2.2°); 0 error konsol.
      Skrip uji lokal (scratchpad, bisa hilang): pw/migrate.js, migrate2.js, migrate3.js, migrate4.js. Supabase asli teruji di situs live
      (3 halaman, 1 perangkat: halaman host ditutup → host baru 3.17 s, teman menyusul 3.71 s, serah-terima 0.55 s). Belum diuji: dua
      perangkat/jaringan berbeda (NAT).

  - Chat teks tim & semua (permintaan pengguna 2026-11-25; TAHAP 1 dari "chat + voice"): logika murni `game/Chat.ts` (cleanChatText —
    karakter kontrol/lebar-nol/pembalik arah dibuang lewat RENTANG KODE angka hex (jangan menulis escape unicode backslash-u lewat alat
    penulis file: berubah jadi karakter asli & bisa memecah regex), maks XCFG.chat.maxLen; RateLimit token bucket; chatAllowed/chatReaches;
    parseChat; BotChatGate + botCalloutText; QUICK 6 pesan), tampilan `ui/Chat.ts` (ChatUI: feed HUD kiri bawah di atas HP + kotak ketik +
    menu pesan cepat; SATU panel chat tetap yang dipasang ulang di room/hasil/pause — fokus dipulihkan Menus.refreshRoom lewat
    data-a="chatin"; teks selalu textContent). Tombol (Bindings): chatAll Y, chatTeam U, quickChat H (aksi baru otomatis dapat tombol
    bila bebas; Input.consume agar angka di menu pesan cepat tidak mengganti senjata). Saat mengetik: `control` & senjata nonaktif,
    mouse-look tetap; Esc → Chrome melepas kunci mouse → layar "klik untuk lanjut" (bukan menu pause, `chatEscAt`). Jaringan: klien
    `act {a:'chat', scope, text, quick}` → host `hostChat` (validasi, batas laju per pid, allTalk) → `routeChat` ke penerima (tim = tim
    pengirim: entitas di match / slot lobby) `{t:'chat', …}`; ditolak → `{t:'chatno', reason}`. Setelan room `allTalk` (bawaan on; off =
    chat & voice SEMUA dimatikan selama match, tim tetap). Callout bot: `BotDirector.onCallout` (setelah jeda bicara) → chat tim bila ada
    manusia di tim itu (BotChatGate: 1/tim/6 s, area sama 15 s; Pengaturan `chatBots`). Bisukan per pid (memori; juga untuk voice nanti)
    di room & menu pause. Riwayat/bisukan direset saat buat/gabung/keluar room (bukan saat pindah host). Terukur (browser): routing
    tim/semua benar di room & match, bisukan, ketikan bertahan saat room digambar ulang, allTalk off menolak Y & klien nakal, anti-spam
    3 dari 7 sampai, HTML tidak tereksekusi, callout bot di host & klien, 0 error; tes online lama tetap lulus. Catatan: karakter diam bisa
    tergeser bot setim yang menabraknya (perilaku tabrakan lama, bukan chat).
  - Voice chat (TAHAP 2; keputusan pengguna 2026-11-25): push-to-talk T = tim, Z = semua (musuh yang dekat ikut dengar); di match
    KEDUANYA berdasarkan jarak karakter (jelas sampai XCFG.voice.near 12 u → (1 − x)^2 & lowpass 12 kHz → 900 Hz → hilang di 95% diagonal
    batas map = ujung ke ujung; arah 3D HRTF; terhalang dinding ×0.55 & cutoff ×0.45, cek LOS tiap 0.2 s); di room/layar hasil jelas penuh;
    pemain mati: T jelas ke tim, Z mati; allTalk off = Z mati saat match. ARSITEKTUR (menyimpang dari rencana mesh, alasan: NAT &
    keandalan): mic → `audio/VoiceCapture` (getUserMedia + echo/noise/AGC, MediaStreamTrackProcessor, WebCodecs AudioEncoder Opus 24 kbps,
    hanya selama tombol ditahan) → paket biner MSG.VOICE (protocol.ts encodeVoiceUp/Down, VOICE_MAX 400 B) lewat kanal UNRELIABLE koneksi
    game → host `game/Voice.ts` VoiceSystem.route: diteruskan hanya ke penerima yang berhak (`VoiceRules.voiceSendsTo`; anti-banjir maxRate
    60 paket/s per pemain; host tidak mengode ulang) → `audio/VoicePlayer` per pembicara (AudioDecoder → AudioBuffer dijadwalkan, jitter
    60 ms, antrean maks 350 ms, lowpass → gain → panner rolloff 0) → bus voice `SpatialSynthAudio.voiceOut()` ke master (ikut volume
    master, kompresor & efek telinga berdenging). Tanpa koneksi tambahan: bisa main bareng = bisa saling dengar; ikut pindah host.
    Biaya: upload host ±45 kbps per pendengar per pembicara. Pemain = pid ('p12' → nomor 12 di paket). Bisukan = set bisukan chat;
    Pengaturan → Audio: `voice` (on/off) + `volVoice`. UI: baris voice di room/pause (tombol "Aktifkan mic", status/izin), ikon 🎙 di baris
    pemain room (Menus.updateTalking ±10 Hz), HUD `.vtalk` = kita + teman SETIM yang terdengar (nama musuh tidak ditampilkan). Butuh Chrome/
    Edge (MediaStreamTrackProcessor; lainnya → pesan "belum mendukung"). Terukur (Chromium + mic palsu, host + 2 teman): T hanya setim,
    Z semua, bisukan 0 potongan, jarak 8/48/83 u → gain sesuai rumus (×dinding), allTalk off menolak Z + pesan, 0 error. Belum diuji
    dengan mic sungguhan & dua perangkat (gema bila pakai speaker: push-to-talk + AEC browser; sarankan headset).
  - Pratinjau karakter di Loadout (permintaan pengguna 2026-11-25): `ui/CharPreview.ts` — kanvas + WebGLRenderer kecil tersendiri
    (alpha, ACES + eksposur game, lingkungan RoomEnvironment untuk senjata PBR, cahaya studio) dengan BlockyCharacter asli per tim
    (Pria/Wanita = setVariant, seketika) memegang senjata + optik pilihan (weaponModel/createOpticMesh), pose low-ready, berputar pelan
    0.4 rad/s, seret untuk memutar; dirender hanya selama Loadout tampil (berhenti saat elemen lepas dari DOM). Layout Loadout 2 kolom
    (pratinjau 250 px + grid senjata; bertumpuk ≤ 760 px), toggle "Lihat pakaian" Biru/Merah (bawaan = tim kita, MenuApi.myTeam).
- Multi-map & Steel Yard (permintaan pengguna: map kedua "Steel Yard" — halaman kontainer di gurun, "detail dan lengkap"; dikerjakan
  bertahap: F1 fondasi → C1 denah/nav/test, C2 visual, C3 UI/online → I1 integrasi & uji browser):
  - Kontrak `src/world/maps/types.ts`: `MapDef` (id, name, desc, bounds, boxes, stairs, spawnSlots, nav: NavTemplate, lanes: LaneDef[],
    surfaceAt, zoneName, practice, menuCam, envProbe, atmosphere, props? (buku — hanya BH), build()) + `BuiltMap` (group, sun, hemi, light,
    shelves, dust, shafts, triangles, colliders, dispose()). `registry.ts` (MAPS, MAP_IDS urut menu, mapInfo, isMapId, DEFAULT_MAP,
    setCurrentMap) · `current.ts` (modul daun currentMap()) · `brickhall.ts` (template nav BH dipindah dari NavGraph, lane = XCFG.bots.lanes,
    latihan/menuCam/envProbe/atmosphere) · `shared.ts` (addBoxColliders, cuboidCollider, removeColliders, disposeTree, rotYQuat).
  - Konsumen `currentMap()`: surfaceAt (Ballistics, GrenadeK400, Physics.surfaceBelow), boxes (TacticalBot drop, Minimap, LightBake),
    spawnSlots (SpawnSystem: indeks [...upper, ...ground], lantai kosong dilewati), zoneName/stairs (Minimap), nav (`new NavGraph(def.nav)`,
    NavNode.level = number), lanes (BotDirector: Lane = id string, tak dikenal → jalur pertama), practice/menuCam/envProbe/atmosphere (Game).
  - `Box.rotY` (radian, putar di pusat balok): collider Rapier, MeshBuckets.addBox (UV ikut sumbu lokal), LightBake (OBB ke grid), Minimap.
    BH tidak memakainya. LightBake `BakeSource` mode indoor (BH identik bit-per-bit) / outdoor (langit dari keterbukaan + pantul permukaan
    yang kena matahari).
  - Permukaan `'sand' | 'metal'` (EventBus SurfaceMaterial): langkah (Recipes), warna tumbukan (world/surfaces.ts — Ballistics & NetMatch),
    pantulan granat; jaringan `grenade:bounce` = 3 bit material | kecepatan×2 (5 bit). Langkah boneka remote (NetMatch) kini
    `physics.surfaceBelow` (dulu selalu 'tile').
  - Game: `loadMap(id, force)` SINKRON (bersihkan granat/senjata dibuang/vfx/debris → props.dispose → map.dispose (mesh, collider, lampu,
    tekstur) → setCurrentMap → latar/kabut dari atmosphere → build → Props → world.step → peta lingkungan di envProbe (luar ruang far 2000)
    → NavGraph + validate → minimap.setMap → debugPanel.buildNav → applyVisual/warmup); `prepareMap` (layar "Memuat map…" + afterPaint, token
    membatalkan yang lama); `selectMap(choice)` (simpan settings.map, hapus override ?map=); `defaultMapId()` = ?map= ?? pickMap(settings.map);
    `play(mode, roster, net, mapId?)` (offline: map lain → overlay + muat, kunci mouse diminta selagi masih gestur klik; online: mapId ??
    map aktif, dimuat sinkron); Main Lagi / Ulangi = map yang sama. Boot memuat settings.map (bawaan brickhall); `?map=` untuk uji.
  - UI/online (C3): `Lobby` MapChoice ('brickhall'|'steelyard'|'random'), pickMap, RoomSettings.map (hanya host; setSettings menolak patch
    yang berisi kunci/nilai tak dikenal secara utuh; fromState memvalidasi map/kode room/id pemain /^p\d+$/ unik). `NetStart.map`
    (parseStart: hilang/'random'/tak dikenal → brickhall). Acak diundi host; host memuat map (overlay) → cek ulang room → start{map} →
    play. Klien: preload map pilihan host saat lobby berubah (`preloadRoomMap`); 'start' dengan map lain → overlay + pesan host diantre
    (`netHold`) → play → antrean diputar. Menus: Atur Match bagian MAP (3 kartu: denah kanvas `ui/MapThumb.ts` — Biru kiri/Merah kanan,
    fakta "Luar ruang · 1 lantai · 30 × 40 m"), kartu kecil di Setelan host room, hasil "Steel Yard · Team Deathmatch", banner hitung mundur
    nama map + mode, label tombol Latihan = `MenuApi.mapChoice()` (?map= ?? settings.map).
  - Steel Yard `src/world/maps/steelyard/`: `index.ts` (MapDef); `layout.ts` (C1: data kuadran SW/sumbu → cermin `mirrorPose` (cermin X:
    rotY → π − θ, Z: −θ, XZ: π + θ — pintu kontainer & moncong mobil ikut terbalik benar), `deriveBoxes` murni → SY_BOXES, SY_DIMS satu
    sumber dimensi (visual CDIM/PDIM = SY_DIMS), SY_SPAWNS 10/tim lantai 'ground' (5 per sudut; 'upper' kosong), syZoneName, sySurfaceAt,
    SY_PRACTICE, SY_MENU_CAM, SY_ENV_PROBE); `nav.ts` (template 30 node → 104 node / 134 edge, 68 cover; lane sayap .30 / dalam .25 /
    tengah .25 / apit .20 = XCFG.bots.lanesSteelYard; sisi W/E = sisi bot); `build.ts` + `visual/` (C2: geo.ts bucket per material berkoordinat dunia,
    textures.ts kanvas, materials.ts SATU shader uber (uSyMode 0 biasa / 1 mask cat-karat-debu / 2 tanah) → 2 program, containers.ts,
    props.ts, fence.ts, ground.ts (tekstur makro dilukis dari denah, tanah luar sampai cakrawala + bukit pasir, genangan), sky.ts (1 draw
    call: gradien, matahari, awan, 3 lapis gunung + mesa bertingkat, tanah jauh berkabut), backdrop.ts (tumpukan kontainer, gantry crane,
    gudang seng, tiang lampu; BACKDROP_SEED), dust.ts).
  - Denah: 84 × 112 u, pagar 9 u (14 bentang: terpal kendur, PAGAR_W1 & PAGAR_E4 panel seng). 30 entri kontainer = 32 kontainer
    (8 × 10 ft, 22 × 20 ft, 2 × 40 ft; 8 terbuka, 8 miring, Menara 2 × 2 tumpuk 2 = 14.4 u), 82 prop (4 sedan, 24 drum, 16 tumpukan peti,
    …), 12 genangan. Spawn: Biru sudut SW/SE, Merah NW/NE, di balik GERBANG miring (rotY −0.18), 2 jalan keluar per sudut, 0 garis pandang
    slot ↔ slot musuh. Garis tengah hanya bisa diseberangi di 4 titik (Pos Jaga W/E, samping Menara W/E). Tinggi pelindung patuh §4.4:
    palet 0.4, tumpukan palet 2.0, barrier 2.2, drum 2.4, spool 2.6, peti 2.8 / 5.6, mobil 4.2, kontainer 7.2 / 14.4.
  - Visual: matahari sore TEPAT dari Barat (z = 0) elevasi ±40° (simetris cermin Z), matahari ×0.82, hemi 0.72×, IBL difus ×0.5, kabut
    0xa39a88 / 0.0025; bayangan kontainer/palet/peti/pagar seng lewat balok PROXY (colorWrite false, depthFunc Never) — mesh detail tidak
    melempar bayangan; LOW: bayangan matahari benda area main + pagar dilukis ke tekstur tanah (latar luar pagar tidak, sama dengan MEDIUM+).
    Tekstur kanvas di-cache sisi CPU antar-muat (±12 MB), memori GPU tetap dilepas.
  - Perbaikan I1: (1) garis lurus potong far 300 u di cakrawala (kamera menu/tempat tinggi) → tanah luar dilebur ke rumus "tanah jauh"
    langit antara kedalaman 234…291 u (uniform uSyFade di shader uber, `setFarFade`); (2) bloom HIGH+ per map `Atmosphere.bloom` +
    `PostFX.setBloomTuning` — SY ambang 1.6 (BH tetap XCFG 0.85): langit siang ±0.8–1.2 linear membuat seluruh langit berpendar jadi
    kabut putih; (3) genangan PBR 0x2a2620 (dasar cokelat membuat pantulan ungu); (4) collider latar padat di luar pagar (tumpukan
    kontainer + gudang sampai lis atap, `Foot.col`, tidak masuk SY_BOXES) + sySurfaceAt luar pagar y > 0.1 = 'metal' → peluru/granat
    yang lewat di atas pagar berhenti & memercik; (5) data contoh `syShowcase` C2 dihapus; (6) panel debug Stress Test & spawn dummy
    khusus Brick Hall (koordinat BH); (7) label Latihan & kartu terpilih mengikuti ?map=.
  - Terukur (Playwright, Iris Xe, 1717×965 CSS, MEDIUM): BH vs HEAD — frame menu beku (menuT 1.234, ctx.time 12.5) hash PNG SAMA di
    MEDIUM/HIGH/LOW (draw 30/46/19, segitiga 152 224/152 752/78 046), collider 256, nav 192; BH TDM 40 s: 0 macet, draw maks 131 (HEAD 135).
    SY TDM (bot Normal): frame median 11.1 ms (vsync 90 Hz, p95 11.3), GPU p50 6.3 / p90 6.4 ms, draw rata 99–102 / maks 116–123, segitiga
    maks 135k; 60 s: 16 kill, median jarak kill 15.5 u (p90 25, maks 41), 0 bot macet (> 5 s diam saat PATROL/INVESTIGATE), 0 keluar map,
    9/9 bot bergerak. LOW 11.1 ms (GPU 4.4), HIGH 11.1 ms (GPU 7.2, resolusi 0.9, draw ≤ 205), ULTRA 22 ms (GPU 22.5, resolusi 0.6).
    Muat SY 747 ms saat boot (tekstur pertama ±190 ms, bake medan ±200 ms), ganti map 495–650 ms; ganti BH ↔ SY 5× tanpa reload: collider
    179 ↔ 400, body 0 ↔ 144, geometri 51 ↔ 53, tekstur 24 ↔ 19, program 51 ↔ 64 stabil, 0 error. Eliminasi SY: 1 ronde selesai ±65 s.
    Latihan SY: 12 dummy di tanah (2 bergerak), 16–76 u dari spawn. Online 2 jendela: host pilih SY → klien preload; Mulai → keduanya SY,
    posisi sendiri klien = host (0.000 u), boneka median 0.35 u (interp 61 ms, 30 Hz); klien di BH saat 'start' SY → overlay, 11 pesan
    diantre, main ±0.56 s kemudian, posisi cocok. Garis pandang (C1, Rapier, mata 4.4): 9.5% pasangan terlihat, > 60 u 0.26%, median 14.5 u.
  - Perbaikan review (X1):
    - Ganti map gagal di tengah (WebGL hilang/kehabisan memori): `Game.loadedId` = map yang BENAR-BENAR terbangun (diisi di akhir loadMap,
      null sejak mulai membongkar); `mapId` getter = loadedId (null setelah gagal) → play/prepareMap/startRoom/startNetClient/preload
      memuat ulang, bukan main di map tanpa collider (ctx.map tidak di-null-kan; dispose aman diulang). prepareMap menangkap error → false
      (dulu janji menggantung → Mulai room online macet); playAfterLoad gagal → exitLock + menu utama. buildSteelYard membuat collider
      PALING AKHIR (gagal di kanvas/bake tidak meninggalkan collider yatim). Diuji di browser (build disuntik gagal → prepareMap false,
      mapId null, coba lagi memuat; play gagal → menu, play berikutnya memuat & mulai; collider 400 ↔ 227 stabil).
    - Antrean pesan klien selama memuat map = `net/HoldQueue.ts` (murni, diuji): release → mulai match lalu putar antrean lewat run()
      (pesan 'start' kedua di antrean ikut menahan sisa pesan); cancel saat keluar room / putus. Online 2 jendela: 11 pesan ditahan → SY.
    - Pantulan granat: `MapDef.contactSurface` (SY true) → `GrenadeK400.bounceMaterial` raycast pendek dari pusat searah impuls benturan
      ((v_lama + g·dt) − v_baru) → material di titik kontak (dinding kontainer/mobil = metal; dulu 'sand' karena pusat ≥ 0.25 u dari dinding).
      Brick Hall tanpa flag → tetap pusat granat (identik).
    - Jalur bot: `LaneDef.route(own, x?)` — SY: sisi W/E = sisi bot (spawn di sudut; dulu diundi → ±55 u sia-sia lewat halaman sendiri),
      BH mengabaikan x (undian & urutan Math.random sama, diuji). 'dalam' kini lewat gang Pos Jaga (C_WING): penyeberangan garis tengah
      C_WING .55 / C_TOWER .45 (dulu .30 / .70; terukur 45 s: 9 / 8 penyeberangan).
    - Collider = visual: kabin mobil 3 tingkat (2.31/2.9/3.8/4.2, batas di luar pita §4.4; galat ≤ 0.35 u, dulu 1.26 u di depan kaca;
      profil `SY_DIMS.carCabin` dipakai visual juga), barrier = kaki ±0.61 (0–0.8) + badan ±0.35 (0–2.2) (profil `SY_DIMS.jersey`), spool =
      2 kotak (bintang 8 di dalam piringan) + visual selalu berlilit kabel (spool kosong dulu tembus pandang), kontainer terbuka + 4 tiang
      sudut (`SY_DIMS.container.post` 0.42) & daun pintu = setengah lebar − tiang (dulu 0.43 u lebih panjang). Tumpukan terpal: VISUAL kini
      mengisi tapak collider 4.4 × 3.4 × 2.6 (puncak 2.3–2.6, juntaian tegak, kelim 0.3 u di luar; dulu gundukan kecil) + salinan Merah =
      cermin persis Biru (`layout.mirrorInfo`: benih id dasar + balik Z lokal). Collider SY 179 → 227.
    - Serpihan papan: jari-jari 2.45 u & pagar ikut dicek (tidak menembus dinding tipis/pagar). Test baru: steelyard (collider ↔ visual,
      jalur dari sudut, pantulan granat Rapier, syColliders dilepas tuntas), maps (Props.dispose, laneRoute x), net (HoldQueue).
    - Tidak diubah: probe pantulan [0, 9.5, −18] (kosmetik; memindah mengubah IBL seluruh map).
  - Revisi "terlalu rapat" (laporan pengguna 2026-11-25: sesak saat berlari): dibuang SEKAT, PEMBATAS, PETI_TG, PETI_GT, DRUM_SY/TG/GS/PG,
    BAN_HM (masing-masing 4 salinan cermin); PETI_PG dipertahankan (satu-satunya jenis 'crate'). Terukur (grid 0.5 u, kapsul 0.8):
    area pijak yang < 2 u dari halangan 50.5% → 33.9%, jarak bebas median 1.98 → 2.55 u, area pijak 49 → 61%; garis pandang mata
    terlihat 10.5 → 22.9% (> 60 u 3.5%, median 24.9 u ≈ BH), spawn↔spawn 0 (Rapier, test); pelindung ≥ 2 u terjauh 8.9 u (test < 9.5,
    dulu < 7); kontainer 34 → 22; segitiga 135k → 113k; bot TDM 40 s: 15 kill, 0 macet, 0 keluar map. JANGAN buang TENGAH/SISI juga
    (> 60 u naik ke 9–12% → koridor sniper).
  - Catatan/sisa: Denyut perlindungan spawn (emissive 0.5) tampak putih di bawah
    matahari. Game.captureEnvironment mengompilasi tiap program 2× (varian render target + layar) — ±ratusan ms saat muat, semua map.
    loadMap dua kali berturut-turut TANPA frame di antaranya → peringatan WebGL "Program object expected" (alur normal selalu ada frame).

- Bot manusiawi (permintaan pengguna 2026-11-25: "bot kurang realistis", ide dari obrolan Google AI mode; disetujui "gas kerjakan semua"
  untuk 3 paket bidikan / tempur / patroli & tim). Tabel kesulitan GDD §11.5 TIDAK diubah; semua angka baru di `XCFG.bots.human`
  (+ `human.diff` per kesulitan). FSM GDD §11.2 tetap, ditambah state `EVADE`.
  - Bidik (`src/entities/botAim.ts`, murni): sentakan berprofil minimum-jerk dengan kecepatan PUNCAK = turn rate GDD (dulu putaran
    kecepatan konstan yang berhenti mendadak = turret), ujung kelewatan/kurang + meleset tegak lurus lalu dikoreksi pelacakan
    (feedforward kecepatan target); tujuan melompat (> ½ flickMin per langkah) → sentakan direncanakan ulang dari pose sekarang
    (terukur: kecepatan bidik maks 1775 → 519°/s, p99.9 416). Menoleh santai (patroli) = 45% turn rate.
  - Reaksi: rata-rata nilai GDD × jitter 0.8–1.2 × (1 + 0.35·(sudut/½FOV)²) × (1 + 0.25·jauh) × waspada 0.85 × sudah membidik ke
    sana (≤ 15°) 0.85, clamp 0.7–1.8.
  - Syarat tembak §11.4 (deviasi < 2.5° hip / 1.2° ADS) diukur terhadap titik bidik yang DIMAKSUD (target + error GDD + kaget;
    `gateIntent` 1). Dulu terhadap pusat target → error GDD hanya MENUNDA tembakan (di jarak ADS bot diam ±1.6 s menunggu error
    < 1.2°, lalu nyaris selalu kena: akurasi 64–71%); kini tembakan awal meleset lalu membaik (maksud §11.4). `aimLag` (Mudah 0.14 /
    Normal 0.10 / Sulit 0.07 s): bidikan tertinggal di belakang target yang bergerak (strafe/lompat pemain berguna). Kaget (startle,
    meluruh 0.45 s): kena tembak 3.0/2.0/1.2°, peluru lewat ≤ 1.6 u dari kepala 1.6/1.1/0.7°. Target tak terlihat → bidik posisi
    terakhir (dulu bagian tubuh target, menembus dinding).
  - Tempur (`src/entities/botTactics.ts`, diuji dengan collider Rapier map asli): geser–berhenti–tembak diputuskan per burst
    (counterStrafe 0/0.6/0.9; tunggu ≤ 0.15 s sampai < movingSpeed); posisi tempur dari balik cover (`fightSpot`: node cover ≤ 9 u,
    biaya jalur ≤ 1.6× + 2, mata jongkok tersembunyi dari mata ancaman, titik intip = berdiri di balik cover rendah atau geser ±1.6/2.6 u
    yang punya LOS mata berdiri → dada ancaman; siklus sembunyi 0.45–1.1 s ↔ intip 1.2–2.4 s, reload saat sembunyi; peluang pakai
    0.5/0.8/0.95); RELOAD saat terlihat → menuju cover ≤ 10 u (GDD "strafe menuju cover"; dulu strafe acak); EVADE: granat musuh ≤ 10 u
    yang terlihat / terdengar memantul → sadar 50/80/95% → jeda 0.6/0.4/0.25 s → lari ke node yang terhalang dari titik ledak atau
    ≥ 11 u (`fleeNode`; terpojok: minimal menjauh 2 u); kena tembak penyerang tak terlihat → hanya ARAH ±20° & jarak ×0.7–1.3 (dulu
    posisi PERSIS = satu-satunya "cheat" bot) → 70% cari cover ≤ 12 u (sisanya menoleh & investigasi); tertekan (≥ 2 peluru lewat,
    penembak tak terlihat) → cover. TAKE_COVER: biaya JALUR ≤ 25 u (GDD §11.9; dulu jarak lurus) + pengaman keluar 6 s.
    Granat §11.8 hanya ke posisi yang DILIHAT sendiri (`seenAt`), bukan perkiraan/callout (dulu laju lempar sempat 2× lipat).
  - Patroli & tim: titik pandang = ±10 u ke depan sepanjang jalur (mengantisipasi belokan), lirik node yang BARU terlihat 6–40 u di
    depan/samping (4 raycast per think, cooldown 4 s per node, sisi lawan diutamakan), arah waspada (kena tembak / peluru lewat /
    callout) 2.5 s, arah investigasi; sprint hanya di luar zona kontak (node sisi lawan / waspada ≤ 8 s / laporan musuh ≤ 35 u);
    jeda 0.35–0.9 s (30%) di persimpangan ≥ 3 cabang sambil melirik cabang lain; callout `BotDirector` (jeda 0.9–1.8 / 0.6–1.4 /
    0.5–1.0 s, posisi ±2 u, 1 laporan per musuh tiap 2 s, ≤ 45 u; responden ≤ 1/2/2 rekan bebas terdekat → INVESTIGATE, responden
    ke-2 ke node lain ≥ 6 u dari yang pertama; rekan lain hanya menoleh & waspada). `BotDirector.reset()` tiap match / ganti map.
  - Navigasi: node awal jalur = node terdekat yang bisa didatangi LURUS selebar badan (2 sinar lutut ±0.8 + dada; beda tinggi ≤ 6 u,
    juga saat di tangga). Dulu node terdekat saja → bisa di balik dinding (terukur: bot di tangga BH macet ke node arsip; cover di balik
    dinding 50 s). Node awal dilewati hanya bila node kedua juga lurus; macet 3 s → jalur ulang dengan node awal LAIN.
    `GrenadeManager.forEachLive` kini memberi id granat (bot mencatat granat yang sudah disadari).
  - Terukur (bot vs bot 90 s, Normal, pemain dikeluarkan; skrip lokal `.playwright-mcp/bot_measure.js`; lama → baru): akurasi 64–71% →
    29–42%; sprint di setengah map lawan 33–46% → 0%; bot diam sungguhan ≥ 5 s: 0; median tembakan pertama kena setelah melihat
    0.56 → 0.58 s; kena ≤ 1 s setelah melihat 19 → 25%; damage/s saat musuh terlihat 48 → 64; kill/menit BH ±24 → ±29, SY 26 → 29
    (bot menembak di jendela yang dulu dipakai menunggu; dengan gateIntent 0 kembali ±21). Mudah (baru): 36 dmg/s, kena ≤ 1 s 12%,
    median kena 0.99 s. Sulit SY: 36 kill/menit, akurasi 43%. Frame tetap 11.1 ms (MEDIUM, Iris Xe), 0 error konsol.
  - Bila pengguna merasa bot terlalu tajam: turunkan `gateIntent` (≤ 0.4 = mendekati perilaku lama, akurasi naik lagi ±60%) atau
    naikkan `aimLag`; nilai GDD §11.5 tetap perlu persetujuan.

## Status
- Fase selesai: 0–8 (MVP lengkap) + fitur pasca-MVP di atas.
- Verifikasi otomatis: 299 test Vitest / 23 file (test vector §16.1, validator map/nav v2 + spawn 2 lantai + atap ruang bawah, rebind/settings/
  Eliminasi/medali, garis bidik ADS, tempo gerak/pegas/arah langkah, slot senjata/migrasi tombol/pisau/buang-ambil, keyframe pisau, kunci mouse/alt-tab/controller, crosshair kustom, bake cahaya,
  kehalusan frame/interpolasi fisika/material viewmodel, resolusi dinamis sadar refresh/batas FPS, room/lobby, codec jaringan/antrean
  perintah/interpolasi/validasi pesan host, multi-map (tests/maps.test.ts: tiap MapDef), Steel Yard (tests/steelyard.test.ts, Rapier:
  denah, cermin, collider, nav + validate, lane, garis pandang, permukaan, latar luar pagar, collider ↔ visual, pantulan granat),
  pilihan map room/NetStart, antrean pesan klien saat memuat map (HoldQueue), Props/collider dilepas saat ganti map, bot manusiawi
  (tests/botAim.test.ts: profil sentakan/kelewatan/pelacakan/rencana ulang, reaksi, near-miss, perkiraan arah, callout;
  tests/botTactics.test.ts: cover, posisi tempur, kabur granat di collider Rapier SY & BH), kotak hitam & sebab sesi berakhir
  (tests/blackbox.test.ts), pintasan browser saat bermain (tests/input.test.ts), pindah host / cadangan / klaim / tiket
  (tests/migration.test.ts), chat teks / tombol chat / allTalk (tests/chat.test.ts), voice: aturan dengar, kurva jarak, paket, routing
  host (tests/voice.test.ts)) hijau;
  typecheck & build hijau;
  di browser (slot senjata): 1/2/3/Q/scroll, tebas 45 & tusuk belakang membunuh dummy, lari pisau 8.91/12.62 u/s (×1.10), buang → jatuh &
  diam di lantai, ambil/tukar menjaga isi magazine, musuh tidak bisa mengambil, respawn kembali ke loadout pilihan, bot granat tetap normal;
  di browser: TDM/Eliminasi/Latihan berjalan 0 error konsol; killcam → respawn 4 s; menonton rekan; gamepad tiruan (gerak/bidik/tembak/pause/menu);
  map v2 (TDM, Iris Xe): frame median 11.1 ms (p95 13.1), draw call rata-rata 106 / maks 121, tris maks ±45k;
  Steel Yard: TDM/Eliminasi/Latihan, semua preset, ganti map tanpa reload, room online 2 jendela — lihat "Multi-map & Steel Yard".
- Belum diverifikasi di perangkat acuan: prosedur 16.3 (Stress Test, panel ` → "Stress Test") di laptop Iris Xe; rasa mouse/gamepad asli.
- Uji otomatis tanpa pointer lock: http://localhost:5173/?autostart=1 (atau =elim / =practice) + `&map=steelyard|brickhall`;
  window.__ctx / window.__game tersedia (`__game.prepareMap(id)` ganti map di menu, `__game.mapId`). Catatan: Mulai room menyimpan aturan
  room (termasuk map) ke settings → setelah uji room, `?autostart` tanpa `&map=` bisa memuat map lain.
- Uji online 2 jendela (Playwright, same context): host `?signal=local` → `window.open(url + '&popup=1')` untuk klien (tab terpisah tidak
  jalan — rAF tab tersembunyi berhenti); `__game.autoTest = true` + `Object.defineProperty(__game.input, 'captured', {get: () => true})`;
  `__game.createRoom / joinRoom / roomAct / startRoom` (map: `roomAct({type: 'settings', patch: {map: 'steelyard'}})`); input lewat
  `input.down` / `input.rawMouse`; init script Playwright lewat `page.context().addInitScript` agar ikut ke popup. Modul (physics, bus) diambil dengan
  `import(url)` dari `performance.getEntriesByType('resource')` (URL ber-?t= setelah HMR).
- Catatan teknis penting: lihat "Keputusan implementasi". Bot juga mempertimbangkan granat saat INVESTIGATE
  (posisi terakhir target tak terlihat, 8–24 u) karena duel di layout ini umumnya selesai sebelum target "hilang" di ENGAGE.
- Catatan desain (nilai bot GDD tidak diubah): di map v1 bot Normal (sight 65) berduel antar-mezanin ±60 u → ±30–35 kill/menit;
  map v2 memotong garis pandang panjang → ±20 kill/menit, median jarak kill ±24 u (match TDM 50 kill ±2,5 menit).
  Menurunkan akurasi/jarak pandang bot tetap perlu persetujuan.
