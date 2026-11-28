// tests/bombMission.test.ts — aturan murni Bomb Mission (dokumen pengguna §8.3 + keputusan pengguna 2026-11-27).
import { describe, expect, it } from 'vitest';
import { BOMB_CFG } from '../src/config/bombConfig';
import {
  attackersOf, beepInterval, bombRoundResult, c4Damage, canDefuseFrom, pickCarrier, roleOf, shouldSwapSides, siteAt,
} from '../src/game/BombRules';
import { MV_SITES } from '../src/world/maps/meridian/layout';

const R = (o: Partial<Parameters<typeof bombRoundResult>[0]>) =>
  bombRoundResult({ attAlive: 3, defAlive: 3, planted: false, detonated: false, defused: false, timeUp: false, ...o });

describe('Bomb Mission — test vector dokumen §8.3', () => {
  it('c4Damage(0, 1) / (24.8, 1) / (32, 1) = 250 / 100 / 0; okklusi fraksional (12, 1/3) = 72', () => {
    expect(c4Damage(0, 1)).toBe(250);
    expect(c4Damage(24.8, 1)).toBe(100);
    expect(c4Damage(32, 1)).toBe(0);
    expect(c4Damage(12, 1 / 3)).toBe(72);
    expect(c4Damage(40, 1)).toBe(0);
    expect(c4Damage(10, 0)).toBe(0);
  });
  it('beepInterval(25) / (15) / (6) / (2) = 1.0 / 0.5 / 0.25 / 0.12', () => {
    expect(beepInterval(25)).toBe(1.0);
    expect(beepInterval(15)).toBe(0.5);
    expect(beepInterval(6)).toBe(0.25);
    expect(beepInterval(2)).toBe(0.12);
    expect(beepInterval(0)).toBe(0.12);
  });
  it('penyerang habis sebelum tanam → bertahan menang; sesudah tanam → lanjut (wajib dijinakkan)', () => {
    expect(R({ attAlive: 0 })).toEqual({ winner: 'def', reason: 'elim' });
    expect(R({ attAlive: 0, planted: true })).toBeNull();
  });
  it('waktu 120 s habis sebelum tanam → bertahan menang (sedang menanam saat 0:00 tetap kalah)', () => {
    expect(R({ timeUp: true })).toEqual({ winner: 'def', reason: 'time' });
    expect(R({ timeUp: true, planted: true })).toBeNull();     // setelah tanam timer ronde diganti sumbu C4
  });
  it('isInBombSite(−15, 0, −20) = A, (+23, 1.5, +10) = B (koordinat dokumen; denah x2 → (−30, 0, −40) / (46, 1.5, 20)); di luar → null', () => {
    expect(siteAt(-30, 0, -40, MV_SITES)).toBe('A');
    expect(siteAt(46, 1.5, 20, MV_SITES)).toBe('B');
    expect(siteAt(0, 0, 0, MV_SITES)).toBeNull();
    expect(siteAt(46, 0, 20, MV_SITES)).toBeNull();            // lantai dasar di bawah panggung B (Y < 1.5)
  });
  it('shouldSwapSides(4) = true; tim penyerang: Merah ronde 1–4, Biru ronde 5–9', () => {
    expect(shouldSwapSides(4)).toBe(true);
    expect(shouldSwapSides(3)).toBe(false);
    expect(shouldSwapSides(5)).toBe(false);
    for (let r = 1; r <= 4; r++) { expect(attackersOf(r)).toBe('red'); expect(roleOf('blue', r)).toBe('def'); }
    for (let r = 5; r <= 9; r++) { expect(attackersOf(r)).toBe('blue'); expect(roleOf('red', r)).toBe('def'); }
  });
});

describe('Bomb Mission — matriks menang lengkap', () => {
  it('meledak → penyerang; dijinakkan → bertahan', () => {
    expect(R({ planted: true, detonated: true })).toEqual({ winner: 'att', reason: 'detonated' });
    expect(R({ planted: true, defused: true })).toEqual({ winner: 'def', reason: 'defused' });
  });
  it('bertahan habis → penyerang menang instan (belum / sudah tanam)', () => {
    expect(R({ defAlive: 0 })).toEqual({ winner: 'att', reason: 'elim' });
    expect(R({ defAlive: 0, planted: true })).toEqual({ winner: 'att', reason: 'elim' });
  });
  it('kedua tim habis bersamaan: sebelum tanam → bertahan; sesudah tanam → penyerang', () => {
    expect(R({ attAlive: 0, defAlive: 0 })).toEqual({ winner: 'def', reason: 'elim' });
    expect(R({ attAlive: 0, defAlive: 0, planted: true })).toEqual({ winner: 'att', reason: 'elim' });
  });
  it('ronde berjalan: semua masih hidup → null', () => {
    expect(R({})).toBeNull();
    expect(R({ planted: true })).toBeNull();
  });
  it('first to 5 + tukar sisi setelah ronde 4 → maks 9 ronde, tidak mungkin seri', () => {
    expect(BOMB_CFG.match.winRounds * 2 - 1).toBe(9);
    expect(BOMB_CFG.match.halfTimeRound).toBe(4);
  });
});

describe('Bomb Mission — pembawa C4 & syarat menjinakkan', () => {
  it('pembawa bergilir adil: yang paling jarang membawa dipilih; seri → acak di antara mereka', () => {
    const carried = new Map([[1, 2], [2, 1], [3, 1], [4, 3]]);
    expect([2, 3]).toContain(pickCarrier([1, 2, 3, 4], carried, () => 0.99));
    expect(pickCarrier([1, 2, 3, 4], carried, () => 0)).toBe(2);
    expect(pickCarrier([5, 1], carried, () => 0.5)).toBe(5);        // belum pernah membawa
    expect(pickCarrier([], carried, () => 0)).toBe(-1);
    // 10 ronde bergilir: setiap penyerang membawa 2 kali
    const c = new Map<number, number>();
    let s = 1;
    for (let r = 0; r < 10; r++) { const id = pickCarrier([1, 2, 3, 4, 5], c, () => { s = (s * 48271) % 2147483647; return s / 2147483647; }); c.set(id, (c.get(id) ?? 0) + 1); }
    expect([...c.values()].sort()).toEqual([2, 2, 2, 2, 2]);
  });
  it('menjinakkan: ≤ 3 u & menghadap ≤ 60°; di atas C4 selalu boleh', () => {
    // yaw 0 menghadap −Z: C4 tepat di depan 2 u → boleh; di belakang → tidak; 59° → boleh, 61° → tidak; 3.1 u → tidak
    expect(canDefuseFrom(0, 0, 0, 0, -2)).toBe(true);
    expect(canDefuseFrom(0, 0, 0, 0, 2)).toBe(false);
    const at = (deg: number, r = 2) => { const a = deg * Math.PI / 180; return canDefuseFrom(0, 0, 0, -Math.sin(a) * r, -Math.cos(a) * r); };
    expect(at(59)).toBe(true);
    expect(at(61)).toBe(false);
    expect(at(0, 3.1)).toBe(false);
    expect(canDefuseFrom(0, 0, 0, 0.2, 0.2)).toBe(true);
  });
});

describe('Bomb Mission — data jaringan, cadangan, setelan', async () => {
  const { parseBombNet } = await import('../src/combat/C4Bomb');
  const { parseSave, SAVE_V } = await import('../src/net/Migration');
  const { parseStart } = await import('../src/net/start');
  const { Lobby } = await import('../src/game/Lobby');
  const { validate } = await import('../src/ui/Settings');
  const { DEFAULT_BINDS, validateBinds } = await import('../src/core/Bindings');
  const { MAPS } = await import('../src/world/maps/registry');
  const { BOMB_MAP_IDS, MAP_IDS, isBombMap } = await import('../src/world/maps/types');
  const { pickMap } = await import('../src/game/Lobby');
  const { makeRng } = await import('../src/core/Rng');
  const net = { s: 'planted', c: -1, x: -14.5, y: 0, z: -20.5, site: 'A', f: 31.5, p: -1, pt: 0, d: 7, dt: 2.5, a: 'red' };
  it('parseBombNet: keadaan sah lolos; rusak → null; nilai dijepit', () => {
    expect(parseBombNet(net)).toEqual(net);
    expect(parseBombNet({ ...net, s: 'boom' })).toBeNull();
    expect(parseBombNet({ ...net, site: 'C' })).toBeNull();
    expect(parseBombNet({ ...net, a: 'green' })).toBeNull();
    expect(parseBombNet({ ...net, f: Number.NaN })).toBeNull();
    expect(parseBombNet(null)).toBeNull();
    expect(parseBombNet({ ...net, f: 999, dt: 99, x: 1e9 })).toMatchObject({ f: BOMB_CFG.c4.fuseTime, dt: BOMB_CFG.c4.defuseTime, x: 500 });
  });
  it('cadangan pindah host: statistik 12 angka (tanam/jinak) & keadaan C4 + giliran pembawa; cadangan lama 10 angka tetap sah', () => {
    const ent = { id: 6, alive: true, hp: 80, respawnT: 0, protectT: 0, x: 1, y: 0, z: 2, yaw: 0, pitch: 0, weapon: 'akm', scope: 'holo',
      ammo: 20, reserve: 90, modeIdx: 0, grenades: 1, stats: [2, 1, 0, 400, 30, 12, 3, 1, 300, 2, 1, 0], streak: 1, variant: 'm', flashes: 1,
      pistol: 'deagle', pscope: 'iron', ammo2: 7, reserve2: 21, mode2: 0, melee: 'knife' };
    const s = { v: SAVE_V, state: 'PLAYING', round: 6, timeLeft: 30, countdown: 0, sb: 2, sr: 3, winner: 'draw', roundWinner: null,
      ents: [ent], bomb: net, carried: [[6, 2], [7, 1]] };
    const p = parseSave(JSON.parse(JSON.stringify(s)))!;
    expect(p.bomb).toEqual(net);
    expect(p.carried).toEqual([[6, 2], [7, 1]]);
    expect(p.ents[0].stats.length).toBe(12);
    expect(parseSave({ ...s, ents: [{ ...ent, stats: ent.stats.slice(0, 10) }] })).not.toBeNull();
    expect(parseSave({ ...s, ents: [{ ...ent, stats: ent.stats.slice(0, 11) }] })).toBeNull();
    expect('bomb' in parseSave({ ...s, bomb: { s: 'x' } })!).toBe(false);
  });
  it('mode bomb: pesan mulai, setelan room (host), setelan lokal', () => {
    const base = { seed: 3, opts: { mode: 'bomb', scoreLimit: 50, timeLimit: 600, roundsToWin: 5 }, ents: [{ id: 1, team: 'blue', name: 'A', pid: null, bot: true }],
      map: 'meridian' };
    expect(parseStart(base)!.opts.mode).toBe('bomb');
    expect(parseStart({ ...base, opts: { ...base.opts, mode: 'zzz' } })!.opts.mode).toBe('tdm');
    const L = new Lobby('K7RB2X', { mode: 'tdm', scoreLimit: 50, timeLimit: 10, roundsToWin: 5, difficulty: 'normal', fillBots: true, map: 'brickhall', allTalk: true });
    const host = L.join('Host');
    expect(L.setSettings(host!.id, { mode: 'bomb', map: 'meridian' })).toBe(true);
    expect(L.settings.mode).toBe('bomb');
    expect(validate({ mode: 'bomb' }).mode).toBe('bomb');
    expect(validate({ mode: 'x' as never }).mode).toBe('tdm');
  });
  it('tombol 6 = pegang C4 (bawaan; setelan lama tanpa aksi bomb diisi otomatis)', () => {
    expect(DEFAULT_BINDS.bomb).toBe('Digit6');
    const old = { ...DEFAULT_BINDS } as Record<string, string>;
    delete old.bomb;
    expect(validateBinds(old).bomb).toBe('Digit6');
  });
  it('zona bom hanya di Meridian Vault & Candi Arunika (= BOMB_MAP_IDS); arah hadap kelompok slot (Biru +Z, Merah −Z)', () => {
    for (const id of ['meridian', 'arunika'] as const) {
      expect(MAPS[id].bombSites?.map(s => s.id)).toEqual(['A', 'B']);
      expect(MAPS[id].spawnYaw).toEqual({ blue: Math.PI, red: 0 });
    }
    for (const id of ['brickhall', 'steelyard', 'boston'] as const) expect(MAPS[id].bombSites).toBeUndefined();
    expect(MAP_IDS.filter(id => MAPS[id].bombSites)).toEqual([...BOMB_MAP_IDS]);
    expect([isBombMap('arunika'), isBombMap('meridian'), isBombMap('boston'), isBombMap('random')]).toEqual([true, true, false, false]);
  });
  it('"Acak" di mode Bomb Mission hanya mengundi map berzona bom; mode lain dari semua map', () => {
    const rng = makeRng(23), seen = new Set<string>();
    for (let i = 0; i < 200; i++) seen.add(pickMap('random', rng, 'bomb'));
    expect([...seen].sort()).toEqual([...BOMB_MAP_IDS].sort());
    expect(pickMap('arunika', rng, 'bomb')).toBe('arunika');
    const all = new Set<string>();
    for (let i = 0; i < 300; i++) all.add(pickMap('random', rng, 'tdm'));
    expect(all.size).toBe(MAP_IDS.length);
  });
});
