// src/world/maps/arunika/colliders.ts — collider statis Candi Arunika (tanpa visual; dipakai build.ts & tests/arunika.test.ts):
// balok denah (STATIC), ramp tangga convexHull (prisma di bawah permukaan miring), bentuk bulat/miring convexHull (genta stupa, atap
// pelana & joglo — titiknya juga dipakai visual), pembatas tak terlihat di atas tanggul sungai (grup BARRIER: menahan karakter/granat/
// benda lepas, peluru & garis pandang tembus).
import { RAPIER, physics } from '../../../physics/Physics';
import { GROUPS } from '../../../physics/groups';
import { addBoxColliders } from '../shared';
import { stairHullPoints } from '../boston/colliders';
import { AR_BARRIERS, AR_BOXES, AR_HULLS, AR_STAIRS } from './layout';

export function arunikaColliders(out: RAPIER.Collider[] = []): RAPIER.Collider[] {
  const w = physics.world;
  addBoxColliders(AR_BOXES, out);
  for (const s of AR_STAIRS) {
    const d = RAPIER.ColliderDesc.convexHull(stairHullPoints(s));
    if (d) out.push(w.createCollider(d.setCollisionGroups(GROUPS.STATIC)));
  }
  for (const h of AR_HULLS) {
    const d = RAPIER.ColliderDesc.convexHull(new Float32Array(h.pts));
    if (!d) throw new Error(`[arunika] hull gagal: ${h.id}`);
    out.push(w.createCollider(d.setCollisionGroups(GROUPS.STATIC)));
  }
  for (const b of AR_BARRIERS) {
    const hx = (b.max[0] - b.min[0]) / 2, hy = (b.max[1] - b.min[1]) / 2, hz = (b.max[2] - b.min[2]) / 2;
    out.push(w.createCollider(RAPIER.ColliderDesc.cuboid(hx, hy, hz).setTranslation(b.min[0] + hx, b.min[1] + hy, b.min[2] + hz)
      .setCollisionGroups(GROUPS.BARRIER)));
  }
  return out;
}
