// src/combat/WeaponSystem.ts — timing tembak, mode, burst, reload komit 80%, sprint-to-fire, auto reload (GDD §5.1)
import { CFG } from '../config/gameConfig';
import { SCOPES, WEAPONS, type FireMode, type ScopeDef, type ScopeId, type WeaponDef, type WeaponId } from '../config/weaponsData';
import { bus } from '../core/EventBus';
import type { Slot } from './Slots';

const C = CFG.combat;
const burstSize = (m: FireMode) => (m === 'BURST2' ? 2 : m === 'BURST3' ? 3 : 1);

export interface TriggerInput {
  pressed: boolean; held: boolean;   // klik kiri (edge + tahan)
  reload: boolean; modeSwitch: boolean;
  ads: boolean;                      // keinginan ADS (sudah memperhitungkan mode tahan/toggle)
  sprinting: boolean;                // status sprint saat ini
}

export class WeaponSystem {
  def: WeaponDef = WEAPONS.m416;
  scope: ScopeDef = SCOPES.iron;
  modeIdx = 0;
  ammo = 30;
  reserve = 120;
  slot: Slot = 'ar';
  /** Slot sebelum yang sekarang (tombol "senjata sebelumnya"). */
  prevSlot: Slot | null = 'knife';
  /** false setelah senjata utama dibuang (slot 1 kosong sampai mengambil senjata tim / respawn). */
  hasPrimary = true;
  equipT = 0;            // sisa waktu equip (s)
  equipTotal = 0;        // durasi equip terakhir (animasi angkat)
  reloadT = -1;          // waktu reload berjalan (s); −1 = tidak reload
  private committed = false;
  private nextShot = 0;
  private shotsThisPull = 0;
  private burstInProgress = false;
  private lastSprintEnd = -99;
  private wasSprinting = false;
  private emptyHoldT = 0;
  private reloadStage = 0;
  adsActive = false;
  shotsFired = 0;        // total (untuk tracer setiap ke-N)

  constructor(readonly ownerId: number) {}

  get mode(): FireMode { return this.def.modes[this.modeIdx]; }
  get reloading() { return this.reloadT >= 0; }
  get reloadProgress() { return this.reloadT >= 0 ? Math.min(1, this.reloadT / this.def.reloadTime) : -1; }
  /** Sisa animasi angkat senjata 1..0 (0 = siap). */
  get equipFrac() { return this.equipTotal > 0 ? this.equipT / this.equipTotal : 0; }

  setLoadout(w: WeaponId, s: ScopeId) {
    this.def = WEAPONS[w]; this.scope = SCOPES[s]; this.modeIdx = 0;
  }

  /** Spawn: amunisi penuh (30 + 120), kembali ke AR (senjata utama dipegang lagi; Q → pisau). */
  refill() {
    this.ammo = this.def.magSize; this.reserve = this.def.reserveAmmo;
    this.reloadT = -1; this.committed = false; this.slot = 'ar'; this.equipT = 0; this.equipTotal = 0;
    this.hasPrimary = true; this.prevSlot = 'knife';
    this.nextShot = 0; this.shotsThisPull = 0; this.burstInProgress = false; this.adsActive = false;
  }

  /** Ganti slot (senapan / pisau / granat). Sebelum titik komit: reload batal tanpa transfer. */
  switchTo(slot: Slot, equipTime: number) {
    if (slot === this.slot) return;
    this.cancelReload();
    this.prevSlot = this.slot;
    this.slot = slot; this.equipT = equipTime; this.equipTotal = equipTime;
    this.burstInProgress = false; this.adsActive = false;
  }

  cancelReload() { if (this.reloadT >= 0 && !this.committed) this.reloadT = -1; else if (this.reloadT >= 0) this.finishReload(); }

  startReload() {
    if (this.slot !== 'ar' || this.reloadT >= 0 || this.reserve <= 0 || this.ammo >= this.def.magSize || this.equipT > 0) return;
    this.reloadT = 0; this.committed = false; this.reloadStage = 0; this.burstInProgress = false;
  }

  private finishReload() {
    if (!this.committed) this.transfer();
    this.reloadT = -1; this.committed = false;
  }

  private transfer() {
    const need = this.def.magSize - this.ammo, take = Math.min(need, this.reserve);
    this.ammo += take; this.reserve -= take; this.committed = true;
  }

  /**
   * update per frame (waktu game `time`). `fireOne` dipanggil untuk setiap peluru (spread → raycast → damage → recoil → event).
   * Mengembalikan true bila pemicu "ingin menembak" (untuk menghentikan sprint).
   */
  update(dt: number, time: number, t: TriggerInput, fireOne: () => void): void {
    if (this.wasSprinting && !t.sprinting) this.lastSprintEnd = time;
    this.wasSprinting = t.sprinting;
    if (this.equipT > 0) this.equipT = Math.max(0, this.equipT - dt);

    if (t.modeSwitch && this.slot === 'ar' && this.def.modes.length > 1) {
      this.modeIdx = (this.modeIdx + 1) % this.def.modes.length; this.burstInProgress = false;
    }
    // reload: komit 80%, tetap berjalan saat sprint
    if (this.reloadT >= 0) {
      this.reloadT += dt;
      const p = this.reloadT / this.def.reloadTime;
      const stages = [0.25, 0.6, 0.85];
      while (this.reloadStage < 3 && p >= stages[this.reloadStage]) { bus.emit('reload', { entityId: this.ownerId, stage: this.reloadStage as 0 | 1 | 2 }); this.reloadStage++; }
      if (!this.committed && p >= C.reloadCommit) this.transfer();
      if (p >= 1) { this.reloadT = -1; this.committed = false; }
    }
    if (t.reload) this.startReload();

    // ADS tidak bisa selama reload, sprint, atau memegang granat
    this.adsActive = t.ads && this.slot === 'ar' && this.reloadT < 0 && !t.sprinting;
    if (this.slot !== 'ar' || this.equipT > 0) { this.burstInProgress = false; return; }

    const mode = this.mode, interval = 60 / this.def.rpm;
    if (t.pressed && !this.burstInProgress) {
      this.shotsThisPull = 0;
      if (time > this.nextShot) this.nextShot = time;
      if (this.ammo === 0) {
        if (this.reserve > 0) this.startReload(); else bus.emit('dryfire', { entityId: this.ownerId });
      }
    }
    // auto reload 0.25 s setelah peluru terakhir bila tombol masih ditahan
    if (this.ammo === 0 && t.held && this.reloadT < 0) {
      this.emptyHoldT += dt;
      if (this.emptyHoldT >= C.autoReloadDelay && this.reserve > 0) this.startReload();
    } else this.emptyHoldT = 0;

    if (this.reloadT >= 0 || t.sprinting) { this.burstInProgress = false; return; }
    if (time < this.lastSprintEnd + CFG.player.sprintToFire) return; // sprint-to-fire 0.12 s

    const limit = mode === 'AUTO' ? Infinity : mode === 'SINGLE' ? 1 : burstSize(mode);
    const wantFire = t.held || this.burstInProgress;
    if (time - this.nextShot > 0.25) this.nextShot = time; // jangan "mengejar" setelah jeda panjang
    while (wantFire && time >= this.nextShot && this.ammo > 0 && this.shotsThisPull < limit) {
      this.ammo--; this.shotsFired++;
      fireOne();
      this.shotsThisPull++;
      const burstDone = mode.startsWith('BURST') && this.shotsThisPull === limit;
      this.burstInProgress = mode.startsWith('BURST') && !burstDone;
      this.nextShot += mode === 'SINGLE' ? Math.max(interval, C.singleMinInterval)
        : burstDone ? Math.max(interval, C.burstDelay) : interval;
    }
    if (this.ammo === 0) this.burstInProgress = false;
  }
}
