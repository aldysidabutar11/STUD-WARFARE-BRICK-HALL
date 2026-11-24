// src/world/maps/steelyard/visual/sky.ts — langit prosedural Steel Yard dalam SATU draw call (kotak kecil + trik skybox: hanya
// rotasi view, kedalaman = far → tak terhingga, tanpa paralaks, aman untuk far kamera 300 u & CubeCamera peta lingkungan):
//   • gradien zenit → tengah → kabut cakrawala (= warna kabut scene agar tanah jauh menyatu), sisi matahari lebih hangat
//   • matahari: cakram HDR (bloom di HIGH) + halo Mie
//   • awan kumulus lembut (fbm dari tekstur derau, diproyeksikan ke bidang awan, bersinar di sisi matahari, bergeser pelan)
//   • pegunungan gurun BERLAPIS: rangkaian jauh biru-kabur, mesa bertingkat (gaya blocky) dengan lapisan batuan, bukit pasir dekat;
//     sisi menghadap matahari terang, sisi membelakangi gelap + rim light, kabut udara makin tebal ke kaki
//   • di bawah cakrawala: tanah jauh berkabut (rumus kabut sama dengan FogExp2 scene) → sambungan mulus di batas far.
import * as THREE from 'three';
import { skyNoise } from './textures';
import { cachedTex } from './materials';

const VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * vec4( mat3( viewMatrix ) * position, 1.0 );
  gl_Position = p.xyww;   // kedalaman = 1 (far): selalu di belakang semua benda
}`;

const FRAG = /* glsl */ `
uniform sampler2D uNoise;
uniform vec3 uSunDir;
uniform vec3 uSunCol;
uniform vec3 uZenith;
uniform vec3 uMid;
uniform vec3 uHor;
uniform vec3 uHaze;
uniform vec3 uGround;
uniform vec3 uFar;
uniform vec3 uRock;
uniform vec3 uSand;
uniform float uFogDensity;
uniform float uTime;
varying vec3 vDir;

float fbmC( vec2 p ) {
  float s = 0.0, a = 0.5;
  for ( int i = 0; i < 5; i ++ ) { s += a * texture2D( uNoise, p ).r; p = p * 2.03 + vec2( 0.17, 0.31 ); a *= 0.5; }
  return s / 0.96875;
}
float fbmM( vec2 p ) {
  float s = 0.0, a = 0.5;
  for ( int i = 0; i < 5; i ++ ) { s += a * texture2D( uNoise, p ).g; p = p * 2.11 + vec2( 0.37, 0.11 ); a *= 0.5; }
  return s / 0.96875;
}
// tinggi lapisan gunung (radian elevasi) di sudut azimut a: derau di lingkaran (periodik), lancip/teras
float ridge( float a, float R, vec2 off, float sharp ) {
  return pow( clamp( ( fbmM( vec2( cos( a ), sin( a ) ) * R + off ) - 0.28 ) / 0.5, 0.0, 1.0 ), sharp );
}
float terrace( float h, float n ) {
  float x = h * n, f = fract( x );
  return ( floor( x ) + smoothstep( 0.62, 0.95, f ) ) / n;
}
float hFar( float a ) { return 0.004 + 0.105 * ridge( a, 0.16, vec2( 0.13, 0.71 ), 1.35 ) * ( 0.45 + 0.55 * texture2D( uNoise, vec2( cos( a ), sin( a ) ) * 0.05 + 0.5 ).b ); }
float hMesa( float a ) {
  float m = smoothstep( 0.42, 0.62, texture2D( uNoise, vec2( cos( a ), sin( a ) ) * 0.045 + vec2( 0.3, 0.8 ) ).a );
  return 0.002 + 0.075 * m * terrace( ridge( a, 0.3, vec2( 0.61, 0.23 ), 0.9 ), 4.0 );
}
float hNear( float a ) { return 0.001 + 0.024 * ridge( a, 0.42, vec2( 0.9, 0.4 ), 1.0 ); }

// cahaya lereng: normal mendatar dari kemiringan profil vs arah matahari
float slopeLight( float a, float dh, vec2 sunXZ ) {
  vec2 dir = vec2( cos( a ), sin( a ) ), tg = vec2( - sin( a ), cos( a ) );
  vec2 n = normalize( - dir - tg * clamp( dh * 6.0, - 3.0, 3.0 ) );
  return dot( n, sunXZ );
}

void main() {
  vec3 d = normalize( vDir );
  float el = d.y;
  float sd = dot( d, uSunDir );
  vec2 sunXZ = normalize( uSunDir.xz );
  vec2 dXZ = normalize( d.xz + vec2( 1e-5 ) );
  float toward = dot( dXZ, sunXZ ) * 0.5 + 0.5;

  // ── gradien langit
  float h = max( el, 0.0 );
  vec3 sky = mix( uMid, uZenith, smoothstep( 0.08, 0.8, h ) );
  sky = mix( uHor, sky, smoothstep( 0.0, 0.26, h ) );
  sky *= mix( vec3( 1.0 ), vec3( 1.1, 1.0, 0.86 ), toward * ( 1.0 - smoothstep( 0.0, 0.6, h ) ) * 0.7 );
  float sp = max( sd, 0.0 );
  sky += uSunCol * ( 0.10 * pow( sp, 4.0 ) + 0.32 * pow( sp, 24.0 ) + 0.9 * pow( sp, 300.0 ) );
  sky += uSunCol * smoothstep( 0.99984, 0.99992, sd ) * 14.0;

  // ── awan kumulus lembut
  if ( el > 0.0 ) {
    vec2 p = d.xz / ( el + 0.16 ) * 0.045 + uTime * vec2( 0.0022, 0.0009 );
    float c = fbmC( p );
    float cov = smoothstep( 0.5, 0.74, c );
    float c2 = fbmC( p + sunXZ * 0.035 );
    float lit = clamp( 1.0 - ( c2 - c ) * 5.0, 0.45, 1.2 );
    vec3 cc = mix( vec3( 0.52, 0.57, 0.66 ), vec3( 1.06, 1.0, 0.93 ), lit ) * 1.05;
    cc += uSunCol * pow( sp, 9.0 ) * 0.9 * ( 1.0 - cov );
    cc = mix( cc, uHor, 1.0 - smoothstep( 0.02, 0.3, el ) );
    sky = mix( sky, cc, cov * smoothstep( 0.015, 0.14, el ) * 0.95 );
  }
  vec3 col = sky;

  // ── pegunungan berlapis (jauh → mesa → bukit pasir)
  float elev = asin( clamp( el, - 1.0, 1.0 ) );
  if ( elev < 0.13 && elev > - 0.02 ) {
    float a = atan( d.z, d.x ), e = 0.004;
    // jauh: biru keabuan berkabut
    float hf = hFar( a );
    if ( elev < hf ) {
      float l = slopeLight( a, ( hFar( a + e ) - hFar( a - e ) ) / ( 2.0 * e ), sunXZ );
      vec3 c = uFar * ( 0.78 + 0.32 * l );
      c *= 0.9 + 0.2 * texture2D( uNoise, vec2( a * 3.0, elev * 18.0 ) ).b;
      col = mix( c, uHor, 0.38 + 0.3 * ( 1.0 - smoothstep( 0.0, 0.05, elev ) ) );
    }
    // mesa bertingkat: batu pasir jingga, lapisan batuan, sisi gelap + rim
    float hm = hMesa( a );
    if ( elev < hm ) {
      float l = slopeLight( a, ( hMesa( a + e ) - hMesa( a - e ) ) / ( 2.0 * e ), sunXZ );
      float strata = 0.9 + 0.1 * sin( elev * 900.0 + texture2D( uNoise, vec2( a * 2.0, 0.3 ) ).r * 6.0 );
      vec3 c = uRock * ( 0.55 + 0.55 * max( l, - 0.2 ) ) * strata;
      c *= 0.85 + 0.3 * texture2D( uNoise, vec2( a * 9.0, elev * 60.0 ) ).b;
      c += uSunCol * 0.15 * smoothstep( 0.003, 0.0, hm - elev ) * toward;
      col = mix( c, mix( uHor, uHaze, 0.5 ), 0.22 + 0.34 * ( 1.0 - smoothstep( 0.0, 0.03, elev ) ) );
    }
    // bukit pasir dekat
    float hn = hNear( a );
    if ( elev < hn ) {
      float l = slopeLight( a, ( hNear( a + e ) - hNear( a - e ) ) / ( 2.0 * e ), sunXZ );
      vec3 c = uSand * ( 0.7 + 0.35 * l );
      col = mix( c, uHaze, 0.16 + 0.3 * ( 1.0 - smoothstep( 0.0, 0.015, elev ) ) );
    }
  }

  // ── bawah cakrawala: tanah jauh berkabut (sama dengan FogExp2)
  if ( el < 0.0 ) {
    float dist = max( cameraPosition.y, 1.0 ) / max( - el, 1e-4 );
    float f = 1.0 - exp( - pow( uFogDensity * dist, 2.0 ) );
    vec3 g = mix( uGround, uHaze, f );
    col = mix( col, g, smoothstep( 0.0, - 0.0015, el ) );
  }

  gl_FragColor = vec4( col, 1.0 );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export interface SkyOpts {
  sunDir: THREE.Vector3;          // menuju matahari (ternormalisasi)
  fogColor: number; fogDensity: number;
  ground: number;                 // warna tanah jauh (sRGB) — sudah termasuk penerangan kira-kira
}

const L = (hex: number, k = 1) => new THREE.Color().setHex(hex, THREE.SRGBColorSpace).multiplyScalar(k);

/** Mesh langit (1 draw call). Lepas lewat disposeTree (tekstur derau ada di uniform). */
export function makeSky(o: SkyOpts): THREE.Mesh {
  const uniforms = {
    uNoise: { value: cachedTex('skyNoise', 1, skyNoise) },
    uSunDir: { value: o.sunDir.clone().normalize() },
    uSunCol: { value: L(0xffe2b8, 1.6) },
    uZenith: { value: L(0x3a6fb4) },
    uMid: { value: L(0x86b0da) },
    uHor: { value: L(0xc4d3dd) },
    uHaze: { value: L(o.fogColor) },
    uGround: { value: L(o.ground) },
    uFar: { value: L(0x8d97a8) },
    uRock: { value: L(0xc98a5c) },
    uSand: { value: L(0xcfb38a) },
    uFogDensity: { value: o.fogDensity },
    uTime: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms, vertexShader: VERT, fragmentShader: FRAG,
    side: THREE.BackSide, depthWrite: false, depthTest: true, fog: false,
  });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), mat);
  mesh.name = 'SY_Sky';
  mesh.frustumCulled = false;
  mesh.renderOrder = 1000;              // setelah benda opak → early-z membuang piksel tertutup
  mesh.matrixAutoUpdate = false;
  const t0 = performance.now();
  mesh.onBeforeRender = (_r, scene) => {
    uniforms.uTime.value = (performance.now() - t0) * 0.001;
    const f = scene.fog as THREE.FogExp2 | null;
    uniforms.uFogDensity.value = f && 'density' in f ? f.density : 0;
  };
  return mesh;
}
