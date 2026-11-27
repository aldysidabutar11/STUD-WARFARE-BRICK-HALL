// src/world/maps/registry.ts — daftar map + map aktif. Semua modul game membaca data map lewat `currentMap()` (bukan mengimpor
// data Brick Hall langsung). Ganti map: Game.loadMap(id) → bongkar map lama → setCurrentMap(id) → bangun map baru.
import { MAP_IDS, type MapDef, type MapId } from './types';
import { BRICKHALL } from './brickhall';
import { STEELYARD } from './steelyard/index';
import { BOSTON } from './boston/index';
import { MERIDIAN } from './meridian/index';
import { currentMap, setActiveMap } from './current';

export { currentMap };
export type { MapDef, MapId };

export const MAPS: Readonly<Record<MapId, MapDef>> = { brickhall: BRICKHALL, steelyard: STEELYARD, boston: BOSTON, meridian: MERIDIAN };

/** Map bawaan (setelan baru / nilai tidak dikenal). */
export const DEFAULT_MAP: MapId = 'brickhall';

export const isMapId = (v: unknown): v is MapId => typeof v === 'string' && (MAP_IDS as readonly string[]).includes(v);

/** Jadikan map `id` aktif (hanya data — membangun mesh/collider dilakukan Game.loadMap). */
export function setCurrentMap(id: MapId): MapDef {
  const def = MAPS[id];
  if (!def) throw new Error(`[maps] map tidak dikenal: ${String(id)}`);
  setActiveMap(def);
  return def;
}

/** Ringkasan untuk menu / room (urutan tampil = MAP_IDS). */
export interface MapInfo { id: MapId; name: string; desc: string }
export function mapInfo(): MapInfo[] { return MAP_IDS.map(id => ({ id, name: MAPS[id].name, desc: MAPS[id].desc })); }

setActiveMap(MAPS[DEFAULT_MAP]);
