// src/net/protocol.ts — format pesan multiplayer (host otoritatif ↔ klien). Kanal UNRELIABLE (WebRTC DataChannel tanpa
// retransmit, mirip UDP) membawa biner: perintah klien (CMD) & snapshot host (SNAP). Kanal RELIABLE (berurutan) membawa JSON:
// lobby, mulai match, dan event penting (kill, spawn, hit, ledakan, status match, statistik). Modul murni → diuji tanpa jaringan.

// ───────────────────────────── tombol perintah (bit)
/** Tombol yang DITAHAN pada tick perintah (sudah di-resolve klien: ADS/jongkok/sprint mode tahan/toggle). */
export const H = { FIRE: 1, ALT: 2, AIM: 4, CROUCH: 8, SPRINT: 16, USE: 32 } as const;
/** Tombol yang DITEKAN sejak perintah sebelumnya (impuls, diproses tepat sekali per seq). */
export const I = {
  JUMP: 1, RELOAD: 2, FIREMODE: 4, MELEE: 8, SLOT_AR: 16, SLOT_KNIFE: 32, SLOT_NADE: 64, LAST: 128,
  WHEEL_UP: 256, WHEEL_DN: 512, FIRE_P: 1024, ALT_P: 2048, FIRE_R: 4096, ALT_R: 8192, SLOT_FLASH: 16384, SLOT_PISTOL: 32768,
} as const;

export interface Command {
  seq: number;          // nomor urut perintah (naik 1 per tick klien)
  mx: number; mz: number;   // gerak −1..1 (A/D, S/W)
  yaw: number; pitch: number;
  held: number; imp: number;
  /** Tick host yang sedang digambar klien saat perintah dibuat (dasar lag compensation). */
  viewTick: number;
}

const TAU = Math.PI * 2;
/** Kuantisasi yaw/pitch sama di klien & host (prediksi gerak klien memakai nilai yang sama dengan host). */
export const qYaw = (y: number) => { const u = Math.round(((((y % TAU) + TAU) % TAU) / TAU) * 65535) & 0xffff; return (u / 65535) * TAU; };
export const qPitch = (p: number) => (Math.max(-32767, Math.min(32767, Math.round((p / (Math.PI / 2)) * 32767))) / 32767) * (Math.PI / 2);
export const qAxis = (v: number) => Math.max(-127, Math.min(127, Math.round(v * 127))) / 127;

// ───────────────────────────── penulis/pembaca biner
class W {
  private buf = new ArrayBuffer(512);
  private dv = new DataView(this.buf);
  o = 0;
  private need(n: number) {
    if (this.o + n <= this.buf.byteLength) return;
    const nb = new ArrayBuffer(Math.max(this.buf.byteLength * 2, this.o + n));
    new Uint8Array(nb).set(new Uint8Array(this.buf));
    this.buf = nb; this.dv = new DataView(nb);
  }
  u8(v: number) { this.need(1); this.dv.setUint8(this.o, v & 0xff); this.o += 1; }
  i8(v: number) { this.need(1); this.dv.setInt8(this.o, Math.max(-128, Math.min(127, Math.round(v)))); this.o += 1; }
  u16(v: number) { this.need(2); this.dv.setUint16(this.o, Math.max(0, Math.min(65535, Math.round(v))), true); this.o += 2; }
  i16(v: number) { this.need(2); this.dv.setInt16(this.o, Math.max(-32768, Math.min(32767, Math.round(v))), true); this.o += 2; }
  u32(v: number) { this.need(4); this.dv.setUint32(this.o, v >>> 0, true); this.o += 4; }
  f32(v: number) { this.need(4); this.dv.setFloat32(this.o, v, true); this.o += 4; }
  f64(v: number) { this.need(8); this.dv.setFloat64(this.o, v, true); this.o += 8; }
  done(): ArrayBuffer { return this.buf.slice(0, this.o); }
}
class R {
  private dv: DataView;
  o = 0;
  constructor(buf: ArrayBuffer) { this.dv = new DataView(buf); }
  u8() { const v = this.dv.getUint8(this.o); this.o += 1; return v; }
  i8() { const v = this.dv.getInt8(this.o); this.o += 1; return v; }
  u16() { const v = this.dv.getUint16(this.o, true); this.o += 2; return v; }
  i16() { const v = this.dv.getInt16(this.o, true); this.o += 2; return v; }
  u32() { const v = this.dv.getUint32(this.o, true); this.o += 4; return v; }
  f32() { const v = this.dv.getFloat32(this.o, true); this.o += 4; return v; }
  f64() { const v = this.dv.getFloat64(this.o, true); this.o += 8; return v; }
}

export const MSG = { CMD: 1, SNAP: 2, VOICE: 3 } as const;
/** Jenis pesan biner (byte pertama). */
export const msgType = (buf: ArrayBuffer) => (buf.byteLength ? new Uint8Array(buf)[0] : 0);

// ───────────────────────────── suara (voice chat): paket Opus lewat kanal unreliable; host meneruskan ke penerima yang berhak
/** Paket Opus terbesar yang diterima (20 ms @ ±24 kbps ≈ 60 B; batas longgar untuk lonjakan). */
export const VOICE_MAX = 400;
/** Naik (pembicara → host): [3][0 tim / 1 semua][seq u16][opus…]. */
export function encodeVoiceUp(all: boolean, seq: number, opus: Uint8Array): ArrayBuffer {
  const out = new Uint8Array(4 + opus.byteLength);
  out[0] = MSG.VOICE; out[1] = all ? 1 : 0; out[2] = seq & 255; out[3] = (seq >> 8) & 255; out.set(opus, 4);
  return out.buffer;
}
export function decodeVoiceUp(buf: ArrayBuffer): { all: boolean; seq: number; opus: Uint8Array } | null {
  if (buf.byteLength < 5 || buf.byteLength > 4 + VOICE_MAX) return null;
  const b = new Uint8Array(buf);
  if (b[0] !== MSG.VOICE || b[1] > 1) return null;
  return { all: b[1] === 1, seq: b[2] | (b[3] << 8), opus: b.subarray(4) };
}
/** Turun (host → pendengar): [3][0/1][pembicara u16 = nomor pid ('p12' → 12)][seq u16][opus…]. */
export function encodeVoiceDown(speaker: number, all: boolean, seq: number, opus: Uint8Array): ArrayBuffer {
  const out = new Uint8Array(6 + opus.byteLength);
  out[0] = MSG.VOICE; out[1] = all ? 1 : 0; out[2] = speaker & 255; out[3] = (speaker >> 8) & 255; out[4] = seq & 255; out[5] = (seq >> 8) & 255;
  out.set(opus, 6);
  return out.buffer;
}
export function decodeVoiceDown(buf: ArrayBuffer): { speaker: number; all: boolean; seq: number; opus: Uint8Array } | null {
  if (buf.byteLength < 7 || buf.byteLength > 6 + VOICE_MAX) return null;
  const b = new Uint8Array(buf);
  if (b[0] !== MSG.VOICE || b[1] > 1) return null;
  const speaker = b[2] | (b[3] << 8);
  return speaker ? { speaker, all: b[1] === 1, seq: b[4] | (b[5] << 8), opus: b.subarray(6) } : null;
}

// ───────────────────────────── perintah (klien → host): beberapa perintah terakhir dalam satu paket
export function encodeCommands(cmds: Command[]): ArrayBuffer {
  const w = new W();
  w.u8(MSG.CMD); w.u8(cmds.length);
  for (const c of cmds) {
    w.u32(c.seq); w.i8(c.mx * 127); w.i8(c.mz * 127);
    w.u16((((c.yaw % TAU) + TAU) % TAU) / TAU * 65535); w.i16(c.pitch / (Math.PI / 2) * 32767);
    w.u8(c.held); w.u16(c.imp); w.u32(Math.max(0, Math.floor(c.viewTick)));
  }
  return w.done();
}
export function decodeCommands(buf: ArrayBuffer): Command[] {
  if (buf.byteLength < 2) return [];
  const r = new R(buf);
  if (r.u8() !== MSG.CMD) return [];
  // paket dari teman (tidak dipercaya): jumlah perintah dibatasi isi paket (17 B per perintah) — paket terpotong tidak melempar
  // RangeError di handler; sumbu gerak dijepit ke [−1, 1] (i8 −128 = −1.008)
  const n = Math.min(r.u8(), Math.floor((buf.byteLength - 2) / 17)), out: Command[] = [];
  for (let i = 0; i < n; i++) {
    const seq = r.u32(), mx = Math.max(-1, r.i8() / 127), mz = Math.max(-1, r.i8() / 127);
    const yaw = (r.u16() / 65535) * TAU, pitch = (r.i16() / 32767) * (Math.PI / 2);
    out.push({ seq, mx, mz, yaw, pitch, held: r.u8(), imp: r.u16(), viewTick: r.u32() });
  }
  return out;
}

// ───────────────────────────── snapshot (host → klien)
/** Bendera entitas. */
export const EF = {
  ALIVE: 1, GROUNDED: 2, CROUCHED: 4, SPRINT: 8, ADS: 16, PROTECT: 32, RELOAD: 64, PRIMARY: 128, THROW_OVER: 256,
} as const;

export interface EntState {
  id: number; flags: number;
  x: number; y: number; z: number; yaw: number; pitch: number;
  vx: number; vz: number; hp: number; crouchT: number;
  /** slot dipegang 0 senjata utama / 1 pisau / 2 granat / 3 flashbang / 4 pistol (3 bit). */
  slot: number;
  /** status granat 0 NONE / 1 EQUIP / 2 READY / 3 COOKING / 4 THROWN. */
  gstate: number;
  /** 0 popor / 1 tebas / 2 tusuk. */
  meleeKind: number;
  meleeT: number;       // detik (−1 = tidak)
  reloadP: number;      // 0..1 (−1 = tidak)
  throwAnimT: number;   // detik (−1 = tidak)
  stepPhase: number;
}

/** Keadaan lengkap pemain lokal untuk rekonsiliasi prediksi (hanya untuk penerima snapshot). */
export interface OwnState {
  x: number; y: number; z: number; vx: number; vz: number; velY: number;
  crouchT: number; coyote: number; jumpBuf: number; airCap: number; peakY: number; stepPhase: number;
  grounded: boolean; crouched: boolean; sprinting: boolean; crouchQueued: boolean | null;
  /** Senjata utama (slot 1). */
  ammo: number; reserve: number; modeIdx: number; grenades: number; shots: number;
  /** Flashbang tersisa (pemain sendiri). */
  flashes: number;
  /** Pistol (slot 2). */
  ammo2: number; reserve2: number; mode2: number;
}

export interface NadeState { id: number; x: number; y: number; z: number; fuse: number; owner: number;
  /** K-400 / flashbang (model di klien). */
  kind: 'frag' | 'flash' }

/** Efek tembakan: penembak, titik akhir, jenis kena (0 tidak / 1 dunia / 2 tubuh; + SHOT_PELLET = pellet tambahan shotgun:
 *  tanpa kilat moncong / suara / selongsong), normal, material, korban, bagian. */
export interface ShotFx { shooter: number; x: number; y: number; z: number; kind: number; nx: number; ny: number; nz: number;
  mat: number; victim: number; part: number }

export const SHOT_PELLET = 8;

/** Efek kosmetik lain: 1 melee swing / 2 melee hit / 3 melee wall / 4 pantulan granat / 5 reload / 6 dryfire / 7 pin /
 *  8 kokang (a: 0 pompa / 1 bolt). */
export interface MiscFx { type: number; ent: number; a: number; x: number; y: number; z: number }

/** Pantulan granat (MiscFx type 4, byte `a`): 3 bit kode material (world/surfaces SURFACES) | kecepatan ×2 (5 bit, maks 15.5 u/s —
 *  di atas 12 u/s volume suara pantul sudah penuh, lihat Recipes.bounce). */
export const packBounce = (matCode: number, speed: number) => (matCode & 7) | (Math.max(0, Math.min(31, Math.round(speed * 2))) << 3);
export const unpackBounce = (a: number) => ({ mat: a & 7, speed: (a >> 3) / 2 });

export interface MatchInfo { state: number; sb: number; sr: number; timeLeft: number; countdown: number; round: number }

export interface Snapshot {
  tick: number; ack: number; match: MatchInfo;
  ents: EntState[]; own: OwnState | null; nades: NadeState[]; shots: ShotFx[]; fx: MiscFx[];
}

const pack01 = (v: number) => (v < 0 ? 255 : Math.min(254, Math.round(v * 254)));
const unpack01 = (b: number) => (b === 255 ? -1 : b / 254);
const packT = (t: number) => (t < 0 ? 255 : Math.min(254, Math.round(t * 100)));   // detik ×100 (maks 2.54 s)
const unpackT = (b: number) => (b === 255 ? -1 : b / 100);

export function encodeSnapshot(s: Snapshot): ArrayBuffer {
  const w = new W();
  w.u8(MSG.SNAP); w.u32(s.tick); w.u32(s.ack);
  const m = s.match;
  w.u8(m.state); w.u16(m.sb); w.u16(m.sr); w.f32(m.timeLeft); w.f32(m.countdown); w.u8(m.round);
  w.u8(s.ents.length);
  for (const e of s.ents) {
    w.u8(e.id); w.u16(e.flags); w.f32(e.x); w.f32(e.y); w.f32(e.z);
    w.u16((((e.yaw % TAU) + TAU) % TAU) / TAU * 65535); w.i16(e.pitch / (Math.PI / 2) * 32767);
    w.i16(e.vx * 100); w.i16(e.vz * 100); w.u8(Math.max(0, Math.min(255, e.hp))); w.u8(pack01(e.crouchT));
    w.u8((e.slot & 7) | ((e.gstate & 7) << 3) | ((e.meleeKind & 3) << 6));
    w.u8(packT(e.meleeT)); w.u8(pack01(e.reloadP)); w.u8(packT(e.throwAnimT)); w.f32(e.stepPhase);
  }
  if (s.own) {
    const o = s.own;
    w.u8(1);
    // f64: setelah koreksi, keadaan klien IDENTIK dengan host (pembulatan f32 ±1e-6 cukup untuk membuat KCC yang menempel dinding
    // berbeda hasil beberapa tick kemudian → koreksi berantai). +48 B per snapshot.
    for (const v of [o.x, o.y, o.z, o.vx, o.vz, o.velY, o.crouchT, o.coyote, o.jumpBuf, o.airCap, o.peakY, o.stepPhase]) w.f64(v);
    w.u8((o.grounded ? 1 : 0) | (o.crouched ? 2 : 0) | (o.sprinting ? 4 : 0) | (o.crouchQueued === null ? 0 : o.crouchQueued ? 8 : 16));
    w.u16(o.ammo); w.u16(o.reserve); w.u8(o.modeIdx); w.u8(o.grenades); w.u16(o.shots); w.u8(o.flashes);
    w.u16(o.ammo2); w.u16(o.reserve2); w.u8(o.mode2);
  } else w.u8(0);
  w.u8(s.nades.length);
  for (const n of s.nades) {
    w.u16(n.id); w.f32(n.x); w.f32(n.y); w.f32(n.z); w.u8(Math.round(Math.max(0, n.fuse) * 50)); w.u8(n.owner); w.u8(n.kind === 'flash' ? 1 : 0);
  }
  w.u8(s.shots.length);
  for (const f of s.shots) {
    w.u8(f.shooter); w.f32(f.x); w.f32(f.y); w.f32(f.z); w.u8(f.kind);
    w.i8(f.nx * 127); w.i8(f.ny * 127); w.i8(f.nz * 127); w.u8(f.mat); w.u8(f.victim); w.u8(f.part);
  }
  w.u8(s.fx.length);
  for (const f of s.fx) { w.u8(f.type); w.u8(f.ent); w.u8(f.a); w.f32(f.x); w.f32(f.y); w.f32(f.z); }
  return w.done();
}

export function decodeSnapshot(buf: ArrayBuffer): Snapshot | null {
  try { return readSnapshot(buf); } catch { return null; }   // paket terpotong/rusak (RangeError DataView) → dibuang, bukan error
}

function readSnapshot(buf: ArrayBuffer): Snapshot | null {
  const r = new R(buf);
  if (r.u8() !== MSG.SNAP) return null;
  const tick = r.u32(), ack = r.u32();
  const match: MatchInfo = { state: r.u8(), sb: r.u16(), sr: r.u16(), timeLeft: r.f32(), countdown: r.f32(), round: r.u8() };
  const ents: EntState[] = [];
  for (let i = 0, n = r.u8(); i < n; i++) {
    const id = r.u8(), flags = r.u16(), x = r.f32(), y = r.f32(), z = r.f32();
    const yaw = (r.u16() / 65535) * TAU, pitch = (r.i16() / 32767) * (Math.PI / 2);
    const vx = r.i16() / 100, vz = r.i16() / 100, hp = r.u8(), crouchT = Math.max(0, unpack01(r.u8())), held = r.u8();
    ents.push({ id, flags, x, y, z, yaw, pitch, vx, vz, hp, crouchT, slot: held & 7, gstate: (held >> 3) & 7, meleeKind: (held >> 6) & 3,
      meleeT: unpackT(r.u8()), reloadP: unpack01(r.u8()), throwAnimT: unpackT(r.u8()), stepPhase: r.f32() });
  }
  let own: OwnState | null = null;
  if (r.u8()) {
    const f = [] as number[];
    for (let i = 0; i < 12; i++) f.push(r.f64());
    const b = r.u8();
    own = { x: f[0], y: f[1], z: f[2], vx: f[3], vz: f[4], velY: f[5], crouchT: f[6], coyote: f[7], jumpBuf: f[8], airCap: f[9],
      peakY: f[10], stepPhase: f[11], grounded: !!(b & 1), crouched: !!(b & 2), sprinting: !!(b & 4),
      crouchQueued: b & 8 ? true : b & 16 ? false : null, ammo: r.u16(), reserve: r.u16(), modeIdx: r.u8(), grenades: r.u8(), shots: r.u16(),
      flashes: r.u8(), ammo2: r.u16(), reserve2: r.u16(), mode2: r.u8() };
  }
  const nades: NadeState[] = [];
  for (let i = 0, n = r.u8(); i < n; i++) nades.push({ id: r.u16(), x: r.f32(), y: r.f32(), z: r.f32(), fuse: r.u8() / 50, owner: r.u8(),
    kind: r.u8() === 1 ? 'flash' : 'frag' });
  const shots: ShotFx[] = [];
  for (let i = 0, n = r.u8(); i < n; i++) {
    shots.push({ shooter: r.u8(), x: r.f32(), y: r.f32(), z: r.f32(), kind: r.u8(), nx: r.i8() / 127, ny: r.i8() / 127, nz: r.i8() / 127,
      mat: r.u8(), victim: r.u8(), part: r.u8() });
  }
  const fx: MiscFx[] = [];
  for (let i = 0, n = r.u8(); i < n; i++) fx.push({ type: r.u8(), ent: r.u8(), a: r.u8(), x: r.f32(), y: r.f32(), z: r.f32() });
  return { tick, ack, match, ents, own, nades, shots, fx };
}

// ───────────────────────────── pesan JSON (kanal reliable)
export type MatchStateCode = 'MENU' | 'LOADOUT' | 'COUNTDOWN' | 'PLAYING' | 'ROUND_END' | 'ENDED' | 'RESULTS';
export const MATCH_STATES: MatchStateCode[] = ['MENU', 'LOADOUT', 'COUNTDOWN', 'PLAYING', 'ROUND_END', 'ENDED', 'RESULTS'];
