// src/game/Voice.ts — voice chat push-to-talk (permintaan pengguna 2026-11-25): T = tim, Z = semua.
// Jalur: mic → Opus (VoiceCapture) → kanal unreliable KONEKSI GAME → host → penerima yang berhak (VoiceRules.voiceSendsTo) →
// VoicePlayer per pembicara. Tidak ada koneksi tambahan antar pemain: kalau bisa main bareng, pasti bisa saling dengar (NAT tidak
// jadi masalah), host menegakkan aturan (tim / semua / allTalk / yang mati) dan cukup meneruskan byte (tanpa kode ulang).
// Di match suara berdasarkan jarak karakter (dekat jelas → menjauh mengecil & teredam → hilang di ujung map; dinding meredam).
import * as THREE from 'three';
import type { Team } from '../entities/BlockyCharacter';
import { XCFG } from '../config/extraConfig';
import { VoiceCapture } from '../audio/VoiceCapture';
import { VoicePlayer } from '../audio/VoicePlayer';
import { decodeVoiceDown, decodeVoiceUp, encodeVoiceDown, encodeVoiceUp } from '../net/protocol';
import { pidNum, proximity, voiceSendsTo, type VoiceScope } from './VoiceRules';

export interface VoiceEnv {
  /** Peran sekarang (berubah saat pindah host). */
  isHost(): boolean;
  /** pid kita di room. */
  me(): string;
  /** Klien → host / host → teman (kanal unreliable koneksi game). */
  sendUp(buf: ArrayBuffer): void;
  sendDown(pid: string, buf: ArrayBuffer): void;
  /** Host: teman yang tersambung. */
  listeners(): string[];
  teamOf(pid: string): Team | null;
  /** Hidup di match berjalan (di luar match selalu true). */
  aliveOf(pid: string): boolean;
  live(): boolean;
  allTalk(): boolean;
  /** Dibisukan / voice dimatikan di pengaturan → tidak diputar. */
  muted(pid: string): boolean;
  /** Posisi kepala pembicara bila suara berdasarkan jarak berlaku (match berjalan & hidup); null = jelas penuh. */
  headOf(pid: string, out: THREE.Vector3): THREE.Vector3 | null;
  audio(): { ac: AudioContext; bus: AudioNode } | null;
  camera(): THREE.Camera;
  blocked(ax: number, ay: number, az: number, bx: number, by: number, bz: number): boolean;
  range(): { near: number; far: number };
}

const _head = new THREE.Vector3(), _fwd = new THREE.Vector3();

export class VoiceSystem {
  readonly cap = new VoiceCapture();
  readonly players = new Map<string, VoicePlayer>();
  private scope: VoiceScope | null = null;
  private seq = 0;
  /** Host: paket per pemain per detik (anti-banjir). */
  private rate = new Map<string, { t: number; n: number }>();
  /** Garis pandang pendengar → pembicara (cek tiap occlEvery s). */
  private occl = new Map<string, { t: number; blocked: boolean }>();
  /** Host: paket diteruskan / klien: paket naik terkirim (diagnostik). */
  sent = 0;

  constructor(private readonly env: VoiceEnv) {
    this.cap.onPacket = (opus) => this.fromMic(opus);
  }

  /** Tombol bicara: cakupan yang sedang ditahan (sudah lolos aturan) atau null. Mic diminta saat pertama dipakai. */
  talk(scope: VoiceScope | null) {
    this.scope = scope;
    if (scope && !this.cap.ready && this.cap.state !== 'asking' && this.cap.state !== 'error') void this.cap.start();
    this.cap.talking = !!scope && this.cap.ready;
  }

  /** Sedang mengirim suara (mic siap & tombol ditahan). */
  get speaking(): VoiceScope | null { return this.cap.talking ? this.scope : null; }

  private fromMic(opus: Uint8Array) {
    const s = this.scope;
    if (!s || !this.cap.talking) return;
    this.seq = (this.seq + 1) & 0xffff;
    if (this.env.isHost()) this.route(this.env.me(), s === 'all', this.seq, opus);
    else { this.env.sendUp(encodeVoiceUp(s === 'all', this.seq, opus)); this.sent++; }
  }

  /** Host: paket dari teman. */
  onUp(pid: string, buf: ArrayBuffer) {
    const p = decodeVoiceUp(buf);
    if (!p || !this.allow(pid)) return;
    this.route(pid, p.all, p.seq, p.opus);
  }

  /** Klien: paket dari host (sudah disaring host). */
  onDown(buf: ArrayBuffer) {
    const p = decodeVoiceDown(buf);
    if (p) this.hear('p' + p.speaker, p.all, p.seq, p.opus);
  }

  private allow(pid: string): boolean {
    const now = performance.now(), r = this.rate.get(pid);
    if (!r || now - r.t >= 1000) { this.rate.set(pid, { t: now, n: 1 }); return true; }
    return ++r.n <= XCFG.voice.maxRate;
  }

  /** Host: teruskan suara `from` ke setiap penerima yang berhak (termasuk host sendiri). */
  private route(from: string, all: boolean, seq: number, opus: Uint8Array) {
    const e = this.env, me = e.me(), num = pidNum(from);
    if (!num) return;
    const c = { live: e.live(), allTalk: e.allTalk(), senderTeam: e.teamOf(from), senderAlive: e.aliveOf(from) };
    const scope: VoiceScope = all ? 'all' : 'team';
    let down: ArrayBuffer | null = null;
    for (const r of e.listeners()) {
      if (r === from || !voiceSendsTo(scope, { ...c, recipientTeam: e.teamOf(r) })) continue;
      e.sendDown(r, down ??= encodeVoiceDown(num, all, seq, opus));
      this.sent++;
    }
    if (from !== me && voiceSendsTo(scope, { ...c, recipientTeam: e.teamOf(me) })) this.hear(from, all, seq, opus);
  }

  private hear(pid: string, all: boolean, seq: number, opus: Uint8Array) {
    if (pid === this.env.me() || this.env.muted(pid)) return;
    const a = this.env.audio();
    if (!a) return;
    let pl = this.players.get(pid);
    if (!pl) { pl = new VoicePlayer(a.ac, a.bus); this.players.set(pid, pl); }
    pl.push(seq, all, opus);
  }

  /** Per frame: campuran tiap pembicara (jarak, arah, dinding, bisukan). */
  update() {
    if (!this.players.size) return;
    const e = this.env, cam = e.camera(), L = cam.position, R = e.range(), now = performance.now(), V = XCFG.voice;
    cam.getWorldDirection(_fwd);
    for (const [pid, pl] of this.players) {
      if (!pl.talking && pl.gain >= 0 && now - pl.lastAt > 2000) continue;   // lama diam: tidak perlu diperbarui
      if (e.muted(pid)) { pl.mix(0, 20000, L.x + _fwd.x, L.y + _fwd.y, L.z + _fwd.z); continue; }
      const head = e.headOf(pid, _head);
      if (!head) { pl.mix(1, 20000, L.x + _fwd.x, L.y + _fwd.y, L.z + _fwd.z); continue; }   // jelas penuh, dari depan
      let { gain, cutoff } = proximity(L.distanceTo(head), R.near, R.far);
      if (gain > 0) {
        let o = this.occl.get(pid);
        if (!o || now - o.t > V.occlEvery * 1000) {
          o = { t: now, blocked: e.blocked(L.x, L.y, L.z, head.x, head.y, head.z) };
          this.occl.set(pid, o);
        }
        if (o.blocked) { gain *= V.occlGain; cutoff *= V.occlCutoff; }
      }
      pl.mix(gain, cutoff, head.x, head.y, head.z);
    }
  }

  /** Pembicara yang sedang terdengar (paket baru masuk) + cakupannya. */
  talkers(): { pid: string; all: boolean }[] {
    const out: { pid: string; all: boolean }[] = [];
    for (const [pid, pl] of this.players) if (pl.talking && !this.env.muted(pid)) out.push({ pid, all: pl.all });
    return out;
  }

  /** Keluar room / voice dimatikan: semua pemutar ditutup, mic dilepas. */
  reset(releaseMic = true) {
    for (const pl of this.players.values()) pl.close();
    this.players.clear(); this.occl.clear(); this.rate.clear();
    this.scope = null; this.cap.talking = false;
    if (releaseMic) this.cap.close();
  }
}
