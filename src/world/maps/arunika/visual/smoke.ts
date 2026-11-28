// src/world/maps/arunika/visual/smoke.ts — asap dupa (tungku Lorong Biksu, altar pendopo) & kabut percikan kaki air terjun: SATU
// Points, gerak sepenuhnya di shader dari uTime (tanpa biaya CPU per frame selain satu uniform). Tiap partikel punya sumber & fase:
// naik meliuk, melebar, membesar, memudar masuk-keluar. Tanpa collider, tanpa bayangan.
import * as THREE from 'three';
import { makeRng } from '../../../../core/Rng';

export interface SmokeSource { x: number; y: number; z: number; n: number; rise: number; spread: number; size: number; life: number;
  color: number; alpha: number }

export function makeSmoke(sources: readonly SmokeSource[]): THREE.Points {
  const rng = makeRng(5151);
  const total = sources.reduce((a, s) => a + s.n, 0);
  const pos = new Float32Array(total * 3), a1 = new Float32Array(total * 4), a2 = new Float32Array(total * 4), col = new Float32Array(total * 3);
  let i = 0;
  const c = new THREE.Color();
  for (const s of sources) {
    c.setHex(s.color, THREE.SRGBColorSpace);
    for (let k = 0; k < s.n; k++, i++) {
      pos.set([s.x, s.y, s.z], i * 3);
      a1.set([rng(), s.rise, s.spread, s.size], i * 4);         // fase, tinggi naik, lebar sebar, ukuran
      a2.set([s.life, s.alpha, rng() * 6.283, 0.6 + rng() * 0.8], i * 4);   // umur, alpha, sudut liuk, laju liuk
      col.set([c.r, c.g, c.b], i * 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aA', new THREE.BufferAttribute(a1, 4));
  g.setAttribute('aB', new THREE.BufferAttribute(a2, 4));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 5, 0), 200);
  const uniforms = { uTime: { value: 0 }, uScale: { value: 600 } };
  const m = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      attribute vec4 aA; attribute vec4 aB; attribute vec3 color;
      uniform float uTime, uScale; varying float vA; varying vec3 vC;
      void main() {
        float t = fract( uTime / aB.x + aA.x );
        float sw = aB.z + uTime * aB.w;
        vec3 p = position + vec3( sin( sw + t * 4.0 ) * aA.z * t, aA.y * t, cos( sw * 0.8 + t * 3.0 ) * aA.z * t );
        vec4 mv = modelViewMatrix * vec4( p, 1.0 );
        gl_PointSize = clamp( aA.w * ( 0.5 + t * 1.6 ) * uScale / - mv.z, 1.0, 90.0 );
        vA = aB.y * smoothstep( 0.0, 0.12, t ) * ( 1.0 - smoothstep( 0.55, 1.0, t ) ) * ( 1.0 - smoothstep( 40.0, 70.0, - mv.z ) );
        vC = color;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      varying float vA; varying vec3 vC;
      void main() {
        float d = length( gl_PointCoord - 0.5 );
        float a = smoothstep( 0.5, 0.05, d ) * vA;
        if ( a < 0.004 ) discard;
        gl_FragColor = vec4( vC, a );
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false,
  });
  const pts = new THREE.Points(g, m);
  pts.name = 'AR_Smoke';
  pts.frustumCulled = false;
  pts.matrixAutoUpdate = false;
  pts.renderOrder = 3;
  const t0 = performance.now();
  pts.onBeforeRender = (r) => {
    uniforms.uTime.value = (performance.now() - t0) * 0.001;
    uniforms.uScale.value = r.domElement.height * 0.5;
  };
  return pts;
}

/** Sumber asap & kabut Candi Arunika. */
export const AR_SMOKE: SmokeSource[] = [
  // tungku dupa di Lorong Biksu (puncak tungku y ±2.2)
  { x: -2, y: 2.25, z: -30, n: 28, rise: 3.6, spread: 0.55, size: 0.55, life: 5.5, color: 0xd9d4cc, alpha: 0.32 },
  { x: 2, y: 2.25, z: -57, n: 28, rise: 3.6, spread: 0.55, size: 0.55, life: 5.5, color: 0xd9d4cc, alpha: 0.32 },
  // dupa di altar pendopo
  { x: 44, y: 3.95, z: -45.5, n: 16, rise: 2.4, spread: 0.35, size: 0.32, life: 4.2, color: 0xe2ddd4, alpha: 0.28 },
  // kabut percikan di kaki air terjun (rendah, lebar, putih)
  { x: 58.4, y: 0.4, z: 9, n: 60, rise: 2.2, spread: 2.2, size: 1.6, life: 3.2, color: 0xf2f8fa, alpha: 0.2 },
];
