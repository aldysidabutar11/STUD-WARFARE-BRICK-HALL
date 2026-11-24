// src/core/BodyLerp.ts — interpolasi visual benda fisika. Rapier melangkah 60 Hz (fixed step), layar bisa 90/120/144 Hz:
// tanpa interpolasi, benda terbang (granat, balok tubuh, buku, senjata yang dibuang) hanya bergeser di frame yang punya
// fixed step → di layar 90 Hz gerak "2 maju, 1 diam" yang terlihat patah-patah. Pola sama dengan renderPos karakter (GDD §2.6):
// render di antara keadaan step sebelumnya dan sekarang dengan alpha = sisa akumulator / STEP.
import * as THREE from 'three';
import type { RAPIER } from '../physics/Physics';

export class BodyLerp {
  private readonly p0 = new THREE.Vector3();
  private readonly q0 = new THREE.Quaternion();
  /** Keadaan step terakhir (= posisi fisika sekarang). */
  readonly pos = new THREE.Vector3();
  readonly quat = new THREE.Quaternion();

  /** Spawn / teleport: keadaan lama = baru (tanpa "meluncur" dari posisi sebelumnya). */
  snap(b: RAPIER.RigidBody): this { this.read(b); this.p0.copy(this.pos); this.q0.copy(this.quat); return this; }

  snapTo(p: THREE.Vector3, q: THREE.Quaternion): this {
    this.pos.copy(p); this.quat.copy(q); this.p0.copy(p); this.q0.copy(q); return this;
  }

  /** Panggil SETELAH world.step(): keadaan baru jadi target, yang lama jadi titik awal interpolasi. */
  step(b: RAPIER.RigidBody) { this.p0.copy(this.pos); this.q0.copy(this.quat); this.read(b); }

  /** Pose render pada alpha (0 = step sebelumnya, 1 = step terakhir). */
  sample(alpha: number, outP: THREE.Vector3, outQ: THREE.Quaternion) {
    outP.lerpVectors(this.p0, this.pos, alpha);
    outQ.slerpQuaternions(this.q0, this.quat, alpha);
  }

  apply(o: THREE.Object3D, alpha: number) { this.sample(alpha, o.position, o.quaternion); }

  private read(b: RAPIER.RigidBody) {
    const t = b.translation(), r = b.rotation();
    this.pos.set(t.x, t.y, t.z); this.quat.set(r.x, r.y, r.z, r.w);
  }
}
