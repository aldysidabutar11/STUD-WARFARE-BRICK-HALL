// src/world/maps/arunika/visual/materials.ts — set material Candi Arunika per preset. MEDIUM+: PBR (MeshStandard) + normal map
// prosedural + pantulan lingkungan; LOW: Lambert. Satu material = satu bucket geometri (Geo) = satu draw call; warna verteks
// membedakan benda dalam satu bucket (andesit abu/kehijauan/gelap, bata jingga/merah tua, jati/kayu lapuk, ...).
// UV bucket = koordinat dunia (u) → repeat = 1 / rentang tekstur. Air & air terjun: peta digeser waktu (update(t) dipanggil tiap frame
// dari onBeforeRender mesh air — tanpa alokasi).
import * as THREE from 'three';
import type { GfxProfile } from '../../../../config/presets';
import { cachedTex } from '../../steelyard/visual/materials';
import { woodTex } from '../../steelyard/visual/textures';
import { fabricTex, plasterTex, type MapPair } from '../../boston/visual/textures';
import { siteDecalTex } from '../../meridian/visual';
import * as TX from './textures';

export type ArMat = 'stone' | 'relief' | 'brick' | 'plaster' | 'tile' | 'wood' | 'weave' | 'ground' | 'paving' | 'rock' | 'bark'
  | 'leafB' | 'leafK' | 'leafP' | 'leafG' | 'bronze' | 'gold' | 'paint' | 'glow' | 'water' | 'fall' | 'lattice' | 'decalA' | 'decalB' | 'sign';

export interface ArMaterials {
  mat: Record<ArMat, THREE.Material>;
  textures: THREE.Texture[];
  /** Geser riak air & aliran air terjun (detik). */
  update(t: number): void;
}

/** Bucket tanpa bake (transparan / emisif / decal) & yang tidak melempar bayangan. */
export const AR_NO_BAKE = new Set<ArMat>(['glow', 'water', 'fall', 'decalA', 'decalB', 'sign']);
export const AR_NO_CAST = new Set<ArMat>(['glow', 'water', 'fall', 'decalA', 'decalB', 'sign', 'ground', 'paving']);

export function makeArunikaMaterials(gfx: GfxProfile, aniso: number): ArMaterials {
  const pbr = gfx.pbr, nm = gfx.normalMaps;
  const textures: THREE.Texture[] = [];
  const keep = <T extends THREE.Texture | MapPair>(v: T): T => {
    if (v instanceof THREE.Texture) textures.push(v); else textures.push(v.map, v.normal);
    return v;
  };
  const rep = (t: THREE.Texture, span: number, spanV = span) => { const c = t.clone(); c.repeat.set(1 / span, 1 / spanV); textures.push(c); return c; };
  const stone = keep(cachedTex('ar_andesite', aniso, () => TX.andesiteTex(aniso)));
  const relief = keep(cachedTex('ar_relief', aniso, () => TX.reliefTex(aniso)));
  const brick = keep(cachedTex('ar_brick', aniso, () => TX.brickTex(aniso)));
  const tile = keep(cachedTex('ar_rooftile', aniso, () => TX.rooftileTex(aniso)));
  const paving = keep(cachedTex('ar_paving', aniso, () => TX.pavingTex(aniso)));
  const ground = keep(cachedTex('ar_ground', aniso, () => TX.groundTex(aniso)));
  const bark = keep(cachedTex('ar_bark', aniso, () => TX.barkTex(aniso)));
  const rock = keep(cachedTex('ar_rock', aniso, () => TX.rockTex(aniso)));
  const lattice = keep(cachedTex('ar_lattice', aniso, () => TX.latticeTex(aniso)));
  const plaster = keep(cachedTex('bos_plaster', aniso, () => plasterTex(aniso)));
  const weave = keep(cachedTex('bos_fabric', aniso, () => fabricTex(aniso)));
  const wood = keep(cachedTex('sy_wood', aniso, () => woodTex(aniso)));
  const leafB = keep(cachedTex('ar_leafB', 1, () => TX.leafTex('banyan')));
  const leafK = keep(cachedTex('ar_leafK', 1, () => TX.leafTex('kamboja')));
  const leafP = keep(cachedTex('ar_leafP', 1, () => TX.leafTex('palm')));
  const leafG = keep(cachedTex('ar_leafG', 1, () => TX.leafTex('grass')));
  const waterN = keep(cachedTex('ar_waterN', aniso, () => TX.waterNormal(aniso)));
  const fallT = keep(cachedTex('ar_fall', 1, () => TX.fallTex()));
  const decalA = keep(siteDecalTex('A')), decalB = keep(siteDecalTex('B')), sign = keep(TX.signTex());

  type Opt = { map?: THREE.Texture | null; normal?: THREE.Texture | null; rough: number; metal?: number; nscale?: number;
    transparent?: boolean; opacity?: number; color?: number; env?: number; decal?: boolean; alphaTest?: number; side?: THREE.Side };
  const M = (o: Opt): THREE.Material => {
    const common = { color: o.color ?? 0xffffff, map: o.map ?? null, vertexColors: !o.decal, transparent: o.transparent ?? false,
      opacity: o.opacity ?? 1, depthWrite: !o.transparent, polygonOffset: !!o.decal, polygonOffsetFactor: o.decal ? -2 : 0,
      polygonOffsetUnits: o.decal ? -2 : 0, alphaTest: o.alphaTest ?? 0, side: o.side ?? THREE.FrontSide };
    if (pbr) {
      const m = new THREE.MeshStandardMaterial({ ...common, roughness: o.rough, metalness: o.metal ?? 0, normalMap: nm ? o.normal ?? null : null });
      if (o.nscale !== undefined) m.normalScale.set(o.nscale, o.nscale);
      if (o.env !== undefined) m.envMapIntensity = o.env;
      return m;
    }
    return new THREE.MeshLambertMaterial(common);
  };

  // air: riak digeser 2 arah (map normal satu, dua salinan offset berbeda tidak didukung material standar → satu lapis bergeser
  // diagonal pelan; cukup hidup di kolam dangkal). Air terjun: guratan turun cepat.
  const wn = rep(waterN, 6);
  const ft = fallT.clone(); ft.repeat.set(1 / 3, 1 / 6); ft.wrapS = ft.wrapT = THREE.RepeatWrapping; textures.push(ft);
  const water = pbr
    ? new THREE.MeshStandardMaterial({ color: 0x2f5a52, roughness: 0.06, metalness: 0, transparent: true, opacity: 0.78, depthWrite: false,
      normalMap: nm ? wn : null, envMapIntensity: 1.5 })
    : new THREE.MeshLambertMaterial({ color: 0x3f6e64, transparent: true, opacity: 0.72, depthWrite: false });
  if (pbr && nm) (water as THREE.MeshStandardMaterial).normalScale.set(0.35, 0.35);
  const fall = new THREE.MeshBasicMaterial({ map: ft, transparent: true, opacity: 0.86, depthWrite: false, side: THREE.DoubleSide, vertexColors: true });

  const mat: Record<ArMat, THREE.Material> = {
    stone: M({ map: rep(stone.map, 4), normal: rep(stone.normal, 4), rough: 0.88, nscale: 0.9 }),
    relief: M({ map: rep(relief.map, 2, 1), normal: rep(relief.normal, 2, 1), rough: 0.9, nscale: 1.0 }),
    brick: M({ map: rep(brick.map, 4), normal: rep(brick.normal, 4), rough: 0.86, nscale: 0.8 }),
    plaster: M({ map: rep(plaster.map, 4), normal: rep(plaster.normal, 4), rough: 0.84, nscale: 0.5 }),
    tile: M({ map: rep(tile.map, 3), normal: rep(tile.normal, 3), rough: 0.72, nscale: 0.9 }),
    wood: M({ map: rep(wood.map, 4), normal: rep(wood.normal, 4), rough: 0.7, nscale: 0.7 }),
    weave: M({ map: rep(weave.map, 1), normal: rep(weave.normal, 1), rough: 0.92, nscale: 0.7 }),
    ground: M({ map: rep(ground.map, 8), normal: rep(ground.normal, 8), rough: 0.96, nscale: 0.8 }),
    paving: M({ map: rep(paving.map, 8), normal: rep(paving.normal, 8), rough: 0.86, nscale: 0.8 }),
    rock: M({ map: rep(rock.map, 6), normal: rep(rock.normal, 6), rough: 0.92, nscale: 1.0 }),
    bark: M({ map: rep(bark.map, 2), normal: rep(bark.normal, 2), rough: 0.94, nscale: 1.0 }),
    leafB: M({ map: leafB, rough: 0.8, alphaTest: 0.45, side: THREE.DoubleSide }),
    leafK: M({ map: leafK, rough: 0.75, alphaTest: 0.45, side: THREE.DoubleSide }),
    leafP: M({ map: leafP, rough: 0.8, alphaTest: 0.35, side: THREE.DoubleSide }),
    leafG: M({ map: leafG, rough: 0.85, alphaTest: 0.4, side: THREE.DoubleSide }),
    bronze: M({ rough: 0.4, metal: 0.82, env: 1.1 }),
    gold: M({ rough: 0.32, metal: 0.9, env: 1.3 }),
    paint: M({ rough: 0.72 }),
    glow: new THREE.MeshBasicMaterial({ vertexColors: true }),
    water, fall,
    lattice: M({ map: rep(lattice.map, 1, 0.9), normal: rep(lattice.normal, 1, 0.9), rough: 0.88, nscale: 1.0 }),
    decalA: M({ map: decalA, rough: 0.8, transparent: true, decal: true }),
    decalB: M({ map: decalB, rough: 0.8, transparent: true, decal: true }),
    sign: M({ map: sign, rough: 0.85, decal: true }),
  };
  return {
    mat, textures,
    update(t: number) {
      wn.offset.set(t * 0.011, t * 0.007);
      ft.offset.y = t * 0.9;
    },
  };
}
