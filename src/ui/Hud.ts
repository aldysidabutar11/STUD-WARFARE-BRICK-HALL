// src/ui/Hud.ts — HUD overlay DOM (GDD §13, §7.4, §6.1). Teks hanya diperbarui saat nilainya berubah.
// Tambahan pasca-MVP: crosshair kustom, prompt reload/amunisi, kilat luka, indikator granat, kartu pembunuh & killcam,
// status menonton, pip pemain hidup (Eliminasi), bar progres reload.
import * as THREE from 'three';
import { CFG } from '../config/gameConfig';
import { XCFG } from '../config/extraConfig';
import { flashWhite, type FlashExposure } from '../combat/Flash';
import { SCOPES, WEAPONS, type ScopeId } from '../config/weaponsData';
import { MELEES, isMeleeId } from '../config/weaponsExtra';
import { bus, type KillWeapon } from '../core/EventBus';
import { keyLabel } from '../core/Bindings';
import { ctx } from '../game/ctx';
import type { Entity } from '../entities/Entity';
import type { Settings } from './Settings';
import type { DroppedWeapon } from '../combat/WeaponDrops';
import { Crosshair } from './Crosshair';

/** Nama pemain dari jaringan → teks aman di innerHTML (nama juga sudah dibersihkan cleanName). */
const escHtml = (t: string) => t.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const h = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = '') => {
  const e = document.createElement(tag); if (cls) e.className = cls; if (html) e.innerHTML = html; return e;
};
const fmtTime = (s: number) => { const m = Math.floor(s / 60), r = Math.floor(s % 60); return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`; };
const MODE_LABEL: Record<string, string> = { AUTO: 'AUTO', SINGLE: 'SINGLE', BURST2: 'BURST', BURST3: 'BURST' };
const _v = new THREE.Vector3();

export const weaponLabel = (w: KillWeapon) => w === 'k400' ? 'K-400' : w === 'fall' ? 'jatuh' : w === 'melee' ? 'Pukul'
  : w === 'knife' ? 'Pisau'
  : isMeleeId(w) ? MELEES[w].name
  : WEAPONS[w as keyof typeof WEAPONS]?.name ?? w;

/** Reticle SVG prosedural per optik (§6.1, ukuran @1080p, diskalakan ke tinggi layar). */
function reticleSvg(id: ScopeId, lensPx: number): string {
  const k = innerHeight / 1080, L = lensPx;
  switch (id) {
    case 'x2': {
      const r = 20 * k;
      return `<svg width="${L}" height="${L}" viewBox="${-L / 2} ${-L / 2} ${L} ${L}"><circle r="${r}" fill="none" stroke="#3CFF6B" stroke-width="${2 * k}"/>` +
        `<circle r="${2 * k}" fill="#3CFF6B"/><line x1="0" y1="${r + 6 * k}" x2="0" y2="${r + 40 * k}" stroke="#3CFF6B" stroke-width="${2 * k}"/></svg>`;
    }
    case 'x3': {
      const g = 6 * k, c = '#FF3B30';
      return `<svg width="${L}" height="${L}" viewBox="${-L / 2} ${-L / 2} ${L} ${L}">` +
        `<line x1="${-L / 2}" y1="0" x2="${-L / 6}" y2="0" stroke="${c}" stroke-width="${5 * k}"/><line x1="${L / 6}" y1="0" x2="${L / 2}" y2="0" stroke="${c}" stroke-width="${5 * k}"/>` +
        `<line x1="0" y1="${L / 6}" x2="0" y2="${L / 2}" stroke="${c}" stroke-width="${5 * k}"/>` +
        `<line x1="${-L / 6}" y1="0" x2="${-g}" y2="0" stroke="${c}" stroke-width="${1.5 * k}"/><line x1="${g}" y1="0" x2="${L / 6}" y2="0" stroke="${c}" stroke-width="${1.5 * k}"/>` +
        `<line x1="0" y1="${g}" x2="0" y2="${L / 6}" stroke="${c}" stroke-width="${1.5 * k}"/><line x1="0" y1="${-L / 6}" x2="0" y2="${-g}" stroke="${c}" stroke-width="${1.5 * k}"/></svg>`;
    }
    case 'x4': {
      const s = 18 * k, c = '#FF2A2A';
      let ticks = '';
      for (let i = 1; i <= 3; i++) ticks += `<line x1="${-(10 - i * 2) * k}" y1="${s + i * 16 * k}" x2="${(10 - i * 2) * k}" y2="${s + i * 16 * k}" stroke="${c}" stroke-width="${2 * k}"/>`;
      return `<svg width="${L}" height="${L}" viewBox="${-L / 2} ${-L / 2} ${L} ${L}"><polygon points="0,0 ${-s / 2},${s} ${s / 2},${s}" fill="${c}"/>` +
        `<line x1="0" y1="${s}" x2="0" y2="${s + 60 * k}" stroke="${c}" stroke-width="${1.5 * k}"/>${ticks}</svg>`;
    }
    case 'x6': {
      const c = '#000';
      const mil = (L / 2) / 10; // titik setiap 1 mil
      let dots = '';
      for (let i = -9; i <= 9; i++) if (i) dots += `<circle cx="${i * mil}" cy="0" r="${2 * k}" fill="${c}"/><circle cx="0" cy="${i * mil}" r="${2 * k}" fill="${c}"/>`;
      return `<svg width="${L}" height="${L}" viewBox="${-L / 2} ${-L / 2} ${L} ${L}"><line x1="${-L / 2}" y1="0" x2="${L / 2}" y2="0" stroke="${c}" stroke-width="${1.5 * k}"/>` +
        `<line x1="0" y1="${-L / 2}" x2="0" y2="${L / 2}" stroke="${c}" stroke-width="${1.5 * k}"/>${dots}</svg>`;
    }
    default: return '';
  }
}

export class Hud {
  readonly root = document.getElementById('hud') as HTMLDivElement;
  /** Crosshair kustom (bentuk/perilaku/warna — ui/Crosshair.ts). */
  private xhc = new Crosshair();
  private xh = this.xhc.el;
  private hm = h('div', 'hitmarker');
  private hmT = 0;
  private vign = h('div', 'vignette');
  private hurt = h('div', 'hurt');
  private hurtA = 0;
  private ring = h('div', 'ring');
  private ringArc: SVGPathElement;
  private rbar = h('div', 'rbar', '<i></i>');
  private dmgWrap = h('div', 'dmg-ind');
  private dmgArcs: { el: SVGPathElement; t: number; x: number; z: number }[] = [];
  private hp = h('div', 'hp', '<div class="num">100</div><div class="bar"><i style="width:100%"></i></div>');
  private ammo = h('div', 'ammo', '<div class="wname"></div><div class="cnt">30 <small>| 120</small></div><div class="meta"><span class="badge mode">AUTO</span><span class="optic"></span><span class="gren"><i></i>×1</span></div>');
  private score = h('div', 'score', '<span class="b">BIRU 0</span><span class="sep">—</span><span class="r">0 MERAH</span><span class="sep">·</span><span class="t">10:00</span>');
  private pips = h('div', 'pips', '<span class="pb"></span><span class="pr"></span>');
  private feed = h('div', 'killfeed');
  private center = h('div', 'center-msg');
  private prompt = h('div', 'prompt');
  /** Bar slot senjata (1 utama · 2 pistol · 3 pisau · 4 granat · 5 flashbang), slot aktif menyala. */
  private slots = h('div', 'slots', '<div class="s"><b></b><span></span></div><div class="s"><b></b><span></span></div><div class="s"><b></b><span>Pisau</span></div><div class="s"><b></b><span>K-400</span></div><div class="s"><b></b><span>Flash</span></div>');
  /** Flashbang: layar putih + "bayangan" gambar terakhir (afterimage) yang memudar (combat/Flash.flashWhite). */
  private readonly flashImg = document.createElement('canvas');
  private readonly flashEl = h('div', 'flashbang', '');
  private flashX: FlashExposure | null = null;
  private flashT0 = 0;
  private flashSnap = false;
  /** Senjata tim sendiri terdekat (diisi Game) → prompt ambil/tukar. */
  pickup: DroppedWeapon | null = null;
  private toastText = ''; private toastT = 0;
  private banner = h('div', 'banner');
  private countdownEl = h('div', 'countdown');
  private board = h('div', 'scoreboard');
  private lens = h('div', 'lens', '<svg class="mask" width="100%" height="100%"></svg><div class="ret-wrap"></div>');
  private dot = h('div', 'dot-ret');
  private gw: HTMLDivElement[] = [];
  private killer = h('div', 'killer');
  private kc = h('div', 'kc', '<div class="bar top"></div><div class="bar bot"></div><div class="kc-t"><b>KILLCAM</b><span>Klik / Spasi untuk lewati</span></div>');
  private spec = h('div', 'spec');
  /** Online: peringatan ping tinggi pemain ini. */
  private pingWarn = h('div', 'ping-warn');
  private last: Record<string, string | number | boolean> = {};
  /** Rekan yang sedang ditonton (Eliminasi), diisi Game. */
  spectating: Entity | null = null;
  visible = false;

  constructor() {
    this.ring.innerHTML = '<svg viewBox="-34 -34 68 68" width="68" height="68"><circle r="28" fill="none" stroke="rgba(0,0,0,0.4)" stroke-width="4"/><path fill="none" stroke-width="4" stroke-linecap="round"/></svg>';
    this.ringArc = this.ring.querySelector('path')!;
    this.dmgWrap.innerHTML = '<svg viewBox="-90 -90 180 180"></svg>';
    const svg = this.dmgWrap.querySelector('svg')!;
    for (let i = 0; i < 4; i++) {
      const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      p.setAttribute('fill', 'none'); p.setAttribute('stroke', '#ff2a2a'); p.setAttribute('stroke-width', '7'); p.setAttribute('stroke-linecap', 'round');
      p.style.opacity = '0'; svg.appendChild(p);
      this.dmgArcs.push({ el: p, t: 0, x: 0, z: 0 });
    }
    for (let i = 0; i < 4; i++) { const g = h('div', 'gw', '<i></i><b>!</b>'); g.style.display = 'none'; this.gw.push(g); }
    this.flashImg.className = 'flash-img';
    this.root.append(this.flashImg, this.flashEl);   // paling bawah di HUD: widget HUD tetap terlihat di atas layar putih
    this.root.append(this.lens, this.dot, this.hurt, this.vign, this.xh, this.hm, this.ring, this.rbar, this.dmgWrap, this.hp, this.ammo, this.slots,
      this.score, this.pips, this.feed, this.center, this.prompt, this.countdownEl, this.banner, this.killer, this.spec, this.kc, ...this.gw, this.board,
      this.pingWarn);
    this.setVisible(false);
    bus.on('shot', (e) => { if (ctx.player && e.shooterId === ctx.player.id) this.xhc.kick(); }); // crosshair mekar saat menembak
    bus.on('hit', (e) => {
      const p = ctx.player;
      if (!p) return;
      if (e.attackerId === p.id && e.victimId !== p.id) this.hitmarker(e.headshot ? 'head' : 'body');
      if (e.victimId === p.id) {
        if (e.attackerId >= 0 && e.attackerId !== p.id) this.damageFrom(e.fromX, e.fromZ);
        this.hurtA = Math.min(0.85, this.hurtA + e.damage / 45);
      }
    });
    bus.on('kill', (e) => {
      const k = ctx.byId.get(e.killerId), v = ctx.byId.get(e.victimId);
      if (!v) return;
      if (ctx.player && e.killerId === ctx.player.id && e.victimId !== ctx.player.id) this.hitmarker('kill');
      this.killfeed(k ?? v, v, e.weaponId, e.headshot);
    });
  }

  setVisible(v: boolean) { this.visible = v; this.root.style.display = v ? 'block' : 'none'; }

  /** Terapkan pengaturan crosshair (bentuk, perilaku, warna RGBA, outline, ukuran, pengali dinamis). */
  applyCrosshair(s: Settings) { this.xhc.apply(s); }

  private set(key: string, val: string | number | boolean, fn: () => void) { if (this.last[key] !== val) { this.last[key] = val; fn(); } }

  hitmarker(kind: 'body' | 'head' | 'kill') {
    this.hm.className = 'hitmarker' + (kind === 'head' ? ' head' : kind === 'kill' ? ' kill' : '');
    this.hm.style.opacity = '1';
    this.hmT = kind === 'kill' ? XCFG.vfx.killmarker : XCFG.vfx.hitmarker;
  }

  damageFrom(x: number, z: number) {
    const a = this.dmgArcs.reduce((m, c) => (c.t < m.t ? c : m), this.dmgArcs[0]);
    a.t = XCFG.vfx.dmgIndicatorFade; a.x = x; a.z = z;
  }

  killfeed(killer: Entity, victim: Entity, weapon: KillWeapon, hs: boolean) {
    const w = weaponLabel(weapon);
    const row = h('div');
    const kc = killer.team === 'blue' ? 'bt' : 'rt', vc = victim.team === 'blue' ? 'bt' : 'rt';
    const me = (e: Entity) => (e.isPlayer ? ' me' : '');
    row.innerHTML = killer === victim ? `<span class="${vc}${me(victim)}">${victim.name}</span><span class="w">[${w}]</span>`
      : `<span class="${kc}${me(killer)}">${killer.name}</span><span class="w">[${w}]${hs ? ' ◎' : ''}</span><span class="${vc}${me(victim)}">${victim.name}</span>`;
    if (killer.isPlayer || victim.isPlayer) row.classList.add('mine');
    this.pushFeed(row);
  }

  /** Baris pemberitahuan di kill feed (mis. streak musuh). */
  notice(text: string, team: 'blue' | 'red') {
    const row = h('div', 'notice ' + (team === 'blue' ? 'bt' : 'rt'));
    row.textContent = text;
    this.pushFeed(row);
  }

  private pushFeed(row: HTMLElement) {
    this.feed.prepend(row);
    while (this.feed.children.length > XCFG.hud.killFeedMax) this.feed.lastChild!.remove();
    setTimeout(() => row.remove(), XCFG.hud.killFeedTime * 1000);
  }

  showBanner(text: string, color: string, sub = '') {
    this.banner.innerHTML = text ? `${text}${sub ? `<small>${sub}</small>` : ''}` : '';
    this.banner.style.color = color; this.banner.style.display = text ? 'block' : 'none';
  }

  clearFeed() { this.feed.innerHTML = ''; this.hurtA = 0; for (const a of this.dmgArcs) a.t = 0; }

  /** Pesan singkat di area prompt (mis. "Hanya senjata utama yang bisa dibuang"). */
  toast(text: string) { this.toastText = text; this.toastT = XCFG.drop.toastTime; }

  /** Kena flash: putih (puncak paparan) → pulih bertahap; gambar layar saat itu jadi bayangan yang memudar sedikit lebih lambat. */
  flash(x: FlashExposure) {
    if (this.flashX && flashWhite(this.flashX, (performance.now() - this.flashT0) / 1000) > x.peak) return;
    this.flashX = x; this.flashT0 = performance.now(); this.flashSnap = true;
  }

  /** Game: setelah render — salin kanvas WebGL (setengah resolusi) untuk bayangan, sekali per flash. */
  snapFlash(src: HTMLCanvasElement) {
    if (!this.flashSnap) return;
    this.flashSnap = false;
    const c = this.flashImg, w = Math.max(1, Math.round(src.width / 2)), hh = Math.max(1, Math.round(src.height / 2));
    if (c.width !== w || c.height !== hh) { c.width = w; c.height = hh; }
    try { c.getContext('2d')?.drawImage(src, 0, 0, w, hh); } catch { /* kanvas hilang */ }
  }

  clearFlash() { this.flashX = null; this.flashSnap = false; this.flashEl.style.opacity = '0'; this.flashImg.style.opacity = '0'; }

  private updateFlash(p: Entity | null) {
    const x = this.flashX;
    if (!x) return;
    if (p && !p.blindX) { this.clearFlash(); return; }   // respawn / match baru
    const t = (performance.now() - this.flashT0) / 1000, w = flashWhite(x, t);
    this.flashEl.style.opacity = w.toFixed(3);
    this.flashImg.style.opacity = (Math.min(1, w * 1.6) * 0.85).toFixed(3);
    if (w <= 0 && t > x.hold) this.clearFlash();
  }

  update(dt: number, p: Entity | null, spreadDeg: number, showBoard: boolean) {
    this.updateFlash(p);
    const kc = ctx.killcam, replay = !!kc?.replaying;
    const pw = ctx.net.role === 'client' && p && p.ping >= XCFG.net.pingWarn ? `⚠ Ping ${p.ping} ms` : '';
    if (this.last.pingWarn !== pw) { this.last.pingWarn = pw; this.pingWarn.textContent = pw; this.pingWarn.style.display = pw ? 'block' : 'none'; }
    this.root.classList.toggle('replay', replay);
    this.kc.style.display = replay ? 'block' : 'none';
    // hitmarker & indikator arah damage
    if (this.hmT > 0) { this.hmT -= dt; if (this.hmT <= 0) this.hm.style.opacity = '0'; }
    if (this.hurtA > 0.001) { this.hurtA *= Math.exp(-3.2 * dt); this.hurt.style.opacity = this.hurtA.toFixed(3); }
    else if (this.hurt.style.opacity !== '0') this.hurt.style.opacity = '0';
    const yaw = ctx.camRig.yaw;
    for (const a of this.dmgArcs) {
      if (a.t <= 0) continue;
      a.t -= dt;
      if (p) {
        // arah ke penyerang dalam basis kamera: right = (cos yaw, −sin yaw), forward = (−sin yaw, −cos yaw)
        const dx = a.x - p.pos.x, dz = a.z - p.pos.z;
        const xr = dx * Math.cos(yaw) - dz * Math.sin(yaw), yr = -dx * Math.sin(yaw) - dz * Math.cos(yaw);
        const phi = Math.atan2(xr, yr); // 0 = depan (atas layar), positif = kanan
        const r = XCFG.vfx.dmgIndicatorRadius * 0.8, s = 0.35;
        a.el.setAttribute('d', `M ${Math.sin(phi - s) * r} ${-Math.cos(phi - s) * r} A ${r} ${r} 0 0 1 ${Math.sin(phi + s) * r} ${-Math.cos(phi + s) * r}`);
      }
      a.el.style.opacity = String(Math.max(0, a.t / XCFG.vfx.dmgIndicatorFade));
    }
    this.updateScore();
    this.board.classList.toggle('on', showBoard);
    if (showBoard) this.renderBoard();

    if (!p) return;
    // HP & amunisi milik entitas yang sedang dilihat (pemain, atau rekan yang ditonton saat mati di Eliminasi)
    const v = !p.alive && this.spectating ? this.spectating : p;
    const w = v.weapon;
    const hpv = Math.round(v.hp);
    this.set('hp', `${v.id}|${hpv}`, () => {
      (this.hp.children[0] as HTMLElement).textContent = String(hpv);
      (this.hp.querySelector('.bar i') as HTMLElement).style.width = `${hpv}%`;
      this.hp.classList.toggle('low', hpv < XCFG.vfx.lowHpVignette);
    });
    this.vign.style.opacity = p.alive && p.hp < XCFG.vfx.lowHpVignette ? '1' : '0';
    // amunisi, mode, optik, granat (pisau: tanpa angka amunisi)
    const grenadeHeld = w.slot === 'grenade', flashHeld = w.slot === 'flash', knifeHeld = w.slot === 'knife', gunHeld = w.holdingGun;
    const lowAmmo = gunHeld && w.ammo <= Math.ceil(w.def.magSize * 0.3);
    this.set('am', `${v.id}|${w.ammo}|${w.reserve}|${w.slot}|${v.grenades}|${v.flashes}|${w.melee}`, () => {
      (this.ammo.children[1] as HTMLElement).innerHTML = grenadeHeld ? `K-400 <small>| ${v.grenades}</small>`
        : flashHeld ? `Flash <small>| ${v.flashes}</small>` : knifeHeld ? MELEES[w.melee].name : `${w.ammo} <small>| ${w.reserve}</small>`;
      this.ammo.classList.toggle('low', lowAmmo);
      this.ammo.classList.toggle('knife', knifeHeld);
      this.ammo.classList.toggle('alt', !gunHeld);   // pisau/granat: sembunyikan mode tembak & optik
    });
    const md = MELEES[w.melee];
    const wn = knifeHeld ? `${md.name} · lari +${Math.round((md.moveMult - 1) * 100)}%` : grenadeHeld ? 'Granat K-400' : flashHeld ? 'Flashbang · membutakan, tanpa damage'
      : gunHeld ? `${w.def.name} · ${SCOPES[w.scope.id].name}` : 'Senjata utama dibuang';
    this.set('wn', wn, () => ((this.ammo.children[0] as HTMLElement).textContent = wn));
    // bar slot: tombol sesuai binds, slot aktif menyala, slot kosong redup
    const b = ctx.settings.binds;
    const sk = `${w.slot}|${w.hasPrimary ? w.primary.def.name : ''}|${w.secondary.def.name}|${w.melee}|${v.grenades}|${v.flashes}|${b.primary}|${b.pistol}|${b.knife}|${b.grenade}|${b.flash}`;
    this.set('slots', sk, () => {
      const el = this.slots.children;
      const fill = (i: number, key: string, name: string | null, on: boolean, empty: boolean) => {
        const d = el[i] as HTMLElement;
        (d.children[0] as HTMLElement).textContent = keyLabel(key);
        if (name !== null) (d.children[1] as HTMLElement).textContent = name;
        d.className = 's' + (on ? ' on' : '') + (empty ? ' empty' : '');
      };
      fill(0, b.primary, w.hasPrimary ? w.primary.def.name : '—', w.slot === 'ar', !w.hasPrimary);
      fill(1, b.pistol, w.secondary.def.name, w.slot === 'pistol', false);
      fill(2, b.knife, w.melee === 'knife' ? 'Pisau' : MELEES[w.melee].name, knifeHeld, false);
      fill(3, b.grenade, `K-400 ×${v.grenades}`, grenadeHeld, v.grenades < 1);
      fill(4, b.flash, `Flash ×${v.flashes}`, flashHeld, v.flashes < 1);
    });
    this.set('md', MODE_LABEL[w.mode], () => (this.ammo.querySelector('.mode')!.textContent = MODE_LABEL[w.mode]));
    this.set('op', w.scope.name, () => (this.ammo.querySelector('.optic')!.textContent = w.scope.name));
    this.set('gr', `${v.id}|${v.grenades}|${v.flashes}`, () => {
      const g = this.ammo.querySelector('.gren')!;
      g.innerHTML = `<i></i>×${v.grenades} <i class="fl"></i>×${v.flashes}`; g.classList.toggle('empty', v.grenades < 1 && v.flashes < 1);
    });
    // crosshair: spread senjata → piksel = (H/2)·tan(spread)/tan(fovV/2); bentuk/perilaku menentukan bagian yang mengembang
    const fovV = THREE.MathUtils.degToRad(ctx.engine.camera.fov);
    this.xhc.setSpread((innerHeight / 2) * Math.tan(THREE.MathUtils.degToRad(spreadDeg)) / Math.tan(fovV / 2));
    this.xhc.update(dt);
    const xhState = !p.alive || p.weapon.adsActive ? 'hidden' : p.ctrl.sprinting ? 'dim' : '';
    this.set('xh', xhState, () => (this.xh.className = 'xh ' + xhState));
    // cincin sumbu granat (3.5 s, merah pada 1 s terakhir)
    const cooking = p.grenadeState === 'COOKING';
    this.ring.classList.toggle('on', cooking);
    if (cooking) {
      const left = Math.max(0, CFG.grenade.fuse - p.cookT), k = left / CFG.grenade.fuse;
      const a = k * Math.PI * 2 - 1e-4;
      this.ringArc.setAttribute('d', `M 0 -28 A 28 28 0 ${a > Math.PI ? 1 : 0} 1 ${Math.sin(a) * 28} ${-Math.cos(a) * 28}`);
      this.ringArc.setAttribute('stroke', left < 1 ? '#ff2a2a' : '#f4efe6');
    }
    // bar progres reload di bawah crosshair
    const rp = p.alive ? p.weapon.reloadTotal : -1;   // shotgun: seluruh pengisian selongsong
    this.rbar.classList.toggle('on', rp >= 0);
    if (rp >= 0) (this.rbar.firstChild as HTMLElement).style.width = `${(rp * 100).toFixed(0)}%`;
    // pesan tengah: respawn / perlindungan / menonton
    const st = ctx.match.state;
    const msg = !p.alive ? (st === 'PLAYING' && ctx.match.mode !== 'elim' ? `Respawn dalam ${Math.max(1, Math.ceil(p.respawnT))}...` : '')
      : p.protectT > 0 ? 'Terlindungi' : '';
    this.set('msg', msg, () => (this.center.textContent = msg));
    // prompt: ambil/tukar senjata tim > pesan singkat > amunisi
    const rk = keyLabel(ctx.settings.binds.reload), mk = keyLabel(ctx.settings.binds.melee);
    if (this.toastT > 0) this.toastT -= dt;
    const d = p.alive ? this.pickup : null;
    const pk = keyLabel(ctx.settings.binds.pickup) + (ctx.input.padActive ? ' / X' : '');
    const pr = d ? `[${pk}] ${w.hasPrimary ? 'Tukar dengan' : 'Ambil'} ${WEAPONS[d.weapon].name} · ${SCOPES[d.scope].name} (${d.ammo}/${d.reserve})`
      : this.toastT > 0 ? this.toastText
      : !p.alive || !gunHeld || w.reloading ? ''
      : w.ammo === 0 && w.reserve === 0 ? (w.slot === 'ar' ? `Amunisi habis — [${keyLabel(ctx.settings.binds.pistol)}] pistol · [${mk}] pukul` : `Amunisi habis — [${mk}] pukul`)
      : lowAmmo && w.reserve > 0 ? `[${rk}] Reload` : '';
    this.set('pr', pr, () => { this.prompt.textContent = pr; this.prompt.classList.toggle('warn', !d && this.toastT <= 0 && gunHeld && w.ammo === 0); });
    // kartu "Dibunuh oleh" (selama mati) & label menonton
    const info = !p.alive && kc?.active && !(kc.done && !kc.hold) ? kc.info : null;
    const kkey = info ? `${info.name}|${info.weapon}|${info.headshot}|${info.hp}` : '';
    this.set('killer', kkey, () => {
      this.killer.style.display = info ? 'block' : 'none';
      if (info) this.killer.innerHTML = `<div class="kl">DIBUNUH OLEH</div><div class="kn ${info.team === 'blue' ? 'bt' : 'rt'}">${info.name}</div>` +
        `<div class="kd">${weaponLabel(info.weapon)}${info.headshot ? ' · Headshot' : ''} · ${info.distM.toFixed(0)} m · HP tersisa ${info.hp}</div>`;
    });
    const sp = !p.alive && this.spectating ? this.spectating.name : '';
    this.set('spec', sp, () => {
      this.spec.style.display = sp ? 'block' : 'none';
      this.spec.innerHTML = sp ? `MENONTON <b>${sp}</b><span>Klik kiri / Spasi: ganti rekan</span>` : '';
    });
    document.body.classList.toggle('dead', !p.alive && !replay && ctx.match.state !== 'RESULTS' && !this.spectating);
    this.grenadeWarnings(p);
    // lensa (optik ≥2×) & reticle red dot/holo
    const lensOn = ctx.scope.lensOn && p.alive;
    this.lens.classList.toggle('on', lensOn);
    if (lensOn) {
      const D = Math.round(innerHeight * XCFG.hud.lensDiameter);
      this.set('lens', `${w.scope.id}|${innerWidth}x${innerHeight}`, () => {
        const mask = this.lens.querySelector('.mask')!;
        mask.innerHTML = `<defs><mask id="lm"><rect width="100%" height="100%" fill="white"/><circle cx="${innerWidth / 2}" cy="${innerHeight / 2}" r="${D / 2}" fill="black"/></mask></defs>` +
          `<rect width="100%" height="100%" fill="black" mask="url(#lm)"/><circle cx="${innerWidth / 2}" cy="${innerHeight / 2}" r="${D / 2}" fill="none" stroke="#111" stroke-width="10"/>`;
        (this.lens.querySelector('.ret-wrap') as HTMLElement).innerHTML = reticleSvg(w.scope.id, D);
        const svg = this.lens.querySelector('.ret-wrap svg') as SVGElement | null;
        if (svg) { svg.classList.add('ret'); svg.style.position = 'absolute'; svg.style.left = '50%'; svg.style.top = '50%'; svg.style.transform = 'translate(-50%,-50%)'; }
      });
    }
    const dotOn = ctx.scope.dotOn && p.alive;
    this.dot.classList.toggle('on', dotOn);
    if (dotOn) this.set('dot', w.scope.id, () => {
      const k = innerHeight / 1080;
      this.dot.innerHTML = w.scope.id === 'reddot'
        ? `<svg width="${20 * k}" height="${20 * k}" viewBox="-10 -10 20 20"><circle r="2" fill="#FF2A2A" style="filter:drop-shadow(0 0 3px #ff2a2a)"/></svg>`
        : `<svg width="${40 * k}" height="${40 * k}" viewBox="-20 -20 40 40"><circle r="17" fill="none" stroke="#FF3B30" stroke-width="1.6"/><circle r="1.5" fill="#FF3B30"/></svg>`;
    });
  }

  /** Skor & waktu per mode: TDM "BIRU 12 — 9 MERAH · 07:32"; Eliminasi + nomor ronde & pip hidup; Latihan. */
  private updateScore() {
    const m = ctx.match, s = ctx.teams.scores, tl = m.timeLeft, mode = m.mode;
    this.set('mode', mode, () => { this.score.classList.toggle('practice', mode === 'practice'); this.pips.style.display = mode === 'elim' ? 'flex' : 'none'; });
    if (mode === 'practice') {
      const p = ctx.player, k = p ? p.stats.kills : 0, acc = p && p.stats.shots ? Math.round(100 * p.stats.hits / p.stats.shots) : 0;
      this.set('prac', `${k}|${acc}`, () => (this.score.children[0].textContent = `LATIHAN · ${k} dummy jatuh · akurasi ${acc}%`));
    } else {
      this.set('sb', s.blue, () => (this.score.children[0].textContent = `BIRU ${s.blue}`));
      this.set('sr', s.red, () => (this.score.children[2].textContent = `${s.red} MERAH`));
      const tstr = (mode === 'elim' ? `R${m.round} · ` : '') + fmtTime(Math.ceil(tl));
      this.set('tl', tstr, () => (this.score.children[4].textContent = tstr));
    }
    if (mode === 'elim') {
      let ab = 0, nb = 0, ar = 0, nr = 0;
      for (const e of ctx.entities) { if (e.team === 'blue') { nb++; if (e.alive) ab++; } else { nr++; if (e.alive) ar++; } }
      this.set('pips', `${ab}/${nb}|${ar}/${nr}`, () => {
        const row = (alive: number, n: number) => Array.from({ length: n }, (_, i) => `<i class="${i < alive ? 'on' : ''}"></i>`).join('');
        (this.pips.children[0] as HTMLElement).innerHTML = row(ab, nb);
        (this.pips.children[1] as HTMLElement).innerHTML = row(ar, nr);
      });
    }
    const cd = m.state === 'COUNTDOWN' ? Math.ceil(m.countdown) : 0;
    this.set('cd', cd, () => { this.countdownEl.textContent = cd ? String(cd) : ''; this.countdownEl.style.display = cd ? 'block' : 'none'; });
  }

  /** Ikon bahaya untuk granat hidup dalam radius ledak + 3 u (di layar, atau di tepi lingkaran bila di luar pandangan). */
  private grenadeWarnings(p: Entity) {
    let gi = 0;
    if (p.alive && !ctx.killcam?.replaying) {
      const cam = ctx.engine.camera, W = innerWidth, H = innerHeight, yaw = ctx.camRig.yaw;
      ctx.grenades.forEachLive((x, y, z, _f, _o, _id, kind) => {
        if (gi >= this.gw.length || kind === 'flash') return;   // flash tidak melukai: tanpa ikon bahaya
        const d = Math.hypot(x - p.pos.x, y - (p.pos.y + 2), z - p.pos.z);
        if (d > CFG.grenade.blastRadius + 3) return;
        const el = this.gw[gi++];
        _v.set(x, y, z).project(cam);
        let sx: number, sy: number;
        if (_v.z < 1 && Math.abs(_v.x) < 0.9 && Math.abs(_v.y) < 0.88) { sx = (_v.x * 0.5 + 0.5) * W; sy = (-_v.y * 0.5 + 0.5) * H; }
        else {
          const dx = x - p.pos.x, dz = z - p.pos.z;
          const phi = Math.atan2(dx * Math.cos(yaw) - dz * Math.sin(yaw), -dx * Math.sin(yaw) - dz * Math.cos(yaw));
          const R = Math.min(W, H) * 0.3;
          sx = W / 2 + Math.sin(phi) * R; sy = H / 2 - Math.cos(phi) * R;
        }
        el.style.display = 'block';
        el.style.transform = `translate(${sx.toFixed(0)}px, ${sy.toFixed(0)}px) translate(-50%, -50%)`;
        el.classList.toggle('near', d < CFG.grenade.blastRadius * 0.6);
      });
    }
    for (let i = gi; i < this.gw.length; i++) if (this.gw[i].style.display !== 'none') this.gw[i].style.display = 'none';
  }

  private boardAcc = 0;
  private renderBoard() {
    if (performance.now() - this.boardAcc < 250) return;
    this.boardAcc = performance.now();
    const online = ctx.net.role !== 'offline', N = XCFG.net;
    const ping = (e: Entity) => {
      if (!online) return '';
      const v = e.ping;
      const txt = v === -2 ? 'HOST' : v === -1 ? 'BOT' : v < 0 ? '…' : `${v}`;
      const cls = v < 0 ? '' : v < N.pingGood ? 'good' : v < N.pingWarn ? 'mid' : 'bad';
      return `<td class="ping ${cls}">${txt}</td>`;
    };
    const rows = (team: 'blue' | 'red') => ctx.entities.filter(e => e.team === team).sort((a, b) => b.stats.score - a.stats.score).map(e => {
      const acc = e.stats.shots ? Math.round(100 * e.stats.hits / e.stats.shots) : 0;
      const hs = e.stats.hits ? Math.round(100 * e.stats.hsHits / e.stats.hits) : 0;
      return `<tr class="${e.isPlayer ? 'me' : ''} ${e.alive ? '' : 'dead'}"><td>${escHtml(e.name)}</td><td>${e.stats.kills}</td><td>${e.stats.deaths}</td><td>${e.stats.assists}</td>` +
        `<td>${e.stats.score}</td><td>${acc}%</td><td>${hs}%</td>${ping(e)}</tr>`;
    }).join('');
    const head = `<tr><th>Nama</th><th>K</th><th>D</th><th>A</th><th>Skor</th><th>Akurasi</th><th>% HS</th>${online ? '<th>Ping</th>' : ''}</tr>`;
    const unit = ctx.match.mode === 'elim' ? ' ronde' : '';
    this.board.innerHTML = `<h3 class="b">BIRU — ${ctx.teams.scores.blue}${unit}</h3><table>${head}${rows('blue')}</table>` +
      `<h3 class="r">MERAH — ${ctx.teams.scores.red}${unit}</h3><table>${head}${rows('red')}</table>`;
  }
}
