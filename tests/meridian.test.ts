// tests/meridian.test.ts — denah, tangga, nav & garis pandang Meridian Vault (bank 2 tingkat, asimetris diagonal, map Bomb Mission).
// Collider = MV_BOXES + ramp convexHull persis seperti di game (meridianColliders → Rapier); garis pandang & edge memakai raycast Rapier.
import { beforeAll, describe, expect, it } from 'vitest';
import { physics } from '../src/physics/Physics';
import { NavGraph } from '../src/world/NavGraph';
import { distToBoxXZ, stairFrame, stairHeightAt, type Box } from '../src/world/MapData';
import {
  MV_BOUNDS, MV_BOXES, MV_ENV_PROBE, MV_MENU_CAM, MV_PRACTICE, MV_PROP_ITEMS, MV_SITES, MV_SPAWNS, MV_STAIRS, mvSurfaceAt, mvZoneName,
} from '../src/world/maps/meridian/layout';
import { MV_LANES, MV_NAV } from '../src/world/maps/meridian/nav';
import { meridianColliders } from '../src/world/maps/meridian/colliders';
import { removeColliders } from '../src/world/maps/shared';
import { PROP_SIZE } from '../src/world/propKinds';

const LEVELS = [0, 1.5, 3, 6.5];
/** Penghalang badan karakter di lantai `lvl` (pita 0.6–4.9 di atas lantai), tanpa lantai/pelat di bawahnya. */
const bodyAt = (lvl: number) => MV_BOXES.filter(b => b.min[1] < lvl + 4.9 && b.max[1] > lvl + 0.6 && !(b.max[1] <= lvl + 0.05));
const BODY: Record<number, Box[]> = Object.fromEntries(LEVELS.map(l => [l, bodyAt(l)]));
const clearance = (x: number, z: number, lvl: number) => {
  let m = Infinity, who = '';
  for (const b of BODY[lvl]) { const d = distToBoxXZ(b, x, z); if (d < m) { m = d; who = b.id; } }
  return { m, who };
};
function segBoxDist(ax: number, az: number, bx: number, bz: number, b: Box): number {
  let best = Infinity;
  for (let i = 0; i <= 64; i++) { const t = i / 64; best = Math.min(best, distToBoxXZ(b, ax + (bx - ax) * t, az + (bz - az) * t)); }
  return best;
}
const r2 = (v: number) => Math.round(v * 100) / 100;
/** Jarak raycast tegak ke bawah dari (x, y, z) (null bila tidak kena dalam `max`). */
const down = (x: number, y: number, z: number, max: number): number | null => {
  const d = physics.raycast({ x, y, z }, { x: 0, y: -1, z: 0 }, max);
  return d < 0 ? null : d;
};
const BLUE = MV_SPAWNS.blue.ground, RED = MV_SPAWNS.red.ground;

let cols: ReturnType<typeof meridianColliders>;
beforeAll(async () => {
  await physics.init();
  cols = meridianColliders();
  physics.world.step();
});

describe('Meridian Vault — balok & tinggi cover', () => {
  it('balok valid: min < max, id unik, di dalam bangunan', () => {
    const ids = new Set<string>();
    for (const b of MV_BOXES) {
      for (let i = 0; i < 3; i++) expect(b.min[i], b.id).toBeLessThan(b.max[i]);
      expect(ids.has(b.id), b.id).toBe(false); ids.add(b.id);
      expect(b.min[0]).toBeGreaterThanOrEqual(-76); expect(b.max[0]).toBeLessThanOrEqual(76);
      expect(b.min[2]).toBeGreaterThanOrEqual(-68); expect(b.max[2]).toBeLessThanOrEqual(68);
    }
  });
  it('tidak ada dua balok yang tumpang-tindih (volume > 0.01 u³) — tidak ada z-fighting', () => {
    const bad: string[] = [];
    for (let i = 0; i < MV_BOXES.length; i++) for (let k = i + 1; k < MV_BOXES.length; k++) {
      const a = MV_BOXES[i], b = MV_BOXES[k];
      const o = [0, 1, 2].map(j => Math.min(a.max[j], b.max[j]) - Math.max(a.min[j], b.min[j]));
      if (o.every(v => v > 0.01)) bad.push(`${a.id} ∩ ${b.id}`);
    }
    expect(bad).toEqual([]);
  });
  it('tinggi pelindung relatif lantainya menghindari pita head-glitch GDD §4.4 (2.95–3.75 & 4.25–5.05)', () => {
    const bad: string[] = [];
    for (const b of MV_BOXES.filter(q => q.cat === 'cover' || q.cat === 'rail')) {
      const floor = LEVELS.filter(l => l <= b.min[1] + 1e-6).pop() ?? 0, h = b.max[1] - floor;
      if ((h > 2.95 && h < 3.75) || (h > 4.25 && h < 5.05)) bad.push(`${b.id} ${r2(h)}`);
    }
    expect(bad).toEqual([]);
  });
});

describe('Meridian Vault — tangga & pijakan', () => {
  it('8 ramp + 2 anak tangga panggung: denah x2 → kemiringan ≤ 18.1° (dokumen 20.6–33°, panjang ikut x2)', () => {
    const deg = (id: string) => {
      const f = stairFrame(MV_STAIRS.find(s => s.id === id)!);
      return Math.atan2(f.y1 - f.y0, Math.abs(f.top - f.foot)) * 180 / Math.PI;
    };
    expect(MV_STAIRS.length).toBe(10);
    for (const s of MV_STAIRS) expect(deg(s.id), s.id).toBeLessThanOrEqual(18.1);
    expect(deg('RAMP_RED_NORTH')).toBeCloseTo(18.0, 1);
    expect(deg('RAMP_BLUE_B_UP')).toBeCloseTo(15.2, 1);
    expect(deg('RAMP_MID_WEST')).toBeCloseTo(10.6, 1);
    expect(deg('RAMP_B_TWIN_W')).toBeCloseTo(17.4, 1);
  });
  it('raycast turun di tengah tiap tangga mengenai ramp setinggi permukaan', () => {
    for (const s of MV_STAIRS) {
      const f = stairFrame(s), x = (f.x[0] + f.x[1]) / 2, z = (f.z[0] + f.z[1]) / 2, want = stairHeightAt(f, x, z);
      const hit = down(x, want + 3, z, 6);
      expect(hit, s.id).not.toBeNull();
      expect(Math.abs(want + 3 - hit! - want), s.id).toBeLessThan(0.05);
    }
  });
  it('lubang dokumen tertutup: ambang pintu Mid → Balkon B, bordes Tangga Biru, ambang Mid-West, celah pintu brankas', () => {
    const top = (x: number, z: number, from: number) => { const d = down(x, from, z, 20); return d === null ? -99 : r2(from - d); };
    expect(top(18, 40, 12)).toBe(6.5);          // ambang pintu Mid ↔ Balkon B (dulu tanpa lantai)
    expect(top(60, -9, 12)).toBe(6.5);       // bordes puncak Tangga Biru (dulu celah 1 u)
    expect(top(-13, -2, 8)).toBe(3);         // ambang Mid-West (dulu parit 1 u sedalam 3 u)
    expect(physics.losBlocked(-54, 3, -51.6, -48, 3, -51.6)).toBe(true);   // celah 0.5 u di samping pintu brankas
  });
  it('balkon B 6.5: ruang di bawahnya 5.9 (> 5.0 berdiri); turun = 0 HP, lompat turun = 3 HP (aman 7.5, 8 HP/u)', () => {
    expect(MV_BOXES.find(b => b.id === 'B_BALC_N')!.min[1]).toBe(5.9);
    const fall = (h: number) => (h <= 7.5 ? 0 : Math.round((h - 7.5) * 8));
    expect(fall(6.5)).toBe(0);
    expect(fall(6.5 + 1.383)).toBe(3);
  });
});

describe('Meridian Vault — spawn & zona bom', () => {
  it('5 slot per kelompok: Merah di Barat Laut, Biru di Tenggara, ≥ 1.2 u dari penghalang, spasi ≥ 4', () => {
    for (const [slots, zone] of [[RED, 'Spawn Merah'], [BLUE, 'Spawn Biru']] as const) {
      expect(slots.length).toBe(5);
      for (const [x, y, z] of slots) {
        expect(mvZoneName(x, y, z)).toBe(zone);
        expect(clearance(x, z, 0).m, `${x},${z} ← ${clearance(x, z, 0).who}`).toBeGreaterThanOrEqual(1.2);
      }
      for (let i = 0; i < slots.length; i++) for (let k = i + 1; k < slots.length; k++)
        expect(Math.hypot(slots[i][0] - slots[k][0], slots[i][2] - slots[k][2])).toBeGreaterThanOrEqual(4);
    }
  });
  it('zona A & B di pijakan (titik tanam bot bebas penghalang, di atas lantainya), dikenali per AABB', () => {
    for (const s of MV_SITES) {
      const [x, y, z] = s.botPlant;
      expect(x).toBeGreaterThan(s.min[0]); expect(x).toBeLessThan(s.max[0]);
      expect(z).toBeGreaterThan(s.min[2]); expect(z).toBeLessThan(s.max[2]);
      expect(clearance(x, z, y).m, s.id).toBeGreaterThanOrEqual(1.2);
      const d = down(x, y + 3, z, 6);
      expect(r2(y + 3 - d!), s.id).toBe(y);
    }
  });
});

describe('Meridian Vault — navigasi', () => {
  const nav = new NavGraph(MV_NAV);
  it('semua node di ruang bebas (≥ 0.9 u dari penghalang lantainya) & di dalam batas; lantai node = pijakan sebenarnya', () => {
    const bad: string[] = [];
    for (const n of nav.nodes) {
      const c = clearance(n.x, n.z, n.level);
      if (c.m < 0.9) bad.push(`${n.id} ${r2(c.m)} ← ${c.who}`);
      const d = down(n.x, n.level + 3, n.z, 6);
      if (d === null || Math.abs(n.level + 3 - d - n.level) > 0.05) bad.push(`${n.id} pijakan ${d === null ? '—' : r2(n.level + 3 - d)}`);
      expect(n.x).toBeGreaterThan(MV_BOUNDS.x[0]); expect(n.x).toBeLessThan(MV_BOUNDS.x[1]);
      expect(n.z).toBeGreaterThan(MV_BOUNDS.z[0]); expect(n.z).toBeLessThan(MV_BOUNDS.z[1]);
    }
    expect(bad).toEqual([]);
  });
  it('edge datar bebas selebar kapsul (sapuan 2D ≥ 0.85 u, pintu ≥ 0.7) & raycast Rapier lutut/dada/kepala bebas', () => {
    const bad: string[] = [];
    for (const e of nav.edges) {
      const A = nav.nodes[e.a], B = nav.nodes[e.b];
      if (e.kind === 'stair') continue;            // ramp: dicek NavGraph.validate (dada 2.5) & uji jalur
      for (const b of BODY[A.level]) {
        const d = segBoxDist(A.x, A.z, B.x, B.z, b);
        if (d < (e.kind === 'door' ? 0.7 : 0.85)) bad.push(`${A.id}↔${B.id} ${r2(d)} ← ${b.id}`);
      }
      for (const h of [1.0, 2.5, 4.4]) if (physics.losBlocked(A.x, A.y + h, A.z, B.x, B.y + h, B.z)) bad.push(`${A.id}↔${B.id} ray ${h}`);
    }
    expect(bad).toEqual([]);
  });
  it('NavGraph.validate tanpa peringatan; graf terhubung dua arah', () => {
    expect(nav.validate((ax, ay, az, bx, by, bz) => physics.losBlocked(ax, ay, az, bx, by, bz))).toEqual([]);
    const path: number[] = [];
    for (let i = 0; i < nav.nodes.length; i++) {
      expect(nav.findPath(0, i, false, path), nav.nodes[i].id).toBe(true);
      expect(nav.findPath(i, 0, false, path), nav.nodes[i].id).toBe(true);
    }
  });
  it('nearest memilih node di lantai yang sama (balkon, panggung, platform, lantai dasar)', () => {
    expect(nav.nodes[nav.nearest(46, 6.5, 40)].level).toBe(6.5);   // balkon di atas lantai dasar
    expect(nav.nodes[nav.nearest(46, 1.5, 22)].level).toBe(1.5);
    expect(nav.nodes[nav.nearest(2, 3, 0)].level).toBe(3);
    expect(nav.nodes[nav.nearest(46, 0, 50)].level).toBe(0);       // di bawah balkon Utara
  });
  it('jalur bot: 4 lane berbobot, rute = node yang ada & tersambung, berakhir di setengah lawan', () => {
    expect(MV_LANES.map(l => l.id).sort()).toEqual(['b', 'mid', 'north', 'west']);
    expect(MV_LANES.reduce((s, l) => s + l.weight, 0)).toBeCloseTo(1, 6);
    const path: number[] = [];
    for (const l of MV_LANES) for (const own of ['S', 'N'] as const) for (let k = 0; k < 4; k++) {
      const r = l.route(own);
      for (let i = 1; i < r.length; i++) expect(nav.findPath(nav.id(r[i - 1]), nav.id(r[i]), false, path), `${l.id} ${r[i - 1]}→${r[i]}`).toBe(true);
      const last = nav.nodes[nav.id(r[r.length - 1])];
      expect(last.side, `${l.id} ${own}`).not.toBe(own);
    }
  });
});

describe('Meridian Vault — garis pandang', () => {
  const nav = new NavGraph(MV_NAV);
  it('TIDAK ADA node nav di luar ruang spawn yang melihat slot spawn (mata berdiri → dada & kepala)', () => {
    const bad: string[] = [];
    for (const [slots, zone] of [[BLUE, 'Spawn Biru'], [RED, 'Spawn Merah']] as const) {
      for (const [x, y, z] of slots) for (const n of nav.nodes) {
        if (mvZoneName(n.x, n.y, n.z) === zone) continue;
        for (const h of [2.5, 4.4]) if (!physics.losBlocked(n.x, n.y + 4.4, n.z, x, y + h, z)) { bad.push(`${zone} ${x},${z} ← ${n.id}`); break; }
      }
    }
    expect(bad).toEqual([]);
  });
  it('tidak ada garis lurus West Long → pintu brankas → Site A → pintu Timur (sekat deposit)', () => {
    for (const z1 of [-48.6, -46, -44, -42, -39.4]) for (const z2 of [-49.6, -46, -44, -42, -38.4])
      expect(physics.losBlocked(-60, 4.4, z1, -8, 4.4, z2), `${z1}→${z2}`).toBe(true);
  });
});

describe('Meridian Vault — area, permukaan, latihan, benda', () => {
  it('nama area & permukaan contoh', () => {
    expect(mvZoneName(-62, 0, 0)).toBe('West Long');
    expect(mvZoneName(-30, 0, -40)).toBe('Site A');
    expect(mvZoneName(46, 1.5, 20)).toBe('Site B');
    expect(mvZoneName(46, 6.5, 50)).toBe('Balkon B');
    expect(mvZoneName(2, 3, 0)).toBe('Mid');
    expect(mvZoneName(4, 0, -44)).toBe('South Connector');
    expect(mvSurfaceAt(-62, 0, 0)).toBe('tile');
    expect(mvSurfaceAt(46, 1.5, 20)).toBe('carpet');
    expect(mvSurfaceAt(-48.6, 3, -34)).toBe('metal');      // pintu brankas
  });
  it('12 dummy latihan di titik bebas (pijakan benar); kamera menu & probe di udara Atrium', () => {
    expect(MV_PRACTICE.length).toBe(12);
    for (const [x, y, z] of MV_PRACTICE) {
      expect(clearance(x, z, y).m, `${x},${y},${z}`).toBeGreaterThanOrEqual(0.9);
      const d = down(x, y + 3, z, 6);
      expect(r2(y + 3 - d!), `${x},${y},${z}`).toBe(y);
    }
    for (const p of [MV_ENV_PROBE, MV_MENU_CAM.look]) expect(physics.losBlocked(p[0], p[1], p[2], p[0] + 0.1, p[1] + 0.1, p[2] + 0.1)).toBe(false);
  });
  it('benda dinamis bertumpu di permukaan & di dalam batas', () => {
    expect(MV_PROP_ITEMS.length).toBeGreaterThanOrEqual(20);
    for (const it of MV_PROP_ITEMS) {
      const h = PROP_SIZE[it.kind][1] / 2, d = down(it.x, it.y, it.z, 4);
      expect(d, `${it.kind} ${it.x},${it.z}`).not.toBeNull();
      expect(Math.abs(d! - h), `${it.kind} ${r2(it.x)},${r2(it.z)}`).toBeLessThan(0.05);
    }
  });
  it('collider dilepas tuntas', () => {
    const n = physics.world.colliders.len();
    const extra = meridianColliders();
    expect(physics.world.colliders.len()).toBe(n + extra.length);
    removeColliders(extra);
    expect(physics.world.colliders.len()).toBe(n);
    expect(cols.length).toBe(MV_BOXES.length + MV_STAIRS.length);
  });
});
