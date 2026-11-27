// src/world/maps/meridian/visual.ts — tekstur prosedural (kanvas, tanpa file gambar) & set material Meridian Vault per preset.
// MEDIUM+: PBR (MeshStandard) + normal map prosedural; LOW: Lambert. Satu material = satu bucket geometri (Geo) = satu draw call;
// warna verteks membedakan benda dalam satu bucket (plester navy/krem/putih, marmer putih/abu, logam emas/baja, …).
// UV semua bucket = koordinat dunia (u) → repeat = 1 / rentang tekstur.
import * as THREE from 'three';
import type { GfxProfile } from '../../../config/presets';
import { makeRng } from '../../../core/Rng';
import { cachedTex } from '../steelyard/visual/materials';
import { canvas, fbm, lowField, normalFromHeight, toTex, vnoise } from '../steelyard/visual/textures';
import { woodTex } from '../steelyard/visual/textures';
import { lockerTex, marbleTex, plasterTex, type MapPair } from '../boston/visual/textures';
import { canvasFont } from '../../../ui/fonts';

const put = (img: ImageData, o: number, r: number, g: number, b: number, a = 255) => {
  img.data[o] = Math.max(0, Math.min(255, r)); img.data[o + 1] = Math.max(0, Math.min(255, g)); img.data[o + 2] = Math.max(0, Math.min(255, b)); img.data[o + 3] = a;
};

/** Lantai marmer catur: 2 × 2 petak (petak 2 u) gelap arang & krem, urat marmer, nat tipis. Rentang 4 u. */
export function checkerTex(aniso: number): MapPair {
  const N = 512, T = 256, img = new ImageData(N, N), h = new Float32Array(N * N);
  const warp = lowField(64, 64, fbm(5, 5, 4, 8101)), cloud = fbm(10, 10, 3, 8103);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const tx = x < T ? 0 : 1, ty = y < T ? 0 : 1, dark = (tx + ty) % 2 === 1;
    const lx = x % T, ly = y % T, e = Math.min(lx, ly, T - 1 - lx, T - 1 - ly), o = (y * N + x) * 4;
    if (e < 1.5) { put(img, o, 92, 88, 82); h[y * N + x] = -1; continue; }
    const u = x / N + (dark ? 0.37 : 0), v = y / N + (dark ? 0.21 : 0), w = warp(u % 1, v % 1);
    const vein = Math.pow(1 - Math.abs(Math.sin((u * 2.6 + v * 1.3 + w * 2.8) * Math.PI)), dark ? 18 : 12);
    const vein2 = Math.pow(1 - Math.abs(Math.sin((u * 1.1 - v * 3.2 + w * 3.6) * Math.PI)), 26);
    const c = (cloud(u % 1, v % 1) - 0.5) * 0.1;
    if (dark) { const k = 0.98 + c; put(img, o, (54 + vein * 70 + vein2 * 40) * k, (57 + vein * 68 + vein2 * 38) * k, (62 + vein * 66 + vein2 * 36) * k); }
    else { const k = 0.97 + c - vein * 0.22 - vein2 * 0.12; put(img, o, 226 * k, 218 * k, 203 * k); }
    h[y * N + x] = e < 4 ? -0.4 + e * 0.1 : 0;
  }
  const [cv, g] = canvas(N, N); g.putImageData(img, 0, 0);
  return { map: toTex(cv, aniso, true), normal: normalFromHeight(h, N, N, 2.4, aniso) };
}

/** Karpet bank: dasar nyaris putih bertekstur (diwarnai warna verteks: biru tua, biru tim) + bingkai motif tipis. Rentang 3 u. */
export function carpetTex(aniso: number): MapPair {
  const N = 256, img = new ImageData(N, N), h = new Float32Array(N * N);
  const fine = vnoise(128, 128, 8201), mid = fbm(12, 12, 2, 8203);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const f = fine(x / N, y / N), m = mid(x / N, y / N);
    const cx = Math.abs((x % 64) - 32), cy = Math.abs((y % 64) - 32);
    const motif = (cx + cy === 20 || cx + cy === 21 || (cx < 2 && cy < 2)) ? 0.86 : 1;   // belah ketupat halus tiap 0.75 u
    const k = (0.84 + f * 0.1 + (m - 0.5) * 0.08) * motif;
    put(img, (y * N + x) * 4, 255 * k, 255 * k, 255 * k);
    h[y * N + x] = f * 0.4 + (motif < 1 ? -0.3 : 0);
  }
  const [c, g] = canvas(N, N); g.putImageData(img, 0, 0);
  return { map: toTex(c, aniso, true), normal: normalFromHeight(h, N, N, 1.0, aniso) };
}

/** Peti lapis baja berlapis bantalan (seperti di gambar referensi): 2 × 2 sel quilting dengan jahitan, bantalan menggembung di
 *  tengah sel. Dasar terang (diwarnai warna verteks hijau-abu). Rentang 1.25 u. */
export function paddedTex(aniso: number): MapPair {
  const N = 256, C = 128, img = new ImageData(N, N), h = new Float32Array(N * N), n = vnoise(32, 32, 8301);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const lx = (x % C) / C - 0.5, ly = (y % C) / C - 0.5, r = Math.max(Math.abs(lx), Math.abs(ly)) * 2;
    const bulge = Math.cos(Math.min(1, r) * Math.PI / 2), seam = r > 0.94 ? 0.62 : 1;
    const k = (0.72 + bulge * 0.26 + (n(x / N, y / N) - 0.5) * 0.06) * seam;
    put(img, (y * N + x) * 4, 236 * k, 240 * k, 238 * k);
    h[y * N + x] = bulge - (r > 0.94 ? 0.6 : 0);
  }
  const [c, g] = canvas(N, N); g.putImageData(img, 0, 0);
  return { map: toTex(c, aniso, true), normal: normalFromHeight(h, N, N, 2.6, aniso) };
}

/** Decal zona bom: lingkaran cat semprot merah + huruf (A/B), tepi berbintik semprotan; latar transparan. */
export function siteDecalTex(letter: 'A' | 'B'): THREE.Texture {
  const S = 256, [c, g] = canvas(S, S), rng = makeRng(letter === 'A' ? 8401 : 8403);
  g.clearRect(0, 0, S, S);
  g.strokeStyle = 'rgba(196, 32, 24, 0.92)'; g.lineWidth = 15;
  g.beginPath(); g.arc(S / 2, S / 2, S * 0.38, 0, Math.PI * 2); g.stroke();
  g.fillStyle = 'rgba(196, 32, 24, 0.95)';
  g.font = canvasFont(150, 900); g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(letter, S / 2, S / 2 + 8);
  for (let i = 0; i < 900; i++) {                         // bintik semprotan di sekitar cat
    const a = rng() * Math.PI * 2, r = S * (0.2 + rng() * 0.3);
    g.fillStyle = `rgba(196, 32, 24, ${0.15 + rng() * 0.45})`;
    g.fillRect(S / 2 + Math.cos(a) * r, S / 2 + Math.sin(a) * r, 1 + rng() * 2, 1 + rng() * 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

/** Papan nama atrium: panel biru tua berbingkai emas, tulisan "MERIDIAN VAULT" + "BANK SENTRAL · EST. 1898". */
export function signTex(): THREE.Texture {
  const W = 1024, H = 256, [c, g] = canvas(W, H);
  g.fillStyle = '#1d2a44'; g.fillRect(0, 0, W, H);
  g.strokeStyle = '#d8b25a'; g.lineWidth = 10; g.strokeRect(14, 14, W - 28, H - 28);
  g.lineWidth = 3; g.strokeRect(30, 30, W - 60, H - 60);
  g.fillStyle = '#e9c873'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = canvasFont(112, 800); g.fillText('MERIDIAN VAULT', W / 2, H / 2 - 18);
  g.font = canvasFont(34, 700); g.fillText('BANK SENTRAL  ·  EST. 1898', W / 2, H / 2 + 62);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

export type MvMat = 'floor' | 'carpet' | 'plaster' | 'marble' | 'gold' | 'steel' | 'deposit' | 'padded' | 'wood' | 'glass' | 'glow'
  | 'decalA' | 'decalB' | 'sign';

export interface MvMaterials { mat: Record<MvMat, THREE.Material>; textures: THREE.Texture[] }

/** Bucket yang tidak di-bake (transparan / emisif / decal) & yang tidak melempar bayangan. */
export const MV_NO_BAKE = new Set<MvMat>(['glass', 'glow', 'decalA', 'decalB', 'sign']);
export const MV_NO_CAST = new Set<MvMat>(['glass', 'glow', 'decalA', 'decalB', 'sign', 'floor', 'carpet']);

export function makeMeridianMaterials(gfx: GfxProfile, aniso: number): MvMaterials {
  const pbr = gfx.pbr, nm = gfx.normalMaps;
  const textures: THREE.Texture[] = [];
  const keep = <T extends THREE.Texture | MapPair>(v: T): T => {
    if (v instanceof THREE.Texture) textures.push(v); else textures.push(v.map, v.normal);
    return v;
  };
  const rep = (t: THREE.Texture, span: number, spanV = span) => { const c = t.clone(); c.repeat.set(1 / span, 1 / spanV); textures.push(c); return c; };
  const floor = keep(cachedTex('mv_checker', aniso, () => checkerTex(aniso)));
  const carpet = keep(cachedTex('mv_carpet', aniso, () => carpetTex(aniso)));
  const padded = keep(cachedTex('mv_padded', aniso, () => paddedTex(aniso)));
  const plaster = keep(cachedTex('bos_plaster', aniso, () => plasterTex(aniso)));
  const marble = keep(cachedTex('bos_marble', aniso, () => marbleTex(aniso)));
  const locker = keep(cachedTex('bos_locker', aniso, () => lockerTex(aniso)));
  const wood = keep(cachedTex('bos_wood', aniso, () => woodTex(aniso)));
  const decalA = keep(siteDecalTex('A')), decalB = keep(siteDecalTex('B')), sign = keep(signTex());

  type Opt = { map?: THREE.Texture | null; normal?: THREE.Texture | null; rough: number; metal?: number; nscale?: number;
    transparent?: boolean; opacity?: number; color?: number; env?: number; decal?: boolean };
  const M = (o: Opt): THREE.Material => {
    const common = { color: o.color ?? 0xffffff, map: o.map ?? null, vertexColors: !o.decal, transparent: o.transparent ?? false,
      opacity: o.opacity ?? 1, depthWrite: !o.transparent, polygonOffset: !!o.decal, polygonOffsetFactor: o.decal ? -2 : 0,
      polygonOffsetUnits: o.decal ? -2 : 0 };
    if (pbr) {
      const m = new THREE.MeshStandardMaterial({ ...common, roughness: o.rough, metalness: o.metal ?? 0, normalMap: nm ? o.normal ?? null : null });
      if (o.nscale !== undefined) m.normalScale.set(o.nscale, o.nscale);
      if (o.env !== undefined) m.envMapIntensity = o.env;
      return m;
    }
    return new THREE.MeshLambertMaterial(common);
  };

  const mat: Record<MvMat, THREE.Material> = {
    floor: M({ map: rep(floor.map, 4), normal: rep(floor.normal, 4), rough: 0.14, nscale: 0.7, env: 1.1 }),
    carpet: M({ map: rep(carpet.map, 3), normal: rep(carpet.normal, 3), rough: 0.96, nscale: 0.6, env: 0.4 }),
    plaster: M({ map: rep(plaster.map, 4), normal: rep(plaster.normal, 4), rough: 0.82, nscale: 0.45 }),
    marble: M({ map: rep(marble, 2), rough: 0.18, env: 1.0 }),
    gold: M({ rough: 0.36, metal: 0.55, color: 0xffffff, env: 1.2 }),
    steel: M({ rough: 0.38, metal: 0.75, env: 1.1 }),
    deposit: M({ map: rep(locker.map, 1.2, 1.2), normal: rep(locker.normal, 1.2, 1.2), rough: 0.42, metal: 0.55, nscale: 0.8 }),
    padded: M({ map: rep(padded.map, 1.25), normal: rep(padded.normal, 1.25), rough: 0.7, nscale: 0.9 }),
    wood: M({ map: rep(wood.map, 4), normal: rep(wood.normal, 4), rough: 0.6, nscale: 0.7 }),
    glass: M({ rough: 0.05, transparent: true, opacity: 0.18, env: 1.6 }),
    glow: new THREE.MeshBasicMaterial({ vertexColors: true }),
    decalA: M({ map: decalA, rough: 0.8, transparent: true, decal: true }),
    decalB: M({ map: decalB, rough: 0.8, transparent: true, decal: true }),
    sign: new THREE.MeshBasicMaterial({ map: sign }),
  };
  return { mat, textures };
}
