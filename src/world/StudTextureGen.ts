// src/world/StudTextureGen.ts — kanvas 64×64 prosedural: studs, inlet, ubin, dinding buku, wajah (GDD §4.9)
import * as THREE from 'three';
import { makeRng } from '../core/Rng';

const S = 64;

function canvas(): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = S; c.height = S;
  return [c, c.getContext('2d')!];
}

function tex(c: HTMLCanvasElement, anisotropy: number, srgb = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = anisotropy;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

/** Permukaan atas ber-studs: abu terang (diwarnai material) + satu stud per unit. */
export function studTexture(aniso: number) {
  const [c, g] = canvas();
  g.fillStyle = '#e6e6e6'; g.fillRect(0, 0, S, S);
  g.strokeStyle = 'rgba(0,0,0,0.10)'; g.lineWidth = 2; g.strokeRect(1, 1, S - 2, S - 2);
  const r = 17;
  g.fillStyle = 'rgba(0,0,0,0.22)'; g.beginPath(); g.arc(34, 35, r, 0, Math.PI * 2); g.fill(); // bayangan
  const grad = g.createRadialGradient(27, 26, 3, 32, 32, r);
  grad.addColorStop(0, '#ffffff'); grad.addColorStop(1, '#d2d2d2');
  g.fillStyle = grad; g.beginPath(); g.arc(32, 32, r, 0, Math.PI * 2); g.fill();
  g.strokeStyle = 'rgba(0,0,0,0.18)'; g.lineWidth = 1.5; g.beginPath(); g.arc(32, 32, r, 0, Math.PI * 2); g.stroke();
  return tex(c, aniso);
}

/** Permukaan bawah "inlet" (lubang penerima stud). */
export function inletTexture(aniso: number) {
  const [c, g] = canvas();
  g.fillStyle = '#dcdcdc'; g.fillRect(0, 0, S, S);
  g.fillStyle = '#9a9a9a'; g.beginPath(); g.arc(32, 32, 15, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#c4c4c4'; g.beginPath(); g.arc(32, 32, 9, 0, Math.PI * 2); g.fill();
  return tex(c, aniso);
}

/** Sisi halus: tepi tipis agar balok tetap terbaca. */
export function sideTexture(aniso: number) {
  const [c, g] = canvas();
  g.fillStyle = '#ececec'; g.fillRect(0, 0, S, S);
  g.fillStyle = 'rgba(0,0,0,0.05)'; g.fillRect(0, S - 3, S, 3);
  return tex(c, aniso);
}

/** Ubin diagonal abu #9A9A9A & krem #E3D7BC (1 tekstur = 2×2 unit). */
export function tileTexture(aniso: number) {
  const [c, g] = canvas();
  g.fillStyle = '#e3d7bc'; g.fillRect(0, 0, S, S);
  g.fillStyle = '#9a9a9a';
  g.beginPath(); g.moveTo(32, 0); g.lineTo(64, 32); g.lineTo(32, 64); g.lineTo(0, 32); g.closePath(); g.fill();
  g.strokeStyle = 'rgba(60,50,40,0.35)'; g.lineWidth = 1;
  g.beginPath(); g.moveTo(32, 0); g.lineTo(64, 32); g.lineTo(32, 64); g.lineTo(0, 32); g.closePath(); g.stroke();
  return tex(c, aniso);
}

/** Dinding rak buku built-in (muka balkon) & menara katalog. 1 tekstur = 1×1 unit. */
export function bookwallTexture(aniso: number) {
  const [c, g] = canvas();
  const rng = makeRng(4242);
  const pal = ['#c4281c', '#0d69ac', '#f5cd30', '#287f47', '#6b327c', '#da8541', '#74869d', '#f2f3f3'];
  g.fillStyle = '#3a2412'; g.fillRect(0, 0, S, S);
  let x = 2;
  while (x < S - 2) {
    const w = 5 + Math.floor(rng() * 5), h = 34 + Math.floor(rng() * 14);
    g.fillStyle = pal[Math.floor(rng() * pal.length)];
    g.fillRect(x, 52 - h, w - 1, h);
    g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(x, 52 - h + 4, w - 1, 2);
    x += w;
  }
  g.fillStyle = '#5a3a1f'; g.fillRect(0, 52, S, 12);
  return tex(c, aniso);
}

/** Wajah orisinal (bukan wajah bawaan platform mana pun): alis tegas, mata kotak, mulut garis. */
export function faceTexture() {
  const [c, g] = canvas();
  g.clearRect(0, 0, S, S);
  g.fillStyle = '#1b1b1b';
  g.fillRect(17, 22, 8, 10); g.fillRect(39, 22, 8, 10);          // mata kotak
  g.fillRect(14, 16, 14, 3); g.fillRect(36, 16, 14, 3);          // alis
  g.fillRect(24, 43, 16, 3);                                      // mulut datar
  g.fillStyle = '#ffffff'; g.fillRect(19, 24, 3, 3); g.fillRect(41, 24, 3, 3);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
