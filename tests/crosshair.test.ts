// tests/crosshair.test.ts — crosshair kustom: data/migrasi setelan, preset, geometri Statis / Dinamis / Hybrid.
import { describe, expect, it } from 'vitest';
import { validate } from '../src/ui/Settings';
import { XH_PRESETS, xhGeometry, type XhConfig } from '../src/ui/Crosshair';
import { XCFG } from '../src/config/extraConfig';

const G = () => ({ inner: 0, outer: 0, radius: 0, outerLen: 0 });
const base = (o: Partial<XhConfig> = {}) => ({ ...validate(null), ...o }) as XhConfig;

describe('Crosshair: data & setelan', () => {
  it('setelan lama dimigrasi (titik tengah → Klasik + titik, panjang 0 → Titik, statis → Statis)', () => {
    expect(validate({ xhDot: true } as never).xhShape).toBe('crossdot');
    expect(validate({ xhLen: 0 } as never).xhShape).toBe('dot');
    expect(validate({ xhDynamic: false } as never).xhMode).toBe('static');
    expect(validate(null).xhShape).toBe('cross');
  });
  it('warna bebas #rrggbb diterima (huruf kecil), selain itu kembali putih; rentang dijepit', () => {
    expect(validate({ xhColor: '#3CE4FF' }).xhColor).toBe('#3ce4ff');
    expect(validate({ xhColor: 'rgb(1,2,3)' }).xhColor).toBe('#ffffff');
    const s = validate({ xhAlpha: 0, xhDotSize: 99, xhCircleR: 1, xhOutlineThick: 9, xhDynMult: -2, xhShape: 'star' as never, xhMode: 'x' as never });
    expect([s.xhAlpha, s.xhDotSize, s.xhCircleR, s.xhOutlineThick, s.xhDynMult, s.xhShape, s.xhMode]).toEqual([0.2, 10, 3, 3, 0, 'cross', 'dynamic']);
  });
  it('semua preset valid (lolos validasi tanpa berubah)', () => {
    for (const p of XH_PRESETS) {
      const v = validate({ ...validate(null), ...p.v });
      for (const [k, val] of Object.entries(p.v)) expect(v[k as keyof typeof v], `${p.id}.${k}`).toEqual(val);
    }
  });
});

describe('Crosshair: perilaku', () => {
  const g0 = XCFG.hud.crosshairBaseGap;
  it('Statis: tidak berubah oleh gerak/tembakan', () => {
    const a = xhGeometry(base({ xhMode: 'static' }), 0, 0, G()), b = xhGeometry(base({ xhMode: 'static' }), 40, 10, G());
    expect(b).toEqual(a);
    expect(a.inner).toBe(g0);
  });
  it('Dinamis: celah & lingkaran = dasar + pengali × (spread + mekar)', () => {
    const g = xhGeometry(base({ xhMode: 'dynamic', xhDynMult: 1.5, xhGap: 2 }), 20, 4, G());
    expect(g.inner).toBeCloseTo(g0 + 2 + 1.5 * 24, 9);
    expect(g.radius).toBeCloseTo(10 + 1.5 * 24, 9);
  });
  it('Hybrid: garis dalam tetap, garis luar & lingkaran mengembang', () => {
    const c = base({ xhMode: 'hybrid', xhLen: 6 });
    const idle = xhGeometry(c, 0, 0, G()), firing = xhGeometry(c, 30, 8, G());
    expect(firing.inner).toBe(idle.inner);
    expect(idle.outer).toBe(g0 + 6 + XCFG.hud.xhSplitGap);
    expect(firing.outer - idle.outer).toBeCloseTo(38, 9);
    expect(firing.radius).toBeGreaterThan(idle.radius);
  });
});
