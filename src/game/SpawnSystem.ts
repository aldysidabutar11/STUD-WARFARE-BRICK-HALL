// src/game/SpawnSystem.ts — pemilihan slot spawn, respawn 4 s, perlindungan 2 s (GDD §3.8, §12)
import * as THREE from 'three';
import { CFG } from '../config/gameConfig';
import { XCFG } from '../config/extraConfig';
import type { SpawnFloor } from '../world/MapData';
import { currentMap } from '../world/maps/registry';
import { physics } from '../physics/Physics';
import { bus } from '../core/EventBus';
import { ctx } from './ctx';
import type { Entity } from '../entities/Entity';

const _eye = new THREE.Vector3();
const FLOORS: SpawnFloor[] = ['upper', 'ground'];

export class SpawnSystem {
  /** Kelompok slot spawn untuk tim (bawaan = warnanya). Mode Bomb Mission menukar kelompok setelah tukar sisi (penyerang selalu di
   *  kelompok slot penyerang map). Hanya host/offline yang memilih slot (klien menerima posisi & arah dari host). */
  groupOf: (team: 'blue' | 'red') => 'blue' | 'red' = t => t;

  /**
   * v2 (permintaan pengguna): lantai spawn (Brick Hall: 1 = ruang spawn bawah, 2 = ruang spawn atas) dipilih ACAK tiap respawn.
   * Di lantai itu: lewati slot terisi (karakter dalam 1.6 u), pilih slot dengan jarak minimum terbesar ke musuh ber-LOS
   * (§12). Bila semua slot lantai itu terisi (atau map tidak punya lantai itu, mis. Steel Yard tanpa 'upper') → lantai lainnya.
   * Mengembalikan indeks global = indeks di [...upper, ...ground] (Brick Hall: 0–4 atas, 5–9 bawah).
   */
  pickSlot(e: Entity): number {
    const slots = currentMap().spawnSlots[this.groupOf(e.team)], off = [0, slots.upper.length];
    const first = Math.random() < 0.5 ? 0 : 1;
    for (const f of [first, 1 - first]) {
      const i = this.bestOn(e, slots[FLOORS[f]]);
      if (i >= 0) return off[f] + i;
    }
    const f = slots[FLOORS[first]].length ? first : 1 - first;
    return off[f] + Math.floor(Math.random() * slots[FLOORS[f]].length);
  }

  /** Posisi slot dari indeks global. */
  slotPos(e: Entity, gi: number): [number, number, number] {
    const slots = currentMap().spawnSlots[this.groupOf(e.team)], nu = slots.upper.length;
    return gi < nu ? slots.upper[gi] : slots.ground[gi - nu];
  }

  private bestOn(e: Entity, slots: [number, number, number][]): number {
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
    return best;
  }

  spawn(e: Entity) {
    const i = e.dummyAt ? 0 : this.pickSlot(e);
    const [x, y, z] = e.dummyAt ? [e.dummyAt.x, e.dummyAt.y, e.dummyAt.z] : this.slotPos(e, i);
    const g = this.groupOf(e.team), yaw = currentMap().spawnYaw?.[g] ?? (g === 'blue' ? Math.PI : 0);
    this.applySpawn(e, x, y, z, e.dummyAt ? (e.team === 'blue' ? Math.PI : 0) : yaw, i);
  }

  /** Hidupkan entitas di titik tertentu (host memilih slot; klien online menerapkan spawn dari host). */
  applySpawn(e: Entity, x: number, y: number, z: number, yaw: number, slot = 0) {
    if (e.pendingLoadout) { e.applyLoadout(e.pendingLoadout); e.pendingLoadout = null; }
    e.ctrl.setEnabled(true);
    e.ctrl.teleport(x, y + 0.05, z);
    e.yaw = yaw; e.pitch = 0;
    e.hp = CFG.player.hp; e.alive = true; e.respawnT = 0;
    e.protectT = CFG.player.spawnProtection;
    e.char.protectT = e.protectT;
    e.grenades = CFG.grenade.perLife; e.grenadeState = 'NONE'; e.cookT = 0; e.throwAnimT = -1;
    e.flashes = XCFG.flash.perLife; e.nadeKind = 'frag'; e.blindX = null; e.flashedBy = 0; e.flashS = 0;
    e.meleeT = -1; e.meleeCd = 0; e.meleeKind = 'butt'; e.streak = 0; e.dmgBy.clear();
    e.weapon.refill();
    e.recoil.reset();
    e.char.setVisible(true);
    e.renderPos.set(x, y, z);
    e.char.root.position.set(x, y, z); e.char.root.rotation.y = e.yaw;
    if (e.isPlayer) { ctx.camRig.yaw = e.yaw; ctx.camRig.pitch = 0; }
    e.bot?.onSpawn();
    e.adsWanted = false;
    bus.emit('spawn', { entityId: e.id, slot });
  }

  /** Pulihkan entitas HIDUP di posisinya (pertandingan dilanjutkan setelah pindah host / bergabung ulang) — bukan spawn: tanpa
   *  isi ulang amunisi, tanpa perlindungan spawn, tanpa event 'spawn' (HP/amunisi diisi pemanggil dari cadangan). */
  restore(e: Entity, x: number, y: number, z: number, yaw: number) {
    e.ctrl.setEnabled(true);
    e.ctrl.teleport(x, y + 0.05, z);
    e.yaw = yaw; e.alive = true; e.respawnT = 0;
    e.grenadeState = 'NONE'; e.cookT = 0; e.throwAnimT = -1; e.meleeT = -1; e.meleeCd = 0;
    e.nadeKind = 'frag'; e.blindX = null; e.flashedBy = 0; e.flashS = 0;
    e.recoil.reset();
    e.char.setVisible(true);
    e.renderPos.set(x, y, z);
    e.char.root.position.set(x, y, z); e.char.root.rotation.y = yaw;
    if (e.isPlayer) { ctx.camRig.yaw = yaw; ctx.camRig.pitch = 0; }
    e.bot?.onSpawn();
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
