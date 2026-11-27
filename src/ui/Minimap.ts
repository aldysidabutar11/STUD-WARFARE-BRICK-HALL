// src/ui/Minimap.ts — radar berputar (GDD §1 "Pasca-MVP: minimap"). Peta statis dirender sekali dari data map AKTIF (MapDef:
// batas, balok + rotY, tangga, slot spawn) dan dibangun ulang saat ganti map (setMap), lalu digambar dengan transformasi yaw
// pemain. Musuh muncul bila menembak (senjata tanpa peredam), terlihat pemain, atau dilaporkan bot rekan setim (BotDirector).
import * as THREE from 'three';
import { XCFG } from '../config/extraConfig';
import { CFG } from '../config/gameConfig';
import { WEAPONS } from '../config/weaponsData';
import { stairFrame, type Box } from '../world/MapData';
import { currentMap, type MapDef } from '../world/maps/registry';
import { physics } from '../physics/Physics';
import { bus } from '../core/EventBus';
import { ctx } from '../game/ctx';
import { canvasFont } from './fonts';
import type { Entity } from '../entities/Entity';

const RD = XCFG.radar;
const _eye = new THREE.Vector3(), _head = new THREE.Vector3();

/** Palet radar: dalam ruang (Brick Hall, nilai lama) / luar ruang (tanah berdebu, kontainer baja). */
const PAL = {
  indoor: { floor: '#2b1e14', upper: '#6a4a2e', stair: '#4d3522', wall: '#0e0906', pillar: '#3b2616', shelf: '#8a5a2e', cover: '#a9824f', rail: '#d9b56a' },
  outdoor: { floor: '#3a3226', upper: '#6a5a40', stair: '#4d4232', wall: '#131210', pillar: '#3b3328', shelf: '#7d6a4a', cover: '#a99a78', rail: '#d9c58a' },
};

/** Gambar peta statis map `def` (1 unit = RD.pxPerUnit px; asal kanvas = (X0, Z0) = sudut batas − 1 u). floorY (map berlantai
 *  banyak, MapDef.radarFloors) = hanya lantai itu: lantai = tanah (Y 0) atau tapak pelat di Y itu, penghalang = balok yang memotong
 *  pita badan (lantai + 0.5 … + 5), ruang spawn = yang ada di lantai itu. */
function buildMapImage(def: MapDef, X0: number, Z0: number, W: number, H: number, floorY?: number): HTMLCanvasElement {
  const S = RD.pxPerUnit, c = document.createElement('canvas'), P = def.atmosphere.outdoor ? PAL.outdoor : PAL.indoor;
  c.width = W * S; c.height = H * S;
  const g = c.getContext('2d')!;
  // balok berputar (rotY): persegi diputar di pusatnya (kanvas: x → kanan, z → bawah ⇒ sudut kanvas = −rotY)
  const rect = (b: Box, fill: string) => {
    g.fillStyle = fill;
    if (!b.rotY) { g.fillRect((b.min[0] - X0) * S, (b.min[2] - Z0) * S, (b.max[0] - b.min[0]) * S, (b.max[2] - b.min[2]) * S); return; }
    const w = (b.max[0] - b.min[0]) * S, h = (b.max[2] - b.min[2]) * S;
    g.save();
    g.translate(((b.min[0] + b.max[0]) / 2 - X0) * S, ((b.min[2] + b.max[2]) / 2 - Z0) * S);
    g.rotate(-b.rotY);
    g.fillRect(-w / 2, -h / 2, w, h);
    g.restore();
  };
  const bx = def.bounds.x, bz = def.bounds.z, per = floorY !== undefined, fy = floorY ?? 0;
  if (!per || fy < 1) { g.fillStyle = P.floor; g.fillRect((bx[0] - X0) * S, (bz[0] - Z0) * S, (bx[1] - bx[0]) * S, (bz[1] - bz[0]) * S); }  // lantai dasar
  if (!per) { for (const b of def.boxes) if (b.cat === 'mass' || b.cat === 'bridge') rect(b, P.upper); }                                       // lantai 2 (Y 10)
  else if (fy >= 1) for (const b of def.boxes) if ((b.cat === 'mass' || b.cat === 'bridge') && Math.abs(b.max[1] - fy) < 0.6) rect(b, P.floor);
  for (const s of def.stairs) {                                                                                      // tangga: garis anak tangga
    const f = stairFrame(s);
    if (per && (f.y1 < fy - 5.5 || f.y0 > fy + 0.5)) continue;
    g.fillStyle = P.stair; g.fillRect((f.x[0] - X0) * S, (f.z[0] - Z0) * S, (f.x[1] - f.x[0]) * S, (f.z[1] - f.z[0]) * S);
    g.strokeStyle = 'rgba(255,230,190,0.25)'; g.lineWidth = 1;
    const run = 2 * Math.abs(f.top - f.foot) / Math.max(1, Math.round((f.y1 - f.y0) / 0.5));   // garis tiap 2 anak tangga (Brick Hall: 1.43 u seperti dulu)
    if (f.axis === 'z') for (let z = f.z[0]; z < f.z[1]; z += run) { g.beginPath(); g.moveTo((f.x[0] - X0) * S, (z - Z0) * S); g.lineTo((f.x[1] - X0) * S, (z - Z0) * S); g.stroke(); }
    else for (let x = f.x[0]; x < f.x[1]; x += run) { g.beginPath(); g.moveTo((x - X0) * S, (f.z[0] - Z0) * S); g.lineTo((x - X0) * S, (f.z[1] - Z0) * S); g.stroke(); }
  }
  const onFloor = (b: Box) => !per || (b.min[1] < fy + 5 && b.max[1] > fy + 0.5);
  // area spawn diberi warna tim: tapak balok kategori 'spawn' di sisi tim (Brick Hall: ruang spawn), atau — bila map tidak
  // punya — kotak 6 × 6 u di sekitar tiap slot (satu path → tanpa tumpukan alfa)
  for (const [team, fill, sgn] of [['blue', 'rgba(61,142,224,0.35)', -1], ['red', 'rgba(224,72,61,0.35)', 1]] as const) {
    const rooms = def.boxes.filter(b => b.cat === 'spawn' && Math.sign(b.min[2] + b.max[2]) === sgn && onFloor(b));
    g.fillStyle = fill;
    if (per && !rooms.length) continue;
    if (rooms.length) {
      const x0 = Math.min(...rooms.map(b => b.min[0])), x1 = Math.max(...rooms.map(b => b.max[0]));
      const z0 = Math.min(...rooms.map(b => b.min[2])), z1 = Math.max(...rooms.map(b => b.max[2]));
      g.fillRect((x0 - X0) * S, (z0 - Z0) * S, (x1 - x0) * S, (z1 - z0) * S);
    } else {
      g.beginPath();
      for (const [x, , z] of [...def.spawnSlots[team].upper, ...def.spawnSlots[team].ground]) g.rect((x - 3 - X0) * S, (z - 3 - Z0) * S, 6 * S, 6 * S);
      g.fill();
    }
  }
  for (const b of def.boxes) {
    const h = b.max[1] - b.min[1];
    if (per) { if (!onFloor(b) || b.cat === 'mass' || b.cat === 'bridge' || b.cat === 'rail' || b.min[1] > fy + 4) continue; }
    else if (b.max[1] <= 0.01 || b.min[1] > 10.5 || h < 1.5) continue;                                // tanah, plafon/lintel/rel tipis
    if (b.cat === 'shell' || b.cat === 'wall' || b.cat === 'spawn') rect(b, P.wall);
    else if (b.cat === 'pillar') rect(b, P.pillar);
    else if (b.cat === 'shelf') rect(b, P.shelf);
    else if (b.cat === 'cover' || b.cat === 'prop') rect(b, P.cover);
  }
  for (const b of def.boxes) if (b.cat === 'rail' && onFloor(b)) rect(b, P.rail);
  return c;
}

export class Minimap {
  readonly el = document.createElement('div');
  private canvas = document.createElement('canvas');
  private g: CanvasRenderingContext2D;
  private img: HTMLCanvasElement;
  /** Map berlantai banyak: gambar per lantai (Y lantai urut naik); img = lantai fokus saat ini. */
  private floors: { y: number; img: HTMLCanvasElement }[] = [];
  private shotT = new Map<number, number>();
  private spotT = new Map<number, number>();
  private frame = 0;
  private dpr = 1;

  /** Nama area di bawah radar (callout/orientasi, v2). */
  private zone = document.createElement('div');
  private zoneText = '';
  /** Asal kanvas peta (sudut batas map − 1 u) & map yang sedang digambar. */
  private X0 = 0; private Z0 = 0;
  private def: MapDef;

  constructor(parent: HTMLElement) {
    this.el.className = 'minimap';
    this.zone.className = 'zone';
    this.el.append(this.canvas, this.zone);
    parent.appendChild(this.el);
    this.g = this.canvas.getContext('2d')!;
    this.def = currentMap();
    this.img = this.buildImage(this.def);
    this.resize();
    addEventListener('resize', () => this.resize());
    // peredam: tembakan tidak menampakkan penembak di radar
    bus.on('shot', (e) => { if (!WEAPONS[e.weaponId].suppressed) this.shotT.set(e.shooterId, ctx.time); });
  }

  private resize() {
    this.dpr = Math.min(2, devicePixelRatio || 1);
    this.canvas.width = Math.round(RD.size * this.dpr); this.canvas.height = Math.round(RD.size * this.dpr);
  }

  reset() { this.shotT.clear(); this.spotT.clear(); }

  /** Ganti map: gambar ulang peta statis dari MapDef baru. */
  setMap(def: MapDef) {
    if (def === this.def) return;
    this.def = def; this.img = this.buildImage(def);
    this.zoneText = ''; this.zone.textContent = ''; this.reset();
  }

  private buildImage(def: MapDef): HTMLCanvasElement {
    this.X0 = def.bounds.x[0] - 1; this.Z0 = def.bounds.z[0] - 1;
    const W = def.bounds.x[1] - def.bounds.x[0] + 2, H = def.bounds.z[1] - def.bounds.z[0] + 2;
    this.floors = (def.radarFloors ?? []).map(y => ({ y, img: buildMapImage(def, this.X0, this.Z0, W, H, y) }));
    return this.floors[0]?.img ?? buildMapImage(def, this.X0, this.Z0, W, H);
  }

  private vis = true;
  setVisible(v: boolean) { if (v !== this.vis) { this.vis = v; this.el.style.display = v ? 'block' : 'none'; } }

  /** focus = entitas pusat radar (pemain, atau rekan yang ditonton); yaw = arah kamera. */
  update(focus: Entity | null, yaw: number, player: Entity | null) {
    if (!focus || !player || !this.vis) return;
    this.frame++;
    if (this.frame % 10 === 0) {
      const z = this.def.zoneName(focus.renderPos.x, focus.renderPos.y, focus.renderPos.z);
      if (z !== this.zoneText) { this.zoneText = z; this.zone.textContent = z; }
    }
    if (this.frame % 6 === 0 && player.alive) this.spot(player);
    if (this.frame % 2) return; // gambar 30 Hz
    const g = this.g, size = this.canvas.width, R = size / 2 - 2 * this.dpr, C = size / 2;
    const k = R / RD.range, S = RD.pxPerUnit, c = Math.cos(yaw), s = Math.sin(yaw), X0 = this.X0, Z0 = this.Z0;
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
    if (this.floors.length) {   // lantai fokus: tertinggi yang Y-nya ≤ kaki + 3 (di tangga ganti di tengah)
      let img = this.floors[0].img;
      for (const f of this.floors) if (focus.renderPos.y >= f.y - 3) img = f.img;
      this.img = img;
    }
    g.drawImage(this.img, 0, 0);
    g.globalAlpha = 1;
    g.setTransform(1, 0, 0, 1, 0, 0);
    const toScreen = (x: number, z: number): [number, number] => {
      const dx = x - px, dz = z - pz;
      return [C + k * (c * dx - s * dz), C + k * (s * dx + c * dz)];
    };
    // granat hidup
    ctx.grenades.forEachLive((x, _y, z, _f, _o, _id, kind) => {
      const [sx, sy] = toScreen(x, z);
      if (kind === 'flash') { g.fillStyle = '#f2f6ff'; g.beginPath(); g.arc(sx, sy, 3 * this.dpr, 0, Math.PI * 2); g.fill(); return; }
      g.fillStyle = '#ffb02e'; g.beginPath(); g.arc(sx, sy, 3.2 * this.dpr, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(255,90,40,0.6)'; g.lineWidth = 1 * this.dpr; g.beginPath(); g.arc(sx, sy, CFG.grenade.blastRadius * k, 0, Math.PI * 2); g.stroke();
    });
    // Bomb Mission: huruf zona A/B; C4 tertanam (berkedip, semua) / jatuh (penyerang saja) / pembawa (rekan penyerang)
    if (ctx.match.mode === 'bomb' && this.def.bombSites) {
      g.font = canvasFont(13 * this.dpr, 900); g.textAlign = 'center'; g.textBaseline = 'middle';
      for (const st of this.def.bombSites) {
        const [sx, sy] = toScreen((st.min[0] + st.max[0]) / 2, (st.min[2] + st.max[2]) / 2);
        g.fillStyle = 'rgba(0,0,0,0.55)'; g.beginPath(); g.arc(sx, sy, 7.5 * this.dpr, 0, Math.PI * 2); g.fill();
        g.fillStyle = ctx.bomb.state === 'planted' && ctx.bomb.site === st.id ? '#ff5a40' : '#f5cd30';
        g.fillText(st.id, sx, sy + 0.5 * this.dpr);
      }
      const b = ctx.bomb, att = player.team === b.attackers;
      const show = b.state === 'planted' || (b.state === 'dropped' && att);
      if (show) {
        const [sx, sy] = toScreen(b.pos.x, b.pos.z), blink = b.state !== 'planted' || Math.floor(ctx.time * 3) % 2 === 0;
        g.fillStyle = blink ? '#ff3b2e' : '#7a1a14';
        g.fillRect(sx - 4 * this.dpr, sy - 2.5 * this.dpr, 8 * this.dpr, 5 * this.dpr);
        g.strokeStyle = '#000'; g.lineWidth = 1 * this.dpr; g.strokeRect(sx - 4 * this.dpr, sy - 2.5 * this.dpr, 8 * this.dpr, 5 * this.dpr);
      }
      if (b.state === 'carried' && att) {
        const c = ctx.byId.get(b.carrier);
        if (c && c.alive && c !== focus) {
          const [sx, sy] = toScreen(c.renderPos.x, c.renderPos.z);
          g.strokeStyle = '#ff5a40'; g.lineWidth = 2 * this.dpr; g.beginPath(); g.arc(sx, sy, 6 * this.dpr, 0, Math.PI * 2); g.stroke();
        }
      }
    }
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
    g.fillStyle = '#f5cd30'; g.font = canvasFont(12 * this.dpr); g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('U', nx, ny);
    // titik spawn tim pemain (orientasi): slot ke-3 lantai pertama yang ada (Brick Hall: ruang spawn atas)
    const ss = this.def.spawnSlots[player.team], fl = ss.upper.length ? ss.upper : ss.ground, sp = fl[Math.min(2, fl.length - 1)];
    if (!sp) return;
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
