// src/core/PostFX.ts — pasca-proses HIGH/ULTRA (permintaan pengguna "grafik lebih real"):
//   dunia → (ULTRA: GTAO / SSAO) → viewmodel (depth dibersihkan) → bloom (UnrealBloom, mip setengah resolusi) →
//   OutputPass (tone mapping ACES + sRGB) → grading (vignette, saturasi, kontras, sedikit hangat).
// Target HDR HalfFloat ber-MSAA (samples) sehingga antialias kanvas tidak dipakai. MEDIUM/LOW merender langsung (tone mapping saja).
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';
import { XCFG } from '../config/extraConfig';

const GR = XCFG.gfx.grade, BL = XCFG.gfx.bloom;

const GradeShader = {
  name: 'GradeShader',
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uVignette: { value: GR.vignette as number }, uSat: { value: GR.saturation as number },
    uContrast: { value: GR.contrast as number }, uWarm: { value: GR.warmth as number }, uAspect: { value: 1 },
  },
  vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uVignette, uSat, uContrast, uWarm, uAspect; varying vec2 vUv;
    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, uSat);                                  // saturasi
      c = (c - 0.5) * uContrast + 0.5;                            // kontras (ruang tampilan)
      c += vec3(uWarm, uWarm * 0.35, -uWarm * 0.6) * (1.0 - l);   // bayangan sedikit hangat
      vec2 d = (vUv - 0.5) * vec2(uAspect, 1.0);
      c *= 1.0 - uVignette * smoothstep(0.35, 1.05, length(d) * 1.25);
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    }`,
};

/** samples: MSAA target HDR (mahal di iGPU → hanya ULTRA); fxaa: antialias murah pengganti MSAA (HIGH). */
export interface PostOpts { samples: number; bloom: boolean; ssao: boolean; fxaa: boolean }

export class PostFX {
  readonly composer: EffectComposer;
  private vm: RenderPass;
  private bloom: UnrealBloomPass | null = null;
  private ao: GTAOPass | null = null;
  private grade: ShaderPass;
  private fxaa: ShaderPass | null = null;
  private size = new THREE.Vector2();

  constructor(private renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, vmScene: THREE.Scene,
    vmCamera: THREE.Camera, opts: PostOpts) {
    renderer.getDrawingBufferSize(this.size);
    const w = Math.max(1, this.size.x), h = Math.max(1, this.size.y);
    const rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: opts.samples });
    this.composer = new EffectComposer(renderer, rt);
    this.composer.setPixelRatio(1);
    this.composer.addPass(new RenderPass(scene, camera));
    if (opts.ssao) {
      this.ao = new GTAOPass(scene, camera, w, h);
      this.ao.blendIntensity = 0.85;
      this.composer.addPass(this.ao);
    }
    this.vm = new RenderPass(vmScene, vmCamera);
    this.vm.clear = false; this.vm.clearDepth = true;
    this.composer.addPass(this.vm);
    if (opts.bloom) {
      this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), BL.strength, BL.radius, BL.threshold);
      // mip bloom mulai dari ¼ resolusi (bawaan ½) — pendar tetap lembut, biaya ±4× lebih kecil
      const bs = this.bloom.setSize.bind(this.bloom);
      this.bloom.setSize = (bw: number, bh: number) => bs(Math.max(1, Math.round(bw / 2)), Math.max(1, Math.round(bh / 2)));
      this.composer.addPass(this.bloom);
    }
    this.composer.addPass(new OutputPass());
    if (opts.fxaa) { this.fxaa = new ShaderPass(FXAAShader); this.composer.addPass(this.fxaa); }
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
    this.composer.setSize(w, h);
    this.fxaa?.uniforms.resolution.value.set(1 / w, 1 / h);
  }

  setBloom(on: boolean) { if (this.bloom) this.bloom.enabled = on; }
  /** Ambang luminans & kekuatan bloom (per map — lihat Atmosphere.bloom). */
  setBloomTuning(threshold: number, strength: number) { if (this.bloom) { this.bloom.threshold = threshold; this.bloom.strength = strength; } }
  setSsao(on: boolean) { if (this.ao) this.ao.enabled = on; }

  /** Render satu frame; ukuran target mengikuti drawing buffer (resolusi dinamis mengubah pixel ratio). */
  render(showViewmodel: boolean) {
    const s = this.renderer.getDrawingBufferSize(this.size);
    const target = this.composer.renderTarget1;
    if (s.x !== target.width || s.y !== target.height) {
      this.composer.setSize(s.x, s.y);
      this.grade.uniforms.uAspect.value = s.x / Math.max(1, s.y);
      this.fxaa?.uniforms.resolution.value.set(1 / s.x, 1 / s.y);
    }
    this.vm.enabled = showViewmodel;
    this.composer.render();
  }
}
