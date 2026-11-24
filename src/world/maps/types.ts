// src/world/maps/types.ts — KONTRAK multi-map (Brick Hall, Steel Yard, …). Setiap map menyediakan MapDef; modul game membaca map
// AKTIF lewat registry (`currentMap()` di registry.ts), BUKAN mengimpor data Brick Hall langsung. Ganti map = bongkar map lama
// (`BuiltMap.dispose()`) lalu bangun map baru saat match dimulai — tanpa reload halaman (penting untuk room online WebRTC).
import type * as THREE from 'three';
import type { Preset, PresetName } from '../../config/gameConfig';
import type { SurfaceMaterial } from '../../core/EventBus';
import type { Box, SpawnFloor, Stair } from '../MapData';
import type { EdgeKind } from '../NavGraph';

export type MapId = 'brickhall' | 'steelyard';
/** Urutan tampil di menu. */
export const MAP_IDS: readonly MapId[] = ['brickhall', 'steelyard'];

/** Template graf navigasi (gaya GDD §11.6). {H} = S (Biru, Z negatif) / N (Merah, Z positif); {X} = W (X negatif) / E;
 *  awalan C_ = garis tengah Z = 0. Koordinat ditulis untuk H=S, X=W lalu dicerminkan otomatis (N: z → −z, E: x → −x). */
export interface NavTemplate {
  /** [nama, x, z, level y lantai (0 = lantai dasar, 10 = lantai 2 Brick Hall)] */
  nodes: [string, number, number, number][];
  edges: [string, string, EdgeKind][];
  /** Drop satu arah (opsional): [takeoff, landing, id balok pendaratan tanpa sufiks sisi]. */
  drops?: [string, string, string][];
  /** Node yang dianggap posisi berlindung. */
  cover: string[];
}

/** Jalur bot (GDD §11.1/§11.7) — bobot pemilihan + rute node yang sudah diekspansi untuk tim di sisi `own`. */
export interface LaneDef {
  id: string;
  weight: number;
  /** x = posisi X bot saat rute dimulai (opsional). Map dengan spawn di sudut (Steel Yard) memakai sisi W/E bot sendiri;
   *  Brick Hall (spawn di tengah) mengabaikannya & tetap mengundi W/E. */
  route(own: 'S' | 'N', x?: number): string[];
}

/** Suasana: kabut & latar. Map luar ruang membangun langit/pegunungan sendiri di builder. */
export interface Atmosphere {
  outdoor: boolean;
  fogColor: number;
  fogDensity: number;
  /** Warna latar scene bila tidak ada langit (indoor). */
  background: number;
  /** Bloom HIGH+ (opsional; bawaan XCFG.gfx.bloom). Luar ruang: langit terang di atas ambang dalam ruang → ambang lebih tinggi. */
  bloom?: { threshold: number; strength: number };
}

/** Hasil membangun map ke scene. Semua objek, collider, lampu & tekstur yang dibuat builder WAJIB dilepas di dispose(). */
export interface BuiltMap {
  group: THREE.Group;
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  triangles: number;
  colliders: number;
  /** Medan cahaya hasil bake (probe karakter + shader bakedMaterial). */
  light: import('../LightBake').LightField;
  /** Rak Brick Hall untuk buku fisika (Props) & stress test; map lain: []. */
  shelves: import('../BrickHallBuilder').ShelfInfo[];
  /** Partikel/berkas cahaya opsional (uniform uTime diperbarui Game). */
  dust: THREE.Points | null;
  shafts: THREE.Mesh | null;
  /** Lepas semua: mesh/geometri/material/tekstur, collider Rapier, lampu, objek tambahan. */
  dispose(): void;
}

export interface MapDef {
  id: MapId;
  /** Nama tampil, mis. "Brick Hall", "Steel Yard". */
  name: string;
  /** Satu kalimat deskripsi untuk menu / room. */
  desc: string;
  /** Batas area bermain (minimap, kamera menu, validasi). */
  bounds: { x: [number, number]; z: [number, number] };
  /** Semua balok collider statis + dasar visual. Box.rotY (opsional, radian) = putaran di pusat balok. */
  boxes: Box[];
  stairs: Stair[];
  /** Slot spawn per tim & lantai; lantai yang tidak ada = array kosong (SpawnSystem jatuh ke lantai lain). */
  spawnSlots: Record<'blue' | 'red', Record<SpawnFloor, [number, number, number][]>>;
  nav: NavTemplate;
  lanes: LaneDef[];
  surfaceAt(x: number, y: number, z: number): SurfaceMaterial;
  /** true = surfaceAt membedakan permukaan per BENDA (dinding/atap kontainer, prop) → material pantulan granat dicari di titik
   *  kontak (raycast pendek dari pusat granat). Bawaan (Brick Hall: permukaan lantai per wilayah) = pusat granat. */
  contactSurface?: boolean;
  zoneName(x: number, y: number, z: number): string;
  /** Mode Latihan: [x, y, z, bergerak kiri-kanan]. Dummy tim Merah. */
  practice: [number, number, number, boolean][];
  /** Kamera menu mengorbit `look` dengan jari-jari rx/rz pada ketinggian y. */
  menuCam: { look: [number, number, number]; rx: number; rz: number; y: number };
  /** Posisi CubeCamera untuk peta lingkungan (pantulan PBR). */
  envProbe: [number, number, number];
  atmosphere: Atmosphere;
  /** Data buku fisika (Props) — hanya Brick Hall. */
  props?: {
    bookPiles: [number, number][];
    floorArea: { x: [number, number]; z: [number, number] };
    groundObstacles(): { x: [number, number]; z: [number, number]; top: number }[];
  };
  /** Bangun mesh + collider + lampu + bake cahaya ke scene. */
  build(scene: THREE.Scene, preset: Preset, presetName: PresetName, aniso: number): BuiltMap;
}
