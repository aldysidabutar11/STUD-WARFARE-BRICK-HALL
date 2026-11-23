// src/ui/Settings.ts — pengaturan tersimpan (GDD §13.2): localStorage 'studwarfare.settings.v1', divalidasi ke rentang.
import type { PresetName } from '../config/gameConfig';
import type { Difficulty } from '../config/extraConfig';
import type { ScopeId, WeaponId } from '../config/weaponsData';
import { WEAPONS, SCOPE_ORDER, scopeAllowed } from '../config/weaponsData';

export interface Settings {
  sens: number; adsMult: number; fov: number; invertY: boolean;
  adsToggle: boolean; crouchToggle: boolean;
  preset: PresetName;
  volMaster: number; volSfx: number; volUi: number;
  showFps: boolean; difficulty: Difficulty; allies: number; enemies: number;
  fullPause: boolean;
  weapon: WeaponId; scope: ScopeId;
}

export const KEY = 'studwarfare.settings.v1';
export const DEFAULTS: Settings = {
  sens: 1.0, adsMult: 1.0, fov: 75, invertY: false, adsToggle: false, crouchToggle: true, preset: 'MEDIUM',
  volMaster: 80, volSfx: 100, volUi: 70, showFps: false, difficulty: 'normal', allies: 4, enemies: 5, fullPause: false,
  weapon: 'm416', scope: 'reddot',
};

const clamp = (v: unknown, a: number, b: number, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(b, Math.max(a, v)) : d);
const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);
const oneOf = <T extends string>(v: unknown, list: readonly T[], d: T): T => (list.includes(v as T) ? (v as T) : d);

export function validate(raw: Partial<Settings> | null): Settings {
  const r = raw ?? {};
  const D = DEFAULTS;
  const weapon = oneOf(r.weapon, Object.keys(WEAPONS) as WeaponId[], D.weapon);
  let scope = oneOf(r.scope, SCOPE_ORDER, D.scope);
  if (!scopeAllowed(WEAPONS[weapon], scope)) scope = 'reddot';
  return {
    sens: clamp(r.sens, 0.1, 5.0, D.sens), adsMult: clamp(r.adsMult, 0.5, 1.5, D.adsMult), fov: clamp(r.fov, 70, 90, D.fov),
    invertY: bool(r.invertY, D.invertY), adsToggle: bool(r.adsToggle, D.adsToggle), crouchToggle: bool(r.crouchToggle, D.crouchToggle),
    preset: oneOf(r.preset, ['LOW', 'MEDIUM', 'HIGH'] as const, D.preset),
    volMaster: clamp(r.volMaster, 0, 100, D.volMaster), volSfx: clamp(r.volSfx, 0, 100, D.volSfx), volUi: clamp(r.volUi, 0, 100, D.volUi),
    showFps: bool(r.showFps, D.showFps), difficulty: oneOf(r.difficulty, ['easy', 'normal', 'hard'] as const, D.difficulty),
    allies: Math.round(clamp(r.allies, 0, 4, D.allies)), enemies: Math.round(clamp(r.enemies, 1, 5, D.enemies)),
    fullPause: bool(r.fullPause, D.fullPause), weapon, scope,
  };
}

export function loadSettings(): Settings {
  try { return validate(JSON.parse(localStorage.getItem(KEY) ?? 'null')); } catch { return { ...DEFAULTS }; }
}

export function saveSettings(s: Settings) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage diblokir: tetap jalan dengan nilai di memori */ }
}
