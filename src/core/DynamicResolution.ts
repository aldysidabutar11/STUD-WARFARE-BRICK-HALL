// src/core/DynamicResolution.ts — skala resolusi internal adaptif (GDD §2.3)
import type * as THREE from 'three';
import { CFG, type Preset } from '../config/gameConfig';

const R = CFG.render.dynRes;

export class DynamicResolution {
  scale = 1.0;
  private sinceChange = 0;
  avgMs = 16.6;
  private goodTime = 0;
  enabled = true;

  constructor(private renderer: THREE.WebGLRenderer, private preset: Preset) {}

  setPreset(p: Preset) { this.preset = p; this.apply(); }

  /** Pixel ratio efektif: min(dpr, maxPixelRatio) × scale, dibatasi total piksel internal. */
  apply() {
    const w = innerWidth, h = innerHeight;
    const pr = Math.min(devicePixelRatio, this.preset.maxPixelRatio) * this.scale;
    const maxPr = Math.sqrt(this.preset.maxInternalPixels / (w * h));
    this.renderer.setPixelRatio(Math.min(pr, maxPr));
  }

  update(dtMs: number, dt: number) {
    this.avgMs += (dtMs - this.avgMs) * 0.05; // EMA ±1 detik
    if (!this.enabled) return;
    this.sinceChange += dt;
    this.goodTime = this.avgMs < R.upMs ? this.goodTime + dt : 0;
    if (this.sinceChange < R.cooldown) return;
    let next = this.scale;
    if (this.avgMs > R.downMs) next = Math.max(R.min, this.scale - R.step);
    else if (this.goodTime > 4) next = Math.min(R.max, this.scale + R.step);
    next = Math.round(next * 10) / 10;
    if (next === this.scale) return;
    this.scale = next; this.sinceChange = 0; this.goodTime = 0;
    this.apply();
  }
}
