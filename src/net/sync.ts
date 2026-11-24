// src/net/sync.ts — alat sinkronisasi murni (diuji tanpa jaringan): perkiraan jam tick host di klien, buffer interpolasi
// snapshot per entitas, riwayat perintah untuk prediksi + rekonsiliasi pemain lokal, antrean perintah pemain remote di host.
import type { Command, EntState } from './protocol';

const TAU = Math.PI * 2;

/** Perkiraan tick host "sekarang" dari waktu lokal. Snapshot datang terlambat (latensi + jitter); yang paling cepat datang
 *  memberi perkiraan terbaik → offset = maks bergerak (turun perlahan bila jaringan melambat). */
export class HostClock {
  private offset = Number.NaN;
  constructor(private hz = 60, private decayPerSec = 2) {}
  onSnapshot(tick: number, nowSec: number) {
    const o = tick - nowSec * this.hz;
    if (Number.isNaN(this.offset) || o > this.offset) this.offset = o;
  }
  /** Turunkan offset sedikit tiap frame agar ikut bila latensi naik (dipulihkan snapshot berikutnya). */
  update(dt: number) { if (!Number.isNaN(this.offset)) this.offset -= this.decayPerSec * dt; }
  get ready() { return !Number.isNaN(this.offset); }
  tickAt(nowSec: number) { return nowSec * this.hz + this.offset; }
}

/** Sampel entitas pada tick host tertentu. */
export interface InterpSample extends EntState { tick: number }

const lerpAngle = (a: number, b: number, t: number) => {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU; else if (d < -Math.PI) d += TAU;
  return a + d * t;
};

/** Buffer interpolasi satu entitas (urut tick naik). */
export class InterpBuffer {
  private s: InterpSample[] = [];
  constructor(private max = 32, private hz = 60) {}
  push(x: InterpSample) {
    const s = this.s;
    if (s.length && x.tick <= s[s.length - 1].tick) return;   // basi / duplikat (kanal unreliable tidak berurutan)
    s.push(x);
    if (s.length > this.max) s.shift();
  }
  get latest(): InterpSample | null { return this.s.length ? this.s[this.s.length - 1] : null; }
  clear() { this.s.length = 0; }
  /** Isi out dengan keadaan pada tick (pecahan) — interpolasi linier posisi/sudut, sisanya dari sampel terdekat sebelumnya.
   *  Lewat sampel terbaru (snapshot telat/hilang): posisi diteruskan searah kecepatan maks `extrap` tick (0 = tahan). */
  sample(tick: number, out: EntState, extrap = 0): boolean {
    const s = this.s;
    if (!s.length) return false;
    const last = s[s.length - 1];
    if (tick > last.tick) {
      Object.assign(out, last);
      if (extrap > 0 && (last.flags & 1)) {
        const dt = Math.min(tick - last.tick, extrap) / this.hz;
        out.x = last.x + last.vx * dt; out.z = last.z + last.vz * dt;
      }
      return true;
    }
    let i = s.length - 1;
    while (i > 0 && s[i].tick > tick) i--;
    const a = s[i], b = s[Math.min(i + 1, s.length - 1)];
    const t = b.tick > a.tick ? Math.max(0, Math.min(1, (tick - a.tick) / (b.tick - a.tick))) : 0;
    Object.assign(out, a);
    out.x = a.x + (b.x - a.x) * t; out.y = a.y + (b.y - a.y) * t; out.z = a.z + (b.z - a.z) * t;
    out.yaw = lerpAngle(a.yaw, b.yaw, t); out.pitch = a.pitch + (b.pitch - a.pitch) * t;
    out.vx = a.vx + (b.vx - a.vx) * t; out.vz = a.vz + (b.vz - a.vz) * t;
    out.crouchT = a.crouchT + (b.crouchT - a.crouchT) * t;
    // fase langkah kontinu (bisa melompat bilangan bulat) → interpolasi hanya bila maju wajar
    out.stepPhase = b.stepPhase >= a.stepPhase && b.stepPhase - a.stepPhase < 4 ? a.stepPhase + (b.stepPhase - a.stepPhase) * t : b.stepPhase;
    // teleport (respawn) → jangan menggeser lewat peta
    if (Math.hypot(b.x - a.x, b.z - a.z) > 8 || (a.flags & 1) !== (b.flags & 1)) { Object.assign(out, t < 0.5 ? a : b); }
    return true;
  }
}

/** Kualitas aliran snapshot di klien → jeda interpolasi adaptif (tick). Jeda = interval snapshot (median) + keterlambatan p95
 *  + cadangan, + satu interval bila ada paket hilang dalam jendela. Berubah halus: naik cepat, turun pelan. */
export interface SnapStatsOpts { min: number; max: number; safety: number; window: number; rise: number; fall: number }
export class SnapStats {
  private late: { t: number; v: number }[] = [];
  private gaps: number[] = [];
  private lossT = -1e9;
  private lastTick = -1;
  private now = 0;
  private sorted: number[] = [];
  delay: number;
  target: number;
  constructor(private o: SnapStatsOpts, initial: number) { this.delay = this.target = initial; }
  /** Median selisih tick antar snapshot (≈ snapEvery host). */
  get interval() {
    if (!this.gaps.length) return 2;
    const g = this.gaps.slice().sort((a, b) => a - b);
    return g[g.length >> 1];
  }
  /** lateTicks = seberapa telat snapshot ini dibanding kedatangan tercepat (≥ 0). */
  onSnapshot(tick: number, lateTicks: number, nowSec: number) {
    this.now = nowSec;
    if (this.lastTick >= 0 && tick > this.lastTick) {
      const g = tick - this.lastTick;
      this.gaps.push(g); if (this.gaps.length > 16) this.gaps.shift();
      if (this.gaps.length >= 4 && g > this.interval * 1.5) this.lossT = nowSec;
    }
    if (tick > this.lastTick) this.lastTick = tick;
    this.late.push({ t: nowSec, v: Math.max(0, lateTicks) });
    while (this.late.length && nowSec - this.late[0].t > this.o.window) this.late.shift();
    const v = this.sorted; v.length = 0;
    for (const x of this.late) v.push(x.v);
    v.sort((a, b) => a - b);
    const p95 = v[Math.min(v.length - 1, Math.floor(v.length * 0.95))] ?? 0;
    const iv = this.interval, lossy = nowSec - this.lossT < this.o.window;
    this.target = Math.min(this.o.max, Math.max(this.o.min, iv + p95 + this.o.safety + (lossy ? iv : 0)));
  }
  /** Per frame: dtTicks = waktu berlalu dalam tick. */
  update(dtTicks: number) {
    const d = this.target - this.delay;
    this.delay += d > 0 ? Math.min(d, this.o.rise * dtTicks) : Math.max(d, -this.o.fall * dtTicks);
  }
}

/** Klien: kena hasil prediksi tembakan/pisau sendiri (hitmarker & suara instan) menunggu konfirmasi host → konfirmasi yang sudah
 *  ditampilkan dilewati (tanpa ganda); konfirmasi tanpa prediksi (prediksi meleset) tetap ditampilkan saat tiba. */
export class HitLedger {
  private q: { v: number; t: number }[] = [];
  constructor(private window = 1.0) {}
  predict(victim: number, t: number) { this.prune(t); this.q.push({ v: victim, t }); }
  /** true = sudah ditampilkan saat prediksi (lewati). */
  confirm(victim: number, t: number): boolean {
    this.prune(t);
    const i = this.q.findIndex(x => x.v === victim);
    if (i < 0) return false;
    this.q.splice(i, 1);
    return true;
  }
  get pending() { return this.q.length; }
  private prune(t: number) { while (this.q.length && t - this.q[0].t > this.window) this.q.shift(); }
}

/** Riwayat perintah pemain lokal + keadaan hasil prediksi per seq (cincin). */
export class CommandHistory<S> {
  private cmds: (Command | null)[];
  private states: (S | null)[];
  constructor(private size = 256) { this.cmds = new Array(size).fill(null); this.states = new Array(size).fill(null); }
  put(c: Command, state: S | null) { const i = c.seq % this.size; this.cmds[i] = c; this.states[i] = state; }
  setState(seq: number, state: S) { const i = seq % this.size; if (this.cmds[i]?.seq === seq) this.states[i] = state; }
  cmd(seq: number): Command | null { const c = this.cmds[seq % this.size]; return c && c.seq === seq ? c : null; }
  state(seq: number): S | null { return this.cmd(seq) ? this.states[seq % this.size] : null; }
  /** Perintah dengan seq > ack s.d. last (urut), untuk diputar ulang setelah koreksi. */
  after(ack: number, last: number): Command[] {
    const out: Command[] = [];
    for (let s = ack + 1; s <= last; s++) { const c = this.cmd(s); if (c) out.push(c); }
    return out;
  }
  /** n perintah terakhir s.d. last (untuk dikirim ulang). */
  recent(last: number, n: number): Command[] {
    const out: Command[] = [];
    for (let s = Math.max(1, last - n + 1); s <= last; s++) { const c = this.cmd(s); if (c) out.push(c); }
    return out;
  }
}

/** Antrean perintah satu pemain remote di host: buang duplikat/basi, satu perintah per tick (lebih bila menumpuk → kejar).
 *  Kosong → pemain DITAHAN (tidak mengarang masukan: hasil host = prediksi klien, tanpa koreksi); kosong terlalu lama → diam
 *  (masukan nol: gravitasi tetap jalan, tombol dilepas). */
export class CommandQueue {
  private q: Command[] = [];
  lastSeq = 0;          // seq terakhir yang DIPROSES (ack ke klien)
  lastHeld = 0;
  private last: Command | null = null;
  private idle = 0;
  constructor(private maxQueue = 12) {}
  push(cmds: Command[]) {
    for (const c of cmds) {
      if (c.seq <= this.lastSeq || this.q.some(x => x.seq === c.seq)) continue;
      this.q.push(c);
    }
    this.q.sort((a, b) => a.seq - b.seq);
    while (this.q.length > this.maxQueue) {                 // klien terlalu jauh di depan → buang yang tertua (impuls dipertahankan)
      const d = this.q.shift()!;
      this.q[0] = { ...this.q[0], imp: this.q[0].imp | d.imp };
    }
  }
  get pending() { return this.q.length; }
  /** Perintah untuk tick ini; null = tahan pemain tick ini (menunggu perintah berikutnya). */
  next(dt: number, idleAfter: number): { cmd: Command; prevHeld: number } | null {
    const prevHeld = this.lastHeld;
    const c = this.q.shift();
    if (c) {
      this.lastSeq = c.seq; this.last = c; this.idle = 0; this.lastHeld = c.held;
      return { cmd: c, prevHeld };
    }
    if (!this.last) return null;
    this.idle += dt;
    if (this.idle <= idleAfter) return null;
    this.lastHeld = 0;
    return { cmd: { ...this.last, imp: 0, held: 0, mx: 0, mz: 0 }, prevHeld };
  }
  reset() { this.q.length = 0; this.last = null; this.idle = 0; this.lastHeld = 0; }
}
