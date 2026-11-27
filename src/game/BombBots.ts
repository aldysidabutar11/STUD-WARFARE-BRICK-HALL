// src/game/BombBots.ts — otak tim bot Bomb Mission (dokumen pengguna §7.1; host/offline, 4 Hz). Rencana ronde dipilih saat ronde
// berganti: penyerang 40% eksekusi A, 40% eksekusi B, 20% split (pembawa → titik tanam zona target, sisanya mengawal; 1 penyusup ke
// zona lain bila ≥ 3 penyerang — split: bergantian kawal/susup); bertahan formasi 2 A + 2 B + 1 Mid. Menurut keadaan C4:
//   DIBAWA   → pembawa menuju titik tanam & menahan "pakai" setibanya (gerak terkunci 4 s); rekan ke node jaga zona target.
//   JATUH    → bot penyerang terdekat memungut (titik akhir didatangi lurus); lainnya tetap.
//   TERTANAM → penyerang menjaga sekitar C4; bertahan merebut zona, bot bertahan terdekat menjinakkan (menghadap C4, tahan 5 s).
// Bot yang melihat musuh tetap bertarung dulu (TacticalBot: ENGAGE membatalkan tanam/jinak) — sesuai syarat dokumen "tanpa musuh
// terlihat". Tujuan disampaikan lewat TacticalBot.setObjective; tanpa tujuan bot kembali ke jalur lane biasa.
import * as THREE from 'three';
import { ctx } from './ctx';
import { currentMap } from '../world/maps/current';
import type { BotObjective } from '../entities/TacticalBot';
import type { Entity } from '../entities/Entity';
import type { BombSiteDef } from './BombRules';

type Role = 'carrier' | 'escort' | 'lurk' | 'holdA' | 'holdB' | 'holdMid';
const UPDATE_EVERY = 0.25;
/** Node jaga zona: dalam radius ini (XZ) dari pusat zona. */
const HOLD_RADIUS = 20;   // node jaga ≤ 20 u dari pusat zona (Meridian Vault denah x2: zona 16 × 16)

export class BombBots {
  private round = -1;
  private site: 'A' | 'B' = 'A';
  private split = false;
  private readonly roles = new Map<number, Role>();
  private readonly holds = new Map<string, number[]>();
  private t = 0;

  /** Match / map baru. */
  reset() { this.round = -1; this.roles.clear(); this.holds.clear(); this.t = 0; }

  update(dt: number) {
    if (ctx.match.mode !== 'bomb' || ctx.net.role === 'client') return;
    this.t -= dt;
    if (this.t > 0) return;
    this.t = UPDATE_EVERY;
    const sites = currentMap().bombSites;
    if (!sites?.length) return;
    if (ctx.match.round !== this.round) this.plan();
    for (const e of ctx.entities) if (e.bot) e.bot.setObjective(e.alive ? this.objectiveFor(e, sites) : null);
  }

  /** Rencana ronde: target zona penyerang & peran tiap bot. */
  private plan() {
    this.round = ctx.match.round;
    this.holds.clear();
    const r = Math.random();
    this.split = r >= 0.8;
    this.site = r < 0.4 ? 'A' : r < 0.8 ? 'B' : Math.random() < 0.5 ? 'A' : 'B';
    this.roles.clear();
    const att = ctx.bomb.attackers;
    const attackers = ctx.entities.filter(e => e.team === att).sort((a, b) => a.id - b.id);
    const defenders = ctx.entities.filter(e => e.team !== att).sort((a, b) => a.id - b.id);
    let lurkers = 0, k = 0;
    for (const e of attackers) {
      if (e.id === ctx.bomb.carrier) { this.roles.set(e.id, 'carrier'); continue; }
      if (this.split) this.roles.set(e.id, k++ % 2 === 0 ? 'lurk' : 'escort');
      else if (lurkers === 0 && attackers.length >= 3) { this.roles.set(e.id, 'lurk'); lurkers++; } else this.roles.set(e.id, 'escort');
    }
    const order: Role[] = ['holdA', 'holdB', 'holdA', 'holdB', 'holdMid'];
    defenders.forEach((e, i) => this.roles.set(e.id, order[i % order.length]));
  }

  private objectiveFor(e: Entity, sites: readonly BombSiteDef[]): BotObjective | null {
    const b = ctx.bomb, att = e.team === b.attackers;
    const role = this.roles.get(e.id) ?? (att ? 'escort' : 'holdMid');
    const site = (id: 'A' | 'B') => sites.find(s => s.id === id) ?? sites[0];
    const other: 'A' | 'B' = this.site === 'A' ? 'B' : 'A';
    switch (b.state) {
      case 'carried':
        if (att) {
          if (b.carrier === e.id) { const s = site(this.site); return this.point(`plant${s.id}`, s.botPlant[0], s.botPlant[1], s.botPlant[2], true, false); }
          return this.hold(e, sites, role === 'lurk' ? other : this.site, 'atk');
        }
        return this.defend(e, sites, role);
      case 'dropped':
        if (att) {
          if (this.nearestBot(b.attackers, true) === e) return this.point('pickup', b.pos.x, b.pos.y, b.pos.z, false, false);
          return this.hold(e, sites, role === 'lurk' ? other : this.site, 'atk');
        }
        return this.defend(e, sites, role);
      case 'planted': {
        const s = b.site ?? this.site;
        if (att) return this.hold(e, sites, s, 'post');
        if (this.nearestBot(b.attackers, false) === e) return this.point('defuse', b.pos.x, b.pos.y, b.pos.z, true, true);
        return this.hold(e, sites, s, 'retake');
      }
      default: return null;
    }
  }

  /** Bot hidup terdekat ke C4 dari tim penyerang (att = true) atau bertahan. */
  private nearestBot(attackers: 'blue' | 'red', att: boolean): Entity | null {
    const b = ctx.bomb;
    let best: Entity | null = null, bd = Infinity;
    for (const e of ctx.entities) {
      if (!e.bot || !e.alive || (e.team === attackers) !== att) continue;
      const d = Math.hypot(e.pos.x - b.pos.x, e.pos.y - b.pos.y, e.pos.z - b.pos.z);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  /** Tujuan titik: node nav terdekat lalu titik itu didatangi lurus; use = tahan "pakai" setibanya; look = menghadap titik. */
  private point(key: string, x: number, y: number, z: number, use: boolean, look: boolean): BotObjective {
    const p = new THREE.Vector3(x, y, z);
    return { key, node: ctx.nav.nearest(x, y, z), point: p, use, look: look ? p.clone().setY(y + 0.3) : null };
  }

  private defend(e: Entity, sites: readonly BombSiteDef[], role: Role): BotObjective {
    if (role === 'holdA') return this.hold(e, sites, 'A', 'def');
    if (role === 'holdB') return this.hold(e, sites, 'B', 'def');
    const a = sites[0], b = sites[sites.length - 1];
    const n = ctx.nav.nearest((a.botPlant[0] + b.botPlant[0]) / 2, 0, (a.botPlant[2] + b.botPlant[2]) / 2);
    return { key: `mid${n}`, node: n, point: null, use: false, look: null };
  }

  /** Node jaga di sekitar zona (node cover lebih dulu, lalu terdekat ke pusat zona); tiap bot mendapat node berbeda (per id). */
  private hold(e: Entity, sites: readonly BombSiteDef[], id: 'A' | 'B', tag: string): BotObjective {
    let list = this.holds.get(id);
    if (!list) {
      const s = sites.find(q => q.id === id) ?? sites[0];
      const cx = (s.min[0] + s.max[0]) / 2, cz = (s.min[2] + s.max[2]) / 2;
      const nodes = ctx.nav.nodes.map((n, i) => ({ n, i, d: Math.hypot(n.x - cx, n.z - cz) })).filter(q => q.d <= HOLD_RADIUS);
      nodes.sort((p, q) => (p.n.cover === q.n.cover ? p.d - q.d : p.n.cover ? -1 : 1));
      list = nodes.length ? nodes.map(q => q.i) : [ctx.nav.nearest(cx, s.min[1], cz)];
      this.holds.set(id, list);
    }
    const node = list[e.id % list.length];
    return { key: `${tag}${id}${node}`, node, point: null, use: false, look: null };
  }
}
