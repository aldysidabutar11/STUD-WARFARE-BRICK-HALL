// src/world/maps/meridian/build.ts — visual + collider + lampu + bake cahaya INDOOR Meridian Vault. Geometri dari emit.ts
// (koordinat dunia, bucket per material = 1 draw call), di-bake LightField indoor: sumber langit = 12 skylight plafon global
// (West Long, Mid, Atrium B) + jendela melengkung dinding Barat West Long + lampu plafon (balok emisif); titik jatuh matahari
// siang yang masuk lewat skylight & jendela = sumber pantul.
import * as THREE from 'three';
import type { Preset, PresetName } from '../../../config/gameConfig';
import { XCFG } from '../../../config/extraConfig';
import { gfxOf, isHigh } from '../../../config/presets';
import { LightField, bakedMaterial } from '../../LightBake';
import { disposeTree, removeColliders } from '../shared';
import type { Atmosphere, BuiltMap } from '../types';
import { Geo } from '../steelyard/visual/geo';
import { fitShadow } from '../steelyard/build';
import { MV_BOUNDS, MV_BOXES, MV_LAMPS, MV_SKYLIGHTS, MV_STAIRS, MV_WINDOWS } from './layout';
import { meridianColliders } from './colliders';
import { MV_NO_BAKE, MV_NO_CAST, makeMeridianMaterials, type MvMat } from './visual';
import { emitMeridian } from './emit';

/** Kabut tipis netral-hangat (aula bank siang). Bloom HIGH+ sedikit di atas ambang dalam ruang: marmer putih tidak berpendar. */
export const MV_ATMOSPHERE: Atmosphere = { outdoor: false, fogColor: 0xd8d0c2, fogDensity: 0.0028, background: 0xcfc6b8,
  bloom: { threshold: 1.1, strength: 0.3 } };

/** Matahari siang dari Barat Daya (masuk lewat jendela West Long & skylight), elevasi ±55°. */
const SUN_POS = new THREE.Vector3(-48, 80, -30);

export function buildMeridian(scene: THREE.Scene, preset: Preset, presetName: PresetName, aniso: number): BuiltMap {
  const t0 = performance.now();
  const gfx = gfxOf(presetName), shadows = preset.shadowMap > 0;
  const group = new THREE.Group();
  group.name = 'MeridianVault';
  const M = makeMeridianMaterials(gfx, aniso);
  const tMat = performance.now();

  const geo = new Geo();
  emitMeridian(geo, MV_BOXES);
  const tGeo = performance.now();

  const sunTo = SUN_POS.clone().normalize(), sunDir = sunTo.clone().negate();
  const light = new LightField({
    min: [MV_BOUNDS.x[0] - 4, -1.5, MV_BOUNDS.z[0] - 4], max: [MV_BOUNDS.x[1] + 4, 18, MV_BOUNDS.z[1] + 4],
    boxes: MV_BOXES,
    stairs: MV_STAIRS,
    sunDir: [sunDir.x * 100, sunDir.y * 100, sunDir.z * 100],
    indoor: {
      ceilingId: 'CEIL', skylights: MV_SKYLIGHTS, skyY: 15.5, rayY: 15.9, windows: MV_WINDOWS, windowInX: -MV_BOUNDS.x[0] - 0.5, windowSun: true,
      lamps: MV_LAMPS.map(([x, y, z, w, d]) => ({ x, y, z, w, d, v: y > 14 ? 0.55 : 0.8 })),
    },
  });
  const bakedMats = new Map<THREE.Material, THREE.Material>();
  let tris = 0;
  for (const key of geo.keys() as MvMat[]) {
    const g = geo.geometry(key);
    if (!g) continue;
    const base = M.mat[key];
    let mat = base;
    if (!MV_NO_BAKE.has(key)) {
      light.bakeGeometry(g);
      let bm = bakedMats.get(base);
      if (!bm) { bm = bakedMaterial(base); bakedMats.set(base, bm); }
      mat = bm;
    }
    const mesh = new THREE.Mesh(g, mat);
    mesh.name = `MV_${key}`;
    mesh.castShadow = shadows && !MV_NO_CAST.has(key);
    mesh.receiveShadow = shadows && key !== 'glow' && key !== 'sign';
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    if (key === 'glass') mesh.renderOrder = 1;
    if (key === 'decalA' || key === 'decalB') mesh.renderOrder = 2;
    group.add(mesh);
    tris += g.index!.count / 3;
  }
  const tBake = performance.now();

  const L = XCFG.gfx.light;
  const sun = new THREE.DirectionalLight(0xfff0d8, preset.sunIntensity * (gfx.pbr ? L.sunMul : 1));
  sun.position.copy(sunTo).multiplyScalar(220);
  sun.target.position.set(0, 4, 0);
  sun.castShadow = shadows;
  if (shadows) {
    sun.shadow.mapSize.set(preset.shadowMap, preset.shadowMap);
    fitShadow(sun, [MV_BOUNDS.x[0] - 2, MV_BOUNDS.x[1] + 2], [MV_BOUNDS.z[0] - 2, MV_BOUNDS.z[1] + 2], 18);
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
    if (isHigh(presetName)) sun.shadow.radius = 3;
  }
  // tanah hemisfer = pantulan marmer krem & karpet biru; langit dingin dari skylight
  const hemi = new THREE.HemisphereLight(0xf2f5fa, 0xb8ad9c, 1.1 * (gfx.pbr ? L.hemi : 1));
  group.add(sun, sun.target, hemi);

  const cols = meridianColliders();   // TERAKHIR: bila langkah lain gagal tidak ada collider yatim
  scene.add(group);
  console.log(`[meridian] material ${(tMat - t0).toFixed(0)} ms, geo ${(tGeo - tMat).toFixed(0)} ms, bake ${(tBake - tGeo).toFixed(0)} ms ` +
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
