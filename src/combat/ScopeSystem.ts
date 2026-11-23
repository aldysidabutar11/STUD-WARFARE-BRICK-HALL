// src/combat/ScopeSystem.ts — FOV ADS, sensitivitas, overlay lensa, kunci Groza (GDD §6, §6.1)
import { CFG } from '../config/gameConfig';
import type { CameraRig } from '../entities/CameraRig';
import type { Entity } from '../entities/Entity';
import { sensRatio } from './Damage';

export class ScopeSystem {
  /** progres ADS 0..1 (untuk viewmodel), linier terhadap waktu transisi optik. */
  ads = 0;
  lensOn = false;
  dotOn = false;

  update(dt: number, p: Entity, rig: CameraRig, baseFov: number) {
    const s = p.weapon.scope, on = p.weapon.adsActive;
    this.ads = Math.min(1, Math.max(0, this.ads + (on ? 1 : -1) * dt / s.adsTime));
    rig.baseFov = baseFov;
    // optik ≥2× di TPS: otomatis masuk tampilan lensa FPS selama ADS
    rig.lensForced = on && s.lensOverlay && rig.mode === 'tps';
    rig.setFovTarget(on ? s.fov : baseFov, s.adsTime);
    this.lensOn = on && s.lensOverlay && this.ads > 0.6;
    this.dotOn = on && !s.lensOverlay && (s.id === 'reddot' || s.id === 'holo') && this.ads > 0.5;
  }

  /** Pengali lengan TPS saat ADS optik 1× (×0.6). */
  armScale(p: Entity) { return p.weapon.adsActive && !p.weapon.scope.lensOverlay ? CFG.camera.tpsAdsArmScale : 1; }

  /** S_ADS = S_hip × tan(FOV_ADS/2)/tan(FOV_base/2) × pengaliADS (FOV dasar aktual). */
  sensMult(p: Entity, baseFov: number, adsMult: number) {
    return p.weapon.adsActive ? sensRatio(p.weapon.scope.fov, baseFov, adsMult) : 1;
  }
}
