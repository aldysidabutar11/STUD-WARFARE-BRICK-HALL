// src/entities/skins/frost.ts — FROST (acuan Karakter/FROST.png): helm FAST putih berel + dudukan NVG, goggles ski biru MENYALA,
// masker hitam, headset abu; kerah bulu; jaket salju loreng poligon putih-biru abu yang menggembung (jahitan quilting), rompi pelat
// abu MOLLE + 3 kantong, radio + antena; manset rajut, sarung tangan putih berbantalan abu; celana salju loreng, kantong kargo,
// pelindung lutut putih berlis gelap, sepatu bot salju bertali & bertali gesper.
import { box, css, edge, fill, grain, merge, rrect, shade, stitch, S, RIG, type Atlas, type Common, type Painter } from '../charKit';
import { bootFront, bootSide, buckle, fab, hand, knee, lens, molle, plate, polyCamo, pouch, sole, strap, vents, type Rect, type SkinBuild, type SkinDef } from './kit';

const C = { white: 0xe4e9ee, snow: 0xcdd6de, camo1: 0xaebdcc, camo2: 0x8fa3b6, grey: 0x9aa2aa, greyD: 0x5d636b, mask: 0x2b2e33,
  black: 0x1b1d20, fur: 0xd8d0c2, rubber: 0x55595f, finger: 0x5c6168 };

/** Loreng salju poligon + jahitan quilting mendatar (jaket menggembung). */
const snow = (quilt = true): Painter => (g, w, h, rng) => {
  polyCamo(C.white, [C.camo1, C.camo2, C.snow], 0.85, 0.9)(g, w, h, rng);
  if (quilt) for (let y = 14; y < h; y += 17) { g.fillStyle = 'rgba(70,85,100,0.18)'; g.fillRect(0, y, w, 2); g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(0, y - 4, w, 2); }
  edge(g, w, h, 0.22);
};
/** Bulu kerah: helai pendek terang/gelap, tepi atas bergerigi (potongan alpha). */
const fur: Painter = (g, w, h, rng) => {
  fill(g, w, h, css(C.fur));
  for (let i = 0; i < (w * h) / 5; i++) {
    const x = rng() * w, y = rng() * h;
    g.strokeStyle = rng() < 0.55 ? 'rgba(255,255,255,0.4)' : 'rgba(110,98,84,0.28)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + (rng() - 0.5) * 4, y - 3 - rng() * 4); g.stroke();
  }
  shade(g, w, h, 0.1, 0.2);
  g.save(); g.globalCompositeOperation = 'destination-out'; g.beginPath(); g.moveTo(0, -1);
  let x = 0;
  while (x < w) { const sw = 3 + rng() * 6; g.lineTo(x + sw / 2, h * (0.06 + rng() * 0.16)); x += sw; g.lineTo(Math.min(w, x), -1); }
  g.closePath(); g.fill(); g.restore();
};

function build(A: Atlas, cm: Common): SkinBuild {
  const helm = A.px(64, 48, plate(C.white, { scratch: 2, gloss: 0.18 }));
  const helmTop = A.px(96, 96, (g, w, h, rng) => {
    plate(C.white, { gloss: 0.2 })(g, w, h, rng);
    g.fillStyle = 'rgba(120,130,140,0.35)'; rrect(g, w * 0.3, h * 0.25, w * 0.4, h * 0.3, 4); g.fill();      // panel velcro
  });
  const helmFront = A.px(96, 40, (g, w, h, rng) => {
    plate(C.white, { gloss: 0.18 })(g, w, h, rng);
    g.fillStyle = css(C.greyD); rrect(g, w * 0.36, h * 0.12, w * 0.28, h * 0.55, 3); g.fill();                  // dudukan NVG
  });
  const greyP = A.px(40, 40, plate(C.grey)), greyD = A.px(40, 40, plate(C.greyD)), rubber = A.px(64, 16, strap(C.rubber));
  const maskF = A.px(64, 40, vents(0x23262a, 3, true));
  const goggles = lens(A, 180, 58, 0x9eeaff, 0x1c58c8, { frame: 0xe8ecef, inset: [0.05, 0.14], r: 0.32 });

  // ── kepala: balaclava, helm putih berel, goggles biru, headset abu + mik, pelat masker bawah
  const H = S(RIG.head.size);
  const balaclava = A.region(H[0], H[1], fab(C.mask, 0.4));
  const head = [
    box(H, [0, 0, 0], { all: balaclava }),
    box([1.32, 0.5, 1.34], [0, 0.42, 0.02], { all: helm, nz: helmFront, py: helmTop }),
    box([1.38, 0.1, 1.38], [0, 0.2, 0.02], { all: greyP }),
    box([0.05, 0.1, 0.8], [0.68, 0.4, 0.02], { all: greyD }), box([0.05, 0.1, 0.8], [-0.68, 0.4, 0.02], { all: greyD }),
    box([0.3, 0.2, 0.1], [0, 0.5, -0.71], { all: greyD }),
    box([1.32, 0.1, 1.32], [0, 0.08, 0.02], { all: rubber }),
    box([1.14, 0.38, 0.14], [0, 0.08, -0.67], { all: greyP, nz: goggles }),
    box([0.9, 0.4, 0.1], [0, -0.33, -0.64], { all: cm.metalDark, nz: maskF }),
    box([0.16, 0.42, 0.42], [0.68, -0.1, 0.05], { all: greyD }), box([0.16, 0.42, 0.42], [-0.68, -0.1, 0.05], { all: greyD }),
    box([0.05, 0.05, 0.6], [-0.5, -0.3, -0.36], { all: greyD }, [0, -0.5, 0]),
  ];

  // ── badan atas: kerah bulu, jaket salju menggembung, rompi abu MOLLE + 3 kantong, radio + antena + kabel, tali bahu
  const U = S(RIG.upper.size);
  const jacket = A.region(U[0], U[1], snow()), jacketS = A.region(U[2], U[1], snow());
  const jacketF = A.region(U[0], U[1], (g, w, h, rng) => { snow()(g, w, h, rng); g.fillStyle = 'rgba(60,66,74,0.7)'; g.fillRect(w / 2 - 1.5, 0, 3, h); });  // ritsleting
  const vest = A.px(110, 76, molle(C.grey)), pouchG = A.px(32, 40, pouch(C.grey, C.greyD));
  const radio = A.px(24, 48, (g, w, h, rng) => {
    fill(g, w, h, '#2a2d31'); grain(g, w, h, rng, 0.07);
    g.fillStyle = 'rgba(255,255,255,0.14)'; for (let y = h * 0.2; y < h * 0.6; y += 4) g.fillRect(4, y, w - 8, 1.5);
    g.fillStyle = '#6fd2ff'; g.fillRect(w * 0.3, h * 0.7, w * 0.4, h * 0.1); edge(g, w, h, 0.5);
  });
  const furR = A.px(128, 32, fur);
  const upper = [
    box(U, [0, 0, 0], { all: jacketS, nz: jacketF, pz: jacket, py: A.region(U[0], U[2], snow(false)), ny: A.region(U[0], U[2], snow(false)) }),
    box([1.48, 0.94, 0.14], [0, -0.07, -0.56], { all: vest }),
    box([0.28, 0.08, 1.12], [0.5, 0.63, 0], { all: rubber }), box([0.28, 0.08, 1.12], [-0.5, 0.63, 0], { all: rubber }),
    box([0.18, 0.44, 0.14], [0.52, 0.18, -0.71], { all: cm.metalDark, nz: radio }),
    box([0.03, 0.42, 0.03], [0.58, 0.6, -0.71], { all: cm.metalDark }),
    box([0.04, 0.5, 0.04], [0.36, 0.02, -0.66], { all: cm.metalDark }, [0, 0, 0.5]),
    box([1.66, 0.34, 1.26], [0, 0.68, 0.06], { all: furR }),
  ];
  for (const x of [-0.4, 0, 0.4]) upper.push(box([0.3, 0.36, 0.14], [x, -0.34, -0.7], { all: pouchG }));

  // ── badan bawah: ujung jaket menggembung, sabuk abu bergesper, celana salju
  const L = S(RIG.lower.size);
  const pantsP = snow(false), pants = A.region(L[0], L[1], pantsP);
  const belt = A.px(96, 24, strap(C.greyD)), buckleG = A.px(32, 20, buckle(0x2d3035, C.greyD));
  const lower = merge([
    box(L, [0, 0, 0], { all: A.region(L[2], L[1], pantsP), nz: pants, pz: pants }),
    box([2.12, 0.3, 1.12], [0, 0.28, 0], { all: A.region(2.12, 0.3, snow()) }),
    box([2.08, 0.2, 1.08], [0, 0.06, 0], { all: belt }),
    box([0.3, 0.18, 0.06], [0, 0.06, -0.56], { all: buckleG }),
  ]);

  // ── lengan: lengan atas menggembung loreng salju, tempelan velcro di bahu luar, manset rajut, sarung tangan putih
  const AR = S(RIG.arm.size);
  const sleeve = A.region(AR[0], AR[1], snow()), puff = A.region(1.12, 1.15, snow());
  const knit = A.px(80, 24, (g, w, h, rng) => {
    fill(g, w, h, css(0xc4cbd2)); grain(g, w, h, rng, 0.05);
    g.fillStyle = 'rgba(0,0,0,0.13)'; for (let x = 0; x < w; x += 4) g.fillRect(x, 0, 2, h);
    edge(g, w, h, 0.35);
  });
  const patch = A.px(24, 32, (g, w, h, rng) => { fill(g, w, h, css(0xbcc4cc)); grain(g, w, h, rng, 0.06); stitch(g, 2, 2, w - 2, 2, 'rgba(0,0,0,0.3)'); stitch(g, 2, h - 2, w - 2, h - 2, 'rgba(0,0,0,0.3)'); edge(g, w, h, 0.45); });
  const hd = hand(A, 0xd5dbe0, C.finger, { knuckle: C.greyD, plate: 0xbfc6cd, fingerless: false });
  const arm = (o: 1 | -1, band: Rect) => merge([
    box(AR, [0, 0, 0], { all: sleeve, ny: hd.bottom }),
    box([1.12, 1.15, 1.12], [0, 0.4, 0], { all: puff }),
    box([0.06, 0.34, 0.48], [o * 0.59, 0.62, 0], { all: patch }),
    box([1.16, 0.2, 1.16], [0, 0.0, 0], { all: band }),
    box([1.1, 0.26, 1.1], [0, -0.5, 0], { all: knit }),
    box([1.06, 0.42, 1.06], [0, -0.81, 0], { all: hd.side, nz: hd.front, ny: hd.bottom }),
  ]);

  // ── kaki: celana salju loreng (longgar), kantong kargo, pelindung lutut putih berlis gelap, sepatu bot salju
  const LG = S(RIG.leg.size);
  const legF = A.region(LG[0], LG[1], snow(false)), legS = A.region(LG[2], LG[1], snow(false));
  const cargo = A.px(36, 40, pouch(C.camo1, 0xb7c3cf));
  const kneeP = A.px(64, 44, knee(0xd8dee3, C.greyD));
  const bootF = A.px(88, 48, bootFront(0xd8dee3, 0x2b2e33, 0x9aa2aa)), bootS = A.px(88, 48, bootSide(0xd8dee3, C.greyD)), soleR = A.px(48, 16, sole(0x3a3e44));
  const leg = (o: 1 | -1) => merge([
    box([1.04, 1.8, 1.04], [0, 0, 0], { all: legS, nz: legF, pz: legF, ny: soleR }),
    box([0.1, 0.44, 0.5], [o * 0.56, 0.26, 0], { all: cargo }),
    box([0.82, 0.52, 0.13], [0, -0.06, -0.58], { all: greyD, nz: kneeP }),
    box([1.12, 0.56, 1.16], [0, -0.62, -0.05], { all: bootS, nz: bootF }),
    box([1.16, 0.12, 1.2], [0, -0.52, -0.05], { all: rubber }),
    box([1.14, 0.08, 1.18], [0, -0.87, -0.05], { all: soleR }),
  ]);

  return {
    head: merge(head), upper: merge(upper), lower, legR: leg(1), legL: leg(-1), arm,
    chip: { head: C.white, upper: C.white, lower: C.snow, armR: C.white, armL: C.white, legR: C.snow, legL: C.snow },
  };
}

export const FROST: SkinDef = { seed: 3102, fps: { sleeve: 0xdfe5ea, cuff: 0xc4cbd2, glove: 0xd2d8dd, finger: C.finger }, build };
