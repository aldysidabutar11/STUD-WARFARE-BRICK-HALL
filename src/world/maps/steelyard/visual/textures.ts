// src/world/maps/steelyard/visual/textures.ts — tekstur prosedural Steel Yard (kanvas / DataTexture, tanpa file gambar):
//   • steelMask   : MASK data (R = kecerahan cat/belang, G = karat, B = debu/kotoran) 32 × 7.2 u, berulang horizontal — kontainer,
//                   drum, bodi mobil. Shader (materials.ts) mencampur warna cat (warna verteks) → karat & debu berwarna benar.
//   • tarpMask    : MASK kain terpal (R = anyaman/lipatan/kelim + mata ayam, G = noda aliran, B = debu bawah) 1 panel.
//   • wood/concrete/rubber : warna sRGB berulang + normal map.
//   • groundDetail: pengali detail tanah (linear, rata-rata 0.5 → ×2) + normal map serasi; puddleNormal (riak); skyNoise (fbm GPU).
// Semua fungsi dipanggil saat membangun map (BUKAN saat impor modul — test Node mengimpor registry).
import * as THREE from 'three';
import { makeRng, type Rng } from '../../../../core/Rng';

// ───────────────────────── pembantu
/** Kanvas kerja. gpu = true: kanvas berakselerasi (cepat untuk gradien/blur; dibaca sekali lewat getImageData). */
function canvas(w: number, h: number, gpu = false): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d', gpu ? undefined : { willReadFrequently: true })!];
}

function toTex(c: HTMLCanvasElement, aniso: number, srgb: boolean, repeat = true): THREE.Texture {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  t.anisotropy = aniso;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

/** Derau nilai berulang (tileable) cells×cells, interpolasi smoothstep. u, v dalam satuan petak (bebas, dibungkus). */
function vnoise(cellsX: number, cellsY: number, seed: number): (u: number, v: number) => number {
  const r = makeRng(seed), g = new Float32Array(cellsX * cellsY);
  for (let i = 0; i < g.length; i++) g[i] = r();
  const pow2 = (n: number) => (n & (n - 1)) === 0;
  if (pow2(cellsX) && pow2(cellsY)) {   // jalur cepat: bungkus dengan bitmask
    const mx = cellsX - 1, my = cellsY - 1;
    return (u, v) => {
      const x = u * cellsX, y = v * cellsY, xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
      const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
      const x0 = xi & mx, y0 = (yi & my) * cellsX, x1 = (xi + 1) & mx, y1 = ((yi + 1) & my) * cellsX;
      const a = g[y0 + x0], b = g[y0 + x1], c = g[y1 + x0], d = g[y1 + x1];
      return (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
    };
  }
  return (u, v) => {
    const x = u * cellsX, y = v * cellsY, xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const x0 = ((xi % cellsX) + cellsX) % cellsX, y0 = ((yi % cellsY) + cellsY) % cellsY;
    const x1 = (x0 + 1) % cellsX, y1 = (y0 + 1) % cellsY;
    const a = g[y0 * cellsX + x0], b = g[y0 * cellsX + x1], c = g[y1 * cellsX + x0], d = g[y1 * cellsX + x1];
    return (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
  };
}

/** fbm berulang: oktaf berlipat (sel ×2), amplitudo ×0.5; hasil ±0..1. */
function fbm(cellsX: number, cellsY: number, oct: number, seed: number): (u: number, v: number) => number {
  const ns = Array.from({ length: oct }, (_, i) => vnoise(cellsX << i, cellsY << i, seed + i * 101));
  let norm = 0;
  for (let i = 0; i < oct; i++) norm += 0.5 ** i;
  return (u, v) => { let s = 0; for (let i = 0; i < oct; i++) s += ns[i](u, v) * 0.5 ** i; return s / norm; };
}

/** Medan derau resolusi rendah (fw×fh) + sampel bilinear berulang — derau per piksel tekstur besar tanpa biaya fbm penuh. */
function lowField(fw: number, fh: number, fn: (u: number, v: number) => number): (u: number, v: number) => number {
  const f = new Float32Array(fw * fh);
  for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) f[y * fw + x] = fn(x / fw, y / fh);
  return (u, v) => {
    const x = u * fw - 0.5, y = v * fh - 0.5, xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
    const x0 = ((xi % fw) + fw) % fw, y0 = ((yi % fh) + fh) % fh, x1 = (x0 + 1) % fw, y1 = (y0 + 1) % fh;
    const a = f[y0 * fw + x0], b = f[y0 * fw + x1], c = f[y1 * fw + x0], d = f[y1 * fw + x1];
    return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
  };
}

/** Peta tinggi (w×h, berulang) → normal map ruang tangen. */
export function normalFromHeight(h: Float32Array, w: number, hh: number, strength: number, aniso: number): THREE.Texture {
  const img = new ImageData(w, hh);
  const at = (x: number, y: number) => h[((y + hh) % hh) * w + ((x + w) % w)];
  for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) {
    const dx = (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1));
    const dy = (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1));
    let nx = -dx * strength, ny = dy * strength, nz = 1;
    const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    const o = (y * w + x) * 4;
    img.data[o] = (nx * 0.5 + 0.5) * 255; img.data[o + 1] = (ny * 0.5 + 0.5) * 255; img.data[o + 2] = (nz * 0.5 + 0.5) * 255; img.data[o + 3] = 255;
  }
  const [c, g] = canvas(w, hh);
  g.putImageData(img, 0, 0);
  return toTex(c, aniso, false);
}

/** Gambar elemen berulang horizontal: panggil fn di x, x−W, x+W bila dekat tepi. */
function wrapX(W: number, x: number, r: number, fn: (x: number) => void) {
  fn(x);
  if (x - r < 0) fn(x + W);
  if (x + r > W) fn(x - W);
}

/** Satu kanal abu-abu dari kanvas (0..1). */
function channel(g: CanvasRenderingContext2D, w: number, h: number): Float32Array {
  const d = g.getImageData(0, 0, w, h).data, out = new Float32Array(w * h);
  for (let i = 0; i < out.length; i++) out[i] = d[i * 4] / 255;
  return out;
}

// ───────────────────────── baja kontainer (mask)
export const STEEL_TEX = { w: 2048, h: 512, uSpan: 32, vSpan: 7.2 };

/** Mask cat/karat/debu: u = X lokal / 32 u, v = Y / 7.2 u (bawah 0 → atas 1). */
export function steelMask(aniso: number): THREE.Texture {
  const { w: W, h: H } = STEEL_TEX, rng = makeRng(9101);
  // R: kecerahan cat (belang pudar, goresan terang, bekas air)
  const [, gr] = canvas(W, H, true);
  gr.fillStyle = '#d2d2d2'; gr.fillRect(0, 0, W, H);
  for (let i = 0; i < 90; i++) {
    const x = rng() * W, y = rng() * H, r = 30 + rng() * 220, a = 0.05 + rng() * 0.12, light = rng() < 0.5;
    wrapX(W, x, r, (xx) => {
      const gd = gr.createRadialGradient(xx, y, 0, xx, y, r);
      gd.addColorStop(0, light ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a})`); gd.addColorStop(1, 'rgba(128,128,128,0)');
      gr.fillStyle = gd; gr.fillRect(xx - r, y - r, r * 2, r * 2);
    });
  }
  // bekas aliran air (gelap tipis dari atas)
  for (let i = 0; i < 70; i++) {
    const x = rng() * W, len = 60 + rng() * 300, wd = 2 + rng() * 9;
    const gd = gr.createLinearGradient(0, 0, 0, len);
    gd.addColorStop(0, `rgba(0,0,0,${0.08 + rng() * 0.1})`); gd.addColorStop(1, 'rgba(0,0,0,0)');
    gr.fillStyle = gd; wrapX(W, x, wd, xx => gr.fillRect(xx, 0, wd, len));
  }
  // goresan terang (cat terkelupas tipis)
  gr.lineCap = 'round';
  for (let i = 0; i < 160; i++) {
    const x = rng() * W, y = H * (0.15 + rng() * 0.7), l = 6 + rng() * 40, ang = (rng() - 0.5) * 0.9;
    gr.strokeStyle = `rgba(255,255,255,${0.12 + rng() * 0.25})`; gr.lineWidth = 0.8 + rng() * 1.4;
    wrapX(W, x, l, xx => { gr.beginPath(); gr.moveTo(xx, y); gr.lineTo(xx + Math.cos(ang) * l, y + Math.sin(ang) * l); gr.stroke(); });
  }
  // G: karat — aliran lebar & lembut dari rel atas, bercak tak beraturan (bukan tetesan bulat), pita bawah; lalu diburamkan
  const [cgc, gg] = canvas(W, H, true);
  gg.fillStyle = '#000'; gg.fillRect(0, 0, W, H);
  for (let i = 0; i < 120; i++) {
    const x = rng() * W, len = 40 + rng() ** 1.5 * 300, wd = 3 + rng() * 10, a = 0.2 + rng() * 0.4;
    const y0 = rng() < 0.75 ? rng() * 10 : rng() * H * 0.6;
    const gd = gg.createLinearGradient(0, y0, 0, y0 + len);
    gd.addColorStop(0, `rgba(255,255,255,${a})`); gd.addColorStop(0.35, `rgba(255,255,255,${a * 0.55})`); gd.addColorStop(1, 'rgba(255,255,255,0)');
    gg.fillStyle = gd;
    wrapX(W, x, wd * 2, (xx) => {
      gg.beginPath(); gg.moveTo(xx - wd / 2, y0);
      gg.quadraticCurveTo(xx + (rng() - 0.5) * 8, y0 + len * 0.5, xx + (rng() - 0.5) * 4, y0 + len);
      gg.quadraticCurveTo(xx + wd * 0.4, y0 + len * 0.5, xx + wd / 2, y0); gg.fill();
    });
  }
  for (let i = 0; i < 170; i++) {
    const x = rng() * W, y = rng() * H, big = rng() < 0.15, n = big ? 18 : 6, s = big ? 16 : 5;
    const a = 0.32 + rng() * 0.45;
    for (let k = 0; k < n; k++) {
      const px = x + (rng() - 0.5) * s * 2.2, py = y + (rng() - 0.5) * s * 1.2, rx = 0.8 + rng() * (big ? 5 : 2), ry = rx * (0.4 + rng() * 0.7);
      gg.fillStyle = `rgba(255,255,255,${a * (0.4 + rng() * 0.6)})`;
      wrapX(W, px, rx, xx => { gg.beginPath(); gg.ellipse(xx, py, rx, ry, rng() * 3, 0, Math.PI * 2); gg.fill(); });
    }
  }
  {
    const gd = gg.createLinearGradient(0, H, 0, H - 40);
    gd.addColorStop(0, 'rgba(255,255,255,0.62)'); gd.addColorStop(1, 'rgba(255,255,255,0)');
    gg.fillStyle = gd; gg.fillRect(0, H - 40, W, 40);
    const gt = gg.createLinearGradient(0, 0, 0, 16);
    gt.addColorStop(0, 'rgba(255,255,255,0.4)'); gt.addColorStop(1, 'rgba(255,255,255,0)');
    gg.fillStyle = gt; gg.fillRect(0, 0, W, 16);
  }
  {   // buramkan (tepi karat lembut) — salin lalu gambar ulang dengan filter (sisi kanan/kiri dibungkus)
    const [tmp, tg] = canvas(W, H, true);
    tg.drawImage(cgc, 0, 0);
    gg.filter = 'blur(1.6px)';
    gg.drawImage(tmp, 0, 0); gg.drawImage(tmp, -W, 0); gg.drawImage(tmp, W, 0);
    gg.filter = 'none';
  }
  // B: debu/kotoran — gradien bawah + percikan + bercak
  const [, gb] = canvas(W, H, true);
  gb.fillStyle = '#000'; gb.fillRect(0, 0, W, H);
  {
    const gd = gb.createLinearGradient(0, H, 0, H * 0.62);
    gd.addColorStop(0, 'rgba(255,255,255,0.85)'); gd.addColorStop(0.35, 'rgba(255,255,255,0.35)'); gd.addColorStop(1, 'rgba(255,255,255,0)');
    gb.fillStyle = gd; gb.fillRect(0, H * 0.62, W, H * 0.38);
  }
  for (let i = 0; i < 380; i++) {
    const x = rng() * W, y = H - rng() ** 2.2 * H * 0.3, r = 0.6 + rng() * 2.2;
    gb.fillStyle = `rgba(255,255,255,${0.08 + rng() * 0.28})`;
    wrapX(W, x, r, xx => { gb.beginPath(); gb.arc(xx, y, r, 0, Math.PI * 2); gb.fill(); });
  }
  for (let i = 0; i < 40; i++) {
    const x = rng() * W, y = rng() * H * 0.8, r = 40 + rng() * 140;
    wrapX(W, x, r, (xx) => {
      const gd = gb.createRadialGradient(xx, y, 0, xx, y, r);
      gd.addColorStop(0, `rgba(255,255,255,${0.1 + rng() * 0.15})`); gd.addColorStop(1, 'rgba(255,255,255,0)');
      gb.fillStyle = gd; gb.fillRect(xx - r, y - r, r * 2, r * 2);
    });
  }
  // gabung kanal (langsung dari buffer kanvas; variasi halus sudah ada di bercak R)
  const dR = gr.getImageData(0, 0, W, H).data, dG = gg.getImageData(0, 0, W, H).data, dB = gb.getImageData(0, 0, W, H).data;
  const img = new ImageData(W, H), o = img.data;
  for (let i = 0, n = W * H * 4; i < n; i += 4) { o[i] = dR[i]; o[i + 1] = dG[i]; o[i + 2] = dB[i]; o[i + 3] = 255; }
  const [c, g] = canvas(W, H);
  g.putImageData(img, 0, 0);
  return toTex(c, aniso, false);
}

/** Normal halus baja: penyok lebar, bopeng karat, sambungan las tipis (berulang 256², dipakai repeat ±4 u). */
export function steelNormal(aniso: number): THREE.Texture {
  const N = 256, h = new Float32Array(N * N), rng = makeRng(5150), n1 = fbm(8, 8, 3, 61), n2 = vnoise(64, 64, 63);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) h[y * N + x] = n1(x / N, y / N) * 0.35 + n2(x / N, y / N) * 0.06;
  for (let k = 0; k < 7; k++) {           // penyok
    const cx = rng() * N, cy = rng() * N, r = 22 + rng() * 34, d = (rng() < 0.5 ? -1 : 1) * (0.2 + rng() * 0.25);
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
      const q = (x * x + y * y) / (r * r);
      if (q >= 1) continue;
      const ix = ((Math.round(cx + x) % N) + N) % N, iy = ((Math.round(cy + y) % N) + N) % N;
      h[iy * N + ix] += d * (1 - q) * (1 - q);
    }
  }
  for (let k = 0; k < 140; k++) {          // bopeng
    const ix = Math.floor(rng() * N), iy = Math.floor(rng() * N);
    h[iy * N + ix] -= 0.1 + rng() * 0.12;
  }
  return normalFromHeight(h, N, N, 1.6, aniso);
}

// ───────────────────────── kayu
/** Papan kayu berserat (serat sepanjang u). 1 tekstur = 4 × 4 u (4 papan × 1 u). */
export function woodTex(aniso: number): { map: THREE.Texture; normal: THREE.Texture } {
  const W = 256, H = 256, rng = makeRng(3307), img = new ImageData(W, H), hgt = new Float32Array(W * H);
  const grain = fbm(4, 64, 3, 311), warp = lowField(64, 64, fbm(8, 8, 2, 313)), knotN = lowField(64, 64, vnoise(16, 16, 317));
  const plankTone = Array.from({ length: 4 }, () => 0.82 + rng() * 0.3);
  const plankShift = Array.from({ length: 4 }, () => rng());
  const knots: [number, number, number][] = [];
  for (let i = 0; i < 5; i++) knots.push([rng() * W, rng() * H, 1.5 + rng() * 2.5]);
  const PL = H / 4;
  for (let y = 0; y < H; y++) {
    const p = Math.floor(y / PL), py = (y % PL) / PL;
    for (let x = 0; x < W; x++) {
      const u = x / W, v = y / H;
      let g = grain(u + plankShift[p], v + warp(u, v) * 0.05);
      // cincin tahun: garis memanjang + mata kayu
      let ring = Math.sin((v * 64 + g * 10) * Math.PI);
      for (const [kx, ky, kr] of knots) {
        const dy = y - ky;
        if (dy > kr * 3 || dy < -kr * 3) continue;
        let dx = x - kx; if (dx > W / 2) dx -= W; if (dx < -W / 2) dx += W;
        const d = Math.hypot(dx * 0.45, dy);
        if (d < kr * 3) { const k = 1 - d / (kr * 3); ring = ring * (1 - k) + Math.sin(d * 2.2) * k; g -= Math.max(0, 1 - d / kr) * 0.45; }
      }
      const seam = py < 0.03 || py > 0.97 ? 0.45 : 1;
      const tone = plankTone[p] * (0.8 + 0.12 * ring * 0.5 + 0.26 * (g - 0.5)) * seam * (0.94 + knotN(u, v) * 0.1);
      const o = (y * W + x) * 4;
      img.data[o] = Math.min(255, 196 * tone); img.data[o + 1] = Math.min(255, 168 * tone); img.data[o + 2] = Math.min(255, 128 * tone); img.data[o + 3] = 255;
      hgt[y * W + x] = (seam < 1 ? -0.6 : 0) + ring * 0.05 + g * 0.25;
    }
  }
  // lubang paku di ujung papan
  for (let p = 0; p < 4; p++) for (const xx of [0.06, 0.48, 0.94]) for (const yy of [0.3, 0.7]) {
    const cx = Math.floor(xx * W), cy = Math.floor((p + yy) * PL);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx * dx + dy * dy <= 1) {
      const o = ((cy + dy) * W + cx + dx) * 4;
      img.data[o] *= 0.4; img.data[o + 1] *= 0.4; img.data[o + 2] *= 0.42;
      hgt[(cy + dy) * W + cx + dx] -= 0.4;
    }
  }
  const [c, g] = canvas(W, H);
  g.putImageData(img, 0, 0);
  return { map: toTex(c, aniso, true), normal: normalFromHeight(hgt, W, H, 2.0, aniso) };
}

// ───────────────────────── beton
/** Beton barrier/blok: pori, agregat, noda. 1 tekstur = 4 × 4 u. */
export function concreteTex(aniso: number): { map: THREE.Texture; normal: THREE.Texture } {
  const N = 256, rng = makeRng(4409), img = new ImageData(N, N), h = new Float32Array(N * N);
  const big = fbm(4, 4, 3, 441), small = vnoise(64, 64, 443);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = x / N, v = y / N, b = big(u, v), s = small(u, v);
    const t = 0.84 + (b - 0.5) * 0.22 + (s - 0.5) * 0.1;
    const o = (y * N + x) * 4;
    img.data[o] = 186 * t; img.data[o + 1] = 180 * t; img.data[o + 2] = 168 * t; img.data[o + 3] = 255;
    h[y * N + x] = b * 0.12 + s * 0.08;
  }
  for (let k = 0; k < 700; k++) {         // pori (gelap) & agregat (terang)
    const x = Math.floor(rng() * N), y = Math.floor(rng() * N), dark = rng() < 0.65, r = rng() < 0.15 ? 2 : 1;
    for (let dy = -r + 1; dy < r; dy++) for (let dx = -r + 1; dx < r; dx++) {
      const ix = (x + dx + N) % N, iy = (y + dy + N) % N, o = (iy * N + ix) * 4, k2 = dark ? 0.6 : 1.12;
      img.data[o] = Math.min(255, img.data[o] * k2); img.data[o + 1] = Math.min(255, img.data[o + 1] * k2); img.data[o + 2] = Math.min(255, img.data[o + 2] * k2);
      h[iy * N + ix] += dark ? -0.35 : 0.1;
    }
  }
  const [c, g] = canvas(N, N);
  g.putImageData(img, 0, 0);
  return { map: toTex(c, aniso, true), normal: normalFromHeight(h, N, N, 1.4, aniso) };
}

// ───────────────────────── karet (ban, kabel, barang gelap)
/** Karet gelap + tapak ban (u = keliling, v = lebar). 1 tekstur = 2 × 1 u. */
export function rubberTex(aniso: number): { map: THREE.Texture; normal: THREE.Texture } {
  const W = 256, H = 128, img = new ImageData(W, H), h = new Float32Array(W * H), n = vnoise(32, 16, 557);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const v = y / H, u = x / W;
    // blok tapak zig-zag: alur melintang tiap 16 px + alur tengah memanjang
    const cx = (x + (v < 0.5 ? 0 : 8)) % 16;
    const groove = cx < 3 || Math.abs(v - 0.5) < 0.04 || v < 0.08 || v > 0.92;
    const t = (groove ? 0.55 : 1) * (0.9 + n(u, v) * 0.2);
    const o = (y * W + x) * 4;
    img.data[o] = 58 * t; img.data[o + 1] = 57 * t; img.data[o + 2] = 55 * t; img.data[o + 3] = 255;
    h[y * W + x] = groove ? 0 : 1;
  }
  const [c, g] = canvas(W, H);
  g.putImageData(img, 0, 0);
  return { map: toTex(c, aniso, true), normal: normalFromHeight(h, W, H, 1.6, aniso) };
}

// ───────────────────────── kain terpal (mask)
/** Mask terpal 1 panel: u 0..1 melintang panel, v 0..1 bawah → atas (pagar 9 u). Kelim atas + mata ayam, kelim samping. */
export function tarpMask(aniso: number): { map: THREE.Texture; normal: THREE.Texture } {
  const W = 512, H = 512, rng = makeRng(6620);
  const [, gr] = canvas(W, H, true);
  gr.fillStyle = '#c8c8c8'; gr.fillRect(0, 0, W, H);
  // lipatan/kusut: pita vertikal terang-gelap lembut + diagonal dari mata ayam
  for (let i = 0; i < 26; i++) {
    const x = rng() * W, wd = 8 + rng() * 40, a = 0.05 + rng() * 0.1;
    const gd = gr.createLinearGradient(x - wd, 0, x + wd, 0);
    gd.addColorStop(0, 'rgba(0,0,0,0)'); gd.addColorStop(0.5, rng() < 0.5 ? `rgba(0,0,0,${a})` : `rgba(255,255,255,${a})`); gd.addColorStop(1, 'rgba(0,0,0,0)');
    gr.fillStyle = gd; gr.fillRect(x - wd, 0, wd * 2, H);
  }
  // kelim atas (pita ganda) + samping + mata ayam
  gr.fillStyle = 'rgba(255,255,255,0.22)'; gr.fillRect(0, 0, W, 22);
  gr.fillStyle = 'rgba(0,0,0,0.25)'; gr.fillRect(0, 22, W, 2); gr.fillRect(0, 4, W, 1);
  gr.fillStyle = 'rgba(255,255,255,0.15)'; gr.fillRect(0, 0, 14, H); gr.fillRect(W - 14, 0, 14, H);
  gr.fillStyle = 'rgba(0,0,0,0.25)'; gr.fillRect(14, 0, 2, H); gr.fillRect(W - 16, 0, 2, H);
  gr.fillStyle = 'rgba(255,255,255,0.12)'; gr.fillRect(0, H - 12, W, 12);
  for (const gx of [0.08, 0.36, 0.64, 0.92]) {
    const x = gx * W;
    gr.fillStyle = '#e8e8e8'; gr.beginPath(); gr.arc(x, 11, 6.5, 0, Math.PI * 2); gr.fill();
    gr.fillStyle = '#202020'; gr.beginPath(); gr.arc(x, 11, 3.5, 0, Math.PI * 2); gr.fill();
  }
  // G: noda — aliran karat dari mata ayam, bercak kotor
  const [, gg] = canvas(W, H, true);
  gg.fillStyle = '#000'; gg.fillRect(0, 0, W, H);
  for (const gx of [0.08, 0.36, 0.64, 0.92]) {
    const x = gx * W, len = 60 + rng() * 220;
    const gd = gg.createLinearGradient(0, 14, 0, 14 + len);
    gd.addColorStop(0, 'rgba(255,255,255,0.7)'); gd.addColorStop(1, 'rgba(255,255,255,0)');
    gg.fillStyle = gd; gg.fillRect(x - 3, 14, 6, len);
  }
  for (let i = 0; i < 30; i++) {
    const x = rng() * W, y = rng() * H, r = 10 + rng() * 60;
    const gd = gg.createRadialGradient(x, y, 0, x, y, r);
    gd.addColorStop(0, `rgba(255,255,255,${0.15 + rng() * 0.3})`); gd.addColorStop(1, 'rgba(255,255,255,0)');
    gg.fillStyle = gd; gg.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // B: debu di bawah (tanah memercik) + garis debu di lipatan
  const [, gb] = canvas(W, H, true);
  gb.fillStyle = '#000'; gb.fillRect(0, 0, W, H);
  {
    const gd = gb.createLinearGradient(0, H, 0, H * 0.55);
    gd.addColorStop(0, 'rgba(255,255,255,0.95)'); gd.addColorStop(0.3, 'rgba(255,255,255,0.45)'); gd.addColorStop(1, 'rgba(255,255,255,0)');
    gb.fillStyle = gd; gb.fillRect(0, H * 0.55, W, H * 0.45);
  }
  for (let i = 0; i < 500; i++) {
    const x = rng() * W, y = H - rng() ** 2 * H * 0.5, r = 1 + rng() * 4;
    gb.fillStyle = `rgba(255,255,255,${0.2 + rng() * 0.5})`; gb.beginPath(); gb.arc(x, y, r, 0, Math.PI * 2); gb.fill();
  }
  const R = channel(gr, W, H), G = channel(gg, W, H), B = channel(gb, W, H), img = new ImageData(W, H);
  const N = 256, hgt = new Float32Array(N * N), wn = vnoise(32, 32, 671);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, o = i * 4;
    // anyaman halus (kotak-kotak 4 px)
    const weave = ((x >> 2) + (y >> 2)) & 1 ? 0.97 : 1.03;
    img.data[o] = Math.min(255, R[i] * weave * 255); img.data[o + 1] = G[i] * 255; img.data[o + 2] = B[i] * 255; img.data[o + 3] = 255;
  }
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const weave = Math.sin(x * Math.PI / 2) * Math.sin(y * Math.PI / 2) * 0.06;
    hgt[y * N + x] = weave + wn(x / N, y / N) * 0.18 + R[(y * 2) * W + x * 2] * 0.5;
  }
  const [c, g] = canvas(W, H);
  g.putImageData(img, 0, 0);
  return { map: toTex(c, aniso, false), normal: normalFromHeight(hgt, N, N, 1.1, aniso) };
}

// ───────────────────────── tanah: detail berulang (pengali) + normal
export const GROUND_DETAIL_SPAN = 6;   // u per petak detail

/** Pengali detail pasir/beton (linear, rata-rata ±0.5 → shader ×2): butir, kerikil, retak rambut. + normal map serasi. */
export function groundDetail(aniso: number): { map: THREE.Texture; normal: THREE.Texture } {
  const N = 512, rng = makeRng(8128), h = new Float32Array(N * N), img = new ImageData(N, N);
  const f1 = fbm(8, 8, 4, 811), f2 = vnoise(128, 128, 813), ripple = vnoise(16, 4, 815);
  const A1 = new Float32Array(N * N), A2 = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = x / N, v = y / N, i = y * N + x;
    A1[i] = f1(u, v); A2[i] = f2(u, v);
    h[i] = A1[i] * 0.5 + A2[i] * 0.35 + Math.sin((v * 24 + ripple(u, v) * 3) * Math.PI) * 0.04;
  }
  // kerikil: kubah kecil dengan sisi teduh (normal) + warna sedikit beda
  const peb: [number, number, number, number][] = [];
  for (let k = 0; k < 420; k++) peb.push([rng() * N, rng() * N, 1 + rng() ** 2 * 4.5, rng()]);
  for (const [cx, cy, r] of peb) {
    for (let y = -Math.ceil(r); y <= r; y++) for (let x = -Math.ceil(r); x <= r; x++) {
      const q = (x * x + y * y) / (r * r);
      if (q >= 1) continue;
      const ix = ((Math.round(cx + x) % N) + N) % N, iy = ((Math.round(cy + y) % N) + N) % N;
      h[iy * N + ix] += Math.sqrt(1 - q) * r * 0.12;
    }
  }
  // retak rambut (alur gelap)
  for (let k = 0; k < 6; k++) {
    let x = rng() * N, y = rng() * N, a = rng() * Math.PI * 2;
    for (let s = 0; s < 90; s++) {
      a += (rng() - 0.5) * 0.7; x += Math.cos(a) * 1.5; y += Math.sin(a) * 1.5;
      const ix = ((Math.round(x) % N) + N) % N, iy = ((Math.round(y) % N) + N) % N;
      h[iy * N + ix] -= 0.35;
    }
  }
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = y * N + x, o = i * 4;
    const t = 0.5 + (A1[i] - 0.5) * 0.2 + (A2[i] - 0.5) * 0.12 + (h[i] - 0.45) * 0.08;
    img.data[o] = img.data[o + 1] = img.data[o + 2] = Math.max(0, Math.min(255, t * 255)); img.data[o + 3] = 255;
  }
  // warna kerikil (lebih terang/gelap) di atas pengali
  for (const [cx, cy, r, tone] of peb) {
    const k = tone < 0.5 ? 0.86 : 1.1;
    for (let y = -Math.ceil(r); y <= r; y++) for (let x = -Math.ceil(r); x <= r; x++) {
      if (x * x + y * y >= r * r) continue;
      const ix = ((Math.round(cx + x) % N) + N) % N, iy = ((Math.round(cy + y) % N) + N) % N, o = (iy * N + ix) * 4;
      img.data[o] = img.data[o + 1] = img.data[o + 2] = Math.min(255, img.data[o] * k);
    }
  }
  const [c, g] = canvas(N, N);
  g.putImageData(img, 0, 0);
  return { map: toTex(c, aniso, false), normal: normalFromHeight(h, N, N, 3.0, aniso) };
}

/** Riak genangan: permukaan air nyaris diam — derau halus berlapis (tanpa cincin besar yang tampak seperti seng). */
export function puddleNormal(aniso: number): THREE.Texture {
  const N = 128, h = new Float32Array(N * N), n1 = vnoise(8, 8, 991), n2 = vnoise(24, 24, 993);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) h[y * N + x] = n1(x / N, y / N) * 0.6 + n2(x / N, y / N) * 0.25;
  return normalFromHeight(h, N, N, 1.0, aniso);
}

/** Derau langit (GPU fbm): 4 kanal derau nilai berulang 16 sel / 256 px, benih berbeda. */
export function skyNoise(): THREE.DataTexture {
  const N = 256, data = new Uint8Array(N * N * 4), ch = [vnoise(16, 16, 1201), vnoise(16, 16, 1203), vnoise(16, 16, 1205), vnoise(16, 16, 1207)];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) for (let k = 0; k < 4; k++) data[(y * N + x) * 4 + k] = ch[k](x / N, y / N) * 255;
  const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
  t.colorSpace = THREE.NoColorSpace;
  t.needsUpdate = true;
  return t;
}

export type { Rng };
