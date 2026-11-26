// src/world/maps/boston/index.ts — MapDef Boston: kantor 2 lantai asimetris (Biru spawn di L4, Merah di L3), adaptasi dokumen
// "Blueprint Map Boston" buatan pengguna. Data denah & nav (layout.ts, nav.ts), collider (colliders.ts), visual (build.ts),
// panel kaca destruktibel (runtime world/Breakables.ts lewat `breakables`).
import type { MapDef } from '../types';
import {
  BOS_BOUNDS, BOS_BOXES, BOS_ENV_PROBE, BOS_GLASS, BOS_MENU_CAM, BOS_PRACTICE, BOS_PROP_ITEMS, BOS_SPAWNS, BOS_STAIRS, bosSurfaceAt, bosZoneName,
} from './layout';
import { BOS_DROP_SPEC, BOS_LANES, BOS_NAV } from './nav';
import { BOS_ATMOSPHERE, buildBoston } from './build';

export const BOSTON: MapDef = {
  id: 'boston',
  name: 'Boston',
  desc: 'Kantor 2 lantai: Garden Lounge di bawah, Veranda terbuka di atas, tangga L & tangga servis, kaca yang bisa dipecahkan.',
  bounds: BOS_BOUNDS,
  boxes: BOS_BOXES,
  stairs: BOS_STAIRS,
  spawnSlots: BOS_SPAWNS,
  nav: BOS_NAV,
  lanes: BOS_LANES,
  surfaceAt: bosSurfaceAt,
  contactSurface: true,          // permukaan per benda (kaca, logam, kayu, kain) → pantulan granat dicari di titik kontak
  zoneName: bosZoneName,
  practice: BOS_PRACTICE,
  menuCam: BOS_MENU_CAM,
  envProbe: BOS_ENV_PROBE,
  atmosphere: BOS_ATMOSPHERE,
  breakables: BOS_GLASS,
  radarFloors: [0, 10],
  props: { bookPiles: [], items: BOS_PROP_ITEMS },
  dropSpec: (id) => id === 'DROP_CABINET_E' ? BOS_DROP_SPEC : undefined,
  build: buildBoston,
};
