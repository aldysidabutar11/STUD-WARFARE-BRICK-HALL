// src/world/SurfaceMaps.ts — normal map prosedural (tanpa file gambar) dari peta tinggi di kanvas: stud timbul, inlet cekung,
// plester/kayu halus, nat ubin, punggung buku (tata letak sama dengan tekstur dinding buku), anyaman kain. Dipakai material PBR map.
import * as THREE from 'three';
import { makeRng } from '../core/Rng';

const N = 128;

/** Peta tinggi (0..1, ukuran N×N, tile berulang) → normal map ruang tangen (RGB). */
function normalFromHeight(h: Float32Array, strength: number, aniso: number): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = c.height = N;
  const g = c.getContext('2d')!, img = g.createImageData(N, N);
  const at = (x: number, y: number) => h[((y + N) % N) * N + ((x + N) % N)];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    // Sobel (tile berulang di tepi)
    const dx = (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1));
    const dy = (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1));
    let nx = -dx * strength, ny = dy * strength, nz = 1;          // v kanvas ke bawah → balik sumbu Y
    const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    const o = (y * N + x) * 4;
    img.data[o] = (nx * 0.5 + 0.5) * 255; img.data[o + 1] = (ny * 0.5 + 0.5) * 255; img.data[o + 2] = (nz * 0.5 + 0.5) * 255; img.data[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso;
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

const field = (fn: (u: number, v: number) => number) => {
  const h = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) h[y * N + x] = fn((x + 0.5) / N, (y + 0.5) / N);
  return h;
};
const noise = (seed: number) => {
  const r = makeRng(seed), g = new Float32Array(N * N);
  for (let i = 0; i < g.length; i++) g[i] = r();
  // blur ringan (2 lintasan kotak) → derau halus seperti plester / serat
  const b = new Float32Array(g.length);
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      let s = 0;
      for (let k = -1; k <= 1; k++) s += g[y * N + ((x + k + N) % N)] + g[((y + k + N) % N) * N + x];
      b[y * N + x] = s / 6;
    }
    g.set(b);
  }
  return g;
};

/** Atas ber-stud: kubah stud (jari-jari 17/64) + bevel tipis di tepi tiap unit. */
export function studNormal(aniso: number) {
  const n = noise(11);
  return normalFromHeight(field((u, v) => {
    const d = Math.hypot(u - 0.5, v - 0.5) / (17 / 64);
    const dome = d < 1 ? 0.55 + 0.45 * Math.sqrt(1 - d * d) * 0.35 : 0;
    const edge = Math.min(u, v, 1 - u, 1 - v) < 0.03 ? -0.15 : 0;
    return dome + edge + n[Math.floor(v * N) * N + Math.floor(u * N)] * 0.04;
  }), 3.2, aniso);
}

/** Bawah: lubang penerima stud (cincin cekung). */
export function inletNormal(aniso: number) {
  return normalFromHeight(field((u, v) => {
    const d = Math.hypot(u - 0.5, v - 0.5) * 64;
    return d < 9 ? 0.2 : d < 15 ? -0.4 : 0;
  }), 2.5, aniso);
}

/** Sisi halus: plester/kayu bertekstur halus + alur tipis di bawah tiap unit (selaras tekstur sisi). */
export function sideNormal(aniso: number) {
  const n = noise(23), m = noise(29);
  return normalFromHeight(field((u, v) => {
    const i = Math.floor(v * N) * N + Math.floor(u * N);
    return n[i] * 0.3 + m[(i * 7) % (N * N)] * 0.1 + (v > 0.955 ? -0.18 : 0);
  }), 0.9, aniso);
}

/** Ubin diagonal (1 tekstur = 2×2 unit): nat cekung di tepi belah ketupat + sedikit tidak rata. */
export function tileNormal(aniso: number) {
  const n = noise(37);
  return normalFromHeight(field((u, v) => {
    const dia = Math.abs(u - 0.5) + Math.abs(v - 0.5);                 // garis belah ketupat di 0.5
    const grout = Math.abs(dia - 0.5) < 0.012 || Math.min(u, v, 1 - u, 1 - v) < 0.008 ? -0.5 : 0;
    return grout + n[Math.floor(v * N) * N + Math.floor(u * N)] * 0.05;
  }), 3.0, aniso);
}

/** Dinding buku: punggung buku membulat (tata letak = bookwallTexture seed 4242, skala 64 → 128), papan rak menonjol. */
export function bookNormal(aniso: number) {
  const rng = makeRng(4242), books: [number, number, number][] = [];   // x0, x1, tinggi (px kanvas 64)
  let x = 2;
  while (x < 62) {
    const w = 5 + Math.floor(rng() * 5), h = 34 + Math.floor(rng() * 14);
    rng();                                                             // warna (urutan acak sama dengan tekstur)
    books.push([x, x + w - 1, h]); x += w;
  }
  return normalFromHeight(field((u, v) => {
    const px = u * 64, py = v * 64;
    if (py >= 52) return 0.6 + (py > 62 ? -0.2 : 0);                   // papan rak
    for (const [a, b, h] of books) if (px >= a && px < b) {
      if (py < 52 - h) return 0;                                       // celah di atas buku
      const t = (px - a) / (b - a);
      return 0.35 + 0.25 * Math.sin(Math.PI * t);                       // punggung membulat
    }
    return 0;
  }), 2.4, aniso);
}

/** Kain (karpet, spanduk, bahan polos): anyaman halus. */
export function fabricNormal(aniso: number) {
  const n = noise(41);
  return normalFromHeight(field((u, v) => {
    const w = Math.sin(u * Math.PI * 32) * Math.sin(v * Math.PI * 32);
    return w * 0.15 + n[Math.floor(v * N) * N + Math.floor(u * N)] * 0.2;
  }), 1.2, aniso);
}
