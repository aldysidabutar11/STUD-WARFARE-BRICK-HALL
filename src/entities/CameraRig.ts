// src/entities/CameraRig.ts — FPS/TPS, spring arm, swap bahu, FOV ADS, shake (GDD §6.1, §9, §9.2)
import * as THREE from 'three';
import { CFG } from '../config/gameConfig';
import { XCFG } from '../config/extraConfig';
import { physics } from '../physics/Physics';
import { QUERY } from '../physics/groups';

const C = CFG.camera;
const D2R = THREE.MathUtils.degToRad;
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

export type ViewMode = 'fps' | 'tps';

export class CameraRig {
  mode: ViewMode = 'fps';
  yaw = 0;            // rad; yaw = 0 menghadap −Z
  pitch = 0;          // rad; positif = mendongak
  private blend = 0;  // 0 = FPS, 1 = TPS
  private side = 1;   // +1 bahu kanan, −1 kiri
  private sideTarget = 1;
  private camDist = 4.774;
  baseFov: number = C.baseFov;
  private fovFrom: number = C.baseFov;
  private fovTo: number = C.baseFov;
  private fovT = 1;
  private fovDur = 0.12;
  fov: number = C.baseFov;
  /** true bila ADS optik ≥2× sedang memaksa tampilan lensa FPS (di TPS). */
  lensForced = false;
  private shakeAmp = 0;   // derajat
  private shakeT = 0;
  readonly position = new THREE.Vector3();
  readonly quat = new THREE.Quaternion();
  private euler = new THREE.Euler(0, 0, 0, 'YXZ');
  private qYawPitch = new THREE.Quaternion();
  private arm = new THREE.Vector3();
  private pivot = new THREE.Vector3();
  private fpsPos = new THREE.Vector3();
  private tpsPos = new THREE.Vector3();
  private dirArm = new THREE.Vector3();
  private shakeE = new THREE.Euler(0, 0, 0, 'YXZ');
  private shakeQ = new THREE.Quaternion();

  toggleView() { this.mode = this.mode === 'fps' ? 'tps' : 'fps'; }
  swapShoulder() { this.sideTarget = -this.sideTarget; }
  get isFpsView() { return this.blend < 0.5 || this.lensForced; }
  get shoulder() { return this.sideTarget; }

  /** Mulai transisi FOV (easeOutCubic selama `dur`). */
  setFovTarget(fov: number, dur: number) {
    if (Math.abs(fov - this.fovTo) < 1e-3) return;
    this.fovFrom = this.fov; this.fovTo = fov; this.fovT = 0; this.fovDur = Math.max(0.001, dur);
  }

  addShake(deg: number) { this.shakeAmp = Math.max(this.shakeAmp, deg); this.shakeT = XCFG.explosion.shakeDecay; }

  addLook(dYaw: number, dPitch: number) {
    this.yaw += dYaw;
    this.pitch = THREE.MathUtils.clamp(this.pitch + dPitch, -D2R(C.pitchLimitDeg), D2R(C.pitchLimitDeg));
  }

  clampPitch() { this.pitch = THREE.MathUtils.clamp(this.pitch, -D2R(C.pitchLimitDeg), D2R(C.pitchLimitDeg)); }

  /**
   * feet = posisi telapak kaki (diinterpolasi), eyeH = tinggi mata (4.4 / 3.1), crouchT 0..1.
   * adsArmScale: 0.6 saat ADS optik 1× di TPS.
   */
  update(dt: number, feet: THREE.Vector3, eyeH: number, crouchT: number, adsArmScale: number, camera: THREE.PerspectiveCamera) {
    const target = this.mode === 'tps' && !this.lensForced ? 1 : 0;
    this.blend = THREE.MathUtils.clamp(this.blend + Math.sign(target - this.blend) * dt / C.viewSwitchTime, 0, 1);
    this.side = THREE.MathUtils.clamp(this.side + Math.sign(this.sideTarget - this.side) * 2 * dt / C.shoulderSwapTime, -1, 1);

    this.euler.set(this.pitch, this.yaw, 0, 'YXZ');
    this.qYawPitch.setFromEuler(this.euler);

    // FPS: (0, eye, −0.2) diputar yaw
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw), fwd = C.fpsOffset[2];
    this.fpsPos.set(feet.x + (-sy) * -fwd, feet.y + eyeH, feet.z + (-cy) * -fwd);

    // TPS: pivot leher + lengan (s·1.35, 0.85, 4.50) diputar (yaw, pitch), spring arm sphere cast (STATIC saja)
    if (this.blend > 0) {
      const pivotY = THREE.MathUtils.lerp(C.tpsPivotY, C.tpsPivotYCrouch, crouchT);
      this.pivot.set(feet.x, feet.y + pivotY, feet.z);
      this.arm.set(this.side * C.tpsArm[0], C.tpsArm[1], C.tpsArm[2] * adsArmScale).applyQuaternion(this.qYawPitch);
      const len = this.arm.length();
      this.dirArm.copy(this.arm).divideScalar(len);
      const hit = physics.sphereCast(this.pivot, this.dirArm, C.springRadius, len, QUERY.CAMERA);
      const want = hit >= 0 ? Math.max(hit - C.springMargin, C.springMinDist) : len;
      this.camDist = want < this.camDist ? want : Math.min(want, this.camDist + C.springExtendSpeed * dt);
      this.tpsPos.copy(this.pivot).addScaledVector(this.dirArm, this.camDist);
    }
    const b = easeOutCubic(this.blend);
    this.position.copy(this.fpsPos).lerp(this.tpsPos, b);

    // shake: amplitudo meluruh dalam 0.5 s
    this.quat.copy(this.qYawPitch);
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      const k = Math.max(0, this.shakeT / XCFG.explosion.shakeDecay) * D2R(this.shakeAmp);
      this.shakeE.set((Math.random() * 2 - 1) * k, (Math.random() * 2 - 1) * k, (Math.random() * 2 - 1) * k * 0.5, 'YXZ');
      this.shakeQ.setFromEuler(this.shakeE);
      this.quat.multiply(this.shakeQ);
      if (this.shakeT <= 0) this.shakeAmp = 0;
    }

    // FOV easeOutCubic
    if (this.fovT < 1) this.fovT = Math.min(1, this.fovT + dt / this.fovDur);
    this.fov = THREE.MathUtils.lerp(this.fovFrom, this.fovTo, easeOutCubic(this.fovT));

    camera.position.copy(this.position);
    camera.quaternion.copy(this.quat);
    if (Math.abs(camera.fov - this.fov) > 1e-4) { camera.fov = this.fov; camera.updateProjectionMatrix(); }
  }

  /** Arah pandang kamera (unit). */
  forward(out: THREE.Vector3) { return out.set(0, 0, -1).applyQuaternion(this.qYawPitch); }
  right(out: THREE.Vector3) { return out.set(1, 0, 0).applyQuaternion(this.qYawPitch); }
  up(out: THREE.Vector3) { return out.set(0, 1, 0).applyQuaternion(this.qYawPitch); }
}
