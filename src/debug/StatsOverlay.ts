// src/debug/StatsOverlay.ts — overlay F3 (GDD §16.2)
import type * as THREE from 'three';

export interface StatsSource {
  renderer: THREE.WebGLRenderer;
  awakeBodies(): number;
  totalBodies(): number;
  voices(): number;
  playerInfo(): string;
  dynScale(): number;
}

export class StatsOverlay {
  readonly el: HTMLDivElement;
  visible = false;
  private frames: number[] = [];
  private acc = 0;

  constructor(private src: StatsSource) {
    this.el = document.createElement('div');
    this.el.className = 'stats-overlay';
    this.el.style.display = 'none';
    document.body.appendChild(this.el);
  }

  toggle(v = !this.visible) { this.visible = v; this.el.style.display = v ? 'block' : 'none'; }

  /** Dipanggil tiap frame dengan durasi frame (ms). Teks diperbarui 4× per detik. */
  update(frameMs: number, dt: number) {
    this.frames.push(frameMs);
    if (this.frames.length > 240) this.frames.shift();
    this.acc += dt;
    if (!this.visible || this.acc < 0.25) return;
    this.acc = 0;
    const sorted = [...this.frames].sort((a, b) => a - b);
    const avg = this.frames.reduce((a, b) => a + b, 0) / this.frames.length;
    const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? avg;
    const info = this.src.renderer.info;
    this.el.textContent =
      `FPS ${(1000 / avg).toFixed(0)}  frame ${avg.toFixed(1)} ms (p95 ${p95.toFixed(1)})  res ×${this.src.dynScale().toFixed(1)}\n` +
      `draw calls ${info.render.calls}  tris ${(info.render.triangles / 1000).toFixed(1)}k  geo ${info.memory.geometries}  tex ${info.memory.textures}\n` +
      `bodies awake ${this.src.awakeBodies()}/${this.src.totalBodies()}  voices ${this.src.voices()}\n` +
      this.src.playerInfo();
  }
}
