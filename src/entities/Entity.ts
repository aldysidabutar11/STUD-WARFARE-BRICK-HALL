// src/entities/Entity.ts — entitas karakter (pemain atau bot): rig + KCC + senjata + status tempur
import type { RemoteHuman } from '../net/NetMatch';
import * as THREE from 'three';
import { CFG } from '../config/gameConfig';
import type { ScopeId, WeaponId } from '../config/weaponsData';
import { BlockyCharacter, type PartKey, type Team } from './BlockyCharacter';
import type { Variant } from './CharacterArt';
import { PlayerController, type MoveIntent } from './PlayerController';
import { WeaponSystem } from '../combat/WeaponSystem';
import { Recoil } from '../combat/Recoil';
import { WEAPON_MATERIAL, createOpticMesh, weaponModel } from '../combat/WeaponModels';
import type { TacticalBot } from './TacticalBot';
import type { MeleeKind } from '../core/EventBus';

export interface Stats {
  kills: number; deaths: number; assists: number; score: number; shots: number; hits: number; hsHits: number; hsKills: number;
  damage: number; bestStreak: number;
}
export const newStats = (): Stats => ({ kills: 0, deaths: 0, assists: 0, score: 0, shots: 0, hits: 0, hsHits: 0, hsKills: 0, damage: 0, bestStreak: 0 });
export type GrenadeState = 'NONE' | 'EQUIP' | 'READY' | 'COOKING' | 'THROWN';

const _v = new THREE.Vector3();

export class Entity {
  readonly char: BlockyCharacter;
  readonly ctrl: PlayerController;
  readonly weapon: WeaponSystem;
  readonly recoil = new Recoil();
  readonly intent: MoveIntent = { ix: 0, iz: 0, yaw: 0, jump: false, sprint: false, crouch: false, ads: false, cooking: false, wantFire: false,
    speedMult: 1 };
  hp: number = CFG.player.hp;
  alive = false;
  protectT = 0;
  respawnT = 0;
  lastDamageT = -99;
  yaw = 0; pitch = 0;          // rad
  grenades = 1;
  grenadeState: GrenadeState = 'NONE';
  grenadeT = 0;                // timer state granat
  cookT = 0;                   // waktu sumbu berjalan
  throwOver = true;
  throwAnimT = -1;             // animasi lempar (s sejak lepas)
  stats: Stats = newStats();
  /** Kill beruntun sejak spawn terakhir (medali streak). */
  streak = 0;
  /** Kontribusi damage musuh per penyerang (assist & kredit kill jatuh). */
  readonly dmgBy = new Map<number, { dmg: number; t: number }>();
  // serangan jarak dekat (popor / pisau): meleeT = waktu sejak mulai (−1 = tidak), meleeCd = jeda sisa
  meleeT = -1; meleeCd = 0; meleeHit = false;
  meleeKind: MeleeKind = 'butt';
  /** Tebasan pisau bergantian: false = kanan→kiri, true = balik kiri→kanan (reset setelah jeda). */
  slashAlt = true; lastSlashT = -99;
  loadout: { weapon: WeaponId; scope: ScopeId } = { weapon: 'm416', scope: 'reddot' };
  pendingLoadout: { weapon: WeaponId; scope: ScopeId } | null = null;
  bot: TacticalBot | null = null;
  /** ADS yang diinginkan pemilik input (tahan/toggle sudah di-resolve) — PlayerActions. */
  adsWanted = false;
  /** Host online: manusia di perangkat lain, digerakkan perintah jaringan (net/NetMatch). */
  remote: RemoteHuman | null = null;
  /** Klien online: entitas bukan milik kita — keadaan dari snapshot host (tanpa fisika/AI lokal). */
  puppet = false;
  /** Debug: dummy/stress di posisi tetap (respawn di tempat). */
  dummyAt: THREE.Vector3 | null = null;
  lastAttacker = -1;
  readonly worldGun: THREE.Mesh;
  private worldOptic: THREE.Mesh | null = null;
  readonly renderPos = new THREE.Vector3();

  constructor(readonly id: number, readonly name: string, readonly team: Team, readonly isPlayer: boolean, castShadow: boolean,
    variant: Variant = 'm') {
    this.char = new BlockyCharacter(id, team, castShadow, variant);
    this.ctrl = new PlayerController(id, 0, -100 - id * 10, 0);
    this.ctrl.setEnabled(false);
    this.weapon = new WeaponSystem(id);
    this.worldGun = new THREE.Mesh(new THREE.BufferGeometry(), WEAPON_MATERIAL);
    this.worldGun.castShadow = castShadow;
    this.worldGun.rotation.x = -Math.PI / 2; // sumbu −Z senjata searah lengan (−Y mount)
    this.char.setGun(this.worldGun);
    this.char.setVisible(false);
  }

  applyLoadout(l: { weapon: WeaponId; scope: ScopeId }) {
    this.loadout = { ...l };
    this.weapon.setLoadout(l.weapon, l.scope);
    const m = weaponModel(l.weapon, l.scope === 'iron');
    this.worldGun.geometry = m.geometry;
    if (this.worldOptic) { this.worldGun.remove(this.worldOptic); this.worldOptic = null; }
    this.worldOptic = createOpticMesh(l.scope);
    if (this.worldOptic) {
      this.worldOptic.position.z = m.opticMount.z;
      this.worldOptic.castShadow = this.worldGun.castShadow; // kaca (anak) tidak membuat bayangan
      const mask = this.worldGun.layers.mask; // pemain lokal: ikut layer 1 (tidak mengambang di kamera FPS), termasuk kaca
      this.worldOptic.traverse(o => { o.layers.mask = mask; });
      this.worldGun.add(this.worldOptic);
    }
  }

  get pos() { return this.ctrl.pos; }
  get crouched() { return this.ctrl.crouched; }
  get airborne() { return !this.ctrl.grounded; }

  /** Titik mata = pusat kepala + 0.2 ke depan menurut yaw (P_fire §9.3). */
  eye(out: THREE.Vector3) {
    return out.set(this.pos.x - Math.sin(this.yaw) * CFG.player.eyeForward, this.pos.y + this.ctrl.eyeHeight,
      this.pos.z - Math.cos(this.yaw) * CFG.player.eyeForward);
  }

  /** Arah bidik (yaw, pitch) unit. */
  aimDir(out: THREE.Vector3) {
    const cp = Math.cos(this.pitch);
    return out.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
  }

  /** Pusat bagian tubuh (dunia) dari rig saat ini. */
  partCenter(key: PartKey, out: THREE.Vector3) { return this.char.parts[key].getWorldPosition(out); }

  /** Pusat kapsul (berdiri Y + 2.5, jongkok + 1.85) — dipakai rumus granat §8.2. */
  capsuleCenter(out: THREE.Vector3) {
    return out.set(this.pos.x, this.pos.y + (this.crouched ? CFG.player.crouchHeight / 2 : CFG.player.standHeight / 2), this.pos.z);
  }

  /** Posisi muzzle visual senjata dunia (kosmetik untuk tracer/flash di TPS & bot). */
  muzzleWorld(out: THREE.Vector3) {
    const m = weaponModel(this.loadout.weapon, this.loadout.scope === 'iron');
    return this.worldGun.localToWorld(out.copy(m.muzzle));
  }

  distanceTo(o: Entity) { return _v.copy(this.pos).sub(o.pos).length(); }
}
