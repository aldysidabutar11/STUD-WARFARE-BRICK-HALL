// tests/botAim.test.ts — model bidik & reaksi bot manusiawi (src/entities/botAim.ts, murni) + callout antar-bot (BotDirector).
import { describe, expect, it } from 'vitest';
import {
  estimateSource, minJerk, newAimState, reactionTime, segPointDist2, stepAim, wrapAngle, type AimParams,
} from '../src/entities/botAim';
import { XCFG } from '../src/config/extraConfig';
import { BotDirector } from '../src/game/BotDirector';
import { NavGraph } from '../src/world/NavGraph';
import { SY_NAV } from '../src/world/maps/steelyard/nav';
import type { Entity } from '../src/entities/Entity';
import * as THREE from 'three';

const D = Math.PI / 180;
/** RNG deterministik (mulberry32). */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const A = XCFG.bots.human.aim;
const params = (over: number, turnDeg = 400): AimParams => ({
  maxSpeed: turnDeg * D, flickMin: A.flickMinDeg * D, trackGain: A.trackGain, trackFeed: A.trackFeed, overshootChance: over,
  overshoot: [0.1, 0.1], undershoot: 0, scatter: 0, minFlickT: A.minFlickT,
});
const DT = 1 / 120;

/** Jalankan bidikan menuju tujuan tetap selama `sec` detik; kembalikan kecepatan yaw per langkah & yaw tiap langkah. */
function run(p: AimParams, desY: (t: number) => number, sec: number, y0 = 0, seed = 1) {
  const s = newAimState(y0, 0), r = rng(seed), speeds: number[] = [], yaws: number[] = [];
  let prev = y0;
  for (let i = 0; i * DT < sec; i++) {
    stepAim(s, DT, desY(i * DT), 0, p, r);
    speeds.push(wrapAngle(s.yaw - prev) / DT); yaws.push(s.yaw); prev = s.yaw;
  }
  return { s, speeds, yaws };
}

describe('botAim — gerak bidik manusiawi', () => {
  it('sentakan minimum-jerk: mulai pelan, puncak di tengah ≈ turn rate GDD, melambat, berhenti tepat (bukan turret)', () => {
    const p = params(0), target = 60 * D;
    const { s, speeds } = run(p, () => target, 0.6);
    const peak = Math.max(...speeds), iPeak = speeds.indexOf(peak);
    const T = 1.875 * target / p.maxSpeed;                       // ±0.28 s untuk 60° di Normal (400°/s)
    expect(peak).toBeLessThanOrEqual(p.maxSpeed * 1.01);
    expect(peak).toBeGreaterThan(p.maxSpeed * 0.9);
    expect(speeds[0]).toBeLessThan(peak * 0.05);                 // tidak langsung kecepatan penuh
    expect(iPeak * DT).toBeGreaterThan(T * 0.35);
    expect(iPeak * DT).toBeLessThan(T * 0.65);
    const iEnd = Math.round(T / DT) - 2;
    expect(speeds[iEnd]).toBeLessThan(peak * 0.1);               // melambat menjelang target
    expect(Math.abs(s.yaw - target)).toBeLessThan(0.3 * D);
    expect(minJerk(0)).toBe(0); expect(minJerk(1)).toBeCloseTo(1, 12); expect(minJerk(0.5)).toBeCloseTo(0.5, 12);
  });

  it('kelewatan (overshoot) lalu dikoreksi kembali ke target', () => {
    const target = 50 * D;
    const { s, yaws } = run(params(1), () => target, 1.0);
    expect(Math.max(...yaws)).toBeGreaterThan(target + 3 * D);  // 10% dari 50° = 5° kelewatan
    expect(Math.abs(s.yaw - target)).toBeLessThan(0.3 * D);
  });

  it('galat kecil (< flickMin) dikejar halus tanpa sentakan; target bergerak 30°/s dilacak dengan galat tunak < 1°', () => {
    const small = run(params(0), () => 4 * D, 0.5);
    expect(small.s.flicking).toBe(false);
    expect(Math.max(...small.speeds)).toBeLessThan(60 * D);      // jauh di bawah kecepatan sentakan
    expect(Math.abs(small.s.yaw - 4 * D)).toBeLessThan(0.1 * D);
    const moving = run(params(0), t => 30 * D * t, 2.0);
    const last = moving.yaws[moving.yaws.length - 1], want = 30 * D * (moving.yaws.length - 1) * DT;
    expect(Math.abs(last - want)).toBeLessThan(1 * D);
  });

  it('tujuan melompat di tengah sentakan (ganti target / titik pandang) → direncanakan ulang tanpa loncatan bidikan', () => {
    const p = params(0);
    for (const jump of [5, 12, 30, -40]) {
      const { s, speeds } = run(p, t => (t < 0.12 ? 60 : 60 + jump) * D, 0.9);
      expect(Math.max(...speeds.map(Math.abs))).toBeLessThanOrEqual(p.maxSpeed * 1.02);
      expect(Math.abs(s.yaw - (60 + jump) * D)).toBeLessThan(0.3 * D);
    }
  });

  it('melintasi ±180° lewat jalur terpendek', () => {
    const { s, speeds } = run(params(0), () => -170 * D, 0.5, 170 * D);
    const travelled = speeds.reduce((a, v) => a + Math.abs(v) * DT, 0);
    expect(travelled).toBeLessThan(22 * D);
    expect(Math.abs(wrapAngle(s.yaw + 170 * D))).toBeLessThan(0.3 * D);
  });

  it('kecepatan puncak mengikuti turn rate tiap kesulitan (Mudah 240 / Normal 400 / Sulit 600 °/s)', () => {
    for (const k of ['easy', 'normal', 'hard'] as const) {
      const turn = XCFG.bots.difficulty[k].turnRate, p = params(0, turn);
      const peak = Math.max(...run(p, () => 80 * D, 1.0).speeds);
      expect(peak / D).toBeLessThanOrEqual(turn * 1.01);
      expect(peak / D).toBeGreaterThan(turn * 0.9);
    }
  });
});

describe('botAim — waktu reaksi', () => {
  const R = XCFG.bots.human.react;
  const base = XCFG.bots.difficulty.normal.reaction;
  const neutral = { base, u: 0.5, offAxis: 0, outsideFov: false, farness: 0, alerted: false, prepared: false };

  it('situasi netral: rata-rata = nilai GDD (jitter seragam 0.8–1.2)', () => {
    let sum = 0;
    for (let i = 0; i < 101; i++) sum += reactionTime({ ...neutral, u: i / 100 }, R);
    expect(sum / 101).toBeCloseTo(base, 3);
  });

  it('pinggir pandangan / di luar FOV / jauh lebih lambat; waspada & sudah membidik lebih cepat; dibatasi clamp', () => {
    const n = reactionTime(neutral, R);
    expect(reactionTime({ ...neutral, offAxis: 1 }, R)).toBeCloseTo(n * (1 + R.periph), 6);
    expect(reactionTime({ ...neutral, outsideFov: true }, R)).toBeCloseTo(n * R.outsideFov, 6);
    expect(reactionTime({ ...neutral, farness: 1 }, R)).toBeCloseTo(n * (1 + R.far), 6);
    expect(reactionTime({ ...neutral, alerted: true }, R)).toBeCloseTo(n * R.alerted, 6);
    expect(reactionTime({ ...neutral, prepared: true, alerted: true, u: 0 }, R)).toBeCloseTo(base * R.clamp[0], 6);
    expect(reactionTime({ ...neutral, u: 1, outsideFov: true, farness: 1 }, R)).toBeCloseTo(base * R.clamp[1], 6);
  });
});

describe('botAim — geometri indra', () => {
  it('segPointDist2: jarak titik ke segmen (ujung & tengah)', () => {
    expect(segPointDist2(0, 0, 0, 10, 0, 0, 5, 1, 0)).toBeCloseTo(1, 9);
    expect(segPointDist2(0, 0, 0, 10, 0, 0, -3, 4, 0)).toBeCloseTo(25, 9);     // sebelum A → jarak ke A
    expect(segPointDist2(0, 0, 0, 10, 0, 0, 13, 0, 4)).toBeCloseTo(25, 9);     // setelah B → jarak ke B
    expect(segPointDist2(1, 1, 1, 1, 1, 1, 1, 2, 1)).toBeCloseTo(1, 9);        // segmen nol
  });

  it('estimateSource: hanya arah kira-kira (± noise sudut, jarak × rentang), bukan posisi persis', () => {
    const r = rng(7), out = { x: 0, z: 0 }, noise = 20 * D;
    let exact = 0;
    for (let i = 0; i < 200; i++) {
      estimateSource(0, 0, 30, 0, noise, 0.7, 1.3, r, out);
      const a = Math.atan2(out.z, out.x), d = Math.hypot(out.x, out.z);
      expect(Math.abs(a)).toBeLessThanOrEqual(noise + 1e-9);
      expect(d).toBeGreaterThanOrEqual(30 * 0.7 - 1e-9); expect(d).toBeLessThanOrEqual(30 * 1.3 + 1e-9);
      if (Math.hypot(out.x - 30, out.z) < 0.5) exact++;
    }
    expect(exact).toBeLessThan(10);
  });
});

describe('BotDirector — callout antar-bot', () => {
  const nav = new NavGraph(SY_NAV);
  type Got = { x: number; z: number; node: number };
  function mate(id: number, x: number, z: number, free = true) {
    const got: Got[] = [];
    const e = { id, team: 'blue', alive: true, pos: new THREE.Vector3(x, 0, z),
      bot: { hum: XCFG.bots.human.diff.normal, canRespond: () => free, onCallout: (cx: number, _y: number, cz: number, node: number) => got.push({ x: cx, z: cz, node }) },
    } as unknown as Entity;
    return { e, got };
  }

  it('sampai setelah jeda; ≤ 2 responden terdekat yang bebas, responden kedua ke node lain (tidak menumpuk); lainnya hanya waspada', () => {
    const d = new BotDirector('blue');
    const spotter = mate(1, 0, -40), enemy = { id: 9, pos: new THREE.Vector3(0, 0, 10) } as unknown as Entity;
    const near = mate(2, 5, 0), mid = mate(3, -8, -5), busy = mate(4, 2, 4, false), far = mate(5, 30, 30), out = mate(6, 0, -60);
    const ents = [spotter.e, near.e, mid.e, busy.e, far.e, out.e];
    d.callout(spotter.e, enemy, 10, 1.0);
    d.callout(spotter.e, enemy, 10.5, 1.0);                       // dibatasi: 1 laporan per musuh tiap 2 s
    d.deliver(10.9, ents, nav);
    expect(near.got.length + mid.got.length).toBe(0);             // belum jatuh tempo
    d.deliver(11.0, ents, nav);
    expect(spotter.got).toHaveLength(0);                          // pelapor tidak menerima laporannya sendiri
    expect(near.got).toHaveLength(1); expect(mid.got).toHaveLength(1); expect(busy.got).toHaveLength(1);
    expect(out.got).toHaveLength(0);                              // di luar jangkauan callout (45 u)
    const resp = [near, mid, busy, far].filter(m => m.got[0]?.node >= 0);
    expect(resp.map(m => m.e.id).sort()).toEqual([2, 3]);         // 2 terdekat yang bebas (yang sibuk dilewati)
    expect(busy.got[0].node).toBe(-1);
    const n1 = nav.nodes[near.got[0].node], n2 = nav.nodes[mid.got[0].node];
    expect(Math.hypot(n1.x - n2.x, n1.z - n2.z)).toBeGreaterThanOrEqual(XCFG.bots.human.callout.altMin);
    expect(Math.hypot(near.got[0].x - 0, near.got[0].z - 10)).toBeLessThanOrEqual(XCFG.bots.human.callout.noise * Math.SQRT2 + 1e-9);
    d.deliver(20, ents, nav);
    expect(near.got).toHaveLength(1);                             // terkirim sekali saja
  });
});
