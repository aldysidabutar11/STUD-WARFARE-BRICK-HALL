// tests/accountsSql.test.ts — keamanan supabase/accounts.sql di Postgres ASLI (PGlite, WASM) dengan tiruan lingkungan Supabase:
// role anon/authenticated, hak bawaan Supabase (ALL untuk tabel/fungsi baru di public — harus dicabut skrip), auth.users, auth.uid().
// Menguji: tabel terkunci untuk semua role publik, fungsi hanya bekerja untuk pemilik sesi, validasi isian, batas laju, privasi
// leaderboard (hanya username + angka), konfirmasi ≥ 2 akun, blokir, hapus akun, skrip aman dijalankan ulang, laporan game diterima.
import { beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import SQL from '../supabase/accounts.sql?raw';
import { buildReport, submitArgs, type MatchReport } from '../src/game/Leaderboard';
import { MAP_IDS } from '../src/world/maps/types';

const SUPABASE_STUB = `
  create role anon nologin; create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  grant usage on schema public to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant all on functions to anon, authenticated;
  alter default privileges in schema public grant all on sequences to anon, authenticated;`;
const A = '00000000-0000-0000-0000-00000000000a', B = '00000000-0000-0000-0000-00000000000b';
const C = '00000000-0000-0000-0000-00000000000c', D = '00000000-0000-0000-0000-00000000000d';

let db: PGlite;
interface Res { rows?: Record<string, unknown>[]; err?: string }
async function as(role: 'anon' | 'authenticated', uid: string | null, q: string, params?: unknown[]): Promise<Res> {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid ?? ''}', false); set role ${role};`);
  try { return { rows: (await db.query<Record<string, unknown>>(q, params)).rows }; }
  catch (e) { return { err: (e as Error).message }; }
  finally { await db.exec('reset role'); }
}
const denied = (r: Res) => !!r.err && /permission denied/i.test(r.err);
const errIs = (r: Res, code: string) => !!r.err && r.err.includes(code);
const sql = (q: string) => db.exec(q);
const count = async (q: string) => Number((await db.query<{ n: number }>(q)).rows[0].n);
const backdate = (uid: string, min = 10) => sql(`update public.match_results set created_at = created_at - interval '${min} minutes' where user_id = '${uid}'`);

const SUBMIT = 'select public.submit_match($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) as r';
const SUBMIT_BOMB = 'select public.submit_match($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) as r';
const args = (r: MatchReport) => Object.values(submitArgs(r));
const report = (key: number, o: Partial<MatchReport> = {}): MatchReport => ({ match_key: key, map: 'boston', mode: 'tdm', won: true, mvp: false,
  humans: 2, duration: 600, score: 1500, kills: 12, deaths: 5, assists: 4, hs_kills: 3, knife_kills: 1, nade_kills: 1, flash_assists: 1,
  best_streak: 4, longest_kill: 42.5, plants: 0, defuses: 0, ...o });
const submit = (uid: string | null, r: MatchReport, role: 'anon' | 'authenticated' = 'authenticated') =>
  as(role, uid, r.mode === 'bomb' ? SUBMIT_BOMB : SUBMIT, args(r));
const board = (b: string, p: string, uid: string | null = null, lim?: number) =>
  as(uid ? 'authenticated' : 'anon', uid, lim ? 'select * from public.get_leaderboard($1, $2, $3)' : 'select * from public.get_leaderboard($1, $2)',
    lim ? [b, p, lim] : [b, p]);

beforeAll(async () => {
  db = new PGlite();
  await sql(SUPABASE_STUB);
  await sql(SQL);
  await sql(SQL);                                        // aman dijalankan ulang (dipasang lagi setelah diubah)
  await sql(`insert into auth.users values ('${A}', 'a@x.test'), ('${B}', 'b@x.test'), ('${C}', 'c@x.test'), ('${D}', 'd@x.test')`);
}, 60_000);

describe('akses publik (anon = siapa pun yang membuka game)', () => {
  it('tidak bisa membaca / mengubah tabel, auth.users, atau memanggil fungsi tulis', async () => {
    for (const q of ['select * from public.profiles', 'select * from public.match_results', 'select * from auth.users',
      `insert into public.profiles (id, username) values ('${A}', 'hacker')`, 'update public.profiles set banned = false',
      'delete from public.match_results', "select public.set_username('abc')", 'select public.delete_my_account()',
      'select * from public.get_my_profile()', "select public.sw_reserved('abc')"]) {
      const r = await as('anon', null, q);
      expect(denied(r), `${q} → ${r.err ?? 'LOLOS'}`).toBe(true);
    }
    expect(denied(await submit(null, report(1), 'anon'))).toBe(true);
  });
  it('boleh membaca leaderboard', async () => {
    expect((await board('points', 'week')).err).toBeUndefined();
  });
});

describe('pemain masuk (authenticated)', () => {
  it('tabel tetap terkunci walau sudah login (hanya lewat fungsi)', async () => {
    for (const q of ['select * from public.profiles', 'select * from public.match_results', 'select * from auth.users',
      `insert into public.profiles (id, username) values ('${A}', 'Aldy')`, `update public.profiles set banned = false where id = '${A}'`,
      `delete from auth.users where id = '${B}'`, `insert into public.match_results (user_id, match_key) values ('${B}', 1)`]) {
      expect(denied(await as('authenticated', A, q)), q).toBe(true);
    }
  });

  it('username: format, nama terlarang, unik tanpa beda kapital, ganti nama 30 hari, profil tanpa email', async () => {
    expect(errIs(await submit(A, report(5)), 'no_profile')).toBe(true);
    for (const [n, code] of [['ab', 'bad_name'], ['a b c', 'bad_name'], ['12345', 'bad_name'], ["x'; drop table x;--", 'bad_name'],
      ['<script>', 'bad_name'], ['abcdefghijklmnopq', 'bad_name'], ['Admin', 'reserved_name'], ['BATA', 'reserved_name']]) {
      expect(errIs(await as('authenticated', A, 'select public.set_username($1)', [n]), code), n).toBe(true);
    }
    expect((await as('authenticated', A, 'select public.set_username($1) as u', ['Aldy_11'])).rows?.[0].u).toBe('Aldy_11');
    expect(errIs(await as('authenticated', B, 'select public.set_username($1)', ['aldy_11']), 'name_taken')).toBe(true);
    expect((await as('authenticated', A, 'select public.set_username($1)', ['ALDY_11'])).err).toBeUndefined();   // kapital saja: bebas
    expect(errIs(await as('authenticated', A, 'select public.set_username($1)', ['NamaBaru']), 'name_cooldown')).toBe(true);
    await sql(`update public.profiles set name_changed_at = now() - interval '31 days' where id = '${A}'`);
    expect((await as('authenticated', A, 'select public.set_username($1)', ['Aldy'])).err).toBeUndefined();
    const me = await as('authenticated', A, 'select * from public.get_my_profile()');
    expect(me.rows).toHaveLength(1);
    expect(me.rows![0].username).toBe('Aldy');
    expect(Object.keys(me.rows![0]).sort()).toEqual(['banned', 'created_at', 'name_changed_at', 'username']);
    expect((await as('authenticated', B, 'select * from public.get_my_profile()')).rows).toHaveLength(0);    // B tidak melihat profil A
    for (const [u, n] of [[B, 'Teman1'], [C, 'Teman2'], [D, 'Teman3']]) await as('authenticated', u, 'select public.set_username($1)', [n]);
  });

  it('hasil match: data tidak wajar ditolak, batas laju, duplikat diabaikan, hanya untuk diri sendiri', async () => {
    const bad: Partial<MatchReport>[] = [{ kills: 500 }, { hs_kills: 13 }, { knife_kills: 7, nade_kills: 6 }, { best_streak: 13 },
      { score: 99999 }, { duration: 10 }, { humans: 1 }, { map: 'x' as never }, { mode: 'practice' as never }, { flash_assists: 5 },
      { kills: 400, duration: 600 }, { longest_kill: 9999 }, { longest_kill: NaN }, { deaths: -1 }, { match_key: -5 }, { duration: 9000 }];
    for (const o of bad) expect(errIs(await submit(A, report(100, o)), 'bad_result'), JSON.stringify(o)).toBe(true);
    expect((await submit(A, report(100))).rows?.[0].r).toBe('ok');
    expect(errIs(await submit(A, report(101)), 'too_fast')).toBe(true);                       // < 30 s sejak kiriman terakhir
    await backdate(A, 5);
    expect(errIs(await submit(A, report(101, { duration: 900 })), 'bad_duration')).toBe(true);  // 15 menit match dalam 5 menit
    expect((await submit(A, report(100, { duration: 200 }))).err).toBeUndefined();             // match yang sama: diabaikan
    expect(await count(`select count(*)::int n from public.match_results where user_id = '${A}'`)).toBe(1);
    // fungsi selalu memakai pemilik sesi — tidak ada cara mengirim atas nama akun lain
    expect(SQL.match(/insert into public\.match_results \(user_id,[^;]*values \(uid,/s)).not.toBeNull();
  });

  it('batas 60 kiriman / 24 jam', async () => {
    await sql(`insert into public.match_results (user_id, match_key, created_at, map, mode, won, mvp, humans, duration, score, kills, deaths,
      assists, hs_kills, knife_kills, nade_kills, flash_assists, best_streak, longest_kill)
      select '${D}', 5000 + g, now() - (g || ' minutes')::interval - interval '1 hour', 'boston', 'tdm', false, false, 2, 60, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
      from generate_series(1, 60) g`);
    expect(errIs(await submit(D, report(6000, { duration: 60, kills: 1, score: 100, hs_kills: 0, knife_kills: 0, nade_kills: 0, best_streak: 1, assists: 0, flash_assists: 0, deaths: 0 })), 'daily_limit')).toBe(true);
    await sql(`delete from public.match_results where user_id = '${D}'`);
  });
});

describe('leaderboard', () => {
  it('match sendirian tidak dihitung; terkonfirmasi akun lain → tampil, kolom hanya username & angka', async () => {
    expect((await board('points', 'all')).rows).toHaveLength(0);
    await submit(B, report(100, { score: 500, kills: 4, won: false, hs_kills: 0, knife_kills: 0, nade_kills: 0, flash_assists: 0, best_streak: 2, assists: 1 }));
    const lb = await board('points', 'all');
    expect(lb.rows?.map(r => [r.rank, r.username, r.value, r.matches, r.is_me])).toEqual([[1, 'Aldy', 1500, 1, false], [2, 'Teman1', 500, 1, false]]);
    for (const r of lb.rows!) expect(Object.keys(r).sort()).toEqual(['is_me', 'matches', 'rank', 'username', 'value']);
  });
  it('papan: nilai 0 tidak tampil, peringkat sendiri ikut walau di luar batas, semua papan jalan, masukan aneh ditolak', async () => {
    expect((await board('wins', 'week', B)).rows?.map(r => r.username)).toEqual(['Aldy']);
    const lim = await board('points', 'week', B, 1);
    expect(lim.rows?.map(r => [r.rank, r.is_me])).toEqual([[1, false], [2, true]]);
    for (const b of ['kills', 'kd', 'mvp', 'knife', 'nade', 'flash', 'streak', 'longest', 'wins_boston', 'wins_steelyard', 'wins_brickhall',
      'wins_meridian', 'wins_arunika'])
      expect((await board(b, 'all')).err, b).toBeUndefined();
    expect(errIs(await board("points'; drop table public.profiles;--", 'all'), 'bad_board')).toBe(true);
    expect(errIs(await board('points', 'year'), 'bad_period')).toBe(true);
    expect((await board('kd', 'all')).rows).toHaveLength(0);                                // K/D butuh ≥ 10 match
    expect((await as('anon', null, 'select * from public.get_leaderboard($1, $2, $3)', ['points', 'all', 100000])).err).toBeUndefined(); // dijepit 50
  });
  it('akun diblokir: hilang dari papan, tidak bisa kirim/ganti nama, dan TIDAK bisa mengonfirmasi match akun lain', async () => {
    await sql(`update public.profiles set banned = true where id = '${A}'`);
    expect((await board('points', 'all')).rows?.map(r => r.username)).toEqual([]);           // Teman1 kehilangan konfirmasi dari A
    await backdate(A);
    expect(errIs(await submit(A, report(200, { duration: 300 })), 'banned')).toBe(true);
    await sql(`update public.profiles set name_changed_at = now() - interval '40 days' where id = '${A}'`);
    expect(errIs(await as('authenticated', A, 'select public.set_username($1)', ['Lain']), 'banned')).toBe(true);
    await sql(`update public.profiles set banned = false where id = '${A}'`);
    expect((await board('points', 'all')).rows).toHaveLength(2);
  });
});

describe('laporan buatan game diterima database', () => {
  it('300 laporan acak dari buildReport → semuanya diterima submit_match', async () => {
    let seed = 7, made = 0;
    const rnd = (n: number) => { seed = (seed * 1103515245 + 12345) >>> 0; return (seed / 4294967296) * n; };
    for (let i = 0; made < 300 && i < 5000; i++) {
      const mode = (['tdm', 'elim', 'bomb'] as const)[Math.floor(rnd(3))];
      const r = buildReport({ matchKey: 10_000 + i, map: MAP_IDS[Math.floor(rnd(MAP_IDS.length))], mode, won: rnd(1) < 0.5,
        mvp: rnd(1) < 0.2, humans: 2 + Math.floor(rnd(9)), duration: 30 + rnd(1800), score: rnd(9000), kills: rnd(80), deaths: rnd(80),
        assists: rnd(60), hsKills: rnd(40), knifeKills: rnd(10), nadeKills: rnd(10), flashAssists: rnd(10), bestStreak: rnd(30), longestKill: rnd(200),
        plants: rnd(12), defuses: rnd(12) });
      if (!r) continue;
      await sql(`update public.match_results set created_at = now() - interval '4 hours' where user_id = '${C}'`);
      await sql(`delete from public.match_results where user_id = '${C}' and created_at < now() - interval '3 hours'`);
      const res = await submit(C, r);
      expect(res.err, JSON.stringify(r)).toBeUndefined();
      made++;
    }
    expect(made).toBe(300);
  }, 120_000);
});

describe('Bomb Mission & Meridian Vault', () => {
  it('tanam/jinak hanya di mode bomb, maks 9, skor + 200 per objektif; mode/map baru diterima', async () => {
    const B4 = 'select public.submit_match($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) as r';
    const base = (key: number, mode: string, plants: number, defuses: number, score: number) =>
      [key, 'meridian', mode, true, false, 2, 600, score, 3, 2, 0, 0, 0, 0, 0, 1, 12.5, plants, defuses];
    await sql(`delete from public.match_results where user_id = '${D}'`);
    expect(errIs(await as('authenticated', D, B4, base(7001, 'tdm', 2, 0, 375)), 'bad_result')).toBe(true);     // tanam di TDM
    expect(errIs(await as('authenticated', D, B4, base(7002, 'bomb', 10, 0, 375)), 'bad_result')).toBe(true);   // > 9 ronde
    expect(errIs(await as('authenticated', D, B4, base(7003, 'bomb', 1, 1, 375 + 401)), 'bad_result')).toBe(true); // skor kebesaran
    expect((await as('authenticated', D, B4, base(7004, 'bomb', 1, 1, 375 + 400))).rows?.[0].r).toBe('ok');
    expect(await count(`select count(*)::int n from public.match_results where user_id = '${D}' and mode = 'bomb' and plants = 1 and defuses = 1`)).toBe(1);
    await backdate(D, 20);
    expect((await submit(D, report(7005, { map: 'meridian', duration: 300 }))).rows?.[0].r).toBe('ok');      // TDM 17 argumen (klien lama)
    await backdate(D, 20);
    expect((await submit(D, report(7006, { map: 'arunika', duration: 300 }))).rows?.[0].r).toBe('ok');       // map Candi Arunika
    await sql(`delete from public.match_results where user_id = '${D}'`);
  });
});

describe('hapus akun', () => {
  it('hanya akun sendiri; profil & hasil match ikut terhapus; akun lain utuh', async () => {
    expect((await as('authenticated', B, 'select public.delete_my_account()')).err).toBeUndefined();
    expect(await count(`select count(*)::int n from auth.users where id = '${B}'`)).toBe(0);
    expect(await count(`select count(*)::int n from public.profiles where id = '${B}'`)).toBe(0);
    expect(await count(`select count(*)::int n from public.match_results where user_id = '${B}'`)).toBe(0);
    expect(await count('select count(*)::int n from auth.users')).toBe(3);
    expect(await count(`select count(*)::int n from public.match_results where user_id = '${A}'`)).toBe(1);
    expect(denied(await as('anon', null, 'select public.delete_my_account()'))).toBe(true);
  });
});
