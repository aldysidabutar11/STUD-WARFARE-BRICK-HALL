// src/ui/Crosshair.ts — crosshair kustom (permintaan pengguna; default = GDD §13: 4 garis 8×2 px putih, outline 1 px, gap dinamis).
//   Bentuk : Klasik (+), Klasik + titik, Titik, Lingkaran, Bentuk T (tanpa garis atas).
//   Perilaku: Statis (ukuran tetap), Dinamis (gap/jari-jari ikut spread senjata — gerak, di udara, jongkok, ADS — + mekar
//            sesaat saat menembak), Hybrid (garis dalam & titik tetap, garis luar/lingkaran yang mengembang).
// Satu kelas dipakai HUD dan pratinjau langsung di Pengaturan. Angka efek di XCFG.hud (xhFire*, xhSplitGap).
import { XCFG } from '../config/extraConfig';
import type { Settings } from './Settings';

export type XhShape = 'cross' | 'crossdot' | 'dot' | 'circle' | 't';
export type XhMode = 'static' | 'dynamic' | 'hybrid';
export type XhConfig = Pick<Settings, 'xhShape' | 'xhMode' | 'xhColor' | 'xhAlpha' | 'xhLen' | 'xhThick' | 'xhGap' | 'xhDotSize'
  | 'xhDotAlpha' | 'xhCircleR' | 'xhCircleThick' | 'xhOutline' | 'xhOutlineThick' | 'xhOutlineAlpha' | 'xhDynMult'>;

export const XH_SHAPES: readonly [XhShape, string][] = [
  ['cross', 'Klasik (+)'], ['crossdot', 'Klasik + titik'], ['dot', 'Titik'], ['circle', 'Lingkaran'], ['t', 'Bentuk T'],
];
export const XH_MODES: readonly [XhMode, string][] = [['dynamic', 'Dinamis (GDD)'], ['static', 'Statis'], ['hybrid', 'Hybrid']];
/** Warna cepat (bisa juga pilih warna bebas + transparansi). */
export const XH_COLORS: readonly [string, string][] = [
  ['#3ce4ff', 'Cyan'], ['#39ff14', 'Hijau neon'], ['#f5e642', 'Kuning'], ['#ffffff', 'Putih'], ['#ff3b30', 'Merah'], ['#ff4df0', 'Magenta'],
];

/** Contoh preset (nilai di luar daftar ini mengikuti setelan saat ini). */
export const XH_PRESETS: readonly { id: string; name: string; v: Partial<XhConfig> }[] = [
  { id: 'gdd', name: 'Klasik GDD (default)', v: { xhShape: 'cross', xhMode: 'dynamic', xhColor: '#ffffff', xhAlpha: 1, xhLen: 8, xhThick: 2,
    xhGap: 0, xhOutline: true, xhOutlineThick: 1, xhOutlineAlpha: 0.75, xhDynMult: 1 } },
  { id: 'comp', name: 'Kompetitif (kecil, statis)', v: { xhShape: 'crossdot', xhMode: 'static', xhColor: '#39ff14', xhAlpha: 1, xhLen: 5,
    xhThick: 2, xhGap: -1, xhDotSize: 2, xhDotAlpha: 1, xhOutline: true, xhOutlineThick: 1, xhOutlineAlpha: 0.9 } },
  { id: 'dot', name: 'Titik saja', v: { xhShape: 'dot', xhMode: 'static', xhColor: '#3ce4ff', xhDotSize: 4, xhDotAlpha: 1, xhOutline: true,
    xhOutlineThick: 1, xhOutlineAlpha: 0.9 } },
  { id: 'ring', name: 'Lingkaran (hipfire)', v: { xhShape: 'circle', xhMode: 'dynamic', xhColor: '#ffffff', xhAlpha: 0.9, xhCircleR: 9,
    xhCircleThick: 2, xhDotSize: 2, xhDotAlpha: 1, xhOutline: true, xhOutlineThick: 1, xhOutlineAlpha: 0.7, xhDynMult: 1 } },
  { id: 'split', name: 'Hybrid (garis luar mengembang)', v: { xhShape: 'crossdot', xhMode: 'hybrid', xhColor: '#f5e642', xhAlpha: 1,
    xhLen: 6, xhThick: 2, xhGap: 0, xhDotSize: 2, xhDotAlpha: 1, xhOutline: true, xhOutlineThick: 1, xhOutlineAlpha: 0.8, xhDynMult: 1.2 } },
  { id: 'tee', name: 'Bentuk T', v: { xhShape: 't', xhMode: 'dynamic', xhColor: '#ff3b30', xhAlpha: 1, xhLen: 7, xhThick: 2, xhGap: 1,
    xhOutline: true, xhOutlineThick: 1, xhOutlineAlpha: 0.8, xhDynMult: 1 } },
];

export interface XhGeometry { inner: number; outer: number; radius: number; outerLen: number }

/**
 * Geometri (piksel) dari setelan + spread senjata (px) + mekar tembakan (px):
 *   statis: semua tetap · dinamis: gap & jari-jari = dasar + pengali·(spread + mekar) · hybrid: garis dalam tetap,
 *   garis luar (di belakang garis dalam) & lingkaran yang mengembang.
 */
export function xhGeometry(c: XhConfig, spreadPx: number, bloomPx: number, out: XhGeometry): XhGeometry {
  const H = XCFG.hud, dyn = c.xhMode === 'static' ? 0 : Math.max(0, spreadPx + bloomPx) * c.xhDynMult;
  const g0 = Math.max(0, H.crosshairBaseGap + c.xhGap);
  out.inner = c.xhMode === 'dynamic' ? g0 + dyn : g0;
  out.outer = g0 + c.xhLen + H.xhSplitGap + dyn;
  out.outerLen = Math.max(2, Math.round(c.xhLen * 0.6));
  out.radius = c.xhCircleR + dyn;
  return out;
}

const rgba = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};

export class Crosshair {
  readonly el: HTMLDivElement;
  private cfg: XhConfig | null = null;
  private spreadPx = 0;
  private bloom = 0;
  private key = '';
  private geo: XhGeometry = { inner: 0, outer: 0, radius: 0, outerLen: 0 };

  constructor() {
    this.el = document.createElement('div');
    this.el.className = 'xh';
    this.el.innerHTML = '<i class="t"></i><i class="b"></i><i class="l"></i><i class="r"></i>'
      + '<i class="ot"></i><i class="ob"></i><i class="ol"></i><i class="or"></i><i class="c"></i><i class="d"></i>';
  }

  /** Terapkan setelan (bentuk, perilaku, warna RGBA, outline, ukuran). */
  apply(c: XhConfig) {
    this.cfg = { ...c };
    const st = this.el.style, d = this.el.dataset;
    st.setProperty('--xc', rgba(c.xhColor, c.xhAlpha));
    st.setProperty('--len', c.xhLen + 'px'); st.setProperty('--th', c.xhThick + 'px');
    st.setProperty('--dot', c.xhDotSize + 'px'); st.setProperty('--dota', String(c.xhDotAlpha));
    st.setProperty('--ct', c.xhCircleThick + 'px');
    st.setProperty('--olw', c.xhOutlineThick + 'px'); st.setProperty('--ola', String(c.xhOutlineAlpha));
    d.shape = c.xhShape; d.mode = c.xhMode; d.ol = String(c.xhOutline);
    this.key = '';
    this.update(0);
  }

  /** Spread senjata saat ini dalam piksel layar (dipanggil HUD tiap frame; pratinjau memakai nilai simulasi). */
  setSpread(px: number) { this.spreadPx = px; }

  /** Mekar sesaat (tiap tembakan pemain). */
  kick(px: number = XCFG.hud.xhFireKick) { this.bloom = Math.min(XCFG.hud.xhFireMax, this.bloom + px); }

  /** Per frame: mekar pulih, posisi elemen diperbarui hanya bila berubah. */
  update(dt: number) {
    if (!this.cfg) return;
    this.bloom = Math.max(0, this.bloom - XCFG.hud.xhFireRecover * dt);
    const g = xhGeometry(this.cfg, this.spreadPx, this.bloom, this.geo);
    const key = `${g.inner.toFixed(1)}|${g.outer.toFixed(1)}|${g.radius.toFixed(1)}|${g.outerLen}`;
    if (key === this.key) return;
    this.key = key;
    const st = this.el.style;
    st.setProperty('--gap', g.inner.toFixed(1) + 'px'); st.setProperty('--ogap', g.outer.toFixed(1) + 'px');
    st.setProperty('--olen', g.outerLen + 'px'); st.setProperty('--r', g.radius.toFixed(1) + 'px');
  }
}
