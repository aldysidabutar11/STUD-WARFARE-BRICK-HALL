// src/game/Game.ts — orkestrasi: urutan update (GDD §2.6), input pemain (§14), state aplikasi (§12), debug (§16)
// + pasca-MVP: mode Eliminasi & Latihan, killcam + menonton rekan, melee, gamepad, radar, nama, medali, opsi tampilan
// + Main Bareng online: room di-host browser pemain (WebRTC); host = simulasi otoritatif, klien = prediksi + interpolasi.
// + multi-map (Brick Hall, Steel Yard): loadMap() bongkar map lama → bangun map baru tanpa reload; data map lewat MapDef.
import * as THREE from 'three';
import { CFG } from '../config/gameConfig';
import { XCFG } from '../config/extraConfig';
import { SCOPE_ORDER, WEAPONS, WEAPON_ORDER, scopeAllowed, type ScopeId, type WeaponId } from '../config/weaponsData';
import { physics } from '../physics/Physics';
import { Engine } from '../core/Engine';
import { blackbox } from '../core/BlackBox';
import { GameLoop } from '../core/GameLoop';
import { Input } from '../core/Input';
import { PAD, keyLabel } from '../core/Bindings';
import { bus, type GameEvents } from '../core/EventBus';
import { isHigh } from '../config/presets';
import { MAPS, currentMap, isMapId, setCurrentMap, type MapDef, type MapId } from '../world/maps/registry';
import type { LightSample } from '../world/LightBake';
import { Props } from '../world/Props';
import { NavGraph } from '../world/NavGraph';
import { CameraRig } from '../entities/CameraRig';
import { Viewmodel } from '../entities/Viewmodel';
import { Entity } from '../entities/Entity';
import { TacticalBot } from '../entities/TacticalBot';
import type { AnimState } from '../entities/BlockyCharacter';
import { mapTempo, moveFeel } from '../entities/moveFeel';
import { botVariant, characterArt, type Variant } from '../entities/CharacterArt';
import type { Team } from '../entities/BlockyCharacter';
import { ScopeSystem } from '../combat/ScopeSystem';
import { fireOne, spreadDeg } from '../combat/Ballistics';
import { GrenadeManager, type GrenadeInput } from '../combat/GrenadeK400';
import { buttProgress, knifeProgress, startMelee, updateMelee } from '../combat/Melee';
import { WeaponDrops } from '../combat/WeaponDrops';
import { heldOf } from '../combat/Slots';
import type { TriggerInput } from '../combat/WeaponSystem';
import { Vfx } from '../vfx/Vfx';
import { DeathFx } from '../vfx/DeathFx';
import { SpatialSynthAudio } from '../audio/SpatialSynthAudio';
import * as R from '../audio/Recipes';
import { Hud } from '../ui/Hud';
import { Menus, type RoomAction } from '../ui/Menus';
import { Minimap } from '../ui/Minimap';
import { Nameplates } from '../ui/Nameplates';
import { Announcer } from '../ui/Announcer';
import { loadSettings, saveSettings, validate, type Settings } from '../ui/Settings';
import { Lobby, cleanName, formatRoomCode, makeRoomCode, pickMap, type MapChoice, type MatchRoster } from './Lobby';
import { BotChatGate, QUICK, RateLimit, botCalloutText, chatAllowed, chatReaches, cleanChatText, parseChat, type ChatScope } from './Chat';
import { ChatUI } from '../ui/Chat';
import { VoiceSystem } from './Voice';
import { voiceRange, voiceScopeOk, type VoiceScope } from './VoiceRules';
import { StatsOverlay } from '../debug/StatsOverlay';
import { DebugPanel } from '../debug/DebugPanel';
import { PerfLogger } from '../debug/PerfLogger';
import { TeamManager } from './TeamManager';
import { MatchManager, type GameMode, type MatchOptions } from './MatchManager';
import { SpawnSystem } from './SpawnSystem';
import { BotDirector } from './BotDirector';
import { Killcam } from './Killcam';
import { driveWeapons, emptyFrame } from './PlayerActions';
import { ctx } from './ctx';
import { NetClient, NetHost, cleanLoadout, type JoinFail } from '../net/Session';
import { createSignaling, iceServers } from '../net/Signaling';
import { ClientRep, HostRep, RemoteHuman } from '../net/NetMatch';
import { parseStart, type NetEnt, type NetStart } from '../net/start';
import { makePlan, migrationTimes, parseSave, type MatchSave, type Plan } from '../net/Migration';
import { applySaveEntities, captureSave } from '../net/Resume';
import { loadTicket, saveTicket, type Ticket } from '../net/Ticket';
import { HoldQueue } from '../net/HoldQueue';
import { H, I, type Command } from '../net/protocol';

const D2R = THREE.MathUtils.degToRad, R2D = THREE.MathUtils.radToDeg;
const _v = new THREE.Vector3(), _w = new THREE.Vector3();
const DOWN = new THREE.Vector3(0, -1, 0);
const wrapA = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** Jalankan fn setelah browser sempat menggambar frame berikutnya (overlay "Memuat map…" terlihat sebelum kerja berat). */
const afterPaint = (fn: () => void) => requestAnimationFrame(() => setTimeout(fn, 0));

interface Stress { t: number; shooters: Entity[]; target: Entity; nextNade: number }

export class Game {
  settings!: Settings;
  engine!: Engine;
  loop!: GameLoop;
  input!: Input;
  menus!: Menus;
  stats!: StatsOverlay;
  debugPanel!: DebugPanel;
  killcam!: Killcam;
  minimap!: Minimap;
  nameplates!: Nameplates;
  announcer!: Announcer;
  perf = new PerfLogger();
  inMatch = false;
  paused = false;
  autoTest = false;
  /** Muat ulang yang disengaja game (ganti preset / grafis tidak pulih): lewati pengaman "Yakin keluar?". */
  private allowUnload = false;
  /** Kotak hitam: waktu konteks grafis hilang, timer tombol muat ulang, nomor match di halaman ini, cuplikan performa. */
  private gfxLostAt = 0;
  private gfxTimer = 0;
  private matchNo = 0;
  private bbPerfT = 0; private bbFrames = 0;
  // ── pindah host & AFK (permintaan pengguna 2026-11-25: host ditelepon / keluar mendadak → game tetap jalan untuk semua)
  /** Online: susunan match yang sedang berjalan (host & klien) — bahan pindah host & bergabung ulang. */
  private netStart: NetStart | null = null;
  /** Klien: cadangan pertandingan terbaru dari host, rencana pengganti host, serah-terima sedang berlangsung. */
  private lastSave: MatchSave | null = null;
  private plan: Plan | null = null;
  private handoverPending = false;
  /** Host: kode room untuk host berikutnya (disiarkan di rencana) + jam siar rencana + pernah punya teman di match ini. */
  private nextCode = '';
  private planT = 0;
  private hadFriends = false;
  /** Pindah host berjalan (token membatalkan proses lama) + petunjuk gabung ulang (kode room baru & pid lama). */
  private migrating = 0;
  private rejoinHint: { code: string; pid: string } | null = null;
  /** Kita naik jadi host karena host lama hilang: kode room host lama (bila tak ada teman yang menyusul, mungkin host lama masih
   *  jalan → tombol gabung kembali) + waktu naik (ms) + sudah diberi tahu. */
  private promotedFrom = '';
  private promotedAt = 0;
  private lonelyToast = false;
  /** Tiket kembali ke match setelah halaman ini hilang (sessionStorage; dari sesi halaman sebelumnya saat boot) + kunci tulis. */
  private ticket: Ticket | null = loadTicket();
  private ticketKey = ''; private ticketT = 0;
  /** Klien: overlay "koneksi ke host tersendat" sedang tampil. */
  private stallShown = false;
  // ── chat teks tim & semua (permintaan pengguna 2026-11-25; room + match + layar hasil). Logika: game/Chat.ts, tampilan: ui/Chat.ts.
  private chat!: ChatUI;
  /** Pemain yang dibisukan (pid; chat — dan voice nanti), batas laju (host: per pid teman, '' = kita), gerbang callout bot. */
  private muted = new Set<string>();
  private chatRate = new Map<string, RateLimit>();
  private botChat = new BotChatGate();
  /** Kotak chat dibatalkan dengan Esc (Chrome sekaligus melepas kunci mouse) → layar "klik untuk lanjut", bukan menu pause. */
  private chatEscAt = -1e9;
  // ── voice chat push-to-talk (T tim / Z semua) — game/Voice.ts; indikator bicara di HUD & room
  private voice!: VoiceSystem;
  private talkEl!: HTMLDivElement;
  private talkKey = '';
  private voiceUiT = 0;
  private micSeen = '';
  /** AFK lokal di match online: sejak kapan tidak aktif (ms, −1 = aktif) & karakter sedang dimainkan bot.
   *  awayTest = uji otomatis: true paksa AFK, false paksa aktif (jendela uji tanpa fokus), null = deteksi biasa. */
  private awaySince = -1;
  private afkOn = false;
  awayTest: boolean | null = null;
  /** Layar tidak mati / laptop tidak tidur selama match atau room online (Screen Wake Lock). */
  private wakeLock: WakeLockSentinel | null = null;
  private wakeBusy = false;
  mode: GameMode = 'tdm';
  /** Room main bareng (tahap 1: lokal) + id pemain ini; roster = susunan match yang sedang/terakhir dimainkan dari room. */
  private room: Lobby | null = null;
  private roomMe = '';
  private roster: MatchRoster | null = null;
  private jumpLatch = false;
  private crouchToggled = false;
  private padSprint = false;
  /** Tombol senjata pemain lokal per frame (aturan sama dengan pemain remote di host — PlayerActions). */
  private readonly frame = emptyFrame();
  // ── online: host (room di browser ini) / klien (gabung ke room teman); replikasi saat match
  private host: NetHost | null = null;
  private client: NetClient | null = null;
  private hostRep: HostRep | null = null;
  private clientRep: ClientRep | null = null;
  private netState: 'connecting' | 'online' | 'error' = 'connecting';
  /** Klien: perintah tick ini (dibuat sebelum KCC, disimpan + dikirim setelah world.step). */
  private cmd: Command | null = null;
  /** Klien: pesan host yang ditahan selama map match dimuat (tidak menahan = langsung diproses). */
  private readonly netHold = new HoldQueue();
  /** Host: token Mulai room (memuat map sebelum match online; permintaan baru membatalkan yang lama). */
  private roomStartTok = 0;
  private readonly trig: TriggerInput = { pressed: false, held: false, reload: false, modeSwitch: false, ads: false, sprinting: false };
  /** Jadwal hentakan kamera serangan pisau (waktu game; 0 = tidak ada). */
  private punchAt = 0; private punchKind: 'slash' | 'stab' = 'slash'; private punchAlt = false;
  private readonly gIn: GrenadeInput = { equip: null, toSlot: null, lPress: false, lHeld: false, lRelease: false, rPress: false, rHeld: false, rRelease: false };
  /** Gamepad: waktu RB terakhir (RB dua kali cepat = flashbang). */
  private rbAt = -1e9;
  private menuT = 0;
  private slowmoEnd = 0;
  private stress: Stress | null = null;
  private dummies: Entity[] = [];
  private movers = new Map<Entity, number>();
  private specTarget: Entity | null = null;
  private specSavedMode: 'fps' | 'tps' | null = null;
  private heartT = 0;
  private lastCount = -1;
  private baseLight = { sun: 1, hemi: 1 };
  // grafik realistis: peta lingkungan (pantulan), kabut, lampu kilat moncong (HIGH+), sampel probe cahaya karakter
  private envTex: THREE.Texture | null = null;
  private envRT: THREE.WebGLRenderTarget | null = null;
  private fog = new THREE.FogExp2(XCFG.gfx.fog.color, XCFG.gfx.fog.density);
  /** ?map=brickhall|steelyard menimpa settings.map untuk sesi ini (uji) — dihapus saat pemain memilih map (selectMap). */
  private urlMap: MapId | null = null;
  /** Token muat-map tertunda (play/prepareMap): permintaan baru membatalkan yang lama. */
  private loadToken = 0;
  /** Map yang BENAR-BENAR terbangun (build + Props + world.step + nav + radar sukses). null = belum ada / muat terakhir gagal
   *  di tengah jalan (map lama sudah dibongkar, currentMap() sudah menunjuk map baru) → permintaan berikutnya membangun ulang. */
  private loadedId: MapId | null = null;
  private probe: LightSample = { sky: 1, bounce: 0 };
  private noclipPos = new THREE.Vector3();
  private anim: AnimState = { speed: 0, sprinting: false, crouchT: 0, airborne: false, pitch: 0, reload: -1, throwPose: NaN, lowReady: false, melee: -1 };

  async boot() {
    const canvas = document.getElementById('game') as HTMLCanvasElement;
    this.settings = loadSettings();
    await physics.init();
    const engine = this.engine = new Engine(canvas, this.settings.preset);
    const high = isHigh(this.settings.preset);
    ctx.engine = engine;
    engine.onContextLost = () => this.onGfxLost();
    engine.onContextRestored = () => this.onGfxRestored();
    {
      // kotak hitam: identitas sesi (versi bundle, preset, GPU, browser) untuk laporan teknis
      const gl = engine.renderer.getContext(), dbg = gl.getExtension('WEBGL_debug_renderer_info');
      const gpu = String(dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
      const build = [...document.querySelectorAll<HTMLScriptElement>('script[type="module"][src]')]
        .map(sc => sc.src.split('/').pop() ?? '').find(n => n.startsWith('index-')) ?? 'dev';   // produksi: index-HASH.js
      blackbox.info(`versi ${build} · preset ${this.settings.preset} · GPU ${gpu} · ${navigator.userAgent}`);
    }
    ctx.settings = this.settings;
    ctx.debug = { god: false, noclip: false, showNav: false, botLabels: false, dmgNumbers: false, colliders: false, slowmo: false };
    // map awal: setelan (default Brick Hall); ?map=… menimpa untuk uji
    const qMap = new URLSearchParams(location.search).get('map');
    this.urlMap = isMapId(qMap) ? qMap : null;
    const startMap = this.defaultMapId();
    const sub = document.querySelector('#loading .ld-sub');
    if (sub) sub.textContent = MAPS[startMap].name.toUpperCase();
    this.loadMap(startMap, true);
    ctx.camRig = new CameraRig();
    ctx.viewmodel = new Viewmodel(engine.vmScene, 'blue');
    ctx.scope = new ScopeSystem();
    ctx.vfx = new Vfx(engine.scene, engine.preset, high);
    ctx.deathFx = new DeathFx(engine.scene);
    ctx.grenades = new GrenadeManager(engine.scene);
    // flashbang: layar ini silau (putih → pulih) + telinga berdenging; bot yang sempat memalingkan muka kena lebih ringan
    ctx.grenades.onLocalFlash = (x, s) => { ctx.hud.flash(x); if (s >= 0.2) ctx.audio.tinnitus(XCFG.flash.deafMax * s); };
    ctx.grenades.noticed = (bot, id) => bot.bot?.flashNoticed(id) ?? false;
    ctx.drops = new WeaponDrops(engine.scene, engine.preset.shadowMap > 0);
    ctx.teams = new TeamManager();
    ctx.match = new MatchManager();
    ctx.spawns = new SpawnSystem();
    ctx.directors = { blue: new BotDirector('blue'), red: new BotDirector('red') };
    for (const d of Object.values(ctx.directors)) d.onCallout = (id, x, y, z) => this.botCallout(id, x, y, z);
    ctx.audio = new SpatialSynthAudio();
    ctx.audio.setVolumes(this.settings.volMaster / 100, this.settings.volSfx / 100, this.settings.volUi / 100);
    ctx.hud = new Hud();
    ctx.killcam = this.killcam = new Killcam(engine.scene);
    this.minimap = new Minimap(ctx.hud.root);
    this.nameplates = new Nameplates(ctx.hud.root);
    this.chat = new ChatUI(ctx.hud.root);
    this.chat.onSend = (scope, text) => this.sendChat(scope, text);
    this.chat.onClose = (esc) => { this.input.clearAll(); if (esc) this.chatEscAt = performance.now(); };
    this.voice = new VoiceSystem({
      isHost: () => !!this.host && !this.client,
      me: () => this.roomMe,
      sendUp: (b) => this.client?.sendVoice(b),
      sendDown: (pid, b) => this.host?.sendUnr(pid, b),
      listeners: () => (this.host && !this.client ? this.host.pids() : []),
      teamOf: (pid) => this.teamOfPid(pid),
      aliveOf: (pid) => { const e = this.entityOfPid(pid); return !this.liveMatch() || !e || e.alive; },
      live: () => this.liveMatch(),
      allTalk: () => this.room?.settings.allTalk ?? true,
      muted: (pid) => !this.settings.voice || this.muted.has(pid),
      headOf: (pid, out) => {
        if (!this.liveMatch()) return null;
        const e = this.entityOfPid(pid);
        return e && e.alive ? out.set(e.renderPos.x, e.renderPos.y + e.ctrl.eyeHeight, e.renderPos.z) : null;
      },
      audio: () => ctx.audio.voiceOut(),
      camera: () => this.engine.camera,
      blocked: (ax, ay, az, bx, by, bz) => physics.losBlocked(ax, ay, az, bx, by, bz),
      range: () => voiceRange(currentMap().bounds),
    });
    this.talkEl = document.createElement('div'); this.talkEl.className = 'vtalk';
    ctx.hud.root.appendChild(this.talkEl);
    ctx.audio.setVoiceVolume(this.settings.voice ? this.settings.volVoice / 100 : 0);
    this.announcer = new Announcer(ctx.hud.root);
    ctx.entities = []; ctx.byId = new Map(); ctx.player = null;
    this.input = ctx.input = new Input(canvas);
    this.stats = new StatsOverlay({
      renderer: engine.renderer,
      awakeBodies: () => ctx.props.awakeCount + ctx.deathFx.activeBodies + ctx.grenades.count,
      totalBodies: () => physics.world.bodies.len(),
      voices: () => ctx.audio.voiceCount,
      dynScale: () => engine.dynRes.scale,
      pacing: engine.pacing, gpu: engine.gpu, cpuMs: () => this.cpuMs,
      playerInfo: () => {
        const p = ctx.player;
        if (!p) return '';
        const c = p.ctrl;
        const cr = this.clientRep, net = cr
          ? `\nnet klien: ping ${this.client?.pings[this.roomMe] ?? '…'} ms  interp ${cr.delayMs.toFixed(0)} ms  snapshot ${cr.snapHz.toFixed(0)} Hz  koreksi ${cr.diag.corrections}`
          : this.hostRep ? `\nnet host: ${this.host?.connected ?? 0} teman  ping ${Object.values(this.host?.pings() ?? {}).join('/') || '…'} ms` : '';
        return `pos ${c.pos.x.toFixed(1)} ${c.pos.y.toFixed(2)} ${c.pos.z.toFixed(1)}  v ${c.speedH.toFixed(2)} u/s  vy ${c.velY.toFixed(2)}\n` +
          `grounded ${c.grounded}  crouch ${c.crouched}  sprint ${c.sprinting}  hp ${p.hp}  view ${ctx.camRig.mode}` + net;
      },
    });
    if (this.settings.showFps) this.stats.toggle(true);
    this.debugPanel = new DebugPanel(engine.scene, {
      spawnDummies: () => this.spawnDummies(), resetProps: () => ctx.props.reset(), startStress: () => this.startStress(),
      setSlowmo: (on) => { if (ctx.net.role === 'offline') this.loop.timeScale = on ? 0.25 : 1; }, setNoclip: (on) => this.setNoclip(on),
    });
    this.menus = new Menus({
      play: (practice) => this.play(practice ? 'practice' : this.settings.mode), resume: () => this.resume(),
      quitToMenu: () => this.quitToMenu(), replay: () => this.replay(),
      fullscreen: () => void this.input.goFullscreen(), settings: () => this.settings,
      applySettings: (s) => this.applySettings(s), setLoadout: (w, s, v) => this.setLoadout(w, s, v),
      click: () => { ctx.audio.unlock(); ctx.audio.click(); }, inMatch: () => this.inMatch,
      refreshHz: () => 1000 / engine.pacing.refreshMs,
      room: () => (this.room ? { lobby: this.room, me: this.roomMe } : null),
      createRoom: (n) => this.createRoom(n), leaveRoom: () => { this.dropTicket(); this.leaveRoom(); this.resetChat(); },
      startRoom: () => void this.startRoom(), addSimFriend: () => this.addSimFriend(),
      roomAct: (a) => this.roomAct(a), joinRoom: (code, name) => { this.resetChat(); return this.joinRoom(code, name); }, netInfo: () => this.netInfo(),
      chatAttach: (slot) => this.chat.attachPanel(slot), isMuted: (pid) => this.muted.has(pid), toggleMute: (pid) => this.toggleMute(pid),
      chatPeople: () => this.chatPeople(),
      voiceInfo: () => ({ on: this.settings.voice, mic: this.voice.cap.state, err: this.voice.cap.error,
        keys: [keyLabel(this.settings.binds.voiceTeam), keyLabel(this.settings.binds.voiceAll)] as [string, string] }),
      voiceMic: () => this.voice.cap.start(),
      myTeam: () => this.localTeam(),
      setPlayerName: (n) => { this.settings.playerName = cleanName(n); saveSettings(this.settings); },
      selectMap: (c) => void this.selectMap(c), mapId: () => currentMap().id, mapChoice: () => this.urlMap ?? this.settings.map,
      handoverTargets: () => this.handoverTargets(), handover: (pid) => this.handover(pid),
      mergeBackCode: () => this.mergeBackCode(), mergeBack: () => void this.mergeBack(),
      ticket: () => (this.ticket && !this.room ? { code: this.ticket.code, match: this.ticket.match } : null),
      useTicket: () => this.useTicket(), dropTicket: () => this.dropTicket(),
    });
    this.applyVisual();
    this.input.onLockChange = (locked) => {
      if (!locked && this.inMatch && !this.menus.open && ctx.match.state !== 'RESULTS' && !this.input.padActive) {
        // Esc saat mengetik chat: Chrome melepas kunci mouse sekaligus → cukup "klik untuk lanjut" (bukan menu pause)
        if (this.chat.typing || performance.now() - this.chatEscAt < 600) {
          this.chat.close(false); this.paused = true; this.input.clearAll(); this.menus.showClickToResume();
        } else this.pause();
      }
      // kunci mouse datang terlambat saat layar "Klik untuk lanjut" tampil → langsung lanjut
      if (locked && this.paused && this.menus.current === 'resume') { this.menus.hide(); this.unpause(); }
    };
    this.input.onKey = (code) => this.onKey(code);
    this.input.onPadButton = (i) => this.onPadButton(i);
    canvas.addEventListener('click', () => { if (this.inMatch && !this.input.locked && !this.paused && ctx.match.state !== 'RESULTS') void this.input.requestLock(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.inMatch && !this.paused) this.pause(); });
    // pindah ke aplikasi lain (alt-tab, klik jendela lain) → selalu pause, juga saat main pakai controller
    window.addEventListener('blur', () => { if (this.inMatch && !this.paused && ctx.match.state !== 'RESULTS') this.pause(); });
    // pengaman keluar halaman: refresh (F5 / Ctrl+R) / tutup tab / tombol kembali di tengah match atau saat room online → browser
    // bertanya dulu (dialog bawaan, teksnya tidak bisa diubah). Laporan pengguna 2026-11-25: host ter-refresh di tengah Eliminasi →
    // semua teman terlempar. Ctrl+W/T tidak bisa dicegah lewat keydown, tapi dialog ini tetap muncul.
    window.addEventListener('beforeunload', (e) => {
      if (!this.unloadGuarded()) return;
      blackbox.log('keluar-halaman', 'dialog "Yakin keluar?" ditampilkan');
      e.preventDefault(); e.returnValue = '';
    });
    // tiap ±1 s (juga saat tab di belakang): AFK lokal, wake lock, rencana pengganti host
    setInterval(() => this.netTick(), 1000);
    document.addEventListener('visibilitychange', () => { this.updateAfk(); void this.syncWakeLock(); });
    bus.on('match:state', (e) => this.onMatchState(e.state));
    bus.on('kill', (e) => this.onKill(e));
    // pisau pemain: hentakan kamera tepat saat bilah menyapu/menyodok (dijadwalkan sedikit sebelum titik kena), + ekstra saat kena
    bus.on('melee', (e) => {
      const p = ctx.player;
      if (!p || e.entityId !== p.id || e.kind === 'butt') return;
      if (e.phase === 'swing') {
        const hd = e.kind === 'stab' ? XCFG.knife.stab.hitDelay : XCFG.knife.slash.hitDelay;
        this.punchAt = ctx.time + Math.max(0, hd - 0.05); this.punchKind = e.kind; this.punchAlt = p.slashAlt;
      } else if (e.phase === 'hit') {
        const P = XCFG.knife.punch;
        ctx.camRig.punch(0, P.hitPitch, 0); ctx.camRig.addShake(P.hitShake);
      }
    });
    bus.on('spawn', (e) => {
      const ent = ctx.byId.get(e.entityId);
      ent?.char.resetPose(ent.yaw); // tanpa sisa puntiran/transisi dari nyawa sebelumnya
      if (ctx.player && e.entityId === ctx.player.id) this.onPlayerSpawn();
    });
    bus.on('footstep', (e) => {
      if (!e.land || !ctx.player || e.entityId !== ctx.player.id) return;
      ctx.camRig.landKick(ctx.player.ctrl.lastLandH); ctx.viewmodel.land(ctx.player.ctrl.lastLandH);
    });
    ctx.match.onResults = () => this.onResults();
    ctx.match.onRoundStart = (r) => this.onRoundStart(r);
    this.loop = new GameLoop({
      beginFrame: () => {
        this.frameT0 = performance.now();
        this.input.beginFrame(); if (this.input.actPressed('jump')) this.jumpLatch = true;
      },
      fixedUpdate: (dt) => this.fixedUpdate(dt),
      update: (dt, alpha, raw) => this.update(dt, alpha, raw),
      render: () => this.render(),
      endFrame: () => { this.input.endFrame(); this.cpuMs = performance.now() - this.frameT0; engine.pacing.cpu(this.cpuMs); },
    }, engine.pacing);
    this.loop.capDiv = this.settings.fpsCap;
    document.getElementById('loading')!.classList.add('hidden');
    this.menus.showMain();
    this.loop.start();
    // siapkan atlas karakter (±40 ms/varian) saat menu idle → tanpa jeda saat klik Mulai
    const warm: [Team, Variant][] = [['blue', 'm'], ['red', 'm'], ['blue', 'f'], ['red', 'f']];
    const warmNext = () => { const w = warm.shift(); if (!w) return; characterArt(w[0], w[1]); setTimeout(warmNext, 120); };
    setTimeout(warmNext, 400);
    // ?autostart=1|tdm|elim|practice untuk uji otomatis (tanpa pointer lock)
    const auto = new URLSearchParams(location.search).get('autostart');
    if (auto !== null) { this.autoTest = true; this.play(auto === 'elim' ? 'elim' : auto === 'practice' ? 'practice' : 'tdm'); }
    // link room (…?room=KODE): buka Main Bareng dengan kode terisi → isi nama lalu Gabung
    const roomLink = new URLSearchParams(location.search).get('room');
    if (roomLink !== null && auto === null) this.menus.showLobbyHome(() => this.menus.showMain(), roomLink);
  }

  // ───────────────────────────────── entitas
  private disposeEntities() {
    for (const e of ctx.entities) {
      this.engine.scene.remove(e.char.root);
      e.ctrl.dispose();
      e.bot?.dispose();
      ctx.directors[e.team].release(e);
    }
    ctx.entities.length = 0; ctx.byId.clear(); ctx.player = null; this.dummies = []; this.movers.clear();
    for (const d of Object.values(ctx.directors)) d.reset();   // laporan & callout bot match lama
    this.debugPanel.clearLabels();
    this.nameplates.clear();
  }

  private addEntity(e: Entity) {
    ctx.entities.push(e); ctx.byId.set(e.id, e);
    this.engine.scene.add(e.char.root);
    // fall damage §3.5 (keluar map = fatal walau masih terlindungi)
    e.ctrl.onFallDamage = (dmg) => {
      if (!e.alive) return;
      if (dmg >= 999) e.protectT = 0;
      ctx.teams.applyDamage(e, null, dmg, 'lower', 'fall', DOWN, false);
    };
  }

  private randomLoadout(): { weapon: WeaponId; scope: ScopeId } {
    const weapon = WEAPON_ORDER[Math.floor(Math.random() * WEAPON_ORDER.length)];
    const pool = SCOPE_ORDER.filter(s => scopeAllowed(WEAPONS[weapon], s) && s !== 'x6');
    return { weapon, scope: pool[Math.floor(Math.random() * pool.length)] };
  }

  /** roster = susunan dari room (tim pemain, teman, bot per slot); null = main solo (bot sekutu/musuh dari setelan). */
  private createEntities(mode: GameMode, roster: MatchRoster | null, net: NetStart | null = null) {
    this.disposeEntities();
    const s = this.settings, shadows = isHigh(s.preset), names = XCFG.bots.names;
    if (net) {
      // online: id per slot room (sama di host & semua klien). Host: teman = remote (perintah jaringan), bot = AI;
      // klien: semua selain dirinya = boneka (keadaan dari snapshot host).
      let bi = 1;
      for (const d of net.ents) {
        const me = !!d.pid && d.pid === this.roomMe;
        const e = new Entity(d.id, d.name, d.team, me, shadows, d.variant);
        e.applyLoadout({ weapon: d.weapon, scope: d.scope });
        if (me) { e.char.setLayer(1); ctx.player = e; }
        else if (ctx.net.role === 'client') e.puppet = true;
        else if (d.pid && !d.bot) e.remote = new RemoteHuman(d.pid);
        else e.bot = new TacticalBot(e, s.difficulty, bi++);
        this.addEntity(e);
      }
      const p = ctx.player;
      if (p) { ctx.viewmodel.setOutfit(p.team, p.char.variant); ctx.viewmodel.setWeapon(p.loadout.weapon, p.loadout.scope); }
      return;
    }
    const pTeam: Team = mode !== 'practice' && roster ? roster.playerTeam : 'blue';
    const pName = (mode !== 'practice' && roster?.[pTeam].find(r => r.kind === 'you')?.name) || 'Kamu';
    const player = new Entity(1, pName, pTeam, true, shadows, s.charVariant);
    player.char.setLayer(1); // tubuh lokal tidak dirender kamera FPS, tetap kena raycaster
    player.applyLoadout({ weapon: s.weapon, scope: s.scope });
    this.addEntity(player); ctx.player = player;
    if (mode === 'practice') {
      let mover = 0;
      currentMap().practice.forEach(([x, y, z, moving], i) => {
        const e = new Entity(100 + i, moving ? `Target Gerak ${++mover}` : `Dummy ${i + 1}`, 'red', false, shadows, botVariant(i));
        e.applyLoadout({ weapon: 'm416', scope: 'iron' });
        e.dummyAt = new THREE.Vector3(x, y, z);
        this.addEntity(e); this.dummies.push(e);
        if (moving) this.movers.set(e, i % 2 ? 1 : -1);
      });
    } else if (roster) {
      // room: tiap slot sesuai urutan room; teman (sementara tanpa server) & bot pengisi dimainkan bot dengan namanya
      let id = 2, bi = 1;
      for (const team of ['blue', 'red'] as const) roster[team].forEach((r, i) => {
        if (r.kind === 'you') return;
        const e = new Entity(id++, r.name, team, false, shadows, botVariant(i));
        e.applyLoadout(this.randomLoadout()); e.bot = new TacticalBot(e, s.difficulty, bi++); this.addEntity(e);
      });
    } else {
      // campuran pria/wanita per tim (desain karakter: Biru taktis, Merah gerilyawan)
      for (let i = 0; i < s.allies; i++) {
        const e = new Entity(2 + i, names[i], 'blue', false, shadows, botVariant(i + 1));
        e.applyLoadout(this.randomLoadout()); e.bot = new TacticalBot(e, s.difficulty, i + 1); this.addEntity(e);
      }
      for (let i = 0; i < s.enemies; i++) {
        const e = new Entity(6 + i, names[4 + i], 'red', false, shadows, botVariant(i));
        e.applyLoadout(this.randomLoadout()); e.bot = new TacticalBot(e, s.difficulty, i + 5); this.addEntity(e);
      }
    }
    ctx.viewmodel.setOutfit(player.team, player.char.variant);
    ctx.viewmodel.setWeapon(player.loadout.weapon, player.loadout.scope);
  }

  // ───────────────────────────────── map (multi-map)
  /** Id map yang terbangun & siap dimainkan (null = muat terakhir gagal → Mulai berikutnya memuat ulang). */
  get mapId(): MapId | null { return this.loadedId; }

  /** Map untuk main solo / Latihan bila tidak disebut: ?map= (uji) atau setelan; setelan 'Acak' diundi setiap panggilan. */
  defaultMapId(): MapId { return this.urlMap ?? pickMap(this.settings.map, Math.random); }

  /** Pilihan map pemain (menu Atur Match): simpan ke setelan; preload = muat sekarang di menu (dengan layar "Memuat map…")
   *  agar tombol Mulai tidak menunggu ('Acak' tidak dimuat — diundi saat Mulai). Diabaikan saat match berjalan. */
  selectMap(choice: MapChoice, preload = true): Promise<boolean> {
    this.urlMap = null;
    if (this.settings.map !== choice) { this.settings.map = choice; saveSettings(this.settings); }
    return preload && choice !== 'random' ? this.prepareMap(choice) : Promise.resolve(false);
  }

  /** Muat map dengan layar "Memuat map…" yang sempat tergambar (tidak di tengah match). true = map diganti. */
  prepareMap(id: MapId): Promise<boolean> {
    if (this.inMatch) return Promise.resolve(false);
    const token = ++this.loadToken;                    // permintaan baru membatalkan muat tertunda (yang membatalkan mengurus overlay)
    if (id === this.loadedId) { this.hideMapLoading(); return Promise.resolve(false); }
    this.showMapLoading(id);
    return new Promise((res) => afterPaint(() => {
      if (token !== this.loadToken || this.inMatch) { res(false); return; }
      // gagal → false (bukan janji menggantung): pemanggil (Mulai room) melihat mapId ≠ id lalu menampilkan pesan
      try { res(this.loadMap(id)); } catch (err) { console.error('[map] gagal memuat', id, err); res(false); } finally { this.hideMapLoading(); }
    }));
  }

  /**
   * Ganti map SINKRON: bongkar map lama (mesh, collider, lampu, props, debu/berkas, peta lingkungan) → bangun map baru →
   * world.step → graf nav (+ validasi) → peta lingkungan di MapDef.envProbe → radar → kabut/latar dari MapDef.atmosphere →
   * applyVisual (warmup shader). false = map itu sudah aktif. Panggil di luar match (entitas lama sebaiknya sudah dibuang).
   * Melempar error bila gagal di tengah jalan: loadedId tetap null → permintaan berikutnya membongkar sisa (dispose aman
   * dipanggil ulang) & membangun ulang, bukan memakai map setengah jadi.
   */
  loadMap(id: MapId, force = false): boolean {
    if (this.loadedId === id && !force) return false;
    const t0 = performance.now(), engine = this.engine, sc = engine.scene;
    this.loadedId = null;
    if (ctx.map) {
      // efek & benda fisika yang bersandar di geometri lama, lalu map + props
      ctx.grenades?.clear(); ctx.drops?.clear(); ctx.vfx?.clear(); ctx.deathFx?.clear();
      ctx.props.dispose();
      ctx.map.dispose();
      if (ctx.directors) for (const d of Object.values(ctx.directors)) d.reset();
    }
    sc.environment = null; engine.vmScene.environment = null;
    if (this.envRT) { this.envRT.dispose(); this.envRT = null; this.envTex = null; }
    const def = setCurrentMap(id), A = def.atmosphere;
    moveFeel.tempo = mapTempo(id);   // tempo gerak per map (Steel Yard lebih cepat — lihat XCFG.feel.mapTempo)
    sc.background = new THREE.Color(A.background);           // builder luar ruang boleh menggantinya (langit)
    this.fog.color.setHex(A.fogColor); this.fog.density = A.fogDensity;
    ctx.map = def.build(sc, engine.preset, this.settings.preset, engine.maxAnisotropy);
    ctx.props = new Props(sc, ctx.map.shelves, engine.preset.shadowMap > 0, def.props);
    physics.world.step(); // query pipeline Rapier baru valid setelah step pertama
    if (engine.gfx.env) this.captureEnvironment(def);
    ctx.nav = new NavGraph(def.nav);
    const warn = ctx.nav.validate((ax, ay, az, bx, by, bz) => physics.losBlocked(ax, ay, az, bx, by, bz));
    if (warn.length) console.warn('[NavGraph] peringatan:', warn); else console.log(`[NavGraph] ${ctx.nav.nodes.length} node, ${ctx.nav.walkEdgeCount} jalur, ${ctx.nav.dropCount} drop — 0 peringatan`);
    this.baseLight = { sun: ctx.map.sun.intensity, hemi: ctx.map.hemi.intensity };
    this.minimap?.setMap(def);
    this.debugPanel?.buildNav();
    if (this.loop) this.applyVisual();                        // setelah boot: kabut/pantulan/kecerahan + kompilasi shader
    this.loadedId = id;
    console.log(`[map] ${def.name}: ${(performance.now() - t0).toFixed(0)} ms, ${ctx.map.colliders} collider, ${ctx.map.triangles} segitiga, bake ${ctx.map.light.ms.toFixed(0)} ms`);
    return true;
  }

  /** Layar "Memuat map…" (elemen #loading dari boot dipakai ulang). */
  private showMapLoading(id: MapId) {
    const el = document.getElementById('loading');
    if (!el) return;
    const sub = el.querySelector('.ld-sub'), msg = el.querySelector('.ld-msg');
    if (sub) sub.textContent = MAPS[id].name.toUpperCase();
    if (msg) msg.textContent = 'Memuat map…';
    el.classList.remove('hidden');
  }
  private hideMapLoading() { document.getElementById('loading')?.classList.add('hidden'); }

  // ───────────────────────────────── alur aplikasi
  /**
   * net = match online (host: susunan yang baru dikirim ke klien; klien: dari pesan 'start' host).
   * mapId = map match ini (bawaan: offline → setelan/?map=, online → map yang sedang dimuat; room online WAJIB menyebutnya).
   * Map berbeda: offline → layar "Memuat map…" lalu mulai; online → dimuat sinkron (urutan pesan host tetap terjaga).
   */
  play(mode: GameMode = this.settings.mode, roster: MatchRoster | null = null, net: NetStart | null = null, mapId?: MapId) {
    const want = mapId ?? (net ? this.loadedId ?? currentMap().id : this.defaultMapId());
    if (want !== this.loadedId) {
      if (!net) { this.playAfterLoad(mode, roster, want); return; }
      if (this.inMatch) this.endMatch();
      this.loadMap(want);
    }
    this.loadToken++; this.hideMapLoading();          // batalkan muat-map tertunda lainnya (prepareMap)
    this.startMatch(mode, roster, net, null);
  }

  /** Offline + map lain: overlay dulu (tergambar), bangun map, lalu mulai. Kunci mouse diminta SEKARANG (masih dalam gestur
   *  klik tombol Mulai — setelah memuat ±1 s Chrome bisa menolak). */
  private playAfterLoad(mode: GameMode, roster: MatchRoster | null, id: MapId) {
    const token = ++this.loadToken;
    if (this.inMatch) this.endMatch();
    this.menus.hide();
    this.showMapLoading(id);
    const lock = this.input.padActive || this.autoTest ? null : this.input.requestLock();
    afterPaint(() => {
      if (token !== this.loadToken) return;
      try { this.loadMap(id); } catch (err) {
        console.error('[map] gagal memuat', id, err); this.hideMapLoading(); this.input.exitLock(); this.menus.showMain(); return;
      }
      this.hideMapLoading();
      this.startMatch(mode, roster, null, lock);
    });
  }

  /** Mulai match di map yang sudah dimuat. lock = permintaan kunci mouse yang sudah berjalan (playAfterLoad). */
  private startMatch(mode: GameMode, roster: MatchRoster | null, net: NetStart | null, lock: Promise<boolean> | null) {
    this.endNet();
    const role = net ? (this.client ? 'client' : 'host') : 'offline';
    ctx.net.role = role;
    ctx.net.seed = net ? net.seed : (Math.random() * 0x7fffffff) >>> 0;
    if (net) mode = net.opts.mode;
    this.mode = mode;
    this.roster = mode === 'practice' ? null : roster;
    ctx.audio.unlock();
    this.menus.hide();
    ctx.hud.clearFeed(); ctx.hud.showBanner('', '#fff');
    this.killcam.reset(); this.minimap.reset(); this.announcer.reset(true);
    this.botChat.reset(); this.chat.close(false); this.chat.closeQuick();
    this.stopSpectate();
    this.stress = null;
    this.createEntities(mode, this.roster, net);
    this.inMatch = true; this.paused = false; this.loop.timeScale = 1; this.slowmoEnd = 0;
    this.crouchToggled = false; this.padSprint = false;
    const s = this.settings;
    const opts: MatchOptions = net ? net.opts : { mode, scoreLimit: s.scoreLimit, timeLimit: s.timeLimit * 60, roundsToWin: s.roundsToWin };
    ctx.camRig.mode = 'fps';
    const resume = net?.resume ?? null;
    if (role === 'client') {
      this.clientRep = new ClientRep(this.client!);
      if (resume) { ctx.match.resume(opts, resume, true); applySaveEntities(resume); } else ctx.match.startPuppet(opts);
    } else {
      if (role === 'host') { this.hostRep = new HostRep(this.host!); this.hostRep.begin(); }   // spawn awal ikut tersiar
      if (resume) {
        // pertandingan DILANJUTKAN (pindah host): keadaan dari cadangan; teman lain dimainkan bot sampai bergabung ulang
        ctx.match.resume(opts, resume, false); applySaveEntities(resume);
        if (this.hostRep) for (const e of ctx.entities) if (e.remote) this.hostRep.setAfk(e, 'gone', true);
      } else ctx.match.start(opts);
    }
    this.netStart = net; this.hadFriends = role === 'host' && (this.host?.connected ?? 0) > 0;
    this.afkOn = false; if (!resume) this.awaySince = -1;   // dilanjutkan (pindah host): masih AFK → langsung dimainkan bot lagi
    if (!resume) this.introBanner(opts);
    this.matchNo++;
    blackbox.state({ inMatch: true, role, mode, map: this.loadedId ?? '?', match: this.matchNo, room: role !== 'offline' });
    blackbox.log('match-mulai', `#${this.matchNo} ${mode} · ${this.loadedId ?? '?'} · peran ${role}`
      + (role === 'host' ? ` · ${this.host?.connected ?? 0} teman tersambung` : '') + (resume ? ' · DILANJUTKAN dari cadangan' : ''));
    this.bbPerfT = performance.now(); this.bbFrames = 0;
    this.loop.setKeepAlive(role === 'host');   // tab host di belakang → simulasi tetap jalan
    ctx.hud.setVisible(true);
    this.applyVisual();
    void this.syncWakeLock();
    if (!this.input.padActive) void (lock ?? this.input.requestLock()).then((ok) => {
      // Chrome menolak mengunci mouse → jangan biarkan game jalan dengan kursor bebas: tunggu satu klik lagi
      if (!ok && !this.autoTest && this.inMatch && !this.paused) { this.paused = true; this.input.clearAll(); this.menus.showClickToResume(); }
    });
  }

  pause() {
    if (this.paused || !this.inMatch || this.autoTest) return;
    this.paused = true;
    this.input.clearAll();
    if (this.settings.fullPause && ctx.net.role === 'offline') this.loop.timeScale = 0;   // online: dunia tetap berjalan
    this.menus.showPause(this.input.padActive ? 0 : this.input.lockCooldown);
  }

  /** Lanjut dari pause: game baru berjalan lagi setelah mouse BENAR-BENAR terkunci (atau mode controller). */
  resume() {
    this.menus.hide();
    this.input.disarmPad();
    if (this.input.padActive || this.input.locked) { this.unpause(); return; }
    void this.input.requestLock().then((ok) => {
      if (!this.inMatch) return;
      if (ok) this.unpause();
      else { this.paused = true; this.menus.showClickToResume(); } // ditolak Chrome → minta klik sekali lagi
    });
  }

  private unpause() {
    this.paused = false;
    this.loop.timeScale = ctx.debug.slowmo && ctx.net.role === 'offline' ? 0.25 : 1;
  }

  /** Pause → Keluar / layar hasil → Menu / Kembali ke Room. Online: host keluar di tengah match = match berakhir untuk semua
   *  (room tetap); klien keluar di tengah match = keluar room (slotnya diambil bot). */
  quitToMenu() {
    const midMatch = this.inMatch && ctx.match.state !== 'RESULTS';
    if (this.inMatch) blackbox.log('keluar-ke-menu', midMatch ? `di tengah match (peran ${ctx.net.role})` : 'dari layar hasil');
    if (midMatch && ctx.net.role === 'host') this.host?.sendAll({ t: 'ev', e: 'abort' });
    if (midMatch && ctx.net.role === 'client') { this.dropTicket(); this.leaveRoom(); }
    this.endMatch();
    // match dari room → kembali ke room (klien: map yang dipilih host selama layar hasil dimuat sekarang); host: teman yang
    // terputus selama match (masih tercatat agar bisa bergabung ulang) dikeluarkan dari room
    this.host?.prune();
    if (this.room) { this.menus.showRoom(); this.preloadRoomMap(); } else this.menus.showMain();
  }

  /** Bersihkan match (entitas, efek, replikasi) tanpa memilih menu. */
  private endMatch(keepLock = false) {
    if (this.inMatch) blackbox.log('match-selesai', `#${this.matchNo}`);
    this.inMatch = false; this.paused = false; this.stress = null;
    this.afkOn = false; if (!keepLock) this.awaySince = -1;
    this.loop.timeScale = 1; this.slowmoEnd = 0;
    if (!keepLock) this.input.exitLock();   // pertandingan dilanjutkan (pindah host): kunci mouse dipertahankan
    this.chat.close(false); this.chat.closeQuick();
    this.killcam.stop(); this.stopSpectate();
    this.endNet();
    this.disposeEntities();
    ctx.grenades.clear(); ctx.drops.clear(); ctx.vfx.clear(); ctx.deathFx.clear(); ctx.props.reset();
    ctx.match.set('MENU');
    ctx.hud.setVisible(false);
    document.body.classList.remove('dead');
    this.engine.showViewmodel = false;
    this.applyVisual();
    blackbox.state({ inMatch: false, room: this.onlineRoom() });
  }

  private endNet() {
    this.hostRep?.end();
    this.hostRep = null; this.clientRep = null; this.cmd = null;
    ctx.net.role = 'offline'; ctx.net.onShot = null; ctx.net.rewind = null; ctx.net.restore = null; ctx.net.predictHit = null;
    this.loop?.setKeepAlive(false);
  }

  /** Layar hasil → Main Lagi / pause → Ulangi: room online/lokal → mulai lagi dari room (host); solo → match yang sama.
   *  Map tetap map match ini (juga bila pilihannya 'Acak'). */
  private replay() {
    blackbox.log('main-lagi', this.room ? 'room' : 'solo');
    if (this.room) { this.endMatch(); void this.startRoom(true); return; }
    this.play(this.mode, this.roster, null, this.mapId ?? undefined);
  }

  // ───────────────────────────────── room / lobby: host (room di browser ini) & klien (gabung lewat kode)
  private createRoom(name: string) {
    this.leaveRoom();
    blackbox.log('room', 'buat room (host)'); blackbox.state({ role: 'host' });
    this.resetChat();
    const s = this.settings;
    this.room = new Lobby(makeRoomCode(Math.random),
      { mode: s.mode, scoreLimit: s.scoreLimit, timeLimit: s.timeLimit, roundsToWin: s.roundsToWin, difficulty: s.difficulty, fillBots: true, map: s.map, allTalk: true });
    const me = this.room.join(name, { local: true })!;
    me.variant = s.charVariant; me.weapon = s.weapon; me.scope = s.scope;
    this.roomMe = me.id;
    this.nextCode = makeRoomCode(Math.random);
    this.dropTicket();
    this.openHost(this.room.code);
  }

  /** Dengarkan kode room di signaling (Supabase / antar-tab) → teman bisa masuk lewat WebRTC. */
  private openHost(code: string, claim: { pid: string; rank: number } | null = null) {
    const host = new NetHost(createSignaling(), {
      lobby: () => this.room,
      inMatch: () => this.inMatch,
      onLobbyChanged: () => { this.menus.refreshRoom(); this.sendPlan(); },
      onCommands: (pid, cmds) => this.hostRep?.onCommands(pid, cmds),
      onPeerLeft: (pid, left) => {
        blackbox.log('teman-keluar', `${pid} ${left ? 'keluar' : 'terputus'} dari host${this.inMatch ? ' di tengah match (slot dimainkan bot, bisa bergabung ulang)' : ''}`);
        this.hostRep?.onPeerLeft(pid);
        if (left || !this.host || this.host !== host || this.host.connected > 0) return;
        // semua teman putus sekaligus (bukan keluar): mungkin internet KITA yang putus → mereka lanjut di host baru (kode rencana)
        if (this.inMatch && this.hadFriends) ctx.hud.toast('Semua teman terputus. Kalau internetmu sempat putus, buka menu (Esc) → "Gabung ke host baru"');
        else if (!this.inMatch && this.nextCode) {
          const code = this.nextCode;
          // ditunda: NetHost menggambar ulang room (onLobbyChanged) tepat setelah hook ini — pesan harus tampil sesudahnya
          setTimeout(() => {
            if (this.host === host && host.connected === 0 && !this.inMatch && this.menus.current === 'room')
              this.menus.showRoom(`Semua teman terputus. Kalau internetmu sempat putus, mereka melanjutkan di room ${formatRoomCode(code)} — `
                + 'tekan Keluar Room lalu Gabung dengan kode itu.');
          }, 0);
        }
      },
      canRejoin: (pid) => { const pl = this.room?.find(pid); return !!pl && !pl.local && !pl.sim; },
      onPeerRejoined: (pid) => this.onPeerRejoined(pid),
      onAfk: (pid, on) => { blackbox.log('afk', `${pid} ${on ? 'AFK (dimainkan bot)' : 'kembali'}`); this.hostRep?.setClientAfk(pid, on); },
      onYield: (winner) => { if (this.host === host) void this.yieldHost(winner); },
      onChat: (pid, scope, text, quick) => { if (this.host === host) this.hostChat(pid, scope, text, quick); },
      onVoice: (pid, buf) => { if (this.host === host) this.voice.onUp(pid, buf); },
      onLoadout: (pid, lo, v) => this.hostRep?.setLoadout(pid, lo, v),
      onPings: () => this.menus.updatePings(this.netInfo().pings),
    }, iceServers(XCFG.net.ice));
    host.claim = claim;
    this.host = host; this.netState = 'connecting';
    host.open(code).then(
      () => { if (this.host === host) { this.netState = 'online'; this.menus.refreshRoom(); } },
      (err) => { console.warn('[net] signaling gagal:', err); if (this.host === host) { this.netState = 'error'; this.menus.refreshRoom(); } });
  }

  /** Gabung room teman: kode → host menjawab → WebRTC → cermin room. */
  private async joinRoom(code: string, name: string, rejoin: string | null = null, trySec = 0): Promise<{ ok: true } | { ok: false; reason: JoinFail }> {
    this.leaveRoom();
    const s = this.settings;
    // bergabung lagi ke room hasil serah-terima host → ambil kembali slot lama
    if (!rejoin && this.rejoinHint && this.rejoinHint.code === code) rejoin = this.rejoinHint.pid;
    this.plan = null; this.lastSave = null; this.handoverPending = false;
    const client: NetClient = new NetClient(createSignaling(), {
      onLobby: () => {
        if (this.client !== client || !client.lobby || !client.pid) return;
        this.room = client.lobby; this.roomMe = client.pid; this.menus.refreshRoom(); this.preloadRoomMap();
      },
      // selama map match dimuat (startNetClient) pesan host ditahan lalu diputar berurutan setelah match siap
      onStart: (msg) => { if (this.client === client) this.netHold.run(() => this.startNetClient(msg)); },
      onEvent: (msg) => { if (this.client === client) this.netHold.run(() => this.onNetEvent(msg)); },
      onSnapshot: (snap) => {
        if (this.client !== client) return;
        if (this.netHold.holding) this.netHold.run(() => this.clientRep?.onSnapshot(snap)); else this.clientRep?.onSnapshot(snap);
      },
      onClosed: (reason) => { if (this.client === client) this.onClientClosed(reason); },
      onPings: () => { if (this.client === client) this.menus.updatePings(this.netInfo().pings); },
      onPlan: (plan) => { if (this.client === client) this.plan = plan; },
      onChat: (msg) => { if (this.client === client) this.recvChat(msg); },
      onChatDeny: (reason) => { if (this.client === client && reason) this.chat.note(reason.slice(0, 120)); },
      onVoice: (buf) => { if (this.client === client) this.voice.onDown(buf); },
      onSave: (raw) => { if (this.client !== client) return; const sv = parseSave(raw); if (sv) this.lastSave = sv; },
      onHandover: (plan, save, start) => {
        if (this.client !== client) return;
        if (plan) this.plan = plan;
        const sv = parseSave(save); if (sv) this.lastSave = sv;
        const st = start && typeof start === 'object' ? parseStart(start as Record<string, unknown>) : null; if (st) this.netStart = st;
        this.handoverPending = true;
        blackbox.log('serah-host', `host menyerahkan room → ${plan ? `pengganti ${plan.order[0]}, kode baru ${plan.code}` : 'rencana rusak'}`);
      },
    }, iceServers(XCFG.net.ice));
    this.client = client; this.netState = 'connecting';
    const total = trySec > 0 ? trySec + XCFG.net.joinConnect : XCFG.net.connectTimeout, hello = trySec > 0 ? trySec : XCFG.net.helloTimeout;
    const r = await client.join(code, { name, variant: s.charVariant, weapon: s.weapon, scope: s.scope }, total, hello, rejoin);
    if (this.client !== client) return { ok: false, reason: 'failed' };   // dibatalkan (keluar / gabung lagi)
    if (!r.ok) { this.client = null; return r; }
    this.netState = 'online';
    this.room = client.lobby; this.roomMe = client.pid!;
    blackbox.log('room', 'gabung room sebagai teman (klien)'); blackbox.state({ room: true, role: 'client' });
    return r;
  }

  private leaveRoom() {
    if (this.room) blackbox.log('room', 'keluar dari room');
    blackbox.state({ room: false, role: 'offline' });
    this.cancelNetHold();
    if (this.client) { const c = this.client; this.client = null; c.leave(); }
    if (this.host) { const h = this.host; this.host = null; h.close(); }
    this.room = null; this.roster = null; this.promotedFrom = '';
    void this.syncWakeLock();
  }

  private netInfo() {
    const sig = (this.host ?? this.client)?.sig;
    return { role: this.client ? 'client' as const : 'host' as const, state: this.netState, internet: !!sig?.internet, label: sig?.label ?? '',
      peers: this.host?.connected ?? 0, pings: this.host ? this.host.pings() : this.client ? this.client.pings : {} };
  }

  /** Aksi di layar room. Host: ubah room lalu siarkan; klien: kirim ke host (host yang memvalidasi & menyiarkan). */
  private roomAct(a: RoomAction) {
    const L = this.room, me = this.roomMe;
    if (!L) return;
    if (this.client) {
      if (a.type === 'team') this.client.act({ a: 'team', team: a.team });
      else if (a.type === 'ready') this.client.act({ a: 'ready', ready: a.ready });
      return;
    }
    switch (a.type) {
      case 'team': L.switchTeam(me, a.team); break;
      case 'ready': L.setReady(me, a.ready); break;
      case 'kick': if (L.kick(me, a.id)) this.host?.kick(a.id); break;
      case 'settings': if (L.setSettings(me, a.patch) && isMapId(a.patch.map)) void this.prepareMap(a.patch.map); break;   // map dipratinjau di menu
      case 'shuffle': L.shuffle(me, Math.random); break;
    }
    this.host?.broadcastLobby();
  }

  /** Teman simulasi (pratinjau tanpa teman sungguhan): masuk ke tim yang lebih sedikit, siap setelah jeda acak. */
  private addSimFriend() {
    const r = this.room;
    if (!r || r.full || this.client) return;
    const used = new Set(r.players.map(p => p.name)), pool = XCFG.lobby.simNames.filter(n => !used.has(n));
    const p = r.join(pool.length ? pool[Math.floor(Math.random() * pool.length)] : 'Teman ' + (r.players.length + 1), { sim: true });
    if (p) this.simReadyLater(p.id);
    this.host?.broadcastLobby();
  }

  private simReadyLater(id: string) {
    const r = this.room, [a, b] = XCFG.lobby.simReady;
    setTimeout(() => {
      const p = r?.find(id);
      if (!r || this.room !== r || !p || p.ready) return;
      r.setReady(id, true); this.host?.broadcastLobby(); this.menus.refreshRoom();
    }, (a + Math.random() * (b - a)) * 1000);
  }

  /** Host menekan Mulai (atau Main Lagi / Ulangi): aturan room → setelan, susunan room → match. Map = pilihan room ('Acak' diundi
   *  di sini, id konkret yang dikirim; Main Lagi / Ulangi = map match sebelumnya). Ada teman terhubung → match online: host memuat
   *  map dulu (layar "Memuat map…"), lalu susunan + seed + map dikirim & semua mulai bersamaan; tanpa teman → match lokal. */
  private async startRoom(fromResults = false) {
    const r = this.room;
    if (!r || this.client) return;
    this.host?.prune();   // teman yang terputus di match sebelumnya tidak menahan Mulai
    const chk = r.canStart(this.roomMe);
    if (!chk.ok) { if (fromResults) this.menus.showRoom(chk.reason); return; }
    const L = r.settings;
    const cur = this.mapId;
    const map = L.map === 'random' && fromResults && cur ? cur : pickMap(L.map, Math.random);
    Object.assign(this.settings, { mode: L.mode, scoreLimit: L.scoreLimit, timeLimit: L.timeLimit, roundsToWin: L.roundsToWin,
      difficulty: L.difficulty, map: L.map });
    saveSettings(this.settings);
    const me = r.find(this.roomMe);
    if (me) { me.variant = this.settings.charVariant; me.weapon = this.settings.weapon; me.scope = this.settings.scope; }
    const tok = ++this.roomStartTok;
    if (!this.host || this.host.connected === 0) { this.startRoomLocal(r, map); return; }
    if (map !== this.mapId) {
      // map lain: muat di host dulu (kunci mouse diminta sekarang, selagi masih dalam gestur klik Mulai)
      if (!this.input.padActive && !this.autoTest) void this.input.requestLock();
      await this.prepareMap(map);
      if (tok !== this.roomStartTok || this.inMatch) return;                        // digantikan permintaan Mulai lain
      const again = this.room === r && !this.client ? r.canStart(this.roomMe) : null;   // room bisa berubah selama memuat
      if (!again?.ok || this.mapId !== map) {
        this.input.exitLock();
        if (again) this.menus.showRoom(again.ok ? 'Map gagal dimuat — coba Mulai lagi' : again.reason);
        return;
      }
      if (!this.host || this.host.connected === 0) { this.startRoomLocal(r, map); return; }
    }
    const roster = r.roster(this.roomMe), s = this.settings;
    const net: NetStart = { seed: (Math.random() * 0x7fffffff) >>> 0, ents: this.buildNetEnts(roster),
      opts: { mode: L.mode, scoreLimit: s.scoreLimit, timeLimit: s.timeLimit * 60, roundsToWin: s.roundsToWin }, map };
    this.host.sendAll({ t: 'start', seed: net.seed, opts: net.opts, ents: net.ents, map });
    this.play(L.mode, roster, net, map);
  }

  /** Room tanpa teman terhubung: match lokal (teman simulasi & slot kosong dimainkan bot); map lain → layar "Memuat map…". */
  private startRoomLocal(r: Lobby, map: MapId) {
    r.resetReady();
    for (const p of r.players) if (p.sim) this.simReadyLater(p.id);
    this.play(r.settings.mode, r.roster(this.roomMe), null, map);
  }

  /** Susunan online: id per slot (Biru 1…5, Merah 6…10); teman terhubung = manusia, sisanya (bot / teman simulasi) = bot. */
  private buildNetEnts(roster: MatchRoster): NetEnt[] {
    const s = this.settings, live = new Set(this.host?.pids() ?? []), out: NetEnt[] = [];
    for (const team of ['blue', 'red'] as const) roster[team].forEach((r, i) => {
      const id = (team === 'blue' ? 1 : 1 + XCFG.lobby.teamSize) + i;
      if (r.kind === 'you') out.push({ id, team, name: r.name, pid: r.pid ?? null, bot: false, variant: s.charVariant, weapon: s.weapon, scope: s.scope });
      else if (r.kind === 'friend' && !r.sim && r.pid && live.has(r.pid))
        out.push({ id, team, name: r.name, pid: r.pid, bot: false, variant: r.variant ?? 'm', ...cleanLoadout(r.weapon, r.scope) });
      else out.push({ id, team, name: r.name, pid: null, bot: true, variant: botVariant(team === 'blue' ? i + 1 : i), ...this.randomLoadout() });
    });
    return out;
  }

  /** Klien: host memulai match di map net.map. Map sudah dimuat (pratinjau room) → langsung main; map lain → layar
   *  "Memuat map…" tergambar dulu, pesan host berikutnya (spawn, snapshot, event) ditahan lalu diputar berurutan setelah siap. */
  private startNetClient(msg: Record<string, unknown>) {
    const net = parseStart(msg);
    if (!net || !net.ents.some(e => e.pid === this.roomMe)) { console.warn('[net] pesan start tidak valid'); return; }
    if (msg.map !== undefined && msg.map !== net.map) console.warn('[net] map dari host tidak dikenal:', msg.map, '→', net.map);
    if (this.inMatch) this.endMatch(!!net.resume);
    if (net.resume) blackbox.log('match-lanjut', `bergabung ke pertandingan yang sedang berjalan (ronde ${net.resume.round}, skor ${net.resume.sb}–${net.resume.sr})`);
    if (net.map === this.mapId) { this.play(net.opts.mode, null, net, net.map); return; }
    const hold = this.netHold.hold();
    this.loadToken++;                                   // batalkan pratinjau map yang masih tertunda
    this.menus.hide();
    this.showMapLoading(net.map);
    // false = keluar room / koneksi putus selama menunggu (penahanan dibatalkan); antrean diputar setelah match dimulai
    afterPaint(() => this.netHold.release(hold, () => {
      try { this.play(net.opts.mode, null, net, net.map); } catch (err) {
        console.error('[map] gagal memuat', net.map, err);
        this.hideMapLoading(); if (this.inMatch) this.endMatch();
        if (this.room) this.menus.showRoom('Map gagal dimuat');
      }
    }));
  }

  /** Klien: batalkan penahanan pesan (keluar room / koneksi putus) beserta layar "Memuat map…". */
  private cancelNetHold() { if (this.netHold.cancel()) this.hideMapLoading(); }

  /** Klien: map pilihan host (bukan 'Acak') dimuat di layar room (layar "Memuat map…") → saat host menekan Mulai tanpa menunggu. */
  private preloadRoomMap() {
    const m = this.room?.settings.map;
    if (this.client && !this.inMatch && !this.netHold.holding && isMapId(m) && m !== this.mapId) void this.prepareMap(m);
  }

  /** Klien: event reliable dari host. */
  private onNetEvent(m: Record<string, unknown>) {
    if (m.e === 'abort') {
      if (!this.inMatch) return;
      blackbox.log('host-mengakhiri', 'host keluar dari match lewat menu');
      this.endMatch();
      this.menus.showRoom('Host mengakhiri match');
      return;
    }
    if (this.inMatch) this.clientRep?.onEvent(m);
  }

  /** Klien: koneksi ke host berakhir. */
  private onClientClosed(reason: 'host' | 'kicked' | 'lost') {
    blackbox.log('koneksi-host', reason === 'lost' ? 'koneksi ke host terputus (halaman host di-refresh/ditutup, atau jaringan putus)'
      : reason === 'host' ? (this.handoverPending ? 'host menyerahkan room' : 'host menutup room') : 'dikeluarkan oleh host');
    if (this.migrating) return;   // percobaan gabung saat pindah host — ditangani migrate()
    // host hilang (atau menyerahkan room) dan ada rencana pengganti → lanjut tanpa host lama, bukan bubar
    if ((reason === 'lost' || (reason === 'host' && this.handoverPending)) && this.plan && this.roomMe && (this.inMatch || this.room)) {
      void this.migrate();
      return;
    }
    this.cancelNetHold();
    this.client = null; this.room = null; this.roster = null;
    if (this.inMatch) this.endMatch();
    const msg = reason === 'host' ? 'Host menutup room.' : reason === 'kicked' ? 'Kamu dikeluarkan dari room oleh host.' : 'Koneksi ke host terputus.';
    this.menus.showLobbyHome(() => this.menus.showMain(), '', msg);
    blackbox.state({ room: false, role: 'offline' });
  }

  /** Awal match: banner nama map + mode selama hitung mundur (Eliminasi: menggantikan banner "RONDE 1"); Latihan: pesan singkat. */
  private introBanner(o: MatchOptions) {
    const name = currentMap().name;
    if (o.mode === 'practice') { ctx.hud.toast(`Latihan Menembak · ${name}`); return; }
    if (ctx.match.state !== 'COUNTDOWN') return;
    ctx.hud.showBanner(name.toUpperCase(), '#f5cd30', o.mode === 'elim' ? 'ELIMINASI · RONDE 1' : `TEAM DEATHMATCH · ${o.scoreLimit} KILL`);
  }

  private onMatchState(state: GameEvents['match:state']['state']) {
    if (!this.inMatch) return;
    if (state === 'ENDED') this.onEnded();
    else if (state === 'ROUND_END') this.onRoundEnd();
    else if (state === 'PLAYING') { ctx.hud.showBanner('', '#fff'); if (this.mode !== 'practice') ctx.audio.playUi(R.countBeep(true), 0.8); }
  }

  private onRoundStart(round: number) {
    this.killcam.stop(); this.stopSpectate();
    this.announcer.reset(round === 1);
    this.padSprint = false; this.crouchToggled = false;
    if (ctx.player) ctx.player.adsWanted = false;
    if (this.mode === 'elim') {
      if (round > 1) ctx.hud.clearFeed();
      ctx.hud.showBanner(`RONDE ${round}`, '#f4efe6', `BIRU ${ctx.teams.scores.blue} — ${ctx.teams.scores.red} MERAH`);
    }
  }

  private onRoundEnd() {
    const p = ctx.player, w = ctx.match.roundWinner, s = ctx.teams.scores;
    const win = !!p && w === p.team;
    ctx.hud.showBanner(w === 'draw' ? 'RONDE SERI' : win ? 'RONDE MENANG' : 'RONDE KALAH', w === 'draw' ? '#f5cd30' : win ? '#7dff9a' : '#ff6b5e',
      `BIRU ${s.blue} — ${s.red} MERAH`);
    ctx.audio.playUi(R.stinger(w === 'draw' ? 'draw' : win ? 'win' : 'lose'), 0.7);
  }

  private onEnded() {
    this.killcam.stop(); this.stopSpectate();
    const p = ctx.player, w = ctx.match.winner;
    const win = !!p && w === p.team;
    ctx.hud.showBanner(w === 'draw' ? 'SERI' : win ? 'MENANG' : 'KALAH', w === 'draw' ? '#f5cd30' : win ? '#7dff9a' : '#ff6b5e');
    ctx.audio.playUi(R.stinger(w === 'draw' ? 'draw' : win ? 'win' : 'lose'));
    if (ctx.net.role === 'offline') {   // online: waktu host & klien harus tetap sama
      this.loop.timeScale = XCFG.match.endTimeScale; // slow-motion 1 s
      this.slowmoEnd = performance.now() + XCFG.match.endSlowMoTime * 1000;
    }
  }

  private onResults() {
    blackbox.log('hasil', `#${this.matchNo} selesai normal (layar hasil)`);
    blackbox.state({ inMatch: false, room: this.onlineRoom() });
    this.loop.timeScale = 1;
    this.input.exitLock();
    this.killcam.stop();
    ctx.hud.showBanner('', '#fff');
    ctx.hud.setVisible(false); // layar hasil bersih (radar/nama/senjata disembunyikan)
    document.body.classList.remove('dead');
    ctx.props.reset(); ctx.vfx.clear();
    const online = ctx.net.role === 'offline' ? null : ctx.net.role;
    this.menus.showResults(ctx.match.winner, ctx.player?.team ?? 'blue', !!this.room && (!!this.roster || !!online), online);
  }

  private onKill(ev: GameEvents['kill']) {
    const p = ctx.player;
    if (!p || !this.inMatch || ev.victimId !== p.id) return;
    const killer = ev.killerId !== p.id ? ctx.byId.get(ev.killerId) : undefined;
    if (killer && this.mode !== 'practice' && ctx.match.state === 'PLAYING')
      this.killcam.begin(killer, p, ev.weaponId, ev.headshot, this.settings.killcam, this.mode !== 'elim');
  }

  private onPlayerSpawn() {
    this.killcam.stop();
    this.stopSpectate();
    this.heartT = 0;
    ctx.camRig.resetMotion(); ctx.viewmodel.resetMotion();
  }

  private stopSpectate() {
    if (this.specSavedMode) { ctx.camRig.mode = this.specSavedMode; this.specSavedMode = null; }
    this.specTarget = null;
    if (ctx.hud) ctx.hud.spectating = null;
  }

  private applySettings(s: Settings) {
    const reload = s.preset !== this.settings.preset;
    Object.assign(this.settings, validate(s));
    saveSettings(this.settings);
    ctx.audio.setVolumes(this.settings.volMaster / 100, this.settings.volSfx / 100, this.settings.volUi / 100);
    ctx.audio.setVoiceVolume(this.settings.voice ? this.settings.volVoice / 100 : 0);
    if (!this.settings.voice) this.voice.reset();
    this.stats.toggle(this.settings.showFps);
    this.applyVisual();
    if (reload) {   // antialias hanya bisa ditentukan saat WebGLRenderer dibuat
      this.allowUnload = true;
      blackbox.closing('ganti preset grafis');
      location.reload();
    }
  }

  /** Refresh / tutup tab perlu dikonfirmasi: match berjalan, atau room online (host dengan teman / klien). Uji otomatis: tidak. */
  private unloadGuarded(): boolean {
    if (this.allowUnload || this.autoTest) return false;
    return (this.inMatch && ctx.match.state !== 'RESULTS') || this.onlineRoom();
  }
  /** Sedang di room online: host dengan ≥ 1 teman tersambung, atau klien. */
  private onlineRoom(): boolean { return (!!this.host && this.host.connected > 0) || !!this.client; }

  // ───────────────────────────────── pindah host, bergabung ulang, AFK, wake lock (permintaan pengguna 2026-11-25)
  /** Tiap ±1 s (juga saat tab di belakang): AFK lokal, wake lock, rencana pengganti host. */
  private netTick() {
    this.updateAfk();
    void this.syncWakeLock();
    this.syncTicket();
    if (this.host && !this.client && ++this.planT >= XCFG.net.planEvery) { this.planT = 0; this.sendPlan(); }
    // naik jadi host tapi tak seorang pun menyusul → mungkin host lama masih jalan & teman-teman tetap di sana
    if (this.promotedFrom && !this.lonelyToast && this.inMatch && !this.hadFriends && this.host?.connected === 0
      && performance.now() - this.promotedAt > XCFG.net.lonelyAfter * 1000) {
      this.lonelyToast = true;
      ctx.hud.toast('Belum ada teman yang menyambung ke kamu. Kalau host lama masih jalan: Esc → "Gabung ke host lama"');
    }
  }

  /** Host: rencana pengganti (ping terbaik dulu) + kode room berikutnya ke semua teman. */
  private sendPlan() {
    const h = this.host, L = this.room;
    if (!h || !L || this.client || h.connected === 0) return;
    if (!this.nextCode) this.nextCode = makeRoomCode(Math.random);
    h.sendPlan(makePlan(this.nextCode, h.pids(), h.pings(), L.players.map(pl => pl.id)));
  }

  /** Host: teman bergabung ulang (pid lama). Di tengah match → susunan + cadangan agar dia melanjutkan dari keadaan sekarang;
   *  slotnya tetap dimainkan bot sampai perintah pertamanya tiba. */
  private onPeerRejoined(pid: string) {
    blackbox.log('teman-kembali', `${pid} bergabung ulang${this.inMatch ? ' di tengah match' : ''}`);
    this.sendPlan();
    if (!this.inMatch || !this.netStart || !this.host) return;
    this.hadFriends = true;
    this.hostRep?.onPeerRejoined(pid);
    const st = this.netStart;
    this.host.sendTo(pid, { t: 'start', seed: st.seed, opts: st.opts, ents: st.ents, map: st.map, resume: captureSave() });
  }

  /** Klien: host hilang (atau menyerahkan room) → lanjut tanpa host lama (urutan waktu: Migration.migrationTimes):
   *  1) bukan serah-terima: coba sambung ulang ke host LAMA dulu (mungkin hanya koneksi kita yang putus);
   *  2) gabung ke host baru (kode di rencana) sampai giliran kita; 3) giliran tiba → kita yang jadi host dari cadangan. */
  private async migrate() {
    const tok = ++this.migrating;
    const plan = this.plan!, me = this.roomMe, handover = this.handoverPending;
    const oldLobby = this.room, oldCode = oldLobby?.code ?? '', wasInMatch = this.inMatch;
    const name = oldLobby?.find(me)?.name ?? (cleanName(this.settings.playerName) || 'Pemain');
    const save = wasInMatch ? (handover && this.lastSave ? this.lastSave : this.freshSave()) : null;
    const start = this.netStart;
    this.handoverPending = false;
    this.cancelNetHold();
    this.client = null; this.netState = 'connecting';
    const { rank, promoteAt, giveUpAt } = migrationTimes(plan, me, handover);
    const succ = rank === 0 ? 'kamu' : oldLobby?.find(plan.order[0])?.name ?? 'teman';
    this.showNetOverlay(handover ? 'Host menyerahkan room' : 'Host terputus',
      rank === 0 && handover ? 'Kamu jadi host baru…' : `Memindahkan host (pengganti: ${succ})… Game dilanjutkan sebentar lagi.`);
    blackbox.log('pindah-host', `${handover ? 'serah-terima' : 'host hilang'} · urutan pengganti ${rank} dari ${plan.order.length} · kode baru ${plan.code}`);
    const t0 = performance.now(), el = () => (performance.now() - t0) / 1000, N = XCFG.net;
    // netOk: percobaan terakhir sampai ke kanal signaling (internet KITA jalan). Tanpa itu kita TIDAK naik jadi host — mungkin justru
    // kita yang putus & teman lain masih main dengan host lama. hostSeen: ada host di kode baru tapi WebRTC gagal → coba lagi,
    // jangan membuat host tandingan.
    // alt: giliran kode saat internet belum terbukti jalan (host lama baru saja dicoba → mulai dari kode baru)
    let netOk = handover, hostSeen = false, alt = !handover && !!oldCode, why = 'Koneksi ke host terputus dan pindah host gagal.', retry = oldCode;
    const tryJoin = async (code: string, sec: number): Promise<'ok' | 'stop' | JoinFail> => {
      const r = await this.joinRoom(code, name, me, Math.max(1, sec));
      if (tok !== this.migrating) return 'stop';
      if (r.ok) return 'ok';
      if (r.reason !== 'failed') netOk = true;
      else {
        this.showNetOverlay('Internet kamu terputus', 'Menunggu tersambung lagi… karaktermu tetap di match & bisa kembali.');
        await new Promise(res => setTimeout(res, 500));
      }
      return tok === this.migrating ? r.reason : 'stop';
    };
    if (!handover && oldCode) {   // 1) host lama dulu: mungkin hanya koneksi kita ke host yang putus
      const r = await tryJoin(oldCode, N.rejoinWait);
      if (r === 'stop') return;
      if (r === 'ok') { this.migrated(tok, 'old'); return; }
    }
    while (tok === this.migrating) {
      const offline = navigator.onLine === false;
      if (el() >= promoteAt && netOk && !hostSeen && !offline) {   // 3) giliran kita → jadi host dari cadangan
        if (!this.promote(plan, save, start, oldLobby, wasInMatch, rank)) { retry = plan.code; break; }
        this.promotedFrom = handover ? '' : oldCode; this.promotedAt = performance.now(); this.lonelyToast = false;
        this.migrated(tok, 'host'); return;
      }
      if (el() >= giveUpAt) {
        if (!netOk || offline) { why = 'Internet kamu terputus. Tekan Gabung setelah tersambung lagi — slotmu di match dikembalikan.'; retry = oldCode || plan.code; }
        else retry = plan.code;
        break;
      }
      // 2) gabung ke host baru sampai giliran kita; internet belum terbukti jalan → bergantian coba host lama juga
      const code = !netOk && !handover && oldCode && (alt = !alt) ? oldCode : plan.code;
      const left = promoteAt - el();
      const r = await tryJoin(code, Math.min(left > 0.5 ? left : N.joinTry, Math.max(1, giveUpAt - el())));
      if (r === 'stop') return;
      if (r === 'ok') { this.migrated(tok, code === oldCode && code !== plan.code ? 'old' : 'new'); return; }
      if (r === 'full' || r === 'started') { why = 'Host baru menolak sambungan ulang.'; retry = code; break; }
      if (code === plan.code) hostSeen = r === 'timeout';
      if (netOk && code === plan.code && !hostSeen)
        this.showNetOverlay(handover ? 'Host menyerahkan room' : 'Host terputus', `Memindahkan host… Game dilanjutkan sebentar lagi.`);
    }
    if (tok !== this.migrating) return;
    this.migrating = 0; this.hideNetOverlay();
    if (this.inMatch) this.endMatch();
    this.room = null; this.netState = 'error';
    this.rejoinHint = { code: retry, pid: me };
    this.setTicket({ code: retry, alt: retry !== plan.code ? plan.code : null, pid: me, name, t: Date.now(), match: wasInMatch });
    blackbox.log('pindah-host', `gagal — ${why}`);
    blackbox.state({ room: false, role: 'offline' });
    this.menus.showLobbyHome(() => this.menus.showMain(), retry, why);
  }

  private migrated(tok: number, how: 'old' | 'new' | 'host') {
    if (tok !== this.migrating) return;
    this.migrating = 0;
    this.hideNetOverlay();
    blackbox.log('pindah-host', `berhasil: ${how === 'host' ? 'kamu host baru' : how === 'old' ? 'tersambung ulang ke host lama' : 'gabung ke host baru'}`);
    blackbox.state({ room: true, role: this.client ? 'client' : 'host' });
    ctx.hud.toast(how === 'host' ? 'Kamu sekarang host — teman-teman menyambung ulang' : how === 'old' ? 'Tersambung lagi — game dilanjutkan'
      : 'Tersambung ke host baru — game dilanjutkan');
    if (!this.inMatch && this.room) this.menus.showRoom(how === 'host' ? 'Kamu sekarang host room ini' : how === 'new' ? 'Pindah ke host baru' : undefined);
  }

  /** Host baru hasil pindah host yang kalah klaim (dua pengganti naik bersamaan di kode yang sama): teman kita diserahkan ke
   *  pemenang, lalu kita sendiri ikut bergabung ke sana dengan pid lama (pertandingan lanjut dari keadaan pemenang). */
  private async yieldHost(winner: string) {
    const h = this.host, L = this.room, me = this.roomMe;
    if (!h || h !== this.host || !L || this.client || this.migrating) return;
    const plan: Plan = { code: L.code, order: [winner, ...h.pids().filter(p => p !== winner && p !== me), me] };
    const st = this.inMatch ? this.netStart : null, save = this.inMatch ? captureSave() : null;
    blackbox.log('pindah-host', `dua host baru di kode ${L.code} → mengalah ke ${winner} (${h.connected} teman ikut dipindah)`);
    this.host = null; this.promotedFrom = '';
    await h.handover(plan, save, st ? { seed: st.seed, opts: st.opts, ents: st.ents, map: st.map } : null);
    if (this.host || this.client || this.migrating || this.room !== L) return;   // keluar / gabung lain selama jeda
    this.plan = plan; this.lastSave = save; this.handoverPending = true;
    void this.migrate();
  }

  /** Klien → HOST BARU: room = salinan room lama (kode baru, kita host; pemain lain tetap tercatat agar bisa bergabung ulang),
   *  room dibuka di signaling, pertandingan dilanjutkan dari cadangan (teman lain dimainkan bot sampai bergabung ulang). */
  private promote(plan: Plan, save: MatchSave | null, start: NetStart | null, oldLobby: Lobby | null, wasInMatch: boolean, rank: number): boolean {
    const me = this.roomMe;
    if (!oldLobby || !oldLobby.find(me)) return false;
    const st = oldLobby.toState(); st.code = plan.code;
    const L = Lobby.fromState(st, me);
    for (const pl of L.players) { pl.host = pl.id === me; if (pl.host) pl.ready = true; }
    // di layar room: pemain yang tidak tersambung ke host lama (termasuk host lama sendiri) tidak ikut — dia bisa masuk lagi seperti
    // biasa. Di tengah match semua tetap tercatat agar bisa bergabung ulang ke slotnya (dibersihkan prune() saat Mulai / kembali ke room).
    if (!wasInMatch) for (const pl of [...L.players]) if (pl.id !== me && !pl.sim && !plan.order.includes(pl.id)) L.leave(pl.id);
    this.leaveRoom();
    this.room = L; this.roomMe = me; this.nextCode = makeRoomCode(Math.random); this.lastSave = null;
    this.settings.difficulty = L.settings.difficulty;   // bot match lanjutan memakai kesulitan room, bukan setelan lokal kita
    this.openHost(plan.code, { pid: me, rank });
    blackbox.state({ role: 'host', room: true });
    if (wasInMatch && save && start) {
      if (this.inMatch) this.endMatch(true);
      const net: NetStart = { ...start, resume: save };
      this.play(net.opts.mode, null, net, net.map);
    } else if (this.inMatch) this.endMatch();
    return true;
  }

  /** Klien sebelum mengambil alih: cadangan dari cermin match + snapshot TERBARU (posisi/HP lebih baru dari posisi tampil yang
   *  tertinggal jeda interpolasi) + amunisi/granat pemain lain dari cadangan terakhir host. */
  private freshSave(): MatchSave | null {
    if (!this.inMatch) return null;
    const s = captureSave(), base = this.lastSave, cr = this.clientRep, me = ctx.player?.id;
    const r2 = (v: number) => Math.round(v * 100) / 100;
    for (const e of s.ents) {
      if (e.id === me) continue;
      const b = base?.ents.find(x => x.id === e.id);
      if (b) { e.ammo = b.ammo; e.reserve = b.reserve; e.modeIdx = b.modeIdx; e.grenades = b.grenades; e.flashes = b.flashes ?? 1; }
      const lat = cr?.latestState(e.id);
      if (lat && e.alive) { e.x = r2(lat.x); e.y = r2(lat.y); e.z = r2(lat.z); e.yaw = r2(lat.yaw); e.pitch = r2(lat.pitch); if (lat.hp > 0) e.hp = lat.hp; }
    }
    return s;
  }

  /** Host: teman tersambung yang bisa menerima serah-terima (ping terbaik dulu). */
  private handoverTargets(): { pid: string; name: string; ping: number | null }[] {
    const h = this.host, L = this.room;
    if (!h || !L || this.client) return [];
    const pings = h.pings();
    return makePlan('', h.pids(), pings, L.players.map(pl => pl.id)).order
      .map(pid => ({ pid, name: L.find(pid)?.name ?? 'Teman', ping: pings[pid] ?? null }));
  }

  /** Host: serahkan room & pertandingan ke teman `pid` (lalu keluar). Teman menerima cadangan TERBARU lalu dia yang jadi host;
   *  yang lain menyambung ke dia. Kita bisa bergabung lagi kapan saja lewat kode room baru (slot lama kita dikembalikan). */
  private handover(pid: string) {
    const h = this.host, L = this.room, me = this.roomMe;
    if (!h || !L || this.client || !h.pids().includes(pid)) return;
    const plan = makePlan(this.nextCode || makeRoomCode(Math.random), h.pids(), h.pings(), L.players.map(pl => pl.id));
    plan.order = [pid, ...plan.order.filter(x => x !== pid)];
    const name = L.find(pid)?.name ?? 'teman', st = this.inMatch ? this.netStart : null;
    blackbox.log('serah-host', `ke ${pid} · kode baru ${plan.code}`);
    void h.handover(plan, this.inMatch ? captureSave() : null, st ? { seed: st.seed, opts: st.opts, ents: st.ents, map: st.map } : null);
    this.host = null;
    if (this.inMatch) this.endMatch();
    this.room = null; this.roster = null; this.netState = 'error';
    this.rejoinHint = { code: plan.code, pid: me };
    this.setTicket({ code: plan.code, alt: null, pid: me, name: L.find(me)?.name ?? '', t: Date.now(), match: !!st });
    blackbox.state({ room: false, role: 'offline' });
    void this.syncWakeLock();
    this.menus.showLobbyHome(() => this.menus.showMain(), plan.code,
      `Host diserahkan ke ${name}. Kode room baru ${formatRoomCode(plan.code)} — tekan Gabung untuk ikut main lagi.`);
  }

  /** Host yang semua temannya terputus sekaligus di tengah match (mungkin internet KITA yang putus): kode room baru tempat mereka
   *  melanjutkan (null = tidak relevan). */
  private mergeBackCode(): { code: string; old: boolean } | null {
    const h = this.host;
    if (!this.inMatch || !h || this.client || h.connected > 0) return null;
    if (this.hadFriends && this.nextCode) return { code: this.nextCode, old: false };   // teman pindah host karena kita terputus
    if (this.promotedFrom) return { code: this.promotedFrom, old: true };              // kita naik jadi host, tak ada yang menyusul
    return null;
  }

  /** Gabung ke host baru teman-teman (mereka sudah pindah host karena kita terputus) dengan pid lama → slot kita dikembalikan. */
  private async mergeBack() {
    const t = this.mergeBackCode(), me = this.roomMe, name = this.room?.find(me)?.name ?? (cleanName(this.settings.playerName) || 'Pemain');
    if (!t) return;
    const lobby = this.room;
    this.menus.hide();
    this.showNetOverlay(t.old ? 'Gabung ke host lama' : 'Gabung ke host baru', 'Menyambung ke room teman-teman…');
    blackbox.log('pindah-host', `host tanpa teman gabung ke ${t.old ? 'host lama' : 'host baru'} ${t.code}`);
    const r = await this.joinRoom(t.code, name, me, XCFG.net.joinTry * 2);
    this.hideNetOverlay();
    if (r.ok) return;
    // gagal: joinRoom sudah menutup room kita → buka lagi (kode sama) & sambungkan replikasi match ke koneksi baru — match tetap
    // jalan, teman tetap bisa bergabung ulang, tombol "Gabung" bisa dicoba lagi
    if (lobby && this.inMatch && !this.host && !this.client) { this.room = lobby; this.openHost(lobby.code); if (this.host) this.hostRep?.rebind(this.host); }
    ctx.hud.toast(r.reason === 'failed' ? 'Gagal terhubung — cek internet' : 'Room teman tidak ditemukan — mungkin mereka sudah keluar');
    if (this.inMatch) this.pause();
  }

  /** AFK lokal di match online (pause / tab tersembunyi / pindah aplikasi ≥ afkAfter s) → karakter dimainkan bot; kembali →
   *  kendali langsung dikembalikan. Host: bot dipasang di entitas sendiri; klien: dilaporkan ke host. */
  private updateAfk() {
    const online = this.inMatch && ctx.net.role !== 'offline' && ctx.match.state !== 'RESULTS';
    const away = online && (this.awayTest ?? (this.paused || document.hidden || !document.hasFocus()));
    if (!away) { this.awaySince = -1; if (this.afkOn) this.setLocalAfk(false); return; }
    if (this.awaySince < 0) this.awaySince = performance.now();
    if (!this.afkOn && performance.now() - this.awaySince >= XCFG.net.afkAfter * 1000) this.setLocalAfk(true);
  }

  private setLocalAfk(on: boolean) {
    this.afkOn = on;
    blackbox.log('afk', on ? 'kamu AFK — karakter dimainkan bot' : 'kamu kembali');
    if (ctx.net.role === 'client') { this.client?.act({ a: 'afk', on }); return; }
    const p = ctx.player;
    if (!p || ctx.net.role !== 'host') return;
    if (on) {
      if (!p.bot) { p.bot = new TacticalBot(p, this.settings.difficulty, 30 + p.id); if (p.alive) p.bot.onSpawn(); }
      this.hostRep?.notice(`${p.name} AFK — dimainkan bot`);
    } else {
      if (p.bot) { p.bot.dispose(); p.bot = null; }
      ctx.camRig.yaw = p.yaw; ctx.camRig.pitch = p.pitch;   // lanjut dari arah pandang terakhir bot
      const it = p.intent; it.ix = 0; it.iz = 0; it.jump = false; it.sprint = false; it.wantFire = false;
      this.hostRep?.notice(`${p.name} kembali`);
    }
  }

  /** Screen Wake Lock: layar tidak mati & laptop tidak tidur selama match / room online (hanya saat tab terlihat — dilepas
   *  otomatis oleh browser saat tersembunyi, diminta lagi saat terlihat). */
  private async syncWakeLock() {
    const wl = (navigator as Navigator & { wakeLock?: { request(type: 'screen'): Promise<WakeLockSentinel> } }).wakeLock;
    if (!wl || this.wakeBusy) return;
    const want = (this.inMatch && ctx.net.role !== 'offline') || this.onlineRoom();
    if (want && !this.wakeLock && document.visibilityState === 'visible') {
      this.wakeBusy = true;
      try {
        const lock = await wl.request('screen');
        this.wakeLock = lock;
        lock.addEventListener('release', () => { if (this.wakeLock === lock) this.wakeLock = null; });
        blackbox.log('wake-lock', 'aktif (layar & laptop tidak tidur selama main online)', 60_000);
      } catch (err) { blackbox.log('wake-lock', 'ditolak browser: ' + String(err), 60_000); }
      this.wakeBusy = false;
    } else if (!want && this.wakeLock) {
      const lock = this.wakeLock; this.wakeLock = null;
      void lock.release().catch(() => { /* sudah dilepas */ });
    }
  }

  /** Tiket kembali ke match (sessionStorage) diperbarui selagi di room online — dipakai bila halaman ini hilang (refresh / tutup /
   *  crash). Klien: kode host sekarang (+ kode rencana pindah host). Host: kode room berikutnya (tempat teman melanjutkan). */
  private syncTicket() {
    if (this.migrating) return;   // selama pindah host tiket lama tetap berlaku
    const L = this.room, me = this.roomMe, name = L?.find(me)?.name ?? '';
    let t: Ticket | null = null;
    if (L && me && this.client?.connected) t = { code: L.code, alt: this.plan?.code ?? null, pid: me, name, t: 0, match: this.inMatch };
    else if (L && me && this.host && !this.client && this.host.connected > 0 && this.nextCode)
      t = { code: this.nextCode, alt: null, pid: me, name, t: 0, match: this.inMatch };
    if (!t) return;   // tidak di room online: tiket terakhir dibiarkan (dihapus saat keluar dengan sengaja / dipakai)
    const key = JSON.stringify(t), now = Date.now();
    if (key === this.ticketKey && now - this.ticketT < 30_000) return;
    this.ticketKey = key; this.ticketT = now;
    saveTicket({ ...t, t: now });
  }

  private setTicket(t: Ticket) { this.ticket = t; this.ticketKey = ''; saveTicket(t); }
  private dropTicket() { this.ticket = null; this.ticketKey = ''; saveTicket(null); }

  /** Menu utama → "Kembali ke match": gabung dengan pid lama (host mengembalikan slot & mengirim keadaan match terbaru). */
  private async useTicket(): Promise<string | null> {
    const t = this.ticket;
    if (!t) return null;
    const name = cleanName(t.name) || cleanName(this.settings.playerName) || 'Pemain';
    blackbox.log('kembali-ke-match', `mencoba ${t.code}${t.alt ? ' / ' + t.alt : ''} sebagai ${t.pid}`);
    let why = 'Room itu sudah tidak ada — teman-teman mungkin sudah selesai main.';
    for (const code of t.alt ? [t.code, t.alt] : [t.code]) {
      const r = await this.joinRoom(code, name, t.pid);
      if (r.ok) {
        this.dropTicket();
        // match berjalan → host langsung mengirim susunan + keadaan terbaru (layar room hanya bila ternyata tidak ada match)
        setTimeout(() => { if (!this.inMatch && this.room && !this.netHold.holding && this.menus.current === 'main') this.menus.showRoom('Kembali ke room'); },
          t.match ? 1500 : 0);
        return null;
      }
      if (r.reason === 'failed') return 'Gagal terhubung — cek internet lalu coba lagi.';
      if (r.reason === 'started') why = 'Match di room itu sedang berjalan dan slotmu sudah tidak tersedia.';
    }
    return why;
  }

  /** Klien di tengah match: host diam > stallShow s (snapshot 30 Hz biasanya) → beri tahu (dunia tampak beku); pulih → hilang.
   *  > hostSilence s → pindah host (NetClient). */
  private updateStall() {
    const c = this.client, stall = !!c && c.connected && this.inMatch && !this.migrating && c.silence > XCFG.net.stallShow;
    if (stall === this.stallShown) return;
    this.stallShown = stall;
    if (stall) this.showNetOverlay('Koneksi ke host tersendat', 'Menunggu host… bila tidak pulih, host dipindahkan otomatis & game dilanjutkan.');
    else if (!this.migrating) this.hideNetOverlay();
  }

  // ───────────────────────────────── chat teks tim & semua
  /** Tombol chat saat match: Y semua · U tim · H menu pesan cepat (angka 1–6 dipakai menu, bukan ganti senjata). */
  private chatKeys() {
    const inp = this.input, c = this.chat;
    if (c.quickOpen) {
      for (let i = 0; i < QUICK.length; i++) {
        const code = 'Digit' + (i + 1);
        if (inp.wasPressed(code)) { inp.consume(code); c.closeQuick(); this.sendQuick(i); return; }
      }
      if (inp.actPressed('quickChat')) { inp.consume(this.settings.binds.quickChat); c.closeQuick(); }
      return;
    }
    if (inp.actPressed('chatAll')) this.openChat('all');
    else if (inp.actPressed('chatTeam')) this.openChat('team');
    else if (inp.actPressed('quickChat')) c.toggleQuick(performance.now() / 1000);
  }

  private openChat(scope: ChatScope) {
    const block = this.chatBlock(scope);
    if (block) { this.chat.note(block); return; }
    this.input.clearAll();   // tombol gerak yang sedang ditahan dilepas → karakter berhenti selama mengetik
    this.chat.open(scope);
  }

  private sendQuick(i: number) {
    const q = QUICK[i], p = ctx.player;
    if (!q) return;
    this.sendChat('team', q.text(p ? currentMap().zoneName(p.pos.x, p.pos.y, p.pos.z) : ''), true);
  }

  private liveMatch() { return this.inMatch && ctx.match.state !== 'RESULTS'; }
  private chatBlock(scope: ChatScope): string | null {
    return chatAllowed(scope, this.liveMatch(), this.room?.settings.allTalk ?? true) ? null
      : 'Chat ke semua dimatikan host selama match — pakai chat tim (U)';
  }
  private rate(key: string) { let r = this.chatRate.get(key); if (!r) { r = new RateLimit(); this.chatRate.set(key, r); } return r; }

  /** Pesan pemain lokal (kotak chat / panel / pesan cepat): offline & host langsung dirutekan; klien dikirim ke host. */
  private sendChat(scope: ChatScope, raw: string, quick = false) {
    const text = cleanChatText(raw);
    if (!text) return;
    const block = this.chatBlock(scope);
    if (block) { this.chat.note(block); return; }
    if (!this.rate('').take(performance.now() / 1000)) { this.chat.note('Pelan-pelan — tunggu sebentar sebelum kirim lagi'); return; }
    if (this.client) { this.client.act({ a: 'chat', scope, text, quick }); return; }
    this.routeChat(this.room ? this.roomMe : null, null, scope, text, quick);
  }

  /** Host: chat dari teman (mentah dari jaringan) → validasi, batas laju per pemain, setelan "chat semua" → teruskan. */
  private hostChat(pid: string, scopeRaw: unknown, textRaw: unknown, quick: boolean) {
    const h = this.host, L = this.room;
    if (!h || !L || !L.find(pid)) return;
    const scope: ChatScope | null = scopeRaw === 'all' ? 'all' : scopeRaw === 'team' ? 'team' : null, text = cleanChatText(textRaw);
    if (!scope || !text) return;
    const block = this.chatBlock(scope);
    if (block) { h.sendTo(pid, { t: 'chatno', reason: block }); return; }
    if (!this.rate(pid).take(performance.now() / 1000)) { h.sendTo(pid, { t: 'chatno', reason: 'Pelan-pelan — tunggu sebentar sebelum kirim lagi' }); return; }
    this.routeChat(pid, null, scope, text, quick);
  }

  /** Entitas match milik pid (kita / teman lewat susunan match); null di luar match. */
  private entityOfPid(pid: string | null): Entity | null {
    if (!this.inMatch) return null;
    if (!pid || pid === this.roomMe) return ctx.player;
    const id = this.netStart?.ents.find(e => e.pid === pid)?.id;
    return id === undefined ? null : ctx.byId.get(id) ?? null;
  }
  private teamOfPid(pid: string): Team | null { return this.entityOfPid(pid)?.team ?? this.room?.find(pid)?.team ?? null; }
  private localTeam(): Team { return (this.inMatch ? ctx.player?.team : null) ?? this.room?.find(this.roomMe)?.team ?? ctx.player?.team ?? 'blue'; }

  /** Host / main solo: pesan ke penerimanya — setim pengirim (tim) atau semua. Pengirim = pid manusia atau bot (callout). */
  private routeChat(pid: string | null, bot: Entity | null, scope: ChatScope, text: string, quick: boolean) {
    const live = this.liveMatch();
    let name: string, team: Team, dead = false;
    if (bot) { name = bot.name; team = bot.team; dead = live && !bot.alive; }
    else {
      const pl = pid ? this.room?.find(pid) ?? null : null, ent = this.entityOfPid(pid);
      name = pl?.name ?? ent?.name ?? (cleanName(this.settings.playerName) || 'Pemain');
      team = ent?.team ?? pl?.team ?? this.localTeam();
      dead = live && !!ent && !ent.alive;
    }
    const msg = { t: 'chat', scope, name, team, text, pid: bot ? null : pid, bot: !!bot, dead, quick };
    if (chatReaches(scope, team, this.localTeam())) this.recvChat(msg);
    const h = this.host;
    if (h && !this.client) for (const rp of h.pids()) {
      const rt = this.teamOfPid(rp);
      if (rt && chatReaches(scope, team, rt)) h.sendTo(rp, msg);
    }
  }

  /** Tampilkan pesan (dari host / rute lokal): divalidasi, dibisukan dilewati, callout bot sesuai setelan, bunyi lembut. */
  private recvChat(raw: Record<string, unknown>) {
    const m = parseChat(raw);
    if (!m || (m.pid && this.muted.has(m.pid)) || (m.bot && !this.settings.chatBots)) return;
    this.chat.add(m);
    const mine = !m.bot && (this.room ? m.pid === this.roomMe : true);
    if (!mine) ctx.audio.playUi(R.chatBlip, 0.6);
  }

  /** Callout bot terucap → chat tim (hanya bila ada manusia di tim itu; dibatasi BotChatGate). Host / main solo saja. */
  private botCallout(spotterId: number, x: number, y: number, z: number) {
    if (!this.inMatch || ctx.match.state !== 'PLAYING' || ctx.net.role === 'client') return;
    const s = ctx.byId.get(spotterId);
    if (!s || !s.bot) return;
    const humans = ctx.player?.team === s.team || ctx.entities.some(e => e.team === s.team && !!e.remote && !e.remote.afk);
    if (!humans) return;
    const zone = currentMap().zoneName(x, y, z);
    if (!this.botChat.allow(s.team, zone, ctx.time)) return;
    this.routeChat(null, s, 'team', botCalloutText(zone, spotterId + Math.floor(ctx.time)), false);
  }

  private toggleMute(pid: string) { if (!this.muted.delete(pid)) this.muted.add(pid); }
  /** Teman manusia di room (untuk tombol bisukan di menu pause). */
  private chatPeople(): { pid: string; name: string; team: Team }[] {
    return this.room ? this.room.players.filter(p => p.id !== this.roomMe && !p.sim).map(p => ({ pid: p.id, name: p.name, team: p.team })) : [];
  }
  /** Room baru / keluar room: riwayat chat, bisukan & batas laju dimulai dari awal. */
  private resetChat() { this.chat.clear(); this.muted.clear(); this.chatRate.clear(); this.botChat.reset(); this.voice.reset(); }

  // ───────────────────────────────── voice chat
  /** Tahan T (tim) / Z (semua) di room & match online (bukan saat mengetik); campuran pembicara (jarak); indikator ±10 Hz. */
  private updateVoice() {
    const v = this.voice, inp = this.input;
    const online = !!this.room && (!!this.client || (!!this.host && this.host.connected > 0));
    let want: VoiceScope | null = null;
    if (online && this.settings.voice && !this.chat.typing && (document.hasFocus() || this.awayTest === false)) {
      want = inp.actDown('voiceTeam') ? 'team' : inp.actDown('voiceAll') ? 'all' : null;
      const alive = !this.liveMatch() || (ctx.player?.alive ?? true);
      if (want === 'all' && !voiceScopeOk('all', this.liveMatch(), this.room?.settings.allTalk ?? true, alive)) {
        if (inp.actPressed('voiceAll')) this.chat.note(alive ? 'Voice ke semua dimatikan host selama match — tahan T untuk tim' : 'Sudah mati: voice ke semua tidak bisa — tahan T untuk tim');
        want = null;
      }
    }
    v.talk(want);
    // status mic berubah (izin diberikan / ditolak) → beri tahu & perbarui layar room
    const ms = v.cap.state + '|' + v.cap.error;
    if (ms !== this.micSeen) {
      this.micSeen = ms;
      if (v.cap.state === 'error' && v.cap.error) this.chat.note('🎙 ' + v.cap.error);
      this.menus.refreshRoom();
    }
    v.update();
    const now = performance.now();
    if (now - this.voiceUiT > 100) { this.voiceUiT = now; this.paintTalk(); }
  }

  /** Indikator bicara: HUD (match) = kita + teman SETIM yang terdengar; room = ikon di baris pemain. */
  private paintTalk() {
    const v = this.voice, talkers = v.talkers(), me = v.speaking, myTeam = this.localTeam();
    const rows: [string, string][] = [];
    if (this.inMatch) {
      if (me) rows.push(['me', `🎙 Kamu → ${me === 'team' ? 'TIM' : 'SEMUA'}`]);
      for (const t of talkers) {
        if (this.teamOfPid(t.pid) !== myTeam) continue;   // suara musuh (Z) terdengar, namanya tidak ditampilkan
        rows.push(['', `🎙 ${this.room?.find(t.pid)?.name ?? 'Teman'}${t.all ? ' (semua)' : ''}`]);
      }
    }
    const key = rows.map(r => r.join(':')).join('|');
    if (key !== this.talkKey) {
      this.talkKey = key;
      this.talkEl.replaceChildren(...rows.map(([c, t]) => { const d = document.createElement('div'); if (c) d.className = c; d.textContent = t; return d; }));
    }
    const on = new Set(talkers.map(t => t.pid));
    if (me) on.add(this.roomMe);
    this.menus.updateTalking(on);
  }

  private showNetOverlay(title: string, text: string) {
    let el = document.getElementById('net-overlay');
    if (!el) { el = document.createElement('div'); el.id = 'net-overlay'; document.body.appendChild(el); }
    el.innerHTML = `<div class="gr-t"></div><div class="gr-s"></div>`;
    (el.querySelector('.gr-t') as HTMLElement).textContent = title;
    (el.querySelector('.gr-s') as HTMLElement).textContent = text;
    el.classList.remove('hidden');
  }
  private hideNetOverlay() { document.getElementById('net-overlay')?.classList.add('hidden'); }

  // ───────────────────────────────── pemulihan grafis (konteks WebGL hilang → pulih di tempat, bukan muat ulang)
  /** Konteks hilang: simulasi tetap jalan (host: room & teman aman); layar "Memulihkan grafis…"; > 10 s → tombol muat ulang. */
  private onGfxLost() {
    this.gfxLostAt = performance.now();
    blackbox.log('grafis-hilang', `konteks WebGL hilang${this.inMatch ? ` di tengah match (peran ${ctx.net.role})` : ''}`);
    const el = this.gfxOverlay();
    el.innerHTML = '<div class="gr-t">Memulihkan grafis…</div><div class="gr-s">Game tetap berjalan — biasanya hanya beberapa detik.</div>';
    el.classList.remove('hidden');
    clearTimeout(this.gfxTimer);
    this.gfxTimer = window.setTimeout(() => {
      if (!this.engine.contextLost) return;
      blackbox.log('grafis-hilang', `belum pulih setelah ${XCFG.gfx.recoverWaitS} s`);
      const host = ctx.net.role === 'host' || (!!this.host && this.host.connected > 0);
      el.innerHTML = '<div class="gr-t">Grafis belum pulih</div><div class="gr-s">Browser belum mengembalikan akses ke GPU.'
        + (host ? ' Kamu host — memuat ulang akan memutus semua teman di room.' : '') + '</div>'
        + '<button data-a="gr-reload">Muat ulang halaman</button>';
      el.querySelector('button')?.addEventListener('click', () => {
        this.allowUnload = true; blackbox.closing('grafis tidak pulih — dimuat ulang oleh pemain'); location.reload();
      });
      // mouse masih terkunci ke game (pointer lock): klik tidak akan sampai ke tombol & kursor tak terlihat → lepas kuncinya
      this.input.exitLock();
    }, XCFG.gfx.recoverWaitS * 1000);
  }

  /** Konteks pulih: three.js sudah membangun ulang state GL (listener-nya terpasang lebih dulu) → tangkap ulang peta lingkungan
   *  (render target GPU ikut hilang) + kompilasi ulang shader lewat applyVisual. Match/room tidak tersentuh. */
  private onGfxRestored() {
    clearTimeout(this.gfxTimer);
    const ms = Math.round(performance.now() - this.gfxLostAt);
    try {
      if (this.engine.gfx.env && this.loadedId) this.recaptureEnvironment();
      this.applyVisual();
      blackbox.log('grafis-pulih', `dipulihkan di tempat setelah ${ms} ms (tanpa muat ulang)`);
    } catch (err) {
      console.error('[grafis] pemulihan gagal', err);
      blackbox.log('error', 'pemulihan grafis: ' + String(err));
    }
    this.gfxOverlay().classList.add('hidden');
  }

  private gfxOverlay(): HTMLElement {
    let el = document.getElementById('gfx-recover');
    if (!el) { el = document.createElement('div'); el.id = 'gfx-recover'; el.className = 'hidden'; document.body.appendChild(el); }
    return el;
  }

  /** Kotak hitam: cuplikan performa tiap 60 s selama match (FPS, memori JS, sumber daya GPU, teman tersambung). */
  private bbPerf() {
    this.bbFrames++;
    const t = performance.now(), span = t - this.bbPerfT;
    if (span < 60_000) return;
    const mem = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
    const info = this.engine.renderer.info.memory;
    blackbox.log('perf', `${Math.round(this.bbFrames * 1000 / span)} fps · memori JS ${mem ? Math.round(mem.usedJSHeapSize / 1048576) + ' MB' : '?'}`
      + ` · geometri ${info.geometries} · tekstur ${info.textures}` + (ctx.net.role === 'host' ? ` · teman ${this.host?.connected ?? 0}` : ''));
    this.bbPerfT = t; this.bbFrames = 0;
  }

  /** Peta lingkungan ditangkap ulang TANPA karakter & balok tubuh (sama seperti saat memuat map, sebelum ada entitas). */
  private recaptureEnvironment() {
    const hidden: THREE.Object3D[] = [];
    const hide = (o: THREE.Object3D) => { if (o.visible) { o.visible = false; hidden.push(o); } };
    for (const e of ctx.entities) hide(e.char.root);
    hide(ctx.deathFx.root);
    try {
      try { this.envRT?.dispose(); } catch { /* sumber daya GPU lama sudah hilang bersama konteks */ }
      this.envRT = null; this.envTex = null;
      this.captureEnvironment(currentMap());
    } finally { for (const o of hidden) o.visible = true; }
  }

  /** Terapkan pengaturan tampilan/kontrol yang tidak butuh muat ulang. */
  /** Debu & berkas cahaya (waktu shader). */
  private updateAtmosphere() {
    const t = ctx.time, map = ctx.map;
    if (map.dust) {
      const u = (map.dust.material as THREE.ShaderMaterial).uniforms;
      u.uTime.value = t;
      const cam = this.engine.camera, h = this.engine.renderer.getDrawingBufferSize(this._buf).y;
      u.uScale.value = (h / 2) / Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2);
    }
    if (map.shafts) (map.shafts.material as THREE.ShaderMaterial).uniforms.uTime.value = t;
    const h = this.engine.renderer.getDrawingBufferSize(this._buf).y;
    ctx.vfx.setViewScale((h / 2) / Math.tan(THREE.MathUtils.degToRad(this.engine.camera.fov) / 2));
  }
  private _buf = new THREE.Vector2();

  /** Peta lingkungan dari map itu sendiri (sekali saat memuat map) → pantulan PBR & cahaya lingkungan realistis.
   *  Posisi = MapDef.envProbe; tanpa kabut (sama seperti saat boot); luar ruang: jarak pandang jauh agar langit ikut. */
  private captureEnvironment(def: MapDef) {
    const r = this.engine.renderer, scene = this.engine.scene;
    const crt = new THREE.WebGLCubeRenderTarget(128, { type: THREE.HalfFloatType });
    const cam = new THREE.CubeCamera(0.3, def.atmosphere.outdoor ? 2000 : 220, crt);
    cam.position.set(def.envProbe[0], def.envProbe[1], def.envProbe[2]);
    const fog = scene.fog; scene.fog = null;
    scene.add(cam); cam.update(r, scene); scene.remove(cam);
    scene.fog = fog;
    const pm = new THREE.PMREMGenerator(r);
    this.envRT = pm.fromCubemap(crt.texture);
    this.envTex = this.envRT.texture;
    pm.dispose(); crt.dispose();
  }

  private applyVisual() {
    const s = this.settings;
    ctx.hud.applyCrosshair(s);
    // efek grafik (tersedia sesuai preset; saklar di Pengaturan → Grafik)
    const gfx = this.engine.gfx, sc = this.engine.scene;
    sc.fog = gfx.fog && s.gfxFog ? this.fog : null;
    const env = gfx.env && s.gfxReflect ? this.envTex : null;
    sc.environment = env; sc.environmentIntensity = XCFG.gfx.light.envIntensity;
    this.engine.vmScene.environment = env; this.engine.vmScene.environmentIntensity = XCFG.gfx.light.envIntensity;
    this.engine.post?.setBloom(s.gfxBloom); this.engine.post?.setSsao(s.gfxSsao);
    const bl = currentMap().atmosphere.bloom ?? XCFG.gfx.bloom;
    this.engine.post?.setBloomTuning(bl.threshold, bl.strength);
    if (ctx.map.dust) ctx.map.dust.visible = s.gfxDust;
    if (ctx.map.shafts) ctx.map.shafts.visible = s.gfxDust;
    ctx.map.sun.intensity = this.baseLight.sun * s.brightness;
    ctx.map.hemi.intensity = this.baseLight.hemi * s.brightness;
    ctx.camRig.shakeScale = s.shake / 100;
    ctx.viewmodel.bobScale = s.shake / 100;
    if (this.loop) this.loop.capDiv = s.fpsCap;                  // batas FPS rata (pembagi refresh layar)
    const dr = this.engine.dynRes;
    dr.enabled = s.renderScale === 0;
    if (!dr.enabled) dr.scale = s.renderScale; else dr.scale = Math.min(dr.scale, 1);
    dr.apply();
    this.input.binds = s.binds;
    this.minimap.setVisible(s.minimap);
    ctx.debug.dmgNumbers = s.dmgNumbers || (this.inMatch && this.mode === 'practice');
    // kompilasi shader sekarang (kabut/pantulan sudah final), bukan saat efek pertama kali muncul di tengah match
    this.engine.warmup(ctx.entities.map(e => e.char.debrisMaterial));
  }

  private setLoadout(w: WeaponId, s: ScopeId, v: Variant) {
    this.settings.weapon = w; this.settings.scope = s; this.settings.charVariant = v; saveSettings(this.settings);
    // room: host mencatat & menyiarkan; klien mengirim ke host (di tengah match: berlaku pada spawn berikutnya)
    const me = this.room?.find(this.roomMe);
    if (this.client) this.client.act({ a: 'loadout', weapon: w, scope: s, variant: v });
    else if (me) { me.weapon = w; me.scope = s; me.variant = v; this.host?.broadcastLobby(); }
    if (ctx.player) {
      ctx.player.pendingLoadout = { weapon: w, scope: s }; // senjata berlaku pada spawn berikutnya
      ctx.player.char.setVariant(v);                       // tampilan karakter langsung (kosmetik)
      ctx.viewmodel.setOutfit(ctx.player.team, v);
    }
  }

  private onKey(code: string) {
    if (code === 'F3') this.stats.toggle();
    if (code === 'Backquote') { this.debugPanel.toggle(); if (this.debugPanel.visible) this.input.exitLock(); }
    if (!this.inMatch) return;
    if (code === 'Escape') {
      if (this.input.locked && this.input.keyboardLocked) this.input.exitLock();
      else if (!this.input.locked && !this.paused && !this.menus.open && ctx.match.state !== 'RESULTS') this.pause();
    }
  }

  private onPadButton(i: number) {
    if (i === PAD.START && this.inMatch && ctx.match.state !== 'RESULTS') { if (this.paused) this.resume(); else this.pause(); }
  }

  private openLoadoutInMatch() {
    this.paused = true; this.input.exitLock(); this.input.clearAll();
    this.menus.showLoadout(() => this.resume(), true);
  }

  // ───────────────────────────────── fixed step 60 Hz (§2.6)
  private fixedUpdate(dt: number) {
    ctx.fixedIndex++;
    const p = ctx.player, inp = this.input, role = ctx.net.role;
    const control = this.inMatch && !this.paused && inp.captured && !ctx.match.locked && !ctx.debug.noclip && !this.chat.typing;
    // 1. PlayerController: input → kecepatan → KCC
    if (p) {
      const it = p.intent;
      if (control && p.alive) {
        it.ix = inp.moveX; it.iz = inp.moveZ;
        it.jump = this.jumpLatch;
        if (this.jumpLatch) this.crouchToggled = false;
        if (this.padSprint && it.iz < 0.3) this.padSprint = false;
        it.sprint = inp.actDown('sprint') || this.padSprint;
        const ctrlHold = inp.ctrlAllowed && inp.isDown('ControlLeft');
        it.crouch = (this.settings.crouchToggle ? this.crouchToggled : inp.actDown('crouch')) || ctrlHold;
        it.cooking = p.grenadeState === 'COOKING';
        it.wantFire = p.weapon.slot === 'ar' && inp.mouseDown[0] && p.meleeT < 0;
      } else { it.ix = 0; it.iz = 0; it.jump = false; it.sprint = false; it.wantFire = false; }
      it.speedMult = p.weapon.slot === 'knife' ? XCFG.knife.speedMult : 1; // pisau: lari lebih cepat
      this.jumpLatch = false;
      it.yaw = p.yaw;
      if (this.clientRep) this.cmd = this.clientRep.command(it, p);   // klien: niat dikuantisasi persis seperti yang diterima host
    }
    // host online: perintah pemain remote → niat gerak (senjatanya setelah world.step, seperti prediksi di klien)
    this.hostRep?.fixedRemote(dt);
    // Latihan: target bergerak bolak-balik ±5 u
    for (const [e, dir] of this.movers) {
      if (!e.alive || !e.dummyAt) continue;
      const dx = e.pos.x - e.dummyAt.x;
      const d = dx > XCFG.practice.moverRange ? -1 : dx < -XCFG.practice.moverRange ? 1 : dir;
      this.movers.set(e, d);
      e.intent.ix = d; e.intent.iz = 0; e.intent.yaw = e.yaw; // Merah yaw 0: kanan = +X
    }
    // 2. gerak bot (+ think 10 Hz bergiliran: bot ke-i pada indeks fixed step (i mod 6))
    for (const e of ctx.entities) {
      if (e.bot) {
        if ((ctx.fixedIndex + e.bot.index) % XCFG.bots.thinkEveryFixedSteps === 0 && !ctx.match.locked) e.bot.think();
        e.bot.fixedUpdate(dt);
      }
      if (!e.alive || e.puppet) continue;                // boneka (klien): posisi dari snapshot host
      if (e.remote?.frozen && !e.bot) e.ctrl.hold();     // host: perintah remote belum tiba → ditahan (AFK/terputus: bot yang menggerakkan)
      else e.ctrl.fixedUpdate(dt, e.intent, e.weapon.adsActive);
    }
    // 3. timer sumbu granat → world.step() → props, mayat
    ctx.grenades.fixedUpdate(dt);
    physics.world.step();
    ctx.grenades.postStep(); ctx.drops.postStep();
    this.hostRep?.afterStep();                                              // senjata remote + snapshot 20 Hz
    if (this.clientRep && this.cmd && p) this.clientRep.afterStep(this.cmd, p);   // simpan prediksi + kirim perintah
    ctx.props.fixedUpdate(dt);
    ctx.deathFx.fixedUpdate(dt);
    if (this.inMatch) {
      const st = ctx.match.state;
      if (role === 'client') { for (const e of ctx.entities) if (!e.alive && e.respawnT > 0) e.respawnT -= dt; }   // tampilan saja: spawn dari host
      else ctx.spawns.update(dt, (st === 'PLAYING' || st === 'COUNTDOWN') && ctx.match.mode !== 'elim'); // Eliminasi: tanpa respawn dalam ronde
      this.killcam.record();
    }
    // regenerasi HP (opsi config, default mati)
    if (CFG.player.healthRegen && role !== 'client' && p && p.alive && p.hp < CFG.player.hp && ctx.time - p.lastDamageT > XCFG.player.regenDelay)
      p.hp = Math.min(CFG.player.hp, p.hp + XCFG.player.regenRate * dt);
    this.updateStress(dt);
  }

  // ───────────────────────────────── per frame (§2.6)
  private update(dt: number, alpha: number, rawDt: number) {
    ctx.time += dt;
    if (this.inMatch) { this.bbPerf(); if (ctx.net.role !== 'offline') this.updateAfk(); }
    this.updateStall();
    const p = ctx.player, rig = ctx.camRig, inp = this.input, cam = this.engine.camera;
    if (this.slowmoEnd && performance.now() > this.slowmoEnd) { this.slowmoEnd = 0; this.loop.timeScale = 1; }
    if (this.menus.open && inp.padActive) this.menus.padNav(inp.pad);
    const cr = this.clientRep;
    cr?.update(dt);   // klien: pemain lain & granat di posisi interpolasi snapshot host
    // posisi render terinterpolasi + yaw
    for (const e of ctx.entities) {
      if (!e.alive) continue;
      e.renderPos.lerpVectors(e.ctrl.prevPos, e.ctrl.pos, alpha);
      if (cr && e === p) e.renderPos.add(cr.smooth);   // klien: koreksi prediksi dihaluskan (visual), kamera ikut
      e.char.root.position.copy(e.renderPos);
      e.char.root.rotation.y = e.yaw;
      e.char.root.updateMatrixWorld(true);
    }
    const looking = this.inMatch && !this.paused && inp.captured && ctx.match.state !== 'RESULTS';
    let kcCam = false;
    // 1. kamera: mouse-look (yaw −= dx·k, pitch −= dy·k) + stik kanan gamepad, recoil, FOV
    if (this.inMatch && p) {
      if (looking) {
        const sm = ctx.scope.sensMult(p, this.settings.fov, this.settings.adsMult), inv = this.settings.invertY ? -1 : 1;
        const k = this.settings.sens * CFG.camera.sensBaseRadPerPx * sm;
        let dYaw = -inp.dx * k, dPitch = -inp.dy * k * inv;
        if (inp.padActive) {
          const P = XCFG.pad, rx = inp.pad.rx, ry = inp.pad.ry, m = Math.hypot(rx, ry);
          if (m > 0) {
            const curve = Math.pow(m, P.curve) / m; // kurva respons: presisi di defleksi kecil
            const rate = D2R(P.lookDegPerSec) * this.settings.padSens * sm * (this.nameplates.aimedEnemy ? P.aimSlow : 1) * rawDt;
            dYaw -= rx * curve * rate; dPitch -= ry * curve * rate * inv;
          }
        }
        if (ctx.debug.noclip) rig.addLook(dYaw, dPitch);
        else if (p.alive) { p.recoil.onMouseLook(R2D(dPitch)); rig.addLook(dYaw, dPitch); }
      }
      if (p.alive && p.bot) { rig.yaw = p.yaw; rig.pitch = p.pitch; }   // AFK: bot yang membidik, kamera mengikutinya
      else if (p.alive) {
        const rec = p.recoil.update(dt, ctx.time, p.weapon.def); // pemulihan sadar-kompensasi
        if (rec) rig.addLook(0, D2R(rec));
        p.yaw = rig.yaw; p.pitch = rig.pitch;
        if (looking) {
          if (inp.actPressed('view')) rig.toggleView();
          if (inp.actPressed('shoulder')) rig.swapShoulder();
          if (inp.actPressed('crouch') && this.settings.crouchToggle && !ctx.match.locked) this.crouchToggled = !this.crouchToggled;
          if (inp.padActive && inp.pad.pressed(PAD.L3)) this.padSprint = !this.padSprint;
          if (inp.actPressed('loadout') && ctx.match.state !== 'RESULTS') this.openLoadoutInMatch();
        }
      }
      ctx.scope.update(dt, p, rig, this.settings.fov);
      this.camMotion(p, alpha);
      kcCam = !p.alive && this.killcam.controlsCamera && !ctx.debug.noclip;
      if (ctx.debug.noclip) { this.noclip(rawDt); rig.update(dt, this.noclipPos, 0, 0, 1, cam); }
      else if (kcCam) { /* kamera diatur killcam setelah animasi */ }
      else if (!p.alive && this.mode === 'elim' && this.spectate(dt, cam)) { /* menonton rekan */ }
      else rig.update(dt, p.alive ? p.renderPos : this.deathCamFeet(p), p.ctrl.eyeHeight, p.ctrl.crouchT, ctx.scope.armScale(p), cam);
      cam.layers.enable(0);
      if (rig.isFpsView && !ctx.debug.noclip && !kcCam && !this.specTarget) cam.layers.disable(1); else cam.layers.enable(1);
    } else this.menuCamera(dt, cam);

    // chat: Y semua / U tim / H pesan cepat lalu 1–6 (sebelum senjata: angka di menu pesan cepat tidak mengganti senjata)
    if (looking && !this.chat.typing) this.chatKeys();
    this.chat.update(performance.now() / 1000);
    this.updateVoice();
    // 2. senjata pemain (selama mengetik chat: tidak menembak; mouse-look tetap)
    if (p && this.inMatch && !p.bot) this.playerWeapon(dt, looking && !this.chat.typing);   // AFK: senjata digerakkan bot (loop bot di bawah)
    // 3. bot: bidik per frame + keputusan tembak
    for (const e of ctx.entities) if (e.bot) e.bot.update(dt);
    // 4. senjata, granat & melee semua bot
    if (!ctx.match.locked) for (const e of ctx.entities) {
      if (!e.alive) continue;
      if (e.bot) {
        if (e.bot.wantMelee) { e.bot.wantMelee = false; startMelee(e); }
        const tr = e.bot.trigger;
        if (e.meleeT >= 0) { tr.held = false; tr.pressed = false; }
        tr.sprinting = e.ctrl.sprinting;
        e.weapon.update(dt, ctx.time, tr, () => fireOne(e));
        ctx.grenades.handle(e, e.bot.gIn, dt);
        updateMelee(e, dt);
      } else if (this.stress?.shooters.includes(e)) this.dummyWeapon(e, dt);
    }
    // 5. animasi rig
    for (const e of ctx.entities) {
      if (!e.alive) continue;
      const a = this.anim, c = e.ctrl;
      // probe cahaya (medan bake): karakter lebih gelap di arsip/bawah balkon, lebih terang & hangat di bawah skylight
      ctx.map.light.sample(e.renderPos.x, e.renderPos.y + 3, e.renderPos.z, this.probe);
      e.char.setProbe(this.probe.sky, this.probe.bounce);
      a.speed = c.speedH; a.sprinting = c.sprinting; a.crouchT = c.crouchT; a.airborne = !c.grounded; a.pitch = e.pitch;
      a.reload = e.weapon.reloadProgress; a.throwPose = this.throwPose(e); a.lowReady = c.sprinting; a.melee = buttProgress(e);
      a.held = heldOf(e.weapon.slot, e.weapon.hasPrimary, e.grenadeState); a.knife = knifeProgress(e); a.knifeStab = e.meleeKind === 'stab';
      a.knifeAlt = e.slashAlt;
      a.vx = c.vel.x; a.vz = c.vel.z; a.yaw = e.yaw; a.stepPhase = THREE.MathUtils.lerp(c.prevStepPhase, c.stepPhase, alpha);
      e.char.update(dt, a);
    }
    // host: riwayat hitbox untuk lag compensation (label waktu = tick host yang sedang digambar, sama dengan acuan klien)
    this.hostRep?.frame(ctx.fixedIndex - 1 + alpha);
    // 6. viewmodel, killcam, VFX, audio, HUD
    const replay = this.killcam.replaying;
    if (p && this.inMatch && !replay) {
      const vmOn = p.alive && rig.isFpsView && !ctx.scope.lensOn && !ctx.debug.noclip && ctx.match.state !== 'RESULTS';
      ctx.viewmodel.setVisible(vmOn);
      this.engine.showViewmodel = vmOn;
      if (vmOn) {
        const fi = CFG.player.footstepInterval, cm = rig.motion;
        ctx.viewmodel.update(dt, { ads: ctx.scope.ads, sprint: p.ctrl.sprinting, reload: p.weapon.reloadProgress,
          speed: p.ctrl.speedH, stepInterval: p.ctrl.crouched ? fi.crouch : p.ctrl.sprinting ? fi.sprint : fi.normal,
          grounded: p.ctrl.grounded, mouseDx: looking ? inp.dx : 0, mouseDy: looking ? inp.dy : 0,
          held: heldOf(p.weapon.slot, p.weapon.hasPrimary, p.grenadeState), melee: buttProgress(p), knife: knifeProgress(p),
          knifeStab: p.meleeKind === 'stab', knifeAlt: p.slashAlt, equip: p.weapon.equipFrac, cooking: p.grenadeState === 'COOKING', overhand: p.throwOver,
          vx: cm.localVx, vz: this.localVz, vy: p.ctrl.velY, stepPhase: cm.stepPhase });
      }
    } else if (!replay) this.engine.showViewmodel = false;
    if (p && this.inMatch && !p.alive && this.killcam.active) {
      if (replay && looking && (inp.mousePressed[0] || inp.actPressed('jump'))) this.killcam.skip();
      this.killcam.update(dt, cam);
    }
    ctx.vfx.update(dt);
    this.updateAtmosphere();
    if (this.punchAt > 0 && ctx.time >= this.punchAt) {
      this.punchAt = 0;
      const P = XCFG.knife.punch, s = this.punchAlt ? -1 : 1;
      if (this.punchKind === 'stab') ctx.camRig.punch(0, P.stabPitch, 0, P.stabFov);
      else ctx.camRig.punch(P.slashYaw * s, P.slashPitch, P.slashRoll * s);
    }
    // benda fisika (60 Hz) diinterpolasi ke frame render - tanpa ini terlihat patah-patah di layar 90/120/144 Hz
    ctx.grenades.update(alpha);
    ctx.drops.update(dt, alpha);
    ctx.props.update(alpha);
    ctx.deathFx.update(alpha);
    ctx.audio.updateListener(cam);
    if (this.inMatch) {
      const sp = p ? spreadDeg(p.weapon.adsActive, p.airborne, p.ctrl.speedH > CFG.combat.spread.movingSpeed, p.crouched) : 0;
      ctx.hud.spectating = this.specTarget;
      ctx.hud.update(rawDt, p, sp, inp.actDown('scoreboard') && looking);
      const rep = this.killcam.replaying;
      this.minimap.setVisible(this.settings.minimap && !rep);
      if (!rep) this.minimap.update(this.specTarget ?? p, rig.yaw, p);
      this.nameplates.update(rawDt, cam, rep ? null : p, this.settings.nameplates, this.specTarget);
      this.heartbeat(rawDt, p);
      this.countdownBeeps();
      ctx.match.update(dt, rawDt);
    }
    this.debugPanel.update(rawDt, cam);
    this.stats.update(rawDt);
    this.perf.sample(this.loop.lastFrameMs, this.engine.renderer.info.render.calls, this.engine.renderer.info.render.triangles,
      ctx.props.awakeCount + ctx.deathFx.activeBodies);
    this.engine.dynRes.update(rawDt);
  }

  private render() {
    this.engine.render();
    ctx.hud.snapFlash(this.engine.renderer.domElement);   // "bayangan" layar saat kena flash (salin kanvas tepat setelah render)
  }

  /** Kecepatan maju lokal kamera (u/s) untuk inersia viewmodel. */
  private localVz = 0;
  /** Waktu CPU frame (awal beginFrame → akhir endFrame, termasuk submit render) untuk overlay F3. */
  private frameT0 = 0;
  private cpuMs = 0;

  /** Isi keadaan gerak pemain untuk efek kamera/viewmodel (nol saat mati, noclip, atau menonton rekan). */
  private camMotion(p: Entity, alpha: number) {
    const m = ctx.camRig.motion, c = p.ctrl, T = moveFeel.tempo, S = CFG.player.speed;
    m.walkSpeed = S.forward * T; m.sprintSpeed = S.sprint * T; m.strafeSpeed = S.strafe * T;
    m.ads = ctx.scope.ads;
    if (!p.alive || ctx.debug.noclip || this.specTarget) { m.speed = 0; m.localVx = 0; this.localVz = 0; m.grounded = true; return; }
    const yaw = ctx.camRig.yaw, sy = Math.sin(yaw), cy = Math.cos(yaw);
    m.speed = c.speedH; m.grounded = c.grounded;
    m.localVx = c.vel.x * cy - c.vel.z * sy;          // · kanan (cos yaw, 0, −sin yaw)
    this.localVz = -c.vel.x * sy - c.vel.z * cy;      // · maju (−sin yaw, 0, −cos yaw)
    m.stepPhase = THREE.MathUtils.lerp(c.prevStepPhase, c.stepPhase, alpha);
  }

  /** Eliminasi: setelah mati (dan killcam selesai) kamera TPS mengikuti rekan hidup; klik kiri / Spasi = ganti rekan. */
  private spectate(dt: number, cam: THREE.PerspectiveCamera): boolean {
    const p = ctx.player!, rig = ctx.camRig, inp = this.input;
    const mates = ctx.entities.filter(e => e.alive && e.team === p.team && e !== p);
    if (!mates.length) { this.specTarget = null; return false; }
    if (this.specTarget && !mates.includes(this.specTarget)) this.specTarget = null;
    const cycle = !this.paused && inp.captured && (inp.mousePressed[0] || inp.actPressed('jump'));
    if (!this.specTarget || cycle) {
      const i = this.specTarget ? mates.indexOf(this.specTarget) : -1;
      this.specTarget = mates[(i + 1) % mates.length];
      if (this.specSavedMode === null) { this.specSavedMode = rig.mode; rig.mode = 'tps'; }
      rig.yaw = this.specTarget.yaw; rig.pitch = this.specTarget.pitch;
    }
    const t = this.specTarget, k = 1 - Math.exp(-10 * dt);
    rig.yaw += wrapA(t.yaw - rig.yaw) * k;
    rig.pitch += (t.pitch - rig.pitch) * k;
    rig.clampPitch();
    rig.update(dt, t.renderPos, t.ctrl.eyeHeight, t.ctrl.crouchT, 1, cam);
    return true;
  }

  private heartbeat(dt: number, p: Entity | null) {
    if (!p || !p.alive || p.hp >= XCFG.heartbeat.hp || ctx.match.locked || this.paused) { this.heartT = 0; return; }
    if ((this.heartT -= dt) <= 0) { this.heartT = XCFG.heartbeat.interval; ctx.audio.playOwn(R.heartbeat, 0.6); }
  }

  private countdownBeeps() {
    const m = ctx.match;
    if (m.state !== 'COUNTDOWN') { this.lastCount = -1; return; }
    const c = Math.ceil(m.countdown);
    if (c > 0 && c !== this.lastCount) { this.lastCount = c; ctx.audio.playUi(R.countBeep(false), 0.8); }
  }

  // ───────────────────────────────── input senjata/granat/melee pemain
  /** Tombol pemain lokal → ActionFrame → aturan senjata bersama (PlayerActions, juga dipakai host untuk pemain remote).
   *  Klien online: tombol yang sama dikemas ke perintah tick berikutnya (impuls dikumpulkan sampai terkirim). */
  private playerWeapon(dt: number, looking: boolean) {
    const p = ctx.player!, inp = this.input, w = p.weapon, f = this.frame;
    const active = looking && p.alive && !ctx.match.locked && !ctx.debug.noclip;
    const online = ctx.net.role !== 'offline';
    // senjata tim sendiri di dekat kaki → prompt ambil/tukar (E; gamepad X mengambil alih fungsi reload saat itu) — offline saja
    const near = !online && p.alive && p.grenadeState === 'NONE' ? ctx.drops.nearestFor(p) : null;
    const padPick = active && !!near && inp.padActive && inp.pad.pressed(PAD.X);
    f.lP = inp.mousePressed[0]; f.lH = inp.mouseDown[0]; f.lR = inp.mouseReleased[0];
    f.rP = inp.mousePressed[2]; f.rH = inp.mouseDown[2]; f.rR = inp.mouseReleased[2];
    f.aimHold = active && f.rH;
    f.reload = inp.actPressed('reload') && !padPick; f.fireMode = inp.actPressed('fireMode'); f.melee = inp.actPressed('melee');
    // slot: 1 senjata utama · 2 pisau · 3 granat · Q / gamepad Y senjata sebelumnya · scroll siklus · D-pad ↓ pisau
    f.slot = inp.actPressed('primary') ? 'ar' : inp.actPressed('knife') ? 'knife' : inp.actPressed('grenade') ? 'grenade'
      : inp.actPressed('flash') ? 'flash' : null;
    // gamepad: RB sekali = K-400, RB dua kali cepat = flashbang
    if (inp.padActive && inp.pad.pressed(PAD.RB)) {
      const now = performance.now();
      if (now - this.rbAt < XCFG.flash.padDoubleTap * 1000) { f.slot = 'flash'; this.rbAt = -1e9; } else this.rbAt = now;
    }
    f.last = inp.actPressed('lastWeapon'); f.wheel = inp.wheel;
    const res = driveWeapons(p, f, dt, { active, adsMode: this.settings.adsToggle ? 'toggle' : 'hold', practice: this.mode === 'practice' },
      this.trig, this.gIn);
    if (res.meleeStarted) this.padSprint = false;
    ctx.hud.pickup = near;
    const cr = this.clientRep;
    if (cr) {
      cr.held = (active && f.lH ? H.FIRE : 0) | (active && f.rH ? H.ALT : 0) | (p.adsWanted ? H.AIM : 0);
      let imp = (f.lR ? I.FIRE_R : 0) | (f.rR ? I.ALT_R : 0);
      if (active) {
        imp |= (f.lP ? I.FIRE_P : 0) | (f.rP ? I.ALT_P : 0) | (f.reload ? I.RELOAD : 0) | (f.fireMode ? I.FIREMODE : 0) | (f.melee ? I.MELEE : 0)
          | (f.slot === 'ar' ? I.SLOT_AR : f.slot === 'knife' ? I.SLOT_KNIFE : f.slot === 'grenade' ? I.SLOT_NADE : f.slot === 'flash' ? I.SLOT_FLASH : 0)
          | (f.last ? I.LAST : 0) | (f.wheel > 0 ? I.WHEEL_UP : f.wheel < 0 ? I.WHEEL_DN : 0);
      }
      cr.imp |= imp;
    }
    if (!p.alive || ctx.match.locked) return;
    // G: buang senjata utama (saat dipegang); E / gamepad X: ambil atau tukar senjata TIM SENDIRI
    if (active && inp.actPressed('drop')) {
      if (online) ctx.hud.toast('Buang / ambil senjata belum tersedia saat main online');
      else if (res.gun && !res.meleeing) { if (ctx.drops.drop(p)) p.adsWanted = false; }
      else if (w.slot !== 'ar') ctx.hud.toast('Hanya senjata utama yang bisa dibuang');
    }
    if (near && !res.meleeing && (padPick || (active && inp.actPressed('pickup')))) { ctx.drops.pickup(p, near); p.adsWanted = false; }
    ctx.viewmodel.setWeapon(p.loadout.weapon, p.loadout.scope); // no-op bila loadout tidak berubah
  }

  private throwPose(e: Entity): number {
    const over = e.throwOver;
    if (e.grenadeState === 'COOKING') return D2R(over ? XCFG.anim.throwOverPull : XCFG.anim.throwUnderPull);
    if (e.throwAnimT >= 0) {
      const A = XCFG.anim, from = D2R(over ? A.throwOverPull : A.throwUnderPull), to = D2R(over ? A.throwOverSwing : A.throwUnderSwing);
      const t = e.throwAnimT;
      if (t < A.throwSwingTime) return THREE.MathUtils.lerp(from, to, t / A.throwSwingTime);
      if (t < A.throwSwingTime + A.throwReturnTime) return THREE.MathUtils.lerp(to, D2R(90) + e.pitch, (t - A.throwSwingTime) / A.throwReturnTime);
    }
    return NaN;
  }

  /** Setelah mati tanpa killcam: kamera tetap di posisi terakhir. */
  private deathCamFeet(p: Entity) { return _w.copy(p.ctrl.pos); }

  private menuCamera(dt: number, cam: THREE.PerspectiveCamera) {
    this.menuT += dt * XCFG.menu.orbitSpeed;
    const M = currentMap().menuCam;
    cam.position.set(M.look[0] + Math.sin(this.menuT) * M.rx, M.y, M.look[2] + Math.cos(this.menuT) * M.rz);
    cam.lookAt(M.look[0], M.look[1], M.look[2]);
    cam.layers.enableAll();
    if (cam.fov !== CFG.camera.baseFov) { cam.fov = CFG.camera.baseFov; cam.updateProjectionMatrix(); }
  }

  // ───────────────────────────────── debug: noclip, dummy, stress test
  private setNoclip(on: boolean) {
    const p = ctx.player;
    if (on) { this.noclipPos.copy(ctx.camRig.position); if (p) p.ctrl.setEnabled(false); }
    else if (p && p.alive) p.ctrl.setEnabled(true);
  }

  private noclip(dt: number) {
    const inp = this.input, rig = ctx.camRig, sp = (inp.actDown('sprint') ? 40 : 14) * dt;
    rig.forward(_v); rig.right(_w);
    this.noclipPos.addScaledVector(_v, sp * inp.moveZ).addScaledVector(_w, sp * inp.moveX);
    if (inp.actDown('jump')) this.noclipPos.y += sp;
    if (inp.actDown('crouch')) this.noclipPos.y -= sp;
  }

  /** Dummy R6 di jembatan pada jarak 10/40/70 u dari mulut jembatan Barat-Selatan; pemain dipindah ke titik uji. */
  /** Debug: posisi uji (jembatan / lantai tengah) ditulis untuk Brick Hall — map lain cukup Latihan / TDM. */
  private debugMapOk(): boolean {
    if (currentMap().id === 'brickhall') return true;
    this.debugPanel.setStatus(`Khusus Brick Hall (map aktif: ${currentMap().name}) — pakai mode Latihan / TDM.`);
    return false;
  }

  private spawnDummies() {
    if (!this.inMatch || !ctx.player || !this.debugMapOk()) return;
    let id = 200 + this.dummies.length * 3;
    for (const d of [10, 40, 70]) {
      const e = new Entity(id, `Dummy ${d}u`, 'red', false, false, botVariant(id++));
      e.applyLoadout({ weapon: 'm416', scope: 'iron' });
      e.dummyAt = new THREE.Vector3(-8, 10, -35.5 + d);
      this.addEntity(e); this.dummies.push(e);
      ctx.spawns.spawn(e);
    }
    const p = ctx.player;
    p.ctrl.teleport(-8, 10.05, -35.5); ctx.camRig.yaw = Math.PI; ctx.camRig.pitch = 0; // menghadap +Z (Utara)
  }

  private dummyWeapon(e: Entity, dt: number) {
    if (!this.stress?.shooters.includes(e)) return;
    const tg = this.stress.target;
    tg.partCenter('upper', _v); e.eye(_w);
    _v.sub(_w);
    e.yaw = Math.atan2(-_v.x, -_v.z); e.pitch = Math.atan2(_v.y, Math.hypot(_v.x, _v.z));
    e.weapon.reserve = 120;
    e.weapon.update(dt, ctx.time, { pressed: false, held: true, reload: false, modeSwitch: false, ads: false, sprinting: false }, () => fireOne(e));
  }

  /** Stress Test (§16.3): 10 karakter di lantai tengah menembak dummy, 2 granat ke rak tiap 10 s, selama 60 s. */
  private startStress() {
    if (!this.inMatch || this.stress || !this.debugMapOk()) return;
    const target = new Entity(150, 'Target', 'blue', false, false);
    target.applyLoadout({ weapon: 'm416', scope: 'iron' });
    target.dummyAt = new THREE.Vector3(0, 0, -20);
    this.addEntity(target); ctx.spawns.spawn(target); target.protectT = 1e9;
    const shooters: Entity[] = [];
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const e = new Entity(160 + i, `Stress${i}`, 'red', false, isHigh(this.settings.preset), botVariant(i));
      e.applyLoadout(this.randomLoadout());
      e.dummyAt = new THREE.Vector3(Math.sin(a) * 9, 0, -20 + Math.cos(a) * 9);
      this.addEntity(e); ctx.spawns.spawn(e); e.protectT = 1e9;
      shooters.push(e);
    }
    this.stress = { t: 0, shooters, target, nextNade: 0 };
    this.perf.start();
    this.debugPanel.setStatus('Stress Test berjalan 60 s…');
  }

  private updateStress(dt: number) {
    const s = this.stress;
    if (!s) return;
    s.t += dt;
    s.target.protectT = 1e9;
    if (s.t >= s.nextNade) {
      s.nextNade += 10;
      for (const sh of ctx.map.shelves.slice(0, 2)) {
        const th = s.shooters[0];
        _v.set(sh.cx + 3, 6, sh.cz);
        th.yaw = Math.atan2(-(sh.cx - _v.x), -(sh.cz - _v.z)); th.pitch = -0.6;
        const saved = th.ctrl.pos.clone();
        th.ctrl.pos.copy(_v).setY(1.5);
        ctx.grenades.throw(th, false, 1.2);
        th.ctrl.pos.copy(saved);
      }
    }
    if (s.t >= 60) {
      const r = this.perf.stop();
      const pass = r.avgMs <= 14 && r.p95Ms <= 18 && r.maxDrawCalls <= 250;
      this.debugPanel.setStatus(`Stress Test selesai — ${pass ? 'LULUS' : 'GAGAL'}\n${JSON.stringify(r)}`);
      for (const e of [...s.shooters, s.target]) {
        const i = ctx.entities.indexOf(e);
        if (i >= 0) ctx.entities.splice(i, 1);
        ctx.byId.delete(e.id); this.engine.scene.remove(e.char.root); e.ctrl.dispose();
      }
      this.stress = null;
    }
  }
}
