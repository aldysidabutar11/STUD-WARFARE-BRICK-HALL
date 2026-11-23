// src/game/TeamManager.ts — damage, kill, skor tim & individu (GDD §3.8, §12)
import * as THREE from 'three';
import { CFG } from '../config/gameConfig';
import { XCFG } from '../config/extraConfig';
import { bus, type HitPart, type KillWeapon } from '../core/EventBus';
import { ctx } from './ctx';
import type { Entity } from '../entities/Entity';
import type { Team } from '../entities/BlockyCharacter';

const _imp = new THREE.Vector3();

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
    if (attacker && attacker !== victim) attacker.stats.damage += before - victim.hp;
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
    victim.respawnT = CFG.player.respawnDelay;
    victim.grenadeState = 'NONE';
    ctx.deathFx.spawn(victim, impulse);
    victim.char.setVisible(false);
    victim.ctrl.setEnabled(false);
    const scored = !!attacker && attacker !== victim && attacker.team !== victim.team;
    if (scored && attacker) {
      attacker.stats.kills++;
      attacker.stats.score += XCFG.scoring.kill + (headshot ? XCFG.scoring.headshotBonus : 0);
      if (headshot) attacker.stats.hsKills++;
      this.scores[attacker.team]++;
    }
    // bunuh diri / jatuh: tercatat sebagai kematian tanpa poin
    bus.emit('death', { entityId: victim.id, impulse, grenade });
    bus.emit('kill', { killerId: scored && attacker ? attacker.id : victim.id, victimId: victim.id, weaponId: weapon, headshot });
  }

  teamOf(e: Entity) { return ctx.entities.filter(o => o.team === e.team); }
}
