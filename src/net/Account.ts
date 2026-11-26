// src/net/Account.ts — akun pemain (Supabase Auth: Google / email + password) + leaderboard. Klien TIPIS: semua aturan keamanan
// ditegakkan database (supabase/accounts.sql — tabel terkunci, hanya fungsi tervalidasi yang bekerja untuk pemilik sesi).
// Privasi: password tidak pernah disimpan / dilihat game (langsung ke Supabase Auth lewat HTTPS, di-hash di sana); email tidak pernah
// dikirim ke pemain lain, tidak ditulis ke kotak hitam / log; UI hanya menampilkan email milik sendiri yang disamarkan.
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { getSupabase, supabaseEnv } from './supabase';
import { blackbox } from '../core/BlackBox';
import {
  NAME_PROBLEM_TEXT, PASSWORD_PROBLEM_TEXT, authErrorText, dbErrorText, emailLooksValid, isDbRejection, maskEmail, passwordProblem, submitArgs,
  usernameProblem, type BoardId, type MatchReport, type Period,
} from '../game/Leaderboard';

export interface Profile { username: string; createdAt: string; nameChangedAt: string; banned: boolean }
export interface LbRow { rank: number; username: string; value: number; matches: number; isMe: boolean }
export type Result = { ok: true; info?: string } | { ok: false; error: string; retry?: boolean };

const fail = (error: string): Result => ({ ok: false, error });
/** Error RPC → teks ramah. PGRST202 = fungsi belum ada (pemilik belum menjalankan supabase/accounts.sql). */
const NOT_INSTALLED = 'Server peringkat belum dipasang (pemilik game perlu menjalankan supabase/accounts.sql).';
const rpcText = (e: { code?: string; message?: string }) => (e.code === 'PGRST202' ? NOT_INSTALLED : dbErrorText(e.message));
const UNAVAILABLE = 'Fitur akun belum aktif di build ini.';
const NAME_COOLDOWN_DAYS = 30;
const LB_TTL_MS = 60_000;
/** Parameter URL dari alur login (PKCE ?code= / link email / error) — dibersihkan setelah diproses (tidak tertinggal di riwayat). */
const AUTH_PARAMS = ['code', 'error', 'error_code', 'error_description', 'type', 'sb_flow_id'];

/** Halaman ini (tanpa query) — harus terdaftar di Supabase → Authentication → URL Configuration → Redirect URLs sebagai pola
 *  `…/**` (pustaka menambahkan ?sb_flow_id=… untuk alur PKCE). */
const redirectUrl = () => location.origin + location.pathname;

function readAuthError(): string | null {
  const q = new URLSearchParams(location.search), h = new URLSearchParams(location.hash.replace(/^#/, ''));
  return q.get('error_code') ?? h.get('error_code') ?? (q.get('error') ?? h.get('error'));
}

function cleanAuthParams() {
  const u = new URL(location.href);
  let changed = false;
  for (const k of AUTH_PARAMS) if (u.searchParams.has(k)) { u.searchParams.delete(k); changed = true; }
  if (/(^|[#&])(access_token|refresh_token|error_description|error_code)=/.test(u.hash)) { u.hash = ''; changed = true; }
  if (changed) history.replaceState(history.state, '', u.pathname + u.search + u.hash);
}

class AccountService {
  private sb: SupabaseClient | null = null;
  private session: Session | null = null;
  /** Profil sendiri (username); null = belum dibuat / belum dimuat. */
  profile: Profile | null = null;
  /** Status akun sudah diketahui (atau fitur tidak tersedia). */
  ready = false;
  /** Datang dari link reset password → layar "buat password baru". */
  recovery = false;
  /** Pesan sekali tampil di layar Akun (mis. link kedaluwarsa). */
  notice = '';
  private initP: Promise<void> | null = null;
  private profileFor = '';
  private profileDone = '';
  private readonly subs = new Set<() => void>();
  private readonly lb = new Map<string, { t: number; rows: LbRow[] }>();

  /** Build ini punya Supabase (env) → fitur akun ada. */
  get available() { return !!supabaseEnv(); }
  get signedIn() { return !!this.session; }
  /** 'google' | 'email' (cara masuk sesi ini). */
  get provider(): string { return String(this.session?.user.app_metadata?.provider ?? ''); }
  get emailMasked(): string { const e = this.session?.user.email; return e ? maskEmail(e) : ''; }
  /** Profil sesi ini sudah selesai dicek (ada atau memang belum dibuat). */
  get profileChecked(): boolean { return !!this.session && this.profileDone === this.session.user.id; }
  /** Hari tersisa sebelum username boleh diganti lagi (0 = boleh). */
  get nameCooldownDays(): number {
    if (!this.profile) return 0;
    const ms = Date.parse(this.profile.nameChangedAt) + NAME_COOLDOWN_DAYS * 86400e3 - Date.now();
    return ms > 0 ? Math.ceil(ms / 86400e3) : 0;
  }

  onChange(cb: () => void): () => void { this.subs.add(cb); return () => this.subs.delete(cb); }
  private changed() { for (const cb of [...this.subs]) cb(); }

  /** Pulihkan sesi (dan selesaikan alur login dari URL bila ada). Aman dipanggil berkali-kali. */
  init(): Promise<void> {
    if (!this.available) { this.ready = true; return Promise.resolve(); }
    return (this.initP ??= this.boot());
  }

  private async boot() {
    const urlError = readAuthError();
    try {
      const sb = (this.sb = await getSupabase());
      // callback status login: JANGAN menunggu panggilan Supabase lain di dalamnya (deadlock pustaka) → profil dimuat lewat setTimeout
      sb.auth.onAuthStateChange((event, session) => {
        const prev = this.session?.user.id ?? '';
        this.session = session;
        if (event === 'PASSWORD_RECOVERY') this.recovery = true;
        if (!session) { this.profile = null; this.profileFor = ''; this.profileDone = ''; this.recovery = false; }
        if ((session?.user.id ?? '') !== prev) this.lb.clear();
        if (session && session.user.id !== this.profileFor) setTimeout(() => void this.loadProfile(), 0);
        this.changed();
      });
      const init = await sb.auth.initialize();          // menunggu pertukaran ?code= (Google / link email) selesai
      if (init.error && !urlError) this.notice = linkNotice(init.error.code);
      const { data } = await sb.auth.getSession();
      this.session = data.session;
      if (this.session) await this.loadProfile();
    } catch {
      /* offline / pustaka gagal dimuat → tetap bisa main sebagai tamu */
    } finally {
      if (urlError) this.notice = linkNotice(urlError);
      cleanAuthParams();
      this.ready = true;
      this.changed();
    }
  }

  private async client(): Promise<SupabaseClient | null> {
    if (!this.available) return null;
    await this.init();
    return this.sb;
  }

  private async loadProfile() {
    const sb = this.sb, uid = this.session?.user.id;
    if (!sb || !uid) return;
    this.profileFor = uid;
    const { data, error } = await sb.rpc('get_my_profile');
    if (this.session?.user.id !== uid) return;          // keburu keluar / ganti akun
    if (error) { this.profileFor = ''; return; }
    const r = (Array.isArray(data) ? data[0] : null) as Record<string, unknown> | null | undefined;
    this.profile = r && typeof r.username === 'string'
      ? { username: r.username, createdAt: String(r.created_at ?? ''), nameChangedAt: String(r.name_changed_at ?? ''), banned: r.banned === true }
      : null;
    this.profileDone = uid;
    this.changed();
  }

  // ───────────────────────── masuk / daftar
  async signInGoogle(): Promise<Result> {
    const sb = await this.client();
    if (!sb) return fail(UNAVAILABLE);
    const { error } = await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: redirectUrl(), queryParams: { prompt: 'select_account' } } });
    if (error) return fail(authErrorText(error.code));
    blackbox.log('akun', 'masuk Google (pindah ke halaman Google)');
    return { ok: true };
  }

  async signUp(email: string, password: string): Promise<Result> {
    const sb = await this.client();
    if (!sb) return fail(UNAVAILABLE);
    email = email.trim();
    if (!emailLooksValid(email)) return fail('Alamat email tidak valid.');
    const pp = passwordProblem(password);
    if (pp) return fail(PASSWORD_PROBLEM_TEXT[pp]);
    const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: redirectUrl() } });
    if (error) return fail(authErrorText(error.code));
    blackbox.log('akun', 'daftar email');
    if (data.session) return { ok: true };
    // jawaban SAMA untuk email baru & email yang sudah terdaftar (Supabase tidak membocorkan email mana yang ada)
    return { ok: true, info: 'Cek email kamu untuk link konfirmasi (cek juga folder spam). Kalau email itu sudah pernah terdaftar, langsung masuk saja atau pakai "Lupa password".' };
  }

  async signIn(email: string, password: string): Promise<Result> {
    const sb = await this.client();
    if (!sb) return fail(UNAVAILABLE);
    email = email.trim();
    if (!emailLooksValid(email) || !password) return fail('Isi email & password.');
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) return fail(authErrorText(error.code));
    blackbox.log('akun', 'masuk email');
    return { ok: true };
  }

  async sendReset(email: string): Promise<Result> {
    const sb = await this.client();
    if (!sb) return fail(UNAVAILABLE);
    email = email.trim();
    if (!emailLooksValid(email)) return fail('Alamat email tidak valid.');
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: redirectUrl() });
    if (error && (error.code === 'over_email_send_rate_limit' || error.code === 'over_request_rate_limit')) return fail(authErrorText(error.code));
    // tetap generik (juga saat email bawaan Supabase menolak alamat ini) agar tidak membocorkan email mana yang terdaftar
    return { ok: true, info: 'Kalau email itu terdaftar, link ganti password sudah dikirim — buka link-nya di browser ini juga (cek juga folder spam). Akun yang dibuat lewat Google: pakai tombol "Masuk dengan Google".' };
  }

  async setNewPassword(password: string): Promise<Result> {
    const sb = await this.client();
    if (!sb || !this.session) return fail('Sesi habis — minta link reset baru.');
    const pp = passwordProblem(password);
    if (pp) return fail(PASSWORD_PROBLEM_TEXT[pp]);
    const { error } = await sb.auth.updateUser({ password });
    if (error) return fail(authErrorText(error.code));
    this.recovery = false;
    blackbox.log('akun', 'ganti password');
    this.changed();
    return { ok: true, info: 'Password sudah diganti.' };
  }

  async signOut(): Promise<void> {
    const sb = await this.client();
    if (sb) await sb.auth.signOut({ scope: 'local' }).catch(() => undefined);
    this.session = null; this.profile = null; this.profileFor = ''; this.profileDone = ''; this.recovery = false; this.lb.clear();
    blackbox.log('akun', 'keluar');
    this.changed();
  }

  // ───────────────────────── profil
  async setUsername(name: string): Promise<Result> {
    const sb = await this.client();
    if (!sb || !this.session) return fail('Masuk dulu.');
    name = name.trim();
    const p = usernameProblem(name);
    if (p) return fail(NAME_PROBLEM_TEXT[p]);
    const { error } = await sb.rpc('set_username', { p_name: name });
    if (error) return fail(rpcText(error));
    await this.loadProfile();
    this.lb.clear();
    return { ok: true, info: 'Username tersimpan.' };
  }

  /** Hapus akun & SEMUA datanya (profil, hasil match). confirm = username (atau "HAPUS" bila belum punya username). */
  async deleteAccount(confirm: string): Promise<Result> {
    const sb = await this.client();
    if (!sb || !this.session) return fail('Masuk dulu.');
    const want = this.profile ? this.profile.username : 'HAPUS';
    if (confirm.trim().toLowerCase() !== want.toLowerCase()) return fail(`Ketik "${want}" untuk konfirmasi.`);
    const { error } = await sb.rpc('delete_my_account');
    if (error) return fail(rpcText(error));
    blackbox.log('akun', 'akun dihapus');
    await this.signOut();
    return { ok: true, info: 'Akun & semua datanya sudah dihapus.' };
  }

  // ───────────────────────── hasil match & peringkat
  async submit(r: MatchReport): Promise<Result> {
    const sb = await this.client();
    if (!sb || !this.session) return fail('Masuk dulu.');
    const { error } = await sb.rpc('submit_match', submitArgs(r));
    if (error) return { ok: false, error: rpcText(error), retry: error.code !== 'PGRST202' && !isDbRejection(error.message) };
    this.lb.clear();
    return { ok: true };
  }

  /** 10 teratas (+ peringkat sendiri bila di luar 10 besar). Disimpan 60 s agar menu tidak membanjiri server. */
  async leaderboard(board: BoardId, period: Period, force = false): Promise<{ ok: true; rows: LbRow[] } | { ok: false; error: string }> {
    const sb = await this.client();
    if (!sb) return { ok: false, error: UNAVAILABLE };
    const key = `${board}|${period}|${this.session?.user.id ?? ''}`, hit = this.lb.get(key);
    if (hit && !force && Date.now() - hit.t < LB_TTL_MS) return { ok: true, rows: hit.rows };
    const { data, error } = await sb.rpc('get_leaderboard', { p_board: board, p_period: period, p_limit: 10 });
    if (error) return { ok: false, error: rpcText(error) };
    const rows: LbRow[] = (Array.isArray(data) ? data : []).slice(0, 11).map((r: Record<string, unknown>) => ({
      rank: Number(r.rank) || 0, username: String(r.username ?? '').slice(0, 16), value: Number(r.value) || 0,
      matches: Number(r.matches) || 0, isMe: r.is_me === true,
    }));
    this.lb.set(key, { t: Date.now(), rows });
    return { ok: true, rows };
  }
}

/** Pesan untuk error dari link email / login (otp_expired, bad_code_verifier, …). */
function linkNotice(code: string | undefined): string {
  if (code === 'bad_code_verifier' || code === 'flow_state_not_found')
    return 'Link sudah diproses. Kalau belum otomatis masuk, silakan masuk dengan email & password. (Link ganti password harus dibuka di browser yang sama tempat kamu memintanya.)';
  return authErrorText(code);
}

export const account = new AccountService();
