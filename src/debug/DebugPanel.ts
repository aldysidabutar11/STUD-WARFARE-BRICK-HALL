// src/debug/DebugPanel.ts — panel debug Backquote (GDD §16.2)
import * as THREE from 'three';
import { physics } from '../physics/Physics';
import { bus } from '../core/EventBus';
import { ctx } from '../game/ctx';
import { moveFeel, resetMoveFeel } from '../entities/moveFeel';

/** Slider "Rasa gerak" (uji coba langsung; tidak disimpan — nilai final dipindah ke config). */
const FEEL_SLIDERS: [keyof typeof moveFeel, string, number, number, number][] = [
  ['tempo', 'Tempo gerak', 1.0, 1.6, 0.05],
  ['bob', 'Ayunan kepala', 0, 2, 0.1],
  ['tilt', 'Miring strafe', 0, 2, 0.1],
  ['sprintFov', 'FOV sprint', 0, 2, 0.1],
  ['inertia', 'Inersia senjata', 0, 2, 0.1],
];

export interface DebugApi {
  spawnDummies(): void; resetProps(): void; startStress(): void; setSlowmo(on: boolean): void; setNoclip(on: boolean): void;
}

export class DebugPanel {
  private el = document.createElement('div');
  visible = false;
  private colliderLines: THREE.LineSegments;
  private navLines: THREE.LineSegments | null = null;
  private labels = new Map<number, HTMLDivElement>();
  private nums: { el: HTMLDivElement; pos: THREE.Vector3; t: number }[] = [];
  private refreshT = 0;
  private _v = new THREE.Vector3();
  status = '';

  constructor(private scene: THREE.Scene, private api: DebugApi) {
    this.el.style.cssText = 'position:fixed;right:10px;top:60px;z-index:30;background:rgba(0,0,0,.78);color:#eee;font:12px/1.6 Consolas,monospace;padding:8px 10px;border-radius:4px;display:none;pointer-events:auto;min-width:230px';
    const chk = (k: keyof typeof ctx.debug, label: string) => `<label style="display:block"><input type="checkbox" data-k="${k}"> ${label}</label>`;
    this.el.innerHTML = `<b>DEBUG</b><br>${chk('colliders', 'Wireframe collider')}${chk('showNav', 'Overlay graf nav')}${chk('botLabels', 'Label state bot')}` +
      `${chk('dmgNumbers', 'Angka damage melayang')}${chk('noclip', 'Kamera noclip')}${chk('god', 'God mode')}${chk('slowmo', 'Slow-mo 0.25×')}` +
      `<button data-a="dummy">Spawn dummy jembatan 10/40/70 u</button><br><button data-a="props">Reset props</button><br>` +
      `<button data-a="stress">Stress Test (60 s)</button><div class="st" style="margin-top:6px;white-space:pre-wrap;max-width:260px"></div>` +
      `<div style="margin-top:8px;border-top:1px solid #555;padding-top:6px"><b>RASA GERAK</b> <small>(uji coba, tidak disimpan)</small>` +
      FEEL_SLIDERS.map(([k, label, min, max, step]) =>
        `<label style="display:flex;align-items:center;gap:6px"><span style="flex:0 0 112px">${label}</span>` +
        `<input type="range" data-f="${k}" min="${min}" max="${max}" step="${step}" style="flex:1;accent-color:#f5cd30">` +
        `<span data-fv="${k}" style="flex:0 0 38px;text-align:right"></span></label>`).join('') +
      `<button data-a="feelreset">Reset rasa gerak</button></div>`;
    document.body.appendChild(this.el);
    const syncFeel = () => this.el.querySelectorAll<HTMLInputElement>('input[data-f]').forEach(r => {
      const k = r.dataset.f as keyof typeof moveFeel;
      r.value = String(moveFeel[k]);
      (this.el.querySelector(`[data-fv="${k}"]`) as HTMLElement).textContent = moveFeel[k].toFixed(2) + (k === 'tempo' ? '' : '×');
    });
    this.el.querySelectorAll<HTMLInputElement>('input[data-f]').forEach(r => r.addEventListener('input', () => {
      moveFeel[r.dataset.f as keyof typeof moveFeel] = parseFloat(r.value);
      syncFeel();
    }));
    this.el.querySelector('[data-a="feelreset"]')!.addEventListener('click', () => { resetMoveFeel(); syncFeel(); });
    syncFeel();
    this.el.querySelectorAll<HTMLInputElement>('input[type=checkbox]').forEach(c => c.addEventListener('change', () => {
      const k = c.dataset.k as keyof typeof ctx.debug;
      ctx.debug[k] = c.checked;
      if (k === 'slowmo') this.api.setSlowmo(c.checked);
      if (k === 'noclip') this.api.setNoclip(c.checked);
      if (k === 'showNav') this.buildNav();
    }));
    this.el.querySelector('[data-a="dummy"]')!.addEventListener('click', () => this.api.spawnDummies());
    this.el.querySelector('[data-a="props"]')!.addEventListener('click', () => this.api.resetProps());
    this.el.querySelector('[data-a="stress"]')!.addEventListener('click', () => this.api.startStress());
    this.colliderLines = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ vertexColors: true, depthTest: true }));
    this.colliderLines.frustumCulled = false; this.colliderLines.visible = false;
    scene.add(this.colliderLines);
    bus.on('hit', (e) => {
      if (!ctx.debug.dmgNumbers) return;
      const v = ctx.byId.get(e.victimId);
      if (!v) return;
      const d = document.createElement('div');
      d.style.cssText = `position:fixed;z-index:25;font:bold 16px sans-serif;color:${e.headshot ? '#ff4040' : '#fff'};text-shadow:0 1px 2px #000;pointer-events:none`;
      d.textContent = String(e.damage);
      document.body.appendChild(d);
      this.nums.push({ el: d, pos: v.pos.clone().add(new THREE.Vector3(0, 5.4, 0)), t: 0.9 });
    });
  }

  toggle() { this.visible = !this.visible; this.el.style.display = this.visible ? 'block' : 'none'; }

  setStatus(s: string) { this.status = s; (this.el.querySelector('.st') as HTMLElement).textContent = s; }

  /** Garis graf nav (debug) — dibangun ulang saat ganti map. */
  buildNav() {
    if (this.navLines) { this.scene.remove(this.navLines); this.navLines.geometry.dispose(); (this.navLines.material as THREE.Material).dispose(); this.navLines = null; }
    if (!ctx.debug.showNav) return;
    const pos: number[] = [], col: number[] = [];
    const C = { walk: [1, 1, 1], door: [1, 0.55, 0.1], stair: [0.2, 1, 0.3], drop: [0.7, 0.3, 1] } as const;
    for (const e of ctx.nav.edges) {
      const A = ctx.nav.nodes[e.a], B = ctx.nav.nodes[e.b], c = C[e.kind];
      pos.push(A.x, A.y + 0.3, A.z, B.x, B.y + 0.3, B.z); col.push(...c, ...c);
    }
    for (const n of ctx.nav.nodes) for (const [dx, dz] of [[0.4, 0], [0, 0.4]]) {
      pos.push(n.x - dx, n.y + 0.3, n.z - dz, n.x + dx, n.y + 0.3, n.z + dz); col.push(1, 0.85, 0, 1, 0.85, 0);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    this.navLines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false, transparent: true }));
    this.navLines.renderOrder = 10; this.navLines.frustumCulled = false;
    this.scene.add(this.navLines);
  }

  update(dt: number, camera: THREE.PerspectiveCamera) {
    // wireframe collider: world.debugRender() → LineSegments (diperbarui 4× per detik)
    this.colliderLines.visible = ctx.debug.colliders;
    if (ctx.debug.colliders && (this.refreshT -= dt) <= 0) {
      this.refreshT = 0.25;
      const { vertices, colors } = physics.world.debugRender();
      const g = this.colliderLines.geometry;
      g.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
      g.setAttribute('color', new THREE.BufferAttribute(colors, 4));
      g.computeBoundingSphere();
    }
    // label state bot
    for (const e of ctx.entities) {
      let l = this.labels.get(e.id);
      const show = ctx.debug.botLabels && !!e.bot && e.alive;
      if (!show) { if (l) l.style.display = 'none'; continue; }
      if (!l) {
        l = document.createElement('div');
        l.style.cssText = 'position:fixed;z-index:25;font:11px Consolas,monospace;color:#ff0;background:rgba(0,0,0,.5);padding:1px 4px;pointer-events:none;transform:translate(-50%,-100%)';
        document.body.appendChild(l); this.labels.set(e.id, l);
      }
      this._v.set(e.renderPos.x, e.renderPos.y + 5.6, e.renderPos.z).project(camera);
      if (this._v.z > 1) { l.style.display = 'none'; continue; }
      l.style.display = 'block';
      l.style.left = `${(this._v.x * 0.5 + 0.5) * innerWidth}px`; l.style.top = `${(-this._v.y * 0.5 + 0.5) * innerHeight}px`;
      l.textContent = `${e.bot!.label} hp${e.hp}`;
    }
    // angka damage melayang
    for (let i = this.nums.length - 1; i >= 0; i--) {
      const n = this.nums[i];
      n.t -= dt; n.pos.y += dt * 1.5;
      this._v.copy(n.pos).project(camera);
      n.el.style.left = `${(this._v.x * 0.5 + 0.5) * innerWidth}px`; n.el.style.top = `${(-this._v.y * 0.5 + 0.5) * innerHeight}px`;
      n.el.style.opacity = String(Math.max(0, n.t / 0.9));
      if (n.t <= 0 || this._v.z > 1) { n.el.remove(); this.nums.splice(i, 1); }
    }
  }

  clearLabels() { for (const l of this.labels.values()) l.remove(); this.labels.clear(); }
}
