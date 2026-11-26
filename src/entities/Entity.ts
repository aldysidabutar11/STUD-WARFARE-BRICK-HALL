// src/entities/Entity.ts — entitas karakter (pemain atau bot): rig + KCC + senjata + status tempur
import type { RemoteHuman } from '../net/NetMatch';
import * as THREE from 'three';
import { CFG } from '../config/gameConfig';
import { moveMultOf } from '../combat/weaponStats';
import { MELEES } from '../config/weaponsExtra';
import type { Loadout } from '../combat/Loadout';
import { DEFAULT_LOADOUT } from '../combat/Loadout';
import type { WeaponId } from '../config/weaponsData';
import { BlockyCharacter, type PartKey, type Team } from './BlockyCharacter';
import type { Variant } from './CharacterArt';
import { PlayerController, type MoveIntent } from './PlayerController';
import { WeaponSystem } from '../combat/WeaponSystem';
import { Recoil } from '../combat/Recoil';
import { WEAPON_MATERIAL, createOpticMesh, weaponModel } from '../combat/WeaponModels';
import type { TacticalBot } from './TacticalBot';
import type { MeleeKind } from '../core/EventBus';
import type { FlashExposure, NadeKind } from '../combat/Flash';

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
  /** Flashbang (XCFG.flash.perLife per nyawa) & jenis benda lempar yang sedang dipegang / dimasak (state machine granat). */
  flashes = 1;
  nadeKind: NadeKind = 'frag';
  /** Silau flashbang: paparan & waktu ledakan (ctx.time), pelempar & kekuatan (assist flash). blindX null = tidak silau. */
  blindX: FlashExposure | null = null;
  blindAt = -1e9;
  flashedBy = 0;
  flashS = 0;
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
  loadout: Loadout = { ...DEFAULT_LOADOUT };
  pendingLoadout: Loadout | null = null;
  bot: TacticalBot | null = null;
  /** ADS yang diinginkan pemilik input (tahan/toggle sudah di-resolve) — PlayerActions. */
  adsWanted = false;
  /** Host online: manusia di perangkat lain, digerakkan perintah jaringan (net/NetMatch). */
  remote: RemoteHuman | null = null;
  /** Klien online: entitas bukan milik kita — keadaan dari snapshot host (tanpa fisika/AI lokal). */
  puppet = false;
  /** Online: ping ke host (ms); −1 = bot, −2 = host (papan skor). */
  ping = -1;
  /** Debug: dummy/stress di posisi tetap (respawn di tempat). */
  dummyAt: THREE.Vector3 | null = null;
  lastAttacker = -1;
  readonly worldGun: THREE.Mesh;
  private worldOptic: THREE.Mesh | null = null;
  /** Pistol (slot 2) di tangan karakter dunia. */
  readonly worldPistol: THREE.Mesh;
  private pistolOptic: THREE.Mesh | null = null;
  readonly renderPos = new THREE.Vector3();

  constructor(readonly id: number, readonly name: string, readonly team: Team, readonly isPlayer: boolean, castShadow: boolean,
    variant: Variant = 'm') {
    this.char = new BlockyCharacter(id, team, castShadow, variant);
    this.ctrl = new PlayerController(id, 0, -100 - id * 10, 0, team);
    this.ctrl.setEnabled(false);
    this.weapon = new WeaponSystem(id);
    this.worldGun = new THREE.Mesh(new THREE.BufferGeometry(), WEAPON_MATERIAL);
    this.worldGun.castShadow = castShadow;
    this.worldGun.rotation.x = -Math.PI / 2; // sumbu −Z senjata searah lengan (−Y mount)
    this.char.setGun(this.worldGun);
    this.worldPistol = new THREE.Mesh(new THREE.BufferGeometry(), WEAPON_MATERIAL);
    this.worldPistol.castShadow = castShadow;
    this.worldPistol.rotation.x = -Math.PI / 2;
    this.char.setPistol(this.worldPistol);
    this.char.setVisible(false);
  }

  /** Loadout (senjata utama + pistol) ke sistem senjata & model dunia di tangan karakter. */
  applyLoadout(l: Loadout) {
    this.loadout = { ...l };
    this.weapon.setLoadout(l.weapon, l.scope);
    this.weapon.setPistol(l.pistol, l.pscope);
    this.weapon.melee = l.melee; this.char.setMelee(l.melee);
    this.worldOptic = Entity.dress(this.worldGun, this.worldOptic, l.weapon, l.scope);
    this.pistolOptic = Entity.dress(this.worldPistol, this.pistolOptic, l.pistol, l.pscope);
  }

  /** Pasang geometri senjata + optik (lama dilepas) pada mesh dunia; mengembalikan mesh optik baru. */
  private static dress(gun: THREE.Mesh, old: THREE.Mesh | null, id: WeaponId, scope: Loadout['scope']): THREE.Mesh | null {
    const m = weaponModel(id, scope === 'iron');
    gun.geometry = m.geometry;
    if (old) gun.remove(old);
    const optic = createOpticMesh(scope);
    if (optic) {
      optic.position.z = m.opticMount.z; optic.position.y = m.opticMount.y - 0.38;
      optic.castShadow = gun.castShadow; // kaca (anak) tidak membuat bayangan
      const mask = gun.layers.mask; // pemain lokal: ikut layer 1 (tidak mengambang di kamera FPS), termasuk kaca
      optic.traverse(o => { o.layers.mask = mask; });
      gun.add(optic);
    }
    return optic;
  }

  /** Pengali kecepatan gerak dari benda di tangan: senjata jarak dekat (pisau ×1.10, karambit ×1.12 …), senjata api = moveMult
   *  senjatanya (AR GDD 1.0). */
  get moveMult() {
    const w = this.weapon;
    return w.slot === 'knife' ? MELEES[w.melee].moveMult : w.holdingGun ? moveMultOf(w.def) : 1;
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

  /** Posisi muzzle visual senjata dunia yang sedang dipegang (kosmetik untuk tracer/flash di TPS & bot). */
  muzzleWorld(out: THREE.Vector3) {
    const pistol = this.weapon.slot === 'pistol';
    const m = pistol ? weaponModel(this.loadout.pistol, this.loadout.pscope === 'iron') : weaponModel(this.loadout.weapon, this.loadout.scope === 'iron');
    return (pistol ? this.worldPistol : this.worldGun).localToWorld(out.copy(m.muzzle));
  }

  distanceTo(o: Entity) { return _v.copy(this.pos).sub(o.pos).length(); }
}
