// src/game/Leaderboard.ts — aturan akun & leaderboard yang MURNI (tanpa DOM / Supabase; diuji tests/accounts.test.ts).
// Cermin aturan database supabase/accounts.sql: DATABASE tetap satu-satunya penegak (kunci publik ada di bundle game, jadi apa pun yang
// dicek di sini bisa dilewati orang iseng). Cermin ini hanya agar pemain jujur tidak pernah ditolak & pesan bisa dijelaskan lebih dulu.
import { MAP_IDS, type MapId } from '../world/maps/types';

// ───────────────────────── username
export const USERNAME_MIN = 3, USERNAME_MAX = 16;
const USERNAME_RE = /^[A-Za-z0-9_]{3,16}$/;
/** Nama terlarang (mirip staf / bot game) — SAMA dengan public.sw_reserved di accounts.sql (dicek test). */
export const RESERVED_NAMES: readonly string[] = ['admin', 'administrator', 'moderator', 'mod', 'support', 'system', 'root', 'owner',
  'developer', 'dev', 'staff', 'official', 'host', 'bot', 'pemain', 'guest', 'tamu', 'anon', 'anonymous', 'studwarfare', 'stud_warfare',
  'supabase', 'null', 'undefined', 'bata', 'paku', 'genteng', 'ubin', 'kapur', 'jati', 'mahoni', 'meranti', 'rotan', 'damar'];

export type NameProblem = 'empty' | 'short' | 'long' | 'chars' | 'noletter' | 'reserved';
export function usernameProblem(name: string): NameProblem | null {
  if (!name) return 'empty';
  if (name.length < USERNAME_MIN) return 'short';
  if (name.length > USERNAME_MAX) return 'long';
  if (!USERNAME_RE.test(name)) return 'chars';
  if (!/[A-Za-z]/.test(name)) return 'noletter';
  if (RESERVED_NAMES.includes(name.toLowerCase())) return 'reserved';
  return null;
}
export const NAME_PROBLEM_TEXT: Record<NameProblem, string> = {
  empty: 'Isi username dulu.',
  short: `Username minimal ${USERNAME_MIN} karakter.`,
  long: `Username maksimal ${USERNAME_MAX} karakter.`,
  chars: 'Username hanya boleh huruf, angka, dan garis bawah (_), tanpa spasi.',
  noletter: 'Username harus mengandung minimal 1 huruf.',
  reserved: 'Username itu tidak boleh dipakai (mirip nama staf / bot).',
};

// ───────────────────────── email & password (aturan server diatur pemilik di dashboard Supabase — lihat README)
export const PASSWORD_MIN = 8, PASSWORD_MAX = 72;   // 72 = batas bcrypt Supabase
export type PasswordProblem = 'short' | 'long' | 'weak';
export function passwordProblem(pw: string): PasswordProblem | null {
  if (pw.length < PASSWORD_MIN) return 'short';
  if (pw.length > PASSWORD_MAX) return 'long';
  if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) return 'weak';
  return null;
}
export const PASSWORD_PROBLEM_TEXT: Record<PasswordProblem, string> = {
  short: `Password minimal ${PASSWORD_MIN} karakter.`,
  long: `Password maksimal ${PASSWORD_MAX} karakter.`,
  weak: 'Password harus berisi huruf DAN angka.',
};
export const emailLooksValid = (e: string) => e.length <= 254 && /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]{2,}$/.test(e);

/** Email sendiri disamarkan untuk ditampilkan (layar bisa terlihat orang lain / siaran): "al***@g***.com". */
export function maskEmail(e: string): string {
  const at = e.lastIndexOf('@');
  if (at < 1) return '***';
  const local = e.slice(0, at), domain = e.slice(at + 1), dot = domain.lastIndexOf('.');
  const head = local.slice(0, Math.min(2, local.length));
  return `${head}***@${domain.slice(0, 1)}***${dot > 0 ? domain.slice(dot) : ''}`;
}

// ───────────────────────── papan peringkat
export type BoardId = 'points' | 'kills' | 'kd' | 'wins' | 'mvp' | 'knife' | 'nade' | 'flash' | 'streak' | 'longest'
  | 'wins_brickhall' | 'wins_steelyard' | 'wins_boston';
export type Period = 'week' | 'all';
export interface BoardDef { id: BoardId; name: string; desc: string }
/** Urutan menu. SAMA dengan daftar yang diterima public.get_leaderboard (dicek test). */
export const BOARDS: readonly BoardDef[] = [
  { id: 'points', name: 'Poin', desc: 'Total skor match online (kill 100, headshot +25, assist 50).' },
  { id: 'kills', name: 'Kill', desc: 'Total kill.' },
  { id: 'kd', name: 'K/D', desc: 'Kill ÷ mati. Minimal 5 match (minggu ini) / 10 match (sepanjang masa).' },
  { id: 'wins', name: 'Menang', desc: 'Jumlah match yang dimenangkan timmu.' },
  { id: 'mvp', name: 'MVP', desc: 'Berapa kali jadi skor tertinggi di match.' },
  { id: 'knife', name: 'Ahli Pisau', desc: 'Kill senjata jarak dekat (pisau, karambit, kukri, tomahawk, popor).' },
  { id: 'nade', name: 'Raja Granat', desc: 'Kill granat K-400.' },
  { id: 'flash', name: 'Si Penyilau', desc: 'Assist flashbang (musuh yang kamu butakan dibunuh timmu).' },
  { id: 'streak', name: 'Streak Terpanjang', desc: 'Kill beruntun terbanyak dalam satu nyawa.' },
  { id: 'longest', name: 'Sniper Terjauh', desc: 'Kill senjata api terjauh.' },
  { id: 'wins_brickhall', name: 'Raja Brick Hall', desc: 'Menang di Brick Hall.' },
  { id: 'wins_steelyard', name: 'Raja Steel Yard', desc: 'Menang di Steel Yard.' },
  { id: 'wins_boston', name: 'Raja Boston', desc: 'Menang di Boston.' },
];
export const isBoard = (v: unknown): v is BoardId => typeof v === 'string' && BOARDS.some(b => b.id === v);

export function formatValue(board: BoardId, v: number): string {
  if (!Number.isFinite(v)) return '-';
  if (board === 'kd') return v.toFixed(2);
  if (board === 'longest') return `${Math.round(v)} u · ±${Math.round(v * 0.36)} m`;
  return String(Math.round(v));
}

/** Teks reset mingguan: Senin 00:00 WIB (UTC+7, tanpa musim panas). */
export function weekResetText(now: Date): string {
  const wib = new Date(now.getTime() + 7 * 3600e3);              // jam dinding WIB dibaca lewat getter UTC
  const dow = (wib.getUTCDay() + 6) % 7;                          // Senin = 0
  const next = Date.UTC(wib.getUTCFullYear(), wib.getUTCMonth(), wib.getUTCDate() + 7 - dow);
  const h = Math.max(0, Math.ceil((next - wib.getTime()) / 3600e3));
  return h >= 48 ? `reset Senin 00:00 WIB (${Math.ceil(h / 24)} hari lagi)` : `reset Senin 00:00 WIB (${h} jam lagi)`;
}

// ───────────────────────── laporan hasil match (dikirim pemain untuk DIRINYA sendiri)
export interface ReportInput {
  matchKey: number; map: string; mode: string; won: boolean; mvp: boolean; humans: number; duration: number;
  score: number; kills: number; deaths: number; assists: number; hsKills: number; knifeKills: number; nadeKills: number;
  flashAssists: number; bestStreak: number; longestKill: number;
}
export interface MatchReport {
  match_key: number; map: MapId; mode: 'tdm' | 'elim'; won: boolean; mvp: boolean; humans: number; duration: number;
  score: number; kills: number; deaths: number; assists: number; hs_kills: number; knife_kills: number; nade_kills: number;
  flash_assists: number; best_streak: number; longest_kill: number;
}
const MAX_KEY = 2147483647;
const intIn = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(Number.isFinite(v) ? v : 0)));

/**
 * Laporan siap kirim, atau null bila match tidak memenuhi syarat leaderboard (bukan TDM/Eliminasi, < 2 manusia, < 30 s, data tidak
 * wajar). Nilai dijepit agar memenuhi constraint database (accounts.sql: rentang & konsistensi) — data jujur tidak berubah.
 */
export function buildReport(i: ReportInput): MatchReport | null {
  if (!(MAP_IDS as readonly string[]).includes(i.map) || (i.mode !== 'tdm' && i.mode !== 'elim')) return null;
  if (!Number.isInteger(i.matchKey) || i.matchKey < 0 || i.matchKey > MAX_KEY) return null;
  const humans = intIn(i.humans, 0, 10);
  if (humans < 2) return null;
  const duration = Number.isFinite(i.duration) ? Math.min(7200, Math.floor(i.duration)) : 0;
  if (duration < 30) return null;
  const kills = intIn(i.kills, 0, 300), deaths = intIn(i.deaths, 0, 300), assists = intIn(i.assists, 0, 300);
  if (kills * 2 > duration || deaths * 2 > duration) return null;          // jam match tidak masuk akal → jangan kirim
  const knife = intIn(i.knifeKills, 0, kills);
  return {
    match_key: i.matchKey, map: i.map as MapId, mode: i.mode, won: !!i.won, mvp: !!i.mvp, humans, duration,
    score: intIn(i.score, 0, 125 * kills + 50 * assists), kills, deaths, assists,
    hs_kills: intIn(i.hsKills, 0, kills), knife_kills: knife, nade_kills: intIn(i.nadeKills, 0, kills - knife),
    flash_assists: intIn(i.flashAssists, 0, assists), best_streak: intIn(i.bestStreak, 0, kills),
    longest_kill: Math.min(500, Math.max(0, Math.round((Number.isFinite(i.longestKill) ? i.longestKill : 0) * 10) / 10)),
  };
}

/** Pelanggaran constraint database (kosong = diterima) — dipakai test untuk memastikan cermin = database. */
export function reportIssues(r: MatchReport): string[] {
  const out: string[] = [], int = (k: keyof MatchReport) => Number.isInteger(r[k]);
  if (!(MAP_IDS as readonly string[]).includes(r.map)) out.push('map');
  if (r.mode !== 'tdm' && r.mode !== 'elim') out.push('mode');
  for (const k of ['match_key', 'humans', 'duration', 'score', 'kills', 'deaths', 'assists', 'hs_kills', 'knife_kills', 'nade_kills',
    'flash_assists', 'best_streak'] as const) if (!int(k)) out.push(`${k}:int`);
  if (r.match_key < 0 || r.match_key > MAX_KEY) out.push('match_key');
  if (r.humans < 2 || r.humans > 10) out.push('humans');
  if (r.duration < 30 || r.duration > 7200) out.push('duration');
  for (const k of ['kills', 'deaths', 'assists'] as const) if (r[k] < 0 || r[k] > 300) out.push(k);
  if (!(r.longest_kill >= 0 && r.longest_kill <= 500)) out.push('longest_kill');
  if (r.hs_kills < 0 || r.hs_kills > r.kills) out.push('hs_kills');
  if (r.knife_kills < 0 || r.nade_kills < 0 || r.knife_kills + r.nade_kills > r.kills) out.push('knife+nade');
  if (r.best_streak < 0 || r.best_streak > r.kills) out.push('best_streak');
  if (r.flash_assists < 0 || r.flash_assists > r.assists) out.push('flash_assists');
  if (r.score < 0 || r.score > 125 * r.kills + 50 * r.assists) out.push('score');
  if (r.kills * 2 > r.duration || r.deaths * 2 > r.duration) out.push('rate');
  return out;
}

/** Argumen RPC public.submit_match. */
export function submitArgs(r: MatchReport): Record<string, number | string | boolean> {
  return { p_match_key: r.match_key, p_map: r.map, p_mode: r.mode, p_won: r.won, p_mvp: r.mvp, p_humans: r.humans,
    p_duration: r.duration, p_score: r.score, p_kills: r.kills, p_deaths: r.deaths, p_assists: r.assists, p_hs_kills: r.hs_kills,
    p_knife_kills: r.knife_kills, p_nade_kills: r.nade_kills, p_flash_assists: r.flash_assists, p_best_streak: r.best_streak,
    p_longest_kill: r.longest_kill };
}

// ───────────────────────── pesan error (kode dari database / Supabase Auth → teks ramah; teks mentah server tidak ditampilkan)
const DB_ERRORS: [string, string][] = [
  ['not_authenticated', 'Sesi habis — masuk lagi.'],
  ['bad_name', NAME_PROBLEM_TEXT.chars],
  ['reserved_name', NAME_PROBLEM_TEXT.reserved],
  ['name_taken', 'Username itu sudah dipakai orang lain.'],
  ['name_cooldown', 'Username hanya bisa diganti sekali tiap 30 hari.'],
  ['banned', 'Akun ini diblokir dari peringkat.'],
  ['no_profile', 'Buat username dulu di menu Akun.'],
  ['too_fast', 'Terlalu cepat — tunggu sebentar.'],
  ['bad_duration', 'Hasil ditolak (durasi match tidak cocok).'],
  ['daily_limit', 'Batas kiriman hasil hari ini tercapai.'],
  ['bad_result', 'Hasil match ditolak (data tidak wajar).'],
  ['bad_board', 'Papan peringkat tidak dikenal.'],
  ['bad_period', 'Periode tidak dikenal.'],
];
/** Kode error dari database (penolakan aturan) — selain itu = gangguan jaringan/server (boleh dicoba ulang). */
export const isDbRejection = (message: string | undefined) => DB_ERRORS.some(([code]) => (message ?? '').includes(code));
export function dbErrorText(message: string | undefined): string {
  const m = message ?? '';
  for (const [code, text] of DB_ERRORS) if (m.includes(code)) return text;
  return 'Gagal terhubung ke server — coba lagi sebentar lagi.';
}
const AUTH_ERRORS: Record<string, string> = {
  invalid_credentials: 'Email atau password salah.',
  email_not_confirmed: 'Email belum dikonfirmasi — buka link di email kamu dulu (cek juga folder spam).',
  over_email_send_rate_limit: 'Terlalu banyak email dikirim. Tunggu beberapa menit lalu coba lagi.',
  over_request_rate_limit: 'Terlalu banyak percobaan. Tunggu beberapa menit lalu coba lagi.',
  weak_password: 'Password terlalu lemah — minimal 8 karakter, berisi huruf dan angka.',
  signup_disabled: 'Pendaftaran akun sedang ditutup.',
  // pengirim email bawaan Supabase hanya mengirim ke anggota tim organisasi pemilik (sebelum SMTP sendiri dipasang)
  email_address_not_authorized: 'Email belum bisa dikirim ke alamat ini (server email game belum dipasang pemilik) — sementara pakai "Masuk dengan Google".',
  email_address_invalid: 'Alamat email tidak valid.',
  validation_failed: 'Isian tidak valid.',
  same_password: 'Password baru harus berbeda dari yang lama.',
  user_banned: 'Akun ini diblokir.',
  provider_disabled: 'Cara masuk ini belum diaktifkan pemilik game.',
  session_not_found: 'Sesi habis — masuk lagi.',
  otp_expired: 'Link sudah kedaluwarsa atau sudah dipakai — minta link baru.',
  flow_state_expired: 'Proses masuk kedaluwarsa — coba lagi.',
  flow_state_not_found: 'Proses masuk tidak ditemukan — coba lagi dari game.',
  bad_code_verifier: 'Proses masuk harus diselesaikan di browser yang sama — coba lagi.',
  access_denied: 'Masuk dibatalkan.',
};
export const authErrorText = (code: string | undefined): string =>
  (code && AUTH_ERRORS[code]) || 'Gagal — cek koneksi lalu coba lagi.';
