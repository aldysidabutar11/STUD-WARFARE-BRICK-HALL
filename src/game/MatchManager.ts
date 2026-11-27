// src/game/MatchManager.ts — aturan TDM & state match (GDD §1.3, §12)
// + mode Eliminasi berbasis ronde dan Latihan menembak (pasca-MVP "mode Elimination")
// + Bomb Mission (dokumen pengguna; aturan murni game/BombRules.ts, C4 combat/C4Bomb.ts): COUNTDOWN = freeze 5 s, PLAYING = ronde
//   120 s (setelah C4 ditanam: timeLeft = sumbu 40 s), ROUND_END 5 s (+ 4 s banner tukar sisi setelah ronde 4), first to 5.
import { CFG } from '../config/gameConfig';
import { XCFG } from '../config/extraConfig';
import { BOMB_CFG } from '../config/bombConfig';
import { attackersOf, bombRoundResult, shouldSwapSides, type RoundReason } from './BombRules';
import { bus, type MatchStateName } from '../core/EventBus';
import { newStats } from '../entities/Entity';
import type { MatchSave } from '../net/Migration';
import { ctx } from './ctx';

export type Winner = 'blue' | 'red' | 'draw';
export type GameMode = 'tdm' | 'elim' | 'bomb' | 'practice';
/** Mode berbasis ronde: tanpa respawn dalam ronde, menonton rekan, skor tim = ronde dimenangkan. */
export const isRoundMode = (m: GameMode) => m === 'elim' || m === 'bomb';
export interface MatchOptions { mode: GameMode; scoreLimit: number; timeLimit: number; roundsToWin: number }

/**
 * Hasil ronde Eliminasi: tim yang habis kalah; bila waktu habis → jumlah hidup terbanyak, lalu total HP; sama → seri.
 * Mengembalikan null bila ronde belum selesai.
 */
export function elimRoundResult(aliveBlue: number, aliveRed: number, hpBlue: number, hpRed: number, timeUp: boolean): Winner | null {
  if (aliveBlue === 0 && aliveRed === 0) return 'draw';
  if (aliveBlue === 0) return 'red';
  if (aliveRed === 0) return 'blue';
  if (!timeUp) return null;
  if (aliveBlue !== aliveRed) return aliveBlue > aliveRed ? 'blue' : 'red';
  if (hpBlue !== hpRed) return hpBlue > hpRed ? 'blue' : 'red';
  return 'draw';
}

export class MatchManager {
  state: MatchStateName = 'MENU';
  opts: MatchOptions = { mode: 'tdm', scoreLimit: CFG.match.scoreLimit, timeLimit: CFG.match.timeLimit, roundsToWin: XCFG.elim.roundsToWin };
  timeLeft: number = CFG.match.timeLimit;
  countdown: number = CFG.match.countdown;
  endT = 0;
  winner: Winner = 'draw';
  round = 0;
  roundWinner: Winner | null = null;
  /** Bomb Mission: alasan ronde selesai (banner). */
  roundReason: RoundReason | null = null;
  private roundEndT = 0;
  onResults: (() => void) | null = null;
  /** Klien online: keadaan diatur host (tanpa transisi/skor lokal), timer hanya dihaluskan di antara snapshot. */
  puppet = false;
  /** Dipanggil setiap awal ronde (TDM/Latihan: sekali di awal match). */
  onRoundStart: ((round: number) => void) | null = null;
  /** Detik match benar-benar dimainkan (PLAYING, semua ronde; ikut cadangan pindah host) — durasi hasil untuk leaderboard. */
  playedT = 0;

  constructor() {
    bus.on('kill', () => { if (!this.puppet) this.checkScore(); });
  }

  /** Klien: mulai match boneka (tanpa spawn lokal — posisi datang dari host). */
  startPuppet(opts: MatchOptions) {
    this.puppet = true;
    this.opts = { ...opts };
    this.round = 1; this.roundWinner = null; this.roundReason = null; this.winner = 'draw'; this.playedT = 0;
    this.timeLeft = this.roundTime();
    this.countdown = this.freezeTime();
    if (opts.mode === 'bomb') { ctx.bomb.resetMatch(); ctx.bomb.attackers = attackersOf(1); }
    ctx.teams.reset();
    for (const e of ctx.entities) { e.stats = newStats(); e.streak = 0; e.respawnT = 0; e.dmgBy.clear(); }
    ctx.props.reset(); ctx.vfx.clear(); ctx.deathFx.clear(); ctx.grenades.clear(); ctx.drops.clear(); ctx.breakables.reset();
    this.set('COUNTDOWN');
  }

  /** Lanjutkan pertandingan dari cadangan (pindah host / bergabung ulang): aturan, ronde, waktu, skor, pemenang — tanpa reset
   *  skor & tanpa spawn ulang (entitas diisi applySaveEntities). puppet = klien (transisi tetap datang dari host). */
  resume(opts: MatchOptions, s: MatchSave, puppet: boolean) {
    this.puppet = puppet;
    this.opts = { ...opts };
    this.round = s.round; this.timeLeft = s.timeLeft; this.countdown = s.countdown;
    this.winner = s.winner; this.roundWinner = s.roundWinner; this.roundEndT = 0; this.endT = 0; this.playedT = s.played ?? 0;
    ctx.teams.reset(); ctx.teams.scores.blue = s.sb; ctx.teams.scores.red = s.sr;
    for (const e of ctx.entities) { e.stats = newStats(); e.streak = 0; e.respawnT = 0; e.dmgBy.clear(); }
    if (opts.mode === 'bomb') {            // kelompok slot & penyerang ronde ini (C4 dipulihkan applySaveEntities)
      const att = attackersOf(Math.max(1, s.round));
      ctx.spawns.groupOf = t => (t === att ? 'red' : 'blue');
      ctx.bomb.resetMatch(); ctx.bomb.attackers = att;
    } else ctx.spawns.groupOf = t => t;
    ctx.props.reset(); ctx.vfx.clear(); ctx.deathFx.clear(); ctx.grenades.clear(); ctx.drops.clear(); ctx.breakables.reset();
    this.set(s.state);
    if (s.state === 'RESULTS') this.onResults?.();
  }

  /** Klien: keadaan dari host (snapshot / event). */
  applyNet(state: MatchStateName, sb: number, sr: number, timeLeft: number, countdown: number, round: number) {
    ctx.teams.scores.blue = sb; ctx.teams.scores.red = sr;
    this.timeLeft = timeLeft; this.countdown = countdown;
    if (round > this.round) {   // ronde baru (Eliminasi / Bomb Mission): bersihkan sisa visual ronde lalu
      this.round = round; this.roundWinner = null; this.roundReason = null;
      ctx.props.reset(); ctx.vfx.clear(); ctx.deathFx.clear(); ctx.grenades.clear(); ctx.breakables.reset();
      this.onRoundStart?.(round);
    }
    if (state !== this.state) {
      if (state === 'ENDED') this.endT = 0;
      this.set(state);
      if (state === 'RESULTS') this.onResults?.();
    }
  }

  get mode(): GameMode { return this.opts.mode; }
  /** Durasi ronde / match & hitung mundur awal ronde per mode. */
  private roundTime() { return this.opts.mode === 'elim' ? XCFG.elim.roundTime : this.opts.mode === 'bomb' ? BOMB_CFG.match.roundTime : this.opts.timeLimit; }
  private freezeTime() { return this.opts.mode === 'bomb' ? BOMB_CFG.match.freezeTime : CFG.match.countdown; }
  /** Ronde untuk menang (Bomb Mission: first to 5 — dokumen). */
  get roundsToWin() { return this.opts.mode === 'bomb' ? BOMB_CFG.match.winRounds : this.opts.roundsToWin; }
  /** Bomb Mission: tim penyerang ronde ini. */
  get attackers() { return attackersOf(Math.max(1, this.round)); }
  /** Bomb Mission: ronde yang baru selesai = ronde tukar sisi (banner + jeda ekstra). */
  get halftimeNow() { return this.opts.mode === 'bomb' && this.state === 'ROUND_END' && shouldSwapSides(this.round); }

  set(s: MatchStateName) {
    this.state = s;
    bus.emit('match:state', { state: s, scores: [ctx.teams.scores.blue, ctx.teams.scores.red], timeLeft: this.timeLeft });
  }

  /** Mulai match baru: skor & statistik direset, semua karakter di ruang spawn, hitung mundur 3 s. */
  start(opts: MatchOptions) {
    this.puppet = false;
    this.opts = { ...opts };
    this.round = 0; this.playedT = 0;
    ctx.teams.reset();
    for (const e of ctx.entities) { e.stats = newStats(); e.streak = 0; e.respawnT = 0; e.dmgBy.clear(); }
    ctx.bomb.resetMatch();
    ctx.spawns.groupOf = t => t;
    this.beginRound();
  }

  private beginRound() {
    this.round++;
    this.timeLeft = this.roundTime();
    this.countdown = this.freezeTime();
    this.roundWinner = null; this.roundReason = null;
    ctx.props.reset(); ctx.vfx.clear(); ctx.deathFx.clear(); ctx.grenades.clear(); ctx.drops.clear(); ctx.breakables.reset();
    if (this.opts.mode === 'bomb') {
      // kelompok slot map: 'red' = Barat Laut (penyerang), 'blue' = Tenggara (bertahan) → tim penyerang ronde ini memakai slot 'red'
      const att = attackersOf(this.round);
      ctx.spawns.groupOf = t => (t === att ? 'red' : 'blue');
      for (const e of ctx.entities) e.c4Held = false;
    }
    for (const e of ctx.entities) ctx.spawns.spawn(e);
    if (this.opts.mode === 'bomb') ctx.bomb.startRound(attackersOf(this.round));
    this.onRoundStart?.(this.round);
    this.set(this.opts.mode === 'practice' ? 'PLAYING' : 'COUNTDOWN');
  }

  get locked() { return this.state === 'COUNTDOWN' || this.state === 'ROUND_END' || this.state === 'ENDED' || this.state === 'RESULTS'; }

  /** dt = waktu game; realDt = waktu riil (slow-motion tidak memperlambat timer akhir). */
  update(dt: number, realDt: number) {
    if (this.puppet) {   // klien: hanya haluskan timer; transisi datang dari host
      if (this.state === 'COUNTDOWN') this.countdown = Math.max(0, this.countdown - dt);
      else if (this.state === 'PLAYING' && this.opts.mode !== 'practice') { this.timeLeft = Math.max(0, this.timeLeft - dt); this.playedT += dt; }
      return;
    }
    switch (this.state) {
      case 'COUNTDOWN':
        this.countdown -= dt;
        if (this.countdown <= 0) this.set('PLAYING');
        break;
      case 'PLAYING':
        if (this.opts.mode === 'practice') break;
        this.playedT += dt;
        if (this.opts.mode === 'bomb' && ctx.bomb.state === 'planted') this.timeLeft = Math.max(0, ctx.bomb.fuseLeft);
        else this.timeLeft = Math.max(0, this.timeLeft - dt);
        if (this.opts.mode === 'elim') this.checkRound(this.timeLeft <= 0);
        else if (this.opts.mode === 'bomb') this.checkBombRound();
        else if (this.timeLeft <= 0) this.end();
        break;
      case 'ROUND_END': {
        this.roundEndT += realDt;
        const s = ctx.teams.scores, n = this.roundsToWin, over = s.blue >= n || s.red >= n;
        const wait = this.opts.mode === 'bomb'
          ? BOMB_CFG.match.roundEndDelay + (!over && shouldSwapSides(this.round) ? BOMB_CFG.match.halftimeDelay : 0) : XCFG.elim.roundEnd;
        if (this.roundEndT < wait) break;
        if (over) this.end(); else this.beginRound();
        break;
      }
      case 'ENDED':
        this.endT += realDt;
        if (this.endT >= XCFG.match.endSlowMoTime + 1.5) { this.set('RESULTS'); this.onResults?.(); }
        break;
      default: break;
    }
  }

  private checkScore() {
    if (this.state !== 'PLAYING') return;
    if (this.opts.mode === 'tdm') {
      const s = ctx.teams.scores;
      if (s.blue >= this.opts.scoreLimit || s.red >= this.opts.scoreLimit) this.end();
    } else if (this.opts.mode === 'elim') this.checkRound(false);
    else if (this.opts.mode === 'bomb') this.checkBombRound();
  }

  /** Bomb Mission: matriks menang ronde (BombRules) dari jumlah hidup per peran + keadaan C4. */
  private checkBombRound() {
    if (this.state !== 'PLAYING') return;
    const att = attackersOf(this.round), b = ctx.bomb;
    let aa = 0, da = 0;
    for (const e of ctx.entities) if (e.alive) { if (e.team === att) aa++; else da++; }
    const r = bombRoundResult({ attAlive: aa, defAlive: da, planted: b.state === 'planted', detonated: b.state === 'detonated',
      defused: b.state === 'defused', timeUp: b.state !== 'planted' && this.timeLeft <= 0 });
    if (!r) return;
    const team = r.winner === 'att' ? att : att === 'red' ? 'blue' : 'red';
    this.roundWinner = team; this.roundReason = r.reason;
    ctx.teams.scores[team]++;
    this.roundEndT = 0;
    this.set('ROUND_END');
  }

  private checkRound(timeUp: boolean) {
    let ab = 0, ar = 0, hb = 0, hr = 0;
    for (const e of ctx.entities) {
      if (!e.alive) continue;
      if (e.team === 'blue') { ab++; hb += e.hp; } else { ar++; hr += e.hp; }
    }
    const w = elimRoundResult(ab, ar, hb, hr, timeUp);
    if (!w) return;
    this.roundWinner = w;
    if (w !== 'draw') ctx.teams.scores[w]++;
    this.roundEndT = 0;
    this.set('ROUND_END');
  }

  end() {
    const s = ctx.teams.scores;
    this.winner = s.blue > s.red ? 'blue' : s.red > s.blue ? 'red' : 'draw';
    this.endT = 0;
    this.set('ENDED');
  }
}
