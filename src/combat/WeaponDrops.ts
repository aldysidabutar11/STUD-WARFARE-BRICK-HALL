// src/combat/WeaponDrops.ts — senjata utama yang dibuang (G): benda fisik yang jatuh & diam di lantai.
// Hanya TIM SENDIRI yang bisa mengambil / menukar (E, gamepad X saat dekat) — permintaan pengguna, bukan GDD; angka XCFG.drop.
// Senjata membawa keadaannya (jenis, optik, isi magazine, cadangan, mode tembak). Respawn tetap memakai loadout pilihan.
// Fisika: grup DEBRIS (bertumbukan dengan dunia & benda lepas, tidak dengan karakter, tidak menahan peluru/LOS).
import * as THREE from 'three';
import { RAPIER, physics } from '../physics/Physics';
import { GROUPS, QUERY } from '../physics/groups';
import { XCFG } from '../config/extraConfig';
import type { ScopeId, WeaponId } from '../config/weaponsData';
import { bus } from '../core/EventBus';
import type { Entity } from '../entities/Entity';
import type { Team } from '../entities/BlockyCharacter';
import { WEAPON_MATERIAL, createOpticMesh, weaponModel } from './WeaponModels';
import { canPickUp } from './Slots';
import { equipTimeFor } from './GrenadeK400';
import { cancelMelee } from './Melee';
import { BodyLerp } from '../core/BodyLerp';

const DR = XCFG.drop;

export interface DroppedWeapon {
  readonly team: Team; readonly ownerId: number;
  readonly weapon: WeaponId; readonly scope: ScopeId;
  readonly ammo: number; readonly reserve: number; readonly modeIdx: number;
  readonly body: RAPIER.RigidBody; readonly mesh: THREE.Mesh; readonly lerp: BodyLerp;
  age: number;
}

const _eye = new THREE.Vector3(), _f = new THREE.Vector3(), _q = new THREE.Quaternion(), _eu = new THREE.Euler();

export class WeaponDrops {
  readonly list: DroppedWeapon[] = [];

  constructor(private readonly scene: THREE.Scene, private readonly castShadow: boolean) {}

  /** Buang senjata utama entitas; pegangan pindah ke pisau. false bila slot 1 sudah kosong. */
  drop(e: Entity): boolean {
    const w = e.weapon;
    if (!w.hasPrimary) return false;
    w.cancelReload();                                            // sebelum komit: batal tanpa transfer (GDD §5.1)
    if (!e.pendingLoadout) e.pendingLoadout = { ...e.loadout };  // respawn berikutnya kembali ke loadout pilihan
    this.spawn(e, e.loadout.weapon, e.loadout.scope, w.ammo, w.reserve, w.modeIdx);
    w.hasPrimary = false;
    if (w.slot === 'ar') { cancelMelee(e); w.switchTo('knife', equipTimeFor('knife')); }
    return true;
  }

  /** Senjata tim sendiri terdekat dalam jangkauan ambil (null bila tidak ada). */
  nearestFor(e: Entity): DroppedWeapon | null {
    let best: DroppedWeapon | null = null, bd: number = DR.pickupRange;
    for (const d of this.list) {
      if (!canPickUp(e.team, d.team)) continue;
      const t = d.body.translation(), dy = t.y - e.pos.y;
      if (dy < DR.pickupDyMin || dy > DR.pickupDyMax) continue;
      const dist = Math.hypot(t.x - e.pos.x, t.z - e.pos.z);
      if (dist < bd) { bd = dist; best = d; }
    }
    return best;
  }

  /** Ambil (slot 1 kosong) atau tukar (senjata sekarang ikut dibuang) — hanya senjata tim sendiri. */
  pickup(e: Entity, d: DroppedWeapon): boolean {
    if (!canPickUp(e.team, d.team) || !this.list.includes(d)) return false;
    const w = e.weapon;
    if (w.hasPrimary) this.drop(e);
    this.remove(this.list.indexOf(d));
    if (!e.pendingLoadout) e.pendingLoadout = { ...e.loadout };
    e.applyLoadout({ weapon: d.weapon, scope: d.scope });
    w.ammo = d.ammo; w.reserve = d.reserve; w.modeIdx = Math.min(d.modeIdx, w.def.modes.length - 1);
    w.hasPrimary = true;
    cancelMelee(e);
    if (w.slot === 'ar') { w.equipT = w.equipTotal = equipTimeFor('ar'); } else w.switchTo('ar', equipTimeFor('ar'));
    bus.emit('weapon:pickup', { entityId: e.id, weaponId: d.weapon });
    return true;
  }

  /** Setelah world.step(): simpan pose fisika untuk interpolasi render. */
  postStep() { for (const d of this.list) d.lerp.step(d.body); }

  /** Per frame: umur (hilang setelah lifetime), mesh di antara dua step fisika (alpha). */
  update(dt: number, alpha: number) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const d = this.list[i];
      d.age += dt;
      if (d.age > DR.lifetime || d.lerp.pos.y < -20) { this.remove(i); continue; }
      d.lerp.apply(d.mesh, alpha);
    }
  }

  clear() { for (let i = this.list.length - 1; i >= 0; i--) this.remove(i); }

  private remove(i: number) {
    const d = this.list[i];
    physics.world.removeRigidBody(d.body);
    this.scene.remove(d.mesh);
    this.list.splice(i, 1);
  }

  private spawn(e: Entity, weapon: WeaponId, scope: ScopeId, ammo: number, reserve: number, modeIdx: number) {
    const m = weaponModel(weapon, scope === 'iron');
    const mesh = new THREE.Mesh(m.geometry, WEAPON_MATERIAL);
    const optic = createOpticMesh(scope);
    if (optic) { optic.position.z = m.opticMount.z; mesh.add(optic); }
    mesh.castShadow = this.castShadow;
    this.scene.add(mesh);
    // collider = kotak pembatas model (akar body = genggaman, laras ke −Z lokal)
    if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
    const bb = m.geometry.boundingBox!;
    const hx = Math.max(0.08, (bb.max.x - bb.min.x) / 2), hy = Math.max(0.12, (bb.max.y - bb.min.y) / 2), hz = (bb.max.z - bb.min.z) / 2;
    // posisi: di depan-bawah mata; laras tidak boleh menembus dinding di depan (raycast) → bila mepet, dilempar menyamping
    e.eye(_eye);
    let yaw = e.yaw;
    _f.set(-Math.sin(yaw), 0, -Math.cos(yaw));
    const hit = physics.raycast(_eye, _f, 4, QUERY.LOS), wall = hit < 0 ? 4 : hit;
    let along = Math.min(0.6, wall - 0.25 + bb.min.z);              // bb.min.z < 0: panjang laras di depan genggaman
    if (along < -1.0) { yaw += Math.PI / 2; along = Math.min(0.3, wall - 0.6); }
    const px = _eye.x - Math.sin(e.yaw) * along, py = _eye.y - 1.1, pz = _eye.z - Math.cos(e.yaw) * along;
    _q.setFromEuler(_eu.set(0, yaw, 0));
    const v = e.ctrl.vel, k = DR.inheritVel;
    const body = physics.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(px, py, pz)
      .setRotation({ x: _q.x, y: _q.y, z: _q.z, w: _q.w })
      .setLinvel(_f.x * DR.throwSpeed + v.x * k, DR.throwUp, _f.z * DR.throwSpeed + v.z * k)
      .setAngvel({ x: (Math.random() - 0.5) * 2, y: (Math.random() - 0.5) * 3, z: (Math.random() - 0.5) * 4 })
      .setCcdEnabled(true).setLinearDamping(DR.linDamp).setAngularDamping(DR.angDamp));
    physics.world.createCollider(RAPIER.ColliderDesc.cuboid(hx, hy, hz)
      .setTranslation((bb.max.x + bb.min.x) / 2, (bb.max.y + bb.min.y) / 2, (bb.max.z + bb.min.z) / 2)
      .setDensity(DR.density).setFriction(DR.friction).setRestitution(DR.restitution).setCollisionGroups(GROUPS.DEBRIS), body);
    mesh.position.set(px, py, pz); mesh.quaternion.copy(_q);
    this.list.push({ team: e.team, ownerId: e.id, weapon, scope, ammo, reserve, modeIdx, body, mesh, lerp: new BodyLerp().snap(body), age: 0 });
    while (this.list.length > DR.max) this.remove(0);
    bus.emit('weapon:drop', { entityId: e.id, position: new THREE.Vector3(px, py, pz) });
  }
}
