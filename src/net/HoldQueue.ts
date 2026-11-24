// src/net/HoldQueue.ts — antrean pesan host selama klien online memuat map match (Game.startNetClient). Murni (tanpa DOM/jaringan)
// → urutan putar ulang & pembatalan diuji di tests/net.test.ts.

/**
 * Penahan pesan berurutan. Selama `holding`, run(fn) mengantre; release(token, ready) melepas penahanan → ready() (mis. mulai
 * match di map yang baru dimuat) lalu antrean diputar berurutan LEWAT run(): bila ready() / pesan yang diputar memulai penahanan
 * baru (mis. pesan 'start' kedua dengan map lain), sisa pesan ikut ditahan lagi — urutan tetap terjaga. cancel() (keluar room /
 * koneksi putus) membuang antrean; token lama tidak bisa dilepas lagi.
 */
export class HoldQueue {
  private q: (() => void)[] | null = null;

  get holding(): boolean { return this.q !== null; }
  get size(): number { return this.q?.length ?? 0; }

  /** Proses sekarang, atau antre bila sedang menahan. */
  run(fn: () => void) { if (this.q) this.q.push(fn); else fn(); }

  /** Mulai menahan (antrean lama dibuang). Token = penahanan ini (untuk release). */
  hold(): object { this.q = []; return this.q; }

  /** Lepas penahanan `token`: false (tanpa memanggil apa pun) bila sudah dibatalkan / diganti penahanan lain. ready() dipanggil
   *  di luar penahanan, lalu antrean diputar (juga bila ready() melempar — error diteruskan setelahnya). */
  release(token: object, ready: () => void): boolean {
    if (this.q === null || this.q !== token) return false;
    const items = this.q;
    this.q = null;
    try { ready(); } finally { for (const f of items) this.run(f); }
    return true;
  }

  /** Batalkan penahanan (antrean dibuang). true = ada yang dibatalkan. */
  cancel(): boolean {
    if (!this.q) return false;
    this.q = null;
    return true;
  }
}
