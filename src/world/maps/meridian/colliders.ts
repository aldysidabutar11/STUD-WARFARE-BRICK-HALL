// src/world/maps/meridian/colliders.ts — collider statis Meridian Vault (tanpa visual; dipakai build.ts & tests/meridian.test.ts):
// balok denah (STATIC) + ramp tangga convexHull (prisma di bawah permukaan miring; bawahnya = tinggi kaki tangga).
import { RAPIER, physics } from '../../../physics/Physics';
import { GROUPS } from '../../../physics/groups';
import { addBoxColliders } from '../shared';
import { stairHullPoints } from '../boston/colliders';
import { MV_BOXES, MV_STAIRS } from './layout';

export function meridianColliders(out: RAPIER.Collider[] = []): RAPIER.Collider[] {
  const w = physics.world;
  addBoxColliders(MV_BOXES, out);
  for (const s of MV_STAIRS) {
    const d = RAPIER.ColliderDesc.convexHull(stairHullPoints(s));
    if (d) out.push(w.createCollider(d.setCollisionGroups(GROUPS.STATIC)));
  }
  return out;
}
