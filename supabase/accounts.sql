-- supabase/accounts.sql — akun pemain + leaderboard. Jalankan di Supabase → SQL Editor → New query → Run. Aman dijalankan ulang.
--
-- MODEL KEAMANAN (kunci publik / anon key ada di bundle game, jadi SEMUA aturan ditegakkan di database, bukan di game):
-- 1. Tabel TIDAK bisa diakses langsung sama sekali oleh anon / authenticated: hak tabel dicabut + RLS aktif tanpa policy (dua kunci).
-- 2. Satu-satunya pintu = fungsi di bawah (SECURITY DEFINER, search_path kosong, nama tabel lengkap). Tiap fungsi hanya bekerja untuk
--    auth.uid() (pemilik sesi) dan memvalidasi semua masukan. Fungsi tulis hanya untuk 'authenticated'.
-- 3. Email / password TIDAK pernah disimpan di tabel ini — hanya di auth.users milik Supabase Auth (password di-hash Supabase).
--    Yang keluar ke publik hanya: username + angka leaderboard.
-- 4. Hapus akun = baris auth.users dihapus → profil & semua hasil match ikut terhapus (on delete cascade).
-- Moderasi (dari SQL Editor): update public.profiles set banned = true where lower(username) = lower('NAMA');

-- ───────────────────────── tabel
create table if not exists public.profiles (
  id              uuid primary key references auth.users (id) on delete cascade,
  username        text not null,
  created_at      timestamptz not null default now(),
  name_changed_at timestamptz not null default now(),
  banned          boolean not null default false,
  constraint profiles_username_format check (username ~ '^[A-Za-z0-9_]{3,16}$' and username ~ '[A-Za-z]')
);
create unique index if not exists profiles_username_lower on public.profiles (lower(username));

create table if not exists public.match_results (
  id            bigint generated always as identity primary key,
  user_id       uuid not null references public.profiles (id) on delete cascade,
  match_key     bigint not null,
  created_at    timestamptz not null default now(),
  map           text not null,
  mode          text not null,
  won           boolean not null,
  mvp           boolean not null,
  humans        smallint not null,
  duration      int not null,
  score         int not null,
  kills         int not null,
  deaths        int not null,
  assists       int not null,
  hs_kills      int not null,
  knife_kills   int not null,
  nade_kills    int not null,
  flash_assists int not null,
  best_streak   int not null,
  longest_kill  real not null,
  plants        int not null default 0,
  defuses       int not null default 0,
  constraint match_results_once unique (user_id, match_key),
  constraint mr_map   check (map in ('brickhall', 'steelyard', 'boston', 'meridian')),
  constraint mr_mode  check (mode in ('tdm', 'elim', 'bomb')),
  constraint mr_range check (match_key between 0 and 2147483647 and humans between 2 and 10 and duration between 30 and 7200
    and kills between 0 and 300 and deaths between 0 and 300 and assists between 0 and 300 and longest_kill between 0 and 500),
  constraint mr_consistent check (hs_kills between 0 and kills and knife_kills >= 0 and nade_kills >= 0
    and knife_kills + nade_kills <= kills and best_streak between 0 and kills and flash_assists between 0 and assists
    and score between 0 and 125 * kills + 50 * assists + 200 * (plants + defuses) and kills * 2 <= duration and deaths * 2 <= duration),
  constraint mr_bomb  check (plants between 0 and 9 and defuses between 0 and 9 and (mode = 'bomb' or (plants = 0 and defuses = 0)))
);
-- migrasi tabel lama (aman diulang): map Meridian Vault, mode Bomb Mission, kolom tanam/jinak bom & aturan skornya
alter table public.match_results add column if not exists plants int not null default 0;
alter table public.match_results add column if not exists defuses int not null default 0;
alter table public.match_results drop constraint if exists mr_map;
alter table public.match_results add constraint mr_map check (map in ('brickhall', 'steelyard', 'boston', 'meridian'));
alter table public.match_results drop constraint if exists mr_mode;
alter table public.match_results add constraint mr_mode check (mode in ('tdm', 'elim', 'bomb'));
alter table public.match_results drop constraint if exists mr_consistent;
alter table public.match_results add constraint mr_consistent check (hs_kills between 0 and kills and knife_kills >= 0 and nade_kills >= 0
  and knife_kills + nade_kills <= kills and best_streak between 0 and kills and flash_assists between 0 and assists
  and score between 0 and 125 * kills + 50 * assists + 200 * (plants + defuses) and kills * 2 <= duration and deaths * 2 <= duration);
alter table public.match_results drop constraint if exists mr_bomb;
alter table public.match_results add constraint mr_bomb check (plants between 0 and 9 and defuses between 0 and 9
  and (mode = 'bomb' or (plants = 0 and defuses = 0)));
create index if not exists match_results_key on public.match_results (match_key);
create index if not exists match_results_user_time on public.match_results (user_id, created_at);
create index if not exists match_results_time on public.match_results (created_at);

-- kunci 1: tanpa hak tabel (Supabase memberi hak penuh ke anon/authenticated pada tabel baru di schema public — dicabut di sini)
revoke all on table public.profiles, public.match_results from public, anon, authenticated;
-- kunci 2: RLS aktif tanpa policy = semua akses langsung ditolak walau ada hak yang terlanjur diberikan
alter table public.profiles enable row level security;
alter table public.match_results enable row level security;
-- (tanpa FORCE: fungsi di bawah dimiliki pemilik tabel & memang harus bisa membaca/menulis — mereka satu-satunya pintu)

-- ───────────────────────── nama terlarang (mirip staf / bot game)
create or replace function public.sw_reserved(p_name text) returns boolean
language sql immutable set search_path = '' as $$
  select lower(p_name) = any (array['admin', 'administrator', 'moderator', 'mod', 'support', 'system', 'root', 'owner', 'developer',
    'dev', 'staff', 'official', 'host', 'bot', 'pemain', 'guest', 'tamu', 'anon', 'anonymous', 'studwarfare', 'stud_warfare',
    'supabase', 'null', 'undefined', 'bata', 'paku', 'genteng', 'ubin', 'kapur', 'jati', 'mahoni', 'meranti', 'rotan', 'damar'])
$$;

-- ───────────────────────── profil sendiri
create or replace function public.get_my_profile()
returns table (username text, created_at timestamptz, name_changed_at timestamptz, banned boolean)
language sql stable security definer set search_path = '' as $$
  select p.username, p.created_at, p.name_changed_at, p.banned from public.profiles p where p.id = auth.uid()
$$;

-- Buat / ganti username. Ganti nama dibatasi sekali per 30 hari (nama di leaderboard stabil); hanya beda huruf besar/kecil = bebas.
create or replace function public.set_username(p_name text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  cur public.profiles%rowtype;
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if p_name is null or p_name !~ '^[A-Za-z0-9_]{3,16}$' or p_name !~ '[A-Za-z]' then raise exception 'bad_name' using errcode = '22023'; end if;
  if public.sw_reserved(p_name) then raise exception 'reserved_name' using errcode = '22023'; end if;
  select * into cur from public.profiles where id = uid for update;
  if not found then
    insert into public.profiles (id, username) values (uid, p_name);
    return p_name;
  end if;
  if cur.banned then raise exception 'banned' using errcode = '42501'; end if;
  if lower(cur.username) <> lower(p_name) and cur.name_changed_at > now() - interval '30 days' then
    raise exception 'name_cooldown' using errcode = '22023';
  end if;
  update public.profiles
     set username = p_name,
         name_changed_at = case when lower(cur.username) = lower(p_name) then cur.name_changed_at else now() end
   where id = uid;
  return p_name;
exception
  when unique_violation then raise exception 'name_taken' using errcode = '23505';
end $$;

-- Hapus akun sendiri (auth.users → profil & hasil match ikut terhapus).
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  delete from auth.users where id = uid;
end $$;

-- ───────────────────────── kirim hasil match (pemain hanya bisa mengirim hasilnya SENDIRI)
-- versi lama tanpa p_plants/p_defuses dibuang (bila tidak, panggilan tanpa keduanya ambigu antara dua fungsi)
drop function if exists public.submit_match(bigint, text, text, boolean, boolean, int, int, int, int, int, int, int, int, int, int, int, real);
create or replace function public.submit_match(
  p_match_key bigint, p_map text, p_mode text, p_won boolean, p_mvp boolean, p_humans int, p_duration int,
  p_score int, p_kills int, p_deaths int, p_assists int, p_hs_kills int, p_knife_kills int, p_nade_kills int,
  p_flash_assists int, p_best_streak int, p_longest_kill real, p_plants int default 0, p_defuses int default 0
) returns text
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  prof public.profiles%rowtype;
  last_at timestamptz;
  today int;
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into prof from public.profiles where id = uid;
  if not found then raise exception 'no_profile' using errcode = '42501'; end if;
  if prof.banned then raise exception 'banned' using errcode = '42501'; end if;
  -- batas laju: ≥ 30 s antar kiriman (= durasi match minimum), ≤ 60 per 24 jam, dan durasi match tidak boleh lebih lama dari jeda
  -- sejak kiriman terakhir (dua match 10 menit tidak bisa selesai dalam 1 menit)
  select max(created_at) into last_at from public.match_results where user_id = uid;
  if last_at is not null and last_at > now() - interval '30 seconds' then raise exception 'too_fast' using errcode = '54000'; end if;
  if last_at is not null and p_duration > extract(epoch from (now() - last_at)) + 60 then
    raise exception 'bad_duration' using errcode = '22023';
  end if;
  select count(*) into today from public.match_results where user_id = uid and created_at > now() - interval '24 hours';
  if today >= 60 then raise exception 'daily_limit' using errcode = '54000'; end if;
  -- isi divalidasi oleh constraint tabel (rentang & konsistensi); duplikat match yang sama diabaikan
  insert into public.match_results (user_id, match_key, map, mode, won, mvp, humans, duration, score, kills, deaths, assists,
    hs_kills, knife_kills, nade_kills, flash_assists, best_streak, longest_kill, plants, defuses)
  values (uid, p_match_key, p_map, p_mode, coalesce(p_won, false), coalesce(p_mvp, false), p_humans, p_duration, p_score, p_kills,
    p_deaths, p_assists, p_hs_kills, p_knife_kills, p_nade_kills, p_flash_assists, p_best_streak, p_longest_kill,
    coalesce(p_plants, 0), coalesce(p_defuses, 0))
  on conflict (user_id, match_key) do nothing;
  return 'ok';
exception
  when check_violation or not_null_violation or numeric_value_out_of_range then raise exception 'bad_result' using errcode = '22023';
end $$;

-- ───────────────────────── leaderboard (publik: hanya username + angka)
-- Hanya hasil match yang TERKONFIRMASI dihitung: ≥ 1 akun lain mengirim match yang sama (match_key) dalam 3 jam — satu orang tidak
-- bisa mengarang match sendirian. Akun yang diblokir tidak tampil. Mingguan = sejak Senin 00:00 WIB.
create or replace function public.get_leaderboard(p_board text, p_period text, p_limit int default 20)
returns table (rank int, username text, value real, matches int, is_me boolean)
language plpgsql stable security definer set search_path = '' as $$
declare
  since timestamptz;
  lim int := least(greatest(coalesce(p_limit, 20), 1), 50);
  min_matches int;
begin
  if p_board is null or p_board not in ('points', 'kills', 'kd', 'wins', 'mvp', 'knife', 'nade', 'flash', 'streak', 'longest',
      'wins_brickhall', 'wins_steelyard', 'wins_boston', 'wins_meridian') then
    raise exception 'bad_board' using errcode = '22023';
  end if;
  if p_period = 'week' then since := date_trunc('week', now() at time zone 'Asia/Jakarta') at time zone 'Asia/Jakarta';
  elsif p_period = 'all' then since := '-infinity';
  else raise exception 'bad_period' using errcode = '22023';
  end if;
  min_matches := case when p_board = 'kd' then (case when p_period = 'week' then 5 else 10 end) else 1 end;
  return query
  with conf as (
    select r.* from public.match_results r
    join public.profiles pr on pr.id = r.user_id and not pr.banned
    where r.created_at >= since
      and exists (select 1 from public.match_results o
                  join public.profiles op on op.id = o.user_id and not op.banned
                  where o.match_key = r.match_key and o.user_id <> r.user_id
                    and o.created_at between r.created_at - interval '3 hours' and r.created_at + interval '3 hours')
  ), agg as (
    select c.user_id, count(*)::int as n,
      (case p_board
        when 'points' then sum(c.score)::real
        when 'kills' then sum(c.kills)::real
        when 'kd' then (sum(c.kills)::real / greatest(sum(c.deaths), 1))
        when 'wins' then count(*) filter (where c.won)::real
        when 'mvp' then count(*) filter (where c.mvp)::real
        when 'knife' then sum(c.knife_kills)::real
        when 'nade' then sum(c.nade_kills)::real
        when 'flash' then sum(c.flash_assists)::real
        when 'streak' then max(c.best_streak)::real
        when 'longest' then max(c.longest_kill)::real
        when 'wins_brickhall' then count(*) filter (where c.won and c.map = 'brickhall')::real
        when 'wins_steelyard' then count(*) filter (where c.won and c.map = 'steelyard')::real
        when 'wins_boston' then count(*) filter (where c.won and c.map = 'boston')::real
        else count(*) filter (where c.won and c.map = 'meridian')::real
      end)::real as v
    from conf c group by c.user_id
  ), ranked as (
    select a.user_id, a.v, a.n, (row_number() over (order by a.v desc, a.n asc, pr.username asc))::int as rk, pr.username as uname
    from agg a join public.profiles pr on pr.id = a.user_id
    where a.n >= min_matches and a.v > 0
  )
  select x.rk, x.uname, x.v, x.n, coalesce(x.user_id = auth.uid(), false)
  from ranked x
  where x.rk <= lim or x.user_id = auth.uid()
  order by x.rk;
end $$;

-- ───────────────────────── hak eksekusi: cabut semua dulu (Supabase memberi EXECUTE ke anon/authenticated secara bawaan)
revoke all on function public.sw_reserved(text) from public, anon, authenticated;
revoke all on function public.get_my_profile() from public, anon, authenticated;
revoke all on function public.set_username(text) from public, anon, authenticated;
revoke all on function public.delete_my_account() from public, anon, authenticated;
revoke all on function public.submit_match(bigint, text, text, boolean, boolean, int, int, int, int, int, int, int, int, int, int, int, real, int, int)
  from public, anon, authenticated;
revoke all on function public.get_leaderboard(text, text, int) from public, anon, authenticated;

grant execute on function public.get_my_profile() to authenticated;
grant execute on function public.set_username(text) to authenticated;
grant execute on function public.delete_my_account() to authenticated;
grant execute on function public.submit_match(bigint, text, text, boolean, boolean, int, int, int, int, int, int, int, int, int, int, int, real, int, int)
  to authenticated;
grant execute on function public.get_leaderboard(text, text, int) to anon, authenticated;
