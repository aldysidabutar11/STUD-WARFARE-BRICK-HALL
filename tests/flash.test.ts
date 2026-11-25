// tests/flash.test.ts — flashbang (permintaan pengguna 2026-11-25): kekuatan silau dari arah/jarak/dinding, durasi (putih total
// 1.5–3 s, total sampai jernih 3–5 s), kurva pulih, slot ke-4 & tombol 4, perintah jaringan, cadangan pindah host.
import { describe, expect, it } from 'vitest';
import { combineFlash, flashExposure, flashStrength, flashTotal, flashWhite } from '../src/combat/Flash';
import { cycleTarget, heldOf, isThrowable, quickSwitchTarget, slotAvail } from '../src/combat/Slots';
import { DEFAULT_BINDS } from '../src/core/Bindings';
import { emptyFrame, frameFromCommand } from '../src/game/PlayerActions';
import { I, type Command } from '../src/net/protocol';
import { parseSave, SAVE_V } from '../src/net/Migration';
import { XCFG } from '../src/config/extraConfig';

const F = XCFG.flash;
const eye = { x: 0, y: 0, z: 0 }, fwd = { x: 0, y: 0, z: -1 };   // menghadap −Z
const at = (x: number, z: number) => ({ x, y: 0, z });

describe('Kekuatan silau', () => {
  it('menatap dari dekat = penuh; makin jauh melemah; habis di batas jarak', () => {
    expect(flashStrength(eye, fwd, at(0, -5), false)).toBe(1);
    expect(flashStrength(eye, fwd, at(0, -F.nearFull), false)).toBe(1);
    const mid = flashStrength(eye, fwd, at(0, -(F.nearFull + F.far) / 2), false);
    expect(mid).toBeCloseTo(0.5, 5);
    expect(flashStrength(eye, fwd, at(0, -F.far), false)).toBe(0);
  });
  it('arah: samping masih kuat, membelakangi hanya silau pantulan, terhalang dinding = 0', () => {
    const side = flashStrength(eye, fwd, at(5, 0), false), back = flashStrength(eye, fwd, at(0, 5), false);
    expect(side).toBeGreaterThan(back);
    expect(side).toBeGreaterThan(0.4); expect(side).toBeLessThan(1);
    expect(back).toBeCloseTo(F.faceBack, 5);
    expect(flashStrength(eye, fwd, at(0, -3), true)).toBe(0);
  });
});

describe('Durasi (angka pengguna)', () => {
  it('flash paling parah: putih total 3 s, jernih setelah 5 s', () => {
    const x = flashExposure(1)!;
    expect(x).toEqual({ peak: 1, hold: F.holdMax, fade: F.fadeMax });
    expect(x.hold).toBe(3); expect(flashTotal(x)).toBe(5);
  });
  it('ambang buta total: putih 1.5 s, total 3 s; di antaranya 1.5–3 s & 3–5 s', () => {
    const x = flashExposure(F.fullAt)!;
    expect(x.peak).toBe(1); expect(x.hold).toBe(1.5); expect(flashTotal(x)).toBe(3);
    for (let s = F.fullAt; s <= 1; s += 0.05) {
      const e = flashExposure(s)!;
      expect(e.hold).toBeGreaterThanOrEqual(1.5); expect(e.hold).toBeLessThanOrEqual(3);
      expect(flashTotal(e)).toBeGreaterThanOrEqual(3 - 1e-9); expect(flashTotal(e)).toBeLessThanOrEqual(5 + 1e-9);
    }
  });
  it('lemah: silau sebagian tanpa putih total; sangat lemah: tidak berefek', () => {
    const x = flashExposure(0.3)!;
    expect(x.peak).toBeCloseTo(0.6, 5); expect(x.hold).toBe(0); expect(x.fade).toBeLessThan(F.mildFade[1] + 1e-9);
    expect(flashExposure(0.05)).toBeNull();
    expect(flashExposure(0)).toBeNull();
  });
  it('kurva: penuh selama tahan, lalu pulih bertahap (menurun) sampai 0 di akhir', () => {
    const x = flashExposure(1)!;
    expect(flashWhite(x, 0)).toBe(1); expect(flashWhite(x, x.hold)).toBe(1);
    let prev = 1;
    for (let t = x.hold + 0.1; t < flashTotal(x); t += 0.1) { const w = flashWhite(x, t); expect(w).toBeLessThan(prev); prev = w; }
    expect(flashWhite(x, flashTotal(x))).toBe(0);
    expect(flashWhite(x, -1)).toBe(0);
  });
  it('flash kedua: dipakai hanya bila lebih terang dari silau yang tersisa', () => {
    const strong = flashExposure(1)!, weak = flashExposure(0.2)!;
    expect(combineFlash(null, weak)).toBe(true);
    expect(combineFlash({ x: strong, t: 1 }, weak)).toBe(false);       // masih putih total
    expect(combineFlash({ x: strong, t: 4.9 }, weak)).toBe(true);      // hampir pulih
  });
});

describe('Slot 4 & tombol', () => {
  it('tombol 4 = flashbang; slot tersedia bila stok ≥ 1; Q dari flash → senapan; scroll melewati flash', () => {
    expect(DEFAULT_BINDS.flash).toBe('Digit4');
    const av = slotAvail(true, 1, 1);
    expect(av.flash).toBe(true);
    expect(slotAvail(true, 1, 0).flash).toBe(false);
    expect(slotAvail(true, 1).flash).toBe(false);                     // pemanggil lama: tanpa flash
    expect(quickSwitchTarget('flash', null, av)).toBe('ar');
    expect(cycleTarget('grenade', 1, av)).toBe('flash');
    expect(cycleTarget('flash', 1, av)).toBe('ar');
    expect(cycleTarget('grenade', 1, slotAvail(true, 1, 0))).toBe('ar');
    expect(isThrowable('flash')).toBe(true); expect(isThrowable('knife')).toBe(false);
    expect(heldOf('flash', true, 'READY')).toBe('flash');
    expect(heldOf('flash', true, 'THROWN')).toBe('none');
  });
  it('perintah jaringan: bit slot flash → frame slot "flash"', () => {
    const c: Command = { seq: 1, mx: 0, mz: 0, yaw: 0, pitch: 0, held: 0, imp: I.SLOT_FLASH, viewTick: 0 };
    expect(frameFromCommand(c, 0, emptyFrame()).slot).toBe('flash');
    expect(I.SLOT_FLASH & (I.SLOT_AR | I.SLOT_KNIFE | I.SLOT_NADE | I.ALT_R)).toBe(0);
    expect(I.SLOT_FLASH).toBeLessThan(65536);                          // muat di u16 perintah
  });
});

describe('Cadangan pindah host', () => {
  const ent = { id: 1, alive: true, hp: 80, respawnT: 0, protectT: 0, x: 0, y: 0, z: 0, yaw: 0, pitch: 0, weapon: 'akm', scope: 'holo',
    ammo: 10, reserve: 60, modeIdx: 0, grenades: 1, stats: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], streak: 0, variant: 'm' };
  const save = (e: Record<string, unknown>) => ({ v: SAVE_V, state: 'PLAYING', round: 1, timeLeft: 60, countdown: 0, sb: 0, sr: 0,
    winner: 'draw', roundWinner: null, ents: [e] });
  it('stok flash ikut; host versi lama (tanpa kunci) → 1; nilai liar dipotong', () => {
    expect(parseSave(save({ ...ent, flashes: 0 }))!.ents[0].flashes).toBe(0);
    expect(parseSave(save(ent))!.ents[0].flashes).toBe(1);
    expect(parseSave(save({ ...ent, flashes: 99 }))!.ents[0].flashes).toBe(9);
  });
});
