// tests/blackbox.test.ts — kotak hitam (src/core/BlackBox.ts): sebab sesi berakhir & laporan bertahan saat halaman di-refresh.
// sessionStorage tiruan (Map) dipasang sebelum modul dimuat; "refresh" = membuat BlackBox baru di atas penyimpanan yang sama.
import { beforeEach, describe, expect, it } from 'vitest';

const mem = new Map<string, string>();
Object.assign(globalThis, {
  sessionStorage: {
    getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, v); },
    removeItem: (k: string) => { mem.delete(k); },
  },
});
const { BlackBox, endSummary, newSession, reportText } = await import('../src/core/BlackBox');

describe('BlackBox — sebab sesi berakhir', () => {
  beforeEach(() => mem.clear());

  it('di menu (bukan match / room online) → berakhir normal, tidak ada pemberitahuan', () => {
    const s = newSession(); s.closed = true;
    expect(endSummary(s)).toBeNull();
  });

  it('host ter-refresh di tengah Eliminasi → "di-refresh / ditutup", sebut host & teman terputus', () => {
    const s = newSession(); s.state = { inMatch: true, role: 'host', mode: 'elim', map: 'steelyard', match: 7, room: true }; s.closed = true;
    const why = endSummary(s)!;
    expect(why).toMatch(/di-refresh \/ ditutup/);
    expect(why).toMatch(/Eliminasi/);
    expect(why).toMatch(/host/);
    s.entries.push({ t: 1, k: 'keluar-halaman', m: 'dialog "Yakin keluar?" ditampilkan' });
    expect(endSummary(s)).toMatch(/dipilih keluar/);
  });

  it('tanpa penutupan normal → crash / kehabisan memori; grafis hilang tanpa pulih → sebab grafis; muat ulang disengaja → alasannya', () => {
    const s = newSession(); s.state.inMatch = true; s.state.mode = 'tdm';
    expect(endSummary(s)).toMatch(/crash|memori/);
    s.entries.push({ t: 1, k: 'grafis-hilang', m: '' });
    expect(endSummary(s)).toMatch(/Grafis \(WebGL\) hilang/);
    s.entries.push({ t: 2, k: 'grafis-pulih', m: '' });
    expect(endSummary(s)).toMatch(/crash|memori/);                     // sudah pulih → bukan sebab
    s.closeReason = 'ganti preset grafis';
    expect(endSummary(s)).toMatch(/ganti preset grafis/);
  });

  it('room online tanpa match (host dengan teman di room) tetap dianggap tidak normal', () => {
    const s = newSession(); s.state.room = true; s.closed = true;
    expect(endSummary(s)).toMatch(/room online/);
  });
});

describe('BlackBox — bertahan saat halaman di-refresh (sessionStorage)', () => {
  beforeEach(() => mem.clear());

  it('sesi tidak normal terbaca setelah "refresh", bertahan sampai ditutup, laporan berisi kedua sesi', () => {
    const a = new BlackBox();
    a.info('versi index-abc.js · preset MEDIUM');
    a.state({ inMatch: true, role: 'host', mode: 'elim', map: 'steelyard', match: 7, room: true });
    a.log('match-mulai', '#7 elim · steelyard · peran host');
    a.log('koneksi', 'dari teman 1a2b3c: connected');
    a.closing();                                                       // pagehide saat refresh
    const b = new BlackBox();                                          // halaman baru
    expect(b.prevIssue()?.text).toMatch(/di-refresh \/ ditutup di tengah match Eliminasi/);
    const rep = b.report();
    expect(rep).toMatch(/Sesi sebelumnya/);
    expect(rep).toMatch(/match-mulai: #7 elim/);
    expect(rep).toMatch(/versi index-abc\.js/);
    expect(rep).toMatch(/Sesi ini/);
    const c = new BlackBox();                                          // refresh lagi sebelum ditutup → masih ada
    expect(c.prevIssue()).not.toBeNull();
    c.dismissPrev();
    expect(new BlackBox().prevIssue()).toBeNull();                     // sudah ditutup pengguna
  });

  it('sesi normal tidak memunculkan pemberitahuan; catatan dibatasi 80 & pesan beruntun bisa diredam', () => {
    const a = new BlackBox();
    for (let i = 0; i < 120; i++) a.log('perf', `#${i}`);
    expect(a.cur.entries).toHaveLength(80);
    expect(a.cur.entries[0].m).toBe('#40');
    a.log('pintasan-dicegah', 'Ctrl+R', 2000); a.log('pintasan-dicegah', 'Ctrl+R', 2000);
    expect(a.cur.entries.filter(e => e.k === 'pintasan-dicegah')).toHaveLength(1);
    a.closing();
    expect(new BlackBox().prevIssue()).toBeNull();
  });

  it('laporan teks polos memuat keadaan terakhir & sebabnya', () => {
    const s = newSession(); s.state.inMatch = true; s.state.mode = 'elim'; s.state.match = 3; s.state.map = 'brickhall';
    const t = reportText(null, s);
    expect(t).toMatch(/dalam match ke-3 Eliminasi · brickhall/);
    expect(t).toMatch(/TIDAK ada penutupan normal/);
    expect(t).toMatch(/sebab berakhir/);
  });
});
