// src/entities/skins/valiant.ts — VALIANT (acuan Karakter/VALIANT.png): helm zirah putih berpanel biru dengan visor V oranye MENYALA,
// cakram telinga abu, pelindung mulut berkisi, pelat pipi; zirah dada putih-biru dengan reaktor bundar oranye MENYALA, kerah berpengait,
// unit pendorong di punggung dengan 2 cincin oranye menyala; bahu putih bergaris biru, lengan atas serat karbon + piston, lengan bawah
// zirah tebal, sarung tangan mekanis; pelat pinggul, pelat paha & tulang kering putih-biru, sendi lutut, piston kaki, bot zirah.
import { box, css, edge, fill, grain, merge, S, RIG, type Atlas, type Common, type Painter } from '../charKit';
import { carbon, hand, plate, poly, sole, strap, vents, type Rect, type SkinBuild, type SkinDef } from './kit';

const C = { white: 0xe6e8eb, whiteS: 0xc2c7cd, blue: 0x2d4b9b, blueD: 0x1e3370, carbon: 0x1f2125, grey: 0x6e737a, greyD: 0x45494f,
  orange: 0xff9a2e, finger: 0x2b2d31 };

/** Pelat putih dengan panel biru (pola: 'side' sisi, 'center' tengah, 'v' huruf V). */
const armor = (pattern: 'side' | 'center' | 'v' | 'none'): Painter => (g, w, h, rng) => {
  plate(C.white, { gloss: 0.22, panel: true })(g, w, h, rng);
  g.fillStyle = css(C.blue);
  if (pattern === 'side') { poly(g, [[0, 0.15], [0.22, 0.25], [0.22, 0.85], [0, 0.95]], w, h); g.fill(); poly(g, [[1, 0.15], [0.78, 0.25], [0.78, 0.85], [1, 0.95]], w, h); g.fill(); }
  else if (pattern === 'center') { poly(g, [[0.4, 0], [0.6, 0], [0.56, 1], [0.44, 1]], w, h); g.fill(); }
  else if (pattern === 'v') { poly(g, [[0.08, 0.1], [0.3, 0.1], [0.5, 0.55], [0.7, 0.1], [0.92, 0.1], [0.5, 0.95]], w, h); g.fill(); }
  g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(0, 0, w, 3);
};

function build(A: Atlas, cm: Common): SkinBuild {
  const whiteP = A.px(56, 56, armor('none')), whiteSide = A.px(56, 56, armor('side')), whiteC = A.px(56, 56, armor('center'));
  const greyP = A.px(40, 40, plate(C.grey, { rivets: 1.5 })), greyD = A.px(40, 40, plate(C.greyD)), carb = A.px(64, 64, carbon(C.carbon));
  const ring = (rOuter: number) => A.pxGlow(40, 40, (g, w, h, rng) => {
    fill(g, w, h, css(C.greyD)); grain(g, w, h, rng, 0.05);
    const gr = g.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w * rOuter); gr.addColorStop(0, '#fff3c4'); gr.addColorStop(0.5, css(C.orange)); gr.addColorStop(1, '#b4520c');
    g.fillStyle = gr; g.beginPath(); g.arc(w / 2, h / 2, w * rOuter, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 2; g.beginPath(); g.arc(w / 2, h / 2, w * rOuter, 0, Math.PI * 2); g.stroke();
    edge(g, w, h, 0.5);
  }, (g, w, h) => { g.fillStyle = '#fff'; g.beginPath(); g.arc(w / 2, h / 2, w * rOuter, 0, Math.PI * 2); g.fill(); });

  // ── kepala: helm putih-biru (wajah = panel), visor V oranye, puncak, cakram telinga, pelindung mulut, pelat pipi
  const H = S(RIG.head.size);
  const vPath = (g: CanvasRenderingContext2D, w: number, h: number) => poly(g, [[0.04, 0.08], [0.32, 0.08], [0.5, 0.5], [0.68, 0.08], [0.96, 0.08], [0.6, 0.92], [0.4, 0.92]], w, h);
  const visor = A.pxGlow(150, 52, (g, w, h) => {
    fill(g, w, h, '#24272c');
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#ffe39a'); gr.addColorStop(1, '#ff7a14');
    g.fillStyle = gr; vPath(g, w, h); g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineWidth = 2; vPath(g, w, h); g.stroke();
  }, (g, w, h) => { g.fillStyle = '#fff'; vPath(g, w, h); g.fill(); });
  const disc = A.px(40, 40, (g, w, h, rng) => {
    fill(g, w, h, css(C.grey)); grain(g, w, h, rng, 0.05);
    g.strokeStyle = '#2b2e33'; g.lineWidth = 3; g.beginPath(); g.arc(w / 2, h / 2, w * 0.34, 0, Math.PI * 2); g.stroke();
    g.fillStyle = css(C.whiteS); g.beginPath(); g.arc(w / 2, h / 2, w * 0.18, 0, Math.PI * 2); g.fill(); edge(g, w, h, 0.5);
  });
  const helmF = A.region(H[0], H[1], (g, w, h, rng) => { armor('none')(g, w, h, rng); g.fillStyle = css(C.blue); poly(g, [[0.36, 0], [0.64, 0], [0.58, 0.35], [0.42, 0.35]], w, h); g.fill(); });
  const head = merge([
    box(H, [0, 0, 0], { all: whiteSide, nz: helmF, py: whiteC, ny: cm.glove }),
    box([1.3, 0.3, 1.32], [0, 0.5, 0.02], { all: whiteC }),
    box([0.98, 0.3, 0.1], [0, 0.12, -0.64], { all: greyD, nz: visor }),
    box([0.18, 0.52, 0.52], [0.69, 0.04, 0.04], { all: greyP, px: disc }), box([0.18, 0.52, 0.52], [-0.69, 0.04, 0.04], { all: greyP, nx: disc }),
    box([0.72, 0.3, 0.16], [0, -0.38, -0.64], { all: greyD, nz: A.px(56, 24, vents(C.grey, 3)) }),
    box([0.22, 0.42, 0.3], [0.5, -0.2, -0.56], { all: whiteP }), box([0.22, 0.42, 0.3], [-0.5, -0.2, -0.56], { all: whiteP }),
  ]);

  // ── badan atas: setelan karbon, zirah dada + reaktor menyala, zirah punggung, kerah berpengait, unit pendorong + 2 cincin menyala
  const U = S(RIG.upper.size);
  const chest = A.regionGlow(1.72, 1.06, (g, w, h, rng) => {
    armor('side')(g, w, h, rng);
    g.fillStyle = css(C.grey); g.beginPath(); g.arc(w / 2, h * 0.42, h * 0.2, 0, Math.PI * 2); g.fill();
    const gr = g.createRadialGradient(w / 2, h * 0.42, 2, w / 2, h * 0.42, h * 0.15); gr.addColorStop(0, '#fff6d0'); gr.addColorStop(0.45, '#ffb347'); gr.addColorStop(1, '#ff7a14');
    g.fillStyle = gr; g.beginPath(); g.arc(w / 2, h * 0.42, h * 0.15, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 2; g.beginPath(); g.arc(w / 2, h * 0.42, h * 0.2, 0, Math.PI * 2); g.stroke();
    g.fillStyle = css(C.orange); g.fillRect(w * 0.78, h * 0.5, w * 0.06, h * 0.03);
  }, (g, w, h) => { g.fillStyle = '#fff'; g.beginPath(); g.arc(w / 2, h * 0.42, h * 0.15, 0, Math.PI * 2); g.fill(); g.fillRect(w * 0.78, h * 0.5, w * 0.06, h * 0.03); });
  const thrust = ring(0.36);
  const upper = merge([
    box(U, [0, 0, 0], { all: carb }),
    box([1.72, 1.06, 0.18], [0, 0.0, -0.58], { all: whiteP, nz: chest }),
    box([1.68, 1.02, 0.14], [0, 0.0, 0.56], { all: whiteSide }),
    box([1.5, 0.24, 1.16], [0, 0.66, 0.02], { all: whiteP }),
    box([0.2, 0.2, 0.06], [0.5, 0.66, -0.6], { all: greyD }), box([0.2, 0.2, 0.06], [-0.5, 0.66, -0.6], { all: greyD }),
    box([1.44, 0.9, 0.36], [0, 0.12, 0.76], { all: greyP, pz: whiteC }),
    box([0.34, 0.5, 0.34], [0.6, 0.66, 0.66], { all: greyP, py: thrust, pz: thrust }), box([0.34, 0.5, 0.34], [-0.6, 0.66, 0.66], { all: greyP, py: thrust, pz: thrust }),
  ]);

  // ── badan bawah: karbon, pelat pinggul depan & samping, sabuk abu
  const L = S(RIG.lower.size);
  const hipF = A.px(64, 48, armor('v'));
  const lower = merge([
    box(L, [0, 0, 0], { all: carb }),
    box([2.06, 0.18, 1.06], [0, 0.26, 0], { all: A.px(64, 24, strap(C.greyD)) }),
    box([0.8, 0.62, 0.14], [0, -0.14, -0.57], { all: whiteP, nz: hipF }),
    box([0.14, 0.56, 0.8], [1.06, -0.1, 0], { all: whiteSide }), box([0.14, 0.56, 0.8], [-1.06, -0.1, 0], { all: whiteSide }),
  ]);

  // ── lengan: bahu putih bergaris biru, lengan atas karbon + piston, lengan bawah zirah tebal, sarung tangan mekanis
  const AR = S(RIG.arm.size);
  const hd = hand(A, 0x23262b, C.finger, { knuckle: C.grey, plate: C.greyD, fingerless: false });
  const arm = (o: 1 | -1, band: Rect) => merge([
    box(AR, [0, 0, 0], { all: carb, ny: hd.bottom }),
    box([1.36, 0.62, 1.3], [o * 0.12, 0.76, 0], { all: whiteC }),
    box([0.14, 1.0, 0.14], [o * 0.58, 0.0, 0.2], { all: greyD }),
    box([0.22, 0.22, 0.22], [o * 0.58, 0.45, 0.2], { all: greyP }),
    box([1.07, 0.2, 1.07], [0, 0.22, 0], { all: band }),
    box([1.18, 0.78, 1.18], [0, -0.42, 0], { all: whiteSide }),
    box([1.06, 0.42, 1.06], [0, -0.81, 0], { all: hd.side, nz: hd.front, ny: hd.bottom }),
  ]);

  // ── kaki: karbon, pelat paha & tulang kering putih-biru, sendi lutut, piston sisi luar, bot zirah
  const LG = S(RIG.leg.size);
  const thigh = A.px(64, 48, armor('center')), shin = A.px(64, 48, armor('side'));
  const bootP = A.px(80, 48, (g, w, h, rng) => { armor('none')(g, w, h, rng); g.fillStyle = css(C.blue); g.fillRect(w * 0.42, h * 0.1, w * 0.16, h * 0.5); });
  const soleR = A.px(48, 16, sole(0x1c1d20));
  const leg = (o: 1 | -1) => merge([
    box(LG, [0, 0, 0], { all: carb, ny: soleR }),
    box([0.92, 0.6, 0.14], [0, 0.42, -0.56], { all: whiteP, nz: thigh }),
    box([0.14, 0.6, 0.7], [o * 0.56, 0.42, 0], { all: whiteP }),
    box([1.08, 0.26, 1.08], [0, 0.0, 0], { all: greyD }),
    box([0.94, 0.42, 0.14], [0, -0.32, -0.57], { all: whiteP, nz: shin }),
    box([0.1, 1.2, 0.1], [o * 0.56, -0.2, 0.26], { all: greyP }),
    box([1.14, 0.5, 1.18], [0, -0.66, -0.05], { all: whiteSide, nz: bootP }),
    box([1.16, 0.08, 1.2], [0, -0.88, -0.05], { all: soleR }),
  ]);

  return {
    head, upper, lower, legR: leg(1), legL: leg(-1), arm,
    chip: { head: C.white, upper: C.white, lower: C.carbon, armR: C.white, armL: C.white, legR: C.white, legL: C.white },
  };
}

export const VALIANT: SkinDef = { seed: 3109, fps: { sleeve: C.white, cuff: C.blue, glove: 0x23262b, finger: C.finger }, build };

