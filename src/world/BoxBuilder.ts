// src/world/BoxBuilder.ts — box dengan UV 1 stud per unit (GDD §4.9) + penggabung face per material.
import * as THREE from 'three';

/** Versi GDD §4.9: skala UV per sisi BoxGeometry agar 1 stud = 1 unit (urutan +X −X +Y −Y +Z −Z). */
export function worldUV(geo: THREE.BoxGeometry, w: number, h: number, d: number) {
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  const size: [number, number][] = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let face = 0; face < 6; face++)
    for (let v = 0; v < 4; v++) {
      const i = face * 4 + v;
      uv.setXY(i, uv.getX(i) * size[face][0], uv.getY(i) * size[face][1]);
    }
  uv.needsUpdate = true;
}

/** BoxGeometry siap pakai dengan UV per-unit. */
export function studBox(w: number, h: number, d: number): THREE.BoxGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  worldUV(g, w, h, d);
  return g;
}

/** Satu slot face = material + warna vertex. */
export type Face = [THREE.Material, number];
export interface SlotMats { top: Face; side: Face; bottom: Face }
interface Bucket { pos: number[]; nrm: number[]; uv: number[]; col: number[]; idx: number[] }

const _c = new THREE.Color();

/**
 * Mengumpulkan face dari banyak balok statis lalu me-merge per material (1 draw call per material).
 * Warna disimpan sebagai vertex color sehingga semua balok berwarna cukup 3 material (atas/sisi/bawah).
 * UV dihitung dari koordinat dunia sehingga studs selaras lintas balok yang bersebelahan.
 */
export class MeshBuckets {
  private buckets = new Map<THREE.Material, Bucket>();
  triangles = 0;

  private bucket(m: THREE.Material): Bucket {
    let b = this.buckets.get(m);
    if (!b) { b = { pos: [], nrm: [], uv: [], col: [], idx: [] }; this.buckets.set(m, b); }
    return b;
  }

  /** p = 4 sudut (x,y,z) berurutan CCW dari luar; uv = 4 pasangan. */
  addQuad(f: Face, p: number[], n: [number, number, number], uv: number[]) {
    const b = this.bucket(f[0]);
    const base = b.pos.length / 3;
    _c.setHex(f[1], THREE.SRGBColorSpace);
    for (let i = 0; i < 12; i++) b.pos.push(p[i]);
    for (let i = 0; i < 4; i++) { b.nrm.push(n[0], n[1], n[2]); b.col.push(_c.r, _c.g, _c.b); }
    for (let i = 0; i < 8; i++) b.uv.push(uv[i]);
    b.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    this.triangles += 2;
  }

  addBox(min: ArrayLike<number>, max: ArrayLike<number>, s: SlotMats, skip: { bottom?: boolean; top?: boolean; sides?: boolean } = {}) {
    const [x0, y0, z0] = [min[0], min[1], min[2]], [x1, y1, z1] = [max[0], max[1], max[2]];
    if (!skip.top) this.addQuad(s.top, [x0, y1, z0, x0, y1, z1, x1, y1, z1, x1, y1, z0], [0, 1, 0], [x0, -z0, x0, -z1, x1, -z1, x1, -z0]);
    if (!skip.bottom) this.addQuad(s.bottom, [x0, y0, z0, x1, y0, z0, x1, y0, z1, x0, y0, z1], [0, -1, 0], [x0, z0, x1, z0, x1, z1, x0, z1]);
    if (skip.sides) return;
    this.addQuad(s.side, [x1, y0, z1, x1, y0, z0, x1, y1, z0, x1, y1, z1], [1, 0, 0], [-z1, y0, -z0, y0, -z0, y1, -z1, y1]);
    this.addQuad(s.side, [x0, y0, z0, x0, y0, z1, x0, y1, z1, x0, y1, z0], [-1, 0, 0], [z0, y0, z1, y0, z1, y1, z0, y1]);
    this.addQuad(s.side, [x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1], [0, 0, 1], [x0, y0, x1, y0, x1, y1, x0, y1]);
    this.addQuad(s.side, [x1, y0, z0, x0, y0, z0, x0, y1, z0, x1, y1, z0], [0, 0, -1], [-x1, y0, -x0, y0, -x0, y1, -x1, y1]);
  }

  build(shadows: boolean): THREE.Mesh[] {
    const out: THREE.Mesh[] = [];
    for (const [m, b] of this.buckets) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(b.nrm, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
      g.setAttribute('color', new THREE.Float32BufferAttribute(b.col, 3));
      g.setIndex(b.idx);
      g.computeBoundingSphere();
      const mesh = new THREE.Mesh(g, m);
      const transparent = (m as THREE.MeshLambertMaterial).transparent;
      const emissive = (m as THREE.MeshLambertMaterial).emissiveIntensity > 0 && (m as THREE.MeshLambertMaterial).emissive?.getHex() !== 0;
      mesh.castShadow = shadows && !transparent && !emissive;
      mesh.receiveShadow = shadows && !transparent;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      out.push(mesh);
    }
    return out;
  }
}
