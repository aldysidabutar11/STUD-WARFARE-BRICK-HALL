// src/combat/Ballistics.ts — spread (§7.3), castShot dua tahap dengan origin mata (§9.3), pipeline tembakan
// + ekspansi senjata: spread dasar per senjata, shotgun (pellet: pusat pola = crosshair, damage per korban dijumlah jadi satu hit),
// sniper/DMR (akurasi ADS mengikuti progres optik terbuka).
import * as THREE from 'three';
import { RAPIER, physics } from '../physics/Physics';
import { QUERY } from '../physics/groups';
import { CFG } from '../config/gameConfig';
import { damage } from './Damage';
import { stanceMult } from './Recoil';
import { needsFullAds, pelletsOf } from './weaponStats';
import type { WeaponDef } from '../config/weaponsData';
import { SHOT_PELLET } from '../net/protocol';
import { bus, type HitPart } from '../core/EventBus';
import { ctx } from '../game/ctx';
import type { Entity } from '../entities/Entity';
import { PART_KEYS as PART_ORDER } from '../entities/BlockyCharacter';
import { currentMap } from '../world/maps/registry';
import { SURFACE_COLOR, WATER_LIFT, surfaceCode } from '../world/surfaces';
import { makeRng } from '../core/Rng';

const S = CFG.combat.spread;
const UP = new THREE.Vector3(0, 1, 0);
const tmpR = new THREE.Vector3(), tmpU = new THREE.Vector3(), tmpO = new THREE.Vector3();
const raycaster = new THREE.Raycaster();
raycaster.layers.enableAll();
let rapierRay: RAPIER.Ray | null = null;
const hitList: THREE.Mesh[] = [];
const isects: THREE.Intersection[] = [];

/**
 * Sudut setengah kerucut (derajat) sesuai kondisi. Tanpa `w` = AR GDD §7.3. Senjata tambahan: spread dasar hip/ADS sendiri
 * (tambahan gerak/lompat/jongkok tetap GDD; ADS di udara tidak pernah lebih rapat dari ADS diam → shotgun lompat tidak jadi
 * "sniper"). Sniper/DMR: akurasi ADS baru penuh saat optik terbuka (adsP 0..1, smoothstep dari spread hip).
 */
export function spreadDeg(ads: boolean, airborne: boolean, moving: boolean, crouched: boolean, w?: WeaponDef, adsP = 1): number {
  const hip0 = w?.spreadHip ?? S.hip, ads0 = w?.spreadAds ?? S.ads;
  let hip = hip0 + (airborne ? S.hipAirAdd : moving ? S.hipMoveAdd : 0);
  if (crouched && !airborne) hip *= S.hipCrouchMult;
  if (!ads) return hip;
  const a = airborne ? Math.max(S.adsAir, ads0) : ads0 + (moving && !crouched ? S.adsMoveAdd : 0);
  if (w && needsFullAds(w) && adsP < 1) { const k = adsP * adsP * (3 - 2 * adsP); return hip + (a - hip) * k; }
  return a;
}

/** Arah peluru acak seragam di dalam kerucut (sudut setengah = spreadDeg). rnd = sumber acak (default Math.random). */
export function applySpread(dir: THREE.Vector3, spreadDegVal: number, out: THREE.Vector3, rnd: () => number = Math.random) {
  const theta = THREE.MathUtils.degToRad(spreadDegVal) * Math.sqrt(rnd()); // sqrt -> rata di piringan
  const phi = 2 * Math.PI * rnd();
  tmpR.crossVectors(dir, UP); if (tmpR.lengthSq() < 1e-6) tmpR.set(1, 0, 0); tmpR.normalize();
  tmpU.crossVectors(tmpR, dir).normalize();
  const t = Math.tan(theta);
  return out.copy(dir).addScaledVector(tmpR, Math.cos(phi) * t).addScaledVector(tmpU, Math.sin(phi) * t).normalize();
}

export interface ShotHit {
  kind: 'body' | 'world';
  point: THREE.Vector3; normal: THREE.Vector3; t: number;
  part?: HitPart; victim?: Entity; partKey?: string; collider?: number;
}
const hitResult: ShotHit = { kind: 'world', point: new THREE.Vector3(), normal: new THREE.Vector3(), t: 0 };

/** Hitbox musuh yang hidup (friendly fire OFF → rekan setim tidak terkena). */
function enemyHitboxes(shooter: Entity): THREE.Mesh[] {
  hitList.length = 0;
  for (const e of ctx.entities) {
    if (!e.alive || e === shooter) continue;
    if (!CFG.combat.friendlyFire && e.team === shooter.team) continue;
    for (const h of e.char.hitboxes) hitList.push(h);
  }
  return hitList;
}

/** Raycast peluru: Rapier untuk dunia, THREE.Raycaster untuk bagian tubuh, buku ditembus + impuls. */
export function castShot(origin: THREE.Vector3, dir: THREE.Vector3, tMin: number, shooter: Entity, aimOnly = false): ShotHit | null {
  const max = CFG.combat.maxRange;
  const o = tmpO.copy(origin).addScaledVector(dir, tMin);
  rapierRay ??= new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 });
  rapierRay.origin.x = o.x; rapierRay.origin.y = o.y; rapierRay.origin.z = o.z;
  rapierRay.dir.x = dir.x; rapierRay.dir.y = dir.y; rapierRay.dir.z = dir.z;
  const w = physics.world.castRayAndGetNormal(rapierRay, max - tMin, true, undefined, QUERY.BULLET_STATIC);
  const tWorld = w ? w.timeOfImpact : max - tMin;
  raycaster.set(o, dir); raycaster.near = 0; raycaster.far = tWorld;
  isects.length = 0;
  raycaster.intersectObjects(enemyHitboxes(shooter), false, isects);
  const body = isects[0];
  if (!aimOnly) {
    const p = physics.world.castRay(rapierRay, Math.min(tWorld, body ? body.distance : tWorld), true, undefined, QUERY.BULLET_PROP);
    if (p) {
      const hp = tmpR.copy(o).addScaledVector(dir, p.timeOfImpact);
      ctx.props.bulletHit(p.collider.handle, dir, hp);
      bus.emit('impact', { position: hp, normal: dir, material: 'book' });
    }
  }
  if (body) {
    const m = body.object as THREE.Mesh;
    hitResult.kind = 'body'; hitResult.point.copy(body.point); hitResult.t = tMin + body.distance;
    hitResult.part = m.userData.part as HitPart; hitResult.partKey = m.userData.key;
    hitResult.victim = ctx.byId.get(m.userData.entityId as number);
    hitResult.normal.copy(dir).negate();
    return hitResult;
  }
  if (w) {
    hitResult.kind = 'world'; hitResult.point.copy(o).addScaledVector(dir, tWorld);
    hitResult.normal.set(w.normal.x, w.normal.y, w.normal.z); hitResult.t = tMin + tWorld;
    hitResult.victim = undefined; hitResult.part = undefined; hitResult.collider = w.collider.handle;
    return hitResult;
  }
  return null;
}

const pFire = new THREE.Vector3(), vCam = new THREE.Vector3(), vShot = new THREE.Vector3(), pTarget = new THREE.Vector3();
const tmp = new THREE.Vector3(), muzzle = new THREE.Vector3(), endV = new THREE.Vector3(), recoilOut = { dPitch: 0, dYaw: 0 };
const vPel = new THREE.Vector3(), firstEnd = new THREE.Vector3();
const PARTS: readonly HitPart[] = ['head', 'upper', 'lower', 'limb'];
/** Akumulasi damage pellet per korban (tanpa alokasi per tembakan): korban, total, damage per bagian. */
interface PelletAcc { victim: Entity | null; total: number; byPart: number[] }
const pelletAcc: PelletAcc[] = Array.from({ length: 16 }, () => ({ victim: null, total: 0, byPart: [0, 0, 0, 0] }));

/** Efek tembakan ke jaringan (host → klien): jenis kena, titik, normal, material, korban, bagian; flag = SHOT_PELLET untuk pellet 2+. */
function netShot(e: Entity, hit: ShotHit | null, end: THREE.Vector3, flag: number) {
  if (!ctx.net.onShot) return;
  const body = hit?.kind === 'body' && hit.victim;
  ctx.net.onShot(e, (!hit ? 0 : body ? 2 : 1) | flag, end, hit ? hit.normal : null,
    hit && !body ? surfaceCode(currentMap().surfaceAt(hit.point.x, hit.point.y, hit.point.z)) : 0, body ? hit.victim!.id : 0,
    body ? Math.max(0, PART_ORDER.indexOf(hit.partKey as never)) : 0);
}

/** Bekas kena dunia: decal, serpihan & kepulan sesuai permukaan, suara. */
function worldImpact(hit: ShotHit) {
  const mat = currentMap().surfaceAt(hit.point.x, hit.point.y, hit.point.z);
  if (mat === 'water') waterSplash(hit.point);
  else {
    ctx.vfx.decal(hit.point, hit.normal);
    ctx.vfx.chips(hit.point, hit.normal, SURFACE_COLOR[mat], 4);
    ctx.vfx.puff(hit.point, hit.normal, SURFACE_COLOR[mat]);
  }
  bus.emit('impact', { position: hit.point, normal: hit.normal, material: mat });
}

const _splash = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
/** Percikan peluru di air dangkal: di permukaan air (bukan di dasar kolam), butir lebih banyak, tanpa bekas peluru. */
export function waterSplash(p: THREE.Vector3) {
  _splash.set(p.x, p.y + WATER_LIFT, p.z);
  ctx.vfx.chips(_splash, _up, SURFACE_COLOR.water, 7);
  ctx.vfx.puff(_splash, _up, SURFACE_COLOR.water);
}

/** Acak tembakan deterministik (seed match × entitas × tembakan ke-n per nyawa) → prediksi klien = hasil host. */
export function shotRandom(e: Entity): () => number {
  return makeRng((ctx.net.seed ^ Math.imul(e.id + 1, 0x9e3779b1) ^ Math.imul(e.weapon.shotsFired + 1, 0x85ebca77)) >>> 0);
}

/** Satu tembakan: spread → raycast → damage → recoil → event 'shot' + VFX. Shotgun: semua pellet dalam satu panggilan. */
export function fireOne(e: Entity) {
  const w = e.weapon, rig = ctx.camRig, def = w.def;
  const moving = e.ctrl.speedH > S.movingSpeed;
  const cone = spreadDeg(w.adsActive, e.airborne, moving, e.crouched, def, w.adsP);
  const pellets = pelletsOf(def);
  // peluru tunggal: arah diacak dalam kerucut spread. Shotgun: pusat pola = crosshair, kerucut = pola pellet
  const spread = pellets > 1 ? 0 : cone;
  e.eye(pFire);
  const tpsAim = e.isPlayer && !rig.isFpsView;
  const rnd = shotRandom(e);
  // host: penembak remote → hitbox lawan di-rewind ke saat yang dilihat penembak (lag compensation)
  const rewound = !!(e.remote && ctx.net.rewind?.(e));
  if (tpsAim) {
    // Tahap 1: ray kamera (sudah diberi spread) → P_target; abaikan hit sebelum t_min
    rig.forward(tmp); applySpread(tmp, spread, vCam, rnd);
    const tMin = Math.max(0, tmp.copy(pFire).sub(rig.position).dot(vCam));
    const h1 = castShot(rig.position, vCam, tMin, e, true);
    if (h1) pTarget.copy(h1.point); else pTarget.copy(rig.position).addScaledVector(vCam, CFG.combat.maxRange);
    // Tahap 2: arah sebenarnya dari titik mata
    vShot.copy(pTarget).sub(pFire);
    if (vShot.length() < 1.0) vShot.copy(vCam); else vShot.normalize();
  } else {
    if (e.isPlayer) rig.forward(tmp); else e.aimDir(tmp);
    applySpread(tmp, spread, vShot, rnd);
  }
  e.stats.shots++;
  e.protectT = 0; // perlindungan spawn berakhir saat menembak
  const fpsView = e.isPlayer && rig.isFpsView;
  if (fpsView) {
    ctx.viewmodel.fire();
    rig.right(tmp); muzzle.copy(rig.position).addScaledVector(tmp, 0.22);
    rig.up(tmp); muzzle.addScaledVector(tmp, -0.18);
    rig.forward(tmp); muzzle.addScaledVector(tmp, 0.7);
    if (!def.suppressed) ctx.vfx.flashLight(muzzle);
  } else {
    e.muzzleWorld(muzzle);
    ctx.vfx.muzzleFlash(muzzle, vShot, !!def.suppressed);
  }
  const every = e.isPlayer ? CFG.combat.tracerEvery.player : CFG.combat.tracerEvery.bot;
  if (pellets === 1) {
    // Tahap 3: validasi halangan dari titik mata (FPS & TPS identik)
    const hit = castShot(pFire, vShot, 0, e);
    if (rewound) ctx.net.restore?.();
    const end = hit ? hit.point : endV.copy(pFire).addScaledVector(vShot, CFG.combat.maxRange); // vektor sendiri (tmp dipakai ulang di bawah)
    if (w.shotsFired % every === 0) ctx.vfx.tracer(muzzle, end);
    ctx.vfx.shell(e, fpsView);
    bus.emit('shot', { shooterId: e.id, weaponId: def.id, origin: pFire, dir: vShot, end });
    netShot(e, hit, end, 0);
    if (hit) {
      if (hit.kind === 'body' && hit.victim && hit.part) {
        const d = hit.point.distanceTo(pFire); // jarak falloff d = |hit.point − P_fire|
        const dmg = damage(def, hit.part, d);
        e.stats.hits++;
        if (hit.part === 'head') e.stats.hsHits++;
        ctx.vfx.bodyHit(hit.point, hit.victim, hit.partKey as never);
        ctx.teams.applyDamage(hit.victim, e, dmg, hit.part, def.id, vShot, false);
        bus.emit('impact', { position: hit.point, normal: hit.normal, material: 'body' });
      } else { worldImpact(hit); ctx.breakables.bulletHit(hit.collider, damage(def, 'upper', hit.point.distanceTo(pFire))); }
    }
  } else {
    // shotgun: tiap pellet raycast sendiri (seed sama → prediksi klien = host); damage per korban dijumlah → satu hit/hitmarker
    let nAcc = 0, anyBody = false, anyHead = false;
    for (let i = 0; i < pellets; i++) {
      applySpread(vShot, cone, vPel, rnd);
      const hit = castShot(pFire, vPel, 0, e);
      const end = hit ? hit.point : endV.copy(pFire).addScaledVector(vPel, CFG.combat.maxRange);
      if (i === 0) firstEnd.copy(end);
      if (i % 3 === 0) ctx.vfx.tracer(muzzle, end);
      netShot(e, hit, end, i > 0 ? SHOT_PELLET : 0);
      if (!hit) continue;
      if (hit.kind === 'body' && hit.victim && hit.part) {
        const dmg = damage(def, hit.part, hit.point.distanceTo(pFire));
        let a = pelletAcc.find((x, k) => k < nAcc && x.victim === hit.victim);
        if (!a && nAcc < pelletAcc.length) { a = pelletAcc[nAcc++]; a.victim = hit.victim; a.total = 0; a.byPart.fill(0); }
        if (a) { a.total += dmg; a.byPart[PARTS.indexOf(hit.part)] += dmg; }
        anyBody = true; if (hit.part === 'head') anyHead = true;
        ctx.vfx.bodyHit(hit.point, hit.victim, hit.partKey as never);
        bus.emit('impact', { position: hit.point, normal: hit.normal, material: 'body' });
      } else { worldImpact(hit); ctx.breakables.bulletHit(hit.collider, damage(def, 'upper', hit.point.distanceTo(pFire))); }
    }
    if (rewound) ctx.net.restore?.();
    ctx.vfx.shell(e, fpsView);
    bus.emit('shot', { shooterId: e.id, weaponId: def.id, origin: pFire, dir: vShot, end: firstEnd });
    if (anyBody) e.stats.hits++;
    if (anyHead) e.stats.hsHits++;
    for (let k = 0; k < nAcc; k++) {
      const a = pelletAcc[k], b = a.byPart;
      // bagian yang dilaporkan (killfeed headshot, indikator) = bagian dengan damage terbesar
      let pi = 0; for (let j = 1; j < 4; j++) if (b[j] > b[pi]) pi = j;
      ctx.teams.applyDamage(a.victim!, e, a.total, PARTS[pi], def.id, vShot, false);
      a.victim = null;
    }
  }

  // recoil (ADS tidak mengubah sudut recoil)
  e.recoil.onFire(ctx.time, def, stanceMult(e.crouched, e.airborne, def), recoilOut);
  const dp = THREE.MathUtils.degToRad(recoilOut.dPitch), dy = THREE.MathUtils.degToRad(recoilOut.dYaw);
  if (e.isPlayer) { rig.addLook(dy, dp); e.yaw = rig.yaw; e.pitch = rig.pitch; }
  else if (e.bot) e.bot.onRecoil(recoilOut.dPitch, recoilOut.dYaw); // pitch bot = track + sisa recoilPitch
}
