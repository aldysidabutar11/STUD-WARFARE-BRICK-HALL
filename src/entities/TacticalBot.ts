// src/entities/TacticalBot.ts — FSM, persepsi, aim, navigasi bot (GDD §11). Bot memakai aturan yang sama dengan pemain.
import * as THREE from 'three';
import { XCFG, type BotDifficultyDef, type Difficulty } from '../config/extraConfig';
import { CFG } from '../config/gameConfig';
import { physics } from '../physics/Physics';
import { bus } from '../core/EventBus';
import { ctx } from '../game/ctx';
import { laneRoute, type Lane } from '../game/BotDirector';
import type { Entity } from './Entity';
import type { TriggerInput } from '../combat/WeaponSystem';
import type { GrenadeInput } from '../combat/GrenadeK400';
import type { NavEdge } from '../world/NavGraph';
import { BOXES } from '../world/MapData';
import { WEAPONS } from '../config/weaponsData';
import { canMelee } from '../combat/Melee';
import { moveFeel } from './moveFeel';

const B = XCFG.bots;
const D2R = THREE.MathUtils.degToRad, R2D = THREE.MathUtils.radToDeg;
export type BotState = 'SPAWN' | 'PATROL' | 'ENGAGE' | 'TAKE_COVER' | 'RELOAD' | 'INVESTIGATE' | 'THROW_GRENADE' | 'DEAD';

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _eye = new THREE.Vector3(), _d = new THREE.Vector3();
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const yawTo = (dx: number, dz: number) => Math.atan2(-dx, -dz);

interface Drop { shelf: THREE.Vector3; takeoff: THREE.Vector3; dir: THREE.Vector3; phase: 'runup' | 'run' | 'air' | 'done'; sprint: boolean; jumpDist: number; brake: boolean }

export class TacticalBot {
  state: BotState = 'SPAWN';
  private prev: BotState = 'PATROL';
  stateT = 0;
  readonly diff: BotDifficultyDef;
  lane: Lane = 'bridge';
  private route: string[] = [];
  private routeIdx = 0;
  private exploreT = 0;
  // persepsi & memori
  target: Entity | null = null;
  private firstSeenT = -99;
  private lastSeenT = -99;
  visible = false;
  readonly lastKnown = new THREE.Vector3();
  private lastKnownT = -99;
  private heardAt = new THREE.Vector3();
  private heardT = -99;
  private investigate = new THREE.Vector3();
  // bidik
  trackYaw = 0; trackPitch = 0;
  private recoilYaw = 0;
  private errYaw = 0; private errPitch = 0; private errTY = 0; private errTP = 0; private errT = 0;
  private aimHead = false;
  private burstLeft = 0; private burstPause = 0; private shotsAtBurst = 0;
  private strafeDir = 1; private strafeT = 0; private crouchEngage = false;
  // navigasi
  private path: number[] = [];
  private edges: (NavEdge | null)[] = [];
  private pathIdx = 0;
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
    // pendengaran: tembakan 5.56 35 u, 7.62 50 u, ledakan 60 u, langkah sprint 12 u, jalan 6 u, jongkok tidak terdengar
    this.unsubs.push(bus.on('shot', (ev) => {
      const s = ctx.byId.get(ev.shooterId);
      if (!s || s.team === this.e.team || !this.e.alive) return;
      this.hear(ev.origin, WEAPONS[ev.weaponId].caliber === '7.62' ? B.hearing.shot762 : B.hearing.shot556);
    }));
    this.unsubs.push(bus.on('grenade:explode', (ev) => { if (this.e.alive) this.hear(ev.position, B.hearing.explosion); }));
    this.unsubs.push(bus.on('footstep', (ev) => {
      const s = ctx.byId.get(ev.entityId);
      if (!s || s.team === this.e.team || !this.e.alive || s.crouched) return;
      this.hear(ev.position, ev.loud ? B.hearing.sprintStep : B.hearing.walkStep);
    }));
    this.unsubs.push(bus.on('hit', (ev) => {
      if (ev.victimId !== this.e.id || ev.attackerId < 0 || ev.attackerId === this.e.id) return;
      const a = ctx.byId.get(ev.attackerId);
      if (a) { this.lastKnown.copy(a.pos); this.lastKnownT = ctx.time; this.heardAt.copy(a.pos); this.heardT = ctx.time; }
      this.safeT = 0;
    }));
  }

  dispose() { for (const u of this.unsubs) u(); this.unsubs.length = 0; }

  private hear(p: THREE.Vector3, range: number) {
    if (p.distanceTo(this.e.pos) > range) return;
    const n = B.investigateNoise;
    this.heardAt.set(p.x + rand(-n, n), p.y, p.z + rand(-n, n));
    this.heardT = ctx.time;
  }

  onSpawn() {
    this.set('SPAWN');
    this.trackYaw = this.e.yaw; this.trackPitch = 0; this.recoilYaw = 0;
    this.target = null; this.visible = false; this.path.length = 0; this.drop = null; this.goal = -1;
    this.burstLeft = 0; this.burstPause = 0; this.grenadeCd = 0; this.gStep = 0; this.wantMelee = false;
    this.stuckRef.copy(this.e.pos); this.stuckT = 0;
  }

  private set(s: BotState) { if (s !== this.state) { if (s === 'RELOAD' || s === 'THROW_GRENADE') this.prev = this.state; this.state = s; this.stateT = 0; } }

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
      if (best !== this.target || now - this.lastSeenT > B.loseTarget) {
        this.firstSeenT = now; this.aimHead = Math.random() < this.diff.headBias;
        this.errT = 0;
      }
      this.target = best; this.lastSeenT = now;
      this.lastKnown.copy(best.pos); this.lastKnownT = now;
      ctx.directors[e.team].report(best, now);
    }
    this.visible = !!best;
    if (now - this.lastKnownT > B.memory) this.lastKnownT = -99;
    if (this.target && !this.target.alive) { this.target = null; this.visible = false; }
  }

  // ─────────────────────────── FSM (10 Hz)
  think() {
    const e = this.e, now = ctx.time;
    if (!e.alive) { this.set('DEAD'); return; }
    this.perceive();
    const heardRecent = now - this.heardT < 1.0;
    switch (this.state) {
      case 'DEAD': this.set('SPAWN'); break;
      case 'SPAWN':
        if (this.stateT > rand(B.spawnIdle[0], B.spawnIdle[1])) { this.lane = ctx.directors[e.team].assign(e); this.startRoute(); this.set('PATROL'); }
        break;
      case 'PATROL':
        if (this.visible) { this.enterEngage(); break; }
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
      case 'ENGAGE': {
        const t = this.target;
        if (!t || !t.alive) { this.target = null; this.set(this.lastKnownT > 0 ? 'INVESTIGATE' : 'PATROL'); if (this.lastKnownT > 0) this.goTo(this.lastKnown); else this.startRoute(); break; }
        if (now - this.lastSeenT > B.loseTarget) {
          if (this.wantGrenade()) { this.startGrenade(); break; }
          this.investigate.copy(this.lastKnown); this.goTo(this.investigate); this.set('INVESTIGATE'); break;
        }
        // jarak sangat dekat: pukul popor (selalu bila magasin kosong/reload, selain itu peluang botChance per think)
        if (this.visible && Math.hypot(t.pos.x - e.pos.x, t.pos.z - e.pos.z) < XCFG.melee.botRange && Math.abs(t.pos.y - e.pos.y) < 2.5 && canMelee(e)
          && (e.weapon.ammo === 0 || e.weapon.reloading || Math.random() < XCFG.melee.botChance)) { this.wantMelee = true; break; }
        if (e.hp < B.coverHp && this.findCover()) { this.set('TAKE_COVER'); break; }
        if (e.weapon.ammo === 0) { e.weapon.startReload(); this.set('RELOAD'); break; }
        break;
      }
      case 'TAKE_COVER':
        this.safeT += 0.1;
        if (this.pathDone() && e.weapon.ammo < e.weapon.def.magSize) e.weapon.startReload();
        if ((this.safeT >= B.coverSafe && this.pathDone()) || (this.pathDone() && !e.weapon.reloading && this.stateT > 1.2)) {
          if (this.visible) this.enterEngage(); else { this.startRoute(); this.set('PATROL'); }
        }
        break;
      case 'RELOAD':
        if (!e.weapon.reloading) { if (this.visible) this.enterEngage(); else this.set(this.prev === 'ENGAGE' ? 'INVESTIGATE' : this.prev); if ((this.state as BotState) === 'INVESTIGATE') this.goTo(this.lastKnown); }
        break;
      case 'INVESTIGATE':
        if (this.visible) { this.enterEngage(); break; }
        // posisi terakhir target tidak terlihat & dalam 8–24 u → pertimbangkan granat (§11.8)
        if (this.lastKnownT > 0 && now - this.lastKnownT < 4 && this.wantGrenade()) { this.startGrenade(); break; }
        if (heardRecent && this.heardAt.distanceTo(this.investigate) > 6) { this.investigate.copy(this.heardAt); this.goTo(this.investigate); }
        if (this.stateT > B.investigateMax || (this.pathDone() && this.stateT > 1.5)) { this.startRoute(); this.set('PATROL'); }
        break;
      case 'THROW_GRENADE':
        if (this.gStep >= 5 || this.stateT > 6) { this.gStep = 0; this.set(this.visible ? 'ENGAGE' : 'INVESTIGATE'); if ((this.state as BotState) === 'INVESTIGATE') this.goTo(this.lastKnown); }
        break;
    }
  }

  private enterEngage() {
    this.set('ENGAGE');
    this.burstLeft = Math.round(rand(this.diff.burst[0], this.diff.burst[1]));
    this.crouchEngage = !!this.target && this.target.pos.distanceTo(this.e.pos) > B.crouchDist && Math.random() < B.crouchChance;
    this.path.length = 0; this.drop = null;
  }

  // ─────────────────────────── rute & path
  private startRoute() {
    this.route = laneRoute(this.lane, this.e.team === 'blue' ? 'S' : 'N');
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
  goToNode(node: number) {
    const from = ctx.nav.nearest(this.e.pos.x, this.e.pos.y, this.e.pos.z);
    const allowDrops = this.diff.dropDown > 0 && Math.random() < this.diff.dropDown;
    this.goal = node;
    if (!ctx.nav.findPath(from, node, allowDrops, this.path, this.edges)) { this.path.length = 0; return; }
    this.pathIdx = this.path.length > 1 ? 1 : 0;
    this.drop = null;
  }
  private pathDone() { return this.pathIdx >= this.path.length && !this.drop; }

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
      const box = BOXES.find(b => b.id === shelfId);
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
      this.pathIdx++;
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
    return { sprint: this.state === 'PATROL' && len > 6 && !this.visible, jump: false };
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

  // ─────────────────────────── cover (§11.9)
  private findCover(): boolean {
    const t = this.target;
    if (!t) return false;
    t.eye(_eye);
    let best = -1, bestD = Infinity;
    for (let i = 0; i < ctx.nav.nodes.length; i++) {
      const n = ctx.nav.nodes[i];
      if (!n.cover) continue;
      const d = Math.hypot(n.x - this.e.pos.x, n.y - this.e.pos.y, n.z - this.e.pos.z);
      if (d > B.coverMaxCost || d >= bestD) continue;
      if (!physics.losBlocked(n.x, n.y + CFG.player.eyeCrouch, n.z, _eye.x, _eye.y, _eye.z)) continue; // masih terlihat ancaman
      best = i; bestD = d;
    }
    if (best < 0) return false;
    this.goToNode(best); this.safeT = 0;
    return true;
  }

  // ─────────────────────────── granat (§11.8)
  private wantGrenade(): boolean {
    const e = this.e;
    if (e.grenades < 1 || this.grenadeCd > 0 || this.lastKnownT < 0) return false;
    const d = Math.hypot(this.lastKnown.x - e.pos.x, this.lastKnown.z - e.pos.z);
    if (d < B.grenadeMin || d > B.grenadeMax) return false;
    if (ctx.entities.some(o => o.alive && o !== e && o.team === e.team && o.pos.distanceTo(this.lastKnown) < B.grenadeAllyClear)) return false;
    if (Math.random() > this.diff.grenade) { this.grenadeCd = B.grenadeCooldown; return false; }
    // sudut rendah untuk mengenai titik dx, dy (v = 24, g = 22)
    const v = CFG.grenade.overSpeed, g = -CFG.world.gravity, v2 = v * v;
    e.eye(_eye);
    const dx = d, dy = this.lastKnown.y + 1.0 - (_eye.y - XCFG.grenadeThrow.fpsDown);
    const disc = v2 * v2 - g * (g * dx * dx + 2 * dy * v2);
    if (disc < 0) return false;
    const theta = Math.atan((v2 - Math.sqrt(disc)) / (g * dx));
    const tFlight = dx / (v * Math.cos(theta));
    this.gPlan.pitch = theta - D2R(CFG.grenade.overLiftDeg); // lemparan menambah +8°
    this.gPlan.cook = THREE.MathUtils.clamp(CFG.grenade.fuse - tFlight - 0.4, 0, 2.0);
    this.gPlan.yaw = yawTo(this.lastKnown.x - e.pos.x, this.lastKnown.z - e.pos.z);
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
        const aimed = Math.abs(wrap(this.trackYaw - this.gPlan.yaw)) < D2R(3) && Math.abs(this.trackPitch - this.gPlan.pitch) < D2R(3);
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
      case 'PATROL': case 'INVESTIGATE': case 'TAKE_COVER': { const r = this.follow(_d); jump = r.jump; sprint = r.sprint; break; }
      case 'RELOAD': if (this.visible) this.strafe(_d, dt); else this.follow(_d); break;
      case 'ENGAGE':
        if (!this.crouchEngage) this.strafe(_d, dt);
        if (this.target && this.target.pos.distanceTo(e.pos) > this.diff.sight * 0.8) { this.goTo(this.target.pos); this.follow(_b); _d.add(_b).normalize(); }
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
    it.crouch = this.state === 'ENGAGE' && this.crouchEngage;
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
        // jalur alternatif: lewat node acak terdekat dulu, lalu ke tujuan
        if (this.goal >= 0) this.goToNode(this.goal); else this.startRoute();
        if (this.path.length > 2) this.pathIdx = Math.min(this.path.length - 1, this.pathIdx + 1);
      }
    } else { this.stuckRef.copy(e.pos); this.stuckT = 0; }
  }

  private strafe(out: THREE.Vector3, dt: number) {
    this.strafeT -= dt;
    if (this.strafeT <= 0) { this.strafeDir = Math.random() < 0.5 ? -1 : 1; this.strafeT = rand(B.strafeInterval[0], B.strafeInterval[1]); }
    const y = this.trackYaw;
    out.set(Math.cos(y) * this.strafeDir, 0, -Math.sin(y) * this.strafeDir); // kanan = (cos yaw, 0, −sin yaw)
  }

  // ─────────────────────────── per frame: bidik & menembak (§11.4)
  update(dt: number) {
    const e = this.e, now = ctx.time, tr = this.trigger;
    tr.pressed = false; tr.reload = false; tr.modeSwitch = false;
    if (!e.alive) { tr.held = false; tr.ads = false; return; }
    let dYaw = this.trackYaw, dPitch = 0;
    const engage = this.state === 'ENGAGE' && this.target;
    let dist = 0;
    if (engage && this.target) {
      this.target.partCenter(this.aimHead ? 'head' : 'upper', _a);
      e.eye(_eye);
      _d.copy(_a).sub(_eye); dist = _d.length();
      dYaw = yawTo(_d.x, _d.z); dPitch = Math.atan2(_d.y, Math.hypot(_d.x, _d.z));
      // error sudut menyusut sejak target pertama terlihat; arah error diacak ulang tiap 0.4 s, dihaluskan 8/s
      const tSeen = now - this.firstSeenT;
      const err = this.diff.eMin + (this.diff.e0 - this.diff.eMin) * Math.exp(-tSeen / this.diff.tau);
      this.errT -= dt;
      if (this.errT <= 0) { this.errT = B.errReroll; const th = Math.random() * Math.PI * 2; this.errTY = Math.cos(th) * err; this.errTP = Math.sin(th) * err; }
      const k = Math.min(1, B.errSlerp * dt);
      this.errYaw += (this.errTY - this.errYaw) * k; this.errPitch += (this.errTP - this.errPitch) * k;
      dYaw += D2R(this.errYaw); dPitch += D2R(this.errPitch);
    } else if (this.state === 'THROW_GRENADE') {
      dYaw = this.gPlan.yaw; dPitch = this.gPlan.pitch;
    } else {
      // lihat ke arah gerak / suara terakhir
      const n = this.pathIdx < this.path.length ? ctx.nav.nodes[this.path[this.pathIdx]] : null;
      if (this.drop) dYaw = yawTo(this.drop.dir.x, this.drop.dir.z);
      else if (n && Math.hypot(n.x - e.pos.x, n.z - e.pos.z) > 0.5) dYaw = yawTo(n.x - e.pos.x, n.z - e.pos.z);
      else if (now - this.heardT < 3) dYaw = yawTo(this.heardAt.x - e.pos.x, this.heardAt.z - e.pos.z);
      dPitch = 0;
    }
    // batas turn rate
    const maxStep = D2R(this.diff.turnRate) * dt;
    this.trackYaw = wrap(this.trackYaw + THREE.MathUtils.clamp(wrap(dYaw - this.trackYaw), -maxStep, maxStep));
    this.trackPitch += THREE.MathUtils.clamp(dPitch - this.trackPitch, -maxStep, maxStep);
    // recoil: sisa yang tidak dikompensasi + pemulihan
    e.recoil.update(dt, now, e.weapon.def);
    this.recoilYaw *= Math.exp(-4 * dt);
    e.yaw = this.trackYaw + this.recoilYaw;
    e.pitch = THREE.MathUtils.clamp(this.trackPitch + D2R(e.recoil.recoilPitch), -D2R(85), D2R(85));

    if (this.state === 'THROW_GRENADE') { tr.held = false; tr.ads = false; this.runGrenade(dt); return; }
    this.gIn.equip = false; this.gIn.lPress = false; this.gIn.lHeld = false; this.gIn.lRelease = false;
    this.gIn.toSlot = e.grenadeState !== 'NONE' && e.grenadeState !== 'THROWN' ? 'ar' : null;

    // syarat tembak: reaksi lewat, deviasi < 2.5° (hip) / 1.2° (ADS), LOS
    tr.ads = !!engage && dist > B.adsDist;
    if (!engage || !this.target || ctx.match.locked) { tr.held = false; return; }
    this.burstPause -= dt;
    this.target.partCenter(this.aimHead ? 'head' : 'upper', _a);
    e.eye(_eye); e.aimDir(_b);
    const dev = R2D(_b.angleTo(_d.copy(_a).sub(_eye)));
    const thr = e.weapon.adsActive ? B.fireDevAds : B.fireDevHip;
    const ready = now - this.firstSeenT >= this.diff.reaction && this.visible && now - this.lastSeenT < 0.25;
    const want = ready && dev < thr && this.burstPause <= 0 && e.weapon.ammo > 0;
    const mode = e.weapon.mode;
    if (want) {
      if (mode === 'AUTO') {
        if (!tr.held) { tr.pressed = true; this.shotsAtBurst = e.weapon.shotsFired; }
        tr.held = true;
        if (e.weapon.shotsFired - this.shotsAtBurst >= this.burstLeft) this.endBurst(dist);
      } else {
        tr.pressed = true; tr.held = true;
        if (this.shotsAtBurst === 0) this.shotsAtBurst = e.weapon.shotsFired;
        if (e.weapon.shotsFired - this.shotsAtBurst >= this.burstLeft) this.endBurst(dist);
      }
    } else if (tr.held && mode === 'AUTO') { tr.held = false; }
    else if (mode !== 'AUTO') tr.held = false;
  }

  private endBurst(dist: number) {
    this.trigger.held = false;
    this.shotsAtBurst = 0;
    this.burstPause = rand(B.burstPause[0], B.burstPause[1]) + (dist > B.burstPauseFarDist ? B.burstPauseFar : 0);
    this.burstLeft = Math.round(rand(this.diff.burst[0], this.diff.burst[1]));
  }

  /** Kompensasi recoil: tiap tembakan kurangi recoilPitch sebesar comp × kick (setara onMouseLook negatif). */
  onRecoil(dPitchDeg: number, dYawDeg: number) {
    this.e.recoil.onMouseLook(-this.diff.comp * dPitchDeg);
    this.recoilYaw += D2R(dYawDeg) * (1 - this.diff.comp);
  }

  get label() { return `${this.e.name} ${this.state}${this.target ? '→' + this.target.name : ''}`; }
}
