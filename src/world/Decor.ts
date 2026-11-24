// src/world/Decor.ts — dekorasi & identitas Brick Hall v2 (permintaan pengguna: "map terasa kurang"):
//   spanduk tim (Selatan biru / Utara merah) + lambang besar di dinding ujung, lampu gantung (lampu titik di rotunda),
//   menara jam di atas menara katalog, ikon unik di puncak rak tinggi (Bola Dunia, Teleskop, Ksatria, Jam Pasir),
//   lentera warna tim di puncak rak tengah, balok atap, galeri rak buku di dinding atas, lampu arsip & ruang spawn bawah.
// Semua balok ber-vertex-color dimasukkan ke MeshBuckets yang sama dengan map (tanpa draw call tambahan), kecuali
// muka jam (1 mesh bertekstur kanvas) dan 1 lampu titik (MEDIUM/HIGH). Elemen di atas Y 17.5 tidak terjangkau pemain.
import * as THREE from 'three';
import type { Preset } from '../config/gameConfig';
import type { MeshBuckets, SlotMats } from './BoxBuilder';
import { BOXES } from './MapData';

export interface DecorCtx {
  solid: MeshBuckets; glow: MeshBuckets;
  plainM: THREE.Material; sideM: THREE.Material; bookM: THREE.Material; topM: THREE.Material; emisMat: THREE.Material;
  /** Logam (kuningan/besi/baja/tembaga/emas) — PBR memantulkan lingkungan (sama dengan plainM pada LOW). */
  metalM: THREE.Material;
  preset: Preset;
  cuboid: (min: number[], max: number[]) => void;
}

const C = {
  blue: 0x23498c, red: 0x8c2323, gold: 0xd9a933, brass: 0xb08a3e, darkwood: 0x3e2414, iron: 0x5b5f66,
  ocean: 0x2f6fa6, land: 0x5a8f3c, glass: 0xbfe3ff, sand: 0xe0b85a, steel: 0x9aa0a8, plume: 0xb52a2a,
  warm: 0xffc97a, copper: 0x4f7f6c, white: 0xf2ead8, lanternBlue: 0x6aa8ff, lanternRed: 0xff7a5e,
};

export function buildDecor(d: DecorCtx): { objects: THREE.Object3D[] } {
  const objects: THREE.Object3D[] = [];
  const METAL = new Set<number>([C.brass, C.iron, C.steel, C.copper, C.gold]);
  const P = (c: number): SlotMats => { const m = METAL.has(c) ? d.metalM : d.plainM; return { top: [m, c], side: [m, c], bottom: [m, c] }; };
  const Wd = (c: number): SlotMats => ({ top: [d.sideM, c], side: [d.sideM, c], bottom: [d.sideM, c] });
  const Gl = (c: number): SlotMats => ({ top: [d.emisMat, c], side: [d.emisMat, c], bottom: [d.emisMat, c] });
  const Bk: SlotMats = { top: [d.topM, C.darkwood], side: [d.bookM, 0xe0d6c4], bottom: [d.sideM, C.darkwood] };
  const box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, s: SlotMats) =>
    d.solid.addBox([Math.min(x0, x1), y0, Math.min(z0, z1)], [Math.max(x0, x1), y1, Math.max(z0, z1)], s);
  const glow = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, c: number) =>
    d.glow.addBox([Math.min(x0, x1), y0, Math.min(z0, z1)], [Math.max(x0, x1), y1, Math.max(z0, z1)], Gl(c));
  /** Balok berpusat (cx, cz) selebar w × kedalaman dz. */
  const cbox = (cx: number, cz: number, w: number, dz: number, y0: number, y1: number, s: SlotMats) =>
    box(cx - w / 2, y0, cz - dz / 2, cx + w / 2, y1, cz + dz / 2, s);

  // ── spanduk tim tergantung dari plafon (menghadap sumbu panjang aula)
  const banner = (cx: number, cz: number, team: 'blue' | 'red', w: number, y0: number, y1: number, rod = true) => {
    const c = team === 'blue' ? C.blue : C.red;
    box(cx - w / 2, y0, cz - 0.06, cx + w / 2, y1, cz + 0.06, P(c));
    box(cx - w / 2 - 0.02, y0, cz - 0.08, cx - w / 2 + 0.16, y1, cz + 0.08, P(C.gold));
    box(cx + w / 2 - 0.16, y0, cz - 0.08, cx + w / 2 + 0.02, y1, cz + 0.08, P(C.gold));
    box(cx - w / 2 + w * 0.12, y0 - 0.45, cz - 0.06, cx + w / 2 - w * 0.12, y0, cz + 0.06, P(c));      // ujung bertingkat
    box(cx - w / 2 + w * 0.3, y0 - 0.9, cz - 0.06, cx + w / 2 - w * 0.3, y0 - 0.45, cz + 0.06, P(c));
    const ey = (y0 + y1) / 2 + (y1 - y0) * 0.08, s = w / 2.4;                                             // lambang: buku terbuka
    box(cx - 0.75 * s, ey - 0.45 * s, cz - 0.09, cx - 0.06 * s, ey + 0.45 * s, cz + 0.09, P(C.gold));
    box(cx + 0.06 * s, ey - 0.45 * s, cz - 0.09, cx + 0.75 * s, ey + 0.45 * s, cz + 0.09, P(C.gold));
    box(cx - 0.06 * s, ey - 0.55 * s, cz - 0.09, cx + 0.06 * s, ey + 0.38 * s, cz + 0.09, P(C.darkwood));
    if (rod) {
      box(cx - w / 2 - 0.3, y1, cz - 0.1, cx + w / 2 + 0.3, y1 + 0.2, cz + 0.1, Wd(C.darkwood));
      box(cx - 0.06, y1 + 0.2, cz - 0.06, cx + 0.06, 28, cz + 0.06, P(C.iron));
    }
  };
  for (const z of [-26, -10, 10, 26]) for (const x of [-18, 18]) banner(x, z, z < 0 ? 'blue' : 'red', 2.4, 19.5, 27);
  banner(0, -49.7, 'blue', 10, 18.2, 27.2, false);                       // lambang besar dinding ujung
  banner(0, 49.7, 'red', 10, 18.2, 27.2, false);
  banner(0, -49.8, 'blue', 3.2, 11.6, 16.2, false);                      // di dalam ruang spawn atas
  banner(0, 49.8, 'red', 3.2, 11.6, 16.2, false);
  banner(0, -49.8, 'blue', 3.2, 2.2, 6.8, false);                        // di dalam ruang spawn bawah
  banner(0, 49.8, 'red', 3.2, 2.2, 6.8, false);

  // ── galeri rak buku di dinding atas (mengisi dinding krem kosong), menghindari jendela tinggi Z ±13…17
  for (const sx of [-1, 1]) for (const [z0, z1] of [[-49, -17.5], [-12.5, 12.5], [17.5, 49]]) {
    box(sx * 30, 18.2, z0, sx * 29.3, 23.6, z1, Bk);
    box(sx * 30, 17.9, z0 - 0.2, sx * 28.9, 18.2, z1 + 0.2, Wd(C.darkwood));
    box(sx * 30, 23.6, z0 - 0.2, sx * 29.1, 23.9, z1 + 0.2, Wd(C.darkwood));
  }
  for (const sz of [-1, 1]) for (const [x0, x1] of [[-29, -6.4], [6.4, 29]]) {
    box(x0, 18.2, sz * 50, x1, 23.6, sz * 49.3, Bk);
    box(x0 - 0.2, 17.9, sz * 50, x1 + 0.2, 18.2, sz * 48.9, Wd(C.darkwood));
    box(x0 - 0.2, 23.6, sz * 50, x1 + 0.2, 23.9, sz * 49.1, Wd(C.darkwood));
  }

  // ── balok atap (di luar bukaan skylight Z 0 ±4 & ±21…29)
  for (const z of [-38, -13, 13, 38]) {
    box(-29.9, 24.4, z - 0.35, 29.9, 25.2, z + 0.35, Wd(C.darkwood));
    for (const x of [-21, -7, 7, 21]) box(x - 0.12, 25.2, z - 0.12, x + 0.12, 28, z + 0.12, P(C.iron));
  }

  // ── lampu gantung: rantai, bingkai persegi blocky, lilin menyala (rotunda besar + dua di atas tiap separuh aula)
  const chandelier = (cx: number, cy: number, cz: number, r: number) => {
    box(cx - 0.08, cy + 0.5, cz - 0.08, cx + 0.08, 28, cz + 0.08, P(C.iron));
    cbox(cx, cz, 0.7, 0.7, cy, cy + 0.6, P(C.brass));                                                     // hub
    for (const [ax, az] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {                                         // lengan
      box(cx + (ax ? ax * 0.35 : -0.07), cy + 0.2, cz + (az ? az * 0.35 : -0.07), cx + (ax ? ax * r : 0.07), cy + 0.32, cz + (az ? az * r : 0.07), P(C.brass));
    }
    box(cx - r, cy, cz - r, cx + r, cy + 0.16, cz - r + 0.2, P(C.brass)); box(cx - r, cy, cz + r - 0.2, cx + r, cy + 0.16, cz + r, P(C.brass));
    box(cx - r, cy, cz - r, cx - r + 0.2, cy + 0.16, cz + r, P(C.brass)); box(cx + r - 0.2, cy, cz - r, cx + r, cy + 0.16, cz + r, P(C.brass));
    for (const [px, pz] of [[-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0]]) {
      const x = cx + px * (r - 0.1), z = cz + pz * (r - 0.1);
      cbox(x, z, 0.2, 0.2, cy + 0.16, cy + 0.62, P(C.white));
      glow(x - 0.13, cy + 0.62, z - 0.13, x + 0.13, cy + 0.88, z + 0.13, C.warm);
    }
  };
  chandelier(0, 21.5, 0, 3.0);
  chandelier(0, 22.5, -21, 2.0); chandelier(0, 22.5, 21, 2.0);
  if (d.preset.shadowMap > 0) {
    const light = new THREE.PointLight(0xffc98a, 260, 46, 2);
    light.position.set(0, 20.8, 0);
    objects.push(light);
  }

  // ── menara jam di atas menara katalog rotunda (landmark tengah)
  cbox(0, 0, 4.4, 4.4, 15.6, 19.2, Wd(C.darkwood));
  cbox(0, 0, 4.8, 4.8, 19.2, 19.5, P(C.brass));
  cbox(0, 0, 4.0, 4.0, 19.5, 20.1, P(C.copper)); cbox(0, 0, 2.8, 2.8, 20.1, 20.7, P(C.copper));
  cbox(0, 0, 1.6, 1.6, 20.7, 21.3, P(C.copper)); cbox(0, 0, 0.5, 0.5, 21.3, 22.4, P(C.gold));
  d.cuboid([-2.2, 15.6, -2.2], [2.2, 19.5, 2.2]);
  objects.push(clockFaces(0, 17.4, 0, 2.21, 3.2));

  // ── pinggiran 2-lantai pada rak tinggi & lemari katalog (agar terbaca sebagai rak perpustakaan bertingkat)
  for (const b of BOXES) {
    if (b.style !== 'stack' || b.cat !== 'cover') continue;
    const [x0, y0, z0] = b.min, [x1, y1, z1] = b.max;
    box(x0 - 0.15, y1 - 0.25, z0 - 0.15, x1 + 0.15, y1 + 0.1, z1 + 0.15, Wd(C.darkwood));                  // mahkota
    if (y1 - y0 > 10) box(x0 - 0.12, 9.6, z0 - 0.12, x1 + 0.12, 10.0, z1 + 0.12, Wd(C.darkwood));       // batas lantai 2
  }

  // ── ikon puncak rak tinggi (Y 16) — orientasi & callout: SW Bola Dunia, SE Teleskop, NW Ksatria, NE Jam Pasir
  const top = 16;
  { // Bola Dunia
    const cx = -16.3, cz = -24;
    cbox(cx, cz, 1.4, 1.4, top, top + 0.4, Wd(C.darkwood)); cbox(cx, cz, 0.3, 0.3, top + 0.4, top + 1.5, P(C.brass));
    for (const [w, a, b] of [[1.2, 1.5, 1.9], [2.2, 1.9, 2.4], [2.8, 2.4, 3.4], [2.2, 3.4, 3.9], [1.2, 3.9, 4.3]] as const) cbox(cx, cz, w, w, top + a, top + b, P(C.ocean));
    box(cx - 1.47, top + 2.5, cz - 0.6, cx - 1.38, top + 3.2, cz + 0.5, P(C.land)); box(cx + 1.38, top + 2.6, cz - 0.3, cx + 1.47, top + 3.3, cz + 0.8, P(C.land));
    box(cx - 0.5, top + 2.5, cz - 1.47, cx + 0.7, top + 3.1, cz - 1.38, P(C.land)); box(cx - 0.8, top + 2.7, cz + 1.38, cx + 0.2, top + 3.3, cz + 1.47, P(C.land));
    cbox(cx - 0.3, cz + 0.2, 0.9, 0.7, top + 4.3, top + 4.4, P(C.land));
    box(cx - 1.62, top + 1.7, cz - 0.08, cx - 1.5, top + 4.2, cz + 0.08, P(C.brass)); box(cx + 1.5, top + 1.7, cz - 0.08, cx + 1.62, top + 4.2, cz + 0.08, P(C.brass));
    box(cx - 1.62, top + 4.5, cz - 0.08, cx + 1.62, top + 4.62, cz + 0.08, P(C.brass));
  }
  { // Teleskop (menunjuk ke atas aula)
    const cx = 16.3, cz = -24;
    for (const [lx, lz] of [[-0.55, -0.4], [0.55, -0.4], [0, 0.6]]) cbox(cx + lx, cz + lz, 0.14, 0.14, top, top + 2.2, Wd(C.darkwood));
    cbox(cx, cz, 0.8, 0.8, top + 2.2, top + 2.6, P(C.brass));
    for (let i = 0; i < 5; i++) cbox(cx - 0.5 - i * 0.55, cz, 0.75 - i * 0.04, 0.75 - i * 0.04, top + 2.5 + i * 0.5, top + 3.15 + i * 0.5, P(C.brass));
    cbox(cx + 0.15, cz, 0.35, 0.35, top + 2.4, top + 2.9, P(C.iron));
  }
  { // Ksatria (zirah, pedang terangkat; bulu helm merah)
    const cx = -16.3, cz = 24;
    cbox(cx, cz, 1.8, 1.8, top, top + 0.5, Wd(C.darkwood));
    for (const sx of [-1, 1]) cbox(cx + sx * 0.33, cz, 0.45, 0.5, top + 0.5, top + 2.2, P(C.steel));
    cbox(cx, cz, 1.4, 0.8, top + 2.2, top + 3.6, P(C.steel));
    for (const sx of [-1, 1]) { cbox(cx + sx * 0.88, cz, 0.36, 0.9, top + 3.0, top + 3.6, P(C.steel)); cbox(cx + sx * 0.88, cz, 0.26, 0.4, top + 1.8, top + 3.0, P(C.steel)); }
    cbox(cx, cz, 0.8, 0.8, top + 3.6, top + 4.4, P(C.steel)); cbox(cx + 0.41, cz, 0.04, 0.6, top + 3.95, top + 4.05, P(C.iron));
    cbox(cx, cz, 0.16, 0.7, top + 4.4, top + 5.1, P(C.plume));
    cbox(cx + 1.1, cz, 0.1, 0.12, top + 2.6, top + 5.6, P(C.steel)); cbox(cx + 1.1, cz, 0.12, 0.6, top + 2.9, top + 3.05, P(C.brass));
  }
  { // Jam Pasir
    const cx = 16.3, cz = 24;
    cbox(cx, cz, 2.0, 2.0, top, top + 0.4, Wd(C.darkwood)); cbox(cx, cz, 2.0, 2.0, top + 4.6, top + 5.0, Wd(C.darkwood));
    for (const [px, pz] of [[-0.85, -0.85], [0.85, -0.85], [-0.85, 0.85], [0.85, 0.85]]) cbox(cx + px, cz + pz, 0.16, 0.16, top + 0.4, top + 4.6, P(C.brass));
    for (const [w, a, b, c] of [[1.4, 0.4, 1.2, C.sand], [1.0, 1.2, 1.9, C.glass], [0.4, 1.9, 2.5, C.glass], [0.4, 2.5, 3.1, C.sand], [1.0, 3.1, 3.8, C.glass], [1.4, 3.8, 4.6, C.glass]] as const)
      cbox(cx, cz, w, w, top + a, top + b, P(c));
  }
  // lentera warna tim di puncak rak tengah (Selatan biru, Utara merah)
  for (const sz of [-1, 1]) for (const z of [16, 22, 28]) {
    const cz = sz * z;
    cbox(0, cz, 0.8, 0.8, top, top + 0.2, P(C.iron));
    d.glow.addBox([-0.3, top + 0.2, cz - 0.3], [0.3, top + 1.0, cz + 0.3], Gl(sz < 0 ? C.lanternBlue : C.lanternRed));
    cbox(0, cz, 0.8, 0.8, top + 1.0, top + 1.2, P(C.iron));
  }

  // ── lampu langit-langit arsip (lantai 1) — menghindari lemari zig-zag
  for (const sx of [-1, 1]) for (const z of [-31, -24, -16.5, -11, -3.5, 3.5, 11, 16.5, 24, 31]) {
    const x = sx * 26.3;
    cbox(x, z, 0.08, 0.08, 9.0, 9.4, P(C.iron));
    cbox(x, z, 0.9, 0.9, 8.75, 9.0, P(C.brass));
    d.glow.addBox([x - 0.32, 8.6, z - 0.32], [x + 0.32, 8.75, z + 0.32], Gl(C.warm));
  }
  // ── ruang spawn bawah & lorongnya: lampu + strip warna tim
  for (const sz of [-1, 1]) {
    const team = sz < 0 ? C.lanternBlue : C.lanternRed;
    for (const x of [-5, 0, 5]) { cbox(x, sz * 46.5, 1.0, 1.0, 9.1, 9.4, P(C.brass)); d.glow.addBox([x - 0.35, 8.95, sz * 46.5 - 0.35], [x + 0.35, 9.1, sz * 46.5 + 0.35], Gl(C.warm)); }
    d.glow.addBox([-8.5, 7.4, Math.min(sz * 49.95, sz * 49.75)], [8.5, 7.6, Math.max(sz * 49.95, sz * 49.75)], Gl(team));
    for (const x of [-20, -13]) for (const sx of [-1, 1]) {
      const px = sx * x, pz = sz * 45.5;
      cbox(px, pz, 0.7, 0.7, 9.15, 9.4, P(C.brass)); d.glow.addBox([px - 0.25, 9.0, pz - 0.25], [px + 0.25, 9.15, pz + 0.25], Gl(C.warm));
    }
  }
  // ── plint kayu di kaki dinding (detail kecil yang membuat ruang terasa jadi): dinding luar lantai 2 (|X| 30) & dinding
  //    arsip sisi aula (|X| 22, celah pintu Z ±12…15 dan ±1.5 dibiarkan terbuka). Tonjolan 0.12, tanpa collider.
  for (const sx of [-1, 1]) {
    box(sx * 30, 10, -49.9, sx * 29.88, 10.45, 49.9, Wd(C.darkwood));
    box(sx * 29.9, 10.45, -49.9, sx * 29.84, 10.52, 49.9, Wd(0x5a3a22));
    for (const [z0, z1] of [[-35, -15], [-12, -1.5], [1.5, 12], [15, 35]])
      box(sx * 22, 0, z0, sx * 21.88, 0.45, z1, Wd(C.darkwood));
  }
  // ── dinding depan markas lantai 2 (|Z| 35…35.4): bingkai kayu jendela intip & pintu, plint, tutup atas, lambang tim.
  //    Tonjolan tipis tanpa collider di MUKA dinding (bukaan tidak menyempit).
  for (const sz of [-1, 1]) {
    for (const [fz, dir] of [[35, -1], [35.4, 1]] as const) {          // muka aula (menonjol ke tengah) & muka lobi (ke spawn)
      const F = (x0: number, y0: number, x1: number, y1: number, depth: number, s: SlotMats) =>
        box(x0, y0, sz * fz, x1, y1, sz * (fz + dir * depth), s);
      const W = Wd(C.darkwood);
      F(-3.3, 10.95, 3.3, 11.2, 0.12, W); F(-3.3, 15.6, 3.3, 15.85, 0.12, W);           // bingkai jendela X −3…3, Y 11.2…15.6
      F(-3.3, 11.2, -3.0, 15.6, 0.12, W); F(3.0, 11.2, 3.3, 15.6, 0.12, W);
      F(-3.3, 10, 3.3, 10.35, 0.1, W);                                                    // plint bawah jendela
      for (const sx of [-1, 1]) {
        F(sx * 5.7, 10, sx * 6, 17.5, 0.12, W); F(sx * 10, 10, sx * 10.3, 17.5, 0.12, W);   // tiang pintu X ±6…10
        F(sx * 16.7, 10, sx * 17, 17.5, 0.12, W);                                         // ujung dinding
        F(sx * 3.3, 10, sx * 5.7, 10.35, 0.1, W); F(sx * 10.3, 10, sx * 16.7, 10.35, 0.1, W);
      }
      F(-1.15, 15.95, 1.15, 17.35, 0.14, W);                                              // lambang: buku terbuka emas
      F(-0.85, 16.2, -0.07, 17.1, 0.2, P(C.gold)); F(0.07, 16.2, 0.85, 17.1, 0.2, P(C.gold));
      F(-0.07, 16.1, 0.07, 17.15, 0.22, P(C.darkwood));
    }
    box(-17.15, 17.5, sz * 34.85, 17.15, 17.72, sz * 35.55, Wd(C.darkwood));              // tutup atas
  }
  return { objects };
}

/** Empat muka jam (kanvas prosedural: piringan krem, penanda jam, jarum 10:10) di sisi menara. */
function clockFaces(cx: number, cy: number, cz: number, half: number, size: number): THREE.Mesh {
  const N = 128, c = document.createElement('canvas'); c.width = c.height = N;
  const g = c.getContext('2d')!;
  g.fillStyle = '#3e2414'; g.fillRect(0, 0, N, N);
  g.fillStyle = '#d9a933'; g.beginPath(); g.arc(N / 2, N / 2, N * 0.47, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#f3ead2'; g.beginPath(); g.arc(N / 2, N / 2, N * 0.42, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#2a1a10'; g.lineCap = 'round';
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2, r0 = N * (i % 3 === 0 ? 0.3 : 0.34), r1 = N * 0.39;
    g.lineWidth = i % 3 === 0 ? 5 : 2.5;
    g.beginPath(); g.moveTo(N / 2 + Math.sin(a) * r0, N / 2 - Math.cos(a) * r0); g.lineTo(N / 2 + Math.sin(a) * r1, N / 2 - Math.cos(a) * r1); g.stroke();
  }
  const hand = (a: number, len: number, w: number) => { g.lineWidth = w; g.beginPath(); g.moveTo(N / 2, N / 2); g.lineTo(N / 2 + Math.sin(a) * len, N / 2 - Math.cos(a) * len); g.stroke(); };
  hand((10 / 12) * Math.PI * 2 + (10 / 60) * (Math.PI / 6), N * 0.22, 5); hand((10 / 60) * Math.PI * 2, N * 0.33, 3.5);
  g.fillStyle = '#2a1a10'; g.beginPath(); g.arc(N / 2, N / 2, 4, 0, Math.PI * 2); g.fill();
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const geos: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 4; i++) {
    const p = new THREE.PlaneGeometry(size, size);
    p.translate(0, 0, half); p.rotateY((i * Math.PI) / 2); p.translate(cx, cy, cz);
    geos.push(p);
  }
  const merged = new THREE.BufferGeometry();
  const pos: number[] = [], uv: number[] = [], nrm: number[] = [], idx: number[] = [];
  for (const g2 of geos) {
    const base = pos.length / 3;
    pos.push(...(g2.getAttribute('position').array as Float32Array));
    uv.push(...(g2.getAttribute('uv').array as Float32Array));
    nrm.push(...(g2.getAttribute('normal').array as Float32Array));
    for (const i of g2.getIndex()!.array as Uint16Array) idx.push(base + i);
    g2.dispose();
  }
  merged.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  merged.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  merged.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  merged.setIndex(idx);
  const m = new THREE.Mesh(merged, new THREE.MeshBasicMaterial({ map: tex }));
  m.matrixAutoUpdate = false; m.updateMatrix();
  return m;
}
