// src/ui/CharPreview.ts — pratinjau karakter 3D di layar Loadout (permintaan pengguna 2026-11-25: "di samping panel pilihan senjata
// terdapat tampilan karakter pria seperti apa, dan saat klik wanita muncul karakter wanita"). Kanvas + WebGLRenderer kecil tersendiri
// (latar transparan; tone mapping & eksposur sama dengan game) yang hanya dirender selama Loadout tampil. Karakter = BlockyCharacter
// asli (atlas & geometri yang sama dengan di match) memegang senjata + optik pilihan, berputar pelan; seret untuk memutar sendiri.
import * as THREE from 'three';
import { XCFG } from '../config/extraConfig';
import type { ScopeId, WeaponId } from '../config/weaponsData';
import { BlockyCharacter, type AnimState, type Team } from '../entities/BlockyCharacter';
import type { Variant } from '../entities/CharacterArt';
import { WEAPON_MATERIAL, createOpticMesh, weaponModel } from '../combat/WeaponModels';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

/** Pose santai: senapan diturunkan (low-ready) — lengan tidak menutupi badan & wajah, pakaian terlihat utuh. */
const IDLE: AnimState = { speed: 0, sprinting: false, crouchT: 0, airborne: false, pitch: 0, reload: -1, throwPose: NaN,
  lowReady: true, melee: -1, held: 'ar', knife: -1 };

interface Rig { char: BlockyCharacter; gun: THREE.Mesh; optic: THREE.Object3D | null; gunKey: string }

export class CharPreview {
  /** Elemen yang dipasang di menu (kanvas + teks bila WebGL tidak tersedia). */
  readonly el = document.createElement('div');
  private readonly canvas = document.createElement('canvas');
  private renderer: THREE.WebGLRenderer | null = null;
  private failed = false;
  private readonly scene = new THREE.Scene();
  private readonly cam = new THREE.PerspectiveCamera(26, 0.7, 0.5, 100);
  /** Satu karakter per tim (ganti pria/wanita = setVariant, seketika). */
  private readonly rigs = new Map<Team, Rig>();
  private cur: Rig | null = null;
  /** Depan karakter = −Z lokal, kamera di +Z → yaw π menghadap kamera; mulai dari tampak depan 3/4. */
  private yaw = Math.PI - 0.55;
  private drag: { x: number; yaw: number } | null = null;
  private idleAt = 0;
  private raf = 0;
  private last = 0;
  /** Zoom 0 = seluruh badan … 1 = wajah dari dekat (gulir / klik dua kali); zoomS = nilai halus yang dipakai kamera. */
  private zoom = 0;
  private zoomS = 0;
  /** Material senjata khusus pratinjau dengan pantulan studio sendiri. Dulu lewat scene.environment — three r186 ikut
   *  menerapkannya ke material Lambert karakter (warna × cahaya ruang studio) → kulit & kain tampak pucat/putih. */
  private readonly gunMat = WEAPON_MATERIAL.clone();

  constructor() {
    this.el.className = 'char-preview';
    this.el.appendChild(this.canvas);
    // cahaya studio: langit/lantai lembut + utama (depan kanan atas) + pengisi (depan kiri) + tepi biru dari belakang
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x4a3a2c, 2.2));
    const key = new THREE.DirectionalLight(0xfff0dd, 2.8); key.position.set(5, 8, 10); this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xdbe7ff, 1.1); fill.position.set(-7, 4, 8); this.scene.add(fill);
    const rim = new THREE.DirectionalLight(0xa9cfff, 1.8); rim.position.set(-4, 6, -9); this.scene.add(rim);
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(1.9, 40), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35 }));
    shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.01;
    this.scene.add(shadow);
    // seluruh badan + lengan + senapan masuk bingkai (tinggi karakter ±5 u, kotak ±250 × 340 px)
    this.cam.position.set(0, 3.0, 17.5);
    this.cam.lookAt(0, 2.45, 0);
    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => { this.drag = { x: e.clientX, yaw: this.yaw }; c.setPointerCapture(e.pointerId); });
    c.addEventListener('pointermove', (e) => { if (this.drag) this.yaw = this.drag.yaw + (e.clientX - this.drag.x) * 0.012; });
    const end = () => { this.drag = null; this.idleAt = performance.now(); };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
    // zoom ke wajah: gulir (roda mouse / dua jari) atau klik dua kali (bolak-balik badan ↔ wajah)
    c.addEventListener('wheel', (e) => { e.preventDefault(); this.zoom = Math.min(1, Math.max(0, this.zoom - e.deltaY * 0.0015)); this.idleAt = performance.now(); }, { passive: false });
    c.addEventListener('dblclick', () => { this.zoom = this.zoom > 0.5 ? 0 : 1; this.idleAt = performance.now(); });
  }

  /** Karakter yang ditampilkan: tim (pakaian), varian (pria/wanita), senjata + optik di tangan. */
  set(team: Team, variant: Variant, weapon: WeaponId, scope: ScopeId) {
    let rig = this.rigs.get(team);
    if (!rig) {
      const char = new BlockyCharacter(-1, team, false, variant);
      const gun = new THREE.Mesh(new THREE.BufferGeometry(), this.gunMat);
      gun.rotation.x = -Math.PI / 2;   // sumbu −Z senjata searah lengan (−Y mount), sama dengan Entity
      char.setGun(gun);
      rig = { char, gun, optic: null, gunKey: '' };
      this.rigs.set(team, rig);
    }
    rig.char.setVariant(variant);
    const gk = weapon + '|' + scope;
    if (gk !== rig.gunKey) {
      rig.gunKey = gk;
      const m = weaponModel(weapon, scope === 'iron');
      rig.gun.geometry = m.geometry;
      if (rig.optic) { rig.gun.remove(rig.optic); rig.optic = null; }
      rig.optic = createOpticMesh(scope);
      if (rig.optic) {
        rig.optic.position.z = m.opticMount.z; rig.gun.add(rig.optic);
        rig.optic.traverse(o => { if (o instanceof THREE.Mesh && o.material === WEAPON_MATERIAL) o.material = this.gunMat; });
      }
    }
    if (rig !== this.cur) {
      if (this.cur) this.scene.remove(this.cur.char.root);
      this.scene.add(rig.char.root);
      this.cur = rig;
    }
  }

  /** Mulai render (Loadout tampil); false bila WebGL untuk pratinjau tidak tersedia (kotak menampilkan teks). */
  start(): boolean {
    if (!this.ensure()) { this.el.classList.add('fail'); return false; }
    if (!this.raf) { this.last = performance.now(); this.raf = requestAnimationFrame(this.frame); }
    return true;
  }

  stop() { if (this.raf) cancelAnimationFrame(this.raf); this.raf = 0; }

  private ensure(): boolean {
    if (this.renderer) return true;
    if (this.failed) return false;
    try {
      const r = new THREE.WebGLRenderer({ canvas: this.canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
      r.toneMapping = THREE.ACESFilmicToneMapping;
      r.toneMappingExposure = XCFG.gfx.exposure;
      r.setClearColor(0x000000, 0);
      this.canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); });
      // pantulan lingkungan studio HANYA untuk material senjata PBR (logam tanpa lingkungan tampak hitam); bukan scene.environment
      const pm = new THREE.PMREMGenerator(r);
      this.gunMat.envMap = pm.fromScene(new RoomEnvironment(), 0.04).texture; this.gunMat.needsUpdate = true;
      pm.dispose();
      this.renderer = r;
      return true;
    } catch { this.failed = true; return false; }
  }

  private readonly frame = (now: number) => {
    // menu ditutup / digambar ulang tanpa pratinjau → berhenti (tidak membebani GPU di belakang)
    if (!this.el.isConnected) { this.raf = 0; return; }
    this.raf = requestAnimationFrame(this.frame);
    const r = this.renderer, rig = this.cur;
    if (!r || !rig) return;
    // dt ≥ 0: stempel waktu rAF bisa sedikit lebih awal dari performance.now() saat start() → dt negatif membuat transisi
    // pose (damp) meledak di frame pertama (Venny: lengan & kepala berputar liar sesaat)
    const dt = Math.min(0.05, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight, pr = Math.min(2, window.devicePixelRatio || 1);
    if (w && h && (this.canvas.width !== Math.round(w * pr) || this.canvas.height !== Math.round(h * pr))) {
      r.setPixelRatio(pr); r.setSize(w, h, false);
      this.cam.aspect = w / h; this.cam.updateProjectionMatrix();
    }
    if (!this.drag && now - this.idleAt > 1500 && this.zoom < 0.5) this.yaw += 0.4 * dt;   // putar pelan saat tidak diseret
    rig.char.root.rotation.y = this.yaw;
    // kamera: seluruh badan (17.5 u) ↔ wajah (4.2 u), halus
    this.zoomS += (this.zoom - this.zoomS) * (1 - Math.exp(-10 * dt));
    const z = this.zoomS * this.zoomS * (3 - 2 * this.zoomS);
    this.cam.position.set(0, 3.0 + 1.55 * z, 17.5 - 13.3 * z);
    this.cam.lookAt(0, 2.45 + 2.0 * z, 0);
    rig.char.update(dt, IDLE);
    r.render(this.scene, this.cam);
  };
}
