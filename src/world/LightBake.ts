// src/world/LightBake.ts — pencahayaan map statis yang "dipanggang" saat loading (tanpa biaya saat main), permintaan pengguna
// "grafik lebih realistis & pencahayaan lebih real" (gaya blocky tetap):
//   • AO      : oklusi lokal dari grid okupansi 0.5 u (sudut, kolong rak, bawah balkon jadi gelap alami)
//   • langit  : cahaya hari difus yang masuk lewat skylight & jendela, menyebar lewat udara (jarak geodesik 26-tetangga, grid 1 u)
//   • pantul  : cahaya hangat dari bercak lantai/permukaan yang kena matahari lewat skylight (arah matahari §4.7)
// Disimpan per verteks (atribut `bake` = ao, langit, pantul). Shader map HANYA memodulasi cahaya tidak langsung (hemisphere + IBL)
// → matahari & bayangannya tetap dinamis. Grid cahaya juga jadi "light probe" karakter (gelap di arsip, terang di bawah skylight).
import * as THREE from 'three';
import { XCFG } from '../config/extraConfig';
import { BOXES, SKYLIGHTS, STAIRS, WINDOWS } from './MapData';

const GB = XCFG.gfx.bake;
const BX0 = -31, BY0 = -1.5, BZ0 = -51, BX1 = 31, BY1 = 30, BZ1 = 51;
/** Arah datang cahaya matahari (dari posisi matahari 40, 55, 0 ke titik asal). */
const SUN_DIR = new THREE.Vector3(-40, -55, 0).normalize();

class Grid<T extends Uint8Array | Float32Array> {
  readonly nx: number; readonly ny: number; readonly nz: number;
  readonly d: T;
  constructor(readonly c: number, make: (n: number) => T) {
    this.nx = Math.ceil((BX1 - BX0) / c); this.ny = Math.ceil((BY1 - BY0) / c); this.nz = Math.ceil((BZ1 - BZ0) / c);
    this.d = make(this.nx * this.ny * this.nz);
  }
  idx(i: number, j: number, k: number) { return (k * this.ny + j) * this.nx + i; }
  inside(i: number, j: number, k: number) { return i >= 0 && j >= 0 && k >= 0 && i < this.nx && j < this.ny && k < this.nz; }
  ci(x: number) { return Math.floor((x - BX0) / this.c); }
  cj(y: number) { return Math.floor((y - BY0) / this.c); }
  ck(z: number) { return Math.floor((z - BZ0) / this.c); }
}

const inHole = (x: number, z: number) => SKYLIGHTS.some(s => Math.abs(x - s.x) < s.size / 2 && Math.abs(z - s.z) < s.size / 2);

/** Grid okupansi halus dari manifest balok (+ ramp tangga); plafon berlubang di skylight. */
function occupancy(): Grid<Uint8Array> {
  const g = new Grid(GB.aoCell, n => new Uint8Array(n));
  const fill = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, skipHoles = false) => {
    const e = 0.01, c = g.c;
    const i0 = Math.max(0, g.ci(x0 + e)), i1 = Math.min(g.nx - 1, g.ci(x1 - e));
    const j0 = Math.max(0, g.cj(y0 + e)), j1 = Math.min(g.ny - 1, g.cj(y1 - e));
    const k0 = Math.max(0, g.ck(z0 + e)), k1 = Math.min(g.nz - 1, g.ck(z1 - e));
    for (let k = k0; k <= k1; k++) for (let i = i0; i <= i1; i++) {
      if (skipHoles && inHole(BX0 + (i + 0.5) * c, BZ0 + (k + 0.5) * c)) continue;
      for (let j = j0; j <= j1; j++) g.d[g.idx(i, j, k)] = 1;
    }
  };
  for (const b of BOXES) fill(b.min[0], b.min[1], b.min[2], b.max[0], b.max[1], b.max[2], b.id === 'CEILING');
  for (const s of STAIRS) {                     // ramp: padat di bawah permukaan miring
    const len = Math.abs(s.zTop - s.zFoot), zMin = Math.min(s.zFoot, s.zTop), zMax = Math.max(s.zFoot, s.zTop);
    for (let k = g.ck(zMin); k <= g.ck(zMax); k++) {
      const z = BZ0 + (k + 0.5) * g.c, top = 10 * Math.min(1, Math.abs(z - s.zFoot) / len);
      fill(s.x[0], 0, z - g.c / 2, s.x[1], top, z + g.c / 2);
    }
  }
  return g;
}

/** Grid kasar (1 u) padat bila ≥ separuh sub-sel halus padat (dinding tipis tetap menghalangi; pagar tidak). */
function coarseSolid(fine: Grid<Uint8Array>): Grid<Uint8Array> {
  const g = new Grid(GB.cell, n => new Uint8Array(n)), r = Math.round(GB.cell / GB.aoCell);
  for (let k = 0; k < g.nz; k++) for (let j = 0; j < g.ny; j++) for (let i = 0; i < g.nx; i++) {
    let n = 0;
    for (let a = 0; a < r; a++) for (let b = 0; b < r; b++) for (let cc = 0; cc < r; cc++) {
      const fi = i * r + a, fj = j * r + b, fk = k * r + cc;
      if (fine.inside(fi, fj, fk) && fine.d[fine.idx(fi, fj, fk)]) n++;
    }
    g.d[g.idx(i, j, k)] = n * 2 >= r * r * r ? 1 : 0;
  }
  return g;
}

// 26 tetangga + bobot jarak (×10: 10 / 14 / 17)
const NB: [number, number, number, number][] = [];
for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) {
  if (!a && !b && !c) continue;
  const m = Math.abs(a) + Math.abs(b) + Math.abs(c);
  NB.push([a, b, c, m === 1 ? 10 : m === 2 ? 14 : 17]);
}

/**
 * Medan cahaya: jarak geodesik lewat udara dari sumber → nilai = kuat_sumber · exp(−d/λ). Dijkstra berbucket (bobot bulat).
 * sources: [indeks sel, kekuatan 0..1].
 */
function propagate(solid: Grid<Uint8Array>, sources: [number, number][], lambda: number): Float32Array {
  const n = solid.d.length, dist = new Float32Array(n).fill(Infinity);
  const scale = 10 / solid.c, maxD = Math.ceil(4 * lambda * scale);
  const buckets: number[][] = [];
  const push = (d: number, i: number) => { (buckets[d] ??= []).push(i); };
  for (const [i, v] of sources) {
    const d0 = Math.max(0, Math.round(-lambda * Math.log(Math.max(0.02, v)) * scale));
    if (d0 < dist[i]) { dist[i] = d0; push(d0, i); }
  }
  const { nx, ny } = solid;
  for (let d = 0; d <= maxD; d++) {
    const list = buckets[d];
    if (!list) continue;
    for (let q = 0; q < list.length; q++) {
      const id = list[q];
      if (dist[id] !== d) continue;
      const i = id % nx, j = Math.floor(id / nx) % ny, k = Math.floor(id / (nx * ny));
      for (const [a, b, c, w] of NB) {
        const ii = i + a, jj = j + b, kk = k + c;
        if (!solid.inside(ii, jj, kk)) continue;
        const nid = solid.idx(ii, jj, kk);
        if (solid.d[nid]) continue;
        const nd = d + w;
        if (nd < dist[nid] && nd <= maxD) { dist[nid] = nd; push(nd, nid); }
      }
    }
    buckets[d] = undefined as unknown as number[];
  }
  const out = new Float32Array(n), inv = 1 / (lambda * scale);
  for (let i = 0; i < n; i++) out[i] = dist[i] === Infinity ? 0 : Math.exp(-dist[i] * inv);
  return out;
}

export interface LightSample { sky: number; bounce: number }

/** Hasil bake: grid cahaya (probe) + fungsi pemanggang geometri. */
export class LightField {
  private fine: Grid<Uint8Array>;
  private solid: Grid<Uint8Array>;
  private sky: Float32Array;
  private bounce: Float32Array;
  readonly ms: number;

  constructor() {
    const t0 = performance.now();
    this.fine = occupancy();
    this.solid = coarseSolid(this.fine);
    const s = this.solid;
    // sumber langit: tepat di bawah lubang skylight + di depan jendela tinggi
    const sky: [number, number][] = [];
    const jTop = s.cj(27.5);
    for (const L of SKYLIGHTS) for (let x = L.x - L.size / 2 + 0.5; x < L.x + L.size / 2; x += s.c)
      for (let z = L.z - L.size / 2 + 0.5; z < L.z + L.size / 2; z += s.c) {
        const i = s.ci(x), k = s.ck(z);
        for (let j = jTop - 1; j <= jTop; j++) if (s.inside(i, j, k) && !s.d[s.idx(i, j, k)]) sky.push([s.idx(i, j, k), 1]);
      }
    for (const w of WINDOWS) for (let y = w.y[0]; y <= w.y[1]; y += s.c) for (let z = w.z - w.width / 2; z <= w.z + w.width / 2; z += s.c) {
      const i = s.ci(w.x < 0 ? -29.4 : 29.4), j = s.cj(y), k = s.ck(z);
      if (s.inside(i, j, k) && !s.d[s.idx(i, j, k)]) sky.push([s.idx(i, j, k), GB.windowSky]);
    }
    this.sky = propagate(s, sky, GB.skyLambda);
    // sumber pantul: titik jatuh sinar matahari yang masuk lewat skylight (sel udara tepat sebelum menabrak permukaan)
    const bounce: [number, number][] = [];
    const f = this.fine, p = new THREE.Vector3(), q = new THREE.Vector3();
    for (const L of SKYLIGHTS) for (let x = L.x - L.size / 2 + 0.25; x < L.x + L.size / 2; x += 0.5)
      for (let z = L.z - L.size / 2 + 0.25; z < L.z + L.size / 2; z += 0.5) {
        p.set(x, 27.9, z);
        for (let t = 0; t < 80; t += 0.35) {
          q.copy(p).addScaledVector(SUN_DIR, t);
          const i = f.ci(q.x), j = f.cj(q.y), k = f.ck(q.z);
          if (!f.inside(i, j, k)) break;
          if (f.d[f.idx(i, j, k)]) {
            q.addScaledVector(SUN_DIR, -0.6);
            const ci = s.ci(q.x), cj = s.cj(q.y), ck = s.ck(q.z);
            if (s.inside(ci, cj, ck) && !s.d[s.idx(ci, cj, ck)]) bounce.push([s.idx(ci, cj, ck), 1]);
            break;
          }
        }
      }
    this.bounce = propagate(s, bounce, GB.bounceLambda);
    this.ms = performance.now() - t0;
  }

  /** Interpolasi trilinear medan kasar di titik (sel padat diabaikan & bobot dinormalkan). */
  sample(x: number, y: number, z: number, out: LightSample): LightSample {
    const s = this.solid, c = s.c;
    const fx = (x - BX0) / c - 0.5, fy = (y - BY0) / c - 0.5, fz = (z - BZ0) / c - 0.5;
    const i0 = Math.floor(fx), j0 = Math.floor(fy), k0 = Math.floor(fz), tx = fx - i0, ty = fy - j0, tz = fz - k0;
    let w = 0, sk = 0, bo = 0;
    for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) for (let cc = 0; cc < 2; cc++) {
      const i = i0 + a, j = j0 + b, k = k0 + cc;
      if (!s.inside(i, j, k)) continue;
      const id = s.idx(i, j, k);
      if (s.d[id]) continue;
      const ww = (a ? tx : 1 - tx) * (b ? ty : 1 - ty) * (cc ? tz : 1 - tz);
      w += ww; sk += ww * this.sky[id]; bo += ww * this.bounce[id];
    }
    out.sky = w > 1e-4 ? sk / w : 0; out.bounce = w > 1e-4 ? bo / w : 0;
    return out;
  }

  /** AO verteks: fraksi sampel padat di setengah bola sekitar normal (grid halus 0.5 u), dekat lebih berbobot. */
  private ao(px: number, py: number, pz: number, nx: number, ny: number, nz: number): number {
    const f = this.fine;
    // basis tangen (normal map statis kebanyakan searah sumbu)
    let tx = 0, ty = 1, tz = 0;
    if (Math.abs(ny) > 0.9) { tx = 1; ty = 0; }
    const bx = ny * tz - nz * ty, by = nz * tx - nx * tz, bz = nx * ty - ny * tx;
    const ux = by * nz - bz * ny, uy = bz * nx - bx * nz, uz = bx * ny - by * nx;   // u ⟂ n, b
    let occ = 0, wsum = 0;
    for (const r of AO_R) for (const [a, b, h] of AO_DIR) {
      const dx = (ux * a + bx * b) + nx * h, dy = (uy * a + by * b) + ny * h, dz = (uz * a + bz * b) + nz * h;
      const x = px + nx * 0.12 + dx * r, y = py + ny * 0.12 + dy * r, z = pz + nz * 0.12 + dz * r;
      const i = f.ci(x), j = f.cj(y), k = f.ck(z), w = 1 / r;
      wsum += w;
      if (f.inside(i, j, k) && f.d[f.idx(i, j, k)]) occ += w;
    }
    return 1 - GB.aoStrength * (occ / wsum);
  }

  /** Tambahkan atribut `bake` (ao, langit, pantul) ke geometri statis (posisi/normal dunia). */
  bakeGeometry(geo: THREE.BufferGeometry) {
    const p = geo.attributes.position, n = geo.attributes.normal, out = new Float32Array(p.count * 3), ls: LightSample = { sky: 0, bounce: 0 };
    for (let v = 0; v < p.count; v++) {
      const x = p.getX(v), y = p.getY(v), z = p.getZ(v), nx = n.getX(v), ny = n.getY(v), nz = n.getZ(v);
      this.sample(x + nx * 0.6, y + ny * 0.6, z + nz * 0.6, ls);
      out[v * 3] = this.ao(x, y, z, nx, ny, nz); out[v * 3 + 1] = ls.sky; out[v * 3 + 2] = ls.bounce;
    }
    geo.setAttribute('bake', new THREE.BufferAttribute(out, 3));
  }
}

// arah sampel AO: (a, b) di bidang tangen, h ke arah normal — setengah bola condong ke samping (sudut lebih terasa)
const AO_DIR: [number, number, number][] = [
  [1, 0, 0.35], [-1, 0, 0.35], [0, 1, 0.35], [0, -1, 0.35], [0.7, 0.7, 0.5], [-0.7, 0.7, 0.5], [0.7, -0.7, 0.5], [-0.7, -0.7, 0.5],
  [0, 0, 1], [0.5, 0, 0.85], [-0.5, 0, 0.85], [0, 0.5, 0.85],
].map(([a, b, h]) => { const l = Math.hypot(a, b, h); return [a / l, b / l, h / l] as [number, number, number]; });
const AO_R = [0.45, 0.9, 1.6];

/** Uniform bersama shader bake (bisa disetel langsung, mis. dari panel debug). */
export const BAKE_UNIFORMS = {
  uAmbMin: { value: GB.ambMin as number },
  uBounce: { value: new THREE.Color(GB.bounceColor).multiplyScalar(GB.bounceStrength) },
  uAODirect: { value: GB.aoDirect as number },
};

/** Salinan material yang memodulasi cahaya tidak langsung dengan atribut `bake` (geometri WAJIB punya atribut itu). */
export function bakedMaterial<T extends THREE.Material>(m: T): T {
  const c = m.clone() as T;
  c.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, BAKE_UNIFORMS);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 bake;\nvarying vec3 vBake;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvBake = bake;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vBake;\nuniform float uAmbMin;\nuniform vec3 uBounce;\nuniform float uAODirect;')
      .replace('#include <aomap_fragment>', `#include <aomap_fragment>
	float bAO = vBake.x;
	reflectedLight.indirectDiffuse *= bAO * ( uAmbMin + ( 1.0 - uAmbMin ) * vBake.y );
	reflectedLight.indirectDiffuse += diffuseColor.rgb * uBounce * vBake.z * bAO;
	reflectedLight.indirectSpecular *= bAO * ( 0.3 + 0.7 * vBake.y );
	reflectedLight.directDiffuse *= mix( 1.0, bAO, uAODirect );`);
  };
  c.customProgramCacheKey = () => 'baked-v1';
  return c;
}
