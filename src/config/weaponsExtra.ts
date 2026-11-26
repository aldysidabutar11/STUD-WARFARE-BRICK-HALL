// src/config/weaponsExtra.ts — senjata tambahan di luar 10 AR GDD (permintaan pengguna 2026-11-25; sumber angka: dokumen
// "Weapon Expansion Spec" pengguna, dikalibrasi terhadap sistem GDD: HP 100, hitbox, rumus falloff §5.3, recoil §7.2).
// Bukan nilai GDD → boleh disetel di sini. Perbaikan atas dokumen (disetujui pengguna):
//  - Shotgun: spreadHip/spreadAds = setengah sudut POLA pellet. Angka dokumen (3.2°/2.2° dst.) terlalu sempit: semua pellet masuk
//    badan sampai ±17–21 u sehingga Remington/SPAS one-shot jauh melebihi maksud dokumen (±10 u / 13–14 u). Pola = angka dokumen
//    × 3 (hip) / × 3.5 (ADS) → simulasi one-shot 50% (bidik dada, diam): M870 ±11 u hip / ±12.5 u ADS (tests/weaponsX.test.ts).
//  - Pisau komando = pisau yang sudah ada (XCFG.knife, angka tetap); tombol: 1 utama · 2 pistol · 3 pisau · 4 K-400 · 5 flashbang.
//  - Waktu angkat per kelas (dokumen §9): AR 0.55 (GDD), SMG 0.45, pistol 0.23–0.30, LMG 0.75; shotgun & sniper = AR.
import type { WeaponDef } from './weaponsData';
import { XCFG } from './extraConfig';

/** Senjata tambahan (34 senjata dokumen: 6 SMG, 5 shotgun, 6 sniper/DMR, 3 LMG, 5 pistol, 5 AR; + 3 senjata jarak dekat). */
export type XWeaponId =
  | 'mp5' | 'vector' | 'p90' | 'ump45' | 'mp7' | 'uzi'
  | 'm870' | 'spas12' | 'm1014' | 's12k' | 's686'
  | 'awm' | 'm200' | 'kar98k' | 'm82' | 'svd' | 'mini14'
  | 'm249' | 'dp28' | 'rpk'
  | 'deagle' | 'glock18' | 'usps' | 'm1911' | 'm9'
  | 'famas' | 'asval' | 'badger' | 'fal' | 'galil';

/** Pola pellet shotgun dari angka dokumen (hip × 3, ADS × 3.5) — lihat catatan di atas. */
const SG_HIP = 3, SG_ADS = 3.5;
/** Waktu angkat per kelas (dokumen §9). */
const EQ = { SMG: 0.45, LMG: 0.75 } as const;
/** Bawaan bersama: pemulihan recoil GDD, nada sintesis normal. */
const B = { recoveryMult: 1.0, audioPitch: 1.0 } as const;

export const X_WEAPONS: Record<XWeaponId, WeaponDef> = {
  // ── SMG: unggul ≤ 20 u, gerak cepat, sprint-ke-tembak 0.08 s, falloff tajam
  mp5: { ...B, id: 'mp5', name: 'MP5', caliber: '9mm', cls: 'SMG', modes: ['AUTO', 'BURST3', 'SINGLE'], baseDamage: 34, rpm: 780,
    reloadTime: 2.0, recoilVert: 0.80, recoilHorz: 0.22, maxScope: 'x3', magSize: 30, reserveAmmo: 150,
    spreadHip: 1.40, spreadAds: 0.25, falloff: [20, 70, 0.50], moveMult: 1.04, equipTime: EQ.SMG, sprintToFire: 0.08, sound: '9mm',
    defScope: 'reddot', role: 'SMG serbaguna · recoil jinak' },
  vector: { ...B, id: 'vector', name: 'Kriss Vector', caliber: '.45 ACP', cls: 'SMG', modes: ['AUTO', 'BURST2', 'SINGLE'], baseDamage: 26,
    rpm: 1200, reloadTime: 1.9, recoilVert: 0.65, recoilHorz: 0.25, maxScope: 'x2', audioPitch: 1.05, magSize: 25,
    reserveAmmo: 150, spreadHip: 1.50, spreadAds: 0.30, falloff: [15, 55, 0.45], moveMult: 1.05, equipTime: EQ.SMG, sprintToFire: 0.08,
    sound: '45', defScope: 'holo', role: '1200 RPM · laser jarak dekat' },
  p90: { ...B, id: 'p90', name: 'P90', caliber: '5.7mm', cls: 'SMG', modes: ['AUTO', 'SINGLE'], baseDamage: 26, rpm: 950, reloadTime: 2.8,
    recoilVert: 0.75, recoilHorz: 0.30, maxScope: 'x2', magSize: 50, reserveAmmo: 150,
    spreadHip: 1.30, spreadAds: 0.28, falloff: [18, 65, 0.50], moveMult: 1.03, equipTime: EQ.SMG, sprintToFire: 0.08, sound: '57',
    defScope: 'reddot', role: 'Magazen 50 · hipfire rapat' },
  ump45: { ...B, id: 'ump45', name: 'UMP45', caliber: '.45 ACP', cls: 'SMG', modes: ['AUTO', 'BURST2', 'SINGLE'], baseDamage: 37, rpm: 650,
    reloadTime: 2.1, recoilVert: 0.95, recoilHorz: 0.24, maxScope: 'x3', audioPitch: 0.96, magSize: 25, reserveAmmo: 125,
    spreadHip: 1.60, spreadAds: 0.20, falloff: [25, 80, 0.55], moveMult: 1.03, equipTime: EQ.SMG, sprintToFire: 0.08, sound: '45',
    defScope: 'reddot', role: 'SMG berat · tahan sampai selasar' },
  mp7: { ...B, id: 'mp7', name: 'MP7', caliber: '4.6mm', cls: 'SMG', modes: ['AUTO', 'SINGLE'], baseDamage: 29, rpm: 1000, reloadTime: 2.0,
    recoilVert: 0.85, recoilHorz: 0.28, maxScope: 'x2', audioPitch: 1.08, magSize: 30, reserveAmmo: 150,
    spreadHip: 1.20, spreadAds: 0.25, falloff: [18, 60, 0.48], moveMult: 1.06, equipTime: EQ.SMG, sprintToFire: 0.08, sound: '57',
    defScope: 'reddot', role: 'Run-and-gun · hipfire paling presisi' },
  uzi: { ...B, id: 'uzi', name: 'Micro UZI', caliber: '9mm', cls: 'SMG', modes: ['AUTO', 'SINGLE'], baseDamage: 25, rpm: 1250, reloadTime: 1.8,
    recoilVert: 1.05, recoilHorz: 0.45, maxScope: 'holo', audioPitch: 1.12, magSize: 32, reserveAmmo: 160,
    spreadHip: 1.75, spreadAds: 0.45, falloff: [12, 45, 0.40], moveMult: 1.06, equipTime: EQ.SMG, sprintToFire: 0.08, sound: '9mm',
    defScope: 'iron', role: 'TTK tempel tercepat · 144 ms' },
  // ── Shotgun: pellet per tembakan, kepala ×1.5; pompa/semi: reload per selongsong (dibatalkan dengan menembak)
  m870: { ...B, id: 'm870', name: 'Remington 870', caliber: '12 Gauge', cls: 'SG', modes: ['SINGLE'], baseDamage: 18, pellets: 8, headMult: 1.5,
    rpm: 75, reloadTime: 0.55, reload: 'shell', shellTime: 0.55, recoilVert: 4.20, recoilHorz: 0.80, maxScope: 'holo',
    magSize: 6, reserveAmmo: 30, spreadHip: 3.20 * SG_HIP, spreadAds: 2.20 * SG_ADS, falloff: [10, 24, 0.25],
    moveMult: 0.98, action: 'pump', sound: '12ga', defScope: 'iron', role: 'Pompa · one-shot ±10 u' },
  spas12: { ...B, id: 'spas12', name: 'SPAS-12', caliber: '12 Gauge', cls: 'SG', modes: ['SINGLE'], baseDamage: 19, pellets: 8, headMult: 1.5,
    rpm: 68, reloadTime: 0.55, reload: 'shell', shellTime: 0.55, recoilVert: 4.60, recoilHorz: 0.85, maxScope: 'holo', audioPitch: 0.96,
    magSize: 8, reserveAmmo: 32, spreadHip: 2.60 * SG_HIP, spreadAds: 1.80 * SG_ADS, falloff: [12, 26, 0.28],
    moveMult: 0.96, action: 'pump', sound: '12ga', defScope: 'iron', role: 'Choke sempit · one-shot 13–14 u' },
  m1014: { ...B, id: 'm1014', name: 'Benelli M4', caliber: '12 Gauge', cls: 'SG', modes: ['SINGLE'], baseDamage: 14, pellets: 8, headMult: 1.5,
    rpm: 220, reloadTime: 0.5, reload: 'shell', shellTime: 0.5, recoilVert: 3.50, recoilHorz: 0.90, maxScope: 'holo', audioPitch: 1.05,
    magSize: 7, reserveAmmo: 35, spreadHip: 3.80 * SG_HIP, spreadAds: 2.80 * SG_ADS, falloff: [9, 22, 0.22],
    moveMult: 0.97, sound: '12ga', defScope: 'iron', role: 'Semi-otomatis · 2 tembakan cepat' },
  s12k: { ...B, id: 's12k', name: 'Saiga-12', caliber: '12 Gauge', cls: 'SG', modes: ['SINGLE'], baseDamage: 13, pellets: 8, headMult: 1.5,
    rpm: 250, reloadTime: 2.4, recoilVert: 3.80, recoilHorz: 1.00, maxScope: 'x2', audioPitch: 1.02, magSize: 5, reserveAmmo: 30,
    spreadHip: 4.20 * SG_HIP, spreadAds: 3.20 * SG_ADS, falloff: [8, 20, 0.20], moveMult: 0.98, sound: '12ga', defScope: 'reddot',
    role: 'Magazen kotak · reload 2.4 s' },
  s686: { ...B, id: 's686', name: 'Double Barrel', caliber: '12 Gauge', cls: 'SG', modes: ['SINGLE'], baseDamage: 18, pellets: 9, headMult: 1.5,
    rpm: 300, reloadTime: 2.0, recoilVert: 5.00, recoilHorz: 0.95, maxScope: 'iron', audioPitch: 0.94, magSize: 2, reserveAmmo: 24,
    spreadHip: 3.40 * SG_HIP, spreadAds: 2.40 * SG_ADS, falloff: [10, 24, 0.25], moveMult: 1.02, sound: '12ga', defScope: 'iron',
    role: '2 tembakan 324 damage dalam 0.2 s' },
  // ── Sniper: ADS hampir mutlak, hipfire 6–8.5°, akurasi penuh setelah scope terbuka (adsTime); bolt = kokang tiap tembakan
  awm: { ...B, id: 'awm', name: 'AWM', caliber: '.338 Lapua', cls: 'SR', modes: ['SINGLE'], baseDamage: 115, rpm: 38, reloadTime: 3.4,
    recoilVert: 4.80, recoilHorz: 0.50, maxScope: 'x6', magSize: 5, reserveAmmo: 20,
    spreadHip: 7.50, spreadAds: 0.02, falloff: [80, 200, 0.90], moveMult: 0.88, adsTime: 0.34, action: 'bolt', sound: 'sniper',
    scopes: ['x3', 'x4', 'x6'], defScope: 'x6', role: 'One-shot badan · bolt 1.58 s' },
  m200: { ...B, id: 'm200', name: 'CheyTac M200', caliber: '.408 CheyTac', cls: 'SR', modes: ['SINGLE'], baseDamage: 105, rpm: 42, reloadTime: 3.2,
    recoilVert: 4.20, recoilHorz: 0.45, maxScope: 'x6', audioPitch: 1.05, magSize: 7, reserveAmmo: 28,
    spreadHip: 6.50, spreadAds: 0.02, falloff: [80, 200, 0.90], moveMult: 0.90, adsTime: 0.28, action: 'bolt', sound: 'sniper',
    scopes: ['x3', 'x4', 'x6'], defScope: 'x6', role: 'Quick-scope · scope 0.28 s' },
  kar98k: { ...B, id: 'kar98k', name: 'Kar98k', caliber: '7.92mm', cls: 'SR', modes: ['SINGLE'], baseDamage: 85, rpm: 50, reloadTime: 2.9,
    recoilVert: 3.60, recoilHorz: 0.40, maxScope: 'x6', audioPitch: 1.04, magSize: 5, reserveAmmo: 25,
    spreadHip: 6.00, spreadAds: 0.03, falloff: [75, 180, 0.85], moveMult: 0.95, adsTime: 0.24, action: 'bolt', sound: '762',
    scopes: ['iron', 'x3', 'x4', 'x6'], defScope: 'x6', role: 'Ringan · headshot wajib (200)' },
  m82: { ...B, id: 'm82', name: 'Barrett M82', caliber: '.50 BMG', cls: 'SR', modes: ['SINGLE'], baseDamage: 135, rpm: 75, reloadTime: 4.2,
    recoilVert: 6.50, recoilHorz: 1.50, maxScope: 'x6', audioPitch: 0.92, magSize: 5, reserveAmmo: 15,
    spreadHip: 8.50, spreadAds: 0.04, falloff: [90, 200, 0.95], moveMult: 0.80, adsTime: 0.45, sound: 'heavy',
    scopes: ['x3', 'x4', 'x6'], defScope: 'x6', role: 'Semi .50 · lengan pun 68 damage' },
  // ── DMR: semi-otomatis berdaya pukul, akurasi ADS penuh setelah optik terbuka
  svd: { ...B, id: 'svd', name: 'Dragunov SVD', caliber: '7.62mm', cls: 'DMR', modes: ['SINGLE'], baseDamage: 62, rpm: 240, reloadTime: 2.8,
    recoilVert: 2.60, recoilHorz: 0.45, maxScope: 'x6', audioPitch: 0.95, magSize: 10, reserveAmmo: 40,
    spreadHip: 4.50, spreadAds: 0.08, falloff: [60, 160, 0.80], moveMult: 0.94, adsTime: 0.24, sound: '762', defScope: 'x4',
    role: '2 badan · 1 headshot' },
  mini14: { ...B, id: 'mini14', name: 'Mini-14', caliber: '5.56mm', cls: 'DMR', modes: ['SINGLE'], baseDamage: 48, rpm: 360, reloadTime: 2.5,
    recoilVert: 1.40, recoilHorz: 0.25, maxScope: 'x6', audioPitch: 1.04, magSize: 20, reserveAmmo: 80,
    spreadHip: 3.80, spreadAds: 0.08, falloff: [65, 160, 0.80], moveMult: 0.96, adsTime: 0.22, sound: '556', defScope: 'x3',
    role: 'DMR ramah · one-tap kepala ±80 u' },
  // ── LMG: tekanan tembakan, bonus recoil jongkok ×0.60, gerak lambat, angkat 0.75 s
  m249: { ...B, id: 'm249', name: 'M249', caliber: '5.56mm', cls: 'LMG', modes: ['AUTO'], baseDamage: 40, rpm: 750, reloadTime: 5.5,
    recoilVert: 1.35, recoilHorz: 0.55, maxScope: 'x4', audioPitch: 0.97, magSize: 100, reserveAmmo: 200,
    spreadHip: 3.80, spreadAds: 0.35, falloff: [40, 160, 0.65], moveMult: 0.84, equipTime: EQ.LMG, crouchRecoil: 0.60, sound: '556',
    defScope: 'reddot', role: '100 peluru · jongkok ×0.6 recoil' },
  dp28: { ...B, id: 'dp28', name: 'DP-28', caliber: '7.62mm', cls: 'LMG', modes: ['AUTO'], baseDamage: 49, rpm: 540, reloadTime: 4.4,
    recoilVert: 1.30, recoilHorz: 0.32, maxScope: 'x4', audioPitch: 0.9, magSize: 47, reserveAmmo: 141,
    spreadHip: 3.40, spreadAds: 0.25, falloff: [45, 160, 0.70], moveMult: 0.88, equipTime: EQ.LMG, crouchRecoil: 0.60, sound: '762',
    defScope: 'reddot', role: 'Magazen piringan · paling stabil' },
  rpk: { ...B, id: 'rpk', name: 'RPK', caliber: '7.62mm', cls: 'LMG', modes: ['AUTO', 'SINGLE'], baseDamage: 47, rpm: 600, reloadTime: 3.6,
    recoilVert: 1.65, recoilHorz: 0.48, maxScope: 'x4', audioPitch: 0.94, magSize: 45, reserveAmmo: 135,
    spreadHip: 3.00, spreadAds: 0.22, falloff: [45, 160, 0.68], moveMult: 0.92, equipTime: EQ.LMG, crouchRecoil: 0.60, sound: '762',
    defScope: 'reddot', role: 'AKM + 15 peluru · reload 3.6 s' },
  // ── Pistol (slot 2): cabut cepat, gerak lebih cepat, iron / red dot
  deagle: { ...B, id: 'deagle', name: 'Desert Eagle', caliber: '.50 AE', cls: 'PISTOL', modes: ['SINGLE'], baseDamage: 56, rpm: 240,
    reloadTime: 2.0, recoilVert: 3.40, recoilHorz: 0.65, maxScope: 'reddot', magSize: 7, reserveAmmo: 35,
    spreadHip: 2.40, spreadAds: 0.20, falloff: [25, 80, 0.55], moveMult: 1.04, equipTime: 0.30, action: 'slide', sound: 'magnum',
    scopes: ['iron', 'reddot'], defScope: 'iron', role: '1 headshot / 2 badan' },
  glock18: { ...B, id: 'glock18', name: 'Glock 18C', caliber: '9mm', cls: 'PISTOL', modes: ['AUTO', 'BURST3'], baseDamage: 22, rpm: 1000,
    reloadTime: 1.7, recoilVert: 1.15, recoilHorz: 0.45, maxScope: 'reddot', audioPitch: 1.1, magSize: 18, reserveAmmo: 72,
    spreadHip: 2.80, spreadAds: 0.65, falloff: [14, 45, 0.45], moveMult: 1.06, equipTime: 0.24, action: 'slide', sound: '9mm',
    scopes: ['iron', 'reddot'], defScope: 'iron', role: 'Otomatis · SMG saku' },
  usps: { ...B, id: 'usps', name: 'USP-S', caliber: '.45 ACP', cls: 'PISTOL', modes: ['SINGLE'], baseDamage: 36, rpm: 360, reloadTime: 1.6,
    recoilVert: 0.95, recoilHorz: 0.18, maxScope: 'reddot', magSize: 12, reserveAmmo: 48,
    spreadHip: 1.40, spreadAds: 0.15, falloff: [22, 70, 0.55], moveMult: 1.06, equipTime: 0.24, action: 'slide', suppressed: true,
    sound: 'suppressed', scopes: ['iron', 'reddot'], defScope: 'iron', role: 'Peredam · tak terlihat di radar' },
  m1911: { ...B, id: 'm1911', name: 'M1911', caliber: '.45 ACP', cls: 'PISTOL', modes: ['SINGLE'], baseDamage: 42, rpm: 320, reloadTime: 1.7,
    recoilVert: 1.50, recoilHorz: 0.28, maxScope: 'reddot', audioPitch: 0.97, magSize: 8, reserveAmmo: 40,
    spreadHip: 1.80, spreadAds: 0.20, falloff: [20, 65, 0.55], moveMult: 1.05, equipTime: 0.25, action: 'slide', sound: '45',
    scopes: ['iron', 'reddot'], defScope: 'iron', role: 'Stopping power · 3 badan' },
  m9: { ...B, id: 'm9', name: 'Beretta M9', caliber: '9mm', cls: 'PISTOL', modes: ['SINGLE'], baseDamage: 30, rpm: 420, reloadTime: 1.6,
    recoilVert: 1.05, recoilHorz: 0.22, maxScope: 'reddot', audioPitch: 1.06, magSize: 15, reserveAmmo: 60,
    spreadHip: 1.60, spreadAds: 0.20, falloff: [20, 65, 0.50], moveMult: 1.06, equipTime: 0.23, action: 'slide', sound: '9mm',
    scopes: ['iron', 'reddot'], defScope: 'iron', role: 'Pemaaf · 15 peluru · cabut 0.23 s' },
  // ── AR tambahan: high-RPM, peredam bawaan, battle rifle, magazen ekstra
  famas: { ...B, id: 'famas', name: 'FAMAS', caliber: '5.56mm', cls: 'AR', modes: ['AUTO', 'BURST3', 'SINGLE'], baseDamage: 35, rpm: 800,
    reloadTime: 2.7, recoilVert: 1.45, recoilHorz: 0.48, maxScope: 'x4', audioPitch: 1.08, magSize: 25, reserveAmmo: 125,
    spreadHip: 2.00, spreadAds: 0.18, falloff: [32, 130, 0.60], moveMult: 1.01, sound: '556', defScope: 'reddot',
    role: 'Bullpup cepat · TTK 150 ms' },
  asval: { ...B, id: 'asval', name: 'AS VAL', caliber: '9x39mm', cls: 'AR', modes: ['AUTO', 'SINGLE'], baseDamage: 42, rpm: 800, reloadTime: 2.4,
    recoilVert: 1.40, recoilHorz: 0.42, maxScope: 'x4', magSize: 20, reserveAmmo: 100,
    spreadHip: 1.80, spreadAds: 0.18, falloff: [28, 110, 0.55], moveMult: 1.02, suppressed: true, hearRadius: 15, sound: 'suppressed',
    defScope: 'reddot', role: 'Peredam bawaan · penyusup' },
  badger: { ...B, id: 'badger', name: 'Honey Badger', caliber: '.300 BLK', cls: 'AR', modes: ['AUTO', 'SINGLE'], baseDamage: 40, rpm: 740,
    reloadTime: 2.2, recoilVert: 1.25, recoilHorz: 0.38, maxScope: 'x3', audioPitch: 1.04, magSize: 30, reserveAmmo: 120,
    spreadHip: 1.75, spreadAds: 0.18, falloff: [30, 120, 0.60], moveMult: 1.03, suppressed: true, hearRadius: 16, sound: 'suppressed',
    defScope: 'holo', role: 'Peredam · flanker senyap' },
  fal: { ...B, id: 'fal', name: 'FN FAL', caliber: '7.62x51mm', cls: 'AR', modes: ['SINGLE', 'AUTO'], baseDamage: 52, rpm: 400, reloadTime: 2.9,
    recoilVert: 2.40, recoilHorz: 0.65, maxScope: 'x6', audioPitch: 0.9, magSize: 20, reserveAmmo: 80,
    spreadHip: 3.00, spreadAds: 0.12, falloff: [50, 180, 0.75], moveMult: 0.95, sound: '762', defScope: 'x3',
    role: 'Battle rifle · 2 badan' },
  galil: { ...B, id: 'galil', name: 'Galil ACE', caliber: '7.62mm', cls: 'AR', modes: ['AUTO', 'SINGLE'], baseDamage: 45, rpm: 650, reloadTime: 2.8,
    recoilVert: 1.55, recoilHorz: 0.44, maxScope: 'x6', audioPitch: 0.95, magSize: 35, reserveAmmo: 140,
    spreadHip: 2.20, spreadAds: 0.16, falloff: [40, 160, 0.65], moveMult: 0.98, sound: '762', defScope: 'reddot',
    role: 'M416 × AKM · 35 peluru' },
};

/** Urutan tampil per kelas di Loadout (AR GDD = WEAPON_ORDER, AR tambahan menyusul di tab yang sama). */
export const X_ORDER: readonly XWeaponId[] = [
  'famas', 'asval', 'badger', 'fal', 'galil',
  'mp5', 'vector', 'p90', 'ump45', 'mp7', 'uzi',
  'm870', 'spas12', 'm1014', 's12k', 's686',
  'awm', 'm200', 'kar98k', 'm82', 'svd', 'mini14',
  'm249', 'dp28', 'rpk',
  'deagle', 'glock18', 'usps', 'm1911', 'm9',
];

// ── senjata jarak dekat (slot 3): serangan ringan (klik kiri) & berat (klik kanan); "dari belakang" = aturan XCFG.melee
export type MeleeId = 'knife' | 'karambit' | 'kukri' | 'tomahawk';
export interface MeleeAttack { damage: number; backDamage: number; hitDelay: number; duration: number }
export interface MeleeDef {
  id: MeleeId; name: string; light: MeleeAttack; heavy: MeleeAttack;
  /** Jangkauan sinar (u), pengali lari, waktu angkat (s). */
  reach: number; moveMult: number; equipTime: number; role: string;
}
const K = XCFG.knife;
/** Titik kena = 23% durasi serangan (setara pisau: tebas 0.10/0.45, tusuk 0.24/1.0). */
const hit = (d: number) => Math.round(d * 0.23 * 100) / 100;
const atk = (damage: number, duration: number, backMult: number): MeleeAttack =>
  ({ damage, backDamage: Math.round(damage * backMult), hitDelay: hit(duration), duration });

export const MELEES: Record<MeleeId, MeleeDef> = {
  // pisau komando = pisau lama (angka XCFG.knife yang sudah disetujui; dokumen: 45/75, belakang 150 — tidak dipakai)
  knife: { id: 'knife', name: 'Pisau Komando', light: { ...K.slash }, heavy: { ...K.stab }, reach: XCFG.melee.range,
    moveMult: K.speedMult, equipTime: K.equipTime, role: 'Seimbang · tusuk belakang = mati' },
  karambit: { id: 'karambit', name: 'Karambit', light: atk(38, 0.32, 2.0), heavy: atk(65, 0.62, 2.0), reach: 2.9, moveMult: 1.12,
    equipTime: 0.20, role: 'Lari tercepat · cabut 0.20 s' },
  kukri: { id: 'kukri', name: 'Kukri', light: atk(55, 0.55, 1.8), heavy: atk(90, 0.90, 1.8), reach: 3.8, moveMult: 1.07,
    equipTime: 0.28, role: 'Jangkauan terpanjang · 2 tebas = mati' },
  tomahawk: { id: 'tomahawk', name: 'Tomahawk', light: atk(60, 0.65, 1.5), heavy: atk(105, 1.05, 1.5), reach: 3.5, moveMult: 1.05,
    equipTime: 0.32, role: 'Ayunan berat = mati dari depan' },
};
export const MELEE_ORDER: readonly MeleeId[] = ['knife', 'karambit', 'kukri', 'tomahawk'];
export const isMeleeId = (v: unknown): v is MeleeId => typeof v === 'string' && Object.prototype.hasOwnProperty.call(MELEES, v);
