// src/config/presets.ts — preset render (GDD §15 LOW/MEDIUM/HIGH + ULTRA pasca-MVP) & profil fitur grafik per preset.
import { CFG, type Preset, type PresetName } from './gameConfig';
import { XCFG } from './extraConfig';

export const PRESET_NAMES: readonly PresetName[] = ['LOW', 'MEDIUM', 'HIGH', 'ULTRA'];

export function presetOf(name: PresetName): Preset {
  return name === 'ULTRA' ? XCFG.gfx.ultra : CFG.render.presets[name];
}

export type GfxProfile = (typeof XCFG.gfx.profiles)[PresetName];
export const gfxOf = (name: PresetName): GfxProfile => XCFG.gfx.profiles[name];

/** HIGH ke atas: bayangan karakter, berkas cahaya, kualitas bayangan halus. */
export const isHigh = (name: PresetName) => name === 'HIGH' || name === 'ULTRA';
