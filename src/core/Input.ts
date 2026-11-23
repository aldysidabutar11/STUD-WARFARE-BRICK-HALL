// src/core/Input.ts — keyboard (event.code), mouse, pointer lock, fullscreen + Keyboard Lock (GDD §13.3, §14)
const PREVENT = new Set(['Tab', 'Space', 'Backquote', 'F3']);

export class Input {
  private down = new Set<string>();
  private pressed = new Set<string>();
  private released = new Set<string>();
  private accDx = 0; private accDy = 0; private accWheel = 0;
  dx = 0; dy = 0; wheel = 0;
  readonly mouseDown = [false, false, false];
  private mousePressedAcc = [false, false, false];
  private mouseReleasedAcc = [false, false, false];
  readonly mousePressed = [false, false, false];
  readonly mouseReleased = [false, false, false];
  locked = false;
  keyboardLocked = false;
  onLockChange: ((locked: boolean) => void) | null = null;
  onKey: ((code: string) => void) | null = null;
  private lastUnlock = 0;

  constructor(private canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', (e) => {
      if (PREVENT.has(e.code) || (this.locked && (e.code.startsWith('Control') || e.code === 'KeyW' && e.ctrlKey))) e.preventDefault();
      if (e.repeat) return;
      if (!this.down.has(e.code)) this.pressed.add(e.code);
      this.down.add(e.code);
      this.onKey?.(e.code);
    });
    window.addEventListener('keyup', (e) => {
      if (PREVENT.has(e.code)) e.preventDefault();
      this.down.delete(e.code);
      this.released.add(e.code);
    });
    window.addEventListener('blur', () => this.clearAll());
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.accDx += e.movementX; this.accDy += e.movementY;
    });
    document.addEventListener('mousedown', (e) => {
      if (!this.locked || e.button > 2) return;
      this.mouseDown[e.button] = true; this.mousePressedAcc[e.button] = true;
    });
    document.addEventListener('mouseup', (e) => {
      if (e.button > 2) return;
      if (this.mouseDown[e.button]) this.mouseReleasedAcc[e.button] = true;
      this.mouseDown[e.button] = false;
    });
    document.addEventListener('wheel', (e) => { if (this.locked) this.accWheel += Math.sign(e.deltaY); }, { passive: true });
    document.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      const was = this.locked;
      this.locked = document.pointerLockElement === this.canvas;
      if (!this.locked) { this.lastUnlock = performance.now(); this.releaseMouse(); }
      if (was !== this.locked) this.onLockChange?.(this.locked);
    });
    document.addEventListener('fullscreenchange', () => {
      if (!document.fullscreenElement) this.keyboardLocked = false;
    });
  }

  /** Chrome memberi jeda ±1 s setelah Esc sebelum lock ulang diizinkan. */
  get lockCooldown() { return Math.max(0, 1100 - (performance.now() - this.lastUnlock)); }

  async requestLock(): Promise<boolean> {
    try {
      await (this.canvas.requestPointerLock as (o?: unknown) => Promise<void>).call(this.canvas, { unadjustedMovement: true });
    } catch {
      try { await (this.canvas.requestPointerLock as () => Promise<void> | void).call(this.canvas); } catch { return false; }
    }
    return true;
  }

  exitLock() { if (document.pointerLockElement) document.exitPointerLock(); }

  async goFullscreen() {
    try {
      await document.documentElement.requestFullscreen();
      const kb = (navigator as unknown as { keyboard?: { lock: (keys?: string[]) => Promise<void> } }).keyboard;
      if (kb) { await kb.lock(); this.keyboardLocked = true; }
    } catch { /* fullscreen ditolak */ }
  }

  beginFrame() {
    this.dx = this.accDx; this.dy = this.accDy; this.wheel = this.accWheel;
    this.accDx = 0; this.accDy = 0; this.accWheel = 0;
    for (let i = 0; i < 3; i++) {
      this.mousePressed[i] = this.mousePressedAcc[i]; this.mouseReleased[i] = this.mouseReleasedAcc[i];
      this.mousePressedAcc[i] = false; this.mouseReleasedAcc[i] = false;
    }
  }

  endFrame() { this.pressed.clear(); this.released.clear(); }

  isDown(code: string) { return this.down.has(code); }
  wasPressed(code: string) { return this.pressed.has(code); }
  wasReleased(code: string) { return this.released.has(code); }
  /** Ctrl untuk jongkok hanya aktif saat fullscreen + Keyboard Lock (E-15). */
  get ctrlAllowed() { return this.keyboardLocked && !!document.fullscreenElement; }

  private releaseMouse() {
    for (let i = 0; i < 3; i++) { if (this.mouseDown[i]) this.mouseReleasedAcc[i] = true; this.mouseDown[i] = false; }
  }

  clearAll() {
    for (const c of this.down) this.released.add(c);
    this.down.clear();
    this.releaseMouse();
  }
}
