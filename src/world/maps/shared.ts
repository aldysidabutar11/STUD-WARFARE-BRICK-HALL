// src/world/maps/shared.ts — utilitas bersama builder map: collider statis dari Box[] (mendukung Box.rotY), pelepasan collider,
// dan pelepasan semua sumber daya GPU sebuah grup scene (geometri, material, tekstur, lampu/bayangan). Dipakai Brick Hall &
// Steel Yard agar ganti map tanpa reload tidak membocorkan collider Rapier maupun memori GPU.
import * as THREE from 'three';
import { RAPIER, physics } from '../../physics/Physics';
import { GROUPS } from '../../physics/groups';
import type { Box } from '../MapData';

/** Quaternion putaran θ (radian) terhadap sumbu Y (sama dengan Object3D.rotation.y = θ). */
export const rotYQuat = (theta: number) => ({ x: 0, y: Math.sin(theta / 2), z: 0, w: Math.cos(theta / 2) });

/** Satu collider kotak statis (grup STATIC) dari min/max LOKAL + putaran Y opsional di pusat kotak. */
export function cuboidCollider(min: ArrayLike<number>, max: ArrayLike<number>, rotY = 0): RAPIER.Collider {
  const hx = (max[0] - min[0]) / 2, hy = (max[1] - min[1]) / 2, hz = (max[2] - min[2]) / 2;
  const desc = RAPIER.ColliderDesc.cuboid(hx, hy, hz).setTranslation(min[0] + hx, min[1] + hy, min[2] + hz).setCollisionGroups(GROUPS.STATIC);
  if (rotY) desc.setRotation(rotYQuat(rotY));
  return physics.world.createCollider(desc);
}

/** Collider statis untuk semua balok (termasuk style 'hidden'); kembalikan daftar untuk dilepas di dispose(). */
export function addBoxColliders(boxes: readonly Box[], out: RAPIER.Collider[] = []): RAPIER.Collider[] {
  for (const b of boxes) out.push(cuboidCollider(b.min, b.max, b.rotY ?? 0));
  return out;
}

/** Lepas collider (tanpa membangunkan benda) dan kosongkan daftarnya. Aman dipanggil dua kali. */
export function removeColliders(list: RAPIER.Collider[]) {
  const w = physics.world;
  for (const c of list) if (w.colliders.contains(c.handle)) w.removeCollider(c, false);
  list.length = 0;
}

/** Semua tekstur yang dirujuk material (map, normalMap, envMap, ... dan uniform ShaderMaterial). */
function texturesOf(m: THREE.Material, out: Set<THREE.Texture>) {
  for (const v of Object.values(m)) if (v instanceof THREE.Texture) out.add(v);
  const u = (m as THREE.ShaderMaterial).uniforms;
  if (u) for (const k in u) { const v = u[k]?.value; if (v instanceof THREE.Texture) out.add(v); }
}

/**
 * Lepas pohon objek dari scene dan bebaskan semua geometri, material (+ `extraMaterials`, mis. material asli sebelum disalin
 * bakedMaterial), tekstur, serta lampu (peta bayangan). Tekstur bersama (dipakai beberapa material) dilepas sekali.
 */
export function disposeTree(root: THREE.Object3D, extraMaterials: Iterable<THREE.Material> = []) {
  root.removeFromParent();
  const geos = new Set<THREE.BufferGeometry>(), mats = new Set<THREE.Material>(extraMaterials), texs = new Set<THREE.Texture>();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry) geos.add(m.geometry);
    const mm = m.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mm)) mm.forEach(x => mats.add(x)); else if (mm) mats.add(mm);
    const im = o as THREE.InstancedMesh;
    if (im.isInstancedMesh && im.customDepthMaterial) mats.add(im.customDepthMaterial);
    if ((o as THREE.Light).isLight) (o as THREE.Light).dispose();
  });
  for (const m of mats) { texturesOf(m, texs); m.dispose(); }
  for (const g of geos) g.dispose();
  for (const t of texs) t.dispose();
}
