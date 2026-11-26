// src/combat/Melee.ts — serangan jarak dekat untuk pemain & bot. Fitur pembanding FPS lain (bukan dari GDD):
//   'butt'  = pukulan popor cepat (F, saat memegang senjata utama) — angka XCFG.melee; bot memakai aturan yang sama.
//   'slash' / 'stab' = pisau slot 2 (klik kiri tebas, klik kanan tusuk) — angka XCFG.knife; jangkauan, kerucut sinar &
//   aturan "dari belakang" sama dengan pukulan popor. Bot tidak memakai pisau.
import * as THREE from 'three';
import { XCFG } from '../config/extraConfig';
import { bus, type KillWeapon, type MeleeKind } from '../core/EventBus';
import { MELEES, MELEE_ORDER, type MeleeId } from '../config/weaponsExtra';
import { ctx } from '../game/ctx';
import { castShot } from './Ballistics';
import type { Entity } from '../entities/Entity';
import type { PartKey } from '../entities/BlockyCharacter';

const M = XCFG.melee, K = XCFG.knife;
const D2R = THREE.MathUtils.degToRad;
const _eye = new THREE.Vector3(), _dir = new THREE.Vector3(), _pt = new THREE.Vector3(), _n = new THREE.Vector3();
// sinar: tengah, kiri/kanan, atas/bawah (kerucut kecil agar pukulan terasa "lengket")
const OFFSETS: [number, number][] = [[0, 0], [1, 0], [-1, 0], [0, 0.8], [0, -0.8]];

interface KindSpec { damage: number; backDamage: number; hitDelay: number; duration: number; cooldown: number; weapon: KillWeapon }
/** Tabel per jenis serangan (tanpa alokasi di hot loop). Pisau: jeda = durasi (tanpa cooldown tambahan). */
export const MELEE_KINDS: Readonly<Record<MeleeKind, KindSpec>> = {
  butt: { damage: M.damage, backDamage: M.backDamage, hitDelay: M.hitDelay, duration: M.duration, cooldown: M.cooldown, weapon: 'melee' },
  slash: { damage: K.slash.damage, backDamage: K.slash.backDamage, hitDelay: K.slash.hitDelay, duration: K.slash.duration, cooldown: 0, weapon: 'knife' },
  stab: { damage: K.stab.damage, backDamage: K.stab.backDamage, hitDelay: K.stab.hitDelay, duration: K.stab.duration, cooldown: 0, weapon: 'knife' },
};

/** Tabel serangan per senjata jarak dekat: ringan (klik kiri) = 'slash', berat (klik kanan) = 'stab'; popor tetap XCFG.melee. */
const BY_MELEE = new Map<MeleeId, Readonly<Record<MeleeKind, KindSpec>>>(MELEE_ORDER.map(id => {
  const d = MELEES[id], w: KillWeapon = id;
  return [id, { butt: MELEE_KINDS.butt, slash: { ...d.light, cooldown: 0, weapon: w }, stab: { ...d.heavy, cooldown: 0, weapon: w } }];
}));
/** Spesifikasi serangan entitas (senjata jarak dekat loadout-nya). */
export const kindSpec = (e: Entity, k: MeleeKind): KindSpec => BY_MELEE.get(e.weapon.melee)![k];

/** Damage serangan jarak dekat (murni, untuk test). melee = senjata jarak dekat (default pisau komando). */
export const meleeDamage = (kind: MeleeKind, fromBehind: boolean, melee: MeleeId = 'knife') =>
  fromBehind ? BY_MELEE.get(melee)![kind].backDamage : BY_MELEE.get(melee)![kind].damage;

/** "Dari belakang": arah hadap korban searah arah hadap penyerang (dot yaw > backDot). */
export const isFromBehind = (victimYaw: number, attackerYaw: number) =>
  Math.sin(victimYaw) * Math.sin(attackerYaw) + Math.cos(victimYaw) * Math.cos(attackerYaw) > M.backDot;

const idle = (e: Entity) => e.alive && e.meleeT < 0 && e.meleeCd <= 0 && e.grenadeState === 'NONE' && e.weapon.equipT <= 0;

/** Pukulan popor / gagang pistol: saat memegang senjata api. */
export function canMelee(e: Entity) {
  return idle(e) && e.weapon.holdingGun;
}

/** Pisau: hanya saat slot pisau aktif dan selesai diangkat. */
export function canKnife(e: Entity) {
  return idle(e) && e.weapon.slot === 'knife';
}

function begin(e: Entity, kind: MeleeKind) {
  e.meleeT = 0; e.meleeHit = false; e.meleeKind = kind;
  if (kind === 'slash') {                 // tebasan beruntun bergantian arah; setelah jeda mulai lagi dari kanan→kiri
    e.slashAlt = ctx.time - e.lastSlashT > K.slashResetTime ? false : !e.slashAlt;
    e.lastSlashT = ctx.time;
  }
  e.weapon.cancelReload();
  e.protectT = 0;
  bus.emit('melee', { entityId: e.id, phase: 'swing', position: e.pos, kind });
}

/** Mulai ayunan popor; reload sebelum titik komit dibatalkan (setelah komit: amunisi sudah masuk). */
export function startMelee(e: Entity): boolean {
  if (!canMelee(e)) return false;
  begin(e, 'butt');
  return true;
}

/** Mulai serangan pisau: tebas (klik kiri) atau tusuk (klik kanan). */
export function startKnife(e: Entity, stab: boolean): boolean {
  if (!canKnife(e)) return false;
  begin(e, stab ? 'stab' : 'slash');
  return true;
}

/** Batalkan serangan yang sedang berjalan (ganti senjata setelah titik kena). */
export function cancelMelee(e: Entity) { e.meleeT = -1; e.meleeCd = 0; }

/** Per frame untuk entitas hidup: kena pada hitDelay, selesai pada duration, lalu jeda cooldown. */
export function updateMelee(e: Entity, dt: number) {
  if (e.meleeCd > 0) e.meleeCd = Math.max(0, e.meleeCd - dt);
  if (e.meleeT < 0) return;
  const k = kindSpec(e, e.meleeKind);
  e.meleeT += dt;
  if (!e.meleeHit && e.meleeT >= k.hitDelay) { e.meleeHit = true; resolve(e, k); }
  if (e.meleeT >= k.duration) { e.meleeT = -1; e.meleeCd = k.cooldown; }
}

/** Progres animasi 0..1 (−1 bila tidak menyerang). */
export const meleeProgress = (e: Entity) => (e.meleeT < 0 ? -1 : Math.min(1, e.meleeT / kindSpec(e, e.meleeKind).duration));
/** Progres pukulan popor saja (pose senapan); −1 bila bukan popor. */
export const buttProgress = (e: Entity) => (e.meleeKind === 'butt' ? meleeProgress(e) : -1);
/** Progres serangan pisau saja; −1 bila bukan pisau. */
export const knifeProgress = (e: Entity) => (e.meleeKind !== 'butt' ? meleeProgress(e) : -1);

function resolve(e: Entity, k: KindSpec) {
  e.eye(_eye);
  const reach = e.meleeKind === 'butt' ? M.range : MELEES[e.weapon.melee].reach;   // jangkauan per senjata jarak dekat
  let victim: Entity | null = null, partKey: PartKey | null = null, best = Infinity, wall = false;
  for (const [yo, po] of OFFSETS) {
    const yaw = e.yaw + D2R(M.coneDeg) * yo, pitch = e.pitch + D2R(M.coneDeg) * po, cp = Math.cos(pitch);
    _dir.set(-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp);
    const h = castShot(_eye, _dir, 0, e, true);
    if (!h || h.t > reach) continue;
    if (h.kind === 'body' && h.victim && h.t < best) { best = h.t; victim = h.victim; partKey = (h.partKey as PartKey) ?? 'upper'; _pt.copy(h.point); }
    else if (h.kind === 'world' && !victim && !wall && yo === 0 && po === 0) { wall = true; _pt.copy(h.point); _n.copy(h.normal); }
  }
  if (victim) {
    const back = isFromBehind(victim.yaw, e.yaw);
    _dir.set(-Math.sin(e.yaw), 0.15, -Math.cos(e.yaw)).normalize();
    ctx.vfx.bodyHit(_pt, victim, (partKey ?? 'upper') as never);
    ctx.teams.applyDamage(victim, e, back ? k.backDamage : k.damage, 'upper', k.weapon, _dir, false);
    bus.emit('melee', { entityId: e.id, phase: 'hit', position: _pt, kind: e.meleeKind });
  } else if (wall) {
    ctx.vfx.chips(_pt, _n, 0x7c5c46, 3);
    bus.emit('melee', { entityId: e.id, phase: 'wall', position: _pt, kind: e.meleeKind });
  }
}
