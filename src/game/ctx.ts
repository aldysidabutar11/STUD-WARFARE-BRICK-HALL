// src/game/ctx.ts — konteks global runtime (diisi saat boot) agar modul tidak saling bergantung saat import.
import type { Engine } from '../core/Engine';
import type { Input } from '../core/Input';
import type { Props } from '../world/Props';
import type { NavGraph } from '../world/NavGraph';
import type { BuiltMap } from '../world/BrickHallBuilder';
import type { CameraRig } from '../entities/CameraRig';
import type { Viewmodel } from '../entities/Viewmodel';
import type { Entity } from '../entities/Entity';
import type { Vfx } from '../vfx/Vfx';
import type { Hud } from '../ui/Hud';
import type { SpatialSynthAudio } from '../audio/SpatialSynthAudio';
import type { GrenadeManager } from '../combat/GrenadeK400';
import type { DeathFx } from '../vfx/DeathFx';
import type { TeamManager } from './TeamManager';
import type { MatchManager } from './MatchManager';
import type { SpawnSystem } from './SpawnSystem';
import type { BotDirector } from './BotDirector';
import type { Settings } from '../ui/Settings';
import type { ScopeSystem } from '../combat/ScopeSystem';

export interface DebugFlags {
  god: boolean; noclip: boolean; showNav: boolean; botLabels: boolean; dmgNumbers: boolean; colliders: boolean; slowmo: boolean;
}

export interface Ctx {
  engine: Engine; input: Input; props: Props; nav: NavGraph; map: BuiltMap;
  camRig: CameraRig; viewmodel: Viewmodel; scope: ScopeSystem;
  entities: Entity[]; byId: Map<number, Entity>; player: Entity | null;
  teams: TeamManager; match: MatchManager; spawns: SpawnSystem; directors: Record<'blue' | 'red', BotDirector>;
  vfx: Vfx; hud: Hud; audio: SpatialSynthAudio; grenades: GrenadeManager; deathFx: DeathFx;
  settings: Settings;
  time: number;          // waktu game (detik, ikut timeScale)
  fixedIndex: number;    // indeks fixed step
  debug: DebugFlags;
}

export const ctx = { time: 0, fixedIndex: 0, player: null } as unknown as Ctx;
