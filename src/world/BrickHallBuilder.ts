// src/world/BrickHallBuilder.ts — mesh (merge per material), collider, lampu (GDD §4, §10.1–10.2)
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RAPIER, physics } from '../physics/Physics';
import { GROUPS } from '../physics/groups';
import type { Preset } from '../config/gameConfig';
import {
  BOXES, CARPETS, CORRIDOR_LAMPS, SKYLIGHTS, STAIRS, STAIR_RISE, STAIR_RUN, STAIR_STEPS, WINDOWS, type Box, type Style,
} from './MapData';
import * as TX from './StudTextureGen';
import { MeshBuckets, type SlotMats } from './BoxBuilder';

export interface ShelfInfo { index: number; id: string; cx: number; cz: number; alongX: boolean }
export interface BuiltMap {
  group: THREE.Group;
  shelves: ShelfInfo[];
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  triangles: number;
  colliders: number;
}

const COL = {
  deck: 0x7c5c46, darkwood: 0x4a2c17, panel: 0x6b4226, plaster: 0xd8cbb3, shelf: 0x7a4a26,
  table: 0xa87b4f, crate: 0xa8763e, carpet: 0x1f3a73, carpetEdge: 0xe8dcc0,
};

export function buildBrickHall(scene: THREE.Scene, preset: Preset, aniso: number, highQuality: boolean): BuiltMap {
  const world = physics.world;
  const group = new THREE.Group();
  group.name = 'BrickHall';
  const shadows = preset.shadowMap > 0;

  // ── material: warna lewat vertex color → semua balok berwarna cukup atas/sisi/bawah (+ dinding buku, polos)
  const stud = TX.studTexture(aniso), inlet = TX.inletTexture(aniso), side = TX.sideTexture(aniso);
  const books = TX.bookwallTexture(aniso), tiles = TX.tileTexture(aniso);
  const V = (map: THREE.Texture | null) => new THREE.MeshLambertMaterial({ color: 0xffffff, map, vertexColors: true });
  const topM = V(stud), sideM = V(side), botM = V(inlet), plainM = V(null), bookM = V(books);
  const set = (c: number): SlotMats => ({ top: [topM, c], side: [sideM, c], bottom: [botM, c] });
  const STY: Record<Exclude<Style, 'hidden'>, SlotMats> = {
    plaster: set(COL.plaster),
    ceiling: { top: [sideM, COL.darkwood], side: [sideM, COL.darkwood], bottom: [botM, COL.darkwood] },
    balc: { top: [topM, COL.deck], side: [bookM, 0xffffff], bottom: [botM, COL.deck] },
    base: { top: [topM, COL.deck], side: [sideM, COL.panel], bottom: [botM, COL.deck] },
    deck: { top: [topM, COL.deck], side: [sideM, COL.darkwood], bottom: [botM, COL.darkwood] },
    darkwood: set(COL.darkwood),
    panel: set(COL.panel),
    table: set(COL.table),
    crate: set(COL.crate),
    tower: { top: [topM, COL.darkwood], side: [bookM, 0xffffff], bottom: [botM, COL.darkwood] },
    rail: set(COL.darkwood),
    shelf: set(COL.shelf),
  };
  const carpetSlots: SlotMats = { top: [plainM, COL.carpet], side: [plainM, COL.carpetEdge], bottom: [plainM, COL.carpet] };
  const edgeSlots: SlotMats = { top: [plainM, COL.carpetEdge], side: [plainM, COL.carpetEdge], bottom: [plainM, COL.carpetEdge] };

  const solid = new MeshBuckets();
  let colliders = 0;

  const cuboid = (min: ArrayLike<number>, max: ArrayLike<number>) => {
    const hx = (max[0] - min[0]) / 2, hy = (max[1] - min[1]) / 2, hz = (max[2] - min[2]) / 2;
    const c = world.createCollider(RAPIER.ColliderDesc.cuboid(hx, hy, hz)
      .setTranslation(min[0] + hx, min[1] + hy, min[2] + hz).setCollisionGroups(GROUPS.STATIC));
    colliders++;
    return c;
  };

  const shelves: ShelfInfo[] = [];

  for (const b of BOXES) {
    if (b.style === 'hidden') {
      const c = cuboid(b.min, b.max);
      if (b.id === 'GROUND') physics.groundHandle = c.handle;
      continue;
    }
    if (b.id === 'CEILING') { cuboid(b.min, b.max); emitCeiling(solid, STY.ceiling); continue; }
    if (b.cat === 'rail') { cuboid(b.min, b.max); emitRail(solid, b, STY.rail); continue; }
    if (b.cat === 'shelf') { shelves.push(emitShelf(solid, b, STY.shelf, shelves.length, (mn, mx) => cuboid(mn, mx))); continue; }
    cuboid(b.min, b.max);
    solid.addBox(b.min, b.max, STY[b.style], { bottom: b.min[1] <= 0.001, top: b.max[1] >= 28 });
  }

  // ── karpet (tanpa studs) + pinggiran
  for (const c of CARPETS) {
    solid.addBox([c.x[0] + 0.15, c.y, c.z[0] + 0.15], [c.x[1] - 0.15, c.y + 0.03, c.z[1] - 0.15], carpetSlots, { bottom: true });
    solid.addBox([c.x[0], c.y, c.z[0]], [c.x[1], c.y + 0.025, c.z[0] + 0.15], edgeSlots, { bottom: true });
    solid.addBox([c.x[0], c.y, c.z[1] - 0.15], [c.x[1], c.y + 0.025, c.z[1]], edgeSlots, { bottom: true });
    solid.addBox([c.x[0], c.y, c.z[0] + 0.15], [c.x[0] + 0.15, c.y + 0.025, c.z[1] - 0.15], edgeSlots, { bottom: true });
    solid.addBox([c.x[1] - 0.15, c.y, c.z[0] + 0.15], [c.x[1], c.y + 0.025, c.z[1] - 0.15], edgeSlots, { bottom: true });
  }

  // ── tangga samping: ramp convexHull + 20 anak tangga + karpet 3 unit + handrail
  const railGeos: THREE.BufferGeometry[] = [];
  for (const s of STAIRS) {
    const dir = Math.sign(s.zTop - s.zFoot); // arah naik
    const pts = new Float32Array([
      s.x[0], 0, s.zFoot, s.x[1], 0, s.zFoot, s.x[0], 0, s.zTop, s.x[1], 0, s.zTop, s.x[0], 10, s.zTop, s.x[1], 10, s.zTop,
    ]);
    const hull = RAPIER.ColliderDesc.convexHull(pts);
    if (hull) { world.createCollider(hull.setCollisionGroups(GROUPS.STATIC)); colliders++; }
    for (let i = 0; i < STAIR_STEPS; i++) {
      const za = s.zFoot + dir * STAIR_RUN * i, zb = s.zFoot + dir * STAIR_RUN * (i + 1);
      const y = STAIR_RISE * (i + 1);
      solid.addBox([s.x[0], 0, Math.min(za, zb)], [s.x[1], y, Math.max(za, zb)], STY.deck, { bottom: true });
      const cx = (s.x[0] + s.x[1]) / 2;
      solid.addBox([cx - 1.5, y, Math.min(za, zb)], [cx + 1.5, y + 0.03, Math.max(za, zb)], carpetSlots, { bottom: true });
    }
    // handrail miring di sisi terbuka: Y 1.2 di kaki → 11.2 di puncak
    const len = Math.hypot(10, s.zTop - s.zFoot);
    const beam = new THREE.BoxGeometry(0.15, 0.15, len);
    const m = new THREE.Matrix4().makeRotationX(-dir * Math.atan2(10, Math.abs(s.zTop - s.zFoot)));
    m.setPosition(s.openX, 6.2, (s.zFoot + s.zTop) / 2);
    beam.applyMatrix4(m); railGeos.push(beam);
    for (const [z, y0] of [[s.zFoot, 0], [s.zTop, 10]] as const) {
      const post = new THREE.BoxGeometry(0.2, 1.3, 0.2); post.translate(s.openX, y0 + 0.65, z); railGeos.push(post);
    }
    const hx = 0.075, a = new THREE.Vector3(s.openX, 1.2, s.zFoot), bb = new THREE.Vector3(s.openX, 11.2, s.zTop);
    const hp = new Float32Array([
      a.x - hx, a.y - 0.1, a.z, a.x + hx, a.y - 0.1, a.z, a.x - hx, a.y + 0.1, a.z, a.x + hx, a.y + 0.1, a.z,
      bb.x - hx, bb.y - 0.1, bb.z, bb.x + hx, bb.y - 0.1, bb.z, bb.x - hx, bb.y + 0.1, bb.z, bb.x + hx, bb.y + 0.1, bb.z,
    ]);
    const hr = RAPIER.ColliderDesc.convexHull(hp);
    if (hr) { world.createCollider(hr.setCollisionGroups(GROUPS.STATIC)); colliders++; }
  }

  if (railGeos.length) {
    const merged = mergeGeometries(railGeos);
    const n = merged.attributes.position.count, ca = new Float32Array(n * 3);
    const dc = new THREE.Color().setHex(COL.darkwood, THREE.SRGBColorSpace);
    for (let i = 0; i < n; i++) { ca[i * 3] = dc.r; ca[i * 3 + 1] = dc.g; ca[i * 3 + 2] = dc.b; }
    merged.setAttribute('color', new THREE.BufferAttribute(ca, 3));
    const rm = new THREE.Mesh(merged, sideM);
    rm.castShadow = shadows; rm.receiveShadow = shadows; group.add(rm);
  }

  // ── lantai ubin: satu plane bertekstur repeat (E-12), 1 tekstur = 2×2 unit
  const floorGeo = new THREE.PlaneGeometry(44, 70);
  const uv = floorGeo.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 22, uv.getY(i) * 35);
  floorGeo.rotateX(-Math.PI / 2);
  const floor = new THREE.Mesh(floorGeo, new THREE.MeshLambertMaterial({ map: tiles }));
  floor.position.y = 0.002; floor.receiveShadow = shadows;
  group.add(floor);

  // ── skylight: kisi 0.3 + kaca tipis; jendela emissive; lampu dinding lorong
  const nonShadow = new MeshBuckets();
  const glassMat = new THREE.MeshLambertMaterial({ color: 0xa8d8ff, transparent: true, opacity: 0.35, depthWrite: false });
  const emisMat = new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true, emissive: 0xffffff, emissiveIntensity: 0.8 });
  const glass: SlotMats = { top: [glassMat, 0xffffff], side: [glassMat, 0xffffff], bottom: [glassMat, 0xffffff] };
  const win: SlotMats = { top: [emisMat, 0xffe7b0], side: [emisMat, 0xffe7b0], bottom: [emisMat, 0xffe7b0] };
  const lamp: SlotMats = { top: [emisMat, 0xffc97a], side: [emisMat, 0xffc97a], bottom: [emisMat, 0xffc97a] };
  for (const s of SKYLIGHTS) {
    const h = s.size / 2;
    nonShadow.addBox([s.x - h, 28.3, s.z - h], [s.x + h, 28.5, s.z + h], glass);
    for (const o of [-h / 3, h / 3]) {
      solid.addBox([s.x - h, 28, s.z + o - 0.15], [s.x + h, 28.8, s.z + o + 0.15], STY.darkwood, { top: true });
      solid.addBox([s.x + o - 0.15, 28, s.z - h], [s.x + o + 0.15, 28.8, s.z + h], STY.darkwood, { top: true });
    }
  }
  for (const w of WINDOWS) {
    const x0 = w.x < 0 ? -30.6 : 30.4;
    nonShadow.addBox([x0, w.y[0], w.z - w.width / 2], [x0 + 0.2, w.y[1], w.z + w.width / 2], win);
  }
  for (const l of CORRIDOR_LAMPS) {
    const x0 = l.x < 0 ? -30 : 29.7;
    nonShadow.addBox([x0, l.y - 0.2, l.z - 0.4], [x0 + 0.3, l.y + 0.2, l.z + 0.4], lamp);
  }
  for (const m of nonShadow.build(false)) group.add(m);
  for (const m of solid.build(shadows)) group.add(m);

  // HIGH: light shaft palsu (balok aditif opacity 0.05) miring searah matahari
  if (highQuality) {
    const shaftMat = new THREE.MeshBasicMaterial({ color: 0xffe0b5, transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending, depthWrite: false });
    const shift = 28 / Math.tan(Math.atan2(55, 40)); // ±20.3 unit ke −X di lantai
    const geos: THREE.BufferGeometry[] = [];
    for (const s of SKYLIGHTS) {
      const g = new THREE.BoxGeometry(s.size, 28, s.size); g.translate(0, 14, 0);
      const p = g.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < p.count; i++) p.setX(i, p.getX(i) + s.x + (p.getY(i) / 28 - 1) * shift);
      g.translate(0, 0, s.z); geos.push(g);
    }
    const shafts = new THREE.Mesh(mergeGeometries(geos), shaftMat);
    shafts.renderOrder = 2;
    group.add(shafts);
  }

  // ── pencahayaan (GDD §4.7)
  const sun = new THREE.DirectionalLight(0xffe0b5, preset.sunIntensity);
  sun.position.set(40, 55, 0);
  sun.target.position.set(0, 0, 0);
  sun.castShadow = shadows;
  if (shadows) {
    sun.shadow.mapSize.set(preset.shadowMap, preset.shadowMap);
    const cam = sun.shadow.camera as THREE.OrthographicCamera;
    cam.left = -55; cam.right = 55; cam.top = 55; cam.bottom = -55; cam.near = 1; cam.far = 160;
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
    if (highQuality) sun.shadow.radius = 3;
  }
  const hemi = new THREE.HemisphereLight(0xfff1dd, 0x4a2e1c, 1.3);
  group.add(sun, sun.target, hemi);

  scene.add(group);
  return { group, shelves, sun, hemi, triangles: solid.triangles + nonShadow.triangles, colliders };
}

/** Plafon visual berlubang 6 skylight (collider tetap pejal). */
function emitCeiling(b: MeshBuckets, mats: SlotMats) {
  const xs = [-30, -14, -6, 6, 14, 30], zs = [-50, -29, -21, -4, 4, 21, 29, 50];
  const holeX = (a: number, c: number) => (a >= -14 && c <= -6) || (a >= 6 && c <= 14);
  const holeZ = (a: number, c: number) => (a >= -29 && c <= -21) || (a >= -4 && c <= 4) || (a >= 21 && c <= 29);
  for (let i = 0; i < xs.length - 1; i++) for (let j = 0; j < zs.length - 1; j++) {
    if (holeX(xs[i], xs[i + 1]) && holeZ(zs[j], zs[j + 1])) continue;
    b.addBox([xs[i], 28, zs[j]], [xs[i + 1], 28.8, zs[j + 1]], mats, { top: true });
  }
}

/** Pagar: palang atas + palang bawah + baluster 0.12 × 1.05 setiap 0.6 (collider = balok penuh, §4.2). */
function emitRail(b: MeshBuckets, r: Box, mats: SlotMats) {
  const alongX = r.max[0] - r.min[0] > r.max[2] - r.min[2];
  const y0 = r.min[1], y1 = r.max[1];
  b.addBox([r.min[0], y1 - 0.15, r.min[2]], [r.max[0], y1, r.max[2]], mats);
  b.addBox([r.min[0], y0, r.min[2]], [r.max[0], y0 + 0.08, r.max[2]], mats, { bottom: true });
  const len = alongX ? r.max[0] - r.min[0] : r.max[2] - r.min[2];
  const n = Math.max(1, Math.floor(len / 0.6));
  const cx = (r.min[0] + r.max[0]) / 2, cz = (r.min[2] + r.max[2]) / 2;
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) * (len / n);
    const x = alongX ? r.min[0] + t : cx, z = alongX ? cz : r.min[2] + t;
    b.addBox([x - 0.06, y0 + 0.08, z - 0.06], [x + 0.06, y1 - 0.15, z + 0.06], mats, { bottom: true, top: true });
  }
}

/** Rak buku 7 bagian (GDD §4.8): plinth, 2 panel ujung, 3 papan, sekat tengah — masing-masing collider STATIC. */
function emitShelf(b: MeshBuckets, s: Box, mats: SlotMats, index: number,
  addCollider: (mn: number[], mx: number[]) => void): ShelfInfo {
  const alongX = s.max[0] - s.min[0] > s.max[2] - s.min[2];
  const cx = (s.min[0] + s.max[0]) / 2, cz = (s.min[2] + s.max[2]) / 2;
  // (L0, L1, Y0, Y1, D0, D1) lokal
  const parts: [number, number, number, number, number, number][] = [
    [-3.0, 3.0, 0, 0.3, -0.75, 0.75],
    [-3.0, -2.85, 0, 4.0, -0.75, 0.75], [2.85, 3.0, 0, 4.0, -0.75, 0.75],
    [-2.85, 2.85, 1.45, 1.55, -0.75, 0.75], [-2.85, 2.85, 2.70, 2.80, -0.75, 0.75], [-2.85, 2.85, 3.90, 4.00, -0.75, 0.75],
    [-2.85, 2.85, 0.3, 3.9, -0.05, 0.05],
  ];
  for (const [l0, l1, y0, y1, d0, d1] of parts) {
    const mn = alongX ? [cx + l0, y0, cz + d0] : [cx + d0, y0, cz + l0];
    const mx = alongX ? [cx + l1, y1, cz + d1] : [cx + d1, y1, cz + l1];
    b.addBox(mn, mx, mats, { bottom: y0 <= 0.001 });
    addCollider(mn, mx);
  }
  return { index, id: s.id, cx, cz, alongX };
}
