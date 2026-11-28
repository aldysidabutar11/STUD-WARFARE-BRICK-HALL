// tests/variants.test.ts — karakter khusus Venny (varian 'v', permintaan pengguna 2026-11-25): lolos validasi settings, room
// online, pesan mulai match & cadangan pindah host; nilai asing tetap jatuh ke pria; bot tidak pernah memakai Venny.
import { describe, expect, it } from 'vitest';
import { SKIN_IDS, SKIN_NAME, VARIANTS, cleanVariant, isSkin, isVariant } from '../src/entities/variants';
import { botVariant } from '../src/entities/CharacterArt';
import { validate } from '../src/ui/Settings';
import { Lobby, type RoomSettings } from '../src/game/Lobby';
import { parseStart } from '../src/net/start';
import { parseSave, SAVE_V } from '../src/net/Migration';

describe('Varian karakter', () => {
  it('pria, wanita, Venny + 10 karakter operator dikenali; selain itu → pria', () => {
    expect(VARIANTS).toEqual(['m', 'f', 'v', ...SKIN_IDS]);
    for (const v of VARIANTS) { expect(isVariant(v)).toBe(true); expect(cleanVariant(v)).toBe(v); }
    for (const bad of ['V', 'venny', '', null, undefined, 1, {}]) { expect(isVariant(bad)).toBe(false); expect(cleanVariant(bad)).toBe('m'); }
  });
  it('bot tidak pernah memakai Venny / karakter operator (tetap campuran pria/wanita)', () => {
    const seen = new Set(Array.from({ length: 64 }, (_, i) => botVariant(i)));
    expect(seen).toEqual(new Set(['m', 'f']));
  });
  it('pilihan Venny tersimpan di settings; nilai rusak → pria', () => {
    expect(validate({ charVariant: 'v' }).charVariant).toBe('v');
    expect(validate({ charVariant: 'x' as never }).charVariant).toBe('m');
  });
});

describe('Venny di room online & jaringan', () => {
  it('room → cermin klien → susunan match membawa varian Venny', () => {
    const S: RoomSettings = { mode: 'tdm', scoreLimit: 50, timeLimit: 10, roundsToWin: 5, difficulty: 'normal', fillBots: true, map: 'brickhall', allTalk: true };
    const L = new Lobby('K7RB2X', S);
    L.join('Aldy', { local: true });
    const f = L.join('Venny')!;
    f.variant = 'v';
    const C = Lobby.fromState(JSON.parse(JSON.stringify(L.toState())), f.id);
    expect(C.find(f.id)?.variant).toBe('v');
    expect(C.roster(f.id).red[0]).toMatchObject({ kind: 'you', variant: 'v' });
    const st = L.toState() as unknown as { players: Record<string, unknown>[] };
    st.players[1].variant = 'zzz';                                                    // data host rusak / versi asing
    expect(Lobby.fromState(JSON.parse(JSON.stringify(st)), f.id).find(f.id)?.variant).toBe('m');
  });
  it('pesan mulai match dari host: Venny diterima, nilai asing → pria', () => {
    const ent = (id: number, variant: unknown) => ({ id, team: id <= 5 ? 'blue' : 'red', name: 'P' + id, pid: 'p' + id, bot: false,
      variant, weapon: 'akm', scope: 'holo' });
    const r = parseStart({ seed: 1, opts: { mode: 'tdm', scoreLimit: 50, timeLimit: 600, roundsToWin: 3 }, ents: [ent(1, 'v'), ent(6, 'VENNY')] })!;
    expect(r.ents.map(e => e.variant)).toEqual(['v', 'm']);
  });
  it('cadangan pindah host menyimpan Venny', () => {
    const e = { id: 1, alive: true, hp: 80, respawnT: 0, protectT: 0, x: 0, y: 0, z: 0, yaw: 0, pitch: 0, weapon: 'akm', scope: 'holo',
      ammo: 10, reserve: 60, modeIdx: 0, grenades: 1, stats: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], streak: 0, variant: 'v', flashes: 1 };
    const save = (x: Record<string, unknown>) => ({ v: SAVE_V, state: 'PLAYING', round: 1, timeLeft: 60, countdown: 0, sb: 0, sr: 0,
      winner: 'draw', roundWinner: null, ents: [x] });
    expect(parseSave(save(e))!.ents[0].variant).toBe('v');
    expect(parseSave(save({ ...e, variant: 'q' }))!.ents[0].variant).toBe('m');
  });
});

describe('Karakter operator (10 desain pengguna Karakter/<NAMA>.png)', async () => {
  const { skinFps } = await import('../src/entities/skins');
  const mods = await Promise.all(SKIN_IDS.map(id => import(`../src/entities/skins/${id}.ts`)));
  it('10 id unik bernama tampilan; isSkin hanya untuk operator', () => {
    expect(SKIN_IDS.length).toBe(10);
    expect(new Set(SKIN_IDS).size).toBe(10);
    expect(SKIN_IDS.map(id => SKIN_NAME[id])).toEqual(['Pharaoh', 'Frost', 'Ignis', 'Ghost-09', 'Nova', 'Spectre', 'Titan', 'Valkyrie', 'Valiant', 'Reaper']);
    for (const id of SKIN_IDS) { expect(isSkin(id)).toBe(true); expect(isVariant(id)).toBe(true); expect(cleanVariant(id)).toBe(id); }
    for (const v of ['m', 'f', 'v', 'PHARAOH', 'ghost-09', '', null, 3]) expect(isSkin(v)).toBe(false);
  });
  it('tiap karakter: build ada, benih atlas unik, warna lengan FPS sah (0…0xffffff)', () => {
    const seeds = new Set<number>();
    for (const m of mods) {
      const def = Object.values(m)[0] as { seed: number; build: unknown; fps: Record<string, number> };
      expect(typeof def.build).toBe('function');
      seeds.add(def.seed);
    }
    expect(seeds.size).toBe(10);
    for (const id of SKIN_IDS) {
      const f = skinFps(id);
      for (const k of ['sleeve', 'cuff', 'glove', 'finger'] as const) { expect(Number.isInteger(f[k])).toBe(true); expect(f[k]).toBeGreaterThanOrEqual(0); expect(f[k]).toBeLessThanOrEqual(0xffffff); }
    }
  });
  it('pilihan karakter operator: settings, room → klien → susunan match, pesan mulai, cadangan pindah host', () => {
    for (const id of SKIN_IDS) expect(validate({ charVariant: id }).charVariant).toBe(id);
    const S: RoomSettings = { mode: 'tdm', scoreLimit: 50, timeLimit: 10, roundsToWin: 5, difficulty: 'normal', fillBots: true, map: 'brickhall', allTalk: true };
    const L = new Lobby('K7RB2X', S);
    L.join('Aldy', { local: true });
    const f = L.join('Teman')!;
    f.variant = 'valkyrie';
    const C = Lobby.fromState(JSON.parse(JSON.stringify(L.toState())), f.id);
    expect(C.find(f.id)?.variant).toBe('valkyrie');
    expect(C.roster(f.id).red[0]).toMatchObject({ kind: 'you', variant: 'valkyrie' });
    const ent = (id: number, variant: unknown) => ({ id, team: id <= 5 ? 'blue' : 'red', name: 'P' + id, pid: 'p' + id, bot: false,
      variant, weapon: 'akm', scope: 'holo' });
    const r = parseStart({ seed: 1, opts: { mode: 'tdm', scoreLimit: 50, timeLimit: 600, roundsToWin: 3 }, ents: [ent(1, 'titan'), ent(6, 'ghost09'), ent(7, 'ghost-09')] })!;
    expect(r.ents.map(e => e.variant)).toEqual(['titan', 'ghost09', 'm']);
    const e = { id: 1, alive: true, hp: 80, respawnT: 0, protectT: 0, x: 0, y: 0, z: 0, yaw: 0, pitch: 0, weapon: 'akm', scope: 'holo',
      ammo: 10, reserve: 60, modeIdx: 0, grenades: 1, stats: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], streak: 0, variant: 'reaper', flashes: 1 };
    const save = { v: SAVE_V, state: 'PLAYING', round: 1, timeLeft: 60, countdown: 0, sb: 0, sr: 0, winner: 'draw', roundWinner: null, ents: [e] };
    expect(parseSave(save)!.ents[0].variant).toBe('reaper');
  });
});
