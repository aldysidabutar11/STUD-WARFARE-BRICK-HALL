// src/ui/Minimap.ts — radar berputar (GDD §1 "Pasca-MVP: minimap"). Peta statis dirender sekali dari manifest MapData,
// lalu digambar dengan transformasi yaw pemain. Musuh muncul bila menembak (senjata tanpa peredam), terlihat pemain,
// atau dilaporkan bot rekan setim (BotDirector).
import * as THREE from 'three';
import { XCFG } from '../config/extraConfig';
import { CFG } from '../config/gameConfig';
import { BOXES, STAIRS, SPAWN_SLOTS, zoneName, type Box } from '../world/MapData';
import { physics } from '../physics/Physics';
import { bus } from '../core/EventBus';
import { ctx } from '../game/ctx';
import type { Entity } from '../entities/Entity';

const RD = XCFG.radar;
const X0 = -31, Z0 = -51, W = 62, H = 102;
const _eye = new THREE.Vector3(), _head = new THREE.Vector3();

function buildMapImage(): HTMLCanvasElement {
  const S = RD.pxPerUnit, c = document.createElement('canvas');
  c.width = W * S; c.height = H * S;
  const g = c.getContext('2d')!;
  const rect = (b: Box, fill: string) => { g.fillStyle = fill; g.fillRect((b.min[0] - X0) * S, (b.min[2] - Z0) * S, (b.max[0] - b.min[0]) * S, (b.max[2] - b.min[2]) * S); };
  g.fillStyle = '#2b1e14'; g.fillRect((-30 - X0) * S, (-50 - Z0) * S, 60 * S, 100 * S);                // lantai dasar
  for (const b of BOXES) if (b.cat === 'mass' || b.cat === 'bridge') rect(b, '#6a4a2e');            // lantai 2 (Y 10)
  for (const s of STAIRS) {                                                                           // tangga: garis anak tangga
    const z0 = Math.min(s.zFoot, s.zTop), z1 = Math.max(s.zFoot, s.zTop);
    g.fillStyle = '#4d3522'; g.fillRect((s.x[0] - X0) * S, (z0 - Z0) * S, (s.x[1] - s.x[0]) * S, (z1 - z0) * S);
    g.strokeStyle = 'rgba(255,230,190,0.25)'; g.lineWidth = 1;
    for (let z = z0; z < z1; z += 1.43) { g.beginPath(); g.moveTo((s.x[0] - X0) * S, (z - Z0) * S); g.lineTo((s.x[1] - X0) * S, (z - Z0) * S); g.stroke(); }
  }
  // ruang spawn diberi warna tim
  g.fillStyle = 'rgba(61,142,224,0.35)'; g.fillRect((-9.4 - X0) * S, (-50 - Z0) * S, 18.8 * S, 6.9 * S);
  g.fillStyle = 'rgba(224,72,61,0.35)'; g.fillRect((-9.4 - X0) * S, (43.1 - Z0) * S, 18.8 * S, 6.9 * S);
  for (const b of BOXES) {
    const h = b.max[1] - b.min[1];
    if (b.id === 'GROUND' || b.id === 'CEILING' || b.min[1] > 10.5 || h < 1.5) continue;              // plafon/lintel/rel tipis
    if (b.cat === 'shell' || b.cat === 'wall' || b.cat === 'spawn') rect(b, '#0e0906');
    else if (b.cat === 'pillar') rect(b, '#3b2616');
    else if (b.cat === 'shelf') rect(b, '#8a5a2e');
    else if (b.cat === 'cover' || b.cat === 'prop') rect(b, '#a9824f');
  }
  for (const b of BOXES) if (b.cat === 'rail') rect(b, '#d9b56a');
  return c;
}

export class Minimap {
  readonly el = document.createElement('div');
  private canvas = document.createElement('canvas');
  private g: CanvasRenderingContext2D;
  private img: HTMLCanvasElement;
  private shotT = new Map<number, number>();
  private spotT = new Map<number, number>();
  private frame = 0;
  private dpr = 1;

  /** Nama area di bawah radar (callout/orientasi, v2). */
  private zone = document.createElement('div');
  private zoneText = '';

  constructor(parent: HTMLElement) {
    this.el.className = 'minimap';
    this.zone.className = 'zone';
    this.el.append(this.canvas, this.zone);
    parent.appendChild(this.el);
    this.g = this.canvas.getContext('2d')!;
    this.img = buildMapImage();
    this.resize();
    addEventListener('resize', () => this.resize());
    bus.on('shot', (e) => this.shotT.set(e.shooterId, ctx.time));
  }

  private resize() {
    this.dpr = Math.min(2, devicePixelRatio || 1);
    this.canvas.width = Math.round(RD.size * this.dpr); this.canvas.height = Math.round(RD.size * this.dpr);
  }

  reset() { this.shotT.clear(); this.spotT.clear(); }

  private vis = true;
  setVisible(v: boolean) { if (v !== this.vis) { this.vis = v; this.el.style.display = v ? 'block' : 'none'; } }

  /** focus = entitas pusat radar (pemain, atau rekan yang ditonton); yaw = arah kamera. */
  update(focus: Entity | null, yaw: number, player: Entity | null) {
    if (!focus || !player || !this.vis) return;
    this.frame++;
    if (this.frame % 10 === 0) {
      const z = zoneName(focus.renderPos.x, focus.renderPos.y, focus.renderPos.z);
      if (z !== this.zoneText) { this.zoneText = z; this.zone.textContent = z; }
    }
    if (this.frame % 6 === 0 && player.alive) this.spot(player);
    if (this.frame % 2) return; // gambar 30 Hz
    const g = this.g, size = this.canvas.width, R = size / 2 - 2 * this.dpr, C = size / 2;
    const k = R / RD.range, S = RD.pxPerUnit, c = Math.cos(yaw), s = Math.sin(yaw);
    const px = focus.renderPos.x, pz = focus.renderPos.z;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, size, size);
    g.save();
    g.beginPath(); g.arc(C, C, R, 0, Math.PI * 2); g.clip();
    g.fillStyle = 'rgba(8,5,3,0.78)'; g.fillRect(0, 0, size, size);
    // peta: layar = C + k·Rot(yaw)·(dunia − fokus)
    g.setTransform(k / S * c, k / S * s, -k / S * s, k / S * c,
      C + k * (c * (X0 - px) - s * (Z0 - pz)), C + k * (s * (X0 - px) + c * (Z0 - pz)));
    g.globalAlpha = 0.95;
    g.drawImage(this.img, 0, 0);
    g.globalAlpha = 1;
    g.setTransform(1, 0, 0, 1, 0, 0);
    const toScreen = (x: number, z: number): [number, number] => {
      const dx = x - px, dz = z - pz;
      return [C + k * (c * dx - s * dz), C + k * (s * dx + c * dz)];
    };
    // granat hidup
    ctx.grenades.forEachLive((x, _y, z) => {
      const [sx, sy] = toScreen(x, z);
      g.fillStyle = '#ffb02e'; g.beginPath(); g.arc(sx, sy, 3.2 * this.dpr, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(255,90,40,0.6)'; g.lineWidth = 1 * this.dpr; g.beginPath(); g.arc(sx, sy, CFG.grenade.blastRadius * k, 0, Math.PI * 2); g.stroke();
    });
    const now = ctx.time;
    for (const e of ctx.entities) {
      if (!e.alive || e === focus) continue;
      const ally = e.team === player.team;
      let alpha = 1;
      if (!ally) {
        const seen = Math.max(this.spotT.get(e.id) ?? -99, ctx.directors[player.team].lastSeen(e.id));
        const a1 = 1 - (now - (this.shotT.get(e.id) ?? -99)) / RD.shotReveal, a2 = 1 - (now - seen) / RD.spotReveal;
        alpha = Math.max(a1, a2);
        if (alpha <= 0) continue;
      }
      const [sx, sy] = toScreen(e.renderPos.x, e.renderPos.z);
      const other = Math.abs(e.renderPos.y - focus.renderPos.y) > RD.levelDiff;
      this.blip(sx, sy, e.yaw - yaw, ally ? '#5aa9ff' : '#ff5146', Math.min(1, alpha), other);
    }
    g.restore();
    // pemain / fokus di tengah (selalu menghadap ke atas) + cincin & penanda Utara
    this.arrow(C, C, focus === player ? '#ffffff' : '#9fd0ff');
    g.strokeStyle = 'rgba(245,205,48,0.55)'; g.lineWidth = 2 * this.dpr;
    g.beginPath(); g.arc(C, C, R, 0, Math.PI * 2); g.stroke();
    const nx = C - s * (R - 9 * this.dpr), ny = C + c * (R - 9 * this.dpr); // arah +Z (Utara) di layar
    g.fillStyle = '#f5cd30'; g.font = `bold ${11 * this.dpr}px Segoe UI, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('U', nx, ny);
    // titik spawn tim pemain (orientasi)
    const sp = SPAWN_SLOTS[player.team].upper[2];
    const [bx, by] = toScreen(sp[0], sp[2]);
    if (Math.hypot(bx - C, by - C) < R - 6 * this.dpr) { g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(bx - 2 * this.dpr, by - 2 * this.dpr, 4 * this.dpr, 4 * this.dpr); }
  }

  /** Musuh dalam pandangan pemain (kerucut FOV + LOS ke kepala/dada) tercatat "terlihat". */
  private spot(p: Entity) {
    const cam = ctx.engine.camera, fovH = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2) * cam.aspect);
    const cosHalf = Math.cos(fovH / 2), fx = -Math.sin(ctx.camRig.yaw), fz = -Math.cos(ctx.camRig.yaw);
    p.eye(_eye);
    for (const e of ctx.entities) {
      if (!e.alive || e.team === p.team) continue;
      const dx = e.pos.x - p.pos.x, dz = e.pos.z - p.pos.z, d = Math.hypot(dx, dz);
      if (d > 80 || (d > 3 && (dx * fx + dz * fz) / d < cosHalf)) continue;
      e.partCenter('head', _head);
      let vis = !physics.losBlocked(_eye.x, _eye.y, _eye.z, _head.x, _head.y, _head.z);
      if (!vis) { e.partCenter('upper', _head); vis = !physics.losBlocked(_eye.x, _eye.y, _eye.z, _head.x, _head.y, _head.z); }
      if (vis) this.spotT.set(e.id, ctx.time);
    }
  }

  private blip(x: number, y: number, relYaw: number, color: string, alpha: number, otherLevel: boolean) {
    const g = this.g, r = 4.2 * this.dpr;
    g.globalAlpha = alpha;
    g.fillStyle = color; g.strokeStyle = color; g.lineWidth = 1.6 * this.dpr;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2);
    if (otherLevel) g.stroke(); else g.fill();
    // ekor arah hadap
    const fx = -Math.sin(relYaw), fy = -Math.cos(relYaw);
    g.beginPath(); g.moveTo(x + fx * r * 0.6, y + fy * r * 0.6); g.lineTo(x + fx * r * 2.1, y + fy * r * 2.1); g.stroke();
    g.globalAlpha = 1;
  }

  private arrow(x: number, y: number, color: string) {
    const g = this.g, d = this.dpr;
    g.fillStyle = color; g.strokeStyle = 'rgba(0,0,0,0.8)'; g.lineWidth = 1.5 * d;
    g.beginPath(); g.moveTo(x, y - 7 * d); g.lineTo(x + 5 * d, y + 5 * d); g.lineTo(x, y + 2.5 * d); g.lineTo(x - 5 * d, y + 5 * d); g.closePath();
    g.fill(); g.stroke();
  }
}
