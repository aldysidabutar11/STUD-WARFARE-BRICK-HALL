// src/ui/Hud.ts — HUD overlay DOM (GDD §13, §7.4, §6.1). Teks hanya diperbarui saat nilainya berubah.
import * as THREE from 'three';
import { CFG } from '../config/gameConfig';
import { XCFG } from '../config/extraConfig';
import { WEAPONS, type ScopeId } from '../config/weaponsData';
import { bus } from '../core/EventBus';
import { ctx } from '../game/ctx';
import type { Entity } from '../entities/Entity';

const h = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = '') => {
  const e = document.createElement(tag); if (cls) e.className = cls; if (html) e.innerHTML = html; return e;
};
const fmtTime = (s: number) => { const m = Math.floor(s / 60), r = Math.floor(s % 60); return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`; };
const MODE_LABEL: Record<string, string> = { AUTO: 'AUTO', SINGLE: 'SINGLE', BURST2: 'BURST', BURST3: 'BURST' };

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
  private xh = h('div', 'xh', '<i class="t"></i><i class="b"></i><i class="l"></i><i class="r"></i>');
  private hm = h('div', 'hitmarker');
  private hmT = 0;
  private vign = h('div', 'vignette');
  private ring = h('div', 'ring');
  private ringArc: SVGPathElement;
  private dmgWrap = h('div', 'dmg-ind');
  private dmgArcs: { el: SVGPathElement; t: number; x: number; z: number }[] = [];
  private hp = h('div', 'hp', '<div class="num">100</div><div class="bar"><i style="width:100%"></i></div>');
  private ammo = h('div', 'ammo', '<div class="cnt">30 <small>| 120</small></div><div class="meta"><span class="badge mode">AUTO</span><span class="optic"></span><span class="gren"><i></i>×1</span></div>');
  private score = h('div', 'score', '<span class="b">BIRU 0</span><span>—</span><span class="r">0 MERAH</span><span>·</span><span class="t">10:00</span>');
  private feed = h('div', 'killfeed');
  private center = h('div', 'center-msg');
  private banner = h('div', 'banner');
  private countdownEl = h('div', 'countdown');
  private board = h('div', 'scoreboard');
  private lens = h('div', 'lens', '<svg class="mask" width="100%" height="100%"></svg><div class="ret-wrap"></div>');
  private dot = h('div', 'dot-ret');
  private last: Record<string, string | number | boolean> = {};
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
    this.root.append(this.lens, this.dot, this.vign, this.xh, this.hm, this.ring, this.dmgWrap, this.hp, this.ammo, this.score,
      this.feed, this.center, this.countdownEl, this.banner, this.board);
    this.setVisible(false);
    bus.on('hit', (e) => {
      const p = ctx.player;
      if (!p) return;
      if (e.attackerId === p.id && e.victimId !== p.id) this.hitmarker(e.headshot ? 'head' : 'body');
      if (e.victimId === p.id && e.attackerId !== p.id) this.damageFrom(e.fromX, e.fromZ);
    });
    bus.on('kill', (e) => {
      const k = ctx.byId.get(e.killerId), v = ctx.byId.get(e.victimId);
      if (!v) return;
      if (ctx.player && e.killerId === ctx.player.id && e.victimId !== ctx.player.id) this.hitmarker('kill');
      this.killfeed(k ?? v, v, e.weaponId, e.headshot);
    });
  }

  setVisible(v: boolean) { this.visible = v; this.root.style.display = v ? 'block' : 'none'; }

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

  killfeed(killer: Entity, victim: Entity, weapon: string, hs: boolean) {
    const w = weapon === 'k400' ? 'K-400' : weapon === 'fall' ? 'jatuh' : WEAPONS[weapon as keyof typeof WEAPONS]?.name ?? weapon;
    const row = h('div');
    const kc = killer.team === 'blue' ? 'bt' : 'rt', vc = victim.team === 'blue' ? 'bt' : 'rt';
    row.innerHTML = killer === victim ? `<span class="${vc}">${victim.name}</span><span class="w">[${w}]</span>`
      : `<span class="${kc}">${killer.name}</span><span class="w">[${w}]${hs ? ' ◎' : ''}</span><span class="${vc}">${victim.name}</span>`;
    this.feed.prepend(row);
    while (this.feed.children.length > XCFG.hud.killFeedMax) this.feed.lastChild!.remove();
    setTimeout(() => row.remove(), XCFG.hud.killFeedTime * 1000);
  }

  showBanner(text: string, color: string) { this.banner.textContent = text; this.banner.style.color = color; this.banner.style.display = text ? 'block' : 'none'; }

  clearFeed() { this.feed.innerHTML = ''; }

  update(dt: number, p: Entity | null, spreadDeg: number, showBoard: boolean) {
    // hitmarker & indikator arah damage
    if (this.hmT > 0) { this.hmT -= dt; if (this.hmT <= 0) this.hm.style.opacity = '0'; }
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
    // skor & waktu: BIRU 12 — 9 MERAH · 07:32
    const s = ctx.teams.scores, tl = ctx.match.timeLeft;
    this.set('sb', s.blue, () => (this.score.children[0].textContent = `BIRU ${s.blue}`));
    this.set('sr', s.red, () => (this.score.children[2].textContent = `${s.red} MERAH`));
    this.set('tl', Math.ceil(tl), () => (this.score.children[4].textContent = fmtTime(Math.ceil(tl))));
    const cd = ctx.match.state === 'COUNTDOWN' ? Math.ceil(ctx.match.countdown) : 0;
    this.set('cd', cd, () => { this.countdownEl.textContent = cd ? String(cd) : ''; this.countdownEl.style.display = cd ? 'block' : 'none'; });
    this.board.classList.toggle('on', showBoard);
    if (showBoard) this.renderBoard();

    if (!p) return;
    const w = p.weapon;
    // HP
    this.set('hp', p.hp, () => {
      (this.hp.children[0] as HTMLElement).textContent = String(p.hp);
      (this.hp.querySelector('.bar i') as HTMLElement).style.width = `${p.hp}%`;
      this.hp.classList.toggle('low', p.hp < XCFG.vfx.lowHpVignette);
    });
    this.vign.style.opacity = p.alive && p.hp < XCFG.vfx.lowHpVignette ? '1' : '0';
    // amunisi, mode, optik, granat
    const grenadeHeld = w.slot === 'grenade';
    this.set('am', `${w.ammo}|${w.reserve}|${grenadeHeld}`, () => {
      (this.ammo.children[0] as HTMLElement).innerHTML = grenadeHeld ? `K-400 <small>| ${p.grenades}</small>` : `${w.ammo} <small>| ${w.reserve}</small>`;
    });
    this.set('md', MODE_LABEL[w.mode], () => (this.ammo.querySelector('.mode')!.textContent = MODE_LABEL[w.mode]));
    this.set('op', w.scope.name, () => (this.ammo.querySelector('.optic')!.textContent = w.scope.name));
    this.set('gr', p.grenades, () => {
      const g = this.ammo.querySelector('.gren')!;
      g.innerHTML = `<i></i>×${p.grenades}`; g.classList.toggle('empty', p.grenades < 1);
    });
    // crosshair dinamis: gap = 3 + (H/2)·tan(spread)/tan(fovV/2)
    const fovV = THREE.MathUtils.degToRad(ctx.engine.camera.fov);
    const gap = XCFG.hud.crosshairBaseGap + (innerHeight / 2) * Math.tan(THREE.MathUtils.degToRad(spreadDeg)) / Math.tan(fovV / 2);
    this.set('gap', gap.toFixed(1), () => this.xh.style.setProperty('--gap', gap.toFixed(1) + 'px'));
    const xhState = !p.alive || w.adsActive || grenadeHeld && false ? 'hidden' : p.ctrl.sprinting ? 'dim' : '';
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
    // pesan tengah: respawn / perlindungan
    const msg = !p.alive ? (ctx.match.state === 'PLAYING' ? `Respawn dalam ${Math.max(1, Math.ceil(p.respawnT))}...` : '')
      : p.protectT > 0 ? 'Terlindungi' : '';
    this.set('msg', msg, () => (this.center.textContent = msg));
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

  private boardAcc = 0;
  private renderBoard() {
    if (performance.now() - this.boardAcc < 250) return;
    this.boardAcc = performance.now();
    const rows = (team: 'blue' | 'red') => ctx.entities.filter(e => e.team === team).sort((a, b) => b.stats.score - a.stats.score).map(e => {
      const acc = e.stats.shots ? Math.round(100 * e.stats.hits / e.stats.shots) : 0;
      const hs = e.stats.hits ? Math.round(100 * e.stats.hsHits / e.stats.hits) : 0;
      return `<tr class="${e.isPlayer ? 'me' : ''}"><td>${e.name}</td><td>${e.stats.kills}</td><td>${e.stats.deaths}</td><td>${e.stats.score}</td><td>${acc}%</td><td>${hs}%</td></tr>`;
    }).join('');
    const head = '<tr><th>Nama</th><th>K</th><th>D</th><th>Skor</th><th>Akurasi</th><th>% HS</th></tr>';
    this.board.innerHTML = `<h3 class="b">BIRU — ${ctx.teams.scores.blue}</h3><table>${head}${rows('blue')}</table>` +
      `<h3 class="r">MERAH — ${ctx.teams.scores.red}</h3><table>${head}${rows('red')}</table>`;
  }
}
