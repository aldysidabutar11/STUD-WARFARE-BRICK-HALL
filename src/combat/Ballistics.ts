// src/combat/Ballistics.ts — spread (§7.3), castShot dua tahap dengan origin mata (§9.3), pipeline tembakan
import * as THREE from 'three';
import { RAPIER, physics } from '../physics/Physics';
import { QUERY } from '../physics/groups';
import { CFG } from '../config/gameConfig';
import { damage } from './Damage';
import { stanceMult } from './Recoil';
import { bus, type HitPart } from '../core/EventBus';
import { ctx } from '../game/ctx';
import type { Entity } from '../entities/Entity';
import { surfaceAt } from '../world/MapData';

const S = CFG.combat.spread;
const UP = new THREE.Vector3(0, 1, 0);
const tmpR = new THREE.Vector3(), tmpU = new THREE.Vector3(), tmpO = new THREE.Vector3();
const raycaster = new THREE.Raycaster();
raycaster.layers.enableAll();
let rapierRay: RAPIER.Ray | null = null;
const hitList: THREE.Mesh[] = [];
const isects: THREE.Intersection[] = [];

/** Sudut setengah kerucut (derajat) sesuai kondisi. */
export function spreadDeg(ads: boolean, airborne: boolean, moving: boolean, crouched: boolean): number {
  if (ads) return airborne ? S.adsAir : S.ads + (moving && !crouched ? S.adsMoveAdd : 0);
  let s = S.hip + (airborne ? S.hipAirAdd : moving ? S.hipMoveAdd : 0);
  if (crouched && !airborne) s *= S.hipCrouchMult;
  return s;
}

/** Arah peluru acak seragam di dalam kerucut (sudut setengah = spreadDeg). */
export function applySpread(dir: THREE.Vector3, spreadDegVal: number, out: THREE.Vector3) {
  const theta = THREE.MathUtils.degToRad(spreadDegVal) * Math.sqrt(Math.random()); // sqrt -> rata di piringan
  const phi = 2 * Math.PI * Math.random();
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
const tmp = new THREE.Vector3(), muzzle = new THREE.Vector3(), recoilOut = { dPitch: 0, dYaw: 0 };
const SURFACE_COLOR = { tile: 0x9a9a9a, carpet: 0x1f3a73, wood: 0x7c5c46 } as const;

/** Satu peluru: spread → raycast → damage → recoil → event 'shot' + VFX. */
export function fireOne(e: Entity) {
  const w = e.weapon, rig = ctx.camRig;
  const moving = e.ctrl.speedH > S.movingSpeed;
  const spread = spreadDeg(w.adsActive, e.airborne, moving, e.crouched);
  e.eye(pFire);
  const tpsAim = e.isPlayer && !rig.isFpsView;
  if (tpsAim) {
    // Tahap 1: ray kamera (sudah diberi spread) → P_target; abaikan hit sebelum t_min
    rig.forward(tmp); applySpread(tmp, spread, vCam);
    const tMin = Math.max(0, tmp.copy(pFire).sub(rig.position).dot(vCam));
    const h1 = castShot(rig.position, vCam, tMin, e, true);
    if (h1) pTarget.copy(h1.point); else pTarget.copy(rig.position).addScaledVector(vCam, CFG.combat.maxRange);
    // Tahap 2: arah sebenarnya dari titik mata
    vShot.copy(pTarget).sub(pFire);
    if (vShot.length() < 1.0) vShot.copy(vCam); else vShot.normalize();
  } else {
    if (e.isPlayer) rig.forward(tmp); else e.aimDir(tmp);
    applySpread(tmp, spread, vShot);
  }
  // Tahap 3: validasi halangan dari titik mata (FPS & TPS identik)
  const hit = castShot(pFire, vShot, 0, e);
  e.stats.shots++;
  e.protectT = 0; // perlindungan spawn berakhir saat menembak
  const end = hit ? hit.point : tmp.copy(pFire).addScaledVector(vShot, CFG.combat.maxRange);

  // efek visual & audio
  const fpsView = e.isPlayer && rig.isFpsView;
  if (fpsView) {
    ctx.viewmodel.fire();
    rig.right(tmp); muzzle.copy(rig.position).addScaledVector(tmp, 0.22);
    rig.up(tmp); muzzle.addScaledVector(tmp, -0.18);
    rig.forward(tmp); muzzle.addScaledVector(tmp, 0.7);
  } else {
    e.muzzleWorld(muzzle);
    ctx.vfx.muzzleFlash(muzzle, vShot);
  }
  const every = e.isPlayer ? CFG.combat.tracerEvery.player : CFG.combat.tracerEvery.bot;
  if (w.shotsFired % every === 0) ctx.vfx.tracer(muzzle, hit ? hit.point : end);
  ctx.vfx.shell(e, fpsView);
  bus.emit('shot', { shooterId: e.id, weaponId: w.def.id, origin: pFire, dir: vShot });

  if (hit) {
    if (hit.kind === 'body' && hit.victim && hit.part) {
      const d = hit.point.distanceTo(pFire); // jarak falloff d = |hit.point − P_fire|
      const dmg = damage(w.def, hit.part, d);
      e.stats.hits++;
      if (hit.part === 'head') e.stats.hsHits++;
      ctx.vfx.bodyHit(hit.point, hit.victim, hit.partKey as never);
      ctx.teams.applyDamage(hit.victim, e, dmg, hit.part, w.def.id, vShot, false);
      bus.emit('impact', { position: hit.point, normal: hit.normal, material: 'body' });
    } else {
      const mat = surfaceAt(hit.point.x, hit.point.y, hit.point.z);
      ctx.vfx.decal(hit.point, hit.normal);
      ctx.vfx.chips(hit.point, hit.normal, SURFACE_COLOR[mat], 4);
      bus.emit('impact', { position: hit.point, normal: hit.normal, material: mat });
    }
  }

  // recoil (ADS tidak mengubah sudut recoil)
  e.recoil.onFire(ctx.time, w.def, stanceMult(e.crouched, e.airborne), recoilOut);
  const dp = THREE.MathUtils.degToRad(recoilOut.dPitch), dy = THREE.MathUtils.degToRad(recoilOut.dYaw);
  if (e.isPlayer) { rig.addLook(dy, dp); e.yaw = rig.yaw; e.pitch = rig.pitch; }
  else if (e.bot) e.bot.onRecoil(recoilOut.dPitch, recoilOut.dYaw); // pitch bot = track + sisa recoilPitch
}
