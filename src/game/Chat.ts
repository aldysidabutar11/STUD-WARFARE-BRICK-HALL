// src/game/Chat.ts — chat teks tim & semua (permintaan pengguna 2026-11-25: "chat team dan chat all team ... agar lebih enak dalam
// komunikasi antar player"; berlaku juga di lobby). MURNI (tanpa DOM/ctx) → tests/chat.test.ts:
//  • cleanChatText — teks dari pemain/jaringan dirapikan & dibatasi (aman untuk textContent; HTML tidak pernah ditafsirkan)
//  • RateLimit     — anti-spam token bucket (host menegakkan per pemain, klien memberi umpan balik cepat)
//  • chatAllowed   — chat "semua" saat match bisa dimatikan host (setelan room allTalk); di room/layar hasil selalu boleh
//  • parseChat     — pesan chat dari host divalidasi di klien
//  • BotChatGate / botCalloutText — callout bot tampil di chat tim tanpa membanjiri
//  • QUICK         — pesan cepat (H lalu 1–6) dengan nama area posisi pengirim
import { XCFG } from '../config/extraConfig';
import type { Team } from '../entities/BlockyCharacter';
import { cleanName } from './Lobby';

export type ChatScope = 'team' | 'all';

export interface ChatMsg {
  scope: ChatScope; name: string; team: Team; text: string;
  /** pid pemain (null = bot / main solo). */
  pid: string | null;
  bot: boolean; dead: boolean; quick: boolean;
}

/** Karakter kontrol, lebar-nol & pembalik arah teks (bisa dipakai mengacak tampilan) diganti spasi. */
const BAD: readonly [number, number][] = [[0x0, 0x1f], [0x7f, 0x9f], [0x200b, 0x200f], [0x2028, 0x202e], [0x2060, 0x2069], [0xfeff, 0xfeff]];
const isBad = (cp: number) => BAD.some(([a, b]) => cp >= a && cp <= b);

/** Teks chat: karakter berbahaya dibuang, spasi dirapikan, maks XCFG.chat.maxLen karakter (emoji tidak terpotong). '' = kosong. */
export function cleanChatText(raw: unknown): string {
  const s = Array.from(String(raw ?? ''), ch => (isBad(ch.codePointAt(0)!) ? ' ' : ch)).join('').replace(/\s+/g, ' ').trim();
  return Array.from(s).slice(0, XCFG.chat.maxLen).join('').trim();
}

/** Anti-spam token bucket: `burst` pesan beruntun lalu 1 pesan tiap `refill` detik. */
export class RateLimit {
  private tokens: number;
  private t = Number.NEGATIVE_INFINITY;
  constructor(private readonly burst = XCFG.chat.burst, private readonly refill = XCFG.chat.refill) { this.tokens = burst; }
  /** now dalam detik. true = boleh kirim (satu token dipakai). */
  take(now: number): boolean {
    if (Number.isFinite(this.t)) this.tokens = Math.min(this.burst, this.tokens + Math.max(0, now - this.t) / this.refill);
    this.t = now;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}

/** Chat "semua" saat match berjalan hanya bila host mengizinkan (allTalk); chat tim & di luar match selalu boleh. */
export function chatAllowed(scope: ChatScope, inLiveMatch: boolean, allTalk: boolean): boolean {
  return scope === 'team' || !inLiveMatch || allTalk;
}

/** Penerima pesan: semua (scope 'all') atau hanya setim pengirim. */
export function chatReaches(scope: ChatScope, senderTeam: Team, recipientTeam: Team): boolean {
  return scope === 'all' || senderTeam === recipientTeam;
}

const PID = /^p\d{1,6}$/;
/** Pesan chat dari host → divalidasi (nama & teks dibersihkan, cakupan/tim dikenal). null bila rusak/kosong. */
export function parseChat(m: Record<string, unknown>): ChatMsg | null {
  const scope: ChatScope | null = m.scope === 'all' ? 'all' : m.scope === 'team' ? 'team' : null;
  const text = cleanChatText(m.text), name = cleanName(String(m.name ?? ''));
  if (!scope || !text || !name) return null;
  return { scope, name, team: m.team === 'red' ? 'red' : 'blue', text, pid: typeof m.pid === 'string' && PID.test(m.pid) ? m.pid : null,
    bot: m.bot === true, dead: m.dead === true, quick: m.quick === true };
}

/** Callout bot di chat tim: maks 1 per tim tiap botGap s, area yang sama tidak diulang dalam botZoneGap s. */
export class BotChatGate {
  private lastTeam = new Map<Team, number>();
  private lastZone = new Map<string, number>();
  allow(team: Team, zone: string, now: number): boolean {
    const C = XCFG.chat, k = team + '|' + zone;
    if (now - (this.lastTeam.get(team) ?? -1e9) < C.botGap || now - (this.lastZone.get(k) ?? -1e9) < C.botZoneGap) return false;
    this.lastTeam.set(team, now); this.lastZone.set(k, now);
    return true;
  }
  reset() { this.lastTeam.clear(); this.lastZone.clear(); }
}

const BOT_LINES = ['Musuh di {z}!', 'Kontak — {z}!', 'Ada musuh di {z}', 'Lihat musuh di {z}!'];
/** Kalimat callout bot (variasi menurut seed). */
export function botCalloutText(zone: string, seed: number): string {
  return BOT_LINES[Math.abs(Math.trunc(seed)) % BOT_LINES.length].replace('{z}', zone || 'dekat sini');
}

/** Pesan cepat (H lalu 1–6; dikirim ke tim) — zona = nama area posisi pengirim ('' bila tidak dikenal). */
export const QUICK: readonly { label: string; text: (zone: string) => string }[] = [
  { label: 'Musuh di sini!', text: z => (z ? `Musuh di ${z}!` : 'Musuh di sini!') },
  { label: 'Butuh bantuan!', text: z => (z ? `Butuh bantuan di ${z}!` : 'Butuh bantuan!') },
  { label: 'Ikut aku!', text: () => 'Ikut aku!' },
  { label: 'Tahan posisi', text: () => 'Tahan posisi!' },
  { label: 'Aman di sini', text: z => (z ? `${z} aman` : 'Aman, tidak ada musuh') },
  { label: 'Oke / siap', text: () => 'Oke, siap!' },
];
