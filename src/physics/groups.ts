// physics/groups.ts — collision group bit-mask Rapier (GDD §10.1)
export const G = {
  STATIC: 0x0001, PROP: 0x0002, CHAR: 0x0004, GRENADE: 0x0008, DEBRIS: 0x0010, BARRIER: 0x0020,
  Q_BULLET: 0x0100, Q_LOS: 0x0200, Q_CAMERA: 0x0400
} as const;
const grp = (m: number, f: number) => ((m << 16) | f) >>> 0; // jangan pakai bit >= 0x8000

export const GROUPS = {
  STATIC: grp(G.STATIC, 0xffff),
  PROP: grp(G.PROP, G.STATIC | G.PROP | G.GRENADE | G.DEBRIS | G.Q_BULLET | G.BARRIER),
  CHAR: grp(G.CHAR, G.STATIC | G.CHAR | G.GRENADE | G.BARRIER),
  GRENADE: grp(G.GRENADE, G.STATIC | G.PROP | G.CHAR | G.BARRIER),
  DEBRIS: grp(G.DEBRIS, G.STATIC | G.PROP | G.DEBRIS | G.BARRIER),
  /** Dinding tak terlihat (mis. di atas pagar teras): menahan gerak karakter, granat, benda lepas — peluru & garis pandang tembus. */
  BARRIER: grp(G.BARRIER, G.CHAR | G.GRENADE | G.PROP | G.DEBRIS),
};

export const QUERY = {
  MOVE: grp(G.CHAR, G.STATIC | G.CHAR | G.BARRIER),
  BULLET_STATIC: grp(G.Q_BULLET, G.STATIC),
  BULLET_PROP: grp(G.Q_BULLET, G.PROP),
  LOS: grp(G.Q_LOS, G.STATIC),
  CAMERA: grp(G.Q_CAMERA, G.STATIC),
};
