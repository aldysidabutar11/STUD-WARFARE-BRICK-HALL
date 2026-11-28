// src/entities/skins/spectre.ts — SPECTRE (acuan Karakter/SPECTRE.png): tudung loreng bersegi, balaclava hitam dengan celah kulit di
// mata, NVG 3 tabung dengan lensa hijau MENYALA; selendang ghillie jaring berlubang di bahu + jubah ghillie robek sampai lutut, syal;
// rompi hitam MOLLE + sabuk peluru kuningan diagonal + 2 kantong; lengan bawah kulit berbalut perban cokelat, sarung tangan tanpa jari;
// celana loreng gelap bersegi, tali paha bergesper, pelindung lutut, sepatu bot hitam.
import { box, css, edge, fill, grain, merge, shade, S, RIG, type Atlas, type Common, type Painter } from '../charKit';
import {
  SKIN_FINGER, bootFront, bootSide, buckle, bullets, cloth, fab, hand, knee, molle, net, plate, polyCamo, pouch, sole, strap,
  type Rect, type SkinBuild, type SkinDef,
} from './kit';

const C = { camo: 0x4a5244, camoD: 0x2c3229, camoL: 0x667059, black: 0x1b1d1b, coal: 0x2a2d29, wrap: 0x6a6450, skin: 0xd9ad83,
  glow: 0x7dff6a };

const camo = (density = 1): Painter => polyCamo(C.camo, [C.camoD, C.camoL, 0x3a4136], density, 1);

function build(A: Atlas, _cm: Common): SkinBuild {
  const camoR = A.px(64, 64, camo()), blackP = A.px(40, 40, plate(C.coal, { scratch: 2 })), blackS = A.px(64, 24, strap(C.black));
  const netP = net(C.camo, [C.camoD, C.camoL, 0x59614d], 0.5);
  const nvg = A.pxGlow(96, 40, (g, w, h, rng) => {
    fill(g, w, h, '#151615'); grain(g, w, h, rng, 0.05);
    for (const [x, y] of [[0.28, 0.62], [0.72, 0.62], [0.5, 0.32]] as const) {
      g.fillStyle = '#2b2d2b'; g.beginPath(); g.arc(w * x, h * y, h * 0.3, 0, Math.PI * 2); g.fill();
      const gr = g.createRadialGradient(w * x, h * y, 1, w * x, h * y, h * 0.22); gr.addColorStop(0, '#e8ffd8'); gr.addColorStop(0.5, css(C.glow)); gr.addColorStop(1, '#1d6a19');
      g.fillStyle = gr; g.beginPath(); g.arc(w * x, h * y, h * 0.22, 0, Math.PI * 2); g.fill();
    }
    edge(g, w, h, 0.5);
  }, (g, w, h) => { g.fillStyle = '#fff'; for (const [x, y] of [[0.28, 0.62], [0.72, 0.62], [0.5, 0.32]] as const) { g.beginPath(); g.arc(w * x, h * y, h * 0.22, 0, Math.PI * 2); g.fill(); } });

  // ── kepala: balaclava (celah kulit di mata), tudung loreng, NVG 3 lensa + dudukan
  const H = S(RIG.head.size);
  const faceF = A.region(H[0], H[1], (g, w, h, rng) => {
    fill(g, w, h, css(C.black)); grain(g, w, h, rng, 0.05);
    g.fillStyle = css(C.skin); g.fillRect(w * 0.12, h * 0.3, w * 0.76, h * 0.2);                                         // celah mata
    g.fillStyle = 'rgba(255,255,255,0.05)'; for (let y = h * 0.6; y < h; y += 5) g.fillRect(0, y, w, 1.5);              // rajutan
    shade(g, w, h, 0.05, 0.22); edge(g, w, h, 0.4);
  });
  const hood = A.px(64, 64, camo(1.1)), hoodRim = A.px(64, 16, camo(1.4));
  const head = merge([
    box(H, [0, 0, 0], { all: A.region(H[0], H[1], fab(C.black, 0.4)), nz: faceF }),
    box([1.38, 0.34, 1.4], [0, 0.52, 0.04], { all: hood }),
    box([0.12, 1.08, 1.32], [0.69, 0.0, 0.06], { all: hood }), box([0.12, 1.08, 1.32], [-0.69, 0.0, 0.06], { all: hood }),
    box([1.38, 1.12, 0.12], [0, -0.02, 0.7], { all: hood }),
    box([1.38, 0.12, 0.2], [0, 0.42, -0.62], { all: hoodRim }),
    box([0.92, 0.3, 0.32], [0, 0.2, -0.78], { all: blackP, nz: nvg }),
    box([0.3, 0.2, 0.2], [0, 0.4, -0.66], { all: blackP }),
  ]);

  // ── badan atas: jaket loreng, syal, selendang ghillie (jaring), jubah ghillie robek, rompi MOLLE, sabuk peluru diagonal, 2 kantong
  const U = S(RIG.upper.size);
  const shawl = A.px(128, 48, netP), capeR = A.region(2.2, 2.4, net(C.camo, [C.camoD, C.camoL], 0.45, 0.16));
  const scarf = A.px(96, 24, cloth(C.camoD, 0, 4, 0.25));
  const upper = merge([
    box(U, [0, 0, 0], { all: camoR }),
    box([1.36, 0.98, 0.14], [0, -0.06, -0.56], { all: A.px(104, 76, molle(C.black)) }),
    box([2.2, 0.26, 0.1], [0.04, 0.02, -0.66], { all: blackS, nz: A.px(160, 20, bullets(0x2a2b25)) }, [0, 0, 0.6]),
    box([0.3, 0.34, 0.14], [-0.4, -0.34, -0.7], { all: A.px(32, 40, pouch(C.black, C.coal)) }), box([0.3, 0.34, 0.14], [0.36, -0.34, -0.7], { all: A.px(32, 40, pouch(C.black, C.coal)) }),
    box([1.42, 0.3, 1.2], [0, 0.66, 0.05], { all: scarf }),
    box([2.34, 0.46, 1.34], [0, 0.44, 0.05], { all: shawl }),
    box([2.2, 2.4, 0.08], [0, -0.72, 0.66], { all: capeR }, [0.07, 0, 0]),
  ]);

  // ── badan bawah: celana loreng, sabuk hitam + gesper, kantong
  const L = S(RIG.lower.size);
  const lower = merge([
    box(L, [0, 0, 0], { all: camoR }),
    box([2.08, 0.2, 1.08], [0, 0.2, 0], { all: blackS }),
    box([0.32, 0.18, 0.06], [0, 0.2, -0.56], { all: A.px(32, 20, buckle(0x2f312d, C.black)) }),
    box([0.28, 0.32, 0.24], [0.82, 0.0, -0.4], { all: A.px(32, 40, pouch(C.coal)) }),
  ]);

  // ── lengan: selendang jaring di bahu, lengan atas loreng, lengan bawah kulit berbalut perban, sarung tangan tanpa jari
  const AR = S(RIG.arm.size);
  const sleeve = A.region(AR[0], AR[1], (g, w, h, rng) => {
    camo()(g, w, h, rng);
    g.fillStyle = css(C.skin); g.fillRect(0, h * 0.55, w, h * 0.45);                                                      // lengan bawah kulit
    g.strokeStyle = css(C.wrap); g.lineWidth = 5;
    for (let y = h * 0.58; y < h; y += 9) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y + 5); g.stroke(); }                // perban
    g.strokeStyle = 'rgba(0,0,0,0.2)'; g.lineWidth = 1; for (let y = h * 0.58; y < h; y += 9) { g.beginPath(); g.moveTo(0, y + 2.5); g.lineTo(w, y + 7.5); g.stroke(); }
    edge(g, w, h, 0.3);
  });
  const armNet = A.px(64, 32, net(C.camo, [C.camoD, C.camoL], 0.45, 0.25));
  const hd = hand(A, C.black, SKIN_FINGER, { knuckle: 0x2a2b28, fingerless: true });
  const arm = (o: 1 | -1, band: Rect) => merge([
    box(AR, [0, 0, 0], { all: sleeve, py: camoR, ny: hd.bottom }),
    box([1.22, 0.42, 1.22], [o * 0.05, 0.84, 0], { all: armNet }),
    box([1.07, 0.2, 1.07], [0, 0.32, 0], { all: band }),
    box([1.06, 0.42, 1.06], [0, -0.81, 0], { all: hd.side, nz: hd.front, ny: hd.bottom }),
  ]);

  // ── kaki: celana loreng, 2 tali paha bergesper, pelindung lutut, sepatu bot hitam
  const LG = S(RIG.leg.size);
  const legR = A.region(LG[0], LG[1], camo()), legS = A.region(LG[2], LG[1], camo());
  const kneeP = A.px(64, 44, knee(0x2b2e2a)), buckleB = A.px(28, 20, buckle(0x2f312d, C.black));
  const bootF = A.px(88, 44, bootFront(0x1d1f1d, 0x55584f)), bootS = A.px(88, 44, bootSide(0x1d1f1d)), soleR = A.px(48, 16, sole());
  const leg = (o: 1 | -1) => merge([
    box(LG, [0, 0, 0], { all: legS, nz: legR, pz: legR, ny: soleR }),
    box([1.06, 0.1, 1.06], [0, 0.46, 0], { all: blackS }), box([1.06, 0.1, 1.06], [0, 0.22, 0], { all: blackS }),
    box([0.22, 0.14, 0.05], [o * 0.14, 0.46, -0.55], { all: buckleB }), box([0.22, 0.14, 0.05], [o * 0.14, 0.22, -0.55], { all: buckleB }),
    box([0.82, 0.52, 0.13], [0, -0.06, -0.57], { all: blackP, nz: kneeP }),
    box([1.08, 0.52, 1.14], [0, -0.64, -0.05], { all: bootS, nz: bootF }),
    box([1.1, 0.08, 1.16], [0, -0.87, -0.05], { all: soleR }),
  ]);

  return {
    head, upper, lower, legR: leg(1), legL: leg(-1), arm,
    chip: { head: C.camo, upper: C.camo, lower: C.camoD, armR: C.camo, armL: C.camo, legR: C.camoD, legL: C.camoD },
  };
}

export const SPECTRE: SkinDef = { seed: 3106, fps: { sleeve: C.camo, cuff: C.wrap, glove: C.black, finger: SKIN_FINGER }, build };
