// src/config/extraConfig.ts — angka dari prosa & tabel GDD v2 yang tidak punya key di §15.
// (gameConfig.ts & weaponsData.ts tetap salinan verbatim §15; file ini melengkapinya.)

export type Difficulty = 'easy' | 'normal' | 'hard';

export const XCFG = {
  player: {
    regenDelay: 5, regenRate: 8,          // §3.8 (opsi config, default mati)
    protectPulseHz: 4,                    // §3.8
    sprintMinForward: 0.5,                // §3.4 syarat sprint
    groundStick: -0.5,                    // gaya tempel tanah (lihat CLAUDE.md)
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
    hearing: { shot556: 35, shot762: 50, explosion: 60, sprintStep: 12, walkStep: 6 },
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
    grenadeMin: 8, grenadeMax: 24, grenadeAllyClear: 8, grenadeCooldown: 6,
    arriveRadius: 1.2, separation: 2.0, stuckDist: 0.5, stuckJump: 1.5, stuckRepath: 3.0, stairCost: 1.2,
    thinkEveryFixedSteps: 6,
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
    lensDiameter: 0.84 },
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
    maxShotFx: 24,        // efek tembakan per snapshot
    pingEvery: 2,         // detik: host mengukur ping tiap teman (ping/pong kanal reliable), disiarkan ke semua
    pingWarn: 150,        // ms: ping ≥ 150 → merah + peringatan (room, papan skor, HUD)
    pingGood: 80,         // ms: < 80 hijau, 80–150 kuning
    hitConfirmWindow: 1.0,   // detik: kena hasil prediksi menunggu konfirmasi host (lebih lama → dianggap meleset)
    connectTimeout: 10,   // detik: batas total gabung (termasuk koneksi WebRTC)
    helloTimeout: 4,      // detik: host tidak menjawab kode room → "room tidak ditemukan"
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
