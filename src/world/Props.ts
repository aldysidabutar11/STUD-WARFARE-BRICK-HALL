// src/world/Props.ts — buku dinamis, tumpukan buku, kertas (GDD §4.8, §8.3, §10.2)
import * as THREE from 'three';
import { RAPIER, physics } from '../physics/Physics';
import { GROUPS } from '../physics/groups';
import { CFG } from '../config/gameConfig';
import { XCFG } from '../config/extraConfig';
import { makeRng } from '../core/Rng';
import { BOOK_PILES, FLOOR_AREA, groundObstacles } from './MapData';
import type { ShelfInfo } from './BrickHallBuilder';

const BOOK_COLORS = [0xc4281c, 0x0d69ac, 0xf5cd30, 0x287f47, 0x6b327c, 0xda8541, 0x74869d, 0xf2f3f3];
const LEVEL_BASE = [0.3, 1.55, 2.80];

interface Book { body: RAPIER.RigidBody; p0: THREE.Vector3; q0: THREE.Quaternion }
interface Paper { p0: THREE.Vector3; yaw0: number; pos: THREE.Vector3; vel: THREE.Vector3; yaw: number; tilt: number; spin: number; flying: boolean }

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);
const _d = new THREE.Vector3(), _e = new THREE.Euler();

export class Props {
  readonly books: Book[] = [];
  readonly mesh: THREE.InstancedMesh;
  readonly byCollider = new Map<number, number>();
  readonly papersMesh: THREE.InstancedMesh;
  private papers: Paper[] = [];
  private mass = 0.27;
  awakeCount = 0;

  constructor(scene: THREE.Scene, shelves: ShelfInfo[], shadows: boolean) {
    const [bw, bh, bd] = XCFG.props.bookSize;
    const geo = new THREE.BoxGeometry(bw, bh, bd);
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const total = shelves.length * 15 + XCFG.props.piles * XCFG.props.perPile;
    this.mesh = new THREE.InstancedMesh(geo, mat, total);
    this.mesh.castShadow = shadows; this.mesh.receiveShadow = shadows;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const color = new THREE.Color();

    const add = (pos: THREE.Vector3, quat: THREE.Quaternion, col: number) => {
      const i = this.books.length;
      const body = physics.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(pos.x, pos.y, pos.z).setRotation({ x: quat.x, y: quat.y, z: quat.z, w: quat.w })
        .setLinearDamping(XCFG.props.bookLinDamp).setAngularDamping(XCFG.props.bookAngDamp).setSleeping(true));
      const c = physics.world.createCollider(RAPIER.ColliderDesc.cuboid(bw / 2, bh / 2, bd / 2)
        .setDensity(CFG.props.bookDensity).setFriction(CFG.props.bookFriction).setRestitution(CFG.props.bookRestitution)
        .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Max).setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Max)
        .setCollisionGroups(GROUPS.PROP), body);
      this.mass = body.mass();
      this.byCollider.set(c.handle, i);
      this.books.push({ body, p0: pos.clone(), q0: quat.clone() });
      _m.compose(pos, quat, _s); this.mesh.setMatrixAt(i, _m);
      this.mesh.setColorAt(i, color.setHex(col));
    };

    // 15 buku per rak: [3,2,3 | 2,3,2] (sisi +D level 1–3 | sisi −D level 1–3)
    for (const sh of shelves) {
      let k = 0;
      XCFG.props.booksPerCompartment.forEach((n, comp) => {
        const sideSign = comp < 3 ? 1 : -1, level = comp % 3;
        for (let i = 0; i < n; i++, k++) {
          const r = makeRng(CFG.props.seed + sh.index * 100 + k);
          const s = -2.85 + (i + 0.5) * 5.7 / n + (r() * 2 - 1) * XCFG.props.bookJitter;
          const y = LEVEL_BASE[level] + 0.505, d = sideSign * 0.4;
          const yaw = (sh.alongX ? 0 : Math.PI / 2) + (r() * 2 - 1) * THREE.MathUtils.degToRad(XCFG.props.bookYawDeg);
          _p.set(sh.alongX ? sh.cx + s : sh.cx + d, y, sh.alongX ? sh.cz + d : sh.cz + s);
          _q.setFromEuler(_e.set(0, yaw, 0));
          add(_p, _q, BOOK_COLORS[Math.floor(r() * BOOK_COLORS.length)]);
        }
      });
    }
    // 24 buku tergeletak: 6 tumpukan × 4
    BOOK_PILES.forEach(([x, z], pi) => {
      for (let j = 0; j < XCFG.props.perPile; j++) {
        const r = makeRng(CFG.props.seed + 9000 + pi * 10 + j);
        _p.set(x + (r() - 0.5) * 0.15, bw / 2 + j * (bw + 0.004), z + (r() - 0.5) * 0.15);
        _q.setFromEuler(_e.set(0, r() * Math.PI, Math.PI / 2, 'YXZ'));
        add(_p, _q, BOOK_COLORS[Math.floor(r() * BOOK_COLORS.length)]);
      }
    });
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    scene.add(this.mesh);

    // 40 lembar kertas (bukan rigid body)
    const [pw, ph] = XCFG.props.paperSize;
    const pg = new THREE.PlaneGeometry(pw, ph); pg.rotateX(-Math.PI / 2);
    this.papersMesh = new THREE.InstancedMesh(pg, new THREE.MeshLambertMaterial({ color: 0xf5f5f0, side: THREE.DoubleSide }), XCFG.props.papers);
    this.papersMesh.receiveShadow = shadows;
    this.papersMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const obst = groundObstacles();
    const rng = makeRng(CFG.props.seed + 777);
    for (let i = 0; i < XCFG.props.papers; i++) {
      let x = 0, z = 0;
      for (let tries = 0; tries < 60; tries++) {
        x = FLOOR_AREA.x[0] + 1 + rng() * (FLOOR_AREA.x[1] - FLOOR_AREA.x[0] - 2);
        z = FLOOR_AREA.z[0] + 1 + rng() * (FLOOR_AREA.z[1] - FLOOR_AREA.z[0] - 2);
        if (!obst.some(o => x > o.x[0] - 0.6 && x < o.x[1] + 0.6 && z > o.z[0] - 0.6 && z < o.z[1] + 0.6)) break;
      }
      const p0 = new THREE.Vector3(x, 0.010 + i * 0.00025, z);
      const yaw0 = rng() * Math.PI * 2;
      this.papers.push({ p0, yaw0, pos: p0.clone(), vel: new THREE.Vector3(), yaw: yaw0, tilt: 0, spin: 0, flying: false });
      this.writePaper(i);
    }
    this.papersMesh.instanceMatrix.needsUpdate = true;
    scene.add(this.papersMesh);
  }

  private writePaper(i: number) {
    const p = this.papers[i];
    _q.setFromEuler(_e.set(p.tilt, p.yaw, 0, 'YXZ'));
    _m.compose(p.pos, _q, _s);
    this.papersMesh.setMatrixAt(i, _m);
  }

  /** Setiap fixed step: hanya buku yang tidak tidur yang memperbarui matriks InstancedMesh. */
  fixedUpdate(dt: number) {
    let dirty = false, awake = 0;
    for (let i = 0; i < this.books.length; i++) {
      const b = this.books[i].body;
      if (b.isSleeping()) continue;
      awake++;
      const t = b.translation(), r = b.rotation();
      _p.set(t.x, t.y, t.z); _q.set(r.x, r.y, r.z, r.w);
      if (_p.y < -20) { b.setTranslation({ x: _p.x, y: 1, z: _p.z }, true); b.setLinvel({ x: 0, y: 0, z: 0 }, true); }
      _m.compose(_p, _q, _s); this.mesh.setMatrixAt(i, _m);
      dirty = true;
    }
    this.awakeCount = awake;
    if (dirty) this.mesh.instanceMatrix.needsUpdate = true;

    let pdirty = false;
    const g = XCFG.explosion.paperGravity, drag = Math.exp(-XCFG.explosion.paperDrag * dt);
    for (let i = 0; i < this.papers.length; i++) {
      const p = this.papers[i];
      if (!p.flying) continue;
      p.vel.y += g * dt; p.vel.multiplyScalar(drag);
      p.pos.addScaledVector(p.vel, dt);
      p.yaw += p.spin * dt; p.tilt = Math.sin(p.yaw * 3) * 0.6;
      if (p.pos.y <= p.p0.y && p.vel.y < 0) { p.pos.y = p.p0.y; p.flying = false; p.tilt = 0; }
      this.writePaper(i); pdirty = true;
    }
    if (pdirty) this.papersMesh.instanceMatrix.needsUpdate = true;
  }

  /** Peluru mengenai buku: impuls arah × m × 4 + (0, m × 1, 0) di titik hit (§10.2). */
  bulletHit(colliderHandle: number, dir: THREE.Vector3, point: THREE.Vector3) {
    const i = this.byCollider.get(colliderHandle);
    if (i === undefined) return;
    const m = this.mass, k = CFG.props.bulletImpulse;
    this.books[i].body.applyImpulseAtPoint(
      { x: dir.x * m * k, y: dir.y * m * k + m * XCFG.props.bookLift, z: dir.z * m * k }, { x: point.x, y: point.y, z: point.z }, true);
  }

  /** Ledakan: Δv = 14 × (1 − r/12) ke normalize(p − c + (0, 0.5, 0)) untuk buku yang terlihat; kertas radius 10. */
  explode(c: THREE.Vector3) {
    const G = CFG.grenade;
    for (const bk of this.books) {
      const t = bk.body.translation();
      const r = Math.hypot(t.x - c.x, t.y - c.y, t.z - c.z);
      if (r >= G.blastRadius) continue;
      if (physics.losBlocked(c.x, c.y, c.z, t.x, t.y, t.z)) continue;
      const dv = G.propImpulse * (1 - r / G.blastRadius);
      _d.set(t.x - c.x, t.y - c.y + 0.5, t.z - c.z).normalize().multiplyScalar(dv * this.mass);
      bk.body.applyImpulse({ x: _d.x, y: _d.y, z: _d.z }, true);
      bk.body.applyTorqueImpulse({ x: (Math.random() - 0.5) * 0.08, y: (Math.random() - 0.5) * 0.08, z: (Math.random() - 0.5) * 0.08 }, true);
    }
    for (let i = 0; i < this.papers.length; i++) {
      const p = this.papers[i];
      const r = Math.hypot(p.pos.x - c.x, p.pos.z - c.z);
      if (r >= G.paperRadius || Math.abs(p.pos.y - c.y) > 6) continue;
      const k = 1 - r / G.paperRadius;
      _d.set(p.pos.x - c.x, 0, p.pos.z - c.z).normalize();
      p.vel.set(_d.x * 7 * k, 3 + 5 * k * Math.random(), _d.z * 7 * k);
      p.spin = (Math.random() - 0.5) * 12; p.flying = true; p.pos.y += 0.05;
    }
  }

  reset() {
    for (let i = 0; i < this.books.length; i++) {
      const bk = this.books[i];
      bk.body.setTranslation({ x: bk.p0.x, y: bk.p0.y, z: bk.p0.z }, false);
      bk.body.setRotation({ x: bk.q0.x, y: bk.q0.y, z: bk.q0.z, w: bk.q0.w }, false);
      bk.body.setLinvel({ x: 0, y: 0, z: 0 }, false); bk.body.setAngvel({ x: 0, y: 0, z: 0 }, false);
      bk.body.sleep();
      _m.compose(bk.p0, bk.q0, _s); this.mesh.setMatrixAt(i, _m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    for (let i = 0; i < this.papers.length; i++) {
      const p = this.papers[i];
      p.pos.copy(p.p0); p.yaw = p.yaw0; p.tilt = 0; p.flying = false; p.vel.set(0, 0, 0);
      this.writePaper(i);
    }
    this.papersMesh.instanceMatrix.needsUpdate = true;
  }
}
