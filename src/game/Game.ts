// src/game/Game.ts — orkestrasi: urutan update (GDD §2.6), input pemain (§14), state aplikasi (§12), debug (§16)
// + pasca-MVP: mode Eliminasi & Latihan, killcam + menonton rekan, melee, gamepad, radar, nama, medali, opsi tampilan.
import * as THREE from 'three';
import { CFG } from '../config/gameConfig';
import { XCFG } from '../config/extraConfig';
import { SCOPE_ORDER, WEAPONS, WEAPON_ORDER, scopeAllowed, type ScopeId, type WeaponId } from '../config/weaponsData';
import { physics } from '../physics/Physics';
import { Engine } from '../core/Engine';
import { GameLoop } from '../core/GameLoop';
import { Input } from '../core/Input';
import { PAD } from '../core/Bindings';
import { bus, type GameEvents } from '../core/EventBus';
import { buildBrickHall } from '../world/BrickHallBuilder';
import { isHigh } from '../config/presets';
import type { LightSample } from '../world/LightBake';
import { Props } from '../world/Props';
import { NavGraph } from '../world/NavGraph';
import { CameraRig } from '../entities/CameraRig';
import { Viewmodel } from '../entities/Viewmodel';
import { Entity } from '../entities/Entity';
import { TacticalBot } from '../entities/TacticalBot';
import type { AnimState } from '../entities/BlockyCharacter';
import { moveFeel } from '../entities/moveFeel';
import { botVariant, characterArt, type Variant } from '../entities/CharacterArt';
import type { Team } from '../entities/BlockyCharacter';
import { ScopeSystem } from '../combat/ScopeSystem';
import { fireOne, spreadDeg } from '../combat/Ballistics';
import { GrenadeManager, equipTimeFor, type GrenadeInput } from '../combat/GrenadeK400';
import { buttProgress, cancelMelee, knifeProgress, startKnife, startMelee, updateMelee } from '../combat/Melee';
import { WeaponDrops } from '../combat/WeaponDrops';
import { cycleTarget, heldOf, quickSwitchTarget, slotAvail, type Slot } from '../combat/Slots';
import type { TriggerInput } from '../combat/WeaponSystem';
import { Vfx } from '../vfx/Vfx';
import { DeathFx } from '../vfx/DeathFx';
import { SpatialSynthAudio } from '../audio/SpatialSynthAudio';
import * as R from '../audio/Recipes';
import { Hud } from '../ui/Hud';
import { Menus } from '../ui/Menus';
import { Minimap } from '../ui/Minimap';
import { Nameplates } from '../ui/Nameplates';
import { Announcer } from '../ui/Announcer';
import { loadSettings, saveSettings, validate, type Settings } from '../ui/Settings';
import { StatsOverlay } from '../debug/StatsOverlay';
import { DebugPanel } from '../debug/DebugPanel';
import { PerfLogger } from '../debug/PerfLogger';
import { TeamManager } from './TeamManager';
import { MatchManager, type GameMode, type MatchOptions } from './MatchManager';
import { SpawnSystem } from './SpawnSystem';
import { BotDirector } from './BotDirector';
import { Killcam } from './Killcam';
import { ctx } from './ctx';

const D2R = THREE.MathUtils.degToRad, R2D = THREE.MathUtils.radToDeg;
const _v = new THREE.Vector3(), _w = new THREE.Vector3();
const DOWN = new THREE.Vector3(0, -1, 0);
const wrapA = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** Dummy Latihan (tim Merah, menghadap Selatan): [x, y, z, bergerak kiri-kanan]. */
const PRACTICE_DUMMIES: [number, number, number, boolean][] = [
  [-8, 10, -25.5, false], [-8, 10, 4.5, false], [-8, 10, 34.5, false],   // jembatan Barat: 10/40/70 u dari mulut jembatan
  [8, 10, -20, false], [8, 10, 15, false],                               // jembatan Timur
  [-3.4, 0, -24, false], [-11, 0, 1, false], [11, 0, 1, false], [3.4, 0, 24, false], // lantai dasar (v2: di samping rak tengah)
  [0, 0, -11, true], [0, 0, 11, true],                                   // target bergerak (v2: di depan ujung rak tengah)
  [0, 10, 38, false],                                                    // mezanin Utara
];

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
  mode: GameMode = 'tdm';
  private jumpLatch = false;
  private crouchToggled = false;
  private adsToggled = false;
  private padSprint = false;
  private readonly trig: TriggerInput = { pressed: false, held: false, reload: false, modeSwitch: false, ads: false, sprinting: false };
  /** Jadwal hentakan kamera serangan pisau (waktu game; 0 = tidak ada). */
  private punchAt = 0; private punchKind: 'slash' | 'stab' = 'slash'; private punchAlt = false;
  private readonly gIn: GrenadeInput = { equip: false, toSlot: null, lPress: false, lHeld: false, lRelease: false, rPress: false, rHeld: false, rRelease: false };
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
  private fog = new THREE.FogExp2(XCFG.gfx.fog.color, XCFG.gfx.fog.density);
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
    ctx.settings = this.settings;
    ctx.debug = { god: false, noclip: false, showNav: false, botLabels: false, dmgNumbers: false, colliders: false, slowmo: false };
    ctx.map = buildBrickHall(engine.scene, engine.preset, this.settings.preset, engine.maxAnisotropy);
    ctx.props = new Props(engine.scene, ctx.map.shelves, engine.preset.shadowMap > 0);
    physics.world.step(); // query pipeline Rapier baru valid setelah step pertama
    if (engine.gfx.env) this.captureEnvironment();
    ctx.nav = new NavGraph();
    const warn = ctx.nav.validate((ax, ay, az, bx, by, bz) => physics.losBlocked(ax, ay, az, bx, by, bz));
    if (warn.length) console.warn('[NavGraph] peringatan:', warn); else console.log(`[NavGraph] ${ctx.nav.nodes.length} node, ${ctx.nav.walkEdgeCount} jalur, ${ctx.nav.dropCount} drop — 0 peringatan`);
    ctx.camRig = new CameraRig();
    ctx.viewmodel = new Viewmodel(engine.vmScene, 'blue');
    ctx.scope = new ScopeSystem();
    ctx.vfx = new Vfx(engine.scene, engine.preset, high);
    ctx.deathFx = new DeathFx(engine.scene);
    ctx.grenades = new GrenadeManager(engine.scene);
    ctx.drops = new WeaponDrops(engine.scene, engine.preset.shadowMap > 0);
    ctx.teams = new TeamManager();
    ctx.match = new MatchManager();
    ctx.spawns = new SpawnSystem();
    ctx.directors = { blue: new BotDirector('blue'), red: new BotDirector('red') };
    ctx.audio = new SpatialSynthAudio();
    ctx.audio.setVolumes(this.settings.volMaster / 100, this.settings.volSfx / 100, this.settings.volUi / 100);
    ctx.hud = new Hud();
    ctx.killcam = this.killcam = new Killcam(engine.scene);
    this.minimap = new Minimap(ctx.hud.root);
    this.nameplates = new Nameplates(ctx.hud.root);
    this.announcer = new Announcer(ctx.hud.root);
    this.baseLight = { sun: ctx.map.sun.intensity, hemi: ctx.map.hemi.intensity };
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
        return `pos ${c.pos.x.toFixed(1)} ${c.pos.y.toFixed(2)} ${c.pos.z.toFixed(1)}  v ${c.speedH.toFixed(2)} u/s  vy ${c.velY.toFixed(2)}\n` +
          `grounded ${c.grounded}  crouch ${c.crouched}  sprint ${c.sprinting}  hp ${p.hp}  view ${ctx.camRig.mode}`;
      },
    });
    if (this.settings.showFps) this.stats.toggle(true);
    this.debugPanel = new DebugPanel(engine.scene, {
      spawnDummies: () => this.spawnDummies(), resetProps: () => ctx.props.reset(), startStress: () => this.startStress(),
      setSlowmo: (on) => (this.loop.timeScale = on ? 0.25 : 1), setNoclip: (on) => this.setNoclip(on),
    });
    this.menus = new Menus({
      play: (practice) => this.play(practice ? 'practice' : this.settings.mode), resume: () => this.resume(),
      quitToMenu: () => this.quitToMenu(), replay: () => this.play(this.mode),
      fullscreen: () => void this.input.goFullscreen(), settings: () => this.settings,
      applySettings: (s) => this.applySettings(s), setLoadout: (w, s, v) => this.setLoadout(w, s, v),
      click: () => { ctx.audio.unlock(); ctx.audio.click(); }, inMatch: () => this.inMatch,
      refreshHz: () => 1000 / engine.pacing.refreshMs,
    });
    this.applyVisual();
    this.input.onLockChange = (locked) => {
      if (!locked && this.inMatch && !this.menus.open && ctx.match.state !== 'RESULTS' && !this.input.padActive) this.pause();
      // kunci mouse datang terlambat saat layar "Klik untuk lanjut" tampil → langsung lanjut
      if (locked && this.paused && this.menus.current === 'resume') { this.menus.hide(); this.unpause(); }
    };
    this.input.onKey = (code) => this.onKey(code);
    this.input.onPadButton = (i) => this.onPadButton(i);
    canvas.addEventListener('click', () => { if (this.inMatch && !this.input.locked && !this.paused && ctx.match.state !== 'RESULTS') void this.input.requestLock(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.inMatch && !this.paused) this.pause(); });
    // pindah ke aplikasi lain (alt-tab, klik jendela lain) → selalu pause, juga saat main pakai controller
    window.addEventListener('blur', () => { if (this.inMatch && !this.paused && ctx.match.state !== 'RESULTS') this.pause(); });
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

  private createEntities(mode: GameMode) {
    this.disposeEntities();
    const s = this.settings, shadows = isHigh(s.preset), names = XCFG.bots.names;
    const player = new Entity(1, 'Kamu', 'blue', true, shadows, s.charVariant);
    player.char.setLayer(1); // tubuh lokal tidak dirender kamera FPS, tetap kena raycaster
    player.applyLoadout({ weapon: s.weapon, scope: s.scope });
    this.addEntity(player); ctx.player = player;
    if (mode === 'practice') {
      PRACTICE_DUMMIES.forEach(([x, y, z, moving], i) => {
        const e = new Entity(100 + i, moving ? `Target Gerak ${i - 8}` : `Dummy ${i + 1}`, 'red', false, shadows, botVariant(i));
        e.applyLoadout({ weapon: 'm416', scope: 'iron' });
        e.dummyAt = new THREE.Vector3(x, y, z);
        this.addEntity(e); this.dummies.push(e);
        if (moving) this.movers.set(e, i % 2 ? 1 : -1);
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

  // ───────────────────────────────── alur aplikasi
  play(mode: GameMode = this.settings.mode) {
    this.mode = mode;
    ctx.audio.unlock();
    this.menus.hide();
    ctx.hud.clearFeed(); ctx.hud.showBanner('', '#fff');
    this.killcam.reset(); this.minimap.reset(); this.announcer.reset(true);
    this.stopSpectate();
    this.stress = null;
    this.createEntities(mode);
    this.inMatch = true; this.paused = false; this.loop.timeScale = 1; this.slowmoEnd = 0;
    this.crouchToggled = false; this.adsToggled = false; this.padSprint = false;
    const s = this.settings;
    const opts: MatchOptions = { mode, scoreLimit: s.scoreLimit, timeLimit: s.timeLimit * 60, roundsToWin: s.roundsToWin };
    ctx.camRig.mode = 'fps';
    ctx.match.start(opts);
    ctx.hud.setVisible(true);
    this.applyVisual();
    if (!this.input.padActive) void this.input.requestLock().then((ok) => {
      // Chrome menolak mengunci mouse → jangan biarkan game jalan dengan kursor bebas: tunggu satu klik lagi
      if (!ok && !this.autoTest && this.inMatch && !this.paused) { this.paused = true; this.input.clearAll(); this.menus.showClickToResume(); }
    });
  }

  pause() {
    if (this.paused || !this.inMatch || this.autoTest) return;
    this.paused = true;
    this.input.clearAll();
    if (this.settings.fullPause) this.loop.timeScale = 0;
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
    this.loop.timeScale = ctx.debug.slowmo ? 0.25 : 1;
  }

  quitToMenu() {
    this.inMatch = false; this.paused = false; this.stress = null;
    this.loop.timeScale = 1; this.slowmoEnd = 0;
    this.input.exitLock();
    this.killcam.stop(); this.stopSpectate();
    this.disposeEntities();
    ctx.grenades.clear(); ctx.drops.clear(); ctx.vfx.clear(); ctx.deathFx.clear(); ctx.props.reset();
    ctx.match.set('MENU');
    ctx.hud.setVisible(false);
    document.body.classList.remove('dead');
    this.engine.showViewmodel = false;
    this.applyVisual();
    this.menus.showMain();
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
    this.padSprint = false; this.crouchToggled = false; this.adsToggled = false;
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
    this.loop.timeScale = XCFG.match.endTimeScale; // slow-motion 1 s
    this.slowmoEnd = performance.now() + XCFG.match.endSlowMoTime * 1000;
  }

  private onResults() {
    this.loop.timeScale = 1;
    this.input.exitLock();
    this.killcam.stop();
    ctx.hud.showBanner('', '#fff');
    ctx.hud.setVisible(false); // layar hasil bersih (radar/nama/senjata disembunyikan)
    document.body.classList.remove('dead');
    ctx.props.reset(); ctx.vfx.clear();
    this.menus.showResults(ctx.match.winner, ctx.player?.team ?? 'blue');
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
    this.stats.toggle(this.settings.showFps);
    this.applyVisual();
    if (reload) location.reload(); // antialias hanya bisa ditentukan saat WebGLRenderer dibuat
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

  /** Peta lingkungan dari aula itu sendiri (sekali saat loading) → pantulan PBR & cahaya lingkungan realistis. */
  private captureEnvironment() {
    const r = this.engine.renderer, scene = this.engine.scene;
    const crt = new THREE.WebGLCubeRenderTarget(128, { type: THREE.HalfFloatType });
    const cam = new THREE.CubeCamera(0.3, 220, crt);
    cam.position.set(0, 20, -18);                  // udara terbuka di atas rak tengah
    scene.add(cam); cam.update(r, scene); scene.remove(cam);
    const pm = new THREE.PMREMGenerator(r);
    this.envTex = pm.fromCubemap(crt.texture).texture;
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
    const p = ctx.player, inp = this.input;
    const control = this.inMatch && !this.paused && inp.captured && !ctx.match.locked && !ctx.debug.noclip;
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
    }
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
      if (e.alive) e.ctrl.fixedUpdate(dt, e.intent, e.weapon.adsActive);
    }
    // 3. timer sumbu granat → world.step() → props, mayat
    ctx.grenades.fixedUpdate(dt);
    physics.world.step();
    ctx.grenades.postStep(); ctx.drops.postStep();
    ctx.props.fixedUpdate(dt);
    ctx.deathFx.fixedUpdate(dt);
    if (this.inMatch) {
      const st = ctx.match.state;
      ctx.spawns.update(dt, (st === 'PLAYING' || st === 'COUNTDOWN') && ctx.match.mode !== 'elim'); // Eliminasi: tanpa respawn dalam ronde
      this.killcam.record();
    }
    // regenerasi HP (opsi config, default mati)
    if (CFG.player.healthRegen && p && p.alive && p.hp < CFG.player.hp && ctx.time - p.lastDamageT > XCFG.player.regenDelay)
      p.hp = Math.min(CFG.player.hp, p.hp + XCFG.player.regenRate * dt);
    this.updateStress(dt);
  }

  // ───────────────────────────────── per frame (§2.6)
  private update(dt: number, alpha: number, rawDt: number) {
    ctx.time += dt;
    const p = ctx.player, rig = ctx.camRig, inp = this.input, cam = this.engine.camera;
    if (this.slowmoEnd && performance.now() > this.slowmoEnd) { this.slowmoEnd = 0; this.loop.timeScale = 1; }
    if (this.menus.open && inp.padActive) this.menus.padNav(inp.pad);
    // posisi render terinterpolasi + yaw
    for (const e of ctx.entities) {
      if (!e.alive) continue;
      e.renderPos.lerpVectors(e.ctrl.prevPos, e.ctrl.pos, alpha);
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
      if (p.alive) {
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

    // 2. senjata pemain
    if (p && this.inMatch) this.playerWeapon(dt, looking);
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

  private render() { this.engine.render(); }

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
  private playerWeapon(dt: number, looking: boolean) {
    const p = ctx.player!, inp = this.input, w = p.weapon, t = this.trig, g = this.gIn;
    const active = looking && p.alive && !ctx.match.locked && !ctx.debug.noclip;
    const lP = active && inp.mousePressed[0], lH = active && inp.mouseDown[0], lR = inp.mouseReleased[0];
    const rP = active && inp.mousePressed[2], rH = active && inp.mouseDown[2], rR = inp.mouseReleased[2];
    // slot: 1 senjata utama · 2 pisau · 3 granat · Q / gamepad Y senjata sebelumnya · scroll siklus · D-pad ↓ pisau
    const av = slotAvail(w.hasPrimary, p.grenades);
    let want: Slot | null = null;
    if (active) {
      if (inp.actPressed('primary')) want = 'ar';
      else if (inp.actPressed('knife')) want = 'knife';
      else if (inp.actPressed('grenade')) want = 'grenade';
      else if (inp.actPressed('lastWeapon')) want = quickSwitchTarget(w.slot, w.prevSlot, av);
      else if (inp.wheel !== 0) want = cycleTarget(w.slot, inp.wheel > 0 ? 1 : -1, av);
      if (want && (!av[want] || want === w.slot)) want = null;
    }
    g.equip = want === 'grenade';                                                   // diproses state machine granat (§8.1)
    g.toSlot = want && want !== 'grenade' && w.slot === 'grenade' ? want : null;   // keluar dari granat (READY)
    if (want && want !== 'grenade' && w.slot !== 'grenade' && p.grenadeState === 'NONE' && (p.meleeT < 0 || p.meleeHit)) {
      cancelMelee(p);
      w.switchTo(want, equipTimeFor(want));
    }
    const nade = w.slot === 'grenade' || p.grenadeState !== 'NONE';
    const gun = w.slot === 'ar' && !nade, knife = w.slot === 'knife' && !nade;
    g.lPress = nade && lP; g.lHeld = nade && lH; g.lRelease = nade && lR;
    g.rPress = nade && rP; g.rHeld = nade && rH; g.rRelease = nade && rR;
    const meleeing = p.meleeT >= 0;
    // ADS (hanya senapan): tahan / toggle
    if (!this.settings.adsToggle) this.adsToggled = rH && gun;
    else if (rP && gun) this.adsToggled = !this.adsToggled;
    if (w.reloading || !gun || !p.alive || meleeing) this.adsToggled = this.settings.adsToggle ? false : this.adsToggled;
    t.pressed = gun && !meleeing && lP; t.held = gun && !meleeing && lH;
    // senjata tim sendiri di dekat kaki → prompt ambil/tukar (E; gamepad X mengambil alih fungsi reload saat itu)
    const near = p.alive && p.grenadeState === 'NONE' ? ctx.drops.nearestFor(p) : null;
    const padPick = active && !!near && inp.padActive && inp.pad.pressed(PAD.X);
    t.reload = active && inp.actPressed('reload') && !padPick; t.modeSwitch = active && inp.actPressed('fireMode');
    t.ads = active && gun && !meleeing && this.adsToggled;
    t.sprinting = p.ctrl.sprinting;
    ctx.hud.pickup = near;
    if (!p.alive || ctx.match.locked) return;
    // F: pukul popor (senapan) / tebas cepat (pisau); pisau: klik kiri tebas, klik kanan tusuk (tahan = berulang)
    if (active && inp.actPressed('melee') && (startMelee(p) || (knife && startKnife(p, false)))) { this.adsToggled = false; this.padSprint = false; }
    if (knife && (lH || rH)) startKnife(p, !lH);
    // G: buang senjata utama (saat dipegang); E / gamepad X: ambil atau tukar senjata TIM SENDIRI
    if (active && inp.actPressed('drop')) {
      if (gun && !meleeing) { if (ctx.drops.drop(p)) this.adsToggled = false; }
      else if (w.slot !== 'ar') ctx.hud.toast('Hanya senjata utama yang bisa dibuang');
    }
    if (near && !meleeing && (padPick || (active && inp.actPressed('pickup')))) { ctx.drops.pickup(p, near); this.adsToggled = false; }
    if (this.mode === 'practice') { // latihan: amunisi cadangan & granat tak terbatas
      w.reserve = w.def.reserveAmmo;
      if (p.grenades < 1 && p.grenadeState === 'NONE') p.grenades = 1;
    }
    w.update(dt, ctx.time, t, () => fireOne(p));
    ctx.grenades.handle(p, g, dt);
    updateMelee(p, dt);
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
    cam.position.set(Math.sin(this.menuT) * 17, 21, Math.cos(this.menuT) * 34);
    cam.lookAt(0, 6, 0);
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
  private spawnDummies() {
    if (!this.inMatch || !ctx.player) return;
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
    if (!this.inMatch || this.stress) return;
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
