// src/net/Resume.ts — cadangan pertandingan dari keadaan saat ini (host: otoritatif; klien: cermin + snapshot terbaru) dan
// penerapannya ke entitas yang baru dibuat saat pertandingan DILANJUTKAN (host baru setelah pindah host, teman yang bergabung
// ulang). Format & validasi: Migration.ts.
import { ctx } from '../game/ctx';
import type { Entity } from '../entities/Entity';
import { cleanLoadout, sameLoadout } from '../combat/Loadout';
import { SAVE_V, type MatchSave, type SaveEnt } from './Migration';

const r2 = (v: number) => Math.round(v * 100) / 100;
const statsOf = (e: Entity) => {
  const s = e.stats;
  return [s.kills, s.deaths, s.assists, s.score, s.shots, s.hits, s.hsHits, s.hsKills, s.damage, s.bestStreak];
};

export function saveEnt(e: Entity): SaveEnt {
  const w = e.weapon, g = w.primary, p = w.secondary;
  return { id: e.id, alive: e.alive, hp: Math.round(e.hp), respawnT: r2(Math.max(0, e.respawnT)), protectT: r2(Math.max(0, e.protectT)),
    x: r2(e.pos.x), y: r2(e.pos.y), z: r2(e.pos.z), yaw: r2(e.yaw), pitch: r2(e.pitch), weapon: e.loadout.weapon, scope: e.loadout.scope,
    ammo: g.ammo, reserve: g.reserve, modeIdx: g.modeIdx, grenades: e.grenades, stats: statsOf(e), streak: e.streak, variant: e.char.variant,
    flashes: e.flashes, pistol: e.loadout.pistol, pscope: e.loadout.pscope, ammo2: p.ammo, reserve2: p.reserve, mode2: p.modeIdx,
    melee: e.loadout.melee };
}

/** Cadangan dari keadaan match & entitas saat ini. */
export function captureSave(): MatchSave {
  const m = ctx.match;
  return { v: SAVE_V, state: m.state, round: m.round, timeLeft: r2(m.timeLeft), countdown: r2(m.countdown),
    sb: ctx.teams.scores.blue, sr: ctx.teams.scores.red, winner: m.winner, roundWinner: m.roundWinner, ents: ctx.entities.map(saveEnt),
    glass: ctx.breakables.brokenList() };
}

/** Terapkan cadangan ke entitas yang baru dibuat (setelah MatchManager.resume): loadout, statistik, lalu hidup di posisinya
 *  (tanpa "spawn": tanpa isi ulang amunisi & perlindungan spawn) atau mati dengan sisa waktu respawn-nya. */
export function applySaveEntities(save: MatchSave) {
  if (save.glass?.length) ctx.breakables.applyBroken(save.glass);
  for (const s of save.ents) {
    const e = ctx.byId.get(s.id);
    if (!e) continue;
    const lo = cleanLoadout(s.weapon, s.scope, s.pistol, s.pscope, s.melee);
    if (!sameLoadout(lo, e.loadout)) e.applyLoadout(lo);
    if (e.char.variant !== s.variant) e.char.setVariant(s.variant);
    const st = e.stats;
    [st.kills, st.deaths, st.assists, st.score, st.shots, st.hits, st.hsHits, st.hsKills, st.damage, st.bestStreak] = s.stats;
    if (s.alive && s.hp > 0) {
      ctx.spawns.restore(e, s.x, s.y, s.z, s.yaw);
      e.pitch = s.pitch; e.hp = s.hp; e.protectT = s.protectT; e.char.protectT = s.protectT;
      if (e.isPlayer) ctx.camRig.pitch = s.pitch;
      const g = e.weapon.primary, p = e.weapon.secondary;
      g.ammo = Math.min(s.ammo, g.def.magSize); g.reserve = s.reserve; g.modeIdx = Math.min(s.modeIdx, g.def.modes.length - 1);
      if (s.ammo2 >= 0) p.ammo = Math.min(s.ammo2, p.def.magSize);
      if (s.reserve2 >= 0) p.reserve = s.reserve2;
      p.modeIdx = Math.min(s.mode2, p.def.modes.length - 1);
      e.grenades = s.grenades; e.flashes = s.flashes;
    } else {
      e.alive = false; e.hp = 0; e.respawnT = s.respawnT;
      e.ctrl.setEnabled(false); e.char.setVisible(false);
    }
    e.streak = s.streak;
  }
}
