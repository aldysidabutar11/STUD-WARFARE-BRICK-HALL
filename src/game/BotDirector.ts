// src/game/BotDirector.ts — pembagian jalur, memori tim ringan (GDD §11.1, §11.7) + callout antar-bot (bot manusiawi, XCFG.bots.human)
import * as THREE from 'three';
import { XCFG } from '../config/extraConfig';
import type { Team } from '../entities/BlockyCharacter';
import type { Entity } from '../entities/Entity';
import type { NavGraph } from '../world/NavGraph';
import { currentMap } from '../world/maps/registry';

/** Id jalur bot dari MapDef.lanes map aktif (Brick Hall: bridge/west/east/floor/archive). */
export type Lane = string;

/** Rute jalur sebagai daftar id node (sudah diekspansi untuk sisi `own`); id tak dikenal → jalur pertama map.
 *  x = posisi X bot (map dengan spawn di sudut memilih sisi W/E bot sendiri; Brick Hall mengabaikannya). */
export function laneRoute(lane: Lane, own: 'S' | 'N', x?: number): string[] {
  const lanes = currentMap().lanes;
  return (lanes.find(l => l.id === lane) ?? lanes[0]).route(own, x);
}

/** Laporan posisi musuh yang menunggu diantar ke rekan (jeda manusiawi). */
interface Callout { x: number; y: number; z: number; due: number; spotter: number }

/** Node alternatif di sekitar lokasi callout untuk responden kedua dst.: ≥ altMin dari node responden pertama, ≤ altMax dari
 *  lokasi, lantai sama — dipilih yang terdekat ke responden (mendekat dari sisinya sendiri, tidak menumpuk di satu titik). */
function altNode(nav: NavGraph, c: Callout, first: number, from: THREE.Vector3): number {
  const C = XCFG.bots.human.callout, F = nav.nodes[first];
  let best = first, bd = Infinity;
  for (let i = 0; i < nav.nodes.length; i++) {
    const n = nav.nodes[i];
    if (Math.abs(n.y - c.y) > 3 || Math.hypot(n.x - c.x, n.z - c.z) > C.altMax || Math.hypot(n.x - F.x, n.z - F.z) < C.altMin) continue;
    const d = Math.hypot(n.x - from.x, n.z - from.z);
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

export class BotDirector {
  private assigned = new Map<number, Lane>();
  /** Memori tim: posisi musuh yang dilaporkan (id → posisi + waktu). */
  readonly reports = new Map<number, { pos: THREE.Vector3; t: number }>();
  private calls: Callout[] = [];
  private lastCall = new Map<number, number>();

  constructor(readonly team: Team) {}

  /** Bobot jalur dari MapDef.lanes map aktif (Brick Hall: XCFG.bots.lanes, v2 + ARSIP); maksimal 2 bot per jalur per tim. */
  assign(bot: Entity): Lane {
    this.assigned.delete(bot.id);
    const max = XCFG.bots.lanePerTeamMax, defs = currentMap().lanes;
    const count = (l: Lane) => [...this.assigned.values()].filter(x => x === l).length;
    const lanes: [Lane, number][] = defs.map(d => [d.id, d.weight] as [Lane, number]).filter(([l]) => count(l) < max);
    const pool = lanes.length ? lanes : ([[defs[0].id, 1]] as [Lane, number][]);
    const total = pool.reduce((a, [, w]) => a + w, 0);
    let r = Math.random() * total, lane: Lane = pool[0][0];
    for (const [l, w] of pool) { if ((r -= w) <= 0) { lane = l; break; } }
    this.assigned.set(bot.id, lane);
    return lane;
  }

  release(bot: Entity) { this.assigned.delete(bot.id); }

  /** Match baru: lupakan laporan & callout lama. */
  reset() { this.reports.clear(); this.calls.length = 0; this.lastCall.clear(); }

  /** Waktu terakhir musuh terlihat oleh bot tim ini (−99 bila belum). */
  lastSeen(enemyId: number) { return this.reports.get(enemyId)?.t ?? -99; }

  report(enemy: Entity, t: number) {
    const r = this.reports.get(enemy.id);
    if (r) { r.pos.copy(enemy.pos); r.t = t; } else this.reports.set(enemy.id, { pos: enemy.pos.clone(), t });
  }

  /** Ada laporan musuh ≤ range u dari (x, z) dalam `hold` s terakhir? (zona kontak: bot berhenti sprint) */
  reportNear(x: number, z: number, range: number, now: number, hold: number): boolean {
    for (const r of this.reports.values()) if (now - r.t < hold && Math.hypot(r.pos.x - x, r.pos.z - z) < range) return true;
    return false;
  }

  /** Callout: bot yang melihat musuh melapor ke rekan; sampai setelah `delay` s (manusia butuh waktu bicara/mendengar),
   *  posisi ± noise, maksimal satu laporan per musuh tiap `throttle` s. */
  callout(spotter: Entity, enemy: Entity, now: number, delay: number) {
    const C = XCFG.bots.human.callout;
    if (now - (this.lastCall.get(enemy.id) ?? -99) < C.throttle) return;
    this.lastCall.set(enemy.id, now);
    const n = C.noise;
    this.calls.push({ x: enemy.pos.x + (Math.random() * 2 - 1) * n, y: enemy.pos.y, z: enemy.pos.z + (Math.random() * 2 - 1) * n,
      due: now + delay, spotter: spotter.id });
  }

  /** Antarkan callout yang jatuh tempo: rekan bot terdekat yang sedang bebas (maks `responders` sesuai kesulitan) menuju lokasi —
   *  responden kedua ke node lain di sekitarnya (tidak menumpuk); rekan lain dalam jangkauan hanya menoleh & waspada. */
  deliver(now: number, entities: readonly Entity[], nav: NavGraph) {
    const C = XCFG.bots.human.callout;
    for (let k = this.calls.length - 1; k >= 0; k--) {
      const c = this.calls[k];
      if (c.due > now) continue;
      this.calls.splice(k, 1);
      const dist = (o: Entity) => Math.hypot(o.pos.x - c.x, o.pos.z - c.z);
      const mates = entities.filter(o => o.bot && o.alive && o.team === this.team && o.id !== c.spotter && dist(o) <= C.range)
        .sort((a, b) => dist(a) - dist(b));
      let responders = 0, first = -1;
      for (const m of mates) {
        const bot = m.bot!;
        let node = -1;
        if (responders < bot.hum.responders && bot.canRespond()) {
          node = responders === 0 ? nav.nearest(c.x, c.y, c.z) : altNode(nav, c, first, m.pos);
          if (responders === 0) first = node;
          responders++;
        }
        bot.onCallout(c.x, c.y, c.z, node);
      }
    }
  }
}
