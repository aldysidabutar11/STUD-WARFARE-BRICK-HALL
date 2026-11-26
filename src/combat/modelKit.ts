// src/combat/modelKit.ts — perkakas model senjata blocky (dipakai WeaponModels & weaponModelsX): balok ber-vertex color yang
// digabung jadi satu geometri (1 draw call). Konvensi ruang model: akar (0,0,0) = genggaman, laras ke −Z, popor ke +Z.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SCOPES } from '../config/weaponsData';

/** Skala model senjata di scene viewmodel (unit model → unit kamera). sightHeight §9.1 / VM_SCALE = tinggi bidik model. */
export const VM_SCALE = 0.25;
/** Tinggi sumbu laras (unit model). */
export const BORE_Y = 0.28;
/** Tinggi garis bidik besi (unit model) = sightHeight iron §9.1 / VM_SCALE. Tidak ada balok senjata lain yang boleh menutupinya. */
export const IRON_Y = SCOPES.iron.sightHeight / VM_SCALE;
/** Puncak rel optik (unit model) — badan optik (opticModel) duduk di sini. */
export const RAIL_Y = 0.38;
export const D2R = THREE.MathUtils.degToRad;

export class Builder {
  geos: THREE.BufferGeometry[] = [];
  private c = new THREE.Color();
  /** Balok dari dua sudut berlawanan; opsional diputar pada sumbu X di sekitar `pivot`. */
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color: number, rotX = 0, pivot?: THREE.Vector3) {
    const g = new THREE.BoxGeometry(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0));
    g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    if (rotX && pivot) {
      g.translate(-pivot.x, -pivot.y, -pivot.z); g.rotateX(rotX); g.translate(pivot.x, pivot.y, pivot.z);
    }
    this.c.setHex(color, THREE.SRGBColorSpace);
    const n = g.attributes.position.count, col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = this.c.r; col[i * 3 + 1] = this.c.g; col[i * 3 + 2] = this.c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.deleteAttribute('uv');
    this.geos.push(g);
  }
  /** Gagang pistol senapan (sama untuk semua senjata panjang): miring 14° di bawah akar. */
  grip(color: number, rakeDeg = 14) {
    this.box(-0.07, -0.42, 0.12, 0.07, 0.13, -0.06, color, D2R(-rakeDeg), new THREE.Vector3(0, 0.1, 0.03));
  }
  /** Pelindung pelatuk (bawah + depan) di depan gagang. */
  guard(color: number, front = -0.3) {
    this.box(-0.025, -0.1, 0.02, 0.025, -0.06, front, color);
    this.box(-0.025, -0.1, front + 0.04, 0.025, 0.12, front, color);
  }
  build() { const g = mergeGeometries(this.geos)!; g.computeBoundingSphere(); return g; }
}

/** Bagian bergerak (viewmodel): pompa / bolt / slide — geometri relatif titik putar `pivot` (ruang model). */
export interface MovingPart {
  kind: 'pump' | 'bolt' | 'slide';
  geometry: THREE.BufferGeometry;
  pivot: THREE.Vector3;
  /** Jarak geser ke belakang (+Z, unit model) saat kokang / hentak. */
  travel: number;
}

export interface WeaponModel {
  /** Geometri lengkap (termasuk bagian bergerak di posisi diam): dunia, pratinjau, drop, killcam. */
  geometry: THREE.BufferGeometry;
  /** Viewmodel: geometri tanpa bagian bergerak (bagian bergerak = mesh anak yang dianimasikan). */
  vmGeometry: THREE.BufferGeometry;
  part: MovingPart | null;
  muzzle: THREE.Vector3; ejectPort: THREE.Vector3; opticMount: THREE.Vector3;
  /** Posisi tangan kiri (handguard / pompa; pistol: menopang tangan kanan) — viewmodel & IK Venny. */
  leftHand: THREE.Vector3;
  pistol: boolean;
  length: number;
}

/** Rakit WeaponModel dari builder dasar + (opsional) builder bagian bergerak. */
export function finish(base: Builder, part: { b: Builder; kind: MovingPart['kind']; pivot: THREE.Vector3; travel: number } | null,
  o: { muzzle: THREE.Vector3; ejectPort: THREE.Vector3; opticMount: THREE.Vector3; leftHand: THREE.Vector3; pistol?: boolean; length: number }): WeaponModel {
  const vmGeometry = base.build();
  let geometry = vmGeometry, mp: MovingPart | null = null;
  if (part) {
    const pg = part.b.build();
    geometry = mergeGeometries([vmGeometry, pg])!; geometry.computeBoundingSphere();
    const local = pg.clone(); local.translate(-part.pivot.x, -part.pivot.y, -part.pivot.z); local.computeBoundingSphere();
    mp = { kind: part.kind, geometry: local, pivot: part.pivot.clone(), travel: part.travel };
  }
  geometry.userData.leftHand = o.leftHand.toArray();
  return { geometry, vmGeometry, part: mp, muzzle: o.muzzle, ejectPort: o.ejectPort, opticMount: o.opticMount, leftHand: o.leftHand,
    pistol: !!o.pistol, length: o.length };
}
