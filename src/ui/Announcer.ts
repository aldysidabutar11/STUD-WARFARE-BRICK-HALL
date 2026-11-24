// src/ui/Announcer.ts — medali multi-kill / streak / first blood, popup skor (+100), notifikasi streak musuh di kill feed.
// Umpan balik ala FPS lain (bukan dari GDD). Logika medali murni di `nextMedal` (diuji Vitest).
import { XCFG } from '../config/extraConfig';
import { bus, type KillWeapon } from '../core/EventBus';
import { ctx } from '../game/ctx';
import * as R from '../audio/Recipes';

const XA = XCFG.announce;
export interface KillTrack { multi: number; lastT: number; streak: number }
export const STREAK_NAMES: Record<number, string> = { 5: 'KILLING SPREE', 10: 'RAMPAGE', 15: 'UNSTOPPABLE', 20: 'GODLIKE' };
const MULTI_NAMES = ['', '', 'DOUBLE KILL', 'TRIPLE KILL', 'MULTI KILL'];

/**
 * Perbarui pelacak kill pemain dan pilih medali (prioritas: streak > multi-kill > first blood > melee/granat > headshot).
 * tier dipakai untuk nada jingle.
 */
export function nextMedal(st: KillTrack, now: number, o: { headshot: boolean; firstBlood: boolean; weapon: KillWeapon; window?: number }):
  { medal: string | null; tier: number } {
  st.multi = now - st.lastT <= (o.window ?? XA.multiWindow) ? st.multi + 1 : 1;
  st.lastT = now;
  st.streak++;
  const streak = STREAK_NAMES[st.streak];
  if (streak) return { medal: streak, tier: 3 + Math.min(3, st.streak / 5) };
  if (st.multi >= 2) return { medal: st.multi >= 5 ? 'MEGA KILL' : MULTI_NAMES[st.multi], tier: Math.min(5, st.multi) };
  if (o.firstBlood) return { medal: 'FIRST BLOOD', tier: 2 };
  if (o.weapon === 'melee') return { medal: 'PUKULAN TELAK', tier: 1 };
  if (o.weapon === 'knife') return { medal: 'AHLI PISAU', tier: 1 };
  if (o.weapon === 'k400') return { medal: 'LEDAKAN!', tier: 1 };
  if (o.headshot) return { medal: 'HEADSHOT', tier: 0 };
  return { medal: null, tier: 0 };
}

export class Announcer {
  readonly el = document.createElement('div');
  private medalEl = document.createElement('div');
  private popEl = document.createElement('div');
  private st: KillTrack = { multi: 0, lastT: -99, streak: 0 };
  private firstBloodDone = false;
  private medalTimer = 0;

  constructor(parent: HTMLElement) {
    this.el.className = 'announcer';
    this.medalEl.className = 'medal';
    this.popEl.className = 'popups';
    this.el.append(this.medalEl, this.popEl);
    parent.appendChild(this.el);
    bus.on('kill', (e) => {
      const p = ctx.player;
      if (!p || ctx.match.mode === 'practice' && e.killerId !== p.id) return;
      const scored = e.killerId !== e.victimId;
      const first = scored && !this.firstBloodDone && ctx.match.mode !== 'practice';
      if (scored) this.firstBloodDone = true;
      if (e.victimId === p.id) { this.st.streak = 0; this.st.multi = 0; }
      const killer = ctx.byId.get(e.killerId), victim = ctx.byId.get(e.victimId);
      if (!killer || !victim || !scored) return;
      if (killer !== p) {
        const name = STREAK_NAMES[killer.streak];
        if (name) ctx.hud.notice(`${killer.name}: ${name}!`, killer.team);
        return;
      }
      const r = nextMedal(this.st, ctx.time, { headshot: e.headshot, firstBlood: first, weapon: e.weaponId });
      this.popup(`+${XCFG.scoring.kill}`, 'Kill');
      if (e.headshot) this.popup(`+${XCFG.scoring.headshotBonus}`, 'Headshot');
      if (r.medal) { this.showMedal(r.medal); ctx.audio.playUi(R.medal(r.tier), 0.9); }
    });
    bus.on('assist', (e) => {
      if (!ctx.player || e.entityId !== ctx.player.id) return;
      this.popup(`+${XA.assistScore}`, 'Assist');
      ctx.audio.playUi(R.assistTick, 0.8);
    });
  }

  /** Awal match (dan tiap ronde Eliminasi): reset first blood & pelacak. */
  reset(full: boolean) {
    this.firstBloodDone = false;
    if (full) this.st = { multi: 0, lastT: -99, streak: 0 };
    this.medalEl.className = 'medal'; this.popEl.innerHTML = '';
  }

  private showMedal(text: string) {
    this.medalEl.textContent = text;
    this.medalEl.className = 'medal';
    void this.medalEl.offsetWidth; // restart animasi CSS
    this.medalEl.className = 'medal on';
    clearTimeout(this.medalTimer);
    this.medalTimer = window.setTimeout(() => (this.medalEl.className = 'medal'), XA.medalTime * 1000);
  }

  private popup(value: string, label: string) {
    const row = document.createElement('div');
    row.innerHTML = `<b>${value}</b> ${label}`;
    this.popEl.appendChild(row);
    while (this.popEl.children.length > 4) this.popEl.firstChild!.remove();
    window.setTimeout(() => row.remove(), XA.popupTime * 1000);
  }
}
