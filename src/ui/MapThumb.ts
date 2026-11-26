// src/ui/MapThumb.ts — denah top-down kecil untuk kartu pilihan map (Atur Match & room Main Bareng), 100% prosedural dari data
// MapDef (batas, balok + rotY, tangga, slot spawn) — otomatis ikut bila denah map berubah. Orientasi lanskap: Biru (Z negatif) di KIRI,
// Merah (Z positif) di KANAN, +X ke atas (radar diputar 90°, bukan dicerminkan). Kartu "Acak" = irisan semua denah + tanda tanya.
// Denah digambar sekali ke kanvas cache per (pilihan, ukuran, DPR) lalu disalin ke <canvas> kartu setiap menu digambar ulang
// (room sering digambar ulang saat teman masuk/siap — salinan kanvas instan, tanpa decode gambar / kedip).
import { XCFG } from '../config/extraConfig';
import { MAPS } from '../world/maps/registry';
import { MAP_IDS, type MapDef } from '../world/maps/types';
import { stairFrame, type Box } from '../world/MapData';
import { isMapChoice, type MapChoice } from '../game/Lobby';
import { canvasFont } from './fonts';

interface Pal { bg: string; floor: string; dots: string; upper: string; stair: string; wall: string; pillar: string; shelf: string;
  cover: string; low: string; rail: string }
/** Palet: dalam ruang (kayu & bata hangat) / luar ruang (tanah berdebu, baja kusam). */
const PAL: Record<'indoor' | 'outdoor', Pal> = {
  indoor: { bg: '#140d07', floor: '#4b3423', dots: 'rgba(255,226,182,0.10)', upper: '#6f4e32', stair: '#5d422a', wall: '#1e140c',
    pillar: '#3e2918', shelf: '#a56d37', cover: '#bb8f5d', low: '#8f6b46', rail: '#e8c476' },
  outdoor: { bg: '#1a1712', floor: '#8b7a5a', dots: 'rgba(255,246,222,0.13)', upper: '#a38f6b', stair: '#7b6b51', wall: '#57636a',
    pillar: '#4b4139', shelf: '#7e6b4b', cover: '#b3a68b', low: '#a5885d', rail: '#dcc88c' },
};
/** Warna gaya permukaan luar ruang (OutdoorStyle) — kontainer baja, beton, kayu, ban, mobil, terpal. */
const STYLE_COL: Readonly<Record<string, string>> = {
  steel: '#5f6c74', fence: '#2d2c2a', concrete: '#bdb7aa', timber: '#a77c43', rubber: '#2c2b29', vehicle: '#7e4031', fabric: '#5b7791',
};
const TEAM = { blue: '61,142,224', red: '224,72,61' } as const;

const cache = new Map<string, HTMLCanvasElement>();
const dprNow = () => Math.min(2, Math.max(1, (typeof devicePixelRatio === 'number' && devicePixelRatio) || 1));

/** Ringkasan map untuk kartu: "Dalam ruang · 2 lantai · 22 × 36 m" (lantai = level node nav berbeda; 1 u = 0.36 m). */
export function mapFacts(def: MapDef): string {
  const floors = new Set(def.nav.nodes.map(n => n[3]).filter(l => l % 10 === 0)).size, k = XCFG.killcam.unitToMeter;   // bordes tangga (Y 5) bukan lantai
  const w = Math.round((def.bounds.x[1] - def.bounds.x[0]) * k), l = Math.round((def.bounds.z[1] - def.bounds.z[0]) * k);
  return `${def.atmosphere.outdoor ? 'Luar ruang' : 'Dalam ruang'} · ${floors} lantai · ${w} × ${l} m`;
}

/** Elemen <canvas> kartu map w × h px CSS (resolusi × DPR layar, maks 2×) — diisi paintThumbs() setelah HTML dipasang. */
export function thumbHTML(choice: MapChoice, w: number, h: number): string {
  const dpr = dprNow();
  return `<canvas class="thumb" data-thumb="${choice}" data-tw="${w}" data-th="${h}" width="${Math.round(w * dpr)}" height="${Math.round(h * dpr)}"></canvas>`;
}

/** Isi semua kanvas kartu map di `root` dari cache (denah digambar sekali per pilihan/ukuran/DPR). */
export function paintThumbs(root: ParentNode) {
  root.querySelectorAll<HTMLCanvasElement>('canvas[data-thumb]').forEach((c) => {
    const choice = c.dataset.thumb, w = Number(c.dataset.tw), h = Number(c.dataset.th);
    if (!isMapChoice(choice) || !(w > 0) || !(h > 0)) return;
    c.getContext('2d')?.drawImage(thumbCanvas(choice, c.width, c.height, c.width / w), 0, 0);
  });
}

function thumbCanvas(choice: MapChoice, W: number, H: number, dpr: number): HTMLCanvasElement {
  const key = `${choice}:${W}x${H}@${dpr}`;
  let c = cache.get(key);
  if (!c) {
    c = choice === 'random' ? randomThumb(W, H, dpr) : planCanvas(MAPS[choice], W, H, dpr);
    cache.set(key, c);
  }
  return c;
}

const shade = (hex: string, k: number) => {
  const n = parseInt(hex.slice(1), 16), f = (v: number) => Math.max(0, Math.min(255, Math.round(v * k)));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
};

/** Denah satu map ke kanvas W × H (piksel perangkat). */
function planCanvas(def: MapDef, W: number, H: number, dpr: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d')!, P = def.atmosphere.outdoor ? PAL.outdoor : PAL.indoor;
  const [x0, x1] = def.bounds.x, [z0, z1] = def.bounds.z, M = 3;
  const s = Math.min(W / (z1 - z0 + 2 * M), H / (x1 - x0 + 2 * M));
  const ox = (W - (z1 - z0) * s) / 2, oy = (H - (x1 - x0) * s) / 2;
  const U = (z: number) => ox + (z - z0) * s, V = (x: number) => oy + (x1 - x) * s;   // dunia (x, z) → kanvas (u, v)
  /** Persegi dunia [ax, bx] × [az, bz] (tanpa putaran). */
  const area = (ax: number, bx: number, az: number, bz: number) => g.fillRect(U(az), V(bx), (bz - az) * s, (bx - ax) * s);
  /** Balok (boleh berputar rotY di pusatnya): sumbu lokal X → (−sin θ, −cos θ)·s, Z → (cos θ, −sin θ)·s di kanvas. */
  const box = (b: Box, du = 0, dv = 0) => {
    const t = b.rotY ?? 0, sn = Math.sin(t), cs = Math.cos(t);
    const cx = (b.min[0] + b.max[0]) / 2, cz = (b.min[2] + b.max[2]) / 2, hx = (b.max[0] - b.min[0]) / 2, hz = (b.max[2] - b.min[2]) / 2;
    g.setTransform(-sn * s, -cs * s, cs * s, -sn * s, U(cz) + du, V(cx) + dv);
    g.fillRect(-hx, -hz, 2 * hx, 2 * hz);
    g.setTransform(1, 0, 0, 1, 0, 0);
  };

  g.fillStyle = P.bg; g.fillRect(0, 0, W, H);
  g.fillStyle = P.floor; area(x0, x1, z0, z1);
  // "stud" — titik kecil tiap 4 u (identitas blocky)
  g.fillStyle = P.dots;
  const d = Math.max(1, Math.round(dpr));
  for (let x = x0 + 2; x < x1; x += 4) for (let z = z0 + 2; z < z1; z += 4) g.fillRect(Math.round(U(z)), Math.round(V(x)), d, d);
  // lantai atas (balkon/jembatan, Y 10) + tangga (garis anak tangga)
  g.fillStyle = 'rgba(0,0,0,0.35)';
  for (const b of def.boxes) if (b.cat === 'mass' || b.cat === 'bridge') box(b, 1.2 * dpr, 1.2 * dpr);
  g.fillStyle = P.upper;
  for (const b of def.boxes) if (b.cat === 'mass' || b.cat === 'bridge') box(b);
  for (const st of def.stairs) {
    const f = stairFrame(st), run = 2 * Math.abs(f.top - f.foot) / Math.max(1, Math.round((f.y1 - f.y0) / 0.5));   // tiap 2 anak tangga
    g.fillStyle = P.stair; area(f.x[0], f.x[1], f.z[0], f.z[1]);
    g.fillStyle = 'rgba(255,232,192,0.28)';
    if (f.axis === 'z') for (let z = f.z[0]; z < f.z[1]; z += run) g.fillRect(U(z), V(f.x[1]), Math.max(1, 0.5 * dpr), (f.x[1] - f.x[0]) * s);
    else for (let x = f.x[0]; x < f.x[1]; x += run) g.fillRect(U(f.z[0]), V(x), (f.z[1] - f.z[0]) * s, Math.max(1, 0.5 * dpr));
  }
  // area spawn berwarna tim: tapak ruang spawn (kategori 'spawn') atau kotak 6 × 6 u di sekitar slot; titik = slot
  for (const team of ['blue', 'red'] as const) {
    const sgn = team === 'blue' ? -1 : 1, slots = [...def.spawnSlots[team].upper, ...def.spawnSlots[team].ground];
    const rooms = def.boxes.filter(b => b.cat === 'spawn' && Math.sign(b.min[2] + b.max[2]) === sgn);
    g.fillStyle = `rgba(${TEAM[team]},0.42)`;
    if (rooms.length) area(Math.min(...rooms.map(b => b.min[0])), Math.max(...rooms.map(b => b.max[0])),
      Math.min(...rooms.map(b => b.min[2])), Math.max(...rooms.map(b => b.max[2])));
    else { g.beginPath(); for (const [x, , z] of slots) g.rect(U(z - 3), V(x + 3), 6 * s, 6 * s); g.fill(); }
  }
  // penghalang: urut dari yang terendah → yang tinggi menimpa & bayangannya jatuh ke yang rendah (cahaya dari kiri atas)
  const solid = def.boxes.filter(b => b.max[1] > 0.01 && b.min[1] <= 10.5 && b.cat !== 'mass' && b.cat !== 'bridge' && b.cat !== 'rail')
    .sort((a, b) => a.max[1] - b.max[1]);
  for (const b of solid) {
    const h = b.max[1] - b.min[1], top = b.max[1];
    g.globalAlpha = b.min[1] >= 9.9 && def.radarFloors ? 0.5 : 1;   // lantai atas map berlantai banyak (Boston): samar di atas lantai bawah
    const col = (def.atmosphere.outdoor && STYLE_COL[b.style]) || (b.cat === 'shelf' || b.style === 'stack' ? P.shelf
      : b.cat === 'shell' || b.cat === 'wall' || b.cat === 'spawn' ? P.wall : b.cat === 'pillar' ? P.pillar : h < 1.5 ? P.low : P.cover);
    if (h >= 1.5) {
      const sh = Math.min(3.2, 0.5 + h * 0.16) * dpr;
      g.fillStyle = 'rgba(0,0,0,0.38)'; box(b, sh, sh);
    }
    g.fillStyle = b.cat === 'shell' ? col : shade(col, 0.82 + 0.3 * Math.min(1, top / 15));
    box(b);
  }
  g.globalAlpha = 1;
  g.fillStyle = P.rail;
  for (const b of def.boxes) if (b.cat === 'rail') box(b);
  // slot spawn: titik kecil terang
  for (const team of ['blue', 'red'] as const) {
    g.fillStyle = team === 'blue' ? '#cfe5ff' : '#ffd6d0';
    for (const [x, , z] of [...def.spawnSlots[team].upper, ...def.spawnSlots[team].ground]) g.fillRect(U(z) - d, V(x) - d, 2 * d, 2 * d);
  }
  // sisi tim: Biru kiri, Merah kanan (pita + pendar ke dalam)
  const band = 3 * dpr, glow = 16 * dpr;
  for (const [team, u0, dir] of [['blue', 0, 1], ['red', W, -1]] as const) {
    const gr = g.createLinearGradient(u0, 0, u0 + dir * glow, 0);
    gr.addColorStop(0, `rgba(${TEAM[team]},0.45)`); gr.addColorStop(1, `rgba(${TEAM[team]},0)`);
    g.fillStyle = gr; g.fillRect(dir > 0 ? 0 : W - glow, 0, glow, H);
    g.fillStyle = `rgb(${TEAM[team]})`; g.fillRect(dir > 0 ? 0 : W - band, 0, band, H);
  }
  return c;
}

/** Kartu "Acak": irisan diagonal denah semua map (digelapkan) + tanda tanya emas. */
function randomThumb(W: number, H: number, dpr: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d')!, n = MAP_IDS.length, k = H * 0.28;
  g.fillStyle = '#120c07'; g.fillRect(0, 0, W, H);
  MAP_IDS.forEach((id, i) => {
    const a = (i / n) * W, b = ((i + 1) / n) * W;
    g.save();
    g.beginPath();
    g.moveTo(i ? a + k : 0, 0); g.lineTo(i < n - 1 ? b + k : W, 0); g.lineTo(i < n - 1 ? b - k : W, H); g.lineTo(i ? a - k : 0, H);
    g.closePath(); g.clip();
    g.drawImage(planCanvas(MAPS[id], W, H, dpr), 0, 0);
    g.restore();
  });
  g.fillStyle = 'rgba(10,6,3,0.5)'; g.fillRect(0, 0, W, H);
  g.strokeStyle = 'rgba(245,205,48,0.75)'; g.lineWidth = 2 * dpr;
  for (let i = 1; i < n; i++) { const b = (i / n) * W; g.beginPath(); g.moveTo(b + k, 0); g.lineTo(b - k, H); g.stroke(); }
  g.font = canvasFont(H * 0.62, 700);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = '#6b4226'; g.fillText('?', W / 2, H / 2 + 4 * dpr);
  g.fillStyle = '#f5cd30'; g.fillText('?', W / 2, H / 2);
  return c;
}
