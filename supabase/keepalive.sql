-- supabase/keepalive.sql — jalankan SEKALI di Supabase → SQL Editor → New query → Run.
-- Tabel mini 1 baris yang dibaca Vercel Cron tiap hari (api/keepalive.js) agar project gratis tidak dijeda.
-- Hanya bisa DIBACA dengan kunci publik (tidak bisa diubah/dihapus dari luar). Aman dijalankan ulang.

create table if not exists public.keepalive (
  id   int primary key,
  note text
);

insert into public.keepalive (id, note) values (1, 'stud-warfare keep-alive')
on conflict (id) do nothing;

alter table public.keepalive enable row level security;

drop policy if exists "keepalive baca publik" on public.keepalive;
create policy "keepalive baca publik" on public.keepalive for select to anon using (true);

grant select on public.keepalive to anon;
