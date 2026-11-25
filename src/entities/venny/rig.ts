// src/entities/venny/rig.ts — Venny realistis: kerangka 20 tulang + mesh ber-skin prosedural (1 SkinnedMesh, 1 atlas, 1 draw call)
// dan pemetaan pose dari rig R6 (hitbox GDD tetap di BlockyCharacter). Kaki: lutut menekuk saat melangkah, berlutut saat jongkok;
// lengan: senapan bertumpu di bahu kanan, kedua tangan ditempel ke gagang & handguard lewat IK dua tulang; pisau/granat: FK dari R6.
import * as THREE from 'three';
import { makeRng } from '../../core/Rng';
import { XCFG } from '../../config/extraConfig';
import { Atlas, type Faces, type Painter, type Rect } from '../charKit';
import {
  SkinMesh, add, auv, cap, cross, ellipsoid, frame, lerp, loft, mul, norm, plainBox, rbox, ring, sstep, strap, sub, tube,
  type Skin, type V3,
} from './kit';
import * as P from './paint';

type Team = 'blue' | 'red';

export const BONE = {
  root: 0, hips: 1, spine: 2, chest: 3, neck: 4, head: 5, clavR: 6, armR: 7, foreR: 8, handR: 9,
  clavL: 10, armL: 11, foreL: 12, handL: 13, thighR: 14, shinR: 15, footR: 16, thighL: 17, shinL: 18, footL: 19,
} as const;
const B = BONE;
/** [induk, posisi ikat (ruang model, kaki di y 0, depan −Z, kanan +X)] — rotasi ikat semua identitas. */
const BONES: [number, V3][] = [
  [-1, [0, 0, 0]], [0, [0, 2.5, 0]], [1, [0, 2.98, 0]], [2, [0, 3.45, 0]], [3, [0, 3.99, 0.02]], [4, [0, 4.22, 0.02]],
  [3, [0.12, 3.88, 0]], [6, [0.56, 3.85, 0]], [7, [0.655, 2.94, 0.02]], [8, [0.725, 2.15, 0]],
  [3, [-0.12, 3.88, 0]], [10, [-0.56, 3.85, 0]], [11, [-0.655, 2.94, 0.02]], [12, [-0.725, 2.15, 0]],
  [1, [0.26, 2.46, 0]], [14, [0.27, 1.3, -0.01]], [15, [0.28, 0.2, 0.03]],
  [1, [-0.26, 2.46, 0]], [17, [-0.27, 1.3, -0.01]], [18, [-0.28, 0.2, 0.03]],
];
const one = (b: number): Skin => [[b, 1]];
const bl = (b0: number, b1: number, t: number): Skin => [[b0, 1 - t], [b1, t]];
const HC = P.HEAD_C;

// ───────────────────────────── bentuk tubuh
/** Badan atas: [y, rx, rz, cz, dada]. */
const TORSO: number[][] = [
  [2.92, 0.395, 0.245, 0, 0], [3.1, 0.41, 0.25, 0, 0], [3.3, 0.445, 0.268, -0.01, 0.2], [3.48, 0.475, 0.285, -0.02, 0.8],
  [3.62, 0.48, 0.29, -0.02, 1], [3.76, 0.485, 0.27, -0.01, 0.5], [3.86, 0.485, 0.24, 0, 0], [3.95, 0.42, 0.2, 0.01, 0],
  [4.01, 0.25, 0.16, 0.02, 0], [4.06, 0.13, 0.125, 0.02, 0],
];
/** Rok span: [y, rx, rz, cz] kelim → pinggang. */
const SKIRT: number[][] = [
  [1.52, 0.47, 0.272, 0.01], [1.62, 0.475, 0.276, 0.01], [1.8, 0.49, 0.285, 0.01], [2.05, 0.515, 0.302, 0.01],
  [2.3, 0.54, 0.315, 0.005], [2.5, 0.552, 0.322, 0], [2.68, 0.535, 0.312, 0], [2.84, 0.49, 0.288, 0], [2.97, 0.43, 0.262, 0],
  [3.06, 0.405, 0.252, 0],
];
const rowAt = (tab: number[][], y: number) => {
  if (y <= tab[0][0]) return tab[0];
  for (let i = 1; i < tab.length; i++) if (y <= tab[i][0]) {
    const t = (y - tab[i - 1][0]) / (tab[i][0] - tab[i - 1][0]);
    return tab[i].map((v, k) => lerp(tab[i - 1][k], v, t));
  }
  return tab[tab.length - 1];
};
/** Titik di permukaan rok pada tinggi y & sudut θ (konvensi ring: 0 belakang, π/2 kanan, π depan), + jarak keluar. */
const skirtPt = (y: number, th: number, off = 0): V3 => {
  const [, rx, rz, cz] = rowAt(SKIRT, y), e = 2.4, s = Math.sin(th), c = Math.cos(th);
  const x = Math.sign(s) * Math.abs(s) ** (2 / e) * (rx + off), z = Math.sign(c) * Math.abs(c) ** (2 / e) * (rz + off);
  return [x, y, cz + z];
};
/** Bobot kulit rok: pinggul di atas, makin ke bawah mengikuti paha sisi masing-masing (tengah = rata-rata dua paha). */
const skirtSkin = (p: V3): Skin => {
  const t = sstep(2.62, 1.75, p[1]), side = sstep(-0.22, 0.22, p[0] / 0.5);
  return [[B.hips, 1 - t], [B.thighR, t * side], [B.thighL, t * (1 - side)]];
};
const torsoSkin = (y: number): Skin => {
  const sp = sstep(2.9, 3.2, y) - sstep(3.35, 3.65, y), ch = sstep(3.35, 3.65, y) - sstep(3.96, 4.06, y);
  return [[B.hips, 1 - sstep(2.9, 3.2, y)], [B.spine, sp], [B.chest, ch], [B.neck, sstep(3.96, 4.06, y)]];
};

/** Bentuk kepala (jarak dari pusat kepala HC ke permukaan) untuk arah satuan d — elipsoid + rahang menyempit + hidung, pipi, bibir,
 *  dagu, rongga mata, tulang alis (wajah bulat lembut seperti acuan). */
export function headR(dx: number, dy: number, dz: number): number {
  const rx = 0.286, ry = dy > 0 ? 0.35 : 0.33, rz = dz < 0 ? 0.29 : 0.315;
  const low = sstep(-0.1, -0.9, dy), front = sstep(0.15, -0.75, dz);
  const kx = 1 - 0.3 * low * (0.25 + 0.75 * front), kz = 1 - 0.06 * low * front;
  let R = 1 / Math.sqrt((dx / (rx * kx)) ** 2 + (dy / ry) ** 2 + (dz / (rz * kz)) ** 2);
  const F = sstep(-0.3, -0.75, dz);
  if (F > 0) {
    const g = (x: number, y: number, sx: number, sy: number) => Math.exp(-(((dx - x) / sx) ** 2) - (((dy - y) / sy) ** 2));
    const ax = Math.abs(dx);
    R += F * (
      0.036 * Math.exp(-((dx / 0.06) ** 2)) * sstep(0.22, 0.02, dy) * sstep(-0.3, -0.12, dy)       // batang hidung
      + 0.042 * g(0, -0.25, 0.075, 0.07)                                                          // ujung hidung (membulat)
      + 0.012 * (g(0.1, -0.29, 0.05, 0.045) + g(-0.1, -0.29, 0.05, 0.045))                        // cuping
      - 0.016 * Math.exp(-(((ax - 0.34) / 0.11) ** 2) - (((dy - 0.12) / 0.075) ** 2))             // rongga mata
      + 0.008 * Math.exp(-(((ax - 0.32) / 0.16) ** 2) - (((dy - 0.36) / 0.05) ** 2))              // tulang alis
      + 0.024 * Math.exp(-(((ax - 0.5) / 0.2) ** 2) - (((dy + 0.02) / 0.16) ** 2))                // pipi bulat (tulang pipi)
      + 0.013 * g(0, -0.52, 0.16, 0.035)                                                          // bibir atas
      + 0.016 * g(0, -0.6, 0.14, 0.04)                                                            // bibir bawah
      - 0.006 * g(0, -0.67, 0.16, 0.03)                                                           // lekuk bawah bibir
      + 0.02 * g(0, -0.8, 0.16, 0.09)                                                             // dagu
    );
  }  return R;
}
const headPt = (d: V3, off = 0): V3 => { const R = headR(d[0], d[1], d[2]) + off; return [HC[0] + d[0] * R, HC[1] + d[1] * R, HC[2] + d[2] * R]; };
/** Titik permukaan kepala bagian depan pada (x, y) dunia (iterasi z) + jarak keluar. */
const headFront = (x: number, y: number, off = 0): V3 => {
  let z = -0.3;
  for (let k = 0; k < 6; k++) {
    const d = norm([x - HC[0], y - HC[1], z - HC[2]]), R = headR(d[0], d[1], d[2]);
    z = HC[2] - Math.sqrt(Math.max(0.0004, R * R - (x - HC[0]) ** 2 - (y - HC[1]) ** 2));
  }
  const d = norm([x - HC[0], y - HC[1], z - HC[2]]);
  return headPt(d, off);
};

// ───────────────────────────── templat per tim (geometri + atlas)
interface Tpl { geo: THREE.BufferGeometry; tex: THREE.CanvasTexture }
const TPL = new Map<Team, Tpl>();

export function vennyTemplate(team: Team): Tpl {
  const hit = TPL.get(team);
  if (hit) return hit;
  const look: P.Look = { red: team === 'red' };
  const A = new Atlas(makeRng(team === 'blue' ? 3105 : 3205));
  const px = (w: number, h: number, p: Painter) => A.px(w, h, p);
  // region — urutan dari yang tertinggi agar baris atlas padat
  const R = {
    face: px(224, 290, P.faceP(look)), legR: px(80, 290, P.legP(look, look.red)), legL: px(80, 290, P.legP(look, false)),
    armR: px(88, 260, P.armP(look, look.red)), armL: px(88, 260, P.armP(look, false)), tail: px(80, 260, P.tailP),
    wisp: px(24, 96, P.wispP), plateF: px(192, 168, P.plateFrontP(look)), band: px(40, 200, P.bandolierP),
    skirt: px(512, 200, P.skirtP(look)), hair: px(384, 200, P.hairP), neck: px(96, 48, P.neckP),
    torso: px(384, 150, P.torsoP(look)), plateB: px(160, 136, P.plateBackP(look)), strap: px(48, 160, P.strapP(look)),
    foot: px(160, 128, P.footP(look)), shaft: px(160, 96, P.bootShaftP(look)),
    sleeveR: px(150, 64, P.sleeveP(look, [0.3, 0.7])), sleeveL: px(150, 64, P.sleeveP(look, [0.45])), cummer: px(320, 48, P.cummerP(look)),
    headRest: px(96, 64, P.headRestP), holster: px(48, 80, P.holsterP(look)), platform: px(48, 80, P.platformP(look)),
    web: px(24, 96, P.webStrapP(look)), sheath: px(32, 96, P.sheathP),
    gBack: px(48, 64, P.gloveP('back', look)), gPalm: px(48, 64, P.gloveP('palm', look)), gSide: px(48, 64, P.gloveP('side', look)),
    gBottom: px(48, 64, P.gloveP('bottom', look)), mag: px(48, 64, P.magPouchP(look)), sole: px(64, 64, P.soleP),
    bandana: px(128, 64, P.bandanaP), tape: px(208, 52, P.tapeP), grenade: px(64, 48, P.grenadeP), belt: px(256, 24, P.beltP(look)),
    pouch: px(48, 48, P.pouchP(look.red ? '#4f5634' : '#232428', look.red, look)), canister: px(48, 48, P.canisterP),
    gauze: px(128, 32, P.gauzeP), bootStrap: px(128, 16, P.bootStrapP), headset: px(32, 32, P.headsetP), skin: px(32, 32, P.skinSw),
    ear: px(24, 32, P.earP), vest: px(32, 32, P.vestSw(look)), buckle: px(32, 24, P.buckleP), beltBuckle: px(32, 20, P.beltBuckleP),
    grip: px(24, 32, P.gripP), trim: px(16, 16, P.trimSw(look)), black: px(16, 16, P.blackSw('#141516')),
    poly: px(16, 16, P.blackSw('#1c1d20')), metal: px(16, 16, P.metalP), brass: px(16, 32, P.brassP),
    T: px(8, 8, (g, w, h) => g.clearRect(0, 0, w, h)),
  };
  const m = new SkinMesh();
  buildHead(m, R, look);
  buildBody(m, R, look);
  const geo = m.geometry();
  geo.computeBoundingSphere();
  const tex = new THREE.CanvasTexture(A.canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.anisotropy = 4;
  const tpl = { geo, tex };
  TPL.set(team, tpl);
  return tpl;
}
type Regions = Record<string, Rect>;

// ───────────────────────────── kepala, rambut, telinga, leher, aksesori kepala
function buildHead(m: SkinMesh, R: Regions, look: P.Look) {
  const NO = 56, NL = 40;
  const dirAt = (i: number, j: number): V3 => {
    const ph = (Math.PI * i) / NL, a = Math.PI - (2 * Math.PI * j) / NO;
    return [Math.sin(ph) * Math.sin(a), Math.cos(ph), -Math.sin(ph) * Math.cos(a)];
  };
  // posisi & normal grid penuh (normal dari beda pusat → mulus melintasi batas wajah/belakang)
  const build = (off: (d: V3) => number) => {
    const Pp: V3[][] = [], Nn: V3[][] = [];
    for (let i = 0; i <= NL; i++) { Pp.push([]); for (let j = 0; j <= NO; j++) { const d = dirAt(i, j); Pp[i].push(headPt(d, off(d))); } }
    for (let i = 0; i <= NL; i++) {
      Nn.push([]);
      for (let j = 0; j <= NO; j++) {
        const d = dirAt(i, j);
        if (i === 0 || i === NL) { Nn[i].push(d); continue; }
        const jl = j === 0 ? NO - 1 : j - 1, jr = j === NO ? 1 : j + 1;
        const ta = sub(Pp[i][jr], Pp[i][jl]), tp = sub(Pp[i - 1][j], Pp[i + 1][j]);
        let n = norm(cross(ta, tp));
        if (n[0] * d[0] + n[1] * d[1] + n[2] * d[2] < 0) n = mul(n, -1);
        Nn[i].push(n);
      }
    }
    return { Pp, Nn };
  };
  const headSkin = (i: number): Skin => bl(B.head, B.neck, 0.5 * sstep(0.8, 1, i / NL));
  const H = build(() => 0);
  // wajah: sel |a| ≤ 73°, 33° ≤ φ ≤ 155° → UV planar (tekstur wajah resolusi tinggi); sisanya → UV bola
  const jA = 17, jB = 39, iA = 7, iB = 34;
  const emit = (Pp: V3[][], Nn: V3[][], i0: number, i1: number, j0: number, j1: number, uv: (i: number, j: number) => [number, number],
    keep: (i: number, j: number) => boolean, skin: (i: number) => Skin) => {
    const idx = new Map<number, number>();
    const vid = (i: number, j: number) => {
      const k = i * 1000 + j; let v = idx.get(k);
      if (v === undefined) { v = m.v(Pp[i][j], uv(i, j), skin(i), Nn[i][j]); idx.set(k, v); }
      return v;
    };
    for (let i = i0; i < i1; i++) for (let j = j0; j < j1; j++) {
      if (!keep(i, j)) continue;
      const a = vid(i, j), b = vid(i, j + 1), c = vid(i + 1, j), d = vid(i + 1, j + 1);
      m.tri(a, c, b); m.tri(b, c, d);
    }
  };
  const fu = (p: V3) => (p[0] - P.FACE.x0) / (P.FACE.x1 - P.FACE.x0), fv = (p: V3) => (p[1] - P.FACE.y0) / (P.FACE.y1 - P.FACE.y0);
  emit(H.Pp, H.Nn, iA, iB, jA, jB, (i, j) => auv(R.face, fu(H.Pp[i][j]), fv(H.Pp[i][j])), () => true, headSkin);
  emit(H.Pp, H.Nn, 0, NL, 0, NO, (i, j) => auv(R.headRest, j / NO, 1 - i / NL), (i, j) => !(i >= iA && i < iB && j >= jA && j < jB), headSkin);
  // rambut: cangkang sedikit di luar kepala (lebih tebal di puncak & belakang), alpha = garis rambut; sel jauh di luar garis dilewati
  // volume rambut naik halus dari garis rambut (tepi tipis) ke puncak & samping (mengembang seperti foto)
  const off = (d: V3) => {
    const dphi = P.hairLimit(Math.atan2(d[0], -d[2])) - Math.acos(Math.max(-1, Math.min(1, d[1])));
    const side = Math.exp(-(((Math.abs(d[0]) - 0.8) / 0.25) ** 2)) * sstep(-0.3, 0.35, d[1]);
    return 0.013 + sstep(0, 0.22, dphi) * (0.014 + 0.01 * sstep(0.25, 0.95, d[1]) + 0.012 * sstep(-0.1, 0.8, d[2]) + 0.036 * side);
  };
  const Hh = build(off);
  const inHair = (i: number, j: number) => {
    const ph = (Math.PI * i) / NL, a = Math.PI - (2 * Math.PI * j) / NO;
    return ph < P.hairLimit(a) + 0.12;
  };
  emit(Hh.Pp, Hh.Nn, 0, NL, 0, NO, (i, j) => auv(R.hair, j / NO, 1 - i / NL),
    (i, j) => inHair(i, j) || inHair(i + 1, j) || inHair(i, j + 1) || inHair(i + 1, j + 1), () => one(B.head));
  // kuncir rendah: ikat di tengkuk → menggantung di punggung (pangkal ikut kepala, ujung ikut dada)
  const tail: V3[] = [[0, P.yy(4.45), 0.32], [0.01, P.yy(4.37), 0.375], [0.03, 4.18, 0.425], [0.05, 4.02, 0.46], [0.065, 3.86, 0.47], [0.075, 3.71, 0.462], [0.08, 3.6, 0.45]];
  const tailR = (t: number) => (t < 0.08 ? lerp(0.04, 0.052, t / 0.08) : t < 0.25 ? lerp(0.052, 0.074, (t - 0.08) / 0.17) : t < 0.6 ? lerp(0.074, 0.06, (t - 0.25) / 0.35) : lerp(0.06, 0.008, (t - 0.6) / 0.4));
  tube(m, tail, tailR, 12, R.tail, (t) => bl(B.head, B.chest, sstep(0.12, 0.6, t)));
  ellipsoid(m, [0, P.yy(4.43), 0.335], [0.052, 0.034, 0.05], R.black, one(B.head), { rot: [-0.5, 0, 0] });   // ikat rambut
  // helai lepas (pita tipis mengikuti permukaan wajah)
  const wisp = (pts: [number, number][], w: number) => {
    const path = pts.map(([x, y]) => headFront(x * 1.04, P.yy(y), 0.01)), out = path.map(p => norm(sub(p, HC)));
    strap(m, path, out, w, 0.004, R.wisp, () => one(B.head));
  };
  wisp([[0.205, 4.79], [0.232, 4.71], [0.248, 4.62], [0.254, 4.53]], 0.03);
  wisp([[0.18, 4.8], [0.205, 4.72], [0.222, 4.64]], 0.02);
  if (look.red) { wisp([[0.07, 4.81], [0.12, 4.735], [0.165, 4.645], [0.198, 4.555]], 0.042); wisp([[-0.21, 4.79], [-0.238, 4.71], [-0.25, 4.62]], 0.024); }
  else wisp([[-0.215, 4.78], [-0.24, 4.7], [-0.25, 4.62]], 0.02);
  // telinga
  for (const s of [-1, 1]) ellipsoid(m, [0.293 * s, P.yy(4.53), 0.03], [0.026, 0.07, 0.048], R.ear, one(B.head), { rot: [0, 0, -0.08 * s], lon: 10, lat: 7 });
  // leher
  const neckRings: V3[][] = [], nv: number[] = [];
  for (const y of [3.97, 4.05, 4.13, 4.21, 4.29, 4.36]) { const k = y > 4.25 ? 1 + (y - 4.25) * 1.2 : 1; neckRings.push(ring([0, y, 0.02 + (y - 3.97) * 0.05], [1, 0, 0], [0, 0, 1], 0.136 * k, 0.126 * k, 16)); nv.push((y - 3.97) / 0.39); }
  loft(m, neckRings, nv, R.neck, (_i, _j, p) => p[1] < 4.05 ? bl(B.chest, B.neck, 0.6) : bl(B.neck, B.head, sstep(4.2, 4.4, p[1])));
  // aksesori kepala: Biru headset satu telinga (kanan) + mikrofon boom; Merah earpiece telinga kiri + kabel
  if (!look.red) {
    ellipsoid(m, [0.31, P.yy(4.53), 0.03], [0.03, 0.046, 0.042], R.headset, one(B.head), { rot: [0, 0, -0.08] });
    const boom: V3[] = ([[0.322, 4.5, 0.0], [0.322, 4.45, -0.12], [0.285, 4.39, -0.22], [0.2, 4.35, -0.282], [0.115, 4.342, -0.305]] as V3[]).map(p => [p[0], P.yy(p[1]), p[2]] as V3);
    tube(m, boom, () => 0.0105, 6, R.black, () => one(B.head));
    ellipsoid(m, [0.105, P.yy(4.342), -0.308], [0.022, 0.016, 0.019], R.black, one(B.head));
  } else {
    ellipsoid(m, [-0.306, P.yy(4.525), 0.03], [0.022, 0.03, 0.028], R.headset, one(B.head));
    tube(m, [[-0.304, P.yy(4.5), 0.04], [-0.298, P.yy(4.4), 0.08], [-0.26, 4.22, 0.1], [-0.2, 4.1, 0.11]], () => 0.007, 5, R.black, () => one(B.head));
  }
}

// ───────────────────────────── badan, lengan, kaki, rok, bot, rompi, perlengkapan
function buildBody(m: SkinMesh, R: Regions, look: P.Look) {
  const red = look.red;
  // badan atas (kaus)
  {
    const rings: V3[][] = [], vs: number[] = [];
    for (const [y, rx, rz, cz, bust] of TORSO) {
      rings.push(ring([0, y, cz], [1, 0, 0], [0, 0, 1], rx, rz, 32, 2.3, th => [1, 1 + 0.2 * bust * Math.exp(-(((th - Math.PI) / 0.6) ** 2))]));
      vs.push((y - 2.92) / (4.06 - 2.92));
    }
    loft(m, rings, vs, R.torso, (_i, _j, p) => torsoSkin(p[1]));
  }
  // lengan (kulit) + lengan kaus + kepalan bersarung tangan
  for (const s of [1, -1]) {
    const arm = s > 0 ? B.armR : B.armL, fore = s > 0 ? B.foreR : B.foreL, hand = s > 0 ? B.handR : B.handL;
    const S: V3 = [0.56 * s, 3.85, 0], E: V3 = [0.655 * s, 2.94, 0.02], W: V3 = [0.725 * s, 2.15, 0];
    const u1 = norm(sub(S, E)), u2 = norm(sub(E, W)), f1 = frame(u1), f2 = frame(u2), fe = frame(norm(add(u1, u2)));
    const rings: V3[][] = [], vs: number[] = [], sk: Skin[] = [];
    const total = 0.81 + 0.92 + 0.142;
    const push = (c: V3, f: { ax: V3; az: V3 }, r: number, v: number, w: Skin, kz = 1) => { rings.push(ring(c, f.ax, f.az, r, r * kz, 16)); vs.push(v); sk.push(w); };
    [[0, 0.074], [0.2, 0.083], [0.45, 0.098], [0.7, 0.112], [0.9, 0.108]].forEach(([t, r], k) =>
      push(add(W, mul(sub(E, W), t)), f2, r, (t * 0.81) / total, k === 0 ? bl(fore, hand, 0.35) : k === 4 ? bl(fore, arm, 0.15) : one(fore), 0.92));
    push(E, fe, 0.1, 0.81 / total, bl(arm, fore, 0.5));
    [[0.08, 0.104], [0.25, 0.112], [0.45, 0.12], [0.65, 0.129], [0.85, 0.137], [1, 0.142]].forEach(([t, r], k) =>
      push(add(E, mul(sub(S, E), t)), f1, r, (0.81 + t * 0.92) / total, k === 0 ? bl(arm, fore, 0.15) : one(arm)));
    for (const al of [0.5, 0.95, 1.3]) push(add(S, mul(u1, 0.09 * Math.sin(al))), f1, 0.142 * Math.cos(al), (0.81 + 0.92 + 0.142 * Math.sin(al)) / total, one(arm));
    loft(m, rings, vs, s > 0 ? R.armR : R.armL, (i) => sk[i]);
    cap(m, rings[rings.length - 1], add(S, mul(u1, 0.09)), auv(R.sleeveR, 0.5, 1), one(arm));
    // lengan kaus: cangkang dari tengah lengan atas sampai kubah bahu
    const sr: V3[][] = [], sv: number[] = [];
    const tops = [[0.52, 0.124], [0.65, 0.129], [0.85, 0.137], [1, 0.142]];
    tops.forEach(([t, r], k) => { const c = add(E, mul(sub(S, E), t)); sr.push(ring(c, f1.ax, f1.az, r + 0.014, r + 0.014, 16)); sv.push(k / 5); });
    [0.5, 0.95, 1.3].forEach((al, k) => { sr.push(ring(add(S, mul(u1, 0.105 * Math.sin(al))), f1.ax, f1.az, 0.158 * Math.cos(al), 0.158 * Math.cos(al), 16)); sv.push((4 + k * 0.4) / 5.2); });
    loft(m, sr, sv, s > 0 ? R.sleeveR : R.sleeveL, () => one(arm));
    cap(m, sr[sr.length - 1], add(S, mul(u1, 0.105)), auv(s > 0 ? R.sleeveR : R.sleeveL, 0.5, 1), one(arm));
    // kepalan: punggung tangan menghadap luar, telapak ke paha; ibu jari di depan-dalam
    const outer = s > 0 ? 'px' : 'nx', inner = s > 0 ? 'nx' : 'px';
    rbox(m, [0.11, 0.2, 0.155], [W[0] + 0.012 * s, W[1] - 0.122, W[2] - 0.005], { all: R.gSide, [outer]: R.gBack, [inner]: R.gPalm, ny: R.gBottom, py: R.skin } as Faces,
      one(hand), { radius: 0.045, seg: 2 });
    ellipsoid(m, [W[0] - 0.045 * s, W[1] - 0.085, W[2] - 0.072], [0.027, 0.058, 0.03], R.skin, one(hand), { rot: [0.35, 0, 0.35 * s], lon: 8, lat: 6 });
    if (red) {   // perban kasa: lengan atas di bawah lengan kaus sobek & pergelangan
      const band = (c0: V3, c1: V3, f: { ax: V3; az: V3 }, r: number, b: Skin) => {
        const rr = [ring(c0, f.ax, f.az, r, r, 16), ring(c0, f.ax, f.az, r + 0.013, r + 0.013, 16), ring(c1, f.ax, f.az, r + 0.015, r + 0.015, 16), ring(c1, f.ax, f.az, r, r, 16)];
        loft(m, rr, [0, 0.05, 0.95, 1], R.gauze, () => b);
      };
      const ua = s > 0 ? [0.36, 0.47] : [0.32, 0.44], fa = s > 0 ? [0.12, 0.32] : [0.08, 0.24];
      band(add(E, mul(sub(S, E), ua[0])), add(E, mul(sub(S, E), ua[1])), f1, 0.126, one(arm));
      band(add(W, mul(sub(E, W), fa[0])), add(W, mul(sub(E, W), fa[1])), f2, 0.085, one(fore));
    }
  }
  // kaki (kulit): pergelangan → pinggul; lutut di y 1.3
  for (const s of [1, -1]) {
    const thigh = s > 0 ? B.thighR : B.thighL, shin = s > 0 ? B.shinR : B.shinL, foot = s > 0 ? B.footR : B.footL;
    const Hh: V3 = [0.26 * s, 2.46, 0], K: V3 = [0.27 * s, 1.3, -0.01], Ak: V3 = [0.28 * s, 0.2, 0.03];
    const fS = frame(norm(sub(K, Ak))), fT = frame(norm(sub(Hh, K)));
    const rings: V3[][] = [], vs: number[] = [], sk: Skin[] = [];
    const calf = (th: number): [number, number] => [1, 1 + 0.12 * Math.max(0, Math.cos(th)) ** 2];
    const knee = (th: number): [number, number] => [1, 1 + 0.08 * Math.max(0, -Math.cos(th)) ** 2];
    const total = 1.1 + 1.16;
    [[0, 0.082], [0.15, 0.09], [0.35, 0.108], [0.55, 0.132], [0.7, 0.14], [0.85, 0.135]].forEach(([t, r], k) => {
      rings.push(ring(add(Ak, mul(sub(K, Ak), t)), fS.ax, fS.az, r, r, 18, 2, t > 0.4 && t < 0.8 ? calf : undefined));
      vs.push((t * 1.1) / total); sk.push(k === 0 ? bl(shin, foot, 0.3) : one(shin));
    });
    rings.push(ring(K, fS.ax, fS.az, 0.14, 0.14, 18, 2, knee)); vs.push(1.1 / total); sk.push(bl(thigh, shin, 0.5));
    [[0.12, 0.148], [0.3, 0.168], [0.55, 0.198], [0.8, 0.222], [1, 0.232]].forEach(([t, r], k) => {
      rings.push(ring(add(K, mul(sub(Hh, K), t)), fT.ax, fT.az, r, r, 18)); vs.push((1.1 + t * 1.16) / total);
      sk.push(k === 0 ? bl(thigh, shin, 0.15) : k === 4 ? bl(thigh, B.hips, 0.3) : one(thigh));
    });
    loft(m, rings, vs, s > 0 ? R.legR : R.legL, (i) => sk[i]);
    // bot: batang (tepi atas melipat ke dalam), kaki (tumit → ujung), sol, tali + gesper
    const cAt = (y: number): V3 => (y <= 0.2 ? [Ak[0], y, Ak[2]] : add(Ak, mul(sub(K, Ak), (y - 0.2) / 1.1)));
    const shRings: V3[][] = [], shV: number[] = [];
    [[0.07, 0.13], [0.15, 0.138], [0.3, 0.13], [0.45, 0.133], [0.58, 0.145], [0.66, 0.152], [0.69, 0.152], [0.675, 0.126]].forEach(([y, r], k) => {
      shRings.push(ring(cAt(y), [1, 0, 0], [0, 0, 1], r, r * 1.04, 20)); shV.push(k === 7 ? 1 : Math.min(0.98, (y - 0.07) / 0.62));
    });
    loft(m, shRings, shV, R.shaft, (_i, _j, p) => bl(foot, shin, sstep(0.12, 0.35, p[1])));
    const ft: number[][] = [[0.15, 0.13, 0.095, 0.12], [0.08, 0.135, 0.118, 0.13], [-0.05, 0.125, 0.128, 0.12], [-0.2, 0.1, 0.133, 0.1],
      [-0.33, 0.085, 0.128, 0.085], [-0.43, 0.075, 0.11, 0.07], [-0.49, 0.068, 0.07, 0.05]];
    const fr = frame([0, 0, -1], [0, -1, 0]);
    const fRings = ft.map(([z, yc, rx, ry]) => ring([Ak[0], yc, Ak[2] + z], fr.ax, fr.az, rx, ry, 20, 2.6));
    loft(m, fRings, ft.map((_r, k) => k / (ft.length - 1)), R.foot, () => one(foot));
    cap(m, fRings[0], [Ak[0], 0.13, Ak[2] + 0.17], auv(R.foot, 0.5, 0), one(foot), true);
    cap(m, fRings[fRings.length - 1], [Ak[0], 0.066, Ak[2] - 0.51], auv(R.foot, 0.5, 1), one(foot));
    rbox(m, [0.29, 0.06, 0.73], [Ak[0], 0.03, Ak[2] - 0.17], { all: R.sole }, one(foot), { radius: 0.025 });
    const loop: V3[] = [], lo: V3[] = [];
    for (let k = 0; k <= 22; k++) { const a = (k / 22) * Math.PI * 2, c = cAt(0.6); loop.push([c[0] + Math.sin(a) * 0.158, 0.6, c[2] + Math.cos(a) * 0.164]); lo.push([Math.sin(a), 0, Math.cos(a)]); }
    strap(m, loop, lo, 0.055, 0.012, R.bootStrap, () => one(shin));
    rbox(m, [0.025, 0.065, 0.05], [Ak[0] + 0.168 * s, 0.6, Ak[2] - 0.05], { all: R.metal }, one(shin), { radius: 0.006 });
  }
  // rok span (cangkang pinggul + paha, ikut kaki)
  {
    const rings: V3[][] = [], vs: number[] = [];
    for (const [y, rx, rz, cz] of SKIRT) {
      const seat = sstep(2.2, 2.45, y) * (1 - sstep(2.6, 2.8, y));
      rings.push(ring([0, y, cz], [1, 0, 0], [0, 0, 1], rx, rz, 40, 2.4, th => [1, 1 + 0.06 * seat * Math.max(0, Math.cos(th)) ** 3]));
      vs.push((y - 1.52) / (3.06 - 1.52));
    }
    loft(m, rings, vs, R.skirt, (_i, _j, p) => skirtSkin(p));
  }
  // sabuk taktis + gesper + kantong
  {
    const path: V3[] = [], out: V3[] = [];
    for (let k = 0; k <= 26; k++) { const a = (k / 26) * Math.PI * 2; path.push([Math.sin(a) * 0.428, 3.02, Math.cos(a) * 0.27]); out.push([Math.sin(a), 0, Math.cos(a)]); }
    strap(m, path, out, 0.085, 0.02, R.belt, () => [[B.hips, 0.6], [B.spine, 0.4]]);
    rbox(m, [0.13, 0.07, 0.025], [0, 3.02, -0.29], { all: R.black, nz: R.beltBuckle }, [[B.hips, 0.6], [B.spine, 0.4]], { radius: 0.008 });
    if (!red) {
      rbox(m, [0.12, 0.15, 0.08], [0.35, 2.92, -0.24], { all: R.poly, nz: R.pouch }, one(B.hips), { rot: [0, -0.6, 0], radius: 0.015 });
      rbox(m, [0.12, 0.15, 0.08], [-0.37, 2.92, -0.21], { all: R.poly, nz: R.pouch }, one(B.hips), { rot: [0, 0.7, 0], radius: 0.015 });
    } else {
      rbox(m, [0.14, 0.15, 0.08], [0.22, 2.92, -0.31], { all: R.poly, nz: R.pouch }, one(B.hips), { rot: [0, -0.35, 0], radius: 0.015 });
      tube(m, [[-0.27, 2.84, -0.3], [-0.27, 3.0, -0.3]], () => 0.038, 10, R.canister, () => one(B.hips));
    }
  }
  // holster paha kanan (ikut bobot rok di titiknya): gantungan, panel, sarung + gagang pistol, 2 tali bergesper
  {
    strap(m, [[0.4, 3.0, -0.12], [0.47, 2.76, -0.1], [0.54, 2.47, -0.06]], [[1, 0, -0.2], [1, 0, -0.2], [1, 0, -0.2]], 0.045, 0.012, R.web, (_k, p) => skirtSkin(p));
    rbox(m, [0.03, 0.34, 0.24], [0.565, 2.2, -0.05], { all: R.poly, px: R.platform }, skirtSkin, { radius: 0.008 });
    rbox(m, [0.075, 0.27, 0.15], [0.61, 2.18, -0.07], { all: R.poly, px: R.holster }, skirtSkin, { radius: 0.022 });
    rbox(m, [0.05, 0.12, 0.08], [0.61, 2.38, -0.02], { all: R.grip }, skirtSkin, { rot: [-0.25, 0, 0], radius: 0.012 });
    for (const y of [2.26, 2.06]) {
      const path: V3[] = [], out: V3[] = [];
      for (let k = 0; k <= 12; k++) { const th = lerp(0.25 * Math.PI, 0.93 * Math.PI, k / 12); path.push(skirtPt(y, th, 0.012)); out.push([Math.sin(th), 0, Math.cos(th)]); }
      strap(m, path, out, 0.045, 0.012, R.web, (_k, p) => skirtSkin(p));
      const bp = skirtPt(y, 0.8 * Math.PI, 0.03);
      rbox(m, [0.075, 0.05, 0.02], bp, { all: R.black, nz: R.buckle }, skirtSkin, { rot: [0, -0.62, 0], radius: 0.006 });
    }
    if (red) {   // pisau bersarung di paha kiri
      rbox(m, [0.05, 0.3, 0.085], [-0.565, 2.24, -0.14], { all: R.sheath }, skirtSkin, { radius: 0.018 });
      rbox(m, [0.04, 0.12, 0.05], [-0.565, 2.45, -0.14], { all: R.black }, skirtSkin, { radius: 0.012 });
      rbox(m, [0.06, 0.02, 0.07], [-0.565, 2.39, -0.14], { all: R.metal }, skirtSkin, { radius: 0.005 });
    }
  }
  // rompi pelat (kaku di tulang dada)
  {
    const ch = one(B.chest);
    rbox(m, [0.84, 0.74, 0.07], [0, 3.43, -0.415], { all: R.trim, nz: R.plateF, pz: R.vest, py: R.T }, ch,
      { radius: 0.022, seg: 2, rot: [0.06, 0, 0], bend: p => [p[0], p[1], p[2] + 0.14 * p[0] * p[0]] });
    rbox(m, [0.84, 0.72, 0.06], [0, 3.45, 0.345], { all: R.trim, pz: R.plateB, nz: R.vest, py: R.T }, ch,
      { radius: 0.02, bend: p => [p[0], p[1], p[2] - 0.12 * p[0] * p[0]] });
    const cp: V3[] = [], co: V3[] = [];
    for (let k = 0; k <= 28; k++) { const a = (k / 28) * Math.PI * 2; cp.push([Math.sin(a) * 0.49, 3.27, Math.cos(a) * 0.315 - 0.01]); co.push([Math.sin(a), 0, Math.cos(a)]); }
    strap(m, cp, co, 0.3, 0.025, R.cummer, (_k, p) => torsoSkin(p[1]));
    for (const s of [1, -1]) {
      const x = 0.27 * s;
      const sp: V3[] = [[x, 3.79, -0.44], [x, 3.86, -0.31], [x, 3.93, -0.21], [x, 3.98, -0.145], [x, 4.02, -0.045], [x, 4.03, 0.045],
        [x, 3.99, 0.165], [x, 3.94, 0.215], [x, 3.86, 0.26], [x, 3.79, 0.39]];
      strap(m, sp, sp.map(p => norm([0.3 * p[0], p[1] - 3.55, p[2]])), 0.13, 0.028, R.strap, () => ch, 1);
      rbox(m, [0.1, 0.05, 0.02], [x, 3.87, -0.335], { all: R.black, nz: R.buckle }, ch, { rot: [0.95, 0, 0], radius: 0.006 });
    }
    const tapeX = red ? -0.17 : 0;
    // permukaan depan pelat (miring 0.06 rad): z = −0.415 + 0.06·(y − 3.43) − 0.035 + 0.14·x²
    const plateZ = (x: number, y: number) => -0.45 + 0.06 * (y - 3.43) + 0.14 * x * x;
    plainBox(m, [0.3, 0.075, 0.012], [tapeX, 3.66, plateZ(tapeX, 3.66) - 0.007], { all: R.black, nz: R.tape }, ch, [0.06, 0, 0]);
    for (const x of [-0.18, 0, 0.18]) rbox(m, [0.16, 0.22, 0.075], [x, 3.2, plateZ(x, 3.2) - 0.037], { all: R.vest, nz: R.mag }, ch, { radius: 0.018, rot: [0.06, 0, 0] });
    const gz = plateZ(-0.3, 3.64) - 0.068;
    ellipsoid(m, [-0.3, 3.64, gz], [0.068, 0.085, 0.068], R.grenade, ch);
    rbox(m, [0.04, 0.045, 0.04], [-0.3, 3.745, gz], { all: R.metal }, ch, { radius: 0.008 });
    rbox(m, [0.014, 0.09, 0.028], [-0.25, 3.7, gz - 0.005], { all: R.metal }, ch, { rot: [0, 0, 0.25], radius: 0.004 });
  }
  if (red) {
    // bandana merah: lingkar leher, segitiga di dada, simpul belakang
    const np: V3[] = [], no: V3[] = [];
    for (let k = 0; k <= 22; k++) { const a = (k / 22) * Math.PI * 2; np.push([Math.sin(a) * 0.19, 4.02, 0.015 + Math.cos(a) * 0.165]); no.push([Math.sin(a), 0.15, Math.cos(a)]); }
    strap(m, np, no, 0.11, 0.05, R.bandana, () => bl(B.chest, B.neck, 0.5));
    const rows = 7, cols = 9, base = m.n, from = m.idx.length;
    for (let r = 0; r < rows; r++) {
      const y = 3.995 - r * 0.056, w = 0.34 * (1 - r / 6.4), z0 = lerp(-0.2, -0.458, sstep(0, 2.2, r));
      for (let c = 0; c < cols; c++) { const x = lerp(-w / 2, w / 2, c / (cols - 1)); m.v([x, y, z0 + 0.25 * x * x], auv(R.bandana, c / (cols - 1), 1 - r / (rows - 1)), one(B.chest)); }
    }
    for (let r = 0; r < rows - 1; r++) for (let c = 0; c < cols - 1; c++) {
      const a = base + r * cols + c, b = a + 1, cc = a + cols, d = cc + 1;
      m.tri(a, b, cc); m.tri(b, d, cc);
    }
    m.faceNormals(from);
    ellipsoid(m, [0, 3.99, 0.19], [0.06, 0.045, 0.045], R.bandana, one(B.chest));
    for (const s of [-1, 1]) rbox(m, [0.05, 0.1, 0.015], [0.04 * s, 3.92, 0.205], { all: R.bandana }, one(B.chest), { rot: [0.2, 0, 0.3 * s], radius: 0.005 });
    // sabuk peluru selempang: bahu kanan → depan rompi → pinggang kiri → punggung → bahu kanan; peluru kuningan 3D di depan
    const bp: V3[] = [[0.31, 4.05, -0.02], [0.32, 3.97, -0.17], [0.27, 3.87, -0.36], [0.2, 3.78, -0.465], [0.08, 3.63, -0.47], [-0.08, 3.49, -0.476],
      [-0.25, 3.36, -0.478], [-0.4, 3.24, -0.465], [-0.5, 3.12, -0.33], [-0.55, 3.06, -0.1], [-0.54, 3.07, 0.12], [-0.42, 3.17, 0.33],
      [-0.2, 3.38, 0.405], [0.02, 3.58, 0.41], [0.2, 3.76, 0.39], [0.3, 3.9, 0.27], [0.32, 4.0, 0.13], [0.31, 4.05, -0.02]];
    const bo = bp.map(p => norm([p[0], (p[1] - 3.5) * 0.6, p[2]]));
    strap(m, bp, bo, 0.11, 0.035, R.band, () => one(B.chest), 4);
    let acc = 0;
    for (let k = 1; k < 8; k++) {
      const a = bp[k], b = bp[k + 1], seg = Math.hypot(...sub(b, a)), tg = norm(sub(b, a)), nn = bo[k], sd = norm(cross(tg, nn));
      for (let d = (0.06 - acc) % 0.06; d < seg; d += 0.06) {
        const c = add(add(a, mul(tg, d)), mul(nn, 0.028));
        tube(m, [add(c, mul(sd, 0.045)), add(c, mul(sd, -0.045))], t => (t > 0.8 ? lerp(0.016, 0.006, (t - 0.8) / 0.2) : 0.016), 6, R.brass, () => one(B.chest));
        acc = seg - d;
      }
    }
  }
}

// ───────────────────────────── instans (tulang per karakter) + pemetaan pose dari R6
const _v1 = new THREE.Vector3();
const _bb = new THREE.Box3();
const Q_GRIP_R = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.245, 0, 0));
const Q_GRIP_L = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.PI / 2));
const GRIP_AXIS = new THREE.Vector3(0, -0.97, -0.24).normalize();
const GUN_SCALE = 0.8;
interface GunInfo { buttZ: number; muzzleZ: number; bullpup: boolean }
const GUN_INFO = new WeakMap<THREE.BufferGeometry, GunInfo>();
const gunInfo = (g: THREE.BufferGeometry): GunInfo => {
  let i = GUN_INFO.get(g);
  if (!i) { g.computeBoundingBox(); _bb.copy(g.boundingBox!); i = { buttZ: _bb.max.z, muzzleZ: _bb.min.z, bullpup: _bb.max.z < 0.7 }; GUN_INFO.set(g, i); }
  return i;
};

/** Masukan pose dari BlockyCharacter.update (rotasi sendi R6 + berat transisi). */
export interface R6Pose {
  hipsY: number; hipsYaw: number; chestX: number; chestY: number; chestDy: number; neckX: number;
  shoulderR: THREE.Euler; shoulderL: THREE.Euler; legL: number; legR: number; crouch: number; air: number; low: number; walk: number;
  held: string; reload: number; gun: THREE.Mesh | null;
}

export class VennyRig {
  readonly root = new THREE.Group();
  readonly mesh: THREE.SkinnedMesh;
  readonly bones: THREE.Bone[] = [];
  readonly mat: THREE.MeshLambertMaterial;
  /** Wadah senapan di bahu kanan (anak tulang dada); weaponMount R6 dipindah ke sini (senapan) atau ke tangan (pisau/granat). */
  readonly gunPivot = new THREE.Group();
  private mode: 'rifle' | 'hand' | null = null;
  private readonly bindUp: THREE.Vector3[] = [];

  constructor(team: Team, castShadow: boolean, probe: { value: THREE.Vector2 }, bounce: { value: THREE.Color | THREE.Vector3 }) {
    const tpl = vennyTemplate(team);
    for (let i = 0; i < BONES.length; i++) this.bones.push(new THREE.Bone());
    BONES.forEach(([par, p], i) => {
      const b = this.bones[i];
      if (par >= 0) { const q = BONES[par][1]; b.position.set(p[0] - q[0], p[1] - q[1], p[2] - q[2]); this.bones[par].add(b); }
      else b.position.set(p[0], p[1], p[2]);
    });
    // arah tulang ikat (ke anak) untuk IK lengan
    for (let i = 0; i < BONES.length; i++) this.bindUp.push(new THREE.Vector3());
    for (const [a, c] of [[B.armR, B.foreR], [B.foreR, B.handR], [B.armL, B.foreL], [B.foreL, B.handL]]) {
      const pa = BONES[a][1], pc = BONES[c][1];
      this.bindUp[a].set(pc[0] - pa[0], pc[1] - pa[1], pc[2] - pa[2]).normalize();
    }
    this.mat = new THREE.MeshLambertMaterial({ map: tpl.tex, alphaTest: 0.5, emissive: 0x000000 });
    this.mat.onBeforeCompile = (sh) => {
      sh.uniforms.uProbe = probe; sh.uniforms.uBounce = bounce;
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
uniform vec2 uProbe;
uniform vec3 uBounce;`)
        .replace('#include <aomap_fragment>', `#include <aomap_fragment>
	reflectedLight.indirectDiffuse *= uProbe.x;
	reflectedLight.indirectDiffuse += diffuseColor.rgb * uBounce * uProbe.y;`);
    };
    this.mat.customProgramCacheKey = () => 'venny-probe';
    this.mesh = new THREE.SkinnedMesh(tpl.geo, this.mat);
    this.mesh.add(this.bones[0]);
    this.mesh.bind(new THREE.Skeleton(this.bones));
    this.mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 2.4, 0), 3.8);
    this.mesh.castShadow = castShadow; this.mesh.receiveShadow = true;
    this.root.add(this.mesh);
    this.gunPivot.position.set(0.2, 3.84 - 3.45, -0.27);
    this.bones[B.chest].add(this.gunPivot);
  }

  dispose() { this.mat.dispose(); }

  /** Pindahkan weaponMount R6 ke wadah yang sesuai mode (senapan di bahu / benda di tangan kanan). */
  private attach(mount: THREE.Group, mode: 'rifle' | 'hand', gun: THREE.Mesh | null) {
    if (this.mode === mode && mount.parent === (mode === 'rifle' ? this.gunPivot : this.bones[B.handR])) return;
    this.mode = mode;
    if (mode === 'rifle') {
      this.gunPivot.add(mount);
      mount.rotation.x = Math.PI / 2;
      const gi = gun ? gunInfo(gun.geometry) : { buttZ: 0.95 };
      mount.position.set(0, -0.15 * GUN_SCALE, -(gi.buttZ - 0.03) * GUN_SCALE);
    } else {
      this.bones[B.handR].add(mount);
      mount.rotation.x = 0;
      mount.position.set(0.005, -0.12, -0.01);
    }
  }

  /** Pose Venny dari pose R6 yang baru dihitung (dipanggil di akhir BlockyCharacter.update). */
  pose(p: R6Pose, mount: THREE.Group, charRoot: THREE.Object3D) {
    const b = this.bones, k01 = (x: number) => Math.min(1, Math.max(0, x));
    const c = k01(p.crouch); p.low = k01(p.low); p.walk = k01(p.walk); p.air = k01(p.air);
    // pinggul: tinggi berdiri ↔ berlutut + hentakan mendarat R6; putar mengikuti arah kaki
    const dip = p.hipsY - lerp(XCFG.rig.hipsY, XCFG.player.hipsCrouchY, c);
    b[B.hips].position.y = lerp(2.5, 1.36, c) + dip * 0.8;
    b[B.hips].rotation.set(0.1 * c, p.hipsYaw, 0);
    b[B.spine].rotation.set(0.4 * p.chestX + 0.12 * c, 0.45 * p.chestY, 0);
    b[B.chest].rotation.set(0.6 * p.chestX, 0.55 * p.chestY, 0);
    b[B.chest].position.y = 0.47 + p.chestDy;
    // kaki: ayunan R6 + tekuk lutut (kaki di belakang → lutut menekuk; di udara menekuk), berlutut saat jongkok
    const legPose = (thigh: number, shin: number, foot: number, swing: number, kneelT: number, kneelS: number, kneelF: number) => {
      const knee = 0.06 + 1.05 * Math.max(0, -swing) * p.walk + 0.15 * Math.max(0, swing) * p.walk + 0.45 * p.air;
      const tx = lerp(swing, kneelT + 0.4 * swing, c), sx = lerp(-knee, kneelS, c);
      b[thigh].rotation.set(tx, 0, 0); b[shin].rotation.set(sx, 0, 0);
      b[foot].rotation.set(lerp(-(tx + sx) * 0.7, kneelF, c), 0, 0);
    };
    legPose(B.thighL, B.shinL, B.footL, p.legL, 1.3, -1.42, 0.12);
    legPose(B.thighR, B.shinR, B.footR, p.legR, -0.08, -1.6, 0.6);
    // kepala: pitch R6 dibagi leher/kepala; saat membidik senapan kepala sedikit menunduk & miring ke popor
    const rifle = (p.held === 'ar' || p.held === undefined) && p.gun !== null;
    const aimW = rifle ? 1 - p.low : 0;
    b[B.neck].rotation.set(0.45 * p.neckX, 0, 0);
    b[B.head].rotation.set(0.55 * p.neckX - 0.09 * aimW, 0, -0.07 * aimW);
    if (!rifle) {
      // satu tangan (pisau / granat / kosong): FK dari bahu R6 + siku menekuk
      this.attach(mount, 'hand', p.gun);
      b[B.armR].rotation.copy(p.shoulderR); b[B.foreR].rotation.set(0.45, 0, 0); b[B.handR].rotation.set(0, 0, 0);
      b[B.armL].rotation.copy(p.shoulderL); b[B.foreL].rotation.set(0.35, 0, 0); b[B.handL].rotation.set(0, 0, 0);
      return;
    }
    // senapan di bahu kanan: pitch = sudut lengan R6 − 90° (bidik / low-ready / ayun lari / angkat popor sudah termasuk)
    this.attach(mount, 'rifle', p.gun);
    this.gunPivot.rotation.set(p.shoulderR.x - Math.PI / 2, -0.06, 0);
    this.gunPivot.position.set(0.2, 0.39 - 0.1 * p.low, -0.27 - 0.05 * p.low);
    charRoot.updateMatrixWorld(true);
    const gun = p.gun!, gi = gunInfo(gun.geometry);
    const gq = gun.getWorldQuaternion(_gq);
    // tangan kanan: kepalan di gagang (sumbu gagang miring 14°), pergelangan di atasnya
    gun.localToWorld(_tR.set(0.03, -0.14, 0.03)).addScaledVector(_v1.copy(GRIP_AXIS).applyQuaternion(gq), -0.122);
    // tangan kiri: di bawah handguard (atau ke magazen saat reload); jari melingkar ke kanan senjata
    gun.localToWorld(_tL.set(-0.03, 0.03, gi.muzzleZ * (gi.bullpup ? 0.72 : 0.62)));
    if (p.reload >= 0) _tL.lerp(gun.localToWorld(_v1.set(-0.12, -0.42, gi.bullpup ? 0.3 : -0.42)), Math.sin(Math.PI * Math.min(1, p.reload)));
    _tL.addScaledVector(_v1.set(1, 0, 0).applyQuaternion(gq), -0.122);
    const chestQ = b[B.chest].getWorldQuaternion(_cq);
    _pR.set(0.55, -0.6, 0.45).applyQuaternion(chestQ); _pL.set(-0.35, -0.8, 0.25).applyQuaternion(chestQ);
    _hR.copy(gq).multiply(Q_GRIP_R); _hL.copy(gq).multiply(Q_GRIP_L);
    this.ik(B.armR, B.foreR, B.handR, _tR, _pR, _hR);
    this.ik(B.armL, B.foreL, B.handL, _tL, _pL, _hL);
  }

  /** IK dua tulang: pangkal di `up`, target pergelangan T (dunia), arah siku `pole` (dunia), orientasi tangan dunia `handQ`.
   *  Memakai temp sendiri (_k*) — masukan tidak diubah. */
  private ik(up: number, fore: number, hand: number, T: THREE.Vector3, pole: THREE.Vector3, handQ: THREE.Quaternion) {
    const bu = this.bones[up], bf = this.bones[fore], bh = this.bones[hand];
    const a = bf.position.length(), bb = bh.position.length();
    const S = bu.getWorldPosition(_k1);
    const u = _k2.copy(T).sub(S);
    const d = Math.min(a + bb - 1e-3, Math.max(Math.abs(a - bb) + 1e-3, u.length()));
    u.normalize();
    const x = (a * a - bb * bb + d * d) / (2 * d), h = Math.sqrt(Math.max(0, a * a - x * x));
    const w = _k3.copy(pole).addScaledVector(u, -pole.dot(u)).normalize();
    const E = _k4.copy(S).addScaledVector(u, x).addScaledVector(w, h);
    const Tc = _k5.copy(S).addScaledVector(u, d);
    // lengan atas: arah ikat → (E − S) di ruang induk; lengan bawah: → (T − E); tangan: orientasi dunia diminta
    const parQ = bu.parent!.getWorldQuaternion(_kq1);
    bu.quaternion.setFromUnitVectors(this.bindUp[up], _k3.copy(E).sub(S).normalize().applyQuaternion(_kq2.copy(parQ).invert()));
    const upQ = parQ.multiply(bu.quaternion);
    bf.quaternion.setFromUnitVectors(this.bindUp[fore], _k3.copy(Tc).sub(E).normalize().applyQuaternion(_kq2.copy(upQ).invert()));
    const foreQ = upQ.multiply(bf.quaternion);
    bh.quaternion.copy(foreQ.invert().multiply(handQ));
  }
}
const _gq = new THREE.Quaternion(), _cq = new THREE.Quaternion(), _hR = new THREE.Quaternion(), _hL = new THREE.Quaternion();
const _tR = new THREE.Vector3(), _tL = new THREE.Vector3(), _pR = new THREE.Vector3(), _pL = new THREE.Vector3();
const _k1 = new THREE.Vector3(), _k2 = new THREE.Vector3(), _k3 = new THREE.Vector3(), _k4 = new THREE.Vector3(), _k5 = new THREE.Vector3();
const _kq1 = new THREE.Quaternion(), _kq2 = new THREE.Quaternion();

/** Venny memegang senjata dunia sedikit lebih kecil (proporsi manusia; panjang senapan GDD dibuat untuk tangan balok). */
export const VENNY_GUN_SCALE = GUN_SCALE;
