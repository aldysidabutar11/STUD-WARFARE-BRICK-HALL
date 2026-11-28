// src/entities/skins/kit.ts — perkakas karakter operator (10 desain pengguna Karakter/<NAMA>.png, hanya acuan; semua prosedural):
// tipe build, pelukis bersama (kain, pelat zirah berpaku, MOLLE, kantong, gesper, pelindung lutut segi delapan, sepatu bot, loreng
// poligon, serat karbon, kain robek, jaring ghillie, peluru, kisi, garis hazard) + lensa/visor MENYALA (warna atlas + topeng glow)
// + tangan blocky. Gaya sama dengan CharacterArt.ts: atlas 1024² per karakter, balok ber-UV digabung per bagian tubuh.
import type * as THREE from 'three';
import type { Rng } from '../../core/Rng';
import type { PartKey } from '../BlockyCharacter';
import { Atlas, css, edge, fill, grain, rrect, shade, stitch, type Common, type G, type Painter, type Rect } from '../charKit';

export type Geo = THREE.BufferGeometry;
/** Hasil build satu karakter: geometri per bagian (bingkai lokal hitbox GDD) + lengan per tim (ban lengan) + warna serpihan. */
export interface SkinBuild {
  head: Geo; upper: Geo; lower: Geo; legR: Geo; legL: Geo;
  /** Lengan o = +1 kanan / −1 kiri dengan ban lengan warna tim (region `band`). Dipanggil sekali per tim. */
  arm(o: 1 | -1, band: Rect): Geo;
  chip: Record<PartKey, number>;
}
/** Warna lengan FPS (Viewmodel): lengan baju, manset, sarung tangan, jari. */
export interface SkinFps { sleeve: number; cuff: number; glove: number; finger: number }
export interface SkinDef { seed: number; fps: SkinFps; build(A: Atlas, cm: Common): SkinBuild }

export const SKIN_FINGER = 0xdcb48a;
export const rgba = (c: number, a: number) => `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},${a})`;
export const gray = (v: number) => { const k = Math.round(Math.max(0, Math.min(1, v)) * 255); return `rgb(${k},${k},${k})`; };
/** Lapisan menyala rata seluruh region (v 0..1). */
export const glowAll = (v = 1): Painter => (g, w, h) => { g.fillStyle = gray(v); g.fillRect(0, 0, w, h); };

// ───────────────────────────────────────── bentuk
export function octagon(g: G, x: number, y: number, w: number, h: number, k = 0.3) {
  g.beginPath(); g.moveTo(x + w * k, y); g.lineTo(x + w * (1 - k), y); g.lineTo(x + w, y + h * k); g.lineTo(x + w, y + h * (1 - k));
  g.lineTo(x + w * (1 - k), y + h); g.lineTo(x + w * k, y + h); g.lineTo(x, y + h * (1 - k)); g.lineTo(x, y + h * k); g.closePath();
}
export function poly(g: G, pts: readonly (readonly [number, number])[], w = 1, h = 1) {
  g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x * w, y * h) : g.moveTo(x * w, y * h))); g.closePath();
}
export function rivets(g: G, w: number, h: number, r: number, inset = 0.14) {
  for (const [x, y] of [[inset, inset], [1 - inset, inset], [inset, 1 - inset], [1 - inset, 1 - inset]] as const) rivet(g, w * x, h * y, r);
}
export function rivet(g: G, x: number, y: number, r: number) {
  g.fillStyle = 'rgba(0,0,0,0.55)'; g.beginPath(); g.arc(x + 0.7, y + 0.7, r, 0, Math.PI * 2); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.42)'; g.beginPath(); g.arc(x - 0.3, y - 0.3, r * 0.6, 0, Math.PI * 2); g.fill();
}
function scratches(g: G, w: number, h: number, rng: Rng, n: number) {
  for (let i = 0; i < n; i++) {
    const x = rng() * w, y = rng() * h, l = 4 + rng() * 14, a = rng() * Math.PI;
    g.strokeStyle = 'rgba(255,255,255,0.22)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
  }
}

// ───────────────────────────────────────── pelukis
/** Kain polos: butir + gradasi + tepi. */
export const fab = (c: number, ed = 0.3, gr = 0.06): Painter => (g, w, h, rng) => {
  fill(g, w, h, css(c)); grain(g, w, h, rng, gr); shade(g, w, h, 0.06, 0.18); if (ed > 0) edge(g, w, h, ed);
};
export interface PlateOpt { rivets?: number; scratch?: number; rim?: number; rimW?: number; bevel?: number; panel?: boolean; gloss?: number }
/** Pelat zirah: bevel terang atas-kiri / gelap bawah-kanan, garis panel, goresan, paku keling di sudut, lis warna. */
export const plate = (c: number, o: PlateOpt = {}): Painter => (g, w, h, rng) => {
  fill(g, w, h, css(c)); grain(g, w, h, rng, 0.045, 1.5);
  if (o.gloss) {
    const gr = g.createLinearGradient(0, 0, w, h);
    gr.addColorStop(0, `rgba(255,255,255,${o.gloss})`); gr.addColorStop(0.55, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.12)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  }
  const b = Math.max(2, Math.round(Math.min(w, h) * (o.bevel ?? 0.09)));
  g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(0, 0, w, b); g.fillRect(0, 0, b, h);
  g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(0, h - b, w, b); g.fillRect(w - b, 0, b, h);
  if (o.panel) { g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 1.5; g.strokeRect(b * 2, b * 2, w - b * 4, h - b * 4); }
  if (o.rim !== undefined) { const lw = o.rimW ?? Math.max(2, b); g.strokeStyle = css(o.rim); g.lineWidth = lw; g.strokeRect(lw / 2, lw / 2, w - lw, h - lw); }
  scratches(g, w, h, rng, o.scratch ?? 0);
  if (o.rivets) rivets(g, w, h, o.rivets);
  edge(g, w, h, 0.5);
};
/** Anyaman MOLLE (baris pita berjahit). */
export const molle = (c: number, ed = 0.4): Painter => (g, w, h, rng) => {
  fill(g, w, h, css(c)); grain(g, w, h, rng, 0.07);
  for (let y = 5; y < h - 3; y += 11) {
    g.fillStyle = 'rgba(255,255,255,0.07)'; g.fillRect(2, y, w - 4, 5);
    for (let x = 6; x < w - 4; x += 12) { g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x, y, 2, 5); }
  }
  shade(g, w, h, 0.08, 0.22); edge(g, w, h, ed);
};
/** Kantong bertutup (warna tutup opsional). */
export const pouch = (c: number, flap?: number): Painter => (g, w, h, rng) => {
  fill(g, w, h, css(c)); grain(g, w, h, rng, 0.07);
  g.fillStyle = flap !== undefined ? css(flap) : 'rgba(0,0,0,0.32)'; rrect(g, 1, 1, w - 2, h * 0.38, 4); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(w * 0.4, h * 0.3, w * 0.2, h * 0.12);
  shade(g, w, h, 0.1, 0.25); edge(g, w, h, 0.5);
};
/** Gesper di atas tali. */
export const buckle = (c: number, strap = 0x1a1b1d): Painter => (g, w, h, rng) => {
  fill(g, w, h, css(strap)); grain(g, w, h, rng, 0.06);
  g.fillStyle = css(c); rrect(g, w * 0.16, h * 0.1, w * 0.68, h * 0.8, 3); g.fill();
  g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(w * 0.32, h * 0.32, w * 0.36, h * 0.36);
  g.fillStyle = 'rgba(255,255,255,0.3)'; g.fillRect(w * 0.18, h * 0.12, w * 0.64, 2);
  edge(g, w, h, 0.5);
};
/** Tali berjahit (sabuk, strap). */
export const strap = (c: number): Painter => (g, w, h, rng) => {
  fill(g, w, h, css(c)); grain(g, w, h, rng, 0.07);
  stitch(g, 0, 3, w, 3, 'rgba(255,255,255,0.12)'); stitch(g, 0, h - 3, w, h - 3, 'rgba(255,255,255,0.12)'); edge(g, w, h, 0.5);
};
/** Pelindung lutut/siku segi delapan (sudut = potongan alpha), lis warna opsional, faset terang. */
export const knee = (c: number, rim?: number): Painter => (g, w, h, rng) => {
  g.clearRect(0, 0, w, h);
  if (rim !== undefined) { g.fillStyle = css(rim); octagon(g, 0, 0, w, h); g.fill(); }
  const m = rim !== undefined ? Math.max(3, w * 0.08) : 0;
  g.fillStyle = css(c); octagon(g, m, m, w - 2 * m, h - 2 * m); g.fill();
  g.save(); octagon(g, m, m, w - 2 * m, h - 2 * m); g.clip(); grain(g, w, h, rng, 0.06);
  g.fillStyle = 'rgba(255,255,255,0.13)'; octagon(g, w * 0.3, h * 0.22, w * 0.4, h * 0.36); g.fill();
  g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, h * 0.72, w, h * 0.3);
  g.restore();
  g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 1.5; octagon(g, m, m, w - 2 * m, h - 2 * m); g.stroke();
  for (const [x, y] of [[0.3, 0.2], [0.7, 0.2], [0.3, 0.8], [0.7, 0.8]] as const) rivet(g, w * x, h * y, 1.4);
};
/** Sepatu bot depan: tali silang, ujung sepatu. */
export const bootFront = (c: number, lace = 0x8a8d92, toe?: number): Painter => (g, w, h, rng) => {
  fill(g, w, h, css(c)); grain(g, w, h, rng, 0.07);
  g.strokeStyle = rgba(lace, 0.9); g.lineWidth = 1.6;
  for (let i = 0; i < 4; i++) {
    const y = h * (0.1 + i * 0.13);
    g.beginPath(); g.moveTo(w * 0.36, y); g.lineTo(w * 0.64, y + h * 0.1); g.moveTo(w * 0.64, y); g.lineTo(w * 0.36, y + h * 0.1); g.stroke();
  }
  g.fillStyle = toe !== undefined ? css(toe) : 'rgba(255,255,255,0.07)'; rrect(g, w * 0.08, h * 0.68, w * 0.84, h * 0.3, 5); g.fill();
  shade(g, w, h, 0.1, 0.3); edge(g, w, h, 0.55);
};
export const bootSide = (c: number, line?: number): Painter => (g, w, h, rng) => {
  fill(g, w, h, css(c)); grain(g, w, h, rng, 0.07);
  if (line !== undefined) { g.fillStyle = css(line); g.fillRect(0, h * 0.62, w, h * 0.1); }
  stitch(g, 0, h * 0.76, w, h * 0.76, 'rgba(255,255,255,0.1)'); shade(g, w, h, 0.1, 0.3); edge(g, w, h, 0.55);
};
export const sole = (c = 0x111112): Painter => (g, w, h) => {
  fill(g, w, h, css(c)); g.fillStyle = 'rgba(255,255,255,0.08)'; for (let x = 2; x < w; x += 6) g.fillRect(x, 0, 2, h);
};
/** Loreng poligon (bercak bersudut — salju, hutan). */
export const polyCamo = (base: number, cols: readonly number[], density = 1, size = 1): Painter => (g, w, h, rng) => {
  fill(g, w, h, css(base));
  const n = Math.max(4, Math.round((w * h) / 380 * density));
  for (let i = 0; i < n; i++) {
    g.fillStyle = css(cols[i % cols.length]);
    const cx = rng() * w, cy = rng() * h, r = (6 + rng() * 12) * size, k = 3 + Math.floor(rng() * 3);
    g.beginPath();
    for (let j = 0; j < k; j++) {
      const a = (j / k) * Math.PI * 2 + rng() * 0.8, rr = r * (0.5 + rng() * 0.7);
      const px = cx + Math.cos(a) * rr * 1.3, py = cy + Math.sin(a) * rr * 0.8;
      if (j === 0) g.moveTo(px, py); else g.lineTo(px, py);
    }
    g.closePath(); g.fill();
  }
  grain(g, w, h, rng, 0.04); shade(g, w, h, 0.05, 0.16);
};
/** Serat karbon (anyaman kotak-kotak). */
export const carbon = (c: number, ed = 0.35): Painter => (g, w, h, rng) => {
  fill(g, w, h, css(c));
  const s = 4;
  for (let y = 0; y < h; y += s) for (let x = 0; x < w; x += s) {
    const odd = (Math.floor(x / s) + Math.floor(y / s)) % 2 === 0;
    g.fillStyle = odd ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.14)'; g.fillRect(x, y, s, s / 2);
    g.fillStyle = odd ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.05)'; g.fillRect(x, y + s / 2, s, s / 2);
  }
  grain(g, w, h, rng, 0.03); shade(g, w, h, 0.08, 0.22); if (ed > 0) edge(g, w, h, ed);
};
/** Kain jubah/mantel: lipatan tegak; ragged = kedalaman tepi bawah robek (potongan alpha, 0 = rapi). */
export const cloth = (c: number, ragged = 0, folds = 5, ed = 0.25): Painter => (g, w, h, rng) => {
  fill(g, w, h, css(c)); grain(g, w, h, rng, 0.05);
  const fw = w / folds;
  for (let i = 0; i < folds; i++) {
    const x = (i + 0.5 + (rng() - 0.5) * 0.4) * fw;
    const gr = g.createLinearGradient(x - fw / 2, 0, x + fw / 2, 0);
    gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.5, 'rgba(0,0,0,0.2)'); gr.addColorStop(1, 'rgba(255,255,255,0.05)');
    g.fillStyle = gr; g.fillRect(x - fw / 2, 0, fw, h);
  }
  shade(g, w, h, 0.05, 0.22);
  if (ed > 0) edge(g, w, h, ed);
  if (ragged > 0) tear(g, w, h, rng, ragged);
};
/** Tepi bawah robek bergerigi (hapus segitiga acak). */
export function tear(g: G, w: number, h: number, rng: Rng, depth: number) {
  g.save(); g.globalCompositeOperation = 'destination-out';
  g.beginPath(); g.moveTo(0, h + 1);
  let x = 0;
  while (x < w) { const sw = 6 + rng() * 14, d = depth * h * (0.3 + rng() * 0.7); g.lineTo(x + sw / 2, h - d); x += sw; g.lineTo(Math.min(w, x), h + 1); }
  g.closePath(); g.fill(); g.restore();
}
/** Jaring ghillie: kain loreng berlubang belah ketupat (alpha) + serpihan kain. */
export const net = (c: number, scrap: readonly number[], hole = 0.5, ragged = 0): Painter => (g, w, h, rng) => {
  fill(g, w, h, css(c)); grain(g, w, h, rng, 0.06);
  for (let i = 0; i < (w * h) / 160; i++) { g.fillStyle = css(scrap[i % scrap.length]); g.fillRect(rng() * w, rng() * h, 3 + rng() * 9, 2 + rng() * 4); }
  g.save(); g.globalCompositeOperation = 'destination-out';
  const s = 10;
  for (let y = 0; y < h + s; y += s) for (let x = (y / s) % 2 ? s / 2 : 0; x < w + s; x += s) {
    if (rng() > hole) continue;
    g.save(); g.translate(x, y); g.rotate(Math.PI / 4 + (rng() - 0.5) * 0.4); g.fillRect(-s * 0.26, -s * 0.26, s * 0.52, s * 0.52); g.restore();
  }
  g.restore();
  if (ragged > 0) tear(g, w, h, rng, ragged);
};
/** Sabuk peluru: selongsong kuningan berujung tembaga, tegak di atas tali. */
export const bullets = (strapC: number, brass = 0xc9a04a, n = 8): Painter => (g, w, h, rng) => {
  fill(g, w, h, css(strapC)); grain(g, w, h, rng, 0.06);
  const bw = w / n;
  for (let i = 0; i < n; i++) {
    const x = i * bw + bw * 0.18, bwid = bw * 0.64;
    g.fillStyle = css(brass); g.fillRect(x, h * 0.3, bwid, h * 0.62);
    g.fillStyle = '#b06a3c'; g.beginPath(); g.moveTo(x, h * 0.3); g.lineTo(x + bwid / 2, h * 0.04); g.lineTo(x + bwid, h * 0.3); g.closePath(); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.4)'; g.fillRect(x + 1, h * 0.34, bwid * 0.25, h * 0.5);
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x + bwid * 0.75, h * 0.34, bwid * 0.25, h * 0.55);
  }
  edge(g, w, h, 0.45);
};
/** Kisi ventilasi (garis tegak/mendatar). */
export const vents = (c: number, n = 4, vertical = false): Painter => (g, w, h, rng) => {
  fill(g, w, h, css(c)); grain(g, w, h, rng, 0.05);
  for (let i = 0; i < n; i++) {
    g.fillStyle = 'rgba(0,0,0,0.55)';
    if (vertical) g.fillRect(w * (0.15 + (0.7 * i) / n), h * 0.18, w * 0.6 / n, h * 0.64);
    else g.fillRect(w * 0.15, h * (0.15 + (0.7 * i) / n), w * 0.7, h * 0.55 / n);
  }
  edge(g, w, h, 0.5);
};
/** Garis hazard chevron (V menunjuk ke bawah) — bahu Titan. */
export const hazard = (c1: number, c2: number, s = 14): Painter => (g, w, h, rng) => {
  fill(g, w, h, css(c2));
  g.fillStyle = css(c1);
  for (let y = -s * 2; y < h + s * 2; y += s * 2) {
    g.beginPath(); g.moveTo(0, y); g.lineTo(w / 2, y + s); g.lineTo(w, y); g.lineTo(w, y + s * 0.8); g.lineTo(w / 2, y + s * 1.8); g.lineTo(0, y + s * 0.8); g.closePath(); g.fill();
  }
  grain(g, w, h, rng, 0.06); edge(g, w, h, 0.5);
};

// ───────────────────────────────────────── menyala & tangan
export interface LensOpt { frame?: number; inset?: [number, number]; r?: number; path?: (g: G, w: number, h: number) => void; shine?: boolean }
/** Lensa/visor MENYALA: kaca bergradasi (c0 atas → c1 bawah) + kilap + bingkai; seluruh kaca menyala (topeng). */
export function lens(A: Atlas, w: number, h: number, c0: number, c1: number, o: LensOpt = {}): Rect {
  const [ix, iy] = o.inset ?? [0.06, 0.14];
  const path = o.path ?? ((g: G, w: number, h: number) => rrect(g, w * ix, h * iy, w * (1 - 2 * ix), h * (1 - 2 * iy), h * (o.r ?? 0.22)));
  return A.pxGlow(w, h, (g, w, h) => {
    fill(g, w, h, css(o.frame ?? 0x141416));
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, css(c0)); gr.addColorStop(1, css(c1));
    g.fillStyle = gr; path(g, w, h); g.fill();
    if (o.shine !== false) {
      g.save(); path(g, w, h); g.clip();
      g.fillStyle = 'rgba(255,255,255,0.32)'; g.beginPath(); g.moveTo(w * 0.12, 0); g.lineTo(w * 0.3, 0); g.lineTo(w * 0.16, h); g.lineTo(w * -0.02, h); g.fill();
      g.restore();
    }
    g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineWidth = 2; path(g, w, h); g.stroke();
  }, (g, w, h) => { g.fillStyle = '#fff'; path(g, w, h); g.fill(); });
}
export interface HandOpt { knuckle?: number; plate?: number; fingerless?: boolean; trim?: number }
/** Tangan blocky (balok sarung tangan di ujung lengan): sisi, depan (punggung tangan + pelat), bawah (kepalan: 4 jari). */
export function hand(A: Atlas, glove: number, finger: number, o: HandOpt = {}): { side: Rect; front: Rect; bottom: Rect } {
  const fingerC = o.fingerless === false ? glove : finger;
  const side = A.px(64, 32, (g, w, h, rng) => {
    fill(g, w, h, css(glove)); grain(g, w, h, rng, 0.08);
    if (o.trim !== undefined) { g.fillStyle = css(o.trim); g.fillRect(0, 0, w, h * 0.16); }
    g.fillStyle = css(fingerC); g.fillRect(0, h * 0.78, w, h * 0.22);
    shade(g, w, h, 0.08, 0.25); edge(g, w, h, 0.55);
  });
  const front = A.px(64, 32, (g, w, h, rng) => {
    fill(g, w, h, css(glove)); grain(g, w, h, rng, 0.08);
    if (o.trim !== undefined) { g.fillStyle = css(o.trim); g.fillRect(0, 0, w, h * 0.16); }
    if (o.plate !== undefined) { g.fillStyle = css(o.plate); rrect(g, w * 0.22, h * 0.22, w * 0.56, h * 0.36, 3); g.fill(); g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(w * 0.24, h * 0.24, w * 0.52, 2); }
    g.fillStyle = css(fingerC); g.fillRect(0, h * 0.7, w, h * 0.3);
    g.fillStyle = 'rgba(0,0,0,0.3)'; for (let i = 1; i < 4; i++) g.fillRect((w * i) / 4 - 1, h * 0.7, 2, h * 0.3);
    if (o.knuckle !== undefined) { g.fillStyle = css(o.knuckle); for (let i = 0; i < 4; i++) g.fillRect((w * i) / 4 + 2, h * 0.6, w / 4 - 4, h * 0.12); }
    shade(g, w, h, 0.08, 0.25); edge(g, w, h, 0.55);
  });
  const bottom = A.px(64, 64, (g, w, h, rng) => {
    fill(g, w, h, css(glove)); grain(g, w, h, rng, 0.08);
    g.fillStyle = css(fingerC); g.fillRect(0, 0, w, h * 0.42);
    g.fillStyle = 'rgba(0,0,0,0.3)'; for (let i = 1; i < 4; i++) g.fillRect((w * i) / 4 - 1, 0, 2, h * 0.42);
    if (o.knuckle !== undefined) { g.fillStyle = css(o.knuckle); for (let i = 0; i < 4; i++) g.fillRect((w * i) / 4 + 2, h * 0.42, w / 4 - 4, h * 0.12); }
    edge(g, w, h, 0.5);
  });
  return { side, front, bottom };
}

export type { Common, Rect, Painter, G };
