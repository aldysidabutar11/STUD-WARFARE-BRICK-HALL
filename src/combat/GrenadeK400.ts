// src/combat/GrenadeK400.ts — state machine, lemparan, CCD, damage + okklusi fraksional, efek (GDD §8) — untuk DUA jenis benda
// lempar: K-400 (frag, GDD) dan flashbang (permintaan pengguna 2026-11-25; tanpa damage, membutakan semua yang melihat termasuk
// rekan & pelempar; XCFG.flash, efek silau: combat/Flash.ts). Lempar / masak / fisika sama persis; hanya sumbu & ledakannya beda.
import * as THREE from 'three';
import { RAPIER, physics, type V3 } from '../physics/Physics';
import { G, GROUPS } from '../physics/groups';
import { CFG } from '../config/gameConfig';
import { XCFG } from '../config/extraConfig';
import { k400 } from './Damage';
import { bus, type SurfaceMaterial } from '../core/EventBus';
import { ctx } from '../game/ctx';
import type { Entity } from '../entities/Entity';
import { currentMap, type MapDef } from '../world/maps/registry';
import { returnSlot, type Slot } from './Slots';
import type { WeaponSystem } from './WeaponSystem';
import { equipTimeOf } from './weaponStats';
import { MELEES } from '../config/weaponsExtra';
import { BodyLerp } from '../core/BodyLerp';
import { WEAPON_MATERIAL, flashbangModel } from './WeaponModels';
import { combineFlash, flashExposure, flashStrength, ownerFlash, type FlashExposure, type NadeKind } from './Flash';
import { throwLaunch, type LaunchIn } from './throwArc';

const GR = CFG.grenade, FL = XCFG.flash;
const EARLY_GROUPS = ((G.GRENADE << 16) | (G.STATIC | G.PROP)) >>> 0; // 0.15 s pertama: abaikan kapsul pelempar

interface Live { body: RAPIER.RigidBody; collider: RAPIER.Collider; mesh: THREE.Group; fuse: number; owner: number; prev: THREE.Vector3; early: number;
  lerp: BodyLerp; id: number; kind: NadeKind }

/** Sumbu per jenis: K-400 GDD 3.5 s, flashbang XCFG.flash.fuse. */
export const fuseOf = (k: NadeKind) => (k === 'flash' ? FL.fuse : GR.fuse);
/** Stok jenis benda lempar milik entitas. */
export const stockOf = (e: Entity, k: NadeKind) => (k === 'flash' ? e.flashes : e.grenades);
const kindOfSlot = (s: 'grenade' | 'flash'): NadeKind => (s === 'flash' ? 'flash' : 'frag');
const slotOfKind = (k: NadeKind): 'grenade' | 'flash' => (k === 'flash' ? 'flash' : 'grenade');

/** Waktu angkat per slot: senapan 0.55 s (GDD §5.1; senjata tambahan: equipTime sendiri, pistol 0.23–0.30 s), pisau XCFG.knife,
 *  granat / flashbang 0.35 s (GDD §8). */
export function equipTimeFor(slot: Slot, w: WeaponSystem): number {
  return slot === 'ar' ? equipTimeOf(w.primary.def) : slot === 'pistol' ? equipTimeOf(w.secondary.def)
    : slot === 'knife' ? MELEES[w.melee].equipTime : CFG.grenade.equipTime;
}

export interface GrenadeInput {
  /** Tombol granat (3) / flashbang (4) / scroll / Q: slot benda lempar yang diminta. */
  equip: 'grenade' | 'flash' | null;
  toSlot: 'ar' | 'pistol' | 'knife' | null; // keluar dari benda lempar (READY) ke senapan / pistol / pisau
  lPress: boolean; lHeld: boolean; lRelease: boolean;
  rPress: boolean; rHeld: boolean; rRelease: boolean;
}

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3(), _f = new THREE.Vector3();
const _imp = new THREE.Vector3(), _hand = new THREE.Vector3(), _eye = new THREE.Vector3();
const _bo: V3 = { x: 0, y: 0, z: 0 }, _bd: V3 = { x: 0, y: 0, z: 0 };

/**
 * Material pantulan granat (suara & paket jaringan). Brick Hall (surfaceAt per wilayah lantai) → pusat granat (perilaku lama).
 * Map dengan permukaan per benda (MapDef.contactSurface, Steel Yard) → titik KONTAK: setelah step pantul, pusat granat masih
 * ≥ jari-jari (+ jarak tempuh satu step) dari dinding/atap, padahal surfaceAt membedakan benda dalam 0.05 u. Maka raycast
 * pendek (STATIC) dari pusat searah impuls benturan ke dalam permukaan, d = (v_lama + g·dt) − v_baru, sepanjang jari-jari +
 * |v|·dt + 0.1. Tidak kena (karakter, buku) → pusat.
 */
export function bounceMaterial(map: MapDef, t: V3, prev: V3, v: V3, dt: number): SurfaceMaterial {
  if (map.contactSurface) {
    const dx = prev.x - v.x, dy = prev.y + CFG.world.gravity * dt - v.y, dz = prev.z - v.z, l = Math.hypot(dx, dy, dz);
    if (l > 1e-6) {
      _bo.x = t.x; _bo.y = t.y; _bo.z = t.z;
      _bd.x = dx / l; _bd.y = dy / l; _bd.z = dz / l;
      const hit = physics.raycast(_bo, _bd, GR.radius + Math.hypot(v.x, v.y, v.z) * dt + 0.1);
      if (hit >= 0) return map.surfaceAt(t.x + _bd.x * hit, t.y + _bd.y * hit, t.z + _bd.z * hit);
    }
  }
  return map.surfaceAt(t.x, t.y, t.z);
}

function grenadeMesh(): THREE.Group {
  const g = new THREE.Group();
  const olive = new THREE.MeshLambertMaterial({ color: 0x4f5d2f }), dark = new THREE.MeshLambertMaterial({ color: 0x222222 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.5, 0.42), olive);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.14, 0.22), dark); cap.position.y = 0.31;
  const lever = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.36, 0.06), dark); lever.position.set(0.22, 0.12, 0);
  g.add(body, cap, lever);
  return g;
}

function flashMeshWorld(): THREE.Group {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(flashbangModel(), WEAPON_MATERIAL));
  return g;
}

/** Granat dari snapshot host (klien online): tampilan saja. */
interface NetNade { mesh: THREE.Group; x: number; y: number; z: number; fuse: number; owner: number; kind: NadeKind }

export class GrenadeManager {
  private live: Live[] = [];
  private pool: THREE.Group[] = [];
  private flashPool: THREE.Group[] = [];
  readonly handMesh: THREE.Group;
  private nextId = 1;
  private readonly net = new Map<number, NetNade>();
  /** Pemain di layar ini kena flash (Game: layar putih + "bayangan" + telinga berdenging). s = kekuatan 0..1. */
  onLocalFlash: ((x: FlashExposure, s: number) => void) | null = null;
  /** Bot: sudah sadar flash ini & memalingkan muka (TacticalBot) → kekuatan × XCFG.flash.lookAway. */
  noticed: ((bot: Entity, nadeId: number) => boolean) | null = null;

  constructor(scene: THREE.Scene) {
    for (let i = 0; i < 8; i++) { const m = grenadeMesh(); m.visible = false; scene.add(m); this.pool.push(m); }
    for (let i = 0; i < 6; i++) { const m = flashMeshWorld(); m.visible = false; scene.add(m); this.flashPool.push(m); }
    this.handMesh = grenadeMesh();
  }

  get count() { return this.live.length; }

  private meshFor(kind: NadeKind): THREE.Group {
    const p = kind === 'flash' ? this.flashPool : this.pool;
    return p.find(m => !m.visible) ?? p[0];
  }

  /** Iterasi benda lempar hidup (posisi, sisa sumbu, pemilik, id, jenis) — indikator bahaya HUD, radar (klien: dari snapshot) & bot. */
  forEachLive(cb: (x: number, y: number, z: number, fuse: number, owner: number, id: number, kind: NadeKind) => void) {
    for (const g of this.live) { const t = g.body.translation(); cb(t.x, t.y, t.z, g.fuse, g.owner, g.id, g.kind); }
    for (const [id, n] of this.net) cb(n.x, n.y, n.z, n.fuse, n.owner, id, n.kind);
  }

  /** Host: benda lempar hidup untuk snapshot. */
  forEachNet(cb: (id: number, x: number, y: number, z: number, fuse: number, owner: number, kind: NadeKind) => void) {
    for (const g of this.live) { const t = g.lerp.pos; cb(g.id, t.x, t.y, t.z, g.fuse, g.owner, g.kind); }
  }

  /** Klien: tampilkan / gerakkan benda lempar dari host. */
  netSet(id: number, x: number, y: number, z: number, fuse: number, owner: number, kind: NadeKind = 'frag') {
    let n = this.net.get(id);
    if (!n || n.kind !== kind) {
      if (n) n.mesh.visible = false;
      const mesh = this.meshFor(kind);
      mesh.visible = true;
      n = { mesh, x, y, z, fuse, owner, kind };
      this.net.set(id, n);
    }
    n.x = x; n.y = y; n.z = z; n.fuse = fuse; n.owner = owner;
    n.mesh.position.set(x, y, z);
    n.mesh.rotation.x += 0.21; n.mesh.rotation.z += 0.13;   // berputar di udara (kosmetik)
  }

  /** Klien: hapus benda lempar yang tidak ada lagi di snapshot. */
  netPrune(alive: Set<number>) {
    for (const [id, n] of this.net) if (!alive.has(id)) { n.mesh.visible = false; this.net.delete(id); }
  }

  /** State machine per entitas (pemain: input mouse; bot: input virtual yang sama). Jenis dipilih saat mengangkat (3 / 4). */
  handle(e: Entity, inp: GrenadeInput, dt: number) {
    const w = e.weapon;
    const want = inp.equip ? kindOfSlot(inp.equip) : null;
    switch (e.grenadeState) {
      case 'NONE':
        if (want && stockOf(e, want) >= 1 && !w.reloading) this.equip(e, want);
        break;
      case 'EQUIP':
        if (want && want !== e.nadeKind && stockOf(e, want) >= 1) { this.equip(e, want); break; }   // 3 ↔ 4 saat mengangkat
        e.grenadeT -= dt;
        if (e.grenadeT <= 0) e.grenadeState = 'READY';
        break;
      case 'READY':
        if (inp.toSlot) { e.grenadeState = 'NONE'; w.switchTo(inp.toSlot, equipTimeFor(inp.toSlot, w)); break; }
        if (want && want !== e.nadeKind && stockOf(e, want) >= 1) { this.equip(e, want); break; }
        if (inp.lPress || inp.rPress) {
          e.grenadeState = 'COOKING'; e.cookT = 0; e.throwOver = inp.lPress;
          bus.emit('pin', { entityId: e.id });
        }
        break;
      case 'COOKING':
        e.cookT += dt;
        if (e.cookT >= fuseOf(e.nadeKind)) { // meledak di tangan
          this.spend(e);
          e.grenadeState = 'NONE'; w.switchTo(returnSlot(w.prevSlot, w.hasPrimary), CFG.combat.equipAfterThrow);
          if (ctx.net.role !== 'client') { this.handPos(e, _hand); this.detonate(_hand, e.id, e.nadeKind, -1); }   // klien: dari host
        } else if ((e.throwOver && inp.lRelease) || (!e.throwOver && inp.rRelease) || (e.throwOver ? !inp.lHeld : !inp.rHeld)) {
          this.throw(e, e.throwOver, fuseOf(e.nadeKind) - e.cookT);
          this.spend(e);
          e.grenadeState = 'THROWN'; e.grenadeT = CFG.combat.equipAfterThrow; e.throwAnimT = 0;
          e.protectT = 0;
        }
        break;
      case 'THROWN':
        e.grenadeT -= dt;
        if (e.grenadeT <= 0) { e.grenadeState = 'NONE'; w.switchTo(returnSlot(w.prevSlot, w.hasPrimary), 0.0001); }
        break;
    }
    if (e.throwAnimT >= 0) { e.throwAnimT += dt; if (e.throwAnimT > 0.5) e.throwAnimT = -1; }
  }

  private equip(e: Entity, k: NadeKind) {
    e.nadeKind = k; e.grenadeState = 'EQUIP'; e.grenadeT = GR.equipTime;
    e.weapon.switchTo(slotOfKind(k), GR.equipTime);
  }

  private spend(e: Entity) { if (e.nadeKind === 'flash') e.flashes--; else e.grenades--; }

  /** Posisi tangan kanan dunia (dipakai TPS & ledakan di tangan). */
  handPos(e: Entity, out: THREE.Vector3) {
    e.char.root.updateMatrixWorld(true);
    return e.char.weaponMount.getWorldPosition(out);
  }

  /** Masukan lemparan entitas (titik lepas & kecepatan awal → throwLaunch; garis lintasan pemain memakai yang sama). `feet` = posisi
   *  kaki (pemain di layar: posisi render agar garis tidak bergetar terhadap kamera). */
  launchOf(e: Entity, overhand: boolean, feet: THREE.Vector3 = e.pos): LaunchIn {
    const L = this.launchIn;
    L.overhand = overhand; L.yaw = e.yaw; L.pitch = e.pitch;
    _eye.set(feet.x - Math.sin(e.yaw) * CFG.player.eyeForward, feet.y + e.ctrl.eyeHeight, feet.z - Math.cos(e.yaw) * CFG.player.eyeForward);
    L.eye = _eye; L.feet = feet;
    // titik lepas lemparan jauh: FPS & bot dari mata, TPS pemain dari tangan kanan rig (GDD §8)
    L.hand = overhand && e.isPlayer && !ctx.camRig.isFpsView ? this.handPos(e, _hand) : null;
    L.vx = e.ctrl.vel.x; L.vz = e.ctrl.vel.z; L.vy = e.ctrl.grounded ? 0 : e.ctrl.velY;   // warisan kecepatan
    return L;
  }
  private readonly launchIn: LaunchIn = { overhand: true, yaw: 0, pitch: 0, eye: _eye, hand: null, feet: _eye, vx: 0, vy: 0, vz: 0 };

  throw(e: Entity, overhand: boolean, fuseLeft: number) {
    if (ctx.net.role === 'client') return;   // online: host yang meluncurkan; klien melihatnya lewat snapshot
    throwLaunch(this.launchOf(e, overhand), _a, _b);
    const body = physics.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(_a.x, _a.y, _a.z)
      .setLinvel(_b.x, _b.y, _b.z).setCcdEnabled(true).setLinearDamping(GR.linDamp).setAngularDamping(GR.angDamp)
      .setAngvel({ x: Math.random() * 6 - 3, y: Math.random() * 6 - 3, z: Math.random() * 6 - 3 }));
    const collider = physics.world.createCollider(RAPIER.ColliderDesc.ball(GR.radius).setRestitution(GR.restitution).setFriction(GR.friction)
      .setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Max).setFrictionCombineRule(RAPIER.CoefficientCombineRule.Max)
      .setDensity(GR.density).setCollisionGroups(EARLY_GROUPS), body);
    const mesh = this.meshFor(e.nadeKind);
    mesh.visible = true; mesh.position.copy(_a);
    this.live.push({ body, collider, mesh, fuse: fuseLeft, owner: e.id, prev: _b.clone(), early: 0.15, lerp: new BodyLerp().snap(body),
      id: this.nextId++, kind: e.nadeKind });
  }

  fixedUpdate(dt: number) {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const g = this.live[i];
      g.fuse -= dt;
      if (g.early > 0) { g.early -= dt; if (g.early <= 0) g.collider.setCollisionGroups(GROUPS.GRENADE); }
      const v = g.body.linvel(), t = g.body.translation();
      // suara pantulan: perubahan arah tajam (dot < 0.7) dengan kecepatan > 1.5 u/s
      const ps = g.prev.length(), vs = Math.hypot(v.x, v.y, v.z);
      if (ps > XCFG.grenadeThrow.bounceMinSpeed && vs > 0.05) {
        const dot = (g.prev.x * v.x + g.prev.y * v.y + g.prev.z * v.z) / (ps * vs);
        if (dot < XCFG.grenadeThrow.bounceDot) {
          _c.set(t.x, t.y, t.z);
          bus.emit('grenade:bounce', { position: _c, speed: ps, material: bounceMaterial(currentMap(), t, g.prev, v, dt) });
        }
      }
      g.prev.set(v.x, v.y, v.z);
      if (t.y < -20) g.fuse = 0;
      if (g.fuse <= 0) {
        _c.set(t.x, t.y, t.z);
        this.remove(i);
        this.detonate(_c, g.owner, g.kind, g.id);
      }
    }
  }

  /** Setelah world.step(): simpan pose fisika untuk interpolasi render. */
  postStep() { for (const g of this.live) g.lerp.step(g.body); }

  /** Per frame: mesh di antara dua step fisika (alpha) -> granat terbang mulus di layar > 60 Hz. */
  update(alpha: number) { for (const g of this.live) g.lerp.apply(g.mesh, alpha); }

  private remove(i: number) {
    const g = this.live[i];
    physics.world.removeRigidBody(g.body);
    g.mesh.visible = false;
    this.live.splice(i, 1);
  }

  /** Host / main solo: ledakan sesuai jenis (id −1 = meledak di tangan). */
  private detonate(c: THREE.Vector3, owner: number, kind: NadeKind, id: number) {
    if (kind === 'flash') this.flashBang(c, owner, id); else this.explode(c, owner);
  }

  /** D = round(135 × max(0, 1 − (r/12)²) × O); O = titik sampel terlihat / 3 (kepala, dada, perut). */
  explode(c: THREE.Vector3, ownerId: number) {
    const owner = ctx.byId.get(ownerId) ?? null;
    const R = GR.blastRadius;
    for (const v of ctx.entities) {
      if (!v.alive) continue;
      v.capsuleCenter(_a);
      const r = _a.distanceTo(c);
      if (r >= R) continue;
      v.char.root.updateMatrixWorld(true);
      let vis = 0;
      for (const k of ['head', 'upper', 'lower'] as const) {
        v.partCenter(k, _b);
        if (!physics.losBlocked(c.x, c.y, c.z, _b.x, _b.y, _b.z)) vis++;
      }
      const dmg = k400(r, vis / 3);
      if (dmg <= 0) continue;
      const dv = GR.propImpulse * (1 - r / R) * GR.corpseImpulseMult;
      _imp.set(_a.x - c.x, _a.y - c.y + 0.5, _a.z - c.z).normalize().multiplyScalar(dv);
      _d.copy(_imp).normalize();
      ctx.teams.applyDamage(v, owner, dmg, 'upper', 'k400', _d, true, _imp);
    }
    ctx.breakables.explosion(c, R);
    this.explodeFx(c, ownerId);
  }

  /** Efek ledakan tanpa damage (host & klien): buku, balok tubuh, VFX, guncangan kamera, telinga berdenging, event audio. */
  explodeFx(c: THREE.Vector3, ownerId: number) {
    const R = GR.blastRadius;
    ctx.props.explode(c);
    ctx.deathFx.explode(c, R, GR.propImpulse, GR.corpseImpulseMult);
    ctx.vfx.explosion(c);
    // kamera: shake 1.5° × (1 − r/20)² untuk r < 20; telinga berdenging bila r < 6
    const cam = ctx.camRig.position;
    const rc = cam.distanceTo(c);
    if (rc < GR.shakeRadius) ctx.camRig.addShake(GR.shakeMaxDeg * (1 - rc / GR.shakeRadius) ** 2);
    if (rc < GR.tinnitusRadius) ctx.audio.tinnitus(XCFG.explosion.tinnitusTime);
    bus.emit('grenade:explode', { position: c.clone(), ownerId });
  }

  /** Host / main solo: flashbang — tanpa damage; setiap karakter yang melihat titik ledak (termasuk rekan & pelempar) silau sesuai
   *  arah pandang, jarak & dinding. Pelempar kena × ownerMult (tahu kapan meledak; kecuali meledak di tangan); bot yang sempat
   *  memalingkan muka (pelempar sendiri / sadar flash) × lookAway. Pemain di layar ini dihitung dari KAMERA di flashFx (juga klien).
   *  nadeId −1 = meledak di tangan. */
  flashBang(c: THREE.Vector3, ownerId: number, nadeId: number) {
    const inHand = nadeId < 0;
    for (const v of ctx.entities) {
      if (!v.alive || (v === ctx.player && !v.bot)) continue;
      v.eye(_a);
      const cp = Math.cos(v.pitch);
      _f.set(-Math.sin(v.yaw) * cp, Math.sin(v.pitch), -Math.cos(v.yaw) * cp);
      let s = flashStrength(_a, _f, c, physics.losBlocked(_a.x, _a.y, _a.z, c.x, c.y, c.z));
      s = ownerFlash(s, v.id === ownerId, inHand);
      if (s > 0 && v.bot && (v.id === ownerId || (nadeId >= 0 && this.noticed?.(v, nadeId)))) s *= FL.lookAway;
      this.applyFlash(v, s, ownerId, c);
    }
    this.flashFx(c, ownerId, inHand);
  }

  /** Host & klien: kilatan, suara (event), dan efek silau untuk pemain di layar ini (dari posisi & arah KAMERA; pelempar × ownerMult
   *  kecuali meledak di tangan). */
  flashFx(c: THREE.Vector3, ownerId: number, inHand = false) {
    ctx.vfx.flashBurst(c);
    const p = ctx.player, cam = ctx.engine?.camera;
    if (p && cam) {
      cam.getWorldDirection(_f);
      const e = cam.position;
      let s = flashStrength(e, _f, c, physics.losBlocked(e.x, e.y, e.z, c.x, c.y, c.z));
      s = ownerFlash(s, p.id === ownerId, inHand);
      const x = this.applyFlash(p, s, ownerId, c);
      if (x) this.onLocalFlash?.(x, s);
    }
    bus.emit('flash:explode', { position: c.clone(), ownerId, inHand });
  }

  /** Catat paparan di entitas (yang lebih terang sekarang menang) + beri tahu bot. null = tidak berefek. */
  private applyFlash(v: Entity, s: number, ownerId: number, c: THREE.Vector3): FlashExposure | null {
    const x = flashExposure(s);
    if (!x) return null;
    const now = ctx.time;
    if (combineFlash(v.blindX ? { x: v.blindX, t: now - v.blindAt } : null, x)) { v.blindX = x; v.blindAt = now; v.flashedBy = ownerId; v.flashS = s; }
    v.bot?.onFlash(x, c);
    return x;
  }

  clear() {
    for (let i = this.live.length - 1; i >= 0; i--) this.remove(i);
    for (const n of this.net.values()) n.mesh.visible = false;
    this.net.clear();
  }
}
