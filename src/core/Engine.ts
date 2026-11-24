// src/core/Engine.ts — WebGLRenderer, preset kualitas, resize, context-loss (GDD §2.1–2.3, §9.1)
import * as THREE from 'three';
import { CFG, type Preset, type PresetName } from '../config/gameConfig';
import { gfxOf, presetOf, type GfxProfile } from '../config/presets';
import { PostFX } from './PostFX';
import { XCFG } from '../config/extraConfig';
import { DynamicResolution } from './DynamicResolution';
import { FramePacing } from './FramePacing';
import { GpuTimer } from './GpuTimer';

/** Geometri kecil (posisi + normal + uv) untuk mengompilasi material yang belum punya mesh di scene. */
const WARM_GEO = new THREE.BoxGeometry(0.01, 0.01, 0.01);

export class Engine {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly vmScene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly vmCamera: THREE.PerspectiveCamera;
  readonly preset: Preset;
  /** Fitur grafik preset ini (PBR, pantulan, bloom, SSAO, ...). */
  readonly gfx: GfxProfile;
  /** Pasca-proses (HIGH/ULTRA); null = render langsung dengan tone mapping. */
  readonly post: PostFX | null = null;
  readonly dynRes: DynamicResolution;
  /** Kehalusan frame (refresh layar, % tepat waktu) — diisi tiap frame dari interval requestAnimationFrame. */
  readonly pacing = new FramePacing();
  /** Waktu GPU per frame (query timer WebGL2) — aktif saat dibutuhkan. */
  readonly gpu: GpuTimer;
  showViewmodel = false;
  contextLost = false;
  maxAnisotropy = 1;

  constructor(readonly canvas: HTMLCanvasElement, readonly presetName: PresetName) {
    this.preset = presetOf(presetName);
    this.gfx = gfxOf(presetName);
    // pasca-proses memakai target ber-MSAA sendiri → antialias kanvas tidak perlu
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: this.preset.antialias && !this.gfx.post, powerPreference: 'high-performance' });
    // tone mapping ala film (ACES) + eksposur: highlight lembut, bayangan kaya (semua preset)
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = XCFG.gfx.exposure;
    this.renderer.autoClear = false;
    this.renderer.info.autoReset = false;
    this.renderer.shadowMap.enabled = this.preset.shadowMap > 0;
    this.renderer.shadowMap.type = THREE.PCFShadowMap; // PCFSoftShadowMap deprecated sejak r186
    this.maxAnisotropy = Math.min(this.preset.anisotropy, this.renderer.capabilities.getMaxAnisotropy());
    this.gpu = new GpuTimer(this.renderer.getContext() as WebGL2RenderingContext);
    this.camera = new THREE.PerspectiveCamera(CFG.camera.baseFov, innerWidth / innerHeight, CFG.camera.near, CFG.camera.far);
    this.camera.rotation.order = 'YXZ';
    this.vmCamera = new THREE.PerspectiveCamera(CFG.camera.viewmodelFov, innerWidth / innerHeight, XCFG.viewmodel.near, XCFG.viewmodel.far);
    this.scene.background = new THREE.Color(0x2a1d14);
    this.dynRes = new DynamicResolution(this.renderer, this.preset, this.pacing, this.gpu);
    this.resize();
    if (this.gfx.post) this.post = new PostFX(this.renderer, this.scene, this.camera, this.vmScene, this.vmCamera,
      { samples: this.gfx.ssao && this.preset.antialias ? 4 : 0, fxaa: !this.gfx.ssao, bloom: this.gfx.bloom, ssao: this.gfx.ssao });
    addEventListener('resize', () => this.resize());
    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.contextLost = true; });
    canvas.addEventListener('webglcontextrestored', () => { location.reload(); });
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h, false);
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.dynRes.apply();
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.vmCamera.aspect = w / h; this.vmCamera.updateProjectionMatrix();
  }

  /** Kompilasi shader SEMUA objek scene dunia & viewmodel — termasuk pool efek yang masih tersembunyi (granat, debris,
   *  jejak pisau, ...) — sebelum match. Tanpa ini program shader dibuat saat efek pertama kali muncul → satu frame macet
   *  ±40 ms (terukur: lemparan granat pertama). extra = material yang meshnya baru dibuat belakangan (balok tubuh mati).
   *  Panggil SETELAH lampu, kabut, dan peta lingkungan final (kunci program bergantung pada keadaan scene). */
  warmup(extra: Iterable<THREE.Material> = []) {
    if (this.contextLost) return;
    const r = this.renderer, prev = r.getRenderTarget();
    // pasca-proses merender ke target HDR (tanpa tone mapping, ruang warna linear) → kompilasi untuk target yang sama
    if (this.post) r.setRenderTarget(this.post.composer.readBuffer);
    const tmp = new THREE.Group();
    for (const m of new Set(extra)) tmp.add(new THREE.Mesh(WARM_GEO, m));
    this.scene.add(tmp);
    r.compile(this.scene, this.camera);
    this.scene.remove(tmp);
    r.compile(this.vmScene, this.vmCamera);
    r.setRenderTarget(prev);
  }

  render() {
    if (this.contextLost) return;
    const r = this.renderer;
    r.info.reset();
    this.gpu.begin();
    if (this.post) this.post.render(this.showViewmodel);
    else {
      r.clear();
      r.render(this.scene, this.camera);
      if (this.showViewmodel) { r.clearDepth(); r.render(this.vmScene, this.vmCamera); }
    }
    this.gpu.end();
  }
}
