// src/config/gameConfig.ts — SEMUA konstanta gameplay (GDD v2). Satuan: unit, detik, derajat.
export const CFG = {
  world: { gravity: -22.0, fixedStep: 1 / 60, maxSubSteps: 4, bounds: { x: 30, z: 50, y: 30 } },
  player: {
    hp: 100, healthRegen: false, respawnDelay: 4.0, spawnProtection: 2.0,
    capsuleRadius: 0.8, standHeight: 5.0, crouchHeight: 3.7, eyeStand: 4.4, eyeCrouch: 3.1, eyeForward: 0.2,
    speed: { forward: 6.0, back: 4.5, strafe: 5.4, sprint: 8.5, crouchCap: 3.2, adsMult: 0.65 },
    // moveSpeedScale = "tempo" gerak (GDD §3.4: "bila terasa lambat, uji 1.25–1.5"; disetujui pengguna 2026-11-24, GDD 1.0).
    // Dipakai sebagai skala waktu: kecepatan ×T, gravitasi karakter ×T², lompat ×T, akselerasi udara ×T² (PlayerController)
    // → lintasan lompat/jatuh tetap persis GDD (puncak 1.383, pagar 1.2, rak A/B), hanya lebih cepat.
    moveSpeedScale: 1.35, accelGround: 80, decelGround: 90, accelAir: 12, airMinSpeedCap: 3.0,
    jumpVelocity: 7.8, coyoteTime: 0.10, jumpBuffer: 0.10,
    fallSafeHeight: 7.5, fallDamagePerUnit: 8, crouchTransition: 0.15, sprintToFire: 0.12,
    footstepInterval: { normal: 0.38, sprint: 0.30, ads: 0.50, crouch: 0.60 },
  },
  kcc: { offset: 0.02, maxSlopeClimbDeg: 45, minSlopeSlideDeg: 50, autostepHeight: 0.6, autostepMinWidth: 0.3,
    snapToGround: 0.5 },
  camera: {
    baseFov: 75, fovMin: 70, fovMax: 90, near: 0.05, far: 300, pitchLimitDeg: 85,
    fpsOffset: [0, 4.4, -0.2], fpsOffsetCrouch: [0, 3.1, -0.2],
    tpsPivotY: 3.8, tpsPivotYCrouch: 2.5, tpsArm: [1.35, 0.85, 4.5], tpsAdsArmScale: 0.6,
    springRadius: 0.25, springMargin: 0.3, springMinDist: 0.6, springExtendSpeed: 8,
    shoulderSwapTime: 0.15, viewSwitchTime: 0.15, sensBaseRadPerPx: 0.000768, viewmodelFov: 60,
  },
  combat: {
    hitMult: { head: 2.35, upper: 1.0, lower: 0.95, limb: 0.5 },
    falloffStart: 40, falloffSpan: 160, falloffMin: 0.65, maxRange: 200,
    burstDelay: 0.20, singleMinInterval: 0.10, reloadCommit: 0.80, autoReloadDelay: 0.25,
    equipTime: 0.55, equipAfterThrow: 0.40,
    spread: { hip: 2.2, hipMoveAdd: 1.5, hipAirAdd: 4.0, hipCrouchMult: 0.8, ads: 0.15, adsMoveAdd: 0.35, adsAir: 2.0, movingSpeed: 1.0 },
    recoil: { ramp: 0.04, rampMax: 0.5, recoveryDelay: 0.1, recoveryRate: 14.0, resetTime: 0.25, scale: 1.0,
      stance: { stand: 1.0, crouch: 0.75, air: 1.35 } },
    friendlyFire: false, tracerEvery: { player: 3, bot: 2 },
  },
  grenade: {
    // overSpeed: GDD 24.0 → 34 (disetujui pengguna 2026-11-26: "lempar terlalu dekat, kurang tenaga, masih kena efek sendiri").
    // Di 24 u/s granat jatuh ±½ jarak crosshair (bidik lantai 20 u → 12.6 u), jangkauan maks ±26 u; tempo gerak ×1.35 (lari 11.5 u/s)
    // membuat lemparan relatif makin lemah. 34: lurus ±28 u, maks ±47 u. Gelinding (underSpeed) tetap GDD.
    fuse: 3.5, overSpeed: 34.0, overLiftDeg: 8, underSpeed: 11.0, underPitchMin: -20, underPitchMax: 10, inheritVel: 0.5,
    radius: 0.25, restitution: 0.45, friction: 0.6, density: 6.0, linDamp: 0.15, angDamp: 0.6,
    maxDamage: 135, blastRadius: 12.0, selfDamage: true, perLife: 1, equipTime: 0.35,
    propImpulse: 14, corpseImpulseMult: 1.2, paperRadius: 10, shakeRadius: 20, shakeMaxDeg: 1.5, tinnitusRadius: 6,
  },
  props: { bookDensity: 1.0, bookFriction: 0.7, bookRestitution: 0.15, bulletImpulse: 4.0, seed: 1337 },
  match: { mode: 'TDM', scoreLimit: 50, timeLimit: 600, countdown: 3, allyBots: 4, enemyBots: 5, botDifficulty: 'normal' },
  render: {
    presets: {
      LOW:    { maxPixelRatio: 1.0,  maxInternalPixels: 1_000_000, antialias: false, shadowMap: 0,    anisotropy: 1, decals: 32,  debris: 8,  sunIntensity: 0.8 },
      MEDIUM: { maxPixelRatio: 1.25, maxInternalPixels: 2_100_000, antialias: true,  shadowMap: 1024, anisotropy: 4, decals: 96,  debris: 24, sunIntensity: 2.6 },
      HIGH:   { maxPixelRatio: 1.5,  maxInternalPixels: 3_700_000, antialias: true,  shadowMap: 2048, anisotropy: 8, decals: 160, debris: 40, sunIntensity: 2.6 },
    },
    dynRes: { min: 0.6, max: 1.0, step: 0.1, upMs: 13, downMs: 17.5, cooldown: 2 },
  },
  audio: { voiceLimit: 24, master: 0.8, sfx: 1.0, ui: 0.7 },
} as const;

/** Preset render §15 (LOW/MEDIUM/HIGH) + ULTRA pasca-MVP (nilai di XCFG.gfx.ultra; lihat config/presets.ts). */
export type PresetName = keyof typeof CFG.render.presets | 'ULTRA';
export interface Preset {
  maxPixelRatio: number; maxInternalPixels: number; antialias: boolean; shadowMap: number; anisotropy: number;
  decals: number; debris: number; sunIntensity: number;
}
