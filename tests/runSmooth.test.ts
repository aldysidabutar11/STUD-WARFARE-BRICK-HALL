// tests/runSmooth.test.ts — kehalusan lari (laporan pemain 2026-11-26: "lari terasa cepat → tiba-tiba pelan → cepat lagi, terus
// seperti itu"; terjadi online & offline, semua map). PlayerController asli + KCC Rapier asli:
// 1) lantai datar: gaya tempel tanah ke bawah membuat KCC sesekali membatalkan gerak horizontal (±2.5% tick sprint, 1–2× per detik)
//    → kecepatan jatuh ke 0 lalu berakselerasi lagi ±0.15 s;
// 2) kaki ramp: aturan "dinding menahan → kecepatan nyata" ikut memotong kecepatan ±40% padahal yang disentuh lereng yang bisa didaki;
// 3) puncak ramp: KCC melayang 2–4 tick → batas kecepatan udara lama (3.0, bukan kecepatan saat lepas landas §3.4) & sprint mati sesaat.
// 4) tabrakan karakter (keputusan pengguna 2026-11-27, menyimpang dari GDD §10.1): rekan setim saling TEMBUS — online, kapsul rekan
//    yang berdesakan keluar spawn membuat prediksi klien (rekan tampil ±0.1 s di masa lalu) berbeda dari host → koreksi posisi berulang.
//    Karakter tim lawan tetap saling menahan; granat & pagar BARRIER tetap mengenai kedua tim.
import { beforeAll, describe, expect, it } from 'vitest';
import '../src/world/maps/registry';
import { physics } from '../src/physics/Physics';
import { bostonColliders } from '../src/world/maps/boston/colliders';
import { cuboidCollider } from '../src/world/maps/shared';
import { PlayerController, type MoveIntent } from '../src/entities/PlayerController';
import { G, GROUPS, charGroups, moveQuery } from '../src/physics/groups';
import { CFG } from '../src/config/gameConfig';
import { moveTarget } from '../src/combat/Damage';
import { moveFeel } from '../src/entities/moveFeel';

const DT = CFG.world.fixedStep;
const intent = (yaw: number): MoveIntent => ({ ix: 0, iz: 1, yaw, jump: false, sprint: true, crouch: false, ads: false, cooking: false,
  wantFire: false, speedMult: 1 });

/** Sprint lurus `ticks` tick; kembalikan kecepatan horizontal per tick + posisi. */
function sprint(x: number, y: number, z: number, yaw: number, ticks: number) {
  const c = new PlayerController(999, x, y, z);
  c.teleport(x, y, z);
  const v: number[] = [], pos: [number, number, number][] = [], air: boolean[] = [];
  for (let i = 0; i < ticks; i++) {
    c.fixedUpdate(DT, intent(yaw), false);
    physics.world.step();
    v.push(c.speedH); pos.push([c.pos.x, c.pos.y, c.pos.z]); air.push(!c.grounded);
  }
  c.dispose();
  physics.world.step();
  return { v, pos, air };
}

let vSprint = 0;
beforeAll(async () => {
  await physics.init();
  bostonColliders();
  cuboidCollider([200, -1, -60], [420, 0, 60]);   // lantai datar sintetis jauh dari denah Boston
  physics.world.step();
  const t = { vx: 0, vz: 0 };
  moveTarget({ ix: 0, iz: 1, sprinting: true, crouched: false, ads: false }, t, moveFeel.tempo);
  vSprint = Math.hypot(t.vx, t.vz);
});

describe('kehalusan lari (PlayerController + KCC Rapier)', () => {
  it('lantai datar: sprint 15 s tanpa satu tick pun "macet" — kecepatan tetap penuh setelah berakselerasi', () => {
    const r = sprint(205, 0, 0, -Math.PI / 2, 900);   // +X sepanjang ±170 u
    expect(vSprint).toBeGreaterThan(11);
    const after = r.v.slice(15);                        // 0 → penuh ±0.15 s (akselerasi GDD 80 u/s²)
    expect(Math.min(...after)).toBeGreaterThan(vSprint * 0.99);
    expect(r.air.some(Boolean)).toBe(false);
    // jarak tempuh = kecepatan × waktu (tanpa tick yang hilang)
    let lost = 0;
    for (let i = 16; i < r.pos.length; i++) if (r.pos[i][0] - r.pos[i - 1][0] < vSprint * DT * 0.5) lost++;
    expect(lost).toBe(0);
  });

  it('Tangga Cokelat Boston naik & turun: kecepatan sprint konstan di kaki tangga, ramp, puncak & bordes', () => {
    const paths: { name: string; at: [number, number, number, number]; inWindow: (p: [number, number, number]) => boolean; yEnd: number }[] = [
      { name: 'naik flight 1 (+X) → bordes Y 5', at: [11.5, 0, 14.4, -Math.PI / 2], inWindow: (p) => p[0] < 24.4, yEnd: 5 },
      { name: 'naik flight 2 (−Z) → L4 Y 10', at: [23.75, 5, 15.5, 0], inWindow: (p) => p[2] > -0.5, yEnd: 10 },
      { name: 'turun flight 2 (+Z) → bordes Y 5', at: [23.75, 10, -1.5, Math.PI], inWindow: (p) => p[2] < 15.2, yEnd: 5 },
      { name: 'turun flight 1 (−X) → L3 Y 0', at: [24.5, 5, 14.4, Math.PI / 2], inWindow: (p) => p[0] > 12.2, yEnd: 0 },
    ];
    for (const ph of paths) {
      const r = sprint(...ph.at, 120);
      const win = r.v.filter((_, i) => i >= 15 && ph.inWindow(r.pos[i]));
      expect(win.length, ph.name).toBeGreaterThan(40);
      expect(Math.min(...win), ph.name).toBeGreaterThan(vSprint * 0.99);
      expect(r.pos[r.pos.length - 1][1], ph.name).toBeCloseTo(ph.yEnd, 0);
    }
  });

  it('lepas tanah tanpa lompat: batas kecepatan udara = kecepatan saat lepas landas (GDD §3.4), bukan sisa lompatan lama', () => {
    // sedang sprint lalu lantai "hilang" (teleport 3 u di atas lantai sintetis, masih tercatat menapak) → 6 tick pertama di udara
    const c = new PlayerController(998, 210, 3, 30);
    c.teleport(210, 3, 30);
    c.vel.set(vSprint, 0, 0);
    for (let i = 0; i < 6; i++) { c.fixedUpdate(DT, intent(-Math.PI / 2), false); physics.world.step(); }
    expect(c.grounded).toBe(false);
    expect(c.speedH).toBeGreaterThan(vSprint * 0.95);   // dulu langsung dipotong ke 3.0 u/s
    c.dispose(); physics.world.step();
  });
});

describe('tabrakan karakter: rekan setim tembus, musuh menahan', () => {
  /** Biru sprint +X 2 s ke arah karakter diam (tim `other`) yang berdiri tepat di jalurnya (x 230). */
  const charge = (other: 'blue' | 'red') => {
    const b = new PlayerController(997, 230, 0, 40, other);
    b.teleport(230, 0, 40);
    const a = new PlayerController(996, 215, 0, 40, 'blue');
    a.teleport(215, 0, 40);
    physics.world.step();
    let maxX = -Infinity, minV = Infinity, maxDz = 0;
    for (let i = 0; i < 120; i++) {
      a.fixedUpdate(DT, intent(-Math.PI / 2), false);
      physics.world.step();
      maxX = Math.max(maxX, a.pos.x); maxDz = Math.max(maxDz, Math.abs(a.pos.z - 40));
      if (i >= 15) minV = Math.min(minV, a.speedH);
    }
    const out = { x: a.pos.x, maxX, minV, maxDz };
    a.dispose(); b.dispose(); physics.world.step();
    return out;
  };

  it('rekan setim: lewat menembus tanpa melambat sedikit pun', () => {
    const r = charge('blue');
    expect(r.x).toBeGreaterThan(230 + 5);
    expect(r.minV).toBeGreaterThan(vSprint * 0.99);
    expect(r.maxDz).toBeLessThan(1e-3);
  });

  it('musuh: tetap menahan (jarak pusat ≥ dua jari-jari kapsul)', () => {
    const r = charge('red');
    expect(r.maxX).toBeLessThan(230 - 2 * CFG.player.capsuleRadius + 0.05);
    expect(r.x).toBeGreaterThan(230 - 2 * CFG.player.capsuleRadius - 0.3);   // sampai menempel, lalu tertahan
  });

  it('bit grup: query gerak menembus rekan & benda lepas; granat, pagar BARRIER & dinding tetap mengenai kapsul kedua tim', () => {
    const hits = (a: number, b: number) => ((a >>> 16) & b & 0xffff) !== 0 && ((b >>> 16) & a & 0xffff) !== 0;
    for (const [t, o] of [['blue', 'red'], ['red', 'blue']] as const) {
      expect(hits(moveQuery(t), charGroups(o))).toBe(true);
      expect(hits(moveQuery(t), charGroups(t))).toBe(false);
      expect(hits(moveQuery(t), GROUPS.STATIC)).toBe(true);
      expect(hits(moveQuery(t), GROUPS.BARRIER)).toBe(true);
      expect(hits(moveQuery(t), GROUPS.PROP)).toBe(false);
      expect(hits(moveQuery(t), GROUPS.DEBRIS)).toBe(false);
      for (const g of [GROUPS.GRENADE, GROUPS.BARRIER, GROUPS.STATIC]) expect(hits(g, charGroups(t))).toBe(true);
      expect(hits(GROUPS.DEBRIS, charGroups(t))).toBe(false);
    }
    expect(G.CHAR).toBe(G.CHAR_BLUE | G.CHAR_RED);
  });
});
