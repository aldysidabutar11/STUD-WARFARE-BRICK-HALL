// src/audio/VoicePlayer.ts — suara SATU pembicara: Opus (WebCodecs AudioDecoder) → potongan PCM dijadwalkan berurutan dengan
// buffer kecil (paket jaringan datang tidak rata) → lowpass (teredam) → gain (jarak / bisukan) → panner HRTF (arah 3D) → bus voice.
// Peredaman jarak dihitung sendiri (VoiceRules.proximity), panner hanya memberi ARAH (rolloffFactor 0).
import { XCFG } from '../config/extraConfig';
import { seqNewer } from '../game/VoiceRules';

export class VoicePlayer {
  /** Waktu paket terakhir (performance.now) & cakupannya — indikator "sedang bicara". */
  lastAt = -1e9;
  all = false;
  /** Potongan yang sudah diputar (diagnostik/tes). */
  played = 0;
  private dec: AudioDecoder | null = null;
  private broken = false;
  private next = 0;
  private lastSeq = -1;
  private readonly input: GainNode;
  private readonly lp: BiquadFilterNode;
  private readonly amp: GainNode;
  private readonly pan: PannerNode;
  /** Nilai campuran terakhir (AudioParam hanya diubah bila berbeda berarti). */
  private m = { gain: -1, cutoff: -1, x: 1e9, y: 0, z: 0 };

  constructor(private readonly ac: AudioContext, out: AudioNode) {
    this.input = ac.createGain();
    this.lp = ac.createBiquadFilter(); this.lp.type = 'lowpass'; this.lp.frequency.value = 20000;
    this.amp = ac.createGain();
    this.pan = ac.createPanner();
    this.pan.panningModel = 'HRTF'; this.pan.distanceModel = 'linear'; this.pan.rolloffFactor = 0;
    this.pan.refDistance = 1; this.pan.maxDistance = 1e5;
    this.input.connect(this.lp).connect(this.amp).connect(this.pan).connect(out);
  }

  get talking() { return performance.now() - this.lastAt < XCFG.voice.talkHold * 1000; }
  /** Gain campuran saat ini (diagnostik/tes). */
  get gain() { return this.m.gain; }

  push(seq: number, all: boolean, opus: Uint8Array) {
    if (this.lastSeq >= 0 && !seqNewer(seq, this.lastSeq)) return;   // terlambat / ganda
    this.lastSeq = seq; this.all = all; this.lastAt = performance.now();
    const d = this.decoder();
    if (!d) return;
    try { d.decode(new EncodedAudioChunk({ type: 'key', timestamp: seq * 20000, data: opus })); } catch { /* paket rusak */ }
  }

  private decoder(): AudioDecoder | null {
    if (this.dec && this.dec.state === 'configured') return this.dec;
    if (this.dec || this.broken || typeof AudioDecoder !== 'function') return null;
    try {
      const dec = new AudioDecoder({ output: (ad) => this.play(ad), error: () => { this.broken = true; } });
      dec.configure({ codec: 'opus', sampleRate: 48000, numberOfChannels: 1 });
      this.dec = dec;
      return dec;
    } catch { this.broken = true; return null; }
  }

  private play(ad: AudioData) {
    const ac = this.ac, n = ad.numberOfFrames;
    if (!n || ac.state !== 'running') { ad.close(); return; }
    const buf = ac.createBuffer(1, n, ad.sampleRate), tmp = new Float32Array(n);
    try { ad.copyTo(tmp, { planeIndex: 0, format: 'f32-planar' }); } catch { ad.close(); return; }
    ad.close();
    buf.copyToChannel(tmp, 0);
    const now = ac.currentTime, V = XCFG.voice;
    if (this.next < now + 0.01) this.next = now + V.jitter;   // baru mulai / sempat tersendat → beri jeda kecil
    if (this.next - now > V.maxLag) return;                    // antrean terlalu panjang → buang (tetap real-time)
    const src = ac.createBufferSource();
    src.buffer = buf;
    src.connect(this.input);
    src.start(this.next);
    this.next += buf.duration;
    this.played++;
  }

  /** Campuran: gain (0–1), cutoff lowpass (Hz), posisi sumber di dunia (arah dari pendengar). */
  mix(gain: number, cutoff: number, x: number, y: number, z: number) {
    const m = this.m, t = this.ac.currentTime;
    if (Math.abs(gain - m.gain) > 0.005) { this.amp.gain.setTargetAtTime(gain, t, 0.05); m.gain = gain; }
    if (Math.abs(cutoff - m.cutoff) > m.cutoff * 0.02) { this.lp.frequency.setTargetAtTime(cutoff, t, 0.05); m.cutoff = cutoff; }
    if ((x - m.x) ** 2 + (y - m.y) ** 2 + (z - m.z) ** 2 > 0.01) {
      this.pan.positionX.setTargetAtTime(x, t, 0.03); this.pan.positionY.setTargetAtTime(y, t, 0.03); this.pan.positionZ.setTargetAtTime(z, t, 0.03);
      m.x = x; m.y = y; m.z = z;
    }
  }

  close() {
    try { if (this.dec && this.dec.state !== 'closed') this.dec.close(); } catch { /* sudah ditutup */ }
    this.dec = null;
    try { this.input.disconnect(); this.pan.disconnect(); } catch { /* sudah terputus */ }
  }
}
