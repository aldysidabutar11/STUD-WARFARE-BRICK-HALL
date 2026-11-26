// src/combat/WeaponSystem.ts — timing tembak, mode, burst, reload komit 80%, sprint-to-fire, auto reload (GDD §5.1)
// + ekspansi senjata (pengguna 2026-11-25): DUA senjata api (utama slot 1 + pistol slot 2) masing-masing dengan keadaannya sendiri
// (Gun), reload per selongsong (shotgun; menembak membatalkan), kokang pompa/bolt setelah tiap tembakan, progres ADS (sniper).
import { CFG } from '../config/gameConfig';
import { XCFG } from '../config/extraConfig';
import { SCOPES, WEAPONS, fitScope, type FireMode, type ScopeDef, type ScopeId, type WeaponDef, type WeaponId } from '../config/weaponsData';
import { bus } from '../core/EventBus';
import type { Slot } from './Slots';
import type { MeleeId } from '../config/weaponsExtra';
import { adsTimeOf, sprintToFireOf } from './weaponStats';

const C = CFG.combat, XW = XCFG.weapons;
const burstSize = (m: FireMode) => (m === 'BURST2' ? 2 : m === 'BURST3' ? 3 : 1);

export interface TriggerInput {
  pressed: boolean; held: boolean;   // klik kiri (edge + tahan)
  reload: boolean; modeSwitch: boolean;
  ads: boolean;                      // keinginan ADS (sudah memperhitungkan mode tahan/toggle)
  sprinting: boolean;                // status sprint saat ini
}

/** Keadaan satu senjata api: jenis, optik, mode tembak, isi magazen, cadangan, jadwal tembak & kokang. */
export class Gun {
  def: WeaponDef;
  scope: ScopeDef;
  modeIdx = 0;
  ammo: number;
  reserve: number;
  /** Waktu game paling cepat tembakan berikutnya. Per senjata: berganti ke pistol lalu kembali tidak mempercepat kokang bolt. */
  nextShot = 0;
  /** Waktu tembakan terakhir (animasi kokang / slide) & jadwal bunyi kokang (Infinity = tidak ada). */
  lastShot = -99;
  cycleAt = Infinity;

  constructor(id: WeaponId, scope: ScopeId) {
    this.def = WEAPONS[id]; this.scope = SCOPES[fitScope(this.def, scope)];
    this.ammo = this.def.magSize; this.reserve = this.def.reserveAmmo;
  }

  get mode(): FireMode { return this.def.modes[this.modeIdx]; }

  /** Ganti jenis/optik (mode tembak kembali ke default bila jenis berubah). */
  set(id: WeaponId, scope: ScopeId) {
    if (this.def.id !== id) this.modeIdx = 0;
    this.def = WEAPONS[id]; this.scope = SCOPES[fitScope(this.def, scope)];
  }

  refill() {
    this.ammo = this.def.magSize; this.reserve = this.def.reserveAmmo;
    this.nextShot = 0; this.lastShot = -99; this.cycleAt = Infinity;
  }

  /** Progres animasi kokang pompa/bolt 0..1 setelah tembakan (−1 bila tidak sedang mengokang). */
  cycleProgress(time: number): number {
    if (this.def.action !== 'pump' && this.def.action !== 'bolt') return -1;
    const since = time - this.lastShot, len = 60 / this.def.rpm - XW.cycleDelay - XW.cycleTail;
    if (since < XW.cycleDelay || len <= 0) return -1;
    const p = (since - XW.cycleDelay) / len;
    return p >= 1 ? -1 : p;
  }
}

export class WeaponSystem {
  /** Slot 1 (senjata utama) & slot 2 (pistol). */
  readonly primary = new Gun('m416', 'reddot');
  readonly secondary = new Gun('deagle', 'iron');
  /** Senjata jarak dekat slot 3 (pisau / karambit / kukri / tomahawk). */
  melee: MeleeId = 'knife';
  slot: Slot = 'ar';
  /** Slot sebelum yang sekarang (tombol "senjata sebelumnya"). */
  prevSlot: Slot | null = 'pistol';
  /** false setelah senjata utama dibuang (slot 1 kosong sampai mengambil senjata tim / respawn). */
  hasPrimary = true;
  equipT = 0;            // sisa waktu equip (s)
  equipTotal = 0;        // durasi equip terakhir (animasi angkat)
  reloadT = -1;          // waktu reload berjalan (s); −1 = tidak reload
  /** Boneka online (klien): progres reload dari snapshot host (null = hitung sendiri). */
  netReload: number | null = null;
  private committed = false;
  private shotsThisPull = 0;
  private burstInProgress = false;
  private lastSprintEnd = -99;
  private wasSprinting = false;
  private emptyHoldT = 0;
  private reloadStage = 0;
  /** Reload per selongsong: selongsong masuk & target pada reload ini. */
  private shellN = 0;
  private shellGoal = 0;
  adsActive = false;
  /** Progres optik terbuka 0..1 (waktu ADS senjata/optik) — akurasi sniper/DMR. */
  adsP = 0;
  shotsFired = 0;        // total (untuk tracer setiap ke-N & seed spread)

  constructor(readonly ownerId: number) {}

  /** Senjata api yang sedang aktif (pistol bila slot 2; selain itu senjata utama). */
  get gun(): Gun { return this.slot === 'pistol' ? this.secondary : this.primary; }
  get def(): WeaponDef { return this.gun.def; }
  get scope(): ScopeDef { return this.gun.scope; }
  get ammo() { return this.gun.ammo; }
  set ammo(v: number) { this.gun.ammo = v; }
  get reserve() { return this.gun.reserve; }
  set reserve(v: number) { this.gun.reserve = v; }
  get modeIdx() { return this.gun.modeIdx; }
  set modeIdx(v: number) { this.gun.modeIdx = v; }
  get mode(): FireMode { return this.gun.mode; }
  /** Memegang senjata api yang bisa menembak (bukan pisau / granat / tangan kosong). */
  get holdingGun() { return this.slot === 'pistol' || (this.slot === 'ar' && this.hasPrimary); }
  get reloading() { return this.reloadT >= 0; }
  /** Progres reload untuk animasi: magazen = 0..1 seluruh reload; selongsong = siklus tiap selongsong. −1 = tidak reload. */
  get reloadProgress() {
    if (this.netReload !== null) return this.netReload;
    if (this.reloadT < 0) return -1;
    const d = this.def;
    if (d.reload === 'shell') {
      const t = this.reloadT - XW.shellStart, T = d.shellTime ?? d.reloadTime;
      return t <= 0 ? 0 : Math.min(0.999, (t % T) / T);
    }
    return Math.min(1, this.reloadT / d.reloadTime);
  }
  /** Progres reload keseluruhan 0..1 (bar HUD); −1 = tidak reload. */
  get reloadTotal() {
    if (this.reloadT < 0) return -1;
    const d = this.def;
    if (d.reload !== 'shell') return Math.min(1, this.reloadT / d.reloadTime);
    const T = d.shellTime ?? d.reloadTime;
    return Math.min(1, this.reloadT / (XW.shellStart + Math.max(1, this.shellGoal) * T));
  }
  /** Sisa animasi angkat senjata 1..0 (0 = siap). */
  get equipFrac() { return this.equipTotal > 0 ? this.equipT / this.equipTotal : 0; }

  /** Loadout: senjata utama + optiknya (slot 1). */
  setLoadout(w: WeaponId, s: ScopeId) { this.primary.set(w, s); }
  /** Pistol + optiknya (slot 2). */
  setPistol(w: WeaponId, s: ScopeId) { this.secondary.set(w, s); }

  /** Spawn: amunisi penuh kedua senjata, kembali ke senjata utama (Q → pistol). */
  refill() {
    this.primary.refill(); this.secondary.refill();
    this.reloadT = -1; this.committed = false; this.slot = 'ar'; this.equipT = 0; this.equipTotal = 0;
    this.hasPrimary = true; this.prevSlot = 'pistol';
    this.shotsThisPull = 0; this.burstInProgress = false; this.adsActive = false; this.adsP = 0;
    this.shotsFired = 0;   // per nyawa: indeks spread ber-seed sama di host & prediksi klien
  }

  /** Ganti slot (senapan / pistol / pisau / granat). Sebelum titik komit: reload batal tanpa transfer. */
  switchTo(slot: Slot, equipTime: number) {
    if (slot === this.slot) return;
    this.cancelReload();
    this.prevSlot = this.slot;
    this.slot = slot; this.equipT = equipTime; this.equipTotal = equipTime;
    this.burstInProgress = false; this.adsActive = false; this.adsP = 0;
  }

  cancelReload() {
    if (this.reloadT < 0) return;
    if (this.def.reload === 'shell' || !this.committed) this.reloadT = -1;   // selongsong yang sudah masuk tetap masuk
    else this.finishReload();
  }

  startReload() {
    const g = this.gun;
    if (!this.holdingGun || this.reloadT >= 0 || g.reserve <= 0 || g.ammo >= g.def.magSize || this.equipT > 0) return;
    this.reloadT = 0; this.committed = false; this.reloadStage = 0; this.burstInProgress = false;
    this.shellN = 0; this.shellGoal = Math.min(g.def.magSize - g.ammo, g.reserve);
    if (g.def.reload === 'shell') bus.emit('reload', { entityId: this.ownerId, stage: 0 });
  }

  private finishReload() {
    if (!this.committed) this.transfer();
    this.reloadT = -1; this.committed = false;
  }

  private transfer() {
    const g = this.gun, need = g.def.magSize - g.ammo, take = Math.min(need, g.reserve);
    g.ammo += take; g.reserve -= take; this.committed = true;
  }

  /** Reload berjalan: magazen (komit 80%, bunyi 3 tahap) atau per selongsong (tiap shellTime setelah shellStart). */
  private stepReload(dt: number) {
    const g = this.gun, d = g.def;
    this.reloadT += dt;
    if (d.reload === 'shell') {
      const T = d.shellTime ?? d.reloadTime;
      while (this.reloadT >= XW.shellStart + (this.shellN + 1) * T && g.ammo < d.magSize && g.reserve > 0) {
        g.ammo++; g.reserve--; this.shellN++;
        bus.emit('reload', { entityId: this.ownerId, stage: 1 });
      }
      if (g.ammo >= d.magSize || g.reserve <= 0) { this.reloadT = -1; bus.emit('reload', { entityId: this.ownerId, stage: 2 }); }
      return;
    }
    const p = this.reloadT / d.reloadTime;
    const stages = [0.25, 0.6, 0.85];
    while (this.reloadStage < 3 && p >= stages[this.reloadStage]) { bus.emit('reload', { entityId: this.ownerId, stage: this.reloadStage as 0 | 1 | 2 }); this.reloadStage++; }
    if (!this.committed && p >= C.reloadCommit) this.transfer();
    if (p >= 1) { this.reloadT = -1; this.committed = false; }
  }

  /**
   * update per frame (waktu game `time`). `fireOne` dipanggil untuk setiap tembakan (spread → raycast → damage → recoil → event;
   * shotgun: semua pellet dalam satu panggilan).
   */
  update(dt: number, time: number, t: TriggerInput, fireOne: () => void): void {
    if (this.wasSprinting && !t.sprinting) this.lastSprintEnd = time;
    this.wasSprinting = t.sprinting;
    if (this.equipT > 0) this.equipT = Math.max(0, this.equipT - dt);
    const g = this.gun, gunOut = this.holdingGun;

    if (t.modeSwitch && gunOut && g.def.modes.length > 1) {
      g.modeIdx = (g.modeIdx + 1) % g.def.modes.length; this.burstInProgress = false;
    }
    // reload selongsong: menembak (masih ada isi) menghentikan reload; tembakan setelah jeda singkat
    if (this.reloadT >= 0 && g.def.reload === 'shell' && t.pressed && g.ammo > 0) {
      this.reloadT = -1;
      g.nextShot = Math.max(g.nextShot, time + XW.shellInterrupt);
    }
    // reload: komit 80% (magazen), tetap berjalan saat sprint
    if (this.reloadT >= 0) this.stepReload(dt);
    if (t.reload) this.startReload();
    // bunyi kokang pompa/bolt (sekali per tembakan, saat animasi mulai)
    if (time >= g.cycleAt) { g.cycleAt = Infinity; if (gunOut) bus.emit('cycle', { entityId: this.ownerId, kind: g.def.action === 'bolt' ? 'bolt' : 'pump' }); }

    // ADS tidak bisa selama reload, sprint, atau tanpa senjata api; progres optik mengikuti waktu ADS senjata/optik
    this.adsActive = t.ads && gunOut && this.reloadT < 0 && !t.sprinting;
    const adsT = adsTimeOf(g.def, g.scope);
    this.adsP = Math.min(1, Math.max(0, this.adsP + (this.adsActive ? dt : -dt) / adsT));
    if (!gunOut || this.equipT > 0) { this.burstInProgress = false; return; }

    const mode = g.mode, interval = 60 / g.def.rpm;
    if (t.pressed && !this.burstInProgress) {
      this.shotsThisPull = 0;
      if (time > g.nextShot) g.nextShot = time;
      if (g.ammo === 0) {
        if (g.reserve > 0) this.startReload(); else bus.emit('dryfire', { entityId: this.ownerId });
      }
    }
    // auto reload 0.25 s setelah peluru terakhir bila tombol masih ditahan
    if (g.ammo === 0 && t.held && this.reloadT < 0) {
      this.emptyHoldT += dt;
      if (this.emptyHoldT >= C.autoReloadDelay && g.reserve > 0) this.startReload();
    } else this.emptyHoldT = 0;

    if (this.reloadT >= 0 || t.sprinting) { this.burstInProgress = false; return; }
    if (time < this.lastSprintEnd + sprintToFireOf(g.def)) return; // sprint-to-fire (GDD 0.12 s; SMG 0.08 s)

    const limit = mode === 'AUTO' ? Infinity : mode === 'SINGLE' ? 1 : burstSize(mode);
    const wantFire = t.held || this.burstInProgress;
    if (time - g.nextShot > 0.25) g.nextShot = time; // jangan "mengejar" setelah jeda panjang
    while (wantFire && time >= g.nextShot && g.ammo > 0 && this.shotsThisPull < limit) {
      g.ammo--; this.shotsFired++;
      g.lastShot = time;
      if (g.def.action === 'pump' || g.def.action === 'bolt') g.cycleAt = time + XW.cycleDelay;
      fireOne();
      this.shotsThisPull++;
      const burstDone = mode.startsWith('BURST') && this.shotsThisPull === limit;
      this.burstInProgress = mode.startsWith('BURST') && !burstDone;
      g.nextShot += mode === 'SINGLE' ? Math.max(interval, C.singleMinInterval)
        : burstDone ? Math.max(interval, C.burstDelay) : interval;
    }
    if (g.ammo === 0) this.burstInProgress = false;
  }
}

