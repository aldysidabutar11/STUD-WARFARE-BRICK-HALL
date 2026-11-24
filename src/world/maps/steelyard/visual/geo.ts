// src/world/maps/steelyard/visual/geo.ts — penyusun geometri Steel Yard: semua primitif (quad, balok, prisma, cincin, ekstrusi
// profil, permukaan parametrik) ditulis LANGSUNG dalam koordinat DUNIA ke "bucket" per material (1 bucket = 1 mesh = 1 draw call).
// Transform lokal → dunia lewat tumpukan Matrix4 (kontainer/prop berputar, daun pintu berayun di engsel). Warna verteks (linear)
// + kait `tint` (mis. debu di permukaan atas). Hasil siap di-bake LightBake (posisi & normal dunia, transform mesh identitas).
// Dipakai saat membangun map saja (bukan hot loop) → alokasi bebas.
import * as THREE from 'three';

export type V3 = [number, number, number];
/** Sumbu serat/arah u tekstur: 0 = X lokal, 1 = Y, 2 = Z. */
export type Axis = 0 | 1 | 2;

interface Bucket { pos: number[]; nrm: number[]; uv: number[]; col: number[]; idx: number[] }

/** Opsi balok: lewati muka (px = +X, nx = −X, …), skala & geser UV (satuan u lokal), sumbu serat, warna muka atas. */
export interface BoxOpts {
  skip?: { px?: boolean; nx?: boolean; py?: boolean; ny?: boolean; pz?: boolean; nz?: boolean };
  uvScale?: number;
  uvOff?: [number, number];
  grain?: Axis;
  /** Pemetaan UV khusus per verteks: (titik lokal, normal lokal) → [u, v]. Menimpa uvScale/grain. */
  uv?: (p: V3, n: V3) => [number, number];
  /** Warna (hex sRGB) khusus muka atas. */
  top?: number;
  /** Pecah muka yang lebih panjang dari nilai ini (gradasi bake halus). */
  sub?: number;
}

const _p = new THREE.Vector3(), _n = new THREE.Vector3(), _c = new THREE.Color();

export class Geo {
  private buckets = new Map<string, Bucket>();
  private m = new THREE.Matrix4();
  private nm = new THREE.Matrix3();
  private stack: THREE.Matrix4[] = [];
  /** Transform aktif mencerminkan (determinan < 0) → urutan segitiga dibalik agar muka depan tetap menghadap normal. */
  private flip = false;
  private r = 1; private g = 1; private b = 1;
  /** Kait warna per verteks (posisi & normal DUNIA, warna linear in/out). */
  tint: ((p: THREE.Vector3, n: THREE.Vector3, c: THREE.Color) => void) | null = null;
  triangles = 0;

  // ───────────── transform & warna
  /** Kalikan transform aktif dengan m (lokal baru = m di dalam lokal lama). */
  push(m: THREE.Matrix4) {
    this.stack.push(this.m.clone());
    this.m.multiply(m);
    this.nm.getNormalMatrix(this.m);
    this.flip = this.m.determinant() < 0;
  }
  pop() {
    const m = this.stack.pop();
    if (m) { this.m.copy(m); this.nm.getNormalMatrix(this.m); this.flip = this.m.determinant() < 0; }
  }
  /** Indeks segitiga sesuai arah (dibalik bila transform mencerminkan). */
  private t3(b: Bucket, a: number, c: number, d: number) { if (this.flip) b.idx.push(a, d, c); else b.idx.push(a, c, d); }
  /** Transform objek di tanah: geser (x, y, z) lalu putar rotY (konvensi three.js). */
  pushAt(x: number, y: number, z: number, rotY = 0, rotX = 0, rotZ = 0) {
    const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rotX, rotY, rotZ, 'YXZ'));
    m.setPosition(x, y, z);
    this.push(m);
  }
  /** Warna aktif (hex sRGB, dikali mul — dalam ruang linear). */
  color(hex: number, mul = 1) {
    _c.setHex(hex, THREE.SRGBColorSpace);
    this.r = _c.r * mul; this.g = _c.g * mul; this.b = _c.b * mul;
    return this;
  }
  /** Warna aktif dari THREE.Color (linear). */
  colorC(c: THREE.Color, mul = 1) { this.r = c.r * mul; this.g = c.g * mul; this.b = c.b * mul; return this; }
  get current() { return new THREE.Color(this.r, this.g, this.b); }

  private bucket(key: string): Bucket {
    let b = this.buckets.get(key);
    if (!b) { b = { pos: [], nrm: [], uv: [], col: [], idx: [] }; this.buckets.set(key, b); }
    return b;
  }

  /** Satu verteks (lokal) → dunia; kembalikan indeks. */
  private vert(b: Bucket, x: number, y: number, z: number, nx: number, ny: number, nz: number, u: number, v: number): number {
    _p.set(x, y, z).applyMatrix4(this.m);
    _n.set(nx, ny, nz).applyMatrix3(this.nm).normalize();
    b.pos.push(_p.x, _p.y, _p.z); b.nrm.push(_n.x, _n.y, _n.z); b.uv.push(u, v);
    if (this.tint) { _c.setRGB(this.r, this.g, this.b); this.tint(_p, _n, _c); b.col.push(_c.r, _c.g, _c.b); }
    else b.col.push(this.r, this.g, this.b);
    return b.pos.length / 3 - 1;
  }

  // ───────────── primitif
  /** Quad lokal p0..p3 berurutan CCW dilihat dari depan (normal = (p1−p0)×(p3−p0)). nu×nv = pecahan kisi. */
  quad(key: string, p0: V3, p1: V3, p2: V3, p3: V3, uv: number[] = [0, 0, 1, 0, 1, 1, 0, 1], nu = 1, nv = 1, n?: V3) {
    const b = this.bucket(key);
    let nx: number, ny: number, nz: number;
    if (n) [nx, ny, nz] = n;
    else {
      const ax = p1[0] - p0[0], ay = p1[1] - p0[1], az = p1[2] - p0[2], bx = p3[0] - p0[0], by = p3[1] - p0[1], bz = p3[2] - p0[2];
      nx = ay * bz - az * by; ny = az * bx - ax * bz; nz = ax * by - ay * bx;
      const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    }
    const base = b.pos.length / 3;
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
      const s = i / nu, t = j / nv;
      // bilinear p0 (0,0) p1 (1,0) p2 (1,1) p3 (0,1)
      const w0 = (1 - s) * (1 - t), w1 = s * (1 - t), w2 = s * t, w3 = (1 - s) * t;
      this.vert(b,
        p0[0] * w0 + p1[0] * w1 + p2[0] * w2 + p3[0] * w3, p0[1] * w0 + p1[1] * w1 + p2[1] * w2 + p3[1] * w3,
        p0[2] * w0 + p1[2] * w1 + p2[2] * w2 + p3[2] * w3, nx, ny, nz,
        uv[0] * w0 + uv[2] * w1 + uv[4] * w2 + uv[6] * w3, uv[1] * w0 + uv[3] * w1 + uv[5] * w2 + uv[7] * w3);
    }
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
      const a = base + j * (nu + 1) + i, c = a + 1, d = a + nu + 1, e = d + 1;
      this.t3(b, a, c, e); this.t3(b, a, e, d);
    }
    this.triangles += 2 * nu * nv;
  }

  /** Segitiga lokal (CCW dari depan). */
  tri(key: string, p0: V3, p1: V3, p2: V3, uv: number[] = [0, 0, 1, 0, 0, 1]) {
    const b = this.bucket(key);
    const ax = p1[0] - p0[0], ay = p1[1] - p0[1], az = p1[2] - p0[2], bx = p2[0] - p0[0], by = p2[1] - p0[1], bz = p2[2] - p0[2];
    let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    const i0 = this.vert(b, p0[0], p0[1], p0[2], nx, ny, nz, uv[0], uv[1]);
    const i1 = this.vert(b, p1[0], p1[1], p1[2], nx, ny, nz, uv[2], uv[3]);
    const i2 = this.vert(b, p2[0], p2[1], p2[2], nx, ny, nz, uv[4], uv[5]);
    this.t3(b, i0, i1, i2);
    this.triangles++;
  }

  /** Balok lokal sejajar sumbu [x0..x1]×[y0..y1]×[z0..z1]. UV bawaan = proyeksi kotak dalam satuan u × uvScale. */
  box(key: string, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, o: BoxOpts = {}) {
    const sk = o.skip ?? {}, s = o.uvScale ?? 1, off = o.uvOff ?? [0, 0];
    const cur: [number, number, number] = [this.r, this.g, this.b];
    const uvOf = (p: V3, n: V3): [number, number] => {
      if (o.uv) return o.uv(p, n);
      // sumbu dalam bidang muka: (U, V) bawaan; serat → U = sumbu serat bila sebidang
      const ax = Math.abs(n[0]) > 0.5 ? 0 : Math.abs(n[1]) > 0.5 ? 1 : 2;
      let U: Axis = ax === 0 ? 2 : 0, V: Axis = ax === 1 ? 2 : 1;
      if (o.grain !== undefined && o.grain !== ax) { const other = ([0, 1, 2] as Axis[]).find(q => q !== ax && q !== o.grain)!; U = o.grain; V = other; }
      return [p[U] * s + off[0], p[V] * s + off[1]];
    };
    const face = (a: V3, bb: V3, c: V3, d: V3, n: V3) => {
      const ua = uvOf(a, n), ub = uvOf(bb, n), uc = uvOf(c, n), ud = uvOf(d, n);
      const l1 = Math.hypot(bb[0] - a[0], bb[1] - a[1], bb[2] - a[2]), l3 = Math.hypot(d[0] - a[0], d[1] - a[1], d[2] - a[2]);
      const nu = o.sub ? Math.max(1, Math.ceil(l1 / o.sub - 1e-6)) : 1, nv = o.sub ? Math.max(1, Math.ceil(l3 / o.sub - 1e-6)) : 1;
      this.quad(key, a, bb, c, d, [...ua, ...ub, ...uc, ...ud], nu, nv, n);
    };
    if (!sk.py) {
      if (o.top !== undefined) this.color(o.top);
      face([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0]);
      [this.r, this.g, this.b] = cur;
    }
    if (!sk.ny) face([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0]);
    if (!sk.px) face([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0]);
    if (!sk.nx) face([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0]);
    if (!sk.pz) face([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1]);
    if (!sk.nz) face([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1]);
  }

  /** Balok berpusat (cx, cy, cz) ukuran (sx, sy, sz). */
  boxC(key: string, cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, o: BoxOpts = {}) {
    this.box(key, cx - sx / 2, cy - sy / 2, cz - sz / 2, cx + sx / 2, cy + sy / 2, cz + sz / 2, o);
  }

  /**
   * Prisma tegak segi-n (silinder blocky): pusat (cx, cz), jari-jari r, y0..y1. smooth = normal sisi halus (drum, ban);
   * selain itu faset tegas. UV sisi: u = keliling (u lokal) × uvScale, v = y × vScale.
   */
  prismY(key: string, cx: number, cz: number, r: number, y0: number, y1: number, n: number,
    o: { top?: boolean; bottom?: boolean; smooth?: boolean; phase?: number; uvScale?: number; vScale?: number; uOff?: number; vOff?: number; capScale?: number; rTop?: number; inward?: boolean; capOff?: [number, number] } = {}) {
    const ph = o.phase ?? 0, us = o.uvScale ?? 1, vs = o.vScale ?? us, uo = o.uOff ?? 0, vo = o.vOff ?? 0, rt = o.rTop ?? r;
    const per = 2 * Math.PI * r;
    const b = this.bucket(key);
    for (let i = 0; i < n; i++) {
      const a0 = ph + (i / n) * Math.PI * 2, a1 = ph + ((i + 1) / n) * Math.PI * 2, am = (a0 + a1) / 2;
      const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
      const u0 = (i / n) * per * us + uo, u1 = ((i + 1) / n) * per * us + uo;
      const base = b.pos.length / 3;
      const sg = o.inward ? -1 : 1;
      const nr = (c: number, s: number): V3 => o.smooth ? [c * sg, 0, s * sg] : [Math.cos(am) * sg, 0, Math.sin(am) * sg];
      const n0 = nr(c0, s0), n1 = nr(c1, s1);
      // urutan CCW dari luar: (a1 bawah) (a0 bawah) (a0 atas) (a1 atas) — sudut naik berlawanan arah jarum jam dilihat dari atas
      this.vert(b, cx + c1 * r, y0, cz + s1 * r, ...n1, u1, y0 * vs + vo);
      this.vert(b, cx + c0 * r, y0, cz + s0 * r, ...n0, u0, y0 * vs + vo);
      this.vert(b, cx + c0 * rt, y1, cz + s0 * rt, ...n0, u0, y1 * vs + vo);
      this.vert(b, cx + c1 * rt, y1, cz + s1 * rt, ...n1, u1, y1 * vs + vo);
      if (o.inward) { this.t3(b, base, base + 2, base + 1); this.t3(b, base, base + 3, base + 2); }
      else { this.t3(b, base, base + 1, base + 2); this.t3(b, base, base + 2, base + 3); }
      this.triangles += 2;
    }
    const cs = o.capScale ?? us;
    if (o.top !== false) this.disc(key, cx, y1, cz, rt, n, 1, ph, cs, 0, o.capOff);
    if (o.bottom) this.disc(key, cx, y0, cz, r, n, -1, ph, cs, 0, o.capOff);
  }

  /** Cakram segi-n mendatar (tutup prisma). dir 1 = menghadap +Y. UV = proyeksi atas (u lokal × uvScale). */
  disc(key: string, cx: number, y: number, cz: number, r: number, n: number, dir: 1 | -1, phase = 0, uvScale = 1, rIn = 0, off: [number, number] = [0, 0]) {
    const b = this.bucket(key), [ou, ov] = off;
    if (rIn > 0) {   // cincin datar
      for (let i = 0; i < n; i++) {
        const a0 = phase + (i / n) * Math.PI * 2, a1 = phase + ((i + 1) / n) * Math.PI * 2;
        const P = (a: number, rr: number): V3 => [cx + Math.cos(a) * rr, y, cz + Math.sin(a) * rr];
        const p = [P(a0, rIn), P(a0, r), P(a1, r), P(a1, rIn)];
        const ord = dir > 0 ? [0, 3, 2, 1] : [0, 1, 2, 3];
        const q = ord.map(k => p[k]);
        this.quad(key, q[0], q[1], q[2], q[3], q.flatMap(v => [v[0] * uvScale + ou, -v[2] * uvScale + ov]), 1, 1, [0, dir, 0]);
      }
      return;
    }
    const c = this.vert(b, cx, y, cz, 0, dir, 0, cx * uvScale + ou, -cz * uvScale + ov);
    const ring: number[] = [];
    for (let i = 0; i < n; i++) {
      const a = phase + (i / n) * Math.PI * 2, x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      ring.push(this.vert(b, x, y, z, 0, dir, 0, x * uvScale + ou, -z * uvScale + ov));
    }
    for (let i = 0; i < n; i++) {
      const a = ring[i], d = ring[(i + 1) % n];
      if (dir > 0) this.t3(b, c, d, a); else this.t3(b, c, a, d);
    }
    this.triangles += n;
  }

  /**
   * Ekstrusi profil 2D (poligon CCW, boleh cekung) sepanjang satu sumbu. plane 'zy': profil (z, y) diekstrusi sepanjang X
   * dari c0..c1 (barrier); 'xy': profil (x, y) sepanjang Z (badan mobil). UV dinding: u = keliling × s, v = sumbu ekstrusi × s.
   */
  extrude(key: string, pts: [number, number][], plane: 'zy' | 'xy', c0: number, c1: number,
    o: { uvScale?: number; caps?: boolean; uv?: (p: V3) => [number, number] } = {}) {
    const s = o.uvScale ?? 1, uvf = o.uv;
    const P = (a: number, y: number, c: number): V3 => plane === 'zy' ? [c, y, a] : [a, y, c];
    // pastikan CCW (luas positif) di bidang (a, y)
    let area = 0;
    for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; area += p[0] * q[1] - q[0] * p[1]; }
    const ccw = area > 0 ? pts : [...pts].reverse();
    // dinding: tiap sisi profil → quad
    let per = 0;
    for (let i = 0; i < ccw.length; i++) {
      const p = ccw[i], q = ccw[(i + 1) % ccw.length], len = Math.hypot(q[0] - p[0], q[1] - p[1]);
      const ua = per * s, ub = (per + len) * s; per += len;
      // profil CCW di (a, y): normal luar = (dy, −da) di bidang profil → urutan ujung ekstrusi dipilih agar quad menghadap keluar
      const ca = plane === 'zy' ? c1 : c0, cb = plane === 'zy' ? c0 : c1;
      const A = P(p[0], p[1], ca), B = P(q[0], q[1], ca), C = P(q[0], q[1], cb), D = P(p[0], p[1], cb);
      const uvw = uvf ? [...uvf(A), ...uvf(B), ...uvf(C), ...uvf(D)] : [ua, ca * s, ub, ca * s, ub, cb * s, ua, cb * s];
      this.quad(key, A, B, C, D, uvw);
    }
    if (o.caps === false) return;
    const tris = THREE.ShapeUtils.triangulateShape(ccw.map(p => new THREE.Vector2(p[0], p[1])), []);
    const uv = (p: [number, number], c: number) => uvf ? uvf(P(p[0], p[1], c)) : [p[0] * s, p[1] * s];
    for (const t of tris) {
      let A = ccw[t[0]], B = ccw[t[1]];
      const C = ccw[t[2]];
      // paksa segitiga CCW di (a, y)
      if ((B[0] - A[0]) * (C[1] - A[1]) - (B[1] - A[1]) * (C[0] - A[0]) < 0) [A, B] = [B, A];
      // 'zy': CCW di (z, y) menghadap −X → tutup c0 (A,B,C), c1 (A,C,B). 'xy': CCW di (x, y) menghadap +Z → c1 (A,B,C), c0 (A,C,B)
      const lo = plane === 'zy' ? c0 : c1, hi = plane === 'zy' ? c1 : c0;
      this.tri(key, P(A[0], A[1], lo), P(B[0], B[1], lo), P(C[0], C[1], lo), [...uv(A, lo), ...uv(B, lo), ...uv(C, lo)]);
      this.tri(key, P(A[0], A[1], hi), P(C[0], C[1], hi), P(B[0], B[1], hi), [...uv(A, hi), ...uv(C, hi), ...uv(B, hi)]);
    }
  }

  /**
   * Permukaan parametrik kisi nu×nv: f(s, t) → titik lokal (s, t ∈ [0,1]). Normal dari turunan (beda pusat) — arah = ∂f/∂s × ∂f/∂t.
   * skip(i, j) = lewati sel (lubang robek). uvf(s, t) → [u, v].
   */
  grid(key: string, nu: number, nv: number, f: (s: number, t: number) => V3, uvf: (s: number, t: number) => [number, number],
    skip?: (i: number, j: number) => boolean, flip = false) {
    const b = this.bucket(key), base = b.pos.length / 3, e = 1e-3;
    const used = new Uint8Array((nu + 1) * (nv + 1));
    const cells: [number, number][] = [];
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
      if (skip?.(i, j)) continue;
      cells.push([i, j]);
      used[j * (nu + 1) + i] = used[j * (nu + 1) + i + 1] = used[(j + 1) * (nu + 1) + i] = used[(j + 1) * (nu + 1) + i + 1] = 1;
    }
    const map = new Int32Array((nu + 1) * (nv + 1)).fill(-1);
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
      if (!used[j * (nu + 1) + i]) continue;
      const s = i / nu, t = j / nv, p = f(s, t);
      const sa = Math.max(0, s - e), sb = Math.min(1, s + e), ta = Math.max(0, t - e), tb = Math.min(1, t + e);
      const ps = f(sb, t), pm = f(sa, t), qt = f(s, tb), qm = f(s, ta);
      const ux = ps[0] - pm[0], uy = ps[1] - pm[1], uz = ps[2] - pm[2], vx = qt[0] - qm[0], vy = qt[1] - qm[1], vz = qt[2] - qm[2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
      if (flip) { nx = -nx; ny = -ny; nz = -nz; }
      const [u, v] = uvf(s, t);
      map[j * (nu + 1) + i] = this.vert(b, p[0], p[1], p[2], nx, ny, nz, u, v);
    }
    for (const [i, j] of cells) {
      const a = map[j * (nu + 1) + i], c = map[j * (nu + 1) + i + 1], d = map[(j + 1) * (nu + 1) + i], g = map[(j + 1) * (nu + 1) + i + 1];
      if (flip) { this.t3(b, a, g, c); this.t3(b, a, d, g); } else { this.t3(b, a, c, g); this.t3(b, a, g, d); }
    }
    this.triangles += 2 * cells.length;
    void base;
  }

  /** Kipas poligon datar (genangan): titik tepi lokal (x, z) di ketinggian y, menghadap +Y. UV = proyeksi atas × uvScale. */
  fan(key: string, y: number, ring: [number, number][], uvScale = 1) {
    const b = this.bucket(key);
    let cx = 0, cz = 0;
    for (const [x, z] of ring) { cx += x; cz += z; }
    cx /= ring.length; cz /= ring.length;
    const c = this.vert(b, cx, y, cz, 0, 1, 0, cx * uvScale, -cz * uvScale);
    const ids = ring.map(([x, z]) => this.vert(b, x, y, z, 0, 1, 0, x * uvScale, -z * uvScale));
    for (let i = 0; i < ids.length; i++) this.t3(b, c, ids[(i + 1) % ids.length], ids[i]);
    this.triangles += ids.length;
  }

  // ───────────── hasil
  has(key: string) { return (this.buckets.get(key)?.idx.length ?? 0) > 0; }
  keys() { return [...this.buckets.keys()].filter(k => this.has(k)); }

  /** Geometri berindeks (position, normal, uv, color) satu bucket, atau null bila kosong. */
  geometry(key: string): THREE.BufferGeometry | null {
    const b = this.buckets.get(key);
    if (!b || !b.idx.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(b.nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(b.col, 3));
    g.setIndex(b.idx);
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }

  /** Jumlah segitiga satu bucket. */
  tris(key: string) { return (this.buckets.get(key)?.idx.length ?? 0) / 3; }
}

/** Matrix4 translasi + putaran Y (pembantu push). */
export function TRY(x: number, y: number, z: number, rotY = 0): THREE.Matrix4 {
  return new THREE.Matrix4().makeRotationY(rotY).setPosition(x, y, z);
}

/** Hash string → bilangan 32-bit (variasi deterministik per id objek). */
export function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** Campur dua warna hex sRGB (t di ruang sRGB) → hex. */
export function mixHex(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255, br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  const r = Math.round(ar + (br - ar) * t), g = Math.round(ag + (bg - ag) * t), bl = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (g << 8) | bl;
}

/** Kalikan kecerahan hex sRGB (k ≥ 0) → hex (dipotong 255). */
export function shadeHex(a: number, k: number): number {
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v * k)));
  return (f((a >> 16) & 255) << 16) | (f((a >> 8) & 255) << 8) | f(a & 255);
}
