// src/vfx/Vfx.ts — muzzle flash, tracer, selongsong, decal, serpihan, ledakan (GDD §7.4, §8.3) — semua di-pool
import * as THREE from 'three';
import { XCFG } from '../config/extraConfig';
import type { Preset } from '../config/gameConfig';
import { physics } from '../physics/Physics';
import { QUERY } from '../physics/groups';
import type { Entity } from '../entities/Entity';
import type { PartKey } from '../entities/BlockyCharacter';
import { weaponModel } from '../combat/WeaponModels';

const X = XCFG.vfx;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Color(), _c2 = new THREE.Color();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1), Y_AXIS = new THREE.Vector3(0, 1, 0);

interface Particle { pos: THREE.Vector3; vel: THREE.Vector3; rot: THREE.Euler; spin: THREE.Vector3; size: number; life: number; max: number; floor: number; bounces: number }
const newParticle = (): Particle => ({ pos: new THREE.Vector3(), vel: new THREE.Vector3(), rot: new THREE.Euler(), spin: new THREE.Vector3(), size: 1, life: 0, max: 1, floor: -99, bounces: 0 });

class ParticlePool {
  readonly mesh: THREE.InstancedMesh;
  readonly items: Particle[] = [];
  private next = 0;
  constructor(scene: THREE.Scene, geo: THREE.BufferGeometry, mat: THREE.Material, n: number, readonly gravity: number, readonly fixedColor?: number) {
    this.mesh = new THREE.InstancedMesh(geo, mat, n);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    for (let i = 0; i < n; i++) { this.items.push(newParticle()); this.mesh.setMatrixAt(i, ZERO); this.mesh.setColorAt(i, _c.setHex(fixedColor ?? 0xffffff)); }
    scene.add(this.mesh);
  }
  spawn(color?: number): Particle {
    const i = this.next; this.next = (this.next + 1) % this.items.length;
    if (color !== undefined) { this.mesh.setColorAt(i, _c.setHex(color)); this.mesh.instanceColor!.needsUpdate = true; }
    const p = this.items[i]; p.bounces = 0; p.floor = -99; return p;
  }
  update(dt: number, bounce = false) {
    let any = false;
    for (let i = 0; i < this.items.length; i++) {
      const p = this.items[i];
      if (p.life <= 0) continue;
      any = true;
      p.life -= dt;
      if (p.life <= 0) { this.mesh.setMatrixAt(i, ZERO); continue; }
      p.vel.y += this.gravity * dt;
      p.pos.addScaledVector(p.vel, dt);
      if (p.pos.y < p.floor) {
        p.pos.y = p.floor;
        if (bounce && p.bounces < X.shellBounces) { p.vel.y = -p.vel.y * 0.35; p.vel.x *= 0.5; p.vel.z *= 0.5; p.bounces++; }
        else { p.vel.set(0, 0, 0); p.spin.set(0, 0, 0); }
      }
      p.rot.x += p.spin.x * dt; p.rot.y += p.spin.y * dt; p.rot.z += p.spin.z * dt;
      _q.setFromEuler(p.rot);
      _s.setScalar(p.size);
      this.mesh.setMatrixAt(i, _m.compose(p.pos, _q, _s));
    }
    if (any) this.mesh.instanceMatrix.needsUpdate = true;
  }
  clear() { for (let i = 0; i < this.items.length; i++) { this.items[i].life = 0; this.mesh.setMatrixAt(i, ZERO); } this.mesh.instanceMatrix.needsUpdate = true; }
}

interface Timed { obj: THREE.Object3D; life: number; max: number; kind: 'flash' | 'tracer' | 'smoke' | 'boom' }

export class Vfx {
  private chipPool: ParticlePool;
  private debris: ParticlePool;
  private shells: ParticlePool;
  private tracers: THREE.InstancedMesh;
  private tracerLife: number[] = [];
  private tracerNext = 0;
  private decals: THREE.InstancedMesh;
  private decalNext = 0;
  private flashes: Timed[] = [];
  private smokes: Timed[] = [];
  private booms: Timed[] = [];
  private light: THREE.PointLight | null = null;
  private lightT = 0;
  // kepulan debu benturan peluru (Points, atribut per titik diperbarui CPU saat aktif)
  private puffs: THREE.Points;
  private puffLife: Float32Array;
  private puffVel: Float32Array;
  private puffNext = 0;

  constructor(private scene: THREE.Scene, private preset: Preset, high: boolean) {
    const lam = (c: number) => new THREE.MeshLambertMaterial({ color: c });
    this.chipPool = new ParticlePool(scene, new THREE.BoxGeometry(X.chipSize, X.chipSize, X.chipSize), lam(0xffffff), X.chipPool, -18);
    this.debris = new ParticlePool(scene, new THREE.BoxGeometry(1, 1, 1), lam(0xffffff), Math.max(16, preset.debris * 2), -22, 0x5a4a3a);
    this.shells = new ParticlePool(scene, new THREE.BoxGeometry(...X.shellSize), lam(0xc9a227), X.shellPool, -22, 0xc9a227);
    // tracer: balok tipis aditif kuning
    const tg = new THREE.BoxGeometry(X.tracerSize, X.tracerSize, 1); tg.translate(0, 0, -0.5);
    this.tracers = new THREE.InstancedMesh(tg, new THREE.MeshBasicMaterial({ color: 0xffe066, transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false }), X.tracerPool);
    this.tracers.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.tracers.frustumCulled = false;
    for (let i = 0; i < X.tracerPool; i++) { this.tracers.setMatrixAt(i, ZERO); this.tracerLife.push(0); }
    scene.add(this.tracers);
    // decal lubang peluru (FIFO sesuai preset)
    const dg = new THREE.PlaneGeometry(X.decalSize, X.decalSize);
    this.decals = new THREE.InstancedMesh(dg, new THREE.MeshLambertMaterial({ color: 0x1a1410, polygonOffset: true,
      polygonOffsetFactor: -2, polygonOffsetUnits: -2, transparent: true, opacity: 0.85 }), preset.decals);
    this.decals.frustumCulled = false;
    for (let i = 0; i < preset.decals; i++) this.decals.setMatrixAt(i, ZERO);
    scene.add(this.decals);
    // muzzle flash dunia: 2 quad silang aditif + balok emissive
    const fm = new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    for (let i = 0; i < 10; i++) {
      const g = new THREE.Group();
      const q1 = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.7), fm); const q2 = q1.clone(); q2.rotation.y = Math.PI / 2;
      const core = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 0.3), new THREE.MeshBasicMaterial({ color: 0xfff0a0 }));
      g.add(q1, q2, core); g.visible = false; scene.add(g);
      this.flashes.push({ obj: g, life: 0, max: X.muzzleTime, kind: 'flash' });
    }
    if (high) { this.light = new THREE.PointLight(0xffb347, 0, X.muzzleLightDist); scene.add(this.light); }
    // asap ledakan: kubus transparan (8 per ledakan)
    const sg = new THREE.BoxGeometry(1, 1, 1);
    for (let i = 0; i < 24; i++) {
      const m = new THREE.Mesh(sg, new THREE.MeshLambertMaterial({ color: 0x8a8580, transparent: true, opacity: 0.6, depthWrite: false }));
      m.visible = false; scene.add(m);
      this.smokes.push({ obj: m, life: 0, max: XCFG.explosion.smokeLife, kind: 'smoke' });
    }
    // kepulan debu benturan: 1 draw call, ukuran & kepekatan per titik
    const PF = XCFG.gfx.puff, pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(PF.pool * 3).fill(-999), 3));
    pg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(PF.pool * 3), 3));
    pg.setAttribute('aT', new THREE.BufferAttribute(new Float32Array(PF.pool).fill(1), 1));
    this.puffLife = new Float32Array(PF.pool); this.puffVel = new Float32Array(PF.pool * 3);
    this.puffs = new THREE.Points(pg, new THREE.ShaderMaterial({
      uniforms: { uS0: { value: PF.size0 }, uS1: { value: PF.size1 }, uA: { value: PF.alpha }, uScale: { value: 700 } },
      vertexShader: /* glsl */ `
        attribute float aT; attribute vec3 color; uniform float uS0, uS1, uScale; varying float vT; varying vec3 vC;
        void main() {
          vT = aT; vC = color;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = mix(uS0, uS1, sqrt(aT)) * uScale / max(0.5, -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uA; varying float vT; varying vec3 vC;
        void main() {
          if (vT >= 1.0) discard;
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.1, d) * uA * (1.0 - vT) * (1.0 - vT);
          gl_FragColor = vec4(vC, a);
        }`,
      transparent: true, depthWrite: false,
    }));
    this.puffs.frustumCulled = false;
    scene.add(this.puffs);
    for (let i = 0; i < 3; i++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true,
        blending: THREE.AdditiveBlending, depthWrite: false }));
      m.visible = false; scene.add(m);
      this.booms.push({ obj: m, life: 0, max: XCFG.explosion.flash, kind: 'boom' });
    }
  }

  muzzleFlash(pos: THREE.Vector3, dir: THREE.Vector3) {
    const f = this.flashes.find(x => x.life <= 0) ?? this.flashes[0];
    f.obj.position.copy(pos);
    f.obj.quaternion.setFromUnitVectors(Z_AXIS, _a.copy(dir).negate());
    f.obj.rotateZ(Math.random() * Math.PI);
    f.obj.visible = true; f.life = Math.max(X.muzzleTime, 1 / 60);
    this.flashLight(pos);
  }

  /** Kilat cahaya moncong ke sekitar (HIGH+) — juga untuk tembakan FPS pemain (viewmodel tidak punya lampu dunia). */
  flashLight(pos: THREE.Vector3) {
    if (this.light) { this.light.position.copy(pos); this.light.intensity = X.muzzleLightIntensity; this.lightT = X.muzzleTime; }
  }

  /** Kepulan debu lembut di titik benturan, warna mengikuti permukaan. */
  puff(point: THREE.Vector3, normal: THREE.Vector3, color: number) {
    const P = XCFG.gfx.puff, i = this.puffNext;
    this.puffNext = (this.puffNext + 1) % P.pool;
    const g = this.puffs.geometry, pos = g.attributes.position as THREE.BufferAttribute, col = g.attributes.color as THREE.BufferAttribute;
    pos.setXYZ(i, point.x + normal.x * 0.12, point.y + normal.y * 0.12, point.z + normal.z * 0.12);
    _c.setHex(color, THREE.SRGBColorSpace).lerp(_c2.setRGB(0.62, 0.58, 0.52), 0.55);
    col.setXYZ(i, _c.r, _c.g, _c.b);
    this.puffVel[i * 3] = normal.x * 0.9; this.puffVel[i * 3 + 1] = normal.y * 0.9 + P.rise; this.puffVel[i * 3 + 2] = normal.z * 0.9;
    this.puffLife[i] = P.life;
    pos.needsUpdate = true; col.needsUpdate = true;
  }

  tracer(from: THREE.Vector3, to: THREE.Vector3) {
    const i = this.tracerNext; this.tracerNext = (this.tracerNext + 1) % this.tracerLife.length;
    const len = from.distanceTo(to);
    if (len < 0.5) return;
    _q.setFromUnitVectors(Z_AXIS, _a.copy(from).sub(to).normalize());
    this.tracers.setMatrixAt(i, _m.compose(from, _q, _s.set(1, 1, len)));
    this.tracers.instanceMatrix.needsUpdate = true;
    this.tracerLife[i] = X.tracerTime;
  }

  /** Selongsong dari ejectPort: kanan 2.5 u/s + atas 1.5 u/s + acak; 2 pantulan, umur 1.2 s. */
  shell(e: Entity, fpsView: boolean) {
    const p = this.shells.spawn();
    if (fpsView) return; // viewmodel FPS: selongsong dunia tidak perlu terlihat dari mata
    const m = weaponModel(e.loadout.weapon, e.loadout.scope === 'iron');
    e.worldGun.localToWorld(p.pos.copy(m.ejectPort));
    const ry = e.yaw;
    p.vel.set(Math.cos(ry) * X.shellRight + (Math.random() - 0.5), X.shellUp + Math.random(), -Math.sin(ry) * X.shellRight + (Math.random() - 0.5));
    p.spin.set(Math.random() * 20, Math.random() * 20, 0); p.size = 1; p.life = X.shellLife; p.max = X.shellLife;
    const d = physics.raycast(p.pos, { x: 0, y: -1, z: 0 }, 12, QUERY.LOS);
    p.floor = d >= 0 ? p.pos.y - d + 0.04 : p.pos.y - 12;
  }

  decal(point: THREE.Vector3, normal: THREE.Vector3) {
    const i = this.decalNext; this.decalNext = (this.decalNext + 1) % this.decals.count;
    _p.copy(point).addScaledVector(normal, X.decalOffset);
    _q.setFromUnitVectors(Z_AXIS, normal);
    _q.multiply(new THREE.Quaternion().setFromAxisAngle(Z_AXIS, Math.random() * Math.PI));
    this.decals.setMatrixAt(i, _m.compose(_p, _q, _s.setScalar(0.8 + Math.random() * 0.4)));
    this.decals.instanceMatrix.needsUpdate = true;
  }

  chips(point: THREE.Vector3, normal: THREE.Vector3, color: number, n: number) {
    for (let k = 0; k < n; k++) {
      const p = this.chipPool.spawn(color);
      p.pos.copy(point).addScaledVector(normal, 0.05);
      p.vel.copy(normal).multiplyScalar(2 + Math.random() * 3).add(_a.set(Math.random() - 0.5, Math.random() * 1.5, Math.random() - 0.5).multiplyScalar(2.5));
      p.spin.set(Math.random() * 15, Math.random() * 15, Math.random() * 15);
      p.size = 1; p.life = X.chipLife; p.max = X.chipLife; p.floor = point.y - 3;
    }
  }

  /** Hit pada karakter: kilat emissive 0.06 s + 6 serpihan warna bagian tersebut. */
  bodyHit(point: THREE.Vector3, victim: Entity, part: PartKey) {
    if (part) victim.char.flash(part);
    this.chips(point, _b.set(0, 1, 0), part ? victim.char.colors[part] : 0xffffff, X.hitChips);
  }

  explosion(c: THREE.Vector3) {
    const b = this.booms.find(x => x.life <= 0) ?? this.booms[0];
    b.obj.position.copy(c); b.obj.scale.setScalar(0.5); b.obj.visible = true; b.life = b.max;
    for (let k = 0; k < this.preset.debris; k++) {
      const p = this.debris.spawn(Math.random() < 0.5 ? 0x5a4a3a : 0x3a3430);
      p.pos.copy(c); p.vel.set(Math.random() - 0.5, Math.random() * 0.9 + 0.2, Math.random() - 0.5).normalize().multiplyScalar(6 + Math.random() * 10);
      p.spin.set(Math.random() * 10, Math.random() * 10, Math.random() * 10);
      p.size = XCFG.explosion.debrisMin + Math.random() * (XCFG.explosion.debrisMax - XCFG.explosion.debrisMin);
      p.life = XCFG.explosion.debrisLife; p.max = p.life; p.floor = c.y - 8;
      const d = physics.raycast(c, { x: 0, y: -1, z: 0 }, 12, QUERY.LOS);
      if (d >= 0) p.floor = c.y - d + p.size / 2;
    }
    let n = 0;
    for (const s of this.smokes) {
      if (s.life > 0) continue;
      s.obj.position.set(c.x + (Math.random() - 0.5) * 2, c.y + Math.random() * 1.5, c.z + (Math.random() - 0.5) * 2);
      s.obj.rotation.set(Math.random(), Math.random(), Math.random());
      s.obj.scale.setScalar(0.8); s.obj.visible = true; s.life = s.max;
      if (++n >= XCFG.explosion.smokeCount) break;
    }
    if (this.light) { this.light.position.copy(c); this.light.intensity = 12; this.light.distance = 24; this.lightT = 0.12; }
  }

  /** Skala ukuran titik (piksel per unit pada jarak 1) — dari tinggi buffer & FOV kamera. */
  setViewScale(s: number) { (this.puffs.material as THREE.ShaderMaterial).uniforms.uScale.value = s; }

  update(dt: number) {
    this.chipPool.update(dt); this.debris.update(dt); this.shells.update(dt, true);
    // kepulan debu: mengembang, naik pelan, memudar
    const PF = XCFG.gfx.puff, pg = this.puffs.geometry;
    let pdirty = false;
    for (let i = 0; i < PF.pool; i++) {
      if (this.puffLife[i] <= 0) continue;
      this.puffLife[i] -= dt; pdirty = true;
      const pos = pg.attributes.position as THREE.BufferAttribute, k = Math.exp(-3 * dt);
      pos.setXYZ(i, pos.getX(i) + this.puffVel[i * 3] * dt, pos.getY(i) + this.puffVel[i * 3 + 1] * dt, pos.getZ(i) + this.puffVel[i * 3 + 2] * dt);
      this.puffVel[i * 3] *= k; this.puffVel[i * 3 + 2] *= k;
      (pg.attributes.aT as THREE.BufferAttribute).setX(i, this.puffLife[i] <= 0 ? 1 : 1 - this.puffLife[i] / PF.life);
    }
    if (pdirty) { pg.attributes.position.needsUpdate = true; pg.attributes.aT.needsUpdate = true; }
    let tdirty = false;
    for (let i = 0; i < this.tracerLife.length; i++) {
      if (this.tracerLife[i] <= 0) continue;
      this.tracerLife[i] -= dt;
      if (this.tracerLife[i] <= 0) { this.tracers.setMatrixAt(i, ZERO); tdirty = true; }
    }
    if (tdirty) this.tracers.instanceMatrix.needsUpdate = true;
    for (const f of this.flashes) if (f.life > 0) { f.life -= dt; if (f.life <= 0) f.obj.visible = false; }
    for (const s of this.smokes) if (s.life > 0) {
      s.life -= dt;
      const k = 1 - s.life / s.max;
      s.obj.scale.setScalar(0.8 + k * 2.6); s.obj.position.y += dt * 0.8;
      ((s.obj as THREE.Mesh).material as THREE.MeshLambertMaterial).opacity = 0.6 * (1 - k);
      if (s.life <= 0) s.obj.visible = false;
    }
    for (const b of this.booms) if (b.life > 0) {
      b.life -= dt;
      const k = 1 - b.life / b.max;
      b.obj.scale.setScalar(0.5 + k * 3.5);
      ((b.obj as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 1 - k;
      if (b.life <= 0) b.obj.visible = false;
    }
    if (this.light && this.lightT > 0) { this.lightT -= dt; if (this.lightT <= 0) { this.light.intensity = 0; this.light.distance = X.muzzleLightDist; } }
  }

  clear() {
    this.chipPool.clear(); this.debris.clear(); this.shells.clear();
    for (let i = 0; i < this.decals.count; i++) this.decals.setMatrixAt(i, ZERO);
    this.decals.instanceMatrix.needsUpdate = true;
    for (let i = 0; i < this.tracerLife.length; i++) { this.tracerLife[i] = 0; this.tracers.setMatrixAt(i, ZERO); }
    this.tracers.instanceMatrix.needsUpdate = true;
  }

  get activeParticles() { return 0; }
  get _unused() { return Y_AXIS; }
}
