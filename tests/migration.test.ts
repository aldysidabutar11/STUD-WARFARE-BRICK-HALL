// tests/migration.test.ts — pindah host otomatis / serah-terima / bergabung ulang (logika murni): urutan pengganti, validasi rencana &
// cadangan pertandingan dari jaringan, jadwal pengambilalihan, antrean perintah sesi baru, pesan 'start' yang membawa cadangan.
import { describe, expect, it } from 'vitest';
import { makePlan, migrationTimes, parsePlan, parseSave, SAVE_V, type MatchSave, type SaveEnt } from '../src/net/Migration';
import { CommandQueue } from '../src/net/sync';
import { claimBeats, parseClaim } from '../src/net/Session';
import { parseTicket } from '../src/net/Ticket';
import { parseStart } from '../src/net/start';
import { H, type Command } from '../src/net/protocol';
import { XCFG } from '../src/config/extraConfig';

const N = XCFG.net;

describe('Rencana pengganti host', () => {
  it('ping terkecil dulu; belum terukur di belakang; seri → urutan masuk room; pid ganda dibuang', () => {
    const p = makePlan('K7RB2X', ['p4', 'p2', 'p3', 'p5', 'p2'], { p2: 80, p3: 35, p4: -1, p5: 80 }, ['p1', 'p5', 'p2', 'p3', 'p4']);
    expect(p).toEqual({ code: 'K7RB2X', order: ['p3', 'p5', 'p2', 'p4'] });
  });
  it('rencana dari jaringan divalidasi: kode room sah, pid berpola p<angka>, tanpa ganda, maks 10', () => {
    expect(parsePlan({ code: 'k7r-b2x', order: ['p2', 'p2', 'x', 7, 'p3'] })).toEqual({ code: 'K7RB2X', order: ['p2', 'p3'] });
    expect(parsePlan({ code: 'AB', order: ['p2'] })).toBeNull();                       // kode rusak
    expect(parsePlan({ code: 'K7RB2X', order: 'p2' })).toBeNull();                     // urutan bukan daftar
    expect(parsePlan(null)).toBeNull();
    const many = parsePlan({ code: 'K7RB2X', order: Array.from({ length: 30 }, (_, i) => 'p' + (i + 1)) })!;
    expect(many.order).toHaveLength(2 * XCFG.lobby.teamSize);
  });
  it('jadwal: semua coba host lama dulu (rejoinWait), pengganti ke-k menunggu k × migrateStep; serah-terima tanpa menunggu', () => {
    const plan = { code: 'K7RB2X', order: ['p3', 'p2', 'p4'] };
    expect(migrationTimes(plan, 'p3', false)).toMatchObject({ rank: 0, promoteAt: N.rejoinWait });
    expect(migrationTimes(plan, 'p2', false)).toMatchObject({ rank: 1, promoteAt: N.rejoinWait + N.migrateStep });
    expect(migrationTimes(plan, 'p4', false).promoteAt).toBe(N.rejoinWait + 2 * N.migrateStep);
    expect(migrationTimes(plan, 'p3', true)).toMatchObject({ rank: 0, promoteAt: 0 });
    // bukan anggota → tidak pernah jadi host, menyerah setelah migrateMax
    expect(migrationTimes(plan, 'p9', false)).toEqual({ rank: -1, promoteAt: Infinity, giveUpAt: N.migrateMax });
    // tiap anggota rencana (10 orang = 9 teman) tetap kebagian gilirannya sebelum menyerah
    const nine = { code: 'K7RB2X', order: Array.from({ length: 9 }, (_, i) => 'p' + (i + 2)) };
    for (const pid of nine.order) {
      const t = migrationTimes(nine, pid, false);
      expect(t.giveUpAt).toBeGreaterThanOrEqual(t.promoteAt + N.joinTry);
    }
    // pengganti berikutnya memberi pengganti sebelumnya waktu membuka room + satu jendela hello sebelum naik sendiri
    expect(N.migrateStep).toBeGreaterThan(N.joinTry);
    expect(N.helloEvery).toBeLessThan(N.migrateStep / 2);
  });
});

const ent = (id: number, o: Partial<SaveEnt> = {}): SaveEnt => ({
  id, alive: true, hp: 74, respawnT: 0, protectT: 0.5, x: 12.5, y: 10, z: -31.25, yaw: 2.1, pitch: -0.2, weapon: 'akm', scope: 'holo',
  ammo: 17, reserve: 90, modeIdx: 1, grenades: 2, stats: [3, 1, 2, 340, 60, 25, 6, 1, 812, 3], streak: 2, variant: 'f', flashes: 1, ...o,
});
const save = (o: Partial<MatchSave> = {}): MatchSave => ({
  v: SAVE_V, state: 'PLAYING', round: 3, timeLeft: 71.5, countdown: 0, sb: 2, sr: 1, winner: 'draw', roundWinner: null,
  ents: [ent(1), ent(6, { alive: false, hp: 0, respawnT: 2.4, variant: 'm' })], ...o,
});

describe('Cadangan pertandingan (MatchSave) dari jaringan', () => {
  it('cadangan sah lolos utuh (setelah JSON)', () => {
    const s = save();
    expect(parseSave(JSON.parse(JSON.stringify(s)))).toEqual(s);
  });
  it('ditolak: versi lain, keadaan bukan match, id ganda / di luar batas, angka bukan bilangan, statistik kurang', () => {
    expect(parseSave({ ...save(), v: 99 })).toBeNull();
    expect(parseSave({ ...save(), state: 'MENU' })).toBeNull();
    expect(parseSave({ ...save(), state: 'HACKED' })).toBeNull();
    expect(parseSave(save({ ents: [ent(3), ent(3)] }))).toBeNull();
    expect(parseSave(save({ ents: [ent(0)] }))).toBeNull();
    expect(parseSave(save({ ents: [ent(2, { hp: NaN })] }))).toBeNull();
    expect(parseSave({ ...save(), timeLeft: '9' })).toBeNull();
    expect(parseSave(save({ ents: [ent(2, { stats: [1, 2, 3] })] }))).toBeNull();
    expect(parseSave('save')).toBeNull();
  });
  it('nilai di luar batas dipotong (teman curang tidak bisa memberi HP/amunisi/waktu sembarang)', () => {
    const s = parseSave(save({ timeLeft: 1e9, sb: -4, round: 500,
      ents: [ent(2, { hp: 9999, ammo: 5000, reserve: -3, grenades: 77, pitch: 9, respawnT: 1e6, y: -1e4, stats: [1e12, -5, 0, 0, 0, 0, 0, 0, 0, 0] })] }))!;
    expect(s.timeLeft).toBe(7200); expect(s.sb).toBe(0); expect(s.round).toBe(99);
    expect(s.ents[0]).toMatchObject({ hp: 100, ammo: 200, reserve: 0, grenades: 9, pitch: 1.6, respawnT: 30, y: -100 });
    expect(s.ents[0].stats.slice(0, 2)).toEqual([1e7, 0]);
  });
  it('pemenang / pemenang ronde tak dikenal → nilai aman', () => {
    const s = parseSave({ ...save(), winner: 'green', roundWinner: 'blue' })!;
    expect(s.winner).toBe('draw'); expect(s.roundWinner).toBe('blue');
    expect(parseSave({ ...save(), roundWinner: 7 })!.roundWinner).toBeNull();
  });
});

describe('Pesan mulai match yang MELANJUTKAN pertandingan', () => {
  const ne = (id: number) => ({ id, team: id <= 5 ? 'blue' : 'red', name: 'P' + id, pid: null, bot: true, variant: 'm', weapon: 'akm', scope: 'holo' });
  const base = { seed: 9, opts: { mode: 'elim', scoreLimit: 50, timeLimit: 600, roundsToWin: 3 }, ents: [ne(1), ne(6)], map: 'brickhall' };
  it('cadangan sah ikut diteruskan; rusak / tidak ada → match biasa (tanpa resume)', () => {
    expect(parseStart({ ...base, resume: save() })!.resume).toEqual(save());
    expect('resume' in parseStart({ ...base, resume: { v: 99 } })!).toBe(false);
    expect('resume' in parseStart(base)!).toBe(false);
    expect('resume' in parseStart({ ...base, resume: null })!).toBe(false);
  });
});

describe('Antrean perintah: teman bergabung ulang (sesi baru → seq mulai dari 1)', () => {
  const cmd = (seq: number): Command => ({ seq, mx: 0, mz: 1, yaw: 0, pitch: 0, held: H.FIRE, imp: 0, viewTick: seq });
  it('tanpa restart perintah sesi baru dianggap basi; dengan restart diterima', () => {
    const q = new CommandQueue(6);
    q.push([cmd(40), cmd(41)]); q.next(1 / 60, 0.25); q.next(1 / 60, 0.25);
    expect(q.lastSeq).toBe(41);
    q.push([cmd(1), cmd(2)]);
    expect(q.pending).toBe(0);
    q.restart();
    q.push([cmd(1), cmd(2)]);
    expect(q.pending).toBe(2);
    const n = q.next(1 / 60, 0.25)!;
    expect(n.cmd.seq).toBe(1); expect(n.prevHeld).toBe(0);                // tombol sesi lama tidak terbawa
  });
});

describe('Dua host baru di kode yang sama (pengganti naik bersamaan)', () => {
  it('lebih banyak teman tersambung menang; seri → urutan pengganti lebih awal; seri → pid', () => {
    expect(claimBeats({ pid: 'p5', rank: 2, peers: 3 }, { pid: 'p2', rank: 0, peers: 1 })).toBe(true);
    expect(claimBeats({ pid: 'p2', rank: 0, peers: 1 }, { pid: 'p5', rank: 2, peers: 3 })).toBe(false);
    expect(claimBeats({ pid: 'p5', rank: 0, peers: 2 }, { pid: 'p2', rank: 1, peers: 2 })).toBe(true);
    expect(claimBeats({ pid: 'p2', rank: 1, peers: 0 }, { pid: 'p3', rank: 1, peers: 0 })).toBe(true);
    // tepat satu pemenang untuk pasangan mana pun
    const cs = [{ pid: 'p2', rank: 0, peers: 0 }, { pid: 'p3', rank: 1, peers: 0 }, { pid: 'p4', rank: 1, peers: 2 }, { pid: 'p5', rank: 0, peers: 2 }];
    for (const a of cs) for (const b of cs) if (a !== b) expect(claimBeats(a, b)).not.toBe(claimBeats(b, a));
  });
  it('klaim dari jaringan divalidasi', () => {
    expect(parseClaim({ pid: 'p3', rank: 1.2, peers: 2 })).toEqual({ pid: 'p3', rank: 1, peers: 2 });
    expect(parseClaim({ pid: 'p3', rank: 'x', peers: -9 })).toEqual({ pid: 'p3', rank: -1, peers: 0 });
    expect(parseClaim({ pid: 'admin', rank: 0, peers: 9 })).toBeNull();
    expect(parseClaim(null)).toBeNull();
  });
});

describe('Tiket kembali ke match (halaman ter-refresh / tertutup saat main bareng)', () => {
  const now = 1_800_000_000_000;
  const tk = { code: 'K7RB2X', alt: 'NXF4SK', pid: 'p3', name: 'Sinta', t: now - 60_000, match: true };
  it('tiket sah dipakai apa adanya; cadangan = kode utama dibuang', () => {
    expect(parseTicket(tk, now)).toEqual(tk);
    expect(parseTicket({ ...tk, alt: 'K7R-B2X' }, now)!.alt).toBeNull();
    expect(parseTicket({ ...tk, alt: null }, now)!.alt).toBeNull();
  });
  it('kedaluwarsa / dari masa depan / rusak → null', () => {
    expect(parseTicket({ ...tk, t: now - (N.ticketTtl + 1) * 1000 }, now)).toBeNull();
    expect(parseTicket({ ...tk, t: now + 5000 }, now)).toBeNull();
    expect(parseTicket({ ...tk, pid: 'host' }, now)).toBeNull();
    expect(parseTicket({ ...tk, code: 'AB' }, now)).toBeNull();
    expect(parseTicket({ ...tk, t: 'kemarin' }, now)).toBeNull();
    expect(parseTicket(null, now)).toBeNull();
  });
  it('nama dipotong 16 huruf; kode cadangan rusak diabaikan', () => {
    const t = parseTicket({ ...tk, name: 'x'.repeat(40), alt: '??' }, now)!;
    expect(t.name).toHaveLength(16); expect(t.alt).toBeNull();
  });
});
