// src/config/weaponsData.ts — SUMBER KEBENARAN senjata & optik (GDD v2 §5–6). 10 AR di bawah = salinan GDD (tidak diubah);
// senjata tambahan (SMG, shotgun, sniper/DMR, LMG, pistol — dokumen ekspansi senjata pengguna, bukan GDD) ada di weaponsExtra.ts
// dan digabung ke WEAPONS. Field ekstensi WeaponDef opsional: tanpa nilai = perilaku AR GDD.
import { X_WEAPONS, type XWeaponId } from './weaponsExtra';

/** 10 assault rifle GDD (dipakai bot & sebagai bawaan). */
export type ArId = 'm416' | 'akm' | 'scarl' | 'beryl' | 'aug' | 'qbz' | 'm16a4' | 'g36c' | 'mk47' | 'groza';
export type WeaponId = ArId | XWeaponId;
export type FireMode = 'AUTO' | 'BURST2' | 'BURST3' | 'SINGLE';
export type ScopeId = 'iron' | 'reddot' | 'holo' | 'x2' | 'x3' | 'x4' | 'x6';
/** Kelas senjata: AR (GDD), SMG, SG (shotgun), SR (sniper), DMR, LMG, PISTOL (slot 2). */
export type WeaponClass = 'AR' | 'SMG' | 'SG' | 'SR' | 'DMR' | 'LMG' | 'PISTOL';
/** Profil suara tembakan sintesis (audio/Recipes.gunshot); tanpa nilai = dari kaliber AR (5.56 / 7.62). */
export type GunSound = '556' | '762' | '9mm' | '45' | '57' | '12ga' | 'magnum' | 'sniper' | 'heavy' | 'suppressed';

export interface WeaponDef {
  id: WeaponId; name: string; caliber: string;
  modes: FireMode[];       // urutan siklus tombol B; [0] = default
  baseDamage: number;      // per peluru, sebelum multiplier hitbox & falloff
  rpm: number;             // interval = 60 / rpm (interval dalam burst untuk BURST*)
  reloadTime: number;      // detik; transfer amunisi pada CFG.combat.reloadCommit
  recoilVert: number;      // derajat pitch dasar per peluru
  recoilHorz: number;      // derajat yaw acak ±
  recoveryMult: number;    // pengali kecepatan pemulihan recoil
  maxScope: ScopeId;       // optik tertinggi yang diizinkan
  audioPitch: number;      // pengali nada sintesis
  magSize: number; reserveAmmo: number;
  // ── ekstensi (opsional; tanpa nilai = AR GDD)
  cls?: WeaponClass;
  /** Pellet per tembakan (shotgun). spreadHip/Ads lalu = setengah sudut POLA pellet (pusat pola = crosshair). */
  pellets?: number;
  /** Pengali kepala khusus (shotgun 1.5: pellet nyasar tidak one-shot); bagian lain tetap CFG.combat.hitMult. */
  headMult?: number;
  /** Setengah kerucut spread dasar hipfire / ADS (derajat); tambahan gerak/lompat/jongkok tetap CFG.combat.spread. */
  spreadHip?: number; spreadAds?: number;
  /** Falloff [mulai, rentang, minimum] — rumus sama dengan GDD §5.3. */
  falloff?: readonly [number, number, number];
  /** Pengali kecepatan gerak saat dipegang. */
  moveMult?: number;
  equipTime?: number; sprintToFire?: number;
  /** Waktu masuk ADS (s) senjata berat (sniper); tanpa nilai = waktu optik (SCOPES.adsTime). */
  adsTime?: number;
  /** 'shell' = isi per selongsong (shellTime), bisa dibatalkan dengan menembak. */
  reload?: 'mag' | 'shell'; shellTime?: number;
  /** Mekanisme terlihat: kokang pompa / bolt setelah tiap tembakan, slide pistol menghentak. */
  action?: 'pump' | 'bolt' | 'slide';
  /** Pengali recoil jongkok (LMG 0.60; GDD 0.75). */
  crouchRecoil?: number;
  /** Peredam: radius dengar bot kecil (hearRadius), tidak muncul di radar saat menembak, kilat moncong kecil. */
  suppressed?: boolean; hearRadius?: number;
  sound?: GunSound;
  /** Optik yang boleh dipasang (bila ada, menggantikan aturan maxScope) & optik bawaan saat dipilih di Loadout. */
  scopes?: readonly ScopeId[]; defScope?: ScopeId;
  /** Peran singkat (kartu Loadout). */
  role?: string;
}

const D = { magSize: 30, reserveAmmo: 120, recoveryMult: 1.0, maxScope: 'x6' as ScopeId };

const GDD_AR: Record<ArId, WeaponDef> = {
  m416:  { ...D, id: 'm416',  name: 'M416',        caliber: '5.56', modes: ['AUTO', 'SINGLE'],           baseDamage: 41, rpm: 700, reloadTime: 2.1, recoilVert: 1.20, recoilHorz: 0.35, audioPitch: 1.00 },
  akm:   { ...D, id: 'akm',   name: 'AKM',         caliber: '7.62', modes: ['AUTO', 'SINGLE'],           baseDamage: 48, rpm: 600, reloadTime: 2.9, recoilVert: 1.85, recoilHorz: 0.55, audioPitch: 0.95 },
  scarl: { ...D, id: 'scarl', name: 'SCAR-L',      caliber: '5.56', modes: ['AUTO', 'SINGLE'],           baseDamage: 41, rpm: 625, reloadTime: 2.2, recoilVert: 1.00, recoilHorz: 0.30, audioPitch: 1.03 },
  beryl: { ...D, id: 'beryl', name: 'Beryl M762',  caliber: '7.62', modes: ['AUTO', 'BURST3', 'SINGLE'], baseDamage: 46, rpm: 700, reloadTime: 2.9, recoilVert: 2.10, recoilHorz: 0.60, audioPitch: 0.92 },
  aug:   { ...D, id: 'aug',   name: 'AUG A3',      caliber: '5.56', modes: ['AUTO', 'SINGLE'],           baseDamage: 41, rpm: 700, reloadTime: 3.0, recoilVert: 0.90, recoilHorz: 0.25, audioPitch: 1.06 },
  qbz:   { ...D, id: 'qbz',   name: 'QBZ',         caliber: '5.56', modes: ['AUTO', 'SINGLE'],           baseDamage: 41, rpm: 650, reloadTime: 2.8, recoilVert: 1.10, recoilHorz: 0.32, audioPitch: 1.04 },
  m16a4: { ...D, id: 'm16a4', name: 'M16A4',       caliber: '5.56', modes: ['BURST3', 'SINGLE'],         baseDamage: 43, rpm: 800, reloadTime: 2.2, recoilVert: 1.30, recoilHorz: 0.28, audioPitch: 1.08 },
  g36c:  { ...D, id: 'g36c',  name: 'G36C',        caliber: '5.56', modes: ['AUTO', 'SINGLE'],           baseDamage: 41, rpm: 666, reloadTime: 2.3, recoilVert: 1.05, recoilHorz: 0.30, audioPitch: 1.10, recoveryMult: 1.3 },
  mk47:  { ...D, id: 'mk47',  name: 'MK47 Mutant', caliber: '7.62', modes: ['BURST2', 'SINGLE'],         baseDamage: 49, rpm: 600, reloadTime: 2.7, recoilVert: 1.60, recoilHorz: 0.40, audioPitch: 0.97 },
  groza: { ...D, id: 'groza', name: 'Groza',       caliber: '7.62', modes: ['AUTO', 'SINGLE'],           baseDamage: 48, rpm: 750, reloadTime: 3.0, recoilVert: 1.70, recoilHorz: 0.50, audioPitch: 0.90, maxScope: 'x3' },
};

export const WEAPONS: Record<WeaponId, WeaponDef> = { ...GDD_AR, ...X_WEAPONS };

/** 10 AR GDD (urutan Loadout kelas AR; bot memakai daftar ini). */
export const WEAPON_ORDER: ArId[] = [
  'm416', 'akm', 'scarl', 'beryl', 'aug', 'qbz', 'm16a4', 'g36c', 'mk47', 'groza'
];

export const classOf = (w: WeaponDef): WeaponClass => w.cls ?? 'AR';
export const isWeaponId = (v: unknown): v is WeaponId => typeof v === 'string' && Object.prototype.hasOwnProperty.call(WEAPONS, v);
/** Senjata utama (slot 1) / pistol (slot 2). */
export const isPrimaryId = (v: unknown): v is WeaponId => isWeaponId(v) && classOf(WEAPONS[v]) !== 'PISTOL';
export const isPistolId = (v: unknown): v is WeaponId => isWeaponId(v) && classOf(WEAPONS[v]) === 'PISTOL';

export interface ScopeDef {
  id: ScopeId; name: string; zoomLabel: number; fov: number; adsTime: number;
  lensOverlay: boolean; sightHeight: number;
}

export const SCOPES: Record<ScopeId, ScopeDef> = {
  iron:   { id: 'iron',   name: 'Iron Sight',        zoomLabel: 1.10, fov: 68.0, adsTime: 0.12, lensOverlay: false, sightHeight: 0.105 },
  reddot: { id: 'reddot', name: 'Red Dot Sight',     zoomLabel: 1.25, fov: 60.0, adsTime: 0.14, lensOverlay: false, sightHeight: 0.130 },
  holo:   { id: 'holo',   name: 'Holographic Sight', zoomLabel: 1.25, fov: 60.0, adsTime: 0.14, lensOverlay: false, sightHeight: 0.130 },
  x2:     { id: 'x2',     name: '2x Aimpoint',       zoomLabel: 2.00, fov: 40.0, adsTime: 0.17, lensOverlay: true,  sightHeight: 0.140 },
  x3:     { id: 'x3',     name: '3x Backlit',        zoomLabel: 3.00, fov: 28.0, adsTime: 0.20, lensOverlay: true,  sightHeight: 0.145 },
  x4:     { id: 'x4',     name: '4x ACOG',           zoomLabel: 4.00, fov: 20.0, adsTime: 0.24, lensOverlay: true,  sightHeight: 0.150 },
  x6:     { id: 'x6',     name: '6x Variable',       zoomLabel: 6.00, fov: 13.5, adsTime: 0.28, lensOverlay: true,  sightHeight: 0.155 },
};

export const SCOPE_ORDER: ScopeId[] = ['iron', 'reddot', 'holo', 'x2', 'x3', 'x4', 'x6'];
export const scopeAllowed = (w: WeaponDef, s: ScopeId) =>
  w.scopes ? w.scopes.includes(s) : SCOPE_ORDER.indexOf(s) <= SCOPE_ORDER.indexOf(w.maxScope);

/** Optik saat senjata dipilih: pilihan sekarang bila boleh, lalu bawaan senjata, lalu optik boleh yang terdekat. */
export function fitScope(w: WeaponDef, want: ScopeId): ScopeId {
  if (scopeAllowed(w, want)) return want;
  if (w.defScope && scopeAllowed(w, w.defScope)) return w.defScope;
  const ok = SCOPE_ORDER.filter(s => scopeAllowed(w, s)), wi = SCOPE_ORDER.indexOf(want);
  let best: ScopeId = ok[0] ?? 'iron';
  for (const s of ok) if (Math.abs(SCOPE_ORDER.indexOf(s) - wi) < Math.abs(SCOPE_ORDER.indexOf(best) - wi)) best = s;
  return best;
}
