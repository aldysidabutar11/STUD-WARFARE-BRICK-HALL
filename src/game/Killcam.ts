// src/game/Killcam.ts — killcam (GDD §1 "Pasca-MVP: killcam"): rekam 6 s terakhir (30 Hz) semua karakter, lalu saat pemain
// mati putar ulang ±3 s dari mata pembunuh memakai rig "ghost" terpisah (rig asli tetap dipakai simulasi & hitbox).
// Juga kamera kematian yang menoleh ke pembunuh + data kartu "Dibunuh oleh".
import * as THREE from 'three';
import { CFG } from '../config/gameConfig';
import { XCFG } from '../config/extraConfig';
import type { WeaponId } from '../config/weaponsData';
import { bus, type KillWeapon } from '../core/EventBus';
import { BlockyCharacter, type AnimState, type Team } from '../entities/BlockyCharacter';
import { WEAPON_MATERIAL, createOpticMesh, weaponModel } from '../combat/WeaponModels';
import type { Entity } from '../entities/Entity';
import { buttProgress, knifeProgress } from '../combat/Melee';
import { heldOf, type Held } from '../combat/Slots';
import { decodeKnife, encodeKnife } from '../entities/knifeAnim';
import { ctx } from './ctx';

const K = XCFG.killcam;
const N = K.hz * K.history;
const STEP_EVERY = Math.max(1, Math.round(1 / (CFG.world.fixedStep * K.hz)));
// field per sampel
const FX = 0, FY = 1, FZ = 2, FYAW = 3, FPITCH = 4, FCROUCH = 5, FSPEED = 6, FSPRINT = 7, FAIR = 8, FALIVE = 9, FRELOAD = 10,
  FADS = 11, FMELEE = 12, FHELD = 13, FKNIFE = 14, F = 15;
/** Benda di tangan ↔ angka rekaman. Serangan pisau: −1, tebas 0..1, tusuk 2..3. */
const HELD: readonly Held[] = ['ar', 'knife', 'grenade', 'none'];

interface Shot { t: number; id: number; w: WeaponId; o: THREE.Vector3; e: THREE.Vector3 }
interface Hit { t: number; a: number; v: number; head: boolean }
interface Ghost { char: BlockyCharacter; gun: THREE.Mesh; optic: THREE.Mesh | null; key: string; team: Team }
export interface KillInfo { name: string; team: Team; weapon: KillWeapon; headshot: boolean; hp: number; distM: number }

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _r = new THREE.Vector3(), _u = new THREE.Vector3(), _f = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const S = new Float32Array(F);
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

export class Killcam {
  private clock = 0;
  private steps = 0;
  private times = new Float64Array(N);
  private head = 0;
  private count = 0;
  private tracks = new Map<number, Float32Array>();
  private shots: Shot[] = Array.from({ length: 384 }, () => ({ t: -1, id: 0, w: 'm416' as WeaponId, o: new THREE.Vector3(), e: new THREE.Vector3() }));
  private shotHead = 0;
  private hits: Hit[] = Array.from({ length: 256 }, () => ({ t: -1, a: 0, v: 0, head: false }));
  private hitHead = 0;
  private ghosts = new Map<number, Ghost>();
  private readonly root = new THREE.Group();
  private cast: Entity[] = [];
  /** Periode mati pemain dikendalikan killcam (kamera kematian/replay). */
  active = false;
  replaying = false;
  /** Replay & kamera kematian sudah selesai (Eliminasi lanjut ke mode menonton). */
  done = false;
  /** TDM: kamera kematian ditahan sampai respawn; Eliminasi: selesai → menonton rekan. */
  hold = true;
  info: KillInfo | null = null;
  private killer: Entity | null = null;
  private t = 0; private tau = 0; private lastTau = 0; private t0 = 0; private t1 = 0; private deathT = 0;
  private useReplay = false;
  private deathPos = new THREE.Vector3();
  private camQ = new THREE.Quaternion();
  private look = new THREE.Vector3();
  private readonly anim: AnimState = { speed: 0, sprinting: false, crouchT: 0, airborne: false, pitch: 0, reload: -1, throwPose: NaN, lowReady: false, melee: -1 };

  constructor(scene: THREE.Scene) {
    this.root.visible = false;
    scene.add(this.root);
    bus.on('shot', (e) => {
      const s = this.shots[this.shotHead]; this.shotHead = (this.shotHead + 1) % this.shots.length;
      s.t = this.clock; s.id = e.shooterId; s.w = e.weaponId; s.o.copy(e.origin); s.e.copy(e.end);
    });
    bus.on('hit', (e) => {
      if (e.attackerId < 0) return;
      const h = this.hits[this.hitHead]; this.hitHead = (this.hitHead + 1) % this.hits.length;
      h.t = this.clock; h.a = e.attackerId; h.v = e.victimId; h.head = e.headshot;
    });
  }

  /** Match/ronde baru: buang rekaman lama. */
  reset() {
    this.stop();
    this.tracks.clear(); this.count = 0; this.head = 0;
    for (const s of this.shots) s.t = -1;
    for (const h of this.hits) h.t = -1;
  }

  /** Dipanggil tiap fixed step (60 Hz); menyimpan sampel tiap STEP_EVERY langkah. */
  record() {
    this.clock += CFG.world.fixedStep;
    if (++this.steps < STEP_EVERY) return;
    this.steps = 0;
    const i = this.head;
    this.head = (this.head + 1) % N; this.count = Math.min(N, this.count + 1);
    this.times[i] = this.clock;
    const o = i * F;
    for (const e of ctx.entities) {
      let tr = this.tracks.get(e.id);
      if (!tr) { tr = new Float32Array(N * F); this.tracks.set(e.id, tr); }
      const c = e.ctrl;
      tr[o + FX] = c.pos.x; tr[o + FY] = c.pos.y; tr[o + FZ] = c.pos.z; tr[o + FYAW] = e.yaw; tr[o + FPITCH] = e.pitch;
      tr[o + FCROUCH] = c.crouchT; tr[o + FSPEED] = c.speedH; tr[o + FSPRINT] = c.sprinting ? 1 : 0; tr[o + FAIR] = c.grounded ? 0 : 1;
      tr[o + FALIVE] = e.alive ? 1 : 0; tr[o + FRELOAD] = e.weapon.reloadProgress; tr[o + FADS] = e.weapon.adsActive ? 1 : 0;
      tr[o + FMELEE] = buttProgress(e);
      tr[o + FHELD] = HELD.indexOf(heldOf(e.weapon.slot, e.weapon.hasPrimary, e.grenadeState));
      tr[o + FKNIFE] = encodeKnife(knifeProgress(e), e.meleeKind === 'stab', e.slashAlt);
    }
    for (const [id, tr] of this.tracks) if (!ctx.byId.has(id)) tr[o + FALIVE] = 0;
  }

  private oldestTime() { return this.count ? this.times[(this.head - this.count + N) % N] : this.clock; }

  /** Interpolasi sampel entitas pada waktu tau → S. */
  private sample(id: number, tau: number): boolean {
    const tr = this.tracks.get(id);
    if (!tr || this.count < 2) return false;
    const old = (this.head - this.count + N) % N;
    const T = (k: number) => this.times[(old + k) % N];
    let lo = 0, hi = this.count - 1;
    if (tau <= T(0)) hi = 0; else if (tau >= T(hi)) lo = hi;
    else while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (T(mid) <= tau) lo = mid; else hi = mid; }
    const a = ((old + lo) % N) * F, b = ((old + hi) % N) * F;
    const ta = T(lo), tb = T(hi);
    let f = tb > ta ? (tau - ta) / (tb - ta) : 0;
    // lompatan besar (respawn/teleport): jangan diinterpolasi
    if (Math.hypot(tr[b + FX] - tr[a + FX], tr[b + FZ] - tr[a + FZ]) > 3) f = f < 0.5 ? 0 : 1;
    for (let j = 0; j < F; j++) S[j] = tr[a + j] + (tr[b + j] - tr[a + j]) * f;
    S[FYAW] = tr[a + FYAW] + wrap(tr[b + FYAW] - tr[a + FYAW]) * f;
    S[FALIVE] = Math.min(tr[a + FALIVE], tr[b + FALIVE]);
    const src = f < 0.5 ? a : b;
    S[FSPRINT] = tr[src + FSPRINT]; S[FAIR] = tr[src + FAIR]; S[FADS] = tr[src + FADS];
    if (tr[a + FMELEE] < 0 || tr[b + FMELEE] < 0) S[FMELEE] = tr[src + FMELEE];
    S[FHELD] = tr[src + FHELD];
    if (tr[a + FKNIFE] < 0 || tr[b + FKNIFE] < 0 || Math.floor(tr[a + FKNIFE] / 2) !== Math.floor(tr[b + FKNIFE] / 2)) S[FKNIFE] = tr[src + FKNIFE];
    if (tr[a + FRELOAD] < 0 || tr[b + FRELOAD] < 0) S[FRELOAD] = tr[src + FRELOAD];
    return true;
  }

  /**
   * Pemain mati oleh `killer`. replay = putar ulang dari mata pembunuh (setting Killcam ON & rekaman cukup);
   * hold = kamera kematian ditahan sampai respawn (TDM) — Eliminasi: false → lanjut menonton rekan.
   */
  begin(killer: Entity, victim: Entity, weapon: KillWeapon, headshot: boolean, replay: boolean, hold: boolean) {
    this.stopReplay();
    this.active = true; this.done = false; this.hold = hold; this.t = 0; this.killer = killer;
    this.info = { name: killer.name, team: killer.team, weapon, headshot, hp: Math.max(0, Math.round(killer.hp)),
      distM: killer.pos.distanceTo(victim.pos) * K.unitToMeter };
    victim.eye(this.deathPos); this.deathPos.y += 0.5;
    this.camQ.copy(ctx.engine.camera.quaternion);
    killer.partCenter('upper', this.look);
    this.deathT = this.clock;
    this.t1 = this.clock + K.postDeath;
    this.t0 = Math.max(this.oldestTime(), this.clock - K.preDeath);
    this.useReplay = replay && this.count > K.hz && this.t1 - this.t0 > 1.0;
  }

  /** Lewati replay (klik/Spasi). */
  skip() { if (this.replaying) { this.stopReplay(); this.done = true; } }

  stop() {
    this.stopReplay();
    this.active = false; this.done = false; this.info = null; this.killer = null;
  }

  /** Apakah killcam sedang mengendalikan kamera. */
  get controlsCamera() { return this.active && (this.hold || !this.done); }

  /** Per frame (setelah animasi rig asli): kamera kematian / replay. */
  update(dt: number, cam: THREE.PerspectiveCamera) {
    if (!this.active) return;
    this.t += dt;
    if (this.useReplay && !this.done && this.t >= K.deathCam) {
      if (!this.replaying) this.startReplay();
      this.lastTau = this.tau;
      this.tau = this.t0 + (this.t - K.deathCam);
      if (this.tau < this.t1) { this.applyReplay(dt, cam); return; }
      this.stopReplay(); this.done = true;
    }
    if (!this.useReplay && this.t >= K.noReplayHold) this.done = true;
    if (this.controlsCamera) this.deathCam(dt, cam);
  }

  private deathCam(dt: number, cam: THREE.PerspectiveCamera) {
    const k = this.killer;
    if (k && k.alive) k.partCenter('upper', this.look);
    _m.lookAt(this.deathPos, this.look, UP);
    _q.setFromRotationMatrix(_m);
    this.camQ.slerp(_q, 1 - Math.exp(-4 * dt));
    cam.position.copy(this.deathPos);
    cam.quaternion.copy(this.camQ);
    this.setFov(cam);
  }

  private setFov(cam: THREE.PerspectiveCamera) {
    const fov = ctx.settings.fov;
    if (Math.abs(cam.fov - fov) > 1e-3) { cam.fov = fov; cam.updateProjectionMatrix(); }
  }

  private ghost(e: Entity): Ghost {
    let g = this.ghosts.get(e.id);
    if (!g || g.team !== e.team) {
      if (g) this.root.remove(g.char.root);
      const char = new BlockyCharacter(-1000 - e.id, e.team, ctx.settings.preset === 'HIGH' || ctx.settings.preset === 'ULTRA', e.char.variant);
      const gun = new THREE.Mesh(new THREE.BufferGeometry(), WEAPON_MATERIAL);
      gun.rotation.x = -Math.PI / 2;
      char.setGun(gun);
      g = { char, gun, optic: null, key: '', team: e.team };
      this.root.add(char.root);
      this.ghosts.set(e.id, g);
    }
    g.char.setVariant(e.char.variant); // varian bisa berganti (pemain mengubah karakter)
    const key = e.loadout.weapon + '|' + e.loadout.scope;
    if (g.key !== key) {
      g.key = key;
      const m = weaponModel(e.loadout.weapon, e.loadout.scope === 'iron');
      g.gun.geometry = m.geometry;
      if (g.optic) { g.gun.remove(g.optic); g.optic = null; }
      g.optic = createOpticMesh(e.loadout.scope);
      if (g.optic) { g.optic.position.z = m.opticMount.z; g.gun.add(g.optic); }
    }
    return g;
  }

  private startReplay() {
    this.replaying = true;
    this.tau = this.t0; this.lastTau = this.t0;
    this.cast = ctx.entities.filter(e => this.tracks.has(e.id));
    for (const g of this.ghosts.values()) g.char.root.visible = false;
    for (const e of this.cast) this.ghost(e);
    this.root.visible = true;
    ctx.deathFx.root.visible = false;
    const k = this.killer!;
    ctx.viewmodel.setOutfit(k.team, k.char.variant);
    ctx.viewmodel.setWeapon(k.loadout.weapon, k.loadout.scope);
  }

  private stopReplay() {
    if (!this.replaying) return;
    this.replaying = false;
    this.root.visible = false;
    for (const g of this.ghosts.values()) g.char.root.visible = false;
    for (const e of ctx.entities) e.char.setVisible(e.alive);
    ctx.deathFx.root.visible = true;
    const p = ctx.player;
    if (p) { ctx.viewmodel.setOutfit(p.team, p.char.variant); ctx.viewmodel.setWeapon(p.loadout.weapon, p.loadout.scope); }
    ctx.viewmodel.setVisible(false);
    ctx.engine.showViewmodel = false;
  }

  private applyReplay(dt: number, cam: THREE.PerspectiveCamera) {
    const k = this.killer!;
    for (const e of ctx.entities) e.char.root.visible = false; // rig asli disembunyikan (tetap dipakai simulasi)
    const a = this.anim;
    for (const e of this.cast) {
      const g = this.ghost(e);
      if (e === k || !this.sample(e.id, this.tau) || S[FALIVE] < 0.5) { g.char.root.visible = false; continue; }
      g.char.root.visible = true;
      g.char.root.position.set(S[FX], S[FY], S[FZ]);
      g.char.root.rotation.y = S[FYAW];
      a.speed = S[FSPEED]; a.sprinting = S[FSPRINT] > 0.5; a.crouchT = S[FCROUCH]; a.airborne = S[FAIR] > 0.5; a.pitch = S[FPITCH];
      a.reload = S[FRELOAD]; a.throwPose = NaN; a.lowReady = a.sprinting; a.melee = S[FMELEE];
      const kc = decodeKnife(S[FKNIFE]);
      a.held = HELD[Math.round(S[FHELD])] ?? 'ar'; a.knife = kc.p; a.knifeStab = kc.stab; a.knifeAlt = kc.alt;
      g.char.update(dt, a);
      g.char.root.updateMatrixWorld(true);
    }
    // kamera = mata pembunuh (FPS), viewmodel senjata pembunuh
    if (this.sample(k.id, this.tau)) {
      const eyeH = THREE.MathUtils.lerp(CFG.player.eyeStand, CFG.player.eyeCrouch, S[FCROUCH]);
      cam.position.set(S[FX] - Math.sin(S[FYAW]) * CFG.player.eyeForward, S[FY] + eyeH, S[FZ] - Math.cos(S[FYAW]) * CFG.player.eyeForward);
      _e.set(S[FPITCH], S[FYAW], 0, 'YXZ');
      cam.quaternion.setFromEuler(_e);
      const fi = CFG.player.footstepInterval;
      ctx.viewmodel.setVisible(true);
      ctx.engine.showViewmodel = true;
      ctx.viewmodel.update(dt, { ads: S[FADS] > 0.5 ? 1 : 0, sprint: S[FSPRINT] > 0.5, reload: S[FRELOAD], speed: S[FSPEED],
        stepInterval: S[FCROUCH] > 0.5 ? fi.crouch : S[FSPRINT] > 0.5 ? fi.sprint : fi.normal, grounded: S[FAIR] < 0.5,
        mouseDx: 0, mouseDy: 0, held: HELD[Math.round(S[FHELD])] ?? 'ar', melee: S[FMELEE],
        knife: decodeKnife(S[FKNIFE]).p, knifeStab: decodeKnife(S[FKNIFE]).stab, knifeAlt: decodeKnife(S[FKNIFE]).alt });
    }
    this.setFov(cam);
    cam.layers.enable(0);
    // tembakan di jendela (lastTau, tau]: pembunuh → viewmodel + suara "sendiri"; lainnya → kilat moncong ghost + suara spasial
    for (const s of this.shots) {
      if (s.t <= this.lastTau || s.t > this.tau) continue;
      if (s.id === k.id) {
        ctx.viewmodel.fire();
        _r.set(1, 0, 0).applyQuaternion(cam.quaternion); _u.set(0, 1, 0).applyQuaternion(cam.quaternion); _f.set(0, 0, -1).applyQuaternion(cam.quaternion);
        _v.copy(cam.position).addScaledVector(_r, 0.22).addScaledVector(_u, -0.18).addScaledVector(_f, 0.7);
        ctx.vfx.tracer(_v, s.e);
        ctx.audio.playGunshot(s.w, null);
      } else {
        const g = this.ghosts.get(s.id);
        if (!g || !g.char.root.visible) continue;
        const m = weaponModel(s.w, true);
        g.gun.localToWorld(_v.copy(m.muzzle));
        _w.copy(s.e).sub(_v).normalize();
        ctx.vfx.muzzleFlash(_v, _w);
        ctx.vfx.tracer(_v, s.e);
        ctx.audio.playGunshot(s.w, _v);
      }
    }
    for (const h of this.hits) if (h.t > this.lastTau && h.t <= this.tau && h.a === k.id) ctx.hud.hitmarker(h.head ? 'head' : 'body');
    if (this.lastTau < this.deathT && this.tau >= this.deathT) ctx.hud.hitmarker('kill');
  }
}
