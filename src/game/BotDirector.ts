// src/game/BotDirector.ts — pembagian jalur & memori tim ringan (GDD §11.1, §11.7)
import * as THREE from 'three';
import { XCFG } from '../config/extraConfig';
import type { Team } from '../entities/BlockyCharacter';
import type { Entity } from '../entities/Entity';

export type Lane = 'bridge' | 'west' | 'east' | 'floor' | 'archive';

/** Rute jalur sebagai daftar template node ({H} = sisi sendiri, {E} = sisi lawan, {X} = W/E). */
export function laneRoute(lane: Lane, own: 'S' | 'N'): string[] {
  const E = own === 'S' ? 'N' : 'S', X = Math.random() < 0.5 ? 'W' : 'E';
  const r = (s: string) => s.replace(/\{H\}/g, own).replace(/\{E\}/g, E).replace(/\{X\}/g, X);
  switch (lane) {
    case 'bridge': return ['{H}_BRMOUTH_{X}', '{H}_BR1_{X}', '{H}_ROT_{X}', 'C_ROT_{X}', '{E}_ROT_{X}', '{E}_BR1_{X}', '{E}_BRMOUTH_{X}'].map(r);
    case 'west': case 'east': {
      const side = lane === 'west' ? 'W' : 'E';
      const inner = Math.random() < 0.5;
      const walk = inner ? 'HALL' : 'WALK';
      return [`${own}_CORNER_${side}`, `${own}_${walk}_${side}`, `C_${walk}_${side}`, `${E}_${walk}_${side}`, inner ? `${E}_INNER_${side}` : `${E}_CORNER_${side}`];
    }
    case 'floor': return ['{H}_LAND_{X}', '{H}_F_STAIR_{X}', '{H}_F_MID_{X}', 'C_F_TABLE_{X}', '{E}_F_MID_{X}', '{E}_F_STAIR_{X}', '{E}_LAND_{X}'].map(r);
    // v2: jalur apit beratap lewat arsip (lantai 1, di bawah balkon), keluar lewat pintu aula di sisi lawan
    case 'archive': return ['{H}_ARC2_{X}', '{H}_ARC4_{X}', 'C_ARC_{X}', '{E}_ARC5_{X}', '{E}_ARCDOOR_{X}', '{E}_F_ARCDOOR_{X}', '{E}_F_MID_{X}'].map(r);
  }
}

export class BotDirector {
  private assigned = new Map<number, Lane>();
  /** Memori tim: posisi musuh yang dilaporkan (id → posisi + waktu). */
  readonly reports = new Map<number, { pos: THREE.Vector3; t: number }>();

  constructor(readonly team: Team) {}

  /** Bobot jalur di XCFG.bots.lanes (v2 + ARSIP); maksimal 2 bot per jalur per tim. */
  assign(bot: Entity): Lane {
    this.assigned.delete(bot.id);
    const W = XCFG.bots.lanes, max = XCFG.bots.lanePerTeamMax;
    const count = (l: Lane) => [...this.assigned.values()].filter(x => x === l).length;
    const lanes: [Lane, number][] = ([['bridge', W.bridge], ['west', W.west], ['east', W.east], ['floor', W.floor], ['archive', W.archive]] as [Lane, number][])
      .filter(([l]) => count(l) < max);
    const pool = lanes.length ? lanes : ([['bridge', 1]] as [Lane, number][]);
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
