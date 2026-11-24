// src/entities/PlayerController.ts — input → kecepatan → KCC, sprint, crouch, jump, fall damage (GDD §3.3–3.6)
import * as THREE from 'three';
import { RAPIER, physics } from '../physics/Physics';
import { GROUPS, QUERY } from '../physics/groups';
import { CFG } from '../config/gameConfig';
import { XCFG } from '../config/extraConfig';
import { fallDamage, integrateVertical, moveTarget } from '../combat/Damage';
import { bus } from '../core/EventBus';
import { charGravity, moveFeel } from './moveFeel';

const P = CFG.player, K = CFG.kcc;
const D2R = THREE.MathUtils.degToRad;
const STAND_HH = (P.standHeight - 2 * P.capsuleRadius) / 2;   // 1.7
const CROUCH_HH = (P.crouchHeight - 2 * P.capsuleRadius) / 2; // 1.05

/** Keadaan gerak yang cukup untuk memutar ulang langkah KCC (prediksi + rekonsiliasi online). */
export interface CtrlState {
  x: number; y: number; z: number; vx: number; vz: number; velY: number; crouchT: number;
  coyote: number; jumpBuf: number; airCap: number; peakY: number; stepPhase: number;
  grounded: boolean; crouched: boolean; sprinting: boolean; crouchQueued: boolean | null;
}

/** Input virtual (sama untuk pemain & bot). ix: A=−1 D=+1; iz: S=−1 W=+1. */
export interface MoveIntent {
  ix: number; iz: number; yaw: number;
  jump: boolean;            // ditekan (edge)
  sprint: boolean;          // ditahan
  crouch: boolean;          // keadaan jongkok yang diinginkan
  ads: boolean; cooking: boolean; wantFire: boolean;
  /** Pengali kecepatan senjata di tangan (pisau ×XCFG.knife.speedMult; lainnya 1). */
  speedMult: number;
}

export class PlayerController {
  readonly body: RAPIER.RigidBody;
  readonly collider: RAPIER.Collider;
  private kcc: RAPIER.KinematicCharacterController;
  readonly pos = new THREE.Vector3();
  readonly prevPos = new THREE.Vector3();
  readonly vel = new THREE.Vector3();      // horizontal (y = 0)
  velY = 0;
  grounded = false;
  crouched = false;
  crouchT = 0;                             // 0 berdiri … 1 jongkok (transisi 0.15 s)
  sprinting = false;
  private coyote = 0;
  private jumpBuf = 0;
  private airCap: number = P.airMinSpeedCap;
  private peakY = 0;
  /** Fase langkah kontinu: naik 1 per langkah (interval §3.7); bilangan bulat = kaki menapak (suara langkah, kamera terendah). */
  stepPhase = 0.5;
  prevStepPhase = 0.5;
  private crouchQueued: boolean | null = null;
  private desired = { x: 0, y: 0, z: 0 };
  private standShape = new RAPIER.Capsule(STAND_HH, P.capsuleRadius);
  private ident = { x: 0, y: 0, z: 0, w: 1 };
  private tv = { vx: 0, vz: 0 };
  onFallDamage: ((dmg: number) => void) | null = null;
  enabled = true;
  /** Replay prediksi klien: tanpa suara langkah / fall damage (event sudah terjadi saat langkah aslinya). */
  quiet = false;

  constructor(readonly entityId: number, x: number, y: number, z: number) {
    const w = physics.world;
    this.body = w.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(x, y, z));
    this.collider = w.createCollider(RAPIER.ColliderDesc.capsule(STAND_HH, P.capsuleRadius)
      .setTranslation(0, P.standHeight / 2, 0).setFriction(0).setCollisionGroups(GROUPS.CHAR), this.body);
    this.kcc = w.createCharacterController(K.offset);
    this.kcc.setUp({ x: 0, y: 1, z: 0 });
    this.kcc.setMaxSlopeClimbAngle(D2R(K.maxSlopeClimbDeg));
    this.kcc.setMinSlopeSlideAngle(D2R(K.minSlopeSlideDeg));
    this.kcc.enableAutostep(K.autostepHeight, K.autostepMinWidth, false);
    this.kcc.enableSnapToGround(K.snapToGround);
    this.kcc.setApplyImpulsesToDynamicBodies(false);
    this.pos.set(x, y, z); this.prevPos.copy(this.pos);
  }

  /** Teleport (spawn/respawn) — pose collider dipropagasi agar query KCC tidak memakai pose basi. */
  teleport(x: number, y: number, z: number) {
    this.body.setTranslation({ x, y, z }, true);
    physics.world.propagateModifiedBodyPositionsToColliders();
    this.pos.set(x, y, z); this.prevPos.copy(this.pos);
    this.vel.set(0, 0, 0); this.velY = 0; this.peakY = y; this.grounded = true;
    this.stepPhase = this.prevStepPhase = 0.5; // langkah pertama ±setengah interval setelah mulai jalan
    this.setCrouch(false, true);
  }

  /** Keadaan gerak lengkap (prediksi klien online: simpan per perintah, pulihkan dari host, putar ulang). */
  getState(): CtrlState {
    return { x: this.pos.x, y: this.pos.y, z: this.pos.z, vx: this.vel.x, vz: this.vel.z, velY: this.velY, crouchT: this.crouchT,
      coyote: this.coyote, jumpBuf: this.jumpBuf, airCap: this.airCap, peakY: this.peakY, stepPhase: this.stepPhase,
      grounded: this.grounded, crouched: this.crouched, sprinting: this.sprinting, crouchQueued: this.crouchQueued };
  }

  setState(s: CtrlState) {
    this.pos.set(s.x, s.y, s.z);
    this.vel.set(s.vx, 0, s.vz); this.velY = s.velY; this.crouchT = s.crouchT;
    this.coyote = s.coyote; this.jumpBuf = s.jumpBuf; this.airCap = s.airCap; this.peakY = s.peakY;
    this.stepPhase = s.stepPhase; this.grounded = s.grounded; this.sprinting = s.sprinting; this.crouchQueued = s.crouchQueued;
    if (s.crouched !== this.crouched) this.setCrouch(s.crouched, true);
    this.syncCollider();
  }

  /** Pindahkan collider ke pos sekarang segera (tanpa menunggu world.step) — dipakai saat memutar ulang beberapa langkah. */
  syncCollider() {
    this.body.setTranslation({ x: this.pos.x, y: this.pos.y, z: this.pos.z }, true);
    physics.world.propagateModifiedBodyPositionsToColliders();
  }

  /** Tick tanpa gerak (host: perintah pemain remote belum tiba) — interpolasi render tidak mengulang langkah sebelumnya. */
  hold() { this.prevPos.copy(this.pos); this.prevStepPhase = this.stepPhase; }

  setEnabled(on: boolean) {
    this.enabled = on;
    this.collider.setEnabled(on);
  }

  private setCrouch(c: boolean, force = false) {
    if (c === this.crouched && !force) return;
    if (!c && !force && !this.headroom()) return;
    this.crouched = c;
    this.collider.setHalfHeight(c ? CROUCH_HH : STAND_HH);
    this.collider.setTranslationWrtParent({ x: 0, y: c ? P.crouchHeight / 2 : P.standHeight / 2, z: 0 });
  }

  /** Uji kapsul berdiri terhadap STATIC (ruang kepala). */
  private headroom(): boolean {
    const p = { x: this.pos.x, y: this.pos.y + P.standHeight / 2 + 0.02, z: this.pos.z };
    return physics.world.intersectionWithShape(p, this.ident, this.standShape, undefined, QUERY.LOS) === null;
  }

  get eyeHeight() { return THREE.MathUtils.lerp(P.eyeStand, P.eyeCrouch, this.crouchT); }
  get speedH() { return Math.hypot(this.vel.x, this.vel.z); }

  fixedUpdate(dt: number, it: MoveIntent, adsActive: boolean) {
    this.prevPos.copy(this.pos);
    this.prevStepPhase = this.stepPhase;
    if (!this.enabled) return;
    const T = moveFeel.tempo; // tempo gerak (lihat CFG.player.moveSpeedScale)
    // ── jongkok (di udara di-buffer sampai mendarat)
    if (it.crouch !== this.crouched) {
      if (this.grounded) this.setCrouch(it.crouch); else this.crouchQueued = it.crouch;
    }
    if (this.grounded && this.crouchQueued !== null) { this.setCrouch(this.crouchQueued); this.crouchQueued = null; }
    const target = this.crouched ? 1 : 0;
    this.crouchT = THREE.MathUtils.clamp(this.crouchT + Math.sign(target - this.crouchT) * dt / P.crouchTransition, 0, 1);

    // ── sprint: W ditahan (komponen maju > 0.5), menapak, tidak ADS, tidak jongkok, tidak memasak granat
    const len = Math.hypot(it.ix, it.iz) || 1;
    this.sprinting = it.sprint && it.iz / len > XCFG.player.sprintMinForward && this.grounded && !adsActive && !this.crouched
      && !it.cooking && !it.wantFire;

    // ── kecepatan target (kode §3.4) → vektor dunia
    const hasInput = it.ix !== 0 || it.iz !== 0;
    moveTarget({ ix: it.ix, iz: it.iz, sprinting: this.sprinting, crouched: this.crouched, ads: adsActive }, this.tv, T * it.speedMult);
    const sy = Math.sin(it.yaw), cy = Math.cos(it.yaw);
    // right = (cos yaw, 0, −sin yaw), forward = (−sin yaw, 0, −cos yaw)
    const tx = hasInput ? cy * this.tv.vx - sy * this.tv.vz : 0;
    const tz = hasInput ? -sy * this.tv.vx - cy * this.tv.vz : 0;

    // ── akselerasi: darat 80 menuju target, 90 tanpa input; udara 12·T² (tanpa gesekan, cap kecepatan)
    if (this.grounded) {
      const a = hasInput ? P.accelGround : P.decelGround;
      this.approach(tx, tz, a * dt);
    } else if (hasInput) {
      this.approach(tx, tz, P.accelAir * T * T * dt);
      const sp = this.speedH;
      if (sp > this.airCap) { this.vel.x *= this.airCap / sp; this.vel.z *= this.airCap / sp; }
    }

    // ── lompat: coyote 0.1 s + buffer 0.1 s; lompat saat jongkok = berdiri dulu
    this.coyote = this.grounded ? P.coyoteTime : Math.max(0, this.coyote - dt);
    this.jumpBuf = it.jump ? P.jumpBuffer : Math.max(0, this.jumpBuf - dt);
    let jumped = false;
    if (this.jumpBuf > 0 && this.coyote > 0) {
      if (this.crouched) this.setCrouch(false);
      if (!this.crouched) {
        this.velY = P.jumpVelocity * T; jumped = true; this.grounded = false; // puncak tetap 1.383 (g karakter ×T²)
        this.coyote = 0; this.jumpBuf = 0;
        this.airCap = Math.max(this.speedH, P.airMinSpeedCap * T);
        this.peakY = this.pos.y;
      }
    }

    // ── vertikal: parabola eksak di udara; gaya tempel kecil + proyeksi lereng di darat
    let dy: number;
    if (this.grounded && !jumped) {
      this.velY = 0;
      dy = XCFG.player.groundStick * dt;
      const n = this.groundNormal();
      if (n && n.y < 0.999 && n.y > 0.5) dy += -(n.x * this.vel.x + n.z * this.vel.z) * dt / n.y;
    } else {
      const s = integrateVertical(this.velY, dt, charGravity(T));
      dy = s.dy; this.velY = s.velY;
    }

    this.desired.x = this.vel.x * dt; this.desired.y = dy; this.desired.z = this.vel.z * dt;
    this.kcc.computeColliderMovement(this.collider, this.desired, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, QUERY.MOVE);
    const m = this.kcc.computedMovement();
    if (this.velY > 0 && m.y < this.desired.y * 0.5) this.velY = 0; // kepala terbentur
    this.pos.x += m.x; this.pos.y += m.y; this.pos.z += m.z;
    this.body.setNextKinematicTranslation({ x: this.pos.x, y: this.pos.y, z: this.pos.z });

    // dinding menahan → kecepatan nyata (hanya mengecil)
    const ax = m.x / dt, az = m.z / dt;
    if (Math.hypot(ax, az) < this.speedH - 0.01) { this.vel.x = ax; this.vel.z = az; }

    const wasGrounded = this.grounded;
    this.grounded = this.kcc.computedGrounded() && this.velY <= 0;
    if (!this.grounded) this.peakY = Math.max(this.peakY, this.pos.y);
    if (!wasGrounded && this.grounded) this.land();
    if (wasGrounded && !this.grounded && !jumped) this.peakY = this.pos.y;

    // ── langkah kaki (interval §3.7): fase kontinu, suara tiap melewati bilangan bulat; diam/di udara = fase berhenti
    if (this.grounded && this.speedH > 1.0) {
      const fi = P.footstepInterval;
      const interval = this.crouched ? fi.crouch : this.sprinting ? fi.sprint : adsActive ? fi.ads : fi.normal;
      const before = Math.floor(this.stepPhase);
      this.stepPhase += dt / interval;
      if (Math.floor(this.stepPhase) > before && !this.quiet) {
        bus.emit('footstep', { entityId: this.entityId, material: physics.surfaceBelow(this.pos.x, this.pos.y, this.pos.z),
          position: this.pos, loud: this.sprinting, land: false });
      }
    }

    // keluar map (jaga-jaga)
    if (this.pos.y < -30 && !this.quiet) this.onFallDamage?.(999);
  }

  /** Tinggi jatuh pendaratan terakhir (u) — dipakai hentakan kamera. */
  lastLandH = 0;

  private land() {
    const H = this.peakY - this.pos.y;
    this.lastLandH = H;
    const dmg = fallDamage(H);
    if (this.quiet) { this.peakY = this.pos.y; return; }
    if (dmg > 0) this.onFallDamage?.(dmg);
    if (H > 0.6) bus.emit('footstep', { entityId: this.entityId, material: physics.surfaceBelow(this.pos.x, this.pos.y, this.pos.z),
      position: this.pos, loud: true, land: true });
    this.peakY = this.pos.y;
  }

  private approach(tx: number, tz: number, maxDelta: number) {
    const dx = tx - this.vel.x, dz = tz - this.vel.z, d = Math.hypot(dx, dz);
    if (d <= maxDelta || d < 1e-6) { this.vel.x = tx; this.vel.z = tz; }
    else { this.vel.x += dx / d * maxDelta; this.vel.z += dz / d * maxDelta; }
  }

  private _n = new THREE.Vector3();
  private groundNormal(): THREE.Vector3 | null {
    const hit = physics.raycastNormal({ x: this.pos.x, y: this.pos.y + 0.4, z: this.pos.z }, { x: 0, y: -1, z: 0 }, 1.2, QUERY.LOS);
    if (!hit) return null;
    return this._n.set(hit.normal.x, hit.normal.y, hit.normal.z);
  }

  dispose() {
    physics.world.removeCharacterController(this.kcc);
    physics.world.removeRigidBody(this.body);
  }
}
