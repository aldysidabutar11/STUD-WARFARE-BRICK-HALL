// src/world/maps/steelyard/visual/materials.ts — set material Steel Yard per preset. MEDIUM+: PBR (MeshStandard) + normal map
// prosedural + pantulan lingkungan; LOW: Lambert (tanpa normal map). Satu material = satu bucket geometri = satu draw call.
// SATU shader gabungan ("uber", disuntik lewat onBeforeCompile yang DIRANTAI setelah bakedMaterial) untuk semua material ber-
// cahaya → semua berbagi program (kompilasi shader ANGLE/D3D ±100 ms per program saat memuat map). Mode lewat uniform uSyMode:
//   0 biasa : map × warna verteks (kayu, beton, karet, kaca, genangan)
//   1 mask  : warna cat = warna verteks × kecerahan (R); karat/noda (G) & debu (B) dicampur dengan warnanya sendiri → kontainer
//             biru/merah/krem semuanya berkarat oranye-cokelat yang benar; kekasaran naik di karat & debu (baja, terpal)
//   2 tanah : makro unik (map) × detail berulang koordinat dunia (×2) + normal map detail di koordinat dunia yang sama
// Semua mode: difus IBL diredupkan (peta lingkungan luar ruang sangat terang) & pantulan × uSyRefl (genangan/kaca lebih memantul).
// Tanah luar (uSyFade aktif): mendekati far kamera warna akhirnya dilebur ke rumus "tanah jauh berkabut" langit (sky.ts) →
// garis potong far (300 u) tidak terlihat sebagai garis lurus di cakrawala (kamera menu / tempat tinggi).
import * as THREE from 'three';
import type { GfxProfile } from '../../../../config/presets';
import * as TX from './textures';

export type MatKey = 'steel' | 'wood' | 'concrete' | 'rubber' | 'glass' | 'tarp' | 'ground' | 'outer' | 'puddle' | 'proxy';

/** Suntikan shader yang dirantai setelah bake (kunci cache program unik per varian). */
export interface Inject { key: string; fn: (sh: THREE.WebGLProgramParametersWithUniforms) => void; uniforms: Record<string, THREE.IUniform> }

export interface SYMaterials {
  mat: Record<MatKey, THREE.Material>;
  inject: Map<THREE.Material, Inject>;
  /** Tekstur makro tanah dipasang belakangan (butuh data denah) — lihat ground.ts. */
  setGroundMacro(t: THREE.Texture): void;
  /** Semua tekstur yang dibuat (termasuk yang hanya dirujuk uniform suntikan) — dilepas di dispose map. */
  textures: THREE.Texture[];
  /** Tanah luar: lebur ke warna tanah jauh langit (ground/haze sRGB = nilai makeSky) antara far×0.78 … far×0.97. */
  setFarFade(ground: number, haze: number, far: number): void;
}

const lin = (hex: number) => new THREE.Color().setHex(hex, THREE.SRGBColorSpace);

/** Tekstur prosedural disimpan (sisi CPU) antar-muat map: dispose() melepas memori GPU-nya, pemakaian berikut mengunggah ulang
 *  kanvas yang sama (tanpa membangkitkan ulang ±200 ms). */
const CACHE = new Map<string, unknown>();
export function cachedTex<T>(key: string, aniso: number, make: () => T): T {
  let v = CACHE.get(key) as T | undefined;
  if (!v) { v = make(); CACHE.set(key, v); }
  const set = (t: unknown) => { if (t instanceof THREE.Texture) t.anisotropy = aniso; };
  if (v instanceof THREE.Texture) set(v); else if (v && typeof v === 'object') Object.values(v).forEach(set);
  return v;
}

/** Tekstur 1×1 (putih / normal datar) agar material tanpa peta tetap berbagi program dengan material berpeta. */
function tex1(r: number, g: number, b: number): THREE.DataTexture {
  const t = new THREE.DataTexture(new Uint8Array([r, g, b, 255]), 1, 1, THREE.RGBAFormat);
  t.colorSpace = THREE.NoColorSpace; t.needsUpdate = true;
  return t;
}

/** Rantai suntikan setelah onBeforeCompile yang sudah ada (bake) + kunci cache program unik. */
export function chainInject(m: THREE.Material, inj: Inject, baseKey: string) {
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => { prev.call(m, sh, r); inj.fn(sh); };
  m.customProgramCacheKey = () => `${baseKey}|${inj.key}`;
}

interface UberOpts { stain?: number; dust?: number; stainAmt?: number; dustAmt?: number; roughStain?: number; refl?: number }

/** Suntikan shader gabungan (lihat kepala berkas). Kode sama untuk semua material → satu program per sisi (Front/Double). */
function uber(mode: 0 | 1 | 2, detail: THREE.Texture, o: UberOpts = {}): Inject {
  const U = {
    uSyMode: { value: mode }, uSyRefl: { value: o.refl ?? 1 }, uSyDetail: { value: detail }, uSySpan: { value: TX.GROUND_DETAIL_SPAN },
    uSyStain: { value: lin(o.stain ?? 0x94552a) }, uSyDust: { value: lin(o.dust ?? 0xb59c78) },
    uSyStainAmt: { value: o.stainAmt ?? 1 }, uSyDustAmt: { value: o.dustAmt ?? 0.85 }, uSyRoughStain: { value: o.roughStain ?? 0 },
    // lebur jauh (hanya tanah luar): x..y = kedalaman pandang awal..penuh (0,0 = mati), warna = uGround/uHaze langit (linear)
    uSyFade: { value: new THREE.Vector2(0, 0) }, uSyGround: { value: new THREE.Color() }, uSyHaze: { value: new THREE.Color() },
  };
  return {
    key: 'sy-uber2', uniforms: U,
    fn: (sh) => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', `#include <common>
varying vec2 vSyXZ;
varying vec3 vSyW;
uniform float uSySpan;
uniform float uSyMode;`)
        .replace('#include <uv_vertex>', `#include <uv_vertex>
	vSyXZ = vec2( position.x, - position.z ) / uSySpan;
	vSyW = ( modelMatrix * vec4( position, 1.0 ) ).xyz;
#ifdef USE_NORMALMAP
	if ( uSyMode > 1.5 ) vNormalMapUv = vSyXZ;
#endif`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
varying vec2 vSyXZ;
varying vec3 vSyW;
uniform vec2 uSyFade; uniform vec3 uSyGround; uniform vec3 uSyHaze;
uniform sampler2D uSyDetail;
uniform float uSyMode; uniform float uSyRefl;
uniform vec3 uSyStain; uniform vec3 uSyDust; uniform float uSyStainAmt; uniform float uSyDustAmt; uniform float uSyRoughStain;`)
        .replace('#include <map_fragment>', `#ifdef USE_MAP
	vec4 syM = texture2D( map, vMapUv );
#else
	vec4 syM = vec4( 1.0 );
#endif`)
        .replace('#include <color_fragment>', `#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )
	vec3 syV = vColor.rgb;
#else
	vec3 syV = vec3( 1.0 );
#endif
	if ( uSyMode < 0.5 ) {
		diffuseColor.rgb *= syM.rgb * syV;
	} else if ( uSyMode < 1.5 ) {
		vec3 syC = diffuseColor.rgb * syV * ( syM.r * 1.22 );
		syC = mix( syC, uSyStain * ( 0.55 + 0.6 * syM.r ), clamp( syM.g * uSyStainAmt, 0.0, 1.0 ) );
		syC = mix( syC, uSyDust * ( 0.85 + 0.25 * syM.r ), clamp( syM.b * uSyDustAmt, 0.0, 1.0 ) );
		diffuseColor.rgb = syC;
	} else {
		diffuseColor.rgb *= syM.rgb * syV * texture2D( uSyDetail, vSyXZ ).rgb * 2.0;
	}`)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
	if ( uSyMode > 0.5 && uSyMode < 1.5 ) roughnessFactor = clamp( roughnessFactor + syM.g * uSyRoughStain + syM.b * 0.25, 0.04, 1.0 );`)
        .replace('#include <lights_fragment_maps>', `#include <lights_fragment_maps>
#if defined( RE_IndirectDiffuse ) && defined( USE_ENVMAP )
	iblIrradiance *= 0.5;
#endif
#if defined( RE_IndirectSpecular )
	radiance *= uSyRefl;
#endif`)
        .replace('#include <fog_fragment>', `#include <fog_fragment>
	if ( uSyFade.y > 0.0 ) {
		// = sky.ts "tanah jauh berkabut" untuk arah pandang piksel ini (kabut FogExp2 scene, jarak sinar ke bidang y 0)
		vec3 syD = normalize( vSyW - cameraPosition );
		float syDist = max( cameraPosition.y, 1.0 ) / max( - syD.y, 1e-4 );
#ifdef FOG_EXP2
		float syF = 1.0 - exp( - pow( fogDensity * syDist, 2.0 ) );
#else
		float syF = 0.0;
#endif
		vec4 syFar = vec4( mix( uSyGround, uSyHaze, syF ), 1.0 );
#if defined( TONE_MAPPING )
		syFar.rgb = toneMapping( syFar.rgb );
#endif
		syFar = linearToOutputTexel( syFar );
		gl_FragColor.rgb = mix( gl_FragColor.rgb, syFar.rgb, smoothstep( uSyFade.x, uSyFade.y, vViewPosition.z ) );
	}`);
    },
  };
}

/** Bangun semua material + tekstur prosedural untuk preset ini. */
export function makeMaterials(gfx: GfxProfile, aniso: number): SYMaterials {
  const pbr = gfx.pbr, nm = gfx.normalMaps;
  const inject = new Map<THREE.Material, Inject>();
  const steelMap = cachedTex('steelMask', aniso, () => TX.steelMask(aniso));
  const wood = cachedTex('wood', aniso, () => TX.woodTex(aniso)), conc = cachedTex('concrete', aniso, () => TX.concreteTex(aniso));
  const rub = cachedTex('rubber', aniso, () => TX.rubberTex(aniso)), tarp = cachedTex('tarp', aniso, () => TX.tarpMask(aniso));
  const det = cachedTex('groundDetail', aniso, () => TX.groundDetail(aniso));
  const textures: THREE.Texture[] = [steelMap, wood.map, wood.normal, conc.map, conc.normal, rub.map, rub.normal, tarp.map, tarp.normal, det.map, det.normal];
  const rep = (t: THREE.Texture, x: number, y: number) => { t.repeat.set(x, y); return t; };
  type Opt = { map?: THREE.Texture | null; normal?: THREE.Texture | null; rough: number; metal?: number; vc?: boolean; side?: THREE.Side; nscale?: number; color?: number };
  const M = (o: Opt): THREE.Material => {
    if (pbr) {
      const m = new THREE.MeshStandardMaterial({
        color: o.color ?? 0xffffff, map: o.map ?? null, vertexColors: o.vc ?? true, roughness: o.rough, metalness: o.metal ?? 0,
        normalMap: nm ? o.normal ?? null : null, side: o.side ?? THREE.FrontSide,
      });
      if (o.nscale !== undefined) m.normalScale.set(o.nscale, o.nscale);
      return m;
    }
    return new THREE.MeshLambertMaterial({ color: o.color ?? 0xffffff, map: o.map ?? null, vertexColors: o.vc ?? true, side: o.side ?? THREE.FrontSide });
  };

  const steelN = nm ? rep(cachedTex('steelNormal', aniso, () => TX.steelNormal(aniso)), 8, 2) : null;
  if (steelN) textures.push(steelN);
  const white = cachedTex('white1', 1, () => tex1(255, 255, 255)), flat = cachedTex('flat1', 1, () => tex1(128, 128, 255));
  const D = det.map;
  // baja & terpal (mode mask)
  const steel = M({ map: steelMap, normal: steelN, rough: 0.52, metal: 0.22, nscale: 0.28 });
  inject.set(steel, uber(1, D, { stain: 0x94552a, dust: 0xb59c78, stainAmt: 1.1, dustAmt: 0.85, roughStain: 0.3 }));
  const tarpM = M({ map: tarp.map, normal: rep(tarp.normal, 2, 2), rough: 0.93, side: THREE.DoubleSide, nscale: 0.5 });
  inject.set(tarpM, uber(1, D, { stain: 0x4b3d2e, dust: 0xbba582, stainAmt: 0.75, dustAmt: 0.9 }));
  // kayu, beton, karet, kaca, genangan (mode biasa; kaca & genangan tanpa peta memakai putih/normal datar 1×1)
  const woodM = M({ map: rep(wood.map, 0.25, 0.25), normal: rep(wood.normal, 0.25, 0.25), rough: 0.82, nscale: 0.9 });
  const concM = M({ map: rep(conc.map, 0.25, 0.25), normal: rep(conc.normal, 0.25, 0.25), rough: 0.9, nscale: 0.45 });
  const rubM = M({ map: rubberRepeat(rub.map), normal: rubberRepeat(rub.normal), rough: 0.88 });
  const glass = M({ map: white, normal: flat, rough: 0.1 });
  const pudN = nm && pbr ? cachedTex('puddleNormal', aniso, () => TX.puddleNormal(aniso)) : null;
  if (pudN) textures.push(pudN);
  // air gelap hampir netral: pantulan langit (biru) yang terbaca sebagai air — dasar cokelat-kemerahan membuat pantulan ungu
  const puddle = M({ map: white, normal: pudN ?? flat, rough: 0.07, color: pbr ? 0x2a2620 : 0x4a4236, nscale: 0.12 });
  for (const [m, r] of [[woodM, 1], [concM, 1], [rubM, 1], [glass, 1.8], [puddle, 1.5]] as const) inject.set(m, uber(0, D, { refl: r }));
  // tanah dalam & luar (mode tanah): makro (luar = putih 1×1) × detail dunia × warna verteks (dalam = putih)
  const groundM = M({ map: null, normal: det.normal, rough: 0.96, vc: true, nscale: 0.6 });
  const outerM = M({ map: white, normal: det.normal, rough: 0.97, vc: true, nscale: 0.6 });
  for (const m of [groundM, outerM]) inject.set(m, uber(2, D));
  const outerU = inject.get(outerM)!.uniforms;
  // proxy bayangan: tidak menulis warna/kedalaman & tes kedalaman "tidak pernah" → 0 fragmen di pass utama; pass bayangan normal
  // shadowSide ganda: proxy tipis (atap kontainer terbuka) tetap menulis kedalaman walau muka bawahnya dilewati
  const proxy = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, depthFunc: THREE.NeverDepth, shadowSide: THREE.DoubleSide });

  const mat: Record<MatKey, THREE.Material> = {
    steel, wood: woodM, concrete: concM, rubber: rubM, glass, tarp: tarpM, ground: groundM, outer: outerM, puddle, proxy,
  };
  return {
    mat, inject, textures,
    setGroundMacro: (t) => {
      const g = groundM as THREE.MeshStandardMaterial | THREE.MeshLambertMaterial;
      g.map = t; g.needsUpdate = true;
      textures.push(t);
    },
    setFarFade: (ground, haze, far) => {
      (outerU.uSyFade.value as THREE.Vector2).set(far * 0.78, far * 0.97);
      (outerU.uSyGround.value as THREE.Color).setHex(ground, THREE.SRGBColorSpace);
      (outerU.uSyHaze.value as THREE.Color).setHex(haze, THREE.SRGBColorSpace);
    },
  };
}

/** Tapak karet: 1 tekstur = 2 u keliling × 1 u lebar. */
function rubberRepeat(t: THREE.Texture) { t.repeat.set(0.5, 1); return t; }
