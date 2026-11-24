// src/core/GameLoop.ts — fixed timestep 60 Hz + update per frame (GDD §2.6) + batas FPS rata (pembagi refresh layar).
import { CFG } from '../config/gameConfig';
import type { FramePacing } from './FramePacing';

export interface LoopHooks {
  beginFrame(): void;
  fixedUpdate(dt: number): void;
  update(dt: number, alpha: number, rawDt: number): void;
  render(): void;
  endFrame(): void;
}

/** Apakah tick vsync ini dilewati oleh batas FPS: jalankan frame hanya bila sudah ±div vsync sejak frame terakhir.
 *  Ambang (div − 0.5) vsync → tahan jitter timestamp; frame yang telat tidak menggeser jadwal berikutnya lebih dari perlu. */
export function capSkips(sinceLastMs: number, refreshMs: number, div: number): boolean {
  return div > 1 && sinceLastMs < refreshMs * (div - 0.5);
}

export class GameLoop {
  readonly STEP = CFG.world.fixedStep;
  readonly MAX_SUBSTEPS = CFG.world.maxSubSteps;
  timeScale = 1;
  private acc = 0;
  private last = 0;
  private lastTick = 0;
  private running = false;
  lastFrameMs = 16.6;
  /** Batas FPS: 1 = ikut layar, 2 = ½ refresh, 3 = ⅓ refresh (selalu kelipatan vsync → tetap rata). */
  capDiv = 1;

  constructor(private hooks: LoopHooks, private pacing: FramePacing | null = null) {}

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.lastTick = 0;
    requestAnimationFrame(this.frame);
  }

  stop() { this.running = false; }

  private frame = (now: number) => {
    if (!this.running) return;
    const P = this.pacing;
    if (P) {
      if (this.lastTick) P.tick(now - this.lastTick);   // setiap vsync, juga yang dilewati → taksiran refresh layar
      this.lastTick = now;
      P.div = this.capDiv;
      if (capSkips(now - this.last, P.refreshMs, this.capDiv)) { requestAnimationFrame(this.frame); return; }
    }
    const rawDt = Math.min((now - this.last) / 1000, 0.1);
    this.lastFrameMs = now - this.last;
    this.last = now;
    P?.push(this.lastFrameMs);
    const dt = rawDt * this.timeScale;
    this.hooks.beginFrame();
    this.acc += dt;
    let n = 0;
    while (this.acc >= this.STEP && n < this.MAX_SUBSTEPS) { this.hooks.fixedUpdate(this.STEP); this.acc -= this.STEP; n++; }
    if (n === this.MAX_SUBSTEPS) this.acc = 0; // cegah spiral-of-death
    this.hooks.update(dt, this.acc / this.STEP, rawDt);
    this.hooks.render();
    this.hooks.endFrame();
    requestAnimationFrame(this.frame);
  };
}
