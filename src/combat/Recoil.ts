// src/combat/Recoil.ts — hentakan kamera & pemulihan sadar-kompensasi (GDD §7.1–7.2; key CFG.combat.recoil.* §15.2)
import { CFG } from '../config/gameConfig';
import type { WeaponDef } from '../config/weaponsData';

const R = CFG.combat.recoil;

export class Recoil {
  shotIndex = 0;
  lastShot = -1;
  recoilPitch = 0; // derajat sisa recoil yang belum dikompensasi

  reset() { this.shotIndex = 0; this.lastShot = -1; this.recoilPitch = 0; }

  /** Mengembalikan [ΔPitch, ΔYaw] dalam derajat (ΔYaw acak ±RecoilHorz). */
  onFire(now: number, w: WeaponDef, stanceMult: number, out: { dPitch: number; dYaw: number }) {
    if (now - this.lastShot > R.resetTime) this.shotIndex = 0; // 0.25 s
    const m = stanceMult * R.scale;
    const kick = w.recoilVert * (1 + Math.min(this.shotIndex * R.ramp, R.rampMax)) * m;
    this.recoilPitch += kick;
    out.dPitch = kick;
    out.dYaw = (Math.random() * 2 - 1) * w.recoilHorz * m;
    this.shotIndex++; this.lastShot = now;
    return out;
  }

  /** Input mouse ke bawah lebih dulu "memakan" sisa recoil. dPitchDeg negatif = menurunkan bidikan. */
  onMouseLook(dPitchDeg: number) {
    if (dPitchDeg < 0 && this.recoilPitch > 0) this.recoilPitch = Math.max(0, this.recoilPitch + dPitchDeg);
  }

  /** Pemulihan (derajat, ≤ 0) yang harus diterapkan ke pitch frame ini. */
  update(dt: number, now: number, w: WeaponDef): number {
    if (this.recoilPitch > 0 && now - this.lastShot > R.recoveryDelay) { // 0.1 s
      const r = Math.min(this.recoilPitch, R.recoveryRate * w.recoveryMult * dt); // 14°/s (G36C ×1.3)
      this.recoilPitch -= r;
      return -r;
    }
    return 0;
  }
}

/** Pengali recoil sikap (GDD §7.2); LMG punya bonus jongkok sendiri (crouchRecoil 0.60). */
export function stanceMult(crouched: boolean, airborne: boolean, w?: WeaponDef) {
  return airborne ? R.stance.air : crouched ? (w?.crouchRecoil ?? R.stance.crouch) : R.stance.stand;
}
