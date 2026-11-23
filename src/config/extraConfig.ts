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
    colors: {
      skin: 0xf5cd30,
      torso: { blue: 0x0d69ac, red: 0xc4281c },
      legs: { blue: 0x1f3a73, red: 0x635f62 },
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
    lanes: { bridge: 0.35, west: 0.20, east: 0.20, floor: 0.25 }, lanePerTeamMax: 2,
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
    panner: {
      shot:      { model: 'HRTF', dist: 'inverse', ref: 5, max: 80, rolloff: 1.0 },
      explosion: { model: 'HRTF', dist: 'inverse', ref: 8, max: 120, rolloff: 0.8 },
      footstep:  { model: 'HRTF', dist: 'linear', ref: 2, max: 30, rolloff: 1.0 },
      impact:    { model: 'equalpower', dist: 'linear', ref: 2, max: 25, rolloff: 1.0 },
    },
  },
  // §13 HUD
  hud: { crosshairLen: 8, crosshairWidth: 2, crosshairBaseGap: 3, hpBar: [220, 10], killFeedMax: 5, killFeedTime: 5,
    lensDiameter: 0.84 },
  menu: { orbitRadius: 48, orbitHeight: 26, orbitSpeed: 0.06 },
} as const;

export type BotDifficultyDef = (typeof XCFG.bots.difficulty)[Difficulty];
