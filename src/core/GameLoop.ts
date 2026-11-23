// src/core/GameLoop.ts — fixed timestep 60 Hz + update per frame (GDD §2.6)
import { CFG } from '../config/gameConfig';

export interface LoopHooks {
  beginFrame(): void;
  fixedUpdate(dt: number): void;
  update(dt: number, alpha: number, rawDt: number): void;
  render(): void;
  endFrame(): void;
}

export class GameLoop {
  readonly STEP = CFG.world.fixedStep;
  readonly MAX_SUBSTEPS = CFG.world.maxSubSteps;
  timeScale = 1;
  private acc = 0;
  private last = 0;
  private running = false;
  lastFrameMs = 16.6;

  constructor(private hooks: LoopHooks) {}

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    requestAnimationFrame(this.frame);
  }

  stop() { this.running = false; }

  private frame = (now: number) => {
    if (!this.running) return;
    const rawDt = Math.min((now - this.last) / 1000, 0.1);
    this.lastFrameMs = now - this.last;
    this.last = now;
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
