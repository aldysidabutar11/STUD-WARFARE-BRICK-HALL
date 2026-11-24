// src/world/maps/steelyard/visual/backdrop.ts — latar di LUAR pagar (tanpa collider, tanpa bayangan; detail 'lite'):
//   baris kontainer bertumpuk 1–4 di belakang pagar Utara/Selatan (puncaknya terlihat di atas terpal), gantry crane kuning
//   pudar mengangkangi baris kontainer di Barat (landmark tinggi), gudang seng beratap pelana di Timur (pintu gulung, jendela),
//   tiang lampu sorot di keempat sudut. Semua di bucket 'steel' (+ 'glass' untuk lampu) → tanpa draw call tambahan.
import * as THREE from 'three';
import { makeRng } from '../../../../core/Rng';
import type { SYContainer } from '../layout';
import { CDIM, FADED, corrugate, emitContainer } from './containers';
import { Geo, TRY, shadeHex } from './geo';
import type { Foot } from './ground';
import { STEEL_TEX } from './textures';

const H = CDIM.h;

/** Bangun latar; kembalikan tapak (AO/pasir di tekstur tanah). Batas = area main (pagar di tepinya). */
/** Benih tata letak latar (build.ts & test memakai nilai yang sama → collider latar = yang tergambar). */
export const BACKDROP_SEED = 7771;

export function emitBackdrop(geo: Geo, bounds: { x: [number, number]; z: [number, number] }, seed: number): Foot[] {
  const rng = makeRng(seed), feet: Foot[] = [];
  const fx = Math.max(Math.abs(bounds.x[0]), Math.abs(bounds.x[1])) + 0.3, fz = Math.max(Math.abs(bounds.z[0]), Math.abs(bounds.z[1])) + 0.3;
  // gelap ke arah tanah (pengganti AO; di luar grid bake) — dirangkai dengan kait warna yang sudah aktif (debu atas)
  const prev = geo.tint;
  geo.tint = (p, n, c) => { prev?.(p, n, c); c.multiplyScalar(0.72 + 0.28 * Math.min(1, p.y / 5)); };

  // ── baris kontainer di belakang pagar Utara & Selatan (sumbu panjang = X)
  for (const sz of [1, -1]) for (const [dz, minS, maxS] of [[8.2, 1, 3], [16.4, 2, 4]] as const) {
    let x = -fx + 2 + rng() * 4;
    const z = sz * (fz + dz);
    while (x < fx - 6) {
      const size: 20 | 40 = rng() < 0.45 ? 40 : 20, L = CDIM.len[size];
      if (x + L > fx + 10) break;
      if (rng() < 0.18) { x += 4 + rng() * 8; continue; }                     // celah
      const n = minS + Math.floor(rng() * (maxS - minS + 1));
      const cx = x + L / 2;
      for (let lv = 0; lv < n; lv++) {
        const k: SYContainer = { id: `BD_${sz}_${dz}_${x.toFixed(1)}_${lv}`, cx, cz: z + (rng() - 0.5) * 0.3, rotY: sz > 0 ? 0 : Math.PI,
          size, color: FADED[Math.floor(rng() * FADED.length)], open: 'none', doorsOpen: false, stack: 1 };
        geo.push(TRY(0, lv * H, 0));
        emitContainer(geo, k, { detail: 'lite' });
        geo.pop();
      }
      feet.push({ cx, cz: z, hx: L / 2, hz: CDIM.w / 2, rot: 0, h: n * H, col: true });
      x += L + 0.6 + rng() * 1.5;
    }
  }

  // ── Barat: baris kontainer (sumbu Z) + gantry crane mengangkanginya
  const wx = -(fx + 17);
  for (let z = -40; z < 40;) {
    const size: 20 | 40 = rng() < 0.5 ? 40 : 20, L = CDIM.len[size];
    if (z + L > 44) break;
    const n = 1 + Math.floor(rng() * 3), cz = z + L / 2;
    for (let lv = 0; lv < n; lv++) {
      geo.push(TRY(0, lv * H, 0));
      emitContainer(geo, { id: `BDW_${z.toFixed(1)}_${lv}`, cx: wx, cz, rotY: Math.PI / 2, size, color: FADED[Math.floor(rng() * FADED.length)],
        open: 'none', doorsOpen: false, stack: 1 }, { detail: 'lite' });
      geo.pop();
    }
    feet.push({ cx: wx, cz, hx: L / 2, hz: CDIM.w / 2, rot: Math.PI / 2, h: n * H, col: true });
    z += L + 1 + rng() * 2;
  }
  crane(geo, wx, -6, rng);
  feet.push({ cx: wx - 12, cz: -6, hx: 1, hz: 9, rot: 0, h: 24 }, { cx: wx + 12, cz: -6, hx: 1, hz: 9, rot: 0, h: 24 });

  // ── Timur: gudang seng beratap pelana
  const ex = fx + 22;
  warehouse(geo, ex, 10, 13, 26, rng);
  feet.push({ cx: ex, cz: 10, hx: 13, hz: 26, rot: 0, h: 12, col: true });   // collider sampai lis atap (pelana di atasnya tidak)

  // ── tiang lampu sorot di sudut luar
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) mast(geo, sx * (fx + 5), sz * (fz + 4.5), rng);
  geo.tint = prev;
  return feet;
}

/** Gantry crane (RTG) kuning pudar: 4 kaki, balok bawah beroda, 2 girder atas, troli + rumah mesin, kabin, spreader. */
function crane(geo: Geo, cx: number, cz: number, rng: () => number) {
  const Y = 0xc49a38, Yd = shadeHex(Y, 0.8), dark = 0x2a2826, hx = 12, hz = 9, top = 24;
  const uv = (p: [number, number, number]): [number, number] => [(p[0] + p[2]) / STEEL_TEX.uSpan, (p[1] % 7.2) / STEEL_TEX.vSpan];
  geo.push(TRY(cx, 0, cz, 0));
  geo.color(Y);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) geo.box('steel', sx * hx - 0.7, 1.2, sz * hz - 0.7, sx * hx + 0.7, top, sz * hz + 0.7, { uv, skip: { ny: true } });
  // balok bawah (sepanjang Z) + roda
  for (const sx of [-1, 1]) {
    geo.color(Yd);
    geo.box('steel', sx * hx - 0.9, 0.9, -hz - 1.6, sx * hx + 0.9, 2.2, hz + 1.6, { uv });
    geo.color(dark);
    for (const sz of [-1, 1]) for (const o of [-0.9, 0.9]) {
      const m = new THREE.Matrix4().makeRotationZ(Math.PI / 2); m.setPosition(sx * hx + 0.5, 0.9, sz * (hz + 0.6) + o);
      geo.push(m); geo.prismY('rubber', 0, 0, 0.9, 0, 1.0, 10, { smooth: true, uvScale: 1, vScale: 1.1, bottom: true }); geo.pop();
    }
  }
  // girder atas (sepanjang X) + palang ujung (sepanjang Z)
  geo.color(Y);
  for (const sz of [-1, 1]) geo.box('steel', -hx - 1.5, top - 0.2, sz * hz - 0.9, hx + 1.5, top + 2.6, sz * hz + 0.9, { uv });
  for (const sx of [-1, 1]) geo.box('steel', sx * hx - 0.8, top, -hz, sx * hx + 0.8, top + 1.6, hz, { uv });
  // bresing diagonal di rangka kaki (bidang X = ±hx)
  geo.color(Yd);
  for (const sx of [-1, 1]) {
    const len = Math.hypot(2 * hz, top - 4), ang = Math.atan2(top - 4, 2 * hz);
    const m = new THREE.Matrix4().makeRotationX(-ang); m.setPosition(sx * hx, (top + 4) / 2, 0);
    geo.push(m); geo.box('steel', -0.25, -0.25, -len / 2, 0.25, 0.25, len / 2, { uv }); geo.pop();
  }
  // troli + rumah mesin di atas girder, kabin operator menggantung
  const tx = -3 + rng() * 6;
  geo.color(shadeHex(Y, 0.95));
  geo.box('steel', tx - 3, top + 2.6, -hz - 0.6, tx + 3, top + 4.4, hz + 0.6, { uv });
  geo.color(0xd8d2c4);
  geo.box('steel', tx - 2.2, top + 4.4, -3, tx + 2.2, top + 6.6, 3, { uv });
  geo.color(Y);
  geo.box('steel', tx + 1.5, top - 3.2, hz + 0.9, tx + 3.8, top - 0.2, hz + 3.0, { uv });
  geo.color(0x1b2226);
  geo.quad('glass', [tx + 1.45, top - 2.8, hz + 1.1], [tx + 1.45, top - 2.8, hz + 2.8], [tx + 1.45, top - 0.8, hz + 2.8], [tx + 1.45, top - 0.8, hz + 1.1]);
  // kabel + spreader di atas baris kontainer
  geo.color(dark);
  for (const o of [-1.2, 1.2]) geo.box('steel', tx + o - 0.05, 17.6, -0.05, tx + o + 0.05, top + 2.6, 0.05, { uv: () => [0.5, 0.5] });
  geo.color(Yd);
  geo.box('steel', tx - 1.8, 16.8, -7.5, tx + 1.8, 17.6, 7.5, { uv });
  geo.pop();
}

/** Gudang seng: dinding bergelombang, atap pelana menjorok, pintu gulung, jendela tinggi, talang. */
function warehouse(geo: Geo, cx: number, cz: number, hx: number, hz: number, rng: () => number) {
  const wallC = shadeHex(0x8e9aa0, 0.9 + rng() * 0.1), roofC = 0x7d6a58, Hw = 12, Hr = 17;
  const uv = (p: [number, number, number]): [number, number] => [p[0] / STEEL_TEX.uSpan, (p[1] % 7.2) / STEEL_TEX.vSpan];
  geo.push(TRY(cx, 0, cz, 0));
  // dinding panjang (±X) — bingkai: x lokal = Z gudang
  for (const sx of [1, -1]) {
    geo.push(new THREE.Matrix4().makeRotationY(sx > 0 ? Math.PI / 2 : -Math.PI / 2));
    geo.color(wallC);
    corrugate(geo, -hz, hz, 0, Hw, hx, hx - 0.18, 1.6, uv, false);
    if (sx < 0) {   // menghadap area main: pintu gulung + jendela
      geo.color(0x5d5852);
      for (const dz of [-12, 6]) {
        geo.quad('steel', [dz - 4, 0.02, hx + 0.03], [dz + 4, 0.02, hx + 0.03], [dz + 4, 8.5, hx + 0.03], [dz - 4, 8.5, hx + 0.03], [0.5, 0.5, 0.6, 0.5, 0.6, 0.6, 0.5, 0.6]);
        geo.color(0x3c3936);
        for (let y = 0.6; y < 8.4; y += 0.7) geo.box('steel', dz - 4, y, hx + 0.03, dz + 4, y + 0.08, hx + 0.08, { uv: () => [0.5, 0.5], skip: { nz: true } });
        geo.color(0x5d5852);
      }
    }
    geo.color(0x1d2226);
    for (let z = -hz + 3; z < hz - 2; z += 5) geo.quad('glass', [z, Hw - 2.6, hx + 0.04], [z + 2.6, Hw - 2.6, hx + 0.04], [z + 2.6, Hw - 1.2, hx + 0.04], [z, Hw - 1.2, hx + 0.04]);
    geo.pop();
  }
  // dinding ujung (±Z) + pelana
  for (const sz of [1, -1]) {
    geo.push(new THREE.Matrix4().makeRotationY(sz > 0 ? 0 : Math.PI));
    geo.color(wallC);
    corrugate(geo, -hx, hx, 0, Hw, hz, hz - 0.18, 1.6, uv, false);
    geo.tri('steel', [-hx, Hw, hz - 0.1], [hx, Hw, hz - 0.1], [0, Hr, hz - 0.1], [0, 0.5, 0.8, 0.5, 0.4, 0.9]);
    geo.pop();
  }
  // atap pelana (dua bidang miring) menjorok 0.8 + bubungan + talang
  geo.color(roofC);
  const o = 0.8, ry = Hr + 0.15, ey = Hw - o * (Hr - Hw) / hx;
  geo.quad('steel', [0, ry, hz + o], [hx + o, ey, hz + o], [hx + o, ey, -hz - o], [0, ry, -hz - o], [0, 0.6, 0.5, 0.6, 0.5, 0.9, 0, 0.9]);
  geo.quad('steel', [-hx - o, ey, hz + o], [0, ry, hz + o], [0, ry, -hz - o], [-hx - o, ey, -hz - o], [0, 0.6, 0.5, 0.6, 0.5, 0.9, 0, 0.9]);
  geo.color(shadeHex(roofC, 0.75));
  geo.box('steel', -0.4, ry - 0.1, -hz - o, 0.4, ry + 0.25, hz + o, { uv });
  for (const sx of [1, -1]) geo.box('steel', sx * (hx + o) - 0.2, ey - 0.35, -hz - o, sx * (hx + o) + 0.2, ey, hz + o, { uv });
  geo.pop();
}

/** Tiang lampu sorot: tiang segi-8 + platform + 4 kepala lampu (kaca pucat). */
function mast(geo: Geo, x: number, z: number, rng: () => number) {
  const h = 26 + rng() * 3, uS = 1 / STEEL_TEX.uSpan, vS = 1 / STEEL_TEX.vSpan;
  geo.push(TRY(x, 0, z, rng() * Math.PI));
  geo.color(0x8a8e8c);
  geo.prismY('steel', 0, 0, 0.42, 0, h, 8, { rTop: 0.26, uvScale: uS, vScale: vS * 0.3 });
  geo.color(0x6c6f6d);
  geo.box('steel', -1.6, h, -0.9, 1.6, h + 0.25, 0.9, { uv: () => [0.5, 0.5] });
  for (const o of [-1.2, -0.4, 0.4, 1.2]) {
    geo.color(0x55585a);
    geo.box('steel', o - 0.32, h + 0.25, 0.1, o + 0.32, h + 0.95, 0.75, { uv: () => [0.5, 0.5] });
    geo.color(0xd8d6c8);
    geo.quad('glass', [o - 0.26, h + 0.32, 0.76], [o + 0.26, h + 0.32, 0.76], [o + 0.26, h + 0.88, 0.76], [o - 0.26, h + 0.88, 0.76]);
  }
  geo.pop();
}
