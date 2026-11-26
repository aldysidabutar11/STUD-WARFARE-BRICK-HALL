// tests/weaponsX.test.ts — ekspansi senjata batch 1 (dokumen pengguna "Weapon Expansion Spec", bukan GDD): angka dokumen (STK/TTK,
// falloff, multiplier kepala shotgun), kalibrasi pola pellet, reload per selongsong, kokang bolt, slot pistol, validasi loadout,
// protokol (slot 3 bit, flag pellet), model (garis bidik ADS tidak tertutup).
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { SCOPES, WEAPONS, WEAPON_ORDER, classOf, isPistolId, isPrimaryId, scopeAllowed, type ScopeId, type WeaponDef, type WeaponId } from '../src/config/weaponsData';
import { X_ORDER } from '../src/config/weaponsExtra';
import { CFG } from '../src/config/gameConfig';
import { XCFG } from '../src/config/extraConfig';
import { damage, falloff, shotsToKill, timeToKill } from '../src/combat/Damage';
import { WeaponSystem, type TriggerInput } from '../src/combat/WeaponSystem';
import { equipTimeOf, hearRadiusOf, moveMultOf, pelletsOf } from '../src/combat/weaponStats';
import { DEFAULT_LOADOUT, cleanLoadout } from '../src/combat/Loadout';
import { applySpread, spreadDeg } from '../src/combat/Ballistics';
import { stanceMult } from '../src/combat/Recoil';
import { MELEES, MELEE_ORDER } from '../src/config/weaponsExtra';
import { meleeDamage } from '../src/combat/Melee';
import { makeRng } from '../src/core/Rng';
import { SHOT_PELLET, decodeSnapshot, encodeSnapshot, type EntState, type Snapshot } from '../src/net/protocol';
import { VM_SCALE, meleeModel, opticModel, weaponModel } from '../src/combat/WeaponModels';
import { validate } from '../src/ui/Settings';

const W = WEAPONS;
const ms = (s: number) => Math.round(s * 1000);

describe('Angka dokumen ekspansi (batch 1)', () => {
  it('SMG: MP5 3 peluru / 154 ms, Vector 4 / 150 ms (dada ≤ 15 u)', () => {
    expect(shotsToKill(damage(W.mp5, 'upper', 15))).toBe(3);
    expect(ms(timeToKill(W.mp5, 'upper', 15))).toBe(154);
    expect(shotsToKill(damage(W.vector, 'upper', 15))).toBe(4);
    expect(ms(timeToKill(W.vector, 'upper', 15))).toBe(150);
  });
  it('falloff per senjata (rumus GDD §5.3, angka dokumen): MP5 penuh ≤ 20 u, minimum 0.5', () => {
    expect(falloff(20, W.mp5)).toBe(1);
    expect(falloff(55, W.mp5)).toBeCloseTo(0.5, 9);
    expect(falloff(200, W.mp5)).toBe(0.5);
    expect(damage(W.mp5, 'upper', 90)).toBe(17);
    expect(falloff(60)).toBe(falloff(60, W.m416));          // AR GDD tidak berubah
  });
  it('AWM: one-shot dada (115) & perut (109), lengan/kaki 58; tetap one-shot dada sampai 100 u', () => {
    expect([damage(W.awm, 'upper', 50), damage(W.awm, 'lower', 50), damage(W.awm, 'limb', 50)]).toEqual([115, 109, 58]);
    expect(damage(W.awm, 'upper', 100)).toBeGreaterThanOrEqual(100);
  });
  it('Desert Eagle: 2 tembakan badan (250 ms), headshot 132 one-tap sampai ±44 u', () => {
    expect(shotsToKill(damage(W.deagle, 'upper', 20))).toBe(2);
    expect(ms(timeToKill(W.deagle, 'upper', 20))).toBe(250);
    expect(damage(W.deagle, 'head', 20)).toBe(132);
    expect(damage(W.deagle, 'head', 44)).toBeGreaterThanOrEqual(100);
    expect(damage(W.deagle, 'head', 46)).toBeLessThan(100);
  });
  it('Remington 870: 8 × 18 = 144; kepala ×1.5 (bukan 2.35); 6 pellet dada ≤ 10 u = mati', () => {
    expect(pelletsOf(W.m870) * damage(W.m870, 'upper', 10)).toBe(144);
    expect(damage(W.m870, 'head', 5)).toBe(27);
    expect(6 * damage(W.m870, 'upper', 10)).toBeGreaterThanOrEqual(100);
  });
  it('mobilitas & waktu cabut: SMG ≥ 1.04, AWM 0.88, pistol cabut 0.30 s, AR GDD 1.0 / 0.55 s', () => {
    expect(moveMultOf(W.mp5)).toBe(1.04); expect(moveMultOf(W.awm)).toBe(0.88); expect(moveMultOf(W.m416)).toBe(1);
    expect(equipTimeOf(W.deagle)).toBe(0.3); expect(equipTimeOf(W.m416)).toBe(CFG.combat.equipTime);
  });
  it('radius dengar bot: 5.56 35 u & 7.62 50 u (GDD), shotgun & .50 AE 50 u, sniper 60 u', () => {
    expect(hearRadiusOf(W.m416)).toBe(35); expect(hearRadiusOf(W.akm)).toBe(50);
    expect(hearRadiusOf(W.m870)).toBe(50); expect(hearRadiusOf(W.deagle)).toBe(50); expect(hearRadiusOf(W.awm)).toBe(XCFG.bots.hearing.shotHeavy);
    expect(hearRadiusOf(W.mp5)).toBe(35);
  });
});

describe('Angka dokumen ekspansi (batch 2)', () => {
  it('P90 4 peluru / 189 ms; M249 3 / 160 ms (dada ≤ 40 u); USP-S 3 / 333 ms', () => {
    expect([shotsToKill(damage(W.p90, 'upper', 15)), ms(timeToKill(W.p90, 'upper', 15))]).toEqual([4, 189]);
    expect([shotsToKill(damage(W.m249, 'upper', 40)), ms(timeToKill(W.m249, 'upper', 40))]).toEqual([3, 160]);
    expect([shotsToKill(damage(W.usps, 'upper', 20)), ms(timeToKill(W.usps, 'upper', 20))]).toEqual([3, 333]);
  });
  it('CheyTac: one-shot seluruh badan (perut tepat 100); SVD: 2 badan (250 ms), headshot 146', () => {
    expect([damage(W.m200, 'upper', 60), damage(W.m200, 'lower', 60)]).toEqual([105, 100]);
    expect([shotsToKill(damage(W.svd, 'upper', 50)), ms(timeToKill(W.svd, 'upper', 50)), damage(W.svd, 'head', 50)]).toEqual([2, 250, 146]);
  });
  it('Benelli M4: 8 × 14 = 112, semi-otomatis 0.27 s, reload per selongsong 0.5 s', () => {
    expect(pelletsOf(W.m1014) * damage(W.m1014, 'upper', 5)).toBe(112);
    expect(60 / W.m1014.rpm).toBeCloseTo(0.2727, 3);
    expect([W.m1014.reload, W.m1014.shellTime]).toEqual(['shell', 0.5]);
  });
  it('M249: recoil jongkok ×0.60 (AR GDD ×0.75), angkat 0.75 s; USP-S peredam: radius dengar bot 12 u', () => {
    expect(stanceMult(true, false, W.m249)).toBe(0.6); expect(stanceMult(true, false, W.m416)).toBe(0.75);
    expect(equipTimeOf(W.m249)).toBe(0.75);
    expect(W.usps.suppressed).toBe(true); expect(hearRadiusOf(W.usps)).toBe(12);
  });
  it('kelas & optik: SVD = DMR (akurasi ADS butuh optik terbuka), CheyTac hanya 3×/4×/6×, pistol iron / red dot', () => {
    expect(classOf(W.svd)).toBe('DMR');
    expect(spreadDeg(true, false, false, false, W.svd, 0)).toBeCloseTo(W.svd.spreadHip!, 9);
    expect(scopeAllowed(W.m200, 'reddot')).toBe(false); expect(scopeAllowed(W.usps, 'x2')).toBe(false);
  });
});

describe('Angka dokumen ekspansi (batch 3)', () => {
  const stk = (w: WeaponDef, d: number) => [shotsToKill(damage(w, 'upper', d)), ms(timeToKill(w, 'upper', d))];
  it('SMG: UMP45 3/185, MP7 4/180, UZI 4/144 ms', () => {
    expect(stk(W.ump45, 15)).toEqual([3, 185]); expect(stk(W.mp7, 15)).toEqual([4, 180]); expect(stk(W.uzi, 10)).toEqual([4, 144]);
  });
  it('shotgun: SPAS 8×19 = 152, Saiga 8×13 = 104 (magazen kotak), double barrel 9×18 = 162 per tembakan & 2 tembakan dalam 0.2 s', () => {
    expect(pelletsOf(W.spas12) * damage(W.spas12, 'upper', 5)).toBe(152);
    expect(pelletsOf(W.s12k) * damage(W.s12k, 'upper', 5)).toBe(104); expect(W.s12k.reload).toBeUndefined();
    expect(pelletsOf(W.s686) * damage(W.s686, 'upper', 5)).toBe(162); expect(60 / W.s686.rpm).toBeCloseTo(0.2, 9);
  });
  it('sniper: Kar98k dada 85 (2 tembakan) & kepala 200; Barrett lengan 68 & one-shot dada di jarak berapa pun', () => {
    expect([damage(W.kar98k, 'upper', 50), damage(W.kar98k, 'head', 50)]).toEqual([85, 200]);
    expect(damage(W.m82, 'limb', 50)).toBe(68); expect(damage(W.m82, 'upper', 300)).toBeGreaterThanOrEqual(100);
  });
  it('DMR Mini-14: 3/333 ms, kepala di 70 u = 109', () => {
    expect(stk(W.mini14, 50)).toEqual([3, 333]); expect(damage(W.mini14, 'head', 70)).toBe(109);
  });
  it('LMG: DP-28 3/222, RPK 3/200 (≤ 40 u); recoil jongkok ×0.60', () => {
    expect(stk(W.dp28, 40)).toEqual([3, 222]); expect(stk(W.rpk, 40)).toEqual([3, 200]);
    expect([W.dp28.crouchRecoil, W.rpk.crouchRecoil]).toEqual([0.6, 0.6]);
  });
  it('pistol: Glock 5/240, M1911 3/375, M9 4/429 ms', () => {
    expect(stk(W.glock18, 10)).toEqual([5, 240]); expect(stk(W.m1911, 15)).toEqual([3, 375]); expect(stk(W.m9, 15)).toEqual([4, 429]);
  });
  it('AR tambahan: FAMAS/AS VAL 150 ms, Honey Badger 162, FAL 2 tembakan 150 ms (kepala 122), Galil 185 (kepala 106 ≤ 40 u)', () => {
    expect(stk(W.famas, 25)).toEqual([3, 150]); expect(stk(W.asval, 25)).toEqual([3, 150]); expect(stk(W.badger, 25)).toEqual([3, 162]);
    expect(stk(W.fal, 40)).toEqual([2, 150]); expect(damage(W.fal, 'head', 40)).toBe(122);
    expect(stk(W.galil, 30)).toEqual([3, 185]); expect(damage(W.galil, 'head', 40)).toBe(106);
  });
  it('peredam: AS VAL 15 u, Honey Badger 16 u, USP-S 12 u (radius dengar bot)', () => {
    expect([hearRadiusOf(W.asval), hearRadiusOf(W.badger), hearRadiusOf(W.usps)]).toEqual([15, 16, 12]);
  });
});

describe('Senjata jarak dekat (slot 3)', () => {
  it('pisau komando tetap angka lama (tebas 45/90, tusuk 70/100, angkat 0.30 s, lari ×1.10, jangkauan 3.4)', () => {
    const k = MELEES.knife;
    expect([k.light.damage, k.light.backDamage, k.heavy.damage, k.heavy.backDamage, k.equipTime, k.moveMult, k.reach]).toEqual([45, 90, 70, 100, 0.3, 1.1, 3.4]);
    expect(meleeDamage('stab', true)).toBe(100);
  });
  it('angka dokumen: Karambit 38/65 (belakang 130), Kukri 55/90 (162), Tomahawk 60/105 (158)', () => {
    expect([meleeDamage('slash', false, 'karambit'), meleeDamage('stab', false, 'karambit'), meleeDamage('stab', true, 'karambit')]).toEqual([38, 65, 130]);
    expect([meleeDamage('slash', false, 'kukri'), meleeDamage('stab', false, 'kukri'), meleeDamage('stab', true, 'kukri')]).toEqual([55, 90, 162]);
    expect([meleeDamage('slash', false, 'tomahawk'), meleeDamage('stab', false, 'tomahawk'), meleeDamage('stab', true, 'tomahawk')]).toEqual([60, 105, 158]);
    expect(2 * MELEES.kukri.light.damage).toBeGreaterThanOrEqual(100);        // 2 tebasan kukri = mati
    expect(MELEES.tomahawk.heavy.damage).toBeGreaterThanOrEqual(100);         // ayunan berat tomahawk = mati dari depan
  });
  it('lari, angkat & jangkauan: karambit ×1.12 / 0.20 s / 2.9 u; kukri 3.8 u terpanjang', () => {
    expect([MELEES.karambit.moveMult, MELEES.karambit.equipTime, MELEES.karambit.reach]).toEqual([1.12, 0.2, 2.9]);
    expect(Math.max(...MELEE_ORDER.map(id => MELEES[id].reach))).toBe(MELEES.kukri.reach);
    for (const id of MELEE_ORDER) expect(meleeModel(id).attributes.position.count).toBeGreaterThan(50);
  });
});

describe('Spread & akurasi', () => {
  it('AR GDD tidak berubah (spreadDeg tanpa / dengan def AR)', () => {
    const cases: [boolean, boolean, boolean, boolean][] = [[false, false, false, false], [false, true, false, false], [true, false, true, false],
      [true, true, false, false], [false, false, true, true]];
    for (const [a, b, c, d] of cases) expect(spreadDeg(a, b, c, d, W.m416, 0)).toBe(spreadDeg(a, b, c, d));
  });
  it('sniper: akurasi ADS penuh hanya setelah optik terbuka (adsP); hipfire 7.5°', () => {
    expect(spreadDeg(false, false, false, false, W.awm)).toBe(7.5);
    expect(spreadDeg(true, false, false, false, W.awm, 1)).toBeCloseTo(0.02, 9);
    expect(spreadDeg(true, false, false, false, W.awm, 0)).toBeCloseTo(7.5, 9);
    const mid = spreadDeg(true, false, false, false, W.awm, 0.5);
    expect(mid).toBeGreaterThan(0.02); expect(mid).toBeLessThan(7.5);
  });
  it('shotgun: ADS sambil lompat tidak pernah lebih rapat dari ADS diam (bukan "sniper shotgun")', () => {
    expect(spreadDeg(true, true, false, false, W.m870)).toBeGreaterThanOrEqual(spreadDeg(true, false, false, false, W.m870));
  });
});

/** Siluet R6 dari depan (GDD §3.1): [xMin, xMax, yMin, yMax, bagian] — badan setinggi 5.0, lebar 4.0 dengan lengan. */
const SIL: [number, number, number, number, 'head' | 'upper' | 'lower' | 'limb'][] = [
  [-0.6, 0.6, 3.8, 5.0, 'head'], [-1, 1, 2.6, 3.8, 'upper'], [-1, 1, 1.8, 2.6, 'lower'],
  [-2, -1, 1.8, 3.8, 'limb'], [1, 2, 1.8, 3.8, 'limb'], [-1, 1, 0, 1.8, 'limb'],
];
/** Peluang one-shot (≥ 100) tembakan shotgun yang dibidik ke tengah dada pada jarak d (pola = applySpread game, seed tetap). */
function oneShotP(w: WeaponDef, d: number, ads: boolean, n = 1500) {
  const cone = spreadDeg(ads, false, false, false, w), rnd = makeRng(1234), fwd = new THREE.Vector3(0, 0, -1), dir = new THREE.Vector3();
  let ok = 0;
  for (let k = 0; k < n; k++) {
    let dmg = 0;
    for (let i = 0; i < pelletsOf(w); i++) {
      applySpread(fwd, cone, dir, rnd);
      const x = (dir.x / -dir.z) * d, y = 3.2 + (dir.y / -dir.z) * d;
      const hit = SIL.find(([x0, x1, y0, y1]) => x >= x0 && x <= x1 && y >= y0 && y <= y1);
      if (hit) dmg += damage(w, hit[4], d);
    }
    if (dmg >= 100) ok++;
  }
  return ok / n;
}

describe('Kalibrasi pola pellet shotgun (maksud dokumen: Remington one-shot ±10 u)', () => {
  it('M870 hip: hampir pasti one-shot ≤ 8 u, ±50% di ±11 u, hampir mustahil ≥ 15 u', () => {
    expect(oneShotP(W.m870, 8, false)).toBeGreaterThan(0.85);
    const p11 = oneShotP(W.m870, 11, false);
    expect(p11).toBeGreaterThan(0.3); expect(p11).toBeLessThan(0.75);
    expect(oneShotP(W.m870, 15, false)).toBeLessThan(0.05);
  });
  it('ADS sedikit lebih jauh (±12.5 u), tidak jadi senapan jarak jauh', () => {
    expect(oneShotP(W.m870, 11, true)).toBeGreaterThan(oneShotP(W.m870, 11, false));
    expect(oneShotP(W.m870, 16, true)).toBeLessThan(0.1);
  });
});

const trig = (o: Partial<TriggerInput> = {}): TriggerInput => ({ pressed: false, held: false, reload: false, modeSwitch: false, ads: false, sprinting: false, ...o });

/** Jalankan WeaponSystem langkah 1/60 s selama `sec`; mengembalikan jumlah tembakan. */
function run(w: WeaponSystem, t0: number, sec: number, inp: Partial<TriggerInput>, firstPressed = false): { t: number; shots: number } {
  let t = t0, shots = 0;
  const steps = Math.round(sec * 60);
  for (let i = 0; i < steps; i++) {
    t += 1 / 60;
    w.update(1 / 60, t, trig({ ...inp, pressed: !!inp.pressed && (i === 0 || !firstPressed) }), () => shots++);
  }
  return { t, shots };
}

describe('WeaponSystem: dua senjata api, selongsong, bolt', () => {
  const mk = (primary: WeaponId, pistol: WeaponId = 'deagle') => {
    const w = new WeaponSystem(1);
    w.setLoadout(primary, 'iron'); w.setPistol(pistol, 'iron'); w.refill();
    return w;
  };
  it('utama & pistol punya isi sendiri; ganti slot tidak mencampur amunisi', () => {
    const w = mk('mp5');
    expect([w.primary.ammo, w.secondary.ammo]).toEqual([30, 7]);
    run(w, 0, 0.3, { held: true, pressed: true }, true);
    const left = w.primary.ammo;
    expect(left).toBeLessThan(30);
    w.switchTo('pistol', 0.3);
    expect(w.def.id).toBe('deagle'); expect(w.ammo).toBe(7); expect(w.holdingGun).toBe(true);
    w.switchTo('ar', 0.45);
    expect(w.ammo).toBe(left);
    expect(w.prevSlot).toBe('pistol');
  });
  it('setelah spawn Q mengarah ke pistol', () => {
    const w = mk('m416');
    expect([w.slot, w.prevSlot]).toEqual(['ar', 'pistol']);
  });
  it('M870: reload per selongsong (0.35 s + 0.55 s/selongsong), menembak menghentikan reload', () => {
    const w = mk('m870');
    w.primary.ammo = 2;
    let t = 0;
    w.update(1 / 60, t += 1 / 60, trig({ reload: true }), () => {});
    expect(w.reloading).toBe(true);
    ({ t } = run(w, t, XCFG.weapons.shellStart + 0.55 * 2 + 0.03, {}));
    expect(w.primary.ammo).toBe(4);
    expect(w.reloading).toBe(true);
    let shots = 0;
    w.update(1 / 60, t += 1 / 60, trig({ pressed: true, held: true }), () => shots++);
    expect(w.reloading).toBe(false);
    expect(shots).toBe(0);                                          // belum: jeda interupsi
    const r = run(w, t, 0.3, { held: true });                       // tetap ditahan → menembak sekali setelah jeda
    expect(r.shots).toBe(1);
    expect(w.primary.ammo).toBe(3);
    expect(run(w, r.t, 0.4, { held: true }).shots).toBe(0);         // SINGLE: tidak menembak lagi tanpa klik baru
  });
  it('M870: reload penuh berhenti sendiri saat magazen penuh / cadangan habis', () => {
    const w = mk('m870');
    w.primary.ammo = 4; w.primary.reserve = 1;
    let t = 0;
    w.update(1 / 60, t += 1 / 60, trig({ reload: true }), () => {});
    run(w, t, 3, {});
    expect([w.primary.ammo, w.primary.reserve, w.reloading]).toEqual([5, 0, false]);
  });
  it('AWM: tembakan berikutnya ≥ 60/38 s; ganti ke pistol & kembali tidak mempercepat kokang', () => {
    const w = mk('awm');
    let t = 0, shots = 0;
    w.update(1 / 60, t += 1 / 60, trig({ pressed: true, held: true }), () => shots++);
    expect(shots).toBe(1);
    expect(w.primary.cycleProgress(t + 0.5)).toBeGreaterThan(0);
    w.switchTo('pistol', 0.3); ({ t } = run(w, t, 0.4, {}));
    w.switchTo('ar', 0.01);
    for (let i = 0; i < 30; i++) w.update(1 / 60, t += 1 / 60, trig({ pressed: true, held: true }), () => shots++);
    expect(shots).toBe(1);                                          // ±0.9 s setelah tembakan: belum boleh
    ({ t } = run(w, t, 0.8, {}));
    w.update(1 / 60, t += 1 / 60, trig({ pressed: true, held: true }), () => shots++);
    expect(shots).toBe(2);
  });
  it('MP5: sprint-ke-tembak 0.08 s (AR GDD 0.12 s)', () => {
    /** Waktu dari berhenti sprint sampai tembakan pertama (tombol ditahan sejak berhenti sprint). */
    const delay = (id: WeaponId) => {
      const w = mk(id);
      let t = 0, first = -1;
      w.update(1 / 60, t += 1 / 60, trig({ sprinting: true }), () => {});
      const t0 = t + 1 / 60;
      for (let i = 0; i < 30 && first < 0; i++) { t += 1 / 60; w.update(1 / 60, t, trig({ held: true, pressed: i === 0 }), () => { if (first < 0) first = t; }); }
      return first - t0;
    };
    expect(delay('mp5')).toBeGreaterThanOrEqual(0.08 - 1e-9); expect(delay('mp5')).toBeLessThan(0.08 + 1 / 60);
    expect(delay('m416')).toBeGreaterThanOrEqual(0.12 - 1e-9); expect(delay('m416')).toBeLessThan(0.12 + 1 / 60);
  });
});

describe('Loadout & data luar', () => {
  it('kelas & daftar: bot hanya AR GDD; pistol hanya slot 2; semua senjata tambahan punya model', () => {
    expect(WEAPON_ORDER.every(id => classOf(W[id]) === 'AR')).toBe(true);
    for (const id of X_ORDER) expect(weaponModel(id).geometry.attributes.position.count).toBeGreaterThan(100);
    expect(isPistolId('deagle')).toBe(true); expect(isPrimaryId('deagle')).toBe(false);
    expect(isPrimaryId('awm')).toBe(true); expect(isPistolId('awm')).toBe(false);
  });
  it('cleanLoadout: kelas salah ditolak, optik dibetulkan, data lama tanpa pistol → Desert Eagle', () => {
    expect(cleanLoadout('deagle', 'iron', 'mp5', 'reddot')).toEqual({ weapon: 'm416', scope: 'iron', pistol: 'deagle', pscope: 'reddot', melee: 'knife' });
    expect(cleanLoadout('awm', 'iron')).toEqual({ weapon: 'awm', scope: 'x6', pistol: 'deagle', pscope: 'iron', melee: 'knife' });
    expect(cleanLoadout('m416', 'iron', 'usps', 'iron', 'kukri').melee).toBe('kukri');
    expect(cleanLoadout('m416', 'iron', 'usps', 'iron', 'chainsaw').melee).toBe('knife');
    expect(cleanLoadout('groza', 'x6').scope).toBe('reddot');           // perilaku lama dipertahankan
    expect(cleanLoadout('m870', 'x4').scope).toBe('iron');
    expect(cleanLoadout('railgun', 'x99', '__proto__', 'constructor')).toEqual({ ...DEFAULT_LOADOUT });
    expect(scopeAllowed(W.deagle, 'x2')).toBe(false); expect(scopeAllowed(W.awm, 'iron')).toBe(false);
  });
  it('settings lama (tanpa pistol) tetap sah', () => {
    const s = validate({ weapon: 'aug', scope: 'x4' } as never);
    expect([s.weapon, s.scope, s.pistol, s.pscope]).toEqual(['aug', 'x4', 'deagle', 'iron']);
  });
});

describe('Protokol', () => {
  const ent = (o: Partial<EntState> = {}): EntState => ({ id: 3, flags: 1, x: 1, y: 2, z: 3, yaw: 1, pitch: 0, vx: 0, vz: 0, hp: 100, crouchT: 0,
    slot: 4, gstate: 4, meleeKind: 2, meleeT: -1, reloadP: 0.25, throwAnimT: -1, stepPhase: 0, ...o });
  it('slot pistol (4) + status granat 4 + jenis pisau 2 muat di satu byte', () => {
    const s: Snapshot = { tick: 1, ack: 0, match: { state: 3, sb: 0, sr: 0, timeLeft: 1, countdown: 0, round: 1 }, ents: [ent(), ent({ id: 4, slot: 3, gstate: 1, meleeKind: 1 })],
      own: null, nades: [], fx: [], shots: [{ shooter: 3, x: 0, y: 0, z: 0, kind: 2 | SHOT_PELLET, nx: 0, ny: 1, nz: 0, mat: 0, victim: 4, part: 1 }] };
    const out = decodeSnapshot(encodeSnapshot(s))!;
    expect([out.ents[0].slot, out.ents[0].gstate, out.ents[0].meleeKind]).toEqual([4, 4, 2]);
    expect([out.ents[1].slot, out.ents[1].gstate, out.ents[1].meleeKind]).toEqual([3, 1, 1]);
    expect(out.shots[0].kind & 7).toBe(2); expect(out.shots[0].kind & SHOT_PELLET).toBe(SHOT_PELLET);
  });
});

describe('Model: garis bidik ADS (iron / red dot / holo) bersih untuk senjata tambahan', () => {
  const EYE_Z = -XCFG.viewmodel.adsZ / VM_SCALE, ray = new THREE.Raycaster(), FWD = new THREE.Vector3(0, 0, -1);
  for (const id of X_ORDER) {
    for (const s of ['iron', 'reddot', 'holo'] as ScopeId[]) {
      if (!scopeAllowed(W[id], s)) continue;
      it(`${id}: ${s}`, () => {
        const m = weaponModel(id, s === 'iron'), root = new THREE.Mesh(m.geometry), om = opticModel(s);
        if (om) { const b = new THREE.Mesh(om.body); b.position.set(0, m.opticMount.y - 0.38, m.opticMount.z); root.add(b); }
        root.updateMatrixWorld(true);
        const y = SCOPES[s].sightHeight / VM_SCALE + (s === 'iron' ? 0 : m.opticMount.y - 0.38);
        const blocked = (dx: number, dy: number) => { ray.set(new THREE.Vector3(dx, y + dy, EYE_Z), FWD); return ray.intersectObject(root, true).length > 0; };
        if (s === 'iron') {
          expect(blocked(0, -0.01)).toBe(true);                     // tiang depan tepat di bawah titik bidik
          for (const dx of [-0.015, 0, 0.015]) for (const dy of [0.008, 0.03, 0.06]) expect(blocked(dx, dy), `dx ${dx} dy ${dy}`).toBe(false);
        } else for (const dx of [-0.03, 0, 0.03]) for (const dy of [-0.04, -0.015, 0, 0.03, 0.06]) expect(blocked(dx, dy), `dx ${dx} dy ${dy}`).toBe(false);
      });
    }
  }
});
