// src/entities/Viewmodel.ts — lengan + senjata FPS di scene terpisah (GDD §9.1, §7.4)
import * as THREE from 'three';
import { XCFG } from '../config/extraConfig';
import { SCOPES, type ScopeId, type WeaponId } from '../config/weaponsData';
import { VM_SCALE, WEAPON_MATERIAL, opticModel, weaponModel } from '../combat/WeaponModels';

const V = XCFG.viewmodel;
const D2R = THREE.MathUtils.degToRad;
const damp = (a: number, b: number, k: number, dt: number) => b + (a - b) * Math.exp(-k * dt);

export interface VmState {
  ads: number;          // 0..1 (easing transisi ADS)
  sprint: boolean; reload: number; // reload progres 0..1 atau −1
  speed: number; stepInterval: number; grounded: boolean;
  mouseDx: number; mouseDy: number;
  grenade: boolean;     // memegang granat (senjata diturunkan)
}

export class Viewmodel {
  readonly root = new THREE.Group();
  private pivot = new THREE.Group();     // offset pose
  private gun: THREE.Mesh;
  private optic: THREE.Mesh | null = null;
  private flash: THREE.Group;
  private flashT = 0;
  readonly muzzleLocal = new THREE.Vector3();
  private sightH: number = SCOPES.iron.sightHeight;
  private sprintT = 0;
  private bobT = 0;
  private swayX = 0; private swayY = 0;
  private kick = 0;
  private lower = 0;
  private skinMat = new THREE.MeshLambertMaterial({ color: XCFG.rig.colors.skin });
  private sleeveMat: THREE.MeshLambertMaterial;

  constructor(scene: THREE.Scene, sleeveColor: number) {
    this.sleeveMat = new THREE.MeshLambertMaterial({ color: sleeveColor });
    scene.add(this.root);
    this.root.add(this.pivot);
    this.gun = new THREE.Mesh(new THREE.BufferGeometry(), WEAPON_MATERIAL);
    this.gun.scale.setScalar(VM_SCALE);
    this.pivot.add(this.gun);
    // lengan blocky (kulit kuning + lengan baju warna tim): tangan di grip/handguard, lengan menjauh ke bawah layar
    const arm = (len: number, hand: THREE.Vector3, dir: THREE.Vector3) => {
      const g = new THREE.Group();
      const h = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.11), this.skinMat);
      const sleeve = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, len), this.sleeveMat);
      sleeve.position.z = len / 2 + 0.05;
      g.add(h, sleeve);
      g.position.copy(hand);
      g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir.normalize());
      return g;
    };
    const armR = arm(0.42, new THREE.Vector3(0.0, -0.07, 0.02), new THREE.Vector3(0.22, -0.72, 0.3));
    const armL = arm(0.4, new THREE.Vector3(-0.02, -0.03, -0.3), new THREE.Vector3(-0.2, -0.8, 0.18));
    this.pivot.add(armR, armL);
    // muzzle flash: dua quad silang aditif + balok emissive
    const fm = new THREE.MeshBasicMaterial({ color: 0xffc060, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    this.flash = new THREE.Group();
    const q1 = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.16), fm);
    const q2 = q1.clone(); q2.rotation.y = Math.PI / 2;
    const q3 = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.1), fm); q3.rotation.x = Math.PI / 2;
    this.flash.add(q1, q2, q3);
    this.flash.visible = false;
    this.pivot.add(this.flash);
    const hemi = new THREE.HemisphereLight(0xfff1dd, 0x4a2e1c, 1.6);
    const dir = new THREE.DirectionalLight(0xffe0b5, 1.2); dir.position.set(1, 2, 1);
    scene.add(hemi, dir);
    this.root.visible = false;
  }

  setTeamColor(c: number) { this.sleeveMat.color.setHex(c); }

  private key = '';

  setWeapon(id: WeaponId, scope: ScopeId) {
    if (this.key === id + scope) return;
    this.key = id + scope;
    const m = weaponModel(id, scope === 'iron');
    this.gun.geometry = m.geometry;
    if (this.optic) { this.gun.remove(this.optic); this.optic = null; }
    const og = opticModel(scope);
    if (og) {
      this.optic = new THREE.Mesh(og, WEAPON_MATERIAL);
      this.optic.position.set(0, 0, m.opticMount.z);
      this.gun.add(this.optic);
    }
    this.sightH = SCOPES[scope].sightHeight;
    this.muzzleLocal.copy(m.muzzle).multiplyScalar(VM_SCALE);
    this.flash.position.copy(this.muzzleLocal);
  }

  fire() {
    this.kick = 1;
    this.flashT = XCFG.vfx.muzzleTime;
    this.flash.visible = true;
    this.flash.rotation.z = Math.random() * Math.PI;
  }

  update(dt: number, s: VmState) {
    // sprint / turunkan senjata
    this.sprintT = damp(this.sprintT, s.sprint ? 1 : 0, 14, dt);
    this.lower = damp(this.lower, s.grenade ? 1 : 0, 12, dt);
    // bob mengikuti irama langkah
    const moving = s.grounded && s.speed > 1;
    if (moving) this.bobT += dt * Math.PI / s.stepInterval;
    const bm = (s.sprint ? V.bobSprintMult : 1) * (1 - s.ads * 0.85) * (moving ? 1 : 0);
    const bobX = V.bobX * Math.sin(this.bobT) * bm, bobY = V.bobY * Math.abs(Math.sin(this.bobT)) * bm;
    // sway: offset = −Δmouse × 0.0004, dibatasi ±0.03, pulih 10/s
    this.swayX = THREE.MathUtils.clamp(this.swayX - s.mouseDx * V.swayMult, -V.swayMax, V.swayMax);
    this.swayY = THREE.MathUtils.clamp(this.swayY + s.mouseDy * V.swayMult, -V.swayMax, V.swayMax);
    this.swayX = damp(this.swayX, 0, V.swayReturn, dt); this.swayY = damp(this.swayY, 0, V.swayReturn, dt);
    // kick: akar z +0.04, pitch +2.5°, pulih 12/s
    this.kick = damp(this.kick, 0, V.kickReturn, dt);

    const a = s.ads, sp = this.sprintT * (1 - a);
    const hx = V.hip[0], hy = V.hip[1], hz = V.hip[2];
    let x = THREE.MathUtils.lerp(hx, 0, a), y = THREE.MathUtils.lerp(hy, -this.sightH, a), z = THREE.MathUtils.lerp(hz, V.adsZ, a);
    x = THREE.MathUtils.lerp(x, V.sprintPos[0], sp); y = THREE.MathUtils.lerp(y, V.sprintPos[1], sp); z = THREE.MathUtils.lerp(z, V.sprintPos[2], sp);
    let rx = D2R(V.sprintPitchDeg) * sp + D2R(V.kickPitchDeg) * this.kick * (1 - 0.6 * a);
    const ry = D2R(V.sprintYawDeg) * sp;
    let rz = 0;
    // reload: turun 0.15 dan roll 25° pada 70% tengah durasi
    if (s.reload >= 0) {
      const p = s.reload, w = p < 0.15 ? p / 0.15 : p > 0.85 ? (1 - p) / 0.15 : 1;
      y -= V.reloadDrop * w; rz = D2R(V.reloadRollDeg) * w; rx += D2R(-8) * w;
    }
    y -= this.lower * 0.6;
    this.pivot.position.set(x + bobX + this.swayX * (1 - a * 0.7), y - bobY + this.swayY * (1 - a * 0.7), z + V.kickZ * this.kick);
    this.pivot.rotation.set(rx, ry, rz);

    if (this.flashT > 0) { this.flashT -= dt; if (this.flashT <= 0) this.flash.visible = false; }
  }

  setVisible(v: boolean) { this.root.visible = v; }
}
