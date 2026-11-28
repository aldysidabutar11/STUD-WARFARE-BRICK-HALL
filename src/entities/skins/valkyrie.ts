// src/entities/skins/valkyrie.ts — VALKYRIE (acuan Karakter/VALKYRIE.png): wajah perempuan (alis, mata almond cokelat tua bereyeliner),
// topeng oni merah-hitam bertaring emas menutup wajah bawah, rambut hitam berponi samping + kuncir tinggi yang terurai, jepit rambut;
// jaket kulit merah berpanel hitam + kerah tinggi beritsleting, rompi pelat hitam + 3 kantong, tali selempang, KATANA bersarung di
// punggung (gagang di belakang bahu kiri); bahu emas 2 lapis, manset rajut hitam, sarung tangan tanpa jari; perut terbuka, sabuk
// hitam; celana kargo hitam dengan harness paha merah bergesper, holster paha, pelindung lutut, sepatu bot tinggi bertali merah.
import { box, css, edge, fill, grain, merge, rrect, shade, stitch, S, RIG, type Atlas, type Common, type G, type Painter } from '../charKit';
import {
  SKIN_FINGER, bootFront, bootSide, buckle, fab, hand, knee, molle, plate, poly, pouch, sole, strap, tear, type Rect, type SkinBuild, type SkinDef,
} from './kit';

const C = { black: 0x1b1b1e, coal: 0x2b2b30, red: 0xa8222c, redD: 0x6e1219, gold: 0xd6a33d, skin: 0xe8b58e, hair: 0x141215,
  iris: 0x3a2214, lace: 0x8e1f2a };

const leather = (c: number): Painter => (g, w, h, rng) => {
  fill(g, w, h, css(c)); grain(g, w, h, rng, 0.045, 1.5);
  const gr = g.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, 'rgba(255,255,255,0.1)'); gr.addColorStop(0.4, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.18)');
  g.fillStyle = gr; g.fillRect(0, 0, w, h); shade(g, w, h, 0.06, 0.2); edge(g, w, h, 0.3);
};
const hairFill = (g: G, w: number, h: number, rng: () => number) => {
  fill(g, w, h, css(C.hair));
  for (let i = 0; i < w * 0.9; i++) {
    const x = rng() * w; g.strokeStyle = rng() < 0.5 ? 'rgba(90,90,110,0.3)' : 'rgba(0,0,0,0.4)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(x, 0); g.quadraticCurveTo(x + (rng() - 0.5) * 6, h * 0.5, x + (rng() - 0.5) * 8, h); g.stroke();
  }
};

function build(A: Atlas, cm: Common): SkinBuild {
  const goldP = A.px(48, 40, plate(C.gold, { gloss: 0.3, rivets: 1.5 })), goldD = A.px(40, 32, plate(0xb38428, { gloss: 0.2 }));
  const blackS = A.px(64, 24, strap(C.black)), redS = A.px(64, 24, strap(C.red));
  const hairSw = A.px(48, 64, (g, w, h, rng) => { hairFill(g, w, h, rng); edge(g, w, h, 0.25); });
  const hairLong = A.px(48, 96, (g, w, h, rng) => { hairFill(g, w, h, rng); tear(g, w, h, rng, 0.12); });

  // ── kepala: wajah (alis, mata), topeng oni, rambut (atas, poni, samping, belakang), kuncir tinggi + helai, jepit
  const H = S(RIG.head.size);
  const face = A.region(H[0], H[1], (g, w, h, rng) => {
    fill(g, w, h, css(C.skin)); grain(g, w, h, rng, 0.02);
    const vol = g.createRadialGradient(w / 2, h * 0.45, w * 0.1, w / 2, h * 0.5, w * 0.7); vol.addColorStop(0, 'rgba(255,255,255,0.06)'); vol.addColorStop(1, 'rgba(120,60,40,0.22)');
    g.fillStyle = vol; g.fillRect(0, 0, w, h);
    for (const s of [-1, 1]) {
      const cx = w / 2 + s * w * 0.2, cy = h * 0.42;
      g.strokeStyle = '#2a1a14'; g.lineWidth = 3.5; g.beginPath(); g.moveTo(cx - s * w * 0.11, cy - h * 0.1); g.quadraticCurveTo(cx, cy - h * 0.14, cx + s * w * 0.12, cy - h * 0.08); g.stroke();   // alis
      g.fillStyle = '#fbf6f0'; g.beginPath(); g.ellipse(cx, cy, w * 0.09, h * 0.042, 0, 0, Math.PI * 2); g.fill();                                // putih mata
      g.fillStyle = css(C.iris); g.beginPath(); g.arc(cx + s * 1, cy, h * 0.036, 0, Math.PI * 2); g.fill();                                       // iris
      g.fillStyle = '#0b0605'; g.beginPath(); g.arc(cx + s * 1, cy, h * 0.016, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.9)'; g.fillRect(cx + s * 1 - 2, cy - h * 0.022, 2.5, 2.5);
      g.strokeStyle = '#150c09'; g.lineWidth = 2.5; g.beginPath(); g.ellipse(cx, cy, w * 0.092, h * 0.044, 0, Math.PI * 1.05, Math.PI * 1.95); g.stroke();   // garis mata
      g.beginPath(); g.moveTo(cx + s * w * 0.09, cy - h * 0.01); g.lineTo(cx + s * w * 0.13, cy - h * 0.03); g.stroke();                         // sayap eyeliner
    }
    edge(g, w, h, 0.15);
  });
  const headSide = A.region(H[2], H[1], (g, w, h, rng) => { fill(g, w, h, css(C.skin)); grain(g, w, h, rng, 0.02); shade(g, w, h, 0.05, 0.25); });
  const oni = A.px(120, 64, (g, w, h, rng) => {
    fill(g, w, h, css(C.red)); grain(g, w, h, rng, 0.05);
    g.fillStyle = css(C.redD); poly(g, [[0, 0], [0.18, 0], [0.1, 1], [0, 1]], w, h); g.fill(); poly(g, [[1, 0], [0.82, 0], [0.9, 1], [1, 1]], w, h); g.fill();
    g.fillStyle = css(C.black); poly(g, [[0.42, 0], [0.58, 0], [0.62, 0.36], [0.5, 0.44], [0.38, 0.36]], w, h); g.fill();                     // hidung
    g.fillStyle = '#0c0b0d'; rrect(g, w * 0.22, h * 0.5, w * 0.56, h * 0.34, 8); g.fill();                                                       // mulut
    g.fillStyle = '#e2c66a';
    for (let i = 0; i < 6; i++) { const x = w * (0.26 + i * 0.09); poly(g, [[x / w, 0.5], [(x + w * 0.07) / w, 0.5], [(x + w * 0.035) / w, 0.62]], w, h); g.fill(); }     // gigi atas
    poly(g, [[0.24, 0.84], [0.3, 0.84], [0.27, 0.6]], w, h); g.fill(); poly(g, [[0.76, 0.84], [0.7, 0.84], [0.73, 0.6]], w, h); g.fill(); // taring bawah
    g.strokeStyle = css(C.black); g.lineWidth = 2;
    for (const s of [-1, 1]) { g.beginPath(); g.moveTo(w / 2 + s * w * 0.18, h * 0.14); g.quadraticCurveTo(w / 2 + s * w * 0.3, h * 0.3, w / 2 + s * w * 0.42, h * 0.2); g.stroke(); }  // garis pipi
    g.strokeStyle = css(C.gold); g.lineWidth = 2; g.strokeRect(1, 1, w - 2, h - 2);
    shade(g, w, h, 0.1, 0.25);
  });
  const fringe = A.px(104, 28, (g, w, h, rng) => {                                                                     // poni samping (bawah melengkung = potongan)
    g.clearRect(0, 0, w, h);
    g.save(); g.beginPath(); g.moveTo(0, 0); g.lineTo(w, 0); g.lineTo(w, h * 0.35); g.quadraticCurveTo(w * 0.55, h * 1.05, w * 0.05, h * 0.55); g.lineTo(0, h); g.closePath(); g.clip();
    hairFill(g, w, h, rng); g.restore();
  });
  const head = merge([
    box(H, [0, 0, 0], { all: headSide, nz: face, py: hairSw, pz: hairSw }),
    box([1.04, 0.56, 0.16], [0, -0.31, -0.66], { all: goldD, nz: oni }),
    box([1.3, 0.32, 1.3], [0, 0.57, 0.02], { all: hairSw }),
    box([1.3, 0.34, 0.08], [0, 0.4, -0.64], { all: cm.T, nz: fringe }),
    box([0.1, 1.0, 1.2], [0.65, 0.0, 0.05], { all: hairLong }), box([0.1, 1.0, 1.2], [-0.65, 0.0, 0.05], { all: hairLong }),
    box([1.28, 1.05, 0.1], [0, -0.05, 0.65], { all: hairLong }),
    box([0.32, 0.28, 0.32], [0, 0.6, 0.72], { all: A.px(24, 24, fab(0x3a2a20, 0.4)) }),                               // ikat kuncir
    box([0.3, 0.95, 0.24], [0, 0.15, 0.93], { all: hairLong }, [-0.45, 0, 0]),
    box([0.22, 0.62, 0.16], [0.22, -0.2, 1.0], { all: hairLong }, [-0.3, 0, 0.5]),
    box([0.06, 0.16, 0.26], [0.67, 0.42, -0.2], { all: cm.metal }),
  ]);

  // ── badan atas: jaket kulit merah berpanel hitam, kerah tinggi, rompi hitam + 3 kantong, selempang, katana bersarung di punggung
  const U = S(RIG.upper.size);
  const jacketF = A.region(U[0], U[1], (g, w, h, rng) => {
    leather(C.red)(g, w, h, rng);
    g.fillStyle = css(C.black); g.fillRect(0, 0, w * 0.12, h); g.fillRect(w * 0.88, 0, w * 0.12, h);
    g.fillStyle = '#c8c8cc'; g.fillRect(w / 2 - 1, 0, 2, h);                                                           // ritsleting
  });
  const jacketS = A.region(U[2], U[1], leather(C.black)), jacketB = A.region(U[0], U[1], (g, w, h, rng) => { leather(C.red)(g, w, h, rng); g.fillStyle = css(C.black); g.fillRect(w * 0.4, 0, w * 0.2, h); });
  const saya = A.px(16, 160, (g, w, h, rng) => { fill(g, w, h, '#141316'); grain(g, w, h, rng, 0.04); g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(2, 0, 2, h); g.fillStyle = css(C.gold); g.fillRect(0, h - 12, w, 12); });
  const tsuka = A.px(16, 56, (g, w, h) => {
    fill(g, w, h, '#16151a');
    g.fillStyle = css(C.gold); for (let y = 2; y < h - 4; y += 8) { g.beginPath(); g.moveTo(w / 2, y); g.lineTo(w, y + 4); g.lineTo(w / 2, y + 8); g.lineTo(0, y + 4); g.closePath(); g.fill(); }
    g.fillStyle = '#0c0b0d'; for (let y = 2; y < h - 4; y += 8) { g.beginPath(); g.moveTo(w / 2, y + 2); g.lineTo(w * 0.75, y + 4); g.lineTo(w / 2, y + 6); g.lineTo(w * 0.25, y + 4); g.closePath(); g.fill(); }
  });
  const rot = 0.62, ux = -Math.sin(rot), uy = Math.cos(rot), at = (d: number): [number, number, number] => [0.1 + ux * d, -0.2 + uy * d, 0.68];
  const upper = [
    box(U, [0, 0, 0], { all: jacketS, nz: jacketF, pz: jacketB, py: A.region(U[0], U[2], leather(C.red)), ny: A.region(U[0], U[2], leather(C.black)) }),
    box([1.3, 0.92, 0.14], [0, -0.1, -0.56], { all: A.px(100, 72, molle(C.black)) }),
    box([1.36, 0.3, 1.08], [0, 0.68, 0.05], { all: A.px(80, 20, leather(C.red)) }),
    box([2.2, 0.16, 0.08], [0.1, 0.12, -0.66], { all: blackS }, [0, 0, rot]),
    box([0.14, 2.9, 0.14], [0.1, -0.2, 0.68], { all: saya }, [0, 0, rot]),                                             // sarung katana
    box([0.32, 0.06, 0.32], at(1.48), { all: goldP }, [0, 0, rot]),                                                   // tsuba
    box([0.13, 0.76, 0.13], at(1.89), { all: tsuka }, [0, 0, rot]),                                                   // gagang
    box([0.16, 0.08, 0.16], at(2.3), { all: goldP }, [0, 0, rot]),
  ];
  for (const x of [-0.38, 0, 0.38]) upper.push(box([0.3, 0.34, 0.14], [x, -0.36, -0.69], { all: A.px(32, 40, pouch(C.black, C.coal)) }));

  // ── badan bawah: perut terbuka (pusar), ujung atasan hitam, sabuk hitam gesper perak, celana hitam
  const L = S(RIG.lower.size);
  const lowerP = (front: boolean): Painter => (g, w, h, rng) => {
    fill(g, w, h, css(C.black)); grain(g, w, h, rng, 0.06);
    g.fillStyle = css(C.skin); g.fillRect(0, h * 0.06, w, h * 0.34);
    if (front) { g.fillStyle = 'rgba(120,60,40,0.55)'; g.beginPath(); g.ellipse(w / 2, h * 0.28, 2, 3, 0, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = css(C.black); g.fillRect(0, 0, w, h * 0.06);
    shade(g, w, h, 0.04, 0.18); edge(g, w, h, 0.25);
  };
  const lower = merge([
    box(L, [0, 0, 0], { all: A.region(L[2], L[1], lowerP(false)), nz: A.region(L[0], L[1], lowerP(true)), pz: A.region(L[0], L[1], lowerP(false)) }),
    box([2.08, 0.2, 1.08], [0, -0.04, 0], { all: blackS }),
    box([0.3, 0.18, 0.06], [0, -0.04, -0.56], { all: A.px(32, 20, buckle(0xb9bcc2, C.black)) }),
    box([0.16, 0.3, 0.16], [-0.86, -0.18, -0.42], { all: A.px(16, 24, (g, w, h) => { fill(g, w, h, '#2a2a2e'); g.fillStyle = css(C.red); g.fillRect(0, h * 0.4, w, h * 0.2); }) }),
  ]);

  // ── lengan: kulit merah berpanel hitam, bahu emas 2 lapis, manset rajut hitam, sarung tangan tanpa jari
  const AR = S(RIG.arm.size);
  const sleeve = A.region(AR[0], AR[1], (g, w, h, rng) => { leather(C.red)(g, w, h, rng); g.fillStyle = css(C.black); g.fillRect(0, h * 0.45, w, h * 0.12); });
  const sleeveOut = A.region(AR[2], AR[1], (g, w, h, rng) => { leather(C.red)(g, w, h, rng); g.fillStyle = css(C.black); g.fillRect(w * 0.35, 0, w * 0.3, h); });
  const knit = A.px(80, 24, (g, w, h, rng) => { fill(g, w, h, css(C.black)); grain(g, w, h, rng, 0.05); g.fillStyle = 'rgba(255,255,255,0.06)'; for (let x = 0; x < w; x += 4) g.fillRect(x, 0, 2, h); edge(g, w, h, 0.4); });
  const hd = hand(A, C.black, SKIN_FINGER, { knuckle: 0x2a2a2e, fingerless: true });
  const arm = (o: 1 | -1, band: Rect) => merge([
    box(AR, [0, 0, 0], { all: sleeve, [o > 0 ? 'px' : 'nx']: sleeveOut, py: A.region(AR[0], AR[2], leather(C.red)), ny: hd.bottom }),
    box([1.2, 0.48, 1.16], [o * 0.08, 0.8, 0], { all: goldP }),
    box([1.12, 0.22, 1.08], [o * 0.1, 0.48, 0], { all: goldD }),
    box([1.07, 0.2, 1.07], [0, 0.16, 0], { all: band }),
    box([1.1, 0.3, 1.1], [0, -0.5, 0], { all: knit }),
    box([1.06, 0.42, 1.06], [0, -0.81, 0], { all: hd.side, nz: hd.front, ny: hd.bottom }),
  ]);

  // ── kaki: kargo hitam, harness paha merah (lingkar + tali silang) bergesper, holster/kantong paha, pelindung lutut, bot tinggi
  const LG = S(RIG.leg.size);
  const pantsF = A.region(LG[0], LG[1], (g, w, h, rng) => {
    fab(C.black, 0.3)(g, w, h, rng);
    g.strokeStyle = css(C.red); g.lineWidth = 5; g.beginPath(); g.moveTo(w * 0.1, 0); g.lineTo(w * 0.85, h * 0.32); g.stroke();       // tali silang harness
    stitch(g, w / 2, h * 0.45, w / 2, h, 'rgba(255,255,255,0.08)');
  });
  const pantsS = A.region(LG[2], LG[1], fab(C.black, 0.3));
  const kneeP = A.px(64, 44, knee(0x252528)), buckleR = A.px(28, 20, buckle(0x9a9da3, C.red));
  const bootF = A.px(88, 60, bootFront(0x1c1b1e, C.lace)), bootS = A.px(88, 60, bootSide(0x1c1b1e)), soleR = A.px(48, 16, sole());
  const leg = (o: 1 | -1) => merge([
    box(LG, [0, 0, 0], { all: pantsS, nz: pantsF, pz: pantsS, ny: soleR }),
    box([1.06, 0.1, 1.06], [0, 0.5, 0], { all: redS }),
    box([0.22, 0.14, 0.05], [o * 0.2, 0.5, -0.55], { all: buckleR }),
    box([0.26, 0.55, 0.36], [o * 0.6, 0.28, 0], { all: A.px(32, 52, pouch(0x222225, C.black)) }),
    box([0.82, 0.52, 0.13], [0, -0.06, -0.57], { all: A.px(40, 40, plate(0x252528)), nz: kneeP }),
    box([1.1, 0.7, 1.14], [0, -0.56, -0.05], { all: bootS, nz: bootF }),
    box([1.12, 0.08, 1.16], [0, -0.88, -0.05], { all: soleR }),
  ]);

  return {
    head, upper: merge(upper), lower, legR: leg(1), legL: leg(-1), arm,
    chip: { head: C.skin, upper: C.red, lower: C.black, armR: C.red, armL: C.red, legR: C.black, legL: C.black },
  };
}

export const VALKYRIE: SkinDef = { seed: 3108, fps: { sleeve: C.red, cuff: C.black, glove: C.black, finger: SKIN_FINGER }, build };
