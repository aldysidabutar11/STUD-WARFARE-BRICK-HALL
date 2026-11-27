// src/net/Migration.ts — pindah host otomatis / serah-terima (permintaan pengguna 2026-11-25: "kalau host tiba-tiba keluar, langsung
// otomatis pindah host ke yang lain"). MURNI (tanpa ctx/DOM) → tests/migration.test.ts:
//  • Plan   — rencana pengganti yang terus disiarkan host: kode room BARU (dipakai host berikutnya; kode lama tidak dipakai ulang agar
//             host lama yang ternyata masih hidup tidak bentrok) + urutan pengganti (teman tersambung, ping terbaik dulu).
//  • MatchSave — cadangan lengkap pertandingan (host → semua teman tiap saveEvery s; juga saat serah-terima & ke teman yang
//             bergabung ulang): keadaan match + tiap entitas (posisi, HP, amunisi, granat, statistik).
//  • migrationTimes — kapan tiap peserta mengambil alih: semua mencoba host lama dulu (rejoinWait, kecuali serah-terima), lalu
//             pengganti ke-k menunggu host baru k × migrateStep detik; tak ada yang menjawab → dia sendiri yang jadi host.
import { parseBombNet, type BombNet } from '../combat/C4Bomb';
import { cleanVariant, type Variant } from '../entities/variants';
import { XCFG } from '../config/extraConfig';
import { CFG } from '../config/gameConfig';
import { parseRoomCode } from '../game/Lobby';
import type { MatchStateName } from '../core/EventBus';
import { MATCH_STATES } from './protocol';

export interface Plan { code: string; order: string[] }

/** Urutan pengganti: teman tersambung, ping terkecil dulu (belum terukur paling belakang), seri → urutan masuk room. */
export function makePlan(code: string, pids: readonly string[], pings: Readonly<Record<string, number>>, lobbyOrder: readonly string[]): Plan {
  const ping = (p: string) => { const v = pings[p]; return typeof v === 'number' && v >= 0 ? v : 1e6; };
  const idx = (p: string) => { const i = lobbyOrder.indexOf(p); return i < 0 ? 1e6 : i; };
  return { code, order: [...new Set(pids)].sort((a, b) => ping(a) - ping(b) || idx(a) - idx(b)) };
}

const PID = /^p\d{1,6}$/;
export function parsePlan(raw: unknown): Plan | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>, code = parseRoomCode(String(r.code ?? ''));
  if (!code || !Array.isArray(r.order)) return null;
  const order = [...new Set(r.order.filter((p): p is string => typeof p === 'string' && PID.test(p)))].slice(0, 2 * XCFG.lobby.teamSize);
  return { code, order };
}

/** Waktu (detik sejak host hilang) peserta `me` mengambil alih: rank 0 = pengganti utama. Bukan anggota rencana → tidak pernah.
 *  giveUpAt = batas menyerah: migrateMax, tapi tiap anggota rencana tetap kebagian gilirannya (+ satu jendela gabung). */
export function migrationTimes(plan: Plan, me: string, handover: boolean): { rank: number; promoteAt: number; giveUpAt: number } {
  const N = XCFG.net, rank = plan.order.indexOf(me);
  const promoteAt = rank < 0 ? Infinity : (handover ? 0 : N.rejoinWait) + rank * N.migrateStep;
  return { rank, promoteAt, giveUpAt: Math.max(N.migrateMax, Number.isFinite(promoteAt) ? promoteAt + N.joinTry : 0) };
}

// ───────────────────────────── cadangan pertandingan
export const SAVE_V = 1;
export type Win = 'blue' | 'red' | 'draw';
export interface SaveEnt {
  id: number; alive: boolean; hp: number; respawnT: number; protectT: number;
  x: number; y: number; z: number; yaw: number; pitch: number;
  weapon: string; scope: string; ammo: number; reserve: number; modeIdx: number; grenades: number;
  /** kills, deaths, assists, score, shots, hits, hsHits, hsKills, damage, bestStreak (+ plants, defuses — Bomb Mission; cadangan lama 10) */
  stats: number[]; streak: number; variant: Variant;
  /** Flashbang tersisa (tidak ada di cadangan host versi lama → 1). */
  flashes: number;
  /** Pistol (slot 2) + optiknya, isi, cadangan, mode tembak (cadangan host versi lama: tidak ada → pistol bawaan, penuh = −1). */
  pistol: string; pscope: string; ammo2: number; reserve2: number; mode2: number;
  /** Senjata jarak dekat (cadangan lama: tidak ada → pisau). */
  melee: string;
}
export interface MatchSave {
  v: number; state: MatchStateName; round: number; timeLeft: number; countdown: number;
  sb: number; sr: number; winner: Win; roundWinner: Win | null; ents: SaveEnt[];
  /** Panel kaca destruktibel yang sudah pecah (indeks MapDef.breakables; Boston). */
  glass?: number[];
  /** Detik match sudah dimainkan (state PLAYING, semua ronde) — durasi kiriman hasil ke leaderboard tetap benar setelah pindah host. */
  played?: number;
  /** Bomb Mission: keadaan C4 + giliran pembawa [id entitas, berapa kali membawa]. */
  bomb?: BombNet;
  carried?: [number, number][];
}

const fin = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const isWin = (v: unknown): v is Win => v === 'blue' || v === 'red' || v === 'draw';
/** Keadaan match yang bisa dilanjutkan (bukan menu/loadout). */
const LIVE_STATES = new Set<string>(['COUNTDOWN', 'PLAYING', 'ROUND_END', 'ENDED', 'RESULTS']);

/** Cadangan dari jaringan → divalidasi & dibatasi (data dari teman tidak dipercaya mentah-mentah). null bila rusak. */
export function parseSave(raw: unknown): MatchSave | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (r.v !== SAVE_V || typeof r.state !== 'string' || !(MATCH_STATES as readonly string[]).includes(r.state) || !LIVE_STATES.has(r.state)) return null;
  if (!fin(r.round) || !fin(r.timeLeft) || !fin(r.countdown) || !fin(r.sb) || !fin(r.sr) || !Array.isArray(r.ents)) return null;
  const ents: SaveEnt[] = [], ids = new Set<number>(), maxHp = CFG.player.hp;
  for (const x of r.ents.slice(0, 2 * XCFG.lobby.teamSize)) {
    if (!x || typeof x !== 'object') return null;
    const e = x as Record<string, unknown>;
    if (!fin(e.id) || !Number.isInteger(e.id) || e.id < 1 || e.id > 255 || ids.has(e.id)) return null;
    const nums = ['hp', 'respawnT', 'protectT', 'x', 'y', 'z', 'yaw', 'pitch', 'ammo', 'reserve', 'modeIdx', 'grenades', 'streak'] as const;
    if (!nums.every(k => fin(e[k]))) return null;
    if (!Array.isArray(e.stats) || (e.stats.length !== 10 && e.stats.length !== 12) || !e.stats.every(fin)) return null;
    ids.add(e.id);
    const n = (k: typeof nums[number]) => e[k] as number;
    ents.push({ id: e.id, alive: !!e.alive, hp: clamp(Math.round(n('hp')), 0, maxHp), respawnT: clamp(n('respawnT'), 0, 30),
      protectT: clamp(n('protectT'), 0, 10), x: clamp(n('x'), -500, 500), y: clamp(n('y'), -100, 200), z: clamp(n('z'), -500, 500),
      yaw: n('yaw'), pitch: clamp(n('pitch'), -1.6, 1.6), weapon: String(e.weapon ?? ''), scope: String(e.scope ?? ''),
      ammo: clamp(Math.round(n('ammo')), 0, 200), reserve: clamp(Math.round(n('reserve')), 0, 2000), modeIdx: clamp(Math.round(n('modeIdx')), 0, 4),
      grenades: clamp(Math.round(n('grenades')), 0, 9), stats: (e.stats as number[]).map(s => clamp(Math.round(s), 0, 1e7)),
      flashes: fin(e.flashes) ? clamp(Math.round(e.flashes), 0, 9) : 1,
      pistol: String(e.pistol ?? '').slice(0, 24), pscope: String(e.pscope ?? '').slice(0, 24),
      ammo2: fin(e.ammo2) ? clamp(Math.round(e.ammo2), 0, 200) : -1, reserve2: fin(e.reserve2) ? clamp(Math.round(e.reserve2), 0, 2000) : -1,
      mode2: fin(e.mode2) ? clamp(Math.round(e.mode2), 0, 4) : 0, melee: String(e.melee ?? '').slice(0, 24),
      streak: clamp(Math.round(n('streak')), 0, 999), variant: cleanVariant(e.variant) });
  }
  return { v: SAVE_V, state: r.state as MatchStateName, round: clamp(Math.round(r.round), 0, 99), timeLeft: clamp(r.timeLeft, 0, 7200),
    countdown: clamp(r.countdown, 0, 10), sb: clamp(Math.round(r.sb), 0, 999), sr: clamp(Math.round(r.sr), 0, 999),
    winner: isWin(r.winner) ? r.winner : 'draw', roundWinner: isWin(r.roundWinner) ? r.roundWinner : null, ents,
    ...(Array.isArray(r.glass) ? { glass: [...new Set(r.glass.filter((i): i is number => Number.isInteger(i) && (i as number) >= 0 && (i as number) < 32))].slice(0, 32) } : {}),
    ...(fin(r.played) ? { played: clamp(r.played, 0, 7200) } : {}),
    ...(parseBombNet(r.bomb) ? { bomb: parseBombNet(r.bomb)! } : {}),
    ...(Array.isArray(r.carried) ? { carried: (r.carried as unknown[]).filter((q): q is [number, number] => Array.isArray(q) && q.length === 2
      && Number.isInteger(q[0]) && Number.isInteger(q[1])).slice(0, 20).map(([a, b]) => [clamp(a, 0, 999), clamp(b, 0, 99)] as [number, number]) } : {}) };
}
