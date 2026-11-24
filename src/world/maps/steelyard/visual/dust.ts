// src/world/maps/steelyard/visual/dust.ts — debu gurun melayang (MEDIUM+): butir halus tersinari matahari mengambang di atas
// area main, terbawa angin (gerak & pembungkus volume dihitung di shader dari uTime → 1 draw call, tanpa biaya CPU per frame),
// sebagian lebih rendah & cepat (pasir tertiup di dekat tanah). Uniform uTime & uScale diisi Game (kontrak BuiltMap.dust).
import * as THREE from 'three';
import { makeRng } from '../../../../core/Rng';

export function makeDust(bounds: { x: [number, number]; z: [number, number] }, count: number, opacity: number, size: number): THREE.Points {
  const rng = makeRng(31337);
  const x0 = bounds.x[0] - 4, x1 = bounds.x[1] + 4, z0 = bounds.z[0] - 4, z1 = bounds.z[1] + 4, top = 13;
  const pos = new Float32Array(count * 3), ph = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    const low = rng() < 0.35;
    pos[i * 3] = x0 + rng() * (x1 - x0);
    pos[i * 3 + 1] = low ? 0.15 + rng() * 1.6 : 0.6 + rng() ** 1.4 * top;
    pos[i * 3 + 2] = z0 + rng() * (z1 - z0);
    ph[i * 2] = rng() * 100; ph[i * 2 + 1] = low ? 1 : 0;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aPh', new THREE.BufferAttribute(ph, 2));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 6, 0), 200);
  const m = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 }, uScale: { value: 600 }, uSize: { value: size }, uOpacity: { value: opacity },
      uMin: { value: new THREE.Vector3(x0, 0, z0) }, uSpan: { value: new THREE.Vector3(x1 - x0, top + 2, z1 - z0) },
      uColor: { value: new THREE.Color(1.0, 0.9, 0.74) },
    },
    vertexShader: /* glsl */ `
      attribute vec2 aPh; uniform float uTime, uSize, uScale; uniform vec3 uMin, uSpan; varying float vA;
      void main() {
        float low = aPh.y, t = uTime;
        // angin dari Barat-Barat Daya (searah datang matahari) + olakan; butir rendah lebih cepat
        vec3 wind = vec3( 0.9, 0.0, 0.25 ) * ( low > 0.5 ? 2.6 : 0.55 );
        vec3 p = position + wind * t + vec3( sin( t * 0.21 + aPh.x ) * 0.9, sin( t * 0.13 + aPh.x * 1.7 ) * ( low > 0.5 ? 0.15 : 0.7 ), cos( t * 0.17 + aPh.x * 0.6 ) * 0.9 );
        p.xz = uMin.xz + mod( p.xz - uMin.xz, uSpan.xz );
        p.y = max( p.y, 0.08 );
        vec4 mv = modelViewMatrix * vec4( p, 1.0 );
        gl_PointSize = clamp( uSize * uScale / - mv.z, 1.0, 5.0 );
        float fade = 1.0 - smoothstep( 45.0, 90.0, - mv.z );
        vA = ( 0.45 + 0.55 * sin( t * 0.7 + aPh.x * 3.0 ) * 0.5 + 0.275 ) * fade * ( low > 0.5 ? 0.6 : 1.0 );
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uOpacity; uniform vec3 uColor; varying float vA;
      void main() {
        float d = length( gl_PointCoord - 0.5 );
        float a = smoothstep( 0.5, 0.0, d ) * uOpacity * vA;
        gl_FragColor = vec4( uColor * a, a );
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(g, m);
  pts.name = 'SY_Dust';
  pts.frustumCulled = false;
  pts.matrixAutoUpdate = false;
  return pts;
}
