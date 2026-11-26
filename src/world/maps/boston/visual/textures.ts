// src/world/maps/boston/visual/textures.ts — tekstur prosedural Boston (kanvas, tanpa file gambar). Semua dipanggil saat membangun
// map (bukan saat impor modul). UV dunia: tiap fungsi mencatat rentang satuan u per tekstur (repeat = 1 / rentang).
//   • tegel putih (4 u), tegel motif vintage bintang-bunga (3 u, warna dokumen #C8BEB0 / #5E574F), karpet kantor (2.8 u),
//     plester (4 u), marmer (2 u), pintu loker motif wajik (1.5 × 3.25 u), krey bambu ber-alpha (2 u), kain (1 u) + normal map;
//   • latar kota sore (panorama 360° kanvas 2048 × 512) untuk silinder di luar sisi teras & jendela.
import * as THREE from 'three';
import { makeRng } from '../../../../core/Rng';
import { canvas, fbm, lowField, normalFromHeight, toTex, vnoise } from '../../steelyard/visual/textures';

export interface MapPair { map: THREE.Texture; normal: THREE.Texture }

const put = (img: ImageData, o: number, r: number, g: number, b: number, a = 255) => {
  img.data[o] = Math.max(0, Math.min(255, r)); img.data[o + 1] = Math.max(0, Math.min(255, g)); img.data[o + 2] = Math.max(0, Math.min(255, b)); img.data[o + 3] = a;
};

/** Tegel putih polos: 2 × 2 petak (petak 2 u) + nat abu tipis; kilap sedikit beda per petak. Rentang 4 u. */
export function tileWhiteTex(aniso: number): MapPair {
  const N = 256, T = 128, rng = makeRng(7001), img = new ImageData(N, N), h = new Float32Array(N * N);
  const n = fbm(8, 8, 3, 7003), tone = Array.from({ length: 4 }, () => 0.95 + rng() * 0.06);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const lx = x % T, ly = y % T, e = Math.min(lx, ly, T - 1 - lx, T - 1 - ly), o = (y * N + x) * 4;
    if (e < 1.5) { put(img, o, 168, 162, 153); h[y * N + x] = -1; continue; }
    const t = tone[(y < T ? 0 : 2) + (x < T ? 0 : 1)] * (0.965 + n(x / N, y / N) * 0.05) * (e < 4 ? 0.97 : 1);
    put(img, o, 234 * t, 229 * t, 220 * t);
    h[y * N + x] = e < 4 ? -0.3 + e * 0.075 : 0;
  }
  const [c, g] = canvas(N, N); g.putImageData(img, 0, 0);
  return { map: toTex(c, aniso, true), normal: normalFromHeight(h, N, N, 2.2, aniso) };
}

/** Tegel motif vintage (encaustic): bintang 8 sudut terakota di tengah, cincin gelap, kelopak 4 arah, seperempat lingkaran gelap
 *  di sudut (membentuk bunga lintas petak), belah ketupat hijau-abu di tengah sisi. 2 × 2 petak (petak 1.5 u). Rentang 3 u. */
export function tileVintageTex(aniso: number): MapPair {
  const N = 256, T = 128;
  const [c, g] = canvas(N, N);
  const LIGHT = '#c8beb0', DARK = '#5e574f', TERRA = '#9a5b3f', TEAL = '#6f8783', CREAM = '#e3dacb';
  for (let ty = 0; ty < 2; ty++) for (let tx = 0; tx < 2; tx++) {
    g.save(); g.translate(tx * T, ty * T);
    g.fillStyle = LIGHT; g.fillRect(0, 0, T, T);
    const C = T / 2;
    // seperempat lingkaran di sudut (bunga lintas petak)
    g.fillStyle = DARK;
    for (const [cx, cy] of [[0, 0], [T, 0], [0, T], [T, T]]) { g.beginPath(); g.arc(cx, cy, T * 0.3, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = CREAM;
    for (const [cx, cy] of [[0, 0], [T, 0], [0, T], [T, T]]) { g.beginPath(); g.arc(cx, cy, T * 0.16, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = TERRA;
    for (const [cx, cy] of [[0, 0], [T, 0], [0, T], [T, T]]) { g.beginPath(); g.arc(cx, cy, T * 0.07, 0, Math.PI * 2); g.fill(); }
    // belah ketupat di tengah sisi
    g.fillStyle = TEAL;
    for (const [cx, cy, ax, ay] of [[C, 0, 1, 0], [C, T, 1, 0], [0, C, 0, 1], [T, C, 0, 1]]) {
      g.beginPath();
      g.moveTo(cx - ax * T * 0.13, cy - ay * T * 0.13); g.lineTo(cx + ay * T * 0.08, cy + ax * T * 0.08);
      g.lineTo(cx + ax * T * 0.13, cy + ay * T * 0.13); g.lineTo(cx - ay * T * 0.08, cy - ax * T * 0.08); g.closePath(); g.fill();
    }
    // cincin gelap + kelopak 4 arah
    g.strokeStyle = DARK; g.lineWidth = T * 0.035; g.beginPath(); g.arc(C, C, T * 0.3, 0, Math.PI * 2); g.stroke();
    g.fillStyle = TEAL;
    for (let k = 0; k < 4; k++) {
      const a = k * Math.PI / 2 + Math.PI / 4;
      g.beginPath(); g.ellipse(C + Math.cos(a) * T * 0.3, C + Math.sin(a) * T * 0.3, T * 0.06, T * 0.03, a, 0, Math.PI * 2); g.fill();
    }
    // bintang 8 sudut (dua bujur sangkar) + pusat
    g.fillStyle = TERRA;
    for (const rot of [0, Math.PI / 4]) {
      g.save(); g.translate(C, C); g.rotate(rot); g.fillRect(-T * 0.15, -T * 0.15, T * 0.3, T * 0.3); g.restore();
    }
    g.fillStyle = CREAM; g.beginPath(); g.arc(C, C, T * 0.09, 0, Math.PI * 2); g.fill();
    g.fillStyle = DARK; g.beginPath(); g.arc(C, C, T * 0.04, 0, Math.PI * 2); g.fill();
    // garis tepi tipis
    g.strokeStyle = 'rgba(94,87,79,0.55)'; g.lineWidth = 1.5; g.strokeRect(5, 5, T - 10, T - 10);
    g.restore();
  }
  // aus + nat
  const img = g.getImageData(0, 0, N, N), h = new Float32Array(N * N), wear = fbm(8, 8, 3, 7101), speck = vnoise(64, 64, 7103);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const o = (y * N + x) * 4, lx = x % T, ly = y % T, e = Math.min(lx, ly, T - 1 - lx, T - 1 - ly);
    if (e < 1.5) { put(img, o, 150, 144, 136); h[y * N + x] = -1; continue; }
    const k = 0.93 + wear(x / N, y / N) * 0.1 + (speck(x / N, y / N) - 0.5) * 0.04;
    put(img, o, img.data[o] * k, img.data[o + 1] * k, img.data[o + 2] * k);
    h[y * N + x] = (wear(x / N, y / N) - 0.5) * 0.05;
  }
  g.putImageData(img, 0, 0);
  return { map: toTex(c, aniso, true), normal: normalFromHeight(h, N, N, 2.2, aniso) };
}

/** Karpet kantor (ubin karpet 1.4 u dipasang seperempat putaran): serat bergaris halus biru-abu tua. Rentang 2.8 u. */
export function carpetTex(aniso: number): MapPair {
  const N = 256, T = 128, img = new ImageData(N, N), h = new Float32Array(N * N);
  const fine = vnoise(128, 128, 7201), mid = fbm(16, 16, 2, 7203), rng = makeRng(7205);
  const tone = Array.from({ length: 4 }, () => 0.94 + rng() * 0.1);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const tx = x < T ? 0 : 1, ty = y < T ? 0 : 1, vert = (tx + ty) % 2 === 0;
    const s = Math.sin(((vert ? x : y) / N) * Math.PI * 2 * 48) * 0.5 + 0.5;
    const f = fine(x / N, y / N), m = mid(x / N, y / N);
    const lx = x % T, ly = y % T, seam = Math.min(lx, ly, T - 1 - lx, T - 1 - ly) < 1 ? 0.86 : 1;
    const k = tone[ty * 2 + tx] * (0.82 + s * 0.12 + f * 0.1 + (m - 0.5) * 0.12) * seam;
    put(img, (y * N + x) * 4, 58 * k, 66 * k, 80 * k);
    h[y * N + x] = s * 0.25 + f * 0.35;
  }
  const [c, g] = canvas(N, N); g.putImageData(img, 0, 0);
  return { map: toTex(c, aniso, true), normal: normalFromHeight(h, N, N, 1.1, aniso) };
}

/** Plester halus nyaris putih (diwarnai warna verteks: krem, putih kolom, aksen tim). Rentang 4 u. */
export function plasterTex(aniso: number): MapPair {
  const N = 256, img = new ImageData(N, N), h = new Float32Array(N * N);
  const big = fbm(4, 4, 3, 7301), grain = vnoise(128, 128, 7303);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const b = big(x / N, y / N), s = grain(x / N, y / N), k = 0.94 + (b - 0.5) * 0.06 + (s - 0.5) * 0.035;
    put(img, (y * N + x) * 4, 246 * k, 243 * k, 238 * k);
    h[y * N + x] = b * 0.2 + s * 0.12;
  }
  const [c, g] = canvas(N, N); g.putImageData(img, 0, 0);
  return { map: toTex(c, aniso, true), normal: normalFromHeight(h, N, N, 0.7, aniso) };
}

/** Marmer putih berurat abu (meja & konter). Rentang 2 u. */
export function marbleTex(aniso: number): THREE.Texture {
  const N = 256, img = new ImageData(N, N), warp = lowField(64, 64, fbm(4, 4, 4, 7401)), cloud = fbm(8, 8, 3, 7403);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = x / N, v = y / N, w = warp(u, v);
    const vein = Math.pow(1 - Math.abs(Math.sin((u * 3 + v * 1.2 + w * 2.6) * Math.PI)), 14);
    const vein2 = Math.pow(1 - Math.abs(Math.sin((u * 1.4 - v * 4 + w * 3.4) * Math.PI)), 22);
    const k = 0.95 + (cloud(u, v) - 0.5) * 0.08 - vein * 0.32 - vein2 * 0.18;
    put(img, (y * N + x) * 4, 238 * k, 236 * k, 233 * k);
  }
  const [c, g] = canvas(N, N); g.putImageData(img, 0, 0);
  return toTex(c, aniso, true);
}

/** Satu pintu loker krem 1.5 × 3.25 u: panel motif wajik timbul, kisi ventilasi, gagang gelap, celah pintu. */
export function lockerTex(aniso: number): MapPair {
  const W = 128, H = 256, img = new ImageData(W, H), h = new Float32Array(W * H), n = vnoise(16, 32, 7501);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const o = (y * W + x) * 4, e = Math.min(x, W - 1 - x, y, H - 1 - y);
    let k = 0.95 + (n(x / W, y / H) - 0.5) * 0.05, hh = 0;
    if (e < 2) { k = 0.45; hh = -1; }
    else {
      const inPanel = x > 14 && x < W - 14 && y > 40 && y < H - 22;
      if (inPanel) {
        const d1 = ((x + y) % 22 + 22) % 22, d2 = ((x - y) % 22 + 22) % 22;
        if (d1 < 2 || d2 < 2) { k *= 0.84; hh = 0.4; }
        if (x < 17 || x > W - 18 || y < 43 || y > H - 25) { k *= 0.9; hh = -0.3; }
      }
      if (y > 14 && y < 34 && x > 30 && x < W - 30 && (y - 14) % 5 < 2) { k *= 0.55; hh = -0.6; }     // kisi ventilasi
      if (x > W - 26 && x < W - 18 && y > 112 && y < 150) { k = 0.3; hh = 0.6; }                         // gagang
    }
    put(img, o, 221 * k, 213 * k, 199 * k);
    h[y * W + x] = hh;
  }
  const [c, g] = canvas(W, H); g.putImageData(img, 0, 0);
  return { map: toTex(c, aniso, true), normal: normalFromHeight(h, W, H, 1.6, aniso) };
}

/** Krey bambu: bilah mendatar bervariasi + tali vertikal; celah antar bilah transparan (alpha) ±25%. Rentang 2 × 2 u. */
export function bambooTex(aniso: number): THREE.Texture {
  const W = 128, H = 256, img = new ImageData(W, H), rng = makeRng(7601), grain = vnoise(64, 8, 7603);
  const SL = 8, tone = Array.from({ length: H / SL }, () => 0.85 + rng() * 0.25);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const o = (y * W + x) * 4, si = Math.floor(y / SL), ly = y % SL;
    const cord = x % 32 >= 15 && x % 32 <= 16;
    if (ly >= 6 && !cord) { put(img, o, 0, 0, 0, 0); continue; }
    const k = cord ? 0.45 : tone[si] * (0.86 + grain(x / W, y / H) * 0.22) * (ly === 0 || ly === 5 ? 0.85 : 1);
    put(img, o, 181 * k, 148 * k, 107 * k);
  }
  const [c, g] = canvas(W, H); g.putImageData(img, 0, 0);
  return toTex(c, aniso, true);
}

/** Kain tenun lembut (sofa, partisi, kursi) — abu netral, diwarnai warna verteks. Rentang 1 u. */
export function fabricTex(aniso: number): MapPair {
  const N = 128, img = new ImageData(N, N), h = new Float32Array(N * N), n = vnoise(32, 32, 7701);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const w = (Math.sin(x * Math.PI / 2) * Math.sin(y * Math.PI / 2)) * 0.5 + 0.5, f = n(x / N, y / N);
    const k = 0.86 + w * 0.08 + f * 0.08;
    put(img, (y * N + x) * 4, 230 * k, 230 * k, 230 * k);
    h[y * N + x] = w * 0.5 + f * 0.3;
  }
  const [c, g] = canvas(N, N); g.putImageData(img, 0, 0);
  return { map: toTex(c, aniso, true), normal: normalFromHeight(h, N, N, 0.9, aniso) };
}

/** Panorama kota sore 360° (u = sudut, v = tinggi): langit gradien hangat, 3 lapis gedung (jauh berkabut → dekat), jendela
 *  sebagian menyala, beberapa menara. Tanpa replika skyline nyata. */
export function cityTex(): THREE.Texture {
  const W = 2048, H = 512, rng = makeRng(7801);
  const [c, g] = canvas(W, H, true);
  const sky = g.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#6f9cc9'); sky.addColorStop(0.45, '#a9c6de'); sky.addColorStop(0.72, '#eed9b8'); sky.addColorStop(1, '#f3caa0');
  g.fillStyle = sky; g.fillRect(0, 0, W, H);
  // awan tipis
  g.globalAlpha = 0.25; g.fillStyle = '#fff6e8';
  for (let i = 0; i < 40; i++) { const x = rng() * W, y = 40 + rng() * 160, w = 80 + rng() * 260; g.beginPath(); g.ellipse(x, y, w, 6 + rng() * 10, 0, 0, Math.PI * 2); g.fill(); }
  g.globalAlpha = 1;
  const layer = (base: number, hMin: number, hMax: number, col: [number, number, number], winA: number, step: number) => {
    let x = 0;
    while (x < W) {
      const w = step * (0.6 + rng() * 1.2), bh = hMin + rng() * (hMax - hMin), top = base - bh;
      const t = 0.85 + rng() * 0.25;
      g.fillStyle = `rgb(${col[0] * t | 0},${col[1] * t | 0},${col[2] * t | 0})`;
      g.fillRect(x, top, w, H - top);
      if (rng() < 0.18) { g.fillRect(x + w * 0.35, top - bh * 0.25, w * 0.3, bh * 0.25); g.fillRect(x + w * 0.48, top - bh * 0.4, 2, bh * 0.15); }
      // jendela
      if (winA > 0) for (let wy = top + 6; wy < base - 4; wy += 7) for (let wx = x + 3; wx < x + w - 4; wx += 6) {
        const lit = rng() < 0.12;
        g.fillStyle = lit ? `rgba(255,214,150,${winA})` : `rgba(30,40,55,${winA * 0.45})`;
        g.fillRect(wx, wy, 3, 3);
      }
      x += w + rng() * step * 0.15;
    }
  };
  layer(H * 0.78, 40, 150, [126, 142, 164], 0, 22);        // jauh, berkabut
  layer(H * 0.84, 60, 210, [92, 102, 118], 0.5, 30);
  layer(H * 0.92, 40, 170, [62, 66, 74], 0.8, 40);           // dekat
  // kabut cakrawala
  const haze = g.createLinearGradient(0, H * 0.55, 0, H);
  haze.addColorStop(0, 'rgba(240,214,180,0)'); haze.addColorStop(1, 'rgba(240,214,180,0.35)');
  g.fillStyle = haze; g.fillRect(0, H * 0.55, W, H * 0.45);
  const t = toTex(c, 4, true);
  t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}
