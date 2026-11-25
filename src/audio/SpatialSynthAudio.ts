// src/audio/SpatialSynthAudio.ts — graf audio, panner HRTF, okklusi, 24 voice berprioritas (GDD §10.3–10.6)
import * as THREE from 'three';
import { CFG } from '../config/gameConfig';
import { XCFG } from '../config/extraConfig';
import { physics } from '../physics/Physics';
import { bus } from '../core/EventBus';
import { ctx } from '../game/ctx';
import { WEAPONS, type WeaponId } from '../config/weaponsData';
import * as R from './Recipes';

const XA = XCFG.audio;
export type Category = 'shot' | 'explosion' | 'footstep' | 'impact' | 'own' | 'ui';

interface Voice { input: GainNode; out: AudioNode; occl: BiquadFilterNode; panner: PannerNode | null; priority: number; start: number; end: number;
  pos: THREE.Vector3 | null; nextCheck: number; occluded: boolean }

const _fwd = new THREE.Vector3(), _up = new THREE.Vector3();

export class SpatialSynthAudio {
  ac: AudioContext | null = null;
  private master!: GainNode; private sfx!: GainNode; private ui!: GainNode; private tinnitusLp!: BiquadFilterNode;
  /** Bus voice chat (ke master: ikut volume master, kompresor & efek telinga berdenging). */
  private voiceBus!: GainNode;
  private voiceVol = 0.9;
  private noise!: AudioBuffer;
  private voices: Voice[] = [];
  private vol: { master: number; sfx: number; ui: number } = { master: CFG.audio.master, sfx: CFG.audio.sfx, ui: CFG.audio.ui };
  private listenerPos = new THREE.Vector3();
  // keadaan listener yang terakhir dikirim ke Web Audio (lihat XCFG.audio.listener)
  private sentPos = new THREE.Vector3(1e9, 0, 0);
  private sentFwd = new THREE.Vector3();
  private sentUp = new THREE.Vector3();
  private sentT = -1;

  constructor() { this.subscribe(); }

  /** AudioContext dibuat/di-resume pada klik pertama pengguna (kebijakan autoplay). */
  unlock() {
    if (!this.ac) {
      const ac = new AudioContext();
      this.ac = ac;
      const comp = ac.createDynamicsCompressor();
      comp.threshold.value = XA.compressor.threshold; comp.knee.value = XA.compressor.knee; comp.ratio.value = XA.compressor.ratio;
      comp.attack.value = XA.compressor.attack; comp.release.value = XA.compressor.release;
      this.tinnitusLp = ac.createBiquadFilter(); this.tinnitusLp.type = 'lowpass'; this.tinnitusLp.frequency.value = XA.tinnitusBypass;
      this.master = ac.createGain(); this.sfx = ac.createGain(); this.ui = ac.createGain();
      this.sfx.connect(this.master); this.ui.connect(this.master);
      this.voiceBus = ac.createGain(); this.voiceBus.gain.value = this.voiceVol; this.voiceBus.connect(this.master);
      this.master.connect(this.tinnitusLp).connect(comp).connect(ac.destination);
      // satu buffer white noise 1 detik, dipakai ulang dengan offset acak
      this.noise = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      this.applyVolumes();
    }
    if (this.ac.state !== 'running') void this.ac.resume();
  }

  setVolumes(master: number, sfx: number, ui: number) { this.vol = { master, sfx, ui }; this.applyVolumes(); }
  private applyVolumes() {
    if (!this.ac) return;
    this.master.gain.value = CFG.audio.master * this.vol.master / CFG.audio.master;
    this.sfx.gain.value = this.vol.sfx; this.ui.gain.value = this.vol.ui;
  }

  get voiceCount() { return this.voices.length; }

  /** Volume voice chat (0–1; 0 = tidak terdengar). */
  setVoiceVolume(v: number) { this.voiceVol = v; if (this.ac) this.voiceBus.gain.value = v; }
  /** Konteks & bus untuk pemutar voice (null sebelum audio dibuka klik pertama / saat konteks berhenti). */
  voiceOut(): { ac: AudioContext; bus: AudioNode } | null {
    return this.ac && this.ac.state === 'running' ? { ac: this.ac, bus: this.voiceBus } : null;
  }

  /** Efek telinga berdenging: lowpass master 800 Hz selama `sec`. */
  tinnitus(sec: number) {
    if (!this.ac) return;
    const f = this.tinnitusLp.frequency, t = this.ac.currentTime;
    f.cancelScheduledValues(t);
    f.setValueAtTime(XCFG.explosion.tinnitusHz, t);
    f.setValueAtTime(XCFG.explosion.tinnitusHz, t + sec * 0.7);
    f.exponentialRampToValueAtTime(XA.tinnitusBypass, t + sec);
  }

  play(recipe: R.Recipe, cat: Category, pos: THREE.Vector3 | null, priority: number, gain = 1) {
    const ac = this.ac;
    if (!ac || ac.state !== 'running') return;
    const now = ac.currentTime;
    this.reap(now);
    if (this.voices.length >= CFG.audio.voiceLimit) {
      let vi = -1;
      for (let i = 0; i < this.voices.length; i++) {
        const v = this.voices[i];
        if (vi < 0 || v.priority < this.voices[vi].priority || (v.priority === this.voices[vi].priority && v.start < this.voices[vi].start)) vi = i;
      }
      if (vi < 0 || this.voices[vi].priority > priority) return;
      this.kill(vi);
    }
    const input = ac.createGain(); input.gain.value = gain;
    const occl = ac.createBiquadFilter(); occl.type = 'lowpass'; occl.frequency.value = 20000;
    input.connect(occl);
    let panner: PannerNode | null = null;
    const bus = cat === 'ui' ? this.ui : this.sfx;
    if (pos && cat !== 'own' && cat !== 'ui') {
      const c = XA.panner[cat as 'shot' | 'explosion' | 'footstep' | 'impact'];
      panner = ac.createPanner();
      panner.panningModel = c.model as PanningModelType; panner.distanceModel = c.dist as DistanceModelType;
      panner.refDistance = c.ref; panner.maxDistance = c.max; panner.rolloffFactor = c.rolloff;
      panner.positionX.value = pos.x; panner.positionY.value = pos.y; panner.positionZ.value = pos.z;
      occl.connect(panner).connect(bus);
    } else occl.connect(bus);
    const dur = recipe({ ac, noise: this.noise }, input, now + 0.005);
    const v: Voice = { input, out: panner ?? occl, occl, panner, priority, start: now, end: now + dur + 0.05,
      pos: pos ? pos.clone() : null, nextCheck: now + XA.occlusion.recheck, occluded: false };
    if (v.pos) this.checkOcclusion(v, true);
    this.voices.push(v);
  }

  /** Okklusi: LOS listener → sumber; terhalang STATIC → lowpass 1200 Hz + gain 0.6. */
  private checkOcclusion(v: Voice, initial: boolean) {
    if (!v.pos || !this.ac) return;
    const L = this.listenerPos;
    const blocked = physics.losBlocked(L.x, L.y, L.z, v.pos.x, v.pos.y + 0.5, v.pos.z);
    if (blocked === v.occluded && !initial) return;
    v.occluded = blocked;
    const t = this.ac.currentTime;
    v.occl.frequency.setTargetAtTime(blocked ? XA.occlusion.lowpass : 20000, t, 0.03);
    v.input.gain.setTargetAtTime(blocked ? XA.occlusion.gain : 1, t, 0.03);
  }

  private kill(i: number) {
    const v = this.voices[i];
    try { v.input.disconnect(); v.out.disconnect(); } catch { /* sudah terputus */ }
    this.voices.splice(i, 1);
  }

  private reap(now: number) {
    for (let i = this.voices.length - 1; i >= 0; i--) if (this.voices[i].end < now) this.kill(i);
  }

  /** Listener mengikuti posisi & orientasi kamera: maks. 30x/detik dan hanya bila kamera bergerak/berputar (XA.listener). */
  updateListener(cam: THREE.Camera) {
    const ac = this.ac;
    if (!ac) return;
    const l = ac.listener, LS = XA.listener;
    this.listenerPos.copy(cam.position);             // okklusi tetap memakai posisi terbaru setiap frame
    cam.getWorldDirection(_fwd); _up.set(0, 1, 0).applyQuaternion(cam.quaternion);
    const t = ac.currentTime;
    const changed = this.sentPos.distanceToSquared(cam.position) > LS.moveSq || this.sentFwd.dot(_fwd) < LS.turnDot
      || this.sentUp.dot(_up) < LS.turnDot;
    // konteks suspended: currentTime berhenti → event menumpuk di timeline AudioParam (makin mahal tiap panggilan)
    if (changed && ac.state === 'running' && (t - this.sentT >= LS.interval || t < this.sentT)) {
      this.sentT = t; this.sentPos.copy(cam.position); this.sentFwd.copy(_fwd); this.sentUp.copy(_up);
      if (l.positionX) {
        l.positionX.setValueAtTime(cam.position.x, t); l.positionY.setValueAtTime(cam.position.y, t); l.positionZ.setValueAtTime(cam.position.z, t);
        l.forwardX.setValueAtTime(_fwd.x, t); l.forwardY.setValueAtTime(_fwd.y, t); l.forwardZ.setValueAtTime(_fwd.z, t);
        l.upX.setValueAtTime(_up.x, t); l.upY.setValueAtTime(_up.y, t); l.upZ.setValueAtTime(_up.z, t);
      } else {
        (l as unknown as { setPosition(x: number, y: number, z: number): void }).setPosition(cam.position.x, cam.position.y, cam.position.z);
        (l as unknown as { setOrientation(...a: number[]): void }).setOrientation(_fwd.x, _fwd.y, _fwd.z, _up.x, _up.y, _up.z);
      }
    }
    // suara > 0.5 s dicek ulang setiap 100 ms
    const now = ac.currentTime;
    for (const v of this.voices) {
      if (v.pos && v.end - v.start > XA.occlusion.longSound && now >= v.nextCheck) { v.nextCheck = now + XA.occlusion.recheck; this.checkOcclusion(v, false); }
    }
  }

  private subscribe() {
    const P = XA.priority;
    const isPlayer = (id: number) => ctx.player?.id === id;
    bus.on('shot', (e) => {
      const w = WEAPONS[e.weaponId];
      const rec = R.gunshot(w.caliber, w.audioPitch * (0.97 + Math.random() * 0.06));
      if (isPlayer(e.shooterId)) this.play(rec, 'own', null, P.own, 0.55);
      else this.play(rec, 'shot', e.origin, P.enemyShot, 1.0);
    });
    bus.on('hit', (e) => {
      if (!isPlayer(e.attackerId) || e.victimId === e.attackerId) return;
      this.play(e.headshot ? R.hitHead : R.hitBody, 'ui', null, P.ui);
    });
    bus.on('kill', (e) => { if (isPlayer(e.killerId) && e.killerId !== e.victimId) this.play(R.killTone, 'ui', null, P.ui); });
    bus.on('death', (e) => {
      const v = ctx.byId.get(e.entityId);
      if (v) this.play(R.deathPopClack, isPlayer(v.id) ? 'own' : 'impact', v.pos, P.impact + 1);
    });
    bus.on('footstep', (e) => {
      const own = isPlayer(e.entityId);
      const ent = ctx.byId.get(e.entityId);
      const vol = (ent?.crouched ? XCFG.anim.crouchStepVolume : 1) * (e.loud ? 1.2 : 0.9);
      this.play(R.footstep(e.material, e.land), own ? 'own' : 'footstep', own ? null : e.position, P.footstep, own ? vol * 0.45 : vol);
    });
    bus.on('grenade:explode', (e) => this.play(R.explosion, 'explosion', e.position, P.explosion, 1.0));
    bus.on('flash:explode', (e) => this.play(R.flashBang, 'explosion', e.position, P.explosion, 1.0));
    bus.on('grenade:bounce', (e) => this.play(R.bounce(e.material, e.speed), 'impact', e.position, P.impact));
    bus.on('reload', (e) => {
      const ent = ctx.byId.get(e.entityId);
      if (ent) this.play(R.reloadStage(e.stage), isPlayer(e.entityId) ? 'own' : 'impact', isPlayer(e.entityId) ? null : ent.pos, P.impact, 0.7);
    });
    bus.on('dryfire', (e) => { if (isPlayer(e.entityId)) this.play(R.dryFire, 'own', null, P.own); });
    bus.on('pin', (e) => {
      const ent = ctx.byId.get(e.entityId);
      if (ent) this.play(R.pin, isPlayer(e.entityId) ? 'own' : 'impact', isPlayer(e.entityId) ? null : ent.pos, P.impact);
    });
    bus.on('impact', (e) => { if (Math.random() < 0.5) this.play(R.impactTick(e.material), 'impact', e.position, P.impact, 0.5); });
    bus.on('spawn', (e) => { if (isPlayer(e.entityId)) this.play(R.spawnChime, 'ui', null, P.ui); });
    bus.on('melee', (e) => {
      const own = isPlayer(e.entityId), knife = e.kind !== 'butt';
      const rec = e.phase === 'swing' ? (knife ? (e.kind === 'stab' ? R.stabWhoosh : R.slashWhoosh) : R.whoosh)
        : knife ? (e.phase === 'hit' ? R.knifeHit : R.knifeWall) : R.meleeThud;
      this.play(rec, own ? 'own' : 'impact', own ? null : e.position, own ? P.own : P.impact, e.phase === 'wall' && !knife ? 0.6 : 1);
    });
    bus.on('weapon:drop', (e) => this.play(R.weaponDrop, 'impact', e.position, P.impact, 0.8));
    bus.on('weapon:pickup', (e) => { if (isPlayer(e.entityId)) this.play(R.weaponPickup, 'own', null, P.own); });
  }

  /** Suara UI non-spasial (medali, assist, hitung mundur, jingle). */
  playUi(recipe: R.Recipe, gain = 1) { this.play(recipe, 'ui', null, XA.priority.ui, gain); }
  playOwn(recipe: R.Recipe, gain = 1) { this.play(recipe, 'own', null, XA.priority.own, gain); }
  /** Tembakan tanpa event bus (replay killcam): pos null = suara "milik sendiri". */
  playGunshot(weaponId: WeaponId, pos: THREE.Vector3 | null) {
    const w = WEAPONS[weaponId];
    const rec = R.gunshot(w.caliber, w.audioPitch * (0.97 + Math.random() * 0.06));
    if (pos) this.play(rec, 'shot', pos, XA.priority.enemyShot, 1.0); else this.play(rec, 'own', null, XA.priority.own, 0.55);
  }

  click() { this.play(R.uiClick, 'ui', null, XA.priority.ui); }
}
