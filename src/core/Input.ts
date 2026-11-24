// src/core/Input.ts — keyboard (event.code), mouse, pointer lock, fullscreen + Keyboard Lock (GDD §13.3, §14),
// ditambah pemetaan aksi yang bisa diubah (Bindings) dan gamepad standar (pasca-MVP).
import { XCFG } from '../config/extraConfig';
import { DEFAULT_BINDS, PAD_ACTION, type Action, type Binds } from './Bindings';

const PREVENT = new Set(['Tab', 'Space', 'Backquote', 'F3']);
const NB = 17;
const XP = XCFG.pad, XI = XCFG.input;

/** Status gamepad per frame (sumbu sudah melewati deadzone radial). */
export class PadState {
  connected = false;
  lx = 0; ly = 0; rx = 0; ry = 0; lt = 0; rt = 0;
  readonly down: boolean[] = new Array<boolean>(NB).fill(false);
  readonly prev: boolean[] = new Array<boolean>(NB).fill(false);
  pressed(i: number) { return this.down[i] && !this.prev[i]; }
}

function deadzone(x: number, y: number, d: number): [number, number] {
  const m = Math.hypot(x, y);
  if (m < d) return [0, 0];
  const k = Math.min(1, (m - d) / (1 - d)) / m;
  return [x * k, y * k];
}

export class Input {
  private down = new Set<string>();
  private pressed = new Set<string>();
  private released = new Set<string>();
  private accDx = 0; private accDy = 0; private accWheel = 0;
  dx = 0; dy = 0; wheel = 0;
  // mouse fisik (event) + tombol virtual gamepad (RT = klik kiri, LT = klik kanan)
  private rawMouse = [false, false, false];
  private rawPressed = [false, false, false];
  private rawReleased = [false, false, false];
  readonly mouseDown = [false, false, false];
  readonly mousePressed = [false, false, false];
  readonly mouseReleased = [false, false, false];
  locked = false;
  keyboardLocked = false;
  binds: Binds = { ...DEFAULT_BINDS };
  readonly pad = new PadState();
  /** true setelah input gamepad terakhir dipakai (keyboard/mouse mengembalikan ke false). */
  padActive = false;
  onLockChange: ((locked: boolean) => void) | null = null;
  onKey: ((code: string) => void) | null = null;
  onPadButton: ((index: number) => void) | null = null;
  private lastUnlock = 0;
  /** Waktu (performance.now) mouse terakhir dikunci → jendela "tenang" gerak & jeda aman klik. */
  private lockedAt = -1e9;
  /** Trigger controller (RT/LT) baru boleh menembak setelah dilepas dulu (< padRearm) sejak fokus/lanjut. */
  private padArmed = [true, true, true];

  constructor(private canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', (e) => {
      if (PREVENT.has(e.code) || (this.locked && (e.code.startsWith('Control') || e.code === 'KeyW' && e.ctrlKey))) e.preventDefault();
      // tombol yang masih ditahan saat kembali ke jendela: repeat dari OS → tandai ditahan (tanpa "ditekan")
      if (e.repeat) { this.down.add(e.code); return; }
      this.padActive = false;
      if (!this.down.has(e.code)) this.pressed.add(e.code);
      this.down.add(e.code);
      this.onKey?.(e.code);
    });
    window.addEventListener('keyup', (e) => {
      if (PREVENT.has(e.code)) e.preventDefault();
      this.down.delete(e.code);
      this.released.add(e.code);
    });
    // pindah aplikasi: semua tombol/klik dilepas, mode controller dimatikan (aktif lagi hanya lewat tombol), trigger dikunci
    window.addEventListener('blur', () => { this.clearAll(); this.padActive = false; this.padArmed.fill(false); });
    window.addEventListener('focus', () => { this.clearAll(); this.padArmed.fill(false); });
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      // sesaat setelah mouse dikunci ulang Chrome bisa mengirim sisa gerak kursor dari aplikasi lain → abaikan; juga lonjakan absurd
      if (performance.now() - this.lockedAt < XI.lockSettleMs) return;
      if (Math.abs(e.movementX) > XI.spikePx || Math.abs(e.movementY) > XI.spikePx) return;
      this.accDx += e.movementX; this.accDy += e.movementY;
      if (e.movementX || e.movementY) this.padActive = false;
    });
    document.addEventListener('mousedown', (e) => {
      if (!this.locked) return;
      if (performance.now() - this.lockedAt < XI.fireGuardMs) return; // klik yang mengembalikan ke game tidak boleh jadi tembakan
      if (e.button === 0 || e.button === 2) { this.rawMouse[e.button] = true; this.rawPressed[e.button] = true; return; }
      // klik tengah & tombol samping bisa dipetakan ke aksi (Mouse1/Mouse3/Mouse4)
      const c = 'Mouse' + e.button;
      e.preventDefault();
      if (!this.down.has(c)) this.pressed.add(c);
      this.down.add(c);
      this.onKey?.(c);
    });
    document.addEventListener('mouseup', (e) => {
      if (e.button === 0 || e.button === 2) {
        if (this.rawMouse[e.button]) this.rawReleased[e.button] = true;
        this.rawMouse[e.button] = false;
        return;
      }
      if (e.button === 3 || e.button === 4) e.preventDefault(); // cegah navigasi back/forward browser
      const c = 'Mouse' + e.button;
      if (this.down.delete(c)) this.released.add(c);
    });
    document.addEventListener('auxclick', (e) => { if (e.button === 3 || e.button === 4) e.preventDefault(); });
    document.addEventListener('wheel', (e) => { if (this.locked) this.accWheel += Math.sign(e.deltaY); }, { passive: true });
    document.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      const was = this.locked;
      this.locked = document.pointerLockElement === this.canvas;
      if (!this.locked) { this.lastUnlock = performance.now(); this.releaseMouse(); }
      else if (!was) {           // baru terkunci: mulai dari keadaan bersih (tanpa sisa gerak/klik), wajib klik baru
        this.lockedAt = performance.now(); this.releaseMouse(); this.accDx = 0; this.accDy = 0; this.accWheel = 0;
      }
      if (was !== this.locked) this.onLockChange?.(this.locked);
    });
    document.addEventListener('fullscreenchange', () => {
      if (!document.fullscreenElement) this.keyboardLocked = false;
    });
  }

  /** Chrome memberi jeda ±1 s setelah Esc sebelum lock ulang diizinkan. */
  get lockCooldown() { return Math.max(0, 1100 - (performance.now() - this.lastUnlock)); }

  /** Input game "tertangkap": pointer lock (mouse) atau gamepad sedang dipakai di tab yang fokus. */
  get captured() { return this.locked || (this.padActive && this.pad.connected && document.hasFocus()); }

  /** Minta kunci mouse; true hanya bila BENAR-BENAR terkunci (Chrome kadang menolak tanpa error → dicek ≤ lockWaitMs). */
  async requestLock(): Promise<boolean> {
    if (this.locked) return true;
    try {
      await (this.canvas.requestPointerLock as (o?: unknown) => Promise<void>).call(this.canvas, { unadjustedMovement: true });
    } catch {
      try { await (this.canvas.requestPointerLock as () => Promise<void> | void).call(this.canvas); } catch { return false; }
    }
    return this.waitLocked(XI.lockWaitMs);
  }

  private waitLocked(ms: number): Promise<boolean> {
    const t0 = performance.now();
    return new Promise((res) => {
      const tick = () => {
        if (document.pointerLockElement === this.canvas) res(true);
        else if (performance.now() - t0 > ms) res(false);
        else setTimeout(tick, 16);
      };
      tick();
    });
  }

  /** Setelah lanjut dari pause: trigger controller harus dilepas dulu sebelum bisa menembak lagi. */
  disarmPad() { this.padArmed.fill(false); }

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
    this.pollPad();
    const P = this.pad, padOn = this.padActive && P.connected;
    for (let i = 0; i < 3; i++) {
      const tv = i === 0 ? P.rt : i === 2 ? P.lt : 0;
      if (tv < XI.padRearm) this.padArmed[i] = true;          // trigger sudah kembali ke posisi lepas
      const virt = padOn && this.padArmed[i] && tv > XP.trigger;
      const was = this.mouseDown[i], now = this.rawMouse[i] || virt;
      this.mousePressed[i] = this.rawPressed[i] || (now && !was);
      this.mouseReleased[i] = this.rawReleased[i] || (!now && was);
      this.mouseDown[i] = now;
      this.rawPressed[i] = false; this.rawReleased[i] = false;
    }
  }

  endFrame() { this.pressed.clear(); this.released.clear(); }

  private pollPad() {
    const P = this.pad;
    for (let i = 0; i < NB; i++) P.prev[i] = P.down[i];
    const list = typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : [];
    // hanya controller berpemetaan standar (perangkat HID lain bisa punya sumbu "diam" di ±1 → dianggap input terus-menerus)
    let gp: Gamepad | null = null;
    for (const g of list) if (g && g.connected && g.mapping === 'standard') { gp = g; break; }
    if (!gp) {
      if (P.connected) { P.connected = false; this.padActive = false; P.down.fill(false); P.lx = P.ly = P.rx = P.ry = P.lt = P.rt = 0; }
      return;
    }
    P.connected = true;
    const ax = gp.axes;
    [P.lx, P.ly] = deadzone(ax[0] ?? 0, ax[1] ?? 0, XP.deadzone);
    [P.rx, P.ry] = deadzone(ax[2] ?? 0, ax[3] ?? 0, XP.deadzone);
    for (let i = 0; i < NB; i++) { const b = gp.buttons[i]; P.down[i] = !!b && (b.pressed || b.value > 0.5); }
    P.lt = gp.buttons[6]?.value ?? 0; P.rt = gp.buttons[7]?.value ?? 0;
    // mode controller aktif hanya bila tombol benar-benar ditekan (stik/derau sumbu tidak mengaktifkan); trigger perlu tekan dalam
    let any = P.lt > XI.padTriggerActivate || P.rt > XI.padTriggerActivate;
    for (let i = 0; i < NB && !any; i++) if (i !== 6 && i !== 7 && P.pressed(i)) any = true;
    if (any) this.padActive = true;
    for (let i = 0; i < NB; i++) if (P.pressed(i)) this.onPadButton?.(i);
  }

  isDown(code: string) { return this.down.has(code); }
  wasPressed(code: string) { return this.pressed.has(code); }
  wasReleased(code: string) { return this.released.has(code); }

  /** Aksi ditahan: tombol keyboard/mouse terpetakan atau tombol gamepad. */
  actDown(a: Action) {
    const c = this.binds[a];
    if (c && this.down.has(c)) return true;
    const pi = PAD_ACTION[a];
    return pi !== undefined && this.padActive && this.pad.down[pi];
  }
  /** Aksi baru ditekan pada frame ini. */
  actPressed(a: Action) {
    const c = this.binds[a];
    if (c && this.pressed.has(c)) return true;
    const pi = PAD_ACTION[a];
    return pi !== undefined && this.padActive && this.pad.pressed(pi);
  }
  /** Sumbu gerak −1..1 (keyboard digital diutamakan, lalu stik kiri). */
  get moveX() { const k = (this.actDown('right') ? 1 : 0) - (this.actDown('left') ? 1 : 0); return k || (this.padActive ? this.pad.lx : 0); }
  get moveZ() { const k = (this.actDown('forward') ? 1 : 0) - (this.actDown('back') ? 1 : 0); return k || (this.padActive ? -this.pad.ly : 0); }

  /** Ctrl untuk jongkok hanya aktif saat fullscreen + Keyboard Lock (E-15). */
  get ctrlAllowed() { return this.keyboardLocked && !!document.fullscreenElement; }

  private releaseMouse() {
    for (let i = 0; i < 3; i++) { if (this.rawMouse[i]) this.rawReleased[i] = true; this.rawMouse[i] = false; }
    for (const c of [...this.down]) if (c.startsWith('Mouse')) { this.down.delete(c); this.released.add(c); }
  }

  clearAll() {
    for (const c of this.down) this.released.add(c);
    this.down.clear();
    this.releaseMouse();
  }
}
