// src/ui/Menus.ts — menu utama, loadout, pengaturan, kontrol, pause, hasil (GDD §13.1–13.2, §14)
import { SCOPES, SCOPE_ORDER, WEAPONS, WEAPON_ORDER, scopeAllowed, type ScopeId, type WeaponId } from '../config/weaponsData';
import { effectiveZoom } from '../combat/Damage';
import type { Settings } from './Settings';
import { ctx } from '../game/ctx';

export interface MenuApi {
  play(): void; resume(): void; quitToMenu(): void; replay(): void; fullscreen(): void;
  settings(): Settings; applySettings(s: Settings): void; setLoadout(w: WeaponId, s: ScopeId): void; click(): void;
  inMatch(): boolean;
}

const KEYS: [string, string][] = [
  ['W A S D', 'Gerak'], ['Left Shift (tahan)', 'Sprint (hanya ke depan)'], ['C', 'Jongkok (toggle)'],
  ['Left Ctrl (tahan)', 'Jongkok tahan — hanya saat fullscreen + Keyboard Lock'], ['Space', 'Lompat (coyote & buffer 0.1 s)'],
  ['Klik kiri', 'Tembak / masak granat → lempar jauh'], ['Klik kanan', 'ADS / masak granat → gelinding'], ['R', 'Reload'],
  ['B', 'Ganti mode tembak'], ['V', 'Ganti FPS / TPS'], ['Q', 'Tukar bahu (TPS)'], ['1', 'Senjata utama'],
  ['G atau 4', 'Granat K-400'], ['Scroll', 'Tukar AR ↔ granat'], ['Tab (tahan)', 'Papan skor'], ['L', 'Loadout spawn berikutnya'],
  ['Esc', 'Pause (melepas pointer lock)'], ['F3', 'Overlay statistik'], ['` (Backquote)', 'Panel debug'],
];

const el = (html: string) => { const d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstElementChild as HTMLElement; };
const norm = (v: number, a: number, b: number) => Math.max(0.08, Math.min(1, (v - a) / (b - a)));

export class Menus {
  private root = document.getElementById('ui') as HTMLDivElement;
  current: string | null = null;
  private wSel: WeaponId = 'm416';
  private sSel: ScopeId = 'reddot';

  constructor(private api: MenuApi) {}

  hide() { this.root.innerHTML = ''; this.current = null; }
  get open() { return this.current !== null; }

  private mount(name: string, html: string) {
    this.root.innerHTML = '';
    const m = el(`<div class="menu">${html}</div>`);
    this.root.appendChild(m);
    this.current = name;
    m.querySelectorAll('button').forEach(b => b.addEventListener('click', () => this.api.click()));
    return m;
  }

  showMain() {
    const m = this.mount('main', `<div class="card"><h1>STUD WARFARE</h1><div class="sub">BRICK HALL</div>
      <div class="btns"><button class="primary" data-a="play">▶ Main (TDM 5v5)</button><button data-a="loadout">Loadout</button>
      <button data-a="settings">Pengaturan</button><button data-a="controls">Kontrol</button><button data-a="fs">Layar Penuh</button></div>
      <div class="note">Biru di Selatan menghadap Utara. Tim pertama 50 kill atau skor tertinggi saat 10:00 habis.</div></div>`);
    this.on(m, 'play', () => this.api.play());
    this.on(m, 'loadout', () => this.showLoadout(() => this.showMain()));
    this.on(m, 'settings', () => this.showSettings(() => this.showMain()));
    this.on(m, 'controls', () => this.showControls(() => this.showMain()));
    this.on(m, 'fs', () => this.api.fullscreen());
  }

  showLoadout(back: () => void, inMatch = false) {
    const s = this.api.settings();
    this.wSel = s.weapon; this.sSel = s.scope;
    const m = this.mount('loadout', `<div class="card"><h2>Loadout ${inMatch ? '<small style="font-size:13px;opacity:.7">— berlaku pada spawn berikutnya</small>' : ''}</h2>
      <div class="grid"></div><div class="scopes"></div><div class="row"><button class="primary" data-a="ok">Simpan</button><button data-a="back">Kembali</button></div></div>`);
    const grid = m.querySelector('.grid')!, scopes = m.querySelector('.scopes')!;
    const render = () => {
      grid.innerHTML = WEAPON_ORDER.map(id => {
        const w = WEAPONS[id];
        const bars: [string, number][] = [['Damage', norm(w.baseDamage, 38, 50)], ['RPM', norm(w.rpm, 560, 820)],
          ['Kontrol', norm(2.3 - w.recoilVert, 0.1, 1.5)], ['Reload', norm(3.2 - w.reloadTime, 0.05, 1.15)]];
        return `<div class="wcard ${id === this.wSel ? 'sel' : ''}" data-w="${id}"><b>${w.name}</b><span style="opacity:.7">${w.caliber} · ${w.modes.map(x => x.replace('BURST', 'B')).join('/')}</span>` +
          bars.map(([n, v]) => `<div class="stat"><span>${n}</span><i><b style="width:${Math.round(v * 100)}%"></b></i></div>`).join('') + '</div>';
      }).join('');
      scopes.innerHTML = SCOPE_ORDER.map(sid => {
        const sc = SCOPES[sid], ok = scopeAllowed(WEAPONS[this.wSel], sid);
        return `<button data-s="${sid}" class="${sid === this.sSel ? 'sel' : ''}" ${ok ? '' : 'disabled title="Terkunci untuk Groza"'}>${sc.name} · ${effectiveZoom(sc.fov).toFixed(2)}×</button>`;
      }).join('');
      grid.querySelectorAll<HTMLElement>('.wcard').forEach(c => c.addEventListener('click', () => {
        this.api.click(); this.wSel = c.dataset.w as WeaponId;
        if (!scopeAllowed(WEAPONS[this.wSel], this.sSel)) this.sSel = 'x3';
        render();
      }));
      scopes.querySelectorAll<HTMLButtonElement>('button').forEach(b => b.addEventListener('click', () => {
        this.api.click(); this.sSel = b.dataset.s as ScopeId; render();
      }));
    };
    render();
    this.on(m, 'ok', () => { this.api.setLoadout(this.wSel, this.sSel); back(); });
    this.on(m, 'back', back);
  }

  showSettings(back: () => void) {
    const s = { ...this.api.settings() };
    const rng = (k: keyof Settings, label: string, min: number, max: number, step: number, fmt = (v: number) => v.toFixed(2)) =>
      `<div class="set-row"><span>${label}</span><input type="range" data-k="${k}" min="${min}" max="${max}" step="${step}" value="${s[k]}"><span data-v="${k}">${fmt(s[k] as number)}</span></div>`;
    const sel = (k: keyof Settings, label: string, opts: [string, string][]) =>
      `<div class="set-row"><span>${label}</span><select data-k="${k}">${opts.map(([v, t]) => `<option value="${v}" ${String(s[k]) === v ? 'selected' : ''}>${t}</option>`).join('')}</select><span></span></div>`;
    const m = this.mount('settings', `<div class="card"><h2>Pengaturan</h2>
      ${rng('sens', 'Sensitivitas hipfire (1.0 = 0.044°/px)', 0.1, 5, 0.05)}
      ${rng('adsMult', 'Pengali sensitivitas ADS', 0.5, 1.5, 0.05)}
      ${rng('fov', 'FOV vertikal', 70, 90, 1, v => v + '°')}
      ${sel('invertY', 'Invert Y', [['false', 'Off'], ['true', 'On']])}
      ${sel('adsToggle', 'Mode ADS', [['false', 'Tahan'], ['true', 'Toggle']])}
      ${sel('crouchToggle', 'Mode jongkok (C)', [['true', 'Toggle'], ['false', 'Tahan']])}
      ${sel('preset', 'Preset kualitas', [['LOW', 'LOW'], ['MEDIUM', 'MEDIUM (Iris Xe)'], ['HIGH', 'HIGH']])}
      ${rng('volMaster', 'Volume master', 0, 100, 1, v => String(Math.round(v)))}
      ${rng('volSfx', 'Volume SFX', 0, 100, 1, v => String(Math.round(v)))}
      ${rng('volUi', 'Volume UI', 0, 100, 1, v => String(Math.round(v)))}
      ${sel('showFps', 'Tampilkan FPS', [['false', 'Off'], ['true', 'On']])}
      ${sel('difficulty', 'Kesulitan bot', [['easy', 'Mudah'], ['normal', 'Normal'], ['hard', 'Sulit']])}
      ${rng('allies', 'Jumlah bot sekutu', 0, 4, 1, v => String(v))}
      ${rng('enemies', 'Jumlah bot musuh', 1, 5, 1, v => String(v))}
      ${sel('fullPause', 'Jeda penuh saat pause', [['false', 'Off (bot tetap jalan)'], ['true', 'On']])}
      <div class="note">Mengganti preset (MSAA/bayangan) memuat ulang halaman. Jumlah bot & kesulitan berlaku pada match berikutnya.</div>
      <div class="row"><button class="primary" data-a="ok">Simpan</button><button data-a="back">Kembali</button></div></div>`);
    m.querySelectorAll<HTMLInputElement>('input[type=range]').forEach(inp => inp.addEventListener('input', () => {
      const k = inp.dataset.k as keyof Settings, v = Number(inp.value);
      (s as unknown as Record<string, unknown>)[k] = v;
      const out = m.querySelector(`[data-v="${k}"]`)!;
      out.textContent = k === 'fov' ? v + '°' : ['volMaster', 'volSfx', 'volUi', 'allies', 'enemies'].includes(k) ? String(Math.round(v)) : v.toFixed(2);
    }));
    m.querySelectorAll<HTMLSelectElement>('select').forEach(se => se.addEventListener('change', () => {
      const k = se.dataset.k as keyof Settings, v = se.value;
      (s as unknown as Record<string, unknown>)[k] = v === 'true' ? true : v === 'false' ? false : v;
    }));
    this.on(m, 'ok', () => { this.api.applySettings(s); back(); });
    this.on(m, 'back', back);
  }

  showControls(back: () => void) {
    const m = this.mount('controls', `<div class="card"><h2>Kontrol</h2><table class="keys">${KEYS.map(([k, a]) => `<tr><td>${k}</td><td>${a}</td></tr>`).join('')}</table>
      <div class="row"><button data-a="back">Kembali</button></div></div>`);
    this.on(m, 'back', back);
  }

  showPause(cooldownMs: number) {
    const m = this.mount('pause', `<div class="card"><h2>Pause</h2><div class="btns">
      <button class="primary" data-a="resume">Lanjut</button><button data-a="loadout">Loadout</button><button data-a="settings">Pengaturan</button>
      <button data-a="controls">Kontrol</button><button data-a="quit">Keluar ke Menu</button></div>
      <div class="note">${this.api.settings().fullPause ? 'Jeda penuh aktif.' : 'Game tetap berjalan karena ada bot (opsi "jeda penuh" di Pengaturan).'}</div></div>`);
    const btn = m.querySelector<HTMLButtonElement>('[data-a="resume"]')!;
    if (cooldownMs > 0) { btn.disabled = true; setTimeout(() => (btn.disabled = false), cooldownMs); }
    this.on(m, 'resume', () => this.api.resume());
    this.on(m, 'loadout', () => this.showLoadout(() => this.showPause(0), true));
    this.on(m, 'settings', () => this.showSettings(() => this.showPause(0)));
    this.on(m, 'controls', () => this.showControls(() => this.showPause(0)));
    this.on(m, 'quit', () => this.api.quitToMenu());
  }

  showResults(winner: 'blue' | 'red' | 'draw', playerTeam: 'blue' | 'red') {
    const title = winner === 'draw' ? 'SERI' : winner === playerTeam ? 'MENANG' : 'KALAH';
    const color = winner === 'draw' ? '#f5cd30' : winner === playerTeam ? '#7dff9a' : '#ff6b5e';
    const rows = (team: 'blue' | 'red') => ctx.entities.filter(e => e.team === team).sort((a, b) => b.stats.score - a.stats.score).map(e => {
      const kd = e.stats.deaths ? (e.stats.kills / e.stats.deaths).toFixed(2) : e.stats.kills.toFixed(2);
      const acc = e.stats.shots ? Math.round(100 * e.stats.hits / e.stats.shots) : 0;
      const hs = e.stats.hits ? Math.round(100 * e.stats.hsHits / e.stats.hits) : 0;
      return `<tr class="${e.isPlayer ? 'me' : ''}"><td>${e.name}</td><td>${e.stats.kills}</td><td>${e.stats.deaths}</td><td>${kd}</td><td>${e.stats.score}</td><td>${acc}%</td><td>${hs}%</td><td>${e.stats.damage}</td></tr>`;
    }).join('');
    const head = '<tr><th>Nama</th><th>K</th><th>D</th><th>K/D</th><th>Skor</th><th>Akurasi</th><th>% HS</th><th>Damage</th></tr>';
    const m = this.mount('results', `<div class="card"><h1 style="color:${color}">${title}</h1>
      <div class="sub">BIRU ${ctx.teams.scores.blue} — ${ctx.teams.scores.red} MERAH</div>
      <div class="scoreboard on" style="position:static;transform:none;min-width:0;background:none;border:none;padding:0">
      <h3 class="b">BIRU</h3><table>${head}${rows('blue')}</table><h3 class="r">MERAH</h3><table>${head}${rows('red')}</table></div>
      <div class="row"><button class="primary" data-a="again">Main Lagi</button><button data-a="menu">Menu</button></div></div>`);
    this.on(m, 'again', () => this.api.replay());
    this.on(m, 'menu', () => this.api.quitToMenu());
  }

  showClickToResume() {
    this.mount('resume', `<div class="click-resume">Klik untuk melanjutkan</div>`);
    this.root.querySelector('.menu')!.addEventListener('click', () => this.api.resume());
  }

  private on(m: HTMLElement, action: string, fn: () => void) {
    m.querySelector(`[data-a="${action}"]`)?.addEventListener('click', fn);
  }
}
