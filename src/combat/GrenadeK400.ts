// src/combat/GrenadeK400.ts — state machine, lemparan, CCD, damage + okklusi fraksional, efek (GDD §8)
import * as THREE from 'three';
import { RAPIER, physics } from '../physics/Physics';
import { G, GROUPS } from '../physics/groups';
import { CFG } from '../config/gameConfig';
import { XCFG } from '../config/extraConfig';
import { k400 } from './Damage';
import { bus } from '../core/EventBus';
import { ctx } from '../game/ctx';
import type { Entity } from '../entities/Entity';
import { surfaceAt } from '../world/MapData';
import { returnSlot, type Slot } from './Slots';
import { BodyLerp } from '../core/BodyLerp';

const GR = CFG.grenade, GT = XCFG.grenadeThrow;
const D2R = THREE.MathUtils.degToRad;
const EARLY_GROUPS = ((G.GRENADE << 16) | (G.STATIC | G.PROP)) >>> 0; // 0.15 s pertama: abaikan kapsul pelempar

interface Live { body: RAPIER.RigidBody; collider: RAPIER.Collider; mesh: THREE.Group; fuse: number; owner: number; prev: THREE.Vector3; early: number;
  lerp: BodyLerp }

/** Waktu angkat per slot: senapan 0.55 s (GDD §5.1), pisau XCFG.knife, granat 0.35 s (GDD §8). */
export function equipTimeFor(slot: Slot): number {
  return slot === 'ar' ? CFG.combat.equipTime : slot === 'knife' ? XCFG.knife.equipTime : CFG.grenade.equipTime;
}

export interface GrenadeInput {
  equip: boolean;          // tombol granat (3) / scroll / Q
  toSlot: 'ar' | 'knife' | null; // keluar dari granat (READY) ke senapan / pisau
  lPress: boolean; lHeld: boolean; lRelease: boolean;
  rPress: boolean; rHeld: boolean; rRelease: boolean;
}

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3(), _f = new THREE.Vector3();
const _r = new THREE.Vector3(), _u = new THREE.Vector3(), _imp = new THREE.Vector3(), _hand = new THREE.Vector3();

function grenadeMesh(): THREE.Group {
  const g = new THREE.Group();
  const olive = new THREE.MeshLambertMaterial({ color: 0x4f5d2f }), dark = new THREE.MeshLambertMaterial({ color: 0x222222 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.5, 0.42), olive);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.14, 0.22), dark); cap.position.y = 0.31;
  const lever = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.36, 0.06), dark); lever.position.set(0.22, 0.12, 0);
  g.add(body, cap, lever);
  return g;
}

export class GrenadeManager {
  private live: Live[] = [];
  private pool: THREE.Group[] = [];
  readonly handMesh: THREE.Group;

  constructor(private scene: THREE.Scene) {
    for (let i = 0; i < 8; i++) { const m = grenadeMesh(); m.visible = false; scene.add(m); this.pool.push(m); }
    this.handMesh = grenadeMesh();
  }

  get count() { return this.live.length; }

  /** Iterasi granat hidup (posisi, sisa sumbu, pemilik) — dipakai indikator bahaya HUD & radar. */
  forEachLive(cb: (x: number, y: number, z: number, fuse: number, owner: number) => void) {
    for (const g of this.live) { const t = g.body.translation(); cb(t.x, t.y, t.z, g.fuse, g.owner); }
  }

  /** State machine per entitas (pemain: input mouse; bot: input virtual yang sama). */
  handle(e: Entity, inp: GrenadeInput, dt: number) {
    const w = e.weapon;
    switch (e.grenadeState) {
      case 'NONE':
        if (inp.equip && e.grenades >= 1 && !w.reloading) { e.grenadeState = 'EQUIP'; e.grenadeT = GR.equipTime; w.switchTo('grenade', GR.equipTime); }
        break;
      case 'EQUIP':
        e.grenadeT -= dt;
        if (e.grenadeT <= 0) e.grenadeState = 'READY';
        break;
      case 'READY':
        if (inp.toSlot) { e.grenadeState = 'NONE'; w.switchTo(inp.toSlot, equipTimeFor(inp.toSlot)); break; }
        if (inp.lPress || inp.rPress) {
          e.grenadeState = 'COOKING'; e.cookT = 0; e.throwOver = inp.lPress;
          bus.emit('pin', { entityId: e.id });
        }
        break;
      case 'COOKING':
        e.cookT += dt;
        if (e.cookT >= GR.fuse) { // meledak di tangan
          e.grenades--; e.grenadeState = 'NONE'; w.switchTo(returnSlot(w.prevSlot, w.hasPrimary), CFG.combat.equipAfterThrow);
          this.handPos(e, _hand); this.explode(_hand, e.id);
        } else if ((e.throwOver && inp.lRelease) || (!e.throwOver && inp.rRelease) || (e.throwOver ? !inp.lHeld : !inp.rHeld)) {
          this.throw(e, e.throwOver, GR.fuse - e.cookT);
          e.grenades--; e.grenadeState = 'THROWN'; e.grenadeT = CFG.combat.equipAfterThrow; e.throwAnimT = 0;
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

  /** Posisi tangan kanan dunia (dipakai TPS & ledakan di tangan). */
  handPos(e: Entity, out: THREE.Vector3) {
    e.char.root.updateMatrixWorld(true);
    return e.char.weaponMount.getWorldPosition(out);
  }

  throw(e: Entity, overhand: boolean, fuseLeft: number) {
    const rig = ctx.camRig;
    const fps = !e.isPlayer || rig.isFpsView;
    // basis arah dari yaw/pitch bidik
    const cp = Math.cos(e.pitch);
    _f.set(-Math.sin(e.yaw) * cp, Math.sin(e.pitch), -Math.cos(e.yaw) * cp);
    _r.set(Math.cos(e.yaw), 0, -Math.sin(e.yaw));
    _u.crossVectors(_r, _f).normalize();
    let speed: number;
    if (overhand) {
      _d.copy(_f).applyAxisAngle(_r, D2R(GR.overLiftDeg)); // +8° ke atas
      speed = GR.overSpeed;
      if (fps) { e.eye(_a); _a.addScaledVector(_f, GT.fpsFwd).addScaledVector(_r, GT.fpsRight).addScaledVector(_u, -GT.fpsDown); }
      else this.handPos(e, _a);
    } else {
      const p = THREE.MathUtils.clamp(THREE.MathUtils.radToDeg(e.pitch), GR.underPitchMin, GR.underPitchMax) + GT.underPitchAdd;
      const pr = D2R(p);
      _d.set(-Math.sin(e.yaw) * Math.cos(pr), Math.sin(pr), -Math.cos(e.yaw) * Math.cos(pr));
      speed = GR.underSpeed;
      _a.set(e.pos.x - Math.sin(e.yaw) * GT.underFwd, e.pos.y + GT.underUp, e.pos.z - Math.cos(e.yaw) * GT.underFwd);
    }
    _b.copy(_d).multiplyScalar(speed);
    _b.x += e.ctrl.vel.x * GR.inheritVel; _b.z += e.ctrl.vel.z * GR.inheritVel; // warisan kecepatan
    _b.y += (e.ctrl.grounded ? 0 : e.ctrl.velY) * GR.inheritVel;
    const body = physics.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(_a.x, _a.y, _a.z)
      .setLinvel(_b.x, _b.y, _b.z).setCcdEnabled(true).setLinearDamping(GR.linDamp).setAngularDamping(GR.angDamp)
      .setAngvel({ x: Math.random() * 6 - 3, y: Math.random() * 6 - 3, z: Math.random() * 6 - 3 }));
    const collider = physics.world.createCollider(RAPIER.ColliderDesc.ball(GR.radius).setRestitution(GR.restitution).setFriction(GR.friction)
      .setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Max).setFrictionCombineRule(RAPIER.CoefficientCombineRule.Max)
      .setDensity(GR.density).setCollisionGroups(EARLY_GROUPS), body);
    const mesh = this.pool.find(m => !m.visible) ?? this.pool[0];
    mesh.visible = true; mesh.position.copy(_a);
    this.live.push({ body, collider, mesh, fuse: fuseLeft, owner: e.id, prev: _b.clone(), early: 0.15, lerp: new BodyLerp().snap(body) });
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
          bus.emit('grenade:bounce', { position: _c, speed: ps, material: surfaceAt(t.x, t.y, t.z) });
        }
      }
      g.prev.set(v.x, v.y, v.z);
      if (t.y < -20) g.fuse = 0;
      if (g.fuse <= 0) {
        _c.set(t.x, t.y, t.z);
        this.remove(i);
        this.explode(_c, g.owner);
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

  clear() { for (let i = this.live.length - 1; i >= 0; i--) this.remove(i); }
}
