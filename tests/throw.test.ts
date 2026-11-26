// tests/throw.test.ts — lemparan benda lempar (permintaan pengguna 2026-11-26): kecepatan lempar jauh 34 u/s, garis lintasan prediksi
// (combat/throwArc) = lintasan body Rapier granat sungguhan, flash pelempar × 0.5, setelan nadeArc.
import { beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { RAPIER, physics, type V3 } from '../src/physics/Physics';
import { GROUPS } from '../src/physics/groups';
import { CFG } from '../src/config/gameConfig';
import { XCFG } from '../src/config/extraConfig';
import { ARC_GROUPS, ArcTrace, RAPIER_SUBSTEPS, nadeStep, throwLaunch, traceThrow, type LaunchIn } from '../src/combat/throwArc';
import { flashExposure, flashStrength, ownerFlash } from '../src/combat/Flash';
import { DEFAULTS, validate } from '../src/ui/Settings';

const GR = CFG.grenade, GT = XCFG.grenadeThrow, dt = CFG.world.fixedStep, D2R = Math.PI / 180;
const Y0 = 1000;                                   // area uji jauh dari apa pun
const v3 = (x = 0, y = 0, z = 0): V3 => ({ x, y, z });
const dist = (a: V3, b: V3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const ptAt = (tr: ArcTrace, i: number): V3 => v3(tr.pts[i * 3], tr.pts[i * 3 + 1], tr.pts[i * 3 + 2]);

beforeAll(async () => { await physics.init(); });

/** Body granat persis GrenadeK400.throw. */
function nadeBody(p: V3, v: V3) {
  const w = physics.world;
  const body = w.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(p.x, p.y, p.z).setLinvel(v.x, v.y, v.z)
    .setCcdEnabled(true).setLinearDamping(GR.linDamp).setAngularDamping(GR.angDamp));
  w.createCollider(RAPIER.ColliderDesc.ball(GR.radius).setRestitution(GR.restitution).setFriction(GR.friction)
    .setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Max).setFrictionCombineRule(RAPIER.CoefficientCombineRule.Max)
    .setDensity(GR.density).setCollisionGroups(GROUPS.GRENADE), body);
  return body;
}
/** Balok tetap (pusat, setengah ukuran) dengan grup tabrakan. */
function box(c: V3, h: V3, groups: number = GROUPS.STATIC) {
  const col = physics.world.createCollider(RAPIER.ColliderDesc.cuboid(h.x, h.y, h.z).setTranslation(c.x, c.y, c.z).setCollisionGroups(groups));
  physics.world.step();                            // query butuh broad phase terbarui
  return col;
}
const drop = (...cols: RAPIER.Collider[]) => { for (const c of cols) physics.world.removeCollider(c, false); physics.world.step(); };

const launch = (o: Partial<LaunchIn> & { pitch: number; yaw?: number }): { pos: V3; vel: V3 } => {
  const L: LaunchIn = { overhand: true, yaw: 0, eye: v3(0, Y0 + 4.4, 0), hand: null, feet: v3(0, Y0, 0), vx: 0, vy: 0, vz: 0, ...o };
  const pos = v3(), vel = v3();
  throwLaunch(L, pos, vel);
  return { pos, vel };
};

describe('lemparan: titik lepas & kecepatan awal (throwLaunch)', () => {
  it('lemparan jauh 34 u/s (GDD 24 — disetujui pengguna), arah = pitch + 8°, titik lepas FPS = rumus GDD §8 (mata + f·0.6 + r·0.25 − u·0.15)', () => {
    expect(GR.overSpeed).toBe(34);
    expect(GR.underSpeed).toBe(11);
    for (const [yaw, pitch] of [[0, 0], [0.7, -0.3], [-2.1, 0.6], [3, 1.2]]) {
      const { pos, vel } = launch({ yaw, pitch });
      const a = pitch + GR.overLiftDeg * D2R;
      expect(Math.hypot(vel.x, vel.y, vel.z)).toBeCloseTo(34, 9);
      expect(vel.y / 34).toBeCloseTo(Math.sin(a), 9);
      expect(vel.x / 34).toBeCloseTo(-Math.sin(yaw) * Math.cos(a), 9);
      expect(vel.z / 34).toBeCloseTo(-Math.cos(yaw) * Math.cos(a), 9);
      // rumus lama (vektor three.js: f, r, u = normalize(r × f))
      const cp = Math.cos(pitch), f = new THREE.Vector3(-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp);
      const r = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw)), u = new THREE.Vector3().crossVectors(r, f).normalize();
      const old = new THREE.Vector3(0, Y0 + 4.4, 0).addScaledVector(f, GT.fpsFwd).addScaledVector(r, GT.fpsRight).addScaledVector(u, -GT.fpsDown);
      expect(dist(pos, old)).toBeLessThan(1e-9);
      // arah lama: f diputar +8° di sumbu r
      const d = f.clone().applyAxisAngle(r, GR.overLiftDeg * D2R).multiplyScalar(34);
      expect(dist(vel, d)).toBeLessThan(1e-9);
    }
  });
  it('TPS: titik lepas = tangan; gelinding: pitch dijepit −20…10 (+2), 11 u/s dari kaki + (maju 0.6, naik 1.5); warisan kecepatan × 0.5', () => {
    expect(launch({ pitch: 0.2, hand: v3(3, Y0 + 3, -1) }).pos).toEqual(v3(3, Y0 + 3, -1));
    const un = launch({ overhand: false, yaw: Math.PI / 2, pitch: -40 * D2R });
    expect(un.pos.x).toBeCloseTo(-GT.underFwd, 9); expect(un.pos.y).toBeCloseTo(Y0 + GT.underUp, 9); expect(un.pos.z).toBeCloseTo(0, 9);
    expect(Math.hypot(un.vel.x, un.vel.y, un.vel.z)).toBeCloseTo(11, 9);
    expect(Math.asin(un.vel.y / 11) / D2R).toBeCloseTo(-20 + GT.underPitchAdd, 6);
    const run = launch({ pitch: 0, vx: 10, vy: -4, vz: 2 }), still = launch({ pitch: 0 });
    expect(run.vel.x - still.vel.x).toBeCloseTo(5, 9); expect(run.vel.y - still.vel.y).toBeCloseTo(-2, 9); expect(run.vel.z - still.vel.z).toBeCloseTo(1, 9);
  });
});

describe('garis lintasan (traceThrow) = granat Rapier sungguhan', () => {
  it('nadeStep identik body Rapier di udara (90 langkah; Rapier: 4 sub-langkah gravitasi + redaman di akhir langkah)', () => {
    expect(physics.world.integrationParameters.numSolverIterations).toBe(RAPIER_SUBSTEPS);
    const p = v3(0, Y0 + 60, 0), v = v3(21, 14, -9), b = nadeBody(p, v), q = { ...p }, u = { ...v };
    let err = 0, errV = 0;
    for (let i = 0; i < 90; i++) {
      physics.world.step(); nadeStep(q, u, dt);
      err = Math.max(err, dist(b.translation(), q)); errV = Math.max(errV, dist(b.linvel(), u));
    }
    physics.world.removeRigidBody(b);
    expect(err).toBeLessThan(1e-3);
    expect(errV).toBeLessThan(1e-3);
  });

  it('lantai: titik lintasan = posisi body tiap langkah sampai benturan, body memantul di langkah benturan prediksi, cincin di permukaan', () => {
    const floor = box(v3(0, Y0 - 0.5, 0), v3(300, 0.5, 300));
    try {
      for (const [yaw, pitch] of [[0, 0], [1.1, -0.35], [-0.6, 0.5]]) {
        const { pos, vel } = launch({ yaw, pitch });
        const tr = traceThrow(pos, vel, GR.fuse, new ArcTrace());
        expect(tr.end).toBe('hit');
        expect(tr.contact.y).toBeCloseTo(Y0, 2);
        expect(tr.normal.y).toBeGreaterThan(0.999);
        expect(tr.endPoint(v3()).y).toBeCloseTo(Y0 + GR.radius, 2);
        const b = nadeBody(pos, vel);
        let err = 0, bounce = -1, vy = vel.y;
        for (let i = 1; i <= 200 && bounce < 0; i++) {
          physics.world.step();
          if (i < tr.n - 1) err = Math.max(err, dist(b.translation(), ptAt(tr, i)));
          const lv = b.linvel();
          if (lv.y > vy + 1) bounce = i;
          vy = lv.y;
        }
        physics.world.removeRigidBody(b);
        expect(err).toBeLessThan(2e-3);
        expect(Math.abs(bounce - Math.ceil(tr.t / dt))).toBeLessThanOrEqual(1);
      }
    } finally { drop(floor); }
  });

  it('dinding 10 u di depan: kena dinding (normal menghadap pelempar, kontak di bidang dinding)', () => {
    const floor = box(v3(0, Y0 - 0.5, 0), v3(300, 0.5, 300)), wall = box(v3(0, Y0 + 8, -10.5), v3(40, 8, 0.5));
    try {
      const { pos, vel } = launch({ pitch: 0 });
      const tr = traceThrow(pos, vel, GR.fuse, new ArcTrace());
      expect(tr.end).toBe('hit');
      expect(tr.contact.z).toBeCloseTo(-10, 2);
      expect(tr.normal.z).toBeGreaterThan(0.999);
      expect(tr.endPoint(v3()).z).toBeCloseTo(-10 + GR.radius, 2);
    } finally { drop(floor, wall); }
  });

  it('kapsul karakter diabaikan (CHAR), pembatas tak terlihat (BARRIER) & benda lepas (PROP) memantulkan', () => {
    const floor = box(v3(0, Y0 - 0.5, 0), v3(300, 0.5, 300));
    const ch = physics.world.createCollider(RAPIER.ColliderDesc.capsule(1.7, 0.8).setTranslation(0, Y0 + 4, -6).setCollisionGroups(GROUPS.CHAR));
    physics.world.step();
    try {
      const { pos, vel } = launch({ pitch: 0 });
      expect(traceThrow(pos, vel, GR.fuse, new ArcTrace()).contact.y).toBeCloseTo(Y0, 2);   // lewat kapsul → lantai
      for (const g of [GROUPS.BARRIER, GROUPS.PROP]) {
        const c = box(v3(0, Y0 + 5, -8), v3(5, 5, 0.3), g);
        const tr = traceThrow(pos, vel, GR.fuse, new ArcTrace());
        expect(tr.contact.z).toBeCloseTo(-7.7, 2);
        drop(c);
      }
      expect((ARC_GROUPS >>> 16) & 0xffff).toBe((GROUPS.GRENADE >>> 16) & 0xffff);
    } finally { drop(ch, floor); }
  });

  it('sumbu habis di udara → akhir "fuse" di langkah ⌈sisa/dt⌉ − 1 (granat meledak sebelum step tick itu)', () => {
    const { pos, vel } = launch({ pitch: 1.3 });
    const tr = traceThrow(pos, vel, 0.5, new ArcTrace());
    const steps = Math.ceil(0.5 / dt) - 1;
    expect(tr.end).toBe('fuse');
    expect(tr.n).toBe(steps + 1);
    const q = { ...pos }, u = { ...vel };
    for (let i = 0; i < steps; i++) nadeStep(q, u, dt);
    expect(dist(tr.endPoint(v3()), q)).toBeLessThan(1e-4);
    expect(tr.t).toBeCloseTo(steps * dt, 9);
  });

  it('jarak lempar baru di lantai datar (mata 4.4): lurus ±28 u (dulu 18), bidik lantai 20 u → ±16.5 (dulu 12.6), maks > 44 u (dulu 26)', () => {
    const floor = box(v3(0, Y0 - 0.5, 0), v3(300, 0.5, 300));
    try {
      const land = (pitch: number) => {
        const { pos, vel } = launch({ pitch });
        const tr = traceThrow(pos, vel, GR.fuse, new ArcTrace());
        return -tr.contact.z;
      };
      expect(land(0)).toBeGreaterThan(26); expect(land(0)).toBeLessThan(30);
      const aim20 = land(-Math.atan(4.4 / 20));
      expect(aim20).toBeGreaterThan(15.5); expect(aim20).toBeLessThan(18);
      let best = 0;
      for (let deg = 20; deg <= 45; deg += 1) best = Math.max(best, land(deg * D2R));
      expect(best).toBeGreaterThan(44); expect(best).toBeLessThan(52);
    } finally { drop(floor); }
  });

  it('rumus bidik balistik bot (TacticalBot.wantGrenade, v = overSpeed) tetap mendaratkan granat di dekat sasaran 8–32 u', () => {
    const floor = box(v3(0, Y0 - 0.5, 0), v3(300, 0.5, 300));
    try {
      const v = GR.overSpeed, g = -CFG.world.gravity, v2 = v * v, eyeY = Y0 + 4.4, errs: string[] = [];
      let worst = 0;
      for (const dx of [8, 14, 20, 26, 32]) {
        const dy = Y0 + 1.0 - (eyeY - GT.fpsDown);
        const disc = v2 * v2 - g * (g * dx * dx + 2 * dy * v2);
        expect(disc).toBeGreaterThan(0);
        const theta = Math.atan((v2 - Math.sqrt(disc)) / (g * dx));
        const { pos, vel } = launch({ pitch: theta - GR.overLiftDeg * D2R });
        const tr = traceThrow(pos, vel, GR.fuse, new ArcTrace());
        const e = -tr.contact.z - dx;
        errs.push(`${dx}: ${e.toFixed(2)}`);
        worst = Math.max(worst, Math.abs(e));
      }
      expect(worst, errs.join(' | ')).toBeLessThan(2.5);              // terukur: +1.4 / +1.8 / +1.6 / +1.0 / 0.0 u (sedikit lewat)
    } finally { drop(floor); }
  });
});

describe('flashbang: pelempar kena separuh', () => {
  it('pelempar × 0.5 (meledak di tangan tetap penuh); rekan/musuh di titik yang sama penuh', () => {
    expect(XCFG.flash.ownerMult).toBe(0.5);
    expect(ownerFlash(0.8, true, false)).toBeCloseTo(0.4, 9);
    expect(ownerFlash(0.8, true, true)).toBe(0.8);
    expect(ownerFlash(0.8, false, false)).toBe(0.8);
    // menatap flash 20 u di depan: orang lain buta total, pelempar hanya silau sebagian
    const s = flashStrength(v3(0, 4.4, 0), v3(0, 0, -1), v3(0, 4.4, -20), false);
    expect(flashExposure(s)!.peak).toBe(1);
    expect(flashExposure(ownerFlash(s, true, false))!.peak).toBeLessThan(1);
    // flash memantul balik ke muka (≤ 8 u, menatap): pelempar tetap buta total
    expect(flashExposure(ownerFlash(1, true, false))!.peak).toBe(1);
  });
});

describe('setelan garis lintasan', () => {
  it('nadeArc bawaan ON, tersimpan, nilai asing → bawaan', () => {
    expect(DEFAULTS.nadeArc).toBe(true);
    expect(validate(null).nadeArc).toBe(true);
    expect(validate({ nadeArc: false }).nadeArc).toBe(false);
    expect(validate({ nadeArc: 'x' as never }).nadeArc).toBe(true);
  });
});
