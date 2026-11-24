// tests/lobby.test.ts — room / lobby main bareng (permintaan pengguna): 5v5, slot kosong diisi bot, pindah tim, siap, setelan host,
// kode room & link, nama aman, roster match, pilihan map (multi-map: map tertentu / Acak). Logika murni game/Lobby.ts.
import { describe, expect, it } from 'vitest';
import {
  Lobby, cleanName, cleanRoomSettings, formatRoomCode, isMapChoice, makeRoomCode, parseRoomCode, pickMap, validRoomPatch, type RoomSettings,
} from '../src/game/Lobby';
import { MAP_IDS } from '../src/world/maps/types';
import { XCFG } from '../src/config/extraConfig';
import { makeRng } from '../src/core/Rng';
import { validate } from '../src/ui/Settings';

const S = (): RoomSettings => ({ mode: 'tdm', scoreLimit: 50, timeLimit: 10, roundsToWin: 5, difficulty: 'normal', fillBots: true, map: 'brickhall' });
/** Room dengan host + n teman (teman masuk bergantian ke tim yang lebih sedikit). */
function room(n: number) {
  const L = new Lobby('K7RB2X', S());
  const host = L.join('Aldy', { local: true })!;
  const friends = Array.from({ length: n }, (_, i) => L.join('Teman' + i)!);
  return { L, host, friends };
}

describe('Kode room & nama', () => {
  it('kode 6 karakter dari alfabet tanpa I/O/0/1; tampil "XXX-XXX"', () => {
    const rng = makeRng(7);
    for (let i = 0; i < 200; i++) {
      const c = makeRoomCode(rng);
      expect(c).toHaveLength(XCFG.lobby.codeLen);
      expect([...c].every(ch => XCFG.lobby.codeAlphabet.includes(ch))).toBe(true);
    }
    expect(formatRoomCode('K7RB2X')).toBe('K7R-B2X');
  });
  it('kode dari ketikan bebas atau link room', () => {
    expect(parseRoomCode('k7r-b2x')).toBe('K7RB2X');
    expect(parseRoomCode(' K7R B2X ')).toBe('K7RB2X');
    expect(parseRoomCode('https://contoh.id/game/?room=K7RB2X')).toBe('K7RB2X');
    expect(parseRoomCode('K7RB2')).toBeNull();          // terlalu pendek
    expect(parseRoomCode('K7RB2O')).toBeNull();         // O tidak ada di alfabet
  });
  it('nama aman untuk HTML: tanpa < > & tanda kutip, maks 16, spasi dirapikan', () => {
    expect(cleanName('  <b>Aldy</b>  "x"  ')).toBe('bAldyb x');
    expect(cleanName('Raka_99.id-ok')).toBe('Raka_99.id-ok');
    expect(cleanName('Ayu Putri Lestari Sekali')).toHaveLength(XCFG.lobby.nameMax);
    expect(validate({ playerName: '<script>' } as never).playerName).toBe('script');
  });
});

describe('Room: 5v5, slot kosong diisi bot', () => {
  it('6 orang → 3 lawan 3 manusia + 4 bot pengisi (2 per tim), selalu 5v5', () => {
    const { L } = room(5);
    expect(L.humans('blue')).toHaveLength(3);
    expect(L.humans('red')).toHaveLength(3);
    expect(L.size('blue')).toBe(5); expect(L.size('red')).toBe(5);
    const bots = [...L.slots('blue'), ...L.slots('red')].filter(s => s.bot).length;
    expect(bots).toBe(4);
  });
  it('isi bot mati → hanya manusia; tim kosong tidak bisa mulai', () => {
    const { L, host } = room(0);
    L.setSettings(host.id, { fillBots: false });
    expect(L.size('red')).toBe(0);
    const c = L.canStart(host.id);
    expect(c.ok).toBe(false);
  });
  it('nama bot tetap per posisi slot: Biru 5 nama pertama, Merah 5 berikutnya', () => {
    const { L } = room(0);
    const names = XCFG.bots.names;
    expect(L.slots('blue').slice(1).map(s => s.bot)).toEqual(names.slice(1, 5));
    expect(L.slots('red').map(s => s.bot)).toEqual(names.slice(5, 10));
  });
  it('room penuh di 10 orang; pemain keluar → slotnya kembali bot; host keluar → host pindah', () => {
    const { L, host, friends } = room(9);
    expect(L.full).toBe(true);
    expect(L.join('Kesebelas')).toBeNull();
    L.leave(friends[0].id);
    expect(L.players).toHaveLength(9);
    expect(L.size(friends[0].team)).toBe(5);                 // slot kosong diisi bot lagi
    L.leave(host.id);
    expect(L.host?.id).toBe(friends[1].id);
    expect(L.host?.ready).toBe(true);
  });
});

describe('Room: tim, siap, host', () => {
  it('pindah tim hanya bila ada slot; status siap direset', () => {
    const { L, friends } = room(4);
    const f = friends[0];
    L.setReady(f.id, true);
    const to = f.team === 'blue' ? 'red' : 'blue';
    expect(L.switchTeam(f.id, to)).toBe(true);
    expect(f.ready).toBe(false);
    const full = room(9);
    const p = full.friends[0];
    expect(full.L.switchTeam(p.id, p.team === 'blue' ? 'red' : 'blue')).toBe(false);   // tim tujuan sudah 5 orang
  });
  it('mulai: hanya host, setelah semua teman siap', () => {
    const { L, host, friends } = room(2);
    expect(L.canStart(friends[0].id).ok).toBe(false);
    const c = L.canStart(host.id);
    expect(c.ok).toBe(false);
    if (!c.ok) expect(c.reason).toMatch(/2 pemain siap/);
    for (const f of friends) L.setReady(f.id, true);
    expect(L.canStart(host.id).ok).toBe(true);
    L.resetReady();
    expect(L.canStart(host.id).ok).toBe(false);              // setelah match: siap lagi
  });
  it('setelan & acak tim & keluarkan pemain hanya oleh host; acak tim seimbang', () => {
    const { L, host, friends } = room(6);
    expect(L.setSettings(friends[0].id, { mode: 'elim' })).toBe(false);
    expect(L.setSettings(host.id, { mode: 'elim', difficulty: 'hard' })).toBe(true);
    expect(L.settings.mode).toBe('elim');
    expect(L.shuffle(friends[0].id, makeRng(1))).toBe(false);
    expect(L.shuffle(host.id, makeRng(3))).toBe(true);
    expect(Math.abs(L.humans('blue').length - L.humans('red').length)).toBeLessThanOrEqual(1);
    expect(L.kick(friends[1].id, friends[2].id)).toBe(false);
    expect(L.kick(host.id, friends[2].id)).toBe(true);
    expect(L.players).toHaveLength(6);
  });
  it('roster match: tim pemain lokal, urutan slot, jenis kamu / teman / bot', () => {
    const { L, host, friends } = room(3);
    L.switchTeam(host.id, 'red');
    const r = L.roster(host.id);
    expect(r.playerTeam).toBe('red');
    expect(r.blue).toHaveLength(5); expect(r.red).toHaveLength(5);
    const all = [...r.blue, ...r.red];
    expect(all.filter(e => e.kind === 'you')).toHaveLength(1);
    expect(all.filter(e => e.kind === 'friend')).toHaveLength(friends.length);
    expect(all.filter(e => e.kind === 'bot')).toHaveLength(10 - 1 - friends.length);
    expect(r.red.find(e => e.kind === 'you')?.name).toBe('Aldy');
  });
});

describe('Pilihan map (multi-map): room & setelan', () => {
  it('host memilih map (tertentu / Acak); pemain lain tidak bisa; nilai tak dikenal ditolak utuh', () => {
    const { L, host, friends } = room(2);
    expect(L.settings.map).toBe('brickhall');
    expect(L.setSettings(friends[0].id, { map: 'steelyard' })).toBe(false);               // bukan host
    expect(L.settings.map).toBe('brickhall');
    expect(L.setSettings(host.id, { map: 'steelyard' })).toBe(true);
    expect(L.settings.map).toBe('steelyard');
    expect(L.setSettings(host.id, { map: 'random' })).toBe(true);
    expect(L.settings.map).toBe('random');
    for (const bad of ['atlantis', 'Steelyard', '', 42, null, { id: 'brickhall' }])
      expect(L.setSettings(host.id, { map: bad } as never)).toBe(false);
    expect(L.setSettings(host.id, { mode: 'elim', map: 'nuketown' } as never)).toBe(false);  // satu nilai salah → patch ditolak utuh
    expect(L.settings).toMatchObject({ map: 'random', mode: 'tdm' });
    expect(L.setSettings(host.id, { hack: true } as never)).toBe(false);                    // kunci tak dikenal
    expect(validRoomPatch({ scoreLimit: 75, fillBots: false, map: 'brickhall' })).toBe(true);
    expect(validRoomPatch({ scoreLimit: 2.5 })).toBe(false);
    expect(validRoomPatch({ difficulty: 'insane' })).toBe(false);
  });
  it('map ikut toState → JSON → fromState (cermin klien); data rusak dari jaringan → bawaan aman', () => {
    const { L, host } = room(1);
    L.setSettings(host.id, { map: 'steelyard', mode: 'elim' });
    const C = Lobby.fromState(JSON.parse(JSON.stringify(L.toState())), L.players[1].id);
    expect(C.settings).toEqual(L.settings);
    L.setSettings(host.id, { map: 'random' });
    expect(Lobby.fromState(JSON.parse(JSON.stringify(L.toState())), host.id).settings.map).toBe('random');
    const st = JSON.parse(JSON.stringify(L.toState()));
    st.settings.map = 'atlantis'; st.settings.mode = 'ctf'; st.settings.scoreLimit = -3; st.settings.fillBots = 'ya';
    st.code = '<img src=x>'; st.players.push({ id: '"><b>', name: 'X' }, { id: 'p1', name: 'dobel' });
    const bad = Lobby.fromState(st, host.id);
    expect(bad.settings).toMatchObject({ map: 'brickhall', mode: 'tdm', scoreLimit: 50, fillBots: true, roundsToWin: 5, difficulty: 'normal' });
    expect(bad.code).toBe('');                                                               // bukan kode room sah
    expect(bad.players.map(p => p.id)).toEqual(['p1', 'p2']);                                // id aneh & ganda dibuang
    expect(cleanRoomSettings(undefined)).toMatchObject({ map: 'brickhall', mode: 'tdm' });
  });
  it('Acak diundi seragam dari semua map; map tertentu tetap; setelan lokal menerima Acak', () => {
    const rng = makeRng(11), seen = new Map<string, number>();
    for (let i = 0; i < 400; i++) { const m = pickMap('random', rng); seen.set(m, (seen.get(m) ?? 0) + 1); }
    expect([...seen.keys()].sort()).toEqual([...MAP_IDS].sort());                            // hanya id konkret, semua muncul
    for (const n of seen.values()) expect(n).toBeGreaterThan(400 / MAP_IDS.length * 0.7);
    expect(pickMap('random', () => 0.999999)).toBe(MAP_IDS[MAP_IDS.length - 1]);
    expect(pickMap('steelyard', () => 0)).toBe('steelyard');
    expect([isMapChoice('random'), isMapChoice('brickhall'), isMapChoice('atlantis'), isMapChoice(undefined)]).toEqual([true, true, false, false]);
    expect(validate({ map: 'random' } as never).map).toBe('random');
    expect(validate({ map: 'steelyard' } as never).map).toBe('steelyard');
    expect(validate({ map: 'atlantis' } as never).map).toBe('brickhall');
  });
});
