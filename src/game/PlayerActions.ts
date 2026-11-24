// src/game/PlayerActions.ts — logika tombol senjata manusia (slot 1/2/3/Q/scroll, ADS, tembak, reload, mode tembak, popor/pisau,
// granat) yang SAMA untuk: pemain lokal (input keyboard/mouse/gamepad) dan pemain remote di host (perintah jaringan per tick).
// Masukan = ActionFrame (tombol ditahan + tepi tekan/lepas), bukan Input langsung → host menjalankan aturan persis sama.
import { ctx } from './ctx';
import type { Entity } from '../entities/Entity';
import { cycleTarget, quickSwitchTarget, slotAvail, type Slot } from '../combat/Slots';
import { cancelMelee, startKnife, startMelee, updateMelee } from '../combat/Melee';
import { equipTimeFor, type GrenadeInput } from '../combat/GrenadeK400';
import { fireOne } from '../combat/Ballistics';
import type { TriggerInput } from '../combat/WeaponSystem';
import { H, I, type Command } from '../net/protocol';

/** Tombol satu frame (lokal) / satu tick (remote). L = klik kiri, R = klik kanan (pisau: tusuk, granat: lempar bawah). */
export interface ActionFrame {
  lH: boolean; lP: boolean; lR: boolean;
  rH: boolean; rP: boolean; rR: boolean;
  /** ADS diinginkan: mode tahan = rH; remote = bit AIM (sudah di-resolve klien). */
  aimHold: boolean;
  reload: boolean; fireMode: boolean; melee: boolean;
  slot: Slot | null; last: boolean; wheel: number;
}

export const emptyFrame = (): ActionFrame => ({ lH: false, lP: false, lR: false, rH: false, rP: false, rR: false, aimHold: false,
  reload: false, fireMode: false, melee: false, slot: null, last: false, wheel: 0 });

/** Frame dari perintah jaringan; prevHeld = tombol ditahan pada perintah sebelumnya (tepi lepas). */
export function frameFromCommand(c: Command, prevHeld: number, out: ActionFrame): ActionFrame {
  const lH = !!(c.held & H.FIRE), rH = !!(c.held & H.ALT);
  out.lH = lH; out.rH = rH;
  out.lP = !!(c.imp & I.FIRE_P); out.rP = !!(c.imp & I.ALT_P);
  out.lR = !!(c.imp & I.FIRE_R) || (!!(prevHeld & H.FIRE) && !lH);
  out.rR = !!(c.imp & I.ALT_R) || (!!(prevHeld & H.ALT) && !rH);
  out.aimHold = !!(c.held & H.AIM);
  out.reload = !!(c.imp & I.RELOAD); out.fireMode = !!(c.imp & I.FIREMODE); out.melee = !!(c.imp & I.MELEE);
  out.slot = c.imp & I.SLOT_AR ? 'ar' : c.imp & I.SLOT_KNIFE ? 'knife' : c.imp & I.SLOT_NADE ? 'grenade' : null;
  out.last = !!(c.imp & I.LAST);
  out.wheel = c.imp & I.WHEEL_UP ? 1 : c.imp & I.WHEEL_DN ? -1 : 0;
  return out;
}

export interface DriveOpts {
  /** Boleh mengendalikan (hidup, tidak terkunci, tidak noclip, fokus di game). */
  active: boolean;
  /** Mode ADS pemilik input: 'toggle' (setelan pemain lokal) atau 'hold' (remote: bit AIM sudah final). */
  adsMode: 'hold' | 'toggle';
  /** Latihan: amunisi cadangan & granat tak terbatas. */
  practice: boolean;
}

export interface DriveResult { meleeStarted: boolean; gun: boolean; knife: boolean; meleeing: boolean }

/**
 * Satu langkah senjata manusia. trig & gIn = objek masukan milik entitas (dipakai ulang). Mengembalikan info untuk lapisan lokal
 * (prompt ambil, sprint gamepad, viewmodel). Pemanggil memastikan hanya dipanggil saat match berjalan untuk entitas ini.
 */
export function driveWeapons(e: Entity, f: ActionFrame, dt: number, o: DriveOpts, t: TriggerInput, g: GrenadeInput): DriveResult {
  const w = e.weapon, active = o.active;
  const lP = active && f.lP, lH = active && f.lH, lR = f.lR;
  const rP = active && f.rP, rH = active && f.rH, rR = f.rR;
  // slot: 1 senjata utama · 2 pisau · 3 granat · Q senjata sebelumnya · scroll siklus
  const av = slotAvail(w.hasPrimary, e.grenades);
  let want: Slot | null = null;
  if (active) {
    if (f.slot) want = f.slot;
    else if (f.last) want = quickSwitchTarget(w.slot, w.prevSlot, av);
    else if (f.wheel !== 0) want = cycleTarget(w.slot, f.wheel > 0 ? 1 : -1, av);
    if (want && (!av[want] || want === w.slot)) want = null;
  }
  g.equip = want === 'grenade';                                                   // diproses state machine granat (§8.1)
  g.toSlot = want && want !== 'grenade' && w.slot === 'grenade' ? want : null;   // keluar dari granat (READY)
  if (want && want !== 'grenade' && w.slot !== 'grenade' && e.grenadeState === 'NONE' && (e.meleeT < 0 || e.meleeHit)) {
    cancelMelee(e);
    w.switchTo(want, equipTimeFor(want));
  }
  const nade = w.slot === 'grenade' || e.grenadeState !== 'NONE';
  const gun = w.slot === 'ar' && !nade, knife = w.slot === 'knife' && !nade;
  g.lPress = nade && lP; g.lHeld = nade && lH; g.lRelease = nade && lR;
  g.rPress = nade && rP; g.rHeld = nade && rH; g.rRelease = nade && rR;
  const meleeing = e.meleeT >= 0;
  // ADS (hanya senapan): tahan / toggle
  if (o.adsMode === 'hold') e.adsWanted = f.aimHold && gun;
  else if (rP && gun) e.adsWanted = !e.adsWanted;
  if (w.reloading || !gun || !e.alive || meleeing) e.adsWanted = o.adsMode === 'toggle' ? false : e.adsWanted;
  t.pressed = gun && !meleeing && lP; t.held = gun && !meleeing && lH;
  t.reload = active && f.reload; t.modeSwitch = active && f.fireMode;
  t.ads = active && gun && !meleeing && e.adsWanted;
  t.sprinting = e.ctrl.sprinting;
  const res: DriveResult = { meleeStarted: false, gun, knife, meleeing };
  if (!e.alive || ctx.match.locked) return res;
  // F: pukul popor (senapan) / tebas cepat (pisau); pisau: klik kiri tebas, klik kanan tusuk (tahan = berulang)
  if (active && f.melee && (startMelee(e) || (knife && startKnife(e, false)))) { e.adsWanted = false; res.meleeStarted = true; }
  if (knife && (lH || rH)) startKnife(e, !lH);
  if (o.practice) { // latihan: amunisi cadangan & granat tak terbatas
    w.reserve = w.def.reserveAmmo;
    if (e.grenades < 1 && e.grenadeState === 'NONE') e.grenades = 1;
  }
  w.update(dt, ctx.time, t, () => fireOne(e));
  ctx.grenades.handle(e, g, dt);
  updateMelee(e, dt);
  return res;
}
