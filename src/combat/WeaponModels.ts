// src/combat/WeaponModels.ts — template model senjata blocky + optik (GDD §5.4, §6)
// Balok disusun sepanjang −Z, titik akar di grip. Satu geometri ber-vertex color per senjata (1 draw call).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { ScopeId, WeaponId } from '../config/weaponsData';
import { SCOPES } from '../config/weaponsData';
import { XCFG } from '../config/extraConfig';

/** Skala model senjata di scene viewmodel (unit model → unit kamera). sightHeight §9.1 / VM_SCALE = tinggi bidik model. */
export const VM_SCALE = 0.25;
const BORE_Y = 0.28;
/** Tinggi garis bidik besi (unit model) = sightHeight iron §9.1 / VM_SCALE. Tidak ada balok senjata lain yang boleh menutupinya. */
const IRON_Y = SCOPES.iron.sightHeight / VM_SCALE;

interface Spec {
  total: number; barrel: number; color: number; accent: number; magColor: number;
  mag: 'straight' | 'curved'; magAngle: number; bullpup: boolean;
  stock: 'tele' | 'wood' | 'fold' | 'fixed' | 'none'; feature: 'rail' | 'gastube' | 'tallupper' | 'brake' | 'foregrip'
  | 'carry' | 'longbarrel' | 'carrysight' | 'longhg' | 'compact';
}

const SPECS: Record<WeaponId, Spec> = {
  m416:  { total: 2.8, barrel: 0.90, color: 0x2b2b2b, accent: 0x2b2b2b, magColor: 0x2b2b2b, mag: 'straight', magAngle: 8, bullpup: false, stock: 'tele', feature: 'rail' },
  akm:   { total: 2.9, barrel: 0.95, color: 0x3a3a3a, accent: 0x8b5a2b, magColor: 0x3a3a3a, mag: 'curved', magAngle: 12, bullpup: false, stock: 'wood', feature: 'gastube' },
  scarl: { total: 2.8, barrel: 0.85, color: 0x2b2b2b, accent: 0xc2a878, magColor: 0x2b2b2b, mag: 'straight', magAngle: 4, bullpup: false, stock: 'fold', feature: 'tallupper' },
  beryl: { total: 2.85, barrel: 0.90, color: 0x2b2b2b, accent: 0x2b2b2b, magColor: 0x2b2b2b, mag: 'curved', magAngle: 12, bullpup: false, stock: 'tele', feature: 'brake' },
  aug:   { total: 2.5, barrel: 0.75, color: 0x4d5d3a, accent: 0x2b2b2b, magColor: 0x2b2b2b, mag: 'straight', magAngle: 0, bullpup: true, stock: 'none', feature: 'foregrip' },
  qbz:   { total: 2.4, barrel: 0.70, color: 0x3e4636, accent: 0x2b2b2b, magColor: 0x3e4636, mag: 'straight', magAngle: 0, bullpup: true, stock: 'none', feature: 'carry' },
  m16a4: { total: 3.1, barrel: 1.20, color: 0x2b2b2b, accent: 0x2b2b2b, magColor: 0x2b2b2b, mag: 'straight', magAngle: 4, bullpup: false, stock: 'fixed', feature: 'longbarrel' },
  g36c:  { total: 2.3, barrel: 0.55, color: 0x3a3a3a, accent: 0x3a3a3a, magColor: 0x9fa3a6, mag: 'straight', magAngle: 4, bullpup: false, stock: 'fold', feature: 'carrysight' },
  mk47:  { total: 2.8, barrel: 0.85, color: 0x2b2b2b, accent: 0x556b2f, magColor: 0x2b2b2b, mag: 'curved', magAngle: 12, bullpup: false, stock: 'tele', feature: 'longhg' },
  groza: { total: 2.2, barrel: 0.55, color: 0x2f2f2f, accent: 0x2f2f2f, magColor: 0x2f2f2f, mag: 'curved', magAngle: 10, bullpup: true, stock: 'none', feature: 'compact' },
};

export interface WeaponModel {
  geometry: THREE.BufferGeometry;
  muzzle: THREE.Vector3; ejectPort: THREE.Vector3; opticMount: THREE.Vector3;
  length: number;
}

class Builder {
  geos: THREE.BufferGeometry[] = [];
  private c = new THREE.Color();
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color: number, rotX = 0, pivot?: THREE.Vector3) {
    const g = new THREE.BoxGeometry(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0));
    g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    if (rotX && pivot) {
      g.translate(-pivot.x, -pivot.y, -pivot.z); g.rotateX(rotX); g.translate(pivot.x, pivot.y, pivot.z);
    }
    this.c.setHex(color, THREE.SRGBColorSpace);
    const n = g.attributes.position.count, col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = this.c.r; col[i * 3 + 1] = this.c.g; col[i * 3 + 2] = this.c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.deleteAttribute('uv');
    this.geos.push(g);
  }
  build() { const g = mergeGeometries(this.geos)!; g.computeBoundingSphere(); return g; }
}

const D2R = THREE.MathUtils.degToRad;
const cache = new Map<string, WeaponModel>();

export function weaponModel(id: WeaponId, withIron = true): WeaponModel {
  const key = id + (withIron ? ':i' : '');
  const hit = cache.get(key);
  if (hit) return hit;
  const s = SPECS[id];
  const b = new Builder();
  const back = s.bullpup ? 0.55 : 0.95;           // ujung popor di +Z
  const front = -(s.total - back);                 // ujung laras di −Z
  const recvFront = front + s.barrel;
  const recvBack = s.bullpup ? back : 0.35;
  const dark = 0x1c1c1c;
  // receiver
  const upperCol = s.feature === 'tallupper' ? s.accent : s.color;
  b.box(-0.11, 0.12, recvBack, 0.11, 0.30, recvFront, s.color);
  b.box(-0.1, 0.30, Math.min(recvBack, 0.3), 0.1, s.feature === 'tallupper' ? 0.42 : 0.38, recvFront + 0.15, upperCol);
  // laras + moncong
  b.box(-0.045, BORE_Y - 0.045, recvFront, 0.045, BORE_Y + 0.045, front, dark);
  const brake = s.feature === 'brake' ? 0.11 : 0.065;
  b.box(-brake, BORE_Y - brake, front + (s.feature === 'brake' ? 0.22 : 0.12), brake, BORE_Y + brake, front, dark);
  // handguard
  const hgLen = s.feature === 'longhg' ? 0.85 : s.feature === 'compact' ? 0.3 : 0.6;
  const hgCol = s.feature === 'gastube' || s.feature === 'longhg' ? s.accent : s.color;
  if (!s.bullpup || s.feature === 'foregrip') b.box(-0.12, 0.14, recvFront, 0.12, 0.36, recvFront - hgLen, hgCol);
  else b.box(-0.11, 0.15, recvFront, 0.11, 0.35, recvFront - 0.35, s.color);
  // pipa gas di atas handguard, puncaknya di bawah garis bidik besi (dulu 0.46 → menutup tiang depan saat ADS)
  if (s.feature === 'gastube') b.box(-0.04, 0.35, recvFront, 0.04, IRON_Y - 0.02, recvFront - 0.7, s.color);
  if (s.feature === 'rail') for (let z = recvFront + 0.05; z > recvFront - 0.5; z -= 0.12) b.box(-0.06, 0.36, z, 0.06, 0.40, z - 0.06, dark);
  // grip
  b.box(-0.07, -0.42, 0.12, 0.07, 0.13, -0.06, dark, D2R(-14), new THREE.Vector3(0, 0.1, 0.03));
  // magazine
  const magZ = s.bullpup ? 0.32 : -0.42;
  const magPivot = new THREE.Vector3(0, 0.12, magZ);
  if (s.mag === 'straight') b.box(-0.075, -0.45, magZ + 0.11, 0.075, 0.12, magZ - 0.11, s.magColor, D2R(s.magAngle), magPivot);
  else {
    b.box(-0.075, -0.2, magZ + 0.11, 0.075, 0.12, magZ - 0.11, s.magColor, D2R(s.magAngle), magPivot);
    b.box(-0.075, -0.5, magZ + 0.13, 0.075, -0.18, magZ - 0.09, s.magColor, D2R(s.magAngle * 2), magPivot);
  }
  // popor
  if (s.stock === 'tele') { b.box(-0.06, 0.18, 0.35, 0.06, 0.28, 0.75, dark); b.box(-0.09, 0.02, 0.7, 0.09, 0.34, 0.95, s.color); }
  else if (s.stock === 'wood') { b.box(-0.09, 0.0, 0.35, 0.09, 0.32, 0.95, s.accent, D2R(6), new THREE.Vector3(0, 0.3, 0.35)); }
  else if (s.stock === 'fold') { b.box(-0.05, 0.12, 0.35, 0.05, 0.3, 0.9, dark); b.box(-0.08, 0.0, 0.8, 0.08, 0.32, 0.95, dark); }
  else if (s.stock === 'fixed') { b.box(-0.09, 0.02, 0.35, 0.09, 0.32, 0.95, s.color, D2R(5), new THREE.Vector3(0, 0.3, 0.35)); }
  else b.box(-0.1, 0.05, back - 0.12, 0.1, 0.34, back, dark); // bullpup butt pad
  // fitur khas
  if (s.feature === 'foregrip') b.box(-0.06, -0.25, recvFront - 0.25, 0.06, 0.15, recvFront - 0.38, dark);
  // gagang angkat (QBZ, G36C "ber-sight") = rumah bidikan besi: tiang terbelah dengan celah di sumbu bidik
  // + palang atas di atas garis bidik. Dengan optik terpasang, gagang dilepas (optik duduk di rel) agar kaca tidak tertutup.
  if ((s.feature === 'carry' || s.feature === 'carrysight') && withIron) {
    for (const sx of [-1, 1]) {
      b.box(sx * 0.05, 0.38, 0.1, sx * 0.075, 0.6, 0.0, s.color);      // tiang belakang (kiri/kanan)
      b.box(sx * 0.05, 0.38, -0.45, sx * 0.075, 0.6, -0.55, s.color);  // tiang depan (kiri/kanan)
    }
    b.box(-0.075, 0.56, 0.1, 0.075, 0.62, -0.55, s.color);             // palang atas
  }
  // sight depan segitiga M16A4: tiang besi menyembul 0.02 di atasnya (dulu menara setinggi 0.50 menutupi sasaran)
  if (s.feature === 'longbarrel') b.box(-0.03, BORE_Y, front + 0.2, 0.03, IRON_Y - 0.02, front + 0.12, dark);
  // bidikan besi (dipakai bila optik = iron): tiang depan + aperture belakang, puncak = tinggi bidik
  if (withIron) {
    b.box(-0.025, 0.36, front + 0.3, 0.025, IRON_Y, front + 0.26, dark);
    b.box(-0.07, 0.36, 0.25, -0.03, IRON_Y + 0.02, 0.2, dark);
    b.box(0.03, 0.36, 0.25, 0.07, IRON_Y + 0.02, 0.2, dark);
  }
  const model: WeaponModel = {
    geometry: b.build(),
    muzzle: new THREE.Vector3(0, BORE_Y, front - 0.02),
    ejectPort: new THREE.Vector3(0.12, 0.3, s.bullpup ? 0.15 : -0.15),
    opticMount: new THREE.Vector3(0, 0.38, s.bullpup ? -0.1 : -0.3),
    length: s.total,
  };
  cache.set(key, model);
  return model;
}

/** Optik: badan opaque (1 geometri ber-vertex color) + kaca terpisah (red dot/holo) agar bisa dirender bening. */
export interface OpticModel { body: THREE.BufferGeometry; glass: THREE.BufferGeometry | null }

const opticCache = new Map<ScopeId, OpticModel>();

/** Model optik (di-cache): sumbu optik di tinggi sightHeight / VM_SCALE (unit model). */
export function opticModel(id: ScopeId): OpticModel | null {
  if (id === 'iron') return null;
  const cached = opticCache.get(id);
  if (cached) return cached;
  const m = buildOptic(id);
  opticCache.set(id, m);
  return m;
}

function buildOptic(id: ScopeId): OpticModel {
  const b = new Builder();
  const y = SCOPES[id].sightHeight / VM_SCALE, black = 0x161616, lens = 0x3a6f8f;
  const base = 0.38;
  b.box(-0.07, base, 0.08, 0.07, y - 0.08, -0.08, black); // dudukan
  if (id === 'reddot' || id === 'holo') {
    const w = id === 'holo' ? 0.13 : 0.09;
    b.box(-w, y - 0.1, 0.05, w, y - 0.07, -0.12, black);
    b.box(-w, y - 0.1, -0.1, -w + 0.025, y + 0.1, -0.12, black); b.box(w - 0.025, y - 0.1, -0.1, w, y + 0.1, -0.12, black);
    b.box(-w, y + 0.08, -0.1, w, y + 0.1, -0.12, black);
    // §6: "titik merah menyala di bingkai kaca tipis" — kaca bening dibidik tembus; titiknya overlay HUD di tengah layar (§6.1)
    const g = new Builder();
    g.box(-w + 0.02, y - 0.07, -0.105, w - 0.02, y + 0.08, -0.115, 0xffffff);
    return { body: b.build(), glass: g.build() };
  }
  // optik ≥2×: viewmodel disembunyikan saat ADS (overlay lensa §6.1) → lensa belakang cukup opaque gelap
  const len = id === 'x2' ? 0.4 : id === 'x3' ? 0.5 : id === 'x4' ? 0.55 : 0.75;
  const r = id === 'x6' ? 0.09 : 0.075;
  b.box(-r, y - r, 0.18, r, y + r, 0.18 - len, black);
  b.box(-r - 0.025, y - r - 0.025, 0.2, r + 0.025, y + r + 0.025, 0.08, black);
  b.box(-r - 0.03, y - r - 0.03, 0.18 - len + 0.12, r + 0.03, y + r + 0.03, 0.18 - len, black);
  if (id === 'x4') b.box(-0.02, y + r, 0.05, 0.02, y + r + 0.04, -0.25, 0xcc3322);
  b.box(-r + 0.01, y - r + 0.01, 0.181, r - 0.01, y + r - 0.01, 0.17, lens);
  return { body: b.build(), glass: null };
}

/** Senjata & pisau: PBR setengah logam (pantulan lingkungan saat preset mendukung). */
export const WEAPON_MATERIAL = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: XCFG.gfx.rough.weapon, metalness: 0.4 });

/** Kaca optik 1×: tipis & hampir bening (sedikit biru), tidak menulis depth, tidak membuat bayangan. */
export const OPTIC_GLASS_MATERIAL = new THREE.MeshBasicMaterial({ color: 0xbfe4ff, transparent: true, opacity: 0.14, depthWrite: false });

/** Salinan khusus scene viewmodel. Satu material yang dirender di DUA scene (lampu & kabut berbeda) membuat three.js
 *  menghitung ulang & mengganti program shader-nya setiap frame (alokasi + waktu CPU) -> viewmodel memakai salinan sendiri. */
export const VM_WEAPON_MATERIAL = WEAPON_MATERIAL.clone();
export const VM_OPTIC_GLASS_MATERIAL = OPTIC_GLASS_MATERIAL.clone();

/** Mesh optik siap pasang: badan (WEAPON_MATERIAL) + anak kaca bening. null untuk iron sight. vm = untuk scene viewmodel. */
export function createOpticMesh(id: ScopeId, vm = false): THREE.Mesh | null {
  const m = opticModel(id);
  if (!m) return null;
  const body = new THREE.Mesh(m.body, vm ? VM_WEAPON_MATERIAL : WEAPON_MATERIAL);
  if (m.glass) {
    const glass = new THREE.Mesh(m.glass, vm ? VM_OPTIC_GLASS_MATERIAL : OPTIC_GLASS_MATERIAL);
    glass.name = 'opticGlass';
    body.add(glass);
  }
  return body;
}

// ── pisau (slot 2) & granat K-400 di tangan (slot 3): ber-vertex color, akar di genggaman, bilah/ujung ke −Z
let knifeGeo: THREE.BufferGeometry | null = null, nadeGeo: THREE.BufferGeometry | null = null;

// Pisau dibangun dari PROFIL ASLI yang diekstrusi (bukan balok): bilah clip-point berperut dengan bevel tajam, alur bilah,
// punggung bergerigi, pelindung silang, gagang karet beralur jari, pommel. Semua geometri non-indexed + vertex color (1 draw call).
const _kc = new THREE.Color();
/** Beri warna per verteks (fungsi posisi & normal), buang uv. */
function tint(g: THREE.BufferGeometry, fn: (x: number, y: number, z: number, nx: number, ny: number, nz: number) => number) {
  const p = g.attributes.position, n = g.attributes.normal, col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    _kc.setHex(fn(p.getX(i), p.getY(i), p.getZ(i), n.getX(i), n.getY(i), n.getZ(i)), THREE.SRGBColorSpace);
    col[i * 3] = _kc.r; col[i * 3 + 1] = _kc.g; col[i * 3 + 2] = _kc.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  if (g.attributes.uv) g.deleteAttribute('uv');
  return g;
}
/** Profil 2D (u = sepanjang benda, v = atas) diekstrusi setebal `depth` (X model, terpusat). dir −1: u → −Z (bilah), +1: u → +Z (gagang). */
function extrude(shape: THREE.Shape, depth: number, bevel: number, z0: number, dir: 1 | -1) {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel,
    bevelSegments: 2, curveSegments: 10 });
  g.rotateY(dir < 0 ? Math.PI / 2 : -Math.PI / 2);   // (u, v, w) → (±w, v, ∓u)
  g.translate(dir < 0 ? -depth / 2 : depth / 2, 0, z0);
  return g;
}
/** Balok non-indexed berwarna (opsional diputar pada sumbu X di sekitar pusatnya). */
function boxNI(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color: number, rotX = 0) {
  const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0).toNonIndexed();
  if (rotX) g.rotateX(rotX);
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  return tint(g, () => color);
}

/** Pisau komando realistis: akar (0,0,0) = tengah genggaman, bilah ke −Z, sisi tajam ke −Y. Panjang total ±1.25 unit model. */
export function knifeModel(): THREE.BufferGeometry {
  if (knifeGeo) return knifeGeo;
  const Z0 = -0.2;                      // pangkal bilah (depan pelindung)
  const geos: THREE.BufferGeometry[] = [];
  // bilah: choil kecil → sisi tajam lurus → perut melengkung ke ujung → clip point cekung → punggung lurus
  const b = new THREE.Shape();
  b.moveTo(0, -0.075); b.lineTo(0.02, -0.075);
  b.quadraticCurveTo(0.03, -0.1, 0.06, -0.1);
  b.lineTo(0.44, -0.1);
  b.quadraticCurveTo(0.7, -0.1, 0.8, 0.03);
  b.quadraticCurveTo(0.69, 0.045, 0.56, 0.088);
  b.lineTo(0, 0.088);
  b.closePath();
  geos.push(tint(extrude(b, 0.026, 0.013, Z0, -1), (_x, y, _z, nx) =>
    Math.abs(nx) > 0.9 ? 0xa8b0b9 : y < -0.06 ? 0xf2f5f8 : 0xd4dae1));          // muka satin, bevel tajam berkilat
  for (const sx of [-1, 1]) geos.push(boxNI(sx > 0 ? 0.0262 : -0.029, 0.022, Z0 - 0.46, sx > 0 ? 0.029 : -0.0262, 0.047, Z0 - 0.07, 0x6a727c)); // alur bilah
  for (let i = 0; i < 6; i++) {                                                  // punggung bergerigi (sawback)
    const zc = Z0 - 0.07 - i * 0.042;
    geos.push(boxNI(-0.016, 0.09, zc - 0.018, 0.016, 0.118, zc + 0.018, 0x8b939d, 0.6));
  }
  // pelindung silang + ujung bawah
  geos.push(boxNI(-0.048, -0.15, Z0, 0.048, 0.14, Z0 + 0.035, 0x2c2f33));
  geos.push(boxNI(-0.04, -0.175, Z0 - 0.012, 0.04, -0.14, Z0 + 0.03, 0x2c2f33));
  // gagang: alur jari di bawah, menggembung di telapak, melebar ke pommel
  const h = new THREE.Shape();
  h.moveTo(0, -0.07);
  h.quadraticCurveTo(0.03, -0.088, 0.06, -0.068);
  h.quadraticCurveTo(0.09, -0.086, 0.12, -0.066);
  h.quadraticCurveTo(0.15, -0.086, 0.18, -0.066);
  h.quadraticCurveTo(0.23, -0.088, 0.29, -0.072);
  h.lineTo(0.355, -0.08); h.lineTo(0.355, 0.072);
  h.quadraticCurveTo(0.2, 0.084, 0, 0.064);
  h.closePath();
  const HZ = Z0 + 0.035;
  geos.push(tint(extrude(h, 0.064, 0.017, HZ, 1), (_x, y, z) =>
    Math.floor((z - HZ) / 0.05) % 2 === 0 ? (y > 0.05 ? 0x2b2e31 : 0x222427) : (y > 0.05 ? 0x25282b : 0x1c1e20)));   // karet bertekstur
  geos.push(boxNI(-0.05, -0.088, HZ + 0.35, 0.05, 0.082, HZ + 0.405, 0x59606a));   // pommel baja
  geos.push(boxNI(-0.03, -0.03, HZ + 0.405, 0.03, 0.03, HZ + 0.43, 0x3d4248));
  knifeGeo = mergeGeometries(geos)!;
  knifeGeo.computeBoundingSphere();
  return knifeGeo;
}

/** Titik ujung bilah & titik tengah bilah (unit model) — jejak kilatan tebasan. */
export const KNIFE_TIP = new THREE.Vector3(0, 0.02, -0.98);
export const KNIFE_MID = new THREE.Vector3(0, 0.0, -0.55);

/** Granat K-400 di tangan (ukuran sama dengan badan granat dunia GrenadeK400). */
let flashGeo: THREE.BufferGeometry | null = null;
/** Flashbang (gaya M84 blocky): tabung abu-abu muda lebih ramping & tinggi, lubang hitam di 4 sisi, pita putih — siluet & warna
 *  jelas beda dari K-400 (hijau zaitun, gemuk). */
export function flashbangModel(): THREE.BufferGeometry {
  if (flashGeo) return flashGeo;
  const b = new Builder();
  const body = 0xa9b0b9, hole = 0x1d1f22, band = 0xe9e3d1, dark = 0x2a2c30;
  b.box(-0.17, -0.3, -0.17, 0.17, 0.3, 0.17, body);
  b.box(-0.178, 0.13, -0.178, 0.178, 0.21, 0.178, band);              // pita atas
  for (const y of [-0.2, -0.04]) {                                     // lubang di 4 sisi
    b.box(-0.06, y, 0.165, 0.06, y + 0.1, 0.182, hole);
    b.box(-0.06, y, -0.182, 0.06, y + 0.1, -0.165, hole);
    b.box(0.165, y, -0.06, 0.182, y + 0.1, 0.06, hole);
    b.box(-0.182, y, -0.06, -0.165, y + 0.1, 0.06, hole);
  }
  b.box(-0.1, 0.3, -0.1, 0.1, 0.43, 0.1, dark);                        // sumbu
  b.box(0.14, -0.04, -0.03, 0.22, 0.37, 0.03, dark);                   // tuas
  b.box(-0.19, 0.35, -0.02, -0.1, 0.41, 0.02, 0x9aa0a8);               // ring pin
  flashGeo = b.build();
  return flashGeo;
}

export function grenadeModel(): THREE.BufferGeometry {
  if (nadeGeo) return nadeGeo;
  const b = new Builder();
  const olive = 0x4f5d2f, dark = 0x222222;
  b.box(-0.21, -0.25, -0.21, 0.21, 0.25, 0.21, olive);
  b.box(-0.11, 0.25, -0.11, 0.11, 0.39, 0.11, dark);             // tutup sumbu
  b.box(0.18, -0.06, -0.03, 0.26, 0.3, 0.03, dark);              // tuas
  b.box(-0.2, 0.31, -0.02, -0.11, 0.37, 0.02, 0x9aa0a8);         // ring pin
  nadeGeo = b.build();
  return nadeGeo;
}
