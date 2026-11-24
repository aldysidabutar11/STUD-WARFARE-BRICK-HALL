// src/core/EventBus.ts — event bus bertipe (GDD §2.6)
import type * as THREE from 'three';
import type { WeaponId } from '../config/weaponsData';

export type HitPart = 'head' | 'upper' | 'lower' | 'limb';
export type SurfaceMaterial = 'wood' | 'tile' | 'carpet';
export type MatchStateName = 'MENU' | 'LOADOUT' | 'COUNTDOWN' | 'PLAYING' | 'ROUND_END' | 'ENDED' | 'RESULTS';
export type KillWeapon = WeaponId | 'k400' | 'fall' | 'melee' | 'knife';
/** Jenis serangan jarak dekat: pukul popor (F) atau pisau (tebas/tusuk). */
export type MeleeKind = 'butt' | 'slash' | 'stab';

export interface GameEvents {
  /** end = titik kena (dunia/tubuh) atau ujung jangkauan — dipakai tracer killcam. */
  shot: { shooterId: number; weaponId: WeaponId; origin: THREE.Vector3; dir: THREE.Vector3; end: THREE.Vector3 };
  hit: { attackerId: number; victimId: number; part: HitPart; damage: number; headshot: boolean; dist: number;
    fromX: number; fromZ: number;
    /** Klien online: tembakan/pisau sendiri yang kena menurut prediksi lokal (host mengonfirmasi kemudian). */
    predicted?: boolean };
  kill: { killerId: number; victimId: number; weaponId: KillWeapon; headshot: boolean };
  assist: { entityId: number; victimId: number };
  death: { entityId: number; impulse: THREE.Vector3; grenade: boolean };
  spawn: { entityId: number; slot: number };
  melee: { entityId: number; phase: 'swing' | 'hit' | 'wall'; position: THREE.Vector3; kind: MeleeKind };
  'weapon:drop': { entityId: number; position: THREE.Vector3 };
  'weapon:pickup': { entityId: number; weaponId: WeaponId };
  'grenade:explode': { position: THREE.Vector3; ownerId: number };
  'grenade:bounce': { position: THREE.Vector3; speed: number; material: SurfaceMaterial };
  footstep: { entityId: number; material: SurfaceMaterial; position: THREE.Vector3; loud: boolean; land?: boolean };
  'match:state': { state: MatchStateName; scores: [number, number]; timeLeft: number };
  impact: { position: THREE.Vector3; normal: THREE.Vector3; material: SurfaceMaterial | 'book' | 'body' };
  reload: { entityId: number; stage: 0 | 1 | 2 };
  dryfire: { entityId: number };
  pin: { entityId: number };
}

type Handler<T> = (payload: T) => void;

export class EventBus {
  private handlers = new Map<keyof GameEvents, Handler<unknown>[]>();

  on<K extends keyof GameEvents>(type: K, fn: Handler<GameEvents[K]>): () => void {
    let list = this.handlers.get(type);
    if (!list) { list = []; this.handlers.set(type, list); }
    list.push(fn as Handler<unknown>);
    return () => this.off(type, fn);
  }

  off<K extends keyof GameEvents>(type: K, fn: Handler<GameEvents[K]>): void {
    const list = this.handlers.get(type);
    if (!list) return;
    const i = list.indexOf(fn as Handler<unknown>);
    if (i >= 0) list.splice(i, 1);
  }

  emit<K extends keyof GameEvents>(type: K, payload: GameEvents[K]): void {
    const list = this.handlers.get(type);
    if (!list) return;
    for (let i = 0; i < list.length; i++) list[i](payload);
  }
}

export const bus = new EventBus();
