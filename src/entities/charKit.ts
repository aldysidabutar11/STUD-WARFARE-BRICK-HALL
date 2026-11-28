// src/entities/charKit.ts — perkakas bersama tampilan karakter prosedural (atlas kanvas, balok ber-UV, kuas kanvas,
// swatch bersama). Dipakai CharacterArt.ts (Biru/Merah pria & wanita) dan CharacterVenny.ts (karakter khusus Venny).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { XCFG } from '../config/extraConfig';
import type { Rng } from '../core/Rng';

export type G = CanvasRenderingContext2D;
export type Painter = (g: G, w: number, h: number, rng: Rng) => void;
export interface Rect { x: number; y: number; w: number; h: number }
export type FaceKey = 'px' | 'nx' | 'py' | 'ny' | 'pz' | 'nz';
export type Faces = Partial<Record<FaceKey | 'all', Rect>>;
export type V3 = [number, number, number];

export const RIG = XCFG.rig, COL = RIG.colors;
export const PX = 80;          // piksel atlas per unit dunia
export const ATLAS = 1024;
export const FACE_ORDER: FaceKey[] = ['px', 'nx', 'py', 'ny', 'pz', 'nz']; // urutan grup BoxGeometry (nz = DEPAN karakter, −Z)
/** Skala kanvas topeng menyala terhadap atlas (setengah resolusi: hemat memori, UV sama). */
export const GLOW_SCALE = 0.5;

export const css = (c: number) => '#' + c.toString(16).padStart(6, '0');
/** Warna dikali faktor terang (f < 1 lebih gelap). */
export const tone = (c: number, f: number) => {
  const r = Math.min(255, ((c >> 16) & 255) * f) | 0, g = Math.min(255, ((c >> 8) & 255) * f) | 0, b = Math.min(255, (c & 255) * f) | 0;
  return `rgb(${r},${g},${b})`;
};

// ───────────────────────────────────────── atlas
export class Atlas {
  readonly canvas = document.createElement('canvas');
  readonly g: G;
  private cx = 2; private cy = 2; private rowH = 0;
  /** readback: pelukis membaca piksel kembali (getImageData, mis. wajah/rambut Venny) → kanvas CPU (willReadFrequently) — tanpa itu
   *  Chrome membaca balik dari GPU berkali-kali (lambat + peringatan konsol). */
  constructor(private rng: Rng, readback = false) {
    this.canvas.width = ATLAS; this.canvas.height = ATLAS;
    this.g = this.canvas.getContext('2d', { willReadFrequently: readback })!;
  }
  /** Region seukuran (wu × hu) unit dunia. */
  region(wu: number, hu: number, paint: Painter): Rect { return this.px(Math.round(wu * PX), Math.round(hu * PX), paint); }

  /** Topeng MENYALA (karakter operator): kanvas setengah resolusi, hitam = tidak menyala, putih = menyala penuh (warna = warna atlas);
   *  dibaca shader karakter (BlockyCharacter, uGlow) sebagai emisi — tidak terpengaruh cahaya/bayangan. Dibuat saat pertama dipakai. */
  glowCanvas: HTMLCanvasElement | null = null;
  private gg: G | null = null;
  /** Region w×h piksel + lapisan menyala: `glow` melukis intensitas di koordinat lokal yang sama dengan `paint`. */
  pxGlow(w: number, h: number, paint: Painter, glow: Painter): Rect {
    const r = this.px(w, h, paint), g = this.glowCtx();
    g.save(); g.setTransform(GLOW_SCALE, 0, 0, GLOW_SCALE, r.x * GLOW_SCALE, r.y * GLOW_SCALE);
    g.beginPath(); g.rect(0, 0, r.w, r.h); g.clip();
    glow(g, r.w, r.h, this.rng);
    g.restore();
    return r;
  }
  /** Seperti region(), dengan lapisan menyala. */
  regionGlow(wu: number, hu: number, paint: Painter, glow: Painter): Rect {
    return this.pxGlow(Math.round(wu * PX), Math.round(hu * PX), paint, glow);
  }
  private glowCtx(): G {
    if (!this.gg) {
      const c = this.glowCanvas = document.createElement('canvas');
      c.width = c.height = ATLAS * GLOW_SCALE;
      this.gg = c.getContext('2d')!;
      this.gg.fillStyle = '#000'; this.gg.fillRect(0, 0, c.width, c.height);
    }
    return this.gg;
  }
  /** Region w×h piksel, digambar painter di koordinat lokal; tepi di-bleed 1 px (aman untuk mipmap). */
  px(w: number, h: number, paint: Painter): Rect {
    w = Math.max(6, w); h = Math.max(6, h);
    const pad = 4;
    if (this.cx + w + pad > ATLAS) { this.cx = 2; this.cy += this.rowH + pad; this.rowH = 0; }
    if (this.cy + h + 2 > ATLAS) throw new Error('CharacterArt: atlas penuh');
    const r = { x: this.cx, y: this.cy, w, h };
    this.cx += w + pad; this.rowH = Math.max(this.rowH, h);
    const g = this.g;
    g.save(); g.translate(r.x, r.y); g.beginPath(); g.rect(0, 0, w, h); g.clip();
    paint(g, w, h, this.rng);
    g.restore();
    const c = this.canvas;
    g.drawImage(c, r.x, r.y, w, 1, r.x, r.y - 1, w, 1);
    g.drawImage(c, r.x, r.y + h - 1, w, 1, r.x, r.y + h, w, 1);
    g.drawImage(c, r.x, r.y - 1, 1, h + 2, r.x - 1, r.y - 1, 1, h + 2);
    g.drawImage(c, r.x + w - 1, r.y - 1, 1, h + 2, r.x + w, r.y - 1, 1, h + 2);
    return r;
  }
}

export const _m = new THREE.Matrix4(), _e = new THREE.Euler();
/** Balok dengan UV per sisi ke region atlas (sisi dilihat dari luar, tegak, tidak tercermin). */
export function box(size: V3, pos: V3, faces: Faces, rot?: V3): THREE.BufferGeometry {
  const geo = new THREE.BoxGeometry(size[0], size[1], size[2]);
  const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
  for (let f = 0; f < 6; f++) {
    const r = faces[FACE_ORDER[f]] ?? faces.all;
    if (!r) throw new Error('CharacterArt: sisi tanpa region');
    for (let i = 0; i < 4; i++) {
      const k = f * 4 + i, u = uv.getX(k), v = uv.getY(k);
      uv.setXY(k, (r.x + 0.5 + u * (r.w - 1)) / ATLAS, 1 - (r.y + 0.5 + (1 - v) * (r.h - 1)) / ATLAS);
    }
  }
  if (rot) geo.applyMatrix4(_m.makeRotationFromEuler(_e.set(rot[0], rot[1], rot[2])));
  geo.translate(pos[0], pos[1], pos[2]);
  return geo;
}

export function merge(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const g = mergeGeometries(list, false)!;
  for (const x of list) x.dispose();
  g.computeBoundingSphere();
  return g;
}

// ───────────────────────────────────────── kuas kanvas
export function fill(g: G, w: number, h: number, c: string) { g.fillStyle = c; g.fillRect(0, 0, w, h); }
export function grain(g: G, w: number, h: number, rng: Rng, amt = 0.06, size = 2) {
  const n = Math.round((w * h) / 10);
  for (let i = 0; i < n; i++) {
    g.fillStyle = rng() < 0.5 ? `rgba(0,0,0,${amt * (0.5 + rng())})` : `rgba(255,255,255,${amt * 0.6 * (0.5 + rng())})`;
    g.fillRect(rng() * w, rng() * h, size, size);
  }
}
export function shade(g: G, w: number, h: number, top = 0.07, bottom = 0.16) {
  const gr = g.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, `rgba(255,255,255,${top})`); gr.addColorStop(0.45, 'rgba(255,255,255,0)'); gr.addColorStop(1, `rgba(0,0,0,${bottom})`);
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
}
export function edge(g: G, w: number, h: number, a = 0.3, t = 2) {
  g.strokeStyle = `rgba(0,0,0,${a})`; g.lineWidth = t; g.strokeRect(t / 2, t / 2, w - t, h - t);
}
export function rrect(g: G, x: number, y: number, w: number, h: number, r: number) { g.beginPath(); g.roundRect(x, y, w, h, r); }
export function stitch(g: G, x1: number, y1: number, x2: number, y2: number, c = 'rgba(0,0,0,0.35)', lw = 1) {
  g.save(); g.strokeStyle = c; g.lineWidth = lw; g.setLineDash([3, 3]);
  g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); g.restore();
}
export function blob(g: G, x: number, y: number, r: number, rng: Rng) {
  g.beginPath();
  for (let i = 0; i <= 8; i++) {
    const a = (i / 8) * Math.PI * 2, rr = r * (0.55 + rng() * 0.7);
    const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr * 0.7;
    if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
  }
  g.closePath(); g.fill();
}
/** Titik bercak organik (lonjong mendatar) di sekitar (x, y). */
export function blobPts(x: number, y: number, r: number, rng: Rng, m = 9): [number, number][] {
  const pts: [number, number][] = [], tilt = (rng() - 0.5) * 0.8, ca = Math.cos(tilt), sa = Math.sin(tilt);
  for (let j = 0; j < m; j++) {
    const a = (j / m) * Math.PI * 2, rr = r * (0.45 + rng() * 0.85);
    const px = Math.cos(a) * rr * 1.4, py = Math.sin(a) * rr * 0.72;                  // lonjong, sedikit miring acak
    pts.push([x + px * ca - py * sa, y + px * sa + py * ca]);
  }
  return pts;
}
/** Isi kurva halus (quadratic lewat titik tengah antar-titik) — bercak loreng membulat. */
export function fillSmooth(g: G, pts: [number, number][], ox = 0, oy = 0) {
  const m = pts.length, mid = (a: [number, number], b: [number, number]) => [(a[0] + b[0]) / 2 + ox, (a[1] + b[1]) / 2 + oy];
  const s = mid(pts[m - 1], pts[0]);
  g.beginPath(); g.moveTo(s[0], s[1]);
  for (let j = 0; j < m; j++) { const q = mid(pts[j], pts[(j + 1) % m]); g.quadraticCurveTo(pts[j][0] + ox, pts[j][1] + oy, q[0], q[1]); }
  g.closePath(); g.fill();
}
export function smoothBlob(g: G, x: number, y: number, r: number, rng: Rng) { fillSmooth(g, blobPts(x, y, r, rng)); }
export function camo(g: G, w: number, h: number, rng: Rng, base: string, cols: string[], k = 1) {
  fill(g, w, h, base);
  const n = Math.max(3, Math.round(((w * h) / 420) * k));
  for (let i = 0; i < n; i++) { g.fillStyle = cols[i % cols.length]; blob(g, rng() * w, rng() * h, 5 + rng() * 11, rng); }
}
/** Pita jari kulit (sarung tangan tanpa jari) di bagian bawah sisi lengan. */
export function fingers(g: G, w: number, y: number, h: number) {
  g.fillStyle = css(COL.finger); g.fillRect(0, y, w, h);
  g.fillStyle = 'rgba(0,0,0,0.28)';
  for (let i = 1; i < 4; i++) g.fillRect((w * i) / 4 - 1, y, 2, h);
  g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(0, y, w, 2);
}
/** Tali/strap horizontal dengan jahitan. */
export function band(g: G, w: number, y: number, h: number, c: string) {
  g.fillStyle = c; g.fillRect(0, y, w, h);
  stitch(g, 0, y + 2, w, y + 2, 'rgba(255,255,255,0.10)'); stitch(g, 0, y + h - 2, w, y + h - 2, 'rgba(255,255,255,0.10)');
}

// ───────────────────────────────────────── swatch bersama
export interface Common { T: Rect; metal: Rect; metalDark: Rect; glove: Rect; gloveCuff: Rect; gloveBottom: Rect; grenade: Rect }
export function commonSwatches(A: Atlas): Common {
  return {
    T: A.px(8, 8, (g, w, h) => g.clearRect(0, 0, w, h)),
    metal: A.px(32, 32, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#c4c8cd'); gr.addColorStop(1, '#5d6268');
      g.fillStyle = gr; g.fillRect(0, 0, w, h); edge(g, w, h, 0.4);
    }),
    metalDark: A.px(32, 32, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#6b7077'); gr.addColorStop(1, '#2c2f33');
      g.fillStyle = gr; g.fillRect(0, 0, w, h); edge(g, w, h, 0.5);
    }),
    glove: A.px(48, 48, (g, w, h, rng) => { fill(g, w, h, css(COL.glove)); grain(g, w, h, rng, 0.08); shade(g, w, h, 0.06, 0.2); edge(g, w, h, 0.5); }),
    gloveCuff: A.px(80, 32, (g, w, h, rng) => {
      fill(g, w, h, css(COL.glove)); grain(g, w, h, rng, 0.08);
      g.fillStyle = 'rgba(255,255,255,0.10)'; rrect(g, w * 0.3, h * 0.25, w * 0.4, h * 0.5, 3); g.fill();  // pelat punggung tangan
      shade(g, w, h, 0.08, 0.25); edge(g, w, h, 0.55);
    }),
    gloveBottom: A.px(80, 80, (g, w, h, rng) => { fill(g, w, h, css(COL.glove)); grain(g, w, h, rng, 0.08); fingers(g, w, 0, h * 0.35); edge(g, w, h, 0.5); }),
    grenade: A.px(32, 40, (g, w, h) => {
      fill(g, w, h, '#4f5b31');
      g.strokeStyle = 'rgba(0,0,0,0.45)'; g.lineWidth = 1.5;
      for (let x = w / 4; x < w; x += w / 4) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
      for (let y = h / 5; y < h; y += h / 5) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
      const gr = g.createRadialGradient(w * 0.35, h * 0.3, 2, w * 0.5, h * 0.5, w * 0.8);
      gr.addColorStop(0, 'rgba(255,255,255,0.25)'); gr.addColorStop(1, 'rgba(0,0,0,0.25)'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    }),
  };
}

export const S = <T extends readonly number[]>(t: T) => [t[0], t[1], t[2]] as V3;
