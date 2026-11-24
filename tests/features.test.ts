// tests/features.test.ts — logika murni fitur pasca-MVP: rebind tombol, validasi settings, ronde Eliminasi, medali.
import { describe, expect, it } from 'vitest';
import { DEFAULT_BINDS, keyLabel, rebind, validateBinds } from '../src/core/Bindings';
import { DEFAULTS, validate } from '../src/ui/Settings';
import { elimRoundResult } from '../src/game/MatchManager';
import { nextMedal, type KillTrack } from '../src/ui/Announcer';
import { CFG } from '../src/config/gameConfig';

describe('Bindings', () => {
  it('default lengkap & unik', () => {
    const codes = Object.values(DEFAULT_BINDS);
    expect(new Set(codes).size).toBe(codes.length);
    expect(validateBinds(null)).toEqual(DEFAULT_BINDS);
  });
  it('kode tidak valid, tombol sistem & duplikat dibuang → default bila bebas', () => {
    const b = validateBinds({ forward: 'KeyI', back: 'KeyI', jump: 'Escape', reload: 42, melee: 'Mouse3' });
    expect(b.forward).toBe('KeyI');
    expect(b.back).toBe('KeyS');     // duplikat → default
    expect(b.jump).toBe('Space');    // Escape dicadangkan → default
    expect(b.reload).toBe('KeyR');
    expect(b.melee).toBe('Mouse3');  // tombol samping mouse boleh
  });
  it('string kosong eksplisit = tidak dipetakan', () => {
    expect(validateBinds({ view: '' }).view).toBe('');
  });
  it('rebind menukar tombol yang bentrok', () => {
    const b = rebind(DEFAULT_BINDS, 'reload', 'KeyF');
    expect(b.reload).toBe('KeyF');
    expect(b.melee).toBe('KeyR');
    expect(DEFAULT_BINDS.reload).toBe('KeyR'); // tidak memutasi input
  });
  it('label tombol', () => {
    expect(keyLabel('KeyW')).toBe('W');
    expect(keyLabel('Digit1')).toBe('1');
    expect(keyLabel('ShiftLeft')).toBe('Shift Kiri');
    expect(keyLabel('')).toBe('—');
  });
});

describe('Settings', () => {
  it('default mengikuti GDD (crosshair 8×2 putih, 50 kill, 10:00)', () => {
    const s = validate(null);
    expect(s.xhLen).toBe(8); expect(s.xhThick).toBe(2); expect(s.xhColor).toBe('#ffffff'); expect(s.xhMode).toBe('dynamic');
    expect(s.xhShape).toBe('cross'); expect(s.xhOutline).toBe(true); expect(s.xhOutlineThick).toBe(1);
    expect(s.scoreLimit).toBe(CFG.match.scoreLimit);
    expect(s.timeLimit * 60).toBe(CFG.match.timeLimit);
    expect(s.binds).toEqual(DEFAULT_BINDS);
    expect(s.binds).not.toBe(DEFAULTS.binds); // salinan, bukan referensi bersama
  });
  it('nilai di luar rentang/pilihan dikoreksi', () => {
    const s = validate({ xhLen: 99, xhThick: 0, xhColor: 'merah', scoreLimit: 33, renderScale: 0.3, brightness: 9, mode: 'ffa' as never, padSens: -1 });
    expect(s.xhLen).toBe(20); expect(s.xhThick).toBe(1); expect(s.xhColor).toBe('#ffffff');
    expect(s.scoreLimit).toBe(50); expect(s.renderScale).toBe(0); expect(s.brightness).toBe(1.6);
    expect(s.mode).toBe('tdm'); expect(s.padSens).toBe(0.3);
  });
});

describe('Eliminasi', () => {
  it('tim habis kalah; keduanya habis = seri', () => {
    expect(elimRoundResult(0, 2, 0, 150, false)).toBe('red');
    expect(elimRoundResult(3, 0, 200, 0, false)).toBe('blue');
    expect(elimRoundResult(0, 0, 0, 0, false)).toBe('draw');
  });
  it('ronde berlanjut selama dua tim hidup dan waktu masih ada', () => {
    expect(elimRoundResult(1, 1, 10, 100, false)).toBeNull();
  });
  it('waktu habis: jumlah hidup → total HP → seri', () => {
    expect(elimRoundResult(2, 1, 50, 100, true)).toBe('blue');
    expect(elimRoundResult(2, 2, 120, 180, true)).toBe('red');
    expect(elimRoundResult(1, 1, 60, 60, true)).toBe('draw');
  });
});

describe('Medali', () => {
  const fresh = (): KillTrack => ({ multi: 0, lastT: -99, streak: 0 });
  const o = { headshot: false, firstBlood: false, weapon: 'm416' as const };
  it('double / triple kill dalam jendela 4 s', () => {
    const st = fresh();
    expect(nextMedal(st, 10, o).medal).toBeNull();
    expect(nextMedal(st, 12, o).medal).toBe('DOUBLE KILL');
    expect(nextMedal(st, 15.5, o).medal).toBe('TRIPLE KILL');
    expect(nextMedal(st, 30, o).medal).toBeNull(); // jendela putus
  });
  it('streak 5 = KILLING SPREE (prioritas di atas multi-kill)', () => {
    const st = fresh();
    for (let i = 0; i < 4; i++) nextMedal(st, i * 10, o);
    expect(nextMedal(st, 41, o).medal).toBe('KILLING SPREE');
  });
  it('first blood, headshot, melee', () => {
    expect(nextMedal(fresh(), 0, { ...o, firstBlood: true }).medal).toBe('FIRST BLOOD');
    expect(nextMedal(fresh(), 0, { ...o, headshot: true }).medal).toBe('HEADSHOT');
    expect(nextMedal(fresh(), 0, { ...o, weapon: 'melee' as never }).medal).toBe('PUKULAN TELAK');
  });
});
