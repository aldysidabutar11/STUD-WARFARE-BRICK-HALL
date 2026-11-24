// src/net/NetMatch.ts — replikasi saat match online (host otoritatif ↔ klien).
// HOST: pemain remote digerakkan perintah jaringan (satu per tick, aturan senjata sama dengan pemain lokal — PlayerActions),
//       snapshot 20 Hz per klien (+ keadaan gerak lengkapnya untuk rekonsiliasi), event penting lewat kanal reliable,
//       lag compensation: riwayat hitbox per frame → tembakan remote diuji terhadap posisi yang DILIHAT penembak (maks 250 ms).
// KLIEN: gerak sendiri diprediksi (KCC lokal) lalu dikoreksi dengan memutar ulang perintah yang belum dikonfirmasi; pemain lain &
//        granat diinterpolasi dengan jeda ADAPTIF (±50 ms jaringan bagus … 200 ms buruk); damage/kill/spawn/skor hanya dari host,
//        tapi hitmarker & suara kena serangan sendiri tampil instan (prediksi, dikonfirmasi host tanpa ganda).
import * as THREE from 'three';
import { ctx } from '../game/ctx';
import { bus, type GameEvents, type HitPart, type KillWeapon, type MatchStateName, type MeleeKind, type SurfaceMaterial } from '../core/EventBus';
import { XCFG } from '../config/extraConfig';
import { CFG } from '../config/gameConfig';
import type { Entity } from '../entities/Entity';
import type { CtrlState, MoveIntent } from '../entities/PlayerController';
import { PART_KEYS, type PartKey } from '../entities/BlockyCharacter';
import { TacticalBot } from '../entities/TacticalBot';
import type { TriggerInput } from '../combat/WeaponSystem';
import type { GrenadeInput } from '../combat/GrenadeK400';
import type { Slot } from '../combat/Slots';
import { castShot } from '../combat/Ballistics';
import type { ScopeId, WeaponId } from '../config/weaponsData';
import type { Variant } from '../entities/CharacterArt';
import { CommandHistory, CommandQueue, HitLedger, HostClock, InterpBuffer, SnapStats } from './sync';
import {
  EF, H, I, MATCH_STATES, encodeCommands, encodeSnapshot, qAxis, qPitch, qYaw,
  type Command, type EntState, type MiscFx, type OwnState, type ShotFx, type Snapshot,
} from './protocol';
import { driveWeapons, emptyFrame, frameFromCommand, type ActionFrame } from '../game/PlayerActions';
import { cleanLoadout, type NetClient, type NetHost } from './Session';

const NET = XCFG.net, STEP = CFG.world.fixedStep;
const SLOTS: Slot[] = ['ar', 'knife', 'grenade'];
const GSTATES = ['NONE', 'EQUIP', 'READY', 'COOKING', 'THROWN'] as const;
const MKINDS: MeleeKind[] = ['butt', 'slash', 'stab'];
const MATS: SurfaceMaterial[] = ['tile', 'carpet', 'wood'];
const SURFACE_COLOR = { tile: 0x9a9a9a, carpet: 0x1f3a73, wood: 0x7c5c46 } as const;
const NPART = PART_KEYS.length;
const _v = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _n = new THREE.Vector3();

/** Host: kendali manusia di perangkat lain (antrean perintah + masukan senjata miliknya). */
export class RemoteHuman {
  readonly queue = new CommandQueue(NET.cmdQueueMax);
  readonly frame: ActionFrame = emptyFrame();
  readonly trig: TriggerInput = { pressed: false, held: false, reload: false, modeSwitch: false, ads: false, sprinting: false };
  readonly gIn: GrenadeInput = { equip: false, toSlot: null, lPress: false, lHeld: false, lRelease: false, rPress: false, rHeld: false, rRelease: false };
  /** Tick host yang sedang dilihat klien ini (lag compensation tembakannya). */
  viewTick = 0;
  /** Tick ini ada perintah (senjata digerakkan setelah world.step) / tidak ada (pemain ditahan). */
  has = false;
  get frozen() { return !this.has; }
  constructor(readonly pid: string) {}
}

// ───────────────────────────── lag compensation (host)
class LagComp {
  private hist = new Map<number, { ticks: Float64Array; mats: Float32Array; n: number; i: number }>();
  private saved = new Float32Array(16 * NPART * 16);
  private rewound: Entity[] = [];
  private readonly N = NET.lagCompHistory;
  private lastTick = -1e9;

  /** Setelah animasi per frame: simpan matriks dunia hitbox semua entitas hidup (jarak antar sampel ≥ ½ tick → riwayat ±0.4 s
   *  berapa pun FPS host). */
  record(tick: number) {
    if (tick - this.lastTick < 0.5 && tick >= this.lastTick) return;
    this.lastTick = tick;
    for (const e of ctx.entities) {
      if (!e.alive) continue;
      let h = this.hist.get(e.id);
      if (!h) { h = { ticks: new Float64Array(this.N), mats: new Float32Array(this.N * NPART * 16), n: 0, i: 0 }; this.hist.set(e.id, h); }
      const o = h.i * NPART * 16, hb = e.char.hitboxes;
      for (let p = 0; p < NPART; p++) h.mats.set(hb[p].matrixWorld.elements, o + p * 16);
      h.ticks[h.i] = tick; h.i = (h.i + 1) % this.N; if (h.n < this.N) h.n++;
    }
  }

  /** Pasang matriks hitbox lawan pada tick yang dilihat penembak (dibatasi lagCompMax). */
  rewind(shooter: Entity, tick: number, nowTick: number): boolean {
    const t = Math.max(nowTick - NET.lagCompMax * 60, Math.min(nowTick, tick));
    this.rewound.length = 0;
    for (const e of ctx.entities) {
      if (!e.alive || e === shooter || this.rewound.length >= 16) continue;
      const h = this.hist.get(e.id);
      if (!h || !h.n) continue;
      let best = -1, bd = Infinity;
      for (let j = 0; j < h.n; j++) { const d = Math.abs(h.ticks[j] - t); if (d < bd) { bd = d; best = j; } }
      if (best < 0) continue;
      const k = this.rewound.length, hb = e.char.hitboxes;
      for (let p = 0; p < NPART; p++) {
        this.saved.set(hb[p].matrixWorld.elements, (k * NPART + p) * 16);
        hb[p].matrixWorld.fromArray(h.mats, (best * NPART + p) * 16);
      }
      this.rewound.push(e);
    }
    return this.rewound.length > 0;
  }

  restore() {
    this.rewound.forEach((e, k) => { const hb = e.char.hitboxes; for (let p = 0; p < NPART; p++) hb[p].matrixWorld.fromArray(this.saved, (k * NPART + p) * 16); });
    this.rewound.length = 0;
  }

  forget(id: number) { this.hist.delete(id); }
}

const meleeIdx = (k: MeleeKind) => Math.max(0, MKINDS.indexOf(k));

/** Keadaan entitas untuk snapshot. */
function entState(e: Entity): EntState {
  const c = e.ctrl, w = e.weapon;
  const flags = (e.alive ? EF.ALIVE : 0) | (c.grounded ? EF.GROUNDED : 0) | (c.crouched ? EF.CROUCHED : 0) | (c.sprinting ? EF.SPRINT : 0)
    | (w.adsActive ? EF.ADS : 0) | (e.protectT > 0 ? EF.PROTECT : 0) | (w.reloading ? EF.RELOAD : 0) | (w.hasPrimary ? EF.PRIMARY : 0)
    | (e.throwOver ? EF.THROW_OVER : 0);
  return { id: e.id, flags, x: c.pos.x, y: c.pos.y, z: c.pos.z, yaw: e.yaw, pitch: e.pitch, vx: c.vel.x, vz: c.vel.z, hp: Math.round(e.hp),
    crouchT: c.crouchT, slot: Math.max(0, SLOTS.indexOf(w.slot)), gstate: Math.max(0, GSTATES.indexOf(e.grenadeState)), meleeKind: meleeIdx(e.meleeKind),
    meleeT: e.meleeT, reloadP: w.reloadProgress, throwAnimT: e.throwAnimT, stepPhase: c.stepPhase };
}

function ownState(e: Entity): OwnState {
  const s = e.ctrl.getState(), w = e.weapon;
  return { ...s, ammo: w.ammo, reserve: w.reserve, modeIdx: w.modeIdx, grenades: e.grenades, shots: w.shotsFired };
}

// ───────────────────────────── HOST
export class HostRep {
  private readonly lag = new LagComp();
  private readonly byPid = new Map<string, Entity>();
  private tickN = 0;
  private statsT = 0;
  private nowTick = 0;
  private shots: ShotFx[] = [];
  private fx: MiscFx[] = [];
  private offs: (() => void)[] = [];
  private deathImp = new Map<number, { x: number; y: number; z: number; grenade: boolean }>();
  /** Upload host tersumbat untuk klien tertentu → klien itu menerima snapshot 15 Hz sampai waktu ini (efek dibawa ke snapshot
   *  berikutnya agar tidak hilang). */
  private slowUntil = new Map<string, number>();
  private carry = new Map<string, { shots: ShotFx[]; fx: MiscFx[] }>();
  private baseN = 0;

  constructor(private net: NetHost) {}

  /** Setelah entitas dibuat, sebelum match dimulai (spawn pertama ikut tersiar). */
  begin() {
    this.byPid.clear();
    for (const e of ctx.entities) if (e.remote) this.byPid.set(e.remote.pid, e);
    ctx.net.onShot = (e, kind, end, n, mat, victim, part) => {
      if (this.shots.length < NET.maxShotFx) this.shots.push({ shooter: e.id, x: end.x, y: end.y, z: end.z, kind,
        nx: n?.x ?? 0, ny: n?.y ?? 0, nz: n?.z ?? 0, mat, victim, part });
    };
    ctx.net.rewind = (shooter) => (shooter.remote && shooter.remote.viewTick > 0 ? this.lag.rewind(shooter, shooter.remote.viewTick, this.nowTick) : false);
    ctx.net.restore = () => this.lag.restore();
    const on = <K extends keyof GameEvents>(k: K, fn: (p: GameEvents[K]) => void) => this.offs.push(bus.on(k, fn));
    const all = (m: Record<string, unknown>) => this.net.sendAll({ t: 'ev', ...m });
    on('spawn', (p) => {
      const e = ctx.byId.get(p.entityId);
      if (e) all({ e: 'spawn', id: e.id, x: e.pos.x, y: e.pos.y, z: e.pos.z, yaw: e.yaw, w: e.loadout.weapon, s: e.loadout.scope, v: e.char.variant });
    });
    on('death', (p) => this.deathImp.set(p.entityId, { x: p.impulse.x, y: p.impulse.y, z: p.impulse.z, grenade: p.grenade }));
    on('kill', (p) => {
      const d = this.deathImp.get(p.victimId);
      all({ e: 'kill', k: p.killerId, v: p.victimId, w: p.weaponId, hs: p.headshot, ix: d?.x ?? 0, iy: d?.y ?? 0, iz: d?.z ?? 0, gr: d?.grenade ?? false });
    });
    on('assist', (p) => all({ e: 'assist', id: p.entityId, v: p.victimId }));
    on('hit', (p) => {   // hanya untuk penyerang & korban (hitmarker / indikator arah / angka damage)
      const msg = { t: 'ev', e: 'hit', a: p.attackerId, v: p.victimId, p: p.part, d: p.damage, hs: p.headshot, dist: p.dist, fx: p.fromX, fz: p.fromZ };
      const a = ctx.byId.get(p.attackerId)?.remote?.pid, v = ctx.byId.get(p.victimId)?.remote?.pid;
      if (a) this.net.sendTo(a, msg);
      if (v && v !== a) this.net.sendTo(v, msg);
    });
    on('match:state', (p) => all({ e: 'mstate', s: p.state, w: ctx.match.winner, rw: ctx.match.roundWinner, r: ctx.match.round,
      sb: p.scores[0], sr: p.scores[1], tl: p.timeLeft }));
    on('grenade:explode', (p) => all({ e: 'boom', x: p.position.x, y: p.position.y, z: p.position.z, o: p.ownerId }));
    on('melee', (p) => this.pushFx(p.phase === 'swing' ? 1 : p.phase === 'hit' ? 2 : 3, p.entityId, meleeIdx(p.kind), p.position));
    on('grenade:bounce', (p) => this.pushFx(4, 0, (Math.max(0, MATS.indexOf(p.material)) & 3) | (Math.min(63, Math.round(p.speed * 2)) << 2), p.position));
    on('reload', (p) => { const e = ctx.byId.get(p.entityId); if (e) this.pushFx(5, e.id, p.stage, e.pos); });
    on('dryfire', (p) => { const e = ctx.byId.get(p.entityId); if (e) this.pushFx(6, e.id, 0, e.pos); });
    on('pin', (p) => { const e = ctx.byId.get(p.entityId); if (e) this.pushFx(7, e.id, 0, e.pos); });
  }

  private pushFx(type: number, ent: number, a: number, pos: { x: number; y: number; z: number }) {
    if (this.fx.length < 32) this.fx.push({ type, ent, a, x: pos.x, y: pos.y, z: pos.z });
  }

  onCommands(pid: string, cmds: Command[]) { this.byPid.get(pid)?.remote?.queue.push(cmds); }

  /** Fixed step, sebelum KCC: perintah berikutnya tiap pemain remote → niat gerak. Antrean menumpuk → satu perintah ekstra
   *  disimulasikan penuh dulu (kejar). Tanpa perintah → pemain ditahan tick ini (Game memanggil ctrl.hold()). */
  fixedRemote(dt: number) {
    for (const e of this.byPid.values()) {
      const r = e.remote;
      if (!r) continue;
      if (r.queue.pending > NET.cmdCatchUp && this.take(e, r, dt)) {
        if (e.alive) { e.ctrl.fixedUpdate(dt, e.intent, e.weapon.adsActive); e.ctrl.syncCollider(); }
        this.drive(e, r, dt);
      }
      this.take(e, r, dt);
    }
  }

  private take(e: Entity, r: RemoteHuman, dt: number): boolean {
    const n = r.queue.next(dt, NET.idleCmd);
    r.has = !!n;
    if (!n) return false;
    const c = n.cmd, it = e.intent, control = e.alive && !ctx.match.locked;
    r.viewTick = c.viewTick;
    e.yaw = c.yaw; e.pitch = c.pitch;
    it.ix = control ? c.mx : 0; it.iz = control ? c.mz : 0; it.yaw = c.yaw;
    it.jump = control && !!(c.imp & I.JUMP);
    it.sprint = control && !!(c.held & H.SPRINT); it.crouch = !!(c.held & H.CROUCH);
    it.cooking = e.grenadeState === 'COOKING';
    it.wantFire = e.weapon.slot === 'ar' && !!(c.held & H.FIRE) && e.meleeT < 0;
    it.speedMult = e.weapon.slot === 'knife' ? XCFG.knife.speedMult : 1;
    frameFromCommand(c, n.prevHeld, r.frame);
    return true;
  }

  /** Senjata/granat/pisau pemain remote dengan aturan yang sama persis dengan pemain lokal (PlayerActions). */
  private drive(e: Entity, r: RemoteHuman, dt: number) {
    driveWeapons(e, r.frame, dt, { active: e.alive && !ctx.match.locked, adsMode: 'hold', practice: false }, r.trig, r.gIn);
  }

  /** Klien mengganti loadout di tengah match: berlaku pada spawn berikutnya (sama dengan pemain lokal); tampilan langsung. */
  setLoadout(pid: string, lo: { weapon: WeaponId; scope: ScopeId }, variant: Variant) {
    const e = this.byPid.get(pid);
    if (!e) return;
    e.pendingLoadout = lo;
    if (e.char.variant !== variant) e.char.setVariant(variant);
  }

  /** Setelah world.step: senjata pemain remote (posisi pasca-gerak, seperti prediksi klien), lalu snapshot 20 Hz (per klien:
   *  ack perintah + keadaan geraknya) & statistik tiap detik. */
  afterStep() {
    for (const e of this.byPid.values()) { const r = e.remote; if (r?.has) this.drive(e, r, STEP); }
    this.statsT += STEP;
    if (this.statsT >= NET.statsEvery) { this.statsT = 0; this.sendStats(); }
    if (++this.tickN % NET.snapEvery !== 0) return;
    const m = ctx.match;
    const base = {
      tick: ctx.fixedIndex,
      match: { state: Math.max(0, MATCH_STATES.indexOf(m.state)), sb: ctx.teams.scores.blue, sr: ctx.teams.scores.red, timeLeft: m.timeLeft,
        countdown: m.countdown, round: m.round },
      ents: ctx.entities.map(entState), nades: [] as Snapshot['nades'], shots: this.shots, fx: this.fx,
    };
    ctx.grenades.forEachNet((id, x, y, z, fuse, owner) => base.nades.push({ id: id & 0xffff, x, y, z, fuse, owner }));
    const now = performance.now() / 1000, odd = (++this.baseN & 1) === 1;
    for (const pid of this.net.pids()) {
      const e = this.byPid.get(pid);
      if (!e?.remote) continue;
      if (this.net.backlog(pid) > NET.backlogSlow) this.slowUntil.set(pid, now + NET.slowHold);
      let c = this.carry.get(pid);
      if (odd && (this.slowUntil.get(pid) ?? 0) > now) {   // lewati snapshot ini untuk klien lambat; efeknya ikut snapshot berikut
        if (!c) { c = { shots: [], fx: [] }; this.carry.set(pid, c); }
        for (const x of base.shots) if (c.shots.length < NET.maxShotFx) c.shots.push(x);
        for (const x of base.fx) if (c.fx.length < 32) c.fx.push(x);
        continue;
      }
      const shots = c?.shots.length ? c.shots.concat(base.shots).slice(-NET.maxShotFx) : base.shots;
      const fx = c?.fx.length ? c.fx.concat(base.fx).slice(-32) : base.fx;
      if (c) { c.shots.length = 0; c.fx.length = 0; }
      this.net.sendUnr(pid, encodeSnapshot({ ...base, shots, fx, ack: e.remote.queue.lastSeq, own: e.alive ? ownState(e) : null }));
    }
    this.shots = []; this.fx = [];
  }

  /** Per frame setelah animasi: riwayat hitbox (lag compensation). */
  frame(tick: number) { this.nowTick = tick; this.lag.record(tick); }

  /** Statistik papan skor + ping tiap pemain (ms; −1 bot, −2 host, −3 belum terukur). */
  private sendStats() {
    for (const e of ctx.entities) e.ping = e === ctx.player ? -2 : e.remote ? (this.net.ping(e.remote.pid) ?? -3) : -1;
    const s = ctx.entities.map(e => [e.id, e.stats.kills, e.stats.deaths, e.stats.assists, e.stats.score, e.stats.shots, e.stats.hits,
      e.stats.hsHits, e.stats.hsKills, e.stats.damage, e.stats.bestStreak, e.ping]);
    this.net.sendAll({ t: 'ev', e: 'stats', s });
  }

  /** Teman terputus di tengah match: slotnya diambil alih bot (permintaan pengguna). */
  onPeerLeft(pid: string) {
    const e = this.byPid.get(pid);
    if (!e) return;
    this.byPid.delete(pid);
    this.slowUntil.delete(pid); this.carry.delete(pid);
    e.remote = null; e.ping = -1;
    e.bot = new TacticalBot(e, ctx.settings.difficulty, 20 + e.id);
    if (e.alive) e.bot.onSpawn();
    const text = `${e.name} keluar — diganti bot`;
    ctx.hud.toast(text);
    this.net.sendAll({ t: 'ev', e: 'notice', text });
  }

  end() {
    for (const off of this.offs) off();
    this.offs = [];
    ctx.net.onShot = null; ctx.net.rewind = null; ctx.net.restore = null;
  }
}

// ───────────────────────────── KLIEN
interface CmdExtra { speedMult: number; cooking: boolean; wantFire: boolean; ads: boolean }
interface NadeTrack { a: { t: number; x: number; y: number; z: number }; b: { t: number; x: number; y: number; z: number }; fuse: number; owner: number; seen: number }

export class ClientRep {
  private readonly clock = new HostClock(60, 1.5);
  /** Jeda interpolasi adaptif (diukur dari jitter & paket hilang aliran snapshot). */
  private readonly snap = new SnapStats({ min: NET.interpMin, max: NET.interpMax, safety: NET.interpSafety, window: NET.interpWindow,
    rise: NET.interpRise, fall: NET.interpFall }, NET.interpInit);
  /** Kena hasil prediksi menunggu konfirmasi host. */
  private readonly ledger = new HitLedger(NET.hitConfirmWindow);
  private readonly bufs = new Map<number, InterpBuffer>();
  private readonly hist = new CommandHistory<CtrlState>(256);
  private readonly extra: (CmdExtra | null)[] = new Array(256).fill(null);
  private readonly nades = new Map<number, NadeTrack>();
  private readonly lastStep = new Map<number, number>();
  private readonly st: EntState = { id: 0, flags: 0, x: 0, y: 0, z: 0, yaw: 0, pitch: 0, vx: 0, vz: 0, hp: 0, crouchT: 0, slot: 0, gstate: 0,
    meleeKind: 0, meleeT: -1, reloadP: -1, throwAnimT: -1, stepPhase: 0 };
  private readonly it: MoveIntent = { ix: 0, iz: 0, yaw: 0, jump: false, sprint: false, crouch: false, ads: false, cooking: false, wantFire: false, speedMult: 1 };
  private seq = 0;
  private tickN = 0;
  private snapN = 0;
  private lastSnapTick = 0;
  /** Koreksi posisi pemain lokal yang dihaluskan (ditambahkan ke posisi render, meluruh). */
  readonly smooth = new THREE.Vector3();
  /** Tombol ditahan (diisi Game per frame dari ActionFrame lokal). */
  held = 0;
  /** Impuls sejak perintah terakhir (OR; dikosongkan saat perintah dibuat). */
  imp = 0;
  /** Tick host yang sedang digambar (interpolasi) — dikirim di perintah untuk lag compensation. */
  renderTick = 0;
  /** Statistik diagnostik (overlay / uji). */
  readonly diag = { snaps: 0, corrections: 0, lastErr: 0 };

  constructor(private net: NetClient) {
    ctx.net.predictHit = (v, a, dmg, part) => this.predictHit(v, a, dmg, part);
  }

  /** Jeda interpolasi saat ini (ms) & laju snapshot yang diterima (Hz) — overlay F3. */
  get delayMs() { return (this.snap.delay / 60) * 1000; }
  get snapHz() { return 60 / this.snap.interval; }

  /** Serangan sendiri kena musuh (prediksi lokal; lag compensation host membuat hasilnya ±sama) → hitmarker & suara instan. */
  private predictHit(v: Entity, a: Entity, dmg: number, part: HitPart) {
    this.ledger.predict(v.id, performance.now() / 1000);
    bus.emit('hit', { attackerId: a.id, victimId: v.id, part, damage: dmg, headshot: part === 'head', dist: a.pos.distanceTo(v.pos),
      fromX: a.pos.x, fromZ: a.pos.z, predicted: true });
  }

  /** Fixed step pemain lokal: perintah dari niat gerak (dikuantisasi sama dengan host). */
  command(it: MoveIntent, p: Entity): Command {
    const c: Command = {
      seq: ++this.seq, mx: qAxis(it.ix), mz: qAxis(it.iz), yaw: qYaw(p.yaw), pitch: qPitch(p.pitch),
      held: this.held | (it.crouch ? H.CROUCH : 0) | (it.sprint ? H.SPRINT : 0), imp: this.imp | (it.jump ? I.JUMP : 0),
      viewTick: Math.max(0, Math.round(this.renderTick)),
    };
    this.imp = 0;
    it.ix = c.mx; it.iz = c.mz; it.yaw = c.yaw;
    this.extra[c.seq % 256] = { speedMult: it.speedMult, cooking: it.cooking, wantFire: it.wantFire, ads: p.weapon.adsActive };
    return c;
  }

  /** Setelah world.step: simpan hasil prediksi untuk seq ini; kirim perintah (+ beberapa sebelumnya: tahan paket hilang). */
  afterStep(c: Command, p: Entity) {
    this.hist.put(c, p.ctrl.getState());
    if (++this.tickN % NET.cmdEvery === 0) this.net.sendCommands(encodeCommands(this.hist.recent(this.seq, NET.cmdRedundancy)));
  }

  onSnapshot(s: Snapshot) {
    if (s.tick <= this.lastSnapTick) return;   // datang terlambat / tidak berurutan
    this.lastSnapTick = s.tick;
    this.diag.snaps = ++this.snapN;
    const nowSec = performance.now() / 1000;
    const late = this.clock.ready ? this.clock.tickAt(nowSec) - s.tick : 0;   // telat dibanding kedatangan tercepat (tick)
    this.clock.onSnapshot(s.tick, nowSec);
    this.snap.onSnapshot(s.tick, late, nowSec);
    const p = ctx.player;
    for (const es of s.ents) {
      if (p && es.id === p.id) {
        if (p.alive) { p.hp = es.hp; p.protectT = es.flags & EF.PROTECT ? 0.5 : 0; p.char.protectT = p.protectT; }
        continue;
      }
      let b = this.bufs.get(es.id);
      if (!b) { b = new InterpBuffer(); this.bufs.set(es.id, b); }
      b.push({ ...es, tick: s.tick });
    }
    if (p && p.alive && s.own) this.reconcile(s.ack, s.own, p);
    const m = s.match;
    ctx.match.applyNet((MATCH_STATES[m.state] ?? 'PLAYING') as MatchStateName, m.sb, m.sr, m.timeLeft, m.countdown, m.round);
    for (const n of s.nades) {
      const tr = this.nades.get(n.id);
      if (!tr) this.nades.set(n.id, { a: { t: s.tick, x: n.x, y: n.y, z: n.z }, b: { t: s.tick, x: n.x, y: n.y, z: n.z }, fuse: n.fuse, owner: n.owner, seen: s.tick });
      else { tr.a = tr.b; tr.b = { t: s.tick, x: n.x, y: n.y, z: n.z }; tr.fuse = n.fuse; tr.owner = n.owner; tr.seen = s.tick; }
    }
    for (const [id, tr] of this.nades) if (tr.seen !== s.tick) this.nades.delete(id);
    for (const f of s.shots) if (!p || f.shooter !== p.id) this.remoteShot(f);
    for (const f of s.fx) if (!p || f.ent !== p.id || f.type === 4) this.playFx(f);
  }

  /** Bandingkan prediksi pada seq ack dengan host; bila meleset: pakai keadaan host lalu putar ulang perintah sesudahnya. */
  private reconcile(ack: number, own: OwnState, p: Entity) {
    const pred = this.hist.state(ack);
    const err = pred ? Math.hypot(pred.x - own.x, pred.y - own.y, pred.z - own.z) : Infinity;
    // amunisi/granat: ikut host saat tidak sedang menembak/reload/granat (prediksi tidak berebut dengan konfirmasi)
    const w = p.weapon;
    if (!(this.held & H.FIRE) && w.reloadT < 0 && p.grenadeState === 'NONE' && this.seq - ack < 20) {
      w.ammo = own.ammo; w.reserve = own.reserve; w.modeIdx = own.modeIdx; p.grenades = own.grenades; w.shotsFired = own.shots;
    }
    if (pred && err <= NET.correctEps && pred.grounded === own.grounded && pred.crouched === own.crouched) return;
    this.diag.corrections++; this.diag.lastErr = err === Infinity ? -1 : err;
    const c = p.ctrl;
    _a.copy(p.renderPos);
    c.setState(own);
    c.quiet = true;
    for (const cmd of this.hist.after(ack, this.seq)) {
      const x = this.extra[cmd.seq % 256], it = this.it;
      it.ix = cmd.mx; it.iz = cmd.mz; it.yaw = cmd.yaw; it.jump = !!(cmd.imp & I.JUMP);
      it.sprint = !!(cmd.held & H.SPRINT); it.crouch = !!(cmd.held & H.CROUCH);
      it.cooking = x?.cooking ?? false; it.wantFire = x?.wantFire ?? false; it.speedMult = x?.speedMult ?? 1;
      c.fixedUpdate(STEP, it, x?.ads ?? false);
      c.syncCollider();
      this.hist.setState(cmd.seq, c.getState());
    }
    c.quiet = false;
    this.smooth.add(_a.sub(c.pos));
    if (this.smooth.lengthSq() > 9) this.smooth.set(0, 0, 0);   // teleport / beda besar: tanpa penghalusan
  }

  /** Per frame (sebelum animasi): pemain lain & granat di posisi interpolasi; langkah kaki boneka; koreksi meluruh. */
  update(dt: number) {
    this.clock.update(dt);
    this.snap.update(dt * 60);
    this.renderTick = this.clock.ready ? this.clock.tickAt(performance.now() / 1000) - this.snap.delay : 0;
    for (const e of ctx.entities) {
      if (!e.puppet || !e.alive) continue;
      const b = this.bufs.get(e.id);
      if (!b || !b.sample(this.renderTick, this.st, NET.extrapTicks)) continue;
      this.applyPuppet(e, this.st);
    }
    for (const [id, tr] of this.nades) {
      const span = tr.b.t - tr.a.t, k = span > 0 ? Math.max(0, Math.min(1, (this.renderTick - tr.a.t) / span)) : 1;
      ctx.grenades.netSet(id, tr.a.x + (tr.b.x - tr.a.x) * k, tr.a.y + (tr.b.y - tr.a.y) * k, tr.a.z + (tr.b.z - tr.a.z) * k, tr.fuse, tr.owner);
    }
    ctx.grenades.netPrune(new Set(this.nades.keys()));
    this.smooth.multiplyScalar(Math.exp(-dt / NET.smoothT));
  }

  private applyPuppet(e: Entity, s: EntState) {
    const c = e.ctrl, w = e.weapon;
    c.pos.set(s.x, s.y, s.z); c.prevPos.copy(c.pos);
    c.body.setNextKinematicTranslation({ x: s.x, y: s.y, z: s.z });
    c.vel.set(s.vx, 0, s.vz); c.crouchT = s.crouchT;
    c.grounded = !!(s.flags & EF.GROUNDED); c.sprinting = !!(s.flags & EF.SPRINT); c.crouched = !!(s.flags & EF.CROUCHED);
    // langkah kaki dari fase kontinu host
    const prev = this.lastStep.get(e.id) ?? s.stepPhase;
    if (Math.floor(s.stepPhase) > Math.floor(prev) && c.grounded && Math.hypot(s.vx, s.vz) > 1) {
      bus.emit('footstep', { entityId: e.id, material: 'tile', position: c.pos, loud: c.sprinting, land: false });
    }
    this.lastStep.set(e.id, s.stepPhase);
    c.prevStepPhase = c.stepPhase = s.stepPhase;
    e.yaw = s.yaw; e.pitch = s.pitch;
    w.slot = SLOTS[s.slot] ?? 'ar'; w.hasPrimary = !!(s.flags & EF.PRIMARY); w.adsActive = !!(s.flags & EF.ADS);
    w.reloadT = s.reloadP >= 0 ? s.reloadP * w.def.reloadTime : -1;
    e.grenadeState = GSTATES[s.gstate] ?? 'NONE'; e.throwOver = !!(s.flags & EF.THROW_OVER); e.throwAnimT = s.throwAnimT;
    e.meleeKind = MKINDS[s.meleeKind] ?? 'butt'; e.meleeT = s.meleeT;
    e.hp = s.hp; e.protectT = s.flags & EF.PROTECT ? 0.5 : 0; e.char.protectT = e.protectT;
  }

  /** Tembakan pemain lain: kilat moncong, tracer, selongsong, bekas kena, suara (event), dorongan buku lokal. */
  private remoteShot(f: ShotFx) {
    const e = ctx.byId.get(f.shooter);
    if (!e || !e.alive) return;
    e.muzzleWorld(_a);
    _b.set(f.x, f.y, f.z);
    _v.copy(_b).sub(_a); const dist = _v.length(); if (dist > 1e-4) _v.divideScalar(dist); else _v.set(0, 0, -1);
    ctx.vfx.muzzleFlash(_a, _v);
    if (++e.weapon.shotsFired % CFG.combat.tracerEvery.bot === 0) ctx.vfx.tracer(_a, _b);
    ctx.vfx.shell(e, false);
    bus.emit('shot', { shooterId: e.id, weaponId: e.weapon.def.id, origin: _a.clone(), dir: _v.clone(), end: _b.clone() });
    e.eye(_n); _v.copy(_b).sub(_n).normalize();
    castShot(_n, _v, 0, e);   // buku di lintasan terdorong (lokal, kosmetik); hasil kena diabaikan (host yang menentukan)
    _n.set(f.nx, f.ny, f.nz);
    if (f.kind === 2) {
      const v = ctx.byId.get(f.victim);
      if (v) ctx.vfx.bodyHit(_b, v, (PART_KEYS[f.part] ?? 'upper') as PartKey);
      bus.emit('impact', { position: _b.clone(), normal: _n.clone(), material: 'body' });
    } else if (f.kind === 1) {
      const mat = MATS[f.mat] ?? 'tile';
      ctx.vfx.decal(_b, _n); ctx.vfx.chips(_b, _n, SURFACE_COLOR[mat], 4); ctx.vfx.puff(_b, _n, SURFACE_COLOR[mat]);
      bus.emit('impact', { position: _b.clone(), normal: _n.clone(), material: mat });
    }
  }

  private playFx(f: MiscFx) {
    const pos = new THREE.Vector3(f.x, f.y, f.z);
    if (f.type <= 3) bus.emit('melee', { entityId: f.ent, phase: f.type === 1 ? 'swing' : f.type === 2 ? 'hit' : 'wall', position: pos, kind: MKINDS[f.a] ?? 'butt' });
    else if (f.type === 4) bus.emit('grenade:bounce', { position: pos, speed: (f.a >> 2) / 2, material: MATS[f.a & 3] ?? 'tile' });
    else if (f.type === 5) bus.emit('reload', { entityId: f.ent, stage: Math.min(2, f.a) as 0 | 1 | 2 });
    else if (f.type === 6) bus.emit('dryfire', { entityId: f.ent });
    else if (f.type === 7) bus.emit('pin', { entityId: f.ent });
  }

  /** Event reliable dari host. */
  onEvent(m: Record<string, unknown>) {
    const p = ctx.player, num = (k: string) => Number(m[k] ?? 0);
    switch (m.e) {
      case 'spawn': {
        const e = ctx.byId.get(num('id'));
        if (!e) break;
        const lo = cleanLoadout(m.w, m.s);
        if (lo.weapon !== e.loadout.weapon || lo.scope !== e.loadout.scope) e.pendingLoadout = lo;
        if ((m.v === 'm' || m.v === 'f') && e !== p && e.char.variant !== m.v) e.char.setVariant(m.v);
        this.bufs.get(e.id)?.clear(); this.lastStep.delete(e.id);
        ctx.spawns.applySpawn(e, num('x'), num('y') - 0.05, num('z'), num('yaw'));
        if (e === p) this.smooth.set(0, 0, 0);
        break;
      }
      case 'kill': this.applyKill(m); break;
      case 'assist': {
        const a = ctx.byId.get(num('id'));
        if (a) { a.stats.assists++; a.stats.score += XCFG.announce.assistScore; }
        bus.emit('assist', { entityId: num('id'), victimId: num('v') });
        break;
      }
      case 'hit': {
        if (p && num('v') === p.id) p.lastDamageT = ctx.time;   // HP sendiri dari snapshot (absolut, tanpa hitung ganda)
        // serangan sendiri yang sudah tampil saat prediksi → jangan tampil dua kali
        if (p && num('a') === p.id && num('v') !== p.id && this.ledger.confirm(num('v'), performance.now() / 1000)) break;
        bus.emit('hit', { attackerId: num('a'), victimId: num('v'), part: m.p as HitPart, damage: num('d'), headshot: !!m.hs, dist: num('dist'),
          fromX: num('fx'), fromZ: num('fz') });
        break;
      }
      case 'boom': ctx.grenades.explodeFx(new THREE.Vector3(num('x'), num('y'), num('z')), num('o')); break;
      case 'mstate':
        ctx.match.winner = (m.w as never) ?? 'draw'; ctx.match.roundWinner = (m.rw as never) ?? null;
        ctx.match.applyNet(m.s as MatchStateName, num('sb'), num('sr'), num('tl'), ctx.match.countdown, num('r'));
        break;
      case 'stats':
        for (const row of (m.s as number[][]) ?? []) {
          const e = ctx.byId.get(row[0]);
          if (!e) continue;
          const st = e.stats;
          [st.kills, st.deaths, st.assists, st.score, st.shots, st.hits, st.hsHits, st.hsKills, st.damage, st.bestStreak] = row.slice(1, 11);
          e.ping = typeof row[11] === 'number' ? row[11] : -1;
        }
        break;
      case 'notice': ctx.hud.toast(String(m.text ?? '')); break;
    }
  }

  private applyKill(m: Record<string, unknown>) {
    const num = (k: string) => Number(m[k] ?? 0);
    const v = ctx.byId.get(num('v')), k = ctx.byId.get(num('k'));
    if (v && v.alive) {
      v.alive = false; v.hp = 0; v.stats.deaths++; v.grenadeState = 'NONE'; v.meleeT = -1; v.streak = 0;
      v.respawnT = CFG.player.respawnDelay;   // hanya tampilan hitung mundur — spawn tetap dari host
      const imp = new THREE.Vector3(num('ix'), num('iy'), num('iz'));
      ctx.deathFx.spawn(v, imp);
      v.char.setVisible(false); v.ctrl.setEnabled(false);
      bus.emit('death', { entityId: v.id, impulse: imp, grenade: !!m.gr });
    }
    if (k && v && k !== v && k.team !== v.team) {
      k.stats.kills++; k.stats.score += XCFG.scoring.kill + (m.hs ? XCFG.scoring.headshotBonus : 0);
      if (m.hs) k.stats.hsKills++;
      k.streak++; k.stats.bestStreak = Math.max(k.stats.bestStreak, k.streak);
    }
    bus.emit('kill', { killerId: num('k'), victimId: num('v'), weaponId: m.w as KillWeapon, headshot: !!m.hs });
  }

  /** Diagnostik: jumlah entitas yang punya data interpolasi. */
  get tracked() { return this.bufs.size; }
}
