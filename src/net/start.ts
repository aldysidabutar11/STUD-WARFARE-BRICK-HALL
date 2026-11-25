// src/net/start.ts — susunan match online yang dikirim host ke semua klien saat Mulai, + validasinya di klien
// (data dari jaringan: id unik & dalam batas, nama dibersihkan, loadout harus ada di daftar senjata/optik, map harus dikenal).
import { XCFG } from '../config/extraConfig';
import type { ScopeId, WeaponId } from '../config/weaponsData';
import type { Team } from '../entities/BlockyCharacter';
import type { Variant } from '../entities/CharacterArt';
import type { MatchOptions } from '../game/MatchManager';
import { BASE_MAP, cleanName, isKnownMap } from '../game/Lobby';
import type { MapId } from '../world/maps/types';
import { cleanLoadout } from './Session';
import { parseSave, type MatchSave } from './Migration';

/** Susunan match online (host → semua klien): id entitas per slot room, nama, pemilik (pid) / bot, tampilan & loadout. */
export interface NetEnt { id: number; team: Team; name: string; pid: string | null; bot: boolean; variant: Variant; weapon: WeaponId; scope: ScopeId }
export interface NetStart { seed: number; opts: MatchOptions; ents: NetEnt[];
  /** Map match ini — selalu id konkret ('Acak' sudah diundi host); host & klien memuat map ini sebelum membuat entitas. */
  map: MapId;
  /** Ada = pertandingan DILANJUTKAN dari cadangan (pindah host / bergabung ulang), bukan dimulai dari awal. */
  resume?: MatchSave }

/** Pesan 'start' dari host → divalidasi (id unik 1…255, nama bersih, loadout sah). null bila rusak.
 *  Map hilang (host versi lama = hanya Brick Hall) / tidak dikenal → Brick Hall (default aman: tidak pernah id sembarang ke registry). */
export function parseStart(m: Record<string, unknown>): NetStart | null {
  const o = m.opts as Record<string, unknown> | undefined, list = m.ents;
  if (!o || typeof o !== 'object' || !Array.isArray(list) || list.length < 1 || list.length > 2 * XCFG.lobby.teamSize) return null;
  const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  const lim = (v: unknown, d: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, num(v, d)));
  const ents: NetEnt[] = [], ids = new Set<number>();
  for (const r of list as Record<string, unknown>[]) {
    if (!r || typeof r !== 'object') return null;
    const id = num(r.id, -1);
    if (!Number.isInteger(id) || id < 1 || id > 255 || ids.has(id)) return null;
    ids.add(id);
    ents.push({ id, team: r.team === 'red' ? 'red' : 'blue', name: cleanName(String(r.name ?? '')) || 'Pemain',
      pid: typeof r.pid === 'string' ? r.pid : null, bot: !!r.bot, variant: r.variant === 'f' ? 'f' : 'm', ...cleanLoadout(r.weapon, r.scope) });
  }
  const opts: MatchOptions = { mode: o.mode === 'elim' ? 'elim' : 'tdm', scoreLimit: lim(o.scoreLimit, 50, 1, 999),
    timeLimit: lim(o.timeLimit, 600, 30, 7200), roundsToWin: lim(o.roundsToWin, 5, 1, 15) };
  const resume = m.resume === undefined || m.resume === null ? undefined : parseSave(m.resume) ?? undefined;
  return { seed: num(m.seed, 1) >>> 0, opts, ents, map: isKnownMap(m.map) ? m.map : BASE_MAP, ...(resume ? { resume } : {}) };
}
