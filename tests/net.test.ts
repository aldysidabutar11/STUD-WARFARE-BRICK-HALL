// tests/net.test.ts — multiplayer: codec biner perintah/snapshot, kuantisasi sama di klien & host, jam tick host, interpolasi,
// riwayat perintah (prediksi + rekonsiliasi), antrean perintah remote di host, serialisasi room untuk klien.
import { describe, expect, it } from 'vitest';
import {
  H, I, decodeCommands, decodeSnapshot, encodeCommands, encodeSnapshot, msgType, MSG, qPitch, qYaw, type Command, type EntState, type Snapshot,
} from '../src/net/protocol';
import { CommandHistory, CommandQueue, HostClock, InterpBuffer } from '../src/net/sync';
import { Lobby, type RoomSettings } from '../src/game/Lobby';
import { parseStart } from '../src/net/start';

const cmd = (seq: number, o: Partial<Command> = {}): Command =>
  ({ seq, mx: 0, mz: 1, yaw: 1.2, pitch: -0.3, held: H.FIRE | H.AIM, imp: I.JUMP | I.RELOAD, viewTick: 1000 + seq, ...o });

const ent = (id: number, o: Partial<EntState> = {}): EntState => ({
  id, flags: 1 | 2, x: 1.5, y: 10, z: -42.25, yaw: 3.1, pitch: 0.2, vx: 7.5, vz: -2.25, hp: 87, crouchT: 0.5,
  slot: 1, gstate: 3, meleeKind: 2, meleeT: 0.31, reloadP: -1, throwAnimT: -1, stepPhase: 12.75, ...o,
});

describe('Codec perintah (klien → host)', () => {
  it('round-trip: seq, gerak, sudut (16-bit), tombol, tick tampilan', () => {
    const src = [cmd(41), cmd(42, { mx: -1, mz: 0.5, yaw: 6.0, pitch: 1.2, held: H.CROUCH, imp: I.SLOT_KNIFE | I.FIRE_P })];
    const buf = encodeCommands(src);
    expect(msgType(buf)).toBe(MSG.CMD);
    expect(buf.byteLength).toBeLessThan(2 + 17 * 2 + 1);
    const out = decodeCommands(buf);
    expect(out).toHaveLength(2);
    expect(out[1].seq).toBe(42); expect(out[1].mx).toBeCloseTo(-1, 2); expect(out[1].mz).toBeCloseTo(0.5, 1);
    expect(out[1].yaw).toBeCloseTo(6.0, 3); expect(out[1].pitch).toBeCloseTo(1.2, 3);
    expect(out[1].held).toBe(H.CROUCH); expect(out[1].imp).toBe(I.SLOT_KNIFE | I.FIRE_P); expect(out[0].viewTick).toBe(1041);
  });
  it('kuantisasi sudut deterministik: host memakai nilai yang persis sama dengan prediksi klien', () => {
    for (const y of [0, 0.001, 1.234, Math.PI, 6.28, -0.5]) {
      const back = decodeCommands(encodeCommands([cmd(1, { yaw: y, pitch: y / 4 })]))[0];
      expect(back.yaw).toBeCloseTo(qYaw(y), 9);
      expect(back.pitch).toBeCloseTo(qPitch(y / 4), 9);
    }
  });
});

describe('Codec snapshot (host → klien)', () => {
  const snap = (): Snapshot => ({
    tick: 123456, ack: 789, match: { state: 3, sb: 12, sr: 9, timeLeft: 431.5, countdown: 0, round: 1 },
    ents: [ent(1), ent(7, { flags: 0, hp: 0, reloadP: 0.5, meleeT: -1, slot: 0, gstate: 0, meleeKind: 0 })],
    own: { x: 1, y: 2, z: 3, vx: 4, vz: 5, velY: -6, crouchT: 0.25, coyote: 0.1, jumpBuf: 0, airCap: 9.5, peakY: 12, stepPhase: 3.5,
      grounded: true, crouched: false, sprinting: true, crouchQueued: null, ammo: 27, reserve: 120, modeIdx: 1, grenades: 1, shots: 340 },
    nades: [{ id: 3, x: 0.5, y: 4, z: -9, fuse: 2.4, owner: 7 }],
    shots: [{ shooter: 7, x: 1, y: 2, z: 3, kind: 2, nx: 0, ny: 1, nz: 0, mat: 1, victim: 1, part: 0 }],
    fx: [{ type: 2, ent: 7, a: 1, x: 0, y: 5, z: 0 }],
  });
  it('round-trip lengkap; ukuran ±hemat (10 entitas + keadaan sendiri f64 < 500 B tanpa efek)', () => {
    const s = snap(), out = decodeSnapshot(encodeSnapshot(s))!;
    expect(out.tick).toBe(123456); expect(out.ack).toBe(789);
    expect(out.match).toEqual({ state: 3, sb: 12, sr: 9, timeLeft: 431.5, countdown: 0, round: 1 });
    const e = out.ents[0];
    expect(e.x).toBeCloseTo(1.5, 5); expect(e.z).toBeCloseTo(-42.25, 5); expect(e.yaw).toBeCloseTo(3.1, 3);
    expect(e.vx).toBeCloseTo(7.5, 2); expect(e.hp).toBe(87); expect(e.crouchT).toBeCloseTo(0.5, 2);
    expect([e.slot, e.gstate, e.meleeKind]).toEqual([1, 3, 2]); expect(e.meleeT).toBeCloseTo(0.31, 2); expect(e.reloadP).toBe(-1);
    expect(e.stepPhase).toBeCloseTo(12.75, 5);
    expect(out.ents[1].reloadP).toBeCloseTo(0.5, 2); expect(out.ents[1].meleeT).toBe(-1);
    expect(out.own).toMatchObject({ x: 1, vz: 5, velY: -6, grounded: true, sprinting: true, crouchQueued: null, ammo: 27, shots: 340 });
    const exact = decodeSnapshot(encodeSnapshot({ ...s, own: { ...s.own!, x: 1.6382947112, z: -21.70571234567 } }))!;
    expect(exact.own!.x).toBe(1.6382947112); expect(exact.own!.z).toBe(-21.70571234567);              // f64: bit-identik dengan host
    expect(out.nades[0]).toMatchObject({ id: 3, x: 0.5, y: 4, z: -9, owner: 7 }); expect(out.nades[0].fuse).toBeCloseTo(2.4, 1);
    expect(out.shots[0]).toMatchObject({ shooter: 7, kind: 2, victim: 1 }); expect(out.shots[0].ny).toBeCloseTo(1, 2);
    expect(out.fx[0]).toEqual({ type: 2, ent: 7, a: 1, x: 0, y: 5, z: 0 });
    const ten = { ...snap(), ents: Array.from({ length: 10 }, (_, i) => ent(i + 1)), shots: [], fx: [], nades: [] };
    expect(encodeSnapshot(ten).byteLength).toBeLessThan(500);
  });
});

describe('Sinkronisasi', () => {
  it('jam host: tick sekarang ≈ tick snapshot tercepat + waktu berlalu', () => {
    const c = new HostClock(60, 0);
    c.onSnapshot(600, 10.05);   // datang 50 ms setelah dikirim
    c.onSnapshot(603, 10.06);   // datang lebih cepat (latensi kecil) → perkiraan naik
    expect(c.tickAt(10.06)).toBeCloseTo(603, 5);
    expect(c.tickAt(11.06)).toBeCloseTo(663, 5);
  });
  it('interpolasi posisi & yaw (lewat ±π), tahan di tepi, tidak meluncur saat teleport', () => {
    const b = new InterpBuffer(), out = ent(0);
    b.push({ ...ent(5, { x: 0, yaw: 3.0 }), tick: 100 });
    b.push({ ...ent(5, { x: 3, yaw: -3.0 }), tick: 103 });
    b.sample(101.5, out);
    expect(out.x).toBeCloseTo(1.5, 5);
    expect(Math.abs(Math.atan2(Math.sin(out.yaw), Math.cos(out.yaw)))).toBeGreaterThan(3.0);   // lewat π, bukan lewat 0
    b.sample(200, out); expect(out.x).toBe(3);
    b.push({ ...ent(5, { x: 40 }), tick: 106 });                                                  // respawn jauh
    b.sample(104, out); expect(out.x).toBe(3);
    b.push({ ...ent(5, { x: 41 }), tick: 106 }); b.sample(106, out); expect(out.x).toBe(40);      // duplikat diabaikan
  });
  it('riwayat perintah: putar ulang seq > ack; kirim ulang n terakhir', () => {
    const h = new CommandHistory<{ x: number }>(64);
    for (let s = 1; s <= 10; s++) h.put(cmd(s), { x: s });
    expect(h.after(7, 10).map(c => c.seq)).toEqual([8, 9, 10]);
    expect(h.recent(10, 4).map(c => c.seq)).toEqual([7, 8, 9, 10]);
    expect(h.state(9)).toEqual({ x: 9 });
    for (let s = 11; s <= 80; s++) h.put(cmd(s), null);
    expect(h.cmd(9)).toBeNull();                                                                // tertimpa cincin
  });
  it('antrean remote: duplikat & basi dibuang, satu per tick, ditahan saat kosong, diam setelah idle', () => {
    const q = new CommandQueue(6);
    q.push([cmd(1), cmd(2), cmd(3)]); q.push([cmd(2), cmd(3), cmd(4)]);
    expect(q.pending).toBe(4);
    expect(q.next(1 / 60, 0.25)!.cmd.seq).toBe(1);
    expect(q.next(1 / 60, 0.25)!.prevHeld).toBe(H.FIRE | H.AIM);
    q.next(1 / 60, 0.25); q.next(1 / 60, 0.25);
    expect(q.lastSeq).toBe(4);
    expect(q.next(1 / 60, 0.25)).toBeNull();                                                    // kosong → tahan (tanpa mengarang)
    for (let i = 0; i < 20; i++) q.next(1 / 60, 0.25);
    const idle = q.next(1 / 60, 0.25)!;
    expect(idle.cmd.held).toBe(0); expect(idle.cmd.mz).toBe(0); expect(idle.cmd.imp).toBe(0);
    expect(idle.prevHeld).toBe(0);
    q.push([cmd(3)]); expect(q.pending).toBe(0);                                                 // basi (≤ lastSeq)
    q.push([cmd(5)]); expect(q.next(1 / 60, 0.25)!.prevHeld).toBe(0);                            // tombol dilepas saat diam → tekan baru
  });
  it('antrean remote: klien jauh di depan → yang tertua dibuang, impulsnya tidak hilang', () => {
    const q = new CommandQueue(3);
    q.push([cmd(1, { imp: I.JUMP }), cmd(2, { imp: 0 }), cmd(3, { imp: 0 }), cmd(4, { imp: I.RELOAD })]);
    expect(q.pending).toBe(3);
    const c = q.next(1 / 60, 0.25)!.cmd;
    expect(c.seq).toBe(2); expect(c.imp & I.JUMP).toBeTruthy();
  });
});

describe('Room online: serialisasi untuk klien', () => {
  it('klien mendapat cermin room dengan pemain lokalnya sendiri', () => {
    const S: RoomSettings = { mode: 'tdm', scoreLimit: 50, timeLimit: 10, roundsToWin: 5, difficulty: 'normal', fillBots: true };
    const L = new Lobby('K7RB2X', S);
    L.join('Aldy', { local: true });
    const f = L.join('Raka')!;
    f.variant = 'f'; f.weapon = 'akm'; f.scope = 'holo';
    const st = JSON.parse(JSON.stringify(L.toState()));
    const C = Lobby.fromState(st, f.id);
    expect(C.code).toBe('K7RB2X');
    expect(C.find(f.id)?.local).toBe(true);
    expect(C.players.filter(p => p.local)).toHaveLength(1);
    expect(C.slots('red')[0].player?.name).toBe('Raka');
    const r = C.roster(f.id);
    expect(r.red[0]).toMatchObject({ kind: 'you', pid: f.id, weapon: 'akm', variant: 'f' });
    expect(C.join('Baru')?.id).not.toBe(f.id);                                                 // nextId ikut tersalin
  });
});

describe('Pesan mulai match dari host (divalidasi di klien)', () => {
  const ent = (id: number, o: Record<string, unknown> = {}) => ({ id, team: id <= 5 ? 'blue' : 'red', name: 'P' + id, pid: null, bot: true,
    variant: 'm', weapon: 'akm', scope: 'holo', ...o });
  it('susunan sah diterima apa adanya', () => {
    const r = parseStart({ seed: 123, opts: { mode: 'elim', scoreLimit: 50, timeLimit: 600, roundsToWin: 3 },
      ents: [ent(1, { pid: 'p1', bot: false, variant: 'f' }), ent(6)] })!;
    expect(r.seed).toBe(123); expect(r.opts).toEqual({ mode: 'elim', scoreLimit: 50, timeLimit: 600, roundsToWin: 3 });
    expect(r.ents[0]).toEqual({ id: 1, team: 'blue', name: 'P1', pid: 'p1', bot: false, variant: 'f', weapon: 'akm', scope: 'holo' });
    expect(r.ents[1].team).toBe('red');
  });
  it('data rusak / berbahaya dibersihkan atau ditolak', () => {
    const r = parseStart({ seed: -1, opts: { mode: 'practice', scoreLimit: 1e9, timeLimit: -5, roundsToWin: 'x' },
      ents: [ent(2, { name: '<img src=x onerror=alert(1)>', weapon: 'railgun', scope: 'x99', team: 'green', variant: 'q' })] })!;
    expect(r.opts).toEqual({ mode: 'tdm', scoreLimit: 999, timeLimit: 30, roundsToWin: 5 });
    expect(r.ents[0].name).not.toMatch(/[<>"'=]/);
    expect(r.ents[0]).toMatchObject({ team: 'blue', variant: 'm', weapon: 'm416', scope: 'reddot' });
    expect(r.seed).toBe(0xffffffff);
    expect(parseStart({ seed: 1, opts: {}, ents: [ent(3), ent(3)] })).toBeNull();                 // id ganda
    expect(parseStart({ seed: 1, opts: {}, ents: [ent(0)] })).toBeNull();                          // id di luar batas
    expect(parseStart({ seed: 1, opts: {}, ents: Array.from({ length: 11 }, (_, i) => ent(i + 1)) })).toBeNull();   // > 10 entitas
    expect(parseStart({ seed: 1, ents: [ent(1)] })).toBeNull();                                    // tanpa aturan
  });
});
