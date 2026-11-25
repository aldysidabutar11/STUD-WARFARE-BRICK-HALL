// src/entities/TacticalBot.ts — FSM, persepsi, aim, navigasi bot (GDD §11). Bot memakai aturan yang sama dengan pemain.
// Lapisan "bot manusiawi" (XCFG.bots.human; tabel kesulitan GDD §11.5 tidak diubah — lihat CLAUDE.md "Bot manusiawi"):
//  • bidik: sentakan minimum-jerk + kelewatan/koreksi (botAim.ts), waktu reaksi bervariasi per situasi, syarat tembak terhadap titik
//    bidik yang dimaksud (error GDD = tembakan awal meleset), kaget saat kena tembak / peluru lewat dekat kepala;
//  • tempur: geser–berhenti–tembak, bertarung dari balik cover (sembunyi ↔ intip), reload di balik cover, kabur dari granat,
//    penyerang tak terlihat = hanya arah kira-kira (bukan posisi persis) → menoleh / cari cover;
//  • patroli & tim: pandangan ke sudut yang baru terbuka & ke depan jalur, jalan (bukan sprint) di zona kontak, berhenti cek
//    di persimpangan, callout antar-bot berjeda (BotDirector).
import * as THREE from 'three';
import { XCFG, type BotDifficultyDef, type BotHumanDef, type Difficulty } from '../config/extraConfig';
import { CFG } from '../config/gameConfig';
import { physics } from '../physics/Physics';
import { QUERY } from '../physics/groups';
import { bus } from '../core/EventBus';
import { ctx } from '../game/ctx';
import { laneRoute, type Lane } from '../game/BotDirector';
import type { Entity } from './Entity';
import type { TriggerInput } from '../combat/WeaponSystem';
import type { GrenadeInput } from '../combat/GrenadeK400';
import type { NavEdge } from '../world/NavGraph';
import { currentMap } from '../world/maps/registry';
import { WEAPONS } from '../config/weaponsData';
import { canMelee } from '../combat/Melee';
import { moveFeel } from './moveFeel';
import { estimateSource, newAimState, reactionTime, resetAim, segPointDist2, stepAim, type AimParams } from './botAim';
import { coverFrom, fightSpot, fleeNode, type FightSpot } from './botTactics';

const B = XCFG.bots, H = XCFG.bots.human;
const D2R = THREE.MathUtils.degToRad, R2D = THREE.MathUtils.radToDeg;
const EYE = CFG.player.eyeStand, EYE_C = CFG.player.eyeCrouch;
export type BotState = 'SPAWN' | 'PATROL' | 'ENGAGE' | 'TAKE_COVER' | 'RELOAD' | 'INVESTIGATE' | 'THROW_GRENADE' | 'EVADE' | 'DEAD';
type FightPhase = 'go' | 'hide' | 'peek';

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _eye = new THREE.Vector3(), _d = new THREE.Vector3();
const _h = new THREE.Vector3(), _t = new THREE.Vector3();
const _est = { x: 0, z: 0 };
const _path: number[] = [];
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = (r: readonly [number, number]) => rand(r[0], r[1]);
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const yawTo = (dx: number, dz: number) => Math.atan2(-dx, -dz);
const blocked = (ax: number, ay: number, az: number, bx: number, by: number, bz: number) => physics.losBlocked(ax, ay, az, bx, by, bz);
const _o = { x: 0, y: 0, z: 0 }, _down = { x: 0, y: -1, z: 0 };
/** Tinggi lantai di bawah (x, z) dekat y (raycast ke bawah dari y + 2, maks 4 u) — titik intip tidak boleh di tepi/jurang. */
const ground = (x: number, y: number, z: number) => {
  _o.x = x; _o.y = y + 2; _o.z = z;
  const d = physics.raycast(_o, _down, 4, QUERY.LOS);
  return d < 0 ? null : y + 2 - d;
};
const FIGHT_OPTS = { maxDist: H.fight.maxDist, offsets: H.fight.offsets, eyes: { stand: EYE, crouch: EYE_C } };
const FLEE_OPTS = { radius: H.grenade.flee, safe: H.grenade.safe, chestY: 2.5 };

interface Drop { shelf: THREE.Vector3; takeoff: THREE.Vector3; dir: THREE.Vector3; phase: 'runup' | 'run' | 'air' | 'done'; sprint: boolean; jumpDist: number; brake: boolean }

export class TacticalBot {
  state: BotState = 'SPAWN';
  private prev: BotState = 'PATROL';
  stateT = 0;
  readonly diff: BotDifficultyDef;
  /** Angka "bot manusiawi" per kesulitan (XCFG.bots.human.diff). */
  readonly hum: BotHumanDef;
  /** Id jalur dari MapDef.lanes ('' = belum dibagi → laneRoute memakai jalur pertama map). */
  lane: Lane = '';
  private route: string[] = [];
  private routeIdx = 0;
  private exploreT = 0;
  // persepsi & memori
  target: Entity | null = null;
  private firstSeenT = -99;
  private lastSeenT = -99;
  /** Waktu reaksi kontak sekarang (rata-rata = GDD §11.5, bervariasi per situasi). */
  private reactT = 0;
  visible = false;
  readonly lastKnown = new THREE.Vector3();
  private lastKnownT = -99;
  /** Posisi terakhir yang DILIHAT sendiri (bukan perkiraan/callout) — sasaran granat GDD §11.8 ("posisi terakhir target"). */
  private readonly seenAt = new THREE.Vector3();
  private seenAtT = -99;
  private heardAt = new THREE.Vector3();
  private heardT = -99;
  private investigate = new THREE.Vector3();
  private invMax: number = B.investigateMax;
  // waspada: arah kena tembak / peluru lewat / callout (menoleh cepat ke sana, reaksi lebih cepat bila musuh muncul di situ)
  private readonly alertAt = new THREE.Vector3();
  private alertT = -99;
  /** Perkiraan posisi ancaman yang tidak terlihat (kena tembak / peluru lewat). */
  private readonly threat = new THREE.Vector3();
  private unseenHitT = -99; private unseenDoneT = -99; private unseenCd = 0;
  private lastHitT = -99;
  private suppress = 0; private suppressT = -99;
  // bidik
  private readonly aim = newAimState();
  private readonly combatAim: AimParams;
  private readonly lookAim: AimParams;
  private lookFast = false;
  private readonly lookP = new THREE.Vector3();
  private trueY = 0; private trueP = 0;
  private recoilYaw = 0;
  private errYaw = 0; private errPitch = 0; private errTY = 0; private errTP = 0; private errT = 0;
  private startle = 0; private stY = 1; private stP = 0;
  private aimHead = false;
  private burstLeft = 0; private burstPause = 0; private shotsAtBurst = 0;
  private burstOn = false; private burstDecided = false; private plant = false; private plantWait = 0; private idleFireT = 0;
  private strafeDir = 1; private strafeT = 0; private crouchEngage = false;
  // bertarung dari balik cover
  private fight = false;
  private fightPhase: FightPhase = 'go';
  private fightT = 0; private fightDur = 0; private fightSearchT = 0; private peekSeenT = 0;
  private readonly spot: FightSpot = { node: -1, px: 0, pz: 0, stand: false, hideCrouch: false };
  private readonly coverThreat = new THREE.Vector3();
  private approachT = 0; private coverCd = 0;
  // granat musuh: id → waktu bereaksi (Infinity = tidak sadar)
  private readonly gNotice = new Map<number, number>();
  private readonly gPos = new THREE.Vector3();
  private readonly bounceAt = new THREE.Vector3();
  private bounceT = -99;
  private evadeId = -1;
  private gBest = -1; private gBestD = Infinity;
  // patroli: cek sudut, jeda di persimpangan, zona kontak
  private visT = new Float32Array(0); private chkT = new Float32Array(0); private glanceT = new Float32Array(0);
  private scanIdx = 0; private glanceUntil = 0;
  private pauseT = 0; private pauseLook = -1;
  private contact = false;
  // navigasi
  private path: number[] = [];
  private edges: (NavEdge | null)[] = [];
  private pathIdx = 0;
  private pathStart = -1;
  private readonly nearBuf: [number, number][] = [];
  goal = -1;
  private stuckRef = new THREE.Vector3(); private stuckT = 0; private moving = false;
  private yieldT = 0; private sideT = 0; private sideDir = 1;
  readonly intentDir = new THREE.Vector3();
  private drop: Drop | null = null;
  private safeT = 0;
  // granat
  private grenadeCd = 0; private gStep = 0; private gT = 0;
  private gPlan = { yaw: 0, pitch: 0, cook: 0 };
  readonly trigger: TriggerInput = { pressed: false, held: false, reload: false, modeSwitch: false, ads: false, sprinting: false };
  private unsubs: (() => void)[] = [];
  /** Permintaan pukulan popor (dieksekusi Game lewat startMelee — aturan sama dengan pemain). */
  wantMelee = false;
  readonly gIn: GrenadeInput = { equip: false, toSlot: null, lPress: false, lHeld: false, lRelease: false, rPress: false, rHeld: false, rRelease: false };

  constructor(readonly e: Entity, readonly difficulty: Difficulty, readonly index: number) {
    this.diff = B.difficulty[difficulty];
    this.hum = H.diff[difficulty];
    const turn = D2R(this.diff.turnRate);
    this.combatAim = { maxSpeed: turn, flickMin: D2R(H.aim.flickMinDeg), trackGain: H.aim.trackGain, trackFeed: H.aim.trackFeed,
      overshootChance: this.hum.overshootChance, overshoot: this.hum.overshoot, undershoot: H.aim.undershoot, scatter: H.aim.scatter,
      minFlickT: H.aim.minFlickT };
    this.lookAim = { maxSpeed: turn * H.look.speedMult, flickMin: D2R(H.look.flickMinDeg), trackGain: H.look.trackGain,
      trackFeed: H.look.trackFeed, overshootChance: H.look.overshootChance, overshoot: H.look.overshoot, undershoot: H.aim.undershoot,
      scatter: H.aim.scatter * 0.5, minFlickT: 0.12 };
    // pendengaran: tembakan 5.56 35 u, 7.62 50 u, ledakan 60 u, langkah sprint 12 u, jalan 6 u, jongkok tidak terdengar
    this.unsubs.push(bus.on('shot', (ev) => {
      const s = ctx.byId.get(ev.shooterId);
      if (!s || s.team === this.e.team || !this.e.alive) return;
      this.hear(ev.origin, WEAPONS[ev.weaponId].caliber === '7.62' ? B.hearing.shot762 : B.hearing.shot556);
      this.nearMiss(s, ev.origin, ev.end);
    }));
    this.unsubs.push(bus.on('grenade:explode', (ev) => { if (this.e.alive) this.hear(ev.position, B.hearing.explosion); }));
    this.unsubs.push(bus.on('grenade:bounce', (ev) => {
      if (this.e.alive && ev.position.distanceTo(this.e.pos) < H.grenade.hearBounce) { this.bounceAt.copy(ev.position); this.bounceT = ctx.time; }
    }));
    this.unsubs.push(bus.on('footstep', (ev) => {
      const s = ctx.byId.get(ev.entityId);
      if (!s || s.team === this.e.team || !this.e.alive || s.crouched) return;
      this.hear(ev.position, ev.loud ? B.hearing.sprintStep : B.hearing.walkStep);
    }));
    this.unsubs.push(bus.on('hit', (ev) => this.onHit(ev.attackerId, ev.victimId)));
  }

  dispose() { for (const u of this.unsubs) u(); this.unsubs.length = 0; }

  get trackYaw() { return this.aim.yaw; }
  get trackPitch() { return this.aim.pitch; }

  private hear(p: THREE.Vector3, range: number) {
    if (p.distanceTo(this.e.pos) > range) return;
    const n = B.investigateNoise;
    this.heardAt.set(p.x + rand(-n, n), p.y, p.z + rand(-n, n));
    this.heardT = ctx.time;
  }

  /** Kaget: error bidik tambahan ke arah acak, meluruh exp(−t / decay). */
  private addStartle(deg: number) {
    this.startle = Math.min(H.startle.max, this.startle + deg);
    const th = Math.random() * Math.PI * 2;
    this.stY = Math.cos(th); this.stP = Math.sin(th);
  }

  /** Kena tembak. Penyerang terlihat → hanya kaget kecil; tidak terlihat → kaget + hanya tahu ARAH kira-kira (dulu posisi persis). */
  private onHit(attackerId: number, victimId: number) {
    const e = this.e;
    if (victimId !== e.id || attackerId < 0 || attackerId === e.id || !e.alive) return;
    this.safeT = 0;
    const a = ctx.byId.get(attackerId);
    if (!a) return;
    const now = ctx.time;
    this.lastHitT = now;
    const seen = this.visible && this.target === a;
    this.addStartle(seen ? this.hum.startleHit * 0.5 : this.hum.startleHit);
    if (seen) return;
    estimateSource(e.pos.x, e.pos.z, a.pos.x, a.pos.z, D2R(H.hitDir.angNoiseDeg), H.hitDir.dist[0], H.hitDir.dist[1], Math.random, _est);
    this.threat.set(_est.x, a.pos.y, _est.z);
    this.lastKnown.copy(this.threat); this.lastKnownT = now;
    this.heardAt.copy(this.threat); this.heardT = now;
    this.alertAt.copy(this.threat); this.alertT = now;
    this.unseenHitT = now;
  }

  /** Peluru musuh lewat ≤ radius dari kepala (tidak kena): kaget, tertekan, waspada ke perkiraan posisi penembak. */
  private nearMiss(s: Entity, o: THREE.Vector3, end: THREE.Vector3) {
    const e = this.e;
    if (Math.hypot(end.x - e.pos.x, end.z - e.pos.z) < 1.0 && end.y > e.pos.y - 0.2 && end.y < e.pos.y + 5.2) return; // kena kita: 'hit'
    e.partCenter('head', _h);
    const R = H.nearMiss.radius;
    if (segPointDist2(o.x, o.y, o.z, end.x, end.y, end.z, _h.x, _h.y, _h.z) > R * R) return;
    const now = ctx.time;
    this.addStartle(this.hum.startleNear);
    this.suppress = Math.min(4, this.suppress + 1); this.suppressT = now;
    if (this.visible && this.target === s) return;
    const n = o.distanceTo(_h) * H.nearMiss.alertNoise;
    this.alertAt.set(o.x + rand(-n, n), s.pos.y, o.z + rand(-n, n)); this.alertT = now;
    this.threat.copy(this.alertAt);
    if (now - this.lastKnownT > 1) { this.lastKnown.copy(this.alertAt); this.lastKnownT = now; }
  }

  onSpawn() {
    this.set('SPAWN');
    resetAim(this.aim, this.e.yaw, 0);
    this.recoilYaw = 0; this.startle = 0; this.suppress = 0;
    this.target = null; this.visible = false; this.path.length = 0; this.drop = null; this.goal = -1;
    this.burstLeft = 0; this.burstPause = 0; this.grenadeCd = 0; this.gStep = 0; this.wantMelee = false;
    this.burstOn = false; this.burstDecided = false; this.plant = false;
    this.fight = false; this.alertT = -99; this.unseenHitT = -99; this.unseenDoneT = -99; this.lastHitT = -99; this.seenAtT = -99;
    this.gNotice.clear(); this.evadeId = -1; this.pauseT = 0; this.glanceUntil = 0;
    this.lookP.set(this.e.pos.x - Math.sin(this.e.yaw) * 10, this.e.pos.y + EYE, this.e.pos.z - Math.cos(this.e.yaw) * 10);
    this.stuckRef.copy(this.e.pos); this.stuckT = 0;
  }

  private set(s: BotState) {
    if (s === this.state) return;
    if (s === 'RELOAD' || s === 'THROW_GRENADE') this.prev = this.state;
    if (this.state === 'ENGAGE') { this.fight = false; this.plant = false; this.burstOn = false; this.burstDecided = false; }
    this.state = s; this.stateT = 0; this.pauseT = 0;
    if (s === 'INVESTIGATE') this.invMax = B.investigateMax;
  }

  private ensureNodeArrays() {
    const n = ctx.nav.nodes.length;
    if (this.visT.length === n) return;
    this.visT = new Float32Array(n).fill(-99); this.chkT = new Float32Array(n).fill(-99); this.glanceT = new Float32Array(n).fill(-99);
    this.scanIdx = 0;
  }

  // ─────────────────────────── persepsi (10 Hz)
  private perceive() {
    const e = this.e, now = ctx.time;
    e.eye(_eye);
    const half = D2R(this.diff.fov) / 2;
    let best: Entity | null = null, bestD = Infinity;
    for (const o of ctx.entities) {
      if (!o.alive || o.team === e.team) continue;
      const dx = o.pos.x - e.pos.x, dz = o.pos.z - e.pos.z, dist = Math.hypot(dx, o.pos.y - e.pos.y, dz);
      if (dist > this.diff.sight) continue;
      if (Math.abs(wrap(yawTo(dx, dz) - e.yaw)) > half && dist > 4) continue;
      o.partCenter('head', _a);
      let vis = !physics.losBlocked(_eye.x, _eye.y, _eye.z, _a.x, _a.y, _a.z);
      if (!vis) { o.partCenter('upper', _a); vis = !physics.losBlocked(_eye.x, _eye.y, _eye.z, _a.x, _a.y, _a.z); }
      if (vis && dist < bestD) { best = o; bestD = dist; }
    }
    if (best) {
      if (best !== this.target || now - this.lastSeenT > B.loseTarget) this.acquire(best, bestD, now);
      this.target = best; this.lastSeenT = now;
      this.lastKnown.copy(best.pos); this.lastKnownT = now;
      this.seenAt.copy(best.pos); this.seenAtT = now;
      const dir = ctx.directors[e.team];
      dir.report(best, now);
      dir.callout(e, best, now, pick(this.hum.callout));
    }
    this.visible = !!best;
    if (now - this.lastKnownT > B.memory) this.lastKnownT = -99;
    if (this.target && !this.target.alive) { this.target = null; this.visible = false; }
  }

  /** Kontak baru: bias kepala per engagement (GDD) + waktu reaksi manusiawi dari situasi saat melihat. */
  private acquire(t: Entity, dist: number, now: number) {
    this.firstSeenT = now; this.aimHead = Math.random() < this.diff.headBias;
    this.errT = 0;
    const e = this.e;
    t.partCenter('upper', _a); e.eye(_eye);
    const ty = yawTo(_a.x - _eye.x, _a.z - _eye.z), tp = Math.atan2(_a.y - _eye.y, Math.hypot(_a.x - _eye.x, _a.z - _eye.z));
    const off = Math.hypot(wrap(ty - this.aim.yaw), tp - this.aim.pitch), half = D2R(this.diff.fov) / 2;
    const alerted = now - this.alertT < H.patrol.alertHold
      && Math.abs(wrap(yawTo(this.alertAt.x - e.pos.x, this.alertAt.z - e.pos.z) - ty)) < D2R(H.react.alertDeg);
    this.reactT = reactionTime({ base: this.diff.reaction, u: Math.random(), offAxis: off / half, outsideFov: off > half,
      farness: (dist - 25) / Math.max(1, this.diff.sight - 25), alerted, prepared: off < D2R(H.react.preparedDeg) }, H.react);
  }

  // ─────────────────────────── FSM (10 Hz)
  think() {
    const e = this.e, now = ctx.time;
    if (!e.alive) { this.set('DEAD'); return; }
    this.ensureNodeArrays();
    ctx.directors[e.team].deliver(now, ctx.entities, ctx.nav);
    this.perceive();
    this.suppress = Math.max(0, this.suppress - H.suppress.decay * 0.1);
    if (this.senseGrenades()) { this.updateLook(now); return; }
    this.contact = this.inContact(now);
    const heardRecent = now - this.heardT < 1.0;
    switch (this.state) {
      case 'DEAD': this.set('SPAWN'); break;
      case 'SPAWN':
        if (this.stateT > rand(B.spawnIdle[0], B.spawnIdle[1])) { this.lane = ctx.directors[e.team].assign(e); this.startRoute(); this.set('PATROL'); }
        break;
      case 'PATROL':
        if (this.visible) { this.enterEngage(); break; }
        if (this.reactUnseen(now)) break;
        if (heardRecent) { this.investigate.copy(this.heardAt); this.goTo(this.investigate); this.set('INVESTIGATE'); break; }
        if (e.weapon.ammo < e.weapon.def.magSize * 0.35 && e.weapon.reserve > 0) e.weapon.startReload();
        if (this.pathDone()) {
          if (this.routeIdx < this.route.length) this.nextRouteNode();
          else if (this.exploreT <= 0) this.exploreT = rand(B.patrolExplore[0], B.patrolExplore[1]);
          else this.exploreRandom();
        }
        if (this.routeIdx >= this.route.length && this.exploreT > 0) {
          this.exploreT -= 0.1;
          if (this.exploreT <= 0) { this.lane = ctx.directors[e.team].assign(e); this.startRoute(); }
        }
        break;
      case 'ENGAGE': this.thinkEngage(now); break;
      case 'TAKE_COVER':
        this.safeT += 0.1;
        if (this.pathDone() && e.weapon.ammo < e.weapon.def.magSize) e.weapon.startReload();
        if ((this.safeT >= B.coverSafe && this.pathDone()) || (this.pathDone() && !e.weapon.reloading && this.stateT > 1.2)
          || this.stateT > H.coverTimeout) {                    // pengaman: cover tak tercapai (mis. node di balik dinding)
          if (this.visible) this.enterEngage(); else { this.startRoute(); this.set('PATROL'); }
        }
        break;
      case 'RELOAD':
        if (!e.weapon.reloading) { if (this.visible) this.enterEngage(); else this.set(this.prev === 'ENGAGE' ? 'INVESTIGATE' : this.prev); if ((this.state as BotState) === 'INVESTIGATE') this.goTo(this.lastKnown); }
        break;
      case 'INVESTIGATE':
        if (this.visible) { this.enterEngage(); break; }
        if (this.reactUnseen(now)) break;
        // posisi terakhir target tidak terlihat & dalam 8–24 u → pertimbangkan granat (§11.8)
        if (now - this.seenAtT < 4 && this.wantGrenade()) { this.startGrenade(); break; }
        if (heardRecent && this.heardAt.distanceTo(this.investigate) > 6) { this.investigate.copy(this.heardAt); this.goTo(this.investigate); }
        if (this.stateT > this.invMax || (this.pathDone() && this.stateT > 1.5)) { this.startRoute(); this.set('PATROL'); }
        break;
      case 'THROW_GRENADE':
        if (this.gStep >= 5 || this.stateT > 6) { this.gStep = 0; this.set(this.visible ? 'ENGAGE' : 'INVESTIGATE'); if ((this.state as BotState) === 'INVESTIGATE') this.goTo(this.lastKnown); }
        break;
      case 'EVADE': this.thinkEvade(); break;
    }
    this.updateLook(now);
  }

  private enterEngage() {
    this.set('ENGAGE');
    this.burstLeft = Math.round(rand(this.diff.burst[0], this.diff.burst[1]));
    this.crouchEngage = !!this.target && this.target.pos.distanceTo(this.e.pos) > B.crouchDist && Math.random() < B.crouchChance;
    this.path.length = 0; this.drop = null;
    this.fight = false; this.fightSearchT = 0; this.approachT = 0;
  }

  private thinkEngage(now: number) {
    const e = this.e, t = this.target;
    if (!t || !t.alive) {
      this.target = null; this.set(this.lastKnownT > 0 ? 'INVESTIGATE' : 'PATROL');
      if (this.lastKnownT > 0) this.goTo(this.lastKnown); else this.startRoute();
      return;
    }
    // di posisi cover, target memang tak terlihat selama bersembunyi → batas "hilang" diperpanjang
    const lose = this.fight ? B.loseTarget + H.fight.hide[1] + H.fight.peekLost : B.loseTarget;
    if (now - this.lastSeenT > lose) {
      if (this.wantGrenade()) { this.startGrenade(); return; }
      this.investigate.copy(this.lastKnown); this.goTo(this.investigate); this.set('INVESTIGATE'); return;
    }
    // jarak sangat dekat: pukul popor (selalu bila magasin kosong/reload, selain itu peluang botChance per think)
    if (this.visible && Math.hypot(t.pos.x - e.pos.x, t.pos.z - e.pos.z) < XCFG.melee.botRange && Math.abs(t.pos.y - e.pos.y) < 2.5 && canMelee(e)
      && (e.weapon.ammo === 0 || e.weapon.reloading || Math.random() < XCFG.melee.botChance)) { this.wantMelee = true; return; }
    if (e.hp < B.coverHp && now >= this.coverCd) {
      t.eye(_t);
      if (this.coverTo(_t, B.coverMaxCost)) { this.set('TAKE_COVER'); return; }
      this.coverCd = now + 1;                                     // tidak ada cover: coba lagi 1 s kemudian (A* hemat)
    }
    if (e.weapon.ammo === 0) {
      e.weapon.startReload();
      if (this.fight && this.fightPhase !== 'go') { this.toHide(); return; }   // reload di balik cover posisi tempur
      this.enterReload(); return;
    }
    this.thinkFight(now);
  }

  /** Magasin kosong saat bertempur: bila terlihat musuh, reload sambil menuju cover terdekat (GDD §11.2 "strafe menuju cover"). */
  private enterReload() {
    this.set('RELOAD');
    this.path.length = 0; this.pathIdx = 0; this.drop = null;
    if (this.visible && this.target) { this.target.eye(_t); this.coverTo(_t, H.coverReloadMax); }
  }

  // ─────────────────────────── bertarung dari balik cover (sembunyi ↔ intip)
  private thinkFight(now: number) {
    const e = this.e, t = this.target!, f = this.spot;
    if (!this.fight) {
      if (this.crouchEngage || !this.visible || now < this.fightSearchT) return;
      this.fightSearchT = now + H.fight.research;
      if (t.pos.distanceTo(e.pos) < H.fight.minDist || Math.random() > this.hum.peek) return;
      t.eye(_t); t.partCenter('upper', _c);
      if (!fightSpot(ctx.nav, blocked, ground, e.pos, _t, _c, FIGHT_OPTS, f, _path)) return;
      this.fight = true; this.fightPhase = 'go'; this.fightT = 0;
      this.goToNode(f.node);
      return;
    }
    this.fightT += 0.1;
    const n = ctx.nav.nodes[f.node];
    switch (this.fightPhase) {
      case 'go':
        if (this.pathDone() || Math.hypot(n.x - e.pos.x, n.z - e.pos.z) < 1.0) this.toHide();
        else if (this.fightT > 4) this.dropFight();
        break;
      case 'hide':
        // posisi tidak lagi menyembunyikan (ancaman pindah/mengapit, terlihat dari mata jongkok) → cari posisi baru
        if (this.visible) { t.eye(_t); if (!blocked(n.x, n.y + EYE_C, n.z, _t.x, _t.y, _t.z)) { this.dropFight(); break; } }
        if (this.fightT >= this.fightDur && !e.weapon.reloading) {
          this.fightPhase = 'peek'; this.fightT = 0; this.fightDur = pick(H.fight.peekTime); this.peekSeenT = now;
        }
        break;
      case 'peek': {
        if (this.visible) this.peekSeenT = now;
        if (now - this.peekSeenT > H.fight.peekLost && this.atPeek()) { this.dropFight(); break; }   // target pindah
        const hitBack = now - this.lastHitT < 0.3 && Math.random() < H.fight.hitBack;
        if (this.fightT >= this.fightDur || hitBack || e.weapon.ammo < e.weapon.def.magSize * 0.25) this.toHide();
        break;
      }
    }
  }
  private toHide() {
    this.fightPhase = 'hide'; this.fightT = 0; this.fightDur = pick(H.fight.hide);
    const w = this.e.weapon;
    if (w.ammo < w.def.magSize * H.fight.reloadBelow && w.reserve > 0) w.startReload();
  }
  private dropFight() { this.fight = false; this.fightSearchT = ctx.time + H.fight.research; }
  private atPeek() {
    const f = this.spot, n = ctx.nav.nodes[f.node];
    const x = f.stand ? n.x : f.px, z = f.stand ? n.z : f.pz;
    return Math.hypot(x - this.e.pos.x, z - this.e.pos.z) < 0.6;
  }
  /** Arah gerak posisi tempur: menuju node (sembunyi) atau titik intip; berhenti di zona mati 0.4 u (input hanya arah). */
  private fightMove(out: THREE.Vector3) {
    const f = this.spot, e = this.e, n = ctx.nav.nodes[f.node];
    if (this.fightPhase === 'go') { this.follow(out); return; }
    const peek = this.fightPhase === 'peek' && !f.stand;
    out.set((peek ? f.px : n.x) - e.pos.x, 0, (peek ? f.pz : n.z) - e.pos.z);
    const l = out.length();
    if (l < 0.4) out.set(0, 0, 0); else out.divideScalar(l);
  }

  /** Cover dari titik ancaman t (setinggi mata): node cover terdekat menurut biaya jalur ≤ maxCost (GDD §11.9). */
  private coverTo(t: THREE.Vector3, maxCost: number): boolean {
    const node = coverFrom(ctx.nav, blocked, this.e.pos, t, maxCost, EYE_C, _path);
    if (node < 0) return false;
    this.coverThreat.copy(t);
    this.goToNode(node); this.safeT = 0;
    return true;
  }

  /** Kena tembak / ditekan tembakan dari arah tak terlihat → (peluang) cari cover dari perkiraan posisi penembak. */
  private reactUnseen(now: number): boolean {
    if (now < this.unseenCd) return false;
    const hitNew = this.unseenHitT > this.unseenDoneT;
    const supp = this.suppress >= H.suppress.cover && now - this.suppressT < 1;
    if (!hitNew && !supp) return false;
    this.unseenDoneT = now; this.unseenCd = now + 1;
    if (hitNew && !supp && Math.random() > H.hitDir.coverChance) return false;
    _t.copy(this.threat); _t.y += EYE;
    if (!this.coverTo(_t, H.coverHitMax)) return false;
    this.set('TAKE_COVER');
    return true;
  }

  // ─────────────────────────── granat musuh: sadar (lihat / dengar pantulan) → jeda reaksi → kabur
  private readonly grenadeCb = (x: number, y: number, z: number, _fuse: number, owner: number, id: number) => {
    const e = this.e, now = ctx.time;
    const o = ctx.byId.get(owner);
    if (o && o.team === e.team && o !== e) return;               // granat rekan tidak melukai kita (friendly fire OFF)
    const d = Math.hypot(x - e.pos.x, y - (e.pos.y + 2.5), z - e.pos.z);
    if (d > H.grenade.danger) return;
    let at = this.gNotice.get(id);
    if (at === undefined) {
      const ang = Math.abs(wrap(yawTo(x - e.pos.x, z - e.pos.z) - e.yaw));
      const seen = (ang < D2R(this.diff.fov) / 2 || d < 4) && !physics.losBlocked(_eye.x, _eye.y, _eye.z, x, y + 0.25, z);
      const heard = now - this.bounceT < 0.6 && Math.hypot(this.bounceAt.x - x, this.bounceAt.z - z) < 3;
      if (!seen && !heard) return;                                // belum sadar — dicoba lagi think berikutnya
      at = Math.random() < this.hum.grenadeNotice ? now + this.hum.grenadeReact * rand(0.8, 1.25) : Infinity;
      this.gNotice.set(id, at);
    }
    if (now >= at && d < this.gBestD) { this.gBestD = d; this.gBest = id; this.gPos.set(x, y, z); }
  };
  private senseGrenades(): boolean {
    if (this.state === 'EVADE' || this.state === 'SPAWN' || this.state === 'DEAD') return false;
    if (this.state === 'THROW_GRENADE' && this.gStep >= 3) return false;     // sedang memasak / melempar sendiri
    if (!ctx.grenades.count) { if (this.gNotice.size) this.gNotice.clear(); return false; }
    this.e.eye(_eye);
    this.gBest = -1; this.gBestD = Infinity;
    ctx.grenades.forEachLive(this.grenadeCb);
    if (this.gBest < 0) return false;
    // kabur: node yang terhalang dari titik ledak / di luar radius aman (tidak lewat dekat granat); tanpa node → lurus menjauh
    this.fight = false; this.plant = false; this.drop = null; this.evadeId = this.gBest;
    const node = fleeNode(ctx.nav, blocked, this.e.pos, this.gPos, FLEE_OPTS, _path);
    if (node >= 0) this.goToNode(node); else { this.path.length = 0; this.pathIdx = 0; this.goal = -1; }
    this.set('EVADE');
    return true;
  }
  private evadeLive = false;
  private readonly evadeCb = (x: number, y: number, z: number, _f: number, _o: number, id: number) => {
    if (id === this.evadeId) { this.evadeLive = true; this.gPos.set(x, y, z); }
  };
  private thinkEvade() {
    this.evadeLive = false;
    ctx.grenades.forEachLive(this.evadeCb);
    if (this.evadeLive && this.stateT < H.grenade.maxEvade) return;
    // granat sudah meledak → kembali bertempur / cari penyerang
    if (this.visible) this.enterEngage();
    else if (this.lastKnownT > 0) { this.investigate.copy(this.lastKnown); this.goTo(this.investigate); this.set('INVESTIGATE'); }
    else { this.startRoute(); this.set('PATROL'); }
  }

  // ─────────────────────────── tim: callout dari rekan (BotDirector.deliver)
  /** Bebas merespons callout (sedang patroli / investigasi biasa). */
  canRespond() { return this.e.alive && (this.state === 'PATROL' || this.state === 'INVESTIGATE'); }
  /** Callout rekan sampai: menoleh & waspada ke lokasi; responden (node ≥ 0) menuju node itu. */
  onCallout(x: number, y: number, z: number, node: number) {
    const s = this.state;
    if (!this.e.alive || s === 'ENGAGE' || s === 'THROW_GRENADE' || s === 'EVADE' || s === 'DEAD' || s === 'SPAWN') return;
    const now = ctx.time;
    this.alertAt.set(x, y, z); this.alertT = now;
    if (node < 0 || (s !== 'PATROL' && s !== 'INVESTIGATE')) return;
    this.lastKnown.set(x, y, z); this.lastKnownT = now;
    const n = ctx.nav.nodes[node];
    this.investigate.set(n.x, n.y, n.z);
    this.goToNode(node);
    this.set('INVESTIGATE');
    this.invMax = B.investigateMax + Math.hypot(n.x - this.e.pos.x, n.z - this.e.pos.z) / 6;   // lokasi jauh: waktu jalan
  }

  /** Zona kontak (jalan, bukan sprint): setengah map lawan, baru waspada, atau ada laporan musuh di dekat. */
  private inContact(now: number): boolean {
    const e = this.e, P = H.patrol;
    if (now - this.alertT < P.contactHold) return true;
    const n = ctx.nav.nodes[ctx.nav.nearest(e.pos.x, e.pos.y, e.pos.z)];
    if (n && n.side === (e.team === 'blue' ? 'N' : 'S')) return true;
    return ctx.directors[e.team].reportNear(e.pos.x, e.pos.z, P.contactReport, now, P.contactHold);
  }

  // ─────────────────────────── titik pandang di luar pertempuran (10 Hz; digerakkan halus oleh botAim di update())
  private updateLook(now: number) {
    this.lookFast = false;
    switch (this.state) {
      case 'ENGAGE': case 'THROW_GRENADE': case 'DEAD': case 'SPAWN': return;
      case 'EVADE': this.lookFast = true; this.lookAlongPath(); return;
      case 'TAKE_COVER': this.lookFast = true; this.lookP.copy(this.coverThreat); return;
      case 'RELOAD':
        if (this.lastKnownT > 0) { this.lookFast = true; this.lookP.copy(this.lastKnown); this.lookP.y += EYE; return; }
        break;
    }
    if (this.drop) { this.lookFast = true; this.lookAlongPath(); return; }
    // waspada (kena tembak / peluru lewat / callout): menoleh cepat ke sana
    if (now - this.alertT < H.patrol.alertHold) { this.lookFast = true; this.lookP.copy(this.alertAt); this.lookP.y += EYE; return; }
    if (now < this.glanceUntil) return;                                   // sedang melirik sudut
    if (this.pauseT > 0 && this.pauseLook >= 0) { const n = ctx.nav.nodes[this.pauseLook]; this.lookP.set(n.x, n.y + EYE, n.z); return; }
    if ((this.state === 'PATROL' || this.state === 'INVESTIGATE') && this.scanAngles(now)) return;
    if (this.state === 'INVESTIGATE' && this.lookInvestigate()) return;
    this.lookAlongPath();
  }

  /** Titik ±lookAhead u di depan sepanjang jalur, setinggi mata — mengantisipasi belokan, bukan menatap node berikutnya. */
  private lookAlongPath(): boolean {
    const e = this.e, nav = ctx.nav;
    if (this.drop) { this.lookP.set(e.pos.x + this.drop.dir.x * 10, e.pos.y + EYE, e.pos.z + this.drop.dir.z * 10); return true; }
    if (this.pathIdx >= this.path.length) return false;
    let px = e.pos.x, py = e.pos.y, pz = e.pos.z, left: number = H.patrol.lookAhead;
    for (let i = this.pathIdx; i < this.path.length && left > 0; i++) {
      const n = nav.nodes[this.path[i]], seg = Math.hypot(n.x - px, n.z - pz);
      if (seg >= left) { const k = left / seg; px += (n.x - px) * k; py += (n.y - py) * k; pz += (n.z - pz) * k; left = 0; break; }
      left -= seg; px = n.x; py = n.y; pz = n.z;
    }
    if (Math.hypot(px - e.pos.x, pz - e.pos.z) < 1.5) return false;
    this.lookP.set(px, py + EYE, pz);
    return true;
  }

  /** INVESTIGATE: tatap arah sumber suara bila tidak berlawanan dengan arah jalan (> 100°). */
  private lookInvestigate(): boolean {
    const e = this.e, p = this.investigate;
    const dx = p.x - e.pos.x, dz = p.z - e.pos.z, d = Math.hypot(dx, dz);
    if (d < 2) return false;
    const mx = this.intentDir.x, mz = this.intentDir.z;
    if (Math.hypot(mx, mz) > 0.1 && (dx * mx + dz * mz) / d < -0.17) return false;
    this.lookP.set(p.x, p.y + EYE, p.z);
    return true;
  }

  /** Cek sudut: node di depan/samping (≤ 110° dari arah jalan) yang BARU terlihat (dulu tertutup) → lirik sebentar.
   *  Tiap think diuji ≤ checkPerThink node bergiliran (1 raycast per node). */
  private scanAngles(now: number): boolean {
    const e = this.e, nav = ctx.nav, N = nav.nodes.length, P = H.patrol;
    if (!N) return false;
    e.eye(_eye);
    const mx = this.intentDir.x, mz = this.intentDir.z, ml = Math.hypot(mx, mz);
    const enemySide = e.team === 'blue' ? 'N' : 'S', next = this.pathIdx < this.path.length ? this.path[this.pathIdx] : -1;
    let tested = 0, k = 0, found = -1, foundS = -Infinity;
    for (; k < N && tested < P.checkPerThink; k++) {
      const i = (this.scanIdx + k) % N, n = nav.nodes[i];
      const dx = n.x - e.pos.x, dz = n.z - e.pos.z, d = Math.hypot(dx, dz);
      if (d < P.checkMin || d > P.checkMax || Math.abs(n.y - e.pos.y) > 12 || i === next || i === this.goal) continue;
      if (ml > 0.1 && (dx * mx + dz * mz) / (d * ml) < -0.34) continue;          // di belakang
      tested++;
      const vis = !physics.losBlocked(_eye.x, _eye.y, _eye.z, n.x, n.y + EYE, n.z);
      const wasVis = this.chkT[i] > -50 && this.visT[i] >= this.chkT[i];
      this.chkT[i] = now;
      if (!vis) continue;
      this.visT[i] = now;
      if (wasVis || now - this.glanceT[i] < P.glanceCd) continue;
      const s = (n.side === enemySide ? 2 : n.side === 'C' ? 1 : 0) - d / 40;  // sisi lawan & tengah lebih rawan
      if (s > foundS) { foundS = s; found = i; }
    }
    this.scanIdx = (this.scanIdx + Math.max(1, k)) % N;
    if (found < 0) return false;
    const n = nav.nodes[found];
    this.glanceT[found] = now;
    this.lookP.set(n.x, n.y + EYE, n.z);
    this.glanceUntil = now + pick(P.glance);
    return true;
  }

  // ─────────────────────────── rute & path
  private startRoute() {
    this.route = laneRoute(this.lane, this.e.team === 'blue' ? 'S' : 'N', this.e.pos.x);
    this.routeIdx = 0; this.exploreT = 0;
    this.nextRouteNode();
  }
  private nextRouteNode() {
    const id = this.route[this.routeIdx++];
    this.goToNode(ctx.nav.id(id));
  }
  private exploreRandom() {
    const enemySide = this.e.team === 'blue' ? 'N' : 'S';
    const cands = ctx.nav.nodes.filter(n => n.side === enemySide || n.side === 'C');
    const n = cands[Math.floor(Math.random() * cands.length)];
    this.goToNode(ctx.nav.byId.get(n.id)!);
  }
  private goTo(p: THREE.Vector3) { this.goToNode(ctx.nav.nearest(p.x, p.y, p.z)); }
  /** Jalur ke node. Mulai dari node terdekat yang bisa didatangi LURUS — dulu node terdekat saja, yang bisa berada di balik dinding
   *  (mis. node arsip saat bot di tangga) → bot menabrak dinding sampai macet. avoidStart = node awal yang baru gagal (macet). */
  goToNode(node: number, avoidStart = -1) {
    const from = this.startNode(avoidStart);
    const allowDrops = this.diff.dropDown > 0 && Math.random() < this.diff.dropDown;
    this.goal = node; this.pathStart = from;
    if (!ctx.nav.findPath(from, node, allowDrops, this.path, this.edges)) { this.path.length = 0; return; }
    // node awal dilewati hanya bila node kedua juga bisa didatangi lurus (dulu selalu dilewati)
    this.pathIdx = this.path.length > 1 && this.direct(this.path[1]) ? 1 : 0;
    this.drop = null;
  }
  /** Garis lurus ke node bebas selebar badan (2 sinar lutut ±0.8) + sinar dada. */
  private direct(i: number): boolean {
    const p = this.e.pos, n = ctx.nav.nodes[i];
    if (Math.hypot(n.x - p.x, n.z - p.z) < 0.8) return true;
    return !physics.losBlocked(p.x, p.y + 2.5, p.z, n.x, n.y + 2.5, n.z) && this.clearWidth(p, n);
  }
  /** Dari 6 node terdekat (beda tinggi ≤ 6 u — juga saat di tangga): yang pertama bisa didatangi lurus; tidak ada → terdekat. */
  private startNode(avoid: number): number {
    const p = this.e.pos, nav = ctx.nav, near = this.nearBuf;
    near.length = 0;
    for (let i = 0; i < nav.nodes.length; i++) {
      const n = nav.nodes[i];
      if (i === avoid || Math.abs(n.y - p.y) > 6) continue;
      const d = Math.hypot(n.x - p.x, n.z - p.z) + Math.abs(n.y - p.y);
      if (near.length < 6 || d < near[near.length - 1][0]) {
        near.push([d, i]); near.sort((a, b) => a[0] - b[0]);
        if (near.length > 6) near.pop();
      }
    }
    for (const [, i] of near) if (this.direct(i)) return i;
    return nav.nearest(p.x, p.y, p.z);
  }
  private pathDone() { return this.pathIdx >= this.path.length && !this.drop; }

  /** Cabang persimpangan untuk dilirik saat berhenti: tetangga node yang bukan node sebelum/sesudahnya di jalur. */
  private branchOf(node: number): number {
    const prev = this.pathIdx >= 2 ? this.path[this.pathIdx - 2] : -1, next = this.pathIdx < this.path.length ? this.path[this.pathIdx] : -1;
    const opts = ctx.nav.adj[node].filter(a => a.to !== prev && a.to !== next && a.edge.kind !== 'drop');
    return opts.length ? opts[Math.floor(Math.random() * opts.length)].to : -1;
  }

  /** Arah gerak dunia (horizontal) mengikuti path; string-pulling ringan + manuver drop-down. */
  private follow(out: THREE.Vector3): { sprint: boolean; jump: boolean } {
    const e = this.e, nav = ctx.nav;
    out.set(0, 0, 0);
    if (this.drop) return this.followDrop(out);
    if (this.pathIdx >= this.path.length) return { sprint: false, jump: false };
    let node = nav.nodes[this.path[this.pathIdx]];
    const edge = this.edges[this.pathIdx];
    if (edge && edge.kind === 'drop') {
      const shelfId = nav.dropInfo.get(edge);
      const box = currentMap().boxes.find(b => b.id === shelfId);
      if (box) {
        const A = nav.nodes[edge.a];
        const shelf = new THREE.Vector3((box.min[0] + box.max[0]) / 2, 4, (box.min[2] + box.max[2]) / 2);
        const dir = new THREE.Vector3(shelf.x - A.x, 0, shelf.z - A.z).normalize();
        const isA = shelfId!.startsWith('SHELF_A');
        this.drop = { shelf, takeoff: new THREE.Vector3(A.x, A.y, A.z), dir, phase: 'runup', sprint: !isA, jumpDist: isA ? 5.0 : 10.3, brake: isA };
        return this.followDrop(out);
      }
    }
    const dx = node.x - e.pos.x, dz = node.z - e.pos.z;
    if (Math.hypot(dx, dz) < B.arriveRadius && Math.abs(node.y - e.pos.y) < 3) {
      const arrived = this.path[this.pathIdx];
      this.pathIdx++;
      // ragu sejenak di persimpangan saat patroli di zona kontak: berhenti & lirik cabang lain
      if (this.state === 'PATROL' && this.contact && nav.adj[arrived].length >= 3 && Math.random() < H.patrol.pauseChance) {
        this.pauseT = pick(H.patrol.pause); this.pauseLook = this.branchOf(arrived);
      }
      if (this.pathIdx >= this.path.length) return { sprint: false, jump: false };
      node = nav.nodes[this.path[this.pathIdx]];
    }
    // string-pulling: lewati node berikutnya bila node sesudahnya terlihat (level sama, bukan tangga/drop)
    if (this.pathIdx + 1 < this.path.length) {
      const n2 = nav.nodes[this.path[this.pathIdx + 1]], e2 = this.edges[this.pathIdx + 1];
      if (n2.level === node.level && Math.abs(e.pos.y - node.y) < 2 && e2 && (e2.kind === 'walk' || e2.kind === 'door')
        && this.edges[this.pathIdx]?.kind !== 'stair'
        && !physics.losBlocked(e.pos.x, e.pos.y + 1.0, e.pos.z, n2.x, n2.y + 1.0, n2.z)
        && !physics.losBlocked(e.pos.x, e.pos.y + 4.2, e.pos.z, n2.x, n2.y + 4.2, n2.z)
        && this.clearWidth(e.pos, n2)) {
        this.pathIdx++; node = n2;
      }
    }
    out.set(node.x - e.pos.x, 0, node.z - e.pos.z);
    const len = out.length(); if (len > 1e-3) out.divideScalar(len);
    // sprint hanya di area aman; zona kontak (sisi lawan / baru waspada / laporan musuh dekat) → jalan, lebih senyap
    return { sprint: this.state === 'PATROL' && len > 6 && !this.visible && !this.contact, jump: false };
  }

  /** Cek koridor selebar kapsul (dua sinar sejajar ±0.8). */
  private clearWidth(p: THREE.Vector3, n: { x: number; y: number; z: number }) {
    const dx = n.x - p.x, dz = n.z - p.z, l = Math.hypot(dx, dz) || 1, ox = -dz / l * 0.8, oz = dx / l * 0.8;
    return !physics.losBlocked(p.x + ox, p.y + 1, p.z + oz, n.x + ox, n.y + 1, n.z + oz)
      && !physics.losBlocked(p.x - ox, p.y + 1, p.z - oz, n.x - ox, n.y + 1, n.z - oz);
  }

  /** Manuver drop-down: ambil ancang-ancang → lari → lompat pagar → (rem di udara) → mendarat di atas rak → turun. */
  private followDrop(out: THREE.Vector3): { sprint: boolean; jump: boolean } {
    const d = this.drop!, e = this.e;
    const toShelf = _d.set(d.shelf.x - e.pos.x, 0, d.shelf.z - e.pos.z);
    const dist = toShelf.length();
    switch (d.phase) {
      case 'runup': {
        const rx = d.takeoff.x - d.dir.x * 0.9, rz = d.takeoff.z - d.dir.z * 0.9;
        out.set(rx - e.pos.x, 0, rz - e.pos.z);
        if (out.length() < 0.35) { d.phase = 'run'; out.copy(d.dir); } else out.normalize();
        return { sprint: false, jump: false };
      }
      case 'run':
        out.copy(d.dir);
        // ambang kecepatan ×tempo (lintasan lompat sama di ruang untuk tempo berapa pun — lihat moveFeel)
        if (dist <= d.jumpDist && e.ctrl.speedH > (d.sprint ? 7.5 : 5.0) * moveFeel.tempo) { d.phase = 'air'; return { sprint: d.sprint, jump: true }; }
        if (dist < d.jumpDist - 3) d.phase = 'air'; // gagal: lanjutkan saja
        return { sprint: d.sprint, jump: false };
      case 'air':
        if (e.ctrl.grounded && e.ctrl.velY <= 0 && this.stateT > 0) {
          d.phase = 'done'; this.drop = null; this.pathIdx++;
          return { sprint: false, jump: false };
        }
        // rem bila sudah melewati pusat rak (komponen sepanjang arah ≤ 0)
        if (d.brake && toShelf.dot(d.dir) < 0.3) out.copy(d.dir).negate(); else out.copy(d.dir);
        return { sprint: false, jump: false };
      default: this.drop = null; return { sprint: false, jump: false };
    }
  }

  // ─────────────────────────── granat (§11.8)
  private wantGrenade(): boolean {
    const e = this.e, p = this.seenAt;
    if (e.grenades < 1 || this.grenadeCd > 0 || ctx.time - this.seenAtT > B.memory) return false;
    const d = Math.hypot(p.x - e.pos.x, p.z - e.pos.z);
    if (d < B.grenadeMin || d > B.grenadeMax) return false;
    if (ctx.entities.some(o => o.alive && o !== e && o.team === e.team && o.pos.distanceTo(p) < B.grenadeAllyClear)) return false;
    if (Math.random() > this.diff.grenade) { this.grenadeCd = B.grenadeCooldown; return false; }
    // sudut rendah untuk mengenai titik dx, dy (v = 24, g = 22)
    const v = CFG.grenade.overSpeed, g = -CFG.world.gravity, v2 = v * v;
    e.eye(_eye);
    const dx = d, dy = p.y + 1.0 - (_eye.y - XCFG.grenadeThrow.fpsDown);
    const disc = v2 * v2 - g * (g * dx * dx + 2 * dy * v2);
    if (disc < 0) return false;
    const theta = Math.atan((v2 - Math.sqrt(disc)) / (g * dx));
    const tFlight = dx / (v * Math.cos(theta));
    this.gPlan.pitch = theta - D2R(CFG.grenade.overLiftDeg); // lemparan menambah +8°
    this.gPlan.cook = THREE.MathUtils.clamp(CFG.grenade.fuse - tFlight - 0.4, 0, 2.0);
    this.gPlan.yaw = yawTo(p.x - e.pos.x, p.z - e.pos.z);
    return true;
  }
  private startGrenade() { this.set('THROW_GRENADE'); this.gStep = 0; this.gT = 0; this.path.length = 0; this.drop = null; }

  private runGrenade(dt: number) {
    const e = this.e, g = this.gIn;
    g.equip = false; g.lPress = false; g.lRelease = false;
    this.gT += dt;
    switch (this.gStep) {
      case 0: if (e.ctrl.speedH < 0.3 || this.gT > 1) { this.gStep = 1; this.gT = 0; } break; // berhenti dulu (warisan kecepatan nol)
      case 1: g.equip = e.grenadeState === 'NONE'; if (e.grenadeState === 'READY') { this.gStep = 2; this.gT = 0; } break;
      case 2: {
        const aimed = Math.abs(wrap(this.aim.yaw - this.gPlan.yaw)) < D2R(3) && Math.abs(this.aim.pitch - this.gPlan.pitch) < D2R(3);
        if (aimed || this.gT > 1.2) { g.lPress = true; g.lHeld = true; this.gStep = 3; this.gT = 0; }
        break;
      }
      case 3: g.lHeld = true; if (this.gT >= this.gPlan.cook) { g.lHeld = false; g.lRelease = true; this.gStep = 4; this.gT = 0; this.grenadeCd = B.grenadeCooldown; } break;
      case 4: g.lHeld = false; if (e.grenadeState === 'NONE' || this.gT > 1) this.gStep = 5; break;
    }
  }

  // ─────────────────────────── per fixed step: input gerak
  fixedUpdate(dt: number) {
    const e = this.e, it = e.intent;
    this.stateT += dt;
    this.grenadeCd = Math.max(0, this.grenadeCd - dt);
    it.jump = false; it.sprint = false; it.ix = 0; it.iz = 0;
    if (!e.alive || ctx.match.locked) { it.crouch = false; return; }
    let jump = false, sprint = false;
    _d.set(0, 0, 0);
    switch (this.state) {
      case 'PATROL': case 'INVESTIGATE': case 'TAKE_COVER': {
        if (this.state === 'PATROL' && this.pauseT > 0) { this.pauseT -= dt; break; }   // berhenti cek persimpangan
        const r = this.follow(_d); jump = r.jump; sprint = r.sprint; break;
      }
      case 'EVADE': {
        if (this.pathIdx < this.path.length || this.drop) { const r = this.follow(_d); jump = r.jump; }
        else {
          _d.set(e.pos.x - this.gPos.x, 0, e.pos.z - this.gPos.z);
          const l = _d.length(); if (l > 1e-3) _d.divideScalar(l); else _d.set(Math.sin(e.yaw), 0, Math.cos(e.yaw));
        }
        sprint = true;
        break;
      }
      case 'RELOAD':
        if (this.pathIdx < this.path.length) this.follow(_d);                    // menuju cover (GDD: strafe menuju cover)
        else if (this.visible) this.strafe(_d, dt);
        break;
      case 'ENGAGE':
        if (this.fight) this.fightMove(_d);
        else {
          if (!this.crouchEngage && !this.plant) this.strafe(_d, dt);
          if (this.target && this.visible && this.target.pos.distanceTo(e.pos) > this.diff.sight * 0.8) {
            if (this.stateT >= this.approachT) { this.approachT = this.stateT + 0.5; this.goTo(this.lastKnown); }
            this.follow(_b); _d.add(_b).normalize();
          }
        }
        break;
      case 'THROW_GRENADE': break;
      default: break;
    }
    // niat gerak murni (sebelum separasi) → dipakai deteksi macet
    const intentLen = Math.hypot(_d.x, _d.z);
    const ix0 = intentLen > 1e-3 ? _d.x / intentLen : 0, iz0 = intentLen > 1e-3 ? _d.z / intentLen : 0;
    this.intentDir.set(ix0, 0, iz0);
    // separasi dari rekan dalam radius 2.0; berhadapan (niat saling menuju) → bot ber-id lebih besar mundur sejenak
    let yieldNow = false;
    for (const o of ctx.entities) {
      if (o === e || !o.alive || o.team !== e.team) continue;
      const dx = e.pos.x - o.pos.x, dz = e.pos.z - o.pos.z, d = Math.hypot(dx, dz);
      if (d < B.separation && d > 1e-3 && Math.abs(e.pos.y - o.pos.y) < 3) {
        const ahead = -(dx * ix0 + dz * iz0) / d;                     // rekan di depan arah niat kita
        const oi = o.bot ? o.bot.intentDir : null;
        const facing = oi ? (dx * oi.x + dz * oi.z) / d : 0;           // kita di depan arah niat rekan
        if (ahead > 0.6 && facing > 0.6 && e.id > o.id) yieldNow = true;
        const k = this.sideT > 0 ? 0.3 : 1;
        _d.x += dx / d * (B.separation - d) * k; _d.z += dz / d * (B.separation - d) * k;
      }
    }
    if (yieldNow && this.yieldT <= 0) this.yieldT = rand(0.4, 0.8);
    if (this.yieldT > 0) { this.yieldT -= dt; _d.x = -ix0 * 0.7; _d.z = -iz0 * 0.7; } // mundur lurus memberi jalan
    if (this.sideT > 0) { this.sideT -= dt; _d.x += -iz0 * this.sideDir; _d.z += ix0 * this.sideDir; }   // langkah samping
    const len = Math.hypot(_d.x, _d.z);
    if (len > 1e-3) {
      _d.x /= Math.max(1, len); _d.z /= Math.max(1, len);
      const sy = Math.sin(e.yaw), cy = Math.cos(e.yaw);
      it.ix = _d.x * cy - _d.z * sy;      // dot(d, right)
      it.iz = -_d.x * sy - _d.z * cy;     // dot(d, forward)
    }
    it.sprint = sprint;
    it.jump = jump;
    it.crouch = this.state === 'ENGAGE' && (this.fight ? this.fightPhase === 'hide' && this.spot.hideCrouch : this.crouchEngage);
    it.ads = this.trigger.ads;
    it.cooking = e.grenadeState === 'COOKING';
    it.wantFire = this.trigger.held;
    it.yaw = e.yaw;
    // deteksi macet (berdasar niat gerak): progres < 0.5 u dalam 1.5 s → lompat + langkah samping; 3 s → hitung ulang jalur
    this.moving = intentLen > 0.1;
    if (this.moving && !this.drop) {
      this.stuckT += dt;
      if (e.pos.distanceTo(this.stuckRef) > B.stuckDist) { this.stuckRef.copy(e.pos); this.stuckT = 0; }
      if (this.stuckT > B.stuckJump && this.stuckT - dt <= B.stuckJump) { it.jump = true; this.sideT = 0.7; this.sideDir = Math.random() < 0.5 ? -1 : 1; }
      if (this.stuckT > B.stuckRepath) {
        this.stuckT = 0; this.stuckRef.copy(e.pos);
        if (this.state === 'ENGAGE' && this.fight) this.dropFight();             // titik intip/cover tak tercapai
        // jalur ulang ke tujuan dari node awal LAIN yang bisa didatangi lurus (node awal tadi gagal)
        else if (this.goal >= 0) this.goToNode(this.goal, this.pathStart); else this.startRoute();
      }
    } else { this.stuckRef.copy(e.pos); this.stuckT = 0; }
  }

  private strafe(out: THREE.Vector3, dt: number) {
    this.strafeT -= dt;
    if (this.strafeT <= 0) { this.strafeDir = Math.random() < 0.5 ? -1 : 1; this.strafeT = rand(B.strafeInterval[0], B.strafeInterval[1]); }
    const y = this.aim.yaw;
    out.set(Math.cos(y) * this.strafeDir, 0, -Math.sin(y) * this.strafeDir); // kanan = (cos yaw, 0, −sin yaw)
  }

  // ─────────────────────────── per frame: bidik & menembak (§11.4 + bot manusiawi)
  update(dt: number) {
    const e = this.e, now = ctx.time, tr = this.trigger;
    tr.pressed = false; tr.reload = false; tr.modeSwitch = false;
    if (!e.alive) { tr.held = false; tr.ads = false; return; }
    this.startle *= Math.exp(-dt / H.startle.decay);
    let desY = this.aim.yaw, desP = this.aim.pitch, params = this.lookAim;
    const engage = this.state === 'ENGAGE' && !!this.target;
    let dist = 0;
    e.eye(_eye);
    if (engage) {
      const t = this.target!;
      // terlihat: bagian tubuh target; tidak terlihat (sembunyi di cover / target berlindung): posisi terakhir (bukan tembus dinding)
      if (this.visible) {
        t.partCenter(this.aimHead ? 'head' : 'upper', _a);
        // pengejaran manusiawi: bidikan tertinggal ±aimLag s di belakang target yang bergerak (strafe/lompat membuat bot meleset)
        const lag = this.hum.aimLag;
        _a.x -= t.ctrl.vel.x * lag; _a.y -= t.ctrl.velY * lag; _a.z -= t.ctrl.vel.z * lag;
      } else _a.set(this.lastKnown.x, this.lastKnown.y + (this.aimHead ? 4.6 : 3.6), this.lastKnown.z);
      _d.copy(_a).sub(_eye); dist = _d.length();
      this.trueY = yawTo(_d.x, _d.z); this.trueP = Math.atan2(_d.y, Math.hypot(_d.x, _d.z));
      // error sudut GDD: menyusut sejak target pertama terlihat; arah diacak ulang tiap 0.4 s, dihaluskan 8/s
      const tSeen = now - this.firstSeenT;
      const err = this.diff.eMin + (this.diff.e0 - this.diff.eMin) * Math.exp(-tSeen / this.diff.tau);
      this.errT -= dt;
      if (this.errT <= 0) { this.errT = B.errReroll; const th = Math.random() * Math.PI * 2; this.errTY = Math.cos(th) * err; this.errTP = Math.sin(th) * err; }
      const k = Math.min(1, B.errSlerp * dt);
      this.errYaw += (this.errTY - this.errYaw) * k; this.errPitch += (this.errTP - this.errPitch) * k;
      // + kaget (kena tembak / peluru lewat dekat)
      desY = this.trueY + D2R(this.errYaw + this.stY * this.startle);
      desP = this.trueP + D2R(this.errPitch + this.stP * this.startle);
      params = this.combatAim;
    } else if (this.state === 'THROW_GRENADE') {
      desY = this.gPlan.yaw; desP = this.gPlan.pitch; params = this.combatAim;
    } else {
      const dx = this.lookP.x - _eye.x, dz = this.lookP.z - _eye.z, hd = Math.hypot(dx, dz);
      if (hd > 0.8) { desY = yawTo(dx, dz); desP = Math.atan2(this.lookP.y - _eye.y, hd); }
      if (this.startle > 0.05) { desY += D2R(this.stY * this.startle); desP += D2R(this.stP * this.startle); }
      if (this.lookFast) params = this.combatAim;
    }
    // gerak bidik manusiawi (sentakan minimum-jerk + koreksi; puncak = turn rate GDD)
    stepAim(this.aim, dt, desY, desP, params, Math.random);
    // recoil: sisa yang tidak dikompensasi + pemulihan
    e.recoil.update(dt, now, e.weapon.def);
    this.recoilYaw *= Math.exp(-4 * dt);
    e.yaw = this.aim.yaw + this.recoilYaw;
    e.pitch = THREE.MathUtils.clamp(this.aim.pitch + D2R(e.recoil.recoilPitch), -D2R(85), D2R(85));

    if (this.state === 'THROW_GRENADE') { tr.held = false; tr.ads = false; this.runGrenade(dt); return; }
    this.gIn.equip = false; this.gIn.lPress = false; this.gIn.lHeld = false; this.gIn.lRelease = false;
    this.gIn.toSlot = e.grenadeState !== 'NONE' && e.grenadeState !== 'THROWN' ? 'ar' : null;

    tr.ads = engage && dist > B.adsDist;
    if (!engage || ctx.match.locked) { tr.held = false; this.resetBurst(); return; }
    this.burstPause -= dt;
    // syarat tembak GDD: reaksi lewat, deviasi < 2.5° (hip) / 1.2° (ADS), LOS. Deviasi terhadap titik bidik yang DIMAKSUD
    // (gateIntent: target + error GDD + kaget) → bot menembak saat merasa pas; error = tembakan meleset, bukan sekadar menunggu.
    const gi = H.gateIntent;
    const refY = this.trueY + gi * wrap(desY - this.trueY), refP = this.trueP + gi * (desP - this.trueP), cp = Math.cos(refP);
    _b.set(-Math.sin(refY) * cp, Math.sin(refP), -Math.cos(refY) * cp);
    e.aimDir(_c);
    const dev = R2D(_c.angleTo(_b));
    const thr = e.weapon.adsActive ? B.fireDevAds : B.fireDevHip;
    const ready = now - this.firstSeenT >= this.reactT && this.visible && now - this.lastSeenT < 0.25;
    let want = ready && dev < thr && this.burstPause <= 0 && e.weapon.ammo > 0;
    // geser–berhenti–tembak (diputuskan per burst): berhenti dulu (≤ plantWait s) agar spread diam, bukan spread bergerak
    if (want && !this.burstOn) {
      if (!this.burstDecided) { this.burstDecided = true; this.plantWait = 0; this.plant = !this.crouchEngage && !this.fight && Math.random() < this.hum.counterStrafe; }
      if (this.plant && e.ctrl.speedH > CFG.combat.spread.movingSpeed && this.plantWait < H.plantWait) { this.plantWait += dt; want = false; }
    }
    const mode = e.weapon.mode;
    if (want) {
      this.burstOn = true; this.idleFireT = 0;
      if (mode === 'AUTO') {
        if (!tr.held) { tr.pressed = true; this.shotsAtBurst = e.weapon.shotsFired; }
        tr.held = true;
        if (e.weapon.shotsFired - this.shotsAtBurst >= this.burstLeft) this.endBurst(dist);
      } else {
        tr.pressed = true; tr.held = true;
        if (this.shotsAtBurst === 0) this.shotsAtBurst = e.weapon.shotsFired;
        if (e.weapon.shotsFired - this.shotsAtBurst >= this.burstLeft) this.endBurst(dist);
      }
    } else {
      if (tr.held && mode === 'AUTO') tr.held = false;
      else if (mode !== 'AUTO') tr.held = false;
      // lama tidak menembak (target sembunyi / bidikan belum pas) → keputusan berhenti/geser diulang di burst berikut
      this.idleFireT += dt;
      if (this.idleFireT > 0.35 && this.plantWait === 0) this.resetBurst();
      else if (this.idleFireT > 0.5) this.resetBurst();
    }
  }

  private resetBurst() { this.burstOn = false; this.burstDecided = false; this.plant = false; this.plantWait = 0; }

  private endBurst(dist: number) {
    this.trigger.held = false;
    this.shotsAtBurst = 0;
    this.burstPause = rand(B.burstPause[0], B.burstPause[1]) + (dist > B.burstPauseFarDist ? B.burstPauseFar : 0);
    this.burstLeft = Math.round(rand(this.diff.burst[0], this.diff.burst[1]));
    this.resetBurst();
  }

  /** Kompensasi recoil: tiap tembakan kurangi recoilPitch sebesar comp × kick (setara onMouseLook negatif). */
  onRecoil(dPitchDeg: number, dYawDeg: number) {
    this.e.recoil.onMouseLook(-this.diff.comp * dPitchDeg);
    this.recoilYaw += D2R(dYawDeg) * (1 - this.diff.comp);
  }

  get label() {
    const f = this.state === 'ENGAGE' && this.fight ? `[${this.fightPhase}]` : '';
    return `${this.e.name} ${this.state}${f}${this.target ? '→' + this.target.name : ''}`;
  }
}
