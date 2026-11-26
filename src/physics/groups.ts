// physics/groups.ts — collision group bit-mask Rapier (GDD §10.1)
// Menyimpang dari §10.1 (disetujui pengguna 2026-11-27): kapsul karakter dipecah per tim (bit CHAR_BLUE / CHAR_RED) agar rekan
// setim saling TEMBUS dan hanya karakter tim LAWAN yang saling menahan. Alasan: online, kapsul rekan yang berdesakan keluar spawn
// membuat prediksi klien berbeda dari host (klien melihat rekan ±0.1 s di masa lalu) → koreksi posisi berulang ("cepat-pelan").
const CHAR_BLUE = 0x0004, CHAR_RED = 0x0040;
export const G = {
  STATIC: 0x0001, PROP: 0x0002, GRENADE: 0x0008, DEBRIS: 0x0010, BARRIER: 0x0020,
  /** Kapsul gerak tim Biru / Merah (keanggotaan). */
  CHAR_BLUE, CHAR_RED,
  /** Semua kapsul karakter (dua tim) — dipakai di filter: granat & pagar BARRIER tetap mengenai kedua tim. */
  CHAR: CHAR_BLUE | CHAR_RED,
  Q_BULLET: 0x0100, Q_LOS: 0x0200, Q_CAMERA: 0x0400
} as const;
const grp = (m: number, f: number) => ((m << 16) | f) >>> 0; // jangan pakai bit >= 0x8000

export const GROUPS = {
  STATIC: grp(G.STATIC, 0xffff),
  PROP: grp(G.PROP, G.STATIC | G.PROP | G.GRENADE | G.DEBRIS | G.Q_BULLET | G.BARRIER),
  GRENADE: grp(G.GRENADE, G.STATIC | G.PROP | G.CHAR | G.BARRIER),
  DEBRIS: grp(G.DEBRIS, G.STATIC | G.PROP | G.DEBRIS | G.BARRIER),
  /** Dinding tak terlihat (mis. di atas pagar teras): menahan gerak karakter, granat, benda lepas — peluru & garis pandang tembus. */
  BARRIER: grp(G.BARRIER, G.CHAR | G.GRENADE | G.PROP | G.DEBRIS),
};

export const QUERY = {
  BULLET_STATIC: grp(G.Q_BULLET, G.STATIC),
  BULLET_PROP: grp(G.Q_BULLET, G.PROP),
  LOS: grp(G.Q_LOS, G.STATIC),
  CAMERA: grp(G.Q_CAMERA, G.STATIC),
};

type TeamId = 'blue' | 'red';
const own = (t: TeamId) => (t === 'blue' ? G.CHAR_BLUE : G.CHAR_RED);
const foe = (t: TeamId) => (t === 'blue' ? G.CHAR_RED : G.CHAR_BLUE);
/** Grup collider kapsul gerak per tim: STATIC, karakter tim LAWAN, granat, pagar BARRIER (rekan setim tidak). */
export const charGroups = (t: TeamId) => grp(own(t), G.STATIC | foe(t) | G.GRENADE | G.BARRIER);
/** Query KCC `computeColliderMovement` per tim: STATIC, pagar BARRIER, karakter tim LAWAN (rekan setim ditembus). */
export const moveQuery = (t: TeamId) => grp(own(t), G.STATIC | foe(t) | G.BARRIER);
