// src/entities/skins/index.ts — registri karakter operator (10 desain pengguna Karakter/<NAMA>.png, permintaan 2026-11-27).
// Per karakter: 1 atlas 1024² + topeng menyala 512² (dibuat saat pertama dipakai, ±50 ms) dipakai bersama kedua tim; per (karakter,
// tim) hanya geometri lengan yang berbeda (ban lengan warna tim, keputusan pengguna). 7 draw call per karakter (sama dengan klasik).
import * as THREE from 'three';
import { XCFG } from '../../config/extraConfig';
import { makeRng } from '../../core/Rng';
import type { Team } from '../BlockyCharacter';
import type { CharArt } from '../CharacterArt';
import { Atlas, commonSwatches, css, edge, fill, grain, type Rect } from '../charKit';
import type { SkinId } from '../variants';
import { gray, type SkinBuild, type SkinDef, type SkinFps } from './kit';
import { PHARAOH } from './pharaoh';
import { FROST } from './frost';
import { IGNIS } from './ignis';
import { GHOST09 } from './ghost09';
import { NOVA } from './nova';
import { SPECTRE } from './spectre';
import { TITAN } from './titan';
import { VALKYRIE } from './valkyrie';
import { VALIANT } from './valiant';
import { REAPER } from './reaper';

const DEFS: Record<SkinId, SkinDef> = {
  pharaoh: PHARAOH, frost: FROST, ignis: IGNIS, ghost09: GHOST09, nova: NOVA, spectre: SPECTRE, titan: TITAN, valkyrie: VALKYRIE,
  valiant: VALIANT, reaper: REAPER,
};

interface SkinAtlas { texture: THREE.CanvasTexture; glow: THREE.CanvasTexture; build: SkinBuild; bands: Record<Team, Rect>; debrisMat: THREE.MeshLambertMaterial }
const ATLASES = new Map<SkinId, SkinAtlas>();
const ARTS = new Map<string, CharArt>();

/** Ban lengan warna tim: dasar warna tim, garis tengah terang, tepi gelap; sedikit menyala (XCFG.skins). */
function bandRegion(A: Atlas, c: number): Rect {
  const K = XCFG.skins;
  return A.pxGlow(96, 20, (g, w, h, rng) => {
    fill(g, w, h, css(c)); grain(g, w, h, rng, 0.05);
    g.fillStyle = 'rgba(255,255,255,0.5)'; g.fillRect(0, h * 0.4, w, h * 0.2);
    g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(0, 0, w, 2); g.fillRect(0, h - 2, w, 2);
    edge(g, w, h, 0.35, 1);
  }, (g, w, h) => {
    g.fillStyle = gray(K.bandGlow); g.fillRect(0, 2, w, h - 4);
    g.fillStyle = gray(K.bandStripeGlow); g.fillRect(0, h * 0.4, w, h * 0.2);
  });
}

function canvasTex(c: HTMLCanvasElement, color: boolean): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
  t.anisotropy = 4;
  return t;
}

function skinAtlas(id: SkinId): SkinAtlas {
  let s = ATLASES.get(id);
  if (s) return s;
  const def = DEFS[id], A = new Atlas(makeRng(def.seed)), cm = commonSwatches(A);
  const bands = { blue: bandRegion(A, XCFG.skins.band.blue), red: bandRegion(A, XCFG.skins.band.red) };
  const build = def.build(A, cm);
  const texture = canvasTex(A.canvas, true);
  s = { texture, glow: canvasTex(A.glowCanvas!, false), build, bands,
    debrisMat: new THREE.MeshLambertMaterial({ map: texture, alphaTest: 0.5 }) };
  ATLASES.set(id, s);
  return s;
}

/** Tampilan karakter operator untuk tim tertentu (atlas & bagian tubuh bersama; lengan dengan ban lengan warna tim). */
export function skinArt(id: SkinId, team: Team): CharArt {
  const key = id + team;
  let art = ARTS.get(key);
  if (art) return art;
  const s = skinAtlas(id), b = s.build;
  art = {
    texture: s.texture, glow: s.glow, debrisMat: s.debrisMat, chip: b.chip,
    parts: { head: b.head, upper: b.upper, lower: b.lower, legR: b.legR, legL: b.legL, armR: b.arm(1, s.bands[team]), armL: b.arm(-1, s.bands[team]) },
  };
  ARTS.set(key, art);
  return art;
}

/** Warna lengan FPS karakter operator. */
export const skinFps = (id: SkinId): SkinFps => DEFS[id].fps;
