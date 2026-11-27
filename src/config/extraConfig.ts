// src/config/extraConfig.ts — angka dari prosa & tabel GDD v2 yang tidak punya key di §15.
// (gameConfig.ts & weaponsData.ts tetap salinan verbatim §15; file ini melengkapinya.)

export type Difficulty = 'easy' | 'normal' | 'hard';

export const XCFG = {
  player: {
    regenDelay: 5, regenRate: 8,          // §3.8 (opsi config, default mati)
    protectPulseHz: 4,                    // §3.8
    sprintMinForward: 0.5,                // §3.4 syarat sprint
    // gaya tempel tanah (u/s ke bawah saat menapak). 0: komponen turun kecil membuat KCC Rapier sesekali MEMBATALKAN gerak horizontal
    // di lantai datar (terukur ±2.5% tick sprint = 1–2× per detik → "lari cepat, tiba-tiba pelan"); tetap menapak lewat snapToGround
    // + proyeksi lereng (lihat CLAUDE.md "Kehalusan lari").
    groundStick: 0,
    hipsCrouchY: 0.5,                     // §3.1 / E-02
  },
  // §3.1 rig R6 v2 — ukuran (X,Y,Z), pusat saat berdiri, pivot
  rig: {
    head: { size: [1.2, 1.2, 1.2], mult: 'head' },
    upper: { size: [2.0, 1.2, 1.0] },
    lower: { size: [2.0, 0.8, 1.0] },
    arm: { size: [1.0, 2.0, 1.0] },
    leg: { size: [1.0, 1.8, 1.0] },
    hipsY: 1.8, chestY: 0.8, upperY: 0.6, neckY: 1.2, headY: 0.6,
    shoulderX: 1.5, shoulderY: 1.2, armY: -1.0, hipX: 0.5, legY: -0.9, lowerY: 0.4,
    /** Pose pistol dua tangan (TPS): lengan kanan / kiri berputar ke dalam (derajat) agar tangan bertemu di tengah. */
    pistolCrossDeg: [12, 30],
    weaponMount: [0, -0.9, -0.1],
    // Tampilan karakter = desain pengguna (Karakter/*.png, hanya acuan; dibangun prosedural di CharacterArt.ts).
    // Biru = pasukan taktis, Merah = gerilyawan; masing-masing varian pria/wanita. (Dulu: skema warna klasik §3.1.)
    colors: {
      skin: 0xe8b58e, finger: 0xdcb48a, glove: 0x1d1e21,
      blue: { shirt: 0x3458a6, gear: 0x222428, pants: 0x1f2023, mask: 0x18191b, lens: 0xf0a23a, helmet: 0x26282c,
        headset: 0x3b4137, hair: 0x2c211b },
      // Biru wanita (acuan Karakter/ROBLOX-WANITA-BLUE-TIM.png): loreng biru, baret & lis marun, rambut hitam, tato cokelat muda
      blueF: { camo: 0x5f86c2, camoLight: 0xa6c3e6, camoDark: 0x3a5c98, camoNavy: 0x1e3260, maroon: 0x7c1d2c, beret: 0x8a2433,
        hair: 0x16141a, knit: 0x27375f, strap: 0x1b1c1f, pocketDark: 0x2b2d31, pocketTan: 0xa89070, gold: 0xd4a640,
        lips: 0xc47c74, iris: 0x5b3522 },
      red: { tankM: 0x3a3e3b, tankF: 0x8e9190, jeans: 0x3e5f8d, bandana: 0xb3302b, cap: 0x5f6a39, boot: 0x5c3b27,
        wrap: 0x5a5644, strap: 0x4a4e2c, brass: 0xd3a24a, hairM: 0x3a2a20, hairF: 0x7d3b22 },
      // Venny — karakter khusus realistis (acuan Karakter/ROBLOX-VENNY-BLUE/RED-TIM (KHUSUS).png; entities/venny/): kulit cerah, rambut
      // hitam dikuncir rendah, kaus hitam, rompi pelat abu-arang bertepi biru royal (Biru) / merah tua (Merah), rok span selutut.
      venny: { skin: 0xdc9b78, finger: 0xd09070, hair: 0x140f0d, brow: 0x24170f, iris: 0x351d12, lips: 0xb2423f,
        shirt: 0x141517, shirtRed: 0x1f2120, vest: 0x232526, trimBlue: 0x2b4bb2, trimRed: 0xad2a37, skirt: 0x161618,
        skirtRed: 0x221f1d, boot: 0x1c1b1a, glove: 0x202123, bandana: 0x74202a, bandage: 0xb5a285, plaster: 0xcf9870 },
    },
  },
  // §3.7 animasi prosedural
  anim: {
    breathAmp: 0.02, breathFreq: 2,
    walkOmegaBase: 10, walkOmegaMin: 6, walkOmegaMax: 13, walkAmp: 0.6,
    sprintOmega: 13, sprintAmp: 0.9, sprintShoulderDeg: 45, sprintLeanDeg: 8,
    crouchWalkAmp: 0.2, crouchWalkOmega: 7, airLeg: 0.35,
    holdCrossDeg: -25, neckPitchMult: 0.6, reloadSwingDeg: 50,
    throwOverPull: 200, throwOverSwing: 60, throwUnderPull: -40, throwUnderSwing: 100,
    throwPullTime: 0.15, throwSwingTime: 0.12, throwReturnTime: 0.25,
    crouchStepVolume: 0.4,
  },
  // §9.1 viewmodel
  viewmodel: {
    hip: [0.32, -0.30, -0.62], adsZ: -0.45,
    // ekspansi senjata: pistol (posisi pinggul + lengan dua tangan), reload selongsong, kokang pompa/bolt
    pistolHip: [0.2, -0.24, -0.6], pistolAdsZ: -0.58,
    pistolArms: { right: [0.0, -0.065, 0.02], rightDir: [0.1, -0.85, 0.5], leftDir: [-0.38, -0.8, 0.42] },
    shellReload: { drop: 0.05, rollDeg: 18, pitchDeg: 6, handDrop: 0.05, handBack: 0.03 },
    cycleRollDeg: 7, cycleDrop: 0.012, boltLift: 1.15,
    sprintYawDeg: 35, sprintPitchDeg: -20, sprintPos: [0.2, -0.4, -0.5],
    reloadDrop: 0.15, reloadRollDeg: 25,
    bobX: 0.015, bobY: 0.010, bobSprintMult: 1.6,
    swayMult: 0.0004, swayMax: 0.03, swayReturn: 10,
    kickZ: 0.04, kickPitchDeg: 2.5, kickReturn: 12,
    near: 0.01, far: 10,
  },
  // §7.4 respon visual
  vfx: {
    muzzleTime: 0.03, muzzleLightIntensity: 3, muzzleLightDist: 8,
    tracerTime: 0.05, tracerSize: 0.04, tracerPool: 48,
    shellSize: [0.08, 0.08, 0.2], shellRight: 2.5, shellUp: 1.5, shellLife: 1.2, shellPool: 32, shellBounces: 2,
    decalSize: 0.25, decalOffset: 0.01,
    chipCount: 4, chipSize: 0.12, chipLife: 0.4, chipPool: 64,
    hitFlash: 0.06, hitChips: 6,
    hitmarker: 0.15, killmarker: 0.35,
    dmgIndicatorRadius: 90, dmgIndicatorFade: 1.0, lowHpVignette: 30,
  },
  death: { dvMin: 3.0, dvMax: 4.5, bulletImpulse: 4, omega: 6, shrinkStart: 3.5, shrinkEnd: 3.8 },
  // §8.3 efek ledakan
  explosion: {
    flash: 0.12, smokeCount: 8, smokeLife: 1.5, debrisLife: 1.0, debrisMin: 0.2, debrisMax: 0.35,
    shakeDecay: 0.5, tinnitusHz: 800, tinnitusTime: 1.2, paperGravity: -6, paperDrag: 2.5,
  },
  // §8 code — titik lepas granat
  grenadeThrow: { fpsFwd: 0.6, fpsRight: 0.25, fpsDown: 0.15, underUp: 1.5, underFwd: 0.6, underPitchAdd: 2,
    bounceDot: 0.7, bounceMinSpeed: 1.5 },
  // garis lintasan benda lempar (permintaan pengguna 2026-11-26; Pengaturan → HUD `nadeArc`; vfx/ThrowArcView): titik mulai `skip` u dari
  // titik lepas, jarak antar titik spacing + spacingGrow × jarak kamera, jari-jari dotAng × jarak kamera (ukuran di layar tetap ±3 px,
  // dijepit dotMin…dotMax u); cincin di titik jatuh pertama (jari-jari × (1 + ringGrow × jarak))
  throwArc: {
    maxDots: 110, skip: 1.8, spacing: 0.45, spacingGrow: 0.035, dotAng: 0.0078, dotMin: 0.012, dotMax: 0.35, dotOpacity: 0.9,
    ghost: 0.35,          // lapis "tembus" (tanpa uji kedalaman): opacity × ghost — bagian tertutup badan sendiri / peti tetap samar
    ringInner: 0.42, ringOuter: 0.6, ringOpacity: 0.9, discOpacity: 0.22, burstSize: 0.3, ringGrow: 0.02, lift: 0.04,
    pulse: 0.06, pulseHz: 1.2,
    colorFrag: 0xffb35c, colorFlash: 0xd2ebff,
  },
  // ── flashbang (permintaan pengguna 2026-11-25; bukan GDD): tombol 4, 1 per nyawa, tanpa damage, membutakan SEMUA yang melihat
  //    (termasuk rekan & pelempar). Lempar/masak sama dengan K-400 (fisika CFG.grenade). Durasi dari pengguna: putih total 1.5–3 s,
  //    total sampai jernih 3–5 s.
  flash: {
    perLife: 1,
    fuse: 1.6,            // detik sejak pin dilepas (dimasak terlalu lama = meledak di tangan, membutakan diri sendiri)
    // kekuatan s = arah × jarak (0 bila terhalang dinding): menatap (cos ≥ faceFull ±41°) → 1; membelakangi (cos ≤ faceBackCos)
    // → faceBack (pantulan cahaya); di antaranya linier
    faceFull: 0.75, faceBackCos: -0.5, faceBack: 0.15,
    nearFull: 8, far: 45, // u: kekuatan penuh sampai 8 u, habis di 45 u
    fullAt: 0.5,          // s ≥ 0.5 → buta total (putih penuh lalu pulih bertahap)
    holdMin: 1.5, holdMax: 3.0,   // detik putih total (s 0.5 → 1)
    fadeMin: 1.5, fadeMax: 2.0,   // detik pulih bertahap → total 3–5 s
    mildMin: 0.08,        // s di bawah ini tidak berefek; 0.08–0.5: silau sebagian (puncak s/0.5) tanpa putih total
    mildFade: [0.8, 2.2] as readonly [number, number],
    fadePow: 1.5,         // kurva pulih (1 − u)^1.5: cepat di awal, sisa silau tertinggal
    deafMax: 3.0,         // detik telinga berdenging × s (s ≥ 0.2)
    assistWindow: 3,      // detik: musuh yang dibutakan (s ≥ assistMin) terbunuh rekan pelempar → assist flash
    assistMin: 0.3,
    lookAway: 0.25,       // bot yang sempat memalingkan muka: kekuatan × 0.25
    // pelempar sendiri: × 0.5 (tahu kapan meledak — permintaan pengguna 2026-11-26, adil dengan bot yang selalu memalingkan muka);
    // meledak di tangan (dimasak kelamaan) tetap penuh
    ownerMult: 0.5,
    // bot: peluang sadar & memalingkan muka / peluang memakai flash saat situasinya cocok (Mudah / Normal / Sulit)
    botNotice: { easy: 0.1, normal: 0.35, hard: 0.65 },
    botUse: { easy: 0.3, normal: 0.5, hard: 0.7 },
    botMin: 6, botMax: 34, botAllyClear: 10,   // jarak sasaran (maks 26 → 34 u sejak lempar 34 u/s) & rekan tidak boleh dekat titik ledak
    burst: 0.18,          // detik kilatan VFX
    padDoubleTap: 0.35,   // detik: gamepad RB dua kali cepat = flashbang (RB sekali = K-400)
  },
  // §4.8 / §10.2 properti
  props: {
    bookSize: [0.45, 1.0, 0.6], booksPerCompartment: [3, 2, 3, 2, 3, 2], bookJitter: 0.25, bookYawDeg: 4,
    bookLinDamp: 0.2, bookAngDamp: 0.4, bookLift: 1, piles: 6, perPile: 4,
    papers: 40, paperSize: [0.9, 0.65],
  },
  scoring: { kill: 100, headshotBonus: 25 },          // §12
  spawn: { occupiedRadius: 1.6 },                      // §12
  match: { endSlowMoTime: 1.0, endTimeScale: 0.25 },   // §12 ENDED
  // §11 AI bot
  bots: {
    names: ['Bata', 'Paku', 'Genteng', 'Ubin', 'Kapur', 'Jati', 'Mahoni', 'Meranti', 'Rotan', 'Damar'],
    difficulty: {
      easy:   { reaction: 0.70, fov: 90,  sight: 45, e0: 5.0, eMin: 1.6,  tau: 1.2, turnRate: 240, comp: 0.35, headBias: 0.05, burst: [3, 5],  grenade: 0.2, dropDown: 0 },
      normal: { reaction: 0.45, fov: 110, sight: 65, e0: 3.2, eMin: 0.8,  tau: 0.9, turnRate: 400, comp: 0.60, headBias: 0.12, burst: [4, 7],  grenade: 0.5, dropDown: 0 },
      hard:   { reaction: 0.28, fov: 120, sight: 85, e0: 2.0, eMin: 0.35, tau: 0.6, turnRate: 600, comp: 0.85, headBias: 0.25, burst: [5, 10], grenade: 0.8, dropDown: 0.2 },
    },
    hearing: { shot556: 35, shot762: 50, explosion: 60, sprintStep: 12, walkStep: 6,
      // ekspansi senjata: peredam (dokumen: USP-S 35 → 12 u), sniper / kaliber berat
      suppressed: 12, shotHeavy: 60 },
    // ekspansi senjata: peluang kelas senjata bot (shotgun & sniper/DMR tidak dipakai bot — butuh AI khusus)
    weaponMix: { AR: 0.6, SMG: 0.25, LMG: 0.15 },
    memory: 6, loseTarget: 1.5, investigateMax: 6, investigateNoise: 3,
    spawnIdle: [0.3, 0.8], patrolExplore: [10, 20],
    strafeInterval: [0.6, 1.2], crouchChance: 0.3, crouchDist: 25, adsDist: 20,
    coverHp: 35, coverSafe: 2, coverMaxCost: 25,
    burstPause: [0.25, 0.45], burstPauseFar: 0.2, burstPauseFarDist: 40,
    errReroll: 0.4, errSlerp: 8, fireDevHip: 2.5, fireDevAds: 1.2,
    // v2 (rombak map): + jalur arsip (lantai 1 beratap); bobot GDD lama: jembatan .35, barat .20, timur .20, lantai .25
    lanes: { bridge: 0.30, west: 0.15, east: 0.15, floor: 0.20, archive: 0.20 }, lanePerTeamMax: 2,
    // Steel Yard (map kedua): sayap (Lorong Kontainer → Pos Jaga), dalam (Bangkai Mobil → Tengah → Pos Jaga), tengah (Lorong
    // Tengah → Gudang Spool → Menara), apit (celah Apit → Gudang Spool → Menara) — sisi W/E = sisi bot (maps/steelyard/nav.ts)
    lanesSteelYard: { sayap: 0.30, dalam: 0.25, tengah: 0.25, apit: 0.20 },
    // Boston (map ketiga, asimetris 2 lantai; dokumen pengguna §7): Veranda L4, Garden Lounge tengah L3, flank Tangga Cokelat /
    // Servis, Jalur Sofa Timur — rute Biru (L4) & Merah (L3) berbeda per jalur (maps/boston/nav.ts)
    lanesBoston: { veranda: 0.35, lounge: 0.30, flank: 0.20, sofa: 0.15 },
    // granat bot (§11.8). Lempar 34 u/s (2026-11-26, GDD 24): jarak maks 24 → 32 u; batas masak rumus §11.8 2.0 → 2.8 s — di 34 u/s
    // granat tiba lebih cepat & menggelinding jauh melewati sasaran sebelum meledak (terukur 3 map, 8–24 u: kena 77–81% → 40–60%,
    // damage rata 62–72 → 37–55); 2.8 = "meledak sesaat (0.4 s) setelah tiba" seperti maksud GDD → kena 91–98%, damage rata 71–82
    grenadeMin: 8, grenadeMax: 32, grenadeAllyClear: 8, grenadeCooldown: 6, grenadeCookMax: 2.8,
    arriveRadius: 1.2, separation: 2.0, stuckDist: 0.5, stuckJump: 1.5, stuckRepath: 3.0, stairCost: 1.2,
    thinkEveryFixedSteps: 6,
    // ── Bot manusiawi (permintaan pengguna 2026-11-25: "bot kurang realistis"; disetujui 3 paket bidikan/tempur/patroli & tim).
    //    Lapisan DI ATAS GDD §11 — tabel kesulitan §11.5 di atas (reaksi, FOV, jarak pandang, e0/eMin/τ, turn rate, kompensasi
    //    recoil, bias kepala, burst, granat) TIDAK diubah. Lihat CLAUDE.md "Bot manusiawi".
    human: {
      // gerak bidik (entities/botAim.ts): sentakan berprofil minimum-jerk dengan kecepatan PUNCAK = turn rate GDD, lalu
      // pelacakan halus (koreksi proporsional + feedforward kecepatan sudut target). flickMinDeg: galat > ini → sentakan baru.
      aim: { flickMinDeg: 7, trackGain: 12, trackFeed: 0.85, minFlickT: 0.08, undershoot: 0.05, scatter: 0.04 },
      // menoleh santai (patroli, cek sudut): kecepatan puncak = turn rate × speedMult
      look: { speedMult: 0.45, flickMinDeg: 10, trackGain: 6, trackFeed: 0.6, overshootChance: 0.2, overshoot: [0.03, 0.08] },
      // waktu reaksi: rata-rata ≈ nilai GDD. × acak (jitter) × (1 + periph·(sudut/½FOV)²) × (1 + far·jauh) × alerted × prepared
      // (prepared = target muncul ≤ preparedDeg dari arah bidik; alerted = ≤ alertDeg dari arah waspada ≤ alertHold s terakhir)
      react: { jitter: [0.8, 1.2], periph: 0.35, outsideFov: 1.5, far: 0.25, alerted: 0.85, prepared: 0.85, preparedDeg: 15,
        alertDeg: 35, clamp: [0.7, 1.8] },
      // syarat tembak GDD §11.4 (deviasi < 2.5° hip / 1.2° ADS) diukur terhadap titik bidik yang DIMAKSUD (target + error GDD),
      // bukan pusat target sebenarnya: 1 = penuh, 0 = perilaku lama. Dulu error GDD hanya MENUNDA tembakan (bot menunggu sampai
      // pas) → akurasi bot 64–71%; kini tembakan awal bisa meleset lalu membaik seiring error menyusut (maksud §11.4).
      gateIntent: 1,
      startle: { decay: 0.45, max: 6 },          // kaget (derajat) meluruh exp(−t/decay); total maks
      nearMiss: { radius: 1.6, alertNoise: 0.15 },// peluru musuh lewat ≤ radius dari kepala; perkiraan posisi penembak ± jarak × noise
      hitDir: { angNoiseDeg: 20, dist: [0.7, 1.3], coverChance: 0.7 }, // kena tembak penyerang tak terlihat: arah ± noise, jarak ×
      suppress: { decay: 1.0, cover: 2 },        // tingkat tertekan turun 1/s; ≥ cover & penembak tak terlihat → cari cover
      // bertarung dari balik cover: node cover ≤ maxDist (biaya jalur ≤ 1.6× + 2) yang menyembunyikan mata jongkok dari ancaman,
      // titik intip = berdiri (cover rendah) atau geser ±offset tegak lurus. Siklus sembunyi (hide) ↔ intip (peekTime).
      fight: { maxDist: 9, offsets: [1.6, 2.6], hide: [0.45, 1.1], peekTime: [1.2, 2.4], research: 1.0, minDist: 8,
        reloadBelow: 0.5, peekLost: 0.8, hitBack: 0.6 },
      coverReloadMax: 10, coverHitMax: 12,       // u: cari cover saat reload terlihat musuh / kena tembak dari arah tak terlihat
      coverTimeout: 6,                           // s: pengaman TAKE_COVER (cover tak tercapai) → keluar seperti aturan GDD
      plantWait: 0.15,                           // s maks menunggu berhenti sebelum burst (geser–berhenti–tembak)
      grenade: { danger: 10, flee: 16, safe: 11, hearBounce: 8, maxEvade: 3.5 },
      patrol: { lookAhead: 10, checkMin: 6, checkMax: 40, checkPerThink: 4, glance: [0.5, 1.0], glanceCd: 4, pauseChance: 0.3,
        pause: [0.35, 0.9], contactReport: 35, contactHold: 8, alertHold: 2.5 },
      callout: { throttle: 2.0, range: 45, noise: 2.0, altMin: 6, altMax: 12 },
      // aimLag (s): bidikan tertinggal di belakang target yang bergerak (pengejaran visual manusia) — strafe pemain berguna.
      // Disetel (bersama react.prepared/alerted 0.85) agar laju kena setelah melihat musuh ≈ bot lama (terukur, lihat CLAUDE.md).
      diff: {
        easy:   { overshootChance: 0.55, overshoot: [0.06, 0.18], counterStrafe: 0,   peek: 0.5,  startleHit: 3.0, startleNear: 1.6,
          grenadeNotice: 0.5,  grenadeReact: 0.6,  callout: [0.9, 1.8], responders: 1, aimLag: 0.14 },
        normal: { overshootChance: 0.40, overshoot: [0.04, 0.12], counterStrafe: 0.6, peek: 0.8,  startleHit: 2.0, startleNear: 1.1,
          grenadeNotice: 0.8,  grenadeReact: 0.4,  callout: [0.6, 1.4], responders: 2, aimLag: 0.10 },
        hard:   { overshootChance: 0.25, overshoot: [0.03, 0.08], counterStrafe: 0.9, peek: 0.95, startleHit: 1.2, startleNear: 0.7,
          grenadeNotice: 0.95, grenadeReact: 0.25, callout: [0.5, 1.0], responders: 2, aimLag: 0.07 },
      },
    },
  },
  // §10 audio
  audio: {
    compressor: { threshold: -14, knee: 10, ratio: 6, attack: 0.003, release: 0.12 },
    tinnitusBypass: 20000,
    priority: { own: 5, ui: 4, explosion: 3, enemyShot: 2, impact: 1, footstep: 0 },
    occlusion: { lowpass: 1200, gain: 0.6, recheck: 0.1, longSound: 0.5 },
    // listener 3D diperbarui maks. 30x/detik, hanya bila kamera bergerak/berputar dan konteks audio berjalan
    // (9 setValueAtTime tiap frame: ±0.7% waktu CPU main thread; saat konteks suspended event menumpuk → jauh lebih mahal)
    listener: { interval: 1 / 30, moveSq: 1e-4, turnDot: 0.99995 },
    panner: {
      shot:      { model: 'HRTF', dist: 'inverse', ref: 5, max: 80, rolloff: 1.0 },
      explosion: { model: 'HRTF', dist: 'inverse', ref: 8, max: 120, rolloff: 0.8 },
      footstep:  { model: 'HRTF', dist: 'linear', ref: 2, max: 30, rolloff: 1.0 },
      impact:    { model: 'equalpower', dist: 'linear', ref: 2, max: 25, rolloff: 1.0 },
    },
  },
  // §13 HUD
  // crosshair kustom (pasca-MVP): mekar tembakan per peluru / maks (px) & pulih (px/s), jarak garis luar mode Hybrid
  hud: { crosshairLen: 8, crosshairWidth: 2, crosshairBaseGap: 3, xhFireKick: 5, xhFireMax: 16, xhFireRecover: 32, xhSplitGap: 3,
    hpBar: [220, 10], killFeedMax: 5, killFeedTime: 5,
    lensDiameter: 0.84,
    // bintang kill di kanan bar HP (permintaan pengguna 2026-11-27; ui/KillStars.ts): maks bintang (sisanya angka "+N"), kelompok per
    // `group` (selaras medali KILLING SPREE 5 / RAMPAGE 10), jari-jari dalam bintang ÷ luar, durasi animasi muncul / pudar (+ jeda
    // berurutan per bintang) dalam ms
    killStars: { max: 10, group: 5, inner: 0.46, popMs: 380, outMs: 320, outStaggerMs: 35 } },
  menu: { orbitRadius: 48, orbitHeight: 26, orbitSpeed: 0.06 },

  // ── fitur pasca-MVP / pembanding game FPS lain (BUKAN dari GDD; angka desain baru, mudah disetel di sini)
  melee: { damage: 55, backDamage: 100, range: 3.4, hitDelay: 0.12, duration: 0.45, cooldown: 0.35, coneDeg: 9, backDot: 0.5,
    botRange: 3.6, botChance: 0.6 },
  // slot 2 = pisau (permintaan pengguna): lari ×1.10, tebas (klik kiri) & tusuk (klik kanan); jangkauan/kerucut/aturan
  // "dari belakang" sama dengan melee. Jeda serangan = duration (tahan klik = serangan berulang).
  knife: {
    equipTime: 0.30, speedMult: 1.10,
    slash: { damage: 45, backDamage: 90, hitDelay: 0.10, duration: 0.45 },
    stab: { damage: 70, backDamage: 100, hitDelay: 0.24, duration: 1.0 },
    // tampilan (bukan gameplay): skala pisau FPS/TPS, siku FPS (titik putar ayunan), jejak kilatan, hentakan kamera
    vmScale: 0.36, tpsScale: 1.4, slashResetTime: 1.0,
    trail: { life: 0.11, alpha: 0.6, samples: 14 },
    punch: { omega: 16, zeta: 0.42, slashYaw: 1.8, slashRoll: 3.0, slashPitch: -0.8, stabPitch: -1.6, stabFov: -4, hitPitch: -1.2, hitShake: 0.6 },
  },
  // ekspansi senjata (dokumen pengguna, bukan GDD): reload per selongsong (shotgun) & kokang pompa/bolt setelah tiap tembakan.
  // shellStart = jeda sebelum selongsong pertama; menembak saat reload selongsong → reload berhenti, tembakan setelah shellInterrupt.
  // Kokang: animasi mulai cycleDelay s setelah tembakan, selesai cycleTail s sebelum tembakan berikutnya boleh (60/rpm).
  weapons: { shellStart: 0.35, shellInterrupt: 0.12, cycleDelay: 0.12, cycleTail: 0.16, slideTime: 0.09 },
    // G = buang senjata utama; hanya tim sendiri yang bisa mengambil/menukar (E). Benda fisik grup DEBRIS (tidak menahan peluru/karakter).
  drop: { throwSpeed: 5.0, throwUp: 2.5, inheritVel: 0.5, pickupRange: 2.8, pickupDyMin: -1.5, pickupDyMax: 4.5,
    lifetime: 60, max: 6, density: 1.2, friction: 0.8, restitution: 0.15, linDamp: 0.3, angDamp: 0.8, toastTime: 1.6 },
  elim: { roundTime: 120, roundEnd: 3.5, roundsToWin: 5 },
  practice: { dummyRespawn: 2.0, moverRange: 5.0 },
  killcam: { hz: 30, history: 6, deathCam: 0.9, preDeath: 2.8, postDeath: 0.3, noReplayHold: 2.2, unitToMeter: 0.36 },
  radar: { size: 184, range: 42, pxPerUnit: 5, shotReveal: 1.6, spotReveal: 1.2, levelDiff: 5 },
  nameplate: { allyRange: 90, enemyLinger: 0.45, height: 6.2, heightCrouch: 4.9 },
  announce: { multiWindow: 4.0, assistWindow: 10, assistScore: 50, killCreditWindow: 5, medalTime: 1.8, popupTime: 1.5 },
  pad: { deadzone: 0.15, lookDegPerSec: 210, curve: 2.0, trigger: 0.35, aimSlow: 0.55 },
  // pindah aplikasi / kunci mouse ulang (laporan pengguna: kursor "kebawa" & senjata menembak sendiri setelah alt-tab):
  // abaikan gerak mouse sesaat setelah terkunci + lonjakan absurd, klik baru wajib setelah jeda aman, trigger controller harus
  // kembali < padRearm dulu, controller aktif hanya lewat tombol (bukan stik/derau), tunggu kunci terkonfirmasi ≤ lockWaitMs.
  input: { lockSettleMs: 120, spikePx: 800, fireGuardMs: 150, padRearm: 0.2, padTriggerActivate: 0.6, lockWaitMs: 400 },
  heartbeat: { hp: 30, interval: 0.85 },
  // hentakan kamera saat mendarat: pegas teredam (omega rad/s, zeta), puncak turun = base + perUnit·tinggi jatuh
  landKick: { min: 0.6, base: 0.10, perUnit: 0.03, max: 0.45, omega: 14, zeta: 0.6 },
  // "Rasa gerak" (pengguna: "gerak karakter terlalu kaku") — lapisan visual di atas gerak GDD; semua ×pengaturan Gerak kamera
  feel: {
    // tempo gerak per map (pengguna 2026-11-25: "di Steel Yard lari/jalan terasa lambat/berat, beda banget dengan Brick Hall").
    // Terukur: kecepatan & FPS identik, tapi di ruang terbuka pemandangan "mengalir" 27–33% lebih lambat pada kecepatan sama
    // (langit 22% layar, benda < 8 u 32% vs 43%) → Steel Yard memakai batas atas rentang uji GDD §3.4 ("bila terasa lambat, uji
    // 1.25–1.5"). Tempo = skala waktu (moveFeel): lintasan lompat/jatuh di RUANG tetap identik. Map lain: CFG.player.moveSpeedScale.
    mapTempo: { steelyard: 1.5 } as Readonly<Record<string, number>>,
    // kamera FPS: ayunan kepala sinkron langkah (turun saat kaki menapak), miring saat strafe, FOV melebar saat sprint
    bob: { walkY: 0.085, sprintY: 0.13, x: 0.045, rollDeg: 0.35, adsMult: 0.2, rate: 9 },
    strafeRollDeg: 1.2, rollRate: 8, sprintFovDeg: 6, fovRate: 6,
    // viewmodel: inersia (pegas) terhadap kecepatan lokal, ayun vertikal di udara, pegas mendarat, napas saat diam
    vm: { lagX: 0.0028, lagZ: 0.0014, lagYawDeg: 1.2, rollDeg: 4, tiltPerLagZ: 1.6, omega: 12, zeta: 0.65,
      vyMult: 0.0035, vyMax: 0.035, adsMult: 0.12,
      land: { base: 0.012, perUnit: 0.006, max: 0.06, omega: 13, zeta: 0.5 },
      breatheY: 0.0025, breatheX: 0.0015, breatheHz: 0.22 },
    // rig karakter: transisi pose halus, kaki menghadap arah gerak, putar di tempat dengan kaki melangkah, hentakan mendarat
    anim: { blendRate: 12, leanRate: 10, lowReadyRate: 14, airRate: 12,
      // setengah belakang (mundur-serong): masuk bila arah gerak > 90°+20°, keluar bila < 90°+7° → strafe murni selalu "depan"
      strideYawMult: 0.6, strideYawMaxDeg: 55, strideYawRate: 10, strideBackEnter: 0.35, strideBackExit: 0.12,
      turnThreshDeg: 50, turnRateDeg: 420, turnStep: 0.45, sprintArmSwingDeg: 10,
      landDip: 0.28, landOmega: 15, landZeta: 0.5 },
  },
  // ── grafik realistis (permintaan pengguna: "lebih realistis, detail & pencahayaan lebih real"; gaya blocky GDD tetap).
  //    Fitur per preset: LOW minimal · MEDIUM (Iris Xe, target 60 fps) material PBR + pantulan + bake + kabut + debu ·
  //    HIGH + bloom/grading + lampu moncong · ULTRA + SSAO + bayangan 4096. Saklar per efek di Pengaturan → Grafik.
  gfx: {
    /** Konteks WebGL hilang: tunggu pemulihan dari browser sekian detik sebelum menawarkan tombol "Muat ulang halaman". */
    recoverWaitS: 10,
    profiles: {
      LOW:    { pbr: false, normalMaps: false, env: false, fog: true, post: false, bloom: false, ssao: false, dust: false, shafts: false },
      MEDIUM: { pbr: true,  normalMaps: true,  env: true,  fog: true, post: false, bloom: false, ssao: false, dust: true,  shafts: true,  muzzleLight: false },
      HIGH:   { pbr: true,  normalMaps: true,  env: true,  fog: true, post: true,  bloom: true,  ssao: false, dust: true,  shafts: true,  muzzleLight: true },
      ULTRA:  { pbr: true,  normalMaps: true,  env: true,  fog: true, post: true,  bloom: true,  ssao: true,  dust: true,  shafts: true,  muzzleLight: true },
    },
    /** Preset render ULTRA (di luar §15 GDD): resolusi & bayangan lebih tinggi untuk GPU kuat. */
    ultra: { maxPixelRatio: 2.0, maxInternalPixels: 5_200_000, antialias: true, shadowMap: 4096, anisotropy: 16, decals: 200, debris: 48, sunIntensity: 2.6 },
    exposure: 1.4,
    fog: { color: 0x2a1f17, density: 0.0042 },
    // cahaya (pengali terhadap nilai GDD §4.7 / §15) — tone mapping ACES menekan highlight → matahari & langit dinaikkan sedikit
    light: { sunMul: 1.35, hemi: 1.32, envIntensity: 0.6, vmHemi: 1.5, vmDir: 1.3, window: 0.55 },
    // bake cahaya (world/LightBake.ts): sel okupansi 0.5 u, sel cahaya 1 u, subdivisi muka besar ≤ subdiv u
    bake: { aoCell: 0.5, cell: 1.0, subdiv: 2.0, skyLambda: 16, bounceLambda: 5, windowSky: 0.65, aoStrength: 0.85,
      ambMin: 0.42, bounceColor: 0xffa860, bounceStrength: 0.6, aoDirect: 0.35, probeMin: 0.45 },
    // kekasaran material PBR (0 = cermin, 1 = doff)
    rough: { top: 0.62, side: 0.82, bottom: 0.9, book: 0.78, plain: 0.95, tile: 0.28, metal: 0.32, wood: 0.5, weapon: 0.45 },
    bloom: { strength: 0.42, radius: 0.5, threshold: 0.85 },
    grade: { vignette: 0.32, saturation: 1.07, contrast: 1.05, warmth: 0.025 },
    dust: { count: 560, size: 0.055, opacity: 0.55 },
    shaft: { opacity: 0.11 },
    // kepulan debu saat peluru mengenai permukaan (1 draw call Points)
    puff: { pool: 32, life: 0.55, size0: 0.35, size1: 1.5, alpha: 0.45, rise: 0.6 },
  },
  // ── lobby / room (permintaan pengguna: main bareng teman 5v5, slot kosong diisi bot). Tahap 1 = tampilan + logika room LOKAL;
  //    server online menyusul (pengguna mencari hosting gratis). teamSize = 5 sesuai 5v5 GDD (§12: 4 bot sekutu + pemain vs 5 bot).
  lobby: {
    teamSize: 5,
    codeLen: 6,
    codeAlphabet: 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789',   // tanpa I/O/0/1 (mudah dibaca & didiktekan)
    nameMax: 16,
    // nama bot per slot: Biru memakai 5 nama pertama, Merah 5 berikutnya (XCFG.bots.names)
    simNames: ['Raka', 'Dimas', 'Sinta', 'Bayu', 'Nadia', 'Fajar', 'Putri', 'Rizky', 'Ayu'],   // teman simulasi (pratinjau tanpa server)
    simReady: [0.8, 2.6],                                // teman simulasi siap setelah jeda acak (detik)
  },
  // ── chat teks tim & semua (permintaan pengguna 2026-11-25; berlaku di room, match & layar hasil). Y = semua, U = tim, H = pesan cepat.
  chat: {
    maxLen: 120,          // karakter per pesan (emoji dihitung utuh)
    burst: 4,             // anti-spam: maks 4 pesan beruntun…
    refill: 1.5,          // …lalu 1 pesan tiap 1.5 s (host menegakkan per pemain)
    showSec: 8,           // pesan di HUD memudar setelah 8 s (tampil lagi saat kotak chat dibuka)
    feedMax: 7,           // baris di HUD
    logMax: 60,           // riwayat yang disimpan (panel room / layar hasil)
    botGap: 6,            // callout bot di chat tim: maks 1 pesan per tim tiap 6 s…
    botZoneGap: 15,       // …dan area yang sama tidak diulang dalam 15 s
    quickTimeout: 5,      // menu pesan cepat (H) tertutup sendiri setelah 5 s
  },
  // ── voice chat push-to-talk (permintaan pengguna 2026-11-25): T tim / Z semua; Opus (WebCodecs) lewat koneksi game, host meneruskan.
  //    Di match KEDUANYA berdasarkan jarak karakter: jelas sampai `near`, makin jauh makin kecil & teredam, hilang di ujung-ke-ujung map.
  voice: {
    near: 12,             // u (±4 m): jelas penuh
    farFrac: 0.95,        // hilang di 95% diagonal batas map (Brick Hall ±111 u, Steel Yard ±133 u)
    curve: 2,             // gain = (1 − x)^curve, x = 0 di near … 1 di far (tengah map ±25%, ujung ke ujung 0)
    cutoffNear: 12000,    // Hz lowpass dekat …
    cutoffFar: 900,       // … jauh (suara teredam)
    occlGain: 0.55,       // terhalang dinding/kontainer: gain × 0.55 …
    occlCutoff: 0.45,     // … & cutoff × 0.45
    occlEvery: 0.2,       // detik: cek garis pandang per pembicara
    bitrate: 24000,       // bit/s Opus mono
    jitter: 0.06,         // detik: jeda buffer pemutaran (paket datang tidak rata)
    maxLag: 0.35,         // detik: antrean pemutaran maksimal (lebih → potongan dibuang agar tetap real-time)
    talkHold: 0.35,       // detik: indikator bicara bertahan setelah paket terakhir
    maxRate: 60,          // host: paket per detik per pemain maksimal (Opus 20 ms = 50/s)
  },
  // ── multiplayer online (disetujui pengguna: WebRTC host–client; signaling Supabase / antar-tab). Host = otoritatif (listen server):
  //    simulasi penuh di browser host; klien memprediksi gerak sendiri + interpolasi pemain lain; host me-rewind hitbox (lag compensation).
  net: {
    cmdEvery: 1,          // klien kirim perintah tiap tick (60 paket/s, ±6 KB/s) → antrean di host rata, jeda minimal ...
    cmdRedundancy: 3,     // ... berisi 3 perintah terakhir (tahan paket hilang di kanal unreliable)
    snapEvery: 2,         // host kirim snapshot tiap 2 tick (30 Hz) — permintaan pengguna "perbaikan ping"
    // jeda interpolasi ADAPTIF (tick): interval snapshot + keterlambatan p95 (relatif kedatangan tercepat) + cadangan,
    // + 1 interval bila ada paket hilang dalam `interpWindow` detik. Naik cepat (hindari macet), turun pelan (tanpa lompatan).
    interpInit: 6,        // awal match (±100 ms) sampai ada data
    interpMin: 3,         // ±50 ms (jaringan bagus)
    interpMax: 12,        // ±200 ms (jaringan buruk)
    interpSafety: 1,      // cadangan 1 tick
    interpWindow: 2,      // detik riwayat jitter / paket hilang
    interpRise: 0.25,     // perubahan jeda per tick waktu saat naik (cepat)
    interpFall: 0.03,     // ... saat turun (pelan: ±3% waktu tampil lebih cepat — tak terasa)
    extrapTicks: 3,       // snapshot telat → pemain lain diteruskan searah geraknya maks 3 tick (50 ms), bukan berhenti
    backlogSlow: 16384,   // antrean kirim ke satu klien > 16 KB (upload host penuh) → klien itu 15 Hz selama slowHold detik
    slowHold: 3,
    backlogDrop: 49152,   // > 48 KB → snapshot dilewati (data basi lebih buruk daripada tidak ada)
    lagCompMax: 0.25,     // rewind hitbox maksimum (detik)
    lagCompHistory: 48,   // sampel riwayat hitbox (per frame host, jarak antar sampel ≥ ½ tick → ±0.4 s)
    idleCmd: 0.25,        // perintah telat → pemain remote ditahan; > 0.25 s tanpa perintah → dianggap diam (tombol dilepas)
    cmdCatchUp: 3,        // antrean > 3 perintah → host memproses 2 per tick sampai normal (jeda input remote tetap kecil)
    cmdQueueMax: 12,      // antrean > 12 perintah → buang yang terlama (klien terlalu jauh di depan; impuls dipertahankan)
    correctEps: 0.04,     // pemain lokal dikoreksi bila beda posisi > 0.04 u dari host
    smoothT: 0.12,        // koreksi posisi pemain lokal dihaluskan ±120 ms (visual)
    statsEvery: 1.0,      // sinkron statistik papan skor (detik)
    maxShotFx: 48,        // efek tembakan per snapshot (shotgun: 8 pellet per tembakan)
    pingEvery: 2,         // detik: host mengukur ping tiap teman (ping/pong kanal reliable), disiarkan ke semua
    pingWarn: 150,        // ms: ping ≥ 150 → merah + peringatan (room, papan skor, HUD)
    pingGood: 80,         // ms: < 80 hijau, 80–150 kuning
    hitConfirmWindow: 1.0,   // detik: kena hasil prediksi menunggu konfirmasi host (lebih lama → dianggap meleset)
    connectTimeout: 10,   // detik: batas total gabung (termasuk koneksi WebRTC)
    helloTimeout: 4,      // detik: host tidak menjawab kode room → "room tidak ditemukan"
    // ── pindah host & AFK (permintaan pengguna 2026-11-25: "kalau host tiba-tiba keluar, langsung otomatis pindah host")
    saveEvery: 1.0,       // detik: host mengirim cadangan lengkap pertandingan (posisi, HP, amunisi, granat, skor, ronde, waktu)
    planEvery: 5,         // detik: rencana pengganti host (ping terbaik dulu) + kode room berikutnya disiarkan ulang
    hostSilence: 5,       // detik tanpa pesan apa pun dari host (snapshot 30 Hz, ping tiap 2 s) → dianggap hilang (ICE baru ±30 s)
    rejoinWait: 3,        // detik: host hilang → coba sambung ulang ke host LAMA dulu (mungkin hanya kita yang putus)
    migrateStep: 4,       // detik per urutan: pengganti ke-k menunggu host baru sebelum mengambil alih sendiri
    migrateMax: 30,       // detik: batas pindah host bila internet KITA tidak tersambung / tidak ada di rencana → layar Main Bareng
    joinTry: 2.5,         // detik: jendela hello per percobaan gabung saat pindah host (tanpa jadwal pengganti)
    joinConnect: 5,       // detik setelah host baru menjawab hello: WebRTC + room harus tersambung
    helloEvery: 1,        // detik: hello diulang selama belum ada host yang menjawab
    stallShow: 2,         // detik tanpa pesan host (klien, di tengah match) → overlay "koneksi ke host tersendat"
    ticketTtl: 900,       // detik: tiket "Kembali ke match" (sessionStorage) setelah halaman di-refresh / ditutup masih berlaku
    lonelyAfter: 15,      // detik: naik jadi host tapi tak ada teman menyusul → saran "Gabung ke host lama"
    claimEvery: 3,        // detik: host baru hasil pindah host menyiarkan klaimnya (dua pengganti naik bersamaan → yang kalah mengalah)
    afkAfter: 10,         // detik pause / tab tersembunyi / pindah aplikasi di match online → karakter dimainkan bot
    silentAfk: 10,        // host: tanpa perintah sama sekali dari teman selama ini → dimainkan bot (tab teman berhenti total)
    ice: ['stun:stun.l.google.com:19302', 'stun:stun.cloudflare.com:3478'],
  },
  // ── kehalusan frame (laporan pengguna "FPS 60–80 tapi tidak terasa 60–80"; perubahan §2.3 disetujui pengguna).
  //    Resolusi dinamis GDD memakai ambang layar 60 Hz (17.5 / 13 ms): di layar 90 Hz game diam di 60–80 FPS dengan frame
  //    berselang-seling 1–2 vsync (judder). Kini target = interval vsync × batas FPS. Nilai GDD tetap dipakai: CFG.render.dynRes
  //    (min 0.6, max 1.0, langkah 0.1, jeda 2 s) dan waktu baik 4 s dari kode §2.3.
  pacing: {
    fpsCaps: [1, 2, 3],   // pembagi refresh: ikut layar / ½ / ⅓ — selalu rata (60 di layar 90 Hz pasti berselang-seling 1–2 vsync)
    lateDown: 0.05,       // turun bila > 5% frame (±1 s terakhir) telat ≥ 1 vsync ...
    gpuBusy: 0.5,         // ... dan GPU memang berat (p90 > 50% target); telat karena lonjakan CPU tidak diobati dengan resolusi
    gpuOver: 0.95,        // atau p90 GPU sendiri > 95% target (pasti segera telat)
    lateGood: 0.01,       // waktu "baik" untuk naik: ≤ 1% frame telat
    goodTime: 4,          // detik (GDD §2.3)
    // naik hanya bila prediksi CPU (p50) + GPU (p90, ∝ jumlah piksel) di skala berikutnya ≤ target: di Chrome kerja JS lalu GPU
    // praktis berurutan dalam satu interval vsync (terukur Iris Xe HIGH: CPU 4–5 ms + GPU 7–8.5 ms → telat di 90 Hz)
    budget: 1.0,
    failWindow: 6,        // turun lagi ≤ 6 s setelah naik = level itu terlalu berat → diblok sementara (backoff berlipat)
    backoff: { start: 15, max: 120, reset: 30 },
  },
} as const;

export type BotDifficultyDef = (typeof XCFG.bots.difficulty)[Difficulty];
export type BotHumanDef = (typeof XCFG.bots.human.diff)[Difficulty];
