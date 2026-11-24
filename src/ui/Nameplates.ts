// src/ui/Nameplates.ts — nama di atas kepala: rekan setim selalu (dengan bar HP, redup bila terhalang),
// musuh hanya saat dibidik crosshair (tanpa wallhack). Fitur pembanding FPS lain.
import * as THREE from 'three';
import { XCFG } from '../config/extraConfig';
import { physics } from '../physics/Physics';
import { castShot } from '../combat/Ballistics';
import { ctx } from '../game/ctx';
import type { Entity } from '../entities/Entity';

const XN = XCFG.nameplate;
const _v = new THREE.Vector3(), _f = new THREE.Vector3(), _h = new THREE.Vector3();

interface Plate { el: HTMLDivElement; bar: HTMLElement; hp: number; occl: boolean; shown: boolean }

export class Nameplates {
  readonly el = document.createElement('div');
  private items = new Map<number, Plate>();
  /** Musuh yang sedang di bawah crosshair (dipakai juga untuk perlambatan bidik gamepad). */
  aimedEnemy: Entity | null = null;
  private aimT = 0;
  private frame = 0;

  constructor(parent: HTMLElement) {
    this.el.className = 'plates';
    parent.appendChild(this.el);
  }

  clear() { for (const it of this.items.values()) it.el.remove(); this.items.clear(); this.aimedEnemy = null; }

  private plate(e: Entity, ally: boolean): Plate {
    let it = this.items.get(e.id);
    if (!it) {
      const el = document.createElement('div');
      el.className = 'plate ' + (ally ? 'ally' : 'enemy');
      el.innerHTML = `<span>${e.name}</span>${ally ? '<i><b></b></i>' : ''}`;
      this.el.appendChild(el);
      it = { el, bar: el.querySelector('b') as HTMLElement, hp: -1, occl: false, shown: false };
      this.items.set(e.id, it);
    }
    return it;
  }

  private hide(it: Plate) { if (it.shown) { it.shown = false; it.el.style.display = 'none'; } }

  /** viewer = pemain (atau null: semua disembunyikan); spectated = rekan yang sedang ditonton (tanpa plat). */
  update(dt: number, cam: THREE.PerspectiveCamera, viewer: Entity | null, enabled: boolean, spectated: Entity | null = null) {
    this.frame++;
    if (!viewer || !enabled) { for (const it of this.items.values()) this.hide(it); this.aimedEnemy = null; return; }
    // musuh di bawah crosshair (sinar kamera, terhalang dunia)
    if (viewer.alive && this.frame % 2 === 0) {
      ctx.camRig.forward(_f);
      const h = castShot(cam.position, _f, 0, viewer, true);
      if (h && h.kind === 'body' && h.victim && h.victim.team !== viewer.team) { this.aimedEnemy = h.victim; this.aimT = XN.enemyLinger; }
    }
    if ((this.aimT -= dt) <= 0 || (this.aimedEnemy && !this.aimedEnemy.alive)) { this.aimedEnemy = null; this.aimT = 0; }
    const W = innerWidth, H = innerHeight;
    for (const e of ctx.entities) {
      if (e === viewer) continue;
      const ally = e.team === viewer.team;
      const it = this.plate(e, ally);
      const d = e.renderPos.distanceTo(cam.position);
      const want = e.alive && e !== spectated && (ally ? d < XN.allyRange : e === this.aimedEnemy);
      if (!want) { this.hide(it); continue; }
      _v.set(e.renderPos.x, e.renderPos.y + (e.crouched ? XN.heightCrouch : XN.height), e.renderPos.z).project(cam);
      if (_v.z > 1 || Math.abs(_v.x) > 1.05 || Math.abs(_v.y) > 1.05) { this.hide(it); continue; }
      if (!it.shown) { it.shown = true; it.el.style.display = 'block'; }
      it.el.style.transform = `translate(${((_v.x * 0.5 + 0.5) * W).toFixed(1)}px, ${((-_v.y * 0.5 + 0.5) * H).toFixed(1)}px) translate(-50%, -100%)`;
      if (ally) {
        const hp = Math.round(e.hp);
        if (hp !== it.hp) { it.hp = hp; it.bar.style.width = `${hp}%`; it.bar.classList.toggle('low', hp < 35); }
        // rekan di balik dinding: plat redup (dicek bergiliran ±6 Hz per entitas)
        if ((this.frame + e.id) % 10 === 0) {
          e.partCenter('head', _h);
          it.occl = physics.losBlocked(cam.position.x, cam.position.y, cam.position.z, _h.x, _h.y + 0.8, _h.z);
          it.el.classList.toggle('occl', it.occl);
        }
      }
    }
  }
}
