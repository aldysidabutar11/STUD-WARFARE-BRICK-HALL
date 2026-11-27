// src/game/BombRules.ts — aturan MURNI mode Bomb Mission (diuji Vitest, tanpa three.js/DOM): matriks menang ronde, damage ledakan
// C4, tempo beep, pembagian penyerang per ronde & tukar sisi, deteksi zona bom, giliran pembawa C4, syarat menjinakkan.
import { BOMB_CFG } from '../config/bombConfig';

const B = BOMB_CFG;
export type TeamColor = 'blue' | 'red';
export type BombRole = 'att' | 'def';
/** Alasan ronde selesai (banner & statistik). */
export type RoundReason = 'elim' | 'detonated' | 'defused' | 'time';
export interface BombSiteDef { id: 'A' | 'B'; min: readonly [number, number, number]; max: readonly [number, number, number];
  botPlant: readonly [number, number, number] }

export interface RoundInput {
  attAlive: number; defAlive: number;
  planted: boolean; detonated: boolean; defused: boolean;
  /** Waktu ronde habis (sebelum C4 ditanam). */
  timeUp: boolean;
}
export interface RoundResult { winner: BombRole; reason: RoundReason }

/**
 * Matriks menang ronde (dokumen §6.2 + keputusan pengguna 2026-11-27): meledak → penyerang; dijinakkan → bertahan; kedua tim habis
 * bersamaan → sebelum tanam bertahan, sesudah tanam penyerang; bertahan habis → penyerang (walau belum tanam); penyerang habis
 * sebelum tanam → bertahan, sesudah tanam → ronde berlanjut (wajib dijinakkan); waktu habis sebelum tanam → bertahan (sedang
 * menanam saat 0:00 tetap kalah). null = ronde berlanjut.
 */
export function bombRoundResult(i: RoundInput): RoundResult | null {
  if (i.detonated) return { winner: 'att', reason: 'detonated' };
  if (i.defused) return { winner: 'def', reason: 'defused' };
  if (i.attAlive <= 0 && i.defAlive <= 0) return i.planted ? { winner: 'att', reason: 'elim' } : { winner: 'def', reason: 'elim' };
  if (i.defAlive <= 0) return { winner: 'att', reason: 'elim' };
  if (i.attAlive <= 0 && !i.planted) return { winner: 'def', reason: 'elim' };
  if (i.timeUp && !i.planted) return { winner: 'def', reason: 'time' };
  return null;
}

/** Damage ledakan C4: round(250 × max(0, 1 − (r / 32)²) × okklusi) — pola K-400 berskala besar (penuh ≥ 100 sampai 24.8 u). */
export function c4Damage(r: number, occlusion: number): number {
  const c = B.c4, k = Math.max(0, 1 - (r / c.blastRadius) ** 2);
  return Math.round(c.blastMaxDamage * k * Math.max(0, Math.min(1, occlusion)));
}

/** Interval beep C4 menurut sisa sumbu (makin rapat mendekati ledakan). */
export function beepInterval(left: number): number {
  for (const s of B.c4.beepIntervals) if (left > s.aboveSec) return s.interval;
  return B.c4.beepIntervals[B.c4.beepIntervals.length - 1].interval;
}

/** Tim penyerang pada ronde ke-n (1…): babak 1 = firstAttackers, setelah tukar sisi = lawannya. */
export function attackersOf(round: number): TeamColor {
  const first = B.firstAttackers, other: TeamColor = first === 'red' ? 'blue' : 'red';
  return round <= B.match.halfTimeRound ? first : other;
}
export const roleOf = (team: TeamColor, round: number): BombRole => (attackersOf(round) === team ? 'att' : 'def');

/** Tukar sisi tepat setelah ronde ke-halfTimeRound selesai. */
export const shouldSwapSides = (completedRounds: number) => completedRounds === B.match.halfTimeRound;

/** Zona bom yang memuat titik (kaki) — null bila di luar semua zona. Batas inklusif. */
export function siteAt(x: number, y: number, z: number, sites: readonly BombSiteDef[]): 'A' | 'B' | null {
  for (const s of sites) {
    if (x >= s.min[0] && x <= s.max[0] && y >= s.min[1] - 0.05 && y <= s.max[1] && z >= s.min[2] && z <= s.max[2]) return s.id;
  }
  return null;
}

/** Pembawa C4 bergilir adil: penyerang yang paling jarang membawa (seri → acak). −1 bila tidak ada penyerang. */
export function pickCarrier(ids: readonly number[], carried: ReadonlyMap<number, number>, rnd: () => number): number {
  if (!ids.length) return -1;
  let min = Infinity;
  for (const id of ids) min = Math.min(min, carried.get(id) ?? 0);
  const pool = ids.filter(id => (carried.get(id) ?? 0) === min);
  return pool[Math.min(pool.length - 1, Math.floor(rnd() * pool.length))];
}

/** Syarat menjinakkan secara geometri: ≤ defuseRadius dari C4 (datar) & menghadap C4 ≤ defuseMaxAngleDeg (arah yaw saja; konvensi
 *  game: maju = (−sin yaw, −cos yaw)). Pemain tepat di atas C4 (< 0.4 u) selalu boleh. */
export function canDefuseFrom(px: number, pz: number, yaw: number, bx: number, bz: number): boolean {
  const dx = bx - px, dz = bz - pz, d = Math.hypot(dx, dz);
  if (d > B.c4.defuseRadius) return false;
  if (d < 0.4) return true;
  const cos = (-Math.sin(yaw) * dx - Math.cos(yaw) * dz) / d;
  return cos >= Math.cos(B.c4.defuseMaxAngleDeg * Math.PI / 180);
}
