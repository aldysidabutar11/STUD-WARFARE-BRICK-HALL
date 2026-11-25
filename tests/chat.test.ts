// tests/chat.test.ts — chat teks tim & semua (game/Chat.ts): teks aman & dibatasi, anti-spam, setelan "chat semua" saat match,
// pesan dari host divalidasi, callout bot tidak membanjiri, pesan cepat, tombol baru Y/U/H, setelan room allTalk.
import { describe, expect, it } from 'vitest';
import {
  BotChatGate, QUICK, RateLimit, botCalloutText, chatAllowed, chatReaches, cleanChatText, parseChat,
} from '../src/game/Chat';
import { ACTIONS, DEFAULT_BINDS, validateBinds } from '../src/core/Bindings';
import { Lobby, cleanRoomSettings, validRoomPatch, type RoomSettings } from '../src/game/Lobby';
import { XCFG } from '../src/config/extraConfig';

const C = XCFG.chat;
const ch = (...cps: number[]) => String.fromCodePoint(...cps);

describe('Teks chat', () => {
  it('spasi dirapikan, karakter kontrol / lebar-nol / pembalik arah dibuang, HTML tetap teks biasa', () => {
    expect(cleanChatText('  halo   bro  ')).toBe('halo bro');
    expect(cleanChatText('a' + ch(0) + 'b' + ch(0x1b) + 'c')).toBe('a b c');
    expect(cleanChatText('ad' + ch(0x200b) + 'min')).toBe('ad min');
    expect(cleanChatText('aman' + ch(0x202e) + 'kiri')).toBe('aman kiri');
    expect(cleanChatText('baris1' + ch(0x2028) + 'baris2\nbaris3')).toBe('baris1 baris2 baris3');
    expect(cleanChatText('<img src=x onerror=alert(1)>')).toBe('<img src=x onerror=alert(1)>');   // ditampilkan lewat textContent
    expect(cleanChatText(undefined)).toBe('');
    expect(cleanChatText('   ')).toBe('');
  });
  it(`maks ${C.maxLen} karakter, emoji tidak terpotong`, () => {
    const emoji = ch(0x1f525);
    const t = cleanChatText(emoji.repeat(C.maxLen + 30));
    expect(Array.from(t)).toHaveLength(C.maxLen);
    expect(Array.from(t).every(c => c === emoji)).toBe(true);
  });
});

describe('Anti-spam', () => {
  it(`${C.burst} pesan beruntun lalu 1 tiap ${C.refill} s`, () => {
    const r = new RateLimit();
    for (let i = 0; i < C.burst; i++) expect(r.take(10)).toBe(true);
    expect(r.take(10.1)).toBe(false);
    expect(r.take(10 + C.refill + 0.01)).toBe(true);
    expect(r.take(10 + C.refill + 0.02)).toBe(false);
    expect(r.take(100)).toBe(true);                       // lama diam → penuh lagi
  });
});

describe('Siapa boleh & siapa menerima', () => {
  it('chat semua saat match bisa dimatikan host; chat tim & di room/layar hasil selalu boleh', () => {
    expect(chatAllowed('team', true, false)).toBe(true);
    expect(chatAllowed('all', true, false)).toBe(false);
    expect(chatAllowed('all', true, true)).toBe(true);
    expect(chatAllowed('all', false, false)).toBe(true);   // room / layar hasil
  });
  it('tim → hanya setim; semua → kedua tim', () => {
    expect(chatReaches('team', 'blue', 'blue')).toBe(true);
    expect(chatReaches('team', 'blue', 'red')).toBe(false);
    expect(chatReaches('all', 'blue', 'red')).toBe(true);
  });
});

describe('Pesan chat dari host (divalidasi di klien)', () => {
  const ok = { t: 'chat', scope: 'team', name: 'Raka', team: 'red', text: 'Musuh di Rotunda!', pid: 'p3', bot: false, dead: true, quick: false };
  it('pesan sah diterima', () => {
    expect(parseChat(ok)).toEqual({ scope: 'team', name: 'Raka', team: 'red', text: 'Musuh di Rotunda!', pid: 'p3', bot: false, dead: true, quick: false });
  });
  it('rusak / berbahaya ditolak atau dibersihkan', () => {
    expect(parseChat({ ...ok, scope: 'musuh' })).toBeNull();
    expect(parseChat({ ...ok, text: ' ' })).toBeNull();
    expect(parseChat({ ...ok, name: '' })).toBeNull();
    const m = parseChat({ ...ok, name: '<b>Raka</b>', pid: '../p1', team: 'hijau', bot: 'ya', dead: 1 })!;
    expect(m.name).not.toMatch(/[<>]/);
    expect(m).toMatchObject({ pid: null, team: 'blue', bot: false, dead: false });
  });
});

describe('Callout bot di chat tim', () => {
  it(`maks 1 per tim tiap ${C.botGap} s; area sama tidak diulang dalam ${C.botZoneGap} s; tim lain terpisah`, () => {
    const g = new BotChatGate();
    expect(g.allow('blue', 'Rotunda', 0)).toBe(true);
    expect(g.allow('blue', 'Arsip', 1)).toBe(false);                    // terlalu cepat
    expect(g.allow('red', 'Rotunda', 1)).toBe(true);                    // tim lain
    expect(g.allow('blue', 'Rotunda', C.botGap + 1)).toBe(false);       // area sama terlalu cepat
    expect(g.allow('blue', 'Arsip', C.botGap + 1)).toBe(true);
    expect(g.allow('blue', 'Rotunda', C.botGap + C.botZoneGap + 2)).toBe(true);
    g.reset();
    expect(g.allow('blue', 'Arsip', C.botGap + C.botZoneGap + 3)).toBe(true);
  });
  it('kalimat berisi nama area (variasi tetap per seed)', () => {
    expect(botCalloutText('Pos Jaga Barat', 7)).toContain('Pos Jaga Barat');
    expect(botCalloutText('Pos Jaga Barat', 7)).toBe(botCalloutText('Pos Jaga Barat', 7));
    expect(botCalloutText('', 2)).toContain('dekat sini');
  });
});

describe('Pesan cepat', () => {
  it('6 pesan (tombol 1–6), area posisi pengirim ikut bila ada', () => {
    expect(QUICK).toHaveLength(6);
    expect(QUICK[0].text('Rotunda')).toBe('Musuh di Rotunda!');
    expect(QUICK[0].text('')).toBe('Musuh di sini!');
    for (const q of QUICK) { expect(cleanChatText(q.text('Halaman Belakang Biru'))).toBeTruthy(); expect(q.label).toBeTruthy(); }
  });
});

describe('Tombol chat', () => {
  it('Y semua · U tim · H pesan cepat; tidak bentrok dengan tombol lain', () => {
    expect(DEFAULT_BINDS.chatAll).toBe('KeyY'); expect(DEFAULT_BINDS.chatTeam).toBe('KeyU'); expect(DEFAULT_BINDS.quickChat).toBe('KeyH');
    const keys = ACTIONS.map(a => DEFAULT_BINDS[a.id]);
    expect(new Set(keys).size).toBe(keys.length);
  });
  it('setelan tombol lama (tanpa aksi chat) otomatis mendapat Y/U/H; tombol yang sudah dipakai pengguna tidak direbut', () => {
    const old = { ...DEFAULT_BINDS } as Record<string, string>;
    delete old.chatAll; delete old.chatTeam; delete old.quickChat;
    const b = validateBinds(old);
    expect([b.chatAll, b.chatTeam, b.quickChat]).toEqual(['KeyY', 'KeyU', 'KeyH']);
    const custom = validateBinds({ ...old, reload: 'KeyY' });
    expect(custom.reload).toBe('KeyY');
    expect(custom.chatAll).toBe('');                       // Y sudah dipakai → chat semua belum dipetakan (bisa diatur di Kontrol)
  });
});

describe('Setelan room: chat & voice ke semua saat match', () => {
  const S = (): RoomSettings => ({ mode: 'tdm', scoreLimit: 50, timeLimit: 10, roundsToWin: 5, difficulty: 'normal', fillBots: true, map: 'brickhall', allTalk: true });
  it('bawaan nyala; host bisa mematikan; nilai bukan boolean ditolak; host versi lama (tanpa kunci) → nyala', () => {
    const L = new Lobby('K7RB2X', S());
    const host = L.join('Aldy', { local: true })!;
    expect(L.settings.allTalk).toBe(true);
    expect(L.setSettings(host.id, { allTalk: false })).toBe(true);
    expect(L.settings.allTalk).toBe(false);
    expect(validRoomPatch({ allTalk: 'tidak' })).toBe(false);
    const { allTalk: _drop, ...lama } = S();
    expect(cleanRoomSettings(lama).allTalk).toBe(true);
    expect(Lobby.fromState(JSON.parse(JSON.stringify(L.toState())), host.id).settings.allTalk).toBe(false);
  });
});
