// tests/smoothness.test.ts — kehalusan frame (laporan pengguna: "FPS 60–80 tapi tidak terasa 60–80"):
// taksiran refresh & % frame tepat waktu, interpolasi benda fisika 60 Hz ke frame render, material viewmodel terpisah.
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { FramePacing } from '../src/core/FramePacing';
import { BodyLerp } from '../src/core/BodyLerp';
import {
  OPTIC_GLASS_MATERIAL, VM_OPTIC_GLASS_MATERIAL, VM_WEAPON_MATERIAL, WEAPON_MATERIAL, createOpticMesh,
} from '../src/combat/WeaponModels';
import { makeRng } from '../src/core/Rng';
import { DynResController, type DynResSample } from '../src/core/DynamicResolution';
import { capSkips } from '../src/core/GameLoop';
import { validate } from '../src/ui/Settings';
import { CFG } from '../src/config/gameConfig';

const R90 = 1000 / 90, R60 = 1000 / 60;

describe('FramePacing', () => {
  it('layar 90 Hz stabil → refresh ±11.1 ms, 100% tepat waktu', () => {
    const p = new FramePacing(), rng = makeRng(1);
    for (let i = 0; i < 300; i++) p.push(R90 + (rng() - 0.5) * 0.6, true);
    expect(Math.abs(p.refreshMs - R90)).toBeLessThan(0.08);         // bukan p10 (bias ke bawah oleh jitter)
    expect(p.onTimeFrac()).toBe(1);
  });
  it('judder: 30% frame telat 1 vsync → refresh tetap 11.1 ms, tepat waktu ±70%, FPS rata-rata ±69', () => {
    const p = new FramePacing(), rng = makeRng(2);
    for (let i = 0; i < 300; i++) p.push(rng() < 0.3 ? 2 * R90 : R90, true);
    expect(p.refreshMs).toBeCloseTo(R90, 1);
    expect(p.onTimeFrac()).toBeGreaterThan(0.6);
    expect(p.onTimeFrac()).toBeLessThan(0.8);
    const fps = 1000 / p.avg();
    expect(fps).toBeGreaterThan(62); expect(fps).toBeLessThan(76);   // "FPS 60–80" yang dilaporkan pengguna
  });
  it('layar 60 Hz → refresh 16.7 ms', () => {
    const p = new FramePacing();
    for (let i = 0; i < 120; i++) p.push(R60, true);
    expect(p.refreshMs).toBeCloseTo(R60, 1);
  });
  it('sampel rusak (≤ 0, NaN, > 1 s tab tersembunyi) diabaikan; at() urut terlama → terbaru', () => {
    const p = new FramePacing();
    p.push(0); p.push(-5); p.push(NaN); p.push(5000);
    expect(p.count).toBe(0);
    p.push(10); p.push(20); p.push(30);
    expect([p.at(0), p.at(1), p.at(2)]).toEqual([10, 20, 30]);
    for (let i = 0; i < 300; i++) p.push(i);       // melewati kapasitas ring (240)
    expect(p.at(p.count - 1)).toBe(299);
    expect(p.at(0)).toBe(300 - p.count);
  });
});

describe('BodyLerp (benda fisika 60 Hz di layar > 60 Hz)', () => {
  const body = (x: number, y: number, z: number, q = new THREE.Quaternion()) =>
    ({ translation: () => ({ x, y, z }), rotation: () => ({ x: q.x, y: q.y, z: q.z, w: q.w }) }) as never;

  it('render di antara step sebelumnya dan sekarang (alpha), bukan loncat per step', () => {
    const l = new BodyLerp().snap(body(0, 0, 0));
    const q1 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
    l.step(body(2, 4, -6, q1));
    const o = new THREE.Object3D();
    l.apply(o, 0); expect(o.position.toArray()).toEqual([0, 0, 0]);
    l.apply(o, 0.5); expect(o.position.x).toBeCloseTo(1); expect(o.position.y).toBeCloseTo(2); expect(o.position.z).toBeCloseTo(-3);
    expect(o.quaternion.angleTo(new THREE.Quaternion())).toBeCloseTo(Math.PI / 4, 5);
    l.apply(o, 1); expect(o.position.toArray()).toEqual([2, 4, -6]);
    expect(l.pos.toArray()).toEqual([2, 4, -6]);
  });
  it('3 frame render per 2 step (90 Hz vs 60 Hz): benda bergerak di SETIAP frame', () => {
    // granat 12 u/s: posisi per step 0.2 u; frame render pada t = 0, 1/90, 2/90, ... → harus naik monoton tiap frame
    const STEP = 1 / 60, l = new BodyLerp().snap(body(0, 0, 0)), o = new THREE.Object3D();
    let acc = 0, x = 0, last = -1;
    for (let f = 0; f < 30; f++) {
      acc += 1 / 90;
      while (acc >= STEP) { acc -= STEP; x += 12 * STEP; l.step(body(x, 0, 0)); }
      l.apply(o, acc / STEP);
      if (f > 0) expect(o.position.x).toBeGreaterThan(last + 1e-6);
      last = o.position.x;
    }
  });
  it('snapTo (spawn/teleport/reset) tidak meluncur dari posisi lama', () => {
    const l = new BodyLerp().snap(body(5, 5, 5)), o = new THREE.Object3D();
    l.snapTo(new THREE.Vector3(1, 2, 3), new THREE.Quaternion());
    l.apply(o, 0.3);
    expect(o.position.toArray()).toEqual([1, 2, 3]);
  });
});

describe('Material viewmodel terpisah dari dunia (tanpa ganti program shader tiap frame)', () => {
  it('optik viewmodel memakai salinan; kaca tetap bening, tanpa depthWrite', () => {
    const world = createOpticMesh('reddot')!, vm = createOpticMesh('reddot', true)!;
    expect(world.material).toBe(WEAPON_MATERIAL);
    expect(vm.material).toBe(VM_WEAPON_MATERIAL);
    const g = vm.getObjectByName('opticGlass') as THREE.Mesh;
    expect(g.material).toBe(VM_OPTIC_GLASS_MATERIAL);
    expect(VM_OPTIC_GLASS_MATERIAL).not.toBe(OPTIC_GLASS_MATERIAL);
    expect(VM_OPTIC_GLASS_MATERIAL.transparent).toBe(true);
    expect(VM_OPTIC_GLASS_MATERIAL.opacity).toBe(OPTIC_GLASS_MATERIAL.opacity);
    expect(VM_OPTIC_GLASS_MATERIAL.depthWrite).toBe(false);
  });
  it('salinan senjata = sifat PBR sama', () => {
    expect(VM_WEAPON_MATERIAL).not.toBe(WEAPON_MATERIAL);
    expect(VM_WEAPON_MATERIAL.roughness).toBe(WEAPON_MATERIAL.roughness);
    expect(VM_WEAPON_MATERIAL.metalness).toBe(WEAPON_MATERIAL.metalness);
    expect(VM_WEAPON_MATERIAL.vertexColors).toBe(true);
  });
});

describe('Batas FPS rata (pembagi refresh)', () => {
  it('½ di layar 90 Hz: frame dijalankan tiap 2 vsync (22.2 ms), tahan jitter; vsync yang hilang tidak menggeser jadwal', () => {
    const rng = makeRng(5), iv: number[] = [];
    let last = 0, t = 0;
    for (let k = 1; k <= 400; k++) {
      t = k * R90 + (rng() - 0.5) * 0.8;
      if (k === 201) continue;                                    // satu vsync tanpa callback (browser sibuk)
      if (!capSkips(t - last, R90, 2)) { iv.push(t - last); last = t; }
    }
    const even = iv.filter(x => Math.abs(x - 2 * R90) < 1.5).length;
    expect(even / iv.length).toBeGreaterThan(0.98);
    expect(Math.max(...iv)).toBeLessThan(3.6 * R90);
  });
  it('⅓ → tiap 3 vsync; div 1 → tidak pernah melewati', () => {
    let last = 0, n = 0;
    for (let k = 1; k <= 300; k++) { const t = k * R90; if (!capSkips(t - last, R90, 3)) { n++; last = t; } }
    expect(n).toBe(100);
    expect(capSkips(1, R90, 1)).toBe(false);
  });
  it('FramePacing: refresh dari tick (bukan frame yang dibatasi); tepat waktu relatif ke target', () => {
    const p = new FramePacing();
    p.div = 2;
    for (let i = 0; i < 300; i++) { p.tick(R90); if (i % 2) p.push(2 * R90); }
    expect(p.refreshMs).toBeCloseTo(R90, 1);
    expect(p.targetMs).toBeCloseTo(2 * R90, 1);
    expect(p.onTimeFrac()).toBe(1);
    for (let i = 0; i < 10; i++) p.push(3 * R90);                // 10 frame telat 1 vsync
    expect(p.lateFrac(20)).toBeCloseTo(0.5, 5);
  });
  it('setelan: fpsCap hanya 1/2/3 (selain itu → ikut layar)', () => {
    expect(validate({ fpsCap: 2 } as never).fpsCap).toBe(2);
    expect(validate({ fpsCap: 5 } as never).fpsCap).toBe(1);
    expect(validate(null).fpsCap).toBe(1);
  });
});

describe('Resolusi dinamis sadar refresh (GDD §2.3, disetujui pengguna)', () => {
  const DR = CFG.render.dynRes;
  /** Simulasi: biaya GPU ∝ piksel (c ms di skala 1) + CPU 3 ms berurutan; frame telat bila CPU + GPU > 98% target. */
  function run(opts: { c: number; target: number; timer: boolean; secs: number; start?: number; cpuLate?: number }) {
    const ctrl = new DynResController((s) => 1.125 * s);
    ctrl.scale = opts.start ?? 1;
    const dt = 1 / 90, steps = Math.round(opts.secs / dt), changes: { t: number; s: number }[] = [];
    const timeAt = new Map<number, number>();
    for (let i = 0; i < steps; i++) {
      const gpu = opts.c * ctrl.scale * ctrl.scale;
      const late = opts.cpuLate ?? (3 + gpu > opts.target * 0.98 ? 0.25 : 0);
      const sample: DynResSample = { dt, targetMs: opts.target, lateFrac: late, gpuMs: opts.timer ? gpu : null, cpuMs: 3 };
      if (ctrl.update(sample)) changes.push({ t: i * dt, s: ctrl.scale });
      timeAt.set(ctrl.scale, (timeAt.get(ctrl.scale) ?? 0) + dt);
    }
    return { scale: ctrl.scale, changes, timeAt };
  }

  it('90 Hz + timer GPU: HIGH (16 ms di skala 1) turun ke skala tertinggi yang muat lalu DIAM (tanpa bolak-balik)', () => {
    const r = run({ c: 16, target: R90, timer: true, secs: 120 });
    expect(r.scale).toBe(0.7);                                     // 3 + 16 × 0.49 = 10.8 ms ≤ 11.1
    expect(r.changes.length).toBe(3);                              // 1.0 → 0.9 → 0.8 → 0.7, lalu stabil
    for (let i = 1; i < r.changes.length; i++) expect(r.changes[i].t - r.changes[i - 1].t).toBeGreaterThanOrEqual(DR.cooldown - 1e-6);
  });
  it('tanpa timer GPU: mencoba naik dengan backoff berlipat — jarang di level yang terlalu berat', () => {
    const r = run({ c: 16, target: R90, timer: false, secs: 180 });
    expect(r.scale).toBe(0.7);
    expect(r.changes.length).toBeLessThanOrEqual(11);
    expect((r.timeAt.get(0.8) ?? 0) / 180).toBeLessThan(0.08);     // waktu di level yang judder < 8%
  });
  it('frame telat karena CPU (GPU ringan) → resolusi TIDAK diturunkan', () => {
    const r = run({ c: 4, target: R90, timer: true, secs: 30, cpuLate: 0.2 });
    expect(r.scale).toBe(1);
    expect(r.changes.length).toBe(0);
  });
  it('batas ½ (target 22.2 ms): naik kembali ke skala penuh bila muat', () => {
    const r = run({ c: 16, target: 2 * R90, timer: true, secs: 60, start: 0.7 });
    expect(r.scale).toBe(1);
  });
  it('batas GDD tetap: min 0.6, max 1.0, langkah 0.1', () => {
    const heavy = run({ c: 80, target: R90, timer: true, secs: 60 });
    expect(heavy.scale).toBe(DR.min);
    const light = run({ c: 2, target: R90, timer: true, secs: 60, start: 0.6 });
    expect(light.scale).toBe(DR.max);
    for (const r of [heavy, light]) {
      let prev = r === heavy ? 1 : 0.6;
      for (const c of r.changes) { expect(Math.abs(Math.abs(c.s - prev) - DR.step)).toBeLessThan(1e-9); prev = c.s; }
    }
  });
  it('layar 60 Hz: MEDIUM ringan tetap penuh; berat turun seperti GDD', () => {
    expect(run({ c: 9, target: R60, timer: true, secs: 30 }).scale).toBe(1);
    expect(run({ c: 24, target: R60, timer: true, secs: 60 }).scale).toBeLessThan(1);
  });
});
