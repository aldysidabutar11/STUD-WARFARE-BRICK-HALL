// src/entities/botTactics.ts — pencarian posisi taktis bot di graf nav (tanpa ctx; LOS & lantai lewat callback → tests/botTactics.test.ts
// menguji dengan collider Rapier map asli):
//  • coverFrom  — node cover terdekat (biaya JALUR ≤ maks, GDD §11.9) yang mata jongkoknya tidak terlihat dari mata ancaman.
//  • fightSpot  — posisi baku tembak dari balik cover: node cover dekat yang menyembunyikan mata jongkok + titik intip (berdiri di
//                 balik cover rendah, atau geser ±offset tegak lurus arah ancaman) yang punya garis pandang mata berdiri → dada ancaman.
//  • fleeNode   — titik kabur dari granat: terhalang dari titik ledak atau ≥ jarak aman (terpojok: minimal menjauh 2 u),
//                 tidak lewat dekat granat, jalur pendek.
import type { NavGraph } from '../world/NavGraph';

/** true bila garis a → b terhalang (physics.losBlocked). */
export type BlockedFn = (ax: number, ay: number, az: number, bx: number, by: number, bz: number) => boolean;
/** Tinggi lantai di bawah (x, z) dekat ketinggian y (null = tidak ada lantai / jurang). */
export type GroundFn = (x: number, y: number, z: number) => number | null;
export interface P3 { x: number; y: number; z: number }

export interface Eyes { stand: number; crouch: number }

/** Biaya jalur (jumlah panjang antar-node). */
export function pathCost(nav: NavGraph, path: readonly number[]): number {
  let c = 0;
  for (let i = 1; i < path.length; i++) {
    const a = nav.nodes[path[i - 1]], b = nav.nodes[path[i]];
    c += Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
  }
  return c;
}

/** Biaya jalur dari posisi `f` ke node `to` (jarak ke node awal + jalur graf), Infinity bila tak terjangkau. */
export function costTo(nav: NavGraph, f: P3, to: number, buf: number[]): number {
  const from = nav.nearest(f.x, f.y, f.z), s = nav.nodes[from];
  if (!nav.findPath(from, to, false, buf)) return Infinity;
  return Math.hypot(s.x - f.x, s.z - f.z) + pathCost(nav, buf);
}

const sameFloor = (ny: number, fy: number) => Math.abs(ny - fy) < 3;

/** Node cover terdekat menurut biaya jalur (≤ maxCost) yang mata jongkoknya (Y + eyeCrouch) tidak punya LOS ke mata ancaman `t`.
 *  Diperiksa maksimal `tries` kandidat terdekat (jarak lurus) agar A* tidak dijalankan untuk semua node. −1 = tidak ada. */
export function coverFrom(nav: NavGraph, blocked: BlockedFn, f: P3, t: P3, maxCost: number, eyeCrouch: number, buf: number[],
  tries = 5): number {
  const cands: number[] = [];
  for (let i = 0; i < nav.nodes.length; i++) {
    const n = nav.nodes[i];
    if (!n.cover || Math.hypot(n.x - f.x, n.y - f.y, n.z - f.z) > maxCost) continue;
    if (!blocked(n.x, n.y + eyeCrouch, n.z, t.x, t.y, t.z)) continue;   // masih terlihat ancaman
    cands.push(i);
  }
  const d = (i: number) => { const n = nav.nodes[i]; return Math.hypot(n.x - f.x, n.y - f.y, n.z - f.z); };
  cands.sort((a, b) => d(a) - d(b));
  let best = -1, bestC = maxCost;
  for (let k = 0; k < cands.length && k < tries; k++) {
    if (d(cands[k]) >= bestC) break;
    const c = costTo(nav, f, cands[k], buf);
    if (c <= bestC) { bestC = c; best = cands[k]; }
  }
  return best;
}

export interface FightSpot {
  node: number;
  /** titik intip (x, z) di lantai node; = posisi node bila `stand` */
  px: number; pz: number;
  /** intip dengan berdiri di node (cover rendah, mis. mobil) */
  stand: boolean;
  /** harus jongkok saat bersembunyi (mata berdiri di node masih terlihat ancaman) */
  hideCrouch: boolean;
}
export interface FightOpts { maxDist: number; offsets: readonly number[]; eyes: Eyes }

/** Posisi baku tembak dari balik cover (lihat kepala file). te = mata ancaman, tc = dada ancaman. */
export function fightSpot(nav: NavGraph, blocked: BlockedFn, ground: GroundFn, f: P3, te: P3, tc: P3, o: FightOpts, out: FightSpot,
  buf: number[]): boolean {
  const cands: number[] = [];
  for (let i = 0; i < nav.nodes.length; i++) {
    const n = nav.nodes[i];
    if (n.cover && sameFloor(n.y, f.y) && Math.hypot(n.x - f.x, n.z - f.z) <= o.maxDist) cands.push(i);
  }
  const d = (i: number) => { const n = nav.nodes[i]; return Math.hypot(n.x - f.x, n.z - f.z); };
  cands.sort((a, b) => d(a) - d(b));
  let best = Infinity;
  for (const i of cands) {
    const n = nav.nodes[i], dn = d(i);
    if (dn >= best) break;
    if (!blocked(n.x, n.y + o.eyes.crouch, n.z, te.x, te.y, te.z)) continue;          // tidak menyembunyikan (jongkok pun terlihat)
    const hideCrouch = !blocked(n.x, n.y + o.eyes.stand, n.z, te.x, te.y, te.z);
    let px = n.x, pz = n.z, stand = false, cost = dn;
    if (hideCrouch && !blocked(n.x, n.y + o.eyes.stand, n.z, tc.x, tc.y, tc.z)) stand = true;   // cover rendah: berdiri = intip
    else {
      // intip samping: geser tegak lurus arah ancaman (offset kecil dulu), jalur geser bebas, lantai rata, LOS mata berdiri → dada
      const dx = te.x - n.x, dz = te.z - n.z, l = Math.hypot(dx, dz) || 1, sx = -dz / l, sz = dx / l;
      let found = false;
      for (const off of o.offsets) {
        for (const sg of [1, -1]) {
          const qx = n.x + sx * off * sg, qz = n.z + sz * off * sg;
          if (blocked(n.x, n.y + 1, n.z, qx, n.y + 1, qz) || blocked(n.x, n.y + 3, n.z, qx, n.y + 3, qz)) continue;
          const gy = ground(qx, n.y, qz);
          if (gy === null || Math.abs(gy - n.y) > 0.6) continue;
          if (blocked(qx, gy + o.eyes.stand, qz, tc.x, tc.y, tc.z)) continue;
          px = qx; pz = qz; found = true; cost = dn + off * 0.5;
          break;
        }
        if (found) break;
      }
      if (!found) continue;
    }
    if (cost >= best) continue;
    // jalur ada & tidak memutar jauh (mis. node di balik kontainer yang harus dikelilingi)
    if (costTo(nav, f, i, buf) > dn * 1.6 + 2) continue;
    best = cost;
    out.node = i; out.px = px; out.pz = pz; out.stand = stand; out.hideCrouch = hideCrouch;
  }
  return best < Infinity;
}

export interface FleeOpts { radius: number; safe: number; chestY: number }

/** Titik kabur dari granat di g (lihat kepala file). −1 = tidak ada (bot kabur lurus menjauh). */
export function fleeNode(nav: NavGraph, blocked: BlockedFn, f: P3, g: P3, o: FleeOpts, buf: number[]): number {
  const gx = g.x - f.x, gz = g.z - f.z, gl = Math.hypot(gx, gz) || 1, d0 = Math.hypot(f.x - g.x, f.y - g.y, f.z - g.z);
  const scored: [number, number][] = [];
  for (let i = 0; i < nav.nodes.length; i++) {
    const n = nav.nodes[i];
    if (!sameFloor(n.y, f.y)) continue;
    const dn = Math.hypot(n.x - f.x, n.z - f.z);
    if (dn > o.radius || dn < 1.5) continue;
    const dg = Math.hypot(n.x - g.x, n.y - g.y, n.z - g.z);
    // jangan lari melewati granat (arah node searah granat & lebih jauh dari granat)
    if (((n.x - f.x) * gx + (n.z - f.z) * gz) / (dn * gl) > 0.3 && dn > gl * 0.6) continue;
    const hidden = blocked(g.x, g.y + 0.3, g.z, n.x, n.y + o.chestY, n.z), safe = hidden || dg >= o.safe * 0.8;
    // tidak aman penuh (mis. terpojok): masih boleh bila menjauh ≥ 2 u dari granat — lebih baik daripada lari lurus ke dinding
    if (!safe && dg < d0 + 2) continue;
    scored.push([(hidden ? 12 : 0) + (safe ? 6 : 0) + Math.min(dg, o.safe + 3) - 0.6 * dn, i]);
  }
  scored.sort((a, b) => b[0] - a[0]);
  // 3 terbaik: yang jalurnya tidak memutar (≤ 1.8 × radius)
  for (let k = 0; k < scored.length && k < 3; k++) if (costTo(nav, f, scored[k][1], buf) <= o.radius * 1.8) return scored[k][1];
  return -1;
}
