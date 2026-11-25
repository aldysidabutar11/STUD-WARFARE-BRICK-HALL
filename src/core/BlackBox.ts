// src/core/BlackBox.ts — "kotak hitam": catatan kejadian penting terakhir (mulai/akhir match, grafis WebGL hilang/pulih, status
// koneksi WebRTC, error JS, pintasan browser yang dicegah, keluar halaman) di sessionStorage. sessionStorage bertahan saat halaman
// di-REFRESH di tab yang sama (hilang saat tab ditutup) — persis yang dibutuhkan untuk menjelaskan "game tiba-tiba ke-refresh"
// (laporan pengguna 2026-11-25: host ter-refresh di tengah Eliminasi → semua teman terlempar). BUKAN localStorage (khusus settings).
// Halaman berikutnya membaca catatan sesi sebelumnya; bila berakhir tidak normal (di tengah match / room online), menu utama
// menampilkan ringkasan sebabnya + tombol "Salin laporan" (teks polos, tanpa nama pemain).

const KEY = 'studwarfare.blackbox.v1';
const KEY_PREV = 'studwarfare.blackbox.prev.v1';
const MAX = 80;

export interface BBEntry { t: number; k: string; m: string }
export interface BBState {
  inMatch: boolean;
  /** offline | host | client */
  role: string;
  mode: string;
  map: string;
  /** match ke-n di halaman ini */
  match: number;
  /** sedang di room online (host dengan teman / klien) */
  room: boolean;
}
export interface BBSession {
  start: number;
  entries: BBEntry[];
  state: BBState;
  /** pagehide sempat terjadi (halaman ditutup/di-refresh/berpindah secara normal) */
  closed: boolean;
  /** alasan muat ulang yang disengaja game (mis. ganti preset grafis) */
  closeReason: string;
  /** detak terakhir (ms epoch) — perkiraan waktu halaman berhenti bila crash */
  beat: number;
  info: string;
}

const two = (n: number) => String(n).padStart(2, '0');
/** Jam lokal HH:MM:SS. */
export const clock = (t: number) => { const d = new Date(t); return `${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}`; };

export function newSession(t = Date.now()): BBSession {
  return { start: t, entries: [], state: { inMatch: false, role: 'offline', mode: '', map: '', match: 0, room: false }, closed: false,
    closeReason: '', beat: t, info: '' };
}

/** Sebab sesi berakhir (murni, diuji). null = berakhir normal (tidak di tengah match / room online). */
export function endSummary(s: BBSession): string | null {
  const live = s.state.inMatch || s.state.room;
  if (!live) return null;
  const where = s.state.inMatch ? `di tengah match ${modeName(s.state.mode)}${s.state.role === 'host' ? ' (kamu host — semua teman ikut terputus)' : ''}`
    : 'saat berada di room online';
  if (s.closeReason) return `Halaman dimuat ulang oleh game ${where}: ${s.closeReason}`;
  // grafis hilang yang tidak pernah pulih sebelum halaman berakhir
  for (let i = s.entries.length - 1; i >= 0; i--) {
    const k = s.entries[i].k;
    if (k === 'grafis-pulih') break;
    if (k === 'grafis-hilang') return `Grafis (WebGL) hilang dan tidak pulih ${where}`;
  }
  if (s.closed) {
    const asked = s.entries.some(e => e.k === 'keluar-halaman' && e.m.startsWith('dialog'));
    return `Halaman di-refresh / ditutup ${where}` + (asked ? ' — dialog "Yakin keluar?" muncul dan dipilih keluar/muat ulang'
      : ' (F5 / Ctrl+R / tutup tab / tombol kembali)');
  }
  return `Halaman berhenti mendadak tanpa sempat menutup ${where} — kemungkinan tab crash atau kehabisan memori`;
}

const modeName = (m: string) => (m === 'elim' ? 'Eliminasi' : m === 'tdm' ? 'Team Deathmatch' : m === 'practice' ? 'Latihan' : m);

/** Laporan teks polos untuk dikirim ke pengembang (murni, diuji). */
export function reportText(prev: BBSession | null, cur: BBSession): string {
  const sec = (title: string, s: BBSession) => {
    const out = [`== ${title} (mulai ${clock(s.start)}) ==`];
    if (s.info) out.push(s.info);
    const st = s.state;
    out.push(`keadaan terakhir: ${st.inMatch ? `dalam match ke-${st.match} ${modeName(st.mode)} · ${st.map}` : 'di menu'} · peran ${st.role}`
      + `${st.room ? ' · room online' : ''} · detak terakhir ${clock(s.beat)} · ${s.closed ? 'halaman ditutup normal' : 'TIDAK ada penutupan normal'}`);
    const why = endSummary(s);
    if (why) out.push(`sebab berakhir: ${why}`);
    for (const e of s.entries) out.push(`${clock(e.t)} ${e.k}${e.m ? ': ' + e.m : ''}`);
    return out.join('\n');
  };
  const parts = ['Stud Warfare — laporan teknis'];
  if (prev) parts.push(sec('Sesi sebelumnya', prev));
  parts.push(sec('Sesi ini', cur));
  return parts.join('\n\n');
}

type Store = { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void };
const store = (): Store | null => {
  try { return typeof sessionStorage === 'undefined' ? null : sessionStorage; } catch { return null; }
};
const read = (k: string): BBSession | null => {
  try {
    const raw = store()?.getItem(k);
    if (!raw) return null;
    const s = JSON.parse(raw) as BBSession;
    return s && Array.isArray(s.entries) && s.state ? s : null;
  } catch { return null; }
};

export class BlackBox {
  /** Sesi halaman SEBELUMNYA di tab ini (null = tidak ada / sudah ditutup pengguna). */
  prev: BBSession | null;
  readonly cur: BBSession;
  private lastLog = new Map<string, number>();

  constructor(t = Date.now()) {
    const s = store();
    const last = read(KEY);
    // sesi sebelumnya disimpan di kunci terpisah sampai pengguna menutup pemberitahuannya (refresh berikutnya tidak menghapusnya)
    this.prev = last && endSummary(last) ? last : read(KEY_PREV);
    try { if (this.prev) s?.setItem(KEY_PREV, JSON.stringify(this.prev)); } catch { /* penyimpanan penuh/diblokir */ }
    this.cur = newSession(t);
    this.save();
  }

  /** Catat kejadian. `throttleMs` > 0: jenis+pesan yang sama tidak dicatat ulang dalam jeda itu (mis. pintasan ditekan beruntun). */
  log(k: string, m = '', throttleMs = 0) {
    const t = Date.now();
    if (throttleMs > 0) {
      const key = k + '|' + m, last = this.lastLog.get(key) ?? -Infinity;
      if (t - last < throttleMs) return;
      this.lastLog.set(key, t);
    }
    const e = this.cur.entries;
    e.push({ t, k, m: m.length > 240 ? m.slice(0, 240) + '…' : m });
    if (e.length > MAX) e.splice(0, e.length - MAX);
    this.save();
  }

  state(p: Partial<BBState>) { Object.assign(this.cur.state, p); this.save(); }
  info(s: string) { this.cur.info = s; this.save(); }
  beat() { this.cur.beat = Date.now(); this.save(); }

  /** Halaman akan berakhir. reason = alasan muat ulang yang disengaja game (kosong = pagehide biasa). */
  closing(reason = '') {
    this.cur.closed = true;
    if (reason && !this.cur.closeReason) this.cur.closeReason = reason;
    this.cur.beat = Date.now();
    this.save();
  }

  /** Ringkasan masalah sesi sebelumnya untuk menu (null = tidak ada). */
  prevIssue(): { when: string; text: string } | null {
    const p = this.prev, why = p ? endSummary(p) : null;
    return p && why ? { when: clock(p.beat), text: why } : null;
  }
  dismissPrev() { this.prev = null; try { store()?.removeItem(KEY_PREV); } catch { /* abaikan */ } }
  report() { return reportText(this.prev, this.cur); }

  private save() { try { store()?.setItem(KEY, JSON.stringify(this.cur)); } catch { /* penyimpanan penuh/diblokir: catatan tetap di memori */ } }

  /** Pasang pencatat global (dipanggil sekali di main.ts): error JS, promise ditolak, tab tersembunyi, halaman berakhir, detak 5 s. */
  install() {
    addEventListener('error', (e) => this.log('error', `${e.message} @ ${(e.filename || '').split('/').pop()}:${e.lineno}`, 2000));
    addEventListener('unhandledrejection', (e) => this.log('error', 'promise: ' + String((e as PromiseRejectionEvent).reason), 2000));
    document.addEventListener('visibilitychange', () => this.log('tab', document.hidden ? 'tersembunyi' : 'terlihat'));
    addEventListener('pagehide', () => this.closing());
    setInterval(() => this.beat(), 5000);
  }
}

export const blackbox = new BlackBox();
