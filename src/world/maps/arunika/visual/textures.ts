// src/world/maps/arunika/visual/textures.ts — tekstur prosedural Candi Arunika (kanvas, tanpa file gambar). Warna dasar dibuat
// terang/netral; warna verteks di geometri memberi nada per benda (andesit abu kehijauan, bata merah, jati, genteng, ...).
// Semua dipanggil saat membangun map (BUKAN saat impor modul — test Node mengimpor registry) dan di-cache sisi CPU (cachedTex).
import * as THREE from 'three';
import { makeRng } from '../../../../core/Rng';
import { canvas, fbm, lowField, normalFromHeight, toTex, vnoise } from '../../steelyard/visual/textures';
import type { MapPair } from '../../boston/visual/textures';
import { canvasFont } from '../../../../ui/fonts';

const put = (img: ImageData, o: number, r: number, g: number, b: number, a = 255) => {
  img.data[o] = r < 0 ? 0 : r > 255 ? 255 : r; img.data[o + 1] = g < 0 ? 0 : g > 255 ? 255 : g;
  img.data[o + 2] = b < 0 ? 0 : b > 255 ? 255 : b; img.data[o + 3] = a;
};
const pair = (img: ImageData, h: Float32Array, W: number, H: number, strength: number, aniso: number): MapPair => {
  const [c, g] = canvas(W, H); g.putImageData(img, 0, 0);
  return { map: toTex(c, aniso, true), normal: normalFromHeight(h, W, H, strength, aniso) };
};

/** Pola pasangan blok berulang: tiap lapis (tinggi courseH px) dipecah blok selebar [minL, maxL] px, sambungan antar lapis
 *  bergeser. Hasil per piksel: jarak ke nat (px), indeks blok (untuk nada acak). */
function masonry(W: number, H: number, courseH: number, minL: number, maxL: number, seed: number) {
  const rng = makeRng(seed), rows: { edges: number[]; tone: number[] }[] = [];
  // H kelipatan courseH & tiap lapis berakhir tepat di x0 + W → berulang mulus di kedua arah
  for (let r = 0; r < Math.round(H / courseH); r++) {
    const edges: number[] = [], tone: number[] = [], x0 = Math.floor(rng() * maxL);
    let x = x0;
    edges.push(x);
    while (x + minL + maxL < x0 + W) { x += minL + Math.floor(rng() * (maxL - minL)); edges.push(x); tone.push(rng()); }
    edges.push(x0 + W); tone.push(rng());
    rows.push({ edges, tone });
  }
  return (x: number, y: number): [number, number] => {
    const r = Math.floor(y / courseH) % rows.length, ly = y % courseH, row = rows[r];
    const xx = ((x - row.edges[0]) % W + W) % W + row.edges[0];
    let i = 0;
    while (i < row.edges.length - 2 && row.edges[i + 1] <= xx) i++;
    const dx = Math.min(xx - row.edges[i], row.edges[i + 1] - xx), dy = Math.min(ly, courseH - 1 - ly);
    return [Math.min(dx, dy), r * 97 + i];
  };
}

/** Batu andesit candi: pasangan blok rata (lapis 0.67 u, blok 0.85–1.9 u), nat gelap cekung, pori, noda air, LUMUT & lumut kerak
 *  di nat dan sebagian permukaan. Rentang 4 u (120 px/u). Terang & sedikit hangat → warna verteks memberi nada. */
export function andesiteTex(aniso: number): MapPair {
  const N = 480, img = new ImageData(N, N), h = new Float32Array(N * N);
  const blk = masonry(N, N, 80, 100, 225, 9101);
  const grain = vnoise(128, 128, 9103), mid = fbm(8, 8, 3, 9105), mossF = lowField(64, 64, fbm(6, 6, 4, 9107));
  const lich = vnoise(48, 48, 9109), streak = lowField(64, 64, fbm(16, 2, 2, 9111));
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const [e, id] = blk(x, y), u = x / N, v = y / N, o = (y * N + x) * 4;
    const t = ((id * 2654435761) >>> 0) / 4294967296;
    const g = grain(u, v), m = mid(u, v);
    let k = 0.86 + (t - 0.5) * 0.14 + (m - 0.5) * 0.16 + (g - 0.5) * 0.1;
    k -= Math.max(0, streak(u, v) - 0.55) * 0.5;                       // noda aliran air hujan
    let hh = g * 0.25 + m * 0.2;
    const pit = g > 0.86 ? (g - 0.86) * 4 : 0;                          // pori
    k -= pit * 0.35; hh -= pit * 0.5;
    const joint = e < 3 ? 1 : e < 6 ? (6 - e) / 3 : 0;
    k *= 1 - joint * 0.55; hh -= joint * 0.9;
    // lumut: kuat di nat & tepi blok bawah, bercak di permukaan
    const mf = mossF(u, v);
    const moss = Math.min(1, Math.max(0, (mf - 0.52) * 3) * (0.35 + 0.65 * Math.max(joint, e < 12 ? (12 - e) / 12 : 0)) + Math.max(0, mf - 0.7) * 1.5);
    const li = lich(u, v) > 0.8 ? (lich(u, v) - 0.8) * 3 : 0;          // lumut kerak pucat
    let r = 196 * k, gg = 192 * k, b = 182 * k;
    r = r * (1 - moss) + 104 * moss * (0.8 + g * 0.4); gg = gg * (1 - moss) + 124 * moss * (0.8 + g * 0.4); b = b * (1 - moss) + 70 * moss * (0.8 + g * 0.4);
    r += li * 30; gg += li * 32; b += li * 18;
    put(img, o, r, gg, b);
    h[y * N + x] = hh + moss * 0.15;
  }
  return pair(img, h, N, N, 2.2, aniso);
}

/** Bata merah gaya Majapahit (gapura candi bentar, tembok kompleks): bata tipis 0.25 × 0.85 u tanpa adukan tebal (nat rapat),
 *  nada tiap bata beragam (jingga → merah tua → gosong), aus di tepi, bercak lumut. Rentang 4 u. */
export function brickTex(aniso: number): MapPair {
  const N = 512, img = new ImageData(N, N), h = new Float32Array(N * N);
  const blk = masonry(N, N, 32, 92, 126, 9201), grain = vnoise(128, 128, 9203), mid = fbm(6, 6, 3, 9205), mossF = lowField(64, 64, fbm(5, 5, 4, 9207));
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const [e, id] = blk(x, y), u = x / N, v = y / N, o = (y * N + x) * 4;
    const t = ((id * 2654435761) >>> 0) / 4294967296, g = grain(u, v);
    const burnt = t > 0.9 ? 0.62 : t < 0.12 ? 1.12 : 1;
    let k = (0.82 + (t - 0.5) * 0.24 + (mid(u, v) - 0.5) * 0.14 + (g - 0.5) * 0.12) * burnt;
    const joint = e < 2 ? 1 : e < 4 ? (4 - e) / 2 : 0;
    k *= 1 - joint * 0.45;
    const moss = Math.max(0, (mossF(u, v) - 0.6) * 2.4) * (0.4 + joint * 0.6);
    let r = 214 * k, gg = 124 * k, b = 92 * k;
    r = r * (1 - moss) + 96 * moss; gg = gg * (1 - moss) + 112 * moss; b = b * (1 - moss) + 64 * moss;
    put(img, o, r, gg, b);
    h[y * N + x] = g * 0.25 - joint * 0.8 - (e < 7 ? (7 - e) * 0.02 : 0);
  }
  return pair(img, h, N, N, 2.0, aniso);
}

/** Relief pahatan pita (dinding tubuh candi, aling-aling, kaki teras): sulur gelung + medali teratai berulang, latar cekung gelap.
 *  1 petak = 2 × 1 u (256 × 128 px), berulang mendatar. */
export function reliefTex(aniso: number): MapPair {
  const W = 256, H = 128, img = new ImageData(W, H), h = new Float32Array(W * H), grain = vnoise(64, 32, 9301), mid = fbm(8, 4, 3, 9303);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const u = x / W, v = y / H;
    // bingkai atas/bawah
    let hh = 0;
    if (v < 0.1 || v > 0.9) hh = 0.9; else if (v < 0.14 || v > 0.86) hh = 0.45;
    else {
      // medali teratai di tengah tiap petak
      const cx = (u % 0.5) - 0.25, cy = v - 0.5, r = Math.hypot(cx * 2, cy);
      const ang = Math.atan2(cy, cx * 2);
      const petal = Math.cos(ang * 8) * 0.5 + 0.5;
      if (r < 0.3) hh = r < 0.08 ? 0.95 : (r < 0.3 - petal * 0.1 ? 0.75 + petal * 0.2 : 0.1);
      else {
        // sulur gelung: gelombang sinus + spiral kecil
        const s = Math.sin((u * 4 + 0.25) * Math.PI * 2) * 0.22, d = Math.abs(cy - s);
        const curl = Math.hypot(((u * 4) % 1) - 0.5, (cy + 0.18 * Math.sign(s || 1)) * 2.2);
        hh = d < 0.05 ? 0.8 : curl < 0.22 && curl > 0.13 ? 0.7 : 0.05;
        if (hh < 0.1 && grain(u, v) > 0.7) hh = 0.25;                   // daun kecil
      }
    }
    const k = (0.7 + hh * 0.32) * (0.92 + (mid(u, v) - 0.5) * 0.18) * (0.95 + grain(u, v) * 0.08);
    put(img, (y * W + x) * 4, 200 * k, 196 * k, 184 * k);
    h[y * W + x] = hh + grain(u, v) * 0.08;
  }
  return pair(img, h, W, H, 3.2, aniso);
}

/** Genteng tanah liat (atap pelana rumah, atap joglo, wihara): baris genteng melengkung saling tindih (lebar 0.6 u, baris 0.45 u),
 *  nada tiap genteng beragam, lumut di sebagian. Rentang 3 u. u = sepanjang lis, v = turun lereng. */
export function rooftileTex(aniso: number): MapPair {
  const N = 256, img = new ImageData(N, N), h = new Float32Array(N * N), rng = makeRng(9401), grain = vnoise(64, 64, 9403), mossF = lowField(32, 32, fbm(4, 4, 3, 9405));
  const TW = 51, TH = 38, tone = Array.from({ length: 64 }, () => 0.8 + rng() * 0.32);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const row = Math.floor(y / TH), ly = (y % TH) / TH, sx = x + (row % 2) * (TW / 2), col = Math.floor(sx / TW), lx = (sx % TW) / TW;
    const curve = Math.sin(lx * Math.PI);                               // lengkung genteng
    const lap = ly > 0.82 ? (ly - 0.82) * 5.5 : 0;                      // bayangan tindihan baris bawah
    const t = tone[(row * 7 + col * 13) & 63];
    const k = t * (0.78 + curve * 0.26) * (1 - lap * 0.55) * (0.94 + grain(x / N, y / N) * 0.1);
    const moss = Math.max(0, (mossF(x / N, y / N) - 0.62) * 2.2);
    put(img, (y * N + x) * 4, (196 * (1 - moss) + 92 * moss) * k, (104 * (1 - moss) + 104 * moss) * k, (70 * (1 - moss) + 60 * moss) * k);
    h[y * N + x] = curve * 0.6 - lap * 0.8 + ly * 0.3;
  }
  return pair(img, h, N, N, 2.4, aniso);
}

/** Paving batu pelataran: lempeng batu besar tak beraturan (1.2–2.6 u), rumput & lumut di nat, aus di tengah. Rentang 8 u. */
export function pavingTex(aniso: number): MapPair {
  const N = 512, img = new ImageData(N, N), h = new Float32Array(N * N);
  const blk = masonry(N, N, 128, 80, 170, 9501), grain = vnoise(128, 128, 9503), mid = fbm(8, 8, 3, 9505), grass = vnoise(256, 256, 9507);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const [e, id] = blk(x, y), u = x / N, v = y / N, o = (y * N + x) * 4;
    const t = ((id * 2654435761) >>> 0) / 4294967296, g = grain(u, v);
    let k = 0.84 + (t - 0.5) * 0.16 + (mid(u, v) - 0.5) * 0.14 + (g - 0.5) * 0.08;
    const joint = e < 3 ? 1 : e < 5 ? (5 - e) / 2 : 0;
    let r = 192 * k, gg = 186 * k, b = 172 * k;
    if (joint > 0) {
      const gr = grass(u, v);
      const gk = 0.5 + gr * 0.5;
      r = r * (1 - joint) + 78 * gk * joint; gg = gg * (1 - joint) + 108 * gk * joint; b = b * (1 - joint) + 52 * gk * joint;
    }
    put(img, o, r, gg, b);
    h[y * N + x] = g * 0.2 - joint * 0.7 + (t - 0.5) * 0.1;
  }
  return pair(img, h, N, N, 1.6, aniso);
}

/** Tanah hutan (jalur samping, pasar): tanah cokelat padat, rumput berbercak, serasah daun, kerikil. Rentang 8 u. */
export function groundTex(aniso: number): MapPair {
  const N = 512, img = new ImageData(N, N), h = new Float32Array(N * N);
  const big = lowField(64, 64, fbm(6, 6, 4, 9601)), fine = vnoise(256, 256, 9603), blade = vnoise(512, 64, 9605), leaf = vnoise(96, 96, 9607);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = x / N, v = y / N, o = (y * N + x) * 4, b = big(u, v), f = fine(u, v);
    const gm = Math.min(1, Math.max(0, (b - 0.42) * 3.2));               // rumput
    const bl = blade(u, v);
    let r = 150 * (0.82 + f * 0.3), g = 118 * (0.82 + f * 0.3), bb = 86 * (0.82 + f * 0.3);
    const gk = 0.7 + bl * 0.5;
    r = r * (1 - gm) + 92 * gk * gm; g = g * (1 - gm) + 128 * gk * gm; bb = bb * (1 - gm) + 58 * gk * gm;
    const lf = leaf(u, v);
    if (lf > 0.78) { const k = (lf - 0.78) * 4; r = r * (1 - k) + 150 * k; g = g * (1 - k) + 96 * k; bb = bb * (1 - k) + 48 * k; }   // serasah
    if (f > 0.9) { const k = (f - 0.9) * 6; r += 40 * k; g += 38 * k; bb += 34 * k; }   // kerikil
    put(img, o, r, g, bb);
    h[y * N + x] = gm * bl * 0.5 + f * 0.25 + (lf > 0.78 ? 0.2 : 0);
  }
  return pair(img, h, N, N, 1.4, aniso);
}

/** Kulit kayu beringin/kamboja: serat tegak berkerut + akar gantung menyatu, kerak lumut. Rentang 2 u (u = keliling, v = tinggi). */
export function barkTex(aniso: number): MapPair {
  const N = 256, img = new ImageData(N, N), h = new Float32Array(N * N), fib = vnoise(48, 6, 9701), knot = vnoise(12, 12, 9703), mossF = vnoise(8, 8, 9705);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = x / N, v = y / N, f = fib(u, v), kn = knot(u, v);
    const ridge = Math.pow(Math.abs(Math.sin((u * 24 + f * 3 + kn * 1.5) * Math.PI)), 0.6);
    const k = 0.62 + ridge * 0.34 + (kn - 0.5) * 0.16;
    const moss = Math.max(0, (mossF(u, v) - 0.6) * 2);
    put(img, (y * N + x) * 4, (148 * (1 - moss) + 90 * moss) * k, (136 * (1 - moss) + 108 * moss) * k, (118 * (1 - moss) + 62 * moss) * k);
    h[y * N + x] = ridge * 0.8 + kn * 0.3;
  }
  return pair(img, h, N, N, 2.6, aniso);
}

/** Kartu daun (tajuk pohon): gerombol daun lonjong berlapis di latar transparan (alphaTest). 256², variasi hijau tua → muda.
 *  `kind` = 'banyan' (daun kecil rapat) / 'kamboja' (daun lebar + bunga putih-kuning) / 'palm' (pelepah). */
export function leafTex(kind: 'banyan' | 'kamboja' | 'palm' | 'grass'): THREE.Texture {
  const S = 256, [c, g] = canvas(S, S, true), rng = makeRng(kind === 'banyan' ? 9801 : kind === 'kamboja' ? 9803 : kind === 'palm' ? 9805 : 9807);
  g.clearRect(0, 0, S, S);
  if (kind === 'grass') {
    // rumpun rumput: bilah meruncing dari dasar, melengkung, hijau kekuningan; ujung lebih terang
    for (let i = 0; i < 70; i++) {
      const x0 = S * (0.2 + rng() * 0.6), lean = (rng() - 0.5) * S * 0.5, hgt = S * (0.45 + rng() * 0.5), w = 3 + rng() * 4;
      const sh = 0.75 + rng() * 0.45;
      const grd = g.createLinearGradient(0, S, 0, S - hgt);
      grd.addColorStop(0, `rgb(${70 * sh | 0},${104 * sh | 0},${40 * sh | 0})`);
      grd.addColorStop(1, `rgb(${168 * sh | 0},${190 * sh | 0},${96 * sh | 0})`);
      g.fillStyle = grd;
      g.beginPath(); g.moveTo(x0 - w, S); g.quadraticCurveTo(x0 + lean * 0.3, S - hgt * 0.6, x0 + lean, S - hgt);
      g.quadraticCurveTo(x0 + lean * 0.3 + w * 0.3, S - hgt * 0.6, x0 + w, S); g.closePath(); g.fill();
    }
  } else if (kind === 'palm') {
    // pelepah kelapa: tulang daun melengkung + anak daun menyirip
    for (let f = 0; f < 3; f++) {
      const y0 = S * (0.3 + f * 0.2);
      g.strokeStyle = 'rgb(96,104,48)'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(0, y0); g.quadraticCurveTo(S * 0.5, y0 - 30, S, y0 + 10); g.stroke();
      for (let i = 0; i < 40; i++) {
        const t = i / 40, x = t * S, yy = y0 - 30 * 4 * t * (1 - t) + 10 * t;
        const shade = 0.8 + rng() * 0.4;
        g.strokeStyle = `rgb(${108 * shade | 0},${152 * shade | 0},${62 * shade | 0})`; g.lineWidth = 4.5;
        g.beginPath(); g.moveTo(x, yy); g.lineTo(x + 6, yy - 22 - rng() * 10); g.stroke();
        g.beginPath(); g.moveTo(x, yy); g.lineTo(x + 6, yy + 22 + rng() * 10); g.stroke();
      }
    }
  } else {
    const n = kind === 'banyan' ? 420 : 160, L = kind === 'banyan' ? 11 : 24, Wd = kind === 'banyan' ? 5 : 9;
    for (let i = 0; i < n; i++) {
      const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * S * 0.46, x = S / 2 + Math.cos(a) * r, y = S / 2 + Math.sin(a) * r * 0.9;
      const shade = 0.7 + rng() * 0.5 + (y < S / 2 ? 0.12 : -0.06);
      const base = kind === 'banyan' ? [96, 146, 66] : [104, 154, 74];
      g.fillStyle = `rgb(${base[0] * shade | 0},${base[1] * shade | 0},${base[2] * shade | 0})`;
      g.save(); g.translate(x, y); g.rotate(rng() * Math.PI * 2);
      g.beginPath(); g.ellipse(0, 0, L * (0.7 + rng() * 0.5), Wd * (0.7 + rng() * 0.5), 0, 0, Math.PI * 2); g.fill();
      g.strokeStyle = `rgba(30,50,20,0.35)`; g.lineWidth = 0.8; g.beginPath(); g.moveTo(-L * 0.7, 0); g.lineTo(L * 0.7, 0); g.stroke();
      g.restore();
    }
    if (kind === 'kamboja') {                 // bunga kamboja: 5 kelopak putih, pusat kuning
      for (let i = 0; i < 26; i++) {
        const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * S * 0.4, x = S / 2 + Math.cos(a) * r, y = S / 2 + Math.sin(a) * r * 0.85;
        for (let p = 0; p < 5; p++) {
          const pa = p / 5 * Math.PI * 2 + rng() * 0.3;
          g.fillStyle = 'rgb(250,246,236)';
          g.beginPath(); g.ellipse(x + Math.cos(pa) * 4, y + Math.sin(pa) * 4, 4.5, 2.6, pa, 0, Math.PI * 2); g.fill();
        }
        g.fillStyle = 'rgb(246,204,88)'; g.beginPath(); g.arc(x, y, 2.4, 0, Math.PI * 2); g.fill();
      }
    }
  }
  const t = toTex(c, 4, true, false);
  t.generateMipmaps = true;
  return t;
}

/** Kisi genta stupa kecil (berlubang wajik seperti Borobudur): batu terang + lubang gelap (bukan alpha — collider genta padat).
 *  u = keliling (1 petak = 1 lubang), v = tinggi. 128². */
export function latticeTex(aniso: number): MapPair {
  const N = 128, img = new ImageData(N, N), h = new Float32Array(N * N), grain = vnoise(32, 32, 9901);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const cx = Math.abs((x % 64) - 32) / 32, cy = Math.abs((y % 64) - 32) / 32, d = cx + cy;
    const hole = d < 0.55, rim = d < 0.68;
    const k = hole ? 0.16 : (rim ? 0.78 : 0.9) * (0.9 + grain(x / N, y / N) * 0.14);
    put(img, (y * N + x) * 4, 196 * k, 192 * k, 180 * k);
    h[y * N + x] = hole ? -1 : rim ? 0.3 : 0.6;
  }
  return pair(img, h, N, N, 2.6, aniso);
}

/** Air: peta normal riak (2 oktaf berulang) untuk kolam & sungai (digeser waktu di shader). 256². */
export function waterNormal(aniso: number): THREE.Texture {
  const N = 256, h = new Float32Array(N * N), a = vnoise(8, 8, 9951), b = vnoise(24, 24, 9953), c = vnoise(64, 64, 9955);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) h[y * N + x] = a(x / N, y / N) * 0.6 + b(x / N, y / N) * 0.3 + c(x / N, y / N) * 0.12;
  return normalFromHeight(h, N, N, 1.4, aniso);
}

/** Air terjun: guratan aliran tegak (alpha di tepi) — digeser ke bawah di shader. 128 × 256. */
export function fallTex(): THREE.Texture {
  const W = 128, H = 256, img = new ImageData(W, H), s = vnoise(64, 4, 9961), s2 = vnoise(128, 8, 9965), f = vnoise(16, 48, 9963);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const u = x / W, v = y / H, st = s(u, v) * 0.6 + s2(u, v) * 0.4, fo = f(u, v);
    const streak = Math.pow(st, 1.6), foam = Math.max(0, fo - 0.55) * 1.6;
    const k = 0.55 + streak * 0.55 + foam * 0.5;
    put(img, (y * W + x) * 4, 196 * k + 40, 222 * k + 32, 230 * k + 26, 255 * Math.min(1, 0.42 + streak * 0.7 + foam * 0.4));
  }
  const [c, g] = canvas(W, H); g.putImageData(img, 0, 0);
  return toTex(c, 4, true);
}

/** Prasasti batu di gapura: "CANDI ARUNIKA" + aksara hias + tahun Saka, huruf terpahat (gelap + sorot tepi). 1024 × 256. */
export function signTex(): THREE.Texture {
  const W = 1024, H = 256, [c, g] = canvas(W, H, true), rng = makeRng(9971);
  g.fillStyle = '#8f8a7e'; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 2600; i++) {                          // tekstur batu
    const v = 110 + rng() * 60;
    g.fillStyle = `rgba(${v},${v - 4},${v - 12},0.35)`;
    g.fillRect(rng() * W, rng() * H, 1 + rng() * 3, 1 + rng() * 3);
  }
  g.strokeStyle = '#5d584f'; g.lineWidth = 8; g.strokeRect(12, 12, W - 24, H - 24);
  g.strokeStyle = '#b4ae9f'; g.lineWidth = 2; g.strokeRect(24, 24, W - 48, H - 48);
  const carve = (txt: string, y: number, px: number) => {
    g.font = canvasFont(px, 800); g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#c9c2b2'; g.fillText(txt, W / 2 + 2, y + 2);         // sorot tepi bawah
    g.fillStyle = '#3f3b34'; g.fillText(txt, W / 2, y);
  };
  carve('CANDI ARUNIKA', H / 2 - 22, 104);
  carve('SURYA  ·  SAKA 1281  ·  SURYA', H / 2 + 62, 30);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

/** Batu tebing & batu besar: batuan berlapis (strata mendatar bergelombang) abu-krem terang, retakan, pori, lumut hijau di lekuk &
 *  tepi lapisan. Rentang 6 u (u = sepanjang muka, v = tinggi). */
export function rockTex(aniso: number): MapPair {
  const N = 512, img = new ImageData(N, N), h = new Float32Array(N * N);
  const big = lowField(64, 64, fbm(5, 5, 5, 9981)), fine = vnoise(256, 256, 9983), crack = lowField(128, 128, fbm(12, 12, 3, 9985));
  const mossF = lowField(64, 64, fbm(4, 4, 4, 9987)), warp = lowField(32, 32, fbm(3, 3, 3, 9989));
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = x / N, v = y / N, b = big(u, v), f = fine(u, v), c = Math.abs(crack(u, v) - 0.5);
    const cr = c < 0.01 ? 1 - c / 0.01 : 0;
    const sv = v * 6 + warp(u, v) * 1.6, sf = sv - Math.floor(sv);
    const ledge = sf < 0.07 ? 1 - sf / 0.07 : 0;                      // tepi lapisan (bayang di bawah tonjolan)
    let k = 0.86 + (b - 0.5) * 0.3 + (f - 0.5) * 0.14 + (Math.floor(sv) % 2) * 0.05 - ledge * 0.32;
    k *= 1 - cr * 0.5;
    const moss = Math.min(1, Math.max(0, (mossF(u, v) - 0.5) * 2.2) + ledge * 0.5 * (mossF(u, v) > 0.4 ? 1 : 0));
    put(img, (y * N + x) * 4, (206 * (1 - moss) + 104 * moss) * k, (198 * (1 - moss) + 128 * moss) * k, (182 * (1 - moss) + 70 * moss) * k);
    h[y * N + x] = b * 0.9 + f * 0.2 - cr * 0.7 + sf * 0.5 - ledge * 0.4;
  }
  return pair(img, h, N, N, 2.2, aniso);
}
