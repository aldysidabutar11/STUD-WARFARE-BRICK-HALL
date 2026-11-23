// src/game/MatchManager.ts — aturan TDM & state match (GDD §1.3, §12)
import { CFG } from '../config/gameConfig';
import { XCFG } from '../config/extraConfig';
import { bus, type MatchStateName } from '../core/EventBus';
import { ctx } from './ctx';

export type Winner = 'blue' | 'red' | 'draw';

export class MatchManager {
  state: MatchStateName = 'MENU';
  timeLeft: number = CFG.match.timeLimit;
  countdown: number = CFG.match.countdown;
  endT = 0;
  winner: Winner = 'draw';
  onEnded: (() => void) | null = null;
  onResults: (() => void) | null = null;

  constructor() {
    bus.on('kill', () => this.checkScore());
  }

  set(s: MatchStateName) {
    this.state = s;
    bus.emit('match:state', { state: s, scores: [ctx.teams.scores.blue, ctx.teams.scores.red], timeLeft: this.timeLeft });
  }

  /** Mulai match baru: skor & statistik direset, semua karakter di ruang spawn, hitung mundur 3 s. */
  start() {
    this.timeLeft = CFG.match.timeLimit;
    this.countdown = CFG.match.countdown;
    ctx.teams.reset();
    for (const e of ctx.entities) {
      e.stats = { kills: 0, deaths: 0, score: 0, shots: 0, hits: 0, hsHits: 0, hsKills: 0, damage: 0 };
      e.alive = false; e.respawnT = 0;
    }
    ctx.props.reset(); ctx.vfx.clear(); ctx.deathFx.clear(); ctx.grenades.clear();
    for (const e of ctx.entities) ctx.spawns.spawn(e);
    this.set('COUNTDOWN');
  }

  get locked() { return this.state === 'COUNTDOWN' || this.state === 'ENDED' || this.state === 'RESULTS'; }

  /** dt = waktu riil (slow-motion tidak memperlambat timer akhir). */
  update(dt: number, realDt: number) {
    if (this.state === 'COUNTDOWN') {
      this.countdown -= dt;
      if (this.countdown <= 0) this.set('PLAYING');
    } else if (this.state === 'PLAYING') {
      this.timeLeft = Math.max(0, this.timeLeft - dt);
      if (this.timeLeft <= 0) this.end();
    } else if (this.state === 'ENDED') {
      this.endT += realDt;
      if (this.endT >= XCFG.match.endSlowMoTime + 1.5) { this.set('RESULTS'); this.onResults?.(); }
    }
  }

  private checkScore() {
    if (this.state !== 'PLAYING') return;
    const s = ctx.teams.scores;
    if (s.blue >= CFG.match.scoreLimit || s.red >= CFG.match.scoreLimit) this.end();
  }

  end() {
    const s = ctx.teams.scores;
    this.winner = s.blue > s.red ? 'blue' : s.red > s.blue ? 'red' : 'draw';
    this.endT = 0;
    this.set('ENDED');
    this.onEnded?.();
  }
}
