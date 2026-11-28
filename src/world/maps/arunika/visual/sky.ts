// src/world/maps/arunika/visual/sky.ts — langit FAJAR Candi Arunika dalam SATU draw call (trik skybox sama dengan Steel Yard: hanya
// rotasi view, kedalaman = far):
//   • gradien zenit biru tua → lembayung → jingga keemasan di cakrawala; sisi matahari terbit hangat, sisi seberang merah muda
//   • matahari rendah di Timur: cakram HDR + halo lebar (bloom HIGH)
//   • awan tipis berlapis, bagian bawahnya disinari jingga/merah muda dari matahari rendah
//   • DUA GUNUNG API kerucut (gaya Jawa Tengah) di Selatan & Barat Daya, satu berasap tipis; punggung bukit hutan berlapis biru-kabut;
//     KABUT LEMBAH pagi menggenang di kaki gunung
//   • burung kecil melintas pelan (siluet "v")
//   • di bawah cakrawala: tanah jauh berkabut (rumus sama dengan FogExp2 scene)
import * as THREE from 'three';
import { skyNoise } from '../../steelyard/visual/textures';
import { cachedTex } from '../../steelyard/visual/materials';

const VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * vec4( mat3( viewMatrix ) * position, 1.0 );
  gl_Position = p.xyww;
}`;

const FRAG = /* glsl */ `
uniform sampler2D uNoise;
uniform vec3 uSunDir;
uniform vec3 uSunCol;
uniform vec3 uZenith;
uniform vec3 uMid;
uniform vec3 uHorSun;
uniform vec3 uHorAway;
uniform vec3 uHaze;
uniform vec3 uGround;
uniform vec3 uFar;
uniform vec3 uHill;
uniform vec3 uVolc;
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
  for ( int i = 0; i < 4; i ++ ) { s += a * texture2D( uNoise, p ).g; p = p * 2.11 + vec2( 0.37, 0.11 ); a *= 0.5; }
  return s / 0.9375;
}
float ridge( float a, float R, vec2 off ) { return clamp( ( fbmM( vec2( cos( a ), sin( a ) ) * R + off ) - 0.3 ) / 0.5, 0.0, 1.0 ); }
// gunung api kerucut: profil cekung (lereng landai di kaki, curam di puncak) + kawah datar kecil
float volcano( float a, float a0, float w, float hgt ) {
  float d = abs( atan( sin( a - a0 ), cos( a - a0 ) ) ) / w;
  float h = hgt * pow( max( 0.0, 1.0 - d ), 1.7 );
  return min( h, hgt * 0.94 );
}
float hFar( float a ) { return 0.006 + 0.05 * ridge( a, 0.2, vec2( 0.13, 0.71 ) ); }
float hVolc( float a ) {
  return max( volcano( a, -1.75, 0.55, 0.16 ), volcano( a, -2.45, 0.42, 0.115 ) );   // Selatan (−Z) & Barat Daya
}
float hHill( float a ) { return 0.004 + 0.032 * ridge( a, 0.55, vec2( 0.9, 0.4 ) ) + 0.012 * ridge( a, 1.6, vec2( 0.3, 0.2 ) ); }

void main() {
  vec3 d = normalize( vDir );
  float el = d.y;
  float sd = dot( d, uSunDir );
  vec2 sunXZ = normalize( uSunDir.xz );
  vec2 dXZ = normalize( d.xz + vec2( 1e-5 ) );
  float toward = dot( dXZ, sunXZ ) * 0.5 + 0.5;

  // ── gradien fajar
  float h = max( el, 0.0 );
  vec3 hor = mix( uHorAway, uHorSun, pow( max( toward, 0.0 ), 1.6 ) );
  vec3 sky = mix( uMid, uZenith, smoothstep( 0.06, 0.75, h ) );
  sky = mix( hor, sky, smoothstep( 0.0, 0.32, h ) );
  float sp = max( sd, 0.0 );
  sky += uSunCol * ( 0.16 * pow( sp, 3.0 ) + 0.4 * pow( sp, 18.0 ) + 1.2 * pow( sp, 260.0 ) );
  sky += uSunCol * smoothstep( 0.99975, 0.99988, sd ) * 16.0;

  // ── awan tipis berlapis, disinari dari bawah oleh matahari rendah
  if ( el > 0.0 ) {
    vec2 p = d.xz / ( el + 0.12 ) * 0.04 + uTime * vec2( 0.0016, 0.0006 );
    float c = fbmC( p * vec2( 1.0, 2.2 ) );
    float cov = smoothstep( 0.52, 0.78, c );
    float lit = clamp( 1.0 - ( fbmC( p * vec2( 1.0, 2.2 ) + sunXZ * 0.03 ) - c ) * 6.0, 0.35, 1.25 );
    vec3 cc = mix( vec3( 0.42, 0.42, 0.55 ), vec3( 1.1, 0.86, 0.78 ), lit );
    cc = mix( cc, vec3( 1.25, 0.72, 0.42 ), pow( max( toward, 0.0 ), 3.0 ) * 0.55 * ( 1.0 - smoothstep( 0.05, 0.5, el ) ) );
    cc += uSunCol * pow( sp, 7.0 ) * 0.7;
    cc = mix( cc, hor, 1.0 - smoothstep( 0.02, 0.25, el ) );
    sky = mix( sky, cc, cov * smoothstep( 0.012, 0.12, el ) * 0.9 );
  }
  // ── burung (siluet v kecil, melintas)
  if ( el > 0.06 && el < 0.32 ) {
    for ( int i = 0; i < 5; i ++ ) {
      float fi = float( i );
      float az = -2.2 + fi * 0.9 + uTime * ( 0.006 + fi * 0.0013 );
      float be = 0.12 + 0.05 * sin( fi * 2.1 ) + 0.006 * sin( uTime * 0.7 + fi );
      float a = atan( d.z, d.x );
      float da = atan( sin( a - az ), cos( a - az ) ), de = asin( el ) - be;
      float flap = 0.35 + 0.25 * sin( uTime * 6.0 + fi * 1.7 );
      float wing = abs( de + abs( da ) * flap );
      if ( abs( da ) < 0.012 && wing < 0.0016 ) sky = mix( sky, vec3( 0.12, 0.1, 0.12 ), 0.8 );
    }
  }
  vec3 col = sky;

  // ── pegunungan: punggung jauh → gunung api → bukit hutan dekat; kabut lembah di kaki
  float elev = asin( clamp( el, - 1.0, 1.0 ) );
  if ( elev < 0.17 && elev > - 0.02 ) {
    float a = atan( d.z, d.x ), e = 0.004;
    float valley = 1.0 - smoothstep( 0.0, 0.035, elev );
    float hf = hFar( a );
    if ( elev < hf ) col = mix( uFar * ( 0.9 + 0.2 * texture2D( uNoise, vec2( a * 3.0, elev * 18.0 ) ).b ), hor, 0.45 + 0.3 * valley );
    float hv = hVolc( a );
    if ( elev < hv ) {
      float dh = ( hVolc( a + e ) - hVolc( a - e ) ) / ( 2.0 * e );
      vec2 tg = vec2( - sin( a ), cos( a ) );
      float l = dot( normalize( - dXZ - tg * clamp( dh * 5.0, - 3.0, 3.0 ) ), sunXZ );
      vec3 c = uVolc * ( 0.62 + 0.42 * l );
      // alur lereng (jurang lava tua) + puncak gundul kecokelatan
      c *= 0.88 + 0.16 * sin( a * 260.0 + texture2D( uNoise, vec2( a * 4.0, elev * 9.0 ) ).r * 5.0 );
      c = mix( c, uVolc * vec3( 1.25, 1.05, 0.9 ), smoothstep( hv - 0.03, hv, elev ) * 0.6 );
      col = mix( c, mix( hor, uHaze, 0.4 ), 0.32 + 0.38 * valley );
    }
    // asap tipis dari gunung Selatan (bulu condong searah angin)
    float sa = atan( sin( a + 1.75 ), cos( a + 1.75 ) );
    float plume = 0.0;
    if ( elev > 0.14 && elev < 0.3 ) {
      float lean = ( elev - 0.15 ) * 0.9;
      float w = 0.012 + ( elev - 0.15 ) * 0.25;
      float q = ( sa - lean ) / w;   // q·q, BUKAN pow(q, 2.0): pow dengan basis negatif = NaN di GLSL → bloom menyebar layar hitam
      plume = exp( - q * q ) * smoothstep( 0.3, 0.16, elev ) * ( 0.5 + 0.5 * fbmC( vec2( sa * 6.0, elev * 9.0 - uTime * 0.01 ) ) );
      col = mix( col, mix( vec3( 0.86, 0.78, 0.74 ), uSunCol * 0.7, 0.25 ), plume * 0.55 );
    }
    float hh = hHill( a );
    if ( elev < hh ) {
      float dh = ( hHill( a + e ) - hHill( a - e ) ) / ( 2.0 * e );
      vec2 tg = vec2( - sin( a ), cos( a ) );
      float l = dot( normalize( - dXZ - tg * clamp( dh * 5.0, - 3.0, 3.0 ) ), sunXZ );
      vec3 c = uHill * ( 0.7 + 0.35 * l ) * ( 0.85 + 0.3 * texture2D( uNoise, vec2( a * 40.0, elev * 120.0 ) ).b );
      col = mix( c, uHaze, 0.2 + 0.35 * valley );
    }
    // kabut lembah pagi (pita terang di kaki pegunungan)
    float me = elev / 0.012;       // elev bisa negatif (di bawah cakrawala) → kuadrat dengan perkalian
    float mist = exp( - me * me ) * ( 0.55 + 0.45 * fbmC( vec2( a * 2.0, uTime * 0.004 ) ) );
    col = mix( col, mix( uHaze * 1.08, hor, 0.4 ), mist * 0.75 );
  }

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

const L = (hex: number, k = 1) => new THREE.Color().setHex(hex, THREE.SRGBColorSpace).multiplyScalar(k);

export interface DawnSkyOpts { sunDir: THREE.Vector3; fogColor: number; fogDensity: number; ground: number }

/** Mesh langit fajar (1 draw call). Lepas lewat disposeTree. */
export function makeDawnSky(o: DawnSkyOpts): THREE.Mesh {
  const uniforms = {
    uNoise: { value: cachedTex('skyNoise', 1, skyNoise) },
    uSunDir: { value: o.sunDir.clone().normalize() },
    uSunCol: { value: L(0xffc48a, 1.7) },
    uZenith: { value: L(0x2a4a86) },
    uMid: { value: L(0x8aa2d2) },
    uHorSun: { value: L(0xf6c590, 1.08) },
    uHorAway: { value: L(0xd9b8c2) },
    uHaze: { value: L(o.fogColor) },
    uGround: { value: L(o.ground) },
    uFar: { value: L(0x8e9ab8) },
    uHill: { value: L(0x3f5a52) },
    uVolc: { value: L(0x6f7590) },
    uFogDensity: { value: o.fogDensity },
    uTime: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: FRAG, side: THREE.BackSide, depthWrite: false, depthTest: true, fog: false });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), mat);
  mesh.name = 'AR_Sky';
  mesh.frustumCulled = false;
  mesh.renderOrder = 1000;
  mesh.matrixAutoUpdate = false;
  const t0 = performance.now();
  mesh.onBeforeRender = (_r, scene) => {
    uniforms.uTime.value = (performance.now() - t0) * 0.001;
    const f = scene.fog as THREE.FogExp2 | null;
    uniforms.uFogDensity.value = f && 'density' in f ? f.density : 0;
  };
  return mesh;
}
