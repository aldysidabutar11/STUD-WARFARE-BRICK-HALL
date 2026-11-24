// src/core/FramePacing.ts — ukuran KEHALUSAN frame, bukan cuma FPS rata-rata (laporan pengguna: "FPS 60–80 tapi tidak terasa
// 60–80"). Browser hanya menampilkan frame tepat di vsync: di layar 90 Hz frame yang lewat 11.1 ms tampil 22.2 ms (2 vsync).
// FPS 70 di layar 90 Hz = ±30% frame tampil dua kali lebih lama, berselang-seling acak (judder) → terasa lebih patah daripada
// 60 FPS stabil. Refresh layar ditaksir dari SETIAP callback requestAnimationFrame (tick, termasuk yang dilewati batas FPS);
// statistik frame dari frame yang benar-benar dijalankan. Target = refresh × batas FPS (div).

const N = 240;

class Ring {
  readonly buf = new Float32Array(N);
  private readonly tmp = new Float32Array(N);
  n = 0;
  private i = 0;
  push(v: number) { this.buf[this.i] = v; this.i = (this.i + 1) % N; if (this.n < N) this.n++; }
  /** Sampel ke-k dari yang terlama (0) ke terbaru (n − 1). */
  at(k: number) { return this.buf[(this.i - this.n + k + N * 2) % N]; }
  /** Salinan terurut naik (buffer sementara, berlaku sampai panggilan berikutnya). */
  sorted(): Float32Array { const t = this.tmp.subarray(0, this.n); t.set(this.buf.subarray(0, this.n)); t.sort(); return t; }
  reset() { this.n = 0; this.i = 0; }
}

export class FramePacing {
  private readonly frames = new Ring();
  private readonly ticks = new Ring();
  private readonly cpuMs = new Ring();
  private sinceEstimate = 0;
  /** Taksiran interval vsync layar (ms). Default 60 Hz sampai cukup sampel. */
  refreshMs = 1000 / 60;
  /** Batas FPS: 1 = ikut layar, 2 = ½ refresh, 3 = ⅓ refresh. */
  div = 1;

  /** Interval frame yang dituju (ms). */
  get targetMs() { return this.refreshMs * this.div; }

  /** Interval antar-callback requestAnimationFrame (ms) — untuk menaksir refresh. */
  tick(ms: number) {
    if (!(ms > 0) || ms > 1000) return;              // abaikan jeda tab tersembunyi / sampel rusak
    this.ticks.push(ms);
    if (++this.sinceEstimate >= 30 && this.ticks.n >= 60) { this.sinceEstimate = 0; this.refreshMs = this.estimateRefresh(); }
  }

  /** Interval antar-frame yang dijalankan (ms). Tanpa tick terpisah (uji), sampel ini juga dipakai menaksir refresh. */
  push(ms: number, alsoTick = false) {
    if (!(ms > 0) || ms > 1000) return;
    this.frames.push(ms);
    if (alsoTick) this.tick(ms);
  }

  /** Waktu CPU satu frame (ms): logika + fisika + submit render (resolusi dinamis memperhitungkannya). */
  cpu(ms: number) { if (ms >= 0 && ms < 1000) this.cpuMs.push(ms); }
  get cpuCount() { return this.cpuMs.n; }
  cpuPercentile(p: number): number {
    if (!this.cpuMs.n) return 0;
    const t = this.cpuMs.sorted();
    return t[Math.min(this.cpuMs.n - 1, Math.floor(this.cpuMs.n * p))];
  }

  /** Persentil-p (0..1) interval frame jendela terakhir. */
  percentile(p: number): number {
    if (!this.frames.n) return 0;
    const t = this.frames.sorted();
    return t[Math.min(this.frames.n - 1, Math.floor(this.frames.n * p))];
  }

  /** Refresh: persentil 10 tick (≈ satu vsync, tetap benar walau banyak frame telat) lalu median tick ≤ 1.5 × itu —
   *  p10 sendiri bias ke bawah oleh jitter timestamp (90 Hz terbaca 92). */
  estimateRefresh(): number {
    const n = this.ticks.n;
    if (!n) return this.refreshMs;
    const t = this.ticks.sorted(), lo = t[Math.floor(n * 0.1)], lim = lo * 1.5;
    let k = 0;
    while (k < n && t[k] <= lim) k++;
    return k ? t[k >> 1] : lo;
  }

  /** Batas "tepat waktu": telat ≥ 1 vsync dari target. */
  private get lateMs() { return this.targetMs + this.refreshMs * 0.5; }

  /** Pecahan frame (seluruh jendela) yang tampil tepat waktu. */
  onTimeFrac(): number {
    const f = this.frames;
    if (!f.n) return 1;
    const lim = this.lateMs;
    let ok = 0;
    for (let k = 0; k < f.n; k++) if (f.buf[k] < lim) ok++;
    return ok / f.n;
  }

  /** Pecahan dari n frame TERAKHIR yang telat ≥ 1 vsync (masukan resolusi dinamis). */
  lateFrac(n: number): number {
    const f = this.frames, m = Math.min(n, f.n);
    if (!m) return 0;
    const lim = this.lateMs;
    let late = 0;
    for (let k = f.n - m; k < f.n; k++) if (f.at(k) >= lim) late++;
    return late / m;
  }

  /** Rata-rata interval frame (ms) jendela terakhir. */
  avg(): number {
    const f = this.frames;
    if (!f.n) return 0;
    let s = 0;
    for (let k = 0; k < f.n; k++) s += f.buf[k];
    return s / f.n;
  }

  /** Sampel frame ke-k dari yang terlama (0) ke terbaru (count − 1) — untuk grafik. */
  at(k: number): number { return this.frames.at(k); }
  get count() { return this.frames.n; }

  reset() { this.frames.reset(); this.ticks.reset(); this.cpuMs.reset(); this.sinceEstimate = 0; }
}
