// src/world/maps/meridian/index.ts — MapDef Meridian Vault: bank sentral 2 tingkat asimetris diagonal (Merah/penyerang babak 1 di
// Barat Laut, Biru/bertahan di Tenggara), map mode Bomb Mission (zona A = ruang brankas, B = atrium). Adaptasi dokumen "Blueprint
// Map Meridian Vault & Mode Bomb Mission" buatan pengguna. Data denah & nav (layout.ts, nav.ts), collider (colliders.ts),
// visual (build.ts, emit.ts, visual.ts).
import type { MapDef } from '../types';
import {
  MV_BOUNDS, MV_BOXES, MV_ENV_PROBE, MV_MENU_CAM, MV_PRACTICE, MV_PROP_ITEMS, MV_SITES, MV_SPAWN_YAW, MV_SPAWNS, MV_STAIRS, mvSurfaceAt,
  mvZoneName,
} from './layout';
import { MV_LANES, MV_NAV } from './nav';
import { MV_ATMOSPHERE, buildMeridian } from './build';

export const MERIDIAN: MapDef = {
  id: 'meridian',
  name: 'Meridian Vault',
  desc: 'Bank sentral 2 tingkat: West Long marmer, Mid bertingkat, ruang brankas (zona A) & atrium balkon U (zona B) — map Bomb Mission.',
  bounds: MV_BOUNDS,
  boxes: MV_BOXES,
  stairs: MV_STAIRS,
  spawnSlots: MV_SPAWNS,
  spawnYaw: MV_SPAWN_YAW,
  nav: MV_NAV,
  lanes: MV_LANES,
  surfaceAt: mvSurfaceAt,
  contactSurface: true,
  zoneName: mvZoneName,
  practice: MV_PRACTICE,
  menuCam: MV_MENU_CAM,
  envProbe: MV_ENV_PROBE,
  atmosphere: MV_ATMOSPHERE,
  props: { bookPiles: [], items: MV_PROP_ITEMS },
  bombSites: MV_SITES,
  floors: 2,
  build: buildMeridian,
};
