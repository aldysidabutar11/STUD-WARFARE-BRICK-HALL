// src/world/BrickHallBuilder.ts — mesh (merge per material), collider, lampu (GDD §4, §10.1–10.2)
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RAPIER, physics } from '../physics/Physics';
import { GROUPS } from '../physics/groups';
import type { Preset, PresetName } from '../config/gameConfig';
import { XCFG } from '../config/extraConfig';
import { gfxOf, isHigh } from '../config/presets';
import {
  BOXES, CARPETS, CORRIDOR_LAMPS, INTERIOR_FLOORS, SKYLIGHTS, STAIRS, STAIR_RISE, STAIR_RUN, STAIR_STEPS, WINDOWS, type Box, type Style,
} from './MapData';
import * as TX from './StudTextureGen';
import { MeshBuckets, type SlotMats } from './BoxBuilder';
import { buildDecor } from './Decor';
import * as SM from './SurfaceMaps';
import { LightField, bakedMaterial } from './LightBake';

export interface ShelfInfo { index: number; id: string; cx: number; cz: number; alongX: boolean }
export interface BuiltMap {
  group: THREE.Group;
  shelves: ShelfInfo[];
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  triangles: number;
  colliders: number;
  /** Medan cahaya hasil bake (light probe karakter). */
  light: LightField;
  /** Debu melayang di berkas cahaya skylight (MEDIUM+), uniform uTime diperbarui Game. */
  dust: THREE.Points | null;
  shafts: THREE.Mesh | null;
}

const COL = {
  deck: 0x7c5c46, darkwood: 0x4a2c17, panel: 0x6b4226, plaster: 0xd8cbb3, shelf: 0x7a4a26,
  table: 0xa87b4f, crate: 0xa8763e, carpet: 0x1f3a73, carpetEdge: 0xe8dcc0,
  // v2: identitas sisi tim + ruang dalam
  carpetRed: 0x7a1f1c, carpetGold: 0x8a6a2a, panelBlue: 0x35507e, panelRed: 0x7e3a33,
  arcFloor: 0x4a3324, baseFloor: 0x5e4330, arcWood: 0x3b2416,
};

export function buildBrickHall(scene: THREE.Scene, preset: Preset, presetName: PresetName, aniso: number): BuiltMap {
  const gfx = gfxOf(presetName), highQuality = isHigh(presetName), RG = XCFG.gfx.rough;
  const world = physics.world;
  const group = new THREE.Group();
  group.name = 'BrickHall';
  const shadows = preset.shadowMap > 0;

  // ── material: warna lewat vertex color → semua balok berwarna cukup atas/sisi/bawah (+ dinding buku, polos)
  const stud = TX.studTexture(aniso), inlet = TX.inletTexture(aniso), side = TX.sideTexture(aniso);
  const books = TX.bookwallTexture(aniso), tiles = TX.tileTexture(aniso);
  // MEDIUM+: PBR (kekasaran per permukaan) + normal map prosedural; LOW: Lambert (paling ringan)
  const nm = gfx.normalMaps;
  const V = (map: THREE.Texture | null, rough: number, normal: (a: number) => THREE.Texture) => gfx.pbr
    ? new THREE.MeshStandardMaterial({ color: 0xffffff, map, vertexColors: true, roughness: rough, metalness: 0, normalMap: nm ? normal(aniso) : null })
    : new THREE.MeshLambertMaterial({ color: 0xffffff, map, vertexColors: true });
  const topM = V(stud, RG.top, SM.studNormal), sideM = V(side, RG.side, SM.sideNormal), botM = V(inlet, RG.bottom, SM.inletNormal);
  const plainM = V(null, RG.plain, SM.fabricNormal), bookM = V(books, RG.book, SM.bookNormal);
  // logam dekorasi (kuningan, besi, baja, tembaga, emas) memantulkan lingkungan
  const metalM = gfx.pbr ? new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: RG.metal, metalness: 0.85 }) : plainM;
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
    // v2: rak tinggi / lemari arsip bersisi buku, dinding arsip (sisi aula = dinding buku), panel tim (dipilih per sisi di bawah)
    stack: { top: [topM, COL.arcWood], side: [bookM, 0xe8e0d0], bottom: [botM, COL.arcWood] },
    arcwall: { top: [topM, COL.deck], side: [bookM, 0xd8cfc0], bottom: [botM, COL.deck] },
    teampanel: set(COL.panelBlue),
  };
  const TEAM_PANEL = { blue: set(COL.panelBlue), red: set(COL.panelRed) };
  const carpetSlots: SlotMats = { top: [plainM, COL.carpet], side: [plainM, COL.carpetEdge], bottom: [plainM, COL.carpet] };
  const carpetOf = (tone?: 'blue' | 'red' | 'gold'): SlotMats => {
    const c = tone === 'red' ? COL.carpetRed : tone === 'gold' ? COL.carpetGold : COL.carpet;
    return { top: [plainM, c], side: [plainM, COL.carpetEdge], bottom: [plainM, c] };
  };
  const edgeSlots: SlotMats = { top: [plainM, COL.carpetEdge], side: [plainM, COL.carpetEdge], bottom: [plainM, COL.carpetEdge] };

  const solid = new MeshBuckets(XCFG.gfx.bake.subdiv);
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
    const sty = b.style === 'teampanel' ? TEAM_PANEL[(b.min[2] + b.max[2]) / 2 < 0 ? 'blue' : 'red'] : STY[b.style];
    solid.addBox(b.min, b.max, sty, { bottom: b.min[1] <= 0.001, top: b.max[1] >= 28 });
  }

  // ── v2: lantai kayu ruang dalam (arsip, lantai dasar markas) — di luar pelat ubin aula
  for (const f of INTERIOR_FLOORS) {
    const c = f.x[1] - f.x[0] < 20 ? COL.arcFloor : COL.baseFloor; // arsip (lebar 8) lebih gelap dari lantai markas
    solid.addBox([f.x[0], -0.05, f.z[0]], [f.x[1], 0.001, f.z[1]], { top: [topM, c], side: [sideM, c], bottom: [botM, c] }, { bottom: true, sides: true });
  }

  // ── karpet (tanpa studs) + pinggiran — v2: warna sisi tim
  for (const c of CARPETS) {
    solid.addBox([c.x[0] + 0.15, c.y, c.z[0] + 0.15], [c.x[1] - 0.15, c.y + 0.03, c.z[1] - 0.15], carpetOf(c.tone), { bottom: true });
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
      solid.addBox([cx - 1.5, y, Math.min(za, zb)], [cx + 1.5, y + 0.03, Math.max(za, zb)], s.zFoot < 0 ? carpetSlots : carpetOf('red'), { bottom: true });
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
  //    (dipecah 2×2 u agar cahaya bake bergradasi; MEDIUM+: ubin mengkilap memantulkan lingkungan + nat cekung)
  const floorGeo = new THREE.PlaneGeometry(44, 70, 22, 35);
  const uv = floorGeo.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 22, uv.getY(i) * 35);
  floorGeo.rotateX(-Math.PI / 2); floorGeo.translate(0, 0.002, 0);
  const floorMat = gfx.pbr
    ? new THREE.MeshStandardMaterial({ map: tiles, roughness: RG.tile, metalness: 0, normalMap: nm ? SM.tileNormal(aniso) : null })
    : new THREE.MeshLambertMaterial({ map: tiles });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.receiveShadow = shadows;

  // ── skylight: kisi 0.3 + kaca tipis; jendela emissive; lampu dinding lorong
  const nonShadow = new MeshBuckets();
  const glassMat = new THREE.MeshLambertMaterial({ color: 0xa8d8ff, transparent: true, opacity: 0.35, depthWrite: false });
  const emisMat = new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true, emissive: 0xffffff,
    emissiveIntensity: gfx.pbr ? XCFG.gfx.light.window : 0.8 });   // tone mapping ACES: jendela tidak silau putih
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
  // v2: dekorasi & identitas (spanduk tim, lampu gantung, menara jam, ikon puncak rak tinggi, balok atap, galeri rak dinding,
  //     lampu arsip & ruang spawn bawah) — balok ber-vertex-color di bucket yang sama (tanpa draw call tambahan)
  // nyala dekorasi = warna vertex penuh tanpa pencahayaan (lentera biru/merah tidak memucat seperti emissive putih)
  const glowM = new THREE.MeshBasicMaterial({ vertexColors: true });
  const decor = buildDecor({ solid, glow: nonShadow, plainM, sideM, bookM, topM, metalM, emisMat: glowM, preset, cuboid: (mn, mx) => { cuboid(mn, mx); } });
  for (const o of decor.objects) group.add(o);
  for (const m of nonShadow.build(false)) group.add(m);
  // bake cahaya (AO + langit + pantul) ke semua balok statis & lantai ubin → material salinan yang memodulasi cahaya tidak langsung
  const light = new LightField();
  const bakedMats = new Map<THREE.Material, THREE.Material>();
  const bake = (m: THREE.Mesh) => {
    light.bakeGeometry(m.geometry);
    const orig = m.material as THREE.Material;
    let bm = bakedMats.get(orig);
    if (!bm) { bm = bakedMaterial(orig); bakedMats.set(orig, bm); }
    m.material = bm;
    group.add(m);
  };
  for (const m of solid.build(shadows)) bake(m);
  bake(floor);

  // berkas cahaya skylight (MEDIUM+): volume miring searah matahari, pudar di ujung & tepi (lihat SHAFT_SHADER)
  let shafts: THREE.Mesh | null = null, dust: THREE.Points | null = null;
  const shift = 28 / Math.tan(Math.atan2(55, 40)); // ±20.3 unit ke −X di lantai
  if (gfx.shafts) {
    const geos: THREE.BufferGeometry[] = [];
    for (const s of SKYLIGHTS) {
      const g = new THREE.BoxGeometry(s.size, 28, s.size, 1, 6, 1); g.translate(0, 14, 0);
      const p = g.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < p.count; i++) p.setX(i, p.getX(i) + s.x + (p.getY(i) / 28 - 1) * shift);
      g.translate(0, 0, s.z); geos.push(g);
    }
    shafts = new THREE.Mesh(mergeGeometries(geos), shaftMaterial());
    shafts.renderOrder = 2; shafts.frustumCulled = false;
    group.add(shafts);
  }
  if (gfx.dust) { dust = dustPoints(shift); group.add(dust); }

  // ── pencahayaan (GDD §4.7)
  const L = XCFG.gfx.light;
  const sun = new THREE.DirectionalLight(0xffe0b5, preset.sunIntensity * (gfx.pbr ? L.sunMul : 1));
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
  const hemi = new THREE.HemisphereLight(0xfff1dd, 0x4a2e1c, 1.3 * (gfx.pbr ? L.hemi : 1));
  group.add(sun, sun.target, hemi);

  scene.add(group);
  return { group, shelves, sun, hemi, triangles: solid.triangles + nonShadow.triangles, colliders, light, dust, shafts };
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

/** Berkas cahaya: aditif, kuat saat dilihat tegak lurus (tepi lembut), pudar di dekat plafon & lantai, sedikit berdenyut. */
function shaftMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(0xffd9a0) }, uOpacity: { value: XCFG.gfx.shaft.opacity }, uTime: { value: 0 } },
    vertexShader: /* glsl */ `
      varying float vH; varying vec3 vN; varying vec3 vV; varying vec3 vW;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0); vW = wp.xyz; vH = wp.y / 28.0;
        vec4 mv = viewMatrix * wp; vV = -mv.xyz; vN = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uOpacity; uniform float uTime;
      varying float vH; varying vec3 vN; varying vec3 vV; varying vec3 vW;
      void main() {
        float face = pow(abs(dot(normalize(vN), normalize(vV))), 1.6);
        float fade = smoothstep(0.0, 0.3, vH) * (1.0 - smoothstep(0.9, 1.0, vH));
        float flick = 0.85 + 0.15 * sin(vW.y * 0.6 + vW.z * 0.4 + uTime * 0.7);
        float a = uOpacity * face * fade * flick;
        gl_FragColor = vec4(uColor * a, a);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
}

/** Debu halus melayang di dalam berkas cahaya (1 draw call, gerak dihitung di shader dari uTime). */
function dustPoints(shift: number): THREE.Points {
  const D = XCFG.gfx.dust, n = D.count, pos = new Float32Array(n * 3), ph = new Float32Array(n);
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  for (let i = 0; i < n; i++) {
    const s = SKYLIGHTS[i % SKYLIGHTS.length], y = 1 + rnd() * 25;
    pos[i * 3] = s.x + (rnd() - 0.5) * s.size * 0.9 + (y / 28 - 1) * shift;
    pos[i * 3 + 1] = y;
    pos[i * 3 + 2] = s.z + (rnd() - 0.5) * s.size * 0.9;
    ph[i] = rnd() * 100;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aPhase', new THREE.BufferAttribute(ph, 1));
  const m = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uSize: { value: D.size }, uScale: { value: 600 }, uOpacity: { value: D.opacity } },
    vertexShader: /* glsl */ `
      attribute float aPhase; uniform float uTime, uSize, uScale; varying float vA;
      void main() {
        vec3 p = position + vec3(sin(uTime * 0.11 + aPhase) * 0.7, sin(uTime * 0.05 + aPhase * 1.7) * 0.9, cos(uTime * 0.09 + aPhase * 0.6) * 0.7);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = clamp(uSize * uScale / -mv.z, 1.0, 6.0);
        vA = 0.5 + 0.5 * sin(uTime * 0.8 + aPhase * 3.0);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uOpacity; varying float vA;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d) * uOpacity * vA;
        gl_FragColor = vec4(vec3(1.0, 0.9, 0.72) * a, a);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(g, m);
  pts.frustumCulled = false;
  return pts;
}
