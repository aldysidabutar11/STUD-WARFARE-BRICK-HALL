// tests/killStars.test.ts — bintang kill di kanan bar HP (ui/KillStars.ts; permintaan pengguna 2026-11-27): kill beruntun nyawa ini,
// bolong = headshot, mati / respawn / ronde baru → kosong, maks 10 + "+N", kelompok per 5, bentuk bintang, setelan killStars.
import { describe, expect, it } from 'vitest';
import CSS from '../src/ui/hud.css?raw';
import { XCFG } from '../src/config/extraConfig';
import { KillStarTrack, killEarnsStar, starGeometry, starView } from '../src/ui/KillStars';
import { DEFAULTS, validate } from '../src/ui/Settings';

const XK = XCFG.hud.killStars;

describe('bintang kill: hitungan nyawa ini', () => {
  it('kill biasa & headshot berurutan; streak sama → tidak berubah', () => {
    const t = new KillStarTrack();
    t.add(false); t.add(true); t.add(false);
    expect(t.sync(true, 3)).toBe(false);
    expect(t.kills).toEqual([false, true, false]);
  });

  it('mati → kosong; kill yang dikreditkan saat mati tidak memunculkan bintang; respawn mulai kosong', () => {
    const t = new KillStarTrack();
    t.add(true); t.add(false); t.add(false); t.add(false); t.add(true);
    expect(t.sync(false, 0)).toBe(true);       // TeamManager.kill: korban.streak = 0
    expect(t.kills).toEqual([]);
    expect(t.sync(false, 1)).toBe(false);      // granat meledak setelah mati → streak 1 di entitas yang mati
    expect(t.kills).toEqual([]);
    expect(t.sync(true, 0)).toBe(false);       // SpawnSystem.applySpawn: streak = 0
    t.add(false);
    expect(t.sync(true, 1)).toBe(false);
    expect(t.kills).toEqual([false]);
  });

  it('ronde Eliminasi baru (selamat, semua di-spawn ulang → streak 0) → kosong', () => {
    const t = new KillStarTrack();
    t.add(true); t.add(false);
    expect(t.sync(true, 0)).toBe(true);
    expect(t.kills).toEqual([]);
  });

  it('lanjut match (pindah host / bergabung ulang): streak dari cadangan → bintang biasa ditambahkan, pola yang ada tetap', () => {
    const a = new KillStarTrack();
    expect(a.sync(true, 4)).toBe(true);
    expect(a.kills).toEqual([false, false, false, false]);
    const b = new KillStarTrack();
    b.add(true);
    b.sync(true, 3);
    expect(b.kills).toEqual([true, false, false]);
    b.sync(true, 2);                            // cadangan lebih lama dari kill terakhir → ikut streak
    expect(b.kills).toEqual([true, false]);
  });

  it('nilai streak asing → 0', () => {
    const t = new KillStarTrack();
    t.add(false);
    expect(t.sync(true, Number.NaN)).toBe(true);
    expect(t.kills).toEqual([]);
    expect(t.sync(true, -3)).toBe(false);
    expect(t.sync(true, 2.9)).toBe(true);
    expect(t.kills.length).toBe(2);
  });
});

describe('bintang kill: event kill → bintang', () => {
  const me = { id: 3, alive: true, team: 'blue' };
  it('kill sendiri atas musuh selagi hidup', () => {
    expect(killEarnsStar({ killerId: 3, victimId: 7 }, me, 'red')).toBe(true);
  });
  it('bukan: kill orang lain, bunuh diri/jatuh, rekan setim, pemain sudah mati, tanpa pemain, korban tak dikenal', () => {
    expect(killEarnsStar({ killerId: 4, victimId: 7 }, me, 'red')).toBe(false);
    expect(killEarnsStar({ killerId: 3, victimId: 3 }, me, 'blue')).toBe(false);
    expect(killEarnsStar({ killerId: 3, victimId: 2 }, me, 'blue')).toBe(false);
    expect(killEarnsStar({ killerId: 3, victimId: 7 }, { ...me, alive: false }, 'red')).toBe(false);
    expect(killEarnsStar({ killerId: 3, victimId: 7 }, null, 'red')).toBe(false);
    expect(killEarnsStar({ killerId: 3, victimId: 7 }, me, undefined)).toBe(false);
  });
});

describe('bintang kill: tampilan', () => {
  it('maks 10 bintang (kill pertama, pola headshot tetap) + sisanya angka; kelompok per 5', () => {
    expect(XK.max).toBe(10);
    expect(XK.group).toBe(5);
    const seven = [false, true, false, false, true, false, false];
    expect(starView(seven, XK.max)).toEqual({ stars: seven, more: 0 });
    const k13 = Array.from({ length: 13 }, (_, i) => i % 3 === 1);
    const v = starView(k13, XK.max);
    expect(v.stars).toEqual(k13.slice(0, 10));
    expect(v.more).toBe(3);
    expect(starView(k13, 0)).toEqual({ stars: [], more: 13 });
    expect(starView([], XK.max)).toEqual({ stars: [], more: 0 });
  });

  it('bentuk bintang: 10 titik, simetris, selebar kotak, tinggi di tengah kotak', () => {
    const g = starGeometry(XK.inner);
    expect(g.pts.length).toBe(10);
    expect(g.clip.match(/%/g)?.length).toBe(20);
    for (const [x, y] of g.pts) {
      expect(x).toBeGreaterThanOrEqual(-1e-9); expect(x).toBeLessThanOrEqual(100 + 1e-9);
      expect(y).toBeGreaterThanOrEqual(0); expect(y).toBeLessThanOrEqual(100);
    }
    for (let k = 1; k < 10; k++) {          // cermin kiri-kanan terhadap x = 50
      expect(g.pts[k][0] + g.pts[10 - k][0]).toBeCloseTo(100, 6);
      expect(g.pts[k][1]).toBeCloseTo(g.pts[10 - k][1], 6);
    }
    const xs = g.pts.map(p => p[0]), ys = g.pts.map(p => p[1]);
    expect(Math.min(...xs)).toBeCloseTo(0, 6);
    expect(Math.max(...xs)).toBeCloseTo(100, 6);
    expect(Math.min(...ys)).toBeCloseTo(100 - Math.max(...ys), 6);   // margin atas = bawah
    expect(g.pts[0]).toEqual([50, expect.any(Number)]);              // ujung atas di tengah
    expect(g.cy).toBeGreaterThan(50);                                // pusat di bawah tengah kotak (ujung bawah lebih pendek)
    const inner = Math.hypot(g.pts[1][0] - 50, g.pts[1][1] - g.cy), outer = Math.hypot(g.pts[0][0] - 50, g.pts[0][1] - g.cy);
    expect(inner / outer).toBeCloseTo(XK.inner, 3);
  });

  it('CSS: bentuk dari --ks-clip; sisi timbul & lubang headshot berpusat di pusat bintang yang sama', () => {
    expect(CSS).toContain('clip-path: var(--ks-clip)');
    const centers = CSS.match(/at 50% var\(--ks-cy\)/g) ?? [];
    expect(centers.length).toBeGreaterThanOrEqual(5);   // conic biasa + headshot (cincin, conic, mask -webkit & standar)
    expect(CSS).not.toMatch(/\.ks[^{]*\{[^}]*url\(/);   // tanpa file gambar
  });
});

describe('setelan killStars', () => {
  it('bawaan ON, tersimpan, nilai asing → bawaan', () => {
    expect(DEFAULTS.killStars).toBe(true);
    expect(validate(null).killStars).toBe(true);
    expect(validate({ killStars: false }).killStars).toBe(false);
    expect(validate({ killStars: 'ya' as unknown as boolean }).killStars).toBe(true);
  });
});
