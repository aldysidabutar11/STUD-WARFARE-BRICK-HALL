// src/world/Breakables.ts — panel kaca destruktibel milik map aktif (MapDef.breakables; Boston: 3 panel Ruang Kaca ↔ Veranda).
// Utuh = collider STATIC (menahan gerak, peluru, granat, garis pandang bot); pecah = collider dinonaktifkan, mesh disembunyikan,
// gerbang nav terbuka (edge lewat panel bisa dilalui bot), serpihan kaca + suara. HP hanya dihitung host / main sendiri; klien
// menerapkan pecah dari event host ('glass') & daftar panel pecah di cadangan match (pindah host / bergabung ulang). Ronde baru
// (Eliminasi) & match baru memulihkan semua panel.
import * as THREE from 'three';
import { RAPIER, physics } from '../physics/Physics';
import { GROUPS } from '../physics/groups';
import { bus } from '../core/EventBus';
import { ctx } from '../game/ctx';

export interface BreakableDef { id: string; min: [number, number, number]; max: [number, number, number]; hp: number; gate?: string }

interface Panel { def: BreakableDef; hp: number; broken: boolean; col: RAPIER.Collider; mesh: THREE.Mesh }

const GLASS = 0xd6e8f0;
const _c = new THREE.Vector3(), _n = new THREE.Vector3();

export class Breakables {
  private panels: Panel[] = [];
  private byHandle = new Map<number, number>();
  private mat: THREE.Material | null = null;
  private geo = new THREE.BoxGeometry(1, 1, 1);

  get count() { return this.panels.length; }
  isBroken(i: number) { return !!this.panels[i]?.broken; }

  /** Bangun collider + mesh panel map baru (dipanggil Game.loadMap setelah map dibangun). pbr = material standar. */
  load(defs: readonly BreakableDef[], parent: THREE.Object3D, pbr: boolean) {
    this.unload();
    if (!defs.length) return;
    this.mat = pbr
      ? new THREE.MeshStandardMaterial({ color: GLASS, transparent: true, opacity: 0.24, roughness: 0.04, metalness: 0, envMapIntensity: 1.8, depthWrite: false })
      : new THREE.MeshLambertMaterial({ color: GLASS, transparent: true, opacity: 0.3, depthWrite: false });
    for (const def of defs) {
      const hx = (def.max[0] - def.min[0]) / 2, hy = (def.max[1] - def.min[1]) / 2, hz = (def.max[2] - def.min[2]) / 2;
      const col = physics.world.createCollider(RAPIER.ColliderDesc.cuboid(hx, hy, hz)
        .setTranslation(def.min[0] + hx, def.min[1] + hy, def.min[2] + hz).setCollisionGroups(GROUPS.STATIC));
      const mesh = new THREE.Mesh(this.geo, this.mat);
      // kaca tipis di tengah tebal collider
      const thin = 0.06;
      mesh.scale.set(hx * 2 < hz * 2 ? thin : hx * 2 - 0.1, hy * 2 - 0.1, hz * 2 <= hx * 2 ? thin : hz * 2 - 0.1);
      mesh.position.set(def.min[0] + hx, def.min[1] + hy, def.min[2] + hz);
      mesh.name = `glass_${def.id}`;
      mesh.renderOrder = 2;
      parent.add(mesh);
      this.byHandle.set(col.handle, this.panels.length);
      this.panels.push({ def, hp: def.hp, broken: false, col, mesh });
    }
  }

  /** Lepas collider & material (mesh ikut dilepas bersama grup map). Aman dipanggil berulang. */
  unload() {
    const w = physics.world;
    for (const p of this.panels) { if (w && w.colliders.contains(p.col.handle)) w.removeCollider(p.col, false); p.mesh.removeFromParent(); }
    this.panels = []; this.byHandle.clear();
    this.mat?.dispose(); this.mat = null;
  }

  /** Peluru mengenai collider `handle`: bila panel & host/offline → kurangi HP. true bila handle milik panel (utuh). */
  bulletHit(handle: number | undefined, dmg: number): boolean {
    if (handle === undefined) return false;
    const i = this.byHandle.get(handle);
    if (i === undefined || this.panels[i].broken) return false;
    if (ctx.net.role !== 'client') this.damage(i, dmg);
    return true;
  }

  /** Ledakan K-400 di c: panel dalam jari-jari yang terlihat dari titik ledak pecah (dokumen: 1 ledakan dalam 12 u). */
  explosion(c: THREE.Vector3, radius: number) {
    if (ctx.net.role === 'client') return;
    for (let i = 0; i < this.panels.length; i++) {
      const p = this.panels[i];
      if (p.broken) continue;
      const d = p.def;
      _c.set(Math.max(d.min[0], Math.min(c.x, d.max[0])), Math.max(d.min[1], Math.min(c.y, d.max[1])), Math.max(d.min[2], Math.min(c.z, d.max[2])));
      if (_c.distanceTo(c) >= radius) continue;
      // garis pandang ke titik terdekat panel, berhenti 0.15 u sebelum permukaannya (panel sendiri tidak menghalangi)
      _n.copy(_c).sub(c);
      const len = _n.length();
      if (len > 0.2) _c.addScaledVector(_n, -0.15 / len);
      if (len <= 0.2 || !physics.losBlocked(c.x, c.y, c.z, _c.x, _c.y, _c.z)) this.damage(i, p.hp);
    }
  }

  private damage(i: number, dmg: number) {
    const p = this.panels[i];
    p.hp -= dmg;
    if (p.hp <= 0) this.breakPanel(i);
  }

  /** Pecahkan panel i (host/offline: dari damage; klien: dari event host). fx = serpihan & suara. */
  breakPanel(i: number, fx = true) {
    const p = this.panels[i];
    if (!p || p.broken) return;
    p.broken = true; p.hp = 0;
    p.col.setEnabled(false);
    p.mesh.visible = false;
    if (p.def.gate) ctx.nav?.setGate(p.def.gate, true);
    const d = p.def;
    ctx.vfx?.clearDecalsIn(d.min, d.max);
    if (!fx) return;
    _c.set((d.min[0] + d.max[0]) / 2, (d.min[1] + d.max[1]) / 2, (d.min[2] + d.max[2]) / 2);
    const thinX = d.max[0] - d.min[0] < d.max[2] - d.min[2];
    for (let k = 0; k < 24; k++) {
      const u = Math.random() - 0.5, v = Math.random() - 0.5;
      const pt = new THREE.Vector3(thinX ? _c.x : _c.x + u * (d.max[0] - d.min[0]), _c.y + v * (d.max[1] - d.min[1]), thinX ? _c.z + u * (d.max[2] - d.min[2]) : _c.z);
      _n.set(thinX ? (k % 2 ? 1 : -1) : 0, 0.2, thinX ? 0 : (k % 2 ? 1 : -1));
      ctx.vfx?.chips(pt, _n, GLASS, 1);
    }
    bus.emit('glass:break', { index: i, position: _c.clone() });
  }

  /** Semua panel utuh lagi (ronde / match baru). */
  reset() {
    for (const p of this.panels) {
      p.hp = p.def.hp;
      if (!p.broken) continue;
      p.broken = false;
      p.col.setEnabled(true);
      p.mesh.visible = true;
      if (p.def.gate) ctx.nav?.setGate(p.def.gate, false);
    }
  }

  /** Indeks panel yang pecah (cadangan match / pesan start). */
  brokenList(): number[] { return this.panels.flatMap((p, i) => p.broken ? [i] : []); }
  /** Terapkan daftar panel pecah dari host/cadangan (tanpa efek). */
  applyBroken(list: readonly number[]) { for (const i of list) if (Number.isInteger(i)) this.breakPanel(i, false); }
}
