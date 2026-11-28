// src/entities/skins/nova.ts — NOVA (acuan Karakter/NOVA.png): helm hitam bergaris ungu + sudut kuning, visor gelap dengan garis
// detak jantung ungu MENYALA, pelindung dagu, headphone besar hitam berbibir kuning + aksen ungu, mik; hoodie hitam bertali (tudung di
// punggung), rompi pelat kuning bertali ungu, 2 granat bergaris ungu menyala; lengan hoodie bergaris ungu + pipa kuning, tempelan
// bahu ungu, manset rajut, sarung tangan tanpa jari (perban kanan); celana jogger hitam berpanel ungu, tali paha kuning bergesper,
// pelindung lutut berlis kuning, sneakers hitam-ungu bertali kuning.
import { box, css, edge, fill, grain, merge, rrect, shade, stitch, S, RIG, type Atlas, type Common, type Painter } from '../charKit';
import {
  SKIN_FINGER, bootFront, bootSide, buckle, cloth, fab, hand, knee, plate, sole, strap, type Rect, type SkinBuild, type SkinDef,
} from './kit';

const C = { black: 0x1c1b20, coal: 0x2a2930, purple: 0x7d43e6, purpleD: 0x4d2694, yellow: 0xe2b52b, yellowD: 0xa98318, glow: 0xc188ff,
  bandage: 0xcbbf9e };

const hoodie = (piping: boolean): Painter => (g, w, h, rng) => {
  fill(g, w, h, css(C.black)); grain(g, w, h, rng, 0.06);
  if (piping) {
    g.fillStyle = css(C.purple); g.fillRect(0, h * 0.2, w, h * 0.1);                                                    // garis ungu lengan atas
    g.fillStyle = css(C.yellow); g.fillRect(w * 0.12, h * 0.3, w * 0.05, h * 0.55); g.fillRect(w * 0.83, h * 0.3, w * 0.05, h * 0.55); // pipa kuning
    g.fillStyle = css(C.purpleD); g.fillRect(0, h * 0.3, w * 0.12, h * 0.55);
  }
  shade(g, w, h, 0.07, 0.22); edge(g, w, h, 0.3);
};

function build(A: Atlas, cm: Common): SkinBuild {
  const helmP: Painter = (g, w, h, rng) => {
    plate(C.black, { gloss: 0.18 })(g, w, h, rng);
    g.fillStyle = css(C.purple); g.fillRect(w * 0.38, 0, w * 0.1, h); g.fillStyle = css(C.yellow); g.fillRect(w * 0.06, h * 0.6, w * 0.12, h * 0.3);
  };
  const helm = A.px(64, 48, helmP), helmTop = A.px(96, 96, helmP);
  const blackP = A.px(40, 40, plate(C.coal, { gloss: 0.15 })), yellowS = A.px(64, 24, strap(C.yellow)), purpleS = A.px(64, 24, strap(C.purple));
  // visor: kaca gelap + garis detak jantung ungu menyala
  const beat = (g: CanvasRenderingContext2D, w: number, h: number) => {
    g.beginPath(); g.moveTo(w * 0.06, h * 0.52);
    for (const [x, y] of [[0.3, 0.52], [0.38, 0.3], [0.45, 0.76], [0.52, 0.2], [0.6, 0.66], [0.66, 0.52], [0.94, 0.52]] as const) g.lineTo(w * x, h * y);
  };
  const visor = A.pxGlow(180, 72, (g, w, h) => {
    fill(g, w, h, '#0e0d12');
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(120,80,200,0.25)'); gr.addColorStop(1, 'rgba(0,0,0,0.2)');
    g.fillStyle = gr; rrect(g, w * 0.04, h * 0.1, w * 0.92, h * 0.8, h * 0.2); g.fill();
    g.strokeStyle = css(C.glow); g.lineWidth = 4; g.lineJoin = 'round'; beat(g, w, h); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.12)'; g.lineWidth = 2; rrect(g, w * 0.04, h * 0.1, w * 0.92, h * 0.8, h * 0.2); g.stroke();
  }, (g, w, h) => { g.strokeStyle = '#fff'; g.lineWidth = 5; g.lineJoin = 'round'; beat(g, w, h); g.stroke(); });
  const cup = A.px(48, 48, (g, w, h, rng) => {
    fill(g, w, h, css(C.black)); grain(g, w, h, rng, 0.05);
    g.strokeStyle = css(C.yellow); g.lineWidth = 4; rrect(g, 3, 3, w - 6, h - 6, 8); g.stroke();
    g.fillStyle = css(C.purple); rrect(g, w * 0.3, h * 0.3, w * 0.4, h * 0.4, 5); g.fill();
    edge(g, w, h, 0.5);
  });

  // ── kepala: hitam, helm bergaris, visor detak jantung, pelindung dagu, headphone + bando, mik
  const H = S(RIG.head.size);
  const head = merge([
    box(H, [0, 0, 0], { all: A.region(H[0], H[1], fab(C.black, 0.4)) }),
    box([1.34, 0.5, 1.36], [0, 0.44, 0.02], { all: helm, py: helmTop }),
    box([1.1, 0.44, 0.14], [0, 0.04, -0.67], { all: blackP, nz: visor }),
    box([0.92, 0.26, 0.16], [0, -0.4, -0.62], { all: blackP }),
    box([0.22, 0.56, 0.56], [0.72, 0.02, 0.04], { all: blackP, px: cup }), box([0.22, 0.56, 0.56], [-0.72, 0.02, 0.04], { all: blackP, nx: cup }),
    box([1.62, 0.1, 0.18], [0, 0.74, 0.04], { all: blackP }),
    box([0.06, 0.06, 0.56], [0.62, -0.3, -0.34], { all: cm.metalDark }, [0, 0.45, 0]),
  ]);

  // ── badan atas: hoodie hitam bertali + tudung di punggung, rompi pelat kuning, tali bahu ungu-kuning, 2 granat bergaris ungu menyala
  const U = S(RIG.upper.size);
  const hoodF = A.region(U[0], U[1], (g, w, h, rng) => {
    hoodie(false)(g, w, h, rng);
    g.fillStyle = '#d8d6dc'; g.fillRect(w * 0.43, 0, 2, h * 0.35); g.fillRect(w * 0.56, 0, 2, h * 0.3);                // tali hoodie
    stitch(g, w * 0.25, h * 0.82, w * 0.75, h * 0.82, 'rgba(255,255,255,0.12)');                                          // kantong kanguru
  });
  const vestP = A.px(96, 64, (g, w, h, rng) => {
    plate(C.yellow, { panel: true, gloss: 0.2 })(g, w, h, rng);
    g.fillStyle = css(C.purple); g.fillRect(w * 0.08, 0, w * 0.1, h); g.fillRect(w * 0.82, 0, w * 0.1, h);
  });
  const nade = A.pxGlow(32, 40, (g, w, h) => {
    fill(g, w, h, '#2b2c30');
    g.strokeStyle = 'rgba(0,0,0,0.45)'; g.lineWidth = 1.5;
    for (let x = w / 4; x < w; x += w / 4) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
    g.fillStyle = css(C.glow); g.fillRect(0, h * 0.5, w, h * 0.1); edge(g, w, h, 0.45);
  }, (g, w, h) => { g.fillStyle = '#fff'; g.fillRect(0, h * 0.5, w, h * 0.1); });
  const ring = A.pxGlow(24, 24, (g, w, h) => { fill(g, w, h, '#1c1b20'); g.strokeStyle = css(C.glow); g.lineWidth = 3; g.beginPath(); g.arc(w / 2, h / 2, w * 0.32, 0, Math.PI * 2); g.stroke(); },
    (g, w, h) => { g.strokeStyle = '#fff'; g.lineWidth = 3; g.beginPath(); g.arc(w / 2, h / 2, w * 0.32, 0, Math.PI * 2); g.stroke(); });
  const hoodBack = A.region(1.3, 0.55, cloth(C.black, 0, 3, 0.25));
  const upper = merge([
    box(U, [0, 0, 0], { all: A.region(U[2], U[1], hoodie(false)), nz: hoodF, pz: A.region(U[0], U[1], hoodie(false)) }),
    box([1.22, 0.82, 0.14], [0, -0.12, -0.56], { all: A.px(40, 40, plate(C.yellowD)), nz: vestP }),
    box([0.3, 0.08, 1.14], [0.5, 0.63, 0], { all: purpleS }), box([0.3, 0.08, 1.14], [-0.5, 0.63, 0], { all: purpleS }),
    box([0.2, 0.72, 0.05], [0.5, 0.2, -0.64], { all: yellowS }), box([0.2, 0.72, 0.05], [-0.5, 0.2, -0.64], { all: yellowS }),
    box([0.2, 0.26, 0.2], [-0.22, 0.12, -0.72], { all: nade }), box([0.2, 0.26, 0.2], [-0.46, 0.12, -0.72], { all: nade }),
    box([0.14, 0.14, 0.05], [0.28, 0.3, -0.65], { all: ring }),
    box([1.3, 0.55, 0.42], [0, 0.48, 0.66], { all: hoodBack }),
    box([1.06, 0.16, 0.9], [0, 0.66, 0.02], { all: A.px(64, 16, fab(C.coal, 0.4)) }),
  ]);

  // ── badan bawah: ujung hoodie berkaret ungu-hitam, jogger hitam, sabuk kuning gesper hitam, tali selempang ungu
  const L = S(RIG.lower.size);
  const rib = A.px(96, 24, (g, w, h, rng) => {
    fill(g, w, h, css(C.black)); grain(g, w, h, rng, 0.05);
    g.fillStyle = css(C.purpleD); g.fillRect(0, h * 0.35, w, h * 0.3);
    g.fillStyle = 'rgba(0,0,0,0.25)'; for (let x = 0; x < w; x += 4) g.fillRect(x, 0, 1.5, h);
    edge(g, w, h, 0.35);
  });
  const lower = merge([
    box(L, [0, 0, 0], { all: A.region(L[0], L[1], fab(C.black, 0.3)) }),
    box([2.1, 0.24, 1.1], [0, 0.28, 0], { all: rib }),
    box([2.08, 0.18, 1.08], [0, 0.02, 0], { all: yellowS }),
    box([0.32, 0.18, 0.06], [0, 0.02, -0.56], { all: A.px(32, 20, buckle(0x26252b, C.yellow)) }),
    box([0.16, 0.9, 0.06], [0.7, -0.05, -0.55], { all: purpleS }, [0, 0, 0.5]),
  ]);

  // ── lengan: hoodie bergaris ungu + pipa kuning, tempelan bahu ungu, manset rajut, sarung tangan tanpa jari (perban)
  const AR = S(RIG.arm.size);
  const sleeve = A.region(AR[0], AR[1], hoodie(true)), sleeveIn = A.region(AR[2], AR[1], hoodie(false));
  const patch = A.px(28, 36, (g, w, h, rng) => { fill(g, w, h, css(C.purple)); grain(g, w, h, rng, 0.05); g.fillStyle = css(C.yellow); g.fillRect(0, 0, w, 3); g.fillRect(0, h - 3, w, 3); edge(g, w, h, 0.45); });
  const knit = A.px(80, 24, (g, w, h, rng) => { fill(g, w, h, css(C.black)); grain(g, w, h, rng, 0.05); g.fillStyle = 'rgba(255,255,255,0.06)'; for (let x = 0; x < w; x += 4) g.fillRect(x, 0, 2, h); edge(g, w, h, 0.4); });
  const hd = hand(A, C.black, SKIN_FINGER, { knuckle: 0x2b2a31, fingerless: true, trim: C.bandage });
  const arm = (o: 1 | -1, band: Rect) => merge([
    box([1.08, 2.0, 1.08], [0, 0, 0], { all: sleeve, [o > 0 ? 'nx' : 'px']: sleeveIn, py: A.region(AR[0], AR[2], hoodie(false)), ny: hd.bottom }),
    box([0.06, 0.32, 0.42], [o * 0.57, 0.58, 0], { all: patch }),
    box([1.12, 0.2, 1.12], [0, -0.08, 0], { all: band }),
    box([1.12, 0.28, 1.12], [0, -0.5, 0], { all: knit }),
    box([1.06, 0.42, 1.06], [0, -0.81, 0], { all: hd.side, nz: hd.front, ny: hd.bottom }),
  ]);

  // ── kaki: jogger hitam berpanel ungu di sisi, tali paha kuning bergesper, pelindung lutut berlis kuning, sneakers
  const LG = S(RIG.leg.size);
  const joggerS = A.region(LG[2], LG[1], (g, w, h, rng) => { fab(C.black, 0.3)(g, w, h, rng); g.fillStyle = css(C.purple); g.fillRect(w * 0.38, 0, w * 0.24, h * 0.7); });
  const jogger = A.region(LG[0], LG[1], fab(C.black, 0.3));
  const kneeP = A.px(64, 44, knee(0x222126, C.yellow)), buckleY = A.px(28, 20, buckle(0x26252b, C.yellow));
  const shoeF = A.px(88, 44, (g, w, h, rng) => { bootFront(C.black, C.yellow, C.purple)(g, w, h, rng); g.fillStyle = css(C.purple); g.fillRect(0, h * 0.4, w * 0.16, h * 0.3); g.fillRect(w * 0.84, h * 0.4, w * 0.16, h * 0.3); });
  const shoeS = A.px(88, 44, (g, w, h, rng) => { bootSide(C.black)(g, w, h, rng); g.fillStyle = css(C.purple); rrect(g, w * 0.3, h * 0.3, w * 0.4, h * 0.3, 4); g.fill(); g.fillStyle = css(C.yellow); g.fillRect(w * 0.1, h * 0.2, w * 0.08, h * 0.4); });
  const soleR = A.px(48, 16, sole(0x2a2930));
  const leg = (o: 1 | -1) => merge([
    box(LG, [0, 0, 0], { all: joggerS, nz: jogger, pz: jogger, ny: soleR }),
    box([1.06, 0.1, 1.06], [0, 0.4, 0], { all: yellowS }),
    box([0.24, 0.14, 0.05], [o * 0.1, 0.4, -0.55], { all: buckleY }),
    box([0.82, 0.52, 0.13], [0, -0.06, -0.57], { all: blackP, nz: kneeP }),
    box([1.1, 0.5, 1.16], [0, -0.66, -0.06], { all: shoeS, nz: shoeF }),
    box([1.12, 0.08, 1.18], [0, -0.88, -0.06], { all: soleR }),
  ]);

  return {
    head, upper, lower, legR: leg(1), legL: leg(-1), arm,
    chip: { head: C.black, upper: C.yellow, lower: C.black, armR: C.purple, armL: C.purple, legR: C.black, legL: C.black },
  };
}

export const NOVA: SkinDef = { seed: 3105, fps: { sleeve: C.black, cuff: C.purple, glove: C.black, finger: SKIN_FINGER }, build };
