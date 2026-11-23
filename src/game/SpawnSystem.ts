// src/game/SpawnSystem.ts — pemilihan slot spawn, respawn 4 s, perlindungan 2 s (GDD §3.8, §12)
import * as THREE from 'three';
import { CFG } from '../config/gameConfig';
import { XCFG } from '../config/extraConfig';
import { SPAWN_SLOTS } from '../world/MapData';
import { physics } from '../physics/Physics';
import { bus } from '../core/EventBus';
import { ctx } from './ctx';
import type { Entity } from '../entities/Entity';

const _eye = new THREE.Vector3();

export class SpawnSystem {
  /** Lewati slot terisi (karakter dalam 1.6 u); pilih slot dengan jarak minimum terbesar ke musuh yang punya LOS. */
  pickSlot(e: Entity): number {
    const slots = SPAWN_SLOTS[e.team];
    let best = -1, bestVal = -Infinity;
    const order = slots.map((_, i) => i).sort(() => Math.random() - 0.5); // seri diacak
    for (const i of order) {
      const [x, y, z] = slots[i];
      const occupied = ctx.entities.some(o => o !== e && o.alive && Math.hypot(o.pos.x - x, o.pos.z - z) < XCFG.spawn.occupiedRadius && Math.abs(o.pos.y - y) < 3);
      if (occupied) continue;
      let minD = 1e9;
      for (const o of ctx.entities) {
        if (!o.alive || o.team === e.team) continue;
        o.eye(_eye);
        if (physics.losBlocked(_eye.x, _eye.y, _eye.z, x, y + 3.2, z)) continue;
        minD = Math.min(minD, Math.hypot(_eye.x - x, _eye.y - y, _eye.z - z));
      }
      if (minD > bestVal) { bestVal = minD; best = i; }
    }
    return best >= 0 ? best : Math.floor(Math.random() * slots.length);
  }

  spawn(e: Entity) {
    const i = e.dummyAt ? 0 : this.pickSlot(e);
    const [x, y, z] = e.dummyAt ? [e.dummyAt.x, e.dummyAt.y, e.dummyAt.z] : SPAWN_SLOTS[e.team][i];
    if (e.pendingLoadout) { e.applyLoadout(e.pendingLoadout); e.pendingLoadout = null; }
    e.ctrl.setEnabled(true);
    e.ctrl.teleport(x, y + 0.05, z);
    e.yaw = e.team === 'blue' ? Math.PI : 0; e.pitch = 0;
    e.hp = CFG.player.hp; e.alive = true; e.respawnT = 0;
    e.protectT = CFG.player.spawnProtection;
    e.char.protectT = e.protectT;
    e.grenades = CFG.grenade.perLife; e.grenadeState = 'NONE'; e.cookT = 0; e.throwAnimT = -1;
    e.weapon.refill();
    e.recoil.reset();
    e.char.setVisible(true);
    e.renderPos.set(x, y, z);
    e.char.root.position.set(x, y, z); e.char.root.rotation.y = e.yaw;
    if (e.isPlayer) { ctx.camRig.yaw = e.yaw; ctx.camRig.pitch = 0; }
    e.bot?.onSpawn();
    bus.emit('spawn', { entityId: e.id, slot: i });
  }

  /** Jadwal respawn untuk entitas yang mati. */
  update(dt: number, allowRespawn: boolean) {
    for (const e of ctx.entities) {
      if (e.alive) {
        if (e.protectT > 0) { e.protectT = Math.max(0, e.protectT - dt); e.char.protectT = e.protectT; }
        continue;
      }
      if (e.respawnT > 0) e.respawnT -= dt;
      if (e.respawnT <= 0 && allowRespawn) this.spawn(e);
    }
  }
}
