// tests/accounts.test.ts — aturan akun & leaderboard MURNI (src/game/Leaderboard.ts) + cermin aturan database (supabase/accounts.sql):
// daftar nama terlarang, papan, map, parameter fungsi — harus identik dengan SQL (database = penegak sebenarnya).
import { describe, expect, it } from 'vitest';
import SQL from '../supabase/accounts.sql?raw';
import {
  BOARDS, RESERVED_NAMES, authErrorText, buildReport, dbErrorText, emailLooksValid, formatValue, isDbRejection, maskEmail, passwordProblem,
  reportIssues, submitArgs, usernameProblem, weekResetText, type ReportInput,
} from '../src/game/Leaderboard';
import { MAP_IDS } from '../src/world/maps/types';

const quoted = (s: string) => [...s.matchAll(/'([^']*)'/g)].map(m => m[1]);
const between = (from: string, to: string) => { const a = SQL.indexOf(from); return SQL.slice(a, SQL.indexOf(to, a + from.length)); };

describe('cermin aturan database', () => {
  it('nama terlarang = public.sw_reserved', () => {
    expect(quoted(between('array[', '])')).sort()).toEqual([...RESERVED_NAMES].sort());
  });
  it('papan peringkat = daftar yang diterima public.get_leaderboard', () => {
    expect(quoted(between("p_board not in (", ') then')).sort()).toEqual(BOARDS.map(b => b.id).sort());
  });
  it('map = constraint mr_map (map baru → perbarui SQL juga)', () => {
    expect(quoted(between('mr_map', ')),')).filter(m => m !== 'mr_map').sort()).toEqual([...MAP_IDS].sort());
  });
  it('argumen submitArgs = parameter public.submit_match (urutan & nama)', () => {
    const sig = between('create or replace function public.submit_match(', ') returns text');
    const names = [...sig.matchAll(/(p_[a-z_]+)\s/g)].map(m => m[1]);
    const r = buildReport(honest())!;
    expect(Object.keys(submitArgs(r))).toEqual(names);
  });
  it('tabel terkunci: hak dicabut + RLS aktif; fungsi tulis hanya authenticated; tanpa kunci rahasia', () => {
    expect(SQL).toMatch(/revoke all on table public\.profiles, public\.match_results from public, anon, authenticated;/);
    expect(SQL).toMatch(/alter table public\.profiles enable row level security;/);
    expect(SQL).toMatch(/alter table public\.match_results enable row level security;/);
    expect(SQL).not.toMatch(/create policy/i);
    for (const fn of ['get_my_profile()', 'set_username(text)', 'delete_my_account()', 'submit_match(']) {
      expect(SQL).toContain(`revoke all on function public.${fn}`);
      expect(SQL).toMatch(new RegExp(`grant execute on function public\\.${fn.replace(/[()]/g, m => '\\' + m)}[^;]*to authenticated;`));
    }
    expect(SQL).toMatch(/grant execute on function public\.get_leaderboard\(text, text, int\) to anon, authenticated;/);
    // setiap SECURITY DEFINER memakai search_path kosong
    const defs = SQL.split('create or replace function').slice(1);
    for (const d of defs) if (/security definer/.test(d.slice(0, 400))) expect(d.slice(0, 400)).toContain("set search_path = ''");
    expect(SQL).not.toMatch(/service_role|sb_secret|eyJhbGci/);
  });
});

describe('username, password, email', () => {
  it('username: 3–16 huruf/angka/_, wajib huruf, nama terlarang ditolak (tanpa beda kapital)', () => {
    expect(usernameProblem('Aldy_11')).toBeNull();
    expect(usernameProblem('abc')).toBeNull();
    expect(usernameProblem('')).toBe('empty');
    expect(usernameProblem('ab')).toBe('short');
    expect(usernameProblem('a'.repeat(17))).toBe('long');
    for (const n of ['nama spasi', 'émile', 'a-b-c', '<script>', "x';--", 'abc​']) expect(usernameProblem(n)).toBe('chars');
    expect(usernameProblem('12345')).toBe('noletter');
    expect(usernameProblem('___')).toBe('noletter');
    for (const n of ['ADMIN', 'Bata', 'moderator', 'Supabase']) expect(usernameProblem(n)).toBe('reserved');
  });
  it('password: 8–72 karakter, huruf + angka', () => {
    expect(passwordProblem('rahasia123')).toBeNull();
    expect(passwordProblem('abc12')).toBe('short');
    expect(passwordProblem('a1'.repeat(37))).toBe('long');
    expect(passwordProblem('hanyahuruf')).toBe('weak');
    expect(passwordProblem('12345678')).toBe('weak');
  });
  it('email: bentuk dasar; disamarkan untuk tampilan', () => {
    expect(emailLooksValid('a@b.co')).toBe(true);
    for (const e of ['', 'a@b', 'a b@c.com', '<a>@b.com', 'a@b.c', 'x'.repeat(250) + '@b.com']) expect(emailLooksValid(e)).toBe(false);
    expect(maskEmail('pemain.uji@example.com')).toBe('pe***@e***.com');
    expect(maskEmail('a@b.id')).toBe('a***@b***.id');
    expect(maskEmail('rusak')).toBe('***');
  });
});

describe('papan & tampilan', () => {
  it('format nilai & reset mingguan Senin 00:00 WIB', () => {
    expect(formatValue('kd', 1.23456)).toBe('1.23');
    expect(formatValue('longest', 100)).toBe('100 u · ±36 m');
    expect(formatValue('points', 1499.6)).toBe('1500');
    // Minggu 23:00 WIB = Minggu 16:00 UTC → 1 jam lagi; Senin 00:30 WIB → ±7 hari
    expect(weekResetText(new Date('2026-11-29T16:00:00Z'))).toBe('reset Senin 00:00 WIB (1 jam lagi)');
    expect(weekResetText(new Date('2026-11-29T17:30:00Z'))).toBe('reset Senin 00:00 WIB (7 hari lagi)');
  });
  it('error database → teks ramah; error lain = gangguan (boleh coba ulang)', () => {
    expect(dbErrorText('name_taken')).toContain('sudah dipakai');
    expect(isDbRejection('ERROR: too_fast')).toBe(true);
    expect(isDbRejection('Failed to fetch')).toBe(false);
    expect(dbErrorText('Failed to fetch')).toContain('coba lagi');
  });
  it('error auth → teks ramah; email ditolak pengirim bawaan Supabase → sarankan Google', () => {
    expect(authErrorText('invalid_credentials')).toBe('Email atau password salah.');
    expect(authErrorText('email_address_not_authorized')).toContain('Masuk dengan Google');
    expect(authErrorText('kode_aneh')).toContain('coba lagi');
    expect(authErrorText(undefined)).toContain('coba lagi');
  });
});

const honest = (o: Partial<ReportInput> = {}): ReportInput => ({ matchKey: 123456, map: 'boston', mode: 'tdm', won: true, mvp: false, humans: 3,
  duration: 540.7, score: 1575, kills: 12, deaths: 6, assists: 6, hsKills: 3, knifeKills: 1, nadeKills: 2, flashAssists: 1, bestStreak: 4,
  longestKill: 61.234, ...o });

describe('laporan hasil match', () => {
  it('match jujur → laporan utuh & lolos semua constraint database', () => {
    const r = buildReport(honest())!;
    expect(r).toMatchObject({ match_key: 123456, map: 'boston', mode: 'tdm', humans: 3, duration: 540, score: 1575, kills: 12, longest_kill: 61.2 });
    expect(reportIssues(r)).toEqual([]);
  });
  it('tidak memenuhi syarat → tidak dikirim', () => {
    for (const o of [{ mode: 'practice' }, { map: 'mars' }, { humans: 1 }, { duration: 29 }, { matchKey: -1 }, { matchKey: 1.5 },
      { matchKey: 2 ** 31 }, { kills: 40, duration: 60 }, { deaths: 31, duration: 60 }, { duration: NaN }] as Partial<ReportInput>[])
      expect(buildReport(honest(o)), JSON.stringify(o)).toBeNull();
  });
  it('nilai di luar aturan dijepit agar konsisten (data lokal yang sedikit beda tidak membuat kiriman ditolak)', () => {
    const r = buildReport(honest({ knifeKills: 9, nadeKills: 9, hsKills: 99, bestStreak: 50, flashAssists: 20, score: 99999, longestKill: 9999, humans: 40 }))!;
    expect(r.knife_kills + r.nade_kills).toBeLessThanOrEqual(r.kills);
    expect(r.hs_kills).toBe(12);
    expect(r.best_streak).toBe(12);
    expect(r.flash_assists).toBe(6);
    expect(r.score).toBe(125 * 12 + 50 * 6);
    expect(r.longest_kill).toBe(500);
    expect(r.humans).toBe(10);
    expect(reportIssues(r)).toEqual([]);
  });
  it('acak 2000 masukan → setiap laporan yang dibuat lolos constraint database', () => {
    let seed = 42;
    const rnd = (n: number) => { seed = (seed * 1103515245 + 12345) >>> 0; return (seed / 4294967296) * n; };
    let made = 0;
    for (let i = 0; i < 2000; i++) {
      const r = buildReport({ matchKey: Math.floor(rnd(2 ** 31)), map: MAP_IDS[Math.floor(rnd(3))], mode: rnd(1) < 0.5 ? 'tdm' : 'elim',
        won: rnd(1) < 0.5, mvp: rnd(1) < 0.2, humans: Math.floor(rnd(12)), duration: rnd(4000), score: rnd(30000) - 100, kills: rnd(320),
        deaths: rnd(320), assists: rnd(320), hsKills: rnd(100), knifeKills: rnd(60), nadeKills: rnd(60), flashAssists: rnd(60),
        bestStreak: rnd(100), longestKill: rnd(700) - 50 });
      if (!r) continue;
      made++;
      expect(reportIssues(r)).toEqual([]);
    }
    expect(made).toBeGreaterThan(200);
  });
});
