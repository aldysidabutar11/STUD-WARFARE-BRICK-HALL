// src/world/maps/arunika/build.ts — visual + collider + lampu + bake cahaya OUTDOOR Candi Arunika. Geometri dari visual/emit.ts
// (bangunan) & visual/nature.ts (tanah, tebing, pohon, air, latar) dalam koordinat dunia, digabung per material (Geo → 1 mesh per
// bucket = 1 draw call), lalu di-bake LightField mode luar ruang (AO + langit terbuka + pantul tanah yang kena matahari pagi).
// Langit fajar 1 draw call (visual/sky.ts), debu pagi + asap dupa & kabut air terjun (MEDIUM+), riak air & aliran air terjun digeser
// waktu.
import * as THREE from 'three';
import type { Preset, PresetName } from '../../../config/gameConfig';
import { XCFG } from '../../../config/extraConfig';
import { gfxOf, isHigh } from '../../../config/presets';
import { LightField, bakedMaterial } from '../../LightBake';
import type { Box } from '../../MapData';
import { disposeTree, removeColliders } from '../shared';
import type { Atmosphere, BuiltMap } from '../types';
import { Geo } from '../steelyard/visual/geo';
import { fitShadow } from '../steelyard/build';
import { makeDust } from '../steelyard/visual/dust';
import { AR_BOUNDS, AR_BOXES, AR_STAIRS } from './layout';
import { arunikaColliders } from './colliders';
import { AR_NO_BAKE, AR_NO_CAST, makeArunikaMaterials, type ArMat } from './visual/materials';
import { emitArchitecture } from './visual/emit';
import { emitCliffs, emitDecor, emitGrass, emitGround, emitRiverbank, emitTrees, emitWater, emitWaterfall } from './visual/nature';
import { makeDawnSky } from './visual/sky';
import { AR_SMOKE, makeSmoke } from './visual/smoke';

/** Kabut pagi hangat (= kabut cakrawala langit → tanah jauh menyatu). Bloom HIGH+ ambang luar ruang (langit fajar terang). */
export const AR_ATMOSPHERE: Atmosphere = { outdoor: true, fogColor: 0xc8bead, fogDensity: 0.0026, background: 0xc8bead,
  bloom: { threshold: 1.45, strength: 0.48 } };

/** Warna tanah jauh di langit (sRGB). */
const FAR_GROUND = 0x7d8466;

/** Matahari pagi TEPAT di Timur (z = 0 → bayangan sejajar sumbu X: tidak ada tim yang menghadap matahari saat maju di sumbu
 *  Utara–Selatan), elevasi ±37° → bayangan pagi masih panjang tapi jalur samping tidak tenggelam di bayangan tembok. */
const SUN_POS = new THREE.Vector3(62, 46, 0);

/** Balok tambahan khusus bake (penghalang cahaya dari bentuk hull: atap pelana, joglo, genta stupa) — bukan collider. */
function bakeOccluders(): Box[] {
  const bx = (id: string, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): Box =>
    ({ id, cat: 'wall', style: 'hidden', min: [x0, y0, z0], max: [x1, y1, z1] });
  const out: Box[] = [];
  for (const [x0, x1, z0, z1] of [[-38, -30, 22, 46], [-38, -30, 52, 64], [30, 38, 22, 46], [30, 38, 52, 64]] as const) {
    out.push(bx('rf1', x0 - 0.5, 6, z0, x1 + 0.5, 8, z1), bx('rf2', x0 + 1.5, 8, z0, x1 - 1.5, 9.6, z1));
  }
  out.push(bx('bj1', 37, 9, -49, 51, 10.4, -39), bx('bj2', 41, 10.4, -46, 47, 12.6, -42));
  out.push(bx('mj1', -9, 8, -45, 9, 9.2, -39), bx('mj2', -5, 9.2, -43.5, 5, 11, -40.5));
  out.push(bx('sb', -45.3, 5.5, -46.3, -38.7, 9.4, -39.7));
  for (const [x, z] of [[-51.9, -49.9], [-32.1, -49.9], [-51.9, -36.1], [-32.1, -36.1]] as const) out.push(bx('ss', x - 1.2, 4, z - 1.2, x + 1.2, 6.6, z + 1.2));
  return out;
}

export function buildArunika(scene: THREE.Scene, preset: Preset, presetName: PresetName, aniso: number): BuiltMap {
  const t0 = performance.now();
  const gfx = gfxOf(presetName), shadows = preset.shadowMap > 0;
  const group = new THREE.Group();
  group.name = 'CandiArunika';
  const M = makeArunikaMaterials(gfx, aniso);
  const tMat = performance.now();

  const geo = new Geo();
  emitGround(geo, AR_BOXES);
  emitArchitecture(geo, AR_BOXES);
  emitCliffs(geo, AR_BOXES);
  emitTrees(geo, AR_BOXES);
  emitGrass(geo, AR_BOXES);
  emitWater(geo);
  emitWaterfall(geo);
  emitRiverbank(geo);
  emitDecor(geo);
  const tGeo = performance.now();

  const sunTo = SUN_POS.clone().normalize(), sunDir = sunTo.clone().negate();
  let top = 10;
  for (const b of AR_BOXES) if (b.style !== 'hidden') top = Math.max(top, b.max[1]);
  const light = new LightField({
    min: [AR_BOUNDS.x[0] - 5, -1.5, AR_BOUNDS.z[0] - 5], max: [AR_BOUNDS.x[1] + 5, top + 2, AR_BOUNDS.z[1] + 3],
    boxes: [...AR_BOXES, ...bakeOccluders()], stairs: AR_STAIRS,
    sunDir: [sunDir.x * 100, sunDir.y * 100, sunDir.z * 100], outdoor: { bounce: 0.38, openDist: 24, openElevDeg: 32, openMin: 0.42 },
  });
  const bakedMats = new Map<THREE.Material, THREE.Material>();
  let tris = 0;
  const animated: THREE.Mesh[] = [];
  for (const key of geo.keys() as ArMat[]) {
    const g = geo.geometry(key);
    if (!g) continue;
    const base = M.mat[key];
    let mat = base;
    if (!AR_NO_BAKE.has(key)) {
      light.bakeGeometry(g);
      let bm = bakedMats.get(base);
      if (!bm) { bm = bakedMaterial(base); bakedMats.set(base, bm); }
      mat = bm;
    }
    const mesh = new THREE.Mesh(g, mat);
    mesh.name = `AR_${key}`;
    mesh.castShadow = shadows && !AR_NO_CAST.has(key);
    mesh.receiveShadow = shadows && key !== 'glow' && key !== 'fall';
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    if (key === 'water') mesh.renderOrder = 1;
    if (key === 'fall') mesh.renderOrder = 2;
    if (key === 'decalA' || key === 'decalB') mesh.renderOrder = 2;
    if (key === 'water' || key === 'fall') animated.push(mesh);
    group.add(mesh);
    tris += g.index!.count / 3;
  }
  // riak & air terjun bergerak (satu pembaruan per frame cukup; dua mesh memanggil fungsi yang sama — idempoten)
  const tStart = performance.now();
  for (const m of animated) m.onBeforeRender = () => M.update((performance.now() - tStart) * 0.001);
  const tBake = performance.now();

  const sky = makeDawnSky({ sunDir: sunTo, fogColor: AR_ATMOSPHERE.fogColor, fogDensity: AR_ATMOSPHERE.fogDensity, ground: FAR_GROUND });
  group.add(sky);
  let dust: THREE.Points | null = null;
  if (gfx.dust) {
    dust = makeDust(AR_BOUNDS, 2600, XCFG.gfx.dust.opacity * 0.6, XCFG.gfx.dust.size); group.add(dust);
    group.add(makeSmoke(AR_SMOKE));     // asap dupa & kabut air terjun
  }

  const L = XCFG.gfx.light;
  const sun = new THREE.DirectionalLight(0xffd3a2, preset.sunIntensity * (gfx.pbr ? L.sunMul : 1) * 0.86);
  sun.position.copy(sunTo).multiplyScalar(160);
  sun.target.position.set(0, 0, 0);
  sun.castShadow = shadows;
  if (shadows) {
    sun.shadow.mapSize.set(preset.shadowMap, preset.shadowMap);
    fitShadow(sun, AR_BOUNDS.x, AR_BOUNDS.z, top);
    sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.035;
    if (isHigh(presetName)) sun.shadow.radius = 3;
  }
  // langit pagi kebiruan dingin + pantul tanah hangat
  const hemi = new THREE.HemisphereLight(0xc2d0ec, 0xa8946e, gfx.pbr ? 1.0 * L.hemi : 1.15);
  group.add(sun, sun.target, hemi);

  const cols = arunikaColliders();   // TERAKHIR: bila langkah lain gagal tidak ada collider yatim
  scene.add(group);
  console.log(`[arunika] material ${(tMat - t0).toFixed(0)} ms, geo ${(tGeo - tMat).toFixed(0)} ms, bake ${(tBake - tGeo).toFixed(0)} ms ` +
    `(medan ${light.ms.toFixed(0)}), ${group.children.length} objek, ${tris} segitiga`);
  const extraMats = [...bakedMats.keys(), ...Object.values(M.mat)];
  return {
    group, sun, hemi, light, shelves: [], dust, shafts: null,
    triangles: tris, colliders: cols.length,
    dispose: () => {
      disposeTree(group, extraMats);
      for (const t of M.textures) t.dispose();
      removeColliders(cols);
    },
  };
}
