// src/entities/skins/reaper.ts — REAPER (acuan Karakter/REAPER.png): tudung hitam bertepi robek, topeng paruh dokter wabah abu batu yang
// retak dengan goggles bundar hijau MENYALA + respirator di pipi kiri; syal tudung, zirah dada batu retak, selempang kulit dengan 3
// botol hijau MENYALA; bahu batu 2 lapis, gauntlet arang bergaris hijau MENYALA, sarung tangan tanpa jari; mantel hitam compang-
// camping (belakang, samping, depan), sabuk kulit + kantong; celana hitam, tali paha, pelindung lutut arang, sepatu bot hitam.
import { box, css, edge, fill, grain, merge, S, RIG, type Atlas, type Common, type G, type Painter } from '../charKit';
import {
  SKIN_FINGER, bootFront, bootSide, buckle, cloth, fab, hand, knee, plate, pouch, sole, strap, type Rect, type SkinBuild, type SkinDef,
} from './kit';

const C = { black: 0x161718, coal: 0x2a2c2e, stone: 0x4b4e50, stoneD: 0x35383a, leather: 0x3a2f25, green: 0x58ff45, glove: 0x2a241d };

/** Batu retak: pelat abu + garis retak bercabang. */
const cracked = (c: number): Painter => (g, w, h, rng) => {
  plate(c, { scratch: 3 })(g, w, h, rng);
  g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 1.2;
  for (let i = 0; i < 4; i++) {
    let x = rng() * w, y = rng() * h; g.beginPath(); g.moveTo(x, y);
    for (let k = 0; k < 4; k++) { x += (rng() - 0.5) * w * 0.3; y += (rng() - 0.2) * h * 0.25; g.lineTo(x, y); }
    g.stroke();
  }
};
const glowLines = (g: G, w: number, h: number) => {
  for (const [x0, y0, x1, y1] of [[0.12, 0.3, 0.45, 0.3], [0.45, 0.3, 0.55, 0.45], [0.55, 0.45, 0.9, 0.45], [0.2, 0.7, 0.6, 0.7]] as const) {
    g.beginPath(); g.moveTo(w * x0, h * y0); g.lineTo(w * x1, h * y1); g.stroke();
  }
};

function build(A: Atlas, _cm: Common): SkinBuild {
  const stone = A.px(56, 56, cracked(C.stone)), stoneD = A.px(40, 40, cracked(C.stoneD)), coalP = A.px(40, 40, plate(C.coal, { scratch: 2 }));
  const hoodC = cloth(C.black, 0, 3, 0.2), hood = A.px(64, 64, hoodC);
  const leatherS = A.px(64, 24, strap(C.leather)), blackS = A.px(64, 24, strap(C.black));
  const vial = A.pxGlow(24, 48, (g, w, h) => {
    fill(g, w, h, '#1f2a1e');
    const gr = g.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, '#2fbf24'); gr.addColorStop(0.5, '#c9ffb8'); gr.addColorStop(1, '#2fbf24');
    g.fillStyle = gr; g.fillRect(w * 0.12, h * 0.16, w * 0.76, h * 0.7);
    g.fillStyle = '#3a3d3f'; g.fillRect(0, 0, w, h * 0.14); g.fillRect(0, h * 0.86, w, h * 0.14);
    edge(g, w, h, 0.5);
  }, (g, w, h) => { g.fillStyle = '#fff'; g.fillRect(w * 0.12, h * 0.16, w * 0.76, h * 0.7); });

  // ── kepala: topeng batu (goggles menyala dilukis di depan), tudung robek, paruh 2 segmen, respirator pipi kiri
  const H = S(RIG.head.size);
  const maskF = A.regionGlow(H[0], H[1], (g, w, h, rng) => {
    cracked(C.stone)(g, w, h, rng);
    g.fillStyle = '#1c1e1f'; g.fillRect(0, h * 0.3, w, h * 0.22);                                                          // tali goggles
    for (const x of [0.3, 0.7]) {
      g.fillStyle = '#26292b'; g.beginPath(); g.arc(w * x, h * 0.41, h * 0.17, 0, Math.PI * 2); g.fill();
      const gr = g.createRadialGradient(w * x, h * 0.41, 1, w * x, h * 0.41, h * 0.13); gr.addColorStop(0, '#eaffd8'); gr.addColorStop(0.5, css(C.green)); gr.addColorStop(1, '#1d7a16');
      g.fillStyle = gr; g.beginPath(); g.arc(w * x, h * 0.41, h * 0.13, 0, Math.PI * 2); g.fill();
    }
  }, (g, w, h) => { g.fillStyle = '#fff'; for (const x of [0.3, 0.7]) { g.beginPath(); g.arc(w * x, h * 0.41, h * 0.13, 0, Math.PI * 2); g.fill(); } });
  const hoodRim = A.px(96, 20, (g, w, h, rng) => { hoodC(g, w, h, rng); });
  const respir = A.px(32, 32, (g, w, h, rng) => {
    fill(g, w, h, '#232628'); grain(g, w, h, rng, 0.05);
    g.strokeStyle = '#4b5052'; g.lineWidth = 3; g.beginPath(); g.arc(w / 2, h / 2, w * 0.34, 0, Math.PI * 2); g.stroke();
    g.fillStyle = 'rgba(88,255,69,0.5)'; g.beginPath(); g.arc(w / 2, h / 2, w * 0.12, 0, Math.PI * 2); g.fill(); edge(g, w, h, 0.5);
  });
  const head = merge([
    box(H, [0, 0, 0], { all: A.region(H[0], H[1], fab(0x1c1d1f, 0.4)), nz: maskF }),
    box([1.38, 0.34, 1.4], [0, 0.52, 0.04], { all: hood }),
    box([0.12, 1.1, 1.32], [0.69, -0.02, 0.06], { all: hood }), box([0.12, 1.1, 1.32], [-0.69, -0.02, 0.06], { all: hood }),
    box([1.38, 1.14, 0.12], [0, -0.03, 0.7], { all: hood }),
    box([1.38, 0.14, 0.22], [0, 0.42, -0.62], { all: hoodRim }),
    box([0.52, 0.46, 0.36], [0, -0.16, -0.78], { all: stoneD, nz: stone }),                                              // pangkal paruh
    box([0.32, 0.3, 0.52], [0, -0.32, -1.1], { all: stone }, [0.42, 0, 0]),                                                // ujung paruh
    box([0.3, 0.3, 0.22], [-0.52, -0.24, -0.6], { all: coalP, nz: respir }),
  ]);

  // ── badan atas: kain hitam, syal tudung, zirah dada batu retak, selempang kulit + 3 botol hijau menyala
  const U = S(RIG.upper.size);
  const rot = 0.62, ux = -Math.sin(rot), uy = Math.cos(rot), along = (d: number): [number, number, number] => [ux * d, 0.04 + uy * d, -0.7];
  const upper = merge([
    box(U, [0, 0, 0], { all: A.region(U[0], U[1], fab(C.black, 0.3)) }),
    box([1.52, 0.98, 0.16], [0, 0.0, -0.57], { all: stoneD, nz: A.region(1.52, 0.98, cracked(C.stone)) }),
    box([1.5, 0.96, 0.14], [0, 0.0, 0.56], { all: stoneD }),
    box([1.36, 0.32, 1.18], [0, 0.66, 0.04], { all: hood }),
    box([2.2, 0.22, 0.08], [0, 0.04, -0.68], { all: leatherS }, [0, 0, rot]),
    box([0.16, 0.34, 0.16], along(-0.35), { all: vial }, [0, 0, rot]),
    box([0.16, 0.34, 0.16], along(-0.05), { all: vial }, [0, 0, rot]),
    box([0.16, 0.34, 0.16], along(0.25), { all: vial }, [0, 0, rot]),
  ]);

  // ── badan bawah: sabuk kulit + kantong, mantel compang-camping (belakang, samping, depan) berlapis dalam gelap
  const L = S(RIG.lower.size);
  const coatOut = A.px(104, 120, cloth(C.black, 0.22, 5, 0.2)), coatIn = A.px(104, 120, cloth(0x101112, 0.22, 3, 0.15));
  const coatSide = A.px(96, 120, cloth(C.black, 0.25, 4, 0.2)), coatSideIn = A.px(96, 120, cloth(0x101112, 0.25, 3, 0.15));
  const lower = merge([
    box(L, [0, 0, 0], { all: A.region(L[0], L[1], fab(C.black, 0.3)) }),
    box([2.08, 0.2, 1.08], [0, 0.2, 0], { all: leatherS }),
    box([0.3, 0.18, 0.06], [0, 0.2, -0.56], { all: A.px(32, 20, buckle(0x5a5f62, C.leather)) }),
    box([0.28, 0.32, 0.24], [0.82, 0.0, -0.4], { all: A.px(32, 40, pouch(C.leather, 0x2c241c)) }),
    box([0.28, 0.32, 0.24], [-0.82, 0.0, -0.4], { all: A.px(32, 40, pouch(C.leather, 0x2c241c)) }),
    box([2.2, 1.4, 0.08], [0, -0.98, 0.6], { pz: coatOut, nz: coatIn, all: coatOut }, [0.1, 0, 0]),
    box([0.08, 1.4, 1.1], [1.1, -0.98, 0.04], { px: coatSide, nx: coatSideIn, all: coatSide }),
    box([0.08, 1.4, 1.1], [-1.1, -0.98, 0.04], { nx: coatSide, px: coatSideIn, all: coatSide }),
    box([0.4, 1.2, 0.08], [0.86, -0.9, -0.58], { nz: coatSide, pz: coatSideIn, all: coatSide }),
    box([0.4, 1.2, 0.08], [-0.86, -0.9, -0.58], { nz: coatSide, pz: coatSideIn, all: coatSide }),
  ]);

  // ── lengan: bahu batu 2 lapis, kain hitam, gauntlet arang bergaris hijau menyala, sarung tangan tanpa jari
  const AR = S(RIG.arm.size);
  const gaunt = A.pxGlow(64, 48, (g, w, h, rng) => {
    plate(C.coal, { scratch: 3, panel: true })(g, w, h, rng);
    g.strokeStyle = css(C.green); g.lineWidth = 3; glowLines(g, w, h);
  }, (g, w, h) => { g.strokeStyle = '#fff'; g.lineWidth = 3; glowLines(g, w, h); });
  const hd = hand(A, C.glove, SKIN_FINGER, { knuckle: 0x1d1915, fingerless: true });
  const arm = (o: 1 | -1, band: Rect) => merge([
    box(AR, [0, 0, 0], { all: A.region(AR[0], AR[1], fab(C.black, 0.3)), ny: hd.bottom }),
    box([1.3, 0.6, 1.26], [o * 0.1, 0.76, 0], { all: stone }),
    box([1.22, 0.24, 1.18], [o * 0.12, 0.4, 0], { all: stoneD }),
    box([1.07, 0.2, 1.07], [0, 0.12, 0], { all: band }),
    box([1.14, 0.66, 1.14], [0, -0.42, 0], { all: gaunt }),
    box([1.06, 0.42, 1.06], [0, -0.81, 0], { all: hd.side, nz: hd.front, ny: hd.bottom }),
  ]);

  // ── kaki: celana hitam, tali paha bergesper, pelindung lutut arang, sepatu bot hitam
  const LG = S(RIG.leg.size);
  const pants = A.region(LG[0], LG[1], fab(0x1a1b1d, 0.3)), pantsS = A.region(LG[2], LG[1], fab(0x1a1b1d, 0.3));
  const kneeP = A.px(64, 44, knee(C.coal)), buckleB = A.px(28, 20, buckle(0x55595c, C.black));
  const bootF = A.px(88, 44, bootFront(0x1a1b1c, 0x4e5254)), bootS = A.px(88, 44, bootSide(0x1a1b1c)), soleR = A.px(48, 16, sole());
  const leg = (o: 1 | -1) => merge([
    box(LG, [0, 0, 0], { all: pantsS, nz: pants, pz: pants, ny: soleR }),
    box([1.06, 0.1, 1.06], [0, 0.42, 0], { all: blackS }), box([1.06, 0.1, 1.06], [0, 0.18, 0], { all: blackS }),
    box([0.22, 0.14, 0.05], [o * 0.16, 0.42, -0.55], { all: buckleB }),
    box([0.82, 0.52, 0.13], [0, -0.06, -0.57], { all: coalP, nz: kneeP }),
    box([1.08, 0.52, 1.14], [0, -0.64, -0.05], { all: bootS, nz: bootF }),
    box([1.1, 0.08, 1.16], [0, -0.87, -0.05], { all: soleR }),
  ]);

  return {
    head, upper, lower, legR: leg(1), legL: leg(-1), arm,
    chip: { head: C.stone, upper: C.stone, lower: C.black, armR: C.stone, armL: C.stone, legR: C.black, legL: C.black },
  };
}

export const REAPER: SkinDef = { seed: 3110, fps: { sleeve: C.black, cuff: C.coal, glove: C.glove, finger: SKIN_FINGER }, build };

