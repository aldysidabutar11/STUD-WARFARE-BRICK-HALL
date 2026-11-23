// src/entities/BlockyCharacter.ts — rig R6, hitbox, animasi (GDD §3.1, §3.2, §3.7)
import * as THREE from 'three';
import { XCFG } from '../config/extraConfig';
import { faceTexture } from '../world/StudTextureGen';
import type { HitPart } from '../core/EventBus';

export type Team = 'blue' | 'red';
export type PartKey = 'head' | 'upper' | 'lower' | 'armR' | 'armL' | 'legR' | 'legL';
export const PART_KEYS: PartKey[] = ['head', 'upper', 'lower', 'armR', 'armL', 'legR', 'legL'];
const PART_HIT: Record<PartKey, HitPart> = { head: 'head', upper: 'upper', lower: 'lower', armR: 'limb', armL: 'limb', legR: 'limb', legL: 'limb' };

const RIG = XCFG.rig, A = XCFG.anim;
const D2R = THREE.MathUtils.degToRad;

let GEO: Record<PartKey, THREE.BoxGeometry> | null = null;
let FACE_MAT: THREE.MeshBasicMaterial | null = null;
const geos = () => GEO ??= {
  head: new THREE.BoxGeometry(...RIG.head.size), upper: new THREE.BoxGeometry(...RIG.upper.size),
  lower: new THREE.BoxGeometry(...RIG.lower.size), armR: new THREE.BoxGeometry(...RIG.arm.size),
  armL: new THREE.BoxGeometry(...RIG.arm.size), legR: new THREE.BoxGeometry(...RIG.leg.size), legL: new THREE.BoxGeometry(...RIG.leg.size),
};

export interface AnimState {
  speed: number; sprinting: boolean; crouchT: number; airborne: boolean; pitch: number;
  reload: number;          // progres 0..1, −1 bila tidak reload
  throwPose: number;       // sudut ShoulderR override (rad) atau NaN
  lowReady: boolean;       // senjata turun (sprint)
}

export class BlockyCharacter {
  readonly root = new THREE.Group();
  readonly hips = new THREE.Group();
  readonly chest = new THREE.Group();
  readonly neck = new THREE.Group();
  readonly shoulderR = new THREE.Group();
  readonly shoulderL = new THREE.Group();
  readonly hipR = new THREE.Group();
  readonly hipL = new THREE.Group();
  readonly weaponMount = new THREE.Group();
  readonly parts = {} as Record<PartKey, THREE.Mesh>;
  readonly mats = {} as Record<PartKey, THREE.MeshLambertMaterial>;
  readonly hitboxes: THREE.Mesh[] = [];
  readonly colors = {} as Record<PartKey, number>;
  private face: THREE.Mesh;
  private t = Math.random() * 10;
  private walkPhase = 0;
  private flashT = 0;
  private flashPart: PartKey | null = null;
  protectT = 0;

  constructor(readonly entityId: number, readonly team: Team, castShadow: boolean) {
    const g = geos();
    const torso = RIG.colors.torso[team], legs = RIG.colors.legs[team], skin = RIG.colors.skin;
    const col: Record<PartKey, number> = { head: skin, upper: torso, lower: torso, armR: skin, armL: skin, legR: legs, legL: legs };
    for (const k of PART_KEYS) {
      this.colors[k] = col[k];
      this.mats[k] = new THREE.MeshLambertMaterial({ color: col[k], emissive: 0x000000 });
      const m = new THREE.Mesh(g[k], this.mats[k]);
      m.castShadow = castShadow; m.receiveShadow = true;
      m.userData = { entityId, part: PART_HIT[k], key: k };
      this.parts[k] = m;
      this.hitboxes.push(m);
    }
    // hierarki §3.2 — setiap sendi Group, mesh daun (WeaponMount mengikuti pohon PDF: anak ArmR)
    this.root.add(this.hips);
    this.hips.position.set(0, RIG.hipsY, 0);
    this.parts.lower.position.set(0, RIG.lowerY, 0); this.hips.add(this.parts.lower);
    this.chest.position.set(0, RIG.chestY, 0); this.hips.add(this.chest);
    this.parts.upper.position.set(0, RIG.upperY, 0); this.chest.add(this.parts.upper);
    this.neck.position.set(0, RIG.neckY, 0); this.chest.add(this.neck);
    this.parts.head.position.set(0, RIG.headY, 0); this.neck.add(this.parts.head);
    this.shoulderR.position.set(RIG.shoulderX, RIG.shoulderY, 0); this.chest.add(this.shoulderR);
    this.parts.armR.position.set(0, RIG.armY, 0); this.shoulderR.add(this.parts.armR);
    this.weaponMount.position.set(RIG.weaponMount[0], RIG.weaponMount[1], RIG.weaponMount[2]); this.parts.armR.add(this.weaponMount);
    this.shoulderL.position.set(-RIG.shoulderX, RIG.shoulderY, 0); this.chest.add(this.shoulderL);
    this.parts.armL.position.set(0, RIG.armY, 0); this.shoulderL.add(this.parts.armL);
    this.hipR.position.set(RIG.hipX, 0, 0); this.hips.add(this.hipR);
    this.parts.legR.position.set(0, RIG.legY, 0); this.hipR.add(this.parts.legR);
    this.hipL.position.set(-RIG.hipX, 0, 0); this.hips.add(this.hipL);
    this.parts.legL.position.set(0, RIG.legY, 0); this.hipL.add(this.parts.legL);
    // decal wajah di sisi −Z kepala
    FACE_MAT ??= new THREE.MeshBasicMaterial({ map: faceTexture(), transparent: true, alphaTest: 0.5, depthWrite: true });
    this.face = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1), FACE_MAT);
    this.face.position.set(0, 0, -0.602); this.face.rotation.y = Math.PI;
    this.parts.head.add(this.face);
  }

  /** Pemain lokal: tubuh dipindah ke layer 1 (tidak dirender kamera FPS, tetap kena raycaster). */
  setLayer(layer: number) {
    this.root.traverse(o => o.layers.set(layer));
  }

  setVisible(v: boolean) { this.root.visible = v; }

  flash(part: PartKey) {
    if (this.flashPart && this.flashPart !== part) this.mats[this.flashPart].emissive.setHex(0);
    this.flashPart = part; this.flashT = XCFG.vfx.hitFlash;
    this.mats[part].emissive.setHex(0xffffff);
  }

  update(dt: number, s: AnimState) {
    this.t += dt;
    // kilat hit
    if (this.flashT > 0) {
      this.flashT -= dt;
      if (this.flashT <= 0 && this.flashPart) { this.mats[this.flashPart].emissive.setHex(0); this.flashPart = null; }
    }
    // perlindungan spawn: denyut emissive 4 Hz
    if (this.protectT > 0) {
      const k = 0.25 + 0.25 * Math.sin(this.t * Math.PI * 2 * XCFG.player.protectPulseHz);
      for (const p of PART_KEYS) if (p !== this.flashPart) this.mats[p].emissive.setRGB(k, k, k * 1.2);
    } else if (!this.flashPart) {
      for (const p of PART_KEYS) if (this.mats[p].emissive.r !== 0) this.mats[p].emissive.setHex(0);
    }

    const c = s.crouchT;
    this.hips.position.y = THREE.MathUtils.lerp(RIG.hipsY, XCFG.player.hipsCrouchY, c);
    this.chest.position.y = RIG.chestY + A.breathAmp * Math.sin(A.breathFreq * this.t);
    // kaki
    let legL = 0, legR = 0;
    if (s.airborne) { legL = A.airLeg; legR = -A.airLeg; }
    else if (s.speed > 0.3) {
      const crouchWalk = c > 0.5;
      const omega = crouchWalk ? A.crouchWalkOmega : s.sprinting ? A.sprintOmega
        : THREE.MathUtils.clamp(A.walkOmegaBase * (s.speed / 6.0), A.walkOmegaMin, A.walkOmegaMax);
      const amp = crouchWalk ? A.crouchWalkAmp : s.sprinting ? A.sprintAmp : A.walkAmp;
      this.walkPhase += omega * dt;
      const th = Math.sin(this.walkPhase) * amp;
      legL = th; legR = -th;
    } else this.walkPhase = 0;
    // jongkok: HipL +90°, HipR −90° (berlutut) + osilasi jalan jongkok
    this.hipL.rotation.x = THREE.MathUtils.lerp(legL, D2R(90) + (c > 0.5 ? legL : 0), c);
    this.hipR.rotation.x = THREE.MathUtils.lerp(legR, -D2R(90) + (c > 0.5 ? legR : 0), c);
    // tubuh condong saat sprint
    this.chest.rotation.x = s.sprinting ? -D2R(A.sprintLeanDeg) : 0;
    // lengan: pose pegang/bidik
    const aim = D2R(90) + s.pitch;
    this.shoulderR.rotation.set(s.lowReady ? D2R(A.sprintShoulderDeg) : aim, 0, 0);
    this.shoulderL.rotation.set(s.lowReady ? D2R(A.sprintShoulderDeg) : aim, D2R(A.holdCrossDeg), 0);
    if (s.reload >= 0) this.shoulderL.rotation.x = D2R(90) - D2R(A.reloadSwingDeg) * Math.sin(Math.PI * s.reload);
    if (!Number.isNaN(s.throwPose)) this.shoulderR.rotation.x = s.throwPose;
    this.neck.rotation.x = A.neckPitchMult * s.pitch;
  }
}
