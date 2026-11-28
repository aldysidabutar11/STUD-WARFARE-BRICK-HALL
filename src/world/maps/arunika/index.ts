// src/world/maps/arunika/index.ts — MapDef Candi Arunika: kompleks candi di hutan tropis saat matahari terbit, map Bomb Mission ke-2
// (zona A = teras stupa, B = pendopo taman air). Desain bebas Claude atas permintaan pengguna 2026-11-28 ("sekreatif mungkin");
// layout orisinal. Data denah & nav (layout.ts, nav.ts), collider (colliders.ts), visual (build.ts, visual/*).
import type { MapDef } from '../types';
import {
  AR_BOUNDS, AR_BOXES, AR_ENV_PROBE, AR_MENU_CAM, AR_PRACTICE, AR_SITES, AR_SPAWN_YAW, AR_SPAWNS, AR_STAIRS, arSurfaceAt, arZoneName,
} from './layout';
import { AR_LANES, AR_NAV } from './nav';
import { AR_ATMOSPHERE, buildArunika } from './build';

export const ARUNIKA: MapDef = {
  id: 'arunika',
  name: 'Candi Arunika',
  desc: 'Kompleks candi di hutan saat fajar: teras stupa (zona A), pendopo taman air (zona B), pasar desa, gua air terjun — map Bomb Mission.',
  bounds: AR_BOUNDS,
  boxes: AR_BOXES,
  stairs: AR_STAIRS,
  spawnSlots: AR_SPAWNS,
  spawnYaw: AR_SPAWN_YAW,
  nav: AR_NAV,
  lanes: AR_LANES,
  surfaceAt: arSurfaceAt,
  contactSurface: true,
  zoneName: arZoneName,
  practice: AR_PRACTICE,
  menuCam: AR_MENU_CAM,
  envProbe: AR_ENV_PROBE,
  atmosphere: AR_ATMOSPHERE,
  bombSites: AR_SITES,
  floors: 1,
  build: buildArunika,
};
