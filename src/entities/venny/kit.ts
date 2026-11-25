// src/entities/venny/kit.ts — perkakas mesh prosedural ber-skin untuk Venny realistis (permintaan pengguna 2026-11-25: "jangan
// kotak-kotak, harus mirip gambar"). Penampang (ring) → loft, pita sepanjang kurva, kotak membulat, elipsoid — semua ditulis ke SATU
// geometri gabungan (position/normal/uv/skinIndex/skinWeight, ≤ 4 tulang per verteks) → 1 SkinnedMesh = 1 draw call.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { FaceKey, Faces, Rect } from '../charKit';

export type V3 = [number, number, number];
/** Bobot kulit: pasangan [indeks tulang, bobot] (dinormalisasi saat ditulis; maks 4). */
export type Skin = [number, number][];

const ATLAS = 1024;
const FACE_ORDER: FaceKey[] = ['px', 'nx', 'py', 'ny', 'pz', 'nz'];

/** (u, v) lokal 0..1 → UV atlas di dalam region r (v = 1 → baris atas region). */
export const auv = (r: Rect, u: number, v: number): [number, number] =>
  [(r.x + 0.5 + u * (r.w - 1)) / ATLAS, 1 - (r.y + 0.5 + (1 - v) * (r.h - 1)) / ATLAS];

export const sstep = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const mul = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const norm = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export const mix = (a: V3, b: V3, t: number): V3 => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

export class SkinMesh {
  readonly pos: number[] = []; readonly uv: number[] = []; readonly nrm: number[] = [];
  readonly si: number[] = []; readonly sw: number[] = []; readonly idx: number[] = [];
  get n() { return this.pos.length / 3; }

  v(p: V3, uv: [number, number], s: Skin, n: V3 = [0, 0, 0]): number {
    this.pos.push(p[0], p[1], p[2]); this.uv.push(uv[0], uv[1]); this.nrm.push(n[0], n[1], n[2]);
    const w = s.filter(x => x[1] > 1e-4).sort((a, b) => b[1] - a[1]).slice(0, 4);
    let t = 0; for (const x of w) t += x[1];
    for (let k = 0; k < 4; k++) { this.si.push(w[k] ? w[k][0] : 0); this.sw.push(w[k] ? w[k][1] / (t || 1) : 0); }
    if (!w.length) this.sw[this.sw.length - 4] = 1;
    return this.n - 1;
  }
  tri(a: number, b: number, c: number) { this.idx.push(a, b, c); }

  /** Normal dari muka (bobot luas) untuk segitiga sejak `fromIdx`; pasangan `welds` (verteks kembar di sambungan) dirata-rata. */
  faceNormals(fromIdx: number, welds: [number, number][] = []) {
    const P = this.pos, N = this.nrm, I = this.idx;
    for (let k = fromIdx; k < I.length; k += 3) {
      const a = I[k] * 3, b = I[k + 1] * 3, c = I[k + 2] * 3;
      const e1x = P[b] - P[a], e1y = P[b + 1] - P[a + 1], e1z = P[b + 2] - P[a + 2];
      const e2x = P[c] - P[a], e2y = P[c + 1] - P[a + 1], e2z = P[c + 2] - P[a + 2];
      const nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
      for (const o of [a, b, c]) { N[o] += nx; N[o + 1] += ny; N[o + 2] += nz; }
    }
    for (const [a, b] of welds) {
      for (let d = 0; d < 3; d++) { const s = N[a * 3 + d] + N[b * 3 + d]; N[a * 3 + d] = s; N[b * 3 + d] = s; }
    }
  }

  geometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    const N = this.nrm;
    for (let i = 0; i < N.length; i += 3) { const l = Math.hypot(N[i], N[i + 1], N[i + 2]) || 1; N[i] /= l; N[i + 1] /= l; N[i + 2] /= l; }
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(this.si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(this.sw, 4));
    g.setIndex(this.n > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    return g;
  }
}

/** Bingkai penampang tegak lurus arah `up` (dari ujung bawah ke ujung atas loft): az ≈ `back` (θ = 0), ax = up × az (θ = π/2). */
export function frame(up: V3, back: V3 = [0, 0, 1]): { ax: V3; az: V3 } {
  const u = norm(up);
  let az = sub(back, mul(u, dot(back, u)));
  if (Math.hypot(...az) < 1e-4) az = sub([0, 1, 0], mul(u, u[1]));
  az = norm(az);
  return { ax: norm(cross(u, az)), az };
}

/** Titik penampang (n + 1, titik terakhir = titik pertama): θ = 0 di sumbu az ("belakang"), θ = π/2 di ax ("kanan").
 *  e = eksponen superelips (2 = elips); mod(θ) → [kx, kz] pengali jari-jari per sudut. */
export function ring(c: V3, ax: V3, az: V3, rx: number, rz: number, n: number, e = 2, mod?: (th: number) => [number, number]): V3[] {
  const out: V3[] = [];
  for (let j = 0; j < n; j++) {
    const th = (j / n) * Math.PI * 2, s = Math.sin(th), co = Math.cos(th);
    const ps = Math.sign(s) * Math.pow(Math.abs(s), 2 / e), pc = Math.sign(co) * Math.pow(Math.abs(co), 2 / e);
    const [kx, kz] = mod ? mod(th) : [1, 1];
    const x = ps * rx * kx, z = pc * rz * kz;
    out.push([c[0] + ax[0] * x + az[0] * z, c[1] + ax[1] * x + az[1] * z, c[2] + ax[2] * x + az[2] * z]);
  }
  out.push([...out[0]] as V3);
  return out;
}

/** Loft dari penampang bawah → atas. vs[i] = v baris i (0..1), uSpan = rentang u region yang dipakai. skin(i, j, p). */
export function loft(m: SkinMesh, rings: V3[][], vs: number[], r: Rect, skin: (i: number, j: number, p: V3) => Skin,
  o: { closed?: boolean; flip?: boolean; u0?: number; u1?: number } = {}) {
  const base = m.n, from = m.idx.length, rows = rings.length, cols = rings[0].length, closed = o.closed ?? true;
  const u0 = o.u0 ?? 0, u1 = o.u1 ?? 1;
  for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
    const p = rings[i][j];
    m.v(p, auv(r, lerp(u0, u1, j / (cols - 1)), vs[i]), skin(i, j, p));
  }
  for (let i = 0; i < rows - 1; i++) for (let j = 0; j < cols - 1; j++) {
    const a = base + i * cols + j, b = a + 1, c = a + cols, d = c + 1;
    if (o.flip) { m.tri(a, c, b); m.tri(b, c, d); } else { m.tri(a, b, c); m.tri(b, d, c); }
  }
  const welds: [number, number][] = [];
  if (closed) for (let i = 0; i < rows; i++) welds.push([base + i * cols, base + i * cols + cols - 1]);
  m.faceNormals(from, welds);
}

/** Tutup ujung loft (kipas ke titik tengah) — untuk ujung yang terlihat (mis. ujung kuncir, ujung lengan baju bila perlu). */
export function cap(m: SkinMesh, rim: V3[], center: V3, uv: [number, number], skin: Skin, flip = false) {
  const from = m.idx.length, c = m.v(center, uv, skin), first = m.n;
  for (const p of rim.slice(0, -1)) m.v(p, uv, skin);
  const k = rim.length - 1;
  for (let j = 0; j < k; j++) { const a = first + j, b = first + ((j + 1) % k); if (flip) m.tri(c, b, a); else m.tri(c, a, b); }
  m.faceNormals(from);
}

/** Pita tebal sepanjang lintasan: path[k] titik, out[k] arah "keluar" (normal permukaan tubuh); lebar w, tebal t.
 *  u: sisi luar menempati 0..0.8 tekstur (sisa = tepi & sisi dalam); v sepanjang lintasan. Sudut tajam (verteks terpisah). */
export function strap(m: SkinMesh, path: V3[], out: V3[], w: number, t: number, r: Rect, skin: (k: number, p: V3) => Skin,
  vScale = 1) {
  const from = m.idx.length, base = m.n;
  let len = 0;
  const L: number[] = [0];
  for (let k = 1; k < path.length; k++) { len += Math.hypot(...sub(path[k], path[k - 1])); L.push(len); }
  const us = [0, 0.8, 0.8, 0.85, 0.85, 0.95, 0.95, 1];   // luar | tepi | dalam | tepi
  for (let k = 0; k < path.length; k++) {
    const p = path[k], tg = norm(sub(path[Math.min(k + 1, path.length - 1)], path[Math.max(k - 1, 0)]));
    const nn = norm(sub(out[k], mul(tg, dot(out[k], tg)))), sd = norm(cross(tg, nn));
    const o1 = mul(nn, t / 2), s1 = mul(sd, w / 2);
    const A = add(add(p, o1), s1), B = sub(add(p, o1), s1), C = sub(sub(p, o1), s1), D = add(sub(p, o1), s1);
    const pts: V3[] = [A, B, B, C, C, D, D, A];
    const v = (L[k] / (len || 1)) * vScale;
    pts.forEach((q, i) => m.v(q, auv(r, us[i], Math.min(1, v)), skin(k, p)));
  }
  for (let k = 0; k < path.length - 1; k++) for (let s = 0; s < 4; s++) {
    const a = base + k * 8 + s * 2, b = a + 1, c = a + 8, d = c + 1;
    m.tri(a, c, b); m.tri(b, c, d);
  }
  m.faceNormals(from);
}

/** Kotak membulat (RoundedBoxGeometry) dengan region atlas per sisi; bend(p lokal) memodifikasi bentuk (mis. melengkung). */
export function rbox(m: SkinMesh, size: V3, pos: V3, faces: Faces, skin: Skin | ((p: V3) => Skin), o: {
  rot?: V3; radius?: number; seg?: number; bend?: (p: V3) => V3; mirrorU?: boolean;
} = {}) {
  const g = new RoundedBoxGeometry(size[0], size[1], size[2], o.seg ?? 1, o.radius ?? 0.015);
  const P = g.getAttribute('position'), N = g.getAttribute('normal'), U = g.getAttribute('uv');
  const per = P.count / 6;
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(...(o.rot ?? [0, 0, 0])));
  const v = new THREE.Vector3(), n = new THREE.Vector3();
  const base = m.n;
  for (let i = 0; i < P.count; i++) {
    let lp: V3 = [P.getX(i), P.getY(i), P.getZ(i)];
    if (o.bend) lp = o.bend(lp);
    v.set(...lp).applyQuaternion(q).add(new THREE.Vector3(...pos));
    n.set(N.getX(i), N.getY(i), N.getZ(i)).applyQuaternion(q);
    const side = Math.floor(i / per), rect = faces[FACE_ORDER[side]] ?? faces.all!;
    let uu = U.getX(i);
    if (o.mirrorU) uu = 1 - uu;
    const p: V3 = [v.x, v.y, v.z];
    m.v(p, auv(rect, uu, U.getY(i)), typeof skin === 'function' ? skin(p) : skin, [n.x, n.y, n.z]);
  }
  for (let i = 0; i < P.count; i += 3) m.tri(base + i, base + i + 1, base + i + 2);
  g.dispose();
}

/** Balok biasa (BoxGeometry, UV per sisi dilihat dari luar tidak tercermin — sama dengan charKit.box) untuk teks/papan nama. */
export function plainBox(m: SkinMesh, size: V3, pos: V3, faces: Faces, skin: Skin, rot?: V3) {
  const g = new THREE.BoxGeometry(size[0], size[1], size[2]);
  const P = g.getAttribute('position'), N = g.getAttribute('normal'), U = g.getAttribute('uv'), I = g.getIndex()!;
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(...(rot ?? [0, 0, 0])));
  const v = new THREE.Vector3(), n = new THREE.Vector3(), base = m.n;
  for (let i = 0; i < P.count; i++) {
    v.set(P.getX(i), P.getY(i), P.getZ(i)).applyQuaternion(q).add(new THREE.Vector3(...pos));
    n.set(N.getX(i), N.getY(i), N.getZ(i)).applyQuaternion(q);
    const rect = faces[FACE_ORDER[Math.floor(i / 4)]] ?? faces.all!;
    m.v([v.x, v.y, v.z], auv(rect, U.getX(i), U.getY(i)), skin, [n.x, n.y, n.z]);
  }
  for (let i = 0; i < I.count; i += 3) m.tri(base + I.getX(i), base + I.getX(i + 1), base + I.getX(i + 2));
  g.dispose();
}

/** Elipsoid lintang-bujur (u keliling mulai belakang, v bawah → atas) dengan rotasi opsional. */
export function ellipsoid(m: SkinMesh, c: V3, rad: V3, r: Rect, skin: Skin, o: { rot?: V3; lon?: number; lat?: number } = {}) {
  const lon = o.lon ?? 12, lat = o.lat ?? 8;
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(...(o.rot ?? [0, 0, 0])));
  const v = new THREE.Vector3(), n = new THREE.Vector3(), base = m.n, from = m.idx.length;
  for (let i = 0; i <= lat; i++) {
    const ph = Math.PI * (1 - i / lat);   // baris 0 = bawah
    for (let j = 0; j <= lon; j++) {
      const th = (j / lon) * Math.PI * 2;
      const dx = Math.sin(ph) * Math.sin(th), dy = Math.cos(ph), dz = Math.sin(ph) * Math.cos(th);
      v.set(dx * rad[0], dy * rad[1], dz * rad[2]).applyQuaternion(q);
      n.set(dx / rad[0], dy / rad[1], dz / rad[2]).applyQuaternion(q).normalize();
      m.v([c[0] + v.x, c[1] + v.y, c[2] + v.z], auv(r, j / lon, i / lat), skin, [n.x, n.y, n.z]);
    }
  }
  for (let i = 0; i < lat; i++) for (let j = 0; j < lon; j++) {
    const a = base + i * (lon + 1) + j, b = a + 1, cc = a + lon + 1, d = cc + 1;
    m.tri(a, b, cc); m.tri(b, d, cc);
  }
  void from;
}

/** Tabung bulat sepanjang lintasan dengan profil jari-jari rad(t) (t 0..1) — kabel mikrofon, kuncir, peluru. */
export function tube(m: SkinMesh, path: V3[], rad: (t: number) => number, n: number, r: Rect, skin: (t: number, p: V3) => Skin,
  back: V3 = [0, 0, 1]) {
  const rings: V3[][] = [], vs: number[] = [];
  let len = 0; const L: number[] = [0];
  for (let k = 1; k < path.length; k++) { len += Math.hypot(...sub(path[k], path[k - 1])); L.push(len); }
  for (let k = 0; k < path.length; k++) {
    const up = norm(sub(path[Math.min(k + 1, path.length - 1)], path[Math.max(k - 1, 0)]));
    const f = frame(up, back), t = L[k] / (len || 1), rr = rad(t);
    rings.push(ring(path[k], f.ax, f.az, rr, rr, n)); vs.push(t);
  }
  const ts = vs.slice();
  loft(m, rings, vs, r, (i, _j, p) => skin(ts[i], p));
}
