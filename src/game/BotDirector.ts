// src/game/BotDirector.ts — pembagian jalur & memori tim ringan (GDD §11.1, §11.7)
import * as THREE from 'three';
import { XCFG } from '../config/extraConfig';
import type { Team } from '../entities/BlockyCharacter';
import type { Entity } from '../entities/Entity';
import { currentMap } from '../world/maps/registry';

/** Id jalur bot dari MapDef.lanes map aktif (Brick Hall: bridge/west/east/floor/archive). */
export type Lane = string;

/** Rute jalur sebagai daftar id node (sudah diekspansi untuk sisi `own`); id tak dikenal → jalur pertama map.
 *  x = posisi X bot (map dengan spawn di sudut memilih sisi W/E bot sendiri; Brick Hall mengabaikannya). */
export function laneRoute(lane: Lane, own: 'S' | 'N', x?: number): string[] {
  const lanes = currentMap().lanes;
  return (lanes.find(l => l.id === lane) ?? lanes[0]).route(own, x);
}

export class BotDirector {
  private assigned = new Map<number, Lane>();
  /** Memori tim: posisi musuh yang dilaporkan (id → posisi + waktu). */
  readonly reports = new Map<number, { pos: THREE.Vector3; t: number }>();

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

  /** Waktu terakhir musuh terlihat oleh bot tim ini (−99 bila belum). */
  lastSeen(enemyId: number) { return this.reports.get(enemyId)?.t ?? -99; }

  report(enemy: Entity, t: number) {
    const r = this.reports.get(enemy.id);
    if (r) { r.pos.copy(enemy.pos); r.t = t; } else this.reports.set(enemy.id, { pos: enemy.pos.clone(), t });
  }
}
