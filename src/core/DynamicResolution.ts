// src/core/DynamicResolution.ts — skala resolusi internal adaptif (GDD §2.3), sadar refresh layar (disetujui pengguna).
// GDD: turun bila rata-rata frame > 17.5 ms, naik bila < 13 ms selama 4 s → dirancang untuk layar 60 Hz. Di layar 90 Hz game
// diam di 60–80 FPS dengan frame berselang-seling 11/22 ms (judder) karena 14 ms "masih di bawah 17.5". Dan di layar mana pun
// yang ber-vsync, rata-rata tidak pernah < interval vsync → GDD tidak pernah naik lagi setelah turun.
// Kini: target = interval vsync × batas FPS (FramePacing), turun bila > 5% frame telat ≥ 1 vsync DAN GPU memang berat
// (GpuTimer), naik bila prediksi CPU + GPU di skala berikutnya muat selama 4 s. Tanpa timer GPU: turun karena frame
// telat, naik dengan "mencoba" + backoff. Nilai GDD tetap: min 0.6, max 1.0, langkah 0.1, jeda 2 s antar-perubahan.
import type * as THREE from 'three';
import { CFG, type Preset } from '../config/gameConfig';
import { XCFG } from '../config/extraConfig';
import type { FramePacing } from './FramePacing';
import type { GpuTimer } from './GpuTimer';

const R = CFG.render.dynRes, P = XCFG.pacing;

/** Satu pengamatan untuk keputusan resolusi. */
export interface DynResSample {
  /** Detik sejak pengamatan sebelumnya. */
  dt: number;
  /** Interval frame yang dituju (ms): refresh × batas FPS. */
  targetMs: number;
  /** Pecahan frame ±1 s terakhir yang telat ≥ 1 vsync. */
  lateFrac: number;
  /** p90 waktu GPU (ms) jendela terakhir; null = timer GPU tidak tersedia. */
  gpuMs: number | null;
  /** Median waktu CPU per frame (ms). */
  cpuMs: number;
}

/** Logika keputusan murni (diuji tanpa WebGL). pixelRatioAt(skala) → pixel ratio efektif (untuk prediksi biaya ∝ piksel). */
export class DynResController {
  scale = 1.0;
  private t = 0;
  private sinceChange = 1e9;
  private goodTime = 0;
  private lastUpAt = -1e9;
  private lastWasUp = false;
  private ceiling = Infinity;       // skala yang terbukti terlalu berat (turun lagi segera setelah naik)
  private ceilingUntil = 0;
  private backoff: number = P.backoff.start;

  constructor(private readonly pixelRatioAt: (scale: number) => number) {}

  /** true bila skala berubah. */
  update(s: DynResSample): boolean {
    this.t += s.dt; this.sinceChange += s.dt;
    // kenaikan terakhir bertahan lama → level itu memang kuat: lupakan kegagalan lama
    if (this.lastWasUp && this.t - this.lastUpAt > P.backoff.reset) this.backoff = P.backoff.start;
    this.goodTime = s.lateFrac <= P.lateGood ? this.goodTime + s.dt : 0;
    if (this.sinceChange < R.cooldown) return false;
    const gpu = s.gpuMs;
    const gpuHeavy = gpu === null || gpu > s.targetMs * P.gpuBusy;
    const gpuOver = gpu !== null && gpu > s.targetMs * P.gpuOver;
    let next = this.scale;
    if ((s.lateFrac > P.lateDown && gpuHeavy) || gpuOver) next = Math.max(R.min, this.scale - R.step);
    else if (this.goodTime > P.goodTime) {
      const up = Math.min(R.max, this.scale + R.step);
      const blocked = up >= this.ceiling - 1e-6 && this.t < this.ceilingUntil;
      if (up > this.scale && !blocked) {
        if (gpu === null) next = up;                                     // tanpa timer: coba naik (gagal → backoff)
        else {
          const k = (this.pixelRatioAt(up) / Math.max(1e-6, this.pixelRatioAt(this.scale))) ** 2;
          if (s.cpuMs + gpu * k <= s.targetMs * P.budget) next = up;     // gagal pun tetap aman: turun lagi + backoff
        }
      }
    }
    next = Math.round(next * 10) / 10;
    if (next === this.scale) return false;
    if (next < this.scale) {
      if (this.t - this.lastUpAt < P.failWindow) {                      // naik barusan gagal → blok level itu sementara
        this.ceiling = this.scale; this.ceilingUntil = this.t + this.backoff;
        this.backoff = Math.min(P.backoff.max, this.backoff * 2);
      }
    } else this.lastUpAt = this.t;
    this.lastWasUp = next > this.scale;
    this.scale = next; this.sinceChange = 0; this.goodTime = 0;
    return true;
  }
}

export class DynamicResolution {
  private readonly ctrl: DynResController;
  enabled = true;

  constructor(private renderer: THREE.WebGLRenderer, private preset: Preset, private pacing: FramePacing, private gpu: GpuTimer) {
    this.ctrl = new DynResController((s) => this.pixelRatioAt(s));
  }

  get scale() { return this.ctrl.scale; }
  set scale(v: number) { this.ctrl.scale = v; }

  setPreset(p: Preset) { this.preset = p; this.apply(); }

  /** Pixel ratio efektif: min(dpr, maxPixelRatio) × scale, dibatasi total piksel internal (GDD §2.3). */
  pixelRatioAt(scale: number) {
    const w = innerWidth, h = innerHeight;
    const pr = Math.min(devicePixelRatio, this.preset.maxPixelRatio) * scale;
    const maxPr = Math.sqrt(this.preset.maxInternalPixels / Math.max(1, w * h));
    return Math.min(pr, maxPr);
  }

  apply() { this.renderer.setPixelRatio(this.pixelRatioAt(this.scale)); }

  /** Per frame. Timer GPU hanya aktif selama resolusi dinamis dipakai (atau overlay F3 terbuka). */
  update(dt: number) {
    this.gpu.need('dynres', this.enabled);
    if (!this.enabled) return;
    const P2 = this.pacing, target = P2.targetMs;
    const gpuMs = this.gpu.available && this.gpu.count >= 30 ? this.gpu.percentile(0.9) : null;
    const cpuMs = P2.cpuCount >= 30 ? P2.cpuPercentile(0.5) : 0;
    if (this.ctrl.update({ dt, targetMs: target, lateFrac: P2.lateFrac(Math.max(20, Math.round(1000 / target))), gpuMs, cpuMs })) {
      this.apply();
      this.gpu.reset();               // sampel GPU skala lama tidak dipakai untuk keputusan berikutnya
    }
  }
}
