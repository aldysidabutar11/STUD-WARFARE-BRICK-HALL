// src/debug/PerfLogger.ts — log performa selama Stress Test (GDD §16.3)
export interface PerfResult { avgMs: number; p95Ms: number; p99Ms: number; maxDrawCalls: number; maxTriangles: number; maxAwakeBodies: number; heapMB: number }

export class PerfLogger {
  private frames: number[] = [];
  private maxDraw = 0; private maxTris = 0; private maxAwake = 0;
  running = false;

  start() { this.frames = []; this.maxDraw = 0; this.maxTris = 0; this.maxAwake = 0; this.running = true; }

  sample(frameMs: number, drawCalls: number, tris: number, awake: number) {
    if (!this.running) return;
    this.frames.push(frameMs);
    this.maxDraw = Math.max(this.maxDraw, drawCalls); this.maxTris = Math.max(this.maxTris, tris); this.maxAwake = Math.max(this.maxAwake, awake);
  }

  stop(): PerfResult {
    this.running = false;
    const s = [...this.frames].sort((a, b) => a - b), n = Math.max(1, s.length);
    const pct = (p: number) => s[Math.min(s.length - 1, Math.floor(s.length * p))] ?? 0;
    const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
    const r: PerfResult = {
      avgMs: +(s.reduce((a, b) => a + b, 0) / n).toFixed(2), p95Ms: +pct(0.95).toFixed(2), p99Ms: +pct(0.99).toFixed(2),
      maxDrawCalls: this.maxDraw, maxTriangles: this.maxTris, maxAwakeBodies: this.maxAwake,
      heapMB: mem ? +(mem.usedJSHeapSize / 1048576).toFixed(1) : -1,
    };
    console.log('[PerfLogger]', JSON.stringify(r));
    return r;
  }
}
