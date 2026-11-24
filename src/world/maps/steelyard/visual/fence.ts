// src/world/maps/steelyard/visual/fence.ts — pagar keliling Steel Yard: tiang kayu lapuk (sedikit miring, tinggi tak sama),
// tali atas melengkung (catenary), panel TERPAL kain kendur per bentang (kelim atas melengkung, menggelembung tertiup angin,
// lipatan kipas di mata ayam, sebagian robek berlubang + sobekan menggantung), warna abu-biru / krem / khaki berselang.
// Pagar tanpa terpal (tarp: false) = panel seng bergelombang (collider pagar memang pejal). Semua di dalam tebal collider ±0.3.
import * as THREE from 'three';
import { makeRng } from '../../../../core/Rng';
import type { SYFence } from '../layout';
import { Geo, hashStr, shadeHex } from './geo';
import { corrugate } from './containers';
import { STEEL_TEX } from './textures';

const TARP_TONES = [0x6a8196, 0x7b8fa0, 0x5c7690, 0xab9670, 0xa0916f, 0x868c84, 0x6f8592];

/**
 * Satu ruas pagar a→b. center = titik di dalam area main (normal panel diarahkan ke sana).
 * posts = set kunci posisi tiang yang sudah dibuat (sudut dibagi dua ruas → tidak dobel).
 */
export function emitFence(geo: Geo, f: SYFence, center: [number, number], posts: Set<string>) {
  const rng = makeRng(hashStr(f.id));
  const dx = f.b[0] - f.a[0], dz = f.b[1] - f.a[1], len = Math.hypot(dx, dz);
  if (len < 0.5) return;
  const ux = dx / len, uz = dz / len;
  // normal kiri (−uz, ux); arahkan ke dalam (menuju center)
  let nx = -uz, nz = ux;
  const mx = (f.a[0] + f.b[0]) / 2, mz = (f.a[1] + f.b[1]) / 2;
  if ((center[0] - mx) * nx + (center[1] - mz) * nz < 0) { nx = -nx; nz = -nz; }
  const spans = Math.max(1, Math.round(len / 5.2)), sp = len / spans;
  const H = f.h;
  const at = (t: number, off: number, y: number): [number, number, number] => [f.a[0] + ux * t + nx * off, y, f.a[1] + uz * t + nz * off];

  // ── tiang
  const postTop: number[] = [];
  for (let i = 0; i <= spans; i++) {
    const t = i * sp, [px, , pz] = at(t, 0, 0), key = `${Math.round(px * 4)},${Math.round(pz * 4)}`;
    const top = H + 0.25 + rng() * 0.35;
    postTop.push(top);
    if (posts.has(key)) continue;
    posts.add(key);
    const lean = (rng() - 0.5) * 0.035, twist = (rng() - 0.5) * 0.25;
    const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(lean, Math.atan2(-uz, ux) + twist, (rng() - 0.5) * 0.035, 'YXZ'));
    m.setPosition(px, 0, pz);
    geo.push(m);
    geo.color(shadeHex(0x7a6d5d, 0.78 + rng() * 0.3));
    geo.box('wood', -0.21, 0, -0.21, 0.21, top, 0.21, { grain: 1, uvOff: [rng() * 4, 0.5], skip: { ny: true } });
    // ikatan tali di atas tiang
    geo.color(0xb7a27a);
    geo.box('tarp', -0.24, H - 0.32, -0.24, 0.24, H - 0.12, 0.24, { uv: () => [0.5, 0.6] });
    geo.pop();
  }

  // ── per bentang: tali atas + panel
  let tone = TARP_TONES[Math.floor(rng() * TARP_TONES.length)], run = 0;
  for (let i = 0; i < spans; i++) {
    const t0 = i * sp, t1 = t0 + sp;
    // tali atas melengkung (4 segmen), sedikit di luar tiang
    geo.color(0xb7a27a);
    const ropeY = (s: number) => H - 0.2 - 0.42 * 4 * s * (1 - s);
    for (let k = 0; k < 4; k++) {
      const s0 = k / 4, s1 = (k + 1) / 4;
      const p0 = at(t0 + sp * s0, -0.24, ropeY(s0)), p1 = at(t0 + sp * s1, -0.24, ropeY(s1));
      ropeSeg(geo, p0, p1, 0.045);
    }
    if (!f.tarp) { sheetPanel(geo, f, ux, uz, nx, nz, t0, t1, H, rng); continue; }
    if (run-- <= 0) { tone = TARP_TONES[Math.floor(rng() * TARP_TONES.length)]; run = 2 + Math.floor(rng() * 4); }
    geo.color(shadeHex(tone, 0.9 + rng() * 0.16));
    tarpPanel(geo, at, t0, t1, H, rng, nx, nz, ux, uz);
  }
}

/** Segmen tali (balok tipis) dari p0 ke p1 — muka atas/samping saja. */
function ropeSeg(geo: Geo, p0: [number, number, number], p1: [number, number, number], r: number) {
  const d = new THREE.Vector3(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]), l = d.length();
  const m = new THREE.Matrix4().lookAt(new THREE.Vector3(0, 0, 0), d, new THREE.Vector3(0, 1, 0));
  m.setPosition(p0[0], p0[1], p0[2]);
  geo.push(m);
  geo.box('tarp', -r, -r, -l, r, r, 0, { uv: () => [0.5, 0.6], skip: { pz: true, nz: true } });
  geo.pop();
}

/** Panel terpal kendur antara t0..t1 (sepanjang ruas), sisi luar tiang (offset −0.12 dari garis pagar ke luar). */
function tarpPanel(geo: Geo, at: (t: number, off: number, y: number) => [number, number, number], t0: number, t1: number,
  H: number, rng: () => number, nx: number, nz: number, ux: number, uz: number) {
  const sp = t1 - t0;
  const bulge = (rng() - 0.6) * 0.2;                          // + = menggelembung ke luar, − = ke dalam (di antara tiang)
  const sagTop = 0.5 + rng() * 0.45, bottom = 0.03 + rng() * 0.16, waveB = rng() * 6;
  const torn = rng() < 0.11;
  const flapCorner0 = rng();
  const flapCorner = !torn && flapCorner0 < 0.09;
  const NU = 6, NV = 7;
  /** Titik panel: s melintang (a→b), t naik. Terpal di sisi LUAR tiang (out > 0 = menjauhi area main), dibatasi tebal collider. */
  const cellsRef = { set: null as Set<string> | null };
  const f = (s0: number, t0_: number): [number, number, number] => {
    let s = s0, t = t0_, curl = 0;
    // tepi sobekan bergerigi: verteks yang menyentuh sel hilang digeser acak & melengkung keluar
    const cs = cellsRef.set;
    if (cs) {
      const i = Math.round(s0 * NU), j = Math.round(t0_ * NV);
      if (cs.has(`${i},${j}`) || cs.has(`${i - 1},${j}`) || cs.has(`${i},${j - 1}`) || cs.has(`${i - 1},${j - 1}`)) {
        const h1 = Math.sin(i * 12.9898 + j * 78.233) * 43758.5453, h2 = Math.sin(i * 39.346 + j * 11.135) * 24634.6345;
        s += ((h1 - Math.floor(h1)) - 0.5) * 0.55 / NU; t += ((h2 - Math.floor(h2)) - 0.5) * 0.6 / NV; curl = 0.07;
      }
    }
    const top = H - 0.28 - sagTop * 4 * s * (1 - s);
    const bot = bottom + 0.12 * Math.sin(s * Math.PI * 2 + waveB) * s * (1 - s) * 4;
    let y = bot + (top - bot) * t;
    // gelembung angin + lipatan kipas dari mata ayam (dekat kelim atas) + lipatan diagonal kendur + kerut halus
    let out = 0.2 + bulge * Math.sin(Math.PI * s) * Math.sin(Math.PI * Math.min(1, t * 1.15));
    out += 0.045 * Math.sin(s * Math.PI * 4) * Math.pow(t, 3);
    out += 0.045 * Math.sin(s * Math.PI * 3 + t * 2.4 + waveB) * (0.25 + 0.75 * t) * Math.sin(Math.PI * s);
    out += 0.015 * Math.sin(s * 31 + t * 4);
    // sudut bawah sobek terlipat ke atas
    if (flapCorner && s > 0.72 && t < 0.3) { const k = (s - 0.72) / 0.28 * (0.3 - t) / 0.3; y += k * 1.4; out += k * 0.08; }
    out = Math.max(-0.05, Math.min(0.29, out + curl));
    return at(t0 + sp * s, -out, y);
  };
  void nx; void nz;
  // sobekan: sel kisi hilang berbentuk tak beraturan (diagonal / L / celah tegak) + sobekan kain menggantung di tepi atasnya
  const cells = new Set<string>();
  let flap: [number, number] | null = null;
  if (torn) {
    const ti = 1 + Math.floor(rng() * (NU - 3)), tj = 2 + Math.floor(rng() * (NV - 4)), shape = Math.floor(rng() * 3);
    const pat = shape === 0 ? [[0, 0], [0, 1], [1, 1], [1, 2]] : shape === 1 ? [[0, 0], [1, 0], [1, 1]] : [[0, 0], [0, 1], [0, 2]];
    for (const [a, b] of pat) cells.add(`${ti + a},${tj + b}`);
    const [la, lb] = pat[pat.length - 1];
    flap = [ti + la, tj + lb];
  }
  const skip = torn ? (i: number, j: number) => cells.has(`${i},${j}`) : undefined;
  if (torn) cellsRef.set = cells;
  // normal grid = ∂s × ∂t = (u × up) = (−uz, 0, ux); flip bila tidak menghadap ke dalam (nx, nz)
  const flip = -uz * nx + ux * nz < 0;
  geo.grid('tarp', NU, NV, f, (s, t) => [s, t * 0.97], skip, flip);
  if (flap) {   // potongan kain terkulai dari tepi atas sobekan, sedikit keluar
    const [fi, fj] = flap, s0 = fi / NU, s1 = (fi + 1) / NU, t1 = (fj + 1) / NV;
    const a = f(s0, t1), b = f(s1, t1), drop = (top: [number, number, number], k: number): [number, number, number] =>
      [top[0] - nx * 0.18 * k, top[1] - 1.05 * k, top[2] - nz * 0.18 * k];
    geo.quad('tarp', a, b, drop(b, 0.9), drop(a, 1), [s0, t1, s1, t1, s1, t1 - 0.12, s0, t1 - 0.12]);
  }
}

/** Pagar tanpa terpal: lembaran seng bergelombang vertikal (profil trapesium, dua sisi) + rel kayu dalam atas/bawah. */
function sheetPanel(geo: Geo, f: SYFence, ux: number, uz: number, nx: number, nz: number, t0: number, t1: number, H: number, rng: () => number) {
  // bingkai lokal: x sepanjang ruas (a → b), y naik, z = normal ke dalam area main
  const m = new THREE.Matrix4().makeBasis(new THREE.Vector3(ux, 0, uz), new THREE.Vector3(0, 1, 0), new THREE.Vector3(nx, 0, nz));
  m.setPosition(f.a[0], 0, f.a[1]);
  geo.push(m);
  const uv = (p: [number, number, number]): [number, number] => [p[0] / STEEL_TEX.uSpan + 0.31, (p[1] + 0.3) / STEEL_TEX.vSpan];
  geo.color(shadeHex(0xa3a9aa, 0.82 + rng() * 0.2));
  corrugate(geo, t0 + 0.18, t1 - 0.18, 0.08, H - 0.4, 0.13, 0.03, 0.85, uv, false);
  corrugate(geo, t0 + 0.18, t1 - 0.18, 0.08, H - 0.4, 0.11, 0.01, 0.85, uv, true);
  geo.box('proxy', t0 + 0.18, 0.1, -0.05, t1 - 0.18, H - 0.45, -0.02, { skip: { ny: true } });   // bayangan (mesh seng tidak melempar)
  geo.color(shadeHex(0x7a6d5d, 0.85 + rng() * 0.2));
  for (const y of [0.9, H - 1.3]) geo.box('wood', t0 + 0.2, y, 0.13, t1 - 0.2, y + 0.3, 0.26, { grain: 0, uvOff: [rng() * 4, 0.5] });
  geo.pop();
}
