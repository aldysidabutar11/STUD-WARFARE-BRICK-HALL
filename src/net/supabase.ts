// src/net/supabase.ts — SATU klien Supabase untuk seluruh game (signaling online + akun pemain), dimuat lazy (chunk terpisah, tidak
// memperbesar muatan awal). Kunci di sini = URL project + kunci PUBLIK (publishable/anon) — memang untuk browser; semua aturan akses
// ditegakkan database (supabase/accounts.sql: tabel terkunci, hanya fungsi tervalidasi). Kunci rahasia (service role) TIDAK pernah ada
// di game.
// Sesi login disimpan Supabase di localStorage kunci AUTH_STORAGE_KEY (pengecualian aturan "localStorage hanya settings" — wajib agar
// pemain tetap masuk setelah halaman dibuka lagi; disetujui bersama fitur akun). Alur PKCE: token tidak pernah lewat URL.
import type { SupabaseClient } from '@supabase/supabase-js';

export const AUTH_STORAGE_KEY = 'studwarfare.auth.v1';

/** URL + kunci publik dari env build (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY), null bila belum dipasang. */
export function supabaseEnv(): { url: string; key: string } | null {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined, key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  return url && key ? { url, key } : null;
}

let client: Promise<SupabaseClient> | null = null;

export function getSupabase(): Promise<SupabaseClient> {
  const env = supabaseEnv();
  if (!env) return Promise.reject(new Error('Supabase belum dikonfigurasi'));
  client ??= import('@supabase/supabase-js').then(({ createClient }) => createClient(env.url, env.key, {
    auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: AUTH_STORAGE_KEY },
  }));
  return client;
}
