// tests/weapons.test.ts — slot senjata 1/2/3 + Q, pisau, buang/ambil senjata (permintaan pengguna; angka di XCFG.knife/drop).
import { describe, expect, it } from 'vitest';
import { cycleTarget, canPickUp, heldOf, quickSwitchTarget, returnSlot, slotAvail } from '../src/combat/Slots';
import { BINDS_VERSION, DEFAULT_BINDS, migrateBinds } from '../src/core/Bindings';
import { validate } from '../src/ui/Settings';
import { MELEE_KINDS, isFromBehind, meleeDamage } from '../src/combat/Melee';
import { moveTarget } from '../src/combat/Damage';
import { XCFG } from '../src/config/extraConfig';
import { CFG } from '../src/config/gameConfig';

const ALL = slotAvail(true, 1);

describe('Slot senjata', () => {
  it('tombol default: 1 utama, 2 pisau, 3 granat, Q sebelumnya, G buang, E ambil, X tukar bahu', () => {
    expect(DEFAULT_BINDS).toMatchObject({ primary: 'Digit1', knife: 'Digit2', grenade: 'Digit3', lastWeapon: 'KeyQ', drop: 'KeyG',
      pickup: 'KeyE', shoulder: 'KeyX' });
  });
  it('Q: kembali ke slot sebelumnya; tanpa slot sebelumnya yang valid → tukar senapan ↔ pisau', () => {
    expect(quickSwitchTarget('ar', 'knife', ALL)).toBe('knife');
    expect(quickSwitchTarget('knife', 'ar', ALL)).toBe('ar');
    expect(quickSwitchTarget('ar', 'grenade', ALL)).toBe('grenade');
    expect(quickSwitchTarget('ar', 'grenade', slotAvail(true, 0))).toBe('knife');    // granat habis
    expect(quickSwitchTarget('knife', 'ar', slotAvail(false, 1))).toBe('grenade');   // senjata utama dibuang
    expect(quickSwitchTarget('knife', 'ar', slotAvail(false, 0))).toBeNull();
    expect(quickSwitchTarget('grenade', 'grenade', ALL)).toBe('ar');
  });
  it('scroll melingkar & melewati slot kosong', () => {
    expect(cycleTarget('ar', 1, ALL)).toBe('knife');
    expect(cycleTarget('grenade', 1, ALL)).toBe('ar');
    expect(cycleTarget('ar', -1, ALL)).toBe('grenade');
    expect(cycleTarget('knife', 1, slotAvail(false, 0))).toBeNull();
    expect(cycleTarget('knife', 1, slotAvail(false, 1))).toBe('grenade');
    expect(cycleTarget('grenade', 1, slotAvail(false, 1))).toBe('knife');
  });
  it('setelah melempar granat kembali ke slot sebelumnya (pisau bila senjata utama dibuang)', () => {
    expect(returnSlot('ar', true)).toBe('ar');
    expect(returnSlot('knife', true)).toBe('knife');
    expect(returnSlot('ar', false)).toBe('knife');
  });
  it('benda di tangan', () => {
    expect(heldOf('ar', true, 'NONE')).toBe('ar');
    expect(heldOf('knife', true, 'NONE')).toBe('knife');
    expect(heldOf('grenade', true, 'READY')).toBe('grenade');
    expect(heldOf('grenade', true, 'THROWN')).toBe('none');
  });
});

describe('Migrasi tombol tersimpan (v1 → v2)', () => {
  const OLD = { ...DEFAULT_BINDS, primary: 'Digit1', grenade: 'KeyG', shoulder: 'KeyQ' } as Record<string, string>;
  delete OLD.knife; delete OLD.lastWeapon; delete OLD.drop; delete OLD.pickup;
  it('default lama: Q & G pindah fungsi, aksi baru dapat tombol default', () => {
    const s = validate({ binds: OLD as never });
    expect(s.bindsVer).toBe(BINDS_VERSION);
    expect(s.binds).toMatchObject({ shoulder: 'KeyX', lastWeapon: 'KeyQ', grenade: 'Digit3', drop: 'KeyG', knife: 'Digit2', pickup: 'KeyE' });
  });
  it('tombol yang sudah diubah pengguna tidak disentuh', () => {
    const s = validate({ binds: { ...OLD, shoulder: 'KeyZ', grenade: 'KeyT' } as never });
    expect(s.binds.shoulder).toBe('KeyZ');
    expect(s.binds.grenade).toBe('KeyT');
    expect(s.binds.lastWeapon).toBe('KeyQ');
  });
  it('tujuan migrasi sudah dipakai → tidak dipindah (aksi baru kosong, bisa diatur di menu)', () => {
    const s = validate({ binds: { ...OLD, reload: 'KeyX' } as never });
    expect(s.binds.shoulder).toBe('KeyQ');
    expect(s.binds.lastWeapon).toBe('');
  });
  it('setelan v2 tidak dimigrasi ulang', () => {
    expect(migrateBinds({ shoulder: 'KeyQ' }, 2)).toEqual({ shoulder: 'KeyQ' });
  });
});

describe('Pisau', () => {
  it('angka disetujui pengguna: tebas 45 / 90 belakang tiap 0.45 s, tusuk 70 / 100 tiap 1.0 s, angkat 0.3 s, lari ×1.10', () => {
    expect([meleeDamage('slash', false), meleeDamage('slash', true), MELEE_KINDS.slash.duration]).toEqual([45, 90, 0.45]);
    expect([meleeDamage('stab', false), meleeDamage('stab', true), MELEE_KINDS.stab.duration]).toEqual([70, 100, 1.0]);
    expect(meleeDamage('stab', true)).toBeGreaterThanOrEqual(CFG.player.hp);           // tusuk dari belakang = langsung mati
    expect([meleeDamage('butt', false), meleeDamage('butt', true)]).toEqual([55, 100]); // pukul popor F tidak berubah
    expect([XCFG.knife.equipTime, XCFG.knife.speedMult]).toEqual([0.3, 1.1]);
  });
  it('"dari belakang" = arah hadap korban searah penyerang', () => {
    expect(isFromBehind(0, 0)).toBe(true);
    expect(isFromBehind(Math.PI, 0)).toBe(false);
    expect(isFromBehind(Math.PI / 2, 0)).toBe(false);
  });
  it('kecepatan lari dengan pisau ×1.10 (semua arah, termasuk sprint)', () => {
    const T = CFG.player.moveSpeedScale;
    const base = moveTarget({ ix: 0, iz: 1, sprinting: true, crouched: false, ads: false }, undefined, T);
    const knife = moveTarget({ ix: 0, iz: 1, sprinting: true, crouched: false, ads: false }, undefined, T * XCFG.knife.speedMult);
    expect(knife.vz / base.vz).toBeCloseTo(1.1, 6);
  });
});

describe('Buang / ambil senjata', () => {
  it('hanya tim sendiri yang bisa mengambil/menukar', () => {
    expect(canPickUp('blue', 'blue')).toBe(true);
    expect(canPickUp('red', 'blue')).toBe(false);
    expect(canPickUp('blue', 'red')).toBe(false);
  });
});

describe('Animasi pisau (keyframe)', async () => {
  const A = await import('../src/entities/knifeAnim');
  const sets = { VM_SLASH_A: A.VM_SLASH_A, VM_SLASH_B: A.VM_SLASH_B, VM_STAB: A.VM_STAB, RIG_SLASH_A: A.RIG_SLASH_A, RIG_SLASH_B: A.RIG_SLASH_B, RIG_STAB: A.RIG_STAB };
  it('semua animasi mulai & berakhir di pose diam (tanpa loncatan saat serangan berulang)', () => {
    const out = [0, 0, 0, 0, 0, 0];
    for (const [name, keys] of Object.entries(sets)) {
      expect(A.sampleKeys(keys, 0, out).every(v => v === 0), name).toBe(true);
      expect(A.sampleKeys(keys, 1, out).every(v => Math.abs(v) < 1e-9), name).toBe(true);
    }
  });
  it('titik kena jatuh di tengah sapuan / sodokan (sinkron dengan damage)', () => {
    const hitSlash = XCFG.knife.slash.hitDelay / XCFG.knife.slash.duration, hitStab = XCFG.knife.stab.hitDelay / XCFG.knife.stab.duration;
    expect(hitSlash).toBeGreaterThan(A.VM_SLASH_A[1].t); expect(hitSlash).toBeLessThan(A.VM_SLASH_A[2].t);
    expect(hitStab).toBeGreaterThan(A.VM_STAB[1].t); expect(hitStab).toBeLessThan(A.VM_STAB[2].t);
  });
  it('kode rekaman killcam bolak-balik', () => {
    for (const [p, stab, alt] of [[0.3, false, false], [0.7, true, false], [0.5, false, true], [-1, false, false]] as const) {
      const d = A.decodeKnife(A.encodeKnife(p, stab, alt));
      expect(d.p).toBeCloseTo(p, 9);
      expect([d.stab, d.alt]).toEqual([stab && p >= 0, alt && p >= 0]);
    }
  });
});
