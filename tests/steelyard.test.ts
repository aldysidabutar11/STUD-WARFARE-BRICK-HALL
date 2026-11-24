// tests/steelyard.test.ts — denah, nav & garis pandang Steel Yard (C1). Collider = SY_BOXES persis seperti di game
// (addBoxColliders → Rapier), garis pandang & validasi edge memakai raycast Rapier (physics.losBlocked). Perbaikan review (X1):
// collider ↔ visual (kabin mobil, barrier, spool, tiang/daun pintu kontainer, terpal), jalur bot dari sudut spawn sendiri,
// material pantulan granat di titik kontak (bola Rapier), collider dilepas tuntas saat ganti map.
import { beforeAll, describe, expect, it } from 'vitest';
import { RAPIER, physics } from '../src/physics/Physics';
import { GROUPS } from '../src/physics/groups';
import { CFG } from '../src/config/gameConfig';
import { XCFG } from '../src/config/extraConfig';
import { bounceMaterial } from '../src/combat/GrenadeK400';
import { MAPS, type MapDef } from '../src/world/maps/registry';
import { addBoxColliders, removeColliders } from '../src/world/maps/shared';
import { NavGraph } from '../src/world/NavGraph';
import { boxAabbXZ, boxCorners, distToBoxXZ, type Box } from '../src/world/MapData';
import {
  SY, SY_BOXES, SY_DIMS, SY_ENV_PROBE, SY_MENU_CAM, SY_PRACTICE, SY_SPAWNS, containerBoxes, deriveBoxes, mirrorPose, propBoxes,
  syZoneName, sySurfaceAt, type SYContainer,
} from '../src/world/maps/steelyard/layout';
import { SY_LANES, SY_NAV } from '../src/world/maps/steelyard/nav';
import { BACKDROP_SEED, emitBackdrop } from '../src/world/maps/steelyard/visual/backdrop';
import { Geo } from '../src/world/maps/steelyard/visual/geo';
import { emitProp } from '../src/world/maps/steelyard/visual/props';
import { syColliders } from '../src/world/maps/steelyard/build';

const CAPSULE = 0.8;
const BX = SY.bounds.x, BZ = SY.bounds.z;
/** Penghalang badan karakter (pita 0.6–4.9 di atas tanah): palet 0.4 bisa dinaiki, atap/tumpukan di atas kepala. */
const BODY = SY_BOXES.filter(b => b.style !== 'hidden' && b.min[1] < 4.9 && b.max[1] > 0.6);
const clearance = (x: number, z: number, list: Box[] = BODY) => {
  let m = Infinity, who = '';
  for (const b of list) { const d = distToBoxXZ(b, x, z); if (d < m) { m = d; who = b.id; } }
  return { m, who };
};
const BLUE = SY_SPAWNS.blue.ground, RED = SY_SPAWNS.red.ground;
const r2 = (v: number) => Math.round(v * 100) / 100;

/** RNG deterministik (mulberry32). */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** SAT 2D antar tapak OBB + rentang Y (tumpang tindih > eps). */
function overlap(a: Box, b: Box, eps = 1e-4): boolean {
  if (Math.min(a.max[1], b.max[1]) - Math.max(a.min[1], b.min[1]) <= eps) return false;
  const ca = boxCorners(a), cb = boxCorners(b);
  for (const bx of [a, b]) {
    const c = Math.cos(bx.rotY ?? 0), s = Math.sin(bx.rotY ?? 0);
    for (const [ax, az] of [[c, -s], [s, c]]) {
      const pa = ca.map(([x, z]) => x * ax + z * az), pb = cb.map(([x, z]) => x * ax + z * az);
      if (Math.min(Math.max(...pa), Math.max(...pb)) - Math.max(Math.min(...pa), Math.min(...pb)) <= eps) return false;
    }
  }
  return true;
}

/** Kunci geometri balok (sudut tapak dibulatkan + rentang Y), untuk membandingkan himpunan balok cermin. */
const geoKey = (b: Box, mx = false, mz = false) => boxCorners(b).map(([x, z]) => `${r2(mx ? -x : x) + 0},${r2(mz ? -z : z) + 0}`)
  .sort().join(';') + `|${r2(b.min[1])},${r2(b.max[1])}`;

beforeAll(async () => {
  await physics.init();
  addBoxColliders(SY_BOXES);
  physics.world.step();
});
const los = (ax: number, ay: number, az: number, bx: number, by: number, bz: number) => !physics.losBlocked(ax, ay, az, bx, by, bz);

describe('Steel Yard — balok (a)', () => {
  it('balok valid: min < max, rotY ternormal, id unik, turunan murni dari SY', () => {
    const ids = new Set<string>();
    for (const b of SY_BOXES) {
      for (let k = 0; k < 3; k++) expect(b.max[k] - b.min[k], `${b.id} sumbu ${k}`).toBeGreaterThan(0);
      if (b.rotY !== undefined) { expect(Math.abs(b.rotY)).toBeGreaterThan(1e-6); expect(b.rotY).toBeGreaterThan(-Math.PI / 2); expect(b.rotY).toBeLessThanOrEqual(Math.PI / 2); }
      expect(ids.has(b.id), b.id).toBe(false); ids.add(b.id);
      if (b.id !== 'GROUND') { expect(b.min[1]).toBeGreaterThanOrEqual(0); expect(b.max[1]).toBeLessThanOrEqual(2 * SY_DIMS.container.h + 1e-9); }
    }
    expect(deriveBoxes(SY)).toEqual(SY_BOXES);
    expect(SY_BOXES.filter(b => b.style === 'hidden').map(b => b.id)).toEqual(['GROUND']);
  });
  it('semua kontainer & prop di dalam area main; pagar menutup keliling setinggi 9', () => {
    for (const b of SY_BOXES) {
      if (b.cat === 'shell') continue;
      const a = boxAabbXZ(b);
      expect(a.x[0], b.id).toBeGreaterThanOrEqual(BX[0] - 1e-9); expect(a.x[1], b.id).toBeLessThanOrEqual(BX[1] + 1e-9);
      expect(a.z[0], b.id).toBeGreaterThanOrEqual(BZ[0] - 1e-9); expect(a.z[1], b.id).toBeLessThanOrEqual(BZ[1] + 1e-9);
    }
    const fence = SY_BOXES.filter(b => b.style === 'fence');
    for (const f of fence) expect(f.max[1] - f.min[1]).toBe(9);
    // tiap titik keliling (langkah 1 u) tertutup balok pagar yang muka dalamnya tepat di batas
    const covered = (x: number, z: number) => fence.some(b => distToBoxXZ(b, x, z) < 1e-6);
    for (let x = BX[0]; x <= BX[1]; x += 1) { expect(covered(x, BZ[0] - 0.3)).toBe(true); expect(covered(x, BZ[1] + 0.3)).toBe(true); }
    for (let z = BZ[0]; z <= BZ[1]; z += 1) { expect(covered(BX[0] - 0.3, z)).toBe(true); expect(covered(BX[1] + 0.3, z)).toBe(true); }
    for (const f of fence) {                                   // muka dalam pagar tepat di batas (tidak memakan area main)
      const a = boxAabbXZ(f), alongZ = a.z[1] - a.z[0] > a.x[1] - a.x[0];
      if (alongZ) expect(Math.min(Math.abs(a.x[0]), Math.abs(a.x[1])), f.id).toBeCloseTo(BX[1], 9);
      else expect(Math.min(Math.abs(a.z[0]), Math.abs(a.z[1])), f.id).toBeCloseTo(BZ[1], 9);
    }
  });
  it('kontainer & prop tidak saling tembus (kecuali bagian kontainer yang sama)', () => {
    const solid = SY_BOXES.filter(b => b.cat !== 'shell');
    const bad: string[] = [];
    for (let i = 0; i < solid.length; i++) for (let j = i + 1; j < solid.length; j++) {
      const a = solid[i], b = solid[j];
      if (a.id.split(':')[0] === b.id.split(':')[0]) continue;
      if (overlap(a, b)) bad.push(`${a.id} × ${b.id}`);
    }
    expect(bad).toEqual([]);
  });
  it('tinggi pelindung menghindari pita head-glitch GDD §4.4 (2.95–3.75 & 4.25–5.05)', () => {
    const bad = SY_BOXES.filter(b => b.cat === 'cover' || b.cat === 'prop').filter(b => {
      const top = b.max[1];
      return (top > 2.95 && top < 3.75) || (top > 4.25 && top < 5.05);
    }).map(b => `${b.id} ${b.max[1]}`);
    expect(bad).toEqual([]);
  });
  it('isi map lengkap: kontainer 10/20/40 ft, terbuka (ends & one), miring, tumpuk 2, semua jenis prop, genangan', () => {
    const K = SY.containers;
    for (const s of [10, 20, 40] as const) expect(K.some(k => k.size === s), `${s} ft`).toBe(true);
    expect(K.filter(k => k.open === 'ends').length).toBeGreaterThanOrEqual(4);
    expect(K.some(k => k.open === 'one' && k.doorsOpen)).toBe(true);
    expect(K.filter(k => k.stack === 2).length).toBeGreaterThanOrEqual(2);
    const skew = (k: SYContainer) => { const r = Math.abs(Math.sin(2 * k.rotY)); return r > 0.1; };   // bukan kelipatan 90°
    expect(K.filter(skew).length).toBeGreaterThanOrEqual(4);
    const kinds = new Set(SY.props.map(p => p.kind));
    for (const k of ['pallet', 'palletStack', 'spool', 'crate', 'crateStack', 'barrier', 'car', 'drum', 'tire', 'tarpPile'] as const) expect(kinds.has(k), k).toBe(true);
    expect(SY.puddles.length).toBeGreaterThanOrEqual(8);
  });
  // Revisi "terlalu rapat" (laporan pengguna): dulu pelindung ≤ 7 u dari mana pun — terasa sesak saat berlari. Kini lebih lega,
  // tetap ada pelindung ≥ 2 u dalam < 9.5 u (±0.8 s sprint) dari titik bebas mana pun (terukur maks ±8.9 u).
  it('pelindung cukup: dari titik bebas mana pun ada pelindung setinggi ≥ 2 u dalam 9.5 u', () => {
    const cover = SY_BOXES.filter(b => b.style !== 'hidden' && b.min[1] < 0.05 && b.max[1] >= 2);
    const rnd = rng(7);
    let worst = 0, at = '';
    for (let n = 0; n < 2500;) {
      const x = BX[0] + 0.8 + rnd() * (BX[1] - BX[0] - 1.6), z = BZ[0] + 0.8 + rnd() * (BZ[1] - BZ[0] - 1.6);
      if (clearance(x, z).m < CAPSULE) continue;
      n++;
      const d = clearance(x, z, cover).m;
      if (d > worst) { worst = d; at = `${x.toFixed(1)},${z.toFixed(1)}`; }
    }
    expect(worst, at).toBeLessThan(9.5);
  });
  it('genangan di tanah lapang (tidak menyentuh tapak collider) dan di dalam batas', () => {
    const ground = SY_BOXES.filter(b => b.style !== 'hidden' && b.min[1] < 0.05);
    for (const p of SY.puddles) {
      const c = Math.cos(p.rotY), s = Math.sin(p.rotY);
      for (let i = 0; i < 24; i++) for (const f of [0, 0.5, 1]) {
        const a = (i / 24) * Math.PI * 2, lx = Math.cos(a) * p.rx * f, lz = Math.sin(a) * p.rz * f;
        const x = p.x + lx * c + lz * s, z = p.z - lx * s + lz * c;
        expect(clearance(x, z, ground).m, `genangan ${p.x},${p.z}`).toBeGreaterThan(0.1);
        expect(Math.abs(x)).toBeLessThan(BX[1]); expect(Math.abs(z)).toBeLessThan(BZ[1]);
      }
    }
  });
});

describe('Steel Yard — spawn (b, e)', () => {
  it('10 slot per tim di lantai dasar: Biru SW+SE (z < 0), Merah NW+NE (z > 0), ≥ 1.2 u dari collider, tanpa atap', () => {
    expect(SY_SPAWNS.blue.upper).toEqual([]); expect(SY_SPAWNS.red.upper).toEqual([]);
    for (const [team, list] of [['blue', BLUE], ['red', RED]] as const) {
      expect(list.length).toBe(10);
      const sw = list.filter(([x]) => x < 0).length;
      expect(sw).toBe(5);
      for (const [x, y, z] of list) {
        expect(y).toBe(0);
        expect(Math.sign(z)).toBe(team === 'blue' ? -1 : 1);
        expect(Math.abs(z)).toBeGreaterThan(44);                       // di sudut (Gerbang)
        const c = clearance(x, z);
        expect(c.m, `${team} ${x},${z} dekat ${c.who}`).toBeGreaterThanOrEqual(1.2);
        // sinar dari atas jatuh tepat di tanah (tidak di bawah atap / di dalam benda)
        expect(physics.raycast({ x, y: 20, z }, { x: 0, y: -1, z: 0 }, 40)).toBeCloseTo(20, 3);
      }
      for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++)
        expect(Math.hypot(list[i][0] - list[j][0], list[i][2] - list[j][2])).toBeGreaterThan(2.4);   // > occupiedRadius 1.6
    }
  });
  it('slot spawn dicerminkan tepat (Biru ↔ Merah = cermin Z)', () => {
    expect(RED.map(([x, y, z]) => [x, y, -z])).toEqual(BLUE);
  });
  it('TIDAK ADA garis pandang dari slot spawn ke slot spawn musuh (kaki, jongkok, mata, kepala)', () => {
    const H = [1.0, 3.2, 4.4, 5.0], seen: string[] = [];
    for (const [ax, , az] of BLUE) for (const [bx, , bz] of RED) for (const ha of H) for (const hb of H)
      if (los(ax, ha, az, bx, hb, bz)) seen.push(`${ax},${az}@${ha} ↔ ${bx},${bz}@${hb}`);
    expect(seen).toEqual([]);
  });
});

describe('Steel Yard — kontainer terbuka bisa dilewati (c)', () => {
  const open = SY.containers.filter(k => k.open !== 'none');
  const D = SY_DIMS.container;
  /** Titik lokal kontainer → dunia. */
  const W = (k: SYContainer, lx: number, lz: number): [number, number] => {
    const c = Math.cos(k.rotY), s = Math.sin(k.rotY);
    return [k.cx + lx * c + lz * s, k.cz - lx * s + lz * c];
  };
  it('ada lorong (ends) & ruang (one); ruang dalam bebas selebar kapsul (tiang sudut hanya menyempitkan ujung)', () => {
    expect(open.filter(k => k.open === 'ends').length).toBeGreaterThanOrEqual(4);
    expect(open.filter(k => k.open === 'one').length).toBeGreaterThanOrEqual(2);
    expect(D.w - 2 * D.post).toBeGreaterThan(4 * CAPSULE);                  // mulut di antara tiang tetap lebar
    for (const k of open) {
      const hl = D.len[k.size] / 2, inner = D.w / 2 - D.wall, side = inner - CAPSULE - 0.05;
      for (let lx = -hl + (k.open === 'one' ? 1.0 : 0.3); lx <= hl - 0.3; lx += 0.5) for (const lz of [-side, 0, side]) {
        if (lz !== 0 && Math.abs(lx) > hl - D.post - CAPSULE) continue;    // menempel dinding: sampai tiang sudut
        const [x, z] = W(k, lx, lz);
        expect(clearance(x, z).m, `${k.id} lokal ${lx.toFixed(1)},${lz}`).toBeGreaterThanOrEqual(CAPSULE);
      }
      // atap tepat di atas (tinggi dalam 6.9 > tinggi karakter 5)
      const [x, z] = W(k, 0, 0);
      expect(physics.raycast({ x, y: 1, z }, { x: 0, y: 1, z: 0 }, 20)).toBeCloseTo(D.h - D.wall - 1, 3);
    }
  });
  it('raycast sepanjang sumbu: lorong tembus kedua ujung (+ mulutnya bebas); ruang satu ujung tertutup di belakang', () => {
    for (const k of open) {
      const hl = D.len[k.size] / 2, door = k.doorsOpen ? D.w / 2 : 0;
      for (const h of [1.0, 2.5, 4.4]) for (const lz of [-1.5, 0, 1.5]) {
        const [fx, fz] = W(k, hl + door + 1.5, lz);              // di luar mulut +X
        if (k.open === 'ends') {
          const [bx, bz] = W(k, -hl - door - 1.5, lz);
          expect(los(fx, h, fz, bx, h, bz), `${k.id} tembus @${h}/${lz}`).toBe(true);
        } else {
          const [ix, iz] = W(k, -hl + 0.5, lz), [ox, oz] = W(k, -hl - 1, lz);
          expect(los(fx, h, fz, ix, h, iz), `${k.id} masuk @${h}/${lz}`).toBe(true);
          expect(los(fx, h, fz, ox, h, oz), `${k.id} dinding belakang @${h}/${lz}`).toBe(false);
        }
      }
    }
  });
});

describe('Steel Yard — navigasi (d, h)', () => {
  const g = new NavGraph(SY_NAV);
  it('jumlah node/edge, satu lantai, semua node di ruang bebas & di dalam batas', () => {
    expect(g.nodes.length).toBe(104);
    expect(g.walkEdgeCount).toBe(134);
    expect(g.dropCount).toBe(0);
    const bad: string[] = [];
    for (const n of g.nodes) {
      expect(n.level).toBe(0); expect(n.y).toBe(0);
      expect(Math.abs(n.x)).toBeLessThan(BX[1]); expect(Math.abs(n.z)).toBeLessThan(BZ[1]);
      const c = clearance(n.x, n.z);
      if (c.m < CAPSULE + 0.3) bad.push(`${n.id} ${c.m.toFixed(2)} ${c.who}`);
    }
    expect(bad).toEqual([]);
    expect(g.nodes.filter(n => n.cover).length).toBe(68);
  });
  it('graf terhubung: setiap node terjangkau dari setiap node (tanpa drop)', () => {
    const path: number[] = [];
    for (const s of [0, g.id('S_SPAWN_W'), g.id('N_SPAWN_E'), g.id('C_POS_W')]) for (let i = 0; i < g.nodes.length; i++)
      expect(g.findPath(s, i, false, path), `${g.nodes[s].id} → ${g.nodes[i].id}`).toBe(true);
  });
  it('edge bebas: sapuan kapsul 2D ≥ 0.9 u & raycast Rapier (lutut, dada = NavGraph.validate, kepala)', () => {
    const bad: string[] = [];
    for (const e of g.edges) {
      const A = g.nodes[e.a], B = g.nodes[e.b], len = Math.hypot(B.x - A.x, B.z - A.z), steps = Math.max(2, Math.ceil(len / 0.2));
      let worst = Infinity, who = '';
      for (let i = 0; i <= steps; i++) {
        const t = i / steps, c = clearance(A.x + (B.x - A.x) * t, A.z + (B.z - A.z) * t);
        if (c.m < worst) { worst = c.m; who = c.who; }
      }
      if (worst < 0.9) bad.push(`${A.id}-${B.id} ${worst.toFixed(2)} ${who}`);
      for (const h of [1.0, 4.2]) if (!los(A.x, h, A.z, B.x, h, B.z)) bad.push(`${A.id}-${B.id} terhalang @${h}`);
    }
    expect(bad).toEqual([]);
    expect(g.validate((ax, ay, az, bx, by, bz) => physics.losBlocked(ax, ay, az, bx, by, bz))).toEqual([]);
  });
  it('dari tiap slot spawn & titik latihan, node terdekat terlihat langsung (bot tidak menabrak dinding saat mulai)', () => {
    for (const [x, , z] of [...BLUE, ...RED, ...SY_PRACTICE]) {
      const n = g.nodes[g.nearest(x, 0, z)];
      expect(los(x, 1.0, z, n.x, 1.0, n.z) && los(x, 2.5, z, n.x, 2.5, n.z), `${x},${z} → ${n.id}`).toBe(true);
    }
  });
  it('node terdekat dari titik bebas acak biasanya terlihat (≥ 90%)', () => {
    const rnd = rng(99);
    let ok = 0, n = 0;
    while (n < 1500) {
      const x = BX[0] + 0.8 + rnd() * (BX[1] - BX[0] - 1.6), z = BZ[0] + 0.8 + rnd() * (BZ[1] - BZ[0] - 1.6);
      if (clearance(x, z).m < CAPSULE) continue;
      n++;
      const nd = g.nodes[g.nearest(x, 0, z)];
      if (los(x, 1.0, z, nd.x, 1.0, nd.z)) ok++;
    }
    expect(ok / n).toBeGreaterThanOrEqual(0.9);
  });
  it('jalur bot: ≥ 3 lane berbobot, rute = node yang ada, ada path antar node berurutan, berakhir di sisi lawan', () => {
    expect(SY_LANES.length).toBeGreaterThanOrEqual(3);
    expect(new Set(SY_LANES.map(l => l.id)).size).toBe(SY_LANES.length);
    expect(SY_LANES.reduce((s, l) => s + l.weight, 0)).toBeCloseTo(1, 6);
    const path: number[] = [];
    for (const l of SY_LANES) {
      expect(l.weight).toBeGreaterThan(0);
      const seen = new Set<string>();
      for (let k = 0; k < 40; k++) for (const own of ['S', 'N'] as const) {
        const r = l.route(own);
        seen.add(r.join(' '));
        expect(r.length).toBeGreaterThanOrEqual(6);
        for (const id of r) expect(g.byId.has(id), `${l.id}: ${id}`).toBe(true);
        for (let i = 0; i + 1 < r.length; i++) expect(g.findPath(g.id(r[i]), g.id(r[i + 1]), false, path), `${l.id}: ${r[i]} → ${r[i + 1]}`).toBe(true);
        const first = g.nodes[g.id(r[0])], last = g.nodes[g.id(r[r.length - 1])];
        expect(first.side).toBe(own);
        expect(last.side).toBe(own === 'S' ? 'N' : 'S');
        expect(r.some(id => id.startsWith('C_'))).toBe(true);           // menyeberang garis tengah
      }
      expect(seen.size).toBe(4);                                          // sisi W/E acak × S/N
    }
  });
});

describe('Steel Yard — garis pandang (f)', () => {
  it('pasangan titik acak (seed tetap) yang saling terlihat berjarak > 60 u < 12%', () => {
    const rnd = rng(20261124), pts: [number, number][] = [];
    while (pts.length < 900) {
      const x = BX[0] + 0.8 + rnd() * (BX[1] - BX[0] - 1.6), z = BZ[0] + 0.8 + rnd() * (BZ[1] - BZ[0] - 1.6);
      if (clearance(x, z).m >= CAPSULE) pts.push([x, z]);
    }
    let vis = 0, far = 0;
    const N = 4000;
    for (let k = 0; k < N; k++) {
      const a = pts[Math.floor(rnd() * pts.length)], b = pts[Math.floor(rnd() * pts.length)];
      if (a === b) continue;
      if (!los(a[0], 4.4, a[1], b[0], 4.4, b[1])) continue;
      vis++;
      if (Math.hypot(a[0] - b[0], a[1] - b[1]) > 60) far++;
    }
    expect(vis / N).toBeGreaterThan(0.04);         // bukan labirin tertutup
    expect(far / vis).toBeLessThan(0.12);
  });
});

describe('Steel Yard — cermin (g)', () => {
  const dir = (r: number): [number, number] => [Math.cos(r), -Math.sin(r)];          // arah lokal +X (pintu / moncong)
  const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;
  type Obj = { id: string; x: number; z: number; rotY: number };
  const objs: Obj[] = [...SY.containers.map(k => ({ id: k.id, x: k.cx, z: k.cz, rotY: k.rotY })), ...SY.props];
  const byId = new Map(objs.map(o => [o.id, o]));
  it('mirrorPose: posisi & arah lokal +X tercermin untuk X, Z, XZ', () => {
    for (const r of [0, 0.3, -1.2, Math.PI / 2, 2.8]) for (const [mx, mz] of [[true, false], [false, true], [true, true]] as const) {
      const [x, z, r2_] = mirrorPose(3, -7, r, mx, mz), [dx, dz] = dir(r), [ex, ez] = dir(r2_);
      expect([x, z]).toEqual([mx ? -3 : 3, mz ? 7 : -7]);
      expect(near(ex, mx ? -dx : dx) && near(ez, mz ? -dz : dz), `r ${r} mx ${mx} mz ${mz}`).toBe(true);
    }
  });
  it('setiap objek kuadran/sumbu: salinan tercermin dengan arah benar (pintu kontainer, moncong mobil)', () => {
    const groups = new Map<string, Obj[]>();
    for (const o of objs) { const m = /^(.*)_(SW|SE|NW|NE|W|E|S|N)$/.exec(o.id); expect(m, o.id).toBeTruthy(); const k = m![1]; groups.set(k, [...(groups.get(k) ?? []), o]); }
    const check = (base: Obj, o: Obj, mx: boolean, mz: boolean) => {
      expect(near(o.x, mx ? -base.x : base.x) && near(o.z, mz ? -base.z : base.z), `${o.id} posisi`).toBe(true);
      const [dx, dz] = dir(base.rotY), [ex, ez] = dir(o.rotY);
      expect(Math.abs(ex - (mx ? -dx : dx)) < 1e-9 && Math.abs(ez - (mz ? -dz : dz)) < 1e-9, `${o.id} arah`).toBe(true);
    };
    for (const [k, list] of groups) {
      const get = (s: string) => byId.get(`${k}_${s}`)!;
      if (list.length === 4) { const sw = get('SW'); check(sw, get('SE'), true, false); check(sw, get('NW'), false, true); check(sw, get('NE'), true, true); }
      else if (byId.has(`${k}_W`)) { expect(near(get('W').z, 0)).toBe(true); check(get('W'), get('E'), true, false); }
      else { expect(near(get('S').x, 0)).toBe(true); check(get('S'), get('N'), false, true); }
    }
  });
  it('contoh arah: Pos Jaga terbuka ke tengah map, sedan Biru bermoncong ke Selatan & Merah ke Utara', () => {
    const k = (id: string) => SY.containers.find(c => c.id === id)!, p = (id: string) => SY.props.find(c => c.id === id)!;
    expect(dir(k('POS_W').rotY)[0]).toBeCloseTo(1, 9); expect(dir(k('POS_E').rotY)[0]).toBeCloseTo(-1, 9);
    expect(dir(p('MOBIL_SW').rotY)[1]).toBeLessThan(-0.9); expect(dir(p('MOBIL_NE').rotY)[1]).toBeGreaterThan(0.9);
    expect(dir(p('MOBIL_SE').rotY)[0]).toBeCloseTo(-dir(p('MOBIL_SW').rotY)[0], 9);
  });
  it('himpunan collider simetris terhadap cermin X dan Z (sudut tapak OBB, termasuk balok miring)', () => {
    const keys = new Set(SY_BOXES.map(b => geoKey(b)));
    for (const [mx, mz] of [[true, false], [false, true]] as const) {
      const miss = SY_BOXES.filter(b => !keys.has(geoKey(b, mx, mz))).map(b => b.id);
      expect(miss, `cermin ${mx ? 'X' : 'Z'}`).toEqual([]);
    }
  });
  it('collider tiap salinan objek = bayangan cermin collider salinan SW / W / S-nya (kiri ↔ kanan boleh bertukar)', () => {
    const parts = new Map<string, Box[]>();
    for (const b of [...SY.containers.flatMap(containerBoxes), ...SY.props.flatMap(propBoxes)]) {
      const o = b.id.split(':')[0];
      parts.set(o, [...(parts.get(o) ?? []), b]);
    }
    const keys = (id: string, mx = false, mz = false) => parts.get(id)!.map(b => geoKey(b, mx, mz)).sort();
    let n = 0;
    for (const id of parts.keys()) {
      const q = /^(.*)_SW$/.exec(id), w = /^(.*)_W$/.exec(id), s = /^(.*)_S$/.exec(id);
      if (q) for (const [suf, mx, mz] of [['SE', true, false], ['NW', false, true], ['NE', true, true]] as const) { expect(keys(`${q[1]}_${suf}`), `${q[1]}_${suf}`).toEqual(keys(id, mx, mz)); n++; }
      if (w) { expect(keys(`${w[1]}_E`)).toEqual(keys(id, true, false)); n++; }
      if (s) { expect(keys(`${s[1]}_N`)).toEqual(keys(id, false, true)); n++; }
    }
    expect(n).toBeGreaterThan(45);   // 54 salinan diperiksa setelah revisi "terlalu rapat" (dulu 60+)
  });
});

describe('Steel Yard — permukaan, nama area, latihan, kamera', () => {
  const k = (id: string) => SY.containers.find(c => c.id === id)!;
  it('permukaan: tanah sand, dalam/atas kontainer metal, palet/peti wood, mobil metal, terpal carpet', () => {
    expect(sySurfaceAt(-28, 0, -50)).toBe('sand');
    expect(sySurfaceAt(k('LORONG_SW').cx, 0, k('LORONG_SW').cz)).toBe('metal');
    expect(sySurfaceAt(0, 0, -28)).toBe('metal');                               // Lorong Tengah
    expect(sySurfaceAt(0, 14.4, -3.45)).toBe('metal');                          // atap Menara
    const p = (id: string) => SY.props.find(c => c.id === id)!;
    expect(sySurfaceAt(p('PALET_HM_SW').x, 0.4, p('PALET_HM_SW').z)).toBe('wood');
    expect(sySurfaceAt(p('PETI_BL_SW').x, 5.6, p('PETI_BL_SW').z)).toBe('wood');
    expect(sySurfaceAt(p('MOBIL_SW').x, 4.2, p('MOBIL_SW').z)).toBe('metal');
    expect(sySurfaceAt(p('TERPAL_S').x, 2.6, p('TERPAL_S').z)).toBe('carpet');
    expect(sySurfaceAt(42.1, 3, 10)).toBe('carpet');                            // terpal pagar
    expect(sySurfaceAt(-42.1, 3, -40)).toBe('metal');                           // panel seng (PAGAR_W1)
    expect(sySurfaceAt(42.1, 3, 40)).toBe('metal');                             // panel seng (PAGAR_E4, simetris titik)
    expect(SY.fences.filter(f => !f.tarp).map(f => f.id).sort()).toEqual(['PAGAR_E4', 'PAGAR_W1']);
    expect(sySurfaceAt(p('PALET_HM_SW').x, 0, p('PALET_HM_SW').z + 3)).toBe('sand');
    // langkah di dalam pintu terbuka Lorong Tengah (corong) = logam
    expect(sySurfaceAt(3.35, 0, -38)).toBe('metal');
    // di luar pagar: benda latar padat (tumpukan kontainer / gudang, collider dari visual/backdrop) = logam, tanah = sand
    expect(sySurfaceAt(-61, 6, 0)).toBe('metal');
    expect(sySurfaceAt(10, 3, 66)).toBe('metal');
    expect(sySurfaceAt(-61, 0, 0)).toBe('sand');
  });
  it('nama area (Indonesia, simetris Biru↔Merah & Barat↔Timur) untuk contoh landmark & semua node nav', () => {
    expect(syZoneName(0, 0, -13)).toBe('Gudang Spool Biru');
    expect(syZoneName(0, 0, 13)).toBe('Gudang Spool Merah');
    expect(syZoneName(-38.4, 0, -21)).toBe('Lorong Kontainer Barat · Biru');
    expect(syZoneName(38.4, 0, 21)).toBe('Lorong Kontainer Timur · Merah');
    expect(syZoneName(0, 0, -28)).toBe('Lorong Tengah Biru');
    expect(syZoneName(-36.4, 0, 0)).toBe('Pos Jaga Barat');
    expect(syZoneName(-28, 0, -50)).toBe('Gerbang Biru · Barat');
    expect(syZoneName(28, 0, 50)).toBe('Gerbang Merah · Timur');
    expect(syZoneName(0, 0, -42)).toBe('Halaman Belakang Biru');
    expect(syZoneName(-25.6, 0, -25)).toBe('Bangkai Mobil Barat · Biru');
    expect(syZoneName(-31, 0, -8.4)).toBe('Tumpukan Palet Barat · Biru');
    expect(syZoneName(-38.4, 0, -33)).toBe('Sayap Barat · Biru');
    expect(syZoneName(-21.6, 0, -6.4)).toBe('Tengah Barat');
    expect(syZoneName(12.6, 0, 0)).toBe('Tengah Timur');
    expect(syZoneName(0, 0, 0)).toBe('Menara Kontainer');
    const swap = (s: string) => s.replace(/Biru|Merah/g, m => (m === 'Biru' ? 'Merah' : 'Biru')).replace(/Barat|Timur/g, m => (m === 'Barat' ? 'Timur' : 'Barat'));
    const g = new NavGraph(SY_NAV);
    for (const n of g.nodes) {
      const a = syZoneName(n.x, 0, n.z);
      expect(a.length, n.id).toBeGreaterThan(3);
      if (n.z !== 0 && n.x !== 0) expect(syZoneName(-n.x, 0, -n.z), n.id).toBe(swap(a));
    }
  });
  it('12 dummy latihan di titik bebas, 10–70 u dari slot Biru terdekat; target bergerak bebas ±5 u', () => {
    expect(SY_PRACTICE.length).toBe(12);
    const movers = SY_PRACTICE.filter(p => p[3]);
    expect(movers.length).toBe(2);
    for (const [x, y, z, moving] of SY_PRACTICE) {
      expect(y).toBe(0);
      expect(clearance(x, z).m, `${x},${z}`).toBeGreaterThanOrEqual(1.0);
      const d = Math.min(...BLUE.map(([bx, , bz]) => Math.hypot(bx - x, bz - z)));
      expect(d, `${x},${z}`).toBeGreaterThanOrEqual(10); expect(d, `${x},${z}`).toBeLessThanOrEqual(70);
      if (moving) for (let dx = -5; dx <= 5; dx += 0.25) expect(clearance(x + dx, z).m, `mover ${x + dx},${z}`).toBeGreaterThanOrEqual(CAPSULE);
    }
  });
  it('kamera menu di atas semua balok; probe pantulan di udara terbuka', () => {
    const top = Math.max(...SY_BOXES.map(b => b.max[1]));
    expect(SY_MENU_CAM.y).toBeGreaterThan(top + 4);
    expect(Math.abs(SY_MENU_CAM.look[0])).toBeLessThan(BX[1]); expect(Math.abs(SY_MENU_CAM.look[2])).toBeLessThan(BZ[1]);
    const [x, y, z] = SY_ENV_PROBE;
    const inside = SY_BOXES.filter(b => b.style !== 'hidden' && y >= b.min[1] && y <= b.max[1] && distToBoxXZ(b, x, z) === 0);
    expect(inside.map(b => b.id)).toEqual([]);
    expect(y).toBeGreaterThan(SY_DIMS.container.h);
  });
});

describe('Steel Yard — latar padat di luar pagar (collider build.ts)', () => {
  const feet = emitBackdrop(new Geo(), SY.bounds, BACKDROP_SEED).filter(f => f.col);
  it('tumpukan kontainer & gudang ber-collider, seluruhnya di luar pagar (tidak menghalangi area main)', () => {
    expect(feet.length).toBeGreaterThanOrEqual(10);
    expect(feet.some(f => f.hx === 13 && f.hz === 26)).toBe(true);                       // gudang seng Timur
    const ox = BX[1] + SY_DIMS.fenceThick, oz = BZ[1] + SY_DIMS.fenceThick;             // muka luar pagar
    for (const f of feet) {
      const q = Math.abs(Math.sin(f.rot)) > 0.5, hx = q ? f.hz : f.hx, hz = q ? f.hx : f.hz;   // rot 0 / π/2 saja
      expect(Math.abs(Math.sin(2 * f.rot))).toBeLessThan(1e-9);
      const overlapX = f.cx - hx < ox && f.cx + hx > -ox, overlapZ = f.cz - hz < oz && f.cz + hz > -oz;
      expect(overlapX && overlapZ, `${f.cx},${f.cz}`).toBe(false);
      expect(f.h).toBeGreaterThanOrEqual(SY_DIMS.container.h);
      expect(sySurfaceAt(f.cx, f.h / 2, f.cz)).toBe('metal');
    }
  });
});

describe('Steel Yard — collider mengikuti visual (tanpa dinding tak terlihat)', () => {
  const D = SY_DIMS.container;
  const own = (id: string) => SY_BOXES.filter(b => b.id.startsWith(id + ':'));
  /** Dunia → lokal objek (pusat cx, cz; rotY konvensi layout). */
  const toLocal = (cx: number, cz: number, rot: number, x: number, z: number): [number, number] => {
    const c = Math.cos(rot), s = Math.sin(rot), dx = x - cx, dz = z - cz;
    return [dx * c - dz * s, dx * s + dz * c];
  };
  /** Rentang lokal (x, z) tapak balok b di bingkai objek. */
  const span = (p: { x: number; z: number; rotY: number }, b: Box) => {
    const L = boxCorners(b).map(([x, z]) => toLocal(p.x, p.z, p.rotY, x, z));
    return { x0: Math.min(...L.map(q => q[0])), x1: Math.max(...L.map(q => q[0])), z0: Math.min(...L.map(q => q[1])), z1: Math.max(...L.map(q => q[1])) };
  };
  it('kontainer terbuka: 4 tiang sudut (penampang post, setinggi kontainer); daun pintu = setengah lebar − tiang (= daun visual)', () => {
    for (const k of SY.containers.filter(c => c.open !== 'none')) {
      const posts = own(k.id).filter(b => /:post/.test(b.id)), doors = own(k.id).filter(b => /:door/.test(b.id));
      expect(posts.length, k.id).toBe(4);
      for (const b of posts) {
        expect(b.max[0] - b.min[0]).toBeCloseTo(D.post, 6); expect(b.max[2] - b.min[2]).toBeCloseTo(D.post, 6);
        expect(b.min[1]).toBe(0); expect(b.max[1]).toBe(D.h);
      }
      expect(doors.length, k.id).toBe(k.doorsOpen ? (k.open === 'ends' ? 4 : 2) : 0);
      for (const b of doors) expect(Math.max(b.max[0] - b.min[0], b.max[2] - b.min[2])).toBeCloseTo(D.w / 2 - D.post, 6);
    }
  });
  it('mobil: kabin 3 tingkat mengikuti kaca depan/belakang & sisi miring (galat ≤ 0.36 u — tingkat tengah 2.9–3.8 tak bisa dipecah: pita §4.4; dulu 1.26 u di depan kaca)', () => {
    const C = SY_DIMS.carCabin, f = (y: number) => Math.min(1, Math.max(0, (y - C.y0) / (C.y1 - C.y0)));
    const lerp = (a: number[], y: number) => a[0] + (a[1] - a[0]) * f(y);
    for (const p of SY.props.filter(q => q.kind === 'car')) {
      const cab = own(p.id).filter(b => /:cabin/.test(b.id));
      expect(cab.length, p.id).toBe(3);
      for (const b of cab) {
        const s = span(p, b);
        for (const y of [Math.max(b.min[1], C.y0), Math.min(b.max[1], C.y1)]) {
          expect(Math.abs(s.x1 - lerp(C.front, y)), `${b.id} depan @${y}`).toBeLessThanOrEqual(0.36);
          expect(Math.abs(s.x0 - lerp(C.rear, y)), `${b.id} belakang @${y}`).toBeLessThanOrEqual(0.36);
          expect(Math.abs(s.z1 - lerp(C.side, y)), `${b.id} sisi @${y}`).toBeLessThanOrEqual(0.36);
          expect(Math.abs(s.z0 + lerp(C.side, y)), `${b.id} sisi @${y}`).toBeLessThanOrEqual(0.36);
        }
      }
      expect(Math.max(...own(p.id).map(b => b.max[1]))).toBe(SY_DIMS.prop.car[2]);
    }
  });
  it('barrier Jersey: setengah lebar collider di tiap ketinggian = profil ± 0.2 u (dulu ±0.8 penuh setinggi 2.2)', () => {
    const J = SY_DIMS.jersey;
    const prof = (y: number) => {
      for (let i = 0; i + 1 < J.length; i++) if (y <= J[i + 1][1]) return J[i][0] + (J[i + 1][0] - J[i][0]) * (y - J[i][1]) / (J[i + 1][1] - J[i][1]);
      return J[J.length - 1][0];
    };
    for (const p of SY.props.filter(q => q.kind === 'barrier')) for (const y of [0.05, 0.3, 0.6, 0.79, 0.81, 1.2, 1.8, 2.15]) {
      const half = Math.max(...own(p.id).filter(b => b.min[1] <= y && b.max[1] > y).map(b => { const s = span(p, b); return Math.max(-s.z0, s.z1); }));
      expect(Math.abs(half - prof(y)), `${p.id} @${y}`).toBeLessThanOrEqual(0.2);
    }
  });
  it('spool: collider (bintang 8) tidak melewati piringan, padat sampai ≥ 1.29 u dari poros (lilitan kabel) ke segala arah', () => {
    for (const p of SY.props.filter(q => q.kind === 'spool')) {
      const R = SY_DIMS.prop.spool[0] / 2 * (p.s ?? 1);
      for (const b of own(p.id)) for (const [x, z] of boxCorners(b)) expect(Math.hypot(x - p.x, z - p.z)).toBeLessThanOrEqual(R + 1e-6);
      for (let i = 0; i < 32; i++) {
        const a = (i / 32) * 2 * Math.PI, d = 2.2;
        const hit = physics.raycast({ x: p.x + Math.cos(a) * d, y: 1.3, z: p.z + Math.sin(a) * d }, { x: -Math.cos(a), y: 0, z: -Math.sin(a) }, d);
        expect(hit, `${p.id} arah ${i}`).toBeGreaterThan(0);
        expect(d - hit, `${p.id} arah ${i}`).toBeGreaterThanOrEqual(1.29);
      }
    }
  });
  it('tumpukan terpal: kain mengisi tapak collider (≥ 2.2 u sampai 0.3 u dari tepi), siluet Biru = cermin persis Merah', () => {
    const [L, Wd, H] = SY_DIMS.prop.tarpPile;
    const verts = (id: string) => {
      const p = SY.props.find(q => q.id === id)!, geo = new Geo();
      emitProp(geo, p);
      const a = geo.geometry('tarp')!.getAttribute('position'), out: [number, number, number][] = [];
      for (let i = 0; i < a.count; i++) out.push([a.getX(i) - p.x, a.getY(i), a.getZ(i) - p.z]);
      return out;
    };
    const S = verts('TERPAL_S'), N = verts('TERPAL_N');
    for (let x = -L / 2 + 0.3; x <= L / 2 - 0.3 + 1e-9; x += 0.4) for (let z = -Wd / 2 + 0.3; z <= Wd / 2 - 0.3 + 1e-9; z += 0.4) {
      const top = Math.max(...S.filter(([vx, , vz]) => Math.hypot(vx - x, vz - z) < 0.4).map(v => v[1]));
      expect(top, `${x.toFixed(1)},${z.toFixed(1)}`).toBeGreaterThanOrEqual(2.2);
    }
    for (const [x, y, z] of S) {
      expect(y).toBeLessThanOrEqual(H + 0.05);                                // tidak menjulang di atas collider
      if (y > 1.6) { expect(Math.abs(x)).toBeLessThanOrEqual(L / 2 + 0.12); expect(Math.abs(z)).toBeLessThanOrEqual(Wd / 2 + 0.12); }
    }
    const key = (v: [number, number, number][]) => v.map(([x, y, z]) => `${x.toFixed(3)},${y.toFixed(3)},${(z + 0).toFixed(3)}`).sort();
    expect(key(N)).toEqual(key(S.map(([x, y, z]) => [x, y, -z] as [number, number, number])));
  });
});

describe('Steel Yard — jalur bot dari sudut spawn sendiri', () => {
  const g = new NavGraph(SY_NAV), path: number[] = [];
  const len = (a: number, b: number) => {
    expect(g.findPath(a, b, false, path)).toBe(true);
    let s = 0;
    for (let i = 0; i + 1 < path.length; i++) s += Math.hypot(g.nodes[path[i + 1]].x - g.nodes[path[i]].x, g.nodes[path[i + 1]].z - g.nodes[path[i]].z);
    return s;
  };
  it('rute dimulai di sisi W/E bot (≤ 45 u dari slot mana pun; dulu sisi diundi → ±83 u lewat halaman sendiri)', () => {
    for (const [team, list] of [['S', BLUE], ['N', RED]] as const) for (const [x, , z] of list) for (const l of SY_LANES) {
      const r = l.route(team, x);
      expect(new Set(r.filter(id => /_[WE]$/.test(id)).map(id => id.slice(-1))), `${l.id} ${x}`).toEqual(new Set([x < 0 ? 'W' : 'E']));
      expect(len(g.nearest(x, 0, z), g.id(r[0])), `${team} ${x},${z} ${l.id}`).toBeLessThanOrEqual(45);
    }
  });
  it('penyeberangan garis tengah tersebar: Pos Jaga (C_WING) & samping Menara (C_TOWER) ±50% bobot', () => {
    const w = (node: string) => SY_LANES.filter(l => l.route('S', -1).includes(`${node}_W`)).reduce((a, l) => a + l.weight, 0);
    expect(w('C_WING')).toBeCloseTo(0.55, 6);
    expect(w('C_TOWER')).toBeCloseTo(0.45, 6);
  });
});

describe('Steel Yard — pantulan granat: material di titik kontak (GrenadeK400.bounceMaterial)', () => {
  const GR = CFG.grenade, dt = CFG.world.fixedStep;
  /** Bola granat (CCD, sama dengan GrenadeK400.throw) dari p dengan kecepatan v → pantulan pertama (aturan deteksi game). */
  const firstBounce = (p: [number, number, number], v: [number, number, number], map: MapDef = MAPS.steelyard) => {
    const w = physics.world;
    const body = w.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(p[0], p[1], p[2]).setLinvel(v[0], v[1], v[2])
      .setCcdEnabled(true).setLinearDamping(GR.linDamp).setAngularDamping(GR.angDamp));
    w.createCollider(RAPIER.ColliderDesc.ball(GR.radius).setRestitution(GR.restitution).setFriction(GR.friction)
      .setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Max).setFrictionCombineRule(RAPIER.CoefficientCombineRule.Max)
      .setDensity(GR.density).setCollisionGroups(GROUPS.GRENADE), body);
    const prev = { x: v[0], y: v[1], z: v[2] };
    try {
      for (let i = 0; i < 180; i++) {
        w.step();
        const lv = body.linvel(), t = body.translation(), ps = Math.hypot(prev.x, prev.y, prev.z), vs = Math.hypot(lv.x, lv.y, lv.z);
        if (ps > XCFG.grenadeThrow.bounceMinSpeed && vs > 0.05 && (prev.x * lv.x + prev.y * lv.y + prev.z * lv.z) / (ps * vs) < XCFG.grenadeThrow.bounceDot)
          return { contact: bounceMaterial(map, t, prev, lv, dt), center: map.surfaceAt(t.x, t.y, t.z), t: { x: t.x, y: t.y, z: t.z } };
        prev.x = lv.x; prev.y = lv.y; prev.z = lv.z;
      }
      return null;
    } finally { w.removeRigidBody(body); }
  };
  it('dinding samping kontainer → metal (pusat granat masih "sand"); sisi mobil → metal', () => {
    const wall = firstBounce([-21, 3, -9], [0, 1.5, 12])!;                    // muka Selatan TENGAH_W (z −3.4)
    expect(wall.t.z).toBeLessThan(-3.4);
    expect(wall.contact).toBe('metal');
    expect(wall.center).toBe('sand');                                         // perilaku lama (bug): material di pusat
    const car = firstBounce([-25, 1.5, -26], [12, 1, 0])!;                    // sisi Barat MOBIL_SW
    expect(car.contact).toBe('metal');
  });
  it('tanah lapang → sand; lantai dalam Lorong Kontainer & atap kontainer → metal', () => {
    expect(firstBounce([-31, 2, -8.4], [0, -8, 0])!.contact).toBe('sand');
    expect(firstBounce([-38.6, 3, -21], [0.5, -8, 0])!.contact).toBe('metal');
    expect(firstBounce([-21, 9.5, 0], [0, -6, 0])!.contact).toBe('metal');
  });
  it('map tanpa contactSurface (Brick Hall): material tetap dicari di pusat granat (perilaku lama, identik)', () => {
    const calls: number[][] = [];
    const bh: MapDef = { ...MAPS.brickhall, surfaceAt: (x, y, z) => { calls.push([x, y, z]); return 'tile'; } };
    expect(MAPS.brickhall.contactSurface).toBeUndefined();
    const r = firstBounce([-21, 3, -9], [0, 1.5, 12], bh)!;
    expect(r.contact).toBe('tile');
    expect(calls[0]).toEqual([r.t.x, r.t.y, r.t.z]);
  });
});

describe('Steel Yard — ganti map: collider dilepas tuntas', () => {
  it('collider denah + latar (syColliders) → removeColliders → jumlah collider kembali ke awal (aman diulang)', () => {
    const w = physics.world, before = w.colliders.len();
    const feet = emitBackdrop(new Geo(), SY.bounds, BACKDROP_SEED);
    const cols = syColliders(SY_BOXES, feet);
    expect(cols.length).toBe(SY_BOXES.length + feet.filter(f => f.col).length);
    expect(w.colliders.len()).toBe(before + cols.length);
    removeColliders(cols);
    expect(cols.length).toBe(0);
    expect(w.colliders.len()).toBe(before);
    removeColliders(cols);
    expect(w.colliders.len()).toBe(before);
    w.step();
  });
});
