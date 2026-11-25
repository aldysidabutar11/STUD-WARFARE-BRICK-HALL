// src/net/Ticket.ts — tiket kembali ke match online setelah halaman di-refresh / ditutup tanpa sengaja (laporan pengguna 2026-11-25:
// host ter-refresh di tengah Eliminasi). Teman-teman sekarang melanjutkan (pindah host); tiket ini membuat pemain yang halamannya
// hilang bisa masuk lagi ke SLOT LAMANYA dengan satu klik dari menu utama.
// Disimpan di sessionStorage (bertahan saat refresh, hilang saat tab ditutup) — localStorage tetap khusus settings.
//  • klien: kode room host sekarang (+ kode rencana pindah host, bila host juga hilang selama itu)
//  • host : kode room BERIKUTNYA (tempat teman-teman melanjutkan setelah host ini hilang) — hanya bila ada teman tersambung
import { XCFG } from '../config/extraConfig';
import { parseRoomCode } from '../game/Lobby';

export interface Ticket {
  /** Kode room yang dicoba dulu, lalu cadangan (null = tidak ada). */
  code: string; alt: string | null;
  /** pid lama (host mengembalikan slotnya) & nama pemain. */
  pid: string; name: string;
  /** Waktu tiket terakhir diperbarui (ms epoch) + sedang di tengah match. */
  t: number; match: boolean;
}

const KEY = 'studwarfare.rejoin.v1';
const PID = /^p\d{1,6}$/;

/** Tiket dari penyimpanan → divalidasi; kedaluwarsa (XCFG.net.ticketTtl) → null. Murni (diuji). */
export function parseTicket(raw: unknown, now: number): Ticket | null {
  const r = raw as Record<string, unknown> | null;
  if (!r || typeof r !== 'object') return null;
  const code = parseRoomCode(String(r.code ?? '')), alt = r.alt == null ? null : parseRoomCode(String(r.alt));
  const t = typeof r.t === 'number' && Number.isFinite(r.t) ? r.t : NaN;
  if (!code || typeof r.pid !== 'string' || !PID.test(r.pid) || !(now - t >= 0 && now - t <= XCFG.net.ticketTtl * 1000)) return null;
  return { code, alt: alt && alt !== code ? alt : null, pid: r.pid, name: typeof r.name === 'string' ? r.name.slice(0, 16) : '', t, match: !!r.match };
}

function store(): Storage | null {
  try { return typeof sessionStorage === 'undefined' ? null : sessionStorage; } catch { return null; }
}

export function loadTicket(now = Date.now()): Ticket | null {
  try { const s = store()?.getItem(KEY); return s ? parseTicket(JSON.parse(s), now) : null; } catch { return null; }
}

export function saveTicket(t: Ticket | null) {
  try { const s = store(); if (!s) return; if (t) s.setItem(KEY, JSON.stringify(t)); else s.removeItem(KEY); } catch { /* penyimpanan penuh / diblokir */ }
}
