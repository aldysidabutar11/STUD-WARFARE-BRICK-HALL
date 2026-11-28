// src/entities/skins/pharaoh.ts — PHARAOH (acuan Karakter/PHARAOH.png): topeng serigala hitam-emas bersegi (telinga tinggi, moncong,
// mata emas MENYALA), mantel panjang hitam berlapis merah (terbuka di depan), rompi dada hitam bergesper emas + 3 kantong, bahu
// emas bersegi dua tingkat, sarung tangan berbuku jari emas, celana kargo bertali gesper emas, pelindung lutut berlis emas, bot hitam.
import { box, css, edge, fill, grain, merge, rrect, shade, S, RIG, type Atlas, type Common, type G } from '../charKit';
import {
  bootFront, bootSide, buckle, cloth, fab, hand, knee, molle, plate, poly, pouch, sole, strap, type Rect, type SkinBuild, type SkinDef,
} from './kit';

const C = { black: 0x1c1c1f, coal: 0x2a2a2f, coat: 0x232327, gold: 0xd9aa3e, goldL: 0xf2cd6c, goldD: 0x9a7224, red: 0x7f1717,
  eye: 0xffd35a, finger: 0xc9a040 };

function build(A: Atlas, cm: Common): SkinBuild {
  const gold = A.px(48, 48, plate(C.gold, { rivets: 1.8, gloss: 0.25 }));
  const goldPlain = A.px(32, 32, plate(C.gold, { gloss: 0.2 }));
  const goldDark = A.px(48, 32, plate(C.goldD, { rivets: 1.5 }));
  const blackP = A.px(48, 48, plate(C.coal, { scratch: 2 }));
  const coatF = cloth(C.coat, 0, 4, 0.3);
  const coat = A.px(64, 64, coatF);
  const lining = A.px(64, 96, cloth(C.red, 0, 3, 0.2));
  const coatTail = A.px(96, 104, (g, w, h, rng) => { coatF(g, w, h, rng); g.fillStyle = 'rgba(217,170,62,0.5)'; g.fillRect(0, h - 4, w, 3); });
  const goldBuckle = A.px(32, 20, buckle(C.gold, C.black));
  const belt = A.px(96, 24, strap(C.black));

  // ── kepala: topeng serigala — dahi & alis emas bersegi, mata menyala, moncong emas berhidung hitam, telinga tinggi bertingkat
  const H = S(RIG.head.size);
  const face = A.regionGlow(H[0], H[1], (g, w, h, rng) => {
    fill(g, w, h, css(C.black)); grain(g, w, h, rng, 0.05);
    g.fillStyle = css(C.gold);
    poly(g, [[0.32, 0], [0.68, 0], [0.62, 0.3], [0.5, 0.42], [0.38, 0.3]], w, h); g.fill();                       // dahi
    poly(g, [[0.04, 0.3], [0.36, 0.34], [0.46, 0.5], [0.1, 0.46]], w, h); g.fill();                              // alis kiri
    poly(g, [[0.96, 0.3], [0.64, 0.34], [0.54, 0.5], [0.9, 0.46]], w, h); g.fill();
    poly(g, [[0.06, 0.62], [0.36, 0.6], [0.44, 0.98], [0.16, 0.98]], w, h); g.fill();                            // pipi
    poly(g, [[0.94, 0.62], [0.64, 0.6], [0.56, 0.98], [0.84, 0.98]], w, h); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.25)'; poly(g, [[0.32, 0], [0.5, 0], [0.5, 0.42], [0.38, 0.3]], w, h); g.fill();   // faset terang
    g.fillStyle = css(C.eye);                                                                                    // mata (menyala)
    poly(g, [[0.14, 0.5], [0.4, 0.52], [0.36, 0.6], [0.18, 0.58]], w, h); g.fill();
    poly(g, [[0.86, 0.5], [0.6, 0.52], [0.64, 0.6], [0.82, 0.58]], w, h); g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 1.5;
    for (const pts of [[[0.5, 0.42], [0.5, 1]], [[0.36, 0.34], [0.06, 0.3]], [[0.64, 0.34], [0.94, 0.3]]]) { g.beginPath(); g.moveTo(pts[0][0] * w, pts[0][1] * h); g.lineTo(pts[1][0] * w, pts[1][1] * h); g.stroke(); }
    edge(g, w, h, 0.4);
  }, (g, w, h) => {
    g.fillStyle = '#fff';
    poly(g, [[0.14, 0.5], [0.4, 0.52], [0.36, 0.6], [0.18, 0.58]], w, h); g.fill();
    poly(g, [[0.86, 0.5], [0.6, 0.52], [0.64, 0.6], [0.82, 0.58]], w, h); g.fill();
  });
  const headSide = A.region(H[2], H[1], (g, w, h, rng) => {
    fill(g, w, h, css(C.black)); grain(g, w, h, rng, 0.05);
    g.fillStyle = css(C.gold); poly(g, [[0, 0.5], [0.5, 0.42], [0.62, 0.7], [0, 0.98]], w, h); g.fill();          // pelat pipi
    g.fillStyle = 'rgba(255,255,255,0.18)'; poly(g, [[0, 0.5], [0.5, 0.42], [0.3, 0.6]], w, h); g.fill();
    shade(g, w, h, 0.1, 0.25); edge(g, w, h, 0.4);
  });
  const headTop = A.region(H[0], H[2], (g, w, h, rng) => {
    fill(g, w, h, css(C.black)); grain(g, w, h, rng, 0.05);
    g.fillStyle = css(C.gold); g.fillRect(w * 0.44, 0, w * 0.12, h);                                              // punggung emas
    edge(g, w, h, 0.4);
  });
  const muzzleTop = A.px(48, 40, (g, w, h, rng) => {
    fill(g, w, h, css(C.gold)); grain(g, w, h, rng, 0.05);
    g.fillStyle = 'rgba(255,255,255,0.28)'; g.fillRect(0, 0, w / 2, h); g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(w / 2, 0, w / 2, h);
    edge(g, w, h, 0.45);
  });
  const muzzleFront = A.px(48, 34, (g, w, h, rng) => {
    fill(g, w, h, css(C.gold)); grain(g, w, h, rng, 0.05);
    g.fillStyle = css(C.black); rrect(g, w * 0.26, 0, w * 0.48, h * 0.42, 4); g.fill();                            // hidung
    g.fillStyle = 'rgba(0,0,0,0.75)'; g.fillRect(w * 0.12, h * 0.72, w * 0.76, h * 0.12);                          // mulut
    edge(g, w, h, 0.45);
  });
  // telinga segitiga runcing (potongan alpha): depan = bingkai emas + bagian dalam hitam, belakang hitam berlis emas, sisi = siluet emas
  const tri = (g: G, w: number, h: number, k = 0) => poly(g, [[k, 1], [0.5, k * 0.9], [1 - k, 1]], w, h);
  const earFront = A.px(40, 80, (g, w, h, rng) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = css(C.gold); tri(g, w, h); g.fill();
    g.save(); tri(g, w, h); g.clip(); grain(g, w, h, rng, 0.05);
    g.fillStyle = 'rgba(255,255,255,0.22)'; poly(g, [[0, 1], [0.5, 0], [0.5, 1]], w, h); g.fill(); g.restore();
    g.fillStyle = css(C.black); tri(g, w, h, 0.22); g.fill();
  });
  const earBack = A.px(40, 80, (g, w, h) => {
    g.clearRect(0, 0, w, h); g.fillStyle = css(C.gold); tri(g, w, h); g.fill(); g.fillStyle = css(C.coal); tri(g, w, h, 0.1); g.fill();
  });
  const earSide = A.px(16, 80, (g, w, h) => { g.clearRect(0, 0, w, h); g.fillStyle = css(C.goldD); tri(g, w, h); g.fill(); });
  const head = [
    box(H, [0, 0, 0], { all: headSide, nz: face, py: headTop, pz: A.region(H[0], H[1], fab(C.black, 0.4)), ny: cm.glove }),
    box([1.26, 0.1, 1.26], [0, 0.36, 0], { all: goldPlain }),                                                      // diadem
    box([0.6, 0.42, 0.5], [0, -0.28, -0.82], { all: goldDark, py: muzzleTop, nz: muzzleFront }),                   // moncong
    box([0.24, 0.12, 0.08], [0, -0.13, -1.08], { all: cm.metalDark }),                                             // ujung hidung
    box([0.14, 0.44, 0.5], [0.66, -0.06, 0.02], { all: blackP, px: gold }), box([0.14, 0.44, 0.5], [-0.66, -0.06, 0.02], { all: blackP, nx: gold }),
  ];
  for (const s of [1, -1]) head.push(                                                                              // telinga runcing miring keluar
    box([0.52, 1.02, 0.18], [s * 0.4, 1.02, 0.12], { nz: earFront, pz: earBack, px: earSide, nx: earSide, py: cm.T, ny: cm.T }, [0, 0, -s * 0.15]),
  );

  // ── badan atas: mantel hitam terbuka (kerah lapel), rompi dada MOLLE + gesper emas, tali bahu, 3 kantong magasin
  const U = S(RIG.upper.size);
  const upperFront = A.region(U[0], U[1], (g, w, h, rng) => {
    coatF(g, w, h, rng);
    g.fillStyle = 'rgba(0,0,0,0.35)'; poly(g, [[0.3, 0], [0.7, 0], [0.62, 1], [0.38, 1]], w, h); g.fill();          // celah mantel terbuka
  });
  const rig = A.px(104, 76, molle(C.black));
  const pouchG = A.px(32, 40, pouch(C.black, C.coal));
  const upper = [
    box(U, [0, 0, 0], { all: coat, nz: upperFront }),
    box([1.24, 0.96, 0.12], [0, -0.06, -0.56], { all: rig }),
    box([0.34, 0.2, 0.06], [0, 0.3, -0.64], { all: goldBuckle }),
    box([0.26, 0.08, 1.12], [0.42, 0.63, 0], { all: belt }), box([0.26, 0.08, 1.12], [-0.42, 0.63, 0], { all: belt }),
    box([0.2, 0.92, 0.05], [0.42, 0.05, -0.64], { all: belt }), box([0.2, 0.92, 0.05], [-0.42, 0.05, -0.64], { all: belt }),
    box([0.5, 0.46, 0.14], [0.6, 0.5, -0.55], { all: coat }, [0, 0, -0.35]),                                        // lapel kerah
    box([0.5, 0.46, 0.14], [-0.6, 0.5, -0.55], { all: coat }, [0, 0, 0.35]),
    box([1.5, 0.3, 1.1], [0, 0.7, 0.06], { all: coat, py: blackP }),                                                // kerah tinggi
  ];
  for (const x of [-0.38, 0, 0.38]) upper.push(box([0.3, 0.36, 0.14], [x, -0.32, -0.69], { all: pouchG }));
  const parts = { head: merge(head), upper: merge(upper) } as Partial<SkinBuild>;

  // ── badan bawah: sabuk hitam gesper emas, ekor mantel (belakang & samping, dalam merah; depan terbuka), kantong paha
  const L = S(RIG.lower.size);
  const lowerFront = A.region(L[0], L[1], (g, w, h, rng) => { fill(g, w, h, css(C.black)); grain(g, w, h, rng, 0.06); shade(g, w, h, 0.05, 0.2); edge(g, w, h, 0.35); });
  parts.lower = merge([
    box(L, [0, 0, 0], { all: coat, nz: lowerFront }),
    box([2.08, 0.22, 1.08], [0, 0.18, 0], { all: belt }),
    box([0.32, 0.18, 0.06], [0, 0.18, -0.56], { all: goldBuckle }),
    box([2.2, 1.36, 0.08], [0, -0.96, 0.6], { pz: coatTail, nz: lining, all: coat }, [0.1, 0, 0]),                  // ekor belakang
    box([0.08, 1.36, 1.1], [1.1, -0.96, 0.04], { px: coatTail, nx: lining, all: coat }),
    box([0.08, 1.36, 1.1], [-1.1, -0.96, 0.04], { nx: coatTail, px: lining, all: coat }),
    box([0.38, 1.28, 0.08], [0.86, -0.92, -0.58], { nz: coatTail, pz: lining, all: coat }),
    box([0.38, 1.28, 0.08], [-0.86, -0.92, -0.58], { nz: coatTail, pz: lining, all: coat }),
  ]);

  // ── lengan: lengan mantel, bahu emas dua tingkat, gauntlet hitam berlis emas, sarung tangan berbuku emas
  const AR = S(RIG.arm.size);
  const sleeve = A.region(AR[0], AR[1], coatF), sleeveTop = A.region(AR[0], AR[2], coatF);
  const gaunt = A.px(64, 40, (g, w, h, rng) => {
    fill(g, w, h, css(C.black)); grain(g, w, h, rng, 0.06);
    g.fillStyle = css(C.gold); g.fillRect(0, 0, w, h * 0.16); g.fillRect(0, h * 0.84, w, h * 0.16);
    g.fillStyle = 'rgba(217,170,62,0.55)'; rrect(g, w * 0.25, h * 0.32, w * 0.5, h * 0.36, 3); g.fill();
    shade(g, w, h, 0.08, 0.25); edge(g, w, h, 0.5);
  });
  const hd = hand(A, C.black, C.finger, { knuckle: C.gold, plate: C.gold, fingerless: true });
  const arm = (o: 1 | -1, band: Rect) => merge([
    box(AR, [0, 0, 0], { all: sleeve, py: sleeveTop, ny: hd.bottom }),
    box([1.32, 0.62, 1.28], [o * 0.1, 0.76, 0], { all: gold }),
    box([1.22, 0.3, 1.18], [o * 0.12, 0.36, 0], { all: goldDark }),
    box([1.07, 0.2, 1.07], [0, 0.02, 0], { all: band }),
    box([1.1, 0.6, 1.1], [0, -0.4, 0], { all: gaunt }),
    box([1.06, 0.42, 1.06], [0, -0.81, 0], { all: hd.side, nz: hd.front, ny: hd.bottom }),
  ]);

  // ── kaki: celana kargo hitam, 2 tali paha bergesper emas, pelindung lutut berlis emas, bot hitam
  const LG = S(RIG.leg.size);
  const pants = (side: boolean) => A.region(side ? LG[2] : LG[0], LG[1], (g, w, h, rng) => {
    fill(g, w, h, css(C.black)); grain(g, w, h, rng, 0.07);
    if (side) { g.fillStyle = 'rgba(255,255,255,0.05)'; rrect(g, w * 0.18, h * 0.3, w * 0.64, h * 0.22, 3); g.fill(); }     // kantong kargo
    shade(g, w, h, 0.05, 0.2); edge(g, w, h, 0.35);
  });
  const pantsF = pants(false), pantsS = pants(true);
  const kneeP = A.px(64, 44, knee(C.black, C.gold));
  const bootF = A.px(88, 44, bootFront(0x18181a, 0x6d6f74)), bootS = A.px(88, 44, bootSide(0x18181a)), soleR = A.px(48, 16, sole());
  const leg = (o: 1 | -1) => merge([
    box(LG, [0, 0, 0], { all: pantsS, nz: pantsF, pz: pantsF, ny: soleR }),
    box([1.06, 0.1, 1.06], [0, 0.44, 0], { all: belt }), box([1.06, 0.1, 1.06], [0, 0.2, 0], { all: belt }),
    box([0.2, 0.14, 0.05], [o * 0.18, 0.44, -0.55], { all: goldBuckle }), box([0.2, 0.14, 0.05], [o * 0.18, 0.2, -0.55], { all: goldBuckle }),
    box([0.8, 0.5, 0.12], [0, -0.06, -0.56], { all: blackP, nz: kneeP }),
    box([1.08, 0.52, 1.14], [0, -0.64, -0.05], { all: bootS, nz: bootF }),
    box([1.1, 0.08, 1.16], [0, -0.87, -0.05], { all: soleR }),
  ]);
  parts.legR = leg(1); parts.legL = leg(-1);

  return {
    head: parts.head!, upper: parts.upper!, lower: parts.lower!, legR: parts.legR!, legL: parts.legL!, arm,
    chip: { head: C.gold, upper: C.coat, lower: C.black, armR: C.gold, armL: C.gold, legR: C.black, legL: C.black },
  };
}

export const PHARAOH: SkinDef = {
  seed: 3101,
  fps: { sleeve: C.coat, cuff: C.gold, glove: C.black, finger: C.finger },
  build,
};

