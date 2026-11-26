// src/game/Lobby.ts — room / lobby untuk main bareng teman (permintaan pengguna): kode room, 2 tim × 5 slot, slot kosong diisi bot,
// pindah tim, status siap, setelan host (mode, aturan, kesulitan bot, isi bot), acak tim, roster match. Logika MURNI (tanpa DOM/jaringan):
// tahap 1 berjalan lokal (kamu + bot / teman simulasi); nanti server online cukup menyinkronkan objek ini (aksi yang sama, divalidasi server).
// + multi-map: pilihan map room (host) / setelan solo — map tertentu atau 'random' (diundi saat match dimulai, host mengirim id konkret).
import { cleanVariant, type Variant } from '../entities/variants';
import { CFG } from '../config/gameConfig';
import { XCFG } from '../config/extraConfig';
import type { Difficulty } from '../config/extraConfig';
import type { Team } from '../entities/BlockyCharacter';
import { MAP_IDS, type MapId } from '../world/maps/types';

const LB = XCFG.lobby;
export type RoomMode = 'tdm' | 'elim';

// ───────────────────────────── pilihan map (murni — tanpa mengimpor registry yang ikut memuat builder map)
/** Pilihan map: map tertentu atau 'random' ("Acak": diundi setiap match dimulai; Main Lagi / Ulangi memakai map yang sama). */
export type MapChoice = MapId | 'random';
/** Map bawaan bila data tidak dikenal (= registry.DEFAULT_MAP). */
export const BASE_MAP: MapId = 'brickhall';
/** Id map yang dikenal build ini (data jaringan / localStorage divalidasi dengan ini). */
export const isKnownMap = (v: unknown): v is MapId => typeof v === 'string' && (MAP_IDS as readonly string[]).includes(v);
export const isMapChoice = (v: unknown): v is MapChoice => v === 'random' || isKnownMap(v);
/** Pilihan → map konkret: 'random' diundi seragam dari semua map (rng ∈ [0, 1)); map tertentu → dirinya. */
export function pickMap(choice: MapChoice, rng: () => number): MapId {
  if (choice !== 'random') return choice;
  return MAP_IDS[Math.min(MAP_IDS.length - 1, Math.max(0, Math.floor(rng() * MAP_IDS.length)))];
}

export interface LobbyPlayer {
  readonly id: string;
  name: string;
  team: Team;
  ready: boolean;
  host: boolean;
  /** Pemain di perangkat ini. */
  local: boolean;
  /** Teman simulasi (pratinjau tanpa server) — di match dimainkan bot dengan namanya. */
  sim: boolean;
  /** Tampilan & senjata pilihan pemain (dikirim saat masuk room online; dipakai saat match dimulai). */
  variant?: Variant; weapon?: string; scope?: string; pistol?: string; pscope?: string; melee?: string;
}

export interface RoomSettings {
  mode: RoomMode; scoreLimit: number; timeLimit: number; roundsToWin: number; difficulty: Difficulty;
  /** Slot kosong diisi bot (default: ya → selalu 5 lawan 5). */
  fillBots: boolean;
  /** Map match (dipilih host; 'random' diundi host saat Mulai lalu id konkret dikirim di pesan 'start'). */
  map: MapChoice;
  /** Chat & voice ke SEMUA (kedua tim) saat match berjalan (bawaan: ya). Di room & layar hasil selalu boleh; tim selalu boleh. */
  allTalk: boolean;
}

const isInt = (v: unknown, lo: number, hi: number) => typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi;
/** Nilai sah per kunci setelan room (patch host & data jaringan). Batas angka longgar (sama dengan net/start.parseStart). */
const ROOM_CHECK: { readonly [K in keyof RoomSettings]: (v: unknown) => boolean } = {
  mode: v => v === 'tdm' || v === 'elim',
  scoreLimit: v => isInt(v, 1, 999), timeLimit: v => isInt(v, 1, 120), roundsToWin: v => isInt(v, 1, 15),
  difficulty: v => v === 'easy' || v === 'normal' || v === 'hard',
  fillBots: v => typeof v === 'boolean',
  map: isMapChoice,
  allTalk: v => typeof v === 'boolean',
};
const ROOM_DEFAULTS: RoomSettings = { mode: 'tdm', scoreLimit: CFG.match.scoreLimit, timeLimit: CFG.match.timeLimit / 60,
  roundsToWin: XCFG.elim.roundsToWin, difficulty: 'normal', fillBots: true, map: BASE_MAP, allTalk: true };

/** Patch setelan sah: setiap kunci dikenal & nilainya sah (satu nilai tak dikenal → seluruh patch ditolak). */
export function validRoomPatch(patch: unknown): patch is Partial<RoomSettings> {
  if (!patch || typeof patch !== 'object') return false;
  return Object.entries(patch).every(([k, v]) => Object.prototype.hasOwnProperty.call(ROOM_CHECK, k) && ROOM_CHECK[k as keyof RoomSettings](v));
}

/** Setelan room dari jaringan (host → klien): nilai tidak sah / hilang → bawaan (map tak dikenal → Brick Hall). */
export function cleanRoomSettings(raw: unknown): RoomSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>, out = { ...ROOM_DEFAULTS } as Record<string, unknown>;
  for (const k of Object.keys(ROOM_CHECK) as (keyof RoomSettings)[]) if (ROOM_CHECK[k](r[k])) out[k] = r[k];
  return out as unknown as RoomSettings;
}

/** Satu baris slot tim untuk tampilan: pemain, bot pengisi, atau kosong. */
export interface SlotView { team: Team; index: number; player: LobbyPlayer | null; bot: string | null }

export interface RosterEntry {
  name: string; kind: 'you' | 'friend' | 'bot';
  /** id pemain room (manusia) — online: pemetaan peer → entitas. */
  pid?: string;
  /** Teman simulasi (tanpa server): dimainkan bot. */
  sim?: boolean;
  variant?: Variant; weapon?: string; scope?: string; pistol?: string; pscope?: string; melee?: string;
}
/** Susunan match dari room: tim pemain lokal + isi tiap tim berurutan slot. */
export interface MatchRoster { playerTeam: Team; blue: RosterEntry[]; red: RosterEntry[] }

export type StartCheck = { ok: true } | { ok: false; reason: string };

const TEAMS: Team[] = ['blue', 'red'];
const other = (t: Team): Team => (t === 'blue' ? 'red' : 'blue');

/** Kode room acak (alfabet tanpa huruf/angka yang mirip). */
export function makeRoomCode(rng: () => number): string {
  let s = '';
  for (let i = 0; i < LB.codeLen; i++) s += LB.codeAlphabet[Math.floor(rng() * LB.codeAlphabet.length) % LB.codeAlphabet.length];
  return s;
}
/** Tampilan kode: "K7R-B2X". */
export const formatRoomCode = (c: string) => c.slice(0, 3) + '-' + c.slice(3);
/** Normalisasi masukan pengguna ("k7r b2x", "K7R-B2X", link …?room=K7RB2X) → kode, atau null bila tidak valid. */
export function parseRoomCode(input: string): string | null {
  const m = /[?&]room=([^&#]+)/i.exec(input);
  const raw = (m ? decodeURIComponent(m[1]) : input).toUpperCase().replace(/[\s-]/g, '');
  if (raw.length !== LB.codeLen) return null;
  for (const ch of raw) if (!LB.codeAlphabet.includes(ch)) return null;
  return raw;
}
/** Nama pemain aman (dipakai di innerHTML HUD/lobby): huruf, angka, spasi, _ . - ; maks nameMax; spasi dirapikan. */
export function cleanName(input: string): string {
  return input.replace(/[^\p{L}\p{N} _.\-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, LB.nameMax).trim();
}

export class Lobby {
  readonly players: LobbyPlayer[] = [];
  private nextId = 1;

  constructor(readonly code: string, readonly settings: RoomSettings) {}

  get host(): LobbyPlayer | undefined { return this.players.find(p => p.host); }
  get full() { return this.players.length >= LB.teamSize * 2; }
  humans(team: Team) { return this.players.filter(p => p.team === team); }
  find(id: string) { return this.players.find(p => p.id === id); }

  /** Pemain masuk: pemain pertama = host; tim = yang manusianya lebih sedikit (Biru bila sama). null bila room penuh. */
  join(name: string, opts: { local?: boolean; sim?: boolean } = {}): LobbyPlayer | null {
    if (this.full) return null;
    const team: Team = this.humans('red').length < this.humans('blue').length ? 'red' : 'blue';
    const host = this.players.length === 0;
    const p: LobbyPlayer = { id: 'p' + this.nextId++, name: cleanName(name) || 'Pemain', team, ready: host, host, local: !!opts.local, sim: !!opts.sim };
    this.players.push(p);
    return p;
  }

  /** Pemain keluar; slotnya kembali diisi bot. Host keluar → host pindah ke pemain berikutnya (urutan masuk). */
  leave(id: string) {
    const i = this.players.findIndex(p => p.id === id);
    if (i < 0) return;
    const [p] = this.players.splice(i, 1);
    if (p.host && this.players.length) { this.players[0].host = true; this.players[0].ready = true; }
  }

  /** Host mengeluarkan pemain lain. */
  kick(byId: string, id: string): boolean {
    if (!this.find(byId)?.host || byId === id) return false;
    this.leave(id);
    return true;
  }

  /** Pindah tim bila tim tujuan masih ada slot manusia. Status siap direset (kecuali host). */
  switchTeam(id: string, team: Team): boolean {
    const p = this.find(id);
    if (!p || p.team === team || this.humans(team).length >= LB.teamSize) return false;
    p.team = team;
    if (!p.host) p.ready = false;
    return true;
  }

  setReady(id: string, ready: boolean) { const p = this.find(id); if (p && !p.host) p.ready = ready; }

  /** Setelah match: semua selain host perlu menekan Siap lagi. */
  resetReady() { for (const p of this.players) p.ready = p.host; }

  /** Ubah aturan — hanya host; patch berisi kunci/nilai tak dikenal (mis. map yang tidak ada) ditolak utuh. */
  setSettings(byId: string, patch: Partial<RoomSettings>): boolean {
    if (!this.find(byId)?.host || !validRoomPatch(patch)) return false;
    Object.assign(this.settings, patch);
    return true;
  }

  /** Host mengacak & menyeimbangkan tim manusia (selisih maks 1). rng → urutan acak. */
  shuffle(byId: string, rng: () => number): boolean {
    if (!this.find(byId)?.host) return false;
    const order = this.players.map(p => ({ p, k: rng() })).sort((a, b) => a.k - b.k).map(x => x.p);
    const first: Team = rng() < 0.5 ? 'blue' : 'red';
    order.forEach((p, i) => { const t = i % 2 === 0 ? first : other(first); if (p.team !== t) { p.team = t; if (!p.host) p.ready = false; } });
    return true;
  }

  /** 5 slot satu tim: manusia (urut masuk) lalu bot pengisi (nama tetap per posisi slot) atau kosong. */
  slots(team: Team): SlotView[] {
    const hs = this.humans(team), names = XCFG.bots.names, off = team === 'blue' ? 0 : LB.teamSize;
    const out: SlotView[] = [];
    for (let i = 0; i < LB.teamSize; i++) {
      const p = hs[i] ?? null;
      out.push({ team, index: i, player: p, bot: !p && this.settings.fillBots ? names[(off + i) % names.length] : null });
    }
    return out;
  }

  /** Jumlah anggota tim di match (manusia + bot pengisi). */
  size(team: Team) { return this.slots(team).filter(s => s.player || s.bot).length; }

  /** Syarat Mulai: oleh host, semua pemain lain siap, tiap tim minimal 1 anggota. */
  canStart(byId: string): StartCheck {
    if (!this.find(byId)?.host) return { ok: false, reason: 'Hanya host yang bisa memulai' };
    const waiting = this.players.filter(p => !p.ready).length;
    if (waiting) return { ok: false, reason: `Menunggu ${waiting} pemain siap` };
    for (const t of TEAMS) if (this.size(t) === 0) return { ok: false, reason: `Tim ${t === 'blue' ? 'Biru' : 'Merah'} kosong — nyalakan "Isi bot" atau tunggu teman` };
    return { ok: true };
  }

  /** Susunan match untuk pemain lokal `meId`: slot berurutan per tim (kamu / teman / bot). */
  roster(meId: string): MatchRoster {
    const me = this.find(meId);
    const team = (t: Team): RosterEntry[] => this.slots(t).filter(s => s.player || s.bot).map(s => {
      const p = s.player;
      return p ? { name: p.name, kind: p.id === meId ? 'you' : 'friend', pid: p.id, sim: p.sim, variant: p.variant, weapon: p.weapon, scope: p.scope,
        pistol: p.pistol, pscope: p.pscope, melee: p.melee }
        : { name: s.bot!, kind: 'bot' };
    });
    return { playerTeam: me?.team ?? 'blue', blue: team('blue'), red: team('red') };
  }

  /** Data polos untuk dikirim lewat jaringan (host → klien). */
  toState(): LobbyState {
    return { code: this.code, settings: { ...this.settings }, nextId: this.nextId,
      players: this.players.map(p => ({ ...p, local: false })) };
  }

  /** Cermin room di klien dari data host; local = pemain dengan id meId. Data jaringan divalidasi: kode room, setelan
   *  (map tak dikenal → Brick Hall, lihat cleanRoomSettings), pemain (id "p<n>" unik, nama dibersihkan, tim biru/merah). */
  static fromState(s: LobbyState, meId: string): Lobby {
    const str = (v: unknown) => (typeof v === 'string' ? v.slice(0, 24) : undefined);
    const st = (s && typeof s === 'object' ? s : {}) as Partial<LobbyState>;
    const L = new Lobby(parseRoomCode(String(st.code ?? '')) ?? '', cleanRoomSettings(st.settings));
    L.nextId = isInt(st.nextId, 1, 1e6) ? st.nextId! : 1;
    for (const p of (Array.isArray(st.players) ? st.players : []) as Partial<LobbyPlayer>[]) {
      if (!p || typeof p !== 'object' || typeof p.id !== 'string' || !/^p\d{1,6}$/.test(p.id) || L.find(p.id)) continue;
      L.players.push({ id: p.id, name: cleanName(String(p.name ?? '')) || 'Pemain', team: p.team === 'red' ? 'red' : 'blue',
        ready: !!p.ready, host: !!p.host, local: p.id === meId, sim: !!p.sim, variant: cleanVariant(p.variant),
        weapon: str(p.weapon), scope: str(p.scope), pistol: str(p.pistol), pscope: str(p.pscope), melee: str(p.melee) });
    }
    return L;
  }
}

export interface LobbyState { code: string; settings: RoomSettings; nextId: number; players: LobbyPlayer[] }
