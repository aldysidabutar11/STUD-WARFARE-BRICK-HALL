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
  - Belum dikerjakan: ide 7 (map kedua) — butuh layout, nav graph, rute bot & test sendiri; tunggu persetujuan/tema dari pengguna.
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
    (aturan senjata sama persis dengan pemain lokal), snapshot 20 Hz per klien (ack + keadaan sendiri), event reliable spawn (+loadout/varian)
    / kill / assist / hit (hanya penyerang & korban) / mstate / boom / stats tiap 1 s / notice / abort, lag compensation = riwayat
    matrixWorld hitbox per frame (jarak ≥ ½ tick, label `fixedIndex − 1 + alpha`) di-rewind ke viewTick penembak ≤ 250 ms;
    ClientRep: perintah per tick (dikirim tiap tick + 2 sebelumnya), rekonsiliasi (setState host + putar ulang `quiet`), koreksi visual
    `smooth` meluruh 120 ms, boneka diinterpolasi 7 tick di belakang, efek tembakan/granat/suara dari snapshot, HP sendiri dari snapshot).
  - Game: `ctx.net.role` offline|host|client (+ seed spread `shotRandom` = seed ^ id ^ tembakan ke-n per nyawa → spread prediksi = host).
    Room yang dibuat selalu membuka NetHost; Mulai dengan ≥ 1 teman terhubung → match online (id entitas per slot: Biru 1…5, Merah 6…10;
    pesan 'start' dulu, lalu spawn tersiar); tanpa teman → match lokal seperti biasa. Klien: semua entitas lain `puppet` (tanpa KCC/AI),
    damage/spawn hanya dari host (TeamManager.applyDamage return di klien), `MatchManager.startPuppet/applyNet`. Online: tanpa jeda penuh,
    slow-mo akhir match & slowmo debug (waktu host = klien); buang/ambil senjata & Latihan offline saja; killcam tetap jalan.
    Host keluar di tengah match → 'abort' (semua ke room, pesan di status room); klien keluar di tengah match = keluar room → slotnya
    TacticalBot (HostRep.onPeerLeft). Hasil: host "Main Lagi" (mulai lagi untuk semua; status siap tidak direset online) / klien menunggu.
    `GameLoop.setKeepAlive(true)` saat host: Worker (blob) menjalankan frame tanpa render bila rAF berhenti > 100 ms (tab di belakang).
  - UI (Menus.showLobbyHome(back, code, message) / showRoom(notice) / refreshRoom, CSS hud.css): Gabung = koneksi sungguhan dengan pesan
    gagal (notfound/full/started/timeout/failed); badge status (Menyiapkan / Online — n teman / Uji lokal / Terhubung ke host);
    aksi room lewat `MenuApi.roomAct` (host: ubah + siarkan; klien: kirim ke host); "＋ Teman (simulasi)" hanya host (dimainkan bot).
  - Terukur (2 jendela Chromium, signaling antar-tab): gabung ±0.8 s; posisi klien = host (< 0.002 u); koreksi prediksi: f32 → 7 per
    5 s gerak menempel rak, f64 → 1 per 8 s; dengan `?netlag=55&netjitter=15&netloss=2` (ping ±120 ms) 0 koreksi; tembak target strafe
    12 u: kena 98% dengan lag compensation vs 86% tanpa; keep-alive: rAF host dimatikan → tetap 59 tick/s & 19.9 snapshot/s.
    Supabase asli (project milik pengguna; URL + publishable key di `.env.local`, di-.gitignore — jangan ditulis ke file yang di-commit):
    room siap ±2.1 s (termasuk memuat chunk Supabase), gabung ±1.9 s, WebRTC tersambung, 20 snapshot/s, "Host menutup room." sampai.
    Belum diuji: dua perangkat/jaringan berbeda (NAT sungguhan), 3+ pemain, TURN; deploy Vercel (env harus diisi sebelum build).
  - Input: keydown di kolom teks (input non-range / textarea) tidak dicegah & tidak jadi input game (Spasi bisa diketik).

## Status
- Fase selesai: 0–8 (MVP lengkap) + fitur pasca-MVP di atas.
- Verifikasi otomatis: 153 test Vitest (test vector §16.1, validator map/nav v2 + spawn 2 lantai + atap ruang bawah, rebind/settings/
  Eliminasi/medali, garis bidik ADS, tempo gerak/pegas/arah langkah, slot senjata/migrasi tombol/pisau/buang-ambil, keyframe pisau, kunci mouse/alt-tab/controller, crosshair kustom, bake cahaya,
  kehalusan frame/interpolasi fisika/material viewmodel, resolusi dinamis sadar refresh/batas FPS, room/lobby, codec jaringan/antrean
  perintah/interpolasi/validasi pesan host) hijau; typecheck & build hijau;
  di browser (slot senjata): 1/2/3/Q/scroll, tebas 45 & tusuk belakang membunuh dummy, lari pisau 8.91/12.62 u/s (×1.10), buang → jatuh &
  diam di lantai, ambil/tukar menjaga isi magazine, musuh tidak bisa mengambil, respawn kembali ke loadout pilihan, bot granat tetap normal;
  di browser: TDM/Eliminasi/Latihan berjalan 0 error konsol; killcam → respawn 4 s; menonton rekan; gamepad tiruan (gerak/bidik/tembak/pause/menu);
  map v2 (TDM, Iris Xe): frame median 11.1 ms (p95 13.1), draw call rata-rata 106 / maks 121, tris maks ±45k.
- Belum diverifikasi di perangkat acuan: prosedur 16.3 (Stress Test, panel ` → "Stress Test") di laptop Iris Xe; rasa mouse/gamepad asli.
- Uji otomatis tanpa pointer lock: http://localhost:5173/?autostart=1 (atau =elim / =practice); window.__ctx / window.__game tersedia.
- Uji online 2 jendela (Playwright, same context): host `?signal=local` → `window.open(url + '&popup=1')` untuk klien (tab terpisah tidak
  jalan — rAF tab tersembunyi berhenti); `__game.autoTest = true` + `Object.defineProperty(__game.input, 'captured', {get: () => true})`;
  `__game.createRoom / joinRoom / roomAct / startRoom`; input lewat `input.down` / `input.rawMouse`. Modul (physics, bus) diambil dengan
  `import(url)` dari `performance.getEntriesByType('resource')` (URL ber-?t= setelah HMR).
- Catatan teknis penting: lihat "Keputusan implementasi". Bot juga mempertimbangkan granat saat INVESTIGATE
  (posisi terakhir target tak terlihat, 8–24 u) karena duel di layout ini umumnya selesai sebelum target "hilang" di ENGAGE.
- Catatan desain (nilai bot GDD tidak diubah): di map v1 bot Normal (sight 65) berduel antar-mezanin ±60 u → ±30–35 kill/menit;
  map v2 memotong garis pandang panjang → ±20 kill/menit, median jarak kill ±24 u (match TDM 50 kill ±2,5 menit).
  Menurunkan akurasi/jarak pandang bot tetap perlu persetujuan.
