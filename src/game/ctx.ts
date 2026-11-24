// src/game/ctx.ts — konteks global runtime (diisi saat boot) agar modul tidak saling bergantung saat import.
import type { Engine } from '../core/Engine';
import type { Input } from '../core/Input';
import type { Props } from '../world/Props';
import type { NavGraph } from '../world/NavGraph';
import type { BuiltMap } from '../world/maps/types';
import type { CameraRig } from '../entities/CameraRig';
import type { Viewmodel } from '../entities/Viewmodel';
import type { Entity } from '../entities/Entity';
import type { Vfx } from '../vfx/Vfx';
import type { Hud } from '../ui/Hud';
import type { SpatialSynthAudio } from '../audio/SpatialSynthAudio';
import type { GrenadeManager } from '../combat/GrenadeK400';
import type { WeaponDrops } from '../combat/WeaponDrops';
import type { DeathFx } from '../vfx/DeathFx';
import type { TeamManager } from './TeamManager';
import type { MatchManager } from './MatchManager';
import type { SpawnSystem } from './SpawnSystem';
import type { BotDirector } from './BotDirector';
import type { Settings } from '../ui/Settings';
import type { ScopeSystem } from '../combat/ScopeSystem';
import type { Killcam } from './Killcam';

export interface DebugFlags {
  god: boolean; noclip: boolean; showNav: boolean; botLabels: boolean; dmgNumbers: boolean; colliders: boolean; slowmo: boolean;
}

/** Status multiplayer. offline = solo/latihan/room lokal; host = otoritatif (listen server); client = prediksi + snapshot. */
export interface NetCtx {
  role: 'offline' | 'host' | 'client';
  /** Seed match: spread tembakan identik di host & prediksi klien (indeks = tembakan ke-n per nyawa). */
  seed: number;
  /** Host: catat tembakan untuk efek visual di klien. */
  onShot: ((e: Entity, kind: number, end: { x: number; y: number; z: number }, normal: { x: number; y: number; z: number } | null,
    mat: number, victim: number, part: number) => void) | null;
  /** Host: rewind hitbox ke tick tampilan penembak remote (lag compensation); kembalikan false bila tidak dipakai. */
  rewind: ((shooter: Entity) => boolean) | null;
  restore: (() => void) | null;
  /** Klien: serangan sendiri kena musuh menurut prediksi lokal → umpan balik instan (damage tetap dari host). */
  predictHit: ((victim: Entity, attacker: Entity, dmg: number, part: import('../core/EventBus').HitPart) => void) | null;
}

export interface Ctx {
  engine: Engine; input: Input; props: Props; nav: NavGraph; map: BuiltMap;
  camRig: CameraRig; viewmodel: Viewmodel; scope: ScopeSystem;
  entities: Entity[]; byId: Map<number, Entity>; player: Entity | null;
  teams: TeamManager; match: MatchManager; spawns: SpawnSystem; directors: Record<'blue' | 'red', BotDirector>;
  vfx: Vfx; hud: Hud; audio: SpatialSynthAudio; grenades: GrenadeManager; deathFx: DeathFx; killcam: Killcam;
  /** Senjata utama yang dibuang (G) — hanya tim sendiri yang bisa mengambil. */
  drops: WeaponDrops;
  settings: Settings;
  time: number;          // waktu game (detik, ikut timeScale)
  fixedIndex: number;    // indeks fixed step
  debug: DebugFlags;
  net: NetCtx;
}

export const ctx = {
  time: 0, fixedIndex: 0, player: null,
  net: { role: 'offline', seed: 1, onShot: null, rewind: null, restore: null, predictHit: null },
} as unknown as Ctx;
