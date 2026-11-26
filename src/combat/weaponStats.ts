// src/combat/weaponStats.ts — nilai efektif per senjata (field ekstensi WeaponDef; tanpa nilai = AR GDD). Murni → mudah diuji.
import { CFG } from '../config/gameConfig';
import { XCFG } from '../config/extraConfig';
import { classOf, type GunSound, type ScopeDef, type WeaponDef } from '../config/weaponsData';

const C = CFG.combat;

/** [mulai, rentang, minimum] falloff (GDD §5.3: 40 / 160 / 0.65). */
export const falloffOf = (w: WeaponDef): readonly [number, number, number] => w.falloff ?? [C.falloffStart, C.falloffSpan, C.falloffMin];
export const pelletsOf = (w: WeaponDef) => w.pellets ?? 1;
export const moveMultOf = (w: WeaponDef) => w.moveMult ?? 1;
export const equipTimeOf = (w: WeaponDef) => w.equipTime ?? C.equipTime;
export const sprintToFireOf = (w: WeaponDef) => w.sprintToFire ?? CFG.player.sprintToFire;
export const adsTimeOf = (w: WeaponDef, s: ScopeDef) => w.adsTime ?? s.adsTime;
export const crouchRecoilOf = (w: WeaponDef) => w.crouchRecoil ?? C.recoil.stance.crouch;
/** Sniper & DMR: akurasi ADS baru penuh setelah optik terbuka (quickscope butuh waktu buka scope; dokumen: anti no-scope). */
export const needsFullAds = (w: WeaponDef) => { const c = classOf(w); return c === 'SR' || c === 'DMR'; };

/** Profil suara tembakan (AR GDD: dari kaliber). */
export const soundOf = (w: WeaponDef): GunSound => w.sound ?? (w.caliber === '7.62' ? '762' : '556');

/** Radius dengar bot untuk tembakan senjata ini (GDD: 5.56 = 35, 7.62 = 50). */
export function hearRadiusOf(w: WeaponDef): number {
  if (w.hearRadius !== undefined) return w.hearRadius;
  const H = XCFG.bots.hearing;
  switch (soundOf(w)) {
    case 'suppressed': return H.suppressed;
    case 'sniper': case 'heavy': return H.shotHeavy;
    case '762': case '12ga': case 'magnum': return H.shot762;
    default: return H.shot556;
  }
}
