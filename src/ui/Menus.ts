// src/ui/Menus.ts — menu utama, atur match, loadout, pengaturan (tab), kontrol + ubah tombol, pause, hasil (GDD §13.1–13.2, §14)
// + navigasi gamepad (D-pad/A/B) untuk semua menu. + multi-map: kartu pilihan map (denah prosedural, ui/MapThumb) di Atur Match
// & setelan host room (Acak = diundi saat match dimulai); nama map di menu utama, layar hasil (dan banner awal match di Game).
import { cleanVariant, type Variant } from '../entities/variants';
import { SCOPES, SCOPE_ORDER, WEAPONS, WEAPON_ORDER, classOf, fitScope, scopeAllowed, type ScopeId, type WeaponClass, type WeaponDef,
  type WeaponId } from '../config/weaponsData';
import { MELEES, MELEE_ORDER, X_ORDER, type MeleeId } from '../config/weaponsExtra';
import type { Loadout } from '../combat/Loadout';
import { falloffOf, moveMultOf, pelletsOf } from '../combat/weaponStats';
import { effectiveZoom } from '../combat/Damage';
import { ACTIONS, DEFAULT_BINDS, PAD, PAD_HELP, isBindable, keyLabel, rebind, type Action } from '../core/Bindings';
import type { PadState } from '../core/Input';
import { DEFAULTS, FPS_CAPS, RENDER_SCALES, ROUNDS_TO_WIN, SCORE_LIMITS, TIME_LIMITS, XH_COLORS, validate, type Settings } from './Settings';
import { Crosshair, XH_MODES, XH_PRESETS, XH_SHAPES } from './Crosshair';
import { CFG } from '../config/gameConfig';
import { XCFG } from '../config/extraConfig';
import { ctx } from '../game/ctx';
import { cleanName, formatRoomCode, parseRoomCode, type Lobby, type MapChoice, type RoomSettings, type SlotView } from '../game/Lobby';
import { MAPS } from '../world/maps/registry';
import { MAP_IDS, type MapId } from '../world/maps/types';
import { mapFacts, paintThumbs, thumbHTML } from './MapThumb';
import type { Team } from '../entities/BlockyCharacter';
import type { JoinFail } from '../net/Session';
import { onlineConfigured } from '../net/Signaling';
import { blackbox } from '../core/BlackBox';
import { CharPreview } from './CharPreview';

/** Aksi di layar room (host: langsung; klien: dikirim ke host untuk divalidasi). */
export type RoomAction = { type: 'team'; team: Team } | { type: 'ready'; ready: boolean } | { type: 'kick'; id: string }
  | { type: 'settings'; patch: Partial<RoomSettings> } | { type: 'shuffle' };
/** Status koneksi room online untuk badge. */
export interface NetInfo { role: 'host' | 'client'; state: 'connecting' | 'online' | 'error'; internet: boolean; label: string; peers: number;
  /** Ping tiap teman ke host (ms) menurut id pemain room. */
  pings: Record<string, number> }

export interface MenuApi {
  play(practice?: boolean): void; resume(): void; quitToMenu(): void; replay(): void; fullscreen(): void;
  settings(): Settings; applySettings(s: Settings): void; setLoadout(lo: Loadout, v: Variant): void; click(): void;
  inMatch(): boolean;
  /** Taksiran refresh layar (Hz) — label pilihan batas FPS. */
  refreshHz(): number;
  // room / lobby: host (room di browser ini) atau klien (gabung lewat kode)
  /** Room aktif + id pemain di perangkat ini; null bila tidak di room. */
  room(): { lobby: Lobby; me: string } | null;
  createRoom(name: string): void; leaveRoom(): void; startRoom(): void; addSimFriend(): void;
  setPlayerName(name: string): void;
  roomAct(a: RoomAction): void;
  joinRoom(code: string, name: string): Promise<{ ok: true } | { ok: false; reason: JoinFail }>;
  netInfo(): NetInfo;
  /** Pilihan map main solo / Latihan (setelan): disimpan & map langsung dimuat di menu ('random' = diundi saat Mulai). */
  selectMap(choice: MapChoice): void;
  /** Pilihan map yang BERLAKU untuk main solo / Latihan (?map= uji menimpa setelan sampai pemain memilih kartu). */
  mapChoice(): MapChoice;
  /** Map yang sedang dimuat (= map match yang sedang / baru saja dimainkan). */
  mapId(): MapId;
  /** Host online: teman tersambung yang bisa menerima serah-terima host (ping terbaik dulu). */
  handoverTargets(): { pid: string; name: string; ping: number | null }[];
  /** Host: serahkan room & match ke teman `pid` lalu keluar (match jalan terus untuk yang lain). */
  handover(pid: string): void;
  /** Host tanpa teman di tengah match: kode room tempat teman-teman melanjutkan (old = host lama yang mungkin masih jalan, setelah
   *  kita naik jadi host tapi tak ada yang menyusul), null = tidak relevan. */
  mergeBackCode(): { code: string; old: boolean } | null;
  mergeBack(): void;
  /** Tiket kembali ke match online (halaman sebelumnya di-refresh / ditutup di room online), null = tidak ada. */
  ticket(): { code: string; match: boolean } | null;
  /** Chat: pasang panel chat (elemen tetap) di placeholder menu; bisukan pemain (pid); teman manusia di room (menu pause). */
  chatAttach(slot: Element): void;
  isMuted(pid: string): boolean;
  toggleMute(pid: string): void;
  chatPeople(): { pid: string; name: string; team: Team }[];
  /** Voice: nyala di pengaturan, status mic, label tombol bicara [tim, semua]; aktifkan mic (izin browser). */
  voiceInfo(): { on: boolean; mic: 'off' | 'asking' | 'ready' | 'error'; err: string; keys: [string, string] };
  voiceMic(): Promise<boolean>;
  /** Tim pemain sekarang (match / room; main solo = Biru) — pakaian awal pratinjau karakter di Loadout. */
  myTeam(): Team;
  /** Gabung lagi dengan slot lama; hasil = pesan gagal (null = berhasil). */
  useTicket(): Promise<string | null>;
  dropTicket(): void;
}

/** "A, B & C" (daftar nama untuk teks menu). */
const listNames = (n: string[]) => n.length < 2 ? n.join('') : `${n.slice(0, -1).join(', ')} & ${n[n.length - 1]}`;
/** Urutan kartu pilihan map: semua map lalu "Acak". */
const MAP_CHOICES: readonly MapChoice[] = [...MAP_IDS, 'random'];
const choiceName = (c: MapChoice) => (c === 'random' ? 'Acak' : MAPS[c].name);
const MODE_NAME: Record<string, string> = { tdm: 'Team Deathmatch', elim: 'Eliminasi', practice: 'Latihan' };

/** Escape teks bebas untuk innerHTML (nama sudah dibersihkan cleanName, ini lapisan kedua). */
const esc = (t: string) => t.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const FIXED_KEYS: [string, string][] = [
  ['Klik kiri', 'Tembak / tebas pisau / masak granat → lempar jauh'], ['Klik kanan', 'ADS / tusuk pisau / masak granat → gelinding'],
  ['Scroll', 'Ganti senjata (1 → 2 → 3)'], ['Left Ctrl (tahan)', 'Jongkok tahan — hanya saat fullscreen + Keyboard Lock'],
  ['Esc', 'Pause (melepas pointer lock)'], ['F3', 'Overlay statistik'], ['` (Backquote)', 'Panel debug'],
];

const el = (html: string) => { const d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstElementChild as HTMLElement; };
const norm = (v: number, a: number, b: number) => Math.max(0.08, Math.min(1, (v - a) / (b - a)));

/** Tab kelas senjata utama di Loadout (hanya kelas yang punya senjata yang tampil). */
const CLASS_TABS: readonly [WeaponClass, string][] = [['AR', 'Assault Rifle'], ['SMG', 'SMG'], ['SG', 'Shotgun'], ['SR', 'Sniper'],
  ['DMR', 'DMR'], ['LMG', 'LMG']];

/** Bar statistik kartu senjata (skala sama untuk semua kelas → bisa dibandingkan antar-kelas). */
function weaponBars(w: WeaponDef): [string, number][] {
  return [['Damage', norm(w.baseDamage * pelletsOf(w), 20, 150)], ['RPM', norm(w.rpm, 40, 1250)],
    ['Kontrol', norm(5 - w.recoilVert, 0, 4.4)], ['Gerak', norm(moveMultOf(w), 0.82, 1.06)], ['Jarak', norm(falloffOf(w)[0], 8, 90)]];
}
const FOCUSABLE = 'button:not(:disabled), select, input[type=range], .wcard, .mode';
/** Lebar gambar denah kartu map (px CSS, 16:9): besar = Atur Match, kecil = setelan host room. */
const THUMB = { big: 208, small: 132 };

export class Menus {
  private root = document.getElementById('ui') as HTMLDivElement;
  current: string | null = null;
  private wSel: WeaponId = 'm416';
  private sSel: ScopeId = 'reddot';
  private pSel: WeaponId = 'deagle';
  private psSel: ScopeId = 'iron';
  private mSel: MeleeId = 'knife';
  private vSel: Variant = 'm';
  private stopCapture: (() => void) | null = null;
  private settingsTab = 'mouse';

  constructor(private api: MenuApi) {}

  hide() { this.cancelCapture(); this.root.innerHTML = ''; this.current = null; }
  get open() { return this.current !== null; }

  private mount(name: string, html: string) {
    this.cancelCapture();
    this.root.innerHTML = '';
    const m = el(`<div class="menu">${html}</div>`);
    this.root.appendChild(m);
    this.current = name;
    m.querySelectorAll('button').forEach(b => b.addEventListener('click', () => this.api.click()));
    return m;
  }

  showMain() {
    const mc = this.api.mapChoice();
    // kotak hitam: sesi halaman sebelumnya berakhir tidak normal (refresh/tutup tab/crash/grafis hilang di tengah match/room online)
    const issue = blackbox.prevIssue();
    const issueHtml = issue ? `<div class="bb-issue"><b>⚠ Sesi sebelumnya berakhir tidak normal</b> <span class="bb-when">(${esc(issue.when)})</span>
      <div class="bb-why">${esc(issue.text)}</div>
      <div class="bb-btns"><button data-a="bbcopy">Salin laporan</button><button data-a="bbclose">Tutup</button></div></div>` : '';
    // tiket kembali ke match: halaman sebelumnya hilang di tengah main bareng → teman-teman melanjutkan, slot kita dikembalikan
    const tk = this.api.ticket();
    const tkHtml = tk ? `<div class="bb-issue rejoin"><b>↻ Kembali ke ${tk.match ? 'match' : 'room'} teman-teman?</b>
      <div class="bb-why">Halaman sebelumnya tertutup / ter-refresh saat main bareng. Teman-teman tetap ${tk.match ? 'melanjutkan match' : 'di room'}
        (kode ${formatRoomCode(tk.code)}) — ${tk.match ? 'slotmu dimainkan bot sampai kamu kembali' : 'kamu bisa masuk lagi'}.</div>
      <div class="bb-btns"><button class="primary" data-a="tkgo">Kembali ke ${tk.match ? 'match' : 'room'}</button><button data-a="tkno">Abaikan</button></div>
      <div class="bb-why" data-tkmsg></div></div>` : '';
    const m = this.mount('main', `<div class="card main"><h1>STUD WARFARE</h1><div class="sub">BRICK HALL</div>${tkHtml}${issueHtml}
      <div class="btns"><button class="primary" data-a="play">▶ Main</button><button data-a="room">👥 Main Bareng (Room)</button>
      <button data-a="practice">◎ Latihan Menembak <small class="bsub">· ${esc(mc === 'random' ? 'map acak' : MAPS[mc].name)}</small></button>
      <button data-a="loadout">Loadout</button><button data-a="settings">Pengaturan</button><button data-a="controls">Kontrol</button>
      <button data-a="fs">Layar Penuh</button></div>
      <div class="note">Biru di Selatan menghadap Utara. Mode: Team Deathmatch atau Eliminasi melawan bot, atau Main Bareng di room (5 lawan 5, slot kosong diisi bot).
        ${MAP_IDS.length} map: ${listNames(MAP_IDS.map(id => MAPS[id].name))} — pilih di ▶ Main (Latihan memakai map yang sama). Gamepad didukung.</div>
      <button class="bb-link" data-a="bbreport" title="Catatan kejadian teknis (koneksi, grafis, error) untuk dikirim ke pengembang">Salin laporan teknis</button></div>`);
    this.on(m, 'bbcopy', () => this.copyReport(m, m.querySelector('[data-a="bbcopy"]')));
    this.on(m, 'bbreport', () => this.copyReport(m, m.querySelector('[data-a="bbreport"]')));
    this.on(m, 'bbclose', () => { blackbox.dismissPrev(); this.showMain(); });
    this.on(m, 'tkno', () => { this.api.dropTicket(); this.showMain(); });
    this.on(m, 'tkgo', () => {
      const btn = m.querySelector<HTMLButtonElement>('[data-a="tkgo"]')!, msg = m.querySelector<HTMLElement>('[data-tkmsg]')!;
      if (btn.disabled) return;
      btn.disabled = true; btn.textContent = 'Menyambung…'; msg.textContent = '';
      void this.api.useTicket().then((err) => {
        if (!err) return;
        btn.disabled = false; btn.textContent = 'Coba lagi'; msg.textContent = err;
      });
    });
    this.on(m, 'play', () => this.showMatchSetup(() => this.showMain()));
    this.on(m, 'room', () => (this.api.room() ? this.showRoom() : this.showLobbyHome(() => this.showMain())));
    this.on(m, 'practice', () => this.api.play(true));
    this.on(m, 'loadout', () => this.showLoadout(() => this.showMain()));
    this.on(m, 'settings', () => this.showSettings(() => this.showMain()));
    this.on(m, 'controls', () => this.showControls(() => this.showMain()));
    this.on(m, 'fs', () => this.api.fullscreen());
  }

  /** Atur match: mode (TDM / Eliminasi) + aturan + bot. Disimpan ke settings saat Mulai. */
  showMatchSetup(back: () => void) {
    const s = { ...this.api.settings() };
    const opt = (k: keyof Settings, list: readonly number[], fmt: (v: number) => string) =>
      `<select data-k="${k}">${list.map(v => `<option value="${v}" ${s[k] === v ? 'selected' : ''}>${fmt(v)}</option>`).join('')}</select>`;
    const m = this.mount('setup', `<div class="card setup"><h2>Atur Match</h2>
      <div class="sec">Map</div>
      <div class="maps">${MAP_CHOICES.map(c => this.mapCard(c, this.api.mapChoice() === c, 'data-map', true)).join('')}</div>
      <div class="sec">Mode</div>
      <div class="modes">
        <div class="mode" data-m="tdm" tabindex="0"><b>Team Deathmatch</b><span>Respawn 4 s. Tim pertama mencapai target kill, atau skor tertinggi saat waktu habis, menang.</span></div>
        <div class="mode" data-m="elim" tabindex="0"><b>Eliminasi</b><span>Tanpa respawn dalam ronde (2:00). Habisi tim lawan; yang mati menonton rekan. Menang ronde terbanyak.</span></div>
      </div>
      <div class="set-row tdm-only"><span>Target kill</span>${opt('scoreLimit', SCORE_LIMITS, v => `${v} kill`)}<span></span></div>
      <div class="set-row tdm-only"><span>Batas waktu</span>${opt('timeLimit', TIME_LIMITS, v => `${v} menit`)}<span></span></div>
      <div class="set-row elim-only"><span>Ronde untuk menang</span>${opt('roundsToWin', ROUNDS_TO_WIN, v => `${v} ronde`)}<span></span></div>
      <div class="set-row"><span>Kesulitan bot</span><select data-k="difficulty">${[['easy', 'Mudah'], ['normal', 'Normal'], ['hard', 'Sulit']]
        .map(([v, t]) => `<option value="${v}" ${s.difficulty === v ? 'selected' : ''}>${t}</option>`).join('')}</select><span></span></div>
      <div class="set-row"><span>Bot sekutu</span><input type="range" data-k="allies" min="0" max="4" step="1" value="${s.allies}"><span data-v="allies">${s.allies}</span></div>
      <div class="set-row"><span>Bot musuh</span><input type="range" data-k="enemies" min="1" max="5" step="1" value="${s.enemies}"><span data-v="enemies">${s.enemies}</span></div>
      <div class="row"><button class="primary" data-a="start">▶ Mulai</button><button data-a="back">Kembali</button></div></div>`);
    const setMode = (mode: 'tdm' | 'elim') => {
      s.mode = mode;
      m.querySelectorAll<HTMLElement>('.mode').forEach(x => x.classList.toggle('sel', x.dataset.m === mode));
      m.querySelectorAll<HTMLElement>('.tdm-only').forEach(x => (x.style.display = mode === 'tdm' ? '' : 'none'));
      m.querySelectorAll<HTMLElement>('.elim-only').forEach(x => (x.style.display = mode === 'elim' ? '' : 'none'));
    };
    m.querySelectorAll<HTMLElement>('.mode').forEach(x => x.addEventListener('click', () => { this.api.click(); setMode(x.dataset.m as 'tdm' | 'elim'); }));
    setMode(s.mode);
    // map: langsung disimpan & dimuat di menu (latar menu = pratinjau map); "Acak" diundi saat Mulai
    paintThumbs(m);
    m.querySelectorAll<HTMLButtonElement>('[data-map]').forEach(b => b.addEventListener('click', () => {
      const c = b.dataset.map as MapChoice;
      s.map = c;
      m.querySelectorAll<HTMLElement>('[data-map]').forEach(x => x.classList.toggle('sel', x.dataset.map === c));
      this.api.selectMap(c);
    }));
    this.bindInputs(m, s);
    this.on(m, 'start', () => { this.api.applySettings(s); this.api.play(false); });
    this.on(m, 'back', back);
  }

  // ───────────────────────────── Main Bareng (room / lobby) — online lewat WebRTC (host = browser pembuat room)
  /** Layar awal Main Bareng: nama, Buat Room, Gabung Room (kode / link). code = kode dari link ?room=; message = info (mis. room ditutup). */
  showLobbyHome(back: () => void, code = '', message = '') {
    const s = this.api.settings(), LB = XCFG.lobby, internet = onlineConfigured();
    const m = this.mount('lobby', `<div class="card lobby-home"><h2>Main Bareng Teman</h2>
      <div class="set-row"><span>Nama kamu</span><input class="txt" data-name maxlength="${LB.nameMax}" value="${esc(s.playerName)}" placeholder="mis. Aldy"><span></span></div>
      <div class="lh-grid">
        <div class="lh-box"><b>Buat Room</b><span>Kamu jadi host: atur mode & aturan, bagikan kode ke teman. Slot kosong otomatis diisi bot (5 lawan 5).</span>
          <button class="primary" data-a="create">＋ Buat Room</button></div>
        <div class="lh-box"><b>Gabung Room</b><span>Masukkan kode dari host (contoh K7R-B2X) atau tempel link room.</span>
          <input class="txt code" data-code maxlength="80" placeholder="KODE ROOM" value="${esc(code)}">
          <button data-a="join">Gabung</button></div>
      </div>
      <div class="lh-msg" data-msg></div>
      <div class="note">${internet
        ? 'Online: teman di perangkat & jaringan lain bisa gabung lewat kode. Browser host menjalankan match — host sebaiknya pakai koneksi paling stabil dan jangan menutup tab selama main.'
        : 'Mode <b>uji lokal</b>: room hanya terlihat dari tab lain di browser ini (server signaling belum dipasang — lihat README "Main online"). Main sendiri dengan bot & teman simulasi tetap bisa.'}</div>
      <div class="row"><button data-a="back">Kembali</button></div></div>`);
    const nameIn = m.querySelector('[data-name]') as HTMLInputElement, codeIn = m.querySelector('[data-code]') as HTMLInputElement;
    const msg = m.querySelector('[data-msg]') as HTMLElement, joinBtn = m.querySelector('[data-a="join"]') as HTMLButtonElement;
    const name = () => {
      const n = cleanName(nameIn.value);
      if (!n) { msg.textContent = `Isi nama kamu dulu (huruf/angka, maks ${LB.nameMax}).`; nameIn.focus(); return null; }
      nameIn.value = n; this.api.setPlayerName(n);
      return n;
    };
    const fail = (r: JoinFail, c: string): string => ({
      notfound: `Room ${formatRoomCode(c)} tidak ditemukan — cek kodenya & pastikan host masih di layar room${internet ? '' : ' (uji lokal: room harus dibuat di tab lain browser ini)'}.`,
      full: 'Room penuh (maks 10 orang).',
      started: 'Match di room itu sedang berjalan — coba lagi setelah match selesai.',
      timeout: 'Host ditemukan tapi koneksi tidak tersambung (jaringan / NAT ketat). Coba lagi; bila terus gagal, pasang TURN (README "Main online").',
      failed: 'Gagal terhubung — cek internet lalu coba lagi.',
    } as Record<JoinFail, string>)[r];
    let joining = false;
    this.on(m, 'create', () => { const n = name(); if (n) { this.api.createRoom(n); this.showRoom(); } });
    this.on(m, 'join', () => {
      if (joining || !name()) return;
      const c = parseRoomCode(codeIn.value);
      if (!c) { msg.textContent = 'Kode room tidak valid (6 huruf/angka, contoh K7R-B2X).'; return; }
      joining = true; joinBtn.disabled = true;
      msg.textContent = `Menghubungkan ke room ${formatRoomCode(c)}…`;
      void this.api.joinRoom(c, nameIn.value).then((r) => {
        joining = false;
        if (this.current !== 'lobby') return;
        joinBtn.disabled = false;
        if (r.ok) this.showRoom(); else msg.textContent = fail(r.reason, c);
      });
    });
    nameIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') m.querySelector<HTMLButtonElement>('[data-a="create"]')!.click(); });
    codeIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') joinBtn.click(); });
    const c0 = code ? parseRoomCode(code) : null;
    if (c0) { codeIn.value = formatRoomCode(c0); msg.textContent = `Link room ${formatRoomCode(c0)} — isi nama lalu tekan Gabung.`; }
    if (message) msg.textContent = message;
    this.on(m, 'back', () => { if (joining) this.api.leaveRoom(); back(); });
    if (!s.playerName) nameIn.focus(); else if (c0) joinBtn.focus();
  }

  /** Room: kode + link, 2 tim × 5 slot (pemain / bot pengisi / kosong), pindah tim, siap, setelan host, mulai.
   *  notice = pesan sekali tampil di baris status (mis. "Host mengakhiri match"). */
  showRoom(notice = '') {
    const R = this.api.room();
    if (!R) { this.showMain(); return; }
    const { lobby: L, me } = R, mine = L.find(me);
    if (!mine) { this.showMain(); return; }
    const host = mine.host, st = L.settings, LB = XCFG.lobby, net = this.api.netInfo(), client = net.role === 'client';
    const diff = ({ easy: 'Mudah', normal: 'Normal', hard: 'Sulit' } as const)[st.difficulty];
    const teamName = (t: Team) => (t === 'blue' ? 'Biru' : 'Merah');
    const slotRow = (sv: SlotView) => {
      const p = sv.player;
      if (p) {
        const tag = p.id === me ? ' <small>(kamu)</small>' : p.sim ? ' <small>(simulasi)</small>' : '';
        const state = p.host ? '<span class="st host">HOST</span>' : `<span class="st ${p.ready ? 'ok' : ''}">${p.ready ? '✔ Siap' : '⏳ Belum siap'}</span>`;
        const kick = host && p.id !== me ? `<button class="x" data-kick="${p.id}" title="Keluarkan dari room">✕</button>` : '';
        const mute = p.id !== me && !p.sim ? this.muteBtn(p.id, '') : '';
        const talk = p.sim ? '' : `<span class="talk" data-talk="${esc(p.id)}" title="Sedang bicara">🎙</span>`;
        const ping = !p.host && !p.sim ? `<span class="ping" data-ping="${p.id}"></span>` : '';
        return `<div class="slot ${p.id === me ? 'me' : ''}"><span class="nm">${p.host ? '👑 ' : ''}${esc(p.name)}${tag}</span>${talk}${ping}${state}${mute}${kick}</div>`;
      }
      if (sv.bot) return `<div class="slot bot"><span class="nm">🤖 ${sv.bot}</span><span class="st">BOT · ${diff}</span></div>`;
      return '<div class="slot empty"><span class="nm">— slot kosong —</span></div>';
    };
    const teamCol = (t: Team) => {
      const hs = L.humans(t).length, bots = L.slots(t).filter(s => s.bot).length;
      const move = mine.team === t ? '' : `<button data-move="${t}" ${hs >= LB.teamSize ? 'disabled' : ''}>Pindah ke ${teamName(t)}</button>`;
      return `<div class="tcol ${t}"><h3>${teamName(t).toUpperCase()} <small>${hs} orang${bots ? ` · ${bots} bot` : ''}</small></h3>
        ${L.slots(t).map(slotRow).join('')}${move}</div>`;
    };
    const opt = (k: keyof RoomSettings, list: readonly number[], fmt: (v: number) => string) =>
      `<select data-rk="${k}" ${host ? '' : 'disabled'}>${list.map(v => `<option value="${v}" ${st[k] === v ? 'selected' : ''}>${fmt(v)}</option>`).join('')}</select>`;
    const chk = L.canStart(me);
    const m = this.mount('room', `<div class="card room">
      <div class="room-head"><h2>ROOM <span class="code">${formatRoomCode(L.code)}</span></h2>
        <button data-a="copy">Salin Link</button>${this.netBadge(net)}</div>
      <div class="teams">${teamCol('blue')}${teamCol('red')}</div>
      <div class="room-chat" data-chat></div>${this.voiceBar()}
      <div class="host-set"><h3>Setelan host${host ? '' : ' <small>(hanya host yang bisa mengubah)</small>'}</h3>
        <div class="maps small">${MAP_CHOICES.map(c => this.mapCard(c, st.map === c, 'data-rmap', false, !host)).join('')}
          <div class="map-now"><span>Map</span><b>${esc(choiceName(st.map))}</b><small>${esc(st.map === 'random' ? 'diundi host saat Mulai' : mapFacts(MAPS[st.map]))}</small></div></div>
        <div class="modes">
          <div class="mode ${st.mode === 'tdm' ? 'sel' : ''}" data-m="tdm" tabindex="0"><b>Team Deathmatch</b><span>Respawn 4 s, target kill / skor tertinggi.</span></div>
          <div class="mode ${st.mode === 'elim' ? 'sel' : ''}" data-m="elim" tabindex="0"><b>Eliminasi</b><span>Tanpa respawn dalam ronde, menang ronde terbanyak.</span></div>
        </div>
        <div class="hs-grid">
          ${st.mode === 'tdm'
            ? `<label>Target kill ${opt('scoreLimit', SCORE_LIMITS, v => `${v} kill`)}</label><label>Batas waktu ${opt('timeLimit', TIME_LIMITS, v => `${v} menit`)}</label>`
            : `<label>Ronde untuk menang ${opt('roundsToWin', ROUNDS_TO_WIN, v => `${v} ronde`)}</label>`}
          <label>Kesulitan bot <select data-rk="difficulty" ${host ? '' : 'disabled'}>${[['easy', 'Mudah'], ['normal', 'Normal'], ['hard', 'Sulit']]
            .map(([v, t]) => `<option value="${v}" ${st.difficulty === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
          <label>Isi slot kosong dengan bot <select data-rk="fillBots" ${host ? '' : 'disabled'}><option value="true" ${st.fillBots ? 'selected' : ''}>On (5 lawan 5)</option>
            <option value="false" ${st.fillBots ? '' : 'selected'}>Off (hanya manusia)</option></select></label>
          <label>Chat & voice ke semua saat match <select data-rk="allTalk" ${host ? '' : 'disabled'}><option value="true" ${st.allTalk ? 'selected' : ''}>On (kedua tim)</option>
            <option value="false" ${st.allTalk ? '' : 'selected'}>Off (hanya tim)</option></select></label>
          ${host ? '<button data-a="shuffle">⇄ Acak Tim</button>' : ''}
        </div></div>
      ${host ? `<div class="sim"><button data-a="sim" ${L.full ? 'disabled' : ''}>＋ Teman (simulasi)</button>
        <span>Untuk mencoba tanpa teman: teman simulasi masuk lalu siap sendiri; di match dimainkan bot dengan namanya.</span></div>` : ''}
      <div class="row">${host ? `<button class="primary" data-a="start" ${chk.ok ? '' : 'disabled'}>▶ Mulai</button>` : ''}
        ${host ? '' : `<button class="${mine.ready ? '' : 'primary'}" data-a="ready">${mine.ready ? 'Batal Siap' : '✔ Siap'}</button>`}
        <button data-a="loadout">Loadout</button><button data-a="leave">Keluar Room</button>
        <span class="room-status">${notice ? `<b>${esc(notice)}</b> · ` : ''}${client ? (mine.ready ? 'Siap — menunggu host memulai' : 'Tekan Siap bila sudah siap main') : chk.ok ? 'Semua siap — host bisa mulai' : chk.reason}</span></div></div>`);
    this.updatePings(net.pings);
    // host: perubahan langsung tampil; klien: tampil setelah host menyiarkan room baru (refreshRoom)
    const act = (a: RoomAction) => { this.api.roomAct(a); if (!client) this.showRoom(); };
    m.querySelectorAll<HTMLElement>('[data-move]').forEach(b => b.addEventListener('click', () => act({ type: 'team', team: b.dataset.move as Team })));
    m.querySelectorAll<HTMLElement>('[data-kick]').forEach(b => b.addEventListener('click', () => act({ type: 'kick', id: b.dataset.kick! })));
    m.querySelectorAll<HTMLElement>('.mode').forEach(x => x.addEventListener('click', () => {
      if (!host) return;
      this.api.click(); act({ type: 'settings', patch: { mode: x.dataset.m as RoomSettings['mode'] } });
    }));
    paintThumbs(m);
    m.querySelectorAll<HTMLButtonElement>('[data-rmap]').forEach(b => b.addEventListener('click', () => {
      if (host && b.dataset.rmap !== st.map) act({ type: 'settings', patch: { map: b.dataset.rmap as MapChoice } });
    }));
    m.querySelectorAll<HTMLSelectElement>('select[data-rk]').forEach(se => se.addEventListener('change', () => {
      const k = se.dataset.rk as keyof RoomSettings, v = se.value;
      act({ type: 'settings', patch: { [k]: v === 'true' ? true : v === 'false' ? false : /^\d+$/.test(v) ? Number(v) : v } as Partial<RoomSettings> });
    }));
    this.on(m, 'shuffle', () => act({ type: 'shuffle' }));
    this.attachChat(m, () => this.showRoom());
    this.on(m, 'sim', () => { this.api.addSimFriend(); this.showRoom(); });
    this.on(m, 'ready', () => act({ type: 'ready', ready: !mine.ready }));
    this.on(m, 'start', () => this.api.startRoom());
    this.on(m, 'loadout', () => this.showLoadout(() => this.showRoom()));
    this.on(m, 'leave', () => { this.api.leaveRoom(); this.showMain(); });
    this.on(m, 'copy', () => {
      const url = `${location.origin}${location.pathname}?room=${L.code}`, b = m.querySelector('[data-a="copy"]') as HTMLButtonElement;
      const done = (ok: boolean) => { b.textContent = ok ? '✔ Link disalin' : url; };
      if (navigator.clipboard?.writeText) navigator.clipboard.writeText(url).then(() => done(true), () => done(false)); else done(false);
    });
  }

  /** Perbarui tampilan room bila sedang terbuka (teman masuk/keluar/siap, room dari host). Fokus kolom/pilihan dipertahankan. */
  refreshRoom() {
    if (this.current !== 'room') return;
    const f = document.activeElement as HTMLElement | null;
    const key = f?.dataset.rk ?? f?.dataset.a ?? f?.dataset.move ?? f?.dataset.rmap ?? null;
    this.showRoom();
    if (key) (this.root.querySelector(`[data-rk="${key}"],[data-a="${key}"],[data-move="${key}"],[data-rmap="${key}"]`) as HTMLElement | null)?.focus();
  }

  /** Ping teman di layar room (diperbarui di tempat tiap ±2 s, tanpa menggambar ulang room). */
  updatePings(pings: Record<string, number>) {
    if (this.current !== 'room') return;
    const N = XCFG.net;
    this.root.querySelectorAll<HTMLElement>('[data-ping]').forEach((el) => {
      const ms = pings[el.dataset.ping!];
      if (ms === undefined) { el.textContent = ''; el.className = 'ping'; el.title = ''; return; }
      const bad = ms >= N.pingWarn;
      el.textContent = `${bad ? '⚠ ' : ''}${ms} ms`;
      el.className = 'ping ' + (ms < N.pingGood ? 'good' : bad ? 'bad' : 'mid');
      el.title = bad ? 'Ping tinggi — bisa terasa delay. Coba jaringan lain atau pilih host yang lebih dekat.' : 'Ping ke host';
    });
  }

  /** Kartu pilihan map: denah prosedural (16:9) + nama; kartu besar juga ringkasan & deskripsi. disabled = klien room (tampil saja). */
  private mapCard(c: MapChoice, sel: boolean, attr: string, big: boolean, disabled = false): string {
    const w = big ? THUMB.big : THUMB.small, h = Math.round((w * 9) / 16), name = choiceName(c);
    const facts = c === 'random' ? `${MAP_IDS.length} map · diundi tiap match` : mapFacts(MAPS[c]);
    const desc = c === 'random' ? 'Map diundi setiap match dimulai. Main Lagi / Ulangi memakai map yang sama.' : MAPS[c].desc;
    return `<button class="mapcard${big ? '' : ' small'}${sel ? ' sel' : ''}" ${attr}="${c}" ${disabled ? 'disabled' : ''} title="${esc(`${name} — ${desc}`)}">` +
      thumbHTML(c, w, h) +
      `<b>${esc(name)}</b>${big ? `<i>${esc(facts)}</i><span>${esc(desc)}</span>` : ''}</button>`;
  }

  private netBadge(n: NetInfo): string {
    if (n.role === 'client') return `<span class="badge on">● Terhubung ke host${n.internet ? '' : ' (uji lokal)'}</span>`;
    if (n.state === 'connecting') return '<span class="badge wait">● Menyiapkan room…</span>';
    if (n.state === 'error') return '<span class="badge local">● Offline — signaling gagal (tetap bisa main dengan bot)</span>';
    const who = n.peers ? `${n.peers} teman terhubung` : 'menunggu teman';
    return n.internet ? `<span class="badge on">● Online — ${who}</span>` : `<span class="badge local">● Uji lokal (antar-tab) — ${who}</span>`;
  }

  showLoadout(back: () => void, inMatch = false) {
    const s = this.api.settings();
    this.wSel = s.weapon; this.sSel = s.scope; this.pSel = s.pistol; this.psSel = s.pscope; this.mSel = s.melee; this.vSel = s.charVariant;
    let tSel: Team = this.api.myTeam(), cSel: WeaponClass = classOf(WEAPONS[this.wSel]);
    const m = this.mount('loadout', `<div class="card loadout"><h2>Loadout ${inMatch ? '<small style="font-size:13px;opacity:.7">— senjata berlaku pada spawn berikutnya</small>' : ''}</h2>
      <div class="lo-cols">
        <div class="lo-char">
          <div class="lo-prev" data-prev><span class="lo-fail">Pratinjau 3D tidak tersedia di perangkat ini</span></div>
          <div class="charsel"><span>Karakter</span><button data-v="m">Pria</button><button data-v="f">Wanita</button><button data-v="v" class="special" title="Karakter khusus">Venny ★</button></div>
          <div class="lo-team"><span>Lihat pakaian</span><button data-tm="blue">Biru</button><button data-tm="red">Merah</button></div>
          <small>Biru: pasukan taktis · Merah: gerilyawan — pakaian di match mengikuti timmu. Venny = karakter khusus (dua kostum). Seret untuk memutar · gulir / klik dua kali untuk melihat wajah.</small>
        </div>
        <div class="lo-weap">
          <div class="lo-sec">Senjata utama <i>slot 1</i></div>
          <div class="lo-cls"></div><div class="grid"></div><div class="scopes"></div>
          <div class="lo-sec">Pistol <i>slot 2 · cabut cepat saat magazen utama habis</i></div>
          <div class="grid pgrid"></div><div class="scopes pscopes"></div>
          <div class="lo-sec">Jarak dekat <i>slot 3 · klik kiri ringan, klik kanan berat · dari belakang lebih mematikan</i></div>
          <div class="grid mgrid"></div>
          <div class="lo-keys">1 utama · 2 pistol · 3 pisau · 4 K-400 · 5 flashbang · Q senjata sebelumnya</div>
        </div>
      </div>
      <div class="row"><button class="primary" data-a="ok">Simpan</button><button data-a="back">Kembali</button></div></div>`);
    const cls = m.querySelector('.lo-cls')!, grid = m.querySelector('.grid:not(.pgrid)')!, scopes = m.querySelector('.scopes:not(.pscopes)')!;
    const pgrid = m.querySelector('.pgrid')!, pscopes = m.querySelector('.pscopes')!, mgrid = m.querySelector('.mgrid')!;
    // pratinjau karakter 3D (tim, pria/wanita, senjata + optik pilihan) — dirender hanya selama Loadout tampil
    const prev = this.preview ??= new CharPreview(), slot = m.querySelector('[data-prev]')!;
    slot.prepend(prev.el);
    const showPrev = () => prev.set(tSel, this.vSel, this.wSel, this.sSel);
    showPrev();
    if (!prev.start()) slot.classList.add('fail');
    const vBtns = m.querySelectorAll<HTMLButtonElement>('.charsel button'), tBtns = m.querySelectorAll<HTMLButtonElement>('.lo-team button');
    const renderV = () => vBtns.forEach(b => b.classList.toggle('sel', b.dataset.v === this.vSel));
    const renderT = () => tBtns.forEach(b => b.classList.toggle('sel', b.dataset.tm === tSel));
    vBtns.forEach(b => b.addEventListener('click', () => { this.api.click(); this.vSel = cleanVariant(b.dataset.v); renderV(); showPrev(); }));
    tBtns.forEach(b => b.addEventListener('click', () => { this.api.click(); tSel = b.dataset.tm as Team; renderT(); showPrev(); }));
    renderV(); renderT();
    const ALL: readonly WeaponId[] = [...WEAPON_ORDER, ...X_ORDER];
    const primaries = ALL.filter(id => classOf(WEAPONS[id]) !== 'PISTOL'), pistols = ALL.filter(id => classOf(WEAPONS[id]) === 'PISTOL');
    const classes = CLASS_TABS.filter(([c]) => primaries.some(id => classOf(WEAPONS[id]) === c));
    const card = (id: WeaponId, sel: boolean) => {
      const w = WEAPONS[id];
      return `<div class="wcard ${sel ? 'sel' : ''}" data-w="${id}" tabindex="0"><b>${w.name}</b><span class="wmeta">${w.caliber} · ` +
        `${w.modes.map(x => x.replace('BURST', 'B')).join('/')} · ${w.magSize} peluru</span>` +
        (w.role ? `<span class="wrole">${w.role}</span>` : '') +
        weaponBars(w).map(([n, v]) => `<div class="stat"><span>${n}</span><i><b style="width:${Math.round(v * 100)}%"></b></i></div>`).join('') + '</div>';
    };
    const scopeBtns = (w: WeaponDef, sel: ScopeId) => SCOPE_ORDER.filter(sid => w.scopes ? w.scopes.includes(sid) : true).map(sid => {
      const sc = SCOPES[sid], ok = scopeAllowed(w, sid);
      return `<button data-s="${sid}" class="${sid === sel ? 'sel' : ''}" ${ok ? '' : `disabled title="Terkunci untuk ${w.name}"`}>${sc.name} · ${effectiveZoom(sc.fov).toFixed(2)}×</button>`;
    }).join('');
    const render = () => {
      cls.innerHTML = classes.map(([c, label]) => `<button data-c="${c}" class="${c === cSel ? 'sel' : ''}">${label}</button>`).join('');
      grid.innerHTML = primaries.filter(id => classOf(WEAPONS[id]) === cSel).map(id => card(id, id === this.wSel)).join('');
      scopes.innerHTML = scopeBtns(WEAPONS[this.wSel], this.sSel);
      pgrid.innerHTML = pistols.map(id => card(id, id === this.pSel)).join('');
      mgrid.innerHTML = MELEE_ORDER.map(id => {
        const d = MELEES[id], bars: [string, number][] = [['Ringan', norm(d.light.damage, 20, 70)], ['Berat', norm(d.heavy.damage, 40, 110)],
          ['Cepat', norm(1.1 - d.light.duration, 0.3, 0.8)], ['Jangkau', norm(d.reach, 2.6, 3.9)], ['Lari', norm(d.moveMult, 1.0, 1.12)]];
        return `<div class="wcard ${id === this.mSel ? 'sel' : ''}" data-m="${id}" tabindex="0"><b>${d.name}</b>` +
          `<span class="wmeta">${d.light.damage} / ${d.heavy.damage} · belakang ${d.heavy.backDamage}</span><span class="wrole">${d.role}</span>` +
          bars.map(([n, v]) => `<div class="stat"><span>${n}</span><i><b style="width:${Math.round(v * 100)}%"></b></i></div>`).join('') + '</div>';
      }).join('');
      pscopes.innerHTML = scopeBtns(WEAPONS[this.pSel], this.psSel);
      showPrev();
      cls.querySelectorAll<HTMLButtonElement>('button').forEach(b => b.addEventListener('click', () => {
        this.api.click(); cSel = b.dataset.c as WeaponClass; render();
        (cls.querySelector(`[data-c="${cSel}"]`) as HTMLElement | null)?.focus();
      }));
      grid.querySelectorAll<HTMLElement>('.wcard').forEach(c => c.addEventListener('click', () => {
        this.api.click(); this.wSel = c.dataset.w as WeaponId; this.sSel = fitScope(WEAPONS[this.wSel], this.sSel);
        render();
        (grid.querySelector(`[data-w="${this.wSel}"]`) as HTMLElement | null)?.focus();
      }));
      scopes.querySelectorAll<HTMLButtonElement>('button').forEach(b => b.addEventListener('click', () => {
        this.api.click(); this.sSel = b.dataset.s as ScopeId; render();
        (scopes.querySelector(`[data-s="${this.sSel}"]`) as HTMLElement | null)?.focus();
      }));
      pgrid.querySelectorAll<HTMLElement>('.wcard').forEach(c => c.addEventListener('click', () => {
        this.api.click(); this.pSel = c.dataset.w as WeaponId; this.psSel = fitScope(WEAPONS[this.pSel], this.psSel); render();
        (pgrid.querySelector(`[data-w="${this.pSel}"]`) as HTMLElement | null)?.focus();
      }));
      mgrid.querySelectorAll<HTMLElement>('.wcard').forEach(c => c.addEventListener('click', () => {
        this.api.click(); this.mSel = c.dataset.m as MeleeId; render();
        (mgrid.querySelector(`[data-m="${this.mSel}"]`) as HTMLElement | null)?.focus();
      }));
      pscopes.querySelectorAll<HTMLButtonElement>('button').forEach(b => b.addEventListener('click', () => {
        this.api.click(); this.psSel = b.dataset.s as ScopeId; render();
        (pscopes.querySelector(`[data-s="${this.psSel}"]`) as HTMLElement | null)?.focus();
      }));
    };
    render();
    this.on(m, 'ok', () => {
      prev.stop();
      this.api.setLoadout({ weapon: this.wSel, scope: this.sSel, pistol: this.pSel, pscope: this.psSel, melee: this.mSel }, this.vSel); back();
    });
    this.on(m, 'back', () => { prev.stop(); back(); });
  }

  /** draft: nilai yang sedang diedit (dipakai saat memilih preset crosshair agar perubahan lain tidak hilang). */
  showSettings(back: () => void, draft?: Settings) {
    const s = draft ?? { ...this.api.settings() };
    const px = (v: number) => v + ' px', pct = (v: number) => Math.round(v * 100) + '%', hz = this.api.refreshHz();
    const fmtOf: Partial<Record<keyof Settings, (v: number) => string>> = {
      fov: v => v + '°', volMaster: v => String(Math.round(v)), volSfx: v => String(Math.round(v)), volUi: v => String(Math.round(v)),
      volVoice: v => String(Math.round(v)),
      shake: v => Math.round(v) + '%', brightness: v => Math.round(v * 100) + '%', xhLen: px, xhThick: px,
      xhGap: v => Math.max(0, XCFG.hud.crosshairBaseGap + v) + ' px', xhAlpha: pct, xhDotSize: px, xhDotAlpha: pct, xhCircleR: px,
      xhCircleThick: px, xhOutlineThick: px, xhOutlineAlpha: pct, xhDynMult: v => '×' + v.toFixed(1),
    };
    const rng = (k: keyof Settings, label: string, min: number, max: number, step: number) =>
      `<div class="set-row"><span>${label}</span><input type="range" data-k="${k}" min="${min}" max="${max}" step="${step}" value="${s[k]}"><span data-v="${k}">${(fmtOf[k] ?? ((v: number) => v.toFixed(2)))(s[k] as number)}</span></div>`;
    const sel = (k: keyof Settings, label: string, opts: [string, string][]) =>
      `<div class="set-row"><span>${label}</span><select data-k="${k}">${opts.map(([v, t]) => `<option value="${v}" ${String(s[k]) === v ? 'selected' : ''}>${t}</option>`).join('')}</select><span></span></div>`;
    const onOff = (k: keyof Settings, label: string) => sel(k, label, [['true', 'On'], ['false', 'Off']]);
    const grp = (f: string, html: string) => `<div data-for="${f}">${html}</div>`;
    const tabs: [string, string][] = [['mouse', 'Mouse & Kontrol'], ['xh', 'Crosshair'], ['gfx', 'Grafik'], ['audio', 'Audio'], ['hud', 'HUD & Gameplay']];
    const m = this.mount('settings', `<div class="card settings"><h2>Pengaturan</h2>
      <div class="tabs">${tabs.map(([id, t]) => `<button data-tab="${id}">${t}</button>`).join('')}</div>
      <div class="tab" data-t="mouse">
        ${rng('sens', 'Sensitivitas hipfire (1.0 = 0.044°/px)', 0.1, 5, 0.05)}
        ${rng('adsMult', 'Pengali sensitivitas ADS', 0.5, 1.5, 0.05)}
        ${rng('fov', 'FOV vertikal', 70, 90, 1)}
        ${sel('invertY', 'Invert Y', [['false', 'Off'], ['true', 'On']])}
        ${sel('adsToggle', 'Mode ADS', [['false', 'Tahan'], ['true', 'Toggle']])}
        ${sel('crouchToggle', 'Mode jongkok', [['true', 'Toggle'], ['false', 'Tahan']])}
        ${rng('padSens', 'Sensitivitas stik gamepad', 0.3, 3, 0.05)}
        <div class="note">Ubah tombol keyboard/mouse di menu <b>Kontrol</b>.</div>
      </div>
      <div class="tab" data-t="xh">
        <div class="xh-prev"><span class="lbl a">latar gelap</span><span class="lbl b">latar terang</span></div>
        <div class="xh-sim">Uji: <button data-sim="idle">Diam</button><button data-sim="move">Jalan</button><button data-sim="air">Lompat</button>
          <button data-sim="fire">Tembak ×6</button></div>
        <div class="set-row"><span>Preset</span><select data-preset><option value="">— pilih preset —</option>${XH_PRESETS.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}</select><span></span></div>
        ${sel('xhShape', 'Bentuk', XH_SHAPES.map(([v, t]) => [v, t] as [string, string]))}
        ${sel('xhMode', 'Perilaku', XH_MODES.map(([v, t]) => [v, t] as [string, string]))}
        <div class="set-row"><span>Warna</span><div class="xh-swatch">${XH_COLORS.map(([c, t]) => `<button data-c="${c}" title="${t}" style="background:${c}"></button>`).join('')}
          <input type="color" data-color value="${s.xhColor}" title="Warna bebas"></div><span></span></div>
        ${rng('xhAlpha', 'Kepekatan warna', 0.2, 1, 0.05)}
        ${grp('lines', rng('xhLen', 'Panjang garis', 1, 20, 1) + rng('xhThick', 'Ketebalan garis', 1, 6, 1))}
        ${grp('gap', rng('xhGap', 'Celah tengah (dari pusat)', -3, 15, 1))}
        ${grp('dot', rng('xhDotSize', 'Ukuran titik tengah', 1, 10, 1) + rng('xhDotAlpha', 'Kepekatan titik', 0, 1, 0.05))}
        ${grp('circle', rng('xhCircleR', 'Jari-jari lingkaran', 3, 40, 1) + rng('xhCircleThick', 'Tebal lingkaran', 1, 5, 1))}
        ${onOff('xhOutline', 'Outline hitam')}
        ${grp('ol', rng('xhOutlineThick', 'Tebal outline', 1, 3, 1) + rng('xhOutlineAlpha', 'Kepekatan outline', 0.1, 1, 0.05))}
        ${grp('dyn', rng('xhDynMult', 'Pengali dinamis (gerak & tembak)', 0, 3, 0.1))}
        <div class="note">Dinamis: celah mengikuti akurasi senjata (gerak, lompat, jongkok) + mekar sesaat saat menembak.
          Hybrid: garis dalam & titik tetap, garis luar / lingkaran yang mengembang.</div>
      </div>
      <div class="tab" data-t="gfx">
        ${sel('preset', 'Preset kualitas', [['LOW', 'LOW'], ['MEDIUM', 'MEDIUM (Iris Xe)'], ['HIGH', 'HIGH (+ bloom)'], ['ULTRA', 'ULTRA (GPU kuat, + SSAO)']])}
        ${onOff('gfxReflect', 'Pantulan & material realistis (MEDIUM+)')}
        ${onOff('gfxFog', 'Kabut / kedalaman udara')}
        ${onOff('gfxDust', 'Berkas cahaya & debu (MEDIUM+)')}
        ${onOff('gfxBloom', 'Bloom — pendar lampu (HIGH+)')}
        ${onOff('gfxSsao', 'AO layar / SSAO (ULTRA)')}
        ${sel('renderScale', 'Skala resolusi', RENDER_SCALES.map(v => [String(v), v === 0 ? 'Otomatis (dinamis, ikut target FPS)' : Math.round(v * 100) + '%'] as [string, string]))}
        ${sel('fpsCap', 'Batas FPS', FPS_CAPS.map(d => [String(d), (d === 1 ? 'Ikut layar' : d === 2 ? '½ layar' : '⅓ layar') + ` (${Math.round(hz / d)} FPS)`] as [string, string]))}
        ${rng('brightness', 'Kecerahan', 0.6, 1.6, 0.05)}
        ${rng('shake', 'Gerak kamera & senjata (ayunan, miring, FOV sprint, guncangan)', 0, 100, 5)}
        ${sel('showFps', 'Tampilkan FPS', [['false', 'Off'], ['true', 'On']])}
        <div class="note">Mengganti preset (MSAA/bayangan) memuat ulang halaman. Batas FPS selalu kelipatan refresh layar (${Math.round(hz)} Hz)
          agar setiap frame tampil sama lama — pilih ½ bila preset berat tidak kuat stabil di refresh penuh (resolusi otomatis menyesuaikan).</div>
      </div>
      <div class="tab" data-t="audio">
        ${rng('volMaster', 'Volume master', 0, 100, 1)}
        ${rng('volSfx', 'Volume SFX', 0, 100, 1)}
        ${rng('volUi', 'Volume UI', 0, 100, 1)}
        ${onOff('voice', 'Voice chat (tahan T = tim, Z = semua)')}
        ${rng('volVoice', 'Volume voice', 0, 100, 1)}
      </div>
      <div class="tab" data-t="hud">
        ${onOff('minimap', 'Minimap / radar')}
        ${onOff('nameplates', 'Nama di atas kepala')}
        ${onOff('killcam', 'Killcam (replay dari mata pembunuh)')}
        ${onOff('dmgNumbers', 'Angka damage melayang')}
        ${onOff('nadeArc', 'Garis lintasan & titik jatuh granat / flashbang')}
        ${onOff('chatBots', 'Laporan musuh dari bot di chat tim')}
        ${sel('fullPause', 'Jeda penuh saat pause', [['false', 'Off (bot tetap jalan)'], ['true', 'On']])}
      </div>
      <div class="row"><button class="primary" data-a="ok">Simpan</button><button data-a="reset">Reset default</button><button data-a="back">Kembali</button></div></div>`);
    const showTab = (id: string) => {
      this.settingsTab = id;
      m.querySelectorAll<HTMLElement>('.tab').forEach(t => (t.style.display = t.dataset.t === id ? '' : 'none'));
      m.querySelectorAll<HTMLElement>('[data-tab]').forEach(b => b.classList.toggle('sel', b.dataset.tab === id));
    };
    m.querySelectorAll<HTMLElement>('[data-tab]').forEach(b => b.addEventListener('click', () => showTab(b.dataset.tab!)));
    showTab(this.settingsTab);
    const preview = this.crosshairPreview(m, s, back);
    this.bindInputs(m, s, fmtOf, preview);
    preview();
    this.on(m, 'ok', () => { this.api.applySettings(s); back(); });
    this.on(m, 'reset', () => {
      const keep = this.api.settings();
      this.api.applySettings(validate({ ...DEFAULTS, binds: keep.binds, weapon: keep.weapon, scope: keep.scope, mode: keep.mode,
        scoreLimit: keep.scoreLimit, timeLimit: keep.timeLimit, roundsToWin: keep.roundsToWin, difficulty: keep.difficulty,
        allies: keep.allies, enemies: keep.enemies, preset: keep.preset, map: keep.map }));
      this.showSettings(back);
    });
    this.on(m, 'back', back);
  }

  /** Hubungkan input range/select ke objek settings sementara. */
  /**
   * Pratinjau crosshair langsung di tab Pengaturan: memakai kelas Crosshair yang sama dengan HUD (skala piksel asli), separuh latar
   * gelap & separuh terang (uji outline), simulasi spread senjata (Diam / Jalan / Lompat = spread hipfire GDD §7) + tembakan beruntun.
   * Mengembalikan fungsi refresh (dipanggil setiap nilai berubah).
   */
  private crosshairPreview(m: HTMLElement, s: Settings, back: () => void): () => void {
    const box = m.querySelector('.xh-prev') as HTMLElement, xc = new Crosshair();
    box.appendChild(xc.el);
    const S = CFG.combat.spread, simDeg = { idle: S.hip, move: S.hip + S.hipMoveAdd, air: S.hip + S.hipAirAdd };
    let sim: keyof typeof simDeg = 'idle';
    const simBtns = m.querySelectorAll<HTMLButtonElement>('[data-sim]');
    const markSim = () => simBtns.forEach(b => b.classList.toggle('sel', b.dataset.sim === sim));
    simBtns.forEach(b => b.addEventListener('click', () => {
      const k = b.dataset.sim!;
      if (k === 'fire') { for (let i = 0; i < 6; i++) setTimeout(() => xc.kick(), i * 90); return; }
      sim = k as keyof typeof simDeg; markSim();
    }));
    markSim();
    const color = m.querySelector('[data-color]') as HTMLInputElement, swatches = m.querySelectorAll<HTMLButtonElement>('[data-c]');
    const refresh = () => {
      xc.apply(s);
      const shape = s.xhShape, lines = shape !== 'dot' && shape !== 'circle';
      const show: Record<string, boolean> = { lines, gap: lines, dot: shape === 'crossdot' || shape === 'dot' || shape === 'circle',
        circle: shape === 'circle', ol: s.xhOutline, dyn: s.xhMode !== 'static' };
      m.querySelectorAll<HTMLElement>('[data-for]').forEach(el => (el.style.display = show[el.dataset.for!] ? '' : 'none'));
      swatches.forEach(b => b.classList.toggle('sel', b.dataset.c === s.xhColor));
      if (color.value !== s.xhColor) color.value = s.xhColor;
    };
    color.addEventListener('input', () => { s.xhColor = color.value.toLowerCase(); refresh(); });
    swatches.forEach(b => b.addEventListener('click', () => { s.xhColor = b.dataset.c!; refresh(); }));
    const preset = m.querySelector('[data-preset]') as HTMLSelectElement;
    preset.addEventListener('change', () => {
      const p = XH_PRESETS.find(x => x.id === preset.value);
      if (p) this.showSettings(back, validate({ ...s, ...p.v }));   // tampilkan ulang dengan nilai preset (tab tetap Crosshair)
    });
    // animasi pratinjau selama menu terbuka (skala piksel = layar asli, FOV dari setelan)
    let last = performance.now();
    const loop = (t: number) => {
      if (!box.isConnected) return;
      const dt = Math.min(0.1, (t - last) / 1000); last = t;
      const fovV = (s.fov * Math.PI) / 180;
      xc.setSpread((innerHeight / 2) * Math.tan((simDeg[sim] * Math.PI) / 180) / Math.tan(fovV / 2));
      xc.update(dt);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    return refresh;
  }

  private bindInputs(m: HTMLElement, s: Settings, fmtOf: Partial<Record<keyof Settings, (v: number) => string>> = {}, onChange?: () => void) {
    const rec = s as unknown as Record<string, unknown>;
    m.querySelectorAll<HTMLInputElement>('input[type=range][data-k]').forEach(inp => inp.addEventListener('input', () => {
      const k = inp.dataset.k as keyof Settings, v = Number(inp.value);
      rec[k] = v;
      const out = m.querySelector(`[data-v="${k}"]`);
      if (out) out.textContent = (fmtOf[k] ?? ((x: number) => (Number.isInteger(x) && inp.step === '1' ? String(x) : x.toFixed(2))))(v);
      onChange?.();
    }));
    m.querySelectorAll<HTMLSelectElement>('select[data-k]').forEach(se => se.addEventListener('change', () => {
      const k = se.dataset.k as keyof Settings, v = se.value;
      rec[k] = v === 'true' ? true : v === 'false' ? false : /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v;
      onChange?.();
    }));
  }

  /** Kontrol: tabel ubah-tombol (klik → tekan tombol baru; Esc batal; bentrok → ditukar) + tata letak gamepad. */
  showControls(back: () => void) {
    const s = this.api.settings();
    const rows = ACTIONS.map(a => `<tr><td>${a.label}</td><td><button class="bind" data-bind="${a.id}">${keyLabel(s.binds[a.id])}</button></td></tr>`).join('');
    const m = this.mount('controls', `<div class="card controls"><h2>Kontrol</h2><div class="cols">
      <div><h3>Keyboard & mouse</h3><table class="keys">${rows}${FIXED_KEYS.map(([k, a]) => `<tr><td>${a}</td><td class="fixed">${k}</td></tr>`).join('')}</table></div>
      <div><h3>Gamepad</h3><table class="keys">${PAD_HELP.map(([k, a]) => `<tr><td class="fixed">${k}</td><td>${a}</td></tr>`).join('')}</table></div></div>
      <div class="note">Klik sebuah tombol lalu tekan tombol keyboard / mouse tengah / samping yang baru (Esc = batal). Tombol yang sudah dipakai aksi lain akan ditukar.</div>
      <div class="row"><button data-a="resetbinds">Reset tombol</button><button data-a="back">Kembali</button></div></div>`);
    m.querySelectorAll<HTMLButtonElement>('[data-bind]').forEach(b => b.addEventListener('click', (ev) => {
      ev.stopPropagation();
      this.capture(b, b.dataset.bind as Action, () => this.showControls(back));
    }));
    this.on(m, 'resetbinds', () => { this.api.applySettings({ ...this.api.settings(), binds: { ...DEFAULT_BINDS } }); this.showControls(back); });
    this.on(m, 'back', back);
  }

  private capture(btn: HTMLButtonElement, action: Action, done: () => void) {
    this.cancelCapture();
    btn.textContent = 'Tekan tombol…'; btn.classList.add('wait');
    const finish = (code: string | null) => {
      this.cancelCapture();
      if (code && isBindable(code)) {
        const s = this.api.settings();
        this.api.applySettings({ ...s, binds: rebind(s.binds, action, code) });
      }
      done();
    };
    const onKey = (e: KeyboardEvent) => { e.preventDefault(); e.stopImmediatePropagation(); finish(e.code === 'Escape' ? null : e.code); };
    const onMouse = (e: MouseEvent) => {
      if (e.button === 1 || e.button === 3 || e.button === 4) { e.preventDefault(); e.stopImmediatePropagation(); finish('Mouse' + e.button); }
      else if (e.button === 0 && e.target !== btn) { e.stopImmediatePropagation(); finish(null); }
    };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('mousedown', onMouse, true);
    this.stopCapture = () => { window.removeEventListener('keydown', onKey, true); window.removeEventListener('mousedown', onMouse, true); };
  }

  /** Pratinjau karakter 3D Loadout (dibuat saat pertama dibuka; berhenti merender saat Loadout ditutup). */
  private preview: CharPreview | null = null;

  private cancelCapture() { this.stopCapture?.(); this.stopCapture = null; }

  showPause(cooldownMs: number) {
    const role = ctx.net.role;
    const quit = role === 'host' ? 'Akhiri Match (semua kembali ke room)' : role === 'client' ? 'Keluar Room' : 'Keluar ke Menu';
    const note = role !== 'offline' ? `Main online: game tetap berjalan saat pause — setelah ${XCFG.net.afkAfter} detik karaktermu dimainkan bot sampai kamu kembali.`
      : this.api.settings().fullPause ? 'Jeda penuh aktif.' : 'Game tetap berjalan karena ada bot (opsi "jeda penuh" di Pengaturan → HUD & Gameplay).';
    // host harus pergi → serahkan host ke teman (match jalan terus); host yang tertinggal (teman sudah pindah host) → gabung ke mereka
    const targets = role === 'host' ? this.api.handoverTargets() : [], merge = role === 'host' ? this.api.mergeBackCode() : null;
    const ping = (v: number | null) => (v === null || v < 0 ? '' : ` · ${Math.round(v)} ms`);
    const hand = targets.length ? `<div class="handover"><div class="note">Harus pergi? Serahkan host ke teman — match tetap jalan untuk semua.</div>
      <div class="btns">${targets.map(t => `<button data-h="${esc(t.pid)}">Serahkan host ke ${esc(t.name)}${ping(t.ping)} &amp; keluar</button>`).join('')}</div></div>` : '';
    const mergeBtn = merge ? `<div class="handover"><div class="note">${merge.old
      ? 'Tidak ada teman yang menyambung ke kamu — mungkin host lama masih jalan & teman-teman tetap di sana.'
      : 'Semua teman terputus — kalau internetmu sempat putus, mereka sudah melanjutkan match dengan host baru.'}</div>
      <div class="btns"><button class="primary" data-a="merge">Gabung ke host ${merge.old ? 'lama' : 'baru'} (${formatRoomCode(merge.code)})</button></div></div>` : '';
    const m = this.mount('pause', `<div class="card"><h2>Pause</h2><div class="btns">
      <button class="primary" data-a="resume">Lanjut</button><button data-a="loadout">Loadout</button><button data-a="settings">Pengaturan</button>
      <button data-a="controls">Kontrol</button>${role === 'client' ? '' : '<button data-a="restart">Ulangi match</button>'}<button data-a="quit">${quit}</button></div>
      ${mergeBtn}${hand}${role !== 'offline' ? this.chatBlock() : ''}<div class="note">${note}</div></div>`);
    this.attachChat(m, () => this.showPause(0));
    // serah-terima = keluar dari match → minta klik kedua sebagai konfirmasi
    m.querySelectorAll<HTMLButtonElement>('[data-h]').forEach(b => b.addEventListener('click', () => {
      if (b.dataset.sure) { this.api.handover(b.dataset.h!); return; }
      b.dataset.sure = '1'; b.classList.add('primary'); b.textContent = 'Yakin? Klik lagi untuk menyerahkan host';
    }));
    this.on(m, 'merge', () => this.api.mergeBack());
    const btn = m.querySelector<HTMLButtonElement>('[data-a="resume"]')!;
    if (cooldownMs > 0) { btn.disabled = true; setTimeout(() => (btn.disabled = false), cooldownMs); }
    this.on(m, 'resume', () => this.api.resume());
    m.addEventListener('click', (e) => { if (e.target === m && !btn.disabled) this.api.resume(); }); // klik area gelap = lanjut
    this.on(m, 'loadout', () => this.showLoadout(() => this.showPause(0), true));
    this.on(m, 'settings', () => this.showSettings(() => this.showPause(0)));
    this.on(m, 'controls', () => this.showControls(() => this.showPause(0)));
    this.on(m, 'restart', () => this.api.replay());
    this.on(m, 'quit', () => this.api.quitToMenu());
  }

  /** online: 'host' → Main Lagi memulai match baru untuk semua; 'client' → menunggu host (tanpa Main Lagi). */
  showResults(winner: 'blue' | 'red' | 'draw', playerTeam: 'blue' | 'red', fromRoom = false, online: 'host' | 'client' | null = null) {
    const title = winner === 'draw' ? 'SERI' : winner === playerTeam ? 'MENANG' : 'KALAH';
    const color = winner === 'draw' ? '#f5cd30' : winner === playerTeam ? '#7dff9a' : '#ff6b5e';
    const all = ctx.entities.filter(e => !e.dummyAt);
    const mvp = all.reduce<typeof all[number] | null>((b, e) => (!b || e.stats.score > b.stats.score ? e : b), null);
    const rows = (team: 'blue' | 'red') => all.filter(e => e.team === team).sort((a, b) => b.stats.score - a.stats.score).map(e => {
      const kd = e.stats.deaths ? (e.stats.kills / e.stats.deaths).toFixed(2) : e.stats.kills.toFixed(2);
      const acc = e.stats.shots ? Math.round(100 * e.stats.hits / e.stats.shots) : 0;
      const hs = e.stats.hits ? Math.round(100 * e.stats.hsHits / e.stats.hits) : 0;
      return `<tr class="${e.isPlayer ? 'me' : ''}"><td>${e === mvp ? '★ ' : ''}${esc(e.name)}</td><td>${e.stats.kills}</td><td>${e.stats.deaths}</td><td>${e.stats.assists}</td>` +
        `<td>${kd}</td><td>${e.stats.score}</td><td>${acc}%</td><td>${hs}%</td><td>${e.stats.damage}</td><td>${e.stats.bestStreak}</td></tr>`;
    }).join('');
    const head = '<tr><th>Nama</th><th>K</th><th>D</th><th>A</th><th>K/D</th><th>Skor</th><th>Akurasi</th><th>% HS</th><th>Damage</th><th>Streak</th></tr>';
    const unit = ctx.match.mode === 'elim' ? ' (ronde)' : '';
    const m = this.mount('results', `<div class="card"><h1 style="color:${color}">${title}</h1>
      <div class="res-map">${esc(MAPS[this.api.mapId()].name)} · ${MODE_NAME[ctx.match.mode] ?? ''}</div>
      <div class="sub">BIRU ${ctx.teams.scores.blue} — ${ctx.teams.scores.red} MERAH${unit}</div>
      ${mvp ? `<div class="mvp">★ MVP: <b>${esc(mvp.name)}</b> — ${mvp.stats.score} poin</div>` : ''}
      <div class="scoreboard on" style="position:static;transform:none;min-width:0;background:none;border:none;padding:0">
      <h3 class="b">BIRU</h3><table>${head}${rows('blue')}</table><h3 class="r">MERAH</h3><table>${head}${rows('red')}</table></div>
      ${online ? '<div class="room-chat" data-chat></div>' : ''}
      <div class="row">${online === 'client' ? '' : '<button class="primary" data-a="again">Main Lagi</button>'}<button data-a="menu">${fromRoom ? 'Kembali ke Room' : 'Menu'}</button>
        ${online === 'client' ? '<span class="room-status">Host bisa langsung memulai match berikutnya</span>' : ''}</div></div>`);
    this.attachChat(m, () => {});
    this.on(m, 'again', () => this.api.replay());
    this.on(m, 'menu', () => this.api.quitToMenu());
  }

  showClickToResume() {
    this.mount('resume', `<div class="click-resume">Klik di mana saja untuk lanjut main<small>mouse akan dikunci ke game</small></div>`);
    this.root.querySelector('.menu')!.addEventListener('click', () => this.api.resume());
  }

  /** Navigasi gamepad: D-pad/stik pilih, kiri/kanan ubah nilai, A = klik, B = kembali. */
  padNav(p: PadState) {
    const m = this.root.querySelector('.menu');
    if (!m || this.stopCapture) return;
    const items = [...m.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(x => x.offsetParent !== null);
    if (!items.length) return;
    const cur = document.activeElement as HTMLElement | null;
    let i = cur ? items.indexOf(cur) : -1;
    const go = (d: number) => { i = i < 0 ? 0 : (i + d + items.length) % items.length; items[i].focus(); items[i].scrollIntoView({ block: 'nearest' }); };
    if (p.pressed(PAD.DOWN)) go(1);
    if (p.pressed(PAD.UP)) go(-1);
    const lr = p.pressed(PAD.RIGHT) ? 1 : p.pressed(PAD.LEFT) ? -1 : 0;
    if (lr && i >= 0) {
      const x = items[i];
      if (x instanceof HTMLInputElement) { if (lr > 0) x.stepUp(); else x.stepDown(); x.dispatchEvent(new Event('input')); }
      else if (x instanceof HTMLSelectElement) {
        x.selectedIndex = Math.max(0, Math.min(x.options.length - 1, x.selectedIndex + lr)); x.dispatchEvent(new Event('change'));
      } else go(lr);
    }
    if (p.pressed(PAD.A) && i >= 0) items[i].click();
    if (p.pressed(PAD.B)) (m.querySelector('[data-a="back"],[data-a="resume"]') as HTMLElement | null)?.click();
  }

  private on(m: HTMLElement, action: string, fn: () => void) {
    m.querySelector(`[data-a="${action}"]`)?.addEventListener('click', fn);
  }

  /** Baris voice: tombol bicara, status mic (+ tombol aktifkan mic). */
  private voiceBar(): string {
    const v = this.api.voiceInfo();
    if (!v.on) return '<div class="voice-bar off">🎙 Voice chat mati (Pengaturan → Audio)</div>';
    const st = v.mic === 'ready' ? '<b class="ok">mic siap</b>' : v.mic === 'asking' ? 'meminta izin mikrofon…'
      : v.mic === 'error' ? `<span class="bad">${esc(v.err)}</span>` : 'mic belum aktif';
    const btn = v.mic === 'ready' || v.mic === 'asking' ? '' : '<button data-a="mic">🎙 Aktifkan mic</button>';
    return `<div class="voice-bar">🎙 Tahan <b>${esc(v.keys[0])}</b> = bicara ke tim · <b>${esc(v.keys[1])}</b> = ke semua — ${st}${btn}</div>`;
  }

  /** Ikon "sedang bicara" di baris pemain room (diperbarui di tempat ±10×/detik, tanpa menggambar ulang). */
  updateTalking(on: ReadonlySet<string>) {
    if (this.current !== 'room') return;
    this.root.querySelectorAll<HTMLElement>('[data-talk]').forEach(el => el.classList.toggle('on', on.has(el.dataset.talk!)));
  }

  /** Tombol bisukan chat pemain (🔈 aktif / 🔇 dibisukan); label opsional (nama di menu pause). */
  private muteBtn(pid: string, label: string) {
    const on = this.api.isMuted(pid);
    return `<button class="mute${on ? ' on' : ''}" data-mute="${esc(pid)}" title="${on ? 'Aktifkan lagi chat & suara pemain ini' : 'Bisukan chat & suara pemain ini'}">`
      + `${on ? '🔇' : '🔈'}${label ? ' ' + esc(label) : ''}</button>`;
  }

  /** Menu pause online: panel chat + daftar bisukan teman. */
  private chatBlock() {
    const people = this.api.chatPeople();
    return `<div class="room-chat" data-chat></div>${this.voiceBar()}${people.length ? `<div class="mutes"><span>Bisukan:</span>${people.map(p => this.muteBtn(p.pid, p.name)).join('')}</div>` : ''}`;
  }

  /** Pasang panel chat di placeholder (bila ada) + tombol bisukan; redraw = gambar ulang menu setelah bisukan diubah. */
  private attachChat(m: HTMLElement, redraw: () => void) {
    const slot = m.querySelector('[data-chat]');
    if (slot) this.api.chatAttach(slot);
    this.on(m, 'mic', () => { void this.api.voiceMic().then(() => redraw()); redraw(); });
    m.querySelectorAll<HTMLElement>('[data-mute]').forEach(b => b.addEventListener('click', () => { this.api.toggleMute(b.dataset.mute!); redraw(); }));
  }

  /** Salin laporan kotak hitam ke clipboard; gagal (izin/HTTP) → tampilkan teksnya untuk dipilih manual. */
  private copyReport(m: HTMLElement, btn: Element | null) {
    const text = blackbox.report();
    const done = (ok: boolean) => {
      if (btn) btn.textContent = ok ? '✔ Laporan disalin — tempel ke chat' : 'Salin manual dari kotak di bawah';
      if (ok || m.querySelector('.bb-text')) return;
      const ta = document.createElement('textarea');
      ta.className = 'bb-text'; ta.readOnly = true; ta.value = text;
      m.querySelector('.card')?.appendChild(ta);
      ta.focus(); ta.select();
    };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(() => done(true), () => done(false)); else done(false);
  }
}
