// tests/input.test.ts — pindah aplikasi & kunci mouse ulang (laporan pengguna: kursor "kebawa" & senjata menembak sendiri).
// DOM tiruan minimal (EventTarget Node) — tanpa jsdom.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { XCFG } from '../src/config/extraConfig';

let now = 0;
const win = new EventTarget() as EventTarget & Record<string, unknown>;
const doc = Object.assign(new EventTarget(), { pointerLockElement: null as unknown, hasFocus: () => true, fullscreenElement: null });
let pads: unknown[] = [];
Object.assign(globalThis, { window: win, document: doc });
Object.defineProperty(globalThis.navigator, 'getGamepads', { value: () => pads, configurable: true });
vi.spyOn(performance, 'now').mockImplementation(() => now);

const { Input } = await import('../src/core/Input');
const canvas = {
  requestPointerLock: async () => { doc.pointerLockElement = canvas; doc.dispatchEvent(new Event('pointerlockchange')); },
} as unknown as HTMLCanvasElement;

const ev = (type: string, props: Record<string, unknown> = {}) => Object.assign(new Event(type), props);
const lock = () => { doc.pointerLockElement = canvas; doc.dispatchEvent(new Event('pointerlockchange')); };
const unlock = () => { doc.pointerLockElement = null; doc.dispatchEvent(new Event('pointerlockchange')); };
const pad = (o: { mapping?: string; axes?: number[]; buttons?: number[] }) => ({
  connected: true, mapping: o.mapping ?? 'standard', axes: o.axes ?? [0, 0, 0, 0],
  buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: (o.buttons?.[i] ?? 0) > 0.5, value: o.buttons?.[i] ?? 0 })),
});

describe('Input: kembali ke game setelah pindah aplikasi', () => {
  let inp: InstanceType<typeof Input>;
  beforeEach(() => { now = 10_000; pads = []; doc.pointerLockElement = null; inp = new Input(canvas); });

  it('gerak mouse sesaat setelah dikunci ulang & lonjakan absurd diabaikan (pandangan tidak nyentak)', () => {
    lock();
    doc.dispatchEvent(ev('mousemove', { movementX: 640, movementY: -300 }));      // sisa gerak kursor dari aplikasi lain
    inp.beginFrame(); expect([inp.dx, inp.dy]).toEqual([0, 0]); inp.endFrame();
    now += XCFG.input.lockSettleMs + 10;
    doc.dispatchEvent(ev('mousemove', { movementX: 12, movementY: 5 }));
    doc.dispatchEvent(ev('mousemove', { movementX: XCFG.input.spikePx + 500, movementY: 0 }));   // lonjakan
    inp.beginFrame(); expect([inp.dx, inp.dy]).toEqual([12, 5]);
  });

  it('klik yang mengembalikan ke game tidak jadi tembakan; klik baru setelah jeda aman menembak', () => {
    lock();
    doc.dispatchEvent(ev('mousedown', { button: 0 }));
    inp.beginFrame(); expect(inp.mouseDown[0]).toBe(false); inp.endFrame();
    doc.dispatchEvent(ev('mouseup', { button: 0 }));
    now += XCFG.input.fireGuardMs + 10;
    doc.dispatchEvent(ev('mousedown', { button: 0 }));
    inp.beginFrame(); expect(inp.mouseDown[0]).toBe(true);
  });

  it('klik kiri yang ditahan lalu pindah aplikasi → dilepas (tidak menembak terus saat kembali)', () => {
    lock(); now += 500;
    doc.dispatchEvent(ev('mousedown', { button: 0 }));
    inp.beginFrame(); expect(inp.mouseDown[0]).toBe(true); inp.endFrame();
    win.dispatchEvent(new Event('blur')); unlock();                     // tombol dilepas di aplikasi lain (mouseup tidak sampai)
    win.dispatchEvent(new Event('focus')); lock(); now += 500;
    inp.beginFrame(); expect(inp.mouseDown[0]).toBe(false);
  });

  it('requestLock hanya true bila benar-benar terkunci', async () => {
    expect(await inp.requestLock()).toBe(true);
    const refusing = { requestPointerLock: async () => { /* Chrome menolak diam-diam */ } } as unknown as HTMLCanvasElement;
    doc.pointerLockElement = null;
    const inp2 = new Input(refusing);
    const p = inp2.requestLock();
    const iv = setInterval(() => { now += 100; }, 5);                  // waktu berjalan sampai batas tunggu habis
    expect(await p).toBe(false);
    clearInterval(iv);
  });
});

describe('Input: controller', () => {
  let inp: InstanceType<typeof Input>;
  beforeEach(() => { now = 10_000; doc.pointerLockElement = null; pads = []; inp = new Input(canvas); });

  it('perangkat non-standar diabaikan; stik/derau saja tidak mengaktifkan mode controller', () => {
    pads = [pad({ mapping: '', axes: [1, -1, 1, -1], buttons: [0, 0, 0, 0, 0, 0, 0, 1] })];
    inp.beginFrame(); expect([inp.pad.connected, inp.padActive, inp.mouseDown[0]]).toEqual([false, false, false]);
    pads = [pad({ axes: [0.9, 0, 0, 0] })];
    inp.beginFrame(); expect(inp.padActive).toBe(false);
    pads = [pad({ buttons: [1] })];                                     // tombol A ditekan
    inp.beginFrame(); expect(inp.padActive).toBe(true);
  });

  it('RT yang masih tertahan setelah kembali/lanjut tidak menembak sampai dilepas dulu', () => {
    pads = [pad({ buttons: [1] })]; inp.beginFrame();                  // aktifkan controller
    pads = [pad({ buttons: [0, 0, 0, 0, 0, 0, 0, 0.9] })]; inp.beginFrame();
    expect(inp.mouseDown[0]).toBe(true);                               // RT = klik kiri
    inp.disarmPad();                                                   // pause → lanjut
    inp.beginFrame(); expect(inp.mouseDown[0]).toBe(false);            // RT masih ditahan → tidak menembak
    pads = [pad({})]; inp.beginFrame();                                // RT dilepas
    pads = [pad({ buttons: [0, 0, 0, 0, 0, 0, 0, 0.9] })]; inp.beginFrame();
    expect(inp.mouseDown[0]).toBe(true);
  });

  it('pindah aplikasi mematikan mode controller (aktif lagi lewat tombol)', () => {
    pads = [pad({ buttons: [1] })]; inp.beginFrame(); expect(inp.padActive).toBe(true);
    win.dispatchEvent(new Event('blur'));
    expect(inp.padActive).toBe(false);
  });
});
