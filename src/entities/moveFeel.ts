// src/entities/moveFeel.ts — nilai "rasa gerak" yang bisa diubah langsung saat main (panel debug `), awalnya dari config.
import { CFG } from '../config/gameConfig';

export const moveFeel = {
  /** Tempo gerak T (= CFG.player.moveSpeedScale): kecepatan ×T, gravitasi karakter ×T², lompat ×T, akselerasi udara ×T². */
  tempo: CFG.player.moveSpeedScale as number,
  /** Pengali uji coba (1 = nilai XCFG.feel). */
  bob: 1, tilt: 1, sprintFov: 1, inertia: 1,
};

export function resetMoveFeel() {
  moveFeel.tempo = CFG.player.moveSpeedScale; moveFeel.bob = 1; moveFeel.tilt = 1; moveFeel.sprintFov = 1; moveFeel.inertia = 1;
}

/**
 * Gravitasi karakter (negatif) untuk tempo T: g_dunia·T². Bersama lompat ×T dan kecepatan ×T, lintasan di ruang
 * identik dengan GDD (puncak 1.383, jarak lompat/jatuh sama) — hanya waktunya ÷T. Granat/buku tetap g_dunia.
 */
export const charGravity = (t: number = moveFeel.tempo) => CFG.world.gravity * t * t;

/** Peredam eksponensial (frame-rate independent): mendekati b dengan laju k (1/s). */
export const damp = (a: number, b: number, k: number, dt: number) => b + (a - b) * Math.exp(-k * dt);

/** Pegas teredam 1-D (kurang-teredam, zeta < 1) dengan solusi analitik per langkah: eksak & stabil untuk dt berapa pun. */
export class Spring {
  x = 0; v = 0;
  constructor(public omega: number, public zeta: number) {}
  private get z() { return Math.min(0.999, Math.max(0.001, this.zeta)); }
  /** Kecepatan awal yang menghasilkan simpangan puncak `amp` dari diam (untuk impuls "hentakan"). */
  impulseFor(amp: number) {
    const w = this.omega, z = this.z, wd = w * Math.sqrt(1 - z * z);
    const tp = Math.atan2(Math.sqrt(1 - z * z), z) / wd;
    return amp / (Math.exp(-z * w * tp) * Math.sin(wd * tp) / wd);
  }
  kick(amp: number) { this.v += this.impulseFor(amp); }
  /** Maju dt detik menuju `target` (dianggap konstan selama langkah). */
  update(dt: number, target = 0) {
    const w = this.omega, z = this.z, wd = w * Math.sqrt(1 - z * z);
    const A = this.x - target, B = (this.v + z * w * A) / wd;
    const e = Math.exp(-z * w * dt), c = Math.cos(wd * dt), s = Math.sin(wd * dt);
    const p = A * c + B * s;
    this.x = target + e * p;
    this.v = e * (-z * w * p + wd * (B * c - A * s));
    return this.x;
  }
  reset() { this.x = 0; this.v = 0; }
}
