// src/game/VoiceRules.ts — aturan voice chat (permintaan pengguna 2026-11-25). MURNI → tests/voice.test.ts.
// Keputusan pengguna: T = ke tim, Z = ke semua (musuh yang dekat ikut dengar); di match KEDUANYA berdasarkan jarak karakter (dekat
// jelas → menjauh mengecil & teredam → hilang hanya di ujung-ke-ujung map); di room & layar hasil jelas penuh; pemain mati: T tetap
// terdengar jelas oleh tim (tanpa posisi), Z mati; host bisa mematikan "semua" selama match (allTalk). Host yang menegakkan aturan
// (paket diteruskan hanya ke penerima yang berhak).
import { XCFG } from '../config/extraConfig';
import type { Team } from '../entities/BlockyCharacter';

export type VoiceScope = 'team' | 'all';

export interface SendCtx {
  /** Match sedang berjalan (bukan room / layar hasil). */
  live: boolean;
  allTalk: boolean;
  senderTeam: Team | null; senderAlive: boolean;
  recipientTeam: Team | null;
}

/** Host meneruskan suara pembicara ke penerima ini? Tim → setim (juga saat mati); semua → semua orang, kecuali saat match
 *  berjalan bila host mematikan allTalk atau pembicara sudah mati. Tim tak diketahui → hanya "semua" di luar match. */
export function voiceSendsTo(scope: VoiceScope, c: SendCtx): boolean {
  if (!c.senderTeam || !c.recipientTeam) return scope === 'all' && !c.live;
  if (scope === 'team') return c.senderTeam === c.recipientTeam;
  return !c.live || (c.allTalk && c.senderAlive);
}

/** Pemain boleh bicara dengan cakupan ini sekarang? (umpan balik tombol Z) */
export function voiceScopeOk(scope: VoiceScope, live: boolean, allTalk: boolean, alive: boolean): boolean {
  return scope === 'team' || !live || (allTalk && alive);
}

/** Jangkauan suara map: jelas penuh sampai `near`, hilang di `far` = ujung ke ujung (diagonal batas × farFrac). */
export function voiceRange(b: { x: readonly [number, number]; z: readonly [number, number] }): { near: number; far: number } {
  const V = XCFG.voice, diag = Math.hypot(b.x[1] - b.x[0], b.z[1] - b.z[0]);
  return { near: V.near, far: Math.max(V.near + 1, diag * V.farFrac) };
}

/** Kurva jarak d → gain (1 sampai near, lalu (1 − x)^curve, 0 di far) & cutoff lowpass (turun eksponensial: jauh = teredam). */
export function proximity(d: number, near: number, far: number): { gain: number; cutoff: number } {
  const V = XCFG.voice, x = Math.min(1, Math.max(0, (d - near) / Math.max(1e-6, far - near)));
  return { gain: Math.pow(1 - x, V.curve), cutoff: V.cutoffNear * Math.pow(V.cutoffFar / V.cutoffNear, x) };
}

/** Nomor pid ('p12' → 12; 0 = tidak sah) — identitas pembicara di paket suara. */
export function pidNum(pid: string): number {
  const m = /^p(\d{1,5})$/.exec(pid);
  const n = m ? Number(m[1]) : 0;
  return n > 0 && n <= 0xffff ? n : 0;
}

/** Nomor urut 16-bit: a lebih baru dari b (jendela setengah putaran; paket terlambat / ganda dibuang). */
export function seqNewer(a: number, b: number): boolean {
  const d = (a - b) & 0xffff;
  return d !== 0 && d < 0x8000;
}
