// src/entities/botAim.ts — model gerak bidik & waktu reaksi bot yang manusiawi (MURNI: tanpa THREE/ctx → tests/botAim.test.ts).
// Lapisan di atas GDD §11.4 (error e0 → eMin, turn rate maks, kompensasi recoil — angkanya tidak diubah; lihat XCFG.bots.human):
//  • Sentakan (flick) berprofil minimum-jerk: pelan di awal, paling cepat di tengah, melambat di akhir — bukan putaran turret
//    berkecepatan konstan yang berhenti mendadak tepat di target. Kecepatan puncak = turn rate GDD.
//  • Ujung sentakan bisa kelewatan (overshoot) atau kurang sedikit, plus meleset tegak lurus; sisanya dikoreksi pelacakan halus
//    (micro-correction). Galat sisa > flickMin → sentakan koreksi kedua yang lebih kecil (seperti mata/tangan manusia).
//  • Pelacakan: koreksi proporsional + feedforward kecepatan sudut target → mengikuti target bergerak tanpa tersentak-sentak.

export interface AimParams {
  /** rad/s — kecepatan puncak sentakan & batas kecepatan pelacakan. */
  maxSpeed: number;
  /** rad — galat bidik > ini memicu sentakan baru. */
  flickMin: number;
  /** 1/s — penguatan koreksi proporsional saat melacak. */
  trackGain: number;
  /** 0..1 — porsi kecepatan sudut target yang diikuti langsung (feedforward). */
  trackFeed: number;
  /** 0..1 — peluang ujung sentakan kelewatan. */
  overshootChance: number;
  /** [min, maks] porsi amplitudo saat kelewatan. */
  overshoot: readonly [number, number];
  /** porsi amplitudo maks saat kurang (tidak kelewatan). */
  undershoot: number;
  /** porsi amplitudo maks meleset tegak lurus arah sentakan (±). */
  scatter: number;
  /** s — durasi sentakan minimum. */
  minFlickT: number;
}

export interface AimState {
  yaw: number; pitch: number;
  flicking: boolean;
  /** waktu berjalan & durasi sentakan */
  ft: number; fT: number;
  /** pose awal, perpindahan rencana (termasuk kelewatan/meleset), tujuan saat sentakan dimulai */
  f0y: number; f0p: number; fdy: number; fdp: number; fDesY: number; fDesP: number;
  /** tujuan frame sebelumnya & kecepatan sudut tujuan (dihaluskan) */
  prevY: number; prevP: number; vY: number; vP: number; primed: boolean;
}

const PITCH_MAX = 85 * Math.PI / 180;
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
/** Profil posisi minimum-jerk 0 → 1 (kecepatan puncak 1.875 / T di tengah, nol di kedua ujung). */
export const minJerk = (u: number) => u * u * u * (10 - 15 * u + 6 * u * u);

export function newAimState(yaw = 0, pitch = 0): AimState {
  return { yaw, pitch, flicking: false, ft: 0, fT: 0, f0y: 0, f0p: 0, fdy: 0, fdp: 0, fDesY: 0, fDesP: 0, prevY: 0, prevP: 0, vY: 0, vP: 0,
    primed: false };
}

/** Spawn / teleport: pose baru tanpa sentakan & tanpa riwayat kecepatan. */
export function resetAim(s: AimState, yaw: number, pitch: number) {
  s.yaw = yaw; s.pitch = pitch; s.flicking = false; s.vY = 0; s.vP = 0; s.primed = false;
}

/** Rencanakan sentakan menuju galat (ey, ep): ujungnya kelewatan / kurang + meleset tegak lurus; durasi dari kecepatan puncak. */
function planFlick(s: AimState, ey: number, ep: number, err: number, desY: number, desP: number, p: AimParams, rnd: () => number) {
  const over = rnd() < p.overshootChance;
  const g = over ? 1 + p.overshoot[0] + (p.overshoot[1] - p.overshoot[0]) * rnd() : 1 - p.undershoot * rnd();
  const perp = (rnd() * 2 - 1) * p.scatter * err;
  const uy = ey / err, up = ep / err;
  s.fdy = ey * g - up * perp;
  s.fdp = ep * g + uy * perp;
  // minimum-jerk: v_puncak = 1.875 · A / T ≤ maxSpeed
  s.fT = Math.max(p.minFlickT, 1.875 * Math.hypot(s.fdy, s.fdp) / p.maxSpeed);
  s.ft = 0; s.f0y = s.yaw; s.f0p = s.pitch; s.fDesY = desY; s.fDesP = desP; s.flicking = true;
}

/** Satu langkah gerak bidik menuju tujuan (desY, desP) [rad]. rnd = sumber acak (Math.random di game, deterministik di test). */
export function stepAim(s: AimState, dt: number, desY: number, desP: number, p: AimParams, rnd: () => number): void {
  if (dt <= 0) return;
  // kecepatan sudut tujuan (dihaluskan); tujuan MELOMPAT dalam satu langkah (ganti target / titik pandang baru, > ½ flickMin)
  // = diskontinu → kecepatan 0, dan sentakan yang sedang berjalan direncanakan ulang dari pose sekarang (posisi tetap kontinu —
  // dulu lompatan tujuan masuk ke suku "pergeseran" sentakan → bidikan meloncat beberapa derajat dalam satu frame)
  let jumped = false;
  if (s.primed) {
    const jy = wrapAngle(desY - s.prevY), jp = desP - s.prevP;
    jumped = Math.abs(jy) > p.flickMin * 0.5 || Math.abs(jp) > p.flickMin * 0.5;
    if (jumped) { s.vY = 0; s.vP = 0; }
    else { const k = Math.min(1, dt * 10); s.vY += (jy / dt - s.vY) * k; s.vP += (jp / dt - s.vP) * k; }
  }
  s.prevY = desY; s.prevP = desP; s.primed = true;
  if (s.flicking && jumped) s.flicking = false;
  if (!s.flicking) {
    const ey = wrapAngle(desY - s.yaw), ep = desP - s.pitch, err = Math.hypot(ey, ep);
    if (err > p.flickMin) planFlick(s, ey, ep, err, desY, desP, p, rnd);
    else {
      // pelacakan halus: feedforward kecepatan target + koreksi proporsional, dibatasi kecepatan maks
      const max = p.maxSpeed * dt, g = Math.min(1, p.trackGain * dt);
      s.yaw = wrapAngle(s.yaw + clamp(s.vY * p.trackFeed * dt + ey * g, -max, max));
      s.pitch = clamp(s.pitch + clamp(s.vP * p.trackFeed * dt + ep * g, -max, max), -PITCH_MAX, PITCH_MAX);
      return;
    }
  }
  // langkah sentakan: profil minimum-jerk + pergeseran tujuan sejak sentakan dimulai (target yang bergerak ikut terkejar)
  s.ft += dt;
  const u = Math.min(1, s.ft / s.fT), m = minJerk(u);
  s.yaw = wrapAngle(s.f0y + (s.fdy + wrapAngle(desY - s.fDesY)) * m);
  s.pitch = clamp(s.f0p + (s.fdp + (desP - s.fDesP)) * m, -PITCH_MAX, PITCH_MAX);
  if (u >= 1) s.flicking = false;
}

// ─────────────────────────────────────────── waktu reaksi

export interface ReactTuning {
  jitter: readonly [number, number]; periph: number; outsideFov: number; far: number; alerted: number; prepared: number;
  clamp: readonly [number, number];
}
export interface ReactSituation {
  /** nilai GDD §11.5 (Mudah 0.70 / Normal 0.45 / Sulit 0.28 s) */
  base: number;
  /** 0..1 acak */
  u: number;
  /** sudut target dari arah bidik ÷ ½FOV (0 = tepat di tengah, 1 = tepi pandangan) */
  offAxis: number;
  /** target di luar FOV (terdeteksi karena sangat dekat) */
  outsideFov: boolean;
  /** 0..1: 0 = ≤ 25 u, 1 = di batas jarak pandang */
  farness: number;
  /** waspada ke arah target (suara / kena tembak / callout baru-baru ini) */
  alerted: boolean;
  /** bidikan sudah mengarah ke tempat target muncul (pre-aim) */
  prepared: boolean;
}

/** Waktu reaksi manusiawi: rata-rata ≈ nilai GDD, bervariasi per kontak & situasi (pinggir pandangan / jauh lebih lambat,
 *  sudah waspada / sudah membidik ke sana lebih cepat). */
export function reactionTime(s: ReactSituation, k: ReactTuning): number {
  let f = k.jitter[0] + (k.jitter[1] - k.jitter[0]) * s.u;
  f *= s.outsideFov ? k.outsideFov : 1 + k.periph * Math.min(1, s.offAxis) ** 2;
  f *= 1 + k.far * clamp(s.farness, 0, 1);
  if (s.alerted) f *= k.alerted;
  if (s.prepared) f *= k.prepared;
  return s.base * clamp(f, k.clamp[0], k.clamp[1]);
}

// ─────────────────────────────────────────── geometri indra

/** Jarak kuadrat titik P ke segmen AB (peluru yang lewat dekat kepala). */
export function segPointDist2(ax: number, ay: number, az: number, bx: number, by: number, bz: number,
  px: number, py: number, pz: number): number {
  const dx = bx - ax, dy = by - ay, dz = bz - az, l2 = dx * dx + dy * dy + dz * dz;
  let t = l2 > 1e-9 ? ((px - ax) * dx + (py - ay) * dy + (pz - az) * dz) / l2 : 0;
  t = clamp(t, 0, 1);
  const qx = ax + dx * t - px, qy = ay + dy * t - py, qz = az + dz * t - pz;
  return qx * qx + qy * qy + qz * qz;
}

/** Perkiraan posisi sumber serangan yang TIDAK terlihat (hanya arah kira-kira): arah dari korban ke sumber diputar ± angNoise
 *  (rad, seragam) dan jaraknya dikali [dLo, dHi]. Ditulis ke `out` (x, z). */
export function estimateSource(fromX: number, fromZ: number, srcX: number, srcZ: number, angNoise: number, dLo: number, dHi: number,
  rnd: () => number, out: { x: number; z: number }) {
  const dx = srcX - fromX, dz = srcZ - fromZ, d = Math.hypot(dx, dz);
  if (d < 1e-6) { out.x = srcX; out.z = srcZ; return out; }
  const a = Math.atan2(dz, dx) + (rnd() * 2 - 1) * angNoise, r = d * (dLo + (dHi - dLo) * rnd());
  out.x = fromX + Math.cos(a) * r; out.z = fromZ + Math.sin(a) * r;
  return out;
}
