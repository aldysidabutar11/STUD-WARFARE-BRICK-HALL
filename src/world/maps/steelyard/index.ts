// src/world/maps/steelyard/index.ts — MapDef Steel Yard (milik F1): merakit data denah & nav (layout.ts + nav.ts, C1) dengan
// builder visual (build.ts, C2). Halaman kontainer gurun terbengkalai — satu lantai, luar ruang, pagar terpal keliling.
import type { MapDef } from '../types';
import { SY, SY_BOXES, SY_ENV_PROBE, SY_MENU_CAM, SY_PRACTICE, SY_SPAWNS, syZoneName, sySurfaceAt } from './layout';
import { SY_LANES, SY_NAV } from './nav';
import { SY_ATMOSPHERE, buildSteelYard } from './build';

export const STEELYARD: MapDef = {
  id: 'steelyard',
  name: 'Steel Yard',
  desc: 'Halaman kontainer di gurun: lorong baja, tumpukan kontainer, bangkai mobil & pagar terpal di bawah matahari sore.',
  bounds: SY.bounds,
  boxes: SY_BOXES,
  stairs: [],
  spawnSlots: SY_SPAWNS,
  nav: SY_NAV,
  lanes: SY_LANES,
  surfaceAt: sySurfaceAt,
  contactSurface: true,          // permukaan per benda (kontainer/prop) → pantulan granat dicari di titik kontak
  zoneName: syZoneName,
  practice: SY_PRACTICE,
  menuCam: SY_MENU_CAM,
  envProbe: SY_ENV_PROBE,
  atmosphere: SY_ATMOSPHERE,
  build: buildSteelYard,
};
