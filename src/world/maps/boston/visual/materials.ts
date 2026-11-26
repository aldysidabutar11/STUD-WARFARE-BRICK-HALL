// src/world/maps/boston/visual/materials.ts — set material Boston per preset. MEDIUM+: PBR (MeshStandard) + normal map prosedural;
// LOW: Lambert. Satu material = satu bucket geometri (Geo) = satu draw call. Warna verteks membedakan benda dalam satu bucket
// (plester krem / kolom putih / aksen tim, kayu terang / gelap, logam hitam / aluminium, kain oranye / kuning / hijau, …).
// UV semua bucket = koordinat dunia (u) → repeat = 1 / rentang tekstur.
import * as THREE from 'three';
import type { GfxProfile } from '../../../../config/presets';
import { cachedTex } from '../../steelyard/visual/materials';
import { concreteTex, woodTex } from '../../steelyard/visual/textures';
import * as TX from './textures';

export type BosMat = 'tileW' | 'tileV' | 'carpet' | 'plaster' | 'wood' | 'marble' | 'metal' | 'conc' | 'fabric' | 'locker' | 'plant'
  | 'glassF' | 'glassC' | 'bamboo' | 'glow' | 'city';

export interface BosMaterials { mat: Record<BosMat, THREE.Material>; textures: THREE.Texture[] }

/** Bucket yang tidak di-bake (transparan / emisif / latar) & yang tidak melempar bayangan. */
export const NO_BAKE = new Set<BosMat>(['glassF', 'glassC', 'glow', 'city']);
export const NO_CAST = new Set<BosMat>(['glassF', 'glassC', 'glow', 'city', 'tileW', 'tileV', 'carpet']);

export function makeBostonMaterials(gfx: GfxProfile, aniso: number): BosMaterials {
  const pbr = gfx.pbr, nm = gfx.normalMaps;
  const textures: THREE.Texture[] = [];
  const keep = <T extends THREE.Texture | TX.MapPair>(v: T): T => {
    if (v instanceof THREE.Texture) textures.push(v); else textures.push(v.map, v.normal);
    return v;
  };
  // salinan per pemakaian (repeat berbeda) — clone() berbagi sumber gambar (unggah sekali)
  const rep = (t: THREE.Texture, span: number, spanV = span) => { const c = t.clone(); c.repeat.set(1 / span, 1 / spanV); textures.push(c); return c; };
  const tileW = keep(cachedTex('bos_tileW', aniso, () => TX.tileWhiteTex(aniso)));
  const tileV = keep(cachedTex('bos_tileV', aniso, () => TX.tileVintageTex(aniso)));
  const carpet = keep(cachedTex('bos_carpet', aniso, () => TX.carpetTex(aniso)));
  const plaster = keep(cachedTex('bos_plaster', aniso, () => TX.plasterTex(aniso)));
  const marble = keep(cachedTex('bos_marble', aniso, () => TX.marbleTex(aniso)));
  const locker = keep(cachedTex('bos_locker', aniso, () => TX.lockerTex(aniso)));
  const bamboo = keep(cachedTex('bos_bamboo', aniso, () => TX.bambooTex(aniso)));
  const fabric = keep(cachedTex('bos_fabric', aniso, () => TX.fabricTex(aniso)));
  const wood = keep(cachedTex('bos_wood', aniso, () => woodTex(aniso)));
  const conc = keep(cachedTex('bos_conc', aniso, () => concreteTex(aniso)));
  const city = keep(cachedTex('bos_city', 1, () => TX.cityTex()));

  type Opt = { map?: THREE.Texture | null; normal?: THREE.Texture | null; rough: number; metal?: number; nscale?: number;
    side?: THREE.Side; transparent?: boolean; opacity?: number; alphaTest?: number; color?: number; env?: number };
  const M = (o: Opt): THREE.Material => {
    if (pbr) {
      const m = new THREE.MeshStandardMaterial({
        color: o.color ?? 0xffffff, map: o.map ?? null, vertexColors: true, roughness: o.rough, metalness: o.metal ?? 0,
        normalMap: nm ? o.normal ?? null : null, side: o.side ?? THREE.FrontSide, transparent: o.transparent ?? false,
        opacity: o.opacity ?? 1, alphaTest: o.alphaTest ?? 0, depthWrite: !o.transparent,
      });
      if (o.nscale !== undefined) m.normalScale.set(o.nscale, o.nscale);
      if (o.env !== undefined) m.envMapIntensity = o.env;
      return m;
    }
    return new THREE.MeshLambertMaterial({ color: o.color ?? 0xffffff, map: o.map ?? null, vertexColors: true, side: o.side ?? THREE.FrontSide,
      transparent: o.transparent ?? false, opacity: o.opacity ?? 1, alphaTest: o.alphaTest ?? 0, depthWrite: !o.transparent });
  };

  const mat: Record<BosMat, THREE.Material> = {
    tileW: M({ map: rep(tileW.map, 4), normal: rep(tileW.normal, 4), rough: 0.24, nscale: 0.8 }),
    tileV: M({ map: rep(tileV.map, 3), normal: rep(tileV.normal, 3), rough: 0.36, nscale: 0.7 }),
    carpet: M({ map: rep(carpet.map, 2.8), normal: rep(carpet.normal, 2.8), rough: 0.97, nscale: 0.6, env: 0.4 }),
    plaster: M({ map: rep(plaster.map, 4), normal: rep(plaster.normal, 4), rough: 0.88, nscale: 0.5 }),
    wood: M({ map: rep(wood.map, 4), normal: rep(wood.normal, 4), rough: 0.55, nscale: 0.7 }),
    marble: M({ map: rep(marble, 2), rough: 0.16 }),
    metal: M({ rough: 0.45, metal: 0.3 }),
    conc: M({ map: rep(conc.map, 4), normal: rep(conc.normal, 4), rough: 0.9, nscale: 0.45 }),
    fabric: M({ map: rep(fabric.map, 1), normal: rep(fabric.normal, 1), rough: 0.95, nscale: 0.6, env: 0.5 }),
    locker: M({ map: rep(locker.map, 1.5, 3.25), normal: rep(locker.normal, 1.5, 3.25), rough: 0.5, metal: 0.25, nscale: 0.8 }),
    plant: M({ rough: 0.75 }),
    glassF: M({ rough: 0.32, transparent: true, opacity: 0.42, color: 0xffffff, env: 1.2 }),
    glassC: M({ rough: 0.05, transparent: true, opacity: 0.16, color: 0xffffff, env: 1.6 }),
    bamboo: M({ map: rep(bamboo, 2), rough: 0.8, alphaTest: 0.5, side: THREE.DoubleSide }),
    glow: new THREE.MeshBasicMaterial({ vertexColors: true }),
    city: new THREE.MeshBasicMaterial({ map: city, fog: false }),
  };
  return { mat, textures };
}
