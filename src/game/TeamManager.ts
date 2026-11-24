// src/game/TeamManager.ts — damage, kill, skor tim & individu (GDD §3.8, §12)
// + assist, kredit kill untuk korban yang jatuh/bunuh diri setelah ditembak, streak (pasca-MVP).
import * as THREE from 'three';
import { CFG } from '../config/gameConfig';
import { XCFG } from '../config/extraConfig';
import { bus, type HitPart, type KillWeapon } from '../core/EventBus';
import { ctx } from './ctx';
import type { Entity } from '../entities/Entity';
import type { Team } from '../entities/BlockyCharacter';

const _imp = new THREE.Vector3();
const XA = XCFG.announce;

export class TeamManager {
  scores: Record<Team, number> = { blue: 0, red: 0 };

  reset() { this.scores.blue = 0; this.scores.red = 0; }

  /** dir = arah datang (peluru) atau dorongan ledakan; grenadeImpulse diisi untuk kematian akibat granat. */
  applyDamage(victim: Entity, attacker: Entity | null, dmg: number, part: HitPart, weapon: KillWeapon,
    dir: THREE.Vector3, grenade: boolean, grenadeImpulse?: THREE.Vector3) {
    if (!victim.alive || dmg <= 0) return;
    if (victim.protectT > 0) return;                                        // perlindungan spawn: kebal
    if (victim.isPlayer && ctx.debug.god) return;
    if (attacker && attacker !== victim && attacker.team === victim.team && !CFG.combat.friendlyFire) return;
    const before = victim.hp;
    victim.hp = Math.max(0, victim.hp - dmg);
    victim.lastDamageT = ctx.time;
    if (attacker) victim.lastAttacker = attacker.id;
    if (attacker && attacker !== victim) {
      attacker.stats.damage += before - victim.hp;
      if (attacker.team !== victim.team) {
        const rec = victim.dmgBy.get(attacker.id);
        if (rec) { rec.dmg += before - victim.hp; rec.t = ctx.time; } else victim.dmgBy.set(attacker.id, { dmg: before - victim.hp, t: ctx.time });
      }
    }
    const from = attacker ?? victim;
    bus.emit('hit', { attackerId: attacker ? attacker.id : -1, victimId: victim.id, part, damage: dmg, headshot: part === 'head',
      dist: attacker ? attacker.pos.distanceTo(victim.pos) : 0, fromX: from.pos.x, fromZ: from.pos.z });
    if (victim.hp <= 0) {
      if (grenade && grenadeImpulse) _imp.copy(grenadeImpulse);
      else _imp.copy(dir).multiplyScalar(XCFG.death.bulletImpulse);
      this.kill(victim, attacker, weapon, part === 'head' && !grenade, _imp, grenade);
    }
  }

  kill(victim: Entity, attacker: Entity | null, weapon: KillWeapon, headshot: boolean, impulse: THREE.Vector3, grenade: boolean) {
    victim.alive = false; victim.hp = 0;
    victim.stats.deaths++;
    victim.respawnT = ctx.match.mode === 'practice' && !victim.isPlayer ? XCFG.practice.dummyRespawn : CFG.player.respawnDelay;
    victim.grenadeState = 'NONE';
    victim.meleeT = -1;
    victim.streak = 0;
    ctx.deathFx.spawn(victim, impulse);
    victim.char.setVisible(false);
    victim.ctrl.setEnabled(false);
    // jatuh / granat sendiri setelah ditembak musuh (≤ 5 s): kill dikreditkan ke penyerang musuh terakhir
    let killer = attacker;
    if (!killer || killer === victim) {
      let best: Entity | null = null, bestT = -Infinity;
      for (const [id, r] of victim.dmgBy) {
        const a = ctx.byId.get(id);
        if (a && a.team !== victim.team && ctx.time - r.t <= XA.killCreditWindow && r.t > bestT) { best = a; bestT = r.t; }
      }
      if (best) killer = best;
    }
    const scored = !!killer && killer !== victim && killer.team !== victim.team;
    if (scored && killer) {
      killer.stats.kills++;
      killer.stats.score += XCFG.scoring.kill + (headshot ? XCFG.scoring.headshotBonus : 0);
      if (headshot) killer.stats.hsKills++;
      killer.streak++;
      killer.stats.bestStreak = Math.max(killer.stats.bestStreak, killer.streak);
      if (ctx.match.mode !== 'elim') this.scores[killer.team]++;   // Eliminasi: skor tim = ronde yang dimenangkan
    }
    // bunuh diri / jatuh tanpa penyerang: tercatat sebagai kematian tanpa poin
    bus.emit('death', { entityId: victim.id, impulse, grenade });
    bus.emit('kill', { killerId: scored && killer ? killer.id : victim.id, victimId: victim.id, weaponId: weapon, headshot });
    // assist: musuh lain yang memberi damage ≤ 10 s terakhir
    for (const [id, r] of victim.dmgBy) {
      if (scored && killer && id === killer.id) continue;
      const a = ctx.byId.get(id);
      if (!a || a.team === victim.team || ctx.time - r.t > XA.assistWindow) continue;
      a.stats.assists++;
      a.stats.score += XA.assistScore;
      bus.emit('assist', { entityId: a.id, victimId: victim.id });
    }
    victim.dmgBy.clear();
  }

  teamOf(e: Entity) { return ctx.entities.filter(o => o.team === e.team); }
}
