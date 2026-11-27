// src/entities/CameraRig.ts — FPS/TPS, spring arm, swap bahu, FOV ADS, shake (GDD §6.1, §9, §9.2)
import * as THREE from 'three';
import { CFG } from '../config/gameConfig';
import { XCFG } from '../config/extraConfig';
import { physics } from '../physics/Physics';
import { QUERY } from '../physics/groups';
import { Spring, damp, moveFeel } from './moveFeel';

const C = CFG.camera, F = XCFG.feel;
const D2R = THREE.MathUtils.degToRad;
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
const _rollQ = new THREE.Quaternion(), _zAxis = new THREE.Vector3(0, 0, 1);
// armFree (tanpa mengubah keadaan kamera)
const _fe = new THREE.Euler(0, 0, 0, 'YXZ'), _fq = new THREE.Quaternion(), _fp = new THREE.Vector3(), _fa = new THREE.Vector3();

export type ViewMode = 'fps' | 'tps';

/** Keadaan gerak pemain untuk efek kamera (diisi Game tiap frame; nol = tanpa efek, mis. menonton/killcam). */
export interface CamMotion {
  stepPhase: number;     // fase langkah kontinu (PlayerController.stepPhase, diinterpolasi)
  speed: number;         // kecepatan horizontal (u/s)
  localVx: number;       // kecepatan ke kanan kamera (u/s)
  grounded: boolean;
  ads: number;           // progres ADS 0..1
  walkSpeed: number; sprintSpeed: number; strafeSpeed: number; // acuan (sudah ×tempo)
}

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
  /** Pengali guncangan, hentakan, ayunan, miring & FOV sprint dari pengaturan "Gerak kamera" (0..1). */
  shakeScale = 1;
  private land = new Spring(XCFG.landKick.omega, XCFG.landKick.zeta);
  readonly motion: CamMotion = { stepPhase: 0, speed: 0, localVx: 0, grounded: true, ads: 0, walkSpeed: 6, sprintSpeed: 8.5, strafeSpeed: 5.4 };
  private bobAmp = 0;     // 0..1.5 (kecepatan relatif jalan, diperhalus)
  private roll = 0;       // rad, miring strafe diperhalus
  private fovAdd = 0;     // derajat, FOV sprint diperhalus
  private _right = new THREE.Vector3();
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
  // hentakan serangan pisau: pegas teredam per sumbu (rad) + FOV (derajat), diskalakan pengaturan "Gerak kamera"
  private pYaw = new Spring(XCFG.knife.punch.omega, XCFG.knife.punch.zeta);
  private pPitch = new Spring(XCFG.knife.punch.omega, XCFG.knife.punch.zeta);
  private pRoll = new Spring(XCFG.knife.punch.omega, XCFG.knife.punch.zeta);
  private pFov = new Spring(XCFG.knife.punch.omega * 0.8, 0.5);

  toggleView() { this.mode = this.mode === 'fps' ? 'tps' : 'fps'; }
  swapShoulder() { this.sideTarget = -this.sideTarget; }
  get isFpsView() { return this.blend < 0.5 || this.lensForced; }
  get shoulder() { return this.sideTarget; }
  /** Tampilan TPS dengan lengan spring arm lebih pendek dari XCFG.camera.hideBodyDist: kamera di/menempel badan yang diikuti
   *  (jarak minimal GDD 0.6 < jari-jari kapsul 0.8) → badan itu disembunyikan pemanggil. */
  get nearBody() { return !this.isFpsView && this.camDist < XCFG.camera.hideBodyDist; }

  /**
   * Panjang lengan TPS yang akan dipakai spring arm (§9.2: max(t − 0.3, 0.6), atau penuh 4.774 bila bebas) bila kamera menghadap
   * (yaw, pitch) dengan kaki di `feet` — tanpa mengubah keadaan kamera. Dipakai mode menonton untuk mencari sudut bebas.
   */
  armFree(feet: THREE.Vector3, crouchT: number, yaw: number, pitch: number): number {
    _fq.setFromEuler(_fe.set(pitch, yaw, 0, 'YXZ'));
    _fp.set(feet.x, feet.y + THREE.MathUtils.lerp(C.tpsPivotY, C.tpsPivotYCrouch, crouchT), feet.z);
    _fa.set(this.sideTarget * C.tpsArm[0], C.tpsArm[1], C.tpsArm[2]).applyQuaternion(_fq);
    const len = _fa.length();
    _fa.divideScalar(len);
    const hit = physics.sphereCast(_fp, _fa, C.springRadius, len, QUERY.CAMERA);
    return hit >= 0 ? Math.max(hit - C.springMargin, C.springMinDist) : len;
  }

  /** Mulai transisi FOV (easeOutCubic selama `dur`). */
  setFovTarget(fov: number, dur: number) {
    if (Math.abs(fov - this.fovTo) < 1e-3) return;
    this.fovFrom = this.fov; this.fovTo = fov; this.fovT = 0; this.fovDur = Math.max(0.001, dur);
  }

  addShake(deg: number) {
    if (this.shakeScale <= 0) return;
    this.shakeAmp = Math.max(this.shakeAmp, deg * this.shakeScale); this.shakeT = XCFG.explosion.shakeDecay;
  }

  /** Hentakan turun saat mendarat (h = tinggi jatuh): pegas teredam — turun cepat ±0.08 s, pulih dengan sedikit pantulan. */
  landKick(h: number) {
    const L = XCFG.landKick;
    if (h < L.min || this.shakeScale <= 0) return;
    this.land.kick(-Math.min(L.max, L.base + L.perUnit * h) * this.shakeScale);
  }

  /** Hentakan kamera (derajat): puncak simpangan = nilai yang diberikan, kembali dengan pegas. */
  punch(yawDeg: number, pitchDeg: number, rollDeg: number, fovDeg = 0) {
    const k = this.shakeScale;
    if (k <= 0) return;
    this.pYaw.kick(D2R(yawDeg) * k); this.pPitch.kick(D2R(pitchDeg) * k); this.pRoll.kick(D2R(rollDeg) * k); this.pFov.kick(fovDeg * k);
  }

  /** Hentikan semua efek gerak (respawn, ganti mode). */
  resetMotion() {
    this.land.reset(); this.bobAmp = 0; this.roll = 0; this.fovAdd = 0;
    this.pYaw.reset(); this.pPitch.reset(); this.pRoll.reset(); this.pFov.reset();
    const m = this.motion; m.speed = 0; m.localVx = 0; m.ads = 0; m.grounded = true;
  }

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

    // ── rasa gerak (FPS penuh, TPS dikurangi): ayunan kepala sinkron langkah, miring strafe, FOV sprint, pegas mendarat
    const M = this.motion, k = this.shakeScale, fps = 1 - b;
    this.bobAmp = damp(this.bobAmp, M.grounded ? Math.min(1.5, M.speed / Math.max(0.1, M.walkSpeed)) : 0, F.bob.rate, dt);
    const sprintK = THREE.MathUtils.clamp((M.speed - M.walkSpeed) / Math.max(0.1, M.sprintSpeed - M.walkSpeed), 0, 1);
    const adsBob = 1 - (1 - F.bob.adsMult) * M.ads;
    const ph = Math.PI * M.stepPhase, amp = this.bobAmp * adsBob * k * moveFeel.bob * fps;
    const by = THREE.MathUtils.lerp(F.bob.walkY, F.bob.sprintY, sprintK) * amp * (Math.abs(Math.sin(ph)) - 2 / Math.PI);
    const bx = F.bob.x * amp * Math.sin(ph);
    this._right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    this.position.addScaledVector(this._right, bx);
    this.position.y += by + this.land.update(dt);
    // miring ke arah strafe (kanan → kepala condong ke kanan), ditambah goyang kecil sinkron langkah
    const rollT = -THREE.MathUtils.clamp(M.localVx / Math.max(0.1, M.strafeSpeed), -1, 1) * D2R(F.strafeRollDeg)
      * (1 - 0.6 * M.ads) * k * moveFeel.tilt * (1 - 0.5 * b);
    this.roll = damp(this.roll, rollT, F.rollRate, dt);
    const roll = this.roll + D2R(F.bob.rollDeg) * amp * Math.sin(ph);
    // FOV melebar saat sprint (mengikuti kecepatan nyata; hilang saat ADS)
    this.fovAdd = damp(this.fovAdd, F.sprintFovDeg * sprintK * (1 - M.ads) * k * moveFeel.sprintFov, F.fovRate, dt);

    // shake: amplitudo meluruh dalam 0.5 s
    this.quat.copy(this.qYawPitch);
    if (Math.abs(roll) > 1e-5) this.quat.multiply(_rollQ.setFromAxisAngle(_zAxis, roll));
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      const k = Math.max(0, this.shakeT / XCFG.explosion.shakeDecay) * D2R(this.shakeAmp);
      this.shakeE.set((Math.random() * 2 - 1) * k, (Math.random() * 2 - 1) * k, (Math.random() * 2 - 1) * k * 0.5, 'YXZ');
      this.shakeQ.setFromEuler(this.shakeE);
      this.quat.multiply(this.shakeQ);
      if (this.shakeT <= 0) this.shakeAmp = 0;
    }
    // hentakan serangan pisau (pegas): yaw/pitch/roll tambahan
    const py = this.pYaw.update(dt), pp = this.pPitch.update(dt), pr = this.pRoll.update(dt);
    if (Math.abs(py) + Math.abs(pp) + Math.abs(pr) > 1e-5) {
      this.shakeE.set(pp, py, pr, 'YXZ');
      this.quat.multiply(this.shakeQ.setFromEuler(this.shakeE));
    }

    // FOV easeOutCubic (+ FOV sprint)
    if (this.fovT < 1) this.fovT = Math.min(1, this.fovT + dt / this.fovDur);
    this.fov = THREE.MathUtils.lerp(this.fovFrom, this.fovTo, easeOutCubic(this.fovT));
    const fov = this.fov + this.fovAdd + this.pFov.update(dt);

    camera.position.copy(this.position);
    camera.quaternion.copy(this.quat);
    if (Math.abs(camera.fov - fov) > 1e-4) { camera.fov = fov; camera.updateProjectionMatrix(); }
  }

  /** Arah pandang kamera (unit). */
  forward(out: THREE.Vector3) { return out.set(0, 0, -1).applyQuaternion(this.qYawPitch); }
  right(out: THREE.Vector3) { return out.set(1, 0, 0).applyQuaternion(this.qYawPitch); }
  up(out: THREE.Vector3) { return out.set(0, 1, 0).applyQuaternion(this.qYawPitch); }
}
