// tests/arunika.test.ts — denah, tangga, nav & garis pandang Candi Arunika (kompleks candi luar ruang, map Bomb Mission ke-2).
// Collider = AR_BOXES + ramp convexHull + pembatas sungai persis seperti di game (arunikaColliders → Rapier); garis pandang & edge
// memakai raycast Rapier.
import { beforeAll, describe, expect, it } from 'vitest';
import { physics } from '../src/physics/Physics';
import { NavGraph } from '../src/world/NavGraph';
import { distToBoxXZ, stairFrame, stairHeightAt, type Box } from '../src/world/MapData';
import {
  AR_BARRIERS, AR_BOUNDS, AR_BOXES, AR_ENV_PROBE, AR_HULLS, AR_MENU_CAM, AR_PRACTICE, AR_SITES, AR_SPAWNS, AR_STAIRS, AR_WATER, arSurfaceAt,
  arZoneName,
} from '../src/world/maps/arunika/layout';
import { AR_LANES, AR_NAV } from '../src/world/maps/arunika/nav';
import { arunikaColliders } from '../src/world/maps/arunika/colliders';
import { removeColliders } from '../src/world/maps/shared';
import { XCFG } from '../src/config/extraConfig';

const LEVELS = [0, 1.5, 3];
/** Penghalang badan karakter di lantai `lvl` (pita 0.6–4.9 di atas lantai), tanpa lantai/pelat di bawahnya. */
const bodyAt = (lvl: number) => AR_BOXES.filter(b => b.min[1] < lvl + 4.9 && b.max[1] > lvl + 0.6 && !(b.max[1] <= lvl + 0.05));
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
const BLUE = AR_SPAWNS.blue.ground, RED = AR_SPAWNS.red.ground;
const SPAWN_ZONE = { blue: 'Wihara', red: 'Dermaga' } as const;

let cols: ReturnType<typeof arunikaColliders>;
beforeAll(async () => {
  await physics.init();
  cols = arunikaColliders();
  physics.world.step();
});

describe('Candi Arunika — balok & tinggi cover', () => {
  it('balok valid: min < max, id unik, di dalam batas tebing (±64 × ±84)', () => {
    const ids = new Set<string>();
    for (const b of AR_BOXES) {
      for (let i = 0; i < 3; i++) expect(b.min[i], b.id).toBeLessThan(b.max[i]);
      expect(ids.has(b.id), b.id).toBe(false); ids.add(b.id);
      expect(b.min[0]).toBeGreaterThanOrEqual(-64); expect(b.max[0]).toBeLessThanOrEqual(64);
      expect(b.min[2]).toBeGreaterThanOrEqual(-84); expect(b.max[2]).toBeLessThanOrEqual(84);
    }
  });
  it('tidak ada dua balok yang tumpang-tindih (volume > 0.01 u³) — tidak ada z-fighting', () => {
    const bad: string[] = [];
    for (let i = 0; i < AR_BOXES.length; i++) for (let k = i + 1; k < AR_BOXES.length; k++) {
      const a = AR_BOXES[i], b = AR_BOXES[k];
      const o = [0, 1, 2].map(j => Math.min(a.max[j], b.max[j]) - Math.max(a.min[j], b.min[j]));
      if (o.every(v => v > 0.01)) bad.push(`${a.id} ∩ ${b.id}`);
    }
    expect(bad).toEqual([]);
  });
  it('tinggi pelindung relatif lantainya menghindari pita head-glitch GDD §4.4 (2.95–3.75 & 4.25–5.05)', () => {
    const bad: string[] = [];
    for (const b of AR_BOXES.filter(q => q.cat === 'cover' || q.cat === 'rail')) {
      const floor = LEVELS.filter(l => l <= b.min[1] + 1e-6).pop() ?? 0, h = b.max[1] - floor;
      if ((h > 2.95 && h < 3.75) || (h > 4.25 && h < 5.05)) bad.push(`${b.id} ${r2(h)}`);
    }
    for (const hl of AR_HULLS.filter(q => q.cover)) {            // genta stupa kecil (hull) = pelindung juga
      let y0 = Infinity, y1 = -Infinity;
      for (let i = 1; i < hl.pts.length; i += 3) { y0 = Math.min(y0, hl.pts[i]); y1 = Math.max(y1, hl.pts[i]); }
      const floor = LEVELS.filter(l => l <= y0 - 0.9).pop() ?? 0, h = y1 - floor;
      if ((h > 2.95 && h < 3.75) || (h > 4.25 && h < 5.05)) bad.push(`${hl.id} ${r2(h)}`);
    }
    expect(bad).toEqual([]);
  });
  it('ukuran sekelas Meridian Vault x2: area main 120 × 160 u (±43 × 58 m)', () => {
    expect(AR_BOUNDS.x[1] - AR_BOUNDS.x[0]).toBe(120);
    expect(AR_BOUNDS.z[1] - AR_BOUNDS.z[0]).toBe(160);
  });
});

describe('Candi Arunika — tangga, kolam & pijakan', () => {
  it('7 ramp: teras A 3 → 20.6–23.2°, panggung pendopo B 1.5 → 20.6° (≤ batas daki KCC 45°)', () => {
    const deg = (id: string) => {
      const f = stairFrame(AR_STAIRS.find(s => s.id === id)!);
      return Math.atan2(f.y1 - f.y0, Math.abs(f.top - f.foot)) * 180 / Math.PI;
    };
    expect(AR_STAIRS.length).toBe(7);
    expect(deg('A_STAIR_N')).toBeCloseTo(20.6, 1);
    expect(deg('A_STAIR_E')).toBeCloseTo(23.2, 1);
    expect(deg('B_STEP_W')).toBeCloseTo(20.6, 1);
    for (const s of AR_STAIRS) expect(deg(s.id), s.id).toBeLessThanOrEqual(23.3);
  });
  it('raycast turun di tengah tiap tangga mengenai ramp setinggi permukaan', () => {
    for (const s of AR_STAIRS) {
      const f = stairFrame(s), x = (f.x[0] + f.x[1]) / 2, z = (f.z[0] + f.z[1]) / 2, want = stairHeightAt(f, x, z);
      const hit = down(x, want + 3, z, 6);
      expect(hit, s.id).not.toBeNull();
      expect(Math.abs(want + 3 - hit! - want), s.id).toBeLessThan(0.05);
    }
  });
  it('teras A setinggi 3 hanya didaki lewat tangga (tidak bisa dilompati: puncak lompat 1.383 + langkah 0.6 < 3)', () => {
    const top = (x: number, z: number, from = 10) => { const d = down(x, from, z, from + 2); return d === null ? -99 : r2(from - d); };
    expect(top(-42, -43.5 + 8)).toBe(3);        // teras di depan stupa induk
    expect(top(-36, -49)).toBe(3);
    expect(top(41, -44, 7.5)).toBe(1.5);        // panggung pendopo (di bawah atap)
    expect(top(-57, -40)).toBe(0);              // tanah di sisi Barat teras
    expect(top(-42, -43, 20)).toBe(15);         // yasti stupa induk
    expect(top(-42, -45.5, 20)).toBeGreaterThan(8.5);   // genta stupa (hull) menutupi lapik
    expect(top(44, -44, 20)).toBeGreaterThan(13);       // puncak atap joglo pendopo
  });
  it('bibir kolam ≤ 0.5 (dilangkahi KCC, langkah 0.6) dan air di dalam bibirnya → kolam bisa diseberangi', () => {
    for (const b of AR_BOXES.filter(q => q.style === 'a_pond')) expect(b.max[1], b.id).toBeLessThanOrEqual(0.5);
    for (const w of AR_WATER) {
      expect(w.y).toBeLessThan(0.45);
      const d = down((w.x[0] + w.x[1]) / 2, 3, (w.z[0] + w.z[1]) / 2, 6);
      expect(r2(3 - d!)).toBe(0);               // dasar kolam = tanah (air hanya visual + permukaan 'water')
    }
  });
  it('pembatas sungai: grup BARRIER (garis pandang & peluru tembus, karakter tertahan)', () => {
    expect(AR_BARRIERS.length).toBe(1);
    expect(physics.losBlocked(0, 4, 74, 0, 4, 90)).toBe(false);   // tembus ke sungai di atas tanggul
    expect(AR_BOXES.find(b => b.id === 'OUT_N_LOW')!.max[1]).toBe(1.2);
  });
});

describe('Candi Arunika — spawn & zona bom', () => {
  it('5 slot per kelompok: Merah di dermaga Utara, Biru di wihara Selatan, ≥ 1.2 u dari penghalang, spasi ≥ 4', () => {
    for (const [slots, zone] of [[RED, 'Dermaga'], [BLUE, 'Wihara']] as const) {
      expect(slots.length).toBe(5);
      for (const [x, y, z] of slots) {
        expect(arZoneName(x, y, z)).toBe(zone);
        expect(clearance(x, z, 0).m, `${x},${z} ← ${clearance(x, z, 0).who}`).toBeGreaterThanOrEqual(1.2);
      }
      for (let i = 0; i < slots.length; i++) for (let k = i + 1; k < slots.length; k++)
        expect(Math.hypot(slots[i][0] - slots[k][0], slots[i][2] - slots[k][2])).toBeGreaterThanOrEqual(4);
    }
  });
  it('zona A (teras stupa) & B (pendopo) di pijakan, titik tanam bot bebas penghalang & di dalam zona', () => {
    expect(AR_SITES.map(s => s.id)).toEqual(['A', 'B']);
    for (const s of AR_SITES) {
      const [x, y, z] = s.botPlant;
      expect(x).toBeGreaterThan(s.min[0]); expect(x).toBeLessThan(s.max[0]);
      expect(z).toBeGreaterThan(s.min[2]); expect(z).toBeLessThan(s.max[2]);
      expect(y).toBeGreaterThanOrEqual(s.min[1]);
      expect(clearance(x, z, y).m, s.id).toBeGreaterThanOrEqual(1.2);
      const d = down(x, y + 3, z, 6);
      expect(r2(y + 3 - d!), s.id).toBe(y);
    }
  });
  it('jarak tempuh: penyerang (Utara) jauh lebih lama ke zona daripada bertahan (Selatan) — sekelas Meridian Vault', () => {
    const nav = new NavGraph(AR_NAV), path: number[] = [];
    const len = (a: string, b: string) => {
      expect(nav.findPath(nav.id(a), nav.id(b), false, path)).toBe(true);
      let L = 0;
      for (let i = 1; i < path.length; i++) L += Math.hypot(nav.nodes[path[i]].x - nav.nodes[path[i - 1]].x, nav.nodes[path[i]].z - nav.nodes[path[i - 1]].z);
      return L;
    };
    const attA = len('RS_C', 'A_N_TOP'), attB = len('RS_C', 'B_P_N'), defA = len('BS_C', 'A_S_TOP'), defB = len('BS_C', 'B_P_S');
    for (const v of [attA, attB]) { expect(v).toBeGreaterThan(110); expect(v).toBeLessThan(185); }
    for (const v of [defA, defB]) { expect(v).toBeGreaterThan(30); expect(v).toBeLessThan(80); }
  });
});

describe('Candi Arunika — navigasi', () => {
  const nav = new NavGraph(AR_NAV);
  it('semua node di ruang bebas (≥ 0.9 u dari penghalang lantainya) & di dalam batas; lantai node = pijakan sebenarnya', () => {
    const bad: string[] = [];
    for (const n of nav.nodes) {
      const c = clearance(n.x, n.z, n.level);
      if (c.m < 0.9) bad.push(`${n.id} ${r2(c.m)} ← ${c.who}`);
      const d = down(n.x, n.level + 3, n.z, 6);
      if (d === null || Math.abs(n.level + 3 - d - n.level) > 0.05) bad.push(`${n.id} pijakan ${d === null ? '—' : r2(n.level + 3 - d)}`);
      expect(n.x).toBeGreaterThan(AR_BOUNDS.x[0]); expect(n.x).toBeLessThan(AR_BOUNDS.x[1]);
      expect(n.z).toBeGreaterThan(AR_BOUNDS.z[0]); expect(n.z).toBeLessThan(AR_BOUNDS.z[1]);
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
  it('nearest memilih node di lantai yang sama (teras 3, panggung 1.5, tanah di kaki teras/panggung)', () => {
    expect(nav.nodes[nav.nearest(-42, 3, -43)].level).toBe(3);
    expect(nav.nodes[nav.nearest(-31, 0, -43)].level).toBe(0);     // tanah di sisi Timur teras
    expect(nav.nodes[nav.nearest(44, 1.5, -42)].level).toBe(1.5);
    expect(nav.nodes[nav.nearest(44, 0, -55)].level).toBe(0);
  });
  it('jalur bot: 4 lane berbobot, rute = node yang ada & tersambung, berakhir di setengah lawan', () => {
    expect(AR_LANES.map(l => l.id).sort()).toEqual(['east', 'mid', 'short', 'west']);
    expect(AR_LANES.reduce((s, l) => s + l.weight, 0)).toBeCloseTo(1, 6);
    expect(Object.keys(XCFG.bots.lanesArunika).sort()).toEqual(['east', 'mid', 'short', 'west']);
    const path: number[] = [];
    for (const l of AR_LANES) for (const own of ['S', 'N'] as const) for (let k = 0; k < 6; k++) {
      const r = l.route(own);
      for (let i = 1; i < r.length; i++) expect(nav.findPath(nav.id(r[i - 1]), nav.id(r[i]), false, path), `${l.id} ${r[i - 1]}→${r[i]}`).toBe(true);
      const last = nav.nodes[nav.id(r[r.length - 1])];
      expect(last.side, `${l.id} ${own}`).not.toBe(own);
      expect(last.side, `${l.id} ${own}`).not.toBe('C');
    }
  });
});

describe('Candi Arunika — garis pandang', () => {
  const nav = new NavGraph(AR_NAV);
  it('TIDAK ADA node nav di luar ruang spawn yang melihat slot spawn (mata berdiri → dada & kepala)', () => {
    const bad: string[] = [];
    for (const [slots, zone] of [[BLUE, 'Wihara'], [RED, 'Dermaga']] as const) {
      for (const [x, y, z] of slots) for (const n of nav.nodes) {
        if (arZoneName(n.x, n.y, n.z) === zone) continue;
        for (const h of [2.5, 4.4]) if (!physics.losBlocked(n.x, n.y + 4.4, n.z, x, y + h, z)) { bad.push(`${zone} ${x},${z} ← ${n.id}`); break; }
      }
    }
    expect(bad).toEqual([]);
  });
  it('grid pijakan 2 u di luar ruang spawn (termasuk teras 3 & panggung 1.5) tidak melihat slot mana pun — aling-aling bekerja', () => {
    const bad: string[] = [];
    const floorAt = (x: number, z: number) => { const d = down(x, 20, z, 25); return d === null ? 0 : 20 - d; };
    for (let x = AR_BOUNDS.x[0] + 1; x < AR_BOUNDS.x[1]; x += 2) for (let z = AR_BOUNDS.z[0] + 1; z < AR_BOUNDS.z[1]; z += 2) {
      const y = floorAt(x, z);
      if (y > 3.05) continue;                                   // di atas atap/menara (tak terjangkau)
      if (clearance(x, z, LEVELS.reduce((p, l) => (Math.abs(l - y) < Math.abs(p - y) ? l : p), 0)).m < 0.8) continue;
      for (const [slots, team] of [[BLUE, 'blue'], [RED, 'red']] as const) {
        if (arZoneName(x, y, z) === SPAWN_ZONE[team]) continue;
        for (const [sx, sy, sz] of slots) for (const h of [2.5, 4.4])
          if (!physics.losBlocked(x, y + 4.4, z, sx, sy + h, sz)) bad.push(`${team} ${sx},${sz} ← ${x},${r2(y)},${z}`);
      }
    }
    expect(bad).toEqual([]);
  });
  it('Candi Induk memotong garis pandang tengah: gapura ↔ mulut Lorong Biksu terhalang', () => {
    for (const x of [-4, 0, 4]) expect(physics.losBlocked(x, 4.4, 24, x, 4.4, -22)).toBe(true);
  });
  it('beringin pasar memotong garis pandang gapura → tembok dermaga', () => {
    for (const x of [-2, 0, 2]) expect(physics.losBlocked(x, 4.4, 34, x, 4.4, 63)).toBe(true);
  });
});

describe('Candi Arunika — area, permukaan, latihan', () => {
  it('nama area & permukaan contoh', () => {
    expect(arZoneName(-48, 0, 30)).toBe('Jalan Beringin');
    expect(arZoneName(48, 0, 10)).toBe('Gua Air Terjun');
    expect(arZoneName(-42, 3, -43)).toBe('Teras Stupa (A)');
    expect(arZoneName(44, 1.5, -44)).toBe('Taman Air (B)');
    expect(arZoneName(0, 0, -42)).toBe('Balai Genta');
    expect(arZoneName(0, 0, -30)).toBe('Lorong Biksu');
    expect(arZoneName(0, 0, 50)).toBe('Pasar Desa');
    expect(arZoneName(0, 0, 0)).toBe('Pelataran');
    expect(arZoneName(-24, 0, -28)).toBe('A-Pendek');
    expect(arSurfaceAt(0, 0, 75)).toBe('wood');          // dek dermaga
    expect(arSurfaceAt(-48, 0, 30)).toBe('sand');        // jalan tanah hutan
    expect(arSurfaceAt(0, 0, 0)).toBe('tile');           // paving batu pelataran
    expect(arSurfaceAt(0, 0.1, 12)).toBe('water');       // kolam pantul (air dangkal)
    expect(arSurfaceAt(56, 0.1, 9)).toBe('water');       // kolam air terjun di gua
    expect(arSurfaceAt(44, 1.5, -44)).toBe('wood');      // lantai pendopo
    expect(arSurfaceAt(0, 3, -42)).toBe('metal');        // genta perunggu
  });
  it('12 dummy latihan di titik bebas (pijakan benar); kamera menu & probe di udara pelataran', () => {
    expect(AR_PRACTICE.length).toBe(12);
    for (const [x, y, z, moving] of AR_PRACTICE) {
      expect(clearance(x, z, y).m, `${x},${y},${z}`).toBeGreaterThanOrEqual(moving ? 0.9 + XCFG.practice.moverRange * 0 : 0.9);
      if (moving) for (const dx of [-XCFG.practice.moverRange, XCFG.practice.moverRange])
        expect(clearance(x + dx, z, y).m, `gerak ${x + dx},${z}`).toBeGreaterThanOrEqual(0.9);
      const d = down(x, y + 3, z, 6);
      expect(r2(y + 3 - d!), `${x},${y},${z}`).toBe(y);
    }
    for (const p of [AR_ENV_PROBE, AR_MENU_CAM.look]) expect(physics.losBlocked(p[0], p[1], p[2], p[0] + 0.1, p[1] + 0.1, p[2] + 0.1)).toBe(false);
  });
  it('collider dilepas tuntas', () => {
    const n = physics.world.colliders.len();
    const extra = arunikaColliders();
    expect(physics.world.colliders.len()).toBe(n + extra.length);
    removeColliders(extra);
    expect(physics.world.colliders.len()).toBe(n);
    expect(cols.length).toBe(AR_BOXES.length + AR_STAIRS.length + AR_HULLS.length + AR_BARRIERS.length);
  });
});
