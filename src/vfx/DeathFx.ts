// src/vfx/DeathFx.ts — Classic Blocky Death Effect: bagian tubuh → body dinamis DEBRIS (GDD §7.4, §10.2)
import * as THREE from 'three';
import { RAPIER, physics } from '../physics/Physics';
import { GROUPS } from '../physics/groups';
import { XCFG } from '../config/extraConfig';
import { PART_KEYS, type PartKey } from '../entities/BlockyCharacter';
import type { Entity } from '../entities/Entity';

const DX = XCFG.death;
const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _c = new THREE.Vector3();

interface Corpse {
  bodies: RAPIER.RigidBody[];
  meshes: THREE.Mesh[];
  t: number; active: boolean;
}

export class DeathFx {
  private corpses = new Map<number, Corpse>();

  constructor(private scene: THREE.Scene) {}

  private ensure(e: Entity): Corpse {
    let c = this.corpses.get(e.id);
    if (c) return c;
    c = { bodies: [], meshes: [], t: 0, active: false };
    for (const k of PART_KEYS) {
      const src = e.char.parts[k];
      const g = src.geometry as THREE.BoxGeometry;
      const p = g.parameters;
      const body = physics.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(0, -200, 0)
        .setLinearDamping(0.3).setAngularDamping(0.5).setEnabled(false));
      physics.world.createCollider(RAPIER.ColliderDesc.cuboid(p.width / 2, p.height / 2, p.depth / 2).setDensity(1.0)
        .setFriction(0.8).setRestitution(0.25).setCollisionGroups(GROUPS.DEBRIS), body);
      const mesh = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: e.char.colors[k] }));
      mesh.castShadow = src.castShadow; mesh.visible = false;
      this.scene.add(mesh);
      c.bodies.push(body); c.meshes.push(mesh);
    }
    this.corpses.set(e.id, c);
    return c;
  }

  /** Bagian tubuh diganti body dinamis di transform yang sama; Δv keluar 3.0–4.5 u/s + impuls kematian; ω acak ±6. */
  spawn(e: Entity, impulse: THREE.Vector3) {
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
      m.position.copy(_p); m.quaternion.copy(_q);
    });
    c.t = 0; c.active = true;
  }

  /** Ledakan mendorong balok tubuh mati (×1.2). */
  explode(center: THREE.Vector3, radius: number, dvMax: number, mult: number) {
    for (const c of this.corpses.values()) {
      if (!c.active) continue;
      for (const b of c.bodies) {
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
      for (let i = 0; i < c.bodies.length; i++) {
        const b = c.bodies[i], m = c.meshes[i];
        const t = b.translation(), r = b.rotation();
        m.position.set(t.x, t.y, t.z); m.quaternion.set(r.x, r.y, r.z, r.w); m.scale.setScalar(shrink);
      }
      if (c.t >= DX.shrinkEnd) {
        c.active = false;
        for (let i = 0; i < c.bodies.length; i++) {
          c.bodies[i].setEnabled(false); c.bodies[i].setTranslation({ x: 0, y: -200, z: 0 }, false);
          c.meshes[i].visible = false;
        }
      }
    }
  }

  get activeBodies() { let n = 0; for (const c of this.corpses.values()) if (c.active) n += c.bodies.length; return n; }

  clear() {
    for (const c of this.corpses.values()) { c.t = DX.shrinkEnd; this.fixedUpdate(0); }
  }
}
