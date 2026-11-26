// src/world/maps/boston/build.ts — visual + collider + lampu + bake cahaya INDOOR Boston. Geometri dari visual/emit.ts (koordinat
// dunia, bucket per material = 1 draw call), di-bake LightField indoor: sumber langit = jendela tinggi L3 & sisi teras L4 yang
// terbuka + lampu plafon (balok emisif); pantul dari titik jatuh matahari sore yang masuk lewat sisi Timur dokumen (−X game).
// Panel kaca destruktibel dibangun runtime world/Breakables.ts (MapDef.breakables), bukan di sini.
import * as THREE from 'three';
import type { Preset, PresetName } from '../../../config/gameConfig';
import { XCFG } from '../../../config/extraConfig';
import { gfxOf, isHigh } from '../../../config/presets';
import { LightField, bakedMaterial } from '../../LightBake';
import { disposeTree, removeColliders } from '../shared';
import type { Atmosphere, BuiltMap } from '../types';
import { Geo } from '../steelyard/visual/geo';
import { fitShadow } from '../steelyard/build';
import { BOS_BOUNDS, BOS_BOXES, BOS_LAMPS, BOS_STAIRS, BOS_WINDOWS } from './layout';
import { bostonColliders } from './colliders';
import { NO_BAKE, NO_CAST, makeBostonMaterials, type BosMat } from './visual/materials';
import { emitBoston } from './visual/emit';

/** Kabut tipis hangat (kantor siang); latar = cadangan di balik jendela (latar kota menutupinya). Bloom HIGH+ sedikit di atas
 *  ambang dalam ruang Brick Hall: dinding plester terang & langit sore di jendela tidak ikut berpendar. */
export const BOS_ATMOSPHERE: Atmosphere = { outdoor: false, fogColor: 0xd9cbb5, fogDensity: 0.0032, background: 0xcfc2ae,
  bloom: { threshold: 1.15, strength: 0.28 } };

/** Matahari sore dari arah Timur dokumen (= −X game, dokumen §6: posisi (55, 42, −10) diputar 180°), elevasi ±36°. */
const SUN_POS = new THREE.Vector3(-55, 42, 10);

export function buildBoston(scene: THREE.Scene, preset: Preset, presetName: PresetName, aniso: number): BuiltMap {
  const t0 = performance.now();
  const gfx = gfxOf(presetName), shadows = preset.shadowMap > 0;
  const group = new THREE.Group();
  group.name = 'Boston';
  const M = makeBostonMaterials(gfx, aniso);
  const tMat = performance.now();

  const geo = new Geo();
  emitBoston(geo, BOS_BOXES);
  const tGeo = performance.now();

  // ── bake INDOOR: kaca & jendela tidak menghalangi cahaya; lampu plafon = sumber tambahan
  const sunTo = SUN_POS.clone().normalize(), sunDir = sunTo.clone().negate();
  const light = new LightField({
    min: [-28, -1.5, -40], max: [28, 21, 40],
    boxes: BOS_BOXES.filter(b => b.style !== 'o_glass' && b.style !== 'o_window'),
    stairs: BOS_STAIRS,
    sunDir: [sunDir.x * 100, sunDir.y * 100, sunDir.z * 100],
    indoor: {
      ceilingId: '', skylights: [], skyY: 0, rayY: 0, windows: BOS_WINDOWS, windowInX: 25.5, windowSun: true,
      lamps: BOS_LAMPS.map(([x, y, z, w, d]) => ({ x, y, z, w, d, v: 0.8 })),
    },
  });
  const bakedMats = new Map<THREE.Material, THREE.Material>();
  let tris = 0;
  for (const key of geo.keys() as BosMat[]) {
    const g = geo.geometry(key);
    if (!g) continue;
    const base = M.mat[key];
    let mat = base;
    if (!NO_BAKE.has(key)) {
      light.bakeGeometry(g);
      let bm = bakedMats.get(base);
      if (!bm) { bm = bakedMaterial(base); bakedMats.set(base, bm); }
      mat = bm;
    }
    const mesh = new THREE.Mesh(g, mat);
    mesh.name = `BOS_${key}`;
    mesh.castShadow = shadows && !NO_CAST.has(key);
    mesh.receiveShadow = shadows && key !== 'glow' && key !== 'city';
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    if (key === 'glassF' || key === 'glassC') mesh.renderOrder = 1;
    if (key === 'city') mesh.renderOrder = -1;
    group.add(mesh);
    tris += g.index!.count / 3;
  }
  const tBake = performance.now();

  // ── matahari sore + langit
  const L = XCFG.gfx.light;
  const sun = new THREE.DirectionalLight(0xffe3ba, preset.sunIntensity * (gfx.pbr ? L.sunMul : 1));
  sun.position.copy(sunTo).multiplyScalar(120);
  sun.target.position.set(0, 4, 0);
  sun.castShadow = shadows;
  if (shadows) {
    sun.shadow.mapSize.set(preset.shadowMap, preset.shadowMap);
    fitShadow(sun, [BOS_BOUNDS.x[0] - 1, BOS_BOUNDS.x[1] + 1], [BOS_BOUNDS.z[0] - 1, BOS_BOUNDS.z[1] + 1], 19);
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
    if (isHigh(presetName)) sun.shadow.radius = 3;
  }
  // tanah hemisfer = pantulan lantai tegel terang (bukan cokelat dokumen #5A4634: plafon menghadap bawah jadi cokelat gelap)
  const hemi = new THREE.HemisphereLight(0xf4f7fa, 0xb9ad9a, 1.15 * (gfx.pbr ? L.hemi : 1));
  group.add(sun, sun.target, hemi);

  // ── collider (TERAKHIR: bila langkah lain gagal tidak ada collider yatim)
  const cols = bostonColliders();
  scene.add(group);
  console.log(`[boston] material ${(tMat - t0).toFixed(0)} ms, geo ${(tGeo - tMat).toFixed(0)} ms, bake ${(tBake - tGeo).toFixed(0)} ms ` +
    `(medan ${light.ms.toFixed(0)}), ${group.children.length} objek, ${tris} segitiga`);
  const extraMats = [...bakedMats.keys(), ...Object.values(M.mat)];
  return {
    group, sun, hemi, light, shelves: [], dust: null, shafts: null,
    triangles: tris, colliders: cols.length,
    dispose: () => {
      disposeTree(group, extraMats);
      for (const t of M.textures) t.dispose();
      removeColliders(cols);
    },
  };
}
