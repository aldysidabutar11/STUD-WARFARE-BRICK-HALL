// src/combat/C4Bomb.ts — C4 mode Bomb Mission (dokumen pengguna §6.3): DIBAWA (di punggung pembawa) → JATUH (body Rapier, dipungut
// penyerang yang lewat ≤ 2.2 u) → MENANAM (tahan E 4 s di zona A/B, menapak; gerak & tembak terkunci) → TERTANAM (sumbu 40 s, beep
// makin rapat) → MENJINAKKAN (bertahan ≤ 3 u, menghadap ≤ 60°, tahan E 5 s; satu orang) → DIJINAKKAN / MELEDAK (radius 32 u,
// okklusi 3 titik, melukai SEMUA orang, tanpa kredit kill). Host/offline otoritatif; klien menerima keadaan lewat applyNet dan hanya
// memajukan timer tampilan. Logika murni (matriks menang, damage, beep, giliran pembawa) di game/BombRules.ts.
import * as THREE from 'three';
import { RAPIER, physics } from '../physics/Physics';
import { GROUPS } from '../physics/groups';
import { BodyLerp } from '../core/BodyLerp';
import { BOMB_CFG } from '../config/bombConfig';
import { XCFG } from '../config/extraConfig';
import { bus } from '../core/EventBus';
import { ctx } from '../game/ctx';
import { beepInterval, c4Damage, canDefuseFrom, pickCarrier, siteAt, type BombSiteDef, type TeamColor } from '../game/BombRules';
import { currentMap } from '../world/maps/current';
import * as R from '../audio/Recipes';
import type { Entity } from '../entities/Entity';

const C = BOMB_CFG.c4;
/** Rupa C4 diperbesar dari ukuran dokumen (0.5 × 0.2 × 0.35 u ≈ 18 cm) agar terbaca di layar; tapak body jatuh ikut. */
export const C4_SCALE = 1.6;
const HALF: [number, number, number] = [0.25 * C4_SCALE, 0.1 * C4_SCALE, 0.175 * C4_SCALE];

export type BombState = 'none' | 'carried' | 'dropped' | 'planted' | 'defused' | 'detonated';
/** Keadaan ringkas untuk jaringan (host → klien) & cadangan pindah host. */
export interface BombNet {
  s: BombState; c: number; x: number; y: number; z: number; site: 'A' | 'B' | null; f: number;
  p: number; pt: number; d: number; dt: number; a: TeamColor;
}
const STATES: readonly BombState[] = ['none', 'carried', 'dropped', 'planted', 'defused', 'detonated'];

/** Parser keadaan C4 dari jaringan / cadangan (data teman tidak dipercaya) → null bila tidak sah. */
export function parseBombNet(v: unknown): BombNet | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>, fin = (k: string) => typeof o[k] === 'number' && Number.isFinite(o[k] as number);
  if (!STATES.includes(o.s as BombState)) return null;
  for (const k of ['c', 'x', 'y', 'z', 'f', 'p', 'pt', 'd', 'dt']) if (!fin(k)) return null;
  if (o.site !== null && o.site !== 'A' && o.site !== 'B') return null;
  if (o.a !== 'blue' && o.a !== 'red') return null;
  const n = (k: string, lo: number, hi: number) => Math.min(hi, Math.max(lo, o[k] as number));
  return { s: o.s as BombState, c: Math.round(n('c', -1, 999)), x: n('x', -500, 500), y: n('y', -50, 100), z: n('z', -500, 500),
    site: o.site as 'A' | 'B' | null, f: n('f', 0, C.fuseTime), p: Math.round(n('p', -1, 999)), pt: n('pt', 0, C.plantTime),
    d: Math.round(n('d', -1, 999)), dt: n('dt', 0, C.defuseTime), a: o.a as TeamColor };
}

// ───────────────────────── model prosedural (dipakai C4 dunia & viewmodel)
const MATS = {
  putty: new THREE.MeshStandardMaterial({ color: 0x6d6a4c, roughness: 0.85 }),
  tape: new THREE.MeshStandardMaterial({ color: 0x2a2a2c, roughness: 0.6 }),
  box: new THREE.MeshStandardMaterial({ color: 0x1d2024, roughness: 0.45, metalness: 0.4 }),
  wireR: new THREE.MeshStandardMaterial({ color: 0xb3261e, roughness: 0.5 }),
  wireB: new THREE.MeshStandardMaterial({ color: 0x2457a8, roughness: 0.5 }),
  lcd: new THREE.MeshBasicMaterial({ color: 0x5cff8a }),
  key: new THREE.MeshStandardMaterial({ color: 0xc9cfd6, roughness: 0.4 }),
};
/** Model C4 (pusat bawah di titik asal, panjang sepanjang X): 4 balok bahan peledak berlilit lakban, kotak pemicu di atas dengan
 *  LCD hijau & tombol keypad, kabel merah/biru, LED merah (mesh terpisah agar bisa berkedip). */
export function c4Model(ledMat?: THREE.Material): { group: THREE.Group; led: THREE.Mesh } {
  const g = new THREE.Group(), s = C4_SCALE;
  const add = (m: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w * s, h * s, d * s), m);
    mesh.position.set(x * s, y * s, z * s); mesh.castShadow = true; g.add(mesh); return mesh;
  };
  for (let i = 0; i < 4; i++) add(MATS.putty, 0.5, 0.075, 0.08, 0, 0.0375, -0.13 + i * 0.087);
  for (const x of [-0.17, 0.17]) add(MATS.tape, 0.06, 0.085, 0.36, x, 0.04, 0);
  add(MATS.box, 0.24, 0.07, 0.17, 0.02, 0.11, 0);
  add(MATS.lcd, 0.12, 0.005, 0.05, 0.0, 0.1475, -0.035);
  for (let i = 0; i < 6; i++) add(MATS.key, 0.03, 0.006, 0.025, -0.045 + (i % 3) * 0.045, 0.148, 0.025 + Math.floor(i / 3) * 0.035);
  add(MATS.wireR, 0.22, 0.012, 0.012, -0.05, 0.155, 0.075);
  add(MATS.wireB, 0.012, 0.012, 0.2, 0.12, 0.14, 0);
  const led = add(ledMat ?? new THREE.MeshBasicMaterial({ color: 0x3a0505 }), 0.025, 0.02, 0.025, 0.11, 0.155, -0.06);
  return { group: g, led };
}

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _d = new THREE.Vector3(), _imp = new THREE.Vector3();
const LED_ON = new THREE.Color(0xff2a1e), LED_OFF = new THREE.Color(0x3a0505);

export class BombSystem {
  state: BombState = 'none';
  carrier = -1;
  site: 'A' | 'B' | null = null;
  readonly pos = new THREE.Vector3();
  fuseLeft = 0;
  planter = -1; plantT = 0;
  defuser = -1; defuseT = 0;
  attackers: TeamColor = BOMB_CFG.firstAttackers;
  /** Berapa kali tiap entitas membawa C4 (giliran adil; reset per match). */
  readonly carried = new Map<number, number>();
  /** Host: ada perubahan yang perlu disiarkan ke klien. */
  dirty = false;
  private body: RAPIER.RigidBody | null = null;
  private readonly lerp = new BodyLerp();
  private restT = 0;
  private beepT = 0; private keypadT = 0; private ledT = 0;
  private readonly mesh: THREE.Group;
  private readonly ledMat = new THREE.MeshBasicMaterial({ color: LED_OFF.clone() });

  constructor(scene: THREE.Scene) {
    this.mesh = c4Model(this.ledMat).group;
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  /** Mode Bomb Mission aktif & map punya zona bom. */
  get active() { return ctx.match.mode === 'bomb' && this.sites.length > 0; }
  get sites(): readonly BombSiteDef[] { return currentMap().bombSites ?? []; }

  // ───────────── siklus match / ronde
  /** Keadaan kosong (ganti ronde/match, keluar ke menu). */
  reset() {
    this.removeBody();
    this.state = 'none'; this.carrier = -1; this.site = null; this.fuseLeft = 0;
    this.planter = -1; this.plantT = 0; this.defuser = -1; this.defuseT = 0; this.restT = 0;
    this.mesh.visible = false; this.dirty = true;
  }
  resetMatch() { this.reset(); this.carried.clear(); this.attackers = BOMB_CFG.firstAttackers; }

  /** Host/offline awal ronde: tetapkan tim penyerang & pembawa C4 (bergilir adil). */
  startRound(attackers: TeamColor) {
    this.reset();
    this.attackers = attackers;
    const ids = ctx.entities.filter(e => e.alive && e.team === attackers).map(e => e.id);
    const id = pickCarrier(ids, this.carried, Math.random);
    if (id >= 0) {
      this.carried.set(id, (this.carried.get(id) ?? 0) + 1);
      this.carrier = id; this.state = 'carried';
      this.emit('carry', id);
    }
  }

  // ───────────── aturan aksi (host & klien memakai fungsi yang sama → kunci gerak konsisten dengan prediksi)
  /** Zona tempat e bisa menanam sekarang (pembawa, hidup, menapak, kaki di dalam zona) — null bila tidak bisa. */
  canPlant(e: Entity): 'A' | 'B' | null {
    if (this.state !== 'carried' || this.carrier !== e.id || !e.alive || !e.ctrl.grounded) return null;
    return siteAt(e.pos.x, e.pos.y, e.pos.z, this.sites);
  }
  /** e (bertahan) bisa menjinakkan sekarang: ≤ 3 u, menghadap ≤ 60°, menapak, belum ada penjinak lain. */
  canDefuse(e: Entity): boolean {
    return this.state === 'planted' && e.alive && e.team !== this.attackers && e.ctrl.grounded && Math.abs(e.pos.y - this.pos.y) < 1.6
      && (this.defuser < 0 || this.defuser === e.id) && canDefuseFrom(e.pos.x, e.pos.z, e.yaw, this.pos.x, this.pos.z);
  }
  /** Gerak & senjata terkunci: e menahan "pakai" dan sedang/bisa menanam atau menjinakkan. */
  lockFor(e: Entity, use: boolean): boolean {
    if (!use || !this.active || ctx.match.state !== 'PLAYING') return false;
    return this.canPlant(e) !== null || this.canDefuse(e);
  }

  /** Host/offline, tiap tick untuk tiap entitas: masukan "pakai" (E ditahan / klik saat memegang C4). */
  use(e: Entity, use: boolean, dt: number) {
    if (!this.active || ctx.net.role === 'client') return;
    const playing = ctx.match.state === 'PLAYING';
    if (this.planter === e.id && (!use || !playing || this.canPlant(e) === null)) {
      this.planter = -1; this.plantT = 0; this.emit('plantStop', e.id);
    }
    if (this.defuser === e.id && (!use || !playing || !this.canDefuse(e))) {
      this.defuser = -1; this.defuseT = 0; this.emit('defuseStop', e.id);
    }
    if (!use || !playing) return;
    const site = this.canPlant(e);
    if (site) {
      if (this.planter !== e.id) { this.planter = e.id; this.plantT = 0; this.keypadT = 0; this.emit('plantStart', e.id, site); }
      this.plantT += dt;
      if (this.plantT >= C.plantTime) this.plant(e, site);
      return;
    }
    if (this.canDefuse(e)) {
      if (this.defuser !== e.id) { this.defuser = e.id; this.defuseT = 0; this.emit('defuseStart', e.id); }
      this.defuseT += dt;
      if (this.defuseT >= C.defuseTime && this.fuseLeft > 0) this.defuse(e);
    }
  }

  private plant(e: Entity, site: 'A' | 'B') {
    this.state = 'planted'; this.site = site; this.pos.set(e.pos.x, e.pos.y, e.pos.z);
    this.fuseLeft = C.fuseTime; this.carrier = -1; this.planter = -1; this.plantT = 0; this.beepT = 0;
    this.mesh.rotation.set(0, e.yaw, 0);
    e.stats.score += BOMB_CFG.score.plant; e.stats.plants++;
    e.c4Held = false;
    this.emit('planted', e.id, site);
  }
  private defuse(e: Entity) {
    this.state = 'defused'; this.defuser = -1; this.defuseT = 0;
    e.stats.score += BOMB_CFG.score.defuse; e.stats.defuses++;
    this.emit('defused', e.id);
  }

  /** Pembawa keluar dari game (online: slotnya dimainkan bot) → C4 jatuh di posisinya. */
  dropIfCarrier(id: number) { if (this.state === 'carried' && this.carrier === id) this.drop(ctx.byId.get(id)); }

  private drop(c: Entity | undefined) {
    const p = c ? c.pos : this.pos;
    this.pos.set(p.x, p.y + 1.4, p.z);
    this.carrier = -1; this.planter = -1; this.plantT = 0; this.state = 'dropped'; this.restT = 0;
    this.spawnBody(this.pos, c ? c.yaw : 0);
    if (c) c.c4Held = false;
    this.emit('drop', c ? c.id : -1);
  }
  private pickup(e: Entity) {
    this.removeBody();
    this.state = 'carried'; this.carrier = e.id;
    this.emit('carry', e.id);
  }

  private spawnBody(p: THREE.Vector3, yaw: number) {
    this.removeBody();
    const w = physics.world;
    const body = w.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(p.x, p.y, p.z)
      .setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) })
      .setLinvel(-Math.sin(yaw) * 1.5, 1.5, -Math.cos(yaw) * 1.5).setCcdEnabled(true).setLinearDamping(0.4).setAngularDamping(0.8));
    w.createCollider(RAPIER.ColliderDesc.cuboid(...HALF).setTranslation(0, HALF[1], 0).setDensity(1.2).setFriction(0.8)
      .setRestitution(0.15).setCollisionGroups(GROUPS.DEBRIS), body);
    this.body = body;
    this.lerp.snap(body);
  }
  private removeBody() {
    if (this.body) { if (physics.world.bodies.contains(this.body.handle)) physics.world.removeRigidBody(this.body); this.body = null; }
  }

  /** Host/offline per tick fisika (setelah gerak entitas). */
  fixedUpdate(dt: number) {
    if (!this.active || ctx.net.role === 'client') return;
    if (this.state === 'carried') {
      const c = ctx.byId.get(this.carrier);
      if (!c || !c.alive) this.drop(c);
    } else if (this.state === 'dropped') {
      if (this.body) { const t = this.body.translation(); this.pos.set(t.x, t.y, t.z); }
      for (const e of ctx.entities) {
        if (!e.alive || e.team !== this.attackers) continue;
        if (Math.hypot(e.pos.x - this.pos.x, e.pos.z - this.pos.z) <= C.pickupRadius && Math.abs(e.pos.y + 1 - this.pos.y) < 2.6) { this.pickup(e); return; }
      }
      // C4 diam di tempat yang tidak terjangkau (di atas benda tinggi / keluar map) → pindah ke node nav terdekat
      const v = this.body?.linvel();
      this.restT = v && Math.hypot(v.x, v.y, v.z) < 0.15 ? this.restT + dt : 0;
      if (this.pos.y < -3 || this.restT > C.unreachableAfter) {
        const n = ctx.nav.nodes[ctx.nav.nearest(this.pos.x, this.pos.y, this.pos.z)];
        if (this.pos.y < -3 || Math.hypot(n.x - this.pos.x, n.y - this.pos.y, n.z - this.pos.z) > 2.6) {
          this.pos.set(n.x, n.y + 0.4, n.z); this.spawnBody(this.pos, 0); this.dirty = true;
        }
        this.restT = -1e9;   // cek sekali per jatuh
      }
    } else if (this.state === 'planted' && ctx.match.state === 'PLAYING') {
      this.fuseLeft -= dt;
      if (this.fuseLeft <= 0) this.detonate();
    }
  }
  postStep() { if (this.body) this.lerp.step(this.body); }

  /** Ledakan C4 (host/offline): damage ke SEMUA orang dalam 32 u (okklusi kepala/dada/perut), tanpa penyerang (tanpa kredit kill). */
  private detonate() {
    this.state = 'detonated'; this.fuseLeft = 0; this.defuser = -1; this.defuseT = 0;
    const c = _b.set(this.pos.x, this.pos.y + 0.6, this.pos.z), Rr = C.blastRadius;
    for (const v of ctx.entities) {
      if (!v.alive) continue;
      v.capsuleCenter(_a);
      const r = _a.distanceTo(c);
      if (r >= Rr) continue;
      v.char.root.updateMatrixWorld(true);
      let vis = 0;
      for (const k of ['head', 'upper', 'lower'] as const) { v.partCenter(k, _d); if (!physics.losBlocked(c.x, c.y, c.z, _d.x, _d.y, _d.z)) vis++; }
      const dmg = c4Damage(r, vis / 3);
      if (dmg <= 0) continue;
      _imp.set(_a.x - c.x, _a.y - c.y + 0.6, _a.z - c.z).normalize().multiplyScalar(26 * (1 - r / Rr));
      _d.copy(_imp).normalize();
      ctx.teams.applyDamage(v, null, dmg, 'upper', 'c4', _d, true, _imp);
    }
    ctx.breakables.explosion(c, Rr);
    this.explodeFx();
    this.emit('detonated', -1);
  }

  /** Efek ledakan tanpa damage (host & klien): 3 bola api, benda & mayat terdorong, guncangan, telinga berdenging, suara. */
  private explodeFx() {
    const c = _b.set(this.pos.x, this.pos.y + 0.6, this.pos.z);
    ctx.props.explode(c);
    ctx.deathFx.explode(c, C.blastRadius * 0.6, 21, 1.4);
    ctx.vfx.explosion(c);
    for (const [dx, dz] of [[1.6, 0.8], [-1.2, 1.4], [0.4, -1.7]] as const) ctx.vfx.explosion(_a.set(c.x + dx, c.y + 0.8, c.z + dz));
    const rc = ctx.camRig.position.distanceTo(c);
    if (rc < 60) ctx.camRig.addShake(4 * (1 - rc / 60) ** 2);
    if (rc < 20) ctx.audio.tinnitus(XCFG.explosion.tinnitusTime * 1.5);
    ctx.audio.play(R.c4Explosion, 'explosion', c.clone(), XCFG.audio.priority.explosion, 1.0);
    this.mesh.visible = false;
  }

  // ───────────── tampilan & suara (host & klien, per frame)
  update(dt: number, alpha: number) {
    if (!this.active) { this.mesh.visible = false; return; }
    const client = ctx.net.role === 'client';
    if (client) {             // klien: timer tampilan maju sendiri di antara pesan host
      if (this.state === 'planted' && ctx.match.state === 'PLAYING') this.fuseLeft = Math.max(0, this.fuseLeft - dt);
      if (this.planter >= 0) this.plantT = Math.min(C.plantTime, this.plantT + dt);
      if (this.defuser >= 0) this.defuseT = Math.min(C.defuseTime, this.defuseT + dt);
    }
    const m = this.mesh;
    if (this.state === 'carried') {
      const e = ctx.byId.get(this.carrier);
      const show = !!e && e.alive && e.char.root.visible && !(e === ctx.player && (ctx.camRig.isFpsView || ctx.camRig.nearBody));
      m.visible = show;
      if (show && e) {                                       // di punggung (ransel taktis): belakang dada, setinggi punggung atas
        const yaw = e.char.root.rotation.y, back = e.ctrl.crouched ? 2.2 : 2.95;
        m.position.set(e.renderPos.x + Math.sin(yaw) * 0.62, e.renderPos.y + back, e.renderPos.z + Math.cos(yaw) * 0.62);
        m.rotation.set(Math.PI / 2, yaw, 0);
      }
    } else if (this.state === 'dropped') {
      m.visible = true;
      if (this.body) this.lerp.apply(m, alpha);
      else { m.position.set(this.pos.x, this.pos.y - HALF[1], this.pos.z); m.rotation.set(0, m.rotation.y, 0); }
    } else if (this.state === 'planted' || this.state === 'defused') {
      m.visible = true;
      m.position.set(this.pos.x, this.pos.y + 0.01, this.pos.z);
      m.rotation.x = 0; m.rotation.z = 0;
    } else m.visible = false;
    // beep (makin rapat) + LED berkedip; keypad saat menanam
    if (this.state === 'planted' && ctx.match.state === 'PLAYING') {
      this.beepT -= dt;
      if (this.beepT <= 0) {
        this.beepT = beepInterval(this.fuseLeft);
        this.ledT = 0.08;
        ctx.audio.play(R.c4Beep, 'explosion', this.pos.clone(), XCFG.audio.priority.explosion, 0.8);
      }
    }
    if (this.planter >= 0) {
      this.keypadT -= dt;
      const pl = ctx.byId.get(this.planter);
      if (this.keypadT <= 0 && pl) { this.keypadT = C.keypadEvery; ctx.audio.play(R.c4Keypad, 'footstep', pl.pos.clone(), XCFG.audio.priority.impact, 0.9); }
    }
    this.ledT -= dt;
    this.ledMat.color.copy(this.ledT > 0 || this.state === 'defused' ? (this.state === 'defused' ? _green : LED_ON) : LED_OFF);
  }

  /** Lanjutkan dari cadangan (pindah host): keadaan apa adanya, aksi tanam/jinak yang sedang berjalan diulang dari nol. */
  restore(n: BombNet, carried: readonly [number, number][]) {
    this.reset();
    this.carried.clear();
    for (const [id, k] of carried) this.carried.set(id, k);
    this.attackers = n.a; this.state = n.s; this.carrier = n.c; this.site = n.site; this.fuseLeft = n.f;
    this.pos.set(n.x, n.y, n.z);
    if (n.s === 'dropped' && ctx.net.role !== 'client') this.spawnBody(this.pos, 0);
    this.dirty = true;
  }

  // ───────────── jaringan
  netState(): BombNet {
    return { s: this.state, c: this.carrier, x: +this.pos.x.toFixed(2), y: +this.pos.y.toFixed(2), z: +this.pos.z.toFixed(2),
      site: this.site, f: +this.fuseLeft.toFixed(2), p: this.planter, pt: +this.plantT.toFixed(2), d: this.defuser,
      dt: +this.defuseT.toFixed(2), a: this.attackers };
  }
  /** Klien: keadaan dari host (event ‘bomb’). Perubahan keadaan → event bus lokal (audio/HUD/bot sama dengan host). */
  applyNet(n: BombNet) {
    const prev = this.state, prevP = this.planter, prevD = this.defuser, prevC = this.carrier;
    this.attackers = n.a; this.carrier = n.c; this.site = n.site; this.fuseLeft = n.f;
    this.planter = n.p; this.plantT = n.pt; this.defuser = n.d; this.defuseT = n.dt;
    this.pos.set(n.x, n.y, n.z);
    this.state = n.s;
    if (n.s !== 'dropped') this.removeBody();
    if (n.s === 'planted' && prev !== 'planted') { this.beepT = 0; this.emit('planted', prevP >= 0 ? prevP : -1, n.site, false); }
    if (n.s === 'defused' && prev !== 'defused') this.emit('defused', prevD, null, false);
    if (n.s === 'detonated' && prev !== 'detonated') { this.explodeFx(); this.emit('detonated', -1, null, false); }
    if (n.s === 'dropped' && prev !== 'dropped') this.emit('drop', prevC, null, false);
    if (n.s === 'carried' && (prev !== 'carried' || prevC !== n.c)) this.emit('carry', n.c, null, false);
    if (n.p >= 0 && prevP !== n.p) { this.keypadT = 0; this.emit('plantStart', n.p, null, false); }
    if (n.p < 0 && prevP >= 0 && n.s !== 'planted') this.emit('plantStop', prevP, null, false);
    if (n.d >= 0 && prevD !== n.d) this.emit('defuseStart', n.d, null, false);
    if (n.d < 0 && prevD >= 0 && n.s === 'planted') this.emit('defuseStop', prevD, null, false);
  }

  private emit(kind: 'carry' | 'drop' | 'plantStart' | 'plantStop' | 'planted' | 'defuseStart' | 'defuseStop' | 'defused' | 'detonated',
    id: number, site: 'A' | 'B' | null = this.site, mark = true) {
    if (mark) this.dirty = true;
    if (kind === 'defuseStart') {
      const e = ctx.byId.get(id);
      if (e) ctx.audio.play(R.c4DefuseClick, 'footstep', e.pos.clone(), XCFG.audio.priority.impact, 1.0);
    }
    bus.emit('bomb', { kind, id, site, position: this.pos.clone() });
  }
}
const _green = new THREE.Color(0x3cff6a);
