// src/debug/StatsOverlay.ts — overlay F3 (GDD §16.2) + kehalusan frame: refresh layar, % frame tepat waktu (1 vsync),
// FPS 1% terendah, waktu GPU & CPU, dan grafik interval frame (hijau = tepat waktu, kuning = telat 1 vsync, merah = ≥ 2).
import type * as THREE from 'three';
import type { FramePacing } from '../core/FramePacing';
import type { GpuTimer } from '../core/GpuTimer';

export interface StatsSource {
  renderer: THREE.WebGLRenderer;
  awakeBodies(): number;
  totalBodies(): number;
  voices(): number;
  playerInfo(): string;
  dynScale(): number;
  pacing: FramePacing;
  gpu: GpuTimer;
  /** Waktu CPU frame sebelumnya (ms): logika + fisika + submit render. */
  cpuMs(): number;
}

const GW = 240, GH = 44;

export class StatsOverlay {
  readonly el: HTMLDivElement;
  private readonly text: HTMLDivElement;
  private readonly graph: HTMLCanvasElement;
  visible = false;
  private acc = 0;

  constructor(private src: StatsSource) {
    this.el = document.createElement('div');
    this.el.className = 'stats-overlay';
    this.el.style.display = 'none';
    this.text = document.createElement('div');
    this.graph = document.createElement('canvas');
    this.graph.width = GW; this.graph.height = GH;
    this.graph.style.cssText = `display:block;width:${GW}px;height:${GH}px;margin-top:4px;background:rgba(0,0,0,.35)`;
    this.el.append(this.text, this.graph);
    document.body.appendChild(this.el);
  }

  toggle(v = !this.visible) {
    this.visible = v; this.el.style.display = v ? 'block' : 'none';
    this.src.gpu.need('stats', v);       // query GPU saat overlay terbuka (resolusi dinamis juga memakainya)
  }

  /** Dipanggil tiap frame. Teks & grafik diperbarui 4× per detik. */
  update(dt: number) {
    this.acc += dt;
    if (!this.visible || this.acc < 0.25) return;
    this.acc = 0;
    const P = this.src.pacing, info = this.src.renderer.info;
    const avg = P.avg() || 16.6, p95 = P.percentile(0.95), p99 = P.percentile(0.99), hz = 1000 / P.refreshMs;
    const gpu = this.src.gpu;
    const gpuTxt = gpu.available ? (gpu.count ? `GPU ${gpu.avgMs.toFixed(1)} ms (p90 ${gpu.percentile(0.9).toFixed(1)})` : 'GPU …') : 'GPU n/a';
    const cap = P.div > 1 ? `  batas ${(hz / P.div).toFixed(0)}` : '';
    this.text.textContent =
      `FPS ${(1000 / avg).toFixed(0)}  layar ${hz.toFixed(0)} Hz${cap}  tepat waktu ${(P.onTimeFrac() * 100).toFixed(0)}%  ` +
      `1% low ${(1000 / Math.max(1, p99)).toFixed(0)}\n` +
      `frame ${avg.toFixed(1)} ms (p95 ${p95.toFixed(1)})  ${gpuTxt}  CPU ${this.src.cpuMs().toFixed(1)} ms  res ×${this.src.dynScale().toFixed(1)}\n` +
      `draw calls ${info.render.calls}  tris ${(info.render.triangles / 1000).toFixed(1)}k  geo ${info.memory.geometries}  tex ${info.memory.textures}\n` +
      `bodies awake ${this.src.awakeBodies()}/${this.src.totalBodies()}  voices ${this.src.voices()}\n` +
      this.src.playerInfo();
    this.drawGraph();
  }

  /** Batang per frame (tinggi = interval, skala 4 vsync); garis = 1 vsync. */
  private drawGraph() {
    const g = this.graph.getContext('2d');
    if (!g) return;
    const P = this.src.pacing, R = P.refreshMs, T = P.targetMs, n = P.count, max = T + R * 3;
    g.clearRect(0, 0, GW, GH);
    const x0 = GW - n;
    for (let k = 0; k < n; k++) {
      const ms = P.at(k), h = Math.max(1, Math.min(GH, (ms / max) * GH));
      g.fillStyle = ms < T + R * 0.5 ? '#6f6' : ms < T + R * 1.5 ? '#fc3' : '#f44';
      g.fillRect(x0 + k, GH - h, 1, h);
    }
    g.fillStyle = 'rgba(255,255,255,.45)';
    g.fillRect(0, GH - Math.round((T / max) * GH), GW, 1);
  }
}
