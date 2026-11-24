// src/ui/Settings.ts — pengaturan tersimpan (GDD §13.2): localStorage 'studwarfare.settings.v1', divalidasi ke rentang.
// Tambahan pasca-MVP: aturan match, rebind tombol, gamepad, crosshair kustom, kecerahan, skala resolusi, opsi HUD.
import { CFG, type PresetName } from '../config/gameConfig';
import { XCFG, type Difficulty } from '../config/extraConfig';
import type { ScopeId, WeaponId } from '../config/weaponsData';
import { WEAPONS, SCOPE_ORDER, scopeAllowed } from '../config/weaponsData';
import { BINDS_VERSION, DEFAULT_BINDS, migrateBinds, validateBinds, type Binds } from '../core/Bindings';
import { XH_MODES, XH_SHAPES, type XhMode, type XhShape } from './Crosshair';
import { cleanName, isMapChoice, type MapChoice } from '../game/Lobby';
export { XH_COLORS } from './Crosshair';

export type MatchMode = 'tdm' | 'elim';
export const RENDER_SCALES = [0, 1, 0.85, 0.7, 0.5] as const;   // 0 = otomatis (resolusi dinamis §2.3)
export const FPS_CAPS = [1, 2, 3] as const;                       // batas FPS = refresh layar ÷ n (selalu rata)
export const SCORE_LIMITS = [25, 50, 75, 100] as const;
export const TIME_LIMITS = [5, 10, 15, 20] as const;             // menit
export const ROUNDS_TO_WIN = [3, 4, 5, 7] as const;

export interface Settings {
  sens: number; adsMult: number; fov: number; invertY: boolean;
  adsToggle: boolean; crouchToggle: boolean;
  preset: PresetName;
  volMaster: number; volSfx: number; volUi: number;
  showFps: boolean; difficulty: Difficulty; allies: number; enemies: number;
  fullPause: boolean;
  weapon: WeaponId; scope: ScopeId;
  /** Tampilan karakter pemain: 'm' pria / 'f' wanita (desain karakter pengguna). */
  charVariant: 'm' | 'f';
  /** Nama pemain di room/lobby (lihat game/Lobby.cleanName); '' = belum diisi. */
  playerName: string;
  // aturan match
  mode: MatchMode; scoreLimit: number; timeLimit: number; roundsToWin: number;
  /** Map pilihan main solo / Latihan & bawaan room baru: 'brickhall' | 'steelyard' | 'random' (Acak: diundi tiap match). */
  map: MapChoice;
  // kontrol
  binds: Binds; padSens: number;
  /** Versi skema tombol (migrasi otomatis setelan lama, lihat Bindings.migrateBinds). */
  bindsVer: number;
  // crosshair (default = spesifikasi GDD §13: 4 garis 8×2 px putih, outline 1 px, gap dinamis) — lihat ui/Crosshair.ts
  xhShape: XhShape; xhMode: XhMode; xhColor: string; xhAlpha: number;
  xhLen: number; xhThick: number; xhGap: number; xhDotSize: number; xhDotAlpha: number; xhCircleR: number; xhCircleThick: number;
  xhOutline: boolean; xhOutlineThick: number; xhOutlineAlpha: number; xhDynMult: number;
  // tampilan & HUD
  brightness: number; shake: number; renderScale: number;
  /** Batas FPS: 1 = ikut layar, 2 = ½ refresh, 3 = ⅓ refresh (lihat XCFG.pacing). */
  fpsCap: 1 | 2 | 3;
  // efek grafik (berlaku bila preset mendukung — lihat XCFG.gfx.profiles)
  gfxBloom: boolean; gfxSsao: boolean; gfxReflect: boolean; gfxFog: boolean; gfxDust: boolean;
  minimap: boolean; nameplates: boolean; killcam: boolean; dmgNumbers: boolean;
}

export const KEY = 'studwarfare.settings.v1';
export const DEFAULTS: Settings = {
  sens: 1.0, adsMult: 1.0, fov: 75, invertY: false, adsToggle: false, crouchToggle: true, preset: 'MEDIUM',
  volMaster: 80, volSfx: 100, volUi: 70, showFps: false, difficulty: 'normal', allies: 4, enemies: 5, fullPause: false,
  weapon: 'm416', scope: 'reddot', charVariant: 'm', playerName: '',
  mode: 'tdm', scoreLimit: CFG.match.scoreLimit, timeLimit: CFG.match.timeLimit / 60, roundsToWin: XCFG.elim.roundsToWin,
  map: 'brickhall',
  binds: { ...DEFAULT_BINDS }, padSens: 1.0, bindsVer: BINDS_VERSION,
  xhShape: 'cross', xhMode: 'dynamic', xhColor: '#ffffff', xhAlpha: 1, xhLen: XCFG.hud.crosshairLen, xhThick: XCFG.hud.crosshairWidth,
  xhGap: 0, xhDotSize: XCFG.hud.crosshairWidth, xhDotAlpha: 1, xhCircleR: 10, xhCircleThick: 2,
  xhOutline: true, xhOutlineThick: 1, xhOutlineAlpha: 0.75, xhDynMult: 1,
  brightness: 1.0, shake: 100, renderScale: 0, fpsCap: 1,
  gfxBloom: true, gfxSsao: true, gfxReflect: true, gfxFog: true, gfxDust: true,
  minimap: true, nameplates: true, killcam: true, dmgNumbers: false,
};

const clamp = (v: unknown, a: number, b: number, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(b, Math.max(a, v)) : d);
const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);
const oneOf = <T extends string>(v: unknown, list: readonly T[], d: T): T => (list.includes(v as T) ? (v as T) : d);
const pick = <T extends number>(v: unknown, list: readonly T[], d: T): T => (list.includes(v as T) ? (v as T) : d);

export function validate(raw: Partial<Settings> | null): Settings {
  const r = raw ?? {};
  const legacy = r as Record<string, unknown>;
  const D = DEFAULTS;
  const weapon = oneOf(r.weapon, Object.keys(WEAPONS) as WeaponId[], D.weapon);
  let scope = oneOf(r.scope, SCOPE_ORDER, D.scope);
  if (!scopeAllowed(WEAPONS[weapon], scope)) scope = 'reddot';
  return {
    sens: clamp(r.sens, 0.1, 5.0, D.sens), adsMult: clamp(r.adsMult, 0.5, 1.5, D.adsMult), fov: clamp(r.fov, 70, 90, D.fov),
    invertY: bool(r.invertY, D.invertY), adsToggle: bool(r.adsToggle, D.adsToggle), crouchToggle: bool(r.crouchToggle, D.crouchToggle),
    preset: oneOf(r.preset, ['LOW', 'MEDIUM', 'HIGH', 'ULTRA'] as const, D.preset),
    gfxBloom: bool(r.gfxBloom, D.gfxBloom), gfxSsao: bool(r.gfxSsao, D.gfxSsao), gfxReflect: bool(r.gfxReflect, D.gfxReflect),
    gfxFog: bool(r.gfxFog, D.gfxFog), gfxDust: bool(r.gfxDust, D.gfxDust),
    volMaster: clamp(r.volMaster, 0, 100, D.volMaster), volSfx: clamp(r.volSfx, 0, 100, D.volSfx), volUi: clamp(r.volUi, 0, 100, D.volUi),
    showFps: bool(r.showFps, D.showFps), difficulty: oneOf(r.difficulty, ['easy', 'normal', 'hard'] as const, D.difficulty),
    allies: Math.round(clamp(r.allies, 0, 4, D.allies)), enemies: Math.round(clamp(r.enemies, 1, 5, D.enemies)),
    fullPause: bool(r.fullPause, D.fullPause), weapon, scope, charVariant: oneOf(r.charVariant, ['m', 'f'] as const, D.charVariant),
    playerName: typeof r.playerName === 'string' ? cleanName(r.playerName) : D.playerName,
    mode: oneOf(r.mode, ['tdm', 'elim'] as const, D.mode),
    scoreLimit: pick(r.scoreLimit, SCORE_LIMITS, D.scoreLimit as 50), timeLimit: pick(r.timeLimit, TIME_LIMITS, D.timeLimit as 10),
    roundsToWin: pick(r.roundsToWin, ROUNDS_TO_WIN, D.roundsToWin as 5),
    map: isMapChoice(r.map) ? r.map : D.map,
    binds: validateBinds(migrateBinds(r.binds, typeof r.bindsVer === 'number' ? r.bindsVer : 1)), bindsVer: BINDS_VERSION,
    padSens: clamp(r.padSens, 0.3, 3, D.padSens),
    // crosshair; setelan lama (xhDot / xhLen 0 / xhDynamic) dimigrasi ke bentuk & perilaku
    xhShape: oneOf(r.xhShape, XH_SHAPES.map(x => x[0]), legacy.xhLen === 0 ? 'dot' : legacy.xhDot === true ? 'crossdot' : D.xhShape),
    xhMode: oneOf(r.xhMode, XH_MODES.map(x => x[0]), legacy.xhDynamic === false ? 'static' : D.xhMode),
    xhColor: typeof r.xhColor === 'string' && /^#[0-9a-f]{6}$/i.test(r.xhColor) ? r.xhColor.toLowerCase() : D.xhColor,
    xhAlpha: clamp(r.xhAlpha, 0.2, 1, D.xhAlpha),
    xhLen: legacy.xhLen === 0 ? D.xhLen : Math.round(clamp(r.xhLen, 1, 20, D.xhLen)), xhThick: Math.round(clamp(r.xhThick, 1, 6, D.xhThick)),
    xhGap: Math.round(clamp(r.xhGap, -3, 15, D.xhGap)),
    xhDotSize: Math.round(clamp(r.xhDotSize, 1, 10, D.xhDotSize)), xhDotAlpha: clamp(r.xhDotAlpha, 0, 1, D.xhDotAlpha),
    xhCircleR: Math.round(clamp(r.xhCircleR, 3, 40, D.xhCircleR)), xhCircleThick: Math.round(clamp(r.xhCircleThick, 1, 5, D.xhCircleThick)),
    xhOutline: bool(r.xhOutline, D.xhOutline), xhOutlineThick: Math.round(clamp(r.xhOutlineThick, 1, 3, D.xhOutlineThick)),
    xhOutlineAlpha: clamp(r.xhOutlineAlpha, 0.1, 1, D.xhOutlineAlpha), xhDynMult: clamp(r.xhDynMult, 0, 3, D.xhDynMult),
    brightness: clamp(r.brightness, 0.6, 1.6, D.brightness), shake: Math.round(clamp(r.shake, 0, 100, D.shake)),
    renderScale: pick(r.renderScale, RENDER_SCALES, 0), fpsCap: pick(r.fpsCap, FPS_CAPS, 1),
    minimap: bool(r.minimap, D.minimap), nameplates: bool(r.nameplates, D.nameplates), killcam: bool(r.killcam, D.killcam),
    dmgNumbers: bool(r.dmgNumbers, D.dmgNumbers),
  };
}

export function loadSettings(): Settings {
  try { return validate(JSON.parse(localStorage.getItem(KEY) ?? 'null')); } catch { return validate(null); }
}

export function saveSettings(s: Settings) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage diblokir: tetap jalan dengan nilai di memori */ }
}
