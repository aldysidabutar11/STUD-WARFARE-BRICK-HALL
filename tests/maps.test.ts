// tests/maps.test.ts — fondasi multi-map (Brick Hall + Steel Yard): registry & ganti map (bagian murni), NavGraph dari template,
// cermin balok berputar (rotY), MeshBuckets/LightBake dengan rotY & mode luar ruang, material permukaan baru di codec jaringan.
import { beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { DEFAULT_MAP, MAPS, currentMap, isMapId, mapInfo, setCurrentMap } from '../src/world/maps/registry';
import { MAP_IDS, type MapDef, type NavTemplate } from '../src/world/maps/types';
import { NavGraph } from '../src/world/NavGraph';
import { boxAabbXZ, boxCorners, distToBoxXZ, expandRows, mirrorBox, type Box, type Row } from '../src/world/MapData';
import { MeshBuckets } from '../src/world/BoxBuilder';
import { LightField } from '../src/world/LightBake';
import { SURFACES, SURFACE_COLOR, surfaceCode, surfaceOf } from '../src/world/surfaces';
import { decodeSnapshot, encodeSnapshot, packBounce, unpackBounce, type Snapshot } from '../src/net/protocol';
import { validate } from '../src/ui/Settings';
import { SpawnSystem } from '../src/game/SpawnSystem';
import { laneRoute } from '../src/game/BotDirector';
import type { Entity } from '../src/entities/Entity';
import { physics } from '../src/physics/Physics';
import { Props } from '../src/world/Props';
import { XCFG } from '../src/config/extraConfig';

const ALL = MAP_IDS.map(id => MAPS[id]);

describe('Registry & ganti map (murni)', () => {
  it('daftar map lengkap, id konsisten, urutan menu = MAP_IDS', () => {
    expect(Object.keys(MAPS).sort()).toEqual([...MAP_IDS].sort());
    for (const id of MAP_IDS) expect(MAPS[id].id).toBe(id);
    expect(mapInfo().map(m => m.id)).toEqual([...MAP_IDS]);
    expect(mapInfo().map(m => m.name)).toEqual(['Brick Hall', 'Steel Yard', 'Boston', 'Meridian Vault', 'Candi Arunika']);
    for (const m of mapInfo()) expect(m.desc.length).toBeGreaterThan(10);
  });
  it('bawaan Brick Hall; setCurrentMap mengganti map aktif; id tak dikenal ditolak', () => {
    expect(DEFAULT_MAP).toBe('brickhall');
    expect(currentMap().id).toBe('brickhall');
    expect(setCurrentMap('steelyard')).toBe(MAPS.steelyard);
    expect(currentMap()).toBe(MAPS.steelyard);
    expect(() => setCurrentMap('atlantis' as never)).toThrow();
    expect(currentMap()).toBe(MAPS.steelyard);           // gagal tidak mengubah map aktif
    setCurrentMap('brickhall');
    expect(currentMap()).toBe(MAPS.brickhall);
  });
  it('isMapId & setelan map tervalidasi (bawaan brickhall)', () => {
    expect(isMapId('steelyard')).toBe(true); expect(isMapId('x')).toBe(false); expect(isMapId(null)).toBe(false);
    expect(validate(null).map).toBe('brickhall');
    expect(validate({ map: 'steelyard' }).map).toBe('steelyard');
    expect(validate({ map: 'atlantis' as never }).map).toBe('brickhall');
  });
  it('data tiap map konsisten (id balok unik, spawn di dalam batas, latihan 12, probe di dalam batas)', () => {
    for (const d of ALL) {
      const ids = new Set(d.boxes.map(b => b.id));
      expect(ids.size, d.id).toBe(d.boxes.length);
      const inB = (x: number, z: number) => x > d.bounds.x[0] && x < d.bounds.x[1] && z > d.bounds.z[0] && z < d.bounds.z[1];
      for (const team of ['blue', 'red'] as const) {
        const all = [...d.spawnSlots[team].upper, ...d.spawnSlots[team].ground];
        // Meridian Vault: map Bomb Mission 5v5 → 5 slot per kelompok (dokumen §5); map TDM lain 10
        expect(all.length, `${d.id} ${team}`).toBe(d.bombSites ? 5 : 10);          // map Bomb Mission: 5 slot (5v5)
        for (const [x, , z] of all) { expect(inB(x, z)).toBe(true); expect(Math.sign(z)).toBe(team === 'blue' ? -1 : 1); }
      }
      expect(d.practice.length).toBe(12);
      for (const [x, , z] of d.practice) expect(inB(x, z), `${d.id} latihan ${x},${z}`).toBe(true);
      expect(inB(d.envProbe[0], d.envProbe[2])).toBe(true);
      expect(d.atmosphere.fogDensity).toBeGreaterThan(0);
      expect(typeof d.zoneName(0, 0, -20)).toBe('string');
      expect(SURFACES).toContain(d.surfaceAt(0, 0, -20));
    }
    expect(MAPS.brickhall.atmosphere.outdoor).toBe(false);
    expect(MAPS.steelyard.atmosphere.outdoor).toBe(true);
    expect(MAPS.steelyard.spawnSlots.blue.upper).toEqual([]);  // satu lantai: SpawnSystem memakai 'ground'
  });
  it('Steel Yard: tanah = sand, dalam kontainer = metal', () => {
    const d = MAPS.steelyard;
    expect(d.surfaceAt(d.spawnSlots.blue.ground[0][0], 0, d.spawnSlots.blue.ground[0][2])).toBe('sand');
    // balok kontainer (gaya 'steel', setinggi ≥ 6 u): pusat tapaknya di dalam/atas kontainer → logam
    const k = d.boxes.find(b => b.style === 'steel' && b.max[1] - b.min[1] >= 6);
    if (k) expect(d.surfaceAt((k.min[0] + k.max[0]) / 2, 1, (k.min[2] + k.max[2]) / 2)).toBe('metal');
  });
});

describe('NavGraph dari template (per map)', () => {
  const T: NavTemplate = {
    nodes: [['{H}_A_{X}', -10, -20, 0], ['{H}_B', 0, -15, 0], ['C_C_{X}', -5, 0, 0]],
    edges: [['{H}_A_{X}', '{H}_B', 'walk'], ['{H}_A_{X}', 'C_C_{X}', 'door']],
    drops: [['{H}_B', '{H}_A_{X}', 'LEDGE']],
    cover: ['{H}_B'],
  };
  const g = new NavGraph(T);
  it('ekspansi {H}/{X}/C_ + cermin koordinat', () => {
    expect(g.nodes.map(n => n.id).sort()).toEqual(['C_C_E', 'C_C_W', 'N_A_E', 'N_A_W', 'N_B', 'S_A_E', 'S_A_W', 'S_B'].sort());
    const at = (id: string) => g.nodes[g.id(id)];
    expect([at('S_A_W').x, at('S_A_W').z]).toEqual([-10, -20]);
    expect([at('N_A_E').x, at('N_A_E').z]).toEqual([10, 20]);
    expect(at('C_C_E').side).toBe('C'); expect(at('N_B').side).toBe('N');
    expect(at('S_B').cover).toBe(true); expect(at('S_A_W').cover).toBe(false);
    expect(g.walkEdgeCount).toBe(8);        // A–B ×4 + A–C ×4
    expect(g.dropCount).toBe(4);
    expect([...g.dropInfo.values()].sort()).toEqual(['LEDGE_NE', 'LEDGE_NW', 'LEDGE_SE', 'LEDGE_SW']);
  });
  it('edge ke node tak dikenal → error jelas', () => {
    expect(() => new NavGraph({ nodes: [['{H}_A', 0, -5, 0]], edges: [['{H}_A', '{H}_X', 'walk']], cover: [] })).toThrow(/edge/);
  });
  it('setiap map: graf terhubung dari node terdekat spawn & rute jalur bot memakai node yang ada', () => {
    const path: number[] = [];
    for (const d of ALL) {
      const nav = new NavGraph(d.nav);
      for (const team of ['blue', 'red'] as const) for (const [x, y, z] of [...d.spawnSlots[team].upper, ...d.spawnSlots[team].ground]) {
        const s = nav.nearest(x, y, z);
        for (let i = 0; i < nav.nodes.length; i++) expect(nav.findPath(s, i, false, path), `${d.id}: ${nav.nodes[s].id} → ${nav.nodes[i].id}`).toBe(true);
      }
      expect(d.lanes.length).toBeGreaterThanOrEqual(3);
      for (const l of d.lanes) {
        expect(l.weight).toBeGreaterThan(0);
        for (let k = 0; k < 12; k++) for (const own of ['S', 'N'] as const) for (const id of l.route(own)) expect(nav.byId.has(id), `${d.id} ${l.id}: ${id}`).toBe(true);
      }
    }
  });
  it('BotDirector.laneRoute membaca jalur map aktif (id tak dikenal → jalur pertama)', () => {
    setCurrentMap('steelyard');
    const nav = new NavGraph(MAPS.steelyard.nav);
    for (const id of laneRoute('', 'S')) expect(nav.byId.has(id)).toBe(true);
    setCurrentMap('brickhall');
    expect(laneRoute('bridge', 'N')[0]).toMatch(/^N_BRMOUTH_[WE]$/);
    expect(laneRoute('tidak-ada', 'S')[0]).toMatch(/^S_BRMOUTH_[WE]$/);
  });
  it('posisi X bot: Steel Yard memakai sisi W/E bot sendiri; Brick Hall mengabaikannya (undian & urutan Math.random sama)', () => {
    setCurrentMap('steelyard');
    const sides = (r: string[]) => new Set(r.filter(id => /_[WE]$/.test(id)).map(id => id.slice(-1)));
    for (const l of MAPS.steelyard.lanes) {
      expect([...sides(laneRoute(l.id, 'S', -30))], l.id).toEqual(['W']);
      expect([...sides(laneRoute(l.id, 'N', 25))], l.id).toEqual(['E']);
    }
    setCurrentMap('brickhall');
    const routes = (x?: number) => {
      const rnd = Math.random, seq = [0.7, 0.2, 0.9, 0.4, 0.1, 0.6];
      let k = 0;
      Math.random = () => seq[k++ % seq.length];
      try { return MAPS.brickhall.lanes.map(l => laneRoute(l.id, 'S', x).join(' ')); } finally { Math.random = rnd; }
    };
    expect(routes(-30)).toEqual(routes());
    expect(routes(30)).toEqual(routes());
  });
});

describe('SpawnSystem: indeks slot global untuk lantai berapa pun', () => {
  const sp = new SpawnSystem(), blue = { team: 'blue' } as Entity, red = { team: 'red' } as Entity;
  it('Brick Hall: 0–4 atas, 5–9 bawah (sama dengan sebelumnya)', () => {
    setCurrentMap('brickhall');
    const S = MAPS.brickhall.spawnSlots;
    expect(sp.slotPos(blue, 2)).toEqual(S.blue.upper[2]);
    expect(sp.slotPos(red, 7)).toEqual(S.red.ground[2]);
  });
  it('Steel Yard: tanpa lantai atas → 0–9 = lantai dasar', () => {
    setCurrentMap('steelyard');
    const S = MAPS.steelyard.spawnSlots;
    for (let i = 0; i < 10; i++) expect(sp.slotPos(blue, i)).toEqual(S.blue.ground[i]);
    setCurrentMap('brickhall');
  });
});

describe('Balok berputar (Box.rotY)', () => {
  const key = (p: [number, number]) => `${p[0].toFixed(6)},${p[1].toFixed(6)}`;
  const rows: Row[] = [{ id: 'K_SW', cat: 'wall', x: [-20, -10], y: [0, 7], z: [-30, -26], m: 'XZ', style: 'steel', rotY: 0.4 }];
  const out = expandRows(rows);
  it('cermin X / Z membalik putaran, XZ = putar 180° (rotY tetap); tanpa rotY → tanpa field rotY', () => {
    expect(out.map(b => b.id)).toEqual(['K_SW', 'K_SE', 'K_NW', 'K_NE']);
    expect(out.map(b => b.rotY)).toEqual([0.4, -0.4, -0.4, 0.4]);
    expect('rotY' in expandRows([{ ...rows[0], rotY: undefined }])[0]).toBe(false);
  });
  it('sudut tapak tiap salinan = bayangan cermin sudut tapak asli', () => {
    const orig = boxCorners(out[0]);
    const mir = (mx: boolean, mz: boolean) => new Set(orig.map(([x, z]) => key([mx ? -x : x, mz ? -z : z])).map(s => s.replace(/-0\.000000/g, '0.000000')));
    const got = (b: Box) => new Set(boxCorners(b).map(p => key(p)).map(s => s.replace(/-0\.000000/g, '0.000000')));
    expect(got(out[1])).toEqual(mir(true, false));
    expect(got(out[2])).toEqual(mir(false, true));
    expect(got(out[3])).toEqual(mir(true, true));
    for (const [axis, mx, mz] of [['X', true, false], ['Z', false, true], ['XZ', true, true]] as const)
      expect(got(mirrorBox(out[0], axis))).toEqual(mir(mx, mz));
  });
  it('jarak titik ↔ tapak OBB & AABB dunia', () => {
    const b = out[0], cx = -15, cz = -28;
    expect(distToBoxXZ(b, cx, cz)).toBe(0);
    const c = boxCorners(b), ab = boxAabbXZ(b);
    for (const [x, z] of c) {
      expect(distToBoxXZ(b, x, z)).toBeLessThan(1e-9);
      expect(x).toBeGreaterThanOrEqual(ab.x[0] - 1e-9); expect(x).toBeLessThanOrEqual(ab.x[1] + 1e-9);
      expect(z).toBeGreaterThanOrEqual(ab.z[0] - 1e-9); expect(z).toBeLessThanOrEqual(ab.z[1] + 1e-9);
    }
    // 1 u di luar sisi panjang (arah normal lokal +Z) → jarak 1
    const nx = Math.sin(0.4), nz = Math.cos(0.4);
    expect(distToBoxXZ(b, cx + nx * 3, cz + nz * 3)).toBeCloseTo(1, 9);
  });
  it('MeshBuckets: verteks & normal diputar di pusat balok, jumlah segitiga sama', () => {
    const m = new THREE.MeshBasicMaterial(), s = { top: [m, 0xffffff], side: [m, 0xffffff], bottom: [m, 0xffffff] } as never;
    const a = new MeshBuckets(), r = new MeshBuckets();
    a.addBox([-2, 0, -1], [2, 1, 1], s); r.addBox([-2, 0, -1], [2, 1, 1], s, {}, Math.PI / 2);
    expect(r.triangles).toBe(a.triangles);
    const p = r.build(false)[0].geometry.attributes.position, n = r.build(false)[0].geometry.attributes.normal;
    let mxX = 0, mxZ = 0;
    for (let i = 0; i < p.count; i++) { mxX = Math.max(mxX, Math.abs(p.getX(i))); mxZ = Math.max(mxZ, Math.abs(p.getZ(i))); }
    expect(mxX).toBeCloseTo(1, 6); expect(mxZ).toBeCloseTo(2, 6);           // 4 × 2 diputar 90° → 2 × 4
    for (let i = 0; i < n.count; i++) expect(Math.hypot(n.getX(i), n.getY(i), n.getZ(i))).toBeCloseTo(1, 6);
  });
});

describe('LightBake mode luar ruang + OBB', () => {
  // lorong kontainer berputar (dinding tipis 0.15 + atap) di tanah lapang
  const rot = 0.6, base = (id: string, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): Box =>
    ({ id, cat: 'wall', min: [x0, y0, z0], max: [x1, y1, z1], style: 'steel', rotY: rot });
  const c = Math.cos(rot), s = Math.sin(rot), at = (lx: number, lz: number) => [lx * c + lz * s, -lx * s + lz * c] as const;
  const wall = (id: string, lz: number) => { const [x, z] = at(0, lz); return base(id, x - 8, x + 8, 0, 7, z - 0.075, z + 0.075); };
  const boxes: Box[] = [
    { id: 'GROUND', cat: 'shell', min: [-40, -1, -40], max: [40, 0, 40], style: 'hidden' },
    wall('L', -3.3), wall('R', 3.3), base('ROOF', -8, 8, 7, 7.15, -3.4, 3.4),
  ];
  const f = new LightField({ min: [-20, -1.5, -20], max: [20, 12, 20], boxes, stairs: [], sunDir: [-1, -1.2, -0.5], outdoor: { bounce: 0.4 } });
  const S = (x: number, y: number, z: number) => f.sample(x, y, z, { sky: 0, bounce: 0 });
  it('langit terbuka terang, dalam lorong beratap lebih gelap; di luar grid = langit terbuka', () => {
    expect(f.outdoor).toBe(true);
    const open = S(-15, 2, 15).sky, inside = S(0, 2, 0).sky;
    expect(open).toBeGreaterThan(0.85);
    expect(inside).toBeLessThan(open * 0.75);
    expect(S(500, 3, 500)).toEqual({ sky: 1, bounce: 0 });
    expect(f.ms).toBeLessThan(1500);
  });
  it('dinding tipis berputar tetap padat di grid (titik di luar dinding vs di dalam lorong berbeda)', () => {
    const [ox, oz] = at(0, 5.5);                 // 2 u di luar dinding R (sisi lapang)
    expect(S(ox, 2, oz).sky).toBeGreaterThan(S(0, 2, 0).sky + 0.1);
  });
  it('ada pantul dari tanah yang kena matahari; nilai bake 0..1', () => {
    expect(S(12, 1.2, -12).bounce).toBeGreaterThan(0.2);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, -15, 0, 15, 3, 3, 0], 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 1, 0, 0], 3));
    f.bakeGeometry(g);
    for (const v of g.attributes.bake.array) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(1); }
  });
});

describe('Material permukaan baru di jaringan (sand, metal)', () => {
  it('kode lama tidak bergeser (tile 0, carpet 1, wood 2) + sand/metal/glass/water di akhir; warna efek lengkap', () => {
    expect(SURFACES.slice(0, 3)).toEqual(['tile', 'carpet', 'wood']);
    expect(SURFACES).toEqual(['tile', 'carpet', 'wood', 'sand', 'metal', 'glass', 'water']);
    expect(SURFACES.length).toBeLessThanOrEqual(8);       // 3 bit di paket pantulan granat
    for (const m of SURFACES) { expect(surfaceOf(surfaceCode(m))).toBe(m); expect(SURFACE_COLOR[m]).toBeTypeOf('number'); }
    expect(surfaceOf(99)).toBe('tile');
  });
  it('pantulan granat: 3 bit material + kecepatan ×2 (5 bit, maks 15.5) dalam satu byte', () => {
    for (const m of SURFACES) for (let v = 0; v <= 15.5; v += 0.5) {
      const a = packBounce(surfaceCode(m), v);
      expect(a).toBeGreaterThanOrEqual(0); expect(a).toBeLessThanOrEqual(255);
      expect(unpackBounce(a)).toEqual({ mat: surfaceCode(m), speed: v });
    }
    expect(unpackBounce(packBounce(4, 40)).speed).toBe(15.5);     // dijepit
    expect(unpackBounce(packBounce(3, -2)).speed).toBe(0);
  });
  it('snapshot: material tembakan & pantulan granat utuh lewat codec biner', () => {
    const snap: Snapshot = {
      tick: 5, ack: 1, match: { state: 3, sb: 0, sr: 0, timeLeft: 100, countdown: 0, round: 1 }, ents: [], own: null, nades: [],
      shots: [{ shooter: 2, x: 1, y: 2, z: 3, kind: 1, nx: 0, ny: 1, nz: 0, mat: surfaceCode('metal'), victim: 0, part: 0 }],
      fx: [{ type: 4, ent: 0, a: packBounce(surfaceCode('sand'), 9.5), x: 0, y: 1, z: 0 }],
    };
    const out = decodeSnapshot(encodeSnapshot(snap))!;
    expect(surfaceOf(out.shots[0].mat)).toBe('metal');
    const b = unpackBounce(out.fx[0].a);
    expect(surfaceOf(b.mat)).toBe('sand'); expect(b.speed).toBe(9.5);
  });
});

/** Tipe MapDef dipakai (agar perubahan kontrak terdeteksi typecheck). */
export type _Check = MapDef;

describe('Ganti map: buku fisika (Props) dilepas tuntas', () => {
  beforeAll(async () => { await physics.init(); });
  it('Brick Hall: buku rak + tumpukan = rigid body; dispose → body, collider & isi scene kembali ke awal (aman diulang)', () => {
    const w = physics.world, scene = new THREE.Scene(), d = MAPS.brickhall.props!;
    const b0 = w.bodies.len(), c0 = w.colliders.len();
    const shelves = [{ index: 0, id: 'R0', cx: 0, cz: 0, alongX: true }, { index: 1, id: 'R1', cx: 8, cz: 4, alongX: false }];
    const props = new Props(scene, shelves, false, d);
    const n = shelves.length * XCFG.props.booksPerCompartment.reduce((a, b) => a + b, 0) + d.bookPiles.length * XCFG.props.perPile;
    expect(props.books.length).toBe(n);
    expect(w.bodies.len()).toBe(b0 + n);
    expect(w.colliders.len()).toBe(c0 + n);
    expect(scene.children.length).toBe(2);                                   // buku (instanced) + kertas
    props.dispose();
    expect(w.bodies.len()).toBe(b0);
    expect(w.colliders.len()).toBe(c0);
    expect(scene.children.length).toBe(0);
    props.dispose();                                                         // loadMap gagal di tengah → dibongkar ulang
    expect(w.bodies.len()).toBe(b0);
  });
  it('map tanpa props (Steel Yard): tanpa buku & kertas, dispose aman', () => {
    const w = physics.world, scene = new THREE.Scene(), b0 = w.bodies.len();
    const props = new Props(scene, [], false, MAPS.steelyard.props);
    expect(props.books.length).toBe(0);
    expect(w.bodies.len()).toBe(b0);
    props.dispose();
    expect(scene.children.length).toBe(0);
  });
});
