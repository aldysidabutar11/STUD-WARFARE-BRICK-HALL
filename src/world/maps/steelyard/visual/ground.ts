// src/world/maps/steelyard/visual/ground.ts — tanah Steel Yard:
//   • tekstur MAKRO unik (kanvas 8 px/u, 144 × 176 u) yang "dilukis" dari data denah: variasi warna skala besar, pelat beton tua
//     (sambungan, retak, gompal) tertutup debu, jejak ban (tapak putus-putus), noda oli dekat mobil/drum, cincin basah genangan,
//     pasir menumpuk di kaki kontainer & pagar, AO kontak tajam di tapak benda; LOW (tanpa shadow map): bayangan matahari dilukis.
//     Tepi makro memudar ke warna dasar → menyambung mulus dengan tanah luar.
//   • mesh tanah dalam (kisi rapat 2 u di area bake, kasar di luar), tanah luar sampai ±460 u (warna verteks), bukit pasir di
//     kejauhan (seluruhnya di dalam far kamera 300 u dari sudut area main), genangan berbentuk tak beraturan. Mesa & pegunungan
//     ada di shader langit (tak terhingga) — butte 3D terlihat seperti bangunan, jadi tidak dipakai.
import * as THREE from 'three';
import { makeRng } from '../../../../core/Rng';
import type { SYContainer, SYFence, SYProp, SYPuddle } from '../layout';
import { CDIM } from './containers';
import { Geo, hashStr } from './geo';
import { PDIM } from './props';

export const MACRO = { x0: -72, z0: -88, w: 144, d: 176, ppu: 8 };
/** Warna dasar pasir (sRGB) — sama di tepi makro & tanah luar. */
export const SAND = 0xb3a084;

export interface GroundData {
  containers: SYContainer[]; props: SYProp[]; puddles: SYPuddle[]; fences: SYFence[];
  bounds: { x: [number, number]; z: [number, number] };
}
/** Tapak tambahan (benda latar di luar pagar) untuk AO kontak & pasir. col = benda padat → collider statis (build.ts). */
export interface Foot { cx: number; cz: number; hx: number; hz: number; rot: number; h: number; round?: boolean; col?: boolean }

type P2 = [number, number];
const rotPt = (cx: number, cz: number, rot: number, lx: number, lz: number): P2 => {
  const c = Math.cos(rot), s = Math.sin(rot);
  return [cx + lx * c + lz * s, cz - lx * s + lz * c];
};
const corners = (f: Foot, grow = 0): P2[] =>
  [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => rotPt(f.cx, f.cz, f.rot, a * (f.hx + grow), b * (f.hz + grow)));

/** Semua tapak benda dari data (kontainer, prop) — juga dipakai serpihan & bayangan LOW. */
export function footprints(data: GroundData): Foot[] {
  const out: Foot[] = [];
  for (const k of data.containers) out.push({ cx: k.cx, cz: k.cz, hx: CDIM.len[k.size] / 2, hz: CDIM.w / 2, rot: k.rotY, h: CDIM.h * k.stack });
  for (const p of data.props) {
    const [l, w, h] = PDIM[p.kind].map(v => v * (p.s ?? 1));
    const round = p.kind === 'spool' || p.kind === 'drum' || p.kind === 'tire';
    out.push({ cx: p.x, cz: p.z, hx: l / 2, hz: w / 2, rot: p.rotY, h, round });
  }
  return out;
}

/** Derau nilai halus 2D (CPU) untuk variasi tanah. */
function smooth2(seed: number, cell: number): (x: number, z: number) => number {
  const N = 64, r = makeRng(seed), g = new Float32Array(N * N);
  for (let i = 0; i < g.length; i++) g[i] = r();
  return (x, z) => {
    const fx = x / cell, fz = z / cell, xi = Math.floor(fx), zi = Math.floor(fz), tx = fx - xi, tz = fz - zi;
    const sx = tx * tx * (3 - 2 * tx), sz = tz * tz * (3 - 2 * tz);
    const at = (i: number, j: number) => g[(((j % N) + N) % N) * N + (((i % N) + N) % N)];
    const a = at(xi, zi), b = at(xi + 1, zi), c = at(xi, zi + 1), d = at(xi + 1, zi + 1);
    return (a + (b - a) * sx) * (1 - sz) + (c + (d - c) * sx) * sz;
  };
}

/** Lukis tekstur makro tanah dari data denah. lowShadows = lukis bayangan matahari (preset tanpa shadow map). */
export function groundMacro(data: GroundData, extra: Foot[], sunDir: THREE.Vector3, lowShadows: boolean, aniso: number): THREE.Texture {
  const { x0, z0, w, d, ppu } = MACRO, W = Math.round(w * ppu), H = Math.round(d * ppu);
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d')!;
  const rng = makeRng(424242);
  const world = () => g.setTransform(ppu, 0, 0, ppu, -x0 * ppu, -z0 * ppu);
  const reset = () => { g.setTransform(1, 0, 0, 1, 0, 0); g.filter = 'none'; g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; g.setLineDash([]); };
  const poly = (pts: P2[], c: CanvasRenderingContext2D = g) => { c.beginPath(); c.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]); c.closePath(); };
  // lapisan buram: bentuk digambar TANPA filter ke kanvas lapisan, lalu digabung SEKALI dengan blur (filter per bentuk di kanvas 2D
  // = satu lapisan offscreen + blur per panggilan → ratusan blur, ±700 ms saat tekstur pertama diunggah)
  const lcv = document.createElement('canvas'); lcv.width = W; lcv.height = H;
  const L = lcv.getContext('2d')!;
  const layer = (blurPx: number, draw: (c: CanvasRenderingContext2D) => void) => {
    L.setTransform(1, 0, 0, 1, 0, 0); L.clearRect(0, 0, W, H);
    L.setTransform(ppu, 0, 0, ppu, -x0 * ppu, -z0 * ppu);
    draw(L);
    g.setTransform(1, 0, 0, 1, 0, 0); g.filter = `blur(${blurPx}px)`; g.drawImage(lcv, 0, 0); g.filter = 'none';
    world();
  };
  const bx = data.bounds.x, bz = data.bounds.z;
  const feet = footprints(data);

  // 1) dasar + variasi warna skala besar (2 lapis derau kecil diperbesar halus)
  g.fillStyle = hex(SAND); g.fillRect(0, 0, W, H);
  const tones = ['#c4b08f', '#9f8c70', '#b39270', '#a59f90', '#bba58a', '#a8916f'];
  for (const [nx, nz, a] of [[36, 44, 0.42], [110, 134, 0.18]] as const) {
    const s = document.createElement('canvas'); s.width = nx; s.height = nz;
    const sg = s.getContext('2d')!;
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { sg.fillStyle = tones[Math.floor(rng() * tones.length)]; sg.fillRect(i, j, 1, 1); }
    g.globalAlpha = a; g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    g.drawImage(s, 0, 0, W, H);
  }
  g.globalAlpha = 1;
  world();

  // 2) pelat beton tua 8 × 8 u (terbuka di tengah, tertimbun pasir ke arah pagar)
  const expo = smooth2(91, 22), crackR = makeRng(77);
  for (let cz = Math.floor(bz[0] / 8) * 8; cz < bz[1]; cz += 8) for (let cx = Math.floor(bx[0] / 8) * 8; cx < bx[1]; cx += 8) {
    const mx = cx + 4, mz = cz + 4;
    const e = expo(mx, mz) - (mx / (bx[1] + 6)) ** 2 * 0.35 - (mz / (bz[1] + 6)) ** 2 * 0.28;
    if (e < 0.36) continue;
    const a = Math.min(1, (e - 0.36) * 3.2) * 0.8;
    const t = 150 + Math.floor(crackR() * 26);
    g.fillStyle = `rgba(${t + 18},${t + 12},${t},${a})`;
    g.fillRect(cx + 0.06, cz + 0.06, 7.88, 7.88);
    // sambungan pelat: garis tipis sedikit bergelombang (bukan kisi ubin sempurna)
    g.strokeStyle = `rgba(70,60,50,${0.32 * a})`; g.lineWidth = 0.08;
    g.beginPath();
    const jit = () => (crackR() - 0.5) * 0.12;
    g.moveTo(cx + jit(), cz + jit()); g.lineTo(cx + 4 + jit(), cz + jit()); g.lineTo(cx + 8 + jit(), cz + jit());
    g.moveTo(cx + jit(), cz + jit()); g.lineTo(cx + jit(), cz + 4 + jit()); g.lineTo(cx + jit(), cz + 8 + jit());
    g.stroke();
    // retak (jalan acak) + gompal sudut
    const nc = Math.floor(crackR() * 3);
    for (let k = 0; k < nc; k++) {
      let px = cx + crackR() * 8, pz = cz + crackR() * 8, ang = crackR() * Math.PI * 2;
      g.beginPath(); g.moveTo(px, pz);
      const steps = 6 + Math.floor(crackR() * 10);
      for (let s = 0; s < steps; s++) { ang += (crackR() - 0.5) * 1.1; px += Math.cos(ang) * 0.55; pz += Math.sin(ang) * 0.55; g.lineTo(px, pz); }
      g.strokeStyle = `rgba(45,38,32,${0.55 * a})`; g.lineWidth = 0.05 + crackR() * 0.06; g.stroke();
    }
    if (crackR() < 0.35) {
      const sx = cx + (crackR() < 0.5 ? 0 : 8), sz = cz + (crackR() < 0.5 ? 0 : 8), r = 0.3 + crackR() * 0.5;
      g.fillStyle = `rgba(92,82,70,${0.5 * a})`;
      poly([[sx, sz], [sx + (crackR() - 0.5) * 2 * r, sz + r], [sx + r, sz + (crackR() - 0.5) * 2 * r]]); g.fill();
    }
  }
  // debu menutupi beton (bercak pasir lembut)
  layer(6, (c) => {
    for (let i = 0; i < 260; i++) {
      const x = bx[0] + rng() * (bx[1] - bx[0]), z = bz[0] + rng() * (bz[1] - bz[0]), r = 1 + rng() * 4;
      c.fillStyle = `rgba(190,170,136,${0.18 + rng() * 0.25})`;
      c.beginPath(); c.ellipse(x, z, r * (1 + rng()), r, rng() * 3, 0, Math.PI * 2); c.fill();
    }
  });

  // 3) jejak ban (dua jalur paralel, tapak putus-putus) — sebelum pasir & AO agar tertimbun di kaki benda
  for (let k = 0; k < 7; k++) {
    const pts: P2[] = [];
    const side = rng() < 0.5 ? -1 : 1, along = rng() < 0.65;
    const n = 4;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      if (along) pts.push([(rng() - 0.5) * (bx[1] - bx[0]) * 0.8, bz[0] - 6 + t * (bz[1] - bz[0] + 12)]);
      else pts.push([bx[0] - 6 + t * (bx[1] - bx[0] + 12), side * (8 + rng() * 40)]);
    }
    const curve = new THREE.SplineCurve(pts.map(p => new THREE.Vector2(p[0], p[1]))).getSpacedPoints(90);
    const gauge = rng() < 0.5 ? 1.35 : 2.1;
    for (const o of [-gauge, gauge]) {
      const line: P2[] = curve.map((p, i) => {
        const q = curve[Math.min(curve.length - 1, i + 1)], r0 = curve[Math.max(0, i - 1)];
        const tx = q.x - r0.x, tz = q.y - r0.y, l = Math.hypot(tx, tz) || 1;
        return [p.x - tz / l * o, p.y + tx / l * o];
      });
      g.beginPath(); g.moveTo(line[0][0], line[0][1]); for (const p of line) g.lineTo(p[0], p[1]);
      g.strokeStyle = 'rgba(86,70,52,0.17)'; g.lineWidth = 0.78; g.lineJoin = 'round'; g.stroke();
      g.setLineDash([0.22, 0.2]); g.strokeStyle = 'rgba(62,50,38,0.16)'; g.lineWidth = 0.62; g.stroke(); g.setLineDash([]);
    }
  }

  // 4) pasir menumpuk di kaki kontainer/prop & sepanjang pagar (sisi dalam)
  layer(9, (c) => {
    c.fillStyle = 'rgba(206,188,152,0.42)';
    for (const f of [...feet, ...extra]) if (!f.round) { poly(corners(f, 1.1 + (f.h > 5 ? 0.6 : 0)), c); c.fill(); }
    for (const fe of data.fences) {
      c.strokeStyle = 'rgba(206,188,152,0.5)'; c.lineWidth = 2.6;
      c.beginPath(); c.moveTo(fe.a[0], fe.a[1]); c.lineTo(fe.b[0], fe.b[1]); c.stroke();
    }
  });

  // 5) noda oli (dekat mobil & drum + acak), cincin basah genangan
  layer(2, (c) => {
    const stain = (x: number, z: number, r: number) => {
      for (let i = 0; i < 5; i++) {
        const gx = x + (rng() - 0.5) * r, gz = z + (rng() - 0.5) * r, rr = r * (0.3 + rng() * 0.5);
        const gd = c.createRadialGradient(gx, gz, 0, gx, gz, rr);
        gd.addColorStop(0, 'rgba(34,29,24,0.5)'); gd.addColorStop(1, 'rgba(34,29,24,0)');
        c.fillStyle = gd; c.beginPath(); c.arc(gx, gz, rr, 0, Math.PI * 2); c.fill();
      }
    };
    for (const p of data.props) {
      if (p.kind === 'car') { const [a, b] = rotPt(p.x, p.z, p.rotY, 3.9, 0); stain(a, b, 2.2); const [c2, d2] = rotPt(p.x, p.z, p.rotY, -2, 1); stain(c2, d2, 1.4); }
      if (p.kind === 'drum' && rng() < 0.7) stain(p.x + (rng() - 0.5) * 2, p.z + (rng() - 0.5) * 2, 1.1);
    }
    for (let i = 0; i < 7; i++) stain(bx[0] + 4 + rng() * (bx[1] - bx[0] - 8), bz[0] + 4 + rng() * (bz[1] - bz[0] - 8), 0.8 + rng() * 1.2);
  });
  layer(5, (c) => {
    for (const pd of data.puddles) {
      for (const [k, col] of [[1.5, 'rgba(98,82,60,0.42)'], [1.18, 'rgba(70,58,44,0.5)']] as const) {
        c.fillStyle = col; c.beginPath(); c.ellipse(pd.x, pd.z, pd.rx * k, pd.rz * k, -pd.rotY, 0, Math.PI * 2); c.fill();
      }
    }
  });

  // 6) AO kontak: lebar lembut + tepi tajam
  layer(10, (c) => {
    c.fillStyle = 'rgba(42,34,26,0.2)';
    for (const f of [...feet, ...extra]) if (f.h > 1.5) {
      if (f.round) { c.beginPath(); c.arc(f.cx, f.cz, f.hx + 0.6, 0, Math.PI * 2); c.fill(); } else { poly(corners(f, 0.7), c); c.fill(); }
    }
  });
  layer(2.5, (c) => {
    for (const f of [...feet, ...extra]) {
      c.fillStyle = f.h > 1 ? 'rgba(36,29,22,0.62)' : 'rgba(40,32,24,0.42)';
      if (f.round) { c.beginPath(); c.arc(f.cx, f.cz, f.hx * 0.92 + 0.06, 0, Math.PI * 2); c.fill(); }
      else { poly(corners(f, 0.08), c); c.fill(); }
    }
    for (const fe of data.fences) {
      c.strokeStyle = 'rgba(40,32,24,0.4)'; c.lineWidth = 0.9;
      c.beginPath(); c.moveTo(fe.a[0], fe.a[1]); c.lineTo(fe.b[0], fe.b[1]); c.stroke();
    }
  });

  // 7) LOW: bayangan matahari dilukis (preset tanpa shadow map) — proyeksi tapak sepanjang arah matahari. Hanya benda yang juga
  //    melempar bayangan di MEDIUM+ (kontainer/prop denah + pagar); latar di luar pagar (`extra`) TIDAK: di MEDIUM+ tanpa bayangan,
  //    dan tapaknya kasar (kaki gantry crane = balok padat 2 × 18 setinggi 24 → dulu melukis bayangan pekat ±29 u ke area main Barat).
  if (lowShadows && sunDir.y < -0.05) layer(2, (c) => {
    c.fillStyle = 'rgba(28,24,20,0.36)';
    const ox = sunDir.x / -sunDir.y, oz = sunDir.z / -sunDir.y;
    for (const f of feet) {
      const cs = f.round ? circlePts(f.cx, f.cz, f.hx * 0.95, 10) : corners(f);
      poly(hull([...cs, ...cs.map(([x, z]) => [x + ox * f.h, z + oz * f.h] as P2)]), c); c.fill();
    }
    for (const fe of data.fences) {
      const a: P2 = [fe.a[0], fe.a[1]], b: P2 = [fe.b[0], fe.b[1]];
      poly(hull([a, b, [b[0] + ox * fe.h, b[1] + oz * fe.h], [a[0] + ox * fe.h, a[1] + oz * fe.h]]), c); c.fill();
    }
  });

  // 8) kerikil & butir besar tersebar
  reset(); world();
  for (let i = 0; i < 3200; i++) {
    const x = x0 + rng() * w, z = z0 + rng() * d, r = 0.04 + rng() ** 2 * 0.1;
    g.fillStyle = rng() < 0.5 ? 'rgba(232,218,192,0.5)' : 'rgba(70,58,46,0.45)';
    g.fillRect(x - r, z - r, r * 2, r * 2);
  }

  // 9) tepi makro memudar ke warna dasar (sambungan dengan tanah luar): opak di tepi kanvas → transparan 5 u di luar pagar
  reset();
  const bandX = Math.max(8, (bx[0] - x0 - 5) * ppu), bandZ = Math.max(8, (bz[0] - z0 - 5) * ppu);
  const fade = (gx0: number, gy0: number, gx1: number, gy1: number, rx: number, ry: number, rw: number, rh: number) => {
    const gd = g.createLinearGradient(gx0, gy0, gx1, gy1);
    gd.addColorStop(0, hex(SAND, 1)); gd.addColorStop(1, hex(SAND, 0));
    g.fillStyle = gd; g.fillRect(rx, ry, rw, rh);
  };
  fade(0, 0, 0, bandZ, 0, 0, W, bandZ);
  fade(0, H, 0, H - bandZ, 0, H - bandZ, W, bandZ);
  fade(0, 0, bandX, 0, 0, 0, bandX, H);
  fade(W, 0, W - bandX, 0, W - bandX, 0, bandX, H);

  // 10) benda latar (di luar pagar): pasir + AO setelah pudar tepi
  if (extra.length) {
    layer(8, (c) => { c.fillStyle = 'rgba(206,188,152,0.4)'; for (const f of extra) { poly(corners(f, 1.4), c); c.fill(); } });
    layer(3, (c) => { c.fillStyle = 'rgba(38,30,22,0.5)'; for (const f of extra) { poly(corners(f, 0.1), c); c.fill(); } });
  }
  reset();
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.anisotropy = aniso;
  t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  return t;
}

const hex = (c: number, a = 1) => `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},${a})`;
function circlePts(cx: number, cz: number, r: number, n: number): P2[] {
  return Array.from({ length: n }, (_, i) => [cx + Math.cos(i / n * Math.PI * 2) * r, cz + Math.sin(i / n * Math.PI * 2) * r] as P2);
}
/** Selubung cembung (monotone chain). */
function hull(p: P2[]): P2[] {
  const s = [...p].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o: P2, a: P2, b: P2) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo: P2[] = [], up: P2[] = [];
  for (const q of s) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (let i = s.length - 1; i >= 0; i--) { const q = s[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  return [...lo.slice(0, -1), ...up.slice(0, -1)];
}

// ───────────────────────── mesh tanah
/** Tanah dalam (makro): kisi rapat 2 u di area bake (±fine), kasar 8 u di luar sampai tepi makro. Bucket 'ground'. */
export function emitGround(geo: Geo, fine: { x: [number, number]; z: [number, number] }) {
  const { x0, z0, w, d } = MACRO;
  const axis = (a0: number, a1: number, f0: number, f1: number) => {
    const v: number[] = [];
    for (let a = a0; a < f0 - 1e-6; a += 8) v.push(a);
    for (let a = f0; a < f1 - 1e-6; a += 2) v.push(a);
    for (let a = f1; a < a1 - 1e-6; a += 8) v.push(a);
    v.push(a1);
    return v;
  };
  const xs = axis(x0, x0 + w, Math.floor(fine.x[0] / 2) * 2, Math.ceil(fine.x[1] / 2) * 2);
  const zs = axis(z0, z0 + d, Math.floor(fine.z[0] / 2) * 2, Math.ceil(fine.z[1] / 2) * 2);
  geo.color(0xffffff);
  const uv = (x: number, z: number) => [(x - x0) / w, 1 - (z - z0) / d];
  for (let j = 0; j < zs.length - 1; j++) for (let i = 0; i < xs.length - 1; i++) {
    const xa = xs[i], xb = xs[i + 1], za = zs[j], zb = zs[j + 1];
    geo.quad('ground', [xa, 0, zb], [xb, 0, zb], [xb, 0, za], [xa, 0, za], [...uv(xa, zb), ...uv(xb, zb), ...uv(xb, za), ...uv(xa, za)], 1, 1, [0, 1, 0]);
  }
}

/** Tanah luar (cincin 4 strip sampai ±R, tumpang 2 u di bawah tanah dalam) + bukit pasir. Bucket 'outer'. */
export function emitOuter(geo: Geo, seed: number) {
  const { x0, z0, w, d } = MACRO, R = 460, ov = 2;
  const ix0 = x0 + ov, ix1 = x0 + w - ov, iz0 = z0 + ov, iz1 = z0 + d - ov;
  const nz = smooth2(seed, 55), nz2 = smooth2(seed + 1, 17);
  const base = new THREE.Color().setHex(SAND, THREE.SRGBColorSpace);
  const far = new THREE.Color().setHex(0xa48e6e, THREE.SRGBColorSpace);
  const tint = (x: number, z: number, c: THREE.Color) => {
    const dEdge = Math.max(0, Math.max(Math.abs(x) - (x0 + w), Math.abs(z) - (z0 + d)));
    const k = Math.min(1, dEdge / 40);
    const v = 1 + ((nz(x, z) - 0.5) * 0.34 + (nz2(x, z) - 0.5) * 0.1) * k;
    c.copy(base).lerp(far, Math.min(1, dEdge / 160) * 0.7).multiplyScalar(v);
    c.r *= 1 + (nz2(z, x) - 0.5) * 0.05 * k;
  };
  const prevTint = geo.tint;
  geo.tint = (p, _n, c) => tint(p.x, p.z, c);
  const strip = (xa: number, xb: number, za: number, zb: number) => {
    const nx = Math.max(1, Math.round((xb - xa) / 36)), nzz = Math.max(1, Math.round((zb - za) / 36));
    geo.quad('outer', [xa, -0.02, zb], [xb, -0.02, zb], [xb, -0.02, za], [xa, -0.02, za], [0, 0, 1, 0, 1, 1, 0, 1], nx, nzz, [0, 1, 0]);
  };
  strip(-R, R, -R, iz0); strip(-R, R, iz1, R); strip(-R, ix0, iz0, iz1); strip(ix1, R, iz0, iz1);

  // bukit pasir: punggung memanjang, lereng angin landai & lereng balik curam, sedikit lebih gelap/hangat dari dataran
  const rng = makeRng(seed + 7);
  const dunes = 15;
  for (let i = 0; i < dunes; i++) {
    const ang = (i / dunes) * Math.PI * 2 + rng() * 0.4, dist = 105 + rng() * 85;
    const cx = Math.cos(ang) * dist * 0.92, cz = Math.sin(ang) * dist;
    // seluruh bukit di dalam far kamera (300 u) dari sudut area main terjauh
    const reach = Math.hypot(Math.abs(cx) + 42, Math.abs(cz) + 56);
    const rx = Math.min(45 + rng() * 45, 296 - reach), rz = Math.min(rx * 0.55, 18 + rng() * 18);
    if (rx < 14) continue;
    const hgt = Math.min(rz * 0.45, 3 + rng() * 7), rot = ang + Math.PI / 2 + (rng() - 0.5) * 0.7;
    const crest = 0.15 + rng() * 0.3, tone = 0.92 + rng() * 0.12;
    geo.tint = (p, n, c) => {
      tint(p.x, p.z, c);
      const up = Math.min(1, Math.max(0, p.y / hgt));
      c.multiplyScalar(tone * (0.93 + up * 0.12 + n.y * 0.03));
      c.r *= 1.03; c.b *= 0.95;
    };
    geo.push(new THREE.Matrix4().makeRotationY(rot).setPosition(cx, 0, cz));
    geo.grid('outer', 16, 8, (s, t) => {
      const a = (s - 0.5) * 2, b = (t - 0.5) * 2;
      const along = Math.max(0, 1 - a * a);
      const cross = b < crest ? Math.pow(Math.max(0, (b + 1) / (crest + 1)), 1.7) : Math.pow(Math.max(0, (1 - b) / (1 - crest)), 0.75);
      const y = hgt * Math.pow(along, 1.3) * cross * (1 + 0.12 * Math.sin(a * 6 + i));
      return [a * rx, y < 0.02 ? -0.3 : y, b * rz];
    }, () => [0, 0], undefined, true);
    geo.pop();
  }
  geo.tint = prevTint;
}

/** Genangan: kipas berbentuk tak beraturan (tepi bergelombang) sedikit di atas tanah. Bucket 'puddle'. */
export function emitPuddles(geo: Geo, puddles: SYPuddle[]) {
  for (const p of puddles) {
    const rng = makeRng(hashStr(`pd${p.x.toFixed(1)},${p.z.toFixed(1)}`));
    const ph = [rng() * 6, rng() * 6, rng() * 6], n = 30;
    const ring: [number, number][] = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const r = 1 + 0.12 * Math.sin(3 * a + ph[0]) + 0.07 * Math.sin(5 * a + ph[1]) + 0.05 * Math.sin(9 * a + ph[2]);
      const [x, z] = rotPt(p.x, p.z, p.rotY, Math.cos(a) * p.rx * r, Math.sin(a) * p.rz * r);
      ring.push([x, z]);
    }
    // urutan sudut naik di bidang (x, z) dunia (rotasi menjaga orientasi) — lihat Geo.fan
    geo.color(0xffffff);
    geo.fan('puddle', 0.02, ring, 0.12);
  }
}
