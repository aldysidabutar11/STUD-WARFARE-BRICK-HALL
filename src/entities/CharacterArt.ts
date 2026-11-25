// src/entities/CharacterArt.ts — tampilan karakter prosedural per (tim, varian). Acuan: desain pengguna Karakter/*.png
//   Biru  = pasukan taktis (pria): helm + rel, goggles oranye, masker hitam, headset, baju biru, rompi pelat + kantong magasin,
//           radio, granat, pelindung bahu/siku/lutut, sarung tangan, celana & sepatu bot hitam, holster paha.
//           Wanita (desain pengguna ROBLOX-WANITA-BLUE-TIM.png): baret marun + lencana, rambut bob hitam, jaket loreng biru
//           ritsleting V berlis marun, harness, perut terbuka, celana pendek loreng, tato mawar, holster paha kiri, bot tinggi.
//   Merah = gerilyawan: topi patroli loreng, kacamata hitam, bandana merah, tank top (pria loreng gelap / wanita abu),
//           sabuk peluru selempang, tato ular di lengan kanan, balutan kain, sarung tangan tanpa jari, jins sobek,
//           sepatu bot cokelat, holster paha. Pria: brewok tipis; wanita: rambut merah-cokelat dikuncir, bibir.
//   Venny (karakter khusus) = model realistis ber-skin di entities/venny/ (balok tampilan disembunyikan); perkakas di charKit.ts.
// 100% prosedural (kanvas + balok, tanpa file gambar). Per (tim, varian): 1 atlas 1024² + 1 geometri gabungan per bagian
// tubuh (balok tubuh + aksesoris) → tetap 1 draw call per bagian. Hitbox tetap balok GDD terpisah (BlockyCharacter).
import * as THREE from 'three';
import { makeRng, type Rng } from '../core/Rng';
import type { PartKey, Team } from './BlockyCharacter';
import {
  Atlas, COL, RIG, S, blobPts, box, camo, commonSwatches, css, edge, fill, fillSmooth, fingers, grain, merge, rrect, shade,
  smoothBlob, stitch, tone, type Common, type FaceKey, type Faces, type G, type Painter,
} from './charKit';
import type { Variant } from './variants';

export type { Variant } from './variants';

export interface CharArt {
  texture: THREE.CanvasTexture;
  /** Geometri tampilan per bagian, di bingkai lokal hitbox (pusat balok). */
  parts: Record<PartKey, THREE.BufferGeometry>;
  /** Warna serpihan saat bagian ini terkena (§7.4). */
  chip: Record<PartKey, number>;
  /** Material bersama untuk balok tubuh yang berhamburan saat mati. */
  debrisMat: THREE.MeshLambertMaterial;
}

// ───────────────────────────────────────── TIM BIRU (pasukan taktis)
function buildBlue(A: Atlas, cm: Common, parts: Record<PartKey, THREE.BufferGeometry>, chip: Record<PartKey, number>) {
  const B = COL.blue;
  const shirt = css(B.shirt), gearC = css(B.gear), pants = css(B.pants), mask = css(B.mask);
  const shirtFab: Painter = (g, w, h, rng) => { fill(g, w, h, shirt); grain(g, w, h, rng, 0.06); shade(g, w, h, 0.06, 0.18); edge(g, w, h, 0.28); };
  const gearP = (c = gearC, a = 0.45): Painter => (g, w, h, rng) => { fill(g, w, h, c); grain(g, w, h, rng, 0.07); shade(g, w, h, 0.1, 0.25); edge(g, w, h, a); };
  const gear = A.px(48, 48, gearP());
  const web = A.px(64, 48, (g, w, h, rng) => {  // anyaman MOLLE
    fill(g, w, h, gearC); grain(g, w, h, rng, 0.07);
    for (let y = 6; y < h; y += 12) { g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(0, y, w, 5); for (let x = 6; x < w; x += 12) { g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x, y, 2, 5); } }
    edge(g, w, h, 0.4);
  });
  const helmetSide = A.px(96, 40, (g, w, h, rng) => {
    fill(g, w, h, css(B.helmet)); grain(g, w, h, rng, 0.08);
    g.strokeStyle = 'rgba(0,0,0,0.4)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(0, h * 0.7); g.lineTo(w, h * 0.7); g.stroke(); // tepi cangkang
    for (let i = 0; i < 3; i++) { g.fillStyle = 'rgba(0,0,0,0.5)'; g.beginPath(); g.arc(w * (0.25 + i * 0.25), h * 0.84, 2, 0, Math.PI * 2); g.fill(); }
    shade(g, w, h, 0.12, 0.2); edge(g, w, h, 0.5);
  });
  const helmetFront = A.px(110, 42, (g, w, h, rng) => {
    fill(g, w, h, css(B.helmet)); grain(g, w, h, rng, 0.08);
    g.fillStyle = 'rgba(0,0,0,0.35)'; rrect(g, w * 0.36, h * 0.08, w * 0.28, h * 0.5, 3); g.fill(); // dudukan NVG
    g.strokeStyle = 'rgba(0,0,0,0.45)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(0, h * 0.75); g.lineTo(w, h * 0.75); g.stroke();
    shade(g, w, h, 0.12, 0.2); edge(g, w, h, 0.5);
  });
  const helmetTop = A.px(110, 110, (g, w, h, rng) => {
    fill(g, w, h, css(B.helmet)); grain(g, w, h, rng, 0.08);
    g.fillStyle = 'rgba(255,255,255,0.07)'; rrect(g, w * 0.3, h * 0.25, w * 0.4, h * 0.3, 4); g.fill();  // panel velcro
    const gr = g.createRadialGradient(w / 2, h / 2, 4, w / 2, h / 2, w * 0.7); gr.addColorStop(0, 'rgba(255,255,255,0.12)'); gr.addColorStop(1, 'rgba(0,0,0,0.25)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h); edge(g, w, h, 0.5);
  });
  const headset = A.px(40, 40, (g, w, h, rng) => {
    fill(g, w, h, css(B.headset)); grain(g, w, h, rng, 0.06);
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.arc(w / 2, h / 2, w * 0.3, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.15)'; g.lineWidth = 1.5; g.beginPath(); g.arc(w / 2, h / 2, w * 0.3, 0, Math.PI * 2); g.stroke();
    edge(g, w, h, 0.5);
  });
  const goggles = A.px(170, 48, (g, w, h) => {
    fill(g, w, h, '#151515');
    const lx = w * 0.06, ly = h * 0.16, lw = w * 0.88, lh = h * 0.68;
    const gr = g.createLinearGradient(0, ly, 0, ly + lh);
    gr.addColorStop(0, '#ffd27a'); gr.addColorStop(0.45, css(B.lens)); gr.addColorStop(1, '#b0580c');
    g.fillStyle = gr; rrect(g, lx, ly, lw, lh, h * 0.2); g.fill();
    g.fillStyle = '#151515'; g.beginPath(); g.moveTo(w * 0.44, ly + lh + 1); g.quadraticCurveTo(w * 0.5, ly + lh * 0.45, w * 0.56, ly + lh + 1); g.fill(); // takik hidung
    g.fillStyle = 'rgba(255,255,255,0.35)'; g.beginPath(); g.moveTo(w * 0.12, ly + 3); g.lineTo(w * 0.3, ly + 3); g.lineTo(w * 0.2, ly + lh * 0.6); g.lineTo(w * 0.1, ly + lh * 0.6); g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineWidth = 2; rrect(g, lx, ly, lw, lh, h * 0.2); g.stroke();
  });
  const vestFront = A.region(1.56, 1.0, (g, w, h, rng) => {
    fill(g, w, h, gearC); grain(g, w, h, rng, 0.07);
    for (let y = h * 0.42; y < h * 0.95; y += 11) { g.fillStyle = 'rgba(255,255,255,0.07)'; g.fillRect(4, y, w - 8, 5); for (let x = 10; x < w - 8; x += 13) { g.fillStyle = 'rgba(0,0,0,0.4)'; g.fillRect(x, y, 2, 5); } }
    g.fillStyle = 'rgba(255,255,255,0.09)'; rrect(g, w * 0.3, h * 0.1, w * 0.4, h * 0.2, 3); g.fill();   // panel nama/velcro
    stitch(g, 4, 4, w - 4, 4, 'rgba(255,255,255,0.12)');
    shade(g, w, h, 0.1, 0.22); edge(g, w, h, 0.5, 3);
  });
  const vestBack = A.region(1.56, 1.0, (g, w, h, rng) => {
    fill(g, w, h, gearC); grain(g, w, h, rng, 0.07);
    g.fillStyle = 'rgba(0,0,0,0.4)'; rrect(g, w * 0.38, h * 0.06, w * 0.24, h * 0.12, 3); g.fill();    // pegangan seret
    for (let y = h * 0.3; y < h * 0.9; y += 11) { g.fillStyle = 'rgba(255,255,255,0.06)'; g.fillRect(4, y, w - 8, 5); }
    shade(g, w, h, 0.1, 0.22); edge(g, w, h, 0.5, 3);
  });
  const pouch = A.px(32, 40, (g, w, h, rng) => {
    fill(g, w, h, '#25272b'); grain(g, w, h, rng, 0.07);
    g.fillStyle = 'rgba(0,0,0,0.35)'; rrect(g, 1, 1, w - 2, h * 0.38, 4); g.fill();                  // tutup kantong
    g.fillStyle = 'rgba(255,255,255,0.1)'; g.fillRect(w * 0.4, h * 0.3, w * 0.2, h * 0.14);
    shade(g, w, h, 0.1, 0.25); edge(g, w, h, 0.5);
  });
  const radio = A.px(24, 48, (g, w, h, rng) => {
    fill(g, w, h, '#1c1d20'); grain(g, w, h, rng, 0.07);
    g.fillStyle = 'rgba(255,255,255,0.12)'; for (let y = h * 0.2; y < h * 0.6; y += 4) g.fillRect(4, y, w - 8, 1.5); // kisi speaker
    g.fillStyle = '#3c3f44'; g.fillRect(w * 0.3, h * 0.7, w * 0.4, h * 0.14);
    edge(g, w, h, 0.5);
  });
  const padSide = A.px(48, 64, (g, w, h, rng) => {
    fill(g, w, h, '#232529'); grain(g, w, h, rng, 0.08);
    g.fillStyle = 'rgba(255,255,255,0.08)'; g.beginPath(); g.moveTo(w * 0.15, h * 0.1); g.lineTo(w * 0.85, h * 0.1); g.lineTo(w * 0.95, h * 0.5);
    g.lineTo(w * 0.85, h * 0.9); g.lineTo(w * 0.15, h * 0.9); g.lineTo(w * 0.05, h * 0.5); g.closePath(); g.fill();
    g.fillStyle = 'rgba(0,0,0,0.6)'; for (const [x, y] of [[0.2, 0.2], [0.8, 0.2], [0.2, 0.8], [0.8, 0.8]]) { g.beginPath(); g.arc(w * x, h * y, 1.6, 0, Math.PI * 2); g.fill(); }
    shade(g, w, h, 0.14, 0.25); edge(g, w, h, 0.55);
  });
  const kneepad = A.px(64, 40, (g, w, h, rng) => {
    fill(g, w, h, '#1e1f22'); grain(g, w, h, rng, 0.08);
    g.fillStyle = 'rgba(255,255,255,0.09)'; g.beginPath(); g.moveTo(w * 0.25, h * 0.12); g.lineTo(w * 0.75, h * 0.12); g.lineTo(w * 0.9, h * 0.5);
    g.lineTo(w * 0.75, h * 0.88); g.lineTo(w * 0.25, h * 0.88); g.lineTo(w * 0.1, h * 0.5); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 1.5; g.stroke();
    shade(g, w, h, 0.12, 0.25); edge(g, w, h, 0.55);
  });
  const beltBlack = A.px(96, 24, (g, w, h, rng) => { fill(g, w, h, '#18191b'); grain(g, w, h, rng, 0.07); stitch(g, 0, 3, w, 3, 'rgba(255,255,255,0.12)'); stitch(g, 0, h - 3, w, h - 3, 'rgba(255,255,255,0.12)'); edge(g, w, h, 0.5); });
  const bootFront = A.px(88, 44, (g, w, h, rng) => {
    fill(g, w, h, '#1b1c1f'); grain(g, w, h, rng, 0.07);
    g.strokeStyle = 'rgba(150,150,155,0.55)'; g.lineWidth = 1.5;                                      // tali sepatu
    for (let i = 0; i < 4; i++) { const y = h * (0.12 + i * 0.13); g.beginPath(); g.moveTo(w * 0.36, y); g.lineTo(w * 0.64, y + h * 0.1); g.moveTo(w * 0.64, y); g.lineTo(w * 0.36, y + h * 0.1); g.stroke(); }
    g.fillStyle = 'rgba(255,255,255,0.06)'; rrect(g, w * 0.1, h * 0.7, w * 0.8, h * 0.28, 5); g.fill();  // ujung sepatu
    shade(g, w, h, 0.1, 0.3); edge(g, w, h, 0.55);
  });
  const bootSide = A.px(88, 44, (g, w, h, rng) => { fill(g, w, h, '#1b1c1f'); grain(g, w, h, rng, 0.07); stitch(g, 0, h * 0.7, w, h * 0.7, 'rgba(255,255,255,0.1)'); shade(g, w, h, 0.1, 0.3); edge(g, w, h, 0.55); });
  const sole = A.px(48, 16, (g, w, h) => { fill(g, w, h, '#0f0f10'); g.fillStyle = 'rgba(255,255,255,0.08)'; for (let x = 2; x < w; x += 6) g.fillRect(x, 0, 2, h); });
  const holster = A.px(32, 52, (g, w, h, rng) => {
    fill(g, w, h, '#1d1e21'); grain(g, w, h, rng, 0.08);
    g.fillStyle = 'rgba(255,255,255,0.08)'; rrect(g, 2, 2, w - 4, h * 0.3, 3); g.fill();
    g.fillStyle = '#4a4d52'; g.fillRect(w * 0.35, h * 0.12, w * 0.3, h * 0.08);
    edge(g, w, h, 0.55);
  });
  const pocket = A.px(36, 36, (g, w, h, rng) => { fill(g, w, h, '#202124'); grain(g, w, h, rng, 0.07); g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, 0, w, h * 0.35); stitch(g, 2, h * 0.36, w - 2, h * 0.36, 'rgba(255,255,255,0.12)'); edge(g, w, h, 0.5); });
  const collar = A.px(72, 16, (g, w, h, rng) => { fill(g, w, h, shirt); grain(g, w, h, rng, 0.06); g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(w / 2 - 1, 0, 2, h); shade(g, w, h, 0.1, 0.25); edge(g, w, h, 0.35); });

  // ── kepala: balaclava hitam + helm, goggles, headset
  const maskP = (front: boolean): Painter => (g, w, h, rng) => {
    fill(g, w, h, mask); grain(g, w, h, rng, 0.08);
    if (front) {
      g.fillStyle = 'rgba(255,255,255,0.05)'; rrect(g, w * 0.18, h * 0.5, w * 0.64, h * 0.44, 8); g.fill();
      g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(w / 2, h * 0.52); g.lineTo(w / 2, h * 0.94); g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.08)'; for (let i = 0; i < 4; i++) g.fillRect(w * 0.37 + i * w * 0.07, h * 0.78, w * 0.035, h * 0.07);
    }
    shade(g, w, h, 0.04, 0.22); edge(g, w, h, 0.4);
  };
  const H = S(RIG.head.size);
  const head = [
    box(H, [0, 0, 0], { all: A.region(H[0], H[1], maskP(false)), nz: A.region(H[0], H[1], maskP(true)) }),
    // helm dua tingkat (kubah + pinggiran) agar terbaca sebagai helm, bukan kotak
    box([1.3, 0.38, 1.32], [0, 0.47, 0.02], { all: helmetSide, nz: helmetFront, py: helmetTop }),
    box([1.38, 0.12, 1.38], [0, 0.27, 0.02], { all: gear }),
    box([0.3, 0.18, 0.08], [0, 0.5, -0.7], { all: gear }),
    box([0.05, 0.1, 0.8], [0.68, 0.4, 0.02], { all: gear }), box([0.05, 0.1, 0.8], [-0.68, 0.4, 0.02], { all: gear }),
    box([1.3, 0.1, 1.3], [0, 0.14, 0.03], { all: gear }),
    box([1.06, 0.3, 0.12], [0, 0.13, -0.64], { all: gear, nz: goggles }),
    box([0.16, 0.42, 0.42], [0.67, 0, 0.05], { all: headset }), box([0.16, 0.42, 0.42], [-0.67, 0, 0.05], { all: headset }),
    box([0.05, 0.05, 0.77], [-0.48, -0.24, -0.29], { all: gear }, [0, -0.5, 0]),
    box([0.09, 0.07, 0.07], [-0.3, -0.24, -0.63], { all: gear }),
  ];
  parts.head = merge(head);

  // ── badan atas: baju biru + rompi pelat, kantong magasin, radio, granat
  const U = S(RIG.upper.size);
  const upperFront: Painter = (g, w, h, rng) => {
    shirtFab(g, w, h, rng);
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.beginPath(); g.moveTo(w * 0.4, 0); g.lineTo(w * 0.5, h * 0.18); g.lineTo(w * 0.6, 0); g.fill(); // kerah V
    g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(w / 2 - 1, 0, 2, h * 0.3);                                   // ritsleting
  };
  const upperTop: Painter = (g, w, h, rng) => { shirtFab(g, w, h, rng); g.strokeStyle = 'rgba(0,0,0,0.3)'; g.lineWidth = 2; rrect(g, w * 0.3, h * 0.15, w * 0.4, h * 0.7, 8); g.stroke(); };
  const upper = [
    box(U, [0, 0, 0], {
      all: A.region(U[2], U[1], shirtFab), nz: A.region(U[0], U[1], upperFront), pz: A.region(U[0], U[1], shirtFab),
      py: A.region(U[0], U[2], upperTop), ny: A.region(U[0], U[2], shirtFab),
    }),
    box([1.56, 1.0, 0.16], [0, -0.06, -0.57], { all: gear, nz: vestFront }),
    box([1.56, 1.0, 0.14], [0, -0.06, 0.56], { all: gear, pz: vestBack }),
    box([0.04, 0.58, 1.1], [1.02, -0.28, 0], { all: web }), box([0.04, 0.58, 1.1], [-1.02, -0.28, 0], { all: web }),
    box([0.34, 0.08, 1.14], [0.55, 0.63, 0], { all: gear }), box([0.34, 0.08, 1.14], [-0.55, 0.63, 0], { all: gear }),
    box([0.3, 0.2, 0.08], [0.55, 0.52, -0.55], { all: gear }), box([0.3, 0.2, 0.08], [-0.55, 0.52, -0.55], { all: gear }),
    box([0.3, 0.2, 0.08], [0.55, 0.52, 0.55], { all: gear }), box([0.3, 0.2, 0.08], [-0.55, 0.52, 0.55], { all: gear }),
    box([0.16, 0.38, 0.14], [-0.6, 0.14, -0.7], { all: gear, nz: radio }), box([0.03, 0.4, 0.03], [-0.64, 0.52, -0.7], { all: gear }),
    box([0.2, 0.24, 0.2], [-0.16, 0.2, -0.73], { all: cm.grenade }), box([0.08, 0.07, 0.08], [-0.16, 0.35, -0.73], { all: cm.metal }),
    box([0.9, 0.12, 0.84], [0, 0.65, 0.02], { all: collar }),
  ];
  for (const x of [-0.4, 0, 0.4]) upper.push(box([0.32, 0.4, 0.14], [x, -0.3, -0.71], { all: gear, nz: pouch }));
  parts.upper = merge(upper);

  // ── badan bawah: ujung baju + sabuk + celana hitam
  const L = S(RIG.lower.size);
  const lowerP = (front: boolean, back: boolean): Painter => (g, w, h, rng) => {
    fill(g, w, h, pants); grain(g, w, h, rng, 0.07);
    g.fillStyle = shirt; g.fillRect(0, 0, w, h * 0.24); grain(g, w, h * 0.24, rng, 0.05);
    if (front) { stitch(g, w / 2, h * 0.45, w / 2, h, 'rgba(255,255,255,0.12)'); g.strokeStyle = 'rgba(255,255,255,0.08)'; g.lineWidth = 1.5; g.beginPath(); g.arc(w * 0.18, h * 0.4, w * 0.12, 0, Math.PI / 2); g.stroke(); g.beginPath(); g.arc(w * 0.82, h * 0.4, w * 0.12, Math.PI / 2, Math.PI); g.stroke(); }
    if (back) { g.strokeStyle = 'rgba(255,255,255,0.08)'; g.lineWidth = 1.5; g.strokeRect(w * 0.15, h * 0.5, w * 0.22, h * 0.38); g.strokeRect(w * 0.63, h * 0.5, w * 0.22, h * 0.38); }
    shade(g, w, h, 0.05, 0.2); edge(g, w, h, 0.35);
  };
  parts.lower = merge([
    box(L, [0, 0, 0], { all: A.region(L[2], L[1], lowerP(false, false)), nz: A.region(L[0], L[1], lowerP(true, false)), pz: A.region(L[0], L[1], lowerP(false, true)),
      py: A.region(L[0], L[2], shirtFab), ny: A.region(L[0], L[2], gearP(pants, 0.3)) }),
    box([2.08, 0.22, 1.08], [0, 0.15, 0], { all: beltBlack }),
    box([0.3, 0.16, 0.06], [0, 0.15, -0.56], { all: cm.metalDark }),
    box([0.28, 0.3, 0.24], [0.84, -0.02, -0.42], { all: gear, nz: pouch }), box([0.28, 0.3, 0.24], [-0.84, -0.02, -0.42], { all: gear, nz: pouch }),
  ]);

  // ── lengan: lengan baju biru, pelindung bahu & siku, manset sarung tangan, jari di bawah
  const AR = S(RIG.arm.size);
  const armP = (withFingers: boolean): Painter => (g, w, h, rng) => {
    shirtFab(g, w, h, rng);
    g.strokeStyle = 'rgba(0,0,0,0.18)'; g.lineWidth = 1.5;
    for (const y of [0.55, 0.6]) { g.beginPath(); g.moveTo(w * 0.1, h * y); g.quadraticCurveTo(w * 0.5, h * (y + 0.03), w * 0.9, h * y); g.stroke(); } // lipatan siku
    g.fillStyle = css(COL.glove); g.fillRect(0, h * 0.86, w, h * 0.14);
    if (withFingers) fingers(g, w, h * 0.92, h * 0.08);
  };
  const armFront = A.region(AR[0], AR[1], armP(true)), armPlain = A.region(AR[0], AR[1], armP(false)), armTop = A.region(AR[0], AR[2], shirtFab);
  const arm = (o: number) => merge([
    box(AR, [0, 0, 0], { all: armPlain, nz: armFront, py: armTop, ny: cm.gloveBottom, [o > 0 ? 'nx' : 'px']: armFront }),
    box([0.16, 0.8, 0.94], [o * 0.57, 0.5, 0], { all: padSide }),
    box([1.04, 0.12, 0.98], [0, 1.03, 0], { all: gear }),
    box([1.05, 0.1, 1.05], [0, 0.08, 0], { all: gear }),
    box([0.14, 0.5, 0.62], [o * 0.56, -0.26, 0.04], { all: padSide }),
    box([1.06, 0.38, 1.06], [0, -0.66, 0], { all: cm.gloveCuff }),
  ]);
  parts.armR = arm(1); parts.armL = arm(-1);

  // ── kaki: celana hitam, pelindung lutut, sepatu bot; kanan: holster paha; kiri: kantong kargo
  const LG = S(RIG.leg.size);
  const legP = (side: boolean): Painter => (g, w, h, rng) => {
    fill(g, w, h, pants); grain(g, w, h, rng, 0.07);
    if (side) stitch(g, w / 2, 0, w / 2, h, 'rgba(255,255,255,0.1)');
    g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(w * 0.15, h * 0.42); g.lineTo(w * 0.85, h * 0.44); g.stroke();
    shade(g, w, h, 0.05, 0.18); edge(g, w, h, 0.35);
  };
  const legFront = A.region(LG[0], LG[1], legP(false)), legSide = A.region(LG[2], LG[1], legP(true)), legEnd = A.region(LG[0], LG[2], legP(false));
  const leg = (o: number) => {
    const l = [
      box(LG, [0, 0, 0], { all: legSide, nz: legFront, pz: legFront, py: legEnd, ny: legEnd }),
      box([0.84, 0.48, 0.12], [0, -0.04, -0.55], { all: gear, nz: kneepad }),
      box([1.08, 0.52, 1.14], [0, -0.64, -0.05], { all: bootSide, nz: bootFront }),
      box([1.1, 0.08, 1.16], [0, -0.87, -0.05], { all: sole }),
    ];
    if (o > 0) l.push(
      box([0.24, 0.62, 0.38], [0.6, 0.38, -0.02], { all: gear, px: holster }),
      box([1.06, 0.08, 1.06], [0, 0.5, 0], { all: gear }), box([1.06, 0.08, 1.06], [0, 0.22, 0], { all: gear }),
      box([0.12, 0.1, 0.04], [0.1, 0.5, -0.55], { all: cm.metalDark }), box([0.12, 0.1, 0.04], [0.1, 0.22, -0.55], { all: cm.metalDark }),
    );
    else l.push(box([0.12, 0.42, 0.44], [-0.56, 0.34, 0], { all: gear, nx: pocket }));
    return merge(l);
  };
  parts.legR = leg(1); parts.legL = leg(-1);

  chip.head = B.mask; chip.upper = B.shirt; chip.lower = B.pants; chip.armR = B.shirt; chip.armL = B.shirt; chip.legR = B.pants; chip.legL = B.pants;
}

// ───────────────────────────────────────── TIM BIRU — WANITA (desain pengguna: Karakter/ROBLOX-WANITA-BLUE-TIM.png)
//   baret marun miring + lencana perak, rambut bob hitam berponi samping, wajah (alis, eyeliner, bibir), jaket loreng biru
//   ritsleting V berlis marun + kerah ber-pin emas, harness hitam, ujung jaket rajut navy, perut terbuka + tato kecil, kantong
//   bahu (gelap kanan, krem kiri), manset rajut, sarung tangan tanpa jari, sabuk taktis (kantong, senter), celana pendek loreng
//   berlis marun, tato mawar di paha, holster paha kiri, sepatu bot tinggi bertali.
function buildBlueFemale(A: Atlas, cm: Common, parts: Record<PartKey, THREE.BufferGeometry>, chip: Record<PartKey, number>) {
  const F = COL.blueF;
  const skin = css(COL.skin), maroon = css(F.maroon), hairC = css(F.hair), strapC = css(F.strap), knitC = css(F.knit);
  const tat = 'rgba(122,74,48,0.62)';
  // loreng organik seperti acuan: bercak membulat (kurva halus, bukan poligon), terang & gelap seimbang
  const camoCols = [css(F.camoLight), css(F.camoNavy), css(F.camoDark), css(F.camoLight), css(F.camoDark), css(F.camoNavy)];
  const camoFab = (g: G, w: number, h: number, rng: Rng, k = 1) => {
    fill(g, w, h, css(F.camo));
    const n = Math.max(4, Math.round(((w * h) / 380) * k));
    for (let i = 0; i < n; i++) { g.fillStyle = camoCols[i % camoCols.length]; smoothBlob(g, rng() * w, rng() * h, 5 + rng() * 10, rng); }
    grain(g, w, h, rng, 0.035, 1.5);
  };
  const camoP = (k = 1, a = 0.25): Painter => (g, w, h, rng) => { camoFab(g, w, h, rng, k); shade(g, w, h, 0.07, 0.2); edge(g, w, h, a); };
  const skinFill = (g: G, w: number, h: number, rng: Rng) => { fill(g, w, h, skin); grain(g, w, h, rng, 0.025); };
  const skinP: Painter = (g, w, h, rng) => { skinFill(g, w, h, rng); shade(g, w, h, 0.08, 0.14); edge(g, w, h, 0.18); };
  /** Rambut hitam berkilau kebiruan pada persegi (x, y, w, h) — biasanya di dalam clip. */
  const hairFill = (g: G, x: number, y: number, w: number, h: number, rng: Rng) => {
    g.fillStyle = hairC; g.fillRect(x, y, w, h);
    for (let i = 0; i < (w * h) / 26; i++) {
      g.strokeStyle = rng() < 0.55 ? 'rgba(0,0,0,0.35)' : 'rgba(130,145,185,0.16)'; g.lineWidth = 1;
      const sx = x + rng() * w; g.beginPath(); g.moveTo(sx, y); g.lineTo(sx + (rng() - 0.5) * 4, y + h); g.stroke();
    }
  };
  const clipHair = (g: G, path: () => void, x: number, y: number, w: number, h: number, rng: Rng) => {
    g.save(); g.beginPath(); path(); g.clip(); hairFill(g, x, y, w, h, rng); g.restore();
  };
  const hairSw = A.px(40, 48, (g, w, h, rng) => { hairFill(g, 0, 0, w, h, rng); edge(g, w, h, 0.3); });
  const strap = A.px(64, 20, (g, w, h, rng) => {
    fill(g, w, h, strapC); grain(g, w, h, rng, 0.07);
    stitch(g, 0, 3, w, 3, 'rgba(255,255,255,0.13)'); stitch(g, 0, h - 3, w, h - 3, 'rgba(255,255,255,0.13)'); edge(g, w, h, 0.45);
  });
  const gearB = A.px(48, 48, (g, w, h, rng) => { fill(g, w, h, '#202124'); grain(g, w, h, rng, 0.07); shade(g, w, h, 0.1, 0.25); edge(g, w, h, 0.45); });

  // ── kepala: wajah, rambut bob (samping lebih panjang di depan), baret miring + lencana
  const faceP: Painter = (g, w, h, rng) => {
    skinFill(g, w, h, rng);
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(120,60,30,0.14)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(232,120,110,0.16)';                                                                 // pipi merona
    for (const cx of [0.26, 0.74]) { g.beginPath(); g.ellipse(w * cx, h * 0.665, w * 0.085, h * 0.045, 0, 0, Math.PI * 2); g.fill(); }
    g.lineCap = 'round'; g.lineJoin = 'round';
    for (const s of [-1, 1]) {
      const cx = w * (0.5 + s * 0.19), cy = h * 0.535, ew = w * 0.088, eh = h * 0.046;
      g.strokeStyle = '#26181a'; g.lineWidth = Math.max(1.5, w * 0.02);                                      // alis tipis melengkung
      g.beginPath(); g.moveTo(cx - s * ew * 1.05, h * 0.435); g.quadraticCurveTo(cx + s * ew * 0.1, h * 0.375, cx + s * ew * 1.15, h * 0.418); g.stroke();
      const almond = () => {
        g.beginPath(); g.moveTo(cx - ew, cy); g.quadraticCurveTo(cx, cy - eh * 1.7, cx + ew, cy); g.quadraticCurveTo(cx, cy + eh * 1.15, cx - ew, cy); g.closePath();
      };
      g.save(); almond(); g.clip();                                                                         // mata almond
      g.fillStyle = '#f6f1ec'; g.fillRect(cx - ew, cy - eh * 2, ew * 2, eh * 4);
      g.fillStyle = css(F.iris); g.beginPath(); g.arc(cx + s * ew * 0.05, cy - eh * 0.15, eh * 1.0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#120c0a'; g.beginPath(); g.arc(cx + s * ew * 0.05, cy - eh * 0.15, eh * 0.48, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.9)'; g.fillRect(cx - ew * 0.12, cy - eh * 0.78, Math.max(1.2, eh * 0.4), Math.max(1.2, eh * 0.4));
      g.restore();
      const inX = cx - s * ew, outX = cx + s * ew;                                                          // eyeliner bersayap
      g.strokeStyle = '#110b0a'; g.lineWidth = Math.max(1.6, w * 0.022);
      g.beginPath(); g.moveTo(inX, cy); g.quadraticCurveTo(cx, cy - eh * 1.78, outX, cy - eh * 0.15); g.lineTo(outX + s * w * 0.035, cy - eh * 1.0); g.stroke();
      g.strokeStyle = 'rgba(80,45,35,0.55)'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(inX + s * ew * 0.25, cy + eh * 0.55); g.quadraticCurveTo(cx, cy + eh * 1.25, outX, cy + eh * 0.2); g.stroke();
    }
    g.strokeStyle = 'rgba(150,85,60,0.5)'; g.lineWidth = 1.2;                                               // hidung
    g.beginPath(); g.moveTo(w * 0.505, h * 0.575); g.quadraticCurveTo(w * 0.535, h * 0.635, w * 0.5, h * 0.66); g.stroke();
    g.fillStyle = 'rgba(140,80,58,0.4)'; g.fillRect(w * 0.465, h * 0.66, w * 0.025, 1.2); g.fillRect(w * 0.515, h * 0.66, w * 0.025, 1.2);
    const ly = h * 0.765, lw = w * 0.115, mx = w * 0.5;                                                      // bibir tersenyum
    g.fillStyle = css(F.lips);
    g.beginPath(); g.moveTo(mx - lw, ly - h * 0.004);
    g.quadraticCurveTo(mx - lw * 0.5, ly - h * 0.034, mx, ly - h * 0.014); g.quadraticCurveTo(mx + lw * 0.5, ly - h * 0.034, mx + lw, ly - h * 0.006);
    g.quadraticCurveTo(mx, ly + h * 0.05, mx - lw, ly - h * 0.004); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(105,40,38,0.85)'; g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(mx - lw * 1.04, ly - h * 0.01); g.quadraticCurveTo(mx, ly + h * 0.014, mx + lw * 1.04, ly - h * 0.012); g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.28)'; g.beginPath(); g.ellipse(mx + lw * 0.1, ly + h * 0.022, lw * 0.32, h * 0.006, 0, 0, Math.PI * 2); g.fill();
    clipHair(g, () => {                                                                                    // poni menyamping
      g.moveTo(0, 0); g.lineTo(w, 0); g.lineTo(w, h * 0.45);
      g.quadraticCurveTo(w * 0.86, h * 0.43, w * 0.8, h * 0.36);
      g.quadraticCurveTo(w * 0.6, h * 0.31, w * 0.42, h * 0.255);
      g.lineTo(w * 0.36, h * 0.29); g.lineTo(w * 0.33, h * 0.24);
      g.quadraticCurveTo(w * 0.18, h * 0.215, w * 0.12, h * 0.25);
      g.lineTo(0, h * 0.33); g.closePath();
    }, 0, 0, w, h * 0.5, rng);
    clipHair(g, () => {                                                                                    // helai samping sampai rahang
      g.moveTo(0, 0); g.lineTo(w * 0.13, 0); g.lineTo(w * 0.12, h * 0.5); g.quadraticCurveTo(w * 0.13, h * 0.78, w * 0.06, h * 0.9); g.lineTo(0, h * 0.92); g.closePath();
    }, 0, 0, w * 0.14, h, rng);
    clipHair(g, () => {
      g.moveTo(w, 0); g.lineTo(w * 0.87, 0); g.lineTo(w * 0.88, h * 0.5); g.quadraticCurveTo(w * 0.87, h * 0.78, w * 0.94, h * 0.9); g.lineTo(w, h * 0.92); g.closePath();
    }, w * 0.86, 0, w * 0.14, h, rng);
    edge(g, w, h, 0.18);
  };
  const headSideP: Painter = (g, w, h, rng) => { skinFill(g, w, h, rng); clipHair(g, () => g.rect(0, 0, w, h * 0.86), 0, 0, w, h, rng); edge(g, w, h, 0.18); };
  const headBackP: Painter = (g, w, h, rng) => { skinFill(g, w, h, rng); clipHair(g, () => g.rect(0, 0, w, h * 0.9), 0, 0, w, h, rng); edge(g, w, h, 0.2); };
  /** Sisi rambut bob dengan tepi bawah bergerigi (cutout alpha); depan lebih panjang. frontRight: sisi kanan tekstur = depan. */
  const bobCut = (frontRight: boolean): Painter => (g, w, h, rng) => {
    g.clearRect(0, 0, w, h);
    const yF = h, yB = h * 0.78, yL = frontRight ? yB : yF, yR = frontRight ? yF : yB;
    clipHair(g, () => {
      g.moveTo(0, 0); g.lineTo(w, 0); g.lineTo(w, yR);
      for (let i = 1; i <= 6; i++) { const t = 1 - i / 6, y = yL + (yR - yL) * t; g.lineTo(w * t + w / 12, y - h * 0.07); g.lineTo(w * t, y); }
      g.closePath();
    }, 0, 0, w, h, rng);
    shade(g, w, h, 0.1, 0.12);
  };
  const backCut = A.region(1.28, 0.82, (g, w, h, rng) => {
    g.clearRect(0, 0, w, h);
    clipHair(g, () => {
      g.moveTo(0, 0); g.lineTo(w, 0); g.lineTo(w, h * 0.92);
      for (let i = 1; i <= 8; i++) { const x = w * (1 - i / 8); g.lineTo(x + w / 16, h * 0.82); g.lineTo(x, h * (0.9 + (i % 2) * 0.08)); }
      g.closePath();
    }, 0, 0, w, h, rng);
    shade(g, w, h, 0.08, 0.18);
  });
  const beretFab = (f: number): Painter => (g, w, h, rng) => {
    fill(g, w, h, tone(F.beret, f)); grain(g, w, h, rng, 0.06, 1.5);
    const gr = g.createRadialGradient(w * 0.4, h * 0.3, 2, w * 0.5, h * 0.5, Math.max(w, h) * 0.7);
    gr.addColorStop(0, 'rgba(255,190,190,0.14)'); gr.addColorStop(1, 'rgba(0,0,0,0.25)'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    edge(g, w, h, 0.35);
  };
  const beretSide = A.px(108, 20, beretFab(1)), beretTop = A.px(110, 106, beretFab(1.05));
  const beretBand = A.px(104, 14, (g, w, h, rng) => {
    fill(g, w, h, tone(F.beret, 0.62)); grain(g, w, h, rng, 0.06); stitch(g, 0, 2, w, 2, 'rgba(255,255,255,0.12)'); edge(g, w, h, 0.45);
  });
  const badge = A.px(28, 28, (g, w, h) => {                                                                 // perisai hitam + lencana perak
    g.clearRect(0, 0, w, h);
    g.fillStyle = '#141416'; g.beginPath(); g.moveTo(w * 0.15, h * 0.08); g.lineTo(w * 0.85, h * 0.08); g.lineTo(w * 0.85, h * 0.6);
    g.lineTo(w * 0.5, h * 0.95); g.lineTo(w * 0.15, h * 0.6); g.closePath(); g.fill();
    const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#eef0f2'); gr.addColorStop(1, '#7d8288');
    g.fillStyle = gr; g.beginPath(); g.moveTo(w * 0.5, h * 0.14); g.lineTo(w * 0.8, h * 0.44); g.lineTo(w * 0.5, h * 0.74); g.lineTo(w * 0.2, h * 0.44); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(40,40,45,0.8)'; g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(w * 0.5, h * 0.26); g.lineTo(w * 0.5, h * 0.62); g.moveTo(w * 0.32, h * 0.44); g.lineTo(w * 0.68, h * 0.44); g.stroke();
  });
  const H = S(RIG.head.size);
  parts.head = merge([
    box(H, [0, 0, 0], {
      nz: A.region(H[0], H[1], faceP), pz: A.region(H[0], H[1], headBackP),
      px: A.region(H[2], H[1], headSideP), nx: A.region(H[2], H[1], headSideP),
      py: A.region(H[0], H[2], (g, w, h, rng) => hairFill(g, 0, 0, w, h, rng)), ny: A.region(H[0], H[2], skinP),
    }),
    box([0.1, 0.8, 1.18], [0.645, 0.02, 0.05], { all: hairSw, px: A.region(1.18, 0.8, bobCut(true)), nx: cm.T, ny: cm.T }),
    box([0.1, 0.8, 1.18], [-0.645, 0.02, 0.05], { all: hairSw, nx: A.region(1.18, 0.8, bobCut(false)), px: cm.T, ny: cm.T }),
    box([1.28, 0.82, 0.1], [0, 0.03, 0.645], { all: hairSw, pz: backCut, nz: cm.T, ny: cm.T }),
    box([1.27, 0.13, 1.27], [0, 0.5, 0], { all: beretBand }),
    box([1.36, 0.17, 1.32], [-0.06, 0.63, 0.02], { all: beretSide, py: beretTop }, [0, 0, 0.1]),      // mahkota miring ke kiri karakter
    box([0.34, 0.2, 1.18], [-0.66, 0.55, 0.03], { all: beretSide, py: beretTop }, [0, 0, 0.5]),        // lipatan jatuh di sisi kiri
    box([0.26, 0.26, 0.03], [0.3, 0.51, -0.648], { all: cm.T, nz: badge }),                            // lencana di depan kanan
  ]);

  // ── badan atas: jaket loreng ritsleting V berlis marun + kerah ber-pin emas, harness, ujung rajut (perut terbuka di bawahnya)
  const U = S(RIG.upper.size);
  const upperFront: Painter = (g, w, h, rng) => {
    camoFab(g, w, h, rng);
    const cx = w / 2, vx = w * 0.12, vy = h * 0.46;
    g.fillStyle = skin; g.beginPath(); g.moveTo(cx - vx, 0); g.lineTo(cx, vy); g.lineTo(cx + vx, 0); g.closePath(); g.fill();
    g.fillStyle = 'rgba(160,90,65,0.18)'; g.beginPath(); g.moveTo(cx - vx * 0.6, 0); g.lineTo(cx, vy * 0.9); g.lineTo(cx + vx * 0.6, 0); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(140,75,55,0.4)'; g.lineWidth = 1; g.beginPath(); g.moveTo(cx, vy * 0.5); g.lineTo(cx, vy * 0.86); g.stroke();
    g.strokeStyle = maroon; g.lineWidth = 3; g.beginPath(); g.moveTo(cx - vx - 1, 0); g.lineTo(cx, vy + 1); g.lineTo(cx + vx + 1, 0); g.stroke();
    for (const s of [-1, 1]) {                                                                             // kerah tegak + pin emas
      g.fillStyle = 'rgba(30,50,95,0.35)'; g.beginPath(); g.moveTo(cx + s * vx, 0); g.lineTo(cx + s * (vx + w * 0.1), 0);
      g.lineTo(cx + s * (vx + w * 0.08), h * 0.1); g.lineTo(cx + s * vx * 0.78, h * 0.1); g.closePath(); g.fill();
      g.strokeStyle = maroon; g.lineWidth = 2; g.stroke();
      const px = cx + s * (vx + w * 0.045) - 3; g.fillStyle = css(F.gold); g.fillRect(px, h * 0.025, 6, 5);
      g.fillStyle = 'rgba(255,255,255,0.5)'; g.fillRect(px + 1, h * 0.025 + 1, 2, 1);
    }
    g.fillStyle = '#c9ccd1'; g.fillRect(cx - 1.5, vy - 1, 3, 7);                                           // tarikan ritsleting
    g.strokeStyle = 'rgba(0,0,0,0.38)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(cx, vy + 6); g.lineTo(cx, h); g.stroke();
    shade(g, w, h, 0.06, 0.2); edge(g, w, h, 0.25);
  };
  const knitP = (stripeTop: boolean): Painter => (g, w, h, rng) => {
    fill(g, w, h, knitC); grain(g, w, h, rng, 0.06, 1.5);
    g.fillStyle = 'rgba(0,0,0,0.25)'; for (let x = 1; x < w; x += 3) g.fillRect(x, 0, 1, h);               // rusuk rajut
    g.fillStyle = 'rgba(255,255,255,0.07)'; for (let x = 2; x < w; x += 3) g.fillRect(x, 0, 1, h);
    if (stripeTop) { g.fillStyle = maroon; g.fillRect(0, 0, w, Math.max(2, h * 0.18)); }
    shade(g, w, h, 0.08, 0.25); edge(g, w, h, 0.4);
  };
  const upper: THREE.BufferGeometry[] = [
    box(U, [0, 0, 0], {
      all: A.region(U[2], U[1], camoP()), nz: A.region(U[0], U[1], upperFront), pz: A.region(U[0], U[1], camoP()),
      py: A.region(U[0], U[2], camoP(1.1)), ny: A.region(U[0], U[2], camoP()),
    }),
    box([2.04, 0.12, 1.04], [0, -0.55, 0], { all: A.px(160, 10, knitP(false)) }),
  ];
  for (const s of [-1, 1]) upper.push(                                     // tali bahu (di luar kepala: |x| 0.65–0.85) depan-atas-belakang
    box([0.2, 0.98, 0.05], [s * 0.75, 0.1, -0.53], { all: strap }),
    box([0.2, 0.05, 1.1], [s * 0.75, 0.625, 0], { all: strap }),
    box([0.2, 0.98, 0.05], [s * 0.75, 0.1, 0.53], { all: strap }),
    box([0.24, 0.07, 0.03], [s * 0.75, 0.32, -0.565], { all: cm.metalDark }),
  );
  upper.push(
    box([1.42, 0.12, 0.05], [0, -0.22, -0.545], { all: strap }), box([0.2, 0.14, 0.05], [0, -0.22, -0.575], { all: cm.metal }),
    box([1.6, 0.1, 0.05], [0, -0.05, 0.545], { all: strap }),
  );
  parts.upper = merge(upper);

  // ── badan bawah: perut terbuka (pusar + tato kecil), sabuk taktis + kantong + senter, celana pendek loreng
  const L = S(RIG.lower.size), midriff = 0.37;
  const lowerP = (front: boolean, back: boolean): Painter => (g, w, h, rng) => {
    camoFab(g, w, h, rng);
    g.fillStyle = skin; g.fillRect(0, 0, w, h * midriff); grain(g, w, h * midriff, rng, 0.02);
    const gr = g.createLinearGradient(0, 0, 0, h * midriff); gr.addColorStop(0, 'rgba(80,40,25,0.22)'); gr.addColorStop(0.35, 'rgba(80,40,25,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h * midriff);                                                      // bayang ujung jaket
    if (front) {
      g.fillStyle = 'rgba(140,78,55,0.55)'; g.beginPath(); g.ellipse(w * 0.5, h * 0.235, 1.6, 2.6, 0, 0, Math.PI * 2); g.fill();   // pusar
      const tx = w * 0.6, ty = h * 0.17;                                                                  // tato burung kecil
      g.strokeStyle = tat; g.lineWidth = 1.2; g.lineCap = 'round';
      g.beginPath(); g.moveTo(tx - 6, ty - 1); g.quadraticCurveTo(tx - 2, ty + 2, tx, ty); g.quadraticCurveTo(tx + 2, ty + 2, tx + 6, ty - 2); g.stroke();
      g.beginPath(); g.moveTo(tx, ty); g.lineTo(tx - 1, ty + 4); g.moveTo(tx, ty); g.lineTo(tx + 2, ty + 4); g.stroke();
      stitch(g, w / 2, h * 0.62, w / 2, h, 'rgba(255,255,255,0.18)');
    }
    if (back) { g.strokeStyle = 'rgba(255,255,255,0.12)'; g.lineWidth = 1.2; g.strokeRect(w * 0.16, h * 0.66, w * 0.22, h * 0.28); g.strokeRect(w * 0.62, h * 0.66, w * 0.22, h * 0.28); }
    shade(g, w, h, 0.04, 0.2); edge(g, w, h, 0.25);
  };
  const beltB = A.px(96, 24, (g, w, h, rng) => {
    fill(g, w, h, '#18191b'); grain(g, w, h, rng, 0.07); stitch(g, 0, 3, w, 3, 'rgba(255,255,255,0.12)'); stitch(g, 0, h - 3, w, h - 3, 'rgba(255,255,255,0.12)'); edge(g, w, h, 0.5);
  });
  const pouchB = A.px(34, 38, (g, w, h, rng) => {
    fill(g, w, h, '#232428'); grain(g, w, h, rng, 0.07);
    g.fillStyle = 'rgba(0,0,0,0.38)'; rrect(g, 1, 1, w - 2, h * 0.4, 4); g.fill();
    g.fillStyle = '#4a4d52'; g.fillRect(w * 0.4, h * 0.3, w * 0.2, h * 0.12);
    shade(g, w, h, 0.1, 0.25); edge(g, w, h, 0.5);
  });
  const torch = A.px(16, 34, (g, w, h, rng) => {
    fill(g, w, h, '#161719'); grain(g, w, h, rng, 0.06);
    g.fillStyle = '#9fa3a8'; g.fillRect(0, 0, w, h * 0.12);                                                 // kepala senter
    g.fillStyle = maroon; g.fillRect(0, h * 0.42, w, h * 0.12);                                            // pita marun
    g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(w * 0.3, 0, 2, h);
    edge(g, w, h, 0.5);
  });
  parts.lower = merge([
    box(L, [0, 0, 0], { all: A.region(L[2], L[1], lowerP(false, false)), nz: A.region(L[0], L[1], lowerP(true, false)),
      pz: A.region(L[0], L[1], lowerP(false, true)), py: A.region(L[0], L[2], skinP), ny: A.region(L[0], L[2], camoP()) }),
    box([2.08, 0.2, 1.08], [0, 0, 0], { all: beltB }),
    box([0.26, 0.15, 0.06], [0, 0, -0.565], { all: cm.metal }),
    box([0.3, 0.32, 0.2], [0.45, -0.08, -0.62], { all: gearB, nz: pouchB }),
    box([0.36, 0.3, 0.22], [-0.55, -0.07, -0.62], { all: gearB, nz: pouchB }),
    box([0.15, 0.42, 0.15], [0.98, -0.06, -0.36], { all: torch }),
    box([0.38, 0.26, 0.16], [-0.35, -0.04, 0.6], { all: gearB, pz: pouchB }),
  ]);

  // ── lengan: loreng, kantong bahu (gelap kanan, krem kiri), manset rajut berlis marun, sarung tangan tanpa jari
  const AR = S(RIG.arm.size);
  const armP = (hand: boolean): Painter => (g, w, h, rng) => {
    camoFab(g, w, h, rng);
    g.strokeStyle = 'rgba(0,0,0,0.16)'; g.lineWidth = 1.5;
    for (const y of [0.5, 0.55]) { g.beginPath(); g.moveTo(w * 0.1, h * y); g.quadraticCurveTo(w * 0.5, h * (y + 0.03), w * 0.9, h * y); g.stroke(); } // lipatan siku
    g.fillStyle = css(COL.glove); g.fillRect(0, h * 0.86, w, h * 0.14);
    if (hand) fingers(g, w, h * 0.92, h * 0.08);
    shade(g, w, h, 0.06, 0.16); edge(g, w, h, 0.25);
  };
  const pocketP = (c: number): Painter => (g, w, h, rng) => {
    fill(g, w, h, css(c)); grain(g, w, h, rng, 0.07);
    g.fillStyle = 'rgba(0,0,0,0.3)'; rrect(g, 1, 1, w - 2, h * 0.34, 4); g.fill();                         // tutup kantong
    stitch(g, 3, h * 0.36, w - 3, h * 0.36, 'rgba(255,255,255,0.18)');
    g.fillStyle = 'rgba(255,255,255,0.1)'; g.fillRect(w * 0.2, h * 0.5, w * 0.6, h * 0.32);                // panel velcro
    shade(g, w, h, 0.1, 0.25); edge(g, w, h, 0.5);
  };
  const knitCuff = A.px(80, 20, knitP(true));
  const armFront = A.region(AR[0], AR[1], armP(true)), armPlain = A.region(AR[0], AR[1], armP(false)), armTop = A.region(AR[0], AR[2], camoP());
  const arm = (o: number) => {
    const outer: FaceKey = o > 0 ? 'px' : 'nx', inner: FaceKey = o > 0 ? 'nx' : 'px', pc = o > 0 ? F.pocketDark : F.pocketTan;
    return merge([
      box(AR, [0, 0, 0], { all: armPlain, nz: armFront, py: armTop, ny: cm.gloveBottom, [inner]: armFront }),
      box([0.1, 0.52, 0.48], [o * 0.55, 0.5, 0], { all: A.px(24, 40, pocketP(pc)), [outer]: A.region(0.48, 0.52, pocketP(pc)) }),
      box([1.06, 0.24, 1.06], [0, -0.42, 0], { all: knitCuff }),
      box([1.04, 0.32, 1.04], [0, -0.72, 0], { all: cm.gloveCuff }),
    ]);
  };
  parts.armR = arm(1); parts.armL = arm(-1);

  // ── kaki: celana pendek loreng berlis marun, kulit bertato mawar, bot tinggi bertali; kiri: holster paha
  const LG = S(RIG.leg.size), shortsH = 0.24;
  const rose = (g: G, x: number, y: number, r: number) => {
    g.beginPath();
    for (let i = 0; i <= 40; i++) {
      const t = i / 40, a = t * Math.PI * 4.4, rr = r * (0.1 + 0.9 * t);
      const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr * 0.85;
      if (i) g.lineTo(px, py); else g.moveTo(px, py);
    }
    g.stroke();
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2 + 0.4;
      g.beginPath(); g.arc(x + Math.cos(a) * r * 0.82, y + Math.sin(a) * r * 0.72, r * 0.46, a - 1.25, a + 1.25); g.stroke();
    }
  };
  const leaf = (g: G, x: number, y: number, len: number, ang: number) => {
    g.save(); g.translate(x, y); g.rotate(ang);
    g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(len * 0.5, -len * 0.34, len, 0); g.quadraticCurveTo(len * 0.5, len * 0.34, 0, 0); g.fill(); g.stroke();
    g.beginPath(); g.moveTo(len * 0.1, 0); g.lineTo(len * 0.85, 0); g.stroke();
    g.restore();
  };
  /** Tato mawar garis cokelat muda: sulur, 2 mawar, daun. flip = cermin kiri/kanan. */
  const floral = (g: G, x: number, y: number, s: number, flip: number, rng: Rng) => {
    g.save(); g.strokeStyle = tat; g.fillStyle = 'rgba(150,95,65,0.12)'; g.lineWidth = 1; g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(x + flip * s * 0.05, y - s * 0.42);
    g.bezierCurveTo(x + flip * s * 0.36, y - s * 0.18, x - flip * s * 0.32, y + s * 0.12, x + flip * s * 0.08, y + s * 0.62); g.stroke();
    rose(g, x, y, s * 0.2); rose(g, x - flip * s * 0.2, y + s * 0.38, s * 0.14);
    for (let i = 0; i < 6; i++) leaf(g, x + flip * (rng() - 0.5) * s * 0.7, y + (rng() - 0.35) * s * 0.9, s * (0.12 + rng() * 0.08), rng() * Math.PI * 2);
    g.restore();
  };
  const legP = (tattoo: 'none' | 'front' | 'side', flip: number): Painter => (g, w, h, rng) => {
    skinFill(g, w, h, rng);
    const gr = g.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, 'rgba(0,0,0,0.06)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.05)'); gr.addColorStop(1, 'rgba(0,0,0,0.07)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(150,85,60,0.12)'; g.beginPath(); g.ellipse(w * 0.5, h * 0.56, w * 0.22, h * 0.035, 0, 0, Math.PI * 2); g.fill();   // lutut
    if (tattoo === 'front') floral(g, w * 0.5, h * 0.4, w * 0.62, flip, rng);
    if (tattoo === 'side') floral(g, w * 0.5, h * 0.42, w * 0.5, flip, rng);
    g.save(); g.beginPath(); g.rect(0, 0, w, h * shortsH); g.clip(); camoFab(g, w, h, rng); g.restore();
    g.fillStyle = maroon; g.fillRect(0, h * shortsH - 3, w, 3);                                            // lis marun ujung celana
    g.fillStyle = 'rgba(70,35,25,0.2)'; g.fillRect(0, h * shortsH, w, 3);
    shade(g, w, h, 0.04, 0.16); edge(g, w, h, 0.2);
  };
  const bootFront = A.px(88, 52, (g, w, h, rng) => {
    fill(g, w, h, '#191a1d'); grain(g, w, h, rng, 0.07);
    g.fillStyle = 'rgba(255,255,255,0.05)'; rrect(g, w * 0.3, 0, w * 0.4, h * 0.72, 4); g.fill();          // lidah sepatu
    g.strokeStyle = 'rgba(160,160,165,0.6)'; g.lineWidth = 1.4;
    for (let i = 0; i < 6; i++) {                                                                          // tali silang + mata ayam
      const y = h * (0.06 + i * 0.105);
      g.beginPath(); g.moveTo(w * 0.34, y); g.lineTo(w * 0.66, y + h * 0.08); g.moveTo(w * 0.66, y); g.lineTo(w * 0.34, y + h * 0.08); g.stroke();
      g.fillStyle = '#7d8086'; g.fillRect(w * 0.3, y, 2, 2); g.fillRect(w * 0.68, y, 2, 2);
    }
    g.fillStyle = 'rgba(255,255,255,0.06)'; rrect(g, w * 0.08, h * 0.74, w * 0.84, h * 0.24, 5); g.fill();
    shade(g, w, h, 0.1, 0.3); edge(g, w, h, 0.55);
  });
  const bootSide = A.px(92, 52, (g, w, h, rng) => {
    fill(g, w, h, '#191a1d'); grain(g, w, h, rng, 0.07); g.fillStyle = 'rgba(255,255,255,0.05)'; g.fillRect(0, 0, w, h * 0.1);
    stitch(g, 0, h * 0.72, w, h * 0.72, 'rgba(255,255,255,0.1)'); shade(g, w, h, 0.1, 0.3); edge(g, w, h, 0.55);
  });
  const bootTop = A.px(88, 10, (g, w, h, rng) => { fill(g, w, h, '#232428'); grain(g, w, h, rng, 0.06); edge(g, w, h, 0.5); });
  const sole = A.px(48, 16, (g, w, h) => { fill(g, w, h, '#0e0e0f'); g.fillStyle = 'rgba(255,255,255,0.08)'; for (let x = 2; x < w; x += 6) g.fillRect(x, 0, 2, h); });
  const holsterP = A.px(30, 46, (g, w, h, rng) => {
    fill(g, w, h, '#1c1d20'); grain(g, w, h, rng, 0.08);
    g.fillStyle = 'rgba(255,255,255,0.08)'; rrect(g, 2, 2, w - 4, h * 0.3, 3); g.fill();
    g.fillStyle = '#4a4d52'; g.fillRect(w * 0.35, h * 0.12, w * 0.3, h * 0.08);
    edge(g, w, h, 0.55);
  });
  const panelP = A.region(0.44, 0.66, (g, w, h, rng) => {
    fill(g, w, h, '#1a1b1e'); grain(g, w, h, rng, 0.08);
    for (let y = 6; y < h - 4; y += 10) { g.fillStyle = 'rgba(255,255,255,0.07)'; g.fillRect(3, y, w - 6, 4); }  // anyaman MOLLE
    edge(g, w, h, 0.5);
  });
  const legSide = A.region(LG[2], LG[1], legP('none', 1)), legBack = A.region(LG[0], LG[1], legP('none', 1)), legTop = A.region(LG[0], LG[2], camoP());
  const leg = (o: number) => {
    const flip = o > 0 ? 1 : -1;
    const faces: Faces = { all: legSide, nz: A.region(LG[0], LG[1], legP('front', flip)), pz: legBack, py: legTop, ny: sole };
    if (o > 0) faces.px = A.region(LG[2], LG[1], legP('side', flip));     // kanan: tato juga di sisi luar
    const l = [
      box(LG, [0, 0, 0], faces),
      box([1.08, 0.64, 1.14], [0, -0.58, -0.05], { all: bootSide, nz: bootFront, py: bootTop }),
      box([1.12, 0.1, 1.18], [0, -0.88, -0.06], { all: sole }),
    ];
    if (o < 0) l.push(   // holster paha kiri: tali dari sabuk, panel MOLLE, sarung pistol, 2 tali paha bergesper
      box([0.07, 0.42, 0.08], [-0.56, 0.68, 0], { all: strap }),
      box([0.1, 0.66, 0.44], [-0.585, 0.14, 0], { all: gearB, nx: panelP }),
      box([0.2, 0.5, 0.32], [-0.71, 0.08, -0.04], { all: gearB, nx: holsterP }),
      box([1.08, 0.08, 1.08], [0, 0.32, 0], { all: strap }), box([1.08, 0.08, 1.08], [0, 0, 0], { all: strap }),
      box([0.18, 0.11, 0.04], [-0.2, 0.32, -0.56], { all: cm.metalDark }), box([0.18, 0.11, 0.04], [-0.2, 0, -0.56], { all: cm.metalDark }),
    );
    return merge(l);
  };
  parts.legR = leg(1); parts.legL = leg(-1);

  chip.head = COL.skin; chip.upper = F.camo; chip.lower = F.camo; chip.armR = F.camo; chip.armL = F.camo; chip.legR = COL.skin; chip.legL = COL.skin;
}

// ───────────────────────────────────────── TIM MERAH (gerilyawan)
function buildRed(A: Atlas, fem: boolean, cm: Common, parts: Record<PartKey, THREE.BufferGeometry>, chip: Record<PartKey, number>) {
  const R = COL.red;
  const skin = css(COL.skin), hairC = fem ? R.hairF : R.hairM, hair = css(hairC);
  const tankC = fem ? R.tankF : R.tankM;
  const skinP: Painter = (g, w, h, rng) => { fill(g, w, h, skin); grain(g, w, h, rng, 0.03); shade(g, w, h, 0.08, 0.14); edge(g, w, h, 0.18); };
  const tankFab = (g: G, w: number, h: number, rng: Rng) => {
    if (fem) { fill(g, w, h, css(tankC)); grain(g, w, h, rng, 0.08, 1.5); }
    else camo(g, w, h, rng, css(tankC), [tone(tankC, 0.78), tone(tankC, 1.22), tone(tankC, 0.62)], 1.2);
  };
  const strapC = css(R.strap);
  const strap = A.px(64, 20, (g, w, h, rng) => { fill(g, w, h, strapC); grain(g, w, h, rng, 0.07); stitch(g, 0, 3, w, 3, 'rgba(255,255,255,0.15)'); stitch(g, 0, h - 3, w, h - 3, 'rgba(255,255,255,0.15)'); edge(g, w, h, 0.4); });
  const oliveFab = A.px(48, 48, (g, w, h, rng) => { fill(g, w, h, css(R.cap)); grain(g, w, h, rng, 0.08); shade(g, w, h, 0.1, 0.25); edge(g, w, h, 0.45); });
  const capCamo = (k: number): Painter => (g, w, h, rng) => {
    camo(g, w, h, rng, css(R.cap), [tone(R.cap, 0.8), tone(R.cap, 1.2), tone(R.cap, 0.65)], k);
    grain(g, w, h, rng, 0.05); shade(g, w, h, 0.12, 0.2); edge(g, w, h, 0.4);
  };
  const capSide = A.px(104, 32, capCamo(1));
  const capFront = A.px(104, 32, (g, w, h, rng) => {
    capCamo(1)(g, w, h, rng);
    g.fillStyle = 'rgba(0,0,0,0.45)'; for (const x of [0.12, 0.88]) { g.beginPath(); g.arc(w * x, h * 0.3, 2, 0, Math.PI * 2); g.fill(); } // lubang angin
    stitch(g, w / 2, 0, w / 2, h, 'rgba(0,0,0,0.3)');
  });
  const capTop = A.px(104, 104, capCamo(1.4));
  const visor = A.px(84, 34, (g, w, h, rng) => { fill(g, w, h, tone(R.cap, 0.72)); grain(g, w, h, rng, 0.07); stitch(g, 3, 3, w - 3, 3, 'rgba(255,255,255,0.15)'); edge(g, w, h, 0.45); });
  const sunglasses = A.px(166, 38, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    const lens = (cx: number) => {
      g.beginPath(); g.moveTo(cx - w * 0.2, h * 0.12); g.lineTo(cx + w * 0.2, h * 0.12);
      g.quadraticCurveTo(cx + w * 0.22, h * 0.85, cx + w * 0.04, h * 0.94); g.quadraticCurveTo(cx - w * 0.2, h * 0.9, cx - w * 0.2, h * 0.12); g.closePath();
    };
    for (const cx of [w * 0.27, w * 0.73]) {
      lens(cx); const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#3b3f3a'); gr.addColorStop(1, '#151715'); g.fillStyle = gr; g.fill();
      g.strokeStyle = '#a7a08a'; g.lineWidth = 1.6; g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.28)'; g.beginPath(); g.moveTo(cx - w * 0.15, h * 0.22); g.lineTo(cx - w * 0.05, h * 0.22); g.lineTo(cx - w * 0.11, h * 0.55); g.closePath(); g.fill();
    }
    g.strokeStyle = '#a7a08a'; g.lineWidth = 2; g.beginPath(); g.moveTo(w * 0.47, h * 0.2); g.lineTo(w * 0.53, h * 0.2); g.stroke(); // jembatan
  });
  const bandanaP: Painter = (g, w, h, rng) => {
    fill(g, w, h, css(R.bandana)); grain(g, w, h, rng, 0.05);
    g.strokeStyle = 'rgba(245,200,180,0.55)'; g.lineWidth = 1;
    for (let i = 0; i < (w * h) / 140; i++) {                                                          // motif paisley sederhana
      const x = rng() * w, y = rng() * h, r = 2 + rng() * 3;
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 1.5); g.stroke();
      g.fillStyle = 'rgba(245,200,180,0.5)'; g.fillRect(x + r + 1, y, 1.2, 1.2);
    }
    g.strokeStyle = 'rgba(0,0,0,0.18)'; g.lineWidth = 2;
    for (let i = 0; i < 3; i++) { const y = rng() * h; g.beginPath(); g.moveTo(0, y); g.quadraticCurveTo(w / 2, y + 6, w, y - 2); g.stroke(); } // lipatan
  };
  const bandana = A.px(96, 32, (g, w, h, rng) => { bandanaP(g, w, h, rng); edge(g, w, h, 0.3); });
  const bandanaFlap = A.region(1.0, 0.62, (g, w, h, rng) => {
    g.clearRect(0, 0, w, h);
    g.save(); g.beginPath(); g.moveTo(0, 0); g.lineTo(w, 0); g.lineTo(w * 0.5, h); g.closePath(); g.clip();
    bandanaP(g, w, h, rng);
    g.strokeStyle = 'rgba(250,215,195,0.8)'; g.lineWidth = 2; g.beginPath(); g.moveTo(w * 0.08, h * 0.04); g.lineTo(w * 0.92, h * 0.04); g.lineTo(w * 0.5, h * 0.9); g.closePath(); g.stroke();
    shade(g, w, h, 0.05, 0.2);
    g.restore();
  });
  const cartridges = (back: boolean): Painter => (g, w, h, rng) => {
    fill(g, w, h, strapC); grain(g, w, h, rng, 0.06);
    if (!back) {
      for (let x = 6; x < w - 6; x += 13) {                                                            // peluru kuningan tegak lurus sabuk
        const gr = g.createLinearGradient(x, 0, x + 8, 0); gr.addColorStop(0, '#8f6a2a'); gr.addColorStop(0.45, css(R.brass)); gr.addColorStop(1, '#7d5c22');
        g.fillStyle = gr; rrect(g, x, h * 0.08, 8, h * 0.84, 3); g.fill();
        g.fillStyle = '#6b4a1e'; rrect(g, x + 1, h * 0.04, 6, h * 0.22, 3); g.fill();                    // ujung proyektil
        g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(x - 1, h * 0.5, 10, h * 0.14);                    // tali pengikat
      }
    } else { stitch(g, 0, 4, w, 4, 'rgba(255,255,255,0.15)'); stitch(g, 0, h - 4, w, h - 4, 'rgba(255,255,255,0.15)'); }
    edge(g, w, h, 0.4);
  };
  const bandolier = A.px(368, 42, cartridges(false)), bandolierBack = A.px(184, 21, cartridges(true));
  const beltOlive = A.px(96, 24, (g, w, h, rng) => { fill(g, w, h, '#30352a'); grain(g, w, h, rng, 0.07); stitch(g, 0, 3, w, 3, 'rgba(255,255,255,0.14)'); stitch(g, 0, h - 3, w, h - 3, 'rgba(255,255,255,0.14)'); edge(g, w, h, 0.5); });
  const pouchOlive = A.px(36, 34, (g, w, h, rng) => {
    fill(g, w, h, tone(R.cap, 0.85)); grain(g, w, h, rng, 0.07);
    g.fillStyle = 'rgba(0,0,0,0.3)'; rrect(g, 1, 1, w - 2, h * 0.42, 4); g.fill();
    g.fillStyle = '#2b2f22'; g.beginPath(); g.arc(w / 2, h * 0.32, 2.5, 0, Math.PI * 2); g.fill();          // kancing
    shade(g, w, h, 0.1, 0.25); edge(g, w, h, 0.5);
  });
  const wrap = A.px(80, 30, (g, w, h, rng) => {
    fill(g, w, h, css(R.wrap)); grain(g, w, h, rng, 0.08);
    g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 1.5;
    for (let x = -h; x < w; x += 9) { g.beginPath(); g.moveTo(x, h); g.lineTo(x + h * 0.9, 0); g.stroke(); }  // lilitan kain
    shade(g, w, h, 0.1, 0.25); edge(g, w, h, 0.45);
  });
  const boot = css(R.boot);
  const bootP = (front: boolean): Painter => (g, w, h, rng) => {
    fill(g, w, h, boot); grain(g, w, h, rng, 0.07);
    if (front) {
      g.strokeStyle = '#2e1d12'; g.lineWidth = 1.6;
      for (let i = 0; i < 4; i++) { const y = h * (0.1 + i * 0.13); g.beginPath(); g.moveTo(w * 0.36, y); g.lineTo(w * 0.64, y + h * 0.1); g.moveTo(w * 0.64, y); g.lineTo(w * 0.36, y + h * 0.1); g.stroke(); }
      g.fillStyle = 'rgba(0,0,0,0.12)'; rrect(g, w * 0.08, h * 0.68, w * 0.84, h * 0.3, 6); g.fill();
    } else stitch(g, 0, h * 0.7, w, h * 0.7, 'rgba(0,0,0,0.3)');
    shade(g, w, h, 0.1, 0.3); edge(g, w, h, 0.5);
  };
  const bootFront = A.px(88, 44, bootP(true)), bootSide = A.px(88, 44, bootP(false));
  const sole = A.px(48, 16, (g, w, h) => { fill(g, w, h, '#2a1c13'); g.fillStyle = 'rgba(255,255,255,0.06)'; for (let x = 2; x < w; x += 6) g.fillRect(x, 0, 2, h); });
  const holster = A.px(32, 52, (g, w, h, rng) => {
    fill(g, w, h, '#2c3026'); grain(g, w, h, rng, 0.08);
    g.fillStyle = 'rgba(255,255,255,0.07)'; rrect(g, 2, 2, w - 4, h * 0.3, 3); g.fill();
    edge(g, w, h, 0.55);
  });
  const hairSw = A.px(32, 48, (g, w, h, rng) => {
    fill(g, w, h, hair);
    for (let i = 0; i < 26; i++) { g.strokeStyle = rng() < 0.5 ? 'rgba(0,0,0,0.25)' : 'rgba(255,220,190,0.12)'; g.lineWidth = 1; const x = rng() * w; g.beginPath(); g.moveTo(x, 0); g.lineTo(x + (rng() - 0.5) * 6, h); g.stroke(); }
    edge(g, w, h, 0.3);
  });

  // ── kepala: wajah (senyum; pria brewok, wanita bibir), rambut, topi, kacamata hitam
  const hairStrands = (g: G, x: number, y: number, w: number, h: number, rng: Rng) => {
    g.fillStyle = hair; g.fillRect(x, y, w, h);
    for (let i = 0; i < (w * h) / 30; i++) { g.strokeStyle = rng() < 0.5 ? 'rgba(0,0,0,0.25)' : 'rgba(255,220,190,0.1)'; g.lineWidth = 1; const sx = x + rng() * w; g.beginPath(); g.moveTo(sx, y); g.lineTo(sx + (rng() - 0.5) * 4, y + h); g.stroke(); }
  };
  const faceP: Painter = (g, w, h, rng) => {
    fill(g, w, h, skin);
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(120,60,30,0.16)'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    if (fem) { hairStrands(g, 0, 0, w, h * 0.2, rng); hairStrands(g, 0, 0, w * 0.13, h * 0.62, rng); hairStrands(g, w * 0.87, 0, w * 0.13, h * 0.62, rng); }
    else { hairStrands(g, 0, 0, w, h * 0.18, rng); hairStrands(g, 0, h * 0.18, w * 0.07, h * 0.22, rng); hairStrands(g, w * 0.93, h * 0.18, w * 0.07, h * 0.22, rng); }
    if (!fem) { // brewok tipis di rahang & dagu
      for (let i = 0; i < 260; i++) {
        const x = w * (0.1 + rng() * 0.8), y = h * (0.6 + rng() * 0.38);
        const inMouth = x > w * 0.34 && x < w * 0.7 && y > h * 0.68 && y < h * 0.8;
        if (!inMouth) { g.fillStyle = `rgba(70,45,30,${0.25 + rng() * 0.25})`; g.fillRect(x, y, 1.4, 1.4); }
      }
    }
    g.strokeStyle = '#2b1a14'; g.lineWidth = 2.6; g.lineCap = 'round';                                   // senyum miring khas
    g.beginPath(); g.moveTo(w * 0.36, h * 0.72); g.quadraticCurveTo(w * 0.52, h * 0.81, w * 0.68, h * 0.67); g.stroke();
    if (fem) { g.fillStyle = 'rgba(176,72,72,0.75)'; g.beginPath(); g.moveTo(w * 0.38, h * 0.725); g.quadraticCurveTo(w * 0.53, h * 0.84, w * 0.66, h * 0.69); g.quadraticCurveTo(w * 0.53, h * 0.77, w * 0.38, h * 0.725); g.fill(); }
    edge(g, w, h, 0.18);
  };
  const headSideP = (backLeft: boolean): Painter => (g, w, h, rng) => {
    fill(g, w, h, skin); shade(g, w, h, 0.05, 0.12);
    g.fillStyle = 'rgba(150,80,50,0.25)'; rrect(g, w * 0.42, h * 0.38, w * 0.16, h * 0.22, 3); g.fill();  // telinga
    hairStrands(g, 0, 0, w, h * 0.3, rng);
    const bx = backLeft ? 0 : w * (fem ? 0.5 : 0.7), bw = w * (fem ? 0.5 : 0.3);
    hairStrands(g, bx, 0, bw, h * (fem ? 0.9 : 0.55), rng);
    const fx = backLeft ? w * 0.9 : 0; hairStrands(g, fx, h * 0.3, w * 0.1, h * (fem ? 0.35 : 0.2), rng);  // cambang
    edge(g, w, h, 0.18);
  };
  const headBackP: Painter = (g, w, h, rng) => { fill(g, w, h, skin); hairStrands(g, 0, 0, w, h * (fem ? 1 : 0.58), rng); edge(g, w, h, 0.2); };
  const H = S(RIG.head.size);
  const head = [
    box(H, [0, 0, 0], {
      nz: A.region(H[0], H[1], faceP), pz: A.region(H[0], H[1], headBackP),
      px: A.region(H[2], H[1], headSideP(true)), nx: A.region(H[2], H[1], headSideP(false)),
      py: A.region(H[0], H[2], (g, w, h, rng) => hairStrands(g, 0, 0, w, h, rng)), ny: A.region(H[0], H[2], skinP),
    }),
    box([1.3, 0.38, 1.3], [0, 0.47, 0.01], { all: capSide, nz: capFront, py: capTop }),
    box([1.06, 0.06, 0.42], [0, 0.3, -0.8], { all: visor }, [-0.14, 0, 0]),
    box([1.04, 0.24, 0.05], [0, 0.08, -0.63], { all: cm.T, nz: sunglasses, px: cm.metal, nx: cm.metal }),
    box([0.04, 0.04, 0.82], [0.61, 0.13, -0.22], { all: cm.metal }), box([0.04, 0.04, 0.82], [-0.61, 0.13, -0.22], { all: cm.metal }),
  ];
  if (fem) head.push(box([0.34, 0.5, 0.26], [0.08, -0.08, 0.72], { all: hairSw }), box([0.28, 0.55, 0.22], [0.14, -0.55, 0.79], { all: hairSw }));
  parts.head = merge(head);

  // ── badan atas: tank top + kulit bahu, bandana, sabuk peluru selempang (bahu kanan → pinggul kiri)
  const U = S(RIG.upper.size);
  const tankFront: Painter = (g, w, h, rng) => {
    fill(g, w, h, skin);
    g.save(); g.beginPath();
    g.moveTo(w * 0.16, 0); g.lineTo(w * 0.32, 0); g.quadraticCurveTo(w * 0.5, h * (fem ? 0.6 : 0.5), w * 0.68, 0); g.lineTo(w * 0.84, 0);
    g.quadraticCurveTo(w * 0.86, h * 0.3, w, h * 0.38); g.lineTo(w, h); g.lineTo(0, h); g.lineTo(0, h * 0.38); g.quadraticCurveTo(w * 0.14, h * 0.3, w * 0.16, 0);
    g.closePath(); g.clip(); tankFab(g, w, h, rng); shade(g, w, h, 0.06, 0.2); g.restore();
    edge(g, w, h, 0.22);
  };
  const tankBack: Painter = (g, w, h, rng) => {
    fill(g, w, h, skin);
    g.save(); g.beginPath(); g.moveTo(w * 0.16, 0); g.lineTo(w * 0.32, 0); g.lineTo(w * 0.32, h * 0.18); g.lineTo(w * 0.68, h * 0.18); g.lineTo(w * 0.68, 0);
    g.lineTo(w * 0.84, 0); g.quadraticCurveTo(w * 0.86, h * 0.3, w, h * 0.38); g.lineTo(w, h); g.lineTo(0, h); g.lineTo(0, h * 0.38); g.quadraticCurveTo(w * 0.14, h * 0.3, w * 0.16, 0);
    g.closePath(); g.clip(); tankFab(g, w, h, rng); shade(g, w, h, 0.06, 0.2); g.restore();
    edge(g, w, h, 0.22);
  };
  const tankSide: Painter = (g, w, h, rng) => {
    fill(g, w, h, skin);
    g.save(); g.beginPath(); g.moveTo(0, h * 0.38); g.quadraticCurveTo(w * 0.5, h * 0.48, w, h * 0.38); g.lineTo(w, h); g.lineTo(0, h); g.closePath(); g.clip();
    tankFab(g, w, h, rng); shade(g, w, h, 0.06, 0.2); g.restore(); edge(g, w, h, 0.22);
  };
  const tankTop: Painter = (g, w, h, rng) => {
    fill(g, w, h, skin); grain(g, w, h, rng, 0.03);
    g.save(); g.beginPath(); g.rect(w * 0.16, 0, w * 0.16, h); g.rect(w * 0.68, 0, w * 0.16, h); g.clip(); tankFab(g, w, h, rng); g.restore();
    edge(g, w, h, 0.2);
  };
  const tankBottom: Painter = (g, w, h, rng) => { tankFab(g, w, h, rng); edge(g, w, h, 0.25); };
  const knotX = fem ? -1 : 1;
  parts.upper = merge([
    box(U, [0, 0, 0], {
      nz: A.region(U[0], U[1], tankFront), pz: A.region(U[0], U[1], tankBack), all: A.region(U[2], U[1], tankSide),
      py: A.region(U[0], U[2], tankTop), ny: A.region(U[0], U[2], tankBottom),
    }),
    box([1.24, 0.24, 1.1], [0, 0.58, 0.02], { all: bandana }),
    box([1.0, 0.62, 0.06], [0, 0.25, -0.55], { all: cm.T, nz: bandanaFlap, py: bandana }),
    box([0.22, 0.2, 0.22], [knotX * 0.64, 0.5, -0.32], { all: bandana }),
    box([0.26, 0.1, 0.06], [knotX * 0.8, 0.45, -0.38], { all: bandana }, [0, 0, -0.6 * knotX]),
    box([2.3, 0.26, 0.08], [0.02, -0.04, -0.545], { all: strap, nz: bandolier }, [0, 0, 0.62]),
    box([2.3, 0.26, 0.08], [0.02, -0.04, 0.545], { all: strap, pz: bandolierBack }, [0, 0, 0.62]),
    box([0.34, 0.08, 1.12], [0.86, 0.63, 0], { all: strap }),
  ]);

  // ── badan bawah: ujung tank top (pria) / perut terbuka (wanita) + sabuk + jins
  const L = S(RIG.lower.size);
  const denim = (g: G, w: number, h: number, rng: Rng) => {
    fill(g, w, h, css(R.jeans));
    g.strokeStyle = 'rgba(255,255,255,0.05)'; g.lineWidth = 1;
    for (let x = -h; x < w; x += 3) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x + h, h); g.stroke(); }    // serat twill
    grain(g, w, h, rng, 0.05, 1.5);
  };
  const lowerP = (front: boolean, back: boolean): Painter => (g, w, h, rng) => {
    denim(g, w, h, rng);
    if (fem) { g.fillStyle = skin; g.fillRect(0, 0, w, h * 0.2); } else { g.save(); g.beginPath(); g.rect(0, 0, w, h * 0.2); g.clip(); tankFab(g, w, h, rng); g.restore(); }
    if (front) {
      g.strokeStyle = 'rgba(230,190,120,0.6)'; g.lineWidth = 1.2; g.setLineDash([2, 2]);
      g.beginPath(); g.moveTo(w * 0.52, h * 0.45); g.lineTo(w * 0.52, h * 0.85); g.quadraticCurveTo(w * 0.52, h * 0.95, w * 0.45, h * 0.95); g.stroke();   // jahitan resleting
      g.beginPath(); g.arc(w * 0.12, h * 0.42, w * 0.13, 0, Math.PI / 2); g.stroke(); g.beginPath(); g.arc(w * 0.88, h * 0.42, w * 0.13, Math.PI / 2, Math.PI); g.stroke();
      g.setLineDash([]); g.fillStyle = css(R.brass); for (const x of [0.22, 0.78]) { g.beginPath(); g.arc(w * x, h * 0.45, 1.8, 0, Math.PI * 2); g.fill(); }
    }
    if (back) { g.strokeStyle = 'rgba(230,190,120,0.55)'; g.lineWidth = 1.2; g.setLineDash([2, 2]); g.strokeRect(w * 0.15, h * 0.48, w * 0.22, h * 0.4); g.strokeRect(w * 0.63, h * 0.48, w * 0.22, h * 0.4); g.setLineDash([]); }
    shade(g, w, h, 0.05, 0.2); edge(g, w, h, 0.3);
  };
  const jeansEnd = A.region(L[0], L[2], (g, w, h, rng) => { denim(g, w, h, rng); edge(g, w, h, 0.3); });
  parts.lower = merge([
    box(L, [0, 0, 0], { all: A.region(L[2], L[1], lowerP(false, false)), nz: A.region(L[0], L[1], lowerP(true, false)), pz: A.region(L[0], L[1], lowerP(false, true)),
      py: A.region(L[0], L[2], fem ? skinP : tankBottom), ny: jeansEnd }),
    box([2.08, 0.2, 1.08], [0, 0.16, 0], { all: beltOlive }),
    box([0.26, 0.14, 0.06], [0, 0.16, -0.56], { all: cm.metal }),
    box([0.2, 0.24, 0.2], [0.5, -0.04, -0.62], { all: cm.grenade }), box([0.08, 0.08, 0.08], [0.5, 0.12, -0.62], { all: cm.metal }),
    box([0.34, 0.32, 0.18], [-0.56, 0, -0.6], { all: oliveFab, nz: pouchOlive }),
    box([0.2, 0.3, 0.3], [1.0, 0, -0.1], { all: oliveFab, px: pouchOlive }),
  ]);

  // ── lengan: kulit (tato ular di lengan kanan), balutan kain, sarung tangan tanpa jari
  const AR = S(RIG.arm.size);
  const snake = (g: G, cx: number, top: number, len: number, s: number) => {
    g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
    const path = () => { g.beginPath(); for (let i = 0; i <= 30; i++) { const t = i / 30; const x = cx + Math.sin(t * Math.PI * 3.2) * s * 0.32, y = top + len - t * len; if (i === 0) g.moveTo(x, y); else g.lineTo(x, y); } };
    g.strokeStyle = 'rgba(32,30,34,0.85)'; g.lineWidth = s * 0.14; path(); g.stroke();
    g.strokeStyle = 'rgba(232,181,142,0.95)'; g.lineWidth = s * 0.05; path(); g.stroke();
    const hx = cx + Math.sin(Math.PI * 3.2) * s * 0.32;
    g.fillStyle = 'rgba(32,30,34,0.9)'; g.beginPath(); g.ellipse(hx, top - s * 0.04, s * 0.15, s * 0.1, -0.5, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(32,30,34,0.9)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(hx + s * 0.12, top - s * 0.1); g.lineTo(hx + s * 0.24, top - s * 0.18);
    g.moveTo(hx + s * 0.2, top - s * 0.14); g.lineTo(hx + s * 0.27, top - s * 0.1); g.stroke();
    g.restore();
  };
  const armP = (tattoo: boolean, withFingers: boolean): Painter => (g, w, h, rng) => {
    fill(g, w, h, skin); grain(g, w, h, rng, 0.025);
    const gr = g.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, 'rgba(0,0,0,0.06)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.04)'); gr.addColorStop(1, 'rgba(0,0,0,0.08)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    if (tattoo) snake(g, w * 0.5, h * 0.12, h * 0.32, w * 0.8);
    g.fillStyle = css(COL.glove); g.fillRect(0, h * 0.9, w, h * 0.1);
    if (withFingers) fingers(g, w, h * 0.93, h * 0.07);
    shade(g, w, h, 0.06, 0.12); edge(g, w, h, 0.16);
  };
  const armTop = A.region(AR[0], AR[2], skinP);
  const arm = (o: number) => {
    const tattoo = o > 0;   // tato ular di lengan kanan (sisi depan & luar)
    const inner: FaceKey = o > 0 ? 'nx' : 'px', outer: FaceKey = o > 0 ? 'px' : 'nx';
    const front = A.region(AR[0], AR[1], armP(tattoo, true)), plain = A.region(AR[0], AR[1], armP(false, false));
    const faces: Faces = { all: plain, nz: front, py: armTop, ny: cm.gloveBottom, [inner]: A.region(AR[2], AR[1], armP(false, true)) };
    if (tattoo) faces[outer] = A.region(AR[2], AR[1], armP(true, false));
    return merge([
      box(AR, [0, 0, 0], faces),
      box([1.06, 0.36, 1.06], [0, -0.38, 0], { all: wrap }),
      box([1.04, 0.3, 1.04], [0, -0.72, 0], { all: cm.gloveCuff }),
    ]);
  };
  parts.armR = arm(1); parts.armL = arm(-1);

  // ── kaki: jins sobek, sepatu bot cokelat; kanan: holster paha
  const LG = S(RIG.leg.size);
  /** Sobekan jins: lubang bergerigi memanjang (kulit terlihat), tepi berbulu tipis, benang putih melintang. */
  const rip = (g: G, x: number, y: number, rw: number, rh: number, rng: Rng) => {
    const jag = (sx: number, sy: number) => {
      g.beginPath();
      for (let i = 0; i <= 14; i++) {
        const a = (i / 14) * Math.PI * 2, k = 0.7 + rng() * 0.45;
        const px = x + Math.cos(a) * rw * sx * k, py = y + Math.sin(a) * rh * sy * k;
        if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
      }
      g.closePath();
    };
    g.fillStyle = 'rgba(214,206,190,0.75)'; jag(1, 1.15); g.fill();                                   // tepi berbulu
    g.fillStyle = skin; jag(0.86, 0.8); g.fill();                                                     // kulit
    g.fillStyle = 'rgba(90,50,30,0.25)'; g.fillRect(x - rw * 0.7, y - rh * 0.75, rw * 1.4, rh * 0.4);   // bayang tepi atas
    g.strokeStyle = 'rgba(248,244,236,0.95)'; g.lineWidth = 1;
    for (let i = 0; i < 3; i++) {                                                                      // benang melintang
      const yy = y - rh * 0.35 + i * rh * 0.35;
      g.beginPath(); g.moveTo(x - rw * 0.85, yy + (rng() - 0.5) * 1.5);
      g.quadraticCurveTo(x, yy + (rng() - 0.3) * 2.5, x + rw * 0.85, yy + (rng() - 0.5) * 1.5); g.stroke();
    }
  };
  const legP = (side: boolean, rips: [number, number][]): Painter => (g, w, h, rng) => {
    denim(g, w, h, rng);
    const gr = g.createRadialGradient(w * 0.5, h * 0.35, 2, w * 0.5, h * 0.35, w * 0.7);                   // pudar di paha
    gr.addColorStop(0, 'rgba(255,255,255,0.14)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    if (side) stitch(g, w / 2, 0, w / 2, h, 'rgba(230,190,120,0.5)');
    for (const [rx, ry] of rips) rip(g, w * rx, h * ry, w * 0.19, h * 0.032, rng);
    shade(g, w, h, 0.04, 0.2); edge(g, w, h, 0.3);
  };
  const legSide = A.region(LG[2], LG[1], legP(true, [])), legBack = A.region(LG[0], LG[1], legP(false, [])), legEnd = A.region(LG[0], LG[2], legP(false, []));
  const leg = (o: number) => {
    const front = A.region(LG[0], LG[1], legP(false, o > 0 ? [[0.42, 0.42], [0.55, 0.6]] : [[0.5, 0.3], [0.45, 0.47], [0.58, 0.58]]));
    const l = [
      box(LG, [0, 0, 0], { all: legSide, nz: front, pz: legBack, py: legEnd, ny: legEnd }),
      box([1.08, 0.52, 1.14], [0, -0.64, -0.05], { all: bootSide, nz: bootFront }),
      box([1.1, 0.08, 1.16], [0, -0.87, -0.05], { all: sole }),
    ];
    if (o > 0) l.push(
      box([0.24, 0.62, 0.38], [0.6, 0.38, -0.02], { all: oliveFab, px: holster }),
      box([1.06, 0.08, 1.06], [0, 0.5, 0], { all: strap }), box([1.06, 0.08, 1.06], [0, 0.22, 0], { all: strap }),
      box([0.12, 0.1, 0.04], [0.1, 0.5, -0.55], { all: cm.metalDark }), box([0.12, 0.1, 0.04], [0.1, 0.22, -0.55], { all: cm.metalDark }),
    );
    return merge(l);
  };
  parts.legR = leg(1); parts.legL = leg(-1);

  chip.head = COL.skin; chip.upper = tankC; chip.lower = R.jeans; chip.armR = COL.skin; chip.armL = COL.skin; chip.legR = R.jeans; chip.legL = R.jeans;
}

// ───────────────────────────────────────── API
const CACHE = new Map<string, CharArt>();

/** Tampilan (atlas + geometri per bagian) untuk tim & varian — dibuat sekali, dipakai bersama semua karakter. */
export function characterArt(team: Team, variant: Variant): CharArt {
  // Venny: tampilan = model realistis (venny/rig.ts); balok tersembunyi & serpihan memakai atlas wanita
  if (variant === 'v') return characterArt(team, 'f');
  const key = team + variant;
  let art = CACHE.get(key);
  if (art) return art;
  const fem = variant === 'f';
  const A = new Atlas(makeRng(team === 'blue' ? (fem ? 1102 : 1101) : (fem ? 2202 : 2201)));
  const cm = commonSwatches(A);
  const parts = {} as Record<PartKey, THREE.BufferGeometry>, chip = {} as Record<PartKey, number>;
  if (team === 'blue') { if (fem) buildBlueFemale(A, cm, parts, chip); else buildBlue(A, cm, parts, chip); }
  else buildRed(A, fem, cm, parts, chip);
  const texture = new THREE.CanvasTexture(A.canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter; texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.anisotropy = 4;
  art = { texture, parts, chip, debrisMat: new THREE.MeshLambertMaterial({ map: texture, alphaTest: 0.5 }) };
  CACHE.set(key, art);
  return art;
}

/** Varian bot: campuran pria/wanita yang stabil per indeks (Venny hanya dipilih pemain). */
export const botVariant = (i: number): Variant => (i % 2 === 0 ? 'm' : 'f');

let sleeveCamo: THREE.CanvasTexture | null = null, sleevePlain: THREE.CanvasTexture | null = null;
/** Lengan FPS: loreng biru yang bisa diulang (Biru wanita) atau putih polos (warna dari material) — keduanya punya map agar
 *  program shader sama (ganti kostum saat killcam tidak memicu kompilasi). */
export function sleeveTexture(camoOn: boolean): THREE.CanvasTexture {
  if (!camoOn) {
    if (!sleevePlain) {
      const c = document.createElement('canvas'); c.width = c.height = 4;
      const g = c.getContext('2d')!; g.fillStyle = '#fff'; g.fillRect(0, 0, 4, 4);
      sleevePlain = new THREE.CanvasTexture(c); sleevePlain.colorSpace = THREE.SRGBColorSpace;
    }
    return sleevePlain;
  }
  if (sleeveCamo) return sleeveCamo;
  const N = 128, c = document.createElement('canvas'); c.width = c.height = N;
  const g = c.getContext('2d')!, rng = makeRng(1103), F = COL.blueF;
  const cols = [css(F.camoLight), css(F.camoNavy), css(F.camoDark), css(F.camoLight), css(F.camoDark), css(F.camoNavy)];
  fill(g, N, N, css(F.camo));
  for (let i = 0; i < 44; i++) {
    const pts = blobPts(rng() * N, rng() * N, 7 + rng() * 12, rng);
    g.fillStyle = cols[i % cols.length];
    for (const ox of [-N, 0, N]) for (const oy of [-N, 0, N]) fillSmooth(g, pts, ox, oy);   // gambar ulang di tepi → tanpa sambungan
  }
  grain(g, N, N, rng, 0.035, 1.5);
  sleeveCamo = new THREE.CanvasTexture(c);
  sleeveCamo.wrapS = sleeveCamo.wrapT = THREE.RepeatWrapping; sleeveCamo.colorSpace = THREE.SRGBColorSpace; sleeveCamo.anisotropy = 4;
  return sleeveCamo;
}
