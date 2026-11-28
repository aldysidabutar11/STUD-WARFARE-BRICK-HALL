// src/entities/skins/ignis.ts — IGNIS (acuan Karakter/IGNIS.png): helm gunmetal tergores, goggles oranye MENYALA, masker gas berkisi
// + 2 filter berlingkar oranye menyala, headset; jaket oranye bergaris hitam, rompi olive MOLLE dengan 2 tabung bahan bakar menyala,
// 2 alat ukur & 2 granat bergaris menyala; ransel tangki gunmetal berpaku + 2 pipa knalpot di kanan-kiri kepala; bahu gunmetal
// berpaku; sarung tangan hitam tanpa jari; celana hitam berpanel oranye, tali olive bergesper, pelindung lutut, sepatu bot berat.
import { box, css, edge, fill, grain, merge, rrect, shade, S, RIG, type Atlas, type Common, type Painter } from '../charKit';
import {
  SKIN_FINGER, bootFront, bootSide, buckle, fab, glowAll, hand, knee, lens, molle, plate, pouch, sole, strap, vents, type Rect, type SkinBuild, type SkinDef,
} from './kit';

const C = { orange: 0xd8652a, orangeD: 0xa44a1c, black: 0x1d1d20, gun: 0x55595e, gunD: 0x3b3e42, steel: 0x8c9096, olive: 0x4d5333,
  oliveD: 0x3a3f27, burnt: 0x4a4f6a };

/** Kain oranye bergaris hitam (jaket pemadam). */
const jacketP = (stripes: readonly number[]): Painter => (g, w, h, rng) => {
  fill(g, w, h, css(C.orange)); grain(g, w, h, rng, 0.07);
  for (const y of stripes) { g.fillStyle = css(C.black); g.fillRect(0, h * y, w, h * 0.12); g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(0, h * y, w, 2); }
  g.fillStyle = 'rgba(60,30,10,0.18)'; for (let i = 0; i < 6; i++) g.fillRect(rng() * w, rng() * h, 6, 3);                    // noda jelaga
  shade(g, w, h, 0.06, 0.22); edge(g, w, h, 0.3);
};

function build(A: Atlas, cm: Common): SkinBuild {
  const gun = A.px(56, 56, plate(C.gun, { rivets: 1.8, scratch: 5 })), gunD = A.px(40, 40, plate(C.gunD, { rivets: 1.4, scratch: 2 }));
  const steel = A.px(32, 32, plate(C.steel, { gloss: 0.3 })), burnt = A.px(24, 24, plate(C.burnt, { gloss: 0.25 }));
  const oliveS = A.px(64, 24, strap(C.oliveD)), blackS = A.px(64, 24, strap(C.black));
  const goggles = lens(A, 180, 56, 0xffd08a, 0xe0611a, { frame: 0x2a2b2e, inset: [0.05, 0.14], r: 0.28 });
  // filter masker: lingkaran gelap berbibir oranye menyala
  const filter = A.pxGlow(40, 40, (g, w, h, rng) => {
    fill(g, w, h, '#26282b'); grain(g, w, h, rng, 0.06);
    g.strokeStyle = '#ff8a2a'; g.lineWidth = 3; g.beginPath(); g.arc(w / 2, h / 2, w * 0.36, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#121314'; g.beginPath(); g.arc(w / 2, h / 2, w * 0.26, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.15)'; for (let i = 0; i < 4; i++) g.fillRect(w * 0.3, h * (0.36 + i * 0.08), w * 0.4, 1.5);
    edge(g, w, h, 0.5);
  }, (g, w, h) => { g.strokeStyle = '#fff'; g.lineWidth = 3; g.beginPath(); g.arc(w / 2, h / 2, w * 0.36, 0, Math.PI * 2); g.stroke(); });

  // ── kepala: balaclava, helm gunmetal, goggles oranye, masker gas berkisi + 2 filter, headset
  const H = S(RIG.head.size);
  const head = merge([
    box(H, [0, 0, 0], { all: A.region(H[0], H[1], fab(C.black, 0.4)) }),
    box([1.34, 0.55, 1.36], [0, 0.42, 0.02], { all: gun }),
    box([1.4, 0.1, 1.4], [0, 0.18, 0.02], { all: gunD }),
    box([0.34, 0.1, 0.9], [0, 0.72, 0.02], { all: gunD }),
    box([1.12, 0.36, 0.14], [0, 0.12, -0.67], { all: gunD, nz: goggles }),
    box([0.84, 0.5, 0.2], [0, -0.3, -0.66], { all: gunD, nz: A.px(64, 40, vents(0x2a2c30, 4)) }),
    box([0.32, 0.32, 0.26], [0.5, -0.34, -0.6], { all: gunD, nz: filter }), box([0.32, 0.32, 0.26], [-0.5, -0.34, -0.6], { all: gunD, nz: filter }),
    box([0.18, 0.44, 0.44], [0.7, 0.02, 0.05], { all: gunD }), box([0.18, 0.44, 0.44], [-0.7, 0.02, 0.05], { all: gunD }),
  ]);

  // ── badan atas: jaket oranye bergaris, rompi olive, 2 tabung menyala, 2 alat ukur, 2 granat menyala, ransel tangki + 2 pipa
  const U = S(RIG.upper.size);
  const jacket = jacketP([0.22, 0.62]);
  const vest = A.px(110, 78, molle(C.olive)), pouchO = A.px(32, 40, pouch(C.olive, C.oliveD));
  const canister = A.pxGlow(24, 48, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, '#ff7a1a'); gr.addColorStop(0.5, '#ffd27a'); gr.addColorStop(1, '#e0601a');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(80,30,0,0.45)'; for (let y = 6; y < h; y += 9) g.fillRect(0, y, w, 1.5);     // gelembung/rangka
    edge(g, w, h, 0.5);
  }, glowAll(1));
  const gauge = A.px(28, 28, (g, w, h) => {
    fill(g, w, h, '#2b2d30'); g.fillStyle = '#d9d4c6'; g.beginPath(); g.arc(w / 2, h / 2, w * 0.38, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#1a1a1a'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(w / 2, h / 2); g.lineTo(w * 0.72, h * 0.32); g.stroke();
    g.strokeStyle = '#b8401a'; g.beginPath(); g.arc(w / 2, h / 2, w * 0.3, -0.6, 0.2); g.stroke(); edge(g, w, h, 0.5);
  });
  const nade = A.pxGlow(32, 40, (g, w, h) => {
    fill(g, w, h, '#2e3033');
    g.strokeStyle = 'rgba(0,0,0,0.45)'; g.lineWidth = 1.5;
    for (let x = w / 4; x < w; x += w / 4) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
    g.fillStyle = '#ff8a2a'; g.fillRect(0, h * 0.46, w, h * 0.1);
    edge(g, w, h, 0.45);
  }, (g, w, h) => { g.fillStyle = '#fff'; g.fillRect(0, h * 0.46, w, h * 0.1); });
  const tank = A.px(64, 80, (g, w, h, rng) => {
    plate(C.gun, { rivets: 2, scratch: 6, panel: true })(g, w, h, rng);
    g.fillStyle = 'rgba(255,255,255,0.1)'; g.fillRect(w * 0.15, h * 0.15, w * 0.1, h * 0.7); g.fillRect(w * 0.75, h * 0.15, w * 0.1, h * 0.7);
  });
  const upper = [
    box(U, [0, 0, 0], { all: A.region(U[2], U[1], jacket), nz: A.region(U[0], U[1], jacket), pz: A.region(U[0], U[1], jacket), py: A.region(U[0], U[2], fab(C.orange)), ny: A.region(U[0], U[2], fab(C.orangeD)) }),
    box([1.5, 1.0, 0.14], [0, -0.05, -0.56], { all: vest }),
    box([0.3, 0.08, 1.12], [0.5, 0.63, 0], { all: oliveS }), box([0.3, 0.08, 1.12], [-0.5, 0.63, 0], { all: oliveS }),
    box([1.0, 0.16, 0.86], [0, 0.66, 0.02], { all: A.px(64, 16, fab(C.black, 0.4)) }),
    box([0.16, 0.32, 0.16], [0.6, 0.14, -0.72], { all: canister }), box([0.16, 0.32, 0.16], [0.38, 0.14, -0.72], { all: canister }),
    box([0.13, 0.06, 0.13], [0.6, 0.33, -0.72], { all: steel }), box([0.13, 0.06, 0.13], [0.38, 0.33, -0.72], { all: steel }),
    box([0.18, 0.18, 0.05], [0.08, 0.26, -0.65], { all: gauge }), box([0.18, 0.18, 0.05], [0.08, 0.04, -0.65], { all: gauge }),
    box([0.2, 0.26, 0.2], [-0.3, 0.12, -0.73], { all: nade }), box([0.2, 0.26, 0.2], [-0.54, 0.12, -0.73], { all: nade }),
    box([0.08, 0.08, 0.08], [-0.3, 0.29, -0.73], { all: cm.metal }), box([0.08, 0.08, 0.08], [-0.54, 0.29, -0.73], { all: cm.metal }),
    box([1.6, 1.15, 0.5], [0, 0.05, 0.79], { all: gunD, pz: tank }),                                                   // ransel tangki
    box([0.34, 0.58, 0.34], [0.55, 0.82, 0.82], { all: gun }), box([0.34, 0.58, 0.34], [-0.55, 0.82, 0.82], { all: gun }),
    box([0.16, 0.5, 0.16], [0.72, 1.18, 0.86], { all: steel }), box([0.16, 0.5, 0.16], [-0.72, 1.18, 0.86], { all: steel }),
    box([0.16, 0.16, 0.36], [0.72, 1.4, 0.74], { all: steel, nz: burnt }), box([0.16, 0.16, 0.36], [-0.72, 1.4, 0.74], { all: steel, nz: burnt }),
  ];
  for (const x of [-0.42, 0.08]) upper.push(box([0.3, 0.34, 0.14], [x, -0.36, -0.7], { all: pouchO }));

  // ── badan bawah: celana hitam berpanel oranye, sabuk olive gesper hitam
  const L = S(RIG.lower.size);
  const lowerP: Painter = (g, w, h, rng) => {
    fill(g, w, h, css(C.black)); grain(g, w, h, rng, 0.07);
    g.fillStyle = css(C.orange); g.fillRect(0, 0, w, h * 0.3); g.fillRect(0, h * 0.55, w * 0.18, h * 0.45); g.fillRect(w * 0.82, h * 0.55, w * 0.18, h * 0.45);
    shade(g, w, h, 0.05, 0.2); edge(g, w, h, 0.3);
  };
  const lower = merge([
    box(L, [0, 0, 0], { all: A.region(L[2], L[1], lowerP), nz: A.region(L[0], L[1], lowerP), pz: A.region(L[0], L[1], lowerP) }),
    box([2.08, 0.22, 1.08], [0, 0.12, 0], { all: oliveS }),
    box([0.34, 0.2, 0.06], [0, 0.12, -0.56], { all: A.px(32, 20, buckle(0x26282b, C.oliveD)) }),
    box([0.1, 0.5, 0.3], [1.06, -0.1, -0.2], { all: blackS }),
  ]);

  // ── lengan: oranye bergaris hitam, bahu gunmetal 2 lapis berpaku, manset hitam, sarung tangan tanpa jari
  const AR = S(RIG.arm.size);
  const sleeve = A.region(AR[0], AR[1], jacketP([0.38, 0.55]));
  const hd = hand(A, C.black, SKIN_FINGER, { knuckle: 0x2b2c30, fingerless: true });
  const arm = (o: 1 | -1, band: Rect) => merge([
    box(AR, [0, 0, 0], { all: sleeve, py: A.region(AR[0], AR[2], fab(C.orange)), ny: hd.bottom }),
    box([1.32, 0.62, 1.3], [o * 0.12, 0.74, 0], { all: gun }),
    box([1.22, 0.24, 1.2], [o * 0.12, 0.36, 0], { all: gunD }),
    box([1.07, 0.2, 1.07], [0, 0.08, 0], { all: band }),
    box([1.1, 0.4, 1.1], [0, -0.48, 0], { all: blackS }),
    box([1.06, 0.42, 1.06], [0, -0.81, 0], { all: hd.side, nz: hd.front, ny: hd.bottom }),
  ]);

  // ── kaki: celana hitam berpanel oranye di paha, 2 tali olive bergesper, pelindung lutut hitam, sepatu bot berat
  const LG = S(RIG.leg.size);
  const legP = (front: boolean): Painter => (g, w, h, rng) => {
    fill(g, w, h, css(C.black)); grain(g, w, h, rng, 0.07);
    g.fillStyle = css(C.orange); if (front) { rrect(g, w * 0.08, h * 0.02, w * 0.84, h * 0.3, 4); g.fill(); } else g.fillRect(0, h * 0.02, w * 0.25, h * 0.3);
    shade(g, w, h, 0.05, 0.2); edge(g, w, h, 0.35);
  };
  const legF = A.region(LG[0], LG[1], legP(true)), legS = A.region(LG[2], LG[1], legP(false));
  const kneeP = A.px(64, 44, knee(0x232427)), buckleB = A.px(28, 20, buckle(0x26282b, C.oliveD));
  const bootF = A.px(88, 48, bootFront(0x232427, 0x5d6066)), bootS = A.px(88, 48, bootSide(0x232427)), soleR = A.px(48, 16, sole());
  const leg = (o: 1 | -1) => merge([
    box(LG, [0, 0, 0], { all: legS, nz: legF, pz: legF, ny: soleR }),
    box([1.06, 0.1, 1.06], [0, 0.42, 0], { all: oliveS }), box([1.06, 0.1, 1.06], [0, 0.18, 0], { all: oliveS }),
    box([0.22, 0.14, 0.05], [o * 0.16, 0.42, -0.55], { all: buckleB }),
    box([0.84, 0.52, 0.13], [0, -0.06, -0.57], { all: gunD, nz: kneeP }),
    box([1.12, 0.6, 1.16], [0, -0.62, -0.05], { all: bootS, nz: bootF }),
    box([1.14, 0.08, 1.18], [0, -0.88, -0.05], { all: soleR }),
  ]);

  return {
    head, upper: merge(upper), lower, legR: leg(1), legL: leg(-1), arm,
    chip: { head: C.gun, upper: C.orange, lower: C.black, armR: C.orange, armL: C.orange, legR: C.black, legL: C.black },
  };
}

export const IGNIS: SkinDef = { seed: 3103, fps: { sleeve: C.orange, cuff: C.black, glove: C.black, finger: SKIN_FINGER }, build };
