// src/combat/Loadout.ts — loadout pemain: senjata utama + optik (slot 1) & pistol + optik (slot 2). Semua data luar (settings,
// room, pesan jaringan, cadangan pindah host) lewat cleanLoadout: id harus senjata kelas yang benar & optik yang diizinkan.
import { SCOPES, WEAPONS, fitScope, isPistolId, isPrimaryId, scopeAllowed, type ScopeId, type WeaponDef, type WeaponId } from '../config/weaponsData';
import { isMeleeId, type MeleeId } from '../config/weaponsExtra';

export interface Loadout { weapon: WeaponId; scope: ScopeId; pistol: WeaponId; pscope: ScopeId; melee: MeleeId }

export const DEFAULT_LOADOUT: Readonly<Loadout> = { weapon: 'm416', scope: 'reddot', pistol: 'deagle', pscope: 'iron', melee: 'knife' };

const isScopeId = (v: unknown): v is ScopeId => typeof v === 'string' && Object.prototype.hasOwnProperty.call(SCOPES, v);

/** Optik dari data luar: dipakai bila boleh; bila tidak → optik bawaan senjata → red dot → optik boleh terdekat. */
function cleanScope(w: WeaponDef, v: unknown, fallback: ScopeId): ScopeId {
  const s = isScopeId(v) ? v : fallback;
  if (scopeAllowed(w, s)) return s;
  if (w.defScope && scopeAllowed(w, w.defScope)) return w.defScope;
  return scopeAllowed(w, 'reddot') ? 'reddot' : fitScope(w, s);
}

/** Loadout dari data luar divalidasi (senjata utama / pistol / senjata jarak dekat harus ada & kelasnya benar, optik cocok). */
export function cleanLoadout(weapon: unknown, scope: unknown, pistol?: unknown, pscope?: unknown, melee?: unknown): Loadout {
  const w = isPrimaryId(weapon) ? weapon : DEFAULT_LOADOUT.weapon;
  const p = isPistolId(pistol) ? pistol : DEFAULT_LOADOUT.pistol;
  return { weapon: w, scope: cleanScope(WEAPONS[w], scope, DEFAULT_LOADOUT.scope), pistol: p, pscope: cleanScope(WEAPONS[p], pscope, DEFAULT_LOADOUT.pscope),
    melee: isMeleeId(melee) ? melee : DEFAULT_LOADOUT.melee };
}

/** Hanya field loadout (objek sumber bisa membawa field lain: settings, NetEnt). */
export const loadoutOf = (x: Loadout): Loadout => ({ weapon: x.weapon, scope: x.scope, pistol: x.pistol, pscope: x.pscope, melee: x.melee });

export const sameLoadout = (a: Loadout, b: Loadout) =>
  a.weapon === b.weapon && a.scope === b.scope && a.pistol === b.pistol && a.pscope === b.pscope && a.melee === b.melee;
