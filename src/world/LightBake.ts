// src/world/LightBake.ts — pencahayaan map statis yang "dipanggang" saat loading (tanpa biaya saat main), permintaan pengguna
// "grafik lebih realistis & pencahayaan lebih real" (gaya blocky tetap):
//   • AO      : oklusi lokal dari grid okupansi 0.5 u (sudut, kolong rak, bawah balkon jadi gelap alami)
//   • langit  : cahaya hari difus yang masuk lewat skylight & jendela, menyebar lewat udara (jarak geodesik 26-tetangga, grid 1 u)
//   • pantul  : cahaya hangat dari bercak lantai/permukaan yang kena matahari lewat skylight (arah matahari §4.7)
// Disimpan per verteks (atribut `bake` = ao, langit, pantul). Shader map HANYA memodulasi cahaya tidak langsung (hemisphere + IBL)
// → matahari & bayangannya tetap dinamis. Grid cahaya juga jadi "light probe" karakter (gelap di arsip, terang di bawah skylight).
// Multi-map: data map lewat BakeSource (balok + OBB rotY, tangga, sumber cahaya). Mode INDOOR (Brick Hall — hasil identik dengan
// versi sebelum multi-map) atau OUTDOOR (langit terbuka: visibilitas langit dari grid okupansi + AO + pantul permukaan yang kena
// matahari).
import * as THREE from 'three';
import { XCFG } from '../config/extraConfig';
import { BOXES, SKYLIGHTS, STAIRS, WINDOWS, boxAabbXZ, stairFrame, type Box, type Stair } from './MapData';

const GB = XCFG.gfx.bake;

/** Data map untuk bake cahaya. Koordinat dunia; sunDir = arah DATANG sinar matahari (dari matahari ke titik). */
export interface BakeSource {
  /** Batas grid bake (sudut min/maks). Di luar grid dianggap udara — beri tepi ±1 u di luar map. */
  min: [number, number, number];
  max: [number, number, number];
  /** Balok padat (rotY didukung: dirasterisasi sebagai OBB). */
  boxes: readonly Box[];
  /** Ramp tangga (padat di bawah permukaan miring). */
  stairs: readonly Stair[];
  sunDir: [number, number, number];
  /** Ruang dalam: cahaya langit hanya masuk lewat lubang skylight di plafon & jendela tinggi (Brick Hall). */
  indoor?: {
    /** Id balok plafon yang dilubangi skylight. */
    ceilingId: string;
    skylights: readonly { x: number; z: number; size: number }[];
    /** Y sel sumber langit di bawah lubang (dua lapis sel: cj(skyY) − 1 … cj(skyY)). */
    skyY: number;
    /** Y awal sinar matahari yang masuk lewat skylight (tepat di bawah plafon). */
    rayY: number;
    /** v = kekuatan sumber (bawaan GB.windowSky). */
    windows: readonly { x: number; z: number; y: readonly [number, number]; width: number; v?: number }[];
    /** |X| sel udara di depan jendela (sisi dalam dinding). */
    windowInX: number;
    /** Opsional (map kantor Boston): lampu plafon = sumber cahaya tidak langsung tambahan di sel udara tepat di bawahnya
     *  (pusat x/z, y = bawah plafon, ukuran w × d, kekuatan v). */
    lamps?: readonly { x: number; y: number; z: number; w: number; d: number; v: number }[];
    /** Opsional: sinar matahari juga masuk lewat jendela → titik jatuhnya jadi sumber pantul (bawaan hanya lewat skylight). */
    windowSun?: boolean;
  };
  /** Luar ruang: langit terbuka. Sumber langit = sel udara yang melihat langit tegak lurus, kuatnya = keterbukaan (8 sinar
   *  miring); sumber pantul = sel udara tepat di atas permukaan atas (tanah, atap kontainer) yang kena matahari. */
  outdoor?: {
    /** Kekuatan pantul tanah/atap yang kena matahari (0..1) — warna & pengali global ada di BAKE_UNIFORMS.uBounce. */
    bounce: number;
    /** Jarak cek keterbukaan (u, bawaan 24) & elevasi sinar miring (derajat, bawaan 40). */
    openDist?: number;
    openElevDeg?: number;
    /** Nilai langit sel yang semua sinar miringnya terhalang (bawaan 0.3; terbuka penuh = 1). */
    openMin?: number;
  };
}

/** Sumber bake Brick Hall (nilai yang sama persis dengan versi sebelum multi-map). */
export function brickHallBake(): BakeSource {
  return {
    min: [-31, -1.5, -51], max: [31, 30, 51],
    boxes: BOXES, stairs: STAIRS,
    sunDir: [-40, -55, 0],                 // dari posisi matahari (40, 55, 0) ke titik asal
    indoor: { ceilingId: 'CEILING', skylights: SKYLIGHTS, skyY: 27.5, rayY: 27.9, windows: WINDOWS, windowInX: 29.4 },
  };
}

class Grid<T extends Uint8Array | Float32Array> {
  readonly nx: number; readonly ny: number; readonly nz: number;
  readonly d: T;
  readonly x0: number; readonly y0: number; readonly z0: number;
  constructor(readonly c: number, src: BakeSource, make: (n: number) => T) {
    this.x0 = src.min[0]; this.y0 = src.min[1]; this.z0 = src.min[2];
    this.nx = Math.ceil((src.max[0] - this.x0) / c); this.ny = Math.ceil((src.max[1] - this.y0) / c); this.nz = Math.ceil((src.max[2] - this.z0) / c);
    this.d = make(this.nx * this.ny * this.nz);
  }
  idx(i: number, j: number, k: number) { return (k * this.ny + j) * this.nx + i; }
  inside(i: number, j: number, k: number) { return i >= 0 && j >= 0 && k >= 0 && i < this.nx && j < this.ny && k < this.nz; }
  ci(x: number) { return Math.floor((x - this.x0) / this.c); }
  cj(y: number) { return Math.floor((y - this.y0) / this.c); }
  ck(z: number) { return Math.floor((z - this.z0) / this.c); }
}

/** Grid okupansi halus dari manifest balok (+ ramp tangga, + OBB untuk balok berputar); plafon berlubang di skylight. */
function occupancy(src: BakeSource): Grid<Uint8Array> {
  const g = new Grid(GB.aoCell, src, n => new Uint8Array(n));
  const holes = src.indoor?.skylights ?? [];
  const inHole = (x: number, z: number) => holes.some(s => Math.abs(x - s.x) < s.size / 2 && Math.abs(z - s.z) < s.size / 2);
  const fill = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, skipHoles = false) => {
    const e = 0.01, c = g.c;
    const i0 = Math.max(0, g.ci(x0 + e)), i1 = Math.min(g.nx - 1, g.ci(x1 - e));
    const j0 = Math.max(0, g.cj(y0 + e)), j1 = Math.min(g.ny - 1, g.cj(y1 - e));
    const k0 = Math.max(0, g.ck(z0 + e)), k1 = Math.min(g.nz - 1, g.ck(z1 - e));
    for (let k = k0; k <= k1; k++) for (let i = i0; i <= i1; i++) {
      if (skipHoles && inHole(g.x0 + (i + 0.5) * c, g.z0 + (k + 0.5) * c)) continue;
      for (let j = j0; j <= j1; j++) g.d[g.idx(i, j, k)] = 1;
    }
  };
  // balok berputar: sel yang pusatnya di dalam OBB yang dilebarkan ½ sel (setara aturan "sel bersinggungan" untuk balok sejajar
  // sumbu → dinding tipis 0.15 u tetap tertangkap)
  const fillObb = (b: Box, rotY: number) => {
    const e = 0.01, c = g.c, ab = boxAabbXZ(b);
    const cx = (b.min[0] + b.max[0]) / 2, cz = (b.min[2] + b.max[2]) / 2;
    const hx = (b.max[0] - b.min[0]) / 2 + c / 2 - e, hz = (b.max[2] - b.min[2]) / 2 + c / 2 - e;
    const co = Math.cos(rotY), si = Math.sin(rotY);
    const i0 = Math.max(0, g.ci(ab.x[0] - c / 2)), i1 = Math.min(g.nx - 1, g.ci(ab.x[1] + c / 2));
    const j0 = Math.max(0, g.cj(b.min[1] + e)), j1 = Math.min(g.ny - 1, g.cj(b.max[1] - e));
    const k0 = Math.max(0, g.ck(ab.z[0] - c / 2)), k1 = Math.min(g.nz - 1, g.ck(ab.z[1] + c / 2));
    for (let k = k0; k <= k1; k++) for (let i = i0; i <= i1; i++) {
      const dx = g.x0 + (i + 0.5) * c - cx, dz = g.z0 + (k + 0.5) * c - cz;
      if (Math.abs(dx * co - dz * si) > hx || Math.abs(dx * si + dz * co) > hz) continue;   // dunia → lokal (R_y(−θ))
      for (let j = j0; j <= j1; j++) g.d[g.idx(i, j, k)] = 1;
    }
  };
  const ceilingId = src.indoor?.ceilingId;
  for (const b of src.boxes) {
    if (b.rotY) fillObb(b, b.rotY);
    else fill(b.min[0], b.min[1], b.min[2], b.max[0], b.max[1], b.max[2], b.id === ceilingId);
  }
  for (const s of src.stairs) {                 // ramp: padat di bawah permukaan miring (sumbu X atau Z, tinggi kaki → puncak)
    const f = stairFrame(s), len = Math.abs(f.top - f.foot);
    if (f.axis === 'z') for (let k = g.ck(f.z[0]); k <= g.ck(f.z[1]); k++) {
      const z = g.z0 + (k + 0.5) * g.c, top = f.y0 + (f.y1 - f.y0) * Math.min(1, Math.abs(z - f.foot) / len);
      fill(f.x[0], 0, z - g.c / 2, f.x[1], top, z + g.c / 2);
    } else for (let i = g.ci(f.x[0]); i <= g.ci(f.x[1]); i++) {
      const x = g.x0 + (i + 0.5) * g.c, top = f.y0 + (f.y1 - f.y0) * Math.min(1, Math.abs(x - f.foot) / len);
      fill(x - g.c / 2, 0, f.z[0], x + g.c / 2, top, f.z[1]);
    }
  }
  return g;
}

/** Grid kasar (1 u) padat bila ≥ separuh sub-sel halus padat (dinding tipis tetap menghalangi; pagar tidak). */
function coarseSolid(fine: Grid<Uint8Array>, src: BakeSource): Grid<Uint8Array> {
  const g = new Grid(GB.cell, src, n => new Uint8Array(n)), r = Math.round(GB.cell / GB.aoCell);
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
 * Medan cahaya: jarak geodesik lewat udara dari sumber → nilai = kuat_sumber · exp(−d/λ). Dijkstra berbucket (bobot bulat,
 * hasil tidak bergantung urutan sumber). sources(emit): panggil emit(indeks sel, kekuatan 0..1) untuk tiap sumber.
 */
function propagate(solid: Grid<Uint8Array>, sources: (emit: (i: number, v: number) => void) => void, lambda: number): Float32Array {
  const n = solid.d.length, dist = new Float32Array(n).fill(Infinity);
  const scale = 10 / solid.c, maxD = Math.ceil(4 * lambda * scale);
  const buckets: number[][] = [];
  const push = (d: number, i: number) => { (buckets[d] ??= []).push(i); };
  sources((i, v) => {
    const d0 = Math.max(0, Math.round(-lambda * Math.log(Math.max(0.02, v)) * scale));
    if (d0 < dist[i]) { dist[i] = d0; push(d0, i); }
  });
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
  private sky!: Float32Array;
  private bounce!: Float32Array;
  /** Nilai di luar grid / di dalam benda padat (indoor: gelap; outdoor: langit terbuka). */
  private readonly outside: LightSample;
  readonly outdoor: boolean;
  readonly ms: number;

  /** Tanpa argumen = Brick Hall (kompatibel dengan versi lama & tests/lightbake.test.ts). */
  constructor(src: BakeSource = brickHallBake()) {
    const t0 = performance.now();
    this.outdoor = !!src.outdoor;
    this.outside = { sky: this.outdoor ? 1 : 0, bounce: 0 };
    this.fine = occupancy(src);
    this.solid = coarseSolid(this.fine, src);
    const sunDir = new THREE.Vector3(...src.sunDir).normalize();
    if (src.outdoor) this.bakeOutdoor(src.outdoor, sunDir);
    else if (src.indoor) this.bakeIndoor(src.indoor, sunDir);
    else { this.sky = new Float32Array(this.solid.d.length); this.bounce = new Float32Array(this.solid.d.length); }
    this.ms = performance.now() - t0;
  }

  /** Indoor (Brick Hall): langit lewat skylight & jendela, pantul dari bercak matahari skylight. */
  private bakeIndoor(I: NonNullable<BakeSource['indoor']>, sunDir: THREE.Vector3) {
    const s = this.solid;
    // sumber langit: tepat di bawah lubang skylight + di depan jendela tinggi
    const sky: [number, number][] = [];
    const jTop = s.cj(I.skyY);
    for (const L of I.skylights) for (let x = L.x - L.size / 2 + 0.5; x < L.x + L.size / 2; x += s.c)
      for (let z = L.z - L.size / 2 + 0.5; z < L.z + L.size / 2; z += s.c) {
        const i = s.ci(x), k = s.ck(z);
        for (let j = jTop - 1; j <= jTop; j++) if (s.inside(i, j, k) && !s.d[s.idx(i, j, k)]) sky.push([s.idx(i, j, k), 1]);
      }
    for (const w of I.windows) for (let y = w.y[0]; y <= w.y[1]; y += s.c) for (let z = w.z - w.width / 2; z <= w.z + w.width / 2; z += s.c) {
      const i = s.ci(w.x < 0 ? -I.windowInX : I.windowInX), j = s.cj(y), k = s.ck(z);
      if (s.inside(i, j, k) && !s.d[s.idx(i, j, k)]) sky.push([s.idx(i, j, k), w.v ?? GB.windowSky]);
    }
    for (const L of I.lamps ?? []) for (let x = L.x - L.w / 2 + 0.25; x < L.x + L.w / 2; x += s.c / 2)
      for (let z = L.z - L.d / 2 + 0.25; z < L.z + L.d / 2; z += s.c / 2) {
        const i = s.ci(x), j = s.cj(L.y - 0.6), k = s.ck(z);
        if (s.inside(i, j, k) && !s.d[s.idx(i, j, k)]) sky.push([s.idx(i, j, k), L.v]);
      }
    this.sky = propagate(s, emit => { for (const [i, v] of sky) emit(i, v); }, GB.skyLambda);
    // sumber pantul: titik jatuh sinar matahari yang masuk lewat skylight (sel udara tepat sebelum menabrak permukaan)
    const bounce: [number, number][] = [];
    const f = this.fine, p = new THREE.Vector3(), q = new THREE.Vector3();
    const ray = () => {
      for (let t = 0; t < 80; t += 0.35) {
        q.copy(p).addScaledVector(sunDir, t);
        const i = f.ci(q.x), j = f.cj(q.y), k = f.ck(q.z);
        if (!f.inside(i, j, k)) break;
        if (f.d[f.idx(i, j, k)]) {
          q.addScaledVector(sunDir, -0.6);
          const ci = s.ci(q.x), cj = s.cj(q.y), ck = s.ck(q.z);
          if (s.inside(ci, cj, ck) && !s.d[s.idx(ci, cj, ck)]) bounce.push([s.idx(ci, cj, ck), 1]);
          break;
        }
      }
    };
    for (const L of I.skylights) for (let x = L.x - L.size / 2 + 0.25; x < L.x + L.size / 2; x += 0.5)
      for (let z = L.z - L.size / 2 + 0.25; z < L.z + L.size / 2; z += 0.5) { p.set(x, I.rayY, z); ray(); }
    // sinar lewat jendela (hanya yang menuju ke dalam: komponen X searah dari sisi jendela ke tengah)
    if (I.windowSun) for (const w of I.windows) {
      const xin = w.x < 0 ? -I.windowInX : I.windowInX;
      if (Math.sign(sunDir.x) !== -Math.sign(xin)) continue;
      for (let y = w.y[0] + 0.25; y < w.y[1]; y += 0.5) for (let z = w.z - w.width / 2 + 0.25; z < w.z + w.width / 2; z += 0.5) { p.set(xin, y, z); ray(); }
    }
    this.bounce = propagate(s, emit => { for (const [i, v] of bounce) emit(i, v); }, GB.bounceLambda);
  }

  /** Outdoor: langit dari keterbukaan tiap sel udara + pantul dari permukaan atas yang kena matahari. */
  private bakeOutdoor(O: NonNullable<BakeSource['outdoor']>, sunDir: THREE.Vector3) {
    const s = this.solid, c = s.c, nx = s.nx, ny = s.ny, nz = s.nz;
    // puncak padat per kolom (indeks j; −1 = kolom kosong)
    const top = new Int16Array(nx * nz).fill(-1);
    let maxTop = -1;
    for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++)
      for (let j = ny - 1; j >= 0; j--) if (s.d[s.idx(i, j, k)]) { top[k * nx + i] = j; if (j > maxTop) maxTop = j; break; }
    const yTop = s.y0 + (maxTop + 1) * c;          // di atas Y ini tidak ada benda padat → sinar bebas
    /** Sinar dari (x, y, z) searah (dx, dy, dz) (|d| = 1) menabrak sel padat dalam jarak maks? Keluar grid / di atas yTop = bebas. */
    const hits = (x: number, y: number, z: number, dx: number, dy: number, dz: number, max: number) => {
      for (let t = c; t <= max; t += c) {
        const py = y + dy * t;
        if (py >= yTop) return false;
        const i = s.ci(x + dx * t), j = s.cj(py), k = s.ck(z + dz * t);
        if (!s.inside(i, j, k)) return false;
        if (s.d[s.idx(i, j, k)]) return true;
      }
      return false;
    };
    const el = THREE.MathUtils.degToRad(O.openElevDeg ?? 40), ce = Math.cos(el), se = Math.sin(el);
    const dist = O.openDist ?? 24, vMin = O.openMin ?? 0.3;
    const AZ: [number, number][] = [];
    for (let a = 0; a < 8; a++) AZ.push([Math.cos(a * Math.PI / 4) * ce, Math.sin(a * Math.PI / 4) * ce]);
    // langit: sel udara di atas puncak kolomnya melihat langit tegak lurus → sumber; kekuatan = keterbukaan 8 sinar miring
    this.sky = propagate(s, emit => {
      for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) {
        const x = s.x0 + (i + 0.5) * c, z = s.z0 + (k + 0.5) * c;
        for (let j = top[k * nx + i] + 1; j < ny; j++) {
          const y = s.y0 + (j + 0.5) * c;
          let v = 1;
          if (y < yTop) {
            let free = 0;
            for (const [dx, dz] of AZ) if (!hits(x, y, z, dx, se, dz, dist)) free++;
            v = vMin + (1 - vMin) * free / AZ.length;
          }
          emit(s.idx(i, j, k), v);
        }
      }
    }, GB.skyLambda);
    // pantul: sel udara tepat di atas permukaan atas (tanah, atap) yang melihat matahari
    const tx = -sunDir.x, ty = -sunDir.y, tz = -sunDir.z, far = Math.hypot(s.nx, s.ny, s.nz) * c;
    this.bounce = propagate(s, emit => {
      for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) {
        const j = top[k * nx + i] + 1;
        if (j <= 0 || j >= ny) continue;
        if (!hits(s.x0 + (i + 0.5) * c, s.y0 + (j + 0.5) * c, s.z0 + (k + 0.5) * c, tx, ty, tz, far)) emit(s.idx(i, j, k), O.bounce);
      }
    }, GB.bounceLambda);
  }

  /** Interpolasi trilinear medan kasar di titik (sel padat diabaikan & bobot dinormalkan). */
  sample(x: number, y: number, z: number, out: LightSample): LightSample {
    const s = this.solid, c = s.c;
    const fx = (x - s.x0) / c - 0.5, fy = (y - s.y0) / c - 0.5, fz = (z - s.z0) / c - 0.5;
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
    out.sky = w > 1e-4 ? sk / w : this.outside.sky; out.bounce = w > 1e-4 ? bo / w : this.outside.bounce;
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
