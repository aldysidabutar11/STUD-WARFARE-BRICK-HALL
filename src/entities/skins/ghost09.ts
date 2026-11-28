// src/entities/skins/ghost09.ts — GHOST-09 (acuan Karakter/GHOST-09.png): tudung serat karbon, visor cyan MENYALA, respirator berfilter;
// zirah dada grafit berpahat dengan 4 garis cyan menyala, harness hitam, jubah hitam dari bahu kiri sampai betis; bahu grafit 2
// tingkat, gauntlet berpanel, layar holo cyan MENYALA di lengan bawah kiri; pelindung pangkal paha, holster, pelindung lutut &
// bot zirah grafit.
import { box, css, edge, fill, grain, merge, shade, S, RIG, type Atlas, type Common } from '../charKit';
import {
  bootSide, carbon, cloth, fab, hand, knee, lens, molle, plate, poly, pouch, sole, strap, vents, type Rect, type SkinBuild, type SkinDef,
} from './kit';

const C = { black: 0x17181b, carbon: 0x232529, graph: 0x33363b, plate: 0x2c2f34, cyan: 0x41e6ff, finger: 0x202226 };

function build(A: Atlas, _cm: Common): SkinBuild {
  const carb = A.px(64, 64, carbon(C.carbon)), plateG = A.px(56, 56, plate(C.plate, { scratch: 3, panel: true }));
  const graph = A.px(40, 40, plate(C.graph, { scratch: 2 })), blackS = A.px(64, 24, strap(C.black));
  const capeOut = cloth(0x1d1e22, 0, 4, 0.2), capeIn = cloth(0x121315, 0, 3, 0.15);
  const visor = lens(A, 170, 52, 0x9ff4ff, 0x16a8d0, { frame: 0x1a1b1e, inset: [0.05, 0.16], r: 0.22 });

  // ── kepala: masker gelap, tudung karbon (atas, samping, belakang, bibir depan), visor cyan, respirator + 2 filter
  const H = S(RIG.head.size);
  const maskF = A.region(H[0], H[1], (g, w, h, rng) => { fill(g, w, h, css(0x1f2124)); grain(g, w, h, rng, 0.05); shade(g, w, h, 0.05, 0.25); edge(g, w, h, 0.4); });
  const head = merge([
    box(H, [0, 0, 0], { all: maskF }),
    box([1.38, 0.34, 1.4], [0, 0.52, 0.04], { all: carb }),
    box([0.12, 1.08, 1.32], [0.69, 0.0, 0.06], { all: carb }), box([0.12, 1.08, 1.32], [-0.69, 0.0, 0.06], { all: carb }),
    box([1.38, 1.12, 0.12], [0, -0.02, 0.7], { all: carb }),
    box([1.38, 0.12, 0.2], [0, 0.42, -0.62], { all: A.px(64, 16, carbon(0x1a1b1e)) }),
    box([1.02, 0.3, 0.12], [0, 0.14, -0.66], { all: graph, nz: visor }),
    box([0.6, 0.42, 0.18], [0, -0.3, -0.66], { all: graph, nz: A.px(48, 36, vents(0x2b2e33, 4)) }),
    box([0.3, 0.28, 0.2], [0.42, -0.32, -0.6], { all: graph }), box([0.3, 0.28, 0.2], [-0.42, -0.32, -0.6], { all: graph }),
  ]);

  // ── badan atas: setelan hitam, zirah dada berpahat + 4 garis cyan menyala, zirah punggung, harness, jubah bahu kiri
  const U = S(RIG.upper.size);
  const chest = A.regionGlow(1.62, 1.02, (g, w, h, rng) => {
    plate(C.plate, { scratch: 4 })(g, w, h, rng);
    g.strokeStyle = 'rgba(0,0,0,0.45)'; g.lineWidth = 2;
    poly(g, [[0.12, 0.1], [0.88, 0.1], [0.82, 0.6], [0.5, 0.78], [0.18, 0.6]], w, h); g.stroke();                       // pahatan dada
    g.fillStyle = 'rgba(255,255,255,0.07)'; poly(g, [[0.12, 0.1], [0.5, 0.1], [0.5, 0.78], [0.18, 0.6]], w, h); g.fill();
    g.fillStyle = css(C.cyan);
    for (const x of [0.3, 0.68]) g.fillRect(w * x, h * 0.16, w * 0.025, h * 0.2);
    for (const x of [0.2, 0.75]) g.fillRect(w * x, h * 0.66, w * 0.07, h * 0.03);
  }, (g, w, h) => {
    g.fillStyle = '#fff';
    for (const x of [0.3, 0.68]) g.fillRect(w * x, h * 0.16, w * 0.025, h * 0.2);
    for (const x of [0.2, 0.75]) g.fillRect(w * x, h * 0.66, w * 0.07, h * 0.03);
  });
  const suit = A.region(U[0], U[1], fab(C.black, 0.3));
  const capeBack = A.region(1.3, 2.9, capeOut), capeInR = A.region(1.3, 2.9, capeIn);
  const upper = merge([
    box(U, [0, 0, 0], { all: suit }),
    box([1.62, 1.02, 0.16], [0, 0.0, -0.57], { all: plateG, nz: chest }),
    box([1.6, 1.0, 0.14], [0, 0.0, 0.56], { all: plateG }),
    box([0.28, 0.08, 1.14], [0.55, 0.63, 0], { all: blackS }), box([0.28, 0.08, 1.14], [-0.55, 0.63, 0], { all: blackS }),
    box([1.1, 0.16, 0.94], [0, 0.66, 0.02], { all: plateG }),
    box([0.98, 0.24, 1.26], [-0.55, 0.68, 0.04], { all: A.region(0.98, 1.26, capeOut) }),                              // jubah di bahu kiri
    box([1.3, 2.9, 0.08], [-0.32, -0.78, 0.66], { pz: capeBack, nz: capeInR, all: capeBack }, [0.08, 0, 0.05]),
  ]);

  // ── badan bawah: setelan hitam, pelindung pangkal paha, sabuk + kantong
  const L = S(RIG.lower.size);
  const pouchB = A.px(32, 40, pouch(0x222428, 0x1a1b1e));
  const lower = merge([
    box(L, [0, 0, 0], { all: A.region(L[0], L[1], fab(C.black, 0.3)) }),
    box([2.08, 0.2, 1.08], [0, 0.22, 0], { all: blackS }),
    box([0.7, 0.55, 0.14], [0, -0.16, -0.57], { all: plateG }),
    box([0.28, 0.32, 0.24], [0.82, 0.02, -0.4], { all: pouchB }), box([0.28, 0.32, 0.24], [-0.82, 0.02, -0.4], { all: pouchB }),
  ]);

  // ── lengan: setelan hitam, bahu grafit 2 tingkat, gauntlet berpanel; lengan kiri: layar holo cyan menyala
  const AR = S(RIG.arm.size);
  const sleeve = A.region(AR[0], AR[1], fab(C.black, 0.3));
  const gaunt = A.px(64, 48, plate(C.graph, { panel: true, scratch: 2 }));
  const holo = A.pxGlow(64, 48, (g, w, h) => {
    fill(g, w, h, 'rgba(20,110,140,1)');
    g.strokeStyle = css(C.cyan); g.lineWidth = 2;
    g.beginPath(); g.arc(w * 0.68, h * 0.5, h * 0.3, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.arc(w * 0.68, h * 0.5, h * 0.14, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.moveTo(w * 0.68, h * 0.12); g.lineTo(w * 0.68, h * 0.88); g.moveTo(w * 0.48, h * 0.5); g.lineTo(w * 0.88, h * 0.5); g.stroke();
    g.fillStyle = css(C.cyan); for (let i = 0; i < 4; i++) g.fillRect(w * 0.08, h * (0.2 + i * 0.16), w * 0.26, 3);
    g.strokeRect(2, 2, w - 4, h - 4);
  }, (g, w, h) => { g.fillStyle = 'rgb(120,120,120)'; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; g.strokeStyle = '#fff'; g.lineWidth = 2;
    g.beginPath(); g.arc(w * 0.68, h * 0.5, h * 0.3, 0, Math.PI * 2); g.stroke(); for (let i = 0; i < 4; i++) g.fillRect(w * 0.08, h * (0.2 + i * 0.16), w * 0.26, 3); g.strokeRect(2, 2, w - 4, h - 4); });
  const hd = hand(A, C.black, C.finger, { knuckle: C.graph, plate: C.graph, fingerless: false });
  const arm = (o: 1 | -1, band: Rect) => {
    const l = [
      box(AR, [0, 0, 0], { all: sleeve, ny: hd.bottom }),
      box([1.26, 0.55, 1.22], [o * 0.08, 0.76, 0], { all: plateG }),
      box([1.18, 0.22, 1.15], [o * 0.1, 0.42, 0], { all: graph }),
      box([1.07, 0.2, 1.07], [0, 0.12, 0], { all: band }),
      box([1.12, 0.62, 1.12], [0, -0.42, 0], { all: gaunt }),
      box([1.06, 0.42, 1.06], [0, -0.81, 0], { all: hd.side, nz: hd.front, ny: hd.bottom }),
    ];
    if (o < 0) l.push(box([0.06, 0.5, 0.74], [-0.62, -0.4, -0.04], { all: holo }));
    return merge(l);
  };

  // ── kaki: celana hitam, tali paha, holster kanan, pelindung lutut grafit, bot zirah
  const LG = S(RIG.leg.size);
  const pants = A.region(LG[0], LG[1], fab(C.black, 0.3)), pantsS = A.region(LG[2], LG[1], fab(C.black, 0.3));
  const kneeP = A.px(64, 44, knee(C.graph)), bootP = A.px(88, 56, plate(C.plate, { panel: true, scratch: 2 })), soleR = A.px(48, 16, sole());
  const holster = A.px(32, 52, molle(0x222428));
  const leg = (o: 1 | -1) => {
    const l = [
      box(LG, [0, 0, 0], { all: pantsS, nz: pants, pz: pants, ny: soleR }),
      box([1.06, 0.1, 1.06], [0, 0.46, 0], { all: blackS }), box([1.06, 0.1, 1.06], [0, 0.22, 0], { all: blackS }),
      box([0.84, 0.52, 0.13], [0, -0.06, -0.57], { all: graph, nz: kneeP }),
      box([1.12, 0.64, 1.16], [0, -0.6, -0.05], { all: A.px(88, 56, bootSide(C.plate)), nz: bootP }),
      box([1.14, 0.08, 1.18], [0, -0.88, -0.05], { all: soleR }),
    ];
    if (o > 0) l.push(box([0.24, 0.6, 0.38], [0.6, 0.34, -0.02], { all: graph, px: holster }));
    return merge(l);
  };

  return {
    head, upper, lower, legR: leg(1), legL: leg(-1), arm,
    chip: { head: C.carbon, upper: C.plate, lower: C.black, armR: C.graph, armL: C.graph, legR: C.black, legL: C.black },
  };
}

export const GHOST09: SkinDef = { seed: 3104, fps: { sleeve: 0x1d1e21, cuff: C.graph, glove: C.black, finger: C.finger }, build };

