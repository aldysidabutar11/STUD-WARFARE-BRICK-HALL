// src/entities/BlockyCharacter.ts — rig R6, hitbox, animasi (GDD §3.1, §3.2, §3.7)
// Hitbox = balok GDD persis (tidak dirender, tetap kena raycaster); tampilan = mesh anak per bagian (balok + aksesoris,
// atlas CharacterArt) sesuai desain karakter pengguna (Biru taktis / Merah gerilyawan, pria/wanita).
import * as THREE from 'three';
import { XCFG } from '../config/extraConfig';
import type { HitPart } from '../core/EventBus';
import { Spring, damp } from './moveFeel';
import { characterArt, type Variant } from './CharacterArt';
import { WEAPON_MATERIAL, grenadeModel, knifeModel, flashbangModel, meleeModel } from '../combat/WeaponModels';
import type { MeleeId } from '../config/weaponsExtra';
import type { Held } from '../combat/Slots';
import { RIG_SLASH_A, RIG_SLASH_B, RIG_STAB, sampleKeys } from './knifeAnim';
import { BAKE_UNIFORMS } from '../world/LightBake';
import { VENNY_GUN_SCALE, VennyRig, type R6Pose } from './venny/rig';

export type Team = 'blue' | 'red';
export type PartKey = 'head' | 'upper' | 'lower' | 'armR' | 'armL' | 'legR' | 'legL';
export const PART_KEYS: PartKey[] = ['head', 'upper', 'lower', 'armR', 'armL', 'legR', 'legL'];
const PART_HIT: Record<PartKey, HitPart> = { head: 'head', upper: 'upper', lower: 'lower', armR: 'limb', armL: 'limb', legR: 'limb', legL: 'limb' };

const RIG = XCFG.rig, A = XCFG.anim, FA = XCFG.feel.anim;
const D2R = THREE.MathUtils.degToRad;
const wrapAngle = (a: number) => { a = (a + Math.PI) % (2 * Math.PI); if (a < 0) a += 2 * Math.PI; return a - Math.PI; };
/** Nilai keyframe pisau TPS (dipakai ulang tiap frame, tanpa alokasi). */
const _kv = [0, 0, 0, 0, 0, 0];

/**
 * Arah langkah kaki relatif tubuh (rad, + = putar kiri) untuk kecepatan lokal (lr kanan, lf maju).
 * Strafe kanan → kaki diputar ±54° ke kanan; mundur-serong → dicerminkan (kaki menghadap lawan arah gerak).
 * `back` = sedang di setengah belakang (histeresis 97°–110°; strafe murni 90° selalu setengah depan).
 */
export function strideYaw(lr: number, lf: number, back: boolean): { yaw: number; back: boolean } {
  const phi = Math.atan2(lr, lf), a = Math.abs(phi);
  const isBack = a > Math.PI / 2 + (back ? FA.strideBackExit : FA.strideBackEnter);
  const p = isBack ? (phi > 0 ? phi - Math.PI : phi + Math.PI) : phi;
  const max = D2R(FA.strideYawMaxDeg);
  return { yaw: -THREE.MathUtils.clamp(p * FA.strideYawMult, -max, max), back: isBack };
}

let GEO: Record<PartKey, THREE.BoxGeometry> | null = null;
/** Material hitbox: tidak digambar (renderer melewatinya, anak tetap dirender); Mesh.raycast tetap menguji geometrinya. */
const HITBOX_MAT = new THREE.MeshBasicMaterial({ visible: false });
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
  melee: number;           // progres pukulan popor 0..1, −1 bila tidak
  /** Opsional (entitas hidup): kecepatan horizontal dunia, yaw tubuh, fase langkah → kaki ikut arah gerak & menapak
   *  bersamaan suara langkah. Tanpa ini (ghost killcam) dipakai siklus ω §3.7. */
  vx?: number; vz?: number; yaw?: number; stepPhase?: number;
  /** Benda di tangan (default senapan): pisau/granat → pegang satu tangan, lengan kiri santai. */
  held?: Held;
  /** Serangan pisau: progres 0..1 (−1 bila tidak); knifeStab = tusuk (false = tebas); knifeAlt = tebasan balik. */
  knife?: number; knifeStab?: boolean; knifeAlt?: boolean;
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
  /** Hitbox per bagian (dimensi GDD persis, tidak dirender). */
  readonly parts = {} as Record<PartKey, THREE.Mesh>;
  /** Tampilan per bagian (anak hitbox, bingkai lokal sama). */
  readonly visuals = {} as Record<PartKey, THREE.Mesh>;
  readonly mats = {} as Record<PartKey, THREE.MeshLambertMaterial>;
  readonly hitboxes: THREE.Mesh[] = [];
  readonly colors = {} as Record<PartKey, number>;
  variant: Variant;
  private t = Math.random() * 10;
  private walkPhase = 0;
  // transisi halus (berat 0..1) + arah kaki + hentakan mendarat
  private walkW = 0; private airW = 0; private leanW = 0; private lowW = 0; private turnW = 0;
  private ampS: number = A.walkAmp;
  private strideBack = false;
  private legYawW: number | null = null;   // arah hadap kaki di dunia (rad)
  private turning = false; private turnPhase = 0;
  private wasAir = false; private airT = 0;
  private landS = new Spring(FA.landOmega, FA.landZeta);
  private flashT = 0;
  private flashPart: PartKey | null = null;
  protectT = 0;
  // benda di tangan: senapan (dipasang pemilik lewat setGun), pisau & granat (dibuat di sini → ikut setLayer)
  private gun: THREE.Object3D | null = null;
  /** Pistol (slot 2), dipasang pemilik lewat setPistol. */
  private pistol: THREE.Object3D | null = null;
  private readonly knifeMesh: THREE.Mesh;
  private readonly nadeMesh: THREE.Mesh;
  private heldKind: Held = 'ar';
  /** Probe cahaya (medan bake): x = pengali cahaya lingkungan, y = cahaya pantul hangat (lihat setProbe). */
  private readonly probeU = { value: new THREE.Vector2(1, 0) };
  /** Venny (varian 'v'): model realistis ber-skin menggantikan balok tampilan; hitbox balok GDD tetap (venny/rig.ts). */
  venny: VennyRig | null = null;
  private readonly castShadow: boolean;
  private vp: R6Pose | null = null;

  constructor(readonly entityId: number, readonly team: Team, castShadow: boolean, variant: Variant = 'm') {
    const g = geos(), art = characterArt(team, variant);
    this.variant = variant;
    this.castShadow = castShadow;
    for (const k of PART_KEYS) {
      const hb = new THREE.Mesh(g[k], HITBOX_MAT);
      hb.userData = { entityId, part: PART_HIT[k], key: k };
      this.parts[k] = hb;
      this.hitboxes.push(hb);
      // material per karakter per bagian (kilat kena tembak / denyut perlindungan), atlas dipakai bersama
      this.mats[k] = new THREE.MeshLambertMaterial({ map: art.texture, alphaTest: 0.5, emissive: 0x000000 });
      this.mats[k].onBeforeCompile = (sh) => {
        sh.uniforms.uProbe = this.probeU; sh.uniforms.uBounce = BAKE_UNIFORMS.uBounce;
        sh.fragmentShader = sh.fragmentShader
          .replace('#include <common>', `#include <common>
uniform vec2 uProbe;
uniform vec3 uBounce;`)
          .replace('#include <aomap_fragment>', `#include <aomap_fragment>
	reflectedLight.indirectDiffuse *= uProbe.x;
	reflectedLight.indirectDiffuse += diffuseColor.rgb * uBounce * uProbe.y;`);
      };
      this.mats[k].customProgramCacheKey = () => 'char-probe';
      const v = new THREE.Mesh(art.parts[k], this.mats[k]);
      v.castShadow = castShadow; v.receiveShadow = true;
      hb.add(v); this.visuals[k] = v;
      this.colors[k] = art.chip[k];
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
    this.knifeMesh = new THREE.Mesh(knifeModel(), WEAPON_MATERIAL);
    this.knifeMesh.rotation.x = -Math.PI / 2 + D2R(12); // bilah (−Z) searah lengan (−Y mount), ujung sedikit terangkat
    this.knifeMesh.scale.setScalar(XCFG.knife.tpsScale);  // tangan blocky besar → pisau diperbesar agar terbaca
    this.nadeMesh = new THREE.Mesh(grenadeModel(), WEAPON_MATERIAL);
    for (const m of [this.knifeMesh, this.nadeMesh]) { m.castShadow = castShadow; m.visible = false; this.weaponMount.add(m); }
    if (variant === 'v') this.enableVenny();
  }

  /** Pasang model Venny realistis: balok tampilan disembunyikan, weaponMount dipindah ke rig Venny (bahu/tangan). */
  private enableVenny() {
    if (this.venny) return;
    const v = this.venny = new VennyRig(this.team, this.castShadow, this.probeU, BAKE_UNIFORMS.uBounce);
    const mask = this.root.layers.mask;
    v.root.traverse(o => { o.layers.mask = mask; });
    this.root.add(v.root);
    for (const k of PART_KEYS) this.visuals[k].visible = false;
    if (this.gun) this.gun.scale.setScalar(VENNY_GUN_SCALE);
    if (this.pistol) this.pistol.scale.setScalar(VENNY_GUN_SCALE);
    this.knifeMesh.scale.setScalar(1);
    const C = XCFG.rig.colors.venny;
    this.colors.head = C.skin; this.colors.upper = C.vest; this.colors.lower = C.skirt;
    this.colors.armR = C.skin; this.colors.armL = C.skin; this.colors.legR = C.skirt; this.colors.legL = C.skirt;
  }

  /** Kembali ke balok (ganti varian dari Venny). */
  private disableVenny() {
    const v = this.venny;
    if (!v) return;
    this.root.remove(v.root); v.dispose(); this.venny = null;
    for (const k of PART_KEYS) this.visuals[k].visible = true;
    this.parts.armR.add(this.weaponMount);
    this.weaponMount.position.set(RIG.weaponMount[0], RIG.weaponMount[1], RIG.weaponMount[2]);
    this.weaponMount.rotation.set(0, 0, 0);
    if (this.gun) this.gun.scale.setScalar(1);
    if (this.pistol) this.pistol.scale.setScalar(1);
    this.knifeMesh.scale.setScalar(XCFG.knife.tpsScale);
  }

  /** Cahaya lingkungan karakter dari medan bake (langit 0..1, pantul 0..1); minimum dijaga agar musuh tetap terlihat. */
  setProbe(sky: number, bounce: number) {
    const m = XCFG.gfx.bake.probeMin;
    this.probeU.value.set(m + (1 - m) * Math.min(1, sky * 1.6), bounce);
  }

  /** Pasang mesh senapan dunia di tangan kanan (Entity / ghost killcam). */
  setGun(mesh: THREE.Object3D) {
    this.weaponMount.add(mesh);
    this.gun = mesh;
    mesh.visible = this.heldKind === 'ar';
    if (this.venny) mesh.scale.setScalar(VENNY_GUN_SCALE);
  }

  /** Model senjata jarak dekat di tangan (pisau / karambit / kukri / tomahawk). */
  setMelee(id: MeleeId) { const g = meleeModel(id); if (this.knifeMesh.geometry !== g) this.knifeMesh.geometry = g; }

  /** Pasang mesh pistol dunia di tangan kanan (Entity / ghost killcam). */
  setPistol(mesh: THREE.Object3D) {
    this.weaponMount.add(mesh);
    this.pistol = mesh;
    mesh.visible = this.heldKind === 'pistol';
    if (this.venny) mesh.scale.setScalar(VENNY_GUN_SCALE);
  }

  /** Tampilkan benda yang dipegang (senapan / pistol / pisau / granat / kosong). */
  private setHeld(h: Held) {
    if (h === this.heldKind) return;
    this.heldKind = h;
    if (this.gun) this.gun.visible = h === 'ar';
    if (this.pistol) this.pistol.visible = h === 'pistol';
    this.knifeMesh.visible = h === 'knife';
    this.nadeMesh.visible = h === 'grenade' || h === 'flash';
    if (h === 'grenade' || h === 'flash') this.nadeMesh.geometry = h === 'flash' ? flashbangModel() : grenadeModel();
  }

  /** Ganti varian (pria/wanita) seketika: hanya geometri & atlas tampilan; hitbox tidak berubah. */
  setVariant(v: Variant) {
    if (v === this.variant) return;
    this.variant = v;
    const art = characterArt(this.team, v);
    for (const k of PART_KEYS) {
      this.visuals[k].geometry = art.parts[k];
      this.mats[k].map = art.texture; this.mats[k].needsUpdate = true;
      this.colors[k] = art.chip[k];
    }
    if (v === 'v') this.enableVenny(); else this.disableVenny();
  }

  /** Material bersama untuk balok tubuh yang berhamburan saat mati. */
  get debrisMaterial() { return characterArt(this.team, this.variant).debrisMat; }

  /** Pemain lokal: tubuh dipindah ke layer 1 (tidak dirender kamera FPS, tetap kena raycaster). */
  setLayer(layer: number) {
    this.root.traverse(o => o.layers.set(layer));
  }

  setVisible(v: boolean) { this.root.visible = v; }

  /** Pose netral seketika (spawn/teleport): kaki menghadap yaw, tanpa sisa transisi. */
  resetPose(yaw: number) {
    this.legYawW = yaw; this.walkW = 0; this.airW = 0; this.leanW = 0; this.lowW = 0; this.turnW = 0;
    this.turning = false; this.wasAir = false; this.airT = 0; this.landS.reset();
    this.hips.rotation.y = 0; this.chest.rotation.y = 0;
  }

  flash(part: PartKey) {
    if (this.flashPart && this.flashPart !== part) this.mats[this.flashPart].emissive.setHex(0);
    this.flashPart = part; this.flashT = XCFG.vfx.hitFlash;
    this.mats[part].emissive.setHex(0xffffff);
    if (this.venny) this.venny.mat.emissive.setHex(0x8a8a8a);   // satu material: kilat lebih lembut
  }

  update(dt: number, s: AnimState) {
    this.t += dt;
    const vm = this.venny?.mat;
    // kilat hit
    if (this.flashT > 0) {
      this.flashT -= dt;
      if (this.flashT <= 0 && this.flashPart) { this.mats[this.flashPart].emissive.setHex(0); this.flashPart = null; vm?.emissive.setHex(0); }
    }
    // perlindungan spawn: denyut emissive 4 Hz
    if (this.protectT > 0) {
      const k = 0.25 + 0.25 * Math.sin(this.t * Math.PI * 2 * XCFG.player.protectPulseHz);
      for (const p of PART_KEYS) if (p !== this.flashPart) this.mats[p].emissive.setRGB(k, k, k * 1.2);
      if (vm && !this.flashPart) vm.emissive.setRGB(k * 0.6, k * 0.6, k * 0.75);
    } else if (!this.flashPart) {
      for (const p of PART_KEYS) if (this.mats[p].emissive.r !== 0) this.mats[p].emissive.setHex(0);
      if (vm && vm.emissive.r !== 0) vm.emissive.setHex(0);
    }

    const c = s.crouchT;
    const moving = s.speed > 0.3 && !s.airborne;
    // ── arah kaki (bila yaw & kecepatan tersedia): kaki menghadap arah gerak; diam → kaki tetap, tubuh atas memuntir;
    //    puntiran > 50° → kaki menyusul sambil melangkah kecil. Tubuh atas selalu menghadap arah bidik (chest dibalik).
    let hipYaw = 0;
    if (s.yaw !== undefined) {
      const yaw = s.yaw;
      if (this.legYawW === null) this.legYawW = yaw;
      if (moving && s.vx !== undefined && s.vz !== undefined) {
        const sy = Math.sin(yaw), cy = Math.cos(yaw);
        const st = strideYaw(s.vx * cy - s.vz * sy, -s.vx * sy - s.vz * cy, this.strideBack);
        this.strideBack = st.back;
        this.legYawW += wrapAngle(yaw + st.yaw - this.legYawW) * (1 - Math.exp(-FA.strideYawRate * dt));
        this.turning = false;
      } else if (!s.airborne) {
        const twist = wrapAngle(this.legYawW - yaw);
        if (Math.abs(twist) > D2R(FA.turnThreshDeg)) this.turning = true;
        if (this.turning) {
          const step = D2R(FA.turnRateDeg) * dt;
          this.legYawW = Math.abs(twist) <= step ? yaw : this.legYawW - Math.sign(twist) * step;
          if (Math.abs(wrapAngle(this.legYawW - yaw)) < D2R(3)) this.turning = false;
        }
      }
      hipYaw = wrapAngle(this.legYawW - yaw);
      if (Math.abs(hipYaw) > D2R(100)) { this.legYawW = yaw; hipYaw = 0; } // teleport/putar instan → tanpa puntiran
    }

    // ── berat pose (transisi halus, bukan lompatan instan)
    const crouchWalk = c > 0.5;
    this.airW = damp(this.airW, s.airborne ? 1 : 0, FA.airRate, dt);
    this.walkW = damp(this.walkW, moving ? 1 : 0, FA.blendRate, dt);
    this.turnW = damp(this.turnW, this.turning && !moving ? 1 : 0, FA.blendRate, dt);
    this.leanW = damp(this.leanW, s.sprinting ? 1 : 0, FA.leanRate, dt);
    this.lowW = damp(this.lowW, s.lowReady ? 1 : 0, FA.lowReadyRate, dt);
    this.ampS = damp(this.ampS, crouchWalk ? A.crouchWalkAmp : s.sprinting ? A.sprintAmp : A.walkAmp, FA.blendRate, dt);

    // ── siklus kaki: dari fase langkah PlayerController (kaki terbuka penuh = saat suara langkah) atau ω §3.7 (ghost killcam)
    let swing: number;
    if (s.stepPhase !== undefined) swing = Math.cos(Math.PI * s.stepPhase);
    else {
      if (moving) {
        const omega = crouchWalk ? A.crouchWalkOmega : s.sprinting ? A.sprintOmega
          : THREE.MathUtils.clamp(A.walkOmegaBase * (s.speed / 6.0), A.walkOmegaMin, A.walkOmegaMax);
        this.walkPhase += omega * dt;
      }
      swing = Math.sin(this.walkPhase);
    }
    if (this.turnW > 0.01) this.turnPhase += 9 * dt;
    const th = this.ampS * (swing * this.walkW + Math.sin(this.turnPhase) * this.turnW * FA.turnStep);
    const legL = THREE.MathUtils.lerp(th, A.airLeg, this.airW), legR = THREE.MathUtils.lerp(-th, -A.airLeg, this.airW);
    // jongkok: HipL +90°, HipR −90° (berlutut) + osilasi jalan jongkok
    this.hipL.rotation.x = THREE.MathUtils.lerp(legL, D2R(90) + (c > 0.5 ? legL : 0), c);
    this.hipR.rotation.x = THREE.MathUtils.lerp(legR, -D2R(90) + (c > 0.5 ? legR : 0), c);

    // ── hentakan mendarat: pinggul turun sesaat (pegas), makin dalam makin lama di udara
    if (s.airborne) this.airT += dt;
    else if (this.wasAir) { this.landS.kick(-FA.landDip * THREE.MathUtils.clamp(this.airT / 0.5, 0.3, 1)); this.airT = 0; }
    this.wasAir = s.airborne;
    this.hips.position.y = THREE.MathUtils.lerp(RIG.hipsY, XCFG.player.hipsCrouchY, c) + this.landS.update(dt);
    this.chest.position.y = RIG.chestY + A.breathAmp * Math.sin(A.breathFreq * this.t);
    // tubuh condong saat sprint (halus)
    this.chest.rotation.x = -D2R(A.sprintLeanDeg) * this.leanW;
    // lengan: pose pegang/bidik ↔ low-ready sprint (halus, sedikit berayun mengikuti langkah)
    const held = s.held ?? 'ar';
    this.setHeld(held);
    const aim = D2R(90) + s.pitch;
    const low = D2R(A.sprintShoulderDeg) + D2R(FA.sprintArmSwingDeg) * swing * this.walkW;
    if (held === 'ar') {
      const arm = THREE.MathUtils.lerp(aim, low, this.lowW);
      this.shoulderR.rotation.set(arm, 0, 0);
      this.shoulderL.rotation.set(arm, D2R(A.holdCrossDeg), 0);
      if (s.reload >= 0) this.shoulderL.rotation.x = D2R(90) - D2R(A.reloadSwingDeg) * Math.sin(Math.PI * s.reload);
    } else if (held === 'pistol') {
      // pistol dua tangan: kedua lengan lurus ke depan & bertemu di tengah (tangan kiri menopang tangan kanan)
      const arm = THREE.MathUtils.lerp(aim, low, this.lowW);
      this.shoulderR.rotation.set(arm, -D2R(XCFG.rig.pistolCrossDeg[0]), 0);
      this.shoulderL.rotation.set(arm, D2R(XCFG.rig.pistolCrossDeg[1]), 0);
      if (s.reload >= 0) this.shoulderL.rotation.x = arm - D2R(A.reloadSwingDeg) * Math.sin(Math.PI * s.reload);
    } else {
      // satu tangan (pisau / granat): lengan kanan sedikit di bawah garis bidik, lengan kiri santai mengayun mengikuti langkah
      const hold = D2R(72) + 0.8 * s.pitch;
      this.shoulderR.rotation.set(THREE.MathUtils.lerp(hold, low, this.lowW), 0, 0);
      this.shoulderL.rotation.set(D2R(22) - D2R(FA.sprintArmSwingDeg) * swing * this.walkW, 0, -D2R(8));
    }
    // pisau (keyframe knifeAnim): bahu kanan (angkat + sapuan horizontal), puntir & condong dada, putar pergelangan, pinggul turun
    const kp = held === 'knife' ? s.knife ?? -1 : -1;
    if (kp >= 0) sampleKeys(s.knifeStab ? RIG_STAB : s.knifeAlt ? RIG_SLASH_B : RIG_SLASH_A, kp, _kv); else _kv.fill(0);
    if (kp >= 0) {
      this.shoulderR.rotation.x = Math.max(this.shoulderR.rotation.x, D2R(60) + 0.8 * s.pitch) + _kv[0];
      this.shoulderR.rotation.z = _kv[1];
      this.chest.rotation.x -= _kv[3];
      this.hips.position.y -= 0.35 * _kv[5];
    }
    this.weaponMount.rotation.y = _kv[4];
    if (!Number.isNaN(s.throwPose)) this.shoulderR.rotation.x = s.throwPose;
    this.neck.rotation.x = A.neckPitchMult * s.pitch;
    // pinggul memutar ke arah kaki; dada dibalik agar tubuh atas tetap menghadap bidikan
    this.hips.rotation.y = hipYaw;
    let chestYaw = -hipYaw;
    chestYaw += _kv[2];                      // pisau: badan ikut memuntir saat menebas / menusuk
    // pukulan popor: kedua lengan terangkat menyodok + badan memuntir
    if (s.melee >= 0 && held === 'ar') {
      const w = Math.sin(Math.PI * Math.min(1, s.melee));
      this.shoulderR.rotation.x = aim + D2R(35) * w; this.shoulderL.rotation.x = aim + D2R(35) * w;
      chestYaw += D2R(28) * w;
    }
    this.chest.rotation.y = chestYaw;
    if (this.venny) {
      const vp = this.vp ??= { hipsY: 0, hipsYaw: 0, chestX: 0, chestY: 0, chestDy: 0, neckX: 0, shoulderR: this.shoulderR.rotation,
        shoulderL: this.shoulderL.rotation, legL: 0, legR: 0, crouch: 0, air: 0, low: 0, walk: 0, held: 'ar', reload: -1, gun: null };
      vp.hipsY = this.hips.position.y; vp.hipsYaw = this.hips.rotation.y; vp.chestX = this.chest.rotation.x; vp.chestY = chestYaw;
      vp.chestDy = this.chest.position.y - RIG.chestY; vp.neckX = this.neck.rotation.x;
      vp.legL = legL; vp.legR = legR; vp.crouch = c; vp.air = this.airW; vp.low = this.lowW; vp.walk = this.walkW;
      const g = held === 'pistol' ? this.pistol : this.gun;
      vp.held = held; vp.reload = s.reload; vp.gun = g instanceof THREE.Mesh ? g : null;
      this.venny.pose(vp, this.weaponMount, this.root);
    }
  }
}
