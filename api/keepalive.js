// api/keepalive.js — Vercel Function, dipanggil Vercel Cron sekali sehari (jadwal di vercel.json).
// Satu query kecil (SELECT 1 baris) ke database Supabase agar project paket gratis tidak DIJEDA karena "tidak ada aktivitas
// database" ±7 hari. Signaling room (Supabase Realtime) tidak dihitung sebagai aktivitas database, jadi tetap perlu ini.
// Tabel mini `keepalive` dibuat sekali lewat supabase/keepalive.sql (SQL Editor). Tanpa data pemain apa pun.
// Opsional: env CRON_SECRET di Vercel → hanya Vercel Cron yang boleh memanggil (Authorization: Bearer <CRON_SECRET>).

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }
  const url = process.env.VITE_SUPABASE_URL, key = process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) return res.status(500).json({ ok: false, error: 'env VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY belum diisi' });
  try {
    // hanya header apikey: berlaku untuk publishable key (sb_publishable_…) maupun anon key lama
    const r = await fetch(`${url.replace(/\/+$/, '')}/rest/v1/keepalive?select=id&limit=1`, { headers: { apikey: key } });
    const body = (await r.text()).slice(0, 300);
    return res.status(r.ok ? 200 : 502).json({ ok: r.ok, status: r.status, body, at: new Date().toISOString() });
  } catch (e) {
    return res.status(502).json({ ok: false, error: String(e), at: new Date().toISOString() });
  }
}
