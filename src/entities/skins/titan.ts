// src/entities/skins/titan.ts — TITAN (acuan Karakter/TITAN.png): helm berat gunmetal berpaku dengan celah visor kuning-amber MENYALA,
// pelindung telinga; pelindung leher olive, rompi pelat olive berpaku + 3 kantong, sabuk peluru kuningan dari bahu kiri, 2 granat
// hijau, ransel olive; bahu raksasa gunmetal dengan chevron hazard kuning-hitam, gauntlet berat berpaku, sarung tangan tanpa jari;
// pelat pangkal paha & pinggul olive; pelat paha, pelindung lutut segi delapan, bot zirah gunmetal.
import { box, css, merge, rrect, S, RIG, type Atlas, type Common } from '../charKit';
import {
  SKIN_FINGER, buckle, bullets, fab, hand, hazard, knee, lens, molle, plate, pouch, sole, strap, type Rect, type SkinBuild, type SkinDef,
} from './kit';

const C = { gun: 0x4b4e51, gunD: 0x34373a, olive: 0x5b6349, oliveD: 0x3f4534, black: 0x1d1e21, yellow: 0xe1b52b };

function build(A: Atlas, cm: Common): SkinBuild {
  const gun = A.px(64, 64, plate(C.gun, { rivets: 2, scratch: 6, panel: true })), gunD = A.px(40, 40, plate(C.gunD, { rivets: 1.5, scratch: 2 }));
  const olive = A.px(64, 64, plate(C.olive, { rivets: 2, scratch: 4 })), oliveD = A.px(40, 40, plate(C.oliveD, { rivets: 1.4 }));
  const oliveS = A.px(64, 24, strap(C.oliveD)), blackS = A.px(64, 24, strap(C.black));

  // ── kepala: helm penuh gunmetal (kepala = cangkang), kubah, bibir, celah visor amber, pelindung telinga
  const H = S(RIG.head.size);
  const shellSide = A.region(H[2], H[1], plate(C.gun, { rivets: 2.2, scratch: 4 }));
  const shellFront = A.region(H[0], H[1], (g, w, h, rng) => {
    plate(C.gun, { scratch: 4 })(g, w, h, rng);
    g.fillStyle = '#111214'; g.fillRect(w * 0.1, h * 0.28, w * 0.8, h * 0.3);                                             // rongga celah visor
    g.fillStyle = 'rgba(0,0,0,0.5)'; rrect(g, w * 0.16, h * 0.66, w * 0.68, h * 0.3, 6); g.fill();                         // bayang wajah bawah
  });
  const visor = lens(A, 150, 40, 0xffd27a, 0xd97a12, { frame: 0x2a2c2f, inset: [0.04, 0.12], r: 0.08 });
  const head = merge([
    box(H, [0, 0, 0], { all: shellSide, nz: shellFront, pz: A.region(H[0], H[1], plate(C.gun, { rivets: 2.2, scratch: 3 })), py: gun, ny: cm.glove }),
    box([1.3, 0.28, 1.32], [0, 0.68, 0.02], { all: gun }),
    box([1.4, 0.1, 1.42], [0, 0.42, 0.02], { all: gunD }),
    box([1.0, 0.32, 0.1], [0, 0.1, -0.63], { all: gunD, nz: visor }),
    box([0.16, 0.48, 0.52], [0.68, -0.04, 0.02], { all: gunD }), box([0.16, 0.48, 0.52], [-0.68, -0.04, 0.02], { all: gunD }),
  ]);

  // ── badan atas: pelindung leher, rompi pelat olive berpaku, sabuk peluru diagonal, 2 granat, 3 kantong, ransel
  const U = S(RIG.upper.size);
  const chestP = A.region(1.6, 1.05, (g, w, h, rng) => {
    plate(C.olive, { scratch: 5 })(g, w, h, rng);
    g.fillStyle = css(C.gun); rrect(g, w * 0.22, h * 0.06, w * 0.56, h * 0.5, 6); g.fill();                              // pelat dada besar
    g.fillStyle = 'rgba(255,255,255,0.14)'; g.fillRect(w * 0.23, h * 0.07, w * 0.54, 3);
    for (const [x, y] of [[0.26, 0.12], [0.74, 0.12], [0.26, 0.5], [0.74, 0.5]] as const) { g.fillStyle = 'rgba(0,0,0,0.55)'; g.beginPath(); g.arc(w * x, h * y, 2.2, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = 'rgba(255,255,255,0.06)'; for (let y = h * 0.64; y < h * 0.95; y += 10) g.fillRect(4, y, w - 8, 4);    // MOLLE bawah
  });
  const pack = A.px(72, 80, molle(C.olive));
  const upper = merge([
    box(U, [0, 0, 0], { all: A.region(U[0], U[1], fab(0x2a2c30, 0.35)) }),
    box([1.6, 1.05, 0.16], [0, -0.02, -0.57], { all: oliveD, nz: chestP }),
    box([1.6, 1.0, 0.14], [0, -0.02, 0.56], { all: olive }),
    box([1.2, 0.36, 1.06], [0, 0.66, 0.02], { all: olive }),                                                              // pelindung leher
    box([0.34, 0.1, 1.14], [0.55, 0.63, 0], { all: oliveS }), box([0.34, 0.1, 1.14], [-0.55, 0.63, 0], { all: oliveS }),
    box([2.3, 0.26, 0.1], [-0.04, 0.06, -0.67], { all: blackS, nz: A.px(170, 20, bullets(0x2d2f25)) }, [0, 0, -0.62]),
    box([0.2, 0.26, 0.2], [0.36, 0.2, -0.74], { all: cm.grenade }), box([0.2, 0.26, 0.2], [0.6, 0.2, -0.74], { all: cm.grenade }),
    box([0.08, 0.08, 0.08], [0.36, 0.37, -0.74], { all: cm.metal }), box([0.08, 0.08, 0.08], [0.6, 0.37, -0.74], { all: cm.metal }),
    box([1.5, 1.2, 0.5], [0, 0.05, 0.79], { all: oliveD, pz: pack }),
  ]);

  // ── badan bawah: pelat pangkal paha berpaku menggantung, pelat pinggul, sabuk bergesper
  const L = S(RIG.lower.size);
  const lower = merge([
    box(L, [0, 0, 0], { all: A.region(L[0], L[1], fab(0x26282b, 0.35)) }),
    box([2.08, 0.22, 1.08], [0, 0.22, 0], { all: oliveS }),
    box([0.34, 0.2, 0.06], [0, 0.22, -0.56], { all: A.px(32, 20, buckle(0x2a2c2f, C.oliveD)) }),
    box([0.9, 0.72, 0.14], [0, -0.36, -0.58], { all: olive }),
    box([0.14, 0.6, 0.8], [1.06, -0.14, 0], { all: olive }), box([0.14, 0.6, 0.8], [-1.06, -0.14, 0], { all: olive }),
    box([0.32, 0.36, 0.14], [0.6, -0.04, -0.62], { all: A.px(32, 40, pouch(C.olive, C.oliveD)) }),
  ]);

  // ── lengan: bahu raksasa (sisi luar & atas chevron hazard), gauntlet berat berpaku, sarung tangan tanpa jari
  const AR = S(RIG.arm.size);
  const haz = A.px(64, 64, (g, w, h, rng) => { hazard(C.yellow, 0x2a2a2a, 13)(g, w, h, rng); g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, h - 5, w, 5); });
  const hd = hand(A, C.black, SKIN_FINGER, { knuckle: 0x2a2c2f, fingerless: true });
  const arm = (o: 1 | -1, band: Rect) => merge([
    box(AR, [0, 0, 0], { all: A.region(AR[0], AR[1], fab(0x2a2c30, 0.3)), ny: hd.bottom }),
    box([1.4, 0.78, 1.34], [o * 0.15, 0.68, 0], { all: gun, [o > 0 ? 'px' : 'nx']: haz, py: haz }),
    box([1.07, 0.2, 1.07], [0, 0.06, 0], { all: band }),
    box([1.18, 0.74, 1.18], [0, -0.42, 0], { all: gun }),
    box([1.06, 0.42, 1.06], [0, -0.81, 0], { all: hd.side, nz: hd.front, ny: hd.bottom }),
  ]);

  // ── kaki: celana gelap, pelat paha berpaku, pelindung lutut segi delapan, bot zirah tinggi
  const LG = S(RIG.leg.size);
  const pants = A.region(LG[0], LG[1], fab(0x26282b, 0.3)), pantsS = A.region(LG[2], LG[1], fab(0x26282b, 0.3));
  const kneeP = A.px(64, 44, knee(C.gun, C.gunD)), soleR = A.px(48, 16, sole());
  const bootP = A.px(80, 64, plate(C.gun, { rivets: 2, scratch: 4, panel: true }));
  const leg = () => merge([
    box(LG, [0, 0, 0], { all: pantsS, nz: pants, pz: pants, ny: soleR }),
    box([0.88, 0.56, 0.12], [0, 0.4, -0.56], { all: gunD, nz: gun }),
    box([0.86, 0.54, 0.14], [0, -0.06, -0.58], { all: gunD, nz: kneeP }),
    box([1.16, 0.7, 1.2], [0, -0.56, -0.05], { all: bootP, ny: soleR }),
    box([1.18, 0.08, 1.22], [0, -0.88, -0.05], { all: soleR }),
  ]);

  return {
    head, upper, lower, legR: leg(), legL: leg(), arm,
    chip: { head: C.gun, upper: C.olive, lower: C.olive, armR: C.gun, armL: C.gun, legR: C.gun, legL: C.gun },
  };
}

export const TITAN: SkinDef = { seed: 3107, fps: { sleeve: 0x2a2c30, cuff: C.gun, glove: C.black, finger: SKIN_FINGER }, build };

