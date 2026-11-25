// src/vfx/DeathFx.ts — Classic Blocky Death Effect: bagian tubuh → body dinamis DEBRIS (GDD §7.4, §10.2)
import * as THREE from 'three';
import { RAPIER, physics } from '../physics/Physics';
import { GROUPS } from '../physics/groups';
import { XCFG } from '../config/extraConfig';
import { PART_KEYS, type PartKey } from '../entities/BlockyCharacter';
import type { Entity } from '../entities/Entity';
import { BodyLerp } from '../core/BodyLerp';
import { VennyRig } from '../entities/venny/rig';
import { BAKE_UNIFORMS } from '../world/LightBake';

const DX = XCFG.death;
const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _c = new THREE.Vector3();
/** Venny: pusat badan relatif kaki (body fisika tunggal, rendah: tubuh lunglai berlutut) & setengah ukuran kotak tabrakannya. */
const V_CENTER = 1.2, V_HALF = { x: 0.4, y: 1.05, z: 0.3 };
/** Pose lunglai (berlutut, badan membungkuk, lengan jatuh) yang dituju dalam ±0.55 s setelah mati. */
const E = (x: number, y = 0, z = 0) => new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z));
const SLUMP: [number, THREE.Quaternion][] = [
  [2, E(0.38)], [3, E(0.28)], [4, E(0.32)], [5, E(0.22, 0, 0.15)],
  [7, E(0.05, 0, 0.22)], [8, E(0.3)], [9, E(0)], [11, E(0.05, 0, -0.22)], [12, E(0.3)], [13, E(0)],
  [14, E(1.05)], [15, E(-1.95)], [16, E(0.6)], [17, E(1.25)], [18, E(-2.0)], [19, E(0.6)],
];
const SLUMP_HIPS_Y = 1.3, _sq = new THREE.Quaternion();

interface Corpse {
  bodies: RAPIER.RigidBody[];
  meshes: THREE.Mesh[];
  lerps: BodyLerp[];   // pose fisika 2 step terakhir -> mesh diinterpolasi per frame
  t: number; active: boolean;
}
/** Venny realistis tidak "pecah balok" (untuk manusia realistis terlihat seperti mutilasi): tubuh utuh dibekukan dalam pose
 *  terakhirnya lalu roboh sebagai satu body fisika, menyusut & hilang dengan waktu yang sama dengan balok. */
interface VCorpse {
  body: RAPIER.RigidBody; holder: THREE.Group; rig: VennyRig; lerp: BodyLerp; team: string; t: number; active: boolean;
  q0: THREE.Quaternion[]; hipsQ: THREE.Quaternion; hipsY0: number;
}

export class DeathFx {
  private corpses = new Map<number, Corpse>();
  private vcorpses = new Map<number, VCorpse>();
  readonly root = new THREE.Group();

  constructor(scene: THREE.Scene) { scene.add(this.root); }

  private spawnVenny(e: Entity, impulse: THREE.Vector3) {
    const live = e.char.venny!;
    let c = this.vcorpses.get(e.id);
    if (c && c.team !== e.team) { this.root.remove(c.holder); c.rig.dispose(); physics.world.removeRigidBody(c.body); c = undefined; }
    if (!c) {
      const body = physics.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(0, -200, 0)
        .setLinearDamping(0.4).setAngularDamping(0.8).setEnabled(false));
      physics.world.createCollider(RAPIER.ColliderDesc.cuboid(V_HALF.x, V_HALF.y, V_HALF.z).setDensity(1.0)
        .setFriction(0.9).setRestitution(0.1).setCollisionGroups(GROUPS.DEBRIS), body);
      const rig = new VennyRig(e.team, live.mesh.castShadow, { value: new THREE.Vector2(1, 0) }, BAKE_UNIFORMS.uBounce);
      const holder = new THREE.Group();
      rig.root.position.y = -V_CENTER;
      holder.add(rig.root); holder.visible = false;
      this.root.add(holder);
      c = { body, holder, rig, lerp: new BodyLerp(), team: e.team, t: 0, active: false,
        q0: rig.bones.map(() => new THREE.Quaternion()), hipsQ: new THREE.Quaternion(), hipsY0: 2.5 };
      this.vcorpses.set(e.id, c);
    }
    // pose terakhir (tanpa senjata) → titik awal lunglai
    live.bones.forEach((b, i) => { c!.rig.bones[i].position.copy(b.position); c!.rig.bones[i].quaternion.copy(b.quaternion); c!.q0[i].copy(b.quaternion); });
    c.hipsY0 = live.bones[1].position.y;
    c.hipsQ.copy(live.bones[1].quaternion).multiply(E(0.12));
    e.char.root.updateMatrixWorld(true);
    e.char.root.matrixWorld.decompose(_p, _q, _s);
    _p.add(_c.set(0, V_CENTER, 0).applyQuaternion(_q));
    const b = c.body;
    b.setEnabled(true);
    b.setTranslation({ x: _p.x, y: _p.y, z: _p.z }, true);
    b.setRotation({ x: _q.x, y: _q.y, z: _q.z, w: _q.w }, true);
    b.setLinvel({ x: impulse.x * 0.35, y: impulse.y * 0.35, z: impulse.z * 0.35 }, true);
    // rebah pelan searah dorongan (atau acak) sambil tubuh lunglai berlutut (fixedUpdate)
    const ix = impulse.lengthSq() > 1e-4 ? _s.set(impulse.z, 0, -impulse.x).normalize() : _s.set(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
    b.setAngvel({ x: ix.x * 1.3, y: (Math.random() - 0.5) * 0.5, z: ix.z * 1.3 }, true);
    c.lerp.snapTo(_p, _q); c.holder.position.copy(_p); c.holder.quaternion.copy(_q);
    c.holder.scale.setScalar(1); c.holder.visible = true;
    c.t = 0; c.active = true;
  }

  private ensure(e: Entity): Corpse {
    let c = this.corpses.get(e.id);
    if (c) return c;
    c = { bodies: [], meshes: [], lerps: [], t: 0, active: false };
    for (const k of PART_KEYS) {
      const src = e.char.parts[k];
      const g = src.geometry as THREE.BoxGeometry;
      const p = g.parameters;
      const body = physics.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(0, -200, 0)
        .setLinearDamping(0.3).setAngularDamping(0.5).setEnabled(false));
      physics.world.createCollider(RAPIER.ColliderDesc.cuboid(p.width / 2, p.height / 2, p.depth / 2).setDensity(1.0)
        .setFriction(0.8).setRestitution(0.25).setCollisionGroups(GROUPS.DEBRIS), body);
      // collider = hitbox GDD; tampilan = geometri + atlas karakter (diperbarui tiap spawn, varian bisa berganti)
      const vis = e.char.visuals[k];
      const mesh = new THREE.Mesh(vis.geometry, e.char.debrisMaterial);
      mesh.castShadow = vis.castShadow; mesh.visible = false;
      this.root.add(mesh);
      c.bodies.push(body); c.meshes.push(mesh); c.lerps.push(new BodyLerp());
    }
    this.corpses.set(e.id, c);
    return c;
  }

  /** Bagian tubuh diganti body dinamis di transform yang sama; Δv keluar 3.0–4.5 u/s + impuls kematian; ω acak ±6. */
  spawn(e: Entity, impulse: THREE.Vector3) {
    if (e.char.venny) { this.spawnVenny(e, impulse); return; }
    const c = this.ensure(e);
    e.char.root.updateMatrixWorld(true);
    e.partCenter('upper', _c);
    PART_KEYS.forEach((k: PartKey, i) => {
      const src = e.char.parts[k];
      src.matrixWorld.decompose(_p, _q, _s);
      const b = c.bodies[i];
      b.setEnabled(true);
      b.setTranslation({ x: _p.x, y: _p.y, z: _p.z }, true);
      b.setRotation({ x: _q.x, y: _q.y, z: _q.z, w: _q.w }, true);
      const out = _s.copy(_p).sub(_c); if (out.lengthSq() < 1e-4) out.set(0, 1, 0);
      out.normalize().multiplyScalar(DX.dvMin + Math.random() * (DX.dvMax - DX.dvMin)).add(impulse);
      b.setLinvel({ x: out.x, y: out.y + 1.0, z: out.z }, true);
      b.setAngvel({ x: (Math.random() * 2 - 1) * DX.omega, y: (Math.random() * 2 - 1) * DX.omega, z: (Math.random() * 2 - 1) * DX.omega }, true);
      const m = c.meshes[i]; m.visible = true; m.scale.setScalar(1);
      m.geometry = e.char.visuals[k].geometry; m.material = e.char.debrisMaterial;
      m.position.copy(_p); m.quaternion.copy(_q);
      c.lerps[i].snapTo(_p, _q);
    });
    c.t = 0; c.active = true;
  }

  /** Ledakan mendorong balok tubuh mati (×1.2). */
  explode(center: THREE.Vector3, radius: number, dvMax: number, mult: number) {
    const all: RAPIER.RigidBody[][] = [];
    for (const c of this.corpses.values()) if (c.active) all.push(c.bodies);
    for (const c of this.vcorpses.values()) if (c.active) all.push([c.body]);
    for (const bodies of all) {
      for (const b of bodies) {
        const t = b.translation();
        const r = Math.hypot(t.x - center.x, t.y - center.y, t.z - center.z);
        if (r >= radius) continue;
        const dv = dvMax * (1 - r / radius) * mult;
        _p.set(t.x - center.x, t.y - center.y + 0.5, t.z - center.z).normalize().multiplyScalar(dv);
        const v = b.linvel();
        b.setLinvel({ x: v.x + _p.x, y: v.y + _p.y, z: v.z + _p.z }, true);
      }
    }
  }

  fixedUpdate(dt: number) {
    for (const c of this.corpses.values()) {
      if (!c.active) continue;
      c.t += dt;
      const shrink = c.t < DX.shrinkStart ? 1 : Math.max(0, 1 - (c.t - DX.shrinkStart) / (DX.shrinkEnd - DX.shrinkStart));
      for (let i = 0; i < c.bodies.length; i++) { c.lerps[i].step(c.bodies[i]); c.meshes[i].scale.setScalar(shrink); }
      if (c.t >= DX.shrinkEnd) {
        c.active = false;
        for (let i = 0; i < c.bodies.length; i++) {
          c.bodies[i].setEnabled(false); c.bodies[i].setTranslation({ x: 0, y: -200, z: 0 }, false);
          c.meshes[i].visible = false;
        }
      }
    }
    for (const c of this.vcorpses.values()) {
      if (!c.active) continue;
      c.t += dt;
      // lunglai: tulang berpindah halus dari pose terakhir ke pose berlutut-membungkuk
      const w = Math.min(1, c.t / 0.55), k = w * w * (3 - 2 * w), bones = c.rig.bones;
      for (const [i, q] of SLUMP) bones[i].quaternion.slerpQuaternions(c.q0[i], q, k);
      bones[1].quaternion.slerpQuaternions(c.q0[1], _sq.copy(c.hipsQ), k);
      bones[1].position.y = c.hipsY0 + (SLUMP_HIPS_Y - c.hipsY0) * k;
      const shrink = c.t < DX.shrinkStart ? 1 : Math.max(0, 1 - (c.t - DX.shrinkStart) / (DX.shrinkEnd - DX.shrinkStart));
      c.lerp.step(c.body); c.holder.scale.setScalar(shrink);
      if (c.t >= DX.shrinkEnd) {
        c.active = false; c.holder.visible = false;
        c.body.setEnabled(false); c.body.setTranslation({ x: 0, y: -200, z: 0 }, false);
      }
    }
  }

  /** Per frame: balok tubuh di antara dua step fisika (alpha) -> terlempar mulus di layar > 60 Hz. */
  update(alpha: number) {
    for (const c of this.corpses.values()) {
      if (!c.active) continue;
      for (let i = 0; i < c.meshes.length; i++) c.lerps[i].apply(c.meshes[i], alpha);
    }
    for (const c of this.vcorpses.values()) if (c.active) c.lerp.apply(c.holder, alpha);
  }

  get activeBodies() {
    let n = 0;
    for (const c of this.corpses.values()) if (c.active) n += c.bodies.length;
    for (const c of this.vcorpses.values()) if (c.active) n++;
    return n;
  }

  clear() {
    for (const c of this.corpses.values()) { c.t = DX.shrinkEnd; }
    for (const c of this.vcorpses.values()) { c.t = DX.shrinkEnd; }
    this.fixedUpdate(0);
  }
}
