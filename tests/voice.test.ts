// tests/voice.test.ts — voice chat push-to-talk: aturan siapa mendengar siapa (tim / semua / allTalk / yang mati), kurva jarak
// (jelas dekat → hilang di ujung map), format paket suara, dan routing host (paket hanya ke penerima yang berhak + anti-banjir).
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { pidNum, proximity, seqNewer, voiceRange, voiceScopeOk, voiceSendsTo, type SendCtx } from '../src/game/VoiceRules';
import { VOICE_MAX, decodeVoiceDown, decodeVoiceUp, encodeVoiceDown, encodeVoiceUp } from '../src/net/protocol';
import { VoiceSystem, type VoiceEnv } from '../src/game/Voice';
import { DEFAULT_BINDS } from '../src/core/Bindings';
import { MAPS } from '../src/world/maps/registry';
import { XCFG } from '../src/config/extraConfig';
import type { Team } from '../src/entities/BlockyCharacter';

const V = XCFG.voice;
const ctx = (o: Partial<SendCtx> = {}): SendCtx => ({ live: true, allTalk: true, senderTeam: 'blue', senderAlive: true, recipientTeam: 'blue', ...o });

describe('Siapa mendengar siapa', () => {
  it('T = hanya setim (juga saat mati / di lobby); Z = semua', () => {
    expect(voiceSendsTo('team', ctx())).toBe(true);
    expect(voiceSendsTo('team', ctx({ recipientTeam: 'red' }))).toBe(false);
    expect(voiceSendsTo('team', ctx({ senderAlive: false }))).toBe(true);
    expect(voiceSendsTo('team', ctx({ live: false, recipientTeam: 'red' }))).toBe(false);
    expect(voiceSendsTo('all', ctx({ recipientTeam: 'red' }))).toBe(true);
  });
  it('Z saat match: mati bila host mematikan allTalk atau pembicara sudah mati; di lobby / layar hasil selalu jalan', () => {
    expect(voiceSendsTo('all', ctx({ allTalk: false, recipientTeam: 'red' }))).toBe(false);
    expect(voiceSendsTo('all', ctx({ senderAlive: false, recipientTeam: 'red' }))).toBe(false);
    expect(voiceSendsTo('all', ctx({ live: false, allTalk: false, senderAlive: false, recipientTeam: 'red' }))).toBe(true);
    expect(voiceScopeOk('all', true, false, true)).toBe(false);
    expect(voiceScopeOk('all', true, true, false)).toBe(false);
    expect(voiceScopeOk('team', true, false, false)).toBe(true);
    expect(voiceScopeOk('all', false, false, false)).toBe(true);
  });
  it('tim tidak diketahui → hanya Z di luar match', () => {
    expect(voiceSendsTo('team', ctx({ senderTeam: null }))).toBe(false);
    expect(voiceSendsTo('all', ctx({ recipientTeam: null }))).toBe(false);
    expect(voiceSendsTo('all', ctx({ live: false, recipientTeam: null }))).toBe(true);
  });
});

describe('Suara berdasarkan jarak', () => {
  it('jarak hilang = ujung ke ujung map (diagonal batas × farFrac)', () => {
    const bh = voiceRange(MAPS.brickhall.bounds), sy = voiceRange(MAPS.steelyard.bounds);
    expect(bh.near).toBe(V.near);
    expect(bh.far).toBeCloseTo(Math.hypot(60, 100) * V.farFrac, 3);
    expect(sy.far).toBeGreaterThan(bh.far);
    // spawn ke spawn Brick Hall (±90 u sepanjang Z) praktis sudah tidak terdengar; setengah map masih terdengar pelan
    expect(proximity(90, bh.near, bh.far).gain).toBeLessThan(0.05);
    expect(proximity(50, bh.near, bh.far).gain).toBeGreaterThan(0.2);
  });
  it('dekat jelas penuh, makin jauh makin kecil & teredam, 0 di batas', () => {
    const near = 12, far = 110;
    expect(proximity(0, near, far)).toEqual({ gain: 1, cutoff: V.cutoffNear });
    expect(proximity(near, near, far).gain).toBe(1);
    const mid = proximity((near + far) / 2, near, far);
    expect(mid.gain).toBeCloseTo(0.25, 5);
    expect(mid.cutoff).toBeLessThan(V.cutoffNear); expect(mid.cutoff).toBeGreaterThan(V.cutoffFar);
    expect(proximity(far, near, far).gain).toBe(0);
    expect(proximity(far * 2, near, far)).toEqual({ gain: 0, cutoff: V.cutoffFar });
    let g = 2, c = 1e9;
    for (let d = 0; d <= far; d += 5) { const p = proximity(d, near, far); expect(p.gain).toBeLessThanOrEqual(g); expect(p.cutoff).toBeLessThanOrEqual(c); g = p.gain; c = p.cutoff; }
  });
});

describe('Paket suara', () => {
  const opus = new Uint8Array([0xfc, 1, 2, 3, 4, 5]);
  it('naik & turun bolak-balik utuh', () => {
    const up = decodeVoiceUp(encodeVoiceUp(true, 65535, opus))!;
    expect(up.all).toBe(true); expect(up.seq).toBe(65535); expect([...up.opus]).toEqual([...opus]);
    const dn = decodeVoiceDown(encodeVoiceDown(12, false, 7, opus))!;
    expect(dn).toMatchObject({ speaker: 12, all: false, seq: 7 }); expect([...dn.opus]).toEqual([...opus]);
  });
  it('rusak / kebesaran / bukan suara ditolak', () => {
    expect(decodeVoiceUp(new Uint8Array([3, 0, 1, 0]).buffer)).toBeNull();                   // tanpa isi
    expect(decodeVoiceUp(new Uint8Array([2, 0, 1, 0, 9]).buffer)).toBeNull();                // jenis lain
    expect(decodeVoiceUp(new Uint8Array([3, 5, 1, 0, 9]).buffer)).toBeNull();                // cakupan tak dikenal
    expect(decodeVoiceUp(encodeVoiceUp(false, 1, new Uint8Array(VOICE_MAX + 1)))).toBeNull();
    expect(decodeVoiceDown(encodeVoiceDown(0, false, 1, opus))).toBeNull();                   // pembicara 0
  });
  it('nomor pid & urutan 16-bit (melingkar)', () => {
    expect(pidNum('p12')).toBe(12); expect(pidNum('host')).toBe(0); expect(pidNum('p0')).toBe(0); expect(pidNum('p123456')).toBe(0);
    expect(seqNewer(1, 0)).toBe(true); expect(seqNewer(0, 65535)).toBe(true); expect(seqNewer(65535, 0)).toBe(false); expect(seqNewer(5, 5)).toBe(false);
  });
  it('tombol bicara: T = tim, Z = semua', () => {
    expect(DEFAULT_BINDS.voiceTeam).toBe('KeyT'); expect(DEFAULT_BINDS.voiceAll).toBe('KeyZ');
  });
});

describe('Host meneruskan suara hanya ke penerima yang berhak', () => {
  // host p1 (biru); teman: p2 merah, p3 biru, p4 biru, p5 merah
  const TEAM: Record<string, Team> = { p1: 'blue', p2: 'red', p3: 'blue', p4: 'blue', p5: 'red' };
  const make = (o: { live?: boolean; allTalk?: boolean; dead?: string[] } = {}) => {
    const sent: { to: string; buf: ArrayBuffer }[] = [];
    const env: VoiceEnv = {
      isHost: () => true, me: () => 'p1', sendUp: () => {}, sendDown: (to, buf) => sent.push({ to, buf }),
      listeners: () => ['p2', 'p3', 'p4', 'p5'], teamOf: (p) => TEAM[p] ?? null, aliveOf: (p) => !(o.dead ?? []).includes(p),
      live: () => o.live ?? true, allTalk: () => o.allTalk ?? true, muted: () => false,
      headOf: () => null, audio: () => null, camera: () => new THREE.PerspectiveCamera(), blocked: () => false, range: () => ({ near: 12, far: 110 }),
    };
    return { v: new VoiceSystem(env), sent };
  };
  const opus = new Uint8Array([0xfc, 9, 9, 9]);
  const to = (s: { to: string }[]) => s.map(x => x.to).sort();
  it('T dari p3 (biru) → hanya p4 (host biru mendengar langsung); paket berisi pembicara & isi yang sama', () => {
    const { v, sent } = make();
    v.onUp('p3', encodeVoiceUp(false, 41, opus));
    expect(to(sent)).toEqual(['p4']);
    const d = decodeVoiceDown(sent[0].buf)!;
    expect(d).toMatchObject({ speaker: 3, all: false, seq: 41 }); expect([...d.opus]).toEqual([...opus]);
  });
  it('Z dari p2 → semua kecuali pengirim; allTalk mati / pembicara mati → tidak diteruskan saat match; di lobby tetap', () => {
    let m = make();
    m.v.onUp('p2', encodeVoiceUp(true, 1, opus));
    expect(to(m.sent)).toEqual(['p3', 'p4', 'p5']);
    m = make({ allTalk: false });
    m.v.onUp('p2', encodeVoiceUp(true, 1, opus));
    expect(m.sent).toHaveLength(0);
    m = make({ dead: ['p2'] });
    m.v.onUp('p2', encodeVoiceUp(true, 1, opus));
    expect(m.sent).toHaveLength(0);
    m.v.onUp('p2', encodeVoiceUp(false, 2, opus));                       // T saat mati tetap ke setim
    expect(to(m.sent)).toEqual(['p5']);
    m = make({ live: false, allTalk: false, dead: ['p2'] });
    m.v.onUp('p2', encodeVoiceUp(true, 1, opus));
    expect(to(m.sent)).toEqual(['p3', 'p4', 'p5']);
  });
  it(`anti-banjir: maks ${V.maxRate} paket per detik per pemain; paket rusak diabaikan`, () => {
    const { v, sent } = make();
    for (let i = 0; i < V.maxRate + 25; i++) v.onUp('p3', encodeVoiceUp(false, i, opus));
    expect(sent).toHaveLength(V.maxRate);
    v.onUp('p4', new Uint8Array([3, 9]).buffer);
    expect(sent).toHaveLength(V.maxRate);
  });
});
