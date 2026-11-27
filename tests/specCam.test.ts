// tests/specCam.test.ts — kamera menonton rekan & badan yang disembunyikan saat kamera TPS menempel badan (laporan pengguna
// 2026-11-27: setelah mati, layar "menonton" hanya menampilkan pilar/pojok tanpa badan rekan). Logika murni specCam + uji nyata
// dengan collider Rapier Meridian Vault (CameraRig.armFree = sphere cast spring arm §9.2 yang sama dengan kamera).
import { beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { physics } from '../src/physics/Physics';
import { XCFG } from '../src/config/extraConfig';
import { CFG } from '../src/config/gameConfig';
import { CameraRig } from '../src/entities/CameraRig';
import { newSpecCam, resetSpecCam, stepSpecCam, type SpecCamCfg } from '../src/entities/specCam';
import { meridianColliders } from '../src/world/maps/meridian/colliders';
import { cuboidCollider, removeColliders } from '../src/world/maps/shared';

const S: SpecCamCfg = XCFG.camera.spectate;
const D = Math.PI / 180;
const FULL = 4.774;

describe('specCam — pemilihan sudut (murni)', () => {
  it('ruang bebas → tetap di belakang bahu (0), tanpa tampilan mata', () => {
    const s = newSpecCam();
    for (let i = 0; i < 30; i++) stepSpecCam(s, () => FULL, 1 / 60, S);
    expect(s).toEqual({ off: 0, eye: false, backT: 0 });
  });
  it('belakang terhalang → sudut pertama (selisih terkecil) yang lengannya ≥ want', () => {
    const s = newSpecCam();
    const free = (o: number) => (Math.abs(o) < 1e-6 ? 0.6 : Math.abs(o - 35 * D) < 1e-6 ? 1.1 : Math.abs(o + 35 * D) < 1e-6 ? 2.0 : 3.6);
    stepSpecCam(s, free, 1 / 60, S);
    expect(s.off).toBeCloseTo(70 * D, 9);        // 0 / +35 / −35 di bawah want, +70 bebas
    expect(s.eye).toBe(false);
  });
  it('histeresis: sudut sekarang dipertahankan selama lengan ≥ keep walau ada sudut lain yang lebih panjang', () => {
    const s = newSpecCam(); s.off = 70 * D;
    stepSpecCam(s, (o) => (Math.abs(o - 70 * D) < 1e-6 ? S.keep + 0.05 : Math.abs(o) < 1e-6 ? 1.0 : FULL), 1 / 60, S);
    expect(s.off).toBeCloseTo(70 * D, 9);
  });
  it('kembali ke belakang rekan hanya setelah arah 0 bebas terus-menerus selama backAfter', () => {
    const s = newSpecCam(); s.off = -110 * D;
    const step = (free0: number, dt: number) => stepSpecCam(s, (o) => (Math.abs(o) < 1e-6 ? free0 : FULL), dt, S);
    step(FULL, S.backAfter * 0.6);
    expect(s.off).toBeCloseTo(-110 * D, 9);       // belum cukup lama
    step(1.0, 1 / 60);                             // terhalang lagi → hitungan ulang
    step(FULL, S.backAfter * 0.6);
    expect(s.off).toBeCloseTo(-110 * D, 9);
    step(FULL, S.backAfter * 0.6);
    expect(s.off).toBe(0);
  });
  it('semua arah sempit → tampilan mata; bertahan sampai ada arah ≥ want (bukan sekadar ≥ eye)', () => {
    const s = newSpecCam();
    stepSpecCam(s, () => 0.6, 1 / 60, S);
    expect(s.eye).toBe(true);
    stepSpecCam(s, () => (S.eye + S.want) / 2, 1 / 60, S);
    expect(s.eye).toBe(true);
    stepSpecCam(s, (o) => (Math.abs(o + 35 * D) < 1e-6 ? S.want + 0.1 : 0.6), 1 / 60, S);
    expect(s.eye).toBe(false);
    expect(s.off).toBeCloseTo(-35 * D, 9);
  });
  it('tak ada arah ≥ want tapi ada ≥ eye → sudut terpanjang; dua sudut setara tidak berkedip (bonus sudut sekarang)', () => {
    const s = newSpecCam();
    let a = 1.8, b = 1.7;
    const free = (o: number) => (Math.abs(o - 110 * D) < 1e-6 ? a : Math.abs(o + 110 * D) < 1e-6 ? b : 0.8);
    stepSpecCam(s, free, 1 / 60, S);
    expect(s.off).toBeCloseTo(110 * D, 9);
    a = 1.7; b = 1.8;                               // selisih kecil (< stayBonus) → tetap
    stepSpecCam(s, free, 1 / 60, S);
    expect(s.off).toBeCloseTo(110 * D, 9);
    a = 1.3; b = 2.2;                               // jelas lebih baik → pindah
    stepSpecCam(s, free, 1 / 60, S);
    expect(s.off).toBeCloseTo(-110 * D, 9);
    resetSpecCam(s);
    expect(s).toEqual({ off: 0, eye: false, backT: 0 });
  });
});

describe('specCam — collider Rapier Meridian Vault', () => {
  let cols: ReturnType<typeof meridianColliders>;
  const rig = new CameraRig();
  const cam = new THREE.PerspectiveCamera(75, 16 / 9, 0.05, 300);
  const feet = new THREE.Vector3();
  beforeAll(async () => {
    await physics.init();
    cols = meridianColliders();
    physics.world.step();
    return () => removeColliders(cols);
  });
  /** Jalankan pemilih seperti Game.spectate (rekan diam) → keadaan akhir + panjang lengan sudut terpilih. */
  const settle = (x: number, z: number, yaw: number) => {
    feet.set(x, 0, z);
    const s = newSpecCam();
    const free = (o: number) => rig.armFree(feet, 0, yaw + o, 0);
    for (let i = 0; i < 20; i++) stepSpecCam(s, free, 1 / 60, S);
    return { s, arm: s.eye ? 0 : free(s.off), behind: free(0) };
  };

  it('rekan membelakangi pilar Atrium B / dinding Barat / pilar West Long: lengan biasa jatuh ke 0.6 u → kamera pindah ke sudut bebas ≥ 2.6 u', () => {
    for (const [x, z, yaw, name] of [[30, 29.9, Math.PI, 'pilar B'], [20.9, 34, -Math.PI / 2, 'dinding B'], [-62, -27.65, Math.PI, 'pilar WL']] as const) {
      const r = settle(x, z, yaw);
      expect(r.behind, name).toBeLessThanOrEqual(CFG.camera.springMinDist + 0.05);   // bug lama: kamera di dalam badan
      expect(r.s.eye, name).toBe(false);
      expect(r.s.off, name).not.toBe(0);
      expect(r.arm, name).toBeGreaterThanOrEqual(S.want);
    }
  });
  it('ruang bebas (tengah Atrium B): tetap di belakang bahu dengan lengan penuh', () => {
    const r = settle(34, 19, Math.PI);
    expect(r.s.off).toBe(0);
    expect(r.arm).toBeCloseTo(FULL, 2);
  });
  it('lemari sempit (semua arah < 1.2 u) → tampilan mata', () => {
    // ruang 2 × 2 u berplafon 4.6 jauh di luar map: dinding 1 u dari pusat ke segala arah
    const box = [
      cuboidCollider([498, 0, 498], [499, 6, 502]), cuboidCollider([501, 0, 498], [502, 6, 502]),
      cuboidCollider([499, 0, 498], [501, 6, 499]), cuboidCollider([499, 0, 501], [501, 6, 502]),
      cuboidCollider([498, 4.6, 498], [502, 5.6, 502]),
    ];
    physics.world.step();
    try {
      const r = settle(500, 500, 0);
      expect(r.s.eye).toBe(true);
    } finally { removeColliders(box); physics.world.step(); }
  });
  it('CameraRig.nearBody: TPS dengan lengan < hideBodyDist (punggung menempel pilar) → true; ruang bebas / FPS → false', () => {
    rig.mode = 'tps'; rig.yaw = Math.PI; rig.pitch = 0;
    for (let i = 0; i < 4; i++) rig.update(0.1, feet.set(30, 0, 29.9), 4.4, 0, 1, cam);
    expect(rig.nearBody).toBe(true);
    for (let i = 0; i < 12; i++) rig.update(0.1, feet.set(34, 0, 19), 4.4, 0, 1, cam);   // lengan memanjang 8 u/s
    expect(rig.nearBody).toBe(false);
    rig.mode = 'fps';
    for (let i = 0; i < 4; i++) rig.update(0.1, feet.set(30, 0, 29.9), 4.4, 0, 1, cam);
    expect(rig.nearBody).toBe(false);
  });
});
