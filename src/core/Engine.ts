// src/core/Engine.ts — WebGLRenderer, preset kualitas, resize, context-loss (GDD §2.1–2.3, §9.1)
import * as THREE from 'three';
import { CFG, type Preset, type PresetName } from '../config/gameConfig';
import { XCFG } from '../config/extraConfig';
import { DynamicResolution } from './DynamicResolution';

export class Engine {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly vmScene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly vmCamera: THREE.PerspectiveCamera;
  readonly preset: Preset;
  readonly dynRes: DynamicResolution;
  showViewmodel = false;
  contextLost = false;
  maxAnisotropy = 1;

  constructor(readonly canvas: HTMLCanvasElement, readonly presetName: PresetName) {
    this.preset = CFG.render.presets[presetName];
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: this.preset.antialias, powerPreference: 'high-performance' });
    this.renderer.autoClear = false;
    this.renderer.info.autoReset = false;
    this.renderer.shadowMap.enabled = this.preset.shadowMap > 0;
    this.renderer.shadowMap.type = THREE.PCFShadowMap; // PCFSoftShadowMap deprecated sejak r186
    this.maxAnisotropy = Math.min(this.preset.anisotropy, this.renderer.capabilities.getMaxAnisotropy());
    this.camera = new THREE.PerspectiveCamera(CFG.camera.baseFov, innerWidth / innerHeight, CFG.camera.near, CFG.camera.far);
    this.camera.rotation.order = 'YXZ';
    this.vmCamera = new THREE.PerspectiveCamera(CFG.camera.viewmodelFov, innerWidth / innerHeight, XCFG.viewmodel.near, XCFG.viewmodel.far);
    this.scene.background = new THREE.Color(0x2a1d14);
    this.dynRes = new DynamicResolution(this.renderer, this.preset);
    this.resize();
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

  render() {
    if (this.contextLost) return;
    const r = this.renderer;
    r.info.reset();
    r.clear();
    r.render(this.scene, this.camera);
    if (this.showViewmodel) { r.clearDepth(); r.render(this.vmScene, this.vmCamera); }
  }
}
