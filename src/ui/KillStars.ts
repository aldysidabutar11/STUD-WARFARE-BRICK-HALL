// src/ui/KillStars.ts — "bintang kill" (permintaan pengguna 2026-11-27; bukan GDD): kill beruntun NYAWA INI di kanan bar HP.
// Bintang emas = kill, bintang bolong di tengah (lubang peluru) = kill headshot. Mati / respawn / ronde Eliminasi baru → kosong
// (bintang memudar berurutan). Maks XCFG.hud.killStars.max bintang, sisanya angka "+N"; jarak kecil tiap `group` bintang.
// Jumlah = Entity.streak (hitungan yang sama dengan medali streak & papan "Streak Terpanjang", di host & klien online); pola
// headshot dari event 'kill'. Bentuk = clip-path dari `starGeometry` (100% prosedural, tanpa file gambar); CSS di hud.css (.kstars).
import { XCFG } from '../config/extraConfig';

const XK = XCFG.hud.killStars;

/** Logika murni (diuji): kill nyawa ini berurutan, true = headshot. */
export class KillStarTrack {
  readonly kills: boolean[] = [];

  add(headshot: boolean) { this.kills.push(headshot); }

  clear() { this.kills.length = 0; }

  /**
   * Samakan dengan hitungan streak entitas (sumber kebenaran): mati → kosong; respawn / ronde baru (streak 0) → kosong; lanjut match
   * setelah pindah host / bergabung ulang (streak > daftar) → ditambah bintang biasa (pola headshot tidak ikut cadangan).
   * @returns true bila daftar berubah
   */
  sync(alive: boolean, streak: number): boolean {
    const n = alive && Number.isFinite(streak) ? Math.max(0, Math.floor(streak)) : 0;
    if (n === this.kills.length) return false;
    if (n < this.kills.length) this.kills.length = n;
    else while (this.kills.length < n) this.kills.push(false);
    return true;
  }
}

/**
 * Event 'kill' → bintang baru untuk pemain? Hanya kill SENDIRI atas MUSUH selagi masih hidup — kill yang dikreditkan setelah pemain
 * mati (granat meledak belakangan, korban jatuh ≤ 5 s setelah ditembak) milik nyawa yang sudah selesai; bunuh diri bukan kill.
 */
export function killEarnsStar(e: { killerId: number; victimId: number }, me: { id: number; alive: boolean; team: string } | null,
  victimTeam: string | undefined): boolean {
  return !!me && me.alive && e.killerId === me.id && e.victimId !== me.id && victimTeam !== undefined && victimTeam !== me.team;
}

/** Yang digambar: `max` bintang pertama + sisanya sebagai angka "+N". */
export function starView(kills: readonly boolean[], max: number): { stars: boolean[]; more: number } {
  const m = Math.max(0, Math.floor(max));
  return { stars: kills.slice(0, m), more: Math.max(0, kills.length - m) };
}

/**
 * Bintang 5 sudut di kotak 0…100%: selebar kotak (ujung kiri/kanan di x 0 & 100), tinggi dipusatkan (margin atas = bawah),
 * ujung atas di tengah. `cy` = pusat bintang (%, di bawah 50 karena ujung bawah lebih pendek dari ujung atas) — pusat sisi timbul
 * (conic-gradient) & lubang headshot memakai titik yang sama.
 */
export function starGeometry(inner: number): { clip: string; cy: number; pts: [number, number][] } {
  const R = 50 / Math.cos(Math.PI / 10);                  // ujung kiri/kanan (sudut ±18° dari horizontal) tepat di tepi kotak
  const cy = 50 + (R * (1 - Math.sin((3 * Math.PI) / 10))) / 2;   // atas cy − R, bawah cy + R·sin 54° → margin sama
  const pts: [number, number][] = [];
  for (let k = 0; k < 10; k++) {
    const a = -Math.PI / 2 + (k * Math.PI) / 5, rad = k % 2 ? R * inner : R;
    pts.push([50 + Math.cos(a) * rad, cy + Math.sin(a) * rad]);
  }
  const f = (v: number) => `${+Math.min(100, Math.max(0, v)).toFixed(2)}%`;
  return { clip: `polygon(${pts.map(([x, y]) => `${f(x)} ${f(y)}`).join(', ')})`, cy: +cy.toFixed(2), pts };
}

const GEO = starGeometry(XK.inner);

/** Widget DOM (dipasang Hud di dalam .hp, setelah bar HP). */
export class KillStars {
  readonly el = document.createElement('div');
  private readonly list = document.createElement('span');
  private readonly moreEl = document.createElement('b');
  private readonly track = new KillStarTrack();
  /** Bintang yang sedang ada di DOM (true = headshot). */
  private dom: boolean[] = [];
  private more = 0;
  private outTimer = 0;
  private enabled = true;

  constructor() {
    this.el.className = 'kstars';
    this.list.className = 'ks-list';
    this.moreEl.className = 'ks-more';
    this.el.append(this.list, this.moreEl);
    const st = this.el.style;
    st.setProperty('--ks-clip', GEO.clip);
    st.setProperty('--ks-cy', `${GEO.cy}%`);
    st.setProperty('--ks-pop', `${XK.popMs}ms`);
    st.setProperty('--ks-out', `${XK.outMs}ms`);
    st.setProperty('--ks-stagger', `${XK.outStaggerMs}ms`);
  }

  /** Jumlah bintang + headshot saat ini (diagnostik / uji browser). */
  get state() { return { kills: [...this.track.kills], dom: [...this.dom], more: this.more, out: this.el.classList.contains('out') }; }

  /** Kill oleh pemain yang masih hidup (Hud memfilter event 'kill'). */
  onKill(headshot: boolean) { this.track.add(headshot); this.render(); }

  /** Tiap frame: sinkron dengan Entity.streak (mati → pudar) & setelan `killStars`. */
  update(enabled: boolean, alive: boolean, streak: number) {
    if (enabled !== this.enabled) { this.enabled = enabled; this.el.classList.toggle('off', !enabled); }
    if (this.track.sync(alive, streak)) this.render();
  }

  /** Match baru: kosong seketika (tanpa animasi pudar). */
  reset() { this.track.clear(); this.clearDom(); }

  private clearDom() {
    clearTimeout(this.outTimer); this.outTimer = 0;
    this.el.classList.remove('out');
    this.list.textContent = ''; this.dom = [];
    this.more = 0; this.moreEl.textContent = ''; this.moreEl.className = 'ks-more';
  }

  private render() {
    const v = starView(this.track.kills, XK.max);
    if (!v.stars.length) {
      // mati / respawn / ronde baru: bintang memudar berurutan lalu dibuang (sekali saja)
      if (!this.dom.length || this.outTimer) return;
      if (!this.enabled) { this.clearDom(); return; }
      this.el.classList.add('out');
      this.outTimer = window.setTimeout(() => this.clearDom(), XK.outMs + XK.outStaggerMs * (this.dom.length - 1) + 40);
      return;
    }
    if (this.outTimer) this.clearDom();   // bintang nyawa lama masih memudar → bersihkan dulu
    // bintang lama tetap (urutan sama) → hanya bintang baru yang muncul beranimasi; selain itu bangun ulang tanpa animasi
    let same = this.dom.length <= v.stars.length;
    for (let i = 0; same && i < this.dom.length; i++) same = this.dom[i] === v.stars[i];
    if (!same) { this.list.textContent = ''; this.dom = []; }
    for (let i = this.dom.length; i < v.stars.length; i++) {
      const s = document.createElement('i');
      s.className = 'ks' + (v.stars[i] ? ' hs' : '') + (i > 0 && i % XK.group === 0 ? ' gs' : '') + (same ? ' pop' : '');
      s.style.setProperty('--i', String(i));
      s.appendChild(document.createElement('b'));
      this.list.appendChild(s);
      this.dom.push(v.stars[i]);
    }
    if (v.more !== this.more) {
      const up = v.more > this.more;
      this.more = v.more;
      this.moreEl.textContent = v.more ? `+${v.more}` : '';
      this.moreEl.className = 'ks-more';
      if (up) { void this.moreEl.offsetWidth; this.moreEl.className = 'ks-more pop'; }   // ulang animasi muncul
    }
  }
}
