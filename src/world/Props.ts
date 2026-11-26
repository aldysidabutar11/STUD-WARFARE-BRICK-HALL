// src/world/Props.ts — benda dinamis map: buku, tumpukan buku, kertas (Brick Hall, GDD §4.8, §8.3, §10.2) + benda kantor (Boston:
// laptop, tumbler, kursi — dokumen pengguna "64 sleeping props"). Semua rigid body grup PROP yang TIDUR sampai kena peluru /
// ledakan (0% CPU), tidak menahan gerak karakter maupun peluru (peluru menembus + memberi impuls). Tampilan per jenis = satu
// InstancedMesh (1 draw call). Kosmetik per mesin (tidak disinkron jaringan). Map tanpa props = tanpa benda (metode tetap aman).
// dispose() saat ganti map.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RAPIER, physics } from '../physics/Physics';
import { GROUPS } from '../physics/groups';
import { CFG } from '../config/gameConfig';
import { XCFG } from '../config/extraConfig';
import { makeRng } from '../core/Rng';
import type { ShelfInfo } from './BrickHallBuilder';
import type { MapDef } from './maps/types';
import { BodyLerp } from '../core/BodyLerp';

const BOOK_COLORS = [0xc4281c, 0x0d69ac, 0xf5cd30, 0x287f47, 0x6b327c, 0xda8541, 0x74869d, 0xf2f3f3];
const LEVEL_BASE = [0.3, 1.55, 2.80];

import { PROP_SIZE, type PropKind } from './propKinds';
export type { PropItem, PropKind } from './propKinds';

/** live = sedang bergerak (matriks instance diinterpolasi per frame); berhenti diperbarui setelah body tidur.
 *  mesh/slot = InstancedMesh & indeks instance-nya (buku: mesh buku; benda kantor: mesh jenisnya). */
interface Book { body: RAPIER.RigidBody; p0: THREE.Vector3; q0: THREE.Quaternion; lerp: BodyLerp; live: boolean; mesh: THREE.InstancedMesh; mi: number; slot: number; mass: number }
interface Paper { p0: THREE.Vector3; yaw0: number; pos: THREE.Vector3; vel: THREE.Vector3; yaw: number; tilt: number; spin: number; flying: boolean }

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);
const _d = new THREE.Vector3(), _e = new THREE.Euler();

/** Bagian balok berwarna verteks (benda kantor). */
function part(g: THREE.BufferGeometry, x: number, y: number, z: number, color: number, rotX = 0): THREE.BufferGeometry {
  if (rotX) g.rotateX(rotX);
  g.translate(x, y, z);
  const c = new THREE.Color(color), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  if (g.index) return g.toNonIndexed();
  return g;
}
/** Geometri jenis benda (pusat = pusat collider). */
function kindGeometry(k: PropKind): THREE.BufferGeometry {
  const B = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
  if (k === 'laptop') return mergeGeometries([
    part(B(0.9, 0.05, 0.62), 0, -0.275, 0.04, 0x3a3d42),                         // badan + papan ketik
    part(B(0.78, 0.01, 0.3), 0, -0.245, 0.1, 0x1f2126),
    part(B(0.88, 0.56, 0.03), 0, 0.01, -0.27, 0x2b2e33, -0.22),                   // layar terbuka (condong ke belakang)
    part(B(0.8, 0.47, 0.005), 0, 0.01, -0.25, 0x4f7fb4, -0.22),                   // tampilan
  ])!;
  if (k === 'cup') return mergeGeometries([
    part(new THREE.CylinderGeometry(0.115, 0.095, 0.44, 10), 0, -0.03, 0, 0xffffff),
    part(new THREE.CylinderGeometry(0.12, 0.12, 0.06, 10), 0, 0.22, 0, 0x2b2e33),
  ])!;
  const legs = [[-0.48, -0.48], [0.48, -0.48], [-0.48, 0.48], [0.48, 0.48]].map(([x, z]) => part(B(0.08, 0.92, 0.08), x, -0.54, z, 0x2b2e33));
  return mergeGeometries([
    ...legs,
    part(B(1.12, 0.14, 1.12), 0, -0.02, 0, 0xffffff),                             // dudukan (warna instance)
    part(B(1.12, 0.95, 0.1), 0, 0.52, -0.5, 0xffffff),                            // sandaran
    part(B(0.06, 0.95, 0.06), -0.52, 0.5, -0.5, 0x2b2e33), part(B(0.06, 0.95, 0.06), 0.52, 0.5, -0.5, 0x2b2e33),
  ])!;
}

export class Props {
  readonly books: Book[] = [];
  readonly mesh: THREE.InstancedMesh;
  readonly byCollider = new Map<number, number>();
  readonly papersMesh: THREE.InstancedMesh;
  /** Mesh benda kantor per jenis (Boston). */
  private itemMeshes: THREE.InstancedMesh[] = [];
  private papers: Paper[] = [];
  /** Semua mesh benda (0 = buku, lalu jenis kantor) + tanda kotor per mesh (tanpa alokasi per frame). */
  private meshes: THREE.InstancedMesh[] = [];
  private dirty: boolean[] = [];
  awakeCount = 0;

  constructor(scene: THREE.Scene, shelves: ShelfInfo[], shadows: boolean, data?: MapDef['props']) {
    const [bw, bh, bd] = XCFG.props.bookSize;
    const geo = new THREE.BoxGeometry(bw, bh, bd);
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const piles = data?.bookPiles ?? [];
    const total = shelves.length * 15 + piles.length * XCFG.props.perPile;
    this.mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, total));
    this.mesh.count = total; this.mesh.visible = total > 0;
    this.mesh.castShadow = shadows; this.mesh.receiveShadow = shadows;
    // depth material bayangan sendiri: three.js memakai SATU depth material bersama untuk semua pembuat bayangan, dan
    // berganti instanced ↔ biasa memaksa program shadernya dihitung ulang (2× per frame, terukur ±0.8 MB/s sampah)
    if (shadows) this.mesh.customDepthMaterial = new THREE.MeshDepthMaterial();
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const color = new THREE.Color();

    this.meshes.push(this.mesh); this.dirty.push(false);
    const add = (pos: THREE.Vector3, quat: THREE.Quaternion, col: number, mesh: THREE.InstancedMesh, size: readonly number[]) => {
      const i = this.books.length, mi = this.meshes.indexOf(mesh), slot = this.books.filter(b => b.mesh === mesh).length;
      const body = physics.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(pos.x, pos.y, pos.z).setRotation({ x: quat.x, y: quat.y, z: quat.z, w: quat.w })
        .setLinearDamping(XCFG.props.bookLinDamp).setAngularDamping(XCFG.props.bookAngDamp).setSleeping(true));
      const c = physics.world.createCollider(RAPIER.ColliderDesc.cuboid(size[0] / 2, size[1] / 2, size[2] / 2)
        .setDensity(CFG.props.bookDensity).setFriction(CFG.props.bookFriction).setRestitution(CFG.props.bookRestitution)
        .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Max).setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Max)
        .setCollisionGroups(GROUPS.PROP), body);
      this.byCollider.set(c.handle, i);
      this.books.push({ body, p0: pos.clone(), q0: quat.clone(), lerp: new BodyLerp().snapTo(pos, quat), live: false, mesh, mi, slot, mass: body.mass() });
      _m.compose(pos, quat, _s); mesh.setMatrixAt(slot, _m);
      mesh.setColorAt(slot, color.setHex(col));
    };
    const book = [bw, bh, bd];

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
          add(_p, _q, BOOK_COLORS[Math.floor(r() * BOOK_COLORS.length)], this.mesh, book);
        }
      });
    }
    // 24 buku tergeletak: 6 tumpukan × 4
    piles.forEach(([x, z], pi) => {
      for (let j = 0; j < XCFG.props.perPile; j++) {
        const r = makeRng(CFG.props.seed + 9000 + pi * 10 + j);
        _p.set(x + (r() - 0.5) * 0.15, bw / 2 + j * (bw + 0.004), z + (r() - 0.5) * 0.15);
        _q.setFromEuler(_e.set(0, r() * Math.PI, Math.PI / 2, 'YXZ'));
        add(_p, _q, BOOK_COLORS[Math.floor(r() * BOOK_COLORS.length)], this.mesh, book);
      }
    });
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    scene.add(this.mesh);

    // 40 lembar kertas (bukan rigid body) — hanya map yang memberi lantai kertas (Brick Hall)
    const [pw, ph] = XCFG.props.paperSize;
    const pg = new THREE.PlaneGeometry(pw, ph); pg.rotateX(-Math.PI / 2);
    const FA = data?.floorArea;
    const nPapers = FA ? XCFG.props.papers : 0;
    this.papersMesh = new THREE.InstancedMesh(pg, new THREE.MeshLambertMaterial({ color: 0xf5f5f0, side: THREE.DoubleSide }), Math.max(1, nPapers));
    this.papersMesh.count = nPapers; this.papersMesh.visible = nPapers > 0;
    this.papersMesh.receiveShadow = shadows;
    this.papersMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const obst = data?.groundObstacles ? data.groundObstacles() : [];
    const rng = makeRng(CFG.props.seed + 777);
    for (let i = 0; i < nPapers; i++) {
      let x = 0, z = 0;
      for (let tries = 0; tries < 60; tries++) {
        x = FA!.x[0] + 1 + rng() * (FA!.x[1] - FA!.x[0] - 2);
        z = FA!.z[0] + 1 + rng() * (FA!.z[1] - FA!.z[0] - 2);
        if (!obst.some(o => x > o.x[0] - 0.6 && x < o.x[1] + 0.6 && z > o.z[0] - 0.6 && z < o.z[1] + 0.6)) break;
      }
      const p0 = new THREE.Vector3(x, 0.010 + i * 0.00025, z);
      const yaw0 = rng() * Math.PI * 2;
      this.papers.push({ p0, yaw0, pos: p0.clone(), vel: new THREE.Vector3(), yaw: yaw0, tilt: 0, spin: 0, flying: false });
      this.writePaper(i);
    }
    this.papersMesh.instanceMatrix.needsUpdate = true;
    scene.add(this.papersMesh);

    // benda kantor (Boston): satu InstancedMesh per jenis, warna verteks per bagian × warna instance
    const items = data?.items ?? [];
    for (const kind of ['laptop', 'cup', 'chair'] as const) {
      const list = items.filter(it => it.kind === kind);
      if (!list.length) continue;
      const im = new THREE.InstancedMesh(kindGeometry(kind), new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true }), list.length);
      im.castShadow = shadows; im.receiveShadow = shadows;
      if (shadows) im.customDepthMaterial = new THREE.MeshDepthMaterial();
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.name = `props_${kind}`;
      this.meshes.push(im); this.dirty.push(false);
      for (const it of list) {
        _p.set(it.x, it.y, it.z); _q.setFromEuler(_e.set(0, it.yaw, 0));
        add(_p, _q, it.tint ?? 0xffffff, im, PROP_SIZE[kind]);
      }
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
      scene.add(im);
      this.itemMeshes.push(im);
    }
  }

  private writePaper(i: number) {
    const p = this.papers[i];
    _q.setFromEuler(_e.set(p.tilt, p.yaw, 0, 'YXZ'));
    _m.compose(p.pos, _q, _s);
    this.papersMesh.setMatrixAt(i, _m);
  }

  private flush() {
    for (let i = 0; i < this.meshes.length; i++) if (this.dirty[i]) { this.meshes[i].instanceMatrix.needsUpdate = true; this.dirty[i] = false; }
  }

  /** Setiap fixed step (setelah world.step): benda yang tidak tidur menyimpan pose untuk interpolasi; yang baru tertidur
   *  ditulis sekali di pose akhir lalu tidak disentuh lagi. Matriks benda bergerak ditulis per frame di update(alpha). */
  fixedUpdate(dt: number) {
    let awake = 0;
    for (let i = 0; i < this.books.length; i++) {
      const bk = this.books[i], b = bk.body;
      if (b.isSleeping()) {
        if (bk.live) { bk.live = false; _m.compose(bk.lerp.pos, bk.lerp.quat, _s); bk.mesh.setMatrixAt(bk.slot, _m); this.dirty[bk.mi] = true; }
        continue;
      }
      awake++;
      bk.lerp.step(b); bk.live = true;
      if (bk.lerp.pos.y < -20) {
        b.setTranslation({ x: bk.lerp.pos.x, y: 1, z: bk.lerp.pos.z }, true); b.setLinvel({ x: 0, y: 0, z: 0 }, true);
        bk.lerp.snap(b);
      }
    }
    this.awakeCount = awake;
    this.flush();

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

  /** Per frame: benda yang sedang bergerak digambar di antara dua step fisika (alpha). */
  update(alpha: number) {
    for (let i = 0; i < this.books.length; i++) {
      const bk = this.books[i];
      if (!bk.live) continue;
      bk.lerp.sample(alpha, _p, _q); _m.compose(_p, _q, _s); bk.mesh.setMatrixAt(bk.slot, _m);
      this.dirty[bk.mi] = true;
    }
    this.flush();
  }

  /** Peluru mengenai benda: impuls arah × m × 4 + (0, m × 1, 0) di titik hit (§10.2). */
  bulletHit(colliderHandle: number, dir: THREE.Vector3, point: THREE.Vector3) {
    const i = this.byCollider.get(colliderHandle);
    if (i === undefined) return;
    const bk = this.books[i], m = bk.mass, k = CFG.props.bulletImpulse;
    bk.body.applyImpulseAtPoint(
      { x: dir.x * m * k, y: dir.y * m * k + m * XCFG.props.bookLift, z: dir.z * m * k }, { x: point.x, y: point.y, z: point.z }, true);
  }

  /** Ledakan: Δv = 14 × (1 − r/12) ke normalize(p − c + (0, 0.5, 0)) untuk benda yang terlihat; kertas radius 10. */
  explode(c: THREE.Vector3) {
    const G = CFG.grenade;
    for (const bk of this.books) {
      const t = bk.body.translation();
      const r = Math.hypot(t.x - c.x, t.y - c.y, t.z - c.z);
      if (r >= G.blastRadius) continue;
      if (physics.losBlocked(c.x, c.y, c.z, t.x, t.y, t.z)) continue;
      const dv = G.propImpulse * (1 - r / G.blastRadius);
      _d.set(t.x - c.x, t.y - c.y + 0.5, t.z - c.z).normalize().multiplyScalar(dv * bk.mass);
      bk.body.applyImpulse({ x: _d.x, y: _d.y, z: _d.z }, true);
      const tq = 0.08 * bk.mass / this.books[0].mass;
      bk.body.applyTorqueImpulse({ x: (Math.random() - 0.5) * tq, y: (Math.random() - 0.5) * tq, z: (Math.random() - 0.5) * tq }, true);
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

  /** Ganti map: lepas benda fisika, mesh & materialnya. */
  dispose() {
    for (const bk of this.books) physics.world.removeRigidBody(bk.body);   // collider yang menempel ikut terhapus
    this.books.length = 0; this.byCollider.clear(); this.papers.length = 0; this.awakeCount = 0;
    for (const m of [this.mesh, this.papersMesh, ...this.itemMeshes]) {
      m.removeFromParent(); m.geometry.dispose(); (m.material as THREE.Material).dispose(); m.customDepthMaterial?.dispose(); m.dispose();
    }
    this.itemMeshes.length = 0; this.meshes.length = 0; this.dirty.length = 0;
  }

  reset() {
    for (let i = 0; i < this.books.length; i++) {
      const bk = this.books[i];
      bk.body.setTranslation({ x: bk.p0.x, y: bk.p0.y, z: bk.p0.z }, false);
      bk.body.setRotation({ x: bk.q0.x, y: bk.q0.y, z: bk.q0.z, w: bk.q0.w }, false);
      bk.body.setLinvel({ x: 0, y: 0, z: 0 }, false); bk.body.setAngvel({ x: 0, y: 0, z: 0 }, false);
      bk.body.sleep();
      bk.lerp.snapTo(bk.p0, bk.q0); bk.live = false;
      _m.compose(bk.p0, bk.q0, _s); bk.mesh.setMatrixAt(bk.slot, _m); this.dirty[bk.mi] = true;
    }
    this.flush();
    for (let i = 0; i < this.papers.length; i++) {
      const p = this.papers[i];
      p.pos.copy(p.p0); p.yaw = p.yaw0; p.tilt = 0; p.flying = false; p.vel.set(0, 0, 0);
      this.writePaper(i);
    }
    this.papersMesh.instanceMatrix.needsUpdate = true;
  }
}
