// src/game/MatchManager.ts — aturan TDM & state match (GDD §1.3, §12)
// + mode Eliminasi berbasis ronde dan Latihan menembak (pasca-MVP "mode Elimination").
import { CFG } from '../config/gameConfig';
import { XCFG } from '../config/extraConfig';
import { bus, type MatchStateName } from '../core/EventBus';
import { newStats } from '../entities/Entity';
import { ctx } from './ctx';

export type Winner = 'blue' | 'red' | 'draw';
export type GameMode = 'tdm' | 'elim' | 'practice';
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
  private roundEndT = 0;
  onResults: (() => void) | null = null;
  /** Klien online: keadaan diatur host (tanpa transisi/skor lokal), timer hanya dihaluskan di antara snapshot. */
  puppet = false;
  /** Dipanggil setiap awal ronde (TDM/Latihan: sekali di awal match). */
  onRoundStart: ((round: number) => void) | null = null;

  constructor() {
    bus.on('kill', () => { if (!this.puppet) this.checkScore(); });
  }

  /** Klien: mulai match boneka (tanpa spawn lokal — posisi datang dari host). */
  startPuppet(opts: MatchOptions) {
    this.puppet = true;
    this.opts = { ...opts };
    this.round = 1; this.roundWinner = null; this.winner = 'draw';
    this.timeLeft = opts.mode === 'elim' ? XCFG.elim.roundTime : opts.timeLimit;
    this.countdown = CFG.match.countdown;
    ctx.teams.reset();
    for (const e of ctx.entities) { e.stats = newStats(); e.streak = 0; e.respawnT = 0; e.dmgBy.clear(); }
    ctx.props.reset(); ctx.vfx.clear(); ctx.deathFx.clear(); ctx.grenades.clear(); ctx.drops.clear();
    this.set('COUNTDOWN');
  }

  /** Klien: keadaan dari host (snapshot / event). */
  applyNet(state: MatchStateName, sb: number, sr: number, timeLeft: number, countdown: number, round: number) {
    ctx.teams.scores.blue = sb; ctx.teams.scores.red = sr;
    this.timeLeft = timeLeft; this.countdown = countdown;
    if (round > this.round) {   // ronde baru (Eliminasi): bersihkan sisa visual ronde lalu
      this.round = round; this.roundWinner = null;
      ctx.props.reset(); ctx.vfx.clear(); ctx.deathFx.clear(); ctx.grenades.clear();
      this.onRoundStart?.(round);
    }
    if (state !== this.state) {
      if (state === 'ENDED') this.endT = 0;
      this.set(state);
      if (state === 'RESULTS') this.onResults?.();
    }
  }

  get mode(): GameMode { return this.opts.mode; }

  set(s: MatchStateName) {
    this.state = s;
    bus.emit('match:state', { state: s, scores: [ctx.teams.scores.blue, ctx.teams.scores.red], timeLeft: this.timeLeft });
  }

  /** Mulai match baru: skor & statistik direset, semua karakter di ruang spawn, hitung mundur 3 s. */
  start(opts: MatchOptions) {
    this.puppet = false;
    this.opts = { ...opts };
    this.round = 0;
    ctx.teams.reset();
    for (const e of ctx.entities) { e.stats = newStats(); e.streak = 0; e.respawnT = 0; e.dmgBy.clear(); }
    this.beginRound();
  }

  private beginRound() {
    this.round++;
    this.timeLeft = this.opts.mode === 'elim' ? XCFG.elim.roundTime : this.opts.timeLimit;
    this.countdown = CFG.match.countdown;
    this.roundWinner = null;
    ctx.props.reset(); ctx.vfx.clear(); ctx.deathFx.clear(); ctx.grenades.clear(); ctx.drops.clear();
    for (const e of ctx.entities) ctx.spawns.spawn(e);
    this.onRoundStart?.(this.round);
    this.set(this.opts.mode === 'practice' ? 'PLAYING' : 'COUNTDOWN');
  }

  get locked() { return this.state === 'COUNTDOWN' || this.state === 'ROUND_END' || this.state === 'ENDED' || this.state === 'RESULTS'; }

  /** dt = waktu game; realDt = waktu riil (slow-motion tidak memperlambat timer akhir). */
  update(dt: number, realDt: number) {
    if (this.puppet) {   // klien: hanya haluskan timer; transisi datang dari host
      if (this.state === 'COUNTDOWN') this.countdown = Math.max(0, this.countdown - dt);
      else if (this.state === 'PLAYING' && this.opts.mode !== 'practice') this.timeLeft = Math.max(0, this.timeLeft - dt);
      return;
    }
    switch (this.state) {
      case 'COUNTDOWN':
        this.countdown -= dt;
        if (this.countdown <= 0) this.set('PLAYING');
        break;
      case 'PLAYING':
        if (this.opts.mode === 'practice') break;
        this.timeLeft = Math.max(0, this.timeLeft - dt);
        if (this.opts.mode === 'elim') this.checkRound(this.timeLeft <= 0);
        else if (this.timeLeft <= 0) this.end();
        break;
      case 'ROUND_END': {
        this.roundEndT += realDt;
        if (this.roundEndT < XCFG.elim.roundEnd) break;
        const s = ctx.teams.scores, n = this.opts.roundsToWin;
        if (s.blue >= n || s.red >= n) this.end(); else this.beginRound();
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
