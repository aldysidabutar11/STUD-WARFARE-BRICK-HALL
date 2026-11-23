// src/game/Game.ts — orkestrasi: urutan update (GDD §2.6), input pemain (§14), state aplikasi (§12), debug (§16)
import * as THREE from 'three';
import { CFG } from '../config/gameConfig';
import { XCFG } from '../config/extraConfig';
import { SCOPE_ORDER, WEAPONS, WEAPON_ORDER, scopeAllowed, type ScopeId, type WeaponId } from '../config/weaponsData';
import { physics } from '../physics/Physics';
import { Engine } from '../core/Engine';
import { GameLoop } from '../core/GameLoop';
import { Input } from '../core/Input';
import { bus } from '../core/EventBus';
import { buildBrickHall } from '../world/BrickHallBuilder';
import { Props } from '../world/Props';
import { NavGraph } from '../world/NavGraph';
import { CameraRig } from '../entities/CameraRig';
import { Viewmodel } from '../entities/Viewmodel';
import { Entity } from '../entities/Entity';
import { TacticalBot } from '../entities/TacticalBot';
import type { AnimState } from '../entities/BlockyCharacter';
import { ScopeSystem } from '../combat/ScopeSystem';
import { fireOne, spreadDeg } from '../combat/Ballistics';
import { GrenadeManager, type GrenadeInput } from '../combat/GrenadeK400';
import type { TriggerInput } from '../combat/WeaponSystem';
import { Vfx } from '../vfx/Vfx';
import { DeathFx } from '../vfx/DeathFx';
import { SpatialSynthAudio } from '../audio/SpatialSynthAudio';
import { Hud } from '../ui/Hud';
import { Menus } from '../ui/Menus';
import { loadSettings, saveSettings, type Settings } from '../ui/Settings';
import { StatsOverlay } from '../debug/StatsOverlay';
import { DebugPanel } from '../debug/DebugPanel';
import { PerfLogger } from '../debug/PerfLogger';
import { TeamManager } from './TeamManager';
import { MatchManager } from './MatchManager';
import { SpawnSystem } from './SpawnSystem';
import { BotDirector } from './BotDirector';
import { ctx } from './ctx';

const D2R = THREE.MathUtils.degToRad, R2D = THREE.MathUtils.radToDeg;
const _v = new THREE.Vector3(), _w = new THREE.Vector3();

interface Stress { t: number; shooters: Entity[]; target: Entity; nextNade: number }

export class Game {
  settings!: Settings;
  engine!: Engine;
  loop!: GameLoop;
  input!: Input;
  menus!: Menus;
  stats!: StatsOverlay;
  debugPanel!: DebugPanel;
  perf = new PerfLogger();
  inMatch = false;
  paused = false;
  autoTest = false;
  private jumpLatch = false;
  private crouchToggled = false;
  private adsToggled = false;
  private readonly trig: TriggerInput = { pressed: false, held: false, reload: false, modeSwitch: false, ads: false, sprinting: false };
  private readonly gIn: GrenadeInput = { equip: false, toAr: false, lPress: false, lHeld: false, lRelease: false, rPress: false, rHeld: false, rRelease: false };
  private menuT = 0;
  private slowmoEnd = 0;
  private stress: Stress | null = null;
  private dummies: Entity[] = [];
  private noclipPos = new THREE.Vector3();
  private anim: AnimState = { speed: 0, sprinting: false, crouchT: 0, airborne: false, pitch: 0, reload: -1, throwPose: NaN, lowReady: false };

  async boot() {
    const canvas = document.getElementById('game') as HTMLCanvasElement;
    this.settings = loadSettings();
    await physics.init();
    const engine = this.engine = new Engine(canvas, this.settings.preset);
    const high = this.settings.preset === 'HIGH';
    ctx.engine = engine;
    ctx.settings = this.settings;
    ctx.debug = { god: false, noclip: false, showNav: false, botLabels: false, dmgNumbers: false, colliders: false, slowmo: false };
    ctx.map = buildBrickHall(engine.scene, engine.preset, engine.maxAnisotropy, high);
    ctx.props = new Props(engine.scene, ctx.map.shelves, engine.preset.shadowMap > 0);
    physics.world.step(); // query pipeline Rapier baru valid setelah step pertama
    ctx.nav = new NavGraph();
    const warn = ctx.nav.validate((ax, ay, az, bx, by, bz) => physics.losBlocked(ax, ay, az, bx, by, bz));
    if (warn.length) console.warn('[NavGraph] peringatan:', warn); else console.log(`[NavGraph] ${ctx.nav.nodes.length} node, ${ctx.nav.walkEdgeCount} jalur, ${ctx.nav.dropCount} drop — 0 peringatan`);
    ctx.camRig = new CameraRig();
    ctx.viewmodel = new Viewmodel(engine.vmScene, XCFG.rig.colors.torso.blue);
    ctx.scope = new ScopeSystem();
    ctx.vfx = new Vfx(engine.scene, engine.preset, high);
    ctx.deathFx = new DeathFx(engine.scene);
    ctx.grenades = new GrenadeManager(engine.scene);
    ctx.teams = new TeamManager();
    ctx.match = new MatchManager();
    ctx.spawns = new SpawnSystem();
    ctx.directors = { blue: new BotDirector('blue'), red: new BotDirector('red') };
    ctx.audio = new SpatialSynthAudio();
    ctx.audio.setVolumes(this.settings.volMaster / 100, this.settings.volSfx / 100, this.settings.volUi / 100);
    ctx.hud = new Hud();
    ctx.entities = []; ctx.byId = new Map(); ctx.player = null;
    this.input = ctx.input = new Input(canvas);
    this.stats = new StatsOverlay({
      renderer: engine.renderer,
      awakeBodies: () => ctx.props.awakeCount + ctx.deathFx.activeBodies + ctx.grenades.count,
      totalBodies: () => physics.world.bodies.len(),
      voices: () => ctx.audio.voiceCount,
      dynScale: () => engine.dynRes.scale,
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
      play: () => this.play(), resume: () => this.resume(), quitToMenu: () => this.quitToMenu(), replay: () => this.play(),
      fullscreen: () => void this.input.goFullscreen(), settings: () => this.settings,
      applySettings: (s) => this.applySettings(s), setLoadout: (w, s) => this.setLoadout(w, s),
      click: () => { ctx.audio.unlock(); ctx.audio.click(); }, inMatch: () => this.inMatch,
    });
    this.input.onLockChange = (locked) => { if (!locked && this.inMatch && !this.menus.open && ctx.match.state !== 'RESULTS') this.pause(); };
    this.input.onKey = (code) => this.onKey(code);
    canvas.addEventListener('click', () => { if (this.inMatch && !this.input.locked && !this.paused && ctx.match.state !== 'RESULTS') void this.input.requestLock(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.inMatch && !this.paused) this.pause(); });
    bus.on('match:state', (e) => { if (e.state === 'ENDED') this.onEnded(); });
    ctx.match.onResults = () => this.onResults();
    this.loop = new GameLoop({
      beginFrame: () => { this.input.beginFrame(); if (this.input.wasPressed('Space')) this.jumpLatch = true; },
      fixedUpdate: (dt) => this.fixedUpdate(dt),
      update: (dt, alpha, raw) => this.update(dt, alpha, raw),
      render: () => this.render(),
      endFrame: () => this.input.endFrame(),
    });
    document.getElementById('loading')!.classList.add('hidden');
    this.menus.showMain();
    this.loop.start();
    // ?autostart=1 untuk uji otomatis (tanpa pointer lock)
    if (new URLSearchParams(location.search).has('autostart')) { this.autoTest = true; this.play(); }
  }

  // ───────────────────────────────── entitas
  private disposeEntities() {
    for (const e of ctx.entities) {
      this.engine.scene.remove(e.char.root);
      e.ctrl.dispose();
      e.bot?.dispose();
      ctx.directors[e.team].release(e);
    }
    ctx.entities.length = 0; ctx.byId.clear(); ctx.player = null; this.dummies = [];
    this.debugPanel.clearLabels();
  }

  private addEntity(e: Entity) {
    ctx.entities.push(e); ctx.byId.set(e.id, e);
    this.engine.scene.add(e.char.root);
  }

  private randomLoadout(): { weapon: WeaponId; scope: ScopeId } {
    const weapon = WEAPON_ORDER[Math.floor(Math.random() * WEAPON_ORDER.length)];
    const pool = SCOPE_ORDER.filter(s => scopeAllowed(WEAPONS[weapon], s) && s !== 'x6');
    return { weapon, scope: pool[Math.floor(Math.random() * pool.length)] };
  }

  private createEntities() {
    this.disposeEntities();
    const s = this.settings, shadows = s.preset === 'HIGH', names = XCFG.bots.names;
    const player = new Entity(1, 'Kamu', 'blue', true, shadows);
    player.char.setLayer(1); // tubuh lokal tidak dirender kamera FPS, tetap kena raycaster
    player.applyLoadout({ weapon: s.weapon, scope: s.scope });
    this.addEntity(player); ctx.player = player;
    for (let i = 0; i < s.allies; i++) {
      const e = new Entity(2 + i, names[i], 'blue', false, shadows);
      e.applyLoadout(this.randomLoadout()); e.bot = new TacticalBot(e, s.difficulty, i + 1); this.addEntity(e);
    }
    for (let i = 0; i < s.enemies; i++) {
      const e = new Entity(6 + i, names[4 + i], 'red', false, shadows);
      e.applyLoadout(this.randomLoadout()); e.bot = new TacticalBot(e, s.difficulty, i + 5); this.addEntity(e);
    }
    ctx.viewmodel.setWeapon(player.loadout.weapon, player.loadout.scope);
  }

  // ───────────────────────────────── alur aplikasi
  play() {
    ctx.audio.unlock();
    this.menus.hide();
    ctx.hud.clearFeed(); ctx.hud.showBanner('', '#fff');
    this.createEntities();
    this.inMatch = true; this.paused = false; this.loop.timeScale = 1;
    this.crouchToggled = false; this.adsToggled = false;
    ctx.match.start();
    ctx.camRig.mode = 'fps';
    ctx.hud.setVisible(true);
    void this.input.requestLock();
  }

  pause() {
    if (this.paused || !this.inMatch || this.autoTest) return;
    this.paused = true;
    this.input.clearAll();
    if (this.settings.fullPause) this.loop.timeScale = 0;
    this.menus.showPause(this.input.lockCooldown);
  }

  resume() {
    this.menus.hide();
    this.paused = false;
    this.loop.timeScale = ctx.debug.slowmo ? 0.25 : 1;
    void this.input.requestLock();
  }

  quitToMenu() {
    this.inMatch = false; this.paused = false; this.stress = null;
    this.loop.timeScale = 1;
    this.input.exitLock();
    this.disposeEntities();
    ctx.grenades.clear(); ctx.vfx.clear(); ctx.deathFx.clear(); ctx.props.reset();
    ctx.match.set('MENU');
    ctx.hud.setVisible(false);
    this.engine.showViewmodel = false;
    this.menus.showMain();
  }

  private onEnded() {
    const p = ctx.player, w = ctx.match.winner;
    const txt = w === 'draw' ? 'SERI' : p && w === p.team ? 'MENANG' : 'KALAH';
    ctx.hud.showBanner(txt, w === 'draw' ? '#f5cd30' : p && w === p.team ? '#7dff9a' : '#ff6b5e');
    this.loop.timeScale = XCFG.match.endTimeScale; // slow-motion 1 s
    this.slowmoEnd = performance.now() + XCFG.match.endSlowMoTime * 1000;
  }

  private onResults() {
    this.loop.timeScale = 1;
    this.input.exitLock();
    ctx.hud.showBanner('', '#fff');
    ctx.props.reset(); ctx.vfx.clear();
    this.menus.showResults(ctx.match.winner, ctx.player?.team ?? 'blue');
  }

  private applySettings(s: Settings) {
    const reload = s.preset !== this.settings.preset;
    Object.assign(this.settings, s);
    saveSettings(this.settings);
    ctx.audio.setVolumes(s.volMaster / 100, s.volSfx / 100, s.volUi / 100);
    this.stats.toggle(s.showFps);
    if (reload) location.reload(); // antialias hanya bisa ditentukan saat WebGLRenderer dibuat
  }

  private setLoadout(w: WeaponId, s: ScopeId) {
    this.settings.weapon = w; this.settings.scope = s; saveSettings(this.settings);
    if (ctx.player) ctx.player.pendingLoadout = { weapon: w, scope: s }; // berlaku pada spawn berikutnya
  }

  private onKey(code: string) {
    if (code === 'F3') this.stats.toggle();
    if (code === 'Backquote') { this.debugPanel.toggle(); if (this.debugPanel.visible) this.input.exitLock(); }
    if (!this.inMatch) return;
    if (code === 'Escape' && this.input.locked && this.input.keyboardLocked) this.input.exitLock();
    if (code === 'KeyL' && this.input.locked && ctx.match.state !== 'RESULTS') {
      this.paused = true; this.input.exitLock();
      this.menus.showLoadout(() => this.resume(), true);
    }
  }

  // ───────────────────────────────── fixed step 60 Hz (§2.6)
  private fixedUpdate(dt: number) {
    ctx.fixedIndex++;
    const p = ctx.player, inp = this.input;
    const control = this.inMatch && !this.paused && inp.locked && !ctx.match.locked && !ctx.debug.noclip;
    // 1. PlayerController: input → kecepatan → KCC
    if (p) {
      const it = p.intent;
      if (control && p.alive) {
        it.ix = (inp.isDown('KeyD') ? 1 : 0) - (inp.isDown('KeyA') ? 1 : 0);
        it.iz = (inp.isDown('KeyW') ? 1 : 0) - (inp.isDown('KeyS') ? 1 : 0);
        it.jump = this.jumpLatch;
        if (this.jumpLatch) this.crouchToggled = false;
        it.sprint = inp.isDown('ShiftLeft');
        const ctrlHold = inp.ctrlAllowed && inp.isDown('ControlLeft');
        it.crouch = (this.settings.crouchToggle ? this.crouchToggled : inp.isDown('KeyC')) || ctrlHold;
        it.cooking = p.grenadeState === 'COOKING';
        it.wantFire = p.weapon.slot === 'ar' && inp.mouseDown[0];
      } else { it.ix = 0; it.iz = 0; it.jump = false; it.sprint = false; it.wantFire = false; }
      this.jumpLatch = false;
      it.yaw = p.yaw;
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
    ctx.props.fixedUpdate(dt);
    ctx.deathFx.fixedUpdate(dt);
    if (this.inMatch) ctx.spawns.update(dt, ctx.match.state === 'PLAYING' || ctx.match.state === 'COUNTDOWN');
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
    // posisi render terinterpolasi + yaw
    for (const e of ctx.entities) {
      if (!e.alive) continue;
      e.renderPos.lerpVectors(e.ctrl.prevPos, e.ctrl.pos, alpha);
      e.char.root.position.copy(e.renderPos);
      e.char.root.rotation.y = e.yaw;
      e.char.root.updateMatrixWorld(true);
    }
    const looking = this.inMatch && !this.paused && inp.locked && ctx.match.state !== 'RESULTS';
    // 1. kamera: mouse-look (yaw −= dx·k, pitch −= dy·k), recoil, FOV
    if (this.inMatch && p) {
      if (looking) {
        const k = this.settings.sens * CFG.camera.sensBaseRadPerPx * ctx.scope.sensMult(p, this.settings.fov, this.settings.adsMult);
        const dYaw = -inp.dx * k, dPitch = -inp.dy * k * (this.settings.invertY ? -1 : 1);
        if (ctx.debug.noclip) { rig.addLook(dYaw, dPitch); }
        else if (p.alive) { p.recoil.onMouseLook(R2D(dPitch)); rig.addLook(dYaw, dPitch); }
      }
      if (p.alive) {
        const rec = p.recoil.update(dt, ctx.time, p.weapon.def); // pemulihan sadar-kompensasi
        if (rec) rig.addLook(0, D2R(rec));
        p.yaw = rig.yaw; p.pitch = rig.pitch;
        if (inp.wasPressed('KeyV')) rig.toggleView();
        if (inp.wasPressed('KeyQ')) rig.swapShoulder();
        if (inp.wasPressed('KeyC') && this.settings.crouchToggle && looking && !ctx.match.locked) this.crouchToggled = !this.crouchToggled;
      }
      ctx.scope.update(dt, p, rig, this.settings.fov);
      if (ctx.debug.noclip) this.noclip(rawDt);
      const feet = p.alive ? p.renderPos : this.deathCamFeet(p);
      if (!ctx.debug.noclip) rig.update(dt, feet, p.ctrl.eyeHeight, p.ctrl.crouchT, ctx.scope.armScale(p), cam);
      else rig.update(dt, this.noclipPos, 0, 0, 1, cam);
      cam.layers.enable(0);
      if (rig.isFpsView && !ctx.debug.noclip) cam.layers.disable(1); else cam.layers.enable(1);
    } else this.menuCamera(dt, cam);

    // 2. senjata pemain
    if (p && this.inMatch) this.playerWeapon(dt, looking);
    // 3. bot: bidik per frame + keputusan tembak
    for (const e of ctx.entities) if (e.bot) e.bot.update(dt);
    // 4. senjata & granat semua bot
    if (!ctx.match.locked) for (const e of ctx.entities) {
      if (!e.alive) continue;
      if (e.bot) {
        e.bot.trigger.sprinting = e.ctrl.sprinting;
        e.weapon.update(dt, ctx.time, e.bot.trigger, () => fireOne(e));
        ctx.grenades.handle(e, e.bot.gIn, dt);
      } else if (this.dummies.includes(e) || this.stress?.shooters.includes(e)) this.dummyWeapon(e, dt);
    }
    // 5. animasi rig
    for (const e of ctx.entities) {
      if (!e.alive) continue;
      const a = this.anim, c = e.ctrl;
      a.speed = c.speedH; a.sprinting = c.sprinting; a.crouchT = c.crouchT; a.airborne = !c.grounded; a.pitch = e.pitch;
      a.reload = e.weapon.reloadProgress; a.throwPose = this.throwPose(e); a.lowReady = c.sprinting;
      e.char.update(dt, a);
    }
    // 6. viewmodel, VFX, audio, HUD
    if (p && this.inMatch) {
      const vmOn = p.alive && rig.isFpsView && !ctx.scope.lensOn && !ctx.debug.noclip;
      ctx.viewmodel.setVisible(vmOn);
      this.engine.showViewmodel = vmOn;
      if (vmOn) {
        const fi = CFG.player.footstepInterval;
        ctx.viewmodel.update(dt, { ads: ctx.scope.ads, sprint: p.ctrl.sprinting, reload: p.weapon.reloadProgress,
          speed: p.ctrl.speedH, stepInterval: p.ctrl.crouched ? fi.crouch : p.ctrl.sprinting ? fi.sprint : fi.normal,
          grounded: p.ctrl.grounded, mouseDx: looking ? inp.dx : 0, mouseDy: looking ? inp.dy : 0, grenade: p.weapon.slot === 'grenade' });
      }
    } else this.engine.showViewmodel = false;
    ctx.vfx.update(dt);
    ctx.grenades.update();
    ctx.audio.updateListener(cam);
    if (this.inMatch) {
      const sp = p ? spreadDeg(p.weapon.adsActive, p.airborne, p.ctrl.speedH > CFG.combat.spread.movingSpeed, p.crouched) : 0;
      ctx.hud.update(rawDt, p, sp, inp.isDown('Tab') && looking);
      ctx.match.update(dt, rawDt);
    }
    this.debugPanel.update(rawDt, cam);
    this.stats.update(this.loop.lastFrameMs, rawDt);
    this.perf.sample(this.loop.lastFrameMs, this.engine.renderer.info.render.calls, this.engine.renderer.info.render.triangles,
      ctx.props.awakeCount + ctx.deathFx.activeBodies);
    this.engine.dynRes.update(this.loop.lastFrameMs, rawDt);
  }

  private render() { this.engine.render(); }

  // ───────────────────────────────── input senjata/granat pemain
  private playerWeapon(dt: number, looking: boolean) {
    const p = ctx.player!, inp = this.input, w = p.weapon, t = this.trig, g = this.gIn;
    const active = looking && p.alive && !ctx.match.locked && !ctx.debug.noclip;
    const lP = active && inp.mousePressed[0], lH = active && inp.mouseDown[0], lR = inp.mouseReleased[0];
    const rP = active && inp.mousePressed[2], rH = active && inp.mouseDown[2], rR = inp.mouseReleased[2];
    // granat: G/4 equip, 1 kembali ke AR, scroll menukar
    g.equip = active && (inp.wasPressed('KeyG') || inp.wasPressed('Digit4') || (inp.wheel !== 0 && w.slot === 'ar'));
    g.toAr = active && (inp.wasPressed('Digit1') || (inp.wheel !== 0 && w.slot === 'grenade'));
    const nade = w.slot === 'grenade' || p.grenadeState !== 'NONE';
    g.lPress = nade && lP; g.lHeld = nade && lH; g.lRelease = nade && lR;
    g.rPress = nade && rP; g.rHeld = nade && rH; g.rRelease = nade && rR;
    // ADS: tahan / toggle
    if (!this.settings.adsToggle) this.adsToggled = rH;
    else if (rP && !nade) this.adsToggled = !this.adsToggled;
    if (w.reloading || nade || !p.alive) this.adsToggled = this.settings.adsToggle ? false : this.adsToggled;
    t.pressed = !nade && lP; t.held = !nade && lH;
    t.reload = active && inp.wasPressed('KeyR'); t.modeSwitch = active && inp.wasPressed('KeyB');
    t.ads = active && !nade && this.adsToggled;
    t.sprinting = p.ctrl.sprinting;
    if (!p.alive || ctx.match.locked) return;
    w.update(dt, ctx.time, t, () => fireOne(p));
    ctx.grenades.handle(p, g, dt);
    ctx.viewmodel.setWeapon(p.loadout.weapon, p.loadout.scope); // no-op bila loadout tidak berubah
  }

  private throwPose(e: Entity): number {
    const over = e.throwOver;
    if (e.grenadeState === 'COOKING' || e.grenadeState === 'READY' && false) return D2R(over ? XCFG.anim.throwOverPull : XCFG.anim.throwUnderPull);
    if (e.throwAnimT >= 0) {
      const A = XCFG.anim, from = D2R(over ? A.throwOverPull : A.throwUnderPull), to = D2R(over ? A.throwOverSwing : A.throwUnderSwing);
      const t = e.throwAnimT;
      if (t < A.throwPullTime * 0 + A.throwSwingTime) return THREE.MathUtils.lerp(from, to, t / A.throwSwingTime);
      if (t < A.throwSwingTime + A.throwReturnTime) return THREE.MathUtils.lerp(to, D2R(90) + e.pitch, (t - A.throwSwingTime) / A.throwReturnTime);
    }
    return NaN;
  }

  /** Setelah mati: kamera tetap di posisi terakhir (sedikit mundur). */
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
    if (on) { this.noclipPos.copy(ctx.camRig.position); this.noclipPos.y -= 0; if (p) p.ctrl.setEnabled(false); }
    else if (p && p.alive) p.ctrl.setEnabled(true);
  }

  private noclip(dt: number) {
    const inp = this.input, rig = ctx.camRig, sp = (inp.isDown('ShiftLeft') ? 40 : 14) * dt;
    rig.forward(_v); rig.right(_w);
    if (inp.isDown('KeyW')) this.noclipPos.addScaledVector(_v, sp);
    if (inp.isDown('KeyS')) this.noclipPos.addScaledVector(_v, -sp);
    if (inp.isDown('KeyD')) this.noclipPos.addScaledVector(_w, sp);
    if (inp.isDown('KeyA')) this.noclipPos.addScaledVector(_w, -sp);
    if (inp.isDown('Space')) this.noclipPos.y += sp;
    if (inp.isDown('KeyC')) this.noclipPos.y -= sp;
  }

  /** Dummy R6 di jembatan pada jarak 10/40/70 u dari mulut jembatan Barat-Selatan; pemain dipindah ke titik uji. */
  private spawnDummies() {
    if (!this.inMatch || !ctx.player) return;
    let id = 100 + this.dummies.length * 3;
    for (const d of [10, 40, 70]) {
      const e = new Entity(id++, `Dummy ${d}u`, 'red', false, false);
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
      const e = new Entity(160 + i, `Stress${i}`, 'red', false, this.settings.preset === 'HIGH');
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
