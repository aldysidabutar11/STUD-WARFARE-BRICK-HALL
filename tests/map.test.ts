import { describe, expect, it } from 'vitest';
import { BOXES, SPAWN_SLOTS, STAIRS, obstaclesAtLevel } from '../src/world/MapData';
import { NavGraph } from '../src/world/NavGraph';
import { BRICKHALL_NAV } from '../src/world/maps/brickhall';

type R2 = { x: [number, number]; z: [number, number] };
const dist2 = (r: R2, x: number, z: number) =>
  Math.hypot(Math.max(r.x[0] - x, 0, x - r.x[1]), Math.max(r.z[0] - z, 0, z - r.z[1]));

const CAPSULE = 0.8;
const obst = { 0: obstaclesAtLevel(0), 10: obstaclesAtLevel(10) };
const clearance = (lvl: number, x: number, z: number) => {
  let m = Infinity, who = '';
  for (const o of obst[lvl as 0 | 10]) { const d = dist2(o, x, z); if (d < m) { m = d; who = `${o.x}/${o.z}`; } }
  return { m, who };
};
/** Titik di lantai 2 harus ditopang permukaan Y = 10 (bukan void). */
const supported = (x: number, z: number) => BOXES.some(b => Math.abs(b.max[1] - 10) < 0.01 && b.cat !== 'rail' && b.cat !== 'cover'
  && x >= b.min[0] - 0.01 && x <= b.max[0] + 0.01 && z >= b.min[2] - 0.01 && z <= b.max[2] + 0.01);

describe('MapData', () => {
  it('ids are unique', () => {
    const ids = new Set(BOXES.map(b => b.id));
    expect(ids.size).toBe(BOXES.length);
  });
  it('cover/props/pillars/shelves do not interpenetrate', () => {
    const solid = BOXES.filter(b => ['cover', 'prop', 'pillar', 'shelf'].includes(b.cat));
    const bad: string[] = [];
    for (let i = 0; i < solid.length; i++) for (let j = i + 1; j < solid.length; j++) {
      const a = solid[i], b = solid[j];
      const ov = [0, 1, 2].every(k => Math.min(a.max[k], b.max[k]) - Math.max(a.min[k], b.min[k]) > 1e-6);
      if (ov) bad.push(`${a.id} x ${b.id}`);
    }
    expect(bad).toEqual([]);
  });
  it('cover heights avoid the forbidden head-glitch bands (§4.4)', () => {
    const bad = BOXES.filter(b => ['cover', 'prop', 'shelf'].includes(b.cat)).filter(b => {
      const h = b.max[1] - b.min[1];
      return (h > 2.95 && h < 3.75) || (h > 4.25 && h < 5.05);
    }).map(b => b.id);
    expect(bad).toEqual([]);
  });
  it('spawn slots (lantai 1 & 2) have capsule clearance', () => {
    for (const team of ['blue', 'red'] as const) {
      for (const [x, , z] of SPAWN_SLOTS[team].upper) {
        expect(clearance(10, x, z).m).toBeGreaterThanOrEqual(CAPSULE);
        expect(supported(x, z)).toBe(true);
      }
      for (const [x, y, z] of SPAWN_SLOTS[team].ground) {
        expect(y).toBe(0);
        expect(clearance(0, x, z).m).toBeGreaterThanOrEqual(CAPSULE);
      }
    }
  });
  it('ruang spawn bawah & arsip beratap (pelat lantai 2 di atasnya)', () => {
    const roofed = (x: number, z: number) => BOXES.some(b => b.min[1] >= 9 && b.min[1] <= 9.5 && b.max[1] === 10
      && x >= b.min[0] && x <= b.max[0] && z >= b.min[2] && z <= b.max[2]);
    for (const [x, , z] of [...SPAWN_SLOTS.blue.ground, ...SPAWN_SLOTS.red.ground]) expect(roofed(x, z)).toBe(true);
    for (const z of [-30, -10, 0, 10, 30]) { expect(roofed(-26, z)).toBe(true); expect(roofed(26, z)).toBe(true); }
  });
  it('stairs are 35° ramps', () => {
    for (const s of STAIRS) expect(Math.atan2(10, Math.abs(s.zTop - s.zFoot)) * 180 / Math.PI).toBeCloseTo(34.96, 1);
  });
});

describe('NavGraph', () => {
  const g = new NavGraph(BRICKHALL_NAV);
  it('counts', () => {
    expect(g.nodes.length).toBe(192);   // v2: +ruang spawn bawah, lorong, arsip (126 − F_VOID + 68)
    expect(g.dropCount).toBe(8);
    expect(g.walkEdgeCount).toBeGreaterThan(230);
  });
  it('every node reachable from all four spawn rooms (without drops)', () => {
    const path: number[] = [];
    for (const s of ['S_SPAWN', 'N_SPAWN', 'S_GSPAWN', 'N_GSPAWN']) for (let i = 0; i < g.nodes.length; i++)
      expect(g.findPath(g.id(s), i, false, path), `${s} -> ${g.nodes[i].id}`).toBe(true);
  });
  it('node clearance >= capsule radius and level-10 nodes are supported', () => {
    const bad: string[] = [];
    for (const n of g.nodes) {
      const c = clearance(n.level, n.x, n.z);
      if (c.m < CAPSULE + 0.05) bad.push(`${n.id} ${c.m.toFixed(2)} ${c.who}`);
      if (n.level === 10 && !supported(n.x, n.z)) bad.push(`${n.id} unsupported`);
    }
    expect(bad).toEqual([]);
  });
  it('walk/door edges are collision-free (2D sweep, capsule radius)', () => {
    const bad: string[] = [];
    for (const e of g.edges) {
      if (e.kind === 'stair' || e.kind === 'drop') continue;
      const A = g.nodes[e.a], B = g.nodes[e.b];
      expect(A.level).toBe(B.level);
      const len = Math.hypot(B.x - A.x, B.z - A.z), steps = Math.max(2, Math.ceil(len / 0.2));
      let worst = Infinity;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps, x = A.x + (B.x - A.x) * t, z = A.z + (B.z - A.z) * t;
        worst = Math.min(worst, clearance(A.level, x, z).m);
        if (A.level === 10 && !supported(x, z)) { bad.push(`${A.id}-${B.id} over void at ${x.toFixed(1)},${z.toFixed(1)}`); break; }
      }
      if (worst < CAPSULE) bad.push(`${A.id}-${B.id} clearance ${worst.toFixed(2)}`);
    }
    expect(bad).toEqual([]);
  });
});
