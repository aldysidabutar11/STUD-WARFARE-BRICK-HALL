// src/world/maps/boston/colliders.ts — collider statis Boston (tanpa visual; dipakai build.ts & tests/boston.test.ts):
// balok denah (STATIC), ramp tangga convexHull (prisma di bawah permukaan miring; bawahnya = tinggi kaki tangga), pagar miring
// tipis convexHull, dan pembatas tak terlihat (grup BARRIER: menahan karakter/granat/benda lepas, peluru & garis pandang tembus).
// Panel kaca destruktibel punya collider sendiri (glass.ts) karena bisa dinonaktifkan.
import { RAPIER, physics } from '../../../physics/Physics';
import { GROUPS } from '../../../physics/groups';
import { stairFrame } from '../../MapData';
import { addBoxColliders } from '../shared';
import { BOS_BARRIERS, BOS_BOXES, BOS_SLOPED_RAILS, BOS_STAIRS } from './layout';

/** Titik prisma ramp (6 titik) untuk convexHull. */
export function stairHullPoints(s: (typeof BOS_STAIRS)[number]): Float32Array {
  const f = stairFrame(s);
  if (f.axis === 'z') {
    const [x0, x1] = f.x;
    return new Float32Array([x0, f.y0, f.foot, x1, f.y0, f.foot, x0, f.y0, f.top, x1, f.y0, f.top, x0, f.y1, f.top, x1, f.y1, f.top]);
  }
  const [z0, z1] = f.z;
  return new Float32Array([f.foot, f.y0, z0, f.foot, f.y0, z1, f.top, f.y0, z0, f.top, f.y0, z1, f.top, f.y1, z0, f.top, f.y1, z1]);
}

/** Titik pagar miring: balok tipis (0.15 × 0.2) dari a ke b. */
export function railHullPoints(a: readonly number[], b: readonly number[], hw = 0.075, hh = 0.1): Float32Array {
  const dx = b[0] - a[0], dz = b[2] - a[2], l = Math.hypot(dx, dz) || 1, px = -dz / l * hw, pz = dx / l * hw;
  const out: number[] = [];
  for (const p of [a, b]) for (const s of [-1, 1]) for (const t of [-1, 1]) out.push(p[0] + px * s, p[1] + hh * t, p[2] + pz * s);
  return new Float32Array(out);
}

export function bostonColliders(out: RAPIER.Collider[] = []): RAPIER.Collider[] {
  const w = physics.world;
  addBoxColliders(BOS_BOXES, out);
  for (const s of BOS_STAIRS) {
    const d = RAPIER.ColliderDesc.convexHull(stairHullPoints(s));
    if (d) out.push(w.createCollider(d.setCollisionGroups(GROUPS.STATIC)));
  }
  for (const r of BOS_SLOPED_RAILS) {
    const d = RAPIER.ColliderDesc.convexHull(railHullPoints(r.a, r.b));
    if (d) out.push(w.createCollider(d.setCollisionGroups(GROUPS.STATIC)));
  }
  for (const b of BOS_BARRIERS) {
    const hx = (b.max[0] - b.min[0]) / 2, hy = (b.max[1] - b.min[1]) / 2, hz = (b.max[2] - b.min[2]) / 2;
    out.push(w.createCollider(RAPIER.ColliderDesc.cuboid(hx, hy, hz).setTranslation(b.min[0] + hx, b.min[1] + hy, b.min[2] + hz)
      .setCollisionGroups(GROUPS.BARRIER)));
  }
  return out;
}
