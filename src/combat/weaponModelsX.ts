// src/combat/weaponModelsX.ts — model blocky senjata tambahan (ekspansi senjata, bukan GDD). 100% prosedural: balok ber-vertex
// color, satu geometri per senjata (+ bagian bergerak terpisah untuk viewmodel: pompa M870, bolt AWM, slide pistol).
// Aturan bersama dengan AR (WeaponModels): akar = genggaman, laras ke −Z, sumbu laras y 0.28, garis bidik besi y = IRON_Y
// (tidak ada balok lain di atasnya di sekitar sumbu tengah), rel optik di y 0.38 → ADS & optik pas tanpa penyesuaian (sightline test).
import * as THREE from 'three';
import type { XWeaponId } from '../config/weaponsExtra';
import { BORE_Y, Builder, D2R, IRON_Y, RAIL_Y, finish, type WeaponModel } from './modelKit';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const DK = 0x1b1c1e;

/** Bidikan besi senjata panjang: tiang depan (puncak = IRON_Y) + telinga pelindung + aperture belakang. */
function irons(b: Builder, zf: number, zr: number, color = DK, ears = true) {
  b.box(-0.016, IRON_Y - 0.09, zf + 0.02, 0.016, IRON_Y, zf - 0.02, color);
  if (ears) for (const s of [-1, 1]) b.box(s * 0.045, IRON_Y - 0.09, zf + 0.025, s * 0.07, IRON_Y + 0.015, zf - 0.025, color);
  for (const s of [-1, 1]) b.box(s * 0.03, RAIL_Y - 0.02, zr + 0.03, s * 0.07, IRON_Y + 0.02, zr - 0.03, color);
}

/** Rel optik bertakik di atas receiver (z0 belakang → z1 depan). */
function rail(b: Builder, z0: number, z1: number, color = DK) {
  b.box(-0.055, RAIL_Y - 0.03, z0, 0.055, RAIL_Y - 0.012, z1, color);
  for (let z = z0 - 0.02; z > z1 + 0.03; z -= 0.09) b.box(-0.06, RAIL_Y - 0.012, z, 0.06, RAIL_Y, z - 0.05, color);
}

// ── MP5: receiver baja tekan, handguard gemuk, tabung kokang di kiri atas, magazen melengkung ke depan, popor teleskopik
function mp5(withIron: boolean): WeaponModel {
  const b = new Builder(), blk = 0x252628, mid = 0x323336;
  b.box(-0.1, 0.12, 0.32, 0.1, 0.35, -0.76, blk);                               // receiver
  b.box(-0.085, 0.35, 0.25, 0.085, RAIL_Y - 0.03, -0.62, blk);                  // punggung receiver
  rail(b, 0.12, -0.5);
  b.box(-0.125, 0.1, -0.76, 0.125, 0.33, -1.24, mid);                           // handguard gemuk
  b.box(-0.11, 0.07, -0.84, 0.11, 0.1, -1.18, mid);
  for (let z = -0.82; z > -1.2; z -= 0.1) b.box(-0.128, 0.16, z, 0.128, 0.27, z - 0.04, DK);   // alur handguard
  b.box(-0.1, 0.33, -0.72, -0.035, 0.39, -1.3, DK);                             // tabung kokang (kiri, di bawah garis bidik)
  b.box(-0.17, 0.345, -1.1, -0.1, 0.375, -1.16, DK);                            // tuas kokang
  b.box(-0.045, BORE_Y - 0.045, -1.24, 0.045, BORE_Y + 0.045, -1.46, DK);        // laras
  b.box(-0.06, BORE_Y - 0.06, -1.38, 0.06, BORE_Y + 0.06, -1.48, DK);           // tiga lug moncong
  const magP = V(0, 0.12, -0.36);
  b.box(-0.068, -0.22, -0.27, 0.068, 0.12, -0.45, blk, D2R(-6), magP);
  b.box(-0.068, -0.56, -0.31, 0.068, -0.2, -0.49, blk, D2R(-15), magP);
  b.box(-0.085, 0.02, -0.25, 0.085, 0.13, -0.47, blk);                          // lubang magazen
  b.grip(DK); b.guard(DK, -0.24);
  for (const s of [-1, 1]) b.box(s * 0.04, 0.16, 0.32, s * 0.075, 0.2, 0.86, DK); // rel popor bawah
  b.box(-0.06, 0.27, 0.32, 0.06, 0.31, 0.86, DK);                               // rel popor atas
  b.box(-0.09, 0.04, 0.84, 0.09, 0.35, 0.95, blk);                              // bantalan popor
  if (withIron) { irons(b, -1.32, 0.22); b.box(-0.06, 0.35, 0.26, 0.06, RAIL_Y - 0.02, 0.16, DK); }   // drum belakang
  return finish(b, null, { muzzle: V(0, BORE_Y, -1.5), ejectPort: V(0.11, 0.3, -0.2), opticMount: V(0, RAIL_Y, -0.2),
    leftHand: V(-0.07, -0.11, -1.0), length: 2.43 });
}

// ── Kriss Vector: receiver kotak tinggi, rumah "super V" miring ke depan di bawah laras, magazen Glock, popor lipat, rel penuh
function vector(withIron: boolean): WeaponModel {
  const b = new Builder(), blk = 0x222325, gr = 0x3b3d40;
  b.box(-0.1, 0.17, 0.3, 0.1, 0.35, -0.96, blk);                               // receiver atas
  b.box(-0.075, 0.35, 0.28, 0.075, RAIL_Y - 0.03, -0.94, blk);
  rail(b, 0.24, -0.9);
  b.box(-0.095, -0.3, -0.42, 0.095, 0.18, -0.92, gr, D2R(16), V(0, 0.18, -0.42)); // rumah miring
  b.box(-0.08, -0.05, -0.16, 0.08, 0.17, -0.42, gr);                           // lubang magazen
  b.box(-0.062, -0.62, -0.19, 0.062, -0.03, -0.39, blk);                       // magazen
  b.box(-0.07, -0.66, -0.18, 0.07, -0.6, -0.4, gr);                            // dasar magazen
  b.box(-0.05, BORE_Y - 0.05, -0.96, 0.05, BORE_Y + 0.05, -1.14, DK);           // selubung laras
  b.box(-0.035, BORE_Y - 0.035, -1.14, 0.035, BORE_Y + 0.035, -1.22, DK);
  b.box(-0.04, 0.17, -0.7, 0.04, -0.05, -0.8, DK);                              // pegangan depan pendek (rel bawah)
  b.grip(DK); b.guard(DK, -0.15);
  b.box(-0.05, 0.16, 0.3, 0.05, 0.31, 0.84, blk);                              // popor lipat
  b.box(-0.085, 0.04, 0.78, 0.085, 0.35, 0.9, blk);
  if (withIron) irons(b, -0.86, 0.18);
  return finish(b, null, { muzzle: V(0, BORE_Y, -1.24), ejectPort: V(0.11, 0.28, -0.3), opticMount: V(0, RAIL_Y, -0.35),
    leftHand: V(-0.05, -0.1, -0.76), length: 2.12 });
}

// ── Remington 870: laras panjang di atas tabung magazen, pompa kayu beralur (bagian bergerak), popor kayu, rusuk + manik depan
function m870(withIron: boolean): WeaponModel {
  const b = new Builder(), p = new Builder(), blk = 0x202123, wood = 0x6e4a2e, woodD = 0x553821;
  b.box(-0.105, 0.1, 0.32, 0.105, 0.35, -0.56, blk);                           // receiver
  rail(b, 0.18, -0.4);
  b.box(-0.05, BORE_Y - 0.05, -0.56, 0.05, BORE_Y + 0.05, -2.32, blk);           // laras
  b.box(-0.022, BORE_Y + 0.05, -0.6, 0.022, BORE_Y + 0.08, -2.3, DK);           // rusuk ventilasi (di bawah garis bidik)
  b.box(-0.055, 0.12, -0.56, 0.055, 0.22, -1.96, blk);                         // tabung magazen
  b.box(-0.06, 0.11, -1.92, 0.06, 0.23, -2.0, DK);                             // tutup tabung
  for (const s of [-1, 1]) b.box(s * 0.065, 0.13, -0.56, s * 0.09, 0.17, -0.82, DK);   // batang aksi
  b.box(0.106, 0.18, -0.08, 0.11, 0.3, -0.38, DK);                             // lubang pelontar (kanan)
  b.box(-0.1, 0.02, 0.32, 0.1, 0.33, 1.16, wood, D2R(7), V(0, 0.33, 0.32));    // popor kayu
  b.box(-0.104, 0.0, 1.1, 0.104, 0.33, 1.18, 0x141414, D2R(7), V(0, 0.33, 0.32));   // bantalan karet
  b.grip(wood); b.guard(DK, -0.24);
  if (withIron) {
    b.box(-0.02, BORE_Y + 0.08, -2.22, 0.02, IRON_Y, -2.27, 0xd8d8d8);        // manik depan
    for (const s of [-1, 1]) b.box(s * 0.03, 0.33, 0.18, s * 0.07, IRON_Y + 0.02, 0.12, DK);   // takik belakang
  }
  // pompa (bergerak): kayu beralur
  p.box(-0.112, 0.07, -0.8, 0.112, 0.27, -1.32, wood);
  for (let z = -0.86; z > -1.3; z -= 0.09) p.box(-0.115, 0.1, z, 0.115, 0.24, z - 0.035, woodD);
  return finish(b, { b: p, kind: 'pump', pivot: V(0, 0.17, -1.06), travel: 0.3 },
    { muzzle: V(0, BORE_Y, -2.34), ejectPort: V(0.11, 0.25, -0.24), opticMount: V(0, RAIL_Y, -0.12), leftHand: V(-0.06, -0.08, -1.05), length: 3.5 });
}

// ── AWM: sasis hijau zaitun, receiver baja, laras panjang + rem moncong, bipod terlipat, popor thumbhole + penyangga pipi, bolt
function awm(_withIron: boolean): WeaponModel {
  const b = new Builder(), p = new Builder(), od = 0x4b5233, odD = 0x3c4229, blk = 0x1d1e20;
  b.box(-0.11, 0.08, 0.3, 0.11, 0.3, -0.92, od);                               // sasis
  b.box(-0.08, 0.2, 0.26, 0.08, 0.355, -0.58, blk);                            // receiver baja
  rail(b, 0.22, -0.66, blk);
  b.box(-0.05, BORE_Y - 0.05, -0.92, 0.05, BORE_Y + 0.05, -2.58, blk);           // laras
  for (let z = -1.0; z > -2.4; z -= 0.22) b.box(-0.052, BORE_Y - 0.012, z, 0.052, BORE_Y + 0.012, z - 0.14, 0x2a2b2e);   // alur laras
  b.box(-0.078, BORE_Y - 0.075, -2.58, 0.078, BORE_Y + 0.075, -2.82, blk);       // rem moncong
  b.box(-0.105, 0.06, -0.92, 0.105, 0.22, -1.48, od);                          // forend
  for (const s of [-1, 1]) b.box(s * 0.04, 0.01, -1.32, s * 0.07, 0.07, -2.05, blk);   // bipod terlipat
  b.box(-0.075, -0.18, -0.19, 0.075, 0.12, -0.43, blk);                        // magazen
  b.grip(od, 10); b.guard(odD, -0.24);
  b.box(-0.1, 0.02, 0.3, 0.1, 0.32, 1.26, od);                                 // popor
  b.box(-0.06, 0.32, 0.46, 0.06, 0.44, 0.96, odD);                             // penyangga pipi
  b.box(-0.1, -0.34, 0.92, 0.1, 0.02, 1.14, od);                               // kait popor (thumbhole)
  b.box(-0.105, -0.36, 1.14, 0.105, 0.34, 1.28, 0x141414);                     // bantalan
  // bolt (bergerak): badan bolt di belakang receiver + tuas ke kanan + kenop
  p.box(-0.055, BORE_Y - 0.05, 0.25, 0.055, BORE_Y + 0.05, 0.05, 0x3a3c3f);
  p.box(0.05, BORE_Y - 0.028, 0.18, 0.27, BORE_Y + 0.028, 0.12, blk);
  p.box(0.25, BORE_Y - 0.06, 0.21, 0.34, BORE_Y + 0.06, 0.09, 0x111214);
  return finish(b, { b: p, kind: 'bolt', pivot: V(0, BORE_Y, 0.15), travel: 0.34 },
    { muzzle: V(0, BORE_Y, -2.84), ejectPort: V(0.1, 0.3, -0.25), opticMount: V(0, RAIL_Y, -0.22), leftHand: V(-0.06, -0.1, -0.9), length: 4.1 });
}

// ── Desert Eagle: rangka & laras segitiga stainless, slide beralur (bagian bergerak), gagang hitam miring, palu
function deagle(withIron: boolean): WeaponModel {
  const b = new Builder(), p = new Builder(), st = 0x8e949a, stD = 0x6b7076, blk = 0x1b1b1d;
  b.box(-0.07, -0.5, 0.17, 0.07, 0.08, -0.07, blk, D2R(-17), V(0, 0.08, 0.05)); // gagang
  b.box(-0.074, -0.52, 0.2, 0.074, -0.45, -0.1, stD, D2R(-17), V(0, 0.08, 0.05)); // dasar magazen
  b.box(-0.07, 0.02, 0.2, 0.07, 0.14, -0.6, st);                              // rangka
  b.box(-0.025, -0.15, -0.02, 0.025, -0.11, -0.27, st);                       // pelindung pelatuk
  b.box(-0.025, -0.15, -0.23, 0.025, 0.02, -0.27, st);
  b.box(-0.075, 0.14, -0.22, 0.075, 0.36, -0.78, st);                         // laras tetap (profil segitiga)
  b.box(-0.045, 0.36, -0.24, 0.045, RAIL_Y - 0.005, -0.77, stD);               // rusuk atas laras
  b.box(-0.042, BORE_Y - 0.042, -0.78, 0.042, BORE_Y + 0.042, -0.8, blk);       // moncong
  b.box(-0.025, 0.26, 0.21, 0.025, 0.34, 0.27, blk);                          // palu
  if (withIron) b.box(-0.015, RAIL_Y - 0.01, -0.71, 0.015, IRON_Y, -0.75, blk); // tiang depan
  // slide (bergerak): bagian belakang di atas rangka, alur belakang, bidikan belakang
  p.box(-0.075, 0.14, 0.22, 0.075, 0.36, -0.22, st);
  for (let z = 0.2; z > 0.06; z -= 0.035) p.box(-0.077, 0.18, z, 0.077, 0.33, z - 0.015, stD);
  if (withIron) for (const s of [-1, 1]) p.box(s * 0.025, 0.35, 0.17, s * 0.06, IRON_Y + 0.02, 0.12, blk);
  else b.box(-0.05, 0.355, -0.27, 0.05, RAIL_Y, -0.5, blk);                     // pelat dudukan red dot di atas laras
  return finish(b, { b: p, kind: 'slide', pivot: V(0, 0.25, 0), travel: 0.16 },
    { muzzle: V(0, BORE_Y, -0.82), ejectPort: V(0.08, 0.3, -0.02), opticMount: V(0, RAIL_Y, -0.38), leftHand: V(-0.045, -0.2, -0.02),
      pistol: true, length: 1.1 });
}

// ── P90: bullpup bulat-kotak, magazen bening-asap melintang di atas (di bawah garis bidik), lubang jempol di depan
function p90(withIron: boolean): WeaponModel {
  const b = new Builder(), blk = 0x1f2022, gr = 0x2c2e31, mag = 0x4d463a;
  b.box(-0.11, 0.02, 0.78, 0.11, 0.3, -0.5, blk);                              // cangkang utama
  b.box(-0.1, -0.12, 0.78, 0.1, 0.04, 0.32, blk);                              // popor bawah (bullpup)
  b.box(-0.105, -0.16, 0.9, 0.105, 0.31, 0.78, gr);                            // bantalan popor
  b.box(-0.08, 0.3, 0.55, 0.08, 0.395, -0.44, mag);                            // magazen 50 di atas
  for (let z = 0.45; z > -0.4; z -= 0.12) b.box(-0.082, 0.33, z, 0.082, 0.36, z - 0.05, 0x3a352c);   // peluru terlihat
  b.box(-0.06, RAIL_Y - 0.02, 0.08, 0.06, RAIL_Y, -0.3, DK);                   // dudukan optik
  b.box(-0.09, -0.3, -0.18, 0.09, 0.02, -0.46, gr);                            // pegangan depan + lubang jempol
  b.box(-0.05, -0.22, -0.24, 0.05, -0.06, -0.4, 0x0d0d0e);
  b.box(-0.04, BORE_Y - 0.04, -0.5, 0.04, BORE_Y + 0.04, -0.72, DK);           // laras
  b.box(-0.05, BORE_Y - 0.05, -0.68, 0.05, BORE_Y + 0.05, -0.76, DK);
  b.grip(gr, 6);
  if (withIron) irons(b, -0.36, 0.42);
  return finish(b, null, { muzzle: V(0, BORE_Y, -0.78), ejectPort: V(0, -0.1, 0.4), opticMount: V(0, RAIL_Y, -0.11),
    leftHand: V(-0.04, -0.14, -0.33), length: 1.68 });
}

// ── Benelli M4: shotgun semi-otomatis hitam, rel atas, forend tetap, popor teleskopik + gagang pistol, ghost-ring
function m1014(withIron: boolean): WeaponModel {
  const b = new Builder(), blk = 0x232426, gr = 0x2f3134;
  b.box(-0.105, 0.1, 0.32, 0.105, 0.35, -0.56, blk);                           // receiver
  rail(b, 0.24, -0.46);
  b.box(-0.05, BORE_Y - 0.05, -0.56, 0.05, BORE_Y + 0.05, -2.12, blk);           // laras
  b.box(-0.055, 0.12, -0.56, 0.055, 0.22, -1.82, blk);                         // tabung magazen
  b.box(-0.06, 0.11, -1.78, 0.06, 0.23, -1.86, DK);
  b.box(-0.11, 0.07, -0.62, 0.11, 0.27, -1.24, gr);                            // forend tetap
  for (let z = -0.7; z > -1.2; z -= 0.1) b.box(-0.113, 0.12, z, 0.113, 0.22, z - 0.04, blk);
  b.box(0.106, 0.18, -0.06, 0.11, 0.3, -0.36, DK);                             // lubang pelontar
  b.grip(DK); b.guard(DK, -0.24);
  b.box(-0.06, 0.16, 0.32, 0.06, 0.28, 0.8, DK);                               // tabung popor
  b.box(-0.09, 0.0, 0.74, 0.09, 0.34, 0.98, blk);                              // popor
  if (withIron) irons(b, -2.06, 0.2);
  return finish(b, null, { muzzle: V(0, BORE_Y, -2.14), ejectPort: V(0.11, 0.25, -0.22), opticMount: V(0, RAIL_Y, -0.12),
    leftHand: V(-0.06, -0.08, -0.95), length: 3.1 });
}

// ── CheyTac M200: rel atas panjang, selubung laras besar berventilasi, rem moncong, bipod, popor rangka, bolt
function m200(_withIron: boolean): WeaponModel {
  const b = new Builder(), p = new Builder(), blk = 0x1e1f21, gr = 0x34363a;
  b.box(-0.1, 0.1, 0.28, 0.1, 0.34, -0.62, blk);                               // receiver
  rail(b, 0.24, -1.3, blk);
  b.box(-0.095, 0.1, -0.62, 0.095, RAIL_Y - 0.03, -1.62, gr);                  // selubung laras (forend)
  for (let z = -0.7; z > -1.6; z -= 0.18) b.box(-0.098, 0.18, z, 0.098, 0.27, z - 0.09, 0x141516);   // lubang ventilasi
  b.box(-0.045, BORE_Y - 0.045, -1.62, 0.045, BORE_Y + 0.045, -2.75, blk);       // laras
  b.box(-0.08, BORE_Y - 0.08, -2.75, 0.08, BORE_Y + 0.08, -3.0, blk);           // rem moncong
  for (const s of [-1, 1]) b.box(s * 0.04, 0.03, -1.45, s * 0.07, 0.1, -2.15, DK);    // bipod terlipat
  b.box(-0.07, -0.2, -0.2, 0.07, 0.12, -0.42, blk);                            // magazen
  b.grip(gr, 12); b.guard(DK, -0.24);
  b.box(-0.06, 0.24, 0.28, 0.06, 0.33, 1.18, gr);                              // popor rangka: batang atas
  b.box(-0.05, -0.1, 0.4, 0.05, -0.01, 1.12, gr);                              //                 batang bawah
  b.box(-0.05, -0.1, 0.4, 0.05, 0.3, 0.48, gr);                                //                 tiang depan
  b.box(-0.06, 0.33, 0.55, 0.06, 0.43, 0.95, blk);                             // penyangga pipi
  b.box(-0.1, -0.16, 1.12, 0.1, 0.36, 1.26, 0x141414);                         // bantalan
  p.box(-0.05, BORE_Y - 0.05, 0.36, 0.05, BORE_Y + 0.05, 0.06, 0x3a3c3f);
  p.box(0.05, BORE_Y - 0.025, 0.16, 0.25, BORE_Y + 0.025, 0.11, blk);
  p.box(0.23, BORE_Y - 0.055, 0.19, 0.31, BORE_Y + 0.055, 0.08, 0x111214);
  return finish(b, { b: p, kind: 'bolt', pivot: V(0, BORE_Y, 0.14), travel: 0.32 },
    { muzzle: V(0, BORE_Y, -3.02), ejectPort: V(0.1, 0.3, -0.25), opticMount: V(0, RAIL_Y, -0.3), leftHand: V(-0.06, -0.1, -1.05), length: 4.3 });
}

// ── Dragunov SVD: receiver hitam, handguard kayu berlubang, laras ramping panjang + peredam nyala, popor kayu rangka (thumbhole)
function svd(withIron: boolean): WeaponModel {
  const b = new Builder(), blk = 0x232425, wood = 0x7a4a2a, woodD = 0x5c3720;
  b.box(-0.095, 0.12, 0.3, 0.095, 0.34, -0.62, blk);                           // receiver
  rail(b, 0.16, -0.5);
  b.box(-0.1, 0.12, -0.62, 0.1, 0.33, -1.28, wood);                            // handguard kayu
  for (let z = -0.72; z > -1.2; z -= 0.14) b.box(-0.103, 0.2, z, 0.103, 0.27, z - 0.06, woodD);    // lubang ventilasi
  b.box(-0.04, BORE_Y - 0.04, -1.28, 0.04, BORE_Y + 0.04, -2.42, blk);           // laras
  b.box(-0.055, BORE_Y - 0.055, -2.42, 0.055, BORE_Y + 0.055, -2.6, blk);        // peredam nyala
  const magP = V(0, 0.12, -0.32);
  b.box(-0.065, -0.16, -0.22, 0.065, 0.12, -0.42, blk, D2R(-6), magP);         // magazen 10
  b.box(-0.065, -0.36, -0.25, 0.065, -0.14, -0.45, blk, D2R(-14), magP);
  b.guard(DK, -0.22);
  b.grip(wood, 4);
  b.box(-0.07, 0.22, 0.3, 0.07, 0.34, 1.02, wood);                             // popor rangka: atas (sandaran pipi)
  b.box(-0.065, -0.14, 0.36, 0.065, -0.02, 1.02, wood);                        //                 bawah
  b.box(-0.065, -0.14, 0.3, 0.065, 0.3, 0.42, wood);                           //                 tiang depan (thumbhole)
  b.box(-0.08, -0.18, 0.98, 0.08, 0.36, 1.1, woodD);                           // pelat popor
  if (withIron) irons(b, -2.3, -0.14);
  return finish(b, null, { muzzle: V(0, BORE_Y, -2.62), ejectPort: V(0.1, 0.28, -0.2), opticMount: V(0, RAIL_Y, -0.17),
    leftHand: V(-0.06, -0.08, -0.95), length: 3.7 });
}

// ── M249: receiver lebar, tutup pengumpan + rel, perisai panas di atas laras, kotak amunisi zaitun di kiri bawah, bipod, popor
function m249(withIron: boolean): WeaponModel {
  const b = new Builder(), blk = 0x2a2b2e, gr = 0x35373a, box = 0x4b5233;
  b.box(-0.12, 0.08, 0.4, 0.12, 0.35, -0.66, blk);                             // receiver
  b.box(-0.11, 0.35, 0.28, 0.11, RAIL_Y - 0.03, -0.56, gr);                    // tutup pengumpan
  rail(b, 0.22, -0.5);
  b.box(-0.045, BORE_Y - 0.045, -0.66, 0.045, BORE_Y + 0.045, -1.98, blk);       // laras
  b.box(-0.07, BORE_Y + 0.045, -0.72, 0.07, BORE_Y + 0.09, -1.32, gr);          // perisai panas (di bawah garis bidik)
  b.box(-0.03, 0.12, -0.66, 0.03, 0.2, -1.6, DK);                              // pipa gas
  b.box(-0.11, 0.05, -0.66, 0.11, 0.24, -1.12, gr);                            // forend
  b.box(-0.065, BORE_Y - 0.065, -1.98, 0.065, BORE_Y + 0.065, -2.1, DK);         // peredam nyala
  for (const s of [-1, 1]) b.box(s * 0.045, 0.0, -1.32, s * 0.075, 0.07, -1.9, DK);  // bipod terlipat
  b.box(-0.3, -0.36, -0.12, -0.05, 0.1, -0.56, box);                           // kotak amunisi (kiri bawah)
  b.box(-0.305, -0.1, -0.2, -0.3, 0.05, -0.48, 0x3c4228);
  for (let z = -0.16; z > -0.5; z -= 0.07) b.box(-0.06, 0.1, z, -0.02, 0.15, z - 0.04, 0xb08a3a);   // sabuk peluru
  b.grip(DK); b.guard(DK, -0.24);
  b.box(-0.09, 0.0, 0.4, 0.09, 0.33, 1.18, blk, D2R(4), V(0, 0.33, 0.4));      // popor
  b.box(-0.095, -0.03, 1.12, 0.095, 0.33, 1.22, 0x141414, D2R(4), V(0, 0.33, 0.4));
  if (withIron) irons(b, -1.9, 0.24);
  return finish(b, null, { muzzle: V(0, BORE_Y, -2.12), ejectPort: V(0.12, 0.2, -0.2), opticMount: V(0, RAIL_Y, -0.14),
    leftHand: V(-0.06, -0.1, -0.88), length: 3.3 });
}

// ── USP-S: pistol hitam dengan peredam panjang, bidikan tinggi (terlihat di atas peredam), slide bergerak
function usps(withIron: boolean): WeaponModel {
  const b = new Builder(), p = new Builder(), blk = 0x1d1e20, gr = 0x2c2e31;
  b.box(-0.068, -0.48, 0.16, 0.068, 0.08, -0.06, gr, D2R(-16), V(0, 0.08, 0.05));   // gagang
  b.box(-0.068, 0.02, 0.18, 0.068, 0.14, -0.58, gr);                           // rangka
  b.box(-0.025, -0.15, -0.02, 0.025, -0.11, -0.26, gr);                        // pelindung pelatuk
  b.box(-0.025, -0.15, -0.22, 0.025, 0.02, -0.26, gr);
  b.box(-0.03, 0.06, -0.3, 0.03, 0.1, -0.56, DK);                              // rel bawah
  b.box(-0.065, BORE_Y - 0.065, -0.7, 0.065, BORE_Y + 0.065, -1.38, 0x16171a);   // peredam
  for (let z = -0.8; z > -1.35; z -= 0.14) b.box(-0.067, BORE_Y - 0.05, z, 0.067, BORE_Y + 0.05, z - 0.02, 0x26282b);
  if (!withIron) b.box(-0.045, 0.345, -0.2, 0.045, RAIL_Y, -0.46, DK);           // pelat red dot
  p.box(-0.07, 0.14, 0.2, 0.07, 0.345, -0.7, blk);                             // slide
  for (let z = 0.17; z > 0.05; z -= 0.035) p.box(-0.072, 0.18, z, 0.072, 0.32, z - 0.015, 0x111214);
  if (withIron) {
    for (const s of [-1, 1]) p.box(s * 0.025, 0.34, 0.16, s * 0.06, IRON_Y + 0.02, 0.11, DK);   // bidikan belakang tinggi
    p.box(-0.015, 0.34, -0.62, 0.015, IRON_Y, -0.66, DK);                      // bidikan depan tinggi (di slide)
  }
  return finish(b, { b: p, kind: 'slide', pivot: V(0, 0.25, 0), travel: 0.14 },
    { muzzle: V(0, BORE_Y, -1.4), ejectPort: V(0.08, 0.3, -0.02), opticMount: V(0, RAIL_Y, -0.33), leftHand: V(-0.045, -0.2, -0.02),
      pistol: true, length: 1.6 });
}

// ───────────────────────────── batch 3

/** Magazen melengkung (2 segmen) di depan gagang. */
function curvedMag(b: Builder, z: number, len: number, color: number, w = 0.075) {
  const p = V(0, 0.12, z);
  b.box(-w, -0.2, z + 0.11, w, 0.12, z - 0.11, color, D2R(-10), p);
  b.box(-w, -0.2 - len, z + 0.13, w, -0.17, z - 0.09, color, D2R(-22), p);
}
/** Magazen lurus (sedikit miring) di depan gagang. */
function straightMag(b: Builder, z: number, depth: number, color: number, w = 0.07, ang = -5) {
  b.box(-w, 0.12 - depth, z + 0.1, w, 0.12, z - 0.1, color, D2R(ang), V(0, 0.12, z));
}
/** Popor teleskopik (tabung + popor). */
function teleStock(b: Builder, z0: number, color: number, len = 0.6) {
  b.box(-0.06, 0.18, z0, 0.06, 0.28, z0 + len * 0.7, DK);
  b.box(-0.09, 0.02, z0 + len * 0.6, 0.09, 0.34, z0 + len, color);
}
/** Bipod terlipat di bawah laras. */
function bipod(b: Builder, z0: number, z1: number, y = 0.02) {
  for (const s of [-1, 1]) b.box(s * 0.04, y, z0, s * 0.07, y + 0.07, z1, DK);
}

// UMP45: polimer kotak, rel penuh, handguard lebar berel samping, magazen lurus .45, popor lipat rangka
function ump45(withIron: boolean): WeaponModel {
  const b = new Builder(), blk = 0x232427, gr = 0x2f3134;
  b.box(-0.1, 0.1, 0.3, 0.1, 0.35, -0.8, blk);
  rail(b, 0.22, -0.7);
  b.box(-0.115, 0.05, -0.8, 0.115, 0.3, -1.16, gr);
  for (const s of [-1, 1]) b.box(s * 0.115, 0.14, -0.84, s * 0.13, 0.2, -1.12, DK);
  b.box(-0.04, BORE_Y - 0.04, -1.16, 0.04, BORE_Y + 0.04, -1.32, DK);
  straightMag(b, -0.38, 0.62, blk, 0.068, -4);
  b.grip(DK); b.guard(DK, -0.24);
  b.box(-0.05, 0.2, 0.3, 0.05, 0.3, 0.86, DK); b.box(-0.05, 0.02, 0.3, 0.05, 0.1, 0.86, DK);
  b.box(-0.08, 0.0, 0.8, 0.08, 0.34, 0.92, blk);
  if (withIron) irons(b, -1.08, 0.2);
  return finish(b, null, { muzzle: V(0, BORE_Y, -1.34), ejectPort: V(0.1, 0.28, -0.25), opticMount: V(0, RAIL_Y, -0.25),
    leftHand: V(-0.07, -0.1, -0.98), length: 2.26 });
}

// MP7: PDW ringkas, magazen di gagang, pegangan depan tegak (lipat), popor tarik
function mp7(withIron: boolean): WeaponModel {
  const b = new Builder(), blk = 0x202124, gr = 0x2d2f32;
  b.box(-0.095, 0.12, 0.26, 0.095, 0.35, -0.62, blk);
  b.box(-0.085, 0.02, -0.3, 0.085, 0.14, -0.62, gr);
  rail(b, 0.2, -0.55);
  b.box(-0.035, BORE_Y - 0.035, -0.62, 0.035, BORE_Y + 0.035, -0.84, DK);
  b.box(-0.045, -0.3, -0.42, 0.045, 0.04, -0.52, gr);                          // pegangan depan tegak
  b.grip(DK, 10);
  b.box(-0.075, -0.5, 0.15, 0.075, -0.42, -0.08, gr, D2R(-10), V(0, 0.1, 0.03));   // dasar magazen di gagang
  b.guard(DK, -0.2);
  for (const s of [-1, 1]) b.box(s * 0.03, 0.18, 0.26, s * 0.055, 0.24, 0.76, DK);   // batang popor
  b.box(-0.075, 0.06, 0.72, 0.075, 0.32, 0.8, blk);
  if (withIron) irons(b, -0.54, 0.18);
  return finish(b, null, { muzzle: V(0, BORE_Y, -0.86), ejectPort: V(0.09, 0.28, -0.15), opticMount: V(0, RAIL_Y, -0.2),
    leftHand: V(-0.03, -0.16, -0.47), length: 1.66 });
}

// Micro UZI: kotak kecil, magazen di gagang, tuas kokang di atas, popor kawat terlipat di samping
function uzi(withIron: boolean): WeaponModel {
  const b = new Builder(), gr = 0x2b2c2f, blk = 0x1f2023;
  b.box(-0.09, 0.12, 0.2, 0.09, 0.34, -0.62, gr);
  b.box(-0.04, 0.34, 0.08, 0.04, 0.37, -0.22, blk);                            // tutup + kenop kokang
  b.box(-0.04, BORE_Y - 0.04, -0.62, 0.04, BORE_Y + 0.04, -0.74, DK);
  b.grip(blk, 8);
  b.box(-0.072, -0.58, 0.14, 0.072, -0.42, -0.04, gr, D2R(-8), V(0, 0.1, 0.03));   // magazen menonjol di bawah gagang
  b.guard(DK, -0.22);
  b.box(0.09, 0.15, 0.18, 0.11, 0.2, -0.42, DK);                               // popor kawat terlipat (kanan)
  b.box(-0.06, 0.04, -0.32, 0.06, 0.12, -0.58, blk);                           // pegangan depan pendek
  if (!withIron) b.box(-0.05, 0.34, -0.25, 0.05, RAIL_Y, -0.5, DK);
  if (withIron) irons(b, -0.58, 0.14);
  return finish(b, null, { muzzle: V(0, BORE_Y, -0.76), ejectPort: V(0.09, 0.28, -0.1), opticMount: V(0, RAIL_Y, -0.36),
    leftHand: V(-0.05, -0.08, -0.48), length: 1.0 });
}

// SPAS-12: perisai panas berlubang di atas laras, pompa polimer besar (bergerak), popor logam rangka
function spas12(withIron: boolean): WeaponModel {
  const b = new Builder(), p = new Builder(), blk = 0x1f2022, gr = 0x2c2e31;
  b.box(-0.105, 0.1, 0.32, 0.105, 0.36, -0.6, blk);
  rail(b, 0.2, -0.45);
  b.box(-0.045, BORE_Y - 0.045, -0.6, 0.045, BORE_Y + 0.045, -2.02, blk);
  b.box(-0.06, BORE_Y + 0.02, -0.66, 0.06, BORE_Y + 0.1, -1.72, gr);          // perisai panas
  for (let z = -0.72; z > -1.68; z -= 0.12) b.box(-0.062, BORE_Y + 0.04, z, 0.062, BORE_Y + 0.08, z - 0.05, 0x0e0f10);
  b.box(-0.055, 0.12, -0.6, 0.055, 0.22, -1.72, blk);
  b.grip(DK); b.guard(DK, -0.24);
  b.box(-0.05, 0.26, 0.32, 0.05, 0.33, 1.02, gr);                              // popor rangka atas
  b.box(-0.04, 0.02, 0.32, 0.04, 0.09, 0.98, gr);                              //             bawah
  b.box(-0.08, -0.02, 0.96, 0.08, 0.34, 1.06, blk);
  b.box(-0.04, -0.12, 0.98, 0.04, -0.02, 1.04, gr);                            // kait popor
  if (withIron) irons(b, -1.96, 0.2);
  p.box(-0.115, 0.06, -0.78, 0.115, 0.27, -1.3, gr);
  for (let z = -0.84; z > -1.28; z -= 0.08) p.box(-0.118, 0.1, z, 0.118, 0.23, z - 0.035, blk);
  return finish(b, { b: p, kind: 'pump', pivot: V(0, 0.17, -1.04), travel: 0.28 },
    { muzzle: V(0, BORE_Y, -2.04), ejectPort: V(0.11, 0.25, -0.24), opticMount: V(0, RAIL_Y, -0.13), leftHand: V(-0.06, -0.08, -1.04), length: 3.1 });
}

// Saiga-12: shotgun gaya AK, magazen kotak lebar, handguard polimer, rem moncong, popor lipat samping
function s12k(withIron: boolean): WeaponModel {
  const b = new Builder(), blk = 0x222326, gr = 0x2e3033;
  b.box(-0.1, 0.12, 0.35, 0.1, 0.35, -0.62, blk);
  rail(b, 0.22, -0.5);
  b.box(-0.11, 0.12, -0.62, 0.11, 0.33, -1.15, gr);
  b.box(-0.05, BORE_Y - 0.05, -1.15, 0.05, BORE_Y + 0.05, -1.86, blk);
  b.box(-0.075, BORE_Y - 0.075, -1.86, 0.075, BORE_Y + 0.075, -2.02, DK);
  b.box(-0.095, -0.32, -0.3, 0.095, 0.12, -0.56, blk, D2R(-6), V(0, 0.12, -0.43));   // magazen kotak 5
  b.grip(DK); b.guard(DK, -0.26);
  b.box(-0.05, 0.12, 0.35, 0.05, 0.3, 1.0, DK);                                // popor lipat (rangka)
  b.box(-0.08, 0.0, 0.92, 0.08, 0.33, 1.02, blk);
  if (withIron) irons(b, -1.78, 0.2);
  return finish(b, null, { muzzle: V(0, BORE_Y, -2.04), ejectPort: V(0.1, 0.28, -0.2), opticMount: V(0, RAIL_Y, -0.15),
    leftHand: V(-0.07, -0.1, -0.9), length: 3.05 });
}

// Double barrel (S686): dua laras atas-bawah, receiver perak, forend & popor kayu, manik depan
function s686(withIron: boolean): WeaponModel {
  const b = new Builder(), steel = 0x9aa0a6, blue = 0x2a2c30, wood = 0x6e4a2e, woodD = 0x553821;
  b.box(-0.1, 0.05, 0.3, 0.1, 0.34, -0.3, steel);
  b.box(-0.055, 0.23, -0.3, 0.055, 0.335, -2.2, blue);                         // laras atas
  b.box(-0.055, 0.115, -0.3, 0.055, 0.225, -2.2, blue);                        // laras bawah
  b.box(-0.02, 0.335, -0.32, 0.02, 0.36, -2.18, DK);                           // rusuk
  b.box(-0.085, 0.02, -0.35, 0.085, 0.13, -1.02, wood);                        // forend
  b.box(-0.1, -0.02, 0.3, 0.1, 0.32, 1.2, wood, D2R(8), V(0, 0.32, 0.3));      // popor
  b.box(-0.104, -0.06, 1.12, 0.104, 0.3, 1.2, 0x161616, D2R(8), V(0, 0.32, 0.3));
  b.grip(woodD, 18); b.guard(steel, -0.22);
  if (withIron) b.box(-0.02, 0.36, -2.12, 0.02, IRON_Y, -2.17, 0xe0e0e0);      // manik depan
  return finish(b, null, { muzzle: V(0, BORE_Y, -2.22), ejectPort: V(0, 0.3, 0.0), opticMount: V(0, RAIL_Y, -0.1),
    leftHand: V(-0.06, -0.12, -0.7), length: 3.4 });
}

// Kar98k: popor kayu penuh sampai dekat moncong, receiver baja, laras terbuka di ujung, kerudung bidikan depan, bolt lurus
function kar98k(withIron: boolean): WeaponModel {
  const b = new Builder(), p = new Builder(), wood = 0x6b4423, woodD = 0x52331a, steel = 0x3a3c40;
  b.box(-0.09, 0.04, 0.3, 0.09, 0.26, -1.62, wood);                           // kayu depan
  b.box(-0.075, 0.26, -0.45, 0.075, 0.3, -1.6, woodD);                         // penutup atas laras (kayu)
  b.box(-0.095, -0.2, 0.3, 0.095, 0.29, 1.18, wood, D2R(6), V(0, 0.29, 0.3));  // popor
  b.box(-0.097, -0.24, 1.1, 0.097, 0.27, 1.18, woodD, D2R(6), V(0, 0.29, 0.3));
  b.box(-0.075, 0.2, 0.3, 0.075, 0.34, -0.45, steel);                          // receiver
  b.box(-0.035, BORE_Y - 0.035, -1.6, 0.035, BORE_Y + 0.035, -2.62, 0x2a2b2e); // laras
  for (const z of [-0.95, -1.5]) b.box(-0.095, 0.02, z, 0.095, 0.3, z - 0.05, steel);   // gelang laras
  b.box(-0.06, 0.02, -0.15, 0.06, 0.06, -0.45, steel);                         // pelat magazen
  b.grip(wood, 24); b.guard(steel, -0.22);
  if (withIron) {
    b.box(-0.016, BORE_Y + 0.035, -2.5, 0.016, IRON_Y, -2.54, steel);
    for (const s of [-1, 1]) b.box(s * 0.04, BORE_Y + 0.035, -2.47, s * 0.062, IRON_Y + 0.02, -2.57, steel);   // kerudung
    for (const s of [-1, 1]) b.box(s * 0.03, 0.3, -0.5, s * 0.07, IRON_Y + 0.02, -0.56, steel);              // bidikan belakang
  } else rail(b, 0.18, -0.36, DK);
  p.box(-0.05, BORE_Y - 0.05, 0.4, 0.05, BORE_Y + 0.05, 0.08, 0x4a4c50);
  p.box(0.05, BORE_Y - 0.03, 0.18, 0.24, BORE_Y + 0.03, 0.13, steel);
  p.box(0.22, BORE_Y - 0.055, 0.21, 0.29, BORE_Y + 0.055, 0.1, 0x2a2b2e);
  return finish(b, { b: p, kind: 'bolt', pivot: V(0, BORE_Y, 0.15), travel: 0.3 },
    { muzzle: V(0, BORE_Y, -2.64), ejectPort: V(0.08, 0.3, -0.1), opticMount: V(0, RAIL_Y, -0.09), leftHand: V(-0.06, -0.1, -1.0), length: 3.8 });
}

// Barrett M82: receiver atas panjang, selubung laras berlubang, rem moncong ganda besar, magazen 10, bipod, popor + monopod
function m82(_withIron: boolean): WeaponModel {
  const b = new Builder(), gr = 0x2e3033, blk = 0x1d1e20;
  b.box(-0.11, 0.1, 0.36, 0.11, 0.35, -1.22, gr);                              // receiver atas
  rail(b, 0.24, -1.1, blk);
  b.box(-0.1, 0.12, -1.22, 0.1, 0.34, -2.2, gr);                               // selubung laras
  for (let z = -1.3; z > -2.15; z -= 0.17) b.box(-0.102, 0.18, z, 0.102, 0.28, z - 0.08, 0x111214);
  b.box(-0.05, BORE_Y - 0.05, -2.2, 0.05, BORE_Y + 0.05, -2.9, blk);
  b.box(-0.12, BORE_Y - 0.1, -2.9, 0.12, BORE_Y + 0.1, -3.22, blk);            // rem moncong ganda
  b.box(-0.124, BORE_Y - 0.06, -2.98, 0.124, BORE_Y + 0.06, -3.04, 0x0c0c0d);
  b.box(-0.124, BORE_Y - 0.06, -3.1, 0.124, BORE_Y + 0.06, -3.16, 0x0c0c0d);
  b.box(-0.085, -0.32, -0.18, 0.085, 0.12, -0.46, blk);                        // magazen 10
  bipod(b, -1.4, -2.3, 0.02);
  b.grip(blk, 12); b.guard(DK, -0.26);
  b.box(-0.1, -0.06, 0.36, 0.1, 0.33, 1.28, gr);                               // popor
  b.box(-0.06, 0.33, 0.6, 0.06, 0.42, 1.05, blk);                              // sandaran pipi
  b.box(-0.03, -0.3, 0.95, 0.03, -0.06, 1.02, DK);                             // monopod
  b.box(-0.11, -0.1, 1.24, 0.11, 0.36, 1.36, 0x141414);
  return finish(b, null, { muzzle: V(0, BORE_Y, -3.24), ejectPort: V(0.11, 0.25, -0.3), opticMount: V(0, RAIL_Y, -0.45),
    leftHand: V(-0.06, -0.12, -1.3), length: 4.6 });
}

// Mini-14: popor kayu ranch rifle, receiver baja, laras panjang, magazen 20 lurus
function mini14(withIron: boolean): WeaponModel {
  const b = new Builder(), wood = 0x7a5232, woodD = 0x5e3d23, steel = 0x3b3e42;
  b.box(-0.09, 0.04, 0.3, 0.09, 0.27, -1.12, wood);
  b.box(-0.07, 0.27, -0.42, 0.07, 0.31, -1.1, woodD);                          // tutup laras atas
  b.box(-0.095, -0.16, 0.3, 0.095, 0.3, 1.12, wood, D2R(5), V(0, 0.3, 0.3));
  b.box(-0.097, -0.2, 1.04, 0.097, 0.29, 1.12, 0x181818, D2R(5), V(0, 0.3, 0.3));
  b.box(-0.075, 0.2, 0.3, 0.075, 0.35, -0.42, steel);
  rail(b, 0.2, -0.32, DK);
  b.box(-0.035, BORE_Y - 0.035, -1.12, 0.035, BORE_Y + 0.035, -2.12, 0x2a2b2e);
  b.box(-0.05, 0.16, -1.05, 0.05, 0.27, -1.15, steel);                         // blok gas
  straightMag(b, -0.34, 0.5, 0x2a2b2e, 0.062, -3);
  b.grip(wood, 22); b.guard(steel, -0.22);
  if (withIron) irons(b, -2.02, 0.22, steel);
  return finish(b, null, { muzzle: V(0, BORE_Y, -2.14), ejectPort: V(0.08, 0.3, -0.1), opticMount: V(0, RAIL_Y, -0.06),
    leftHand: V(-0.06, -0.1, -0.95), length: 3.3 });
}

// DP-28: magazen piringan datar di atas receiver (di bawah garis bidik), selubung laras berlubang, bipod, popor kayu
function dp28(withIron: boolean): WeaponModel {
  const b = new Builder(), blk = 0x2a2b2d, wood = 0x6b4423, pan = 0x4a4f3a;
  b.box(-0.1, 0.08, 0.35, 0.1, 0.32, -0.5, blk);
  b.box(-0.3, 0.33, 0.02, 0.3, 0.4, -0.6, pan);                                // piringan
  b.box(-0.08, 0.4, -0.2, 0.08, 0.405, -0.38, 0x3a3f2c);
  b.box(-0.075, 0.18, -0.5, 0.075, 0.36, -1.7, blk);                           // selubung laras
  for (let z = -0.6; z > -1.65; z -= 0.15) b.box(-0.077, 0.24, z, 0.077, 0.3, z - 0.07, 0x101112);
  b.box(-0.035, BORE_Y - 0.035, -1.7, 0.035, BORE_Y + 0.035, -2.02, blk);
  b.box(-0.05, BORE_Y - 0.05, -2.0, 0.05, BORE_Y + 0.05, -2.1, DK);
  bipod(b, -1.2, -1.85, 0.06);
  b.box(-0.09, -0.12, 0.35, 0.09, 0.3, 1.18, wood, D2R(7), V(0, 0.3, 0.35));
  b.grip(wood, 28); b.guard(blk, -0.22);
  b.box(-0.05, 0.32, 0.32, 0.05, RAIL_Y, 0.05, DK);                            // dudukan optik di belakang piringan
  if (withIron) irons(b, -1.88, 0.26);
  return finish(b, null, { muzzle: V(0, BORE_Y, -2.12), ejectPort: V(0.1, 0.2, -0.1), opticMount: V(0, RAIL_Y, 0.18),
    leftHand: V(-0.05, -0.04, -0.85), length: 3.3 });
}

// RPK: AK berlaras berat, handguard kayu, pipa gas, magazen lengkung 45 panjang, bipod, popor kayu "kaki gada"
function rpk(withIron: boolean): WeaponModel {
  const b = new Builder(), blk = 0x2b2b2d, wood = 0x7a4a2a, woodD = 0x5c3720;
  b.box(-0.1, 0.12, 0.35, 0.1, 0.35, -0.62, blk);
  rail(b, 0.2, -0.5);
  b.box(-0.105, 0.12, -0.62, 0.105, 0.33, -1.2, wood);
  b.box(-0.04, 0.33, -0.62, 0.04, IRON_Y - 0.02, -1.2, blk);                   // pipa gas (di bawah garis bidik)
  b.box(-0.045, BORE_Y - 0.045, -1.2, 0.045, BORE_Y + 0.045, -2.32, blk);
  b.box(-0.06, BORE_Y - 0.06, -2.32, 0.06, BORE_Y + 0.06, -2.42, DK);
  bipod(b, -1.6, -2.2, 0.1);
  curvedMag(b, -0.42, 0.42, blk);
  b.grip(woodD, 16); b.guard(DK, -0.26);
  b.box(-0.09, -0.06, 0.35, 0.09, 0.32, 1.15, wood, D2R(9), V(0, 0.32, 0.35));
  b.box(-0.092, -0.22, 0.95, 0.092, 0.0, 1.15, wood, D2R(9), V(0, 0.32, 0.35));   // kaki gada
  if (withIron) irons(b, -2.2, -0.42);
  return finish(b, null, { muzzle: V(0, BORE_Y, -2.44), ejectPort: V(0.1, 0.28, -0.25), opticMount: V(0, RAIL_Y, -0.15),
    leftHand: V(-0.06, -0.1, -0.95), length: 3.6 });
}

/** Pistol bersama: gagang miring, rangka, slide (bagian bergerak) beralur belakang, bidikan besi di slide, pelat red dot. */
function pistolBase(withIron: boolean, o: { frame: number; slide: number; grip: number; len: number; rake?: number; slideTop?: number;
  muzzleZ: number; dots?: boolean; travel?: number }): { b: Builder; p: Builder; done: (extraLen?: number) => WeaponModel } {
  const b = new Builder(), p = new Builder(), top = o.slideTop ?? 0.345, front = -o.len;
  b.box(-0.068, -0.48, 0.16, 0.068, 0.08, -0.06, o.grip, D2R(-(o.rake ?? 17)), V(0, 0.08, 0.05));
  b.box(-0.066, 0.02, 0.18, 0.066, 0.14, front + 0.08, o.frame);
  b.box(-0.025, -0.15, -0.02, 0.025, -0.11, -0.26, o.frame);
  b.box(-0.025, -0.15, -0.22, 0.025, 0.02, -0.26, o.frame);
  b.box(-0.04, BORE_Y - 0.04, front, 0.04, BORE_Y + 0.04, front - 0.02, DK);
  p.box(-0.07, 0.14, 0.2, 0.07, top, front, o.slide);
  for (let z = 0.17; z > 0.05; z -= 0.035) p.box(-0.072, 0.18, z, 0.072, top - 0.03, z - 0.015, 0x111214);
  if (withIron) {
    for (const s of [-1, 1]) p.box(s * 0.025, top - 0.005, 0.16, s * 0.06, IRON_Y + 0.02, 0.11, DK);
    p.box(-0.015, top - 0.005, front + 0.06, 0.015, IRON_Y, front + 0.02, DK);
  } else b.box(-0.045, top, -0.2, 0.045, RAIL_Y, -0.44, DK);
  const done = () => finish(b, { b: p, kind: 'slide', pivot: V(0, 0.25, 0), travel: o.travel ?? 0.15 },
    { muzzle: V(0, BORE_Y, front - 0.03), ejectPort: V(0.08, 0.3, -0.02), opticMount: V(0, RAIL_Y, -0.32), leftHand: V(-0.045, -0.2, -0.02),
      pistol: true, length: o.len + 0.2 });
  return { b, p, done };
}

// Glock 18C: polimer hitam, slide berkompensator, tuas selektor
function glock18(withIron: boolean): WeaponModel {
  const { b, p, done } = pistolBase(withIron, { frame: 0x26272a, slide: 0x1d1e20, grip: 0x26272a, len: 0.74, rake: 20, muzzleZ: -0.74 });
  for (const z of [-0.6, -0.66]) p.box(-0.02, 0.33, z, 0.02, 0.35, z - 0.03, 0x0b0b0c);   // lubang kompensator
  b.box(-0.075, 0.08, 0.08, -0.066, 0.12, 0.0, 0x8a8f95);                       // selektor
  return done();
}
// M1911: baja biru, panel gagang kayu, palu, ujung laras (bushing)
function m1911(withIron: boolean): WeaponModel {
  const { b, p, done } = pistolBase(withIron, { frame: 0x2c2e33, slide: 0x2c2e33, grip: 0x6b4423, len: 0.78, rake: 16, muzzleZ: -0.78, slideTop: 0.33 });
  b.box(-0.025, 0.25, 0.21, 0.025, 0.33, 0.26, 0x1b1c1f);                      // palu
  p.box(-0.045, BORE_Y - 0.045, -0.76, 0.045, BORE_Y + 0.045, -0.8, 0x3b3e44);   // bushing
  return done();
}
// Beretta M9: slide terbuka (laras perak terlihat di tengah), rangka lebar hitam
function m9(withIron: boolean): WeaponModel {
  const { b, done } = pistolBase(withIron, { frame: 0x232427, slide: 0x1f2023, grip: 0x232427, len: 0.8, rake: 15, muzzleZ: -0.8, slideTop: 0.335 });
  b.box(-0.04, BORE_Y - 0.04, -0.22, 0.04, BORE_Y + 0.05, -0.62, 0x9aa0a6);    // laras perak di jendela slide
  return done();
}

// FAMAS: bullpup dengan gagang angkat panjang (rumah bidikan; dilepas bila optik terpasang), magazen di belakang gagang, bipod
function famas(withIron: boolean): WeaponModel {
  const b = new Builder(), blk = 0x252628, gr = 0x303235;
  b.box(-0.11, 0.0, 0.72, 0.11, 0.34, -0.82, blk);
  b.box(-0.1, -0.1, 0.72, 0.1, 0.02, 0.3, blk);
  b.box(-0.105, -0.14, 0.86, 0.105, 0.34, 0.72, gr);
  b.box(-0.04, BORE_Y - 0.04, -0.82, 0.04, BORE_Y + 0.04, -1.1, DK);
  b.box(-0.055, BORE_Y - 0.055, -1.06, 0.055, BORE_Y + 0.055, -1.16, DK);
  straightMag(b, 0.32, 0.5, blk, 0.07, 0);
  b.grip(DK); b.guard(DK, -0.24);
  bipod(b, -0.6, -1.05, -0.04);
  if (withIron) {
    for (const s of [-1, 1]) {
      b.box(s * 0.05, 0.34, 0.5, s * 0.075, 0.56, 0.4, gr);                     // tiang gagang belakang (terbelah)
      b.box(s * 0.05, 0.34, -0.55, s * 0.075, 0.56, -0.65, gr);                 // tiang gagang depan
    }
    b.box(-0.075, 0.5, 0.5, 0.075, 0.56, -0.65, gr);                            // palang gagang (di atas garis bidik)
    irons(b, -0.6, 0.44);
  } else rail(b, 0.3, -0.5);
  return finish(b, null, { muzzle: V(0, BORE_Y, -1.18), ejectPort: V(0.11, 0.25, 0.2), opticMount: V(0, RAIL_Y, -0.1),
    leftHand: V(-0.05, -0.1, -0.56), length: 2.0 });
}

// AS VAL: receiver gaya AK, handguard pendek + peredam gemuk terpadu, magazen 20, popor rangka lipat
function asval(withIron: boolean): WeaponModel {
  const b = new Builder(), blk = 0x1e1f21, gr = 0x2b2d30;
  b.box(-0.095, 0.12, 0.3, 0.095, 0.35, -0.5, blk);
  rail(b, 0.2, -0.4);
  b.box(-0.1, 0.12, -0.5, 0.1, 0.33, -0.95, gr);
  b.box(-0.075, BORE_Y - 0.075, -0.95, 0.075, BORE_Y + 0.075, -1.62, 0x141517);   // peredam
  for (let z = -1.02; z > -1.6; z -= 0.13) b.box(-0.077, BORE_Y - 0.06, z, 0.077, BORE_Y + 0.06, z - 0.02, 0x24262a);
  straightMag(b, -0.32, 0.46, blk, 0.066, -8);
  b.grip(DK); b.guard(DK, -0.24);
  b.box(-0.04, 0.24, 0.3, 0.04, 0.31, 0.92, gr); b.box(-0.04, 0.0, 0.3, 0.04, 0.07, 0.88, gr);
  b.box(-0.075, -0.02, 0.86, 0.075, 0.32, 0.95, blk);
  if (withIron) irons(b, -1.52, -0.02);
  return finish(b, null, { muzzle: V(0, BORE_Y, -1.64), ejectPort: V(0.09, 0.28, -0.15), opticMount: V(0, RAIL_Y, -0.12),
    leftHand: V(-0.06, -0.1, -0.74), length: 2.6 });
}

// Honey Badger: AR-15 FDE, handguard panjang menyelubungi peredam, popor PDW ringkas
function badger(withIron: boolean): WeaponModel {
  const b = new Builder(), fde = 0x8b7a5a, fdeD = 0x6e6047, blk = 0x1f2022;
  b.box(-0.1, 0.12, 0.35, 0.1, 0.36, -0.6, fde);
  rail(b, 0.25, -1.5, blk);
  b.box(-0.105, 0.12, -0.6, 0.105, 0.35, -1.56, fdeD);                          // handguard + peredam
  for (let z = -0.7; z > -1.5; z -= 0.12) for (const s of [-1, 1]) b.box(s * 0.105, 0.2, z, s * 0.11, 0.26, z - 0.07, blk);
  b.box(-0.06, BORE_Y - 0.06, -1.56, 0.06, BORE_Y + 0.06, -1.62, blk);
  straightMag(b, -0.42, 0.55, blk, 0.07, -6);
  b.grip(blk); b.guard(blk, -0.24);
  for (const s of [-1, 1]) b.box(s * 0.03, 0.2, 0.35, s * 0.055, 0.26, 0.72, blk);
  b.box(-0.08, 0.04, 0.68, 0.08, 0.34, 0.78, fde);
  if (withIron) irons(b, -1.46, 0.26, blk);
  return finish(b, null, { muzzle: V(0, BORE_Y, -1.64), ejectPort: V(0.1, 0.3, -0.15), opticMount: V(0, RAIL_Y, -0.3),
    leftHand: V(-0.07, -0.1, -1.0), length: 2.42 });
}

// FN FAL: battle rifle panjang, handguard berventilasi, peredam nyala, bidikan depan tinggi, magazen 20, popor tetap
function fal(withIron: boolean): WeaponModel {
  const b = new Builder(), blk = 0x262729, gr = 0x323437;
  b.box(-0.1, 0.12, 0.35, 0.1, 0.36, -0.66, blk);
  rail(b, 0.22, -0.55);
  b.box(-0.105, 0.1, -0.66, 0.105, 0.33, -1.32, gr);
  for (let z = -0.74; z > -1.28; z -= 0.12) b.box(-0.108, 0.17, z, 0.108, 0.27, z - 0.05, blk);
  b.box(-0.04, BORE_Y - 0.04, -1.32, 0.04, BORE_Y + 0.04, -2.36, blk);
  b.box(-0.055, BORE_Y - 0.055, -2.36, 0.055, BORE_Y + 0.055, -2.52, DK);
  straightMag(b, -0.42, 0.55, blk, 0.07, -6);
  b.grip(DK); b.guard(DK, -0.24);
  b.box(-0.09, -0.02, 0.35, 0.09, 0.33, 1.2, blk, D2R(4), V(0, 0.33, 0.35));
  b.box(-0.095, -0.05, 1.12, 0.095, 0.33, 1.2, 0x141414, D2R(4), V(0, 0.33, 0.35));
  if (withIron) irons(b, -2.24, 0.26);
  return finish(b, null, { muzzle: V(0, BORE_Y, -2.54), ejectPort: V(0.1, 0.28, -0.25), opticMount: V(0, RAIL_Y, -0.17),
    leftHand: V(-0.07, -0.1, -1.0), length: 3.75 });
}

// Galil ACE: AK modern polimer, rel penuh, handguard berel, rem moncong, magazen lengkung 35, popor teleskopik lipat
function galil(withIron: boolean): WeaponModel {
  const b = new Builder(), blk = 0x242527, gr = 0x2f3134;
  b.box(-0.1, 0.12, 0.35, 0.1, 0.36, -0.62, blk);
  rail(b, 0.3, -1.08);
  b.box(-0.11, 0.1, -0.62, 0.11, 0.34, -1.15, gr);
  for (const s of [-1, 1]) b.box(s * 0.11, 0.16, -0.68, s * 0.125, 0.24, -1.1, DK);
  b.box(-0.045, BORE_Y - 0.045, -1.15, 0.045, BORE_Y + 0.045, -1.9, blk);
  b.box(-0.07, BORE_Y - 0.07, -1.9, 0.07, BORE_Y + 0.07, -2.06, DK);
  curvedMag(b, -0.42, 0.36, blk);
  b.grip(DK); b.guard(DK, -0.26);
  teleStock(b, 0.35, blk, 0.62);
  if (withIron) irons(b, -1.08, 0.26);
  return finish(b, null, { muzzle: V(0, BORE_Y, -2.08), ejectPort: V(0.1, 0.28, -0.2), opticMount: V(0, RAIL_Y, -0.3),
    leftHand: V(-0.07, -0.1, -0.95), length: 3.05 });
}

export const X_MODELS: Record<XWeaponId, (withIron: boolean) => WeaponModel> = {
  mp5, vector, p90, ump45, mp7, uzi, m870, spas12, m1014, s12k, s686, awm, m200, kar98k, m82, svd, mini14, m249, dp28, rpk,
  deagle, glock18, usps, m1911, m9, famas, asval, badger, fal, galil,
};
