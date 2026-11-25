// tests/botTactics.test.ts — posisi taktis bot (src/entities/botTactics.ts) di collider Rapier map ASLI (Steel Yard & Brick Hall):
// cover dari ancaman, posisi baku tembak dari balik cover (sembunyi + titik intip), titik kabur dari granat. Skenario = pasangan
// node nav acak (deterministik) yang saling melihat; setiap hasil diuji ulang dengan raycast (invarian), plus porsi minimal ditemukan.
import { beforeAll, describe, expect, it } from 'vitest';
import { physics } from '../src/physics/Physics';
import { QUERY } from '../src/physics/groups';
import { CFG } from '../src/config/gameConfig';
import { XCFG } from '../src/config/extraConfig';
import { addBoxColliders, removeColliders } from '../src/world/maps/shared';
import { NavGraph } from '../src/world/NavGraph';
import type { NavTemplate } from '../src/world/maps/types';
import type { Box } from '../src/world/MapData';
import { BOXES } from '../src/world/MapData';
import { BRICKHALL_NAV } from '../src/world/maps/brickhall';
import { SY_BOXES } from '../src/world/maps/steelyard/layout';
import { SY_NAV } from '../src/world/maps/steelyard/nav';
import { costTo, coverFrom, fightSpot, fleeNode, type FightSpot, type P3 } from '../src/entities/botTactics';

const EYE = CFG.player.eyeStand, EYE_C = CFG.player.eyeCrouch, H = XCFG.bots.human;
const blocked = (ax: number, ay: number, az: number, bx: number, by: number, bz: number) => physics.losBlocked(ax, ay, az, bx, by, bz);
const ground = (x: number, y: number, z: number) => {
  const d = physics.raycast({ x, y: y + 2, z }, { x: 0, y: -1, z: 0 }, 4, QUERY.LOS);
  return d < 0 ? null : y + 2 - d;
};
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

interface Scene { name: string; boxes: Box[]; nav: NavTemplate }
const SCENES: Scene[] = [
  { name: 'Steel Yard', boxes: SY_BOXES, nav: SY_NAV },
  { name: 'Brick Hall', boxes: BOXES, nav: BRICKHALL_NAV },
];

/** Pasangan (bot, ancaman) dari node acak: jarak 12–45 u, lantai sama, saling melihat (mata ancaman → dada bot). */
function engagements(nav: NavGraph, n: number, seed: number) {
  const r = rng(seed), out: { f: P3; te: P3; tc: P3 }[] = [];
  for (let guard = 0; out.length < n && guard < n * 200; guard++) {
    const a = nav.nodes[Math.floor(r() * nav.nodes.length)], b = nav.nodes[Math.floor(r() * nav.nodes.length)];
    const d = Math.hypot(a.x - b.x, a.z - b.z);
    if (d < 12 || d > 45 || Math.abs(a.y - b.y) > 0.5) continue;
    if (blocked(b.x, b.y + EYE, b.z, a.x, a.y + 2.5, a.z)) continue;
    out.push({ f: { x: a.x, y: a.y, z: a.z }, te: { x: b.x, y: b.y + EYE, z: b.z }, tc: { x: b.x, y: b.y + 2.6, z: b.z } });
  }
  return out;
}

let physicsReady = false;
beforeAll(async () => { await physics.init(); physicsReady = true; });

describe.each(SCENES)('botTactics — $name', (sc) => {
  let nav: NavGraph;
  beforeAll(() => {
    expect(physicsReady).toBe(true);
    nav = new NavGraph(sc.nav);
  });
  /** Collider map ini saja selama satu test (map lain dilepas). */
  const withMap = (fn: () => void) => {
    const cols = addBoxColliders(sc.boxes);
    physics.world.step();
    try { fn(); } finally { removeColliders(cols); physics.world.step(); }
  };

  it('cover dari ancaman: mata jongkok tersembunyi, biaya jalur ≤ maks (GDD §11.9)', () => withMap(() => {
    const buf: number[] = [];
    let found = 0;
    const list = engagements(nav, 60, 11);
    for (const { f, te } of list) {
      const node = coverFrom(nav, blocked, f, te, XCFG.bots.coverMaxCost, EYE_C, buf);
      if (node < 0) continue;
      found++;
      const n = nav.nodes[node];
      expect(n.cover).toBe(true);
      expect(blocked(n.x, n.y + EYE_C, n.z, te.x, te.y, te.z)).toBe(true);
      expect(costTo(nav, f, node, buf)).toBeLessThanOrEqual(XCFG.bots.coverMaxCost + 1e-6);
    }
    expect(found / list.length).toBeGreaterThan(0.5);
  }));

  it('posisi baku tembak: node cover menyembunyikan, titik intip bisa menembak dada ancaman, geser bebas & berlantai', () => withMap(() => {
    const buf: number[] = [], spot: FightSpot = { node: -1, px: 0, pz: 0, stand: false, hideCrouch: false };
    const opts = { maxDist: H.fight.maxDist, offsets: H.fight.offsets, eyes: { stand: EYE, crouch: EYE_C } };
    let found = 0, stand = 0;
    const list = engagements(nav, 80, 23);
    for (const { f, te, tc } of list) {
      if (!fightSpot(nav, blocked, ground, f, te, tc, opts, spot, buf)) continue;
      found++;
      const n = nav.nodes[spot.node];
      expect(n.cover).toBe(true);
      expect(Math.hypot(n.x - f.x, n.z - f.z)).toBeLessThanOrEqual(H.fight.maxDist + 1e-6);
      expect(blocked(n.x, n.y + EYE_C, n.z, te.x, te.y, te.z)).toBe(true);                    // sembunyi (jongkok)
      expect(spot.hideCrouch).toBe(!blocked(n.x, n.y + EYE, n.z, te.x, te.y, te.z));
      if (spot.stand) {
        stand++;
        expect(blocked(n.x, n.y + EYE, n.z, tc.x, tc.y, tc.z)).toBe(false);                    // berdiri = bisa menembak
      } else {
        const off = Math.hypot(spot.px - n.x, spot.pz - n.z);
        expect(H.fight.offsets.some(o => Math.abs(o - off) < 1e-6)).toBe(true);
        expect(blocked(n.x, n.y + 1, n.z, spot.px, n.y + 1, spot.pz)).toBe(false);               // geser bebas
        const gy = ground(spot.px, n.y, spot.pz);
        expect(gy).not.toBeNull();
        expect(Math.abs(gy! - n.y)).toBeLessThanOrEqual(0.6);
        expect(blocked(spot.px, gy! + EYE, spot.pz, tc.x, tc.y, tc.z)).toBe(false);             // intip = bisa menembak
      }
      expect(costTo(nav, f, spot.node, buf)).toBeLessThanOrEqual(Math.hypot(n.x - f.x, n.z - f.z) * 1.6 + 2 + 1e-6);
    }
    console.log(`[botTactics] ${sc.name}: posisi tempur ditemukan ${found}/${list.length} (berdiri ${stand})`);
    expect(found / list.length).toBeGreaterThan(0.15);
  }));

  it('kabur dari granat: node terhalang dari titik ledak / di luar jarak aman, tidak lewat granat, jalur pendek', () => withMap(() => {
    const r = rng(5), buf: number[] = [];
    const o = { radius: H.grenade.flee, safe: H.grenade.safe, chestY: 2.5 };
    let tried = 0, found = 0, safe = 0;
    for (let i = 0; i < 200 && tried < 60; i++) {
      const a = nav.nodes[Math.floor(r() * nav.nodes.length)];
      const ang = r() * Math.PI * 2, gd = 1 + r() * 4;
      const g = { x: a.x + Math.cos(ang) * gd, y: a.y + 0.25, z: a.z + Math.sin(ang) * gd };
      const gy = ground(g.x, a.y, g.z);
      if (gy === null || Math.abs(gy - a.y) > 0.3 || blocked(a.x, a.y + 1, a.z, g.x, g.y + 0.5, g.z)) continue;  // granat di lantai yang sama, terlihat
      tried++;
      const f = { x: a.x, y: a.y, z: a.z };
      const node = fleeNode(nav, blocked, f, g, o, buf);
      if (node < 0) continue;
      found++;
      const n = nav.nodes[node];
      const dn = Math.hypot(n.x - f.x, n.z - f.z), dg = Math.hypot(n.x - g.x, n.y - g.y, n.z - g.z);
      expect(dn).toBeLessThanOrEqual(o.radius + 1e-6);
      const ok = blocked(g.x, g.y + 0.3, g.z, n.x, n.y + 2.5, n.z) || dg >= o.safe * 0.8;
      if (ok) safe++;
      else expect(dg).toBeGreaterThanOrEqual(Math.hypot(f.x - g.x, f.y - g.y, f.z - g.z) + 2 - 1e-6);   // terpojok: tetap menjauh
      expect(costTo(nav, f, node, buf)).toBeLessThanOrEqual(o.radius * 1.8 + 1e-6);
    }
    expect(tried).toBeGreaterThan(30);
    expect(found / tried).toBeGreaterThan(0.85);
    expect(safe / found).toBeGreaterThan(0.8);                                                     // umumnya benar-benar aman
  }));
});
