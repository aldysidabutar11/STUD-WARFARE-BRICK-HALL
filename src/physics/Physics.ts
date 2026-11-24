// src/physics/Physics.ts — world Rapier + helper query (raycast, LOS, sphere cast)
import RAPIER from '@dimforge/rapier3d-compat';
import { CFG } from '../config/gameConfig';
import { QUERY } from './groups';
// map aktif lewat modul daun `current` (BUKAN registry): registry → builder map → Physics akan membentuk import melingkar
import { currentMap } from '../world/maps/current';
import type { SurfaceMaterial } from '../core/EventBus';

export { RAPIER };

export interface V3 { x: number; y: number; z: number }

class PhysicsWorld {
  world!: RAPIER.World;
  /** Collider lantai aula Brick Hall (langkah kaki 'tile'); −1 = tidak ada (map lain memakai surfaceAt map aktif). */
  groundHandle = -1;
  private ray!: RAPIER.Ray;
  private ball!: RAPIER.Ball;
  private rot = { x: 0, y: 0, z: 0, w: 1 };
  private zero = { x: 0, y: 0, z: 0 };

  async init() {
    await RAPIER.init();
    this.world = new RAPIER.World({ x: 0, y: CFG.world.gravity, z: 0 });
    this.world.timestep = CFG.world.fixedStep;
    this.ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });
    this.ball = new RAPIER.Ball(CFG.camera.springRadius);
  }

  /** Raycast ke STATIC (atau grup lain). Mengembalikan jarak tumbukan atau -1. */
  raycast(o: V3, d: V3, max: number, groups: number = QUERY.LOS): number {
    const r = this.ray;
    r.origin.x = o.x; r.origin.y = o.y; r.origin.z = o.z;
    r.dir.x = d.x; r.dir.y = d.y; r.dir.z = d.z;
    const hit = this.world.castRay(r, max, true, undefined, groups);
    return hit ? hit.timeOfImpact : -1;
  }

  /** Raycast dengan normal. */
  raycastNormal(o: V3, d: V3, max: number, groups: number) {
    const r = this.ray;
    r.origin.x = o.x; r.origin.y = o.y; r.origin.z = o.z;
    r.dir.x = d.x; r.dir.y = d.y; r.dir.z = d.z;
    return this.world.castRayAndGetNormal(r, max, true, undefined, groups);
  }

  /** true bila garis a→b terhalang STATIC (Q_LOS). */
  losBlocked(ax: number, ay: number, az: number, bx: number, by: number, bz: number): boolean {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-4) return false;
    const r = this.ray;
    r.origin.x = ax; r.origin.y = ay; r.origin.z = az;
    r.dir.x = dx / len; r.dir.y = dy / len; r.dir.z = dz / len;
    return this.world.castRay(r, len, true, undefined, QUERY.LOS) !== null;
  }

  /** Sphere cast (spring arm TPS). Mengembalikan jarak atau -1. */
  sphereCast(o: V3, d: V3, radius: number, max: number, groups: number = QUERY.CAMERA): number {
    if (this.ball.radius !== radius) this.ball = new RAPIER.Ball(radius);
    const vel = { x: d.x, y: d.y, z: d.z };
    const hit = this.world.castShape(o, this.rot, vel, this.ball, 0, max, true, undefined, groups);
    return hit ? hit.time_of_impact : -1;
  }

  /** Material permukaan di bawah titik (langkah kaki §10.6). */
  surfaceBelow(x: number, y: number, z: number): SurfaceMaterial {
    const r = this.ray;
    r.origin.x = x; r.origin.y = y + 0.3; r.origin.z = z;
    r.dir.x = 0; r.dir.y = -1; r.dir.z = 0;
    const hit = this.world.castRay(r, 0.8, true, undefined, QUERY.LOS);
    if (hit && hit.collider.handle === this.groundHandle) return 'tile';
    return currentMap().surfaceAt(x, y, z);
  }

  get zeroVec() { return this.zero; }
}

export const physics = new PhysicsWorld();
