// src/world/maps/steelyard/build.ts — visual + collider + lampu + bake cahaya OUTDOOR Steel Yard (C2).
// Merakit aset prosedural di visual/*: kontainer detail (+ proxy bayangan), prop, pagar terpal, latar di luar pagar, tanah makro
// unik + tanah luar sampai cakrawala + bukit, genangan, langit (1 draw call), debu melayang (MEDIUM+). Geometri digabung per
// material (Geo → 1 mesh per bucket) lalu di-bake (AO + langit terbuka + pantul) dengan LightField mode outdoor.
// Data & collider = denah SY / SY_BOXES (layout.ts, C1).
// Nama ekspor = ANTARMUKA (dipakai index.ts): buildSteelYard, SY_ATMOSPHERE.
import * as THREE from 'three';
import { CFG, type Preset, type PresetName } from '../../../config/gameConfig';
import { XCFG } from '../../../config/extraConfig';
import { gfxOf, isHigh } from '../../../config/presets';
import { LightField, bakedMaterial } from '../../LightBake';
import { distToBoxXZ, type Box } from '../../MapData';
import type { RAPIER } from '../../../physics/Physics';
import { addBoxColliders, cuboidCollider, disposeTree, removeColliders } from '../shared';
import type { Atmosphere, BuiltMap } from '../types';
import { SY, SY_BOXES } from './layout';
import { Geo, TRY, hashStr, shadeHex } from './visual/geo';
import { chainInject, makeMaterials, type MatKey } from './visual/materials';
import { emitContainer, emitContainerProxy } from './visual/containers';
import { emitDebris, emitProp, emitPropProxy } from './visual/props';
import { emitFence } from './visual/fence';
import { BACKDROP_SEED, emitBackdrop } from './visual/backdrop';
import { emitGround, emitOuter, emitPuddles, groundMacro, type Foot, type GroundData } from './visual/ground';
import { makeSky } from './visual/sky';
import { makeDust } from './visual/dust';

/** Kabut udara gurun (warna = kabut cakrawala langit → tanah jauh menyatu). Latar = cadangan bila langit tidak tergambar.
 *  Bloom HIGH+: ambang 1.6 (dalam ruang 0.85) — langit siang ±0.8–1.2 linear; dengan ambang dalam ruang seluruh langit berpendar
 *  & menyapu tepi kontainer jadi kabut putih; kini hanya cakram/halo matahari & kilau logam yang berpendar. */
export const SY_ATMOSPHERE: Atmosphere = { outdoor: true, fogColor: 0xa39a88, fogDensity: 0.0025, background: 0xa39a88,
  bloom: { threshold: 1.6, strength: 0.42 } };

/** Warna tanah jauh di langit (sRGB, kira-kira sudah diterangi) — juga target lebur tanah luar di dekat far kamera. */
const FAR_GROUND = 0xa08a6c;

/** Posisi matahari sore (arah DARI titik asal KE matahari): tepat di Barat (z = 0), elevasi ±40°. z = 0 → bayangan sejajar sumbu X,
 *  simetris tepat terhadap cermin Z (Biru ↔ Merah; dulu z −13 → bayangan semua benda & pemain condong 0.23 u/u ke Utara: bayangan
 *  pemain Biru menjorok ke arah lawan, pemain Merah ke belakang). Cermin X tidak perlu: tiap tim punya sudut Barat & Timur. */
const SUN_POS = new THREE.Vector3(-65.3, 56, 0);

/** Bucket geometri → material & bayangan. */
const BUCKETS: Record<string, { mat: MatKey; cast: boolean; bake: boolean }> = {
  steel: { mat: 'steel', cast: false, bake: true },      // kulit kontainer & latar: bayangan lewat proxy
  steelP: { mat: 'steel', cast: true, bake: true },      // prop baja (drum, mobil, kaleng)
  wood: { mat: 'wood', cast: true, bake: true },
  woodN: { mat: 'wood', cast: false, bake: true },       // palet & peti: bayangan lewat proxy
  concrete: { mat: 'concrete', cast: true, bake: true },
  rubber: { mat: 'rubber', cast: true, bake: true },
  glass: { mat: 'glass', cast: true, bake: true },
  tarp: { mat: 'tarp', cast: true, bake: true },
  ground: { mat: 'ground', cast: false, bake: true },
  outer: { mat: 'outer', cast: false, bake: true },
  puddle: { mat: 'puddle', cast: false, bake: true },
  proxy: { mat: 'proxy', cast: true, bake: false },
};

export function buildSteelYard(scene: THREE.Scene, preset: Preset, presetName: PresetName, aniso: number): BuiltMap {
  const t0 = performance.now();
  const gfx = gfxOf(presetName), shadows = preset.shadowMap > 0;
  const data: GroundData = SY;
  const boxes: readonly Box[] = SY_BOXES;
  const group = new THREE.Group();
  group.name = 'SteelYard';
  const M = makeMaterials(gfx, aniso);
  M.setFarFade(FAR_GROUND, SY_ATMOSPHERE.fogColor, CFG.camera.far);
  const tMat = performance.now();
  const sunTo = SUN_POS.clone().normalize(), sunDir = sunTo.clone().negate();

  // ── geometri (koordinat dunia, per bucket)
  const geo = new Geo();
  const dust = new THREE.Color().setHex(0xb9a582, THREE.SRGBColorSpace);
  // debu menumpuk di permukaan menghadap atas (atap kontainer, kap mobil, tutup drum, papan palet)
  geo.tint = (_p, n, c) => { if (n.y > 0.5) c.lerp(dust, Math.min(0.32, (n.y - 0.5) * 0.64)); };
  for (const k of data.containers) { emitContainer(geo, k); if (shadows) emitContainerProxy(geo, k); }
  for (const p of data.props) { emitProp(geo, p); if (shadows) emitPropProxy(geo, p); }
  const known = new Set<string>([...data.containers.map(k => k.id), ...data.props.map(p => p.id), ...data.fences.map(f => f.id)]);
  emitUnknownBoxes(geo, boxes, known);
  const bx = data.bounds.x, bz = data.bounds.z;
  const backFeet = emitBackdrop(geo, data.bounds, BACKDROP_SEED);
  geo.tint = null;
  const posts = new Set<string>();
  for (const f of data.fences) emitFence(geo, f, [(bx[0] + bx[1]) / 2, (bz[0] + bz[1]) / 2], posts);
  // serpihan kecil di tempat kosong (jauh dari balok & pagar — jari-jari per jenis di emitDebris; genangan & slot spawn tidak
  // masalah: datar < 0.3 u)
  const solid = boxes.filter(b => b.style !== 'hidden');
  emitDebris(geo, 9091, data.bounds, (x, z, r) =>
    solid.every(b => distToBoxXZ(b, x, z) > r) && data.puddles.every(p => Math.hypot(x - p.x, z - p.z) > Math.max(p.rx, p.rz) + r));
  const fine = { x: [bx[0] - 6, bx[1] + 6] as [number, number], z: [bz[0] - 6, bz[1] + 6] as [number, number] };
  emitGround(geo, fine);
  emitOuter(geo, 515);
  emitPuddles(geo, data.puddles);
  const tGeo = performance.now();

  // ── tekstur makro tanah (dilukis dari denah) — sebelum bake (bakedMaterial menyalin material beserta map-nya)
  M.setGroundMacro(groundMacro(data, backFeet, sunDir, !shadows, aniso));
  const outerM = M.mat.outer;
  outerM.polygonOffset = true; outerM.polygonOffsetFactor = 2; outerM.polygonOffsetUnits = 4;
  const puddleM = M.mat.puddle;
  puddleM.polygonOffset = true; puddleM.polygonOffsetFactor = -2; puddleM.polygonOffsetUnits = -2;
  const tTex = performance.now();

  // ── bake cahaya OUTDOOR: grid menutup area main + tepi; tinggi dari balok tertinggi
  let top = 10;
  for (const b of boxes) if (b.style !== 'hidden') top = Math.max(top, b.max[1]);
  const light = new LightField({
    min: [bx[0] - 5, -1.5, bz[0] - 5], max: [bx[1] + 5, top + 3, bz[1] + 5], boxes, stairs: [],
    sunDir: [sunDir.x * 100, sunDir.y * 100, sunDir.z * 100], outdoor: { bounce: 0.38, openDist: 26, openElevDeg: 35, openMin: 0.28 },
  });
  const bakedMats = new Map<THREE.Material, THREE.Material>();
  const matFor = (base: THREE.Material): THREE.Material => {
    let bm = bakedMats.get(base);
    if (!bm) {
      bm = bakedMaterial(base);
      const inj = M.inject.get(base);
      if (inj) chainInject(bm, inj, 'baked-v1');
      bakedMats.set(base, bm);
    }
    return bm;
  };
  let tris = 0;
  for (const key of geo.keys()) {
    const spec = BUCKETS[key];
    if (!spec || (key === 'proxy' && !shadows)) continue;
    const g = geo.geometry(key);
    if (!g) continue;
    const base = M.mat[spec.mat];
    let mat = base;
    if (spec.bake) { light.bakeGeometry(g); mat = matFor(base); }
    const mesh = new THREE.Mesh(g, mat);
    mesh.name = `SY_${key}`;
    mesh.castShadow = shadows && spec.cast;
    mesh.receiveShadow = shadows && key !== 'proxy';
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    if (key === 'proxy') mesh.renderOrder = 999;
    group.add(mesh);
    if (key !== 'proxy') tris += g.index!.count / 3;
  }
  const tBake = performance.now();

  // ── langit + debu
  const sky = makeSky({ sunDir: sunTo, fogColor: SY_ATMOSPHERE.fogColor, fogDensity: SY_ATMOSPHERE.fogDensity, ground: FAR_GROUND });
  group.add(sky);
  let dustPts: THREE.Points | null = null;
  if (gfx.dust) { dustPts = makeDust(data.bounds, 2400, XCFG.gfx.dust.opacity * 0.7, XCFG.gfx.dust.size * 1.1); group.add(dustPts); }

  // ── matahari sore + langit/pantulan pasir
  const L = XCFG.gfx.light;
  // luar ruang: hampir semua permukaan kena matahari langsung → lebih redup dari Brick Hall (rasio terang : bayangan ±2.5 : 1)
  const sun = new THREE.DirectionalLight(0xffd9aa, preset.sunIntensity * (gfx.pbr ? L.sunMul : 1) * 0.82);
  sun.position.copy(sunTo).multiplyScalar(140);
  sun.target.position.set(0, 0, 0);
  sun.castShadow = shadows;
  if (shadows) {
    sun.shadow.mapSize.set(preset.shadowMap, preset.shadowMap);
    fitShadow(sun, bx, bz, top);
    sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.035;
    if (isHigh(presetName)) sun.shadow.radius = 3;
  }
  const hemi = new THREE.HemisphereLight(0xb4cdea, 0xa48c68, (gfx.pbr ? 0.72 * L.hemi : 1.0));
  group.add(sun, sun.target, hemi);

  // ── collider statis (semua balok denah + latar padat di luar pagar) — dibuat TERAKHIR: bila langkah lain gagal (kanvas/bake),
  //    tidak ada collider yatim yang tertinggal di dunia Rapier (Game.loadMap lalu membangun ulang). Dilepas di dispose().
  const cols = syColliders(boxes, backFeet);
  scene.add(group);
  console.log(`[steelyard] material ${(tMat - t0).toFixed(0)} ms, geo ${(tGeo - tMat).toFixed(0)} ms, tanah ${(tTex - tGeo).toFixed(0)} ms, bake ${(tBake - tTex).toFixed(0)} ms ` +
    `(medan ${light.ms.toFixed(0)}), ${group.children.length} objek, ${tris} segitiga`);
  const extraMats = [...bakedMats.keys(), ...Object.values(M.mat)];
  return {
    group, sun, hemi, light, shelves: [], dust: dustPts, shafts: null,
    triangles: tris, colliders: cols.length,
    dispose: () => {
      disposeTree(group, extraMats);
      for (const t of M.textures) t.dispose();
      removeColliders(cols);
    },
  };
}

/** Collider statis Steel Yard: semua balok denah (termasuk GROUND tersembunyi) + latar padat di luar pagar (tumpukan kontainer,
 *  gudang: Foot.col) — peluru/granat yang lewat di atas pagar berhenti & memercik di sana (bukan menembus). Latar tidak masuk
 *  SY_BOXES (bake/nav/radar). Dilepas di dispose() lewat removeColliders (tests/steelyard: jumlah collider kembali ke awal). */
export function syColliders(boxes: readonly Box[], backFeet: readonly Foot[]): RAPIER.Collider[] {
  const cols: RAPIER.Collider[] = addBoxColliders(boxes);
  for (const f of backFeet) if (f.col) cols.push(cuboidCollider([f.cx - f.hx, 0, f.cz - f.hz], [f.cx + f.hx, f.h, f.cz + f.hz], f.rot));
  return cols;
}

/** Bingkai ortografis bayangan pas menutup area main (+ pagar & tumpukan) dilihat dari arah matahari → texel lebih rapat. */
function fitShadow(sun: THREE.DirectionalLight, bx: [number, number], bz: [number, number], top: number) {
  const m = new THREE.Matrix4().lookAt(sun.position, sun.target.position, new THREE.Vector3(0, 1, 0));
  const xa = new THREE.Vector3(), ya = new THREE.Vector3(), za = new THREE.Vector3();
  m.extractBasis(xa, ya, za);
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, d0 = Infinity, d1 = -Infinity;
  const v = new THREE.Vector3();
  for (const x of [bx[0] - 2, bx[1] + 2]) for (const z of [bz[0] - 2, bz[1] + 2]) for (const y of [0, top + 1]) {
    v.set(x, y, z).sub(sun.position);
    const lx = v.dot(xa), ly = v.dot(ya), dd = -v.dot(za);
    x0 = Math.min(x0, lx); x1 = Math.max(x1, lx); y0 = Math.min(y0, ly); y1 = Math.max(y1, ly); d0 = Math.min(d0, dd); d1 = Math.max(d1, dd);
  }
  const cam = sun.shadow.camera as THREE.OrthographicCamera;
  cam.left = x0 - 1; cam.right = x1 + 1; cam.bottom = y0 - 1; cam.top = y1 + 1;
  cam.near = Math.max(0.5, d0 - 30); cam.far = d1 + 5;
  cam.updateProjectionMatrix();
}

/** Balok denah yang bukan kontainer/prop/pagar data (objek unik tambahan C1) → balok sederhana per gaya (cadangan aman). */
function emitUnknownBoxes(geo: Geo, boxes: readonly Box[], known: Set<string>) {
  const KEY: Partial<Record<Box['style'], [string, number]>> = {
    steel: ['steelP', 0x7d8286], vehicle: ['steelP', 0x8f9a9e], concrete: ['concrete', 0xd0c9bc], timber: ['wood', 0xc9a878],
    rubber: ['rubber', 0x3a3936], fabric: ['tarp', 0x6f8291], fence: ['tarp', 0x7d909e],
  };
  for (const b of boxes) {
    if (b.style === 'hidden' || known.has(b.id.split(':')[0])) continue;
    const [key, col] = KEY[b.style] ?? ['concrete', 0xb0a898];
    const cx = (b.min[0] + b.max[0]) / 2, cz = (b.min[2] + b.max[2]) / 2, hx = (b.max[0] - b.min[0]) / 2, hz = (b.max[2] - b.min[2]) / 2;
    geo.push(TRY(cx, 0, cz, b.rotY ?? 0));
    geo.color(shadeHex(col, 0.9 + (hashStr(b.id) % 100) / 500));
    const uv = key === 'steelP' ? { uv: (p: [number, number, number]) => [(p[0] + p[2]) / 32, p[1] / 7.2] as [number, number] } : {};
    geo.box(key, -hx, b.min[1], -hz, hx, b.max[1], hz, { ...uv, skip: { ny: b.min[1] <= 0.001 } });
    geo.pop();
  }
}

