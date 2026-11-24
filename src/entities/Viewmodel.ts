// src/entities/Viewmodel.ts — lengan + senjata FPS di scene terpisah (GDD §9.1, §7.4)
import * as THREE from 'three';
import { XCFG } from '../config/extraConfig';
import { SCOPES, type ScopeId, type WeaponId } from '../config/weaponsData';
import { KNIFE_MID, KNIFE_TIP, VM_SCALE, VM_WEAPON_MATERIAL, createOpticMesh, grenadeModel, knifeModel, weaponModel } from '../combat/WeaponModels';
import { TRAIL_WINDOW, VM_SLASH_A, VM_SLASH_B, VM_STAB, sampleKeys } from './knifeAnim';
import type { Held } from '../combat/Slots';
import { CFG } from '../config/gameConfig';
import { Spring, damp, moveFeel } from './moveFeel';
import type { Team } from './BlockyCharacter';
import { sleeveTexture, type Variant } from './CharacterArt';

/** UV balok diskalakan ke ukuran sisinya (1 ulangan tiap `tile` unit) → tekstur lengan tidak melar di balok panjang.
 *  Urutan sisi BoxGeometry: px, nx (u=z, v=y) · py, ny (u=x, v=z) · pz, nz (u=x, v=y); 4 verteks per sisi. */
function tileUV(geo: THREE.BufferGeometry, sx: number, sy: number, sz: number, tile: number) {
  const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
  const dims: [number, number][] = [[sz, sy], [sz, sy], [sx, sz], [sx, sz], [sx, sy], [sx, sy]];
  for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) { const k = f * 4 + i; uv.setXY(k, uv.getX(k) * dims[f][0] / tile, uv.getY(k) * dims[f][1] / tile); }
  return geo;
}

const V = XCFG.viewmodel, FV = XCFG.feel.vm;
const D2R = THREE.MathUtils.degToRad;
const KN = XCFG.knife;
// Pisau FPS: kepalan (tangan + pisau) diposisikan keyframe di ruang pivot (pose pinggul senapan) sehingga selalu tampak di
// layar; lengan bawah = balok yang direntangkan dari pergelangan ke bahu tetap di luar layar (kanan-bawah).
const K_HAND = [-0.05, 0.08, 0.12] as const;                 // genggaman diam (kamera ≈ 0.27, −0.22, −0.50)
const K_DIR = new THREE.Vector3(-0.2, 0.32, -0.92).normalize(); // arah bilah diam: maju, naik, sedikit ke tengah
const K_ROLL = D2R(-35);                                      // putar bilah: sisi tajam ke kiri-bawah, muka bilah terlihat
const K_SHOULDER = new THREE.Vector3(0.13, -0.32, 0.67);      // bahu (kamera ≈ 0.45, −0.62, 0.05)
const K_CUFF = new THREE.Vector3(0.026, -0.03, 0.075);        // pergelangan di belakang kepalan (lokal kepalan)
const _zAx = new THREE.Vector3(0, 0, 1), _qa = new THREE.Quaternion(), _qr = new THREE.Quaternion(), _eu = new THREE.Euler();
const _w = new THREE.Vector3(), _d = new THREE.Vector3();
const TR_N = KN.trail.samples;

export interface VmState {
  ads: number;          // 0..1 (easing transisi ADS)
  sprint: boolean; reload: number; // reload progres 0..1 atau −1
  speed: number; stepInterval: number; grounded: boolean;
  mouseDx: number; mouseDy: number;
  held: Held;           // benda di tangan: senapan / pisau / granat / kosong (setelah melempar)
  melee: number;        // progres pukulan popor 0..1, −1 bila tidak
  knife?: number;       // progres serangan pisau 0..1, −1 bila tidak
  knifeStab?: boolean;  // tusuk (false = tebas)
  knifeAlt?: boolean;   // tebasan balik (kiri → kanan)
  equip?: number;       // sisa animasi angkat 1..0
  cooking?: boolean; overhand?: boolean; // granat: sedang memasak (tangan ditarik ke belakang/atas atau ke bawah)
  /** Opsional (pemain): kecepatan lokal kamera (kanan, maju, atas) & fase langkah — inersia + bob sinkron langkah. */
  vx?: number; vz?: number; vy?: number; stepPhase?: number;
}

export class Viewmodel {
  readonly root = new THREE.Group();
  private pivot = new THREE.Group();     // offset pose
  private rifle = new THREE.Group();     // senapan + dua lengan + muzzle flash
  private knifeRig = new THREE.Group();  // wadah: kepalan + pisau (keyframe) & lengan bawah (direntang ke bahu)
  private knifeMesh: THREE.Mesh;
  private fist = new THREE.Group();
  private kSleeve: THREE.Mesh;
  private qRest = new THREE.Quaternion();
  private kv = [0, 0, 0, 0, 0, 0];
  // jejak kilatan bilah: cincin sampel ujung & tengah bilah (ruang kamera viewmodel), pita aditif memudar
  private trail: THREE.Mesh;
  private trailPos = new Float32Array(TR_N * 2 * 3);
  private trailCol = new Float32Array(TR_N * 2 * 4);
  private trTip = Array.from({ length: TR_N }, () => new THREE.Vector3());
  private trMid = Array.from({ length: TR_N }, () => new THREE.Vector3());
  private trAge = new Float32Array(TR_N).fill(99);
  private trHead = 0;
  private nadeRig = new THREE.Group();   // granat + lengan kanan
  private cookW = 0;
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
  /** Pengali bob/sway/inersia dari pengaturan "Gerak kamera" (0..1). */
  bobScale = 1;
  private bobW = 0;                                   // berat bob (memudar halus saat berhenti)
  private lagX = new Spring(FV.omega, FV.zeta);       // inersia: senjata tertinggal saat bergerak/berhenti
  private lagZ = new Spring(FV.omega, FV.zeta);
  private lagR = new Spring(FV.omega, FV.zeta);
  private lagY = new Spring(FV.omega, FV.zeta);
  private landS = new Spring(FV.land.omega, FV.land.zeta);
  private idleT = Math.random() * 10; private idleW = 0;
  // lengan mengikuti kostum tim (CharacterArt): Biru = lengan baju biru + pelindung hitam; Merah = kulit + balutan kain
  private sleeveMat = new THREE.MeshLambertMaterial();
  private cuffMat = new THREE.MeshLambertMaterial();
  private gloveMat = new THREE.MeshLambertMaterial({ color: XCFG.rig.colors.glove });
  private fingerMat = new THREE.MeshLambertMaterial({ color: XCFG.rig.colors.finger });

  constructor(scene: THREE.Scene, team: Team) {
    this.setOutfit(team);
    scene.add(this.root);
    this.root.add(this.pivot);
    this.pivot.add(this.rifle, this.knifeRig, this.nadeRig);
    this.gun = new THREE.Mesh(new THREE.BufferGeometry(), VM_WEAPON_MATERIAL);
    this.gun.scale.setScalar(VM_SCALE);
    this.rifle.add(this.gun);
    // lengan blocky: sarung tangan (jari kulit di ujung) di grip/handguard, manset/balutan, lengan menjauh ke bawah layar
    const arm = (len: number, hand: THREE.Vector3, dir: THREE.Vector3) => {
      const g = new THREE.Group();
      const glove = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.11), this.gloveMat);
      const fingers = new THREE.Mesh(new THREE.BoxGeometry(0.094, 0.06, 0.035), this.fingerMat);
      fingers.position.set(0, -0.012, -0.06);
      const cuff = new THREE.Mesh(new THREE.BoxGeometry(0.112, 0.112, 0.1), this.cuffMat);
      cuff.position.z = 0.11;
      const sleeve = new THREE.Mesh(tileUV(new THREE.BoxGeometry(0.1, 0.1, len), 0.1, 0.1, len, 0.1), this.sleeveMat);
      sleeve.position.z = len / 2 + 0.05;
      g.add(glove, fingers, cuff, sleeve);
      g.position.copy(hand);
      g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir.normalize());
      return g;
    };
    const armR = arm(0.42, new THREE.Vector3(0.0, -0.07, 0.02), new THREE.Vector3(0.22, -0.72, 0.3));
    const armL = arm(0.4, new THREE.Vector3(-0.02, -0.03, -0.3), new THREE.Vector3(-0.2, -0.8, 0.18));
    this.rifle.add(armR, armL);
    // pisau: kepalan menggenggam gagang — punggung tangan di kanan, 4 jari melingkar di kiri, telapak di bawah, jempol di
    // atas menekan ke pelindung; pommel menyembul di belakang; manset & lengan bawah turun ke siku (kanan-bawah layar)
    this.knifeMesh = new THREE.Mesh(knifeModel(), VM_WEAPON_MATERIAL);
    this.knifeMesh.scale.setScalar(KN.vmScale);
    const fist = this.fist;
    this.qRest.setFromUnitVectors(new THREE.Vector3(0, 0, -1), K_DIR).multiply(new THREE.Quaternion().setFromAxisAngle(_zAx, K_ROLL));
    const B = (w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); return b;
    };
    fist.add(this.knifeMesh,
      B(0.042, 0.084, 0.088, 0.039, -0.002, -0.008, this.gloveMat),                        // punggung tangan
      B(0.1, 0.022, 0.088, 0.01, -0.044, -0.008, this.gloveMat),                           // telapak di bawah gagang
      ...[-0.042, -0.02, 0.002, 0.024].map(z => B(0.024, 0.046, 0.02, -0.028, -0.014, z, this.fingerMat)), // jari melingkar
      B(0.022, 0.022, 0.052, -0.022, 0.032, -0.046, this.fingerMat),                      // jempol
      B(0.074, 0.088, 0.036, 0.026, -0.03, 0.058, this.cuffMat));                           // manset
    this.kSleeve = B(0.08, 0.08, 1, 0, 0, 0, this.sleeveMat);
    tileUV(this.kSleeve.geometry, 0.08, 0.08, 0.3, 0.1);                             // lengan bawah (panjang diatur tiap frame)
    this.knifeRig.add(fist, this.kSleeve);
    this.animKnife(-1, false, false);
    // jejak kilatan (indeks pita: tiap pasangan sampel → 2 segitiga)
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.BufferAttribute(this.trailPos, 3).setUsage(THREE.DynamicDrawUsage));
    tg.setAttribute('color', new THREE.BufferAttribute(this.trailCol, 4).setUsage(THREE.DynamicDrawUsage));
    const idx: number[] = [];
    for (let i = 0; i < TR_N - 1; i++) { const a = i * 2, b = a + 2; idx.push(a, a + 1, b, a + 1, b + 1, b); }
    tg.setIndex(idx);
    this.trail = new THREE.Mesh(tg, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    this.trail.frustumCulled = false; this.trail.visible = false; this.trail.renderOrder = 2;
    this.root.add(this.trail);
    const nade = new THREE.Mesh(grenadeModel(), VM_WEAPON_MATERIAL);
    nade.scale.setScalar(VM_SCALE); nade.position.set(0, 0.03, -0.02);
    this.nadeRig.add(nade, arm(0.44, new THREE.Vector3(0.0, -0.035, 0.03), new THREE.Vector3(0.24, -0.7, 0.32)));
    this.nadeRig.position.set(-0.04, 0.02, 0.12);
    this.knifeRig.visible = false; this.nadeRig.visible = false;
    // muzzle flash: dua quad silang aditif + balok emissive
    const fm = new THREE.MeshBasicMaterial({ color: 0xffc060, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    this.flash = new THREE.Group();
    const q1 = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.16), fm);
    const q2 = q1.clone(); q2.rotation.y = Math.PI / 2;
    const q3 = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.1), fm); q3.rotation.x = Math.PI / 2;
    this.flash.add(q1, q2, q3);
    this.flash.visible = false;
    this.rifle.add(this.flash);
    const hemi = new THREE.HemisphereLight(0xfff1dd, 0x4a2e1c, 1.6);
    const dir = new THREE.DirectionalLight(0xffe0b5, 1.2); dir.position.set(1, 2, 1);
    scene.add(hemi, dir);
    this.root.visible = false;
  }

  /** Kostum lengan FPS sesuai tim (juga dipakai killcam untuk lengan pembunuh). */
  /** Kostum lengan FPS = tim + varian: Biru pria baju biru, Biru wanita loreng + manset rajut navy, Merah kulit + balutan. */
  setOutfit(team: Team, variant: Variant = 'm') {
    const C = XCFG.rig.colors, camoOn = team === 'blue' && variant === 'f';
    this.sleeveMat.map = sleeveTexture(camoOn);
    this.sleeveMat.color.setHex(camoOn ? 0xffffff : team === 'blue' ? C.blue.shirt : C.skin);
    this.cuffMat.color.setHex(camoOn ? C.blueF.knit : team === 'blue' ? C.blue.gear : C.red.wrap);
  }

  private key = '';

  setWeapon(id: WeaponId, scope: ScopeId) {
    if (this.key === id + scope) return;
    this.key = id + scope;
    const m = weaponModel(id, scope === 'iron');
    this.gun.geometry = m.geometry;
    if (this.optic) { this.gun.remove(this.optic); this.optic = null; }
    this.optic = createOpticMesh(scope, true); // kaca red dot/holo bening → dunia terlihat tembus saat ADS
    if (this.optic) {
      this.optic.position.set(0, 0, m.opticMount.z);
      this.gun.add(this.optic);
    }
    this.sightH = SCOPES[scope].sightHeight;
    this.muzzleLocal.copy(m.muzzle).multiplyScalar(VM_SCALE);
    this.flash.position.copy(this.muzzleLocal);
  }

  /** Senjata terhentak turun saat mendarat (h = tinggi jatuh). */
  land(h: number) {
    const k = this.bobScale * moveFeel.inertia;
    if (k <= 0) return;
    const L = FV.land;
    this.landS.kick(-Math.min(L.max, L.base + L.perUnit * h) * k);
  }

  /** Hapus sisa inersia (respawn / ganti kamera). */
  resetMotion() {
    this.lagX.reset(); this.lagZ.reset(); this.lagR.reset(); this.lagY.reset(); this.landS.reset();
    this.bobW = 0; this.idleW = 0; this.swayX = 0; this.swayY = 0;
  }

  fire() {
    this.kick = 1;
    this.flashT = XCFG.vfx.muzzleTime;
    this.flash.visible = true;
    this.flash.rotation.z = Math.random() * Math.PI;
  }

  update(dt: number, s: VmState) {
    // benda di tangan (slot 1/2/3) + sprint
    const held = s.held;
    this.rifle.visible = held === 'ar'; this.knifeRig.visible = held === 'knife'; this.nadeRig.visible = held === 'grenade';
    this.sprintT = damp(this.sprintT, s.sprint ? 1 : 0, 14, dt);
    // bob mengikuti irama langkah (fase PlayerController bila ada → sinkron suara langkah & ayunan kamera); memudar halus
    const moving = s.grounded && s.speed > 1;
    if (s.stepPhase !== undefined) this.bobT = Math.PI * s.stepPhase;
    else if (moving) this.bobT += dt * Math.PI / s.stepInterval;
    this.bobW = damp(this.bobW, moving ? 1 : 0, 10, dt);
    const bm = (s.sprint ? V.bobSprintMult : 1) * (1 - s.ads * 0.85) * this.bobW * this.bobScale;
    const bobX = V.bobX * Math.sin(this.bobT) * bm, bobY = V.bobY * Math.abs(Math.sin(this.bobT)) * bm;

    // inersia (pegas): strafe → senjata tertinggal ke samping + condong ke arah gerak; maju → tertarik ke belakang & moncong turun;
    // di udara naik/turun berlawanan arah lompat; mendarat → hentakan turun; diam → napas. ADS: sangat dikurangi.
    const k = this.bobScale * moveFeel.inertia, adsK = 1 - (1 - FV.adsMult) * s.ads;
    const vx = s.vx ?? 0, vz = s.vz ?? 0, vy = s.vy ?? 0;
    const strafeRef = CFG.player.speed.strafe * moveFeel.tempo;
    const lx = this.lagX.update(dt, -vx * FV.lagX * k * adsK);
    const lz = this.lagZ.update(dt, vz * FV.lagZ * k * adsK);
    const lr = this.lagR.update(dt, -THREE.MathUtils.clamp(vx / strafeRef, -1, 1) * D2R(FV.rollDeg) * k * adsK);
    const ly = this.lagY.update(dt, s.grounded ? 0 : THREE.MathUtils.clamp(-vy * FV.vyMult, -FV.vyMax, FV.vyMax) * k * (1 - 0.7 * s.ads));
    const land = this.landS.update(dt) * (1 - 0.6 * s.ads);
    const lagYaw = -lx / (FV.lagX * strafeRef) * D2R(FV.lagYawDeg); // moncong tertinggal berlawanan arah strafe
    this.idleT += dt;
    this.idleW = damp(this.idleW, s.grounded && s.speed < 0.5 ? 1 : 0, 3, dt);
    const bw = this.idleW * k * (1 - 0.7 * s.ads), w0 = 2 * Math.PI * FV.breatheHz * this.idleT;
    const brX = FV.breatheX * bw * Math.sin(w0 * 0.5), brY = FV.breatheY * bw * Math.sin(w0);
    // sway: offset = −Δmouse × 0.0004, dibatasi ±0.03, pulih 10/s
    this.swayX = THREE.MathUtils.clamp(this.swayX - s.mouseDx * V.swayMult, -V.swayMax, V.swayMax);
    this.swayY = THREE.MathUtils.clamp(this.swayY + s.mouseDy * V.swayMult, -V.swayMax, V.swayMax);
    this.swayX = damp(this.swayX, 0, V.swayReturn, dt); this.swayY = damp(this.swayY, 0, V.swayReturn, dt);
    // kick: akar z +0.04, pitch +2.5°, pulih 12/s
    this.kick = damp(this.kick, 0, V.kickReturn, dt);

    const a = s.ads, sp = this.sprintT * (1 - a) * (held === 'ar' ? 1 : 0.4);
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
    // angkat senjata setelah ganti slot (naik dari bawah layar)
    const eq = s.equip ?? 0, eqE = eq * eq * (3 - 2 * eq);
    y -= 0.42 * eqE; rx -= D2R(32) * eqE;
    if (held === 'knife') this.animKnife(s.knife ?? -1, !!s.knifeStab, !!s.knifeAlt);
    if (held === 'grenade') {
      this.cookW = damp(this.cookW, s.cooking ? 1 : 0, 16, dt);
      const o = s.overhand !== false ? 1 : -1;
      this.nadeRig.position.set(-0.04, 0.02 + 0.07 * o * this.cookW, 0.12 + 0.1 * this.cookW);
      this.nadeRig.rotation.x = D2R(-25) * o * this.cookW;
    }
    // pukulan popor: senjata disodok maju-kiri sambil diputar
    let ry2 = ry;
    if (s.melee >= 0 && held === 'ar') {
      const w = Math.sin(Math.PI * Math.min(1, s.melee));
      x -= 0.16 * w; y += 0.06 * w; z -= 0.26 * w;
      rx += D2R(12) * w; ry2 += D2R(38) * w; rz -= D2R(28) * w;
    }
    this.pivot.position.set(x + bobX + this.swayX * (1 - a * 0.7) + lx + brX, y - bobY + this.swayY * (1 - a * 0.7) + ly + land + brY,
      z + V.kickZ * this.kick + lz);
    this.pivot.rotation.set(rx - lz * FV.tiltPerLagZ, ry2 + lagYaw, rz + lr);

    if (this.flashT > 0) { this.flashT -= dt; if (this.flashT <= 0) this.flash.visible = false; }
    this.updateTrail(dt, held === 'knife' ? s.knife ?? -1 : -1, !!s.knifeStab);
  }

  /** Pisau: keyframe (knifeAnim) posisi tangan + yaw/pitch bilah (ruang kamera) + puntir; lengan bawah direntang ke bahu. */
  private animKnife(p: number, stab: boolean, alt: boolean) {
    const v = this.kv, f = this.fist;
    if (p >= 0) sampleKeys(stab ? VM_STAB : alt ? VM_SLASH_B : VM_SLASH_A, p, v); else v.fill(0);
    f.position.set(K_HAND[0] + v[0], K_HAND[1] + v[1], K_HAND[2] + v[2]);
    _qa.setFromEuler(_eu.set(v[4], v[3], 0, 'YXZ'));
    f.quaternion.copy(_qa).multiply(this.qRest).multiply(_qr.setFromAxisAngle(_zAx, v[5]));
    _w.copy(K_CUFF).applyQuaternion(f.quaternion).add(f.position);
    _d.copy(K_SHOULDER).sub(_w);
    const len = _d.length();
    this.kSleeve.position.copy(_w).addScaledVector(_d, 0.5);
    this.kSleeve.scale.set(1, 1, len);
    this.kSleeve.quaternion.setFromUnitVectors(_zAx, _d.divideScalar(len));
  }

  /** Jejak kilatan: sampel ujung & tengah bilah selama bilah bergerak cepat; pita memudar dari ujung ke tengah & seiring umur. */
  private updateTrail(dt: number, p: number, stab: boolean) {
    const T = KN.trail, w = stab ? TRAIL_WINDOW.stab : TRAIL_WINDOW.slash;
    for (let i = 0; i < TR_N; i++) this.trAge[i] += dt;
    if (dt > 0 && p >= w[0] && p <= w[1] && this.root.visible) {
      this.root.updateMatrixWorld(true);
      const m = this.knifeMesh.matrixWorld;
      this.trHead = (this.trHead + 1) % TR_N;
      this.root.worldToLocal(this.trTip[this.trHead].copy(KNIFE_TIP).applyMatrix4(m));
      this.root.worldToLocal(this.trMid[this.trHead].copy(KNIFE_MID).applyMatrix4(m));
      this.trAge[this.trHead] = 0;
    }
    let any = false;
    for (let k = 0; k < TR_N; k++) {
      const i = (this.trHead - k + TR_N) % TR_N, age = this.trAge[i];
      const a = Math.max(0, 1 - age / T.life) * (1 - k / (TR_N - 1)) * T.alpha;
      if (a > 0.003) any = true;
      const P = this.trailPos, C = this.trailCol, t = this.trTip[i], md = this.trMid[i], o = k * 6, c = k * 8;
      P[o] = t.x; P[o + 1] = t.y; P[o + 2] = t.z; P[o + 3] = md.x; P[o + 4] = md.y; P[o + 5] = md.z;
      C[c] = 0.88; C[c + 1] = 0.94; C[c + 2] = 1; C[c + 3] = a; C[c + 4] = 0.7; C[c + 5] = 0.8; C[c + 6] = 1; C[c + 7] = 0;
    }
    this.trail.visible = any;
    if (any) {
      (this.trail.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      (this.trail.geometry.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    }
  }

  setVisible(v: boolean) { this.root.visible = v; }
}
