// src/world/maps/current.ts — map AKTIF (modul daun tanpa impor runtime). Modul yang ikut terimpor oleh builder map (mis.
// physics/Physics.ts) membaca map aktif dari sini agar tidak terbentuk impor melingkar registry → builder → Physics → registry.
// Modul lain cukup memakai `currentMap()` dari registry.ts (re-ekspor fungsi yang sama). Registry memasang Brick Hall sebagai
// bawaan saat dimuat; Game.loadMap() menggantinya.
import type { MapDef } from './types';

let active: MapDef | null = null;

/** MapDef map yang sedang dimuat. */
export function currentMap(): MapDef {
  if (!active) throw new Error('[maps] belum ada map aktif — impor world/maps/registry (atau panggil setCurrentMap) dulu');
  return active;
}

/** Dipakai registry.setCurrentMap — jangan dipanggil langsung dari modul game. */
export function setActiveMap(def: MapDef) { active = def; }
