// src/core/GpuTimer.ts — waktu GPU per frame (EXT_disjoint_timer_query_webgl2). Waktu JS saja tidak cukup: perintah WebGL
// dikerjakan GPU secara asinkron, jadi frame bisa telat vsync karena GPU walau CPU cuma 4 ms (terukur: HIGH 11 ms GPU di
// layar 90 Hz = batas 11.1 ms). Hasil query baru tersedia 1–3 frame kemudian; dibaca tanpa menunggu (non-blocking).
// Tidak tersedia di semua browser → available = false dan pemanggil memakai cara lain.

interface TimerExt { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number }

const RING = 120;

export class GpuTimer {
  private ext: TimerExt | null;
  private readonly pending: WebGLQuery[] = [];
  private readonly free: WebGLQuery[] = [];
  private active: WebGLQuery | null = null;
  private readonly ring = new Float32Array(RING);
  private readonly tmp = new Float32Array(RING);
  private n = 0;
  private i = 0;
  /** Pemakai yang sedang membutuhkan pengukuran (overlay F3, resolusi dinamis). Kosong = tidak ada query sama sekali. */
  private readonly users = new Set<string>();
  get enabled() { return this.users.size > 0; }
  need(user: string, on: boolean) { if (on) this.users.add(user); else this.users.delete(user); }
  /** Rata-rata bergerak waktu GPU (ms). */
  avgMs = 0;

  constructor(private gl: WebGL2RenderingContext) {
    this.ext = gl.getExtension('EXT_disjoint_timer_query_webgl2') as TimerExt | null;
  }

  /** Konteks WebGL pulih: query lama sudah tidak berlaku & ekstensi harus diminta ulang. */
  restore(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.ext = gl.getExtension('EXT_disjoint_timer_query_webgl2') as TimerExt | null;
    this.pending.length = 0; this.free.length = 0; this.active = null;
    this.reset();
  }

  get available() { return this.ext !== null; }
  /** Jumlah sampel valid di jendela. */
  get count() { return this.n; }

  begin() {
    if (!this.enabled || !this.ext || this.active) return;
    if (this.pending.length > 6) return;                  // GPU sangat tertinggal: jangan menumpuk query
    const q = this.free.pop() ?? this.gl.createQuery();
    if (!q) return;
    this.gl.beginQuery(this.ext.TIME_ELAPSED_EXT, q);
    this.active = q;
  }

  end() {
    if (!this.ext || !this.active) return;
    this.gl.endQuery(this.ext.TIME_ELAPSED_EXT);
    this.pending.push(this.active);
    this.active = null;
    this.poll();
  }

  /** Persentil-p (0..1) waktu GPU jendela terakhir (ms). */
  percentile(p: number): number {
    if (!this.n) return 0;
    const t = this.tmp.subarray(0, this.n);
    t.set(this.ring.subarray(0, this.n)); t.sort();
    return t[Math.min(this.n - 1, Math.floor(this.n * p))];
  }

  reset() { this.n = 0; this.i = 0; this.avgMs = 0; }

  private poll() {
    const gl = this.gl, ext = this.ext!;
    while (this.pending.length) {
      const q = this.pending[0];
      if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) break;
      this.pending.shift();
      // disjoint = jam GPU tidak bisa dipercaya (ganti daya/clock) → buang sampel
      if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) {
        const ms = (gl.getQueryParameter(q, gl.QUERY_RESULT) as number) / 1e6;
        this.ring[this.i] = ms; this.i = (this.i + 1) % RING;
        if (this.n < RING) this.n++;
        this.avgMs = this.n === 1 ? ms : this.avgMs + (ms - this.avgMs) * 0.1;
      }
      this.free.push(q);
    }
  }
}
