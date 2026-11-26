// tests/boston.test.ts — denah, tangga, nav & garis pandang Boston (kantor 2 lantai, asimetris). Collider = BOS_BOXES + ramp tangga
// convexHull + pagar miring persis seperti di game (bostonColliders → Rapier); garis pandang & validasi edge memakai raycast Rapier.
import { beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { physics } from '../src/physics/Physics';
import { Breakables } from '../src/world/Breakables';
import { ctx } from '../src/game/ctx';
import { SAVE_V as SAVE_VERSION, parseSave } from '../src/net/Migration';
import { PROP_SIZE } from '../src/world/propKinds';
import { MAPS } from '../src/world/maps/registry';
import { NavGraph } from '../src/world/NavGraph';
import { distToBoxXZ, stairFrame, stairHeightAt, type Box } from '../src/world/MapData';
import {
  BOS_BARRIERS, BOS_BOUNDS, BOS_BOXES, BOS_ENV_PROBE, BOS_GLASS, BOS_MENU_CAM, BOS_PRACTICE, BOS_PROP_ITEMS, BOS_SPAWNS, BOS_STAIRS,
  bosSurfaceAt, bosZoneName, rot,
} from '../src/world/maps/boston/layout';
import { BOS_DROP_SPEC, BOS_LANES, BOS_NAV } from '../src/world/maps/boston/nav';
import { bostonColliders } from '../src/world/maps/boston/colliders';
import { removeColliders } from '../src/world/maps/shared';

const BLUE = BOS_SPAWNS.blue.upper, RED = BOS_SPAWNS.red.ground;
/** Penghalang badan karakter di lantai `lvl` (pita 0.6–4.9 di atas lantai). */
const bodyAt = (lvl: number) => BOS_BOXES.filter(b => b.style !== 'hidden' && b.min[1] < lvl + 4.9 && b.max[1] > lvl + 0.6
  && !(b.min[1] <= lvl - 0.3 && b.max[1] <= lvl + 0.05));
const BODY: Record<number, Box[]> = { 0: bodyAt(0), 5: bodyAt(5), 10: bodyAt(10) };
const clearance = (x: number, z: number, lvl: number) => {
  let m = Infinity, who = '';
  for (const b of BODY[lvl] ?? BODY[0]) { const d = distToBoxXZ(b, x, z); if (d < m) { m = d; who = b.id; } }
  return { m, who };
};
/** Jarak 2D segmen a→b ke tapak balok sejajar sumbu (0 bila memotong). */
function segBoxDist(ax: number, az: number, bx: number, bz: number, b: Box): number {
  let best = Infinity;
  for (let i = 0; i <= 64; i++) {
    const t = i / 64, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
    best = Math.min(best, distToBoxXZ(b, x, z));
  }
  return best;
}
const r2 = (v: number) => Math.round(v * 100) / 100;

let cols: ReturnType<typeof bostonColliders>;
beforeAll(async () => {
  await physics.init();
  cols = bostonColliders();
  physics.world.step();
});

describe('Boston — balok & tinggi cover', () => {
  it('balok valid: min < max, id unik, di dalam bangunan', () => {
    const ids = new Set<string>();
    for (const b of BOS_BOXES) {
      for (let k = 0; k < 3; k++) expect(b.min[k], b.id).toBeLessThan(b.max[k]);
      expect(ids.has(b.id), b.id).toBe(false); ids.add(b.id);
      expect(b.min[0]).toBeGreaterThanOrEqual(-27.01); expect(b.max[0]).toBeLessThanOrEqual(27.01);
      expect(b.min[2]).toBeGreaterThanOrEqual(-39.01); expect(b.max[2]).toBeLessThanOrEqual(39.01);
    }
  });
  it('tinggi pelindung menghindari pita head-glitch (2.95–3.75 & 4.25–5.05) relatif lantainya', () => {
    const bad: string[] = [];
    for (const b of BOS_BOXES) {
      if (b.cat !== 'cover' && b.cat !== 'pillar' && b.cat !== 'wall') continue;
      if (b.id.startsWith('BR_STORE')) continue;   // gudang padat di bawah bordes/ramp tangga (struktur, bukan pelindung)
      const floor = b.min[1] >= 9.9 ? 10 : b.min[1] <= 0.01 ? 0 : NaN;
      if (Number.isNaN(floor)) continue;
      const h = b.max[1] - floor;
      if ((h > 2.95 && h < 3.75) || (h > 4.25 && h < 5.05)) bad.push(`${b.id} ${r2(h)}`);
    }
    expect(bad).toEqual([]);
  });
});

describe('Boston — spawn', () => {
  it('10 slot per tim: Biru di L4 (z < 0), Merah di L3 (z > 0), ≥ 1.2 u dari penghalang, spasi ≥ 4.4', () => {
    expect(BLUE.length).toBe(10); expect(RED.length).toBe(10);
    for (const [list, y, sg] of [[BLUE, 10, -1], [RED, 0, 1]] as const) {
      for (const [x, yy, z] of list) {
        expect(yy).toBe(y); expect(Math.sign(z)).toBe(sg);
        const c = clearance(x, z, y);
        expect(c.m, `${x},${z} ← ${c.who}`).toBeGreaterThanOrEqual(1.2);
      }
      for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++)
        expect(Math.hypot(list[i][0] - list[j][0], list[i][2] - list[j][2])).toBeGreaterThanOrEqual(4.4);
    }
  });
});

describe('Boston — navigasi', () => {
  const nav = new NavGraph(BOS_NAV);
  it('semua node di ruang bebas (≥ 0.9 u dari penghalang lantainya) & di dalam batas', () => {
    const bad: string[] = [];
    for (const n of nav.nodes) {
      const c = clearance(n.x, n.z, n.level);
      if (c.m < 0.9) bad.push(`${n.id} ${r2(c.m)} ← ${c.who}`);
      expect(n.x).toBeGreaterThan(BOS_BOUNDS.x[0]); expect(n.x).toBeLessThan(BOS_BOUNDS.x[1]);
      expect(n.z).toBeGreaterThan(BOS_BOUNDS.z[0]); expect(n.z).toBeLessThan(BOS_BOUNDS.z[1]);
    }
    expect(bad).toEqual([]);
  });
  it('edge datar bebas selebar kapsul (sapuan 2D ≥ 0.85 u) & raycast Rapier lutut/dada/kepala bebas', () => {
    const bad: string[] = [];
    for (const e of nav.edges) {
      if (e.kind === 'drop' || e.kind === 'stair') continue;
      const A = nav.nodes[e.a], B = nav.nodes[e.b];
      for (const b of BODY[A.level]) {
        const d = segBoxDist(A.x, A.z, B.x, B.z, b);
        // pintu: tiang kusen boleh lebih dekat (lebar pintu ≥ 4.5 u, node di tengah)
        if (d < (e.kind === 'door' ? 0.7 : 0.85) && !(e.gate && b.id.startsWith('MID_'))) bad.push(`${A.id}↔${B.id} ${r2(d)} ← ${b.id}`);
      }
      if (e.gate) continue;                       // kaca utuh menghalangi raycast (memang)
      for (const h of [1.0, 2.5, 4.4]) if (physics.losBlocked(A.x, A.y + h, A.z, B.x, B.y + h, B.z)) bad.push(`${A.id}↔${B.id} ray ${h}`);
    }
    expect(bad).toEqual([]);
  });
  it('NavGraph.validate tanpa peringatan; graf terhubung tanpa drop & dengan semua kaca utuh', () => {
    expect(nav.validate((ax, ay, az, bx, by, bz) => physics.losBlocked(ax, ay, az, bx, by, bz))).toEqual([]);
    const path: number[] = [];
    for (let i = 0; i < nav.nodes.length; i++) expect(nav.findPath(0, i, false, path), nav.nodes[i].id).toBe(true);
    for (let i = 0; i < nav.nodes.length; i++) expect(nav.findPath(i, 0, false, path), nav.nodes[i].id).toBe(true);
  });
  it('edge kaca hanya dilalui setelah gerbang terbuka', () => {
    const path: number[] = [];
    const a = nav.id('OFF_C_E'), b = nav.id('VER_C');
    nav.findPath(a, b, false, path);
    expect(path.length).toBeGreaterThan(2);           // memutar lewat pantry
    nav.setGate('g2', true);
    nav.findPath(a, b, false, path);
    expect(path).toEqual([a, b]);
    nav.setGate('g2', false);
  });
  it('jalur bot: 4 lane berbobot, rute = node yang ada, ada path antar node berurutan, berakhir di setengah lawan', () => {
    expect(BOS_LANES.map(l => l.id).sort()).toEqual(['flank', 'lounge', 'sofa', 'veranda']);
    const path: number[] = [];
    for (const l of BOS_LANES) for (let k = 0; k < 8; k++) for (const own of ['S', 'N'] as const) {
      const r = l.route(own);
      for (const id of r) expect(nav.byId.has(id), `${l.id} ${id}`).toBe(true);
      for (let i = 1; i < r.length; i++) expect(nav.findPath(nav.id(r[i - 1]), nav.id(r[i]), false, path), `${l.id} ${r[i - 1]}→${r[i]}`).toBe(true);
      const last = nav.nodes[nav.id(r[r.length - 1])];
      expect(Math.sign(last.z), `${l.id} ${own}`).toBe(own === 'S' ? 1 : -1);
    }
  });
});

describe('Boston — tangga & fisika', () => {
  it('tangga: kemiringan ≤ 34°, Tangga Cokelat bordes Y 5, puncak menyambung ke pelat L4', () => {
    for (const s of BOS_STAIRS) {
      const f = stairFrame(s), run = Math.abs(f.top - f.foot), rise = f.y1 - f.y0;
      expect(Math.atan2(rise, run) * 180 / Math.PI, s.id).toBeLessThanOrEqual(34);
    }
    const f1 = stairFrame(BOS_STAIRS[0]), f2 = stairFrame(BOS_STAIRS[1]);
    expect(f1.y1).toBe(5); expect(f2.y0).toBe(5); expect(f2.y1).toBe(10);
    // permukaan ramp di puncak = 10 & ada pelat lantai L4 tepat di depannya
    expect(stairHeightAt(f2, 23, f2.top)).toBe(10);
  });
  it('raycast turun di tengah tiap tangga mengenai ramp setinggi permukaan', () => {
    for (const s of BOS_STAIRS) {
      const f = stairFrame(s);
      for (const t of [0.25, 0.5, 0.75]) {
        const c = f.foot + (f.top - f.foot) * t, x = f.axis === 'x' ? c : (f.x[0] + f.x[1]) / 2, z = f.axis === 'z' ? c : (f.z[0] + f.z[1]) / 2;
        const want = stairHeightAt(f, x, z);
        const hit = physics.raycast({ x, y: want + 3, z }, { x: 0, y: -1, z: 0 }, 6);
        expect(hit, `${s.id} ${t}`).toBeGreaterThan(0);
        expect(Math.abs((want + 3 - hit) - want), `${s.id} ${t}`).toBeLessThan(0.05);
      }
    }
  });
  it('kaca destruktibel 3 panel 60 HP; pembatas Veranda di atas pagar sampai plafon', () => {
    expect(BOS_GLASS.length).toBe(3);
    for (const g of BOS_GLASS) { expect(g.hp).toBe(60); expect(g.max[1] - g.min[1]).toBe(6); }
    expect(BOS_BARRIERS[0].min[1]).toBeCloseTo(11.2); expect(BOS_BARRIERS[0].max[1]).toBeCloseTo(18);
  });
});

describe('Boston — permukaan, nama area, latihan, kamera', () => {
  it('nama area & permukaan contoh', () => {
    expect(bosZoneName(BLUE[0][0], 10, BLUE[0][2])).toBe('Spawn Biru');
    expect(bosZoneName(RED[0][0], 0, RED[0][2])).toBe('Spawn Merah');
    expect(bosSurfaceAt(0, 0, 0)).toBe('tile');
  });
  it('12 dummy latihan di titik bebas; kamera menu & probe di udara', () => {
    expect(BOS_PRACTICE.length).toBe(12);
    for (const [x, y, z] of BOS_PRACTICE) { const c = clearance(x, z, y); expect(c.m, `${x},${z} ← ${c.who}`).toBeGreaterThanOrEqual(1.0); }
    expect(clearance(BOS_ENV_PROBE[0], BOS_ENV_PROBE[2], 0).m).toBeGreaterThan(0.5);
    expect(BOS_MENU_CAM.y).toBeLessThan(9.4);
  });
});

describe('Boston — collider dilepas tuntas', () => {
  it('removeColliders mengembalikan jumlah collider', () => {
    const before = physics.world.colliders.len();
    removeColliders(cols);
    expect(physics.world.colliders.len()).toBeLessThan(before);
    cols = bostonColliders();
    physics.world.step();                                 // query pipeline baru valid setelah step
  });
});

describe('Boston — spawn tidak terlihat dari luar', () => {
  it('TIDAK ADA node nav di luar ruang spawn sendiri yang melihat slot spawn (mata → dada & kepala)', () => {
    const nav = new NavGraph(BOS_NAV), bad: string[] = [];
    for (const [team, slots, zone] of [['blue', BLUE, 'Spawn Biru'], ['red', RED, 'Spawn Merah']] as const) {
      for (const [x, y, z] of slots) for (const n of nav.nodes) {
        if (bosZoneName(n.x, n.y, n.z) === zone) continue;
        for (const h of [2.5, 4.4]) if (!physics.losBlocked(n.x, n.y + 4.4, n.z, x, y + h, z)) { bad.push(`${team} ${r2(x)},${r2(z)} ← ${n.id}`); break; }
      }
    }
    expect(bad).toEqual([]);
  });
});

describe('Boston — keseimbangan & konektor', () => {
  const nav = new NavGraph(BOS_NAV);
  const len = (a: string, b: string, drops = false) => {
    const p: number[] = [];
    expect(nav.findPath(nav.id(a), nav.id(b), drops, p), `${a}→${b}`).toBe(true);
    let s = 0;
    for (let i = 1; i < p.length; i++) { const A = nav.nodes[p[i - 1]], B = nav.nodes[p[i]]; s += Math.hypot(A.x - B.x, A.y - B.y, A.z - B.z); }
    return s;
  };
  it('titik kontak utama (puncak Tangga Cokelat, Lounge Utara) berjarak jalur setara dari kedua spawn (±15%)', () => {
    for (const t of ['BR_TOP', 'GL_NN']) {
      const b = len('BS_C', t), r = len('RS_C', t);
      expect(Math.abs(b - r) / Math.max(b, r), t).toBeLessThan(0.15);
    }
  });
  it('kedua lantai terhubung lewat 2 tangga (stair) + drop satu arah ke kabinet setinggi 4.0 (jatuh ≤ 7.5 u = 0 damage)', () => {
    const stairs = nav.edges.filter(e => e.kind === 'stair').map(e => [nav.nodes[e.a].id, nav.nodes[e.b].id].sort().join('-'));
    expect(stairs.sort()).toEqual(['BR_MID-BR_TOP', 'BR_FOOT-BR_MID', 'SERV_FOOT-ST_TOP'].sort());
    const cab = BOS_BOXES.find(b => b.id === 'DROP_CABINET_E')!;
    expect(cab.max[1]).toBe(4);
    expect(10 + 1.383 - cab.max[1]).toBeLessThanOrEqual(7.5);
    expect(MAPS.boston.dropSpec?.('DROP_CABINET_E')).toEqual(BOS_DROP_SPEC);
    expect(MAPS.boston.dropSpec?.('SHELF_A_SW')).toBeUndefined();
    // drop memotong jalan jauh: Veranda → Jalur Sofa
    expect(len('VER_DROP', 'SOFA_S', true)).toBeLessThan(len('VER_DROP', 'SOFA_S') / 4);
  });
  it('radar per lantai (0 & 10); setiap node punya nama area; slot spawn di ruang spawn timnya', () => {
    expect(MAPS.boston.radarFloors).toEqual([0, 10]);
    for (const n of nav.nodes) expect(bosZoneName(n.x, n.y, n.z).length, n.id).toBeGreaterThan(3);
    for (const [x, y, z] of BLUE) expect(bosZoneName(x, y, z)).toBe('Spawn Biru');
    for (const [x, y, z] of RED) expect(bosZoneName(x, y, z)).toBe('Spawn Merah');
  });
});

describe('Boston — permukaan', () => {
  it('tangga cokelat kayu, tangga servis beton (tile), kaca, sofa kain, lantai Ruang Kaca karpet, Veranda tegel', () => {
    const [gx1, gz1] = rot(-18, -14.4);                  // tengah flight 1 (dokumen)
    expect(bosSurfaceAt(gx1, 2.5, gz1)).toBe('wood');
    const [gx2, gz2] = rot(-22.2, 20.5);                 // tengah tangga servis
    expect(bosSurfaceAt(gx2, 5, gz2)).toBe('tile');
    const g = BOS_BOXES.find(b => b.id === 'RS_N2')!;
    expect(bosSurfaceAt((g.min[0] + g.max[0]) / 2, 3, g.min[2])).toBe('glass');
    const sofa = BOS_BOXES.find(b => b.id === 'SOFA_C')!;
    expect(bosSurfaceAt((sofa.min[0] + sofa.max[0]) / 2, sofa.max[1], (sofa.min[2] + sofa.max[2]) / 2)).toBe('carpet');
    const [ox, oz] = rot(-8.5, 0);
    expect(bosSurfaceAt(ox, 10, oz)).toBe('carpet');
    const [vx, vz] = rot(13.5, 0);
    expect(bosSurfaceAt(vx, 10, vz)).toBe('tile');
  });
});

describe('Boston — benda kantor dinamis', () => {
  it('64 benda (16 laptop, 24 tumbler, 24 kursi) di dalam batas, bertumpu di permukaan, tidak menembus balok lain', () => {
    const n = (k: string) => BOS_PROP_ITEMS.filter(i => i.kind === k).length;
    expect([n('laptop'), n('cup'), n('chair')]).toEqual([16, 24, 24]);
    const bad: string[] = [];
    for (const it of BOS_PROP_ITEMS) {
      const [w, h, d] = PROP_SIZE[it.kind], bottom = it.y - h / 2, r = Math.hypot(w, d) / 2 * 0.7;
      expect(Math.abs(it.x)).toBeLessThan(26); expect(Math.abs(it.z)).toBeLessThan(38);
      // tumpuan: lantai (0 / 10) atau puncak balok di bawahnya
      const support = Math.abs(bottom - 0.01) < 0.05 || Math.abs(bottom - 10.01) < 0.05
        || BOS_BOXES.some(b => Math.abs(b.max[1] + 0.01 - bottom) < 0.02 && distToBoxXZ(b, it.x, it.z) < 0.01);
      if (!support) bad.push(`${it.kind} ${r2(it.x)},${r2(it.y)},${r2(it.z)} melayang`);
      for (const b of BOS_BOXES) {
        if (b.style === 'o_ground' || b.style === 'o_slab' || b.style === 'o_roof') continue;
        if (b.max[1] <= bottom + 0.05 || b.min[1] >= it.y + h / 2) continue;          // di bawah (tumpuan) / di atas
        if (distToBoxXZ(b, it.x, it.z) < r - 0.05) bad.push(`${it.kind} ${r2(it.x)},${r2(it.z)} menembus ${b.id}`);
      }
    }
    expect(bad).toEqual([]);
  });
});

describe('Boston — kaca destruktibel (runtime Breakables)', () => {
  it('peluru 2 × 41 memecahkan panel 60 HP → collider nonaktif, gerbang nav terbuka; ledakan dekat memecahkan; reset memulihkan', () => {
    const scene = new THREE.Scene(), nav = new NavGraph(BOS_NAV), B = new Breakables();
    const prevNav = ctx.nav; ctx.nav = nav;
    try {
      B.load(BOS_GLASS, scene, false);
      physics.world.step();
      expect(B.count).toBe(3);
      const panels = (B as unknown as { panels: { col: { handle: number; isEnabled(): boolean } }[] }).panels;
      const h = panels[1].col.handle;
      expect(B.bulletHit(h, 41)).toBe(true);
      expect(B.isBroken(1)).toBe(false);
      expect(B.bulletHit(h, 41)).toBe(true);
      expect(B.isBroken(1)).toBe(true);
      expect(panels[1].col.isEnabled()).toBe(false);
      expect(nav.gateOpen('g2')).toBe(true);
      expect(B.bulletHit(h, 41)).toBe(false);             // sudah pecah: peluru tidak dihitung lagi
      expect(B.bulletHit(-999, 41)).toBe(false);          // collider lain
      const g3 = BOS_GLASS[2], c = new THREE.Vector3((g3.min[0] + g3.max[0]) / 2 + 3, 12, (g3.min[2] + g3.max[2]) / 2);
      B.explosion(c, 12);
      expect(B.isBroken(2)).toBe(true);
      expect(B.isBroken(0)).toBe(false);                  // panel 1 jauh (> 12 u)
      expect(B.brokenList()).toEqual([1, 2]);
      B.reset();
      expect(B.brokenList()).toEqual([]);
      expect(panels[1].col.isEnabled()).toBe(true);
      expect(nav.gateOpen('g2')).toBe(false);
      B.applyBroken([0, 99, -1]);
      expect(B.brokenList()).toEqual([0]);
      const n0 = physics.world.colliders.len();
      B.unload();
      expect(physics.world.colliders.len()).toBe(n0 - 3);
      expect(scene.children.length).toBe(0);
    } finally { ctx.nav = prevNav; }
  });
  it('cadangan pindah host: daftar kaca divalidasi (bulat, 0…31, unik); cadangan lama tanpa kaca tetap sah', () => {
    const base = { v: SAVE_VERSION, state: 'PLAYING', round: 1, timeLeft: 100, countdown: 0, sb: 0, sr: 0, winner: 'draw', roundWinner: null, ents: [] };
    const s1 = parseSave({ ...base, glass: [1, 1, 2.5, -1, 40, 2, 'x'] });
    expect(s1).not.toBeNull();
    expect(s1!.glass).toEqual([1, 2]);
    const s2 = parseSave(base);
    expect(s2).not.toBeNull();
    expect(s2!.glass).toBeUndefined();
  });
});
