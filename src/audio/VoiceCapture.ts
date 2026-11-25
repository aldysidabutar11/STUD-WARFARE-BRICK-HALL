// src/audio/VoiceCapture.ts — mikrofon → paket Opus (voice chat push-to-talk). Mic diminta saat pertama dipakai (izin browser),
// frame dibaca terus (MediaStreamTrackProcessor) tapi hanya dikodekan WebCodecs AudioEncoder selama tombol bicara ditahan
// (`talking`) → tanpa bicara tidak ada data terkirim. Peredam gema / derau / penguat otomatis bawaan browser aktif.
import { XCFG } from '../config/extraConfig';

/** Chrome/Edge: pembaca frame MediaStreamTrack (belum ada di lib.dom TypeScript). */
declare class MediaStreamTrackProcessor<T> {
  constructor(init: { track: MediaStreamTrack });
  readonly readable: ReadableStream<T>;
}

export type MicState = 'off' | 'asking' | 'ready' | 'error';

export class VoiceCapture {
  /** Tombol bicara ditahan (dan mic siap). */
  talking = false;
  /** Satu paket Opus (±20 ms) siap dikirim. */
  onPacket: ((opus: Uint8Array) => void) | null = null;
  state: MicState = 'off';
  error = '';
  private track: MediaStreamTrack | null = null;
  private reader: ReadableStreamDefaultReader<AudioData> | null = null;
  private enc: AudioEncoder | null = null;
  private encBroken = false;
  private opening: Promise<boolean> | null = null;
  private gen = 0;

  /** Browser punya semua bagian yang dibutuhkan (Chrome / Edge). */
  static supported(): boolean {
    const w = globalThis as unknown as Record<string, unknown>;
    return typeof w.AudioEncoder === 'function' && typeof w.MediaStreamTrackProcessor === 'function'
      && typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
  }

  get ready() { return this.state === 'ready' && !!this.track && this.track.readyState === 'live'; }

  /** Minta mic (izin browser sekali); true bila siap. */
  start(): Promise<boolean> {
    if (this.ready) return Promise.resolve(true);
    this.opening ??= this.open().finally(() => { this.opening = null; });
    return this.opening;
  }

  private async open(): Promise<boolean> {
    if (!VoiceCapture.supported()) {
      this.state = 'error'; this.error = 'Browser ini belum mendukung voice — pakai Chrome atau Edge versi terbaru.';
      return false;
    }
    const gen = ++this.gen;
    this.state = 'asking'; this.error = '';
    try {
      const ms = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 }, video: false,
      });
      const track = ms.getAudioTracks()[0];
      if (gen !== this.gen || !track) { for (const t of ms.getTracks()) t.stop(); return false; }   // ditutup selama menunggu izin
      this.track = track;
      track.addEventListener('ended', () => { if (this.track === track) { this.state = 'error'; this.error = 'Mikrofon terputus.'; } });
      this.reader = new MediaStreamTrackProcessor<AudioData>({ track }).readable.getReader();
      this.state = 'ready';
      void this.pump(this.reader, gen);
      return true;
    } catch (e) {
      if (gen !== this.gen) return false;
      const err = e as DOMException;
      this.state = 'error';
      this.error = err?.name === 'NotAllowedError' ? 'Izin mikrofon ditolak — izinkan mikrofon untuk situs ini (ikon gembok di address bar).'
        : err?.name === 'NotFoundError' ? 'Mikrofon tidak ditemukan.' : 'Mikrofon tidak bisa dibuka: ' + (err?.message ?? String(e));
      return false;
    }
  }

  /** Baca frame terus-menerus (antrean tidak menumpuk); kodekan hanya saat bicara. */
  private async pump(r: ReadableStreamDefaultReader<AudioData>, gen: number) {
    for (;;) {
      let res: ReadableStreamReadResult<AudioData>;
      try { res = await r.read(); } catch { break; }
      const f = res.value;
      if (res.done || !f) break;
      if (gen === this.gen && this.talking && !this.encBroken) this.encode(f);
      f.close();
    }
  }

  private encode(f: AudioData) {
    let src = f, mono: AudioData | null = null;
    if (f.numberOfChannels > 1) {   // mic stereo → mono (rata-rata kanal)
      const n = f.numberOfFrames, acc = new Float32Array(n), tmp = new Float32Array(n);
      for (let c = 0; c < f.numberOfChannels; c++) {
        f.copyTo(tmp, { planeIndex: c, format: 'f32-planar' });
        for (let i = 0; i < n; i++) acc[i] += tmp[i] / f.numberOfChannels;
      }
      src = mono = new AudioData({ format: 'f32-planar', sampleRate: f.sampleRate, numberOfFrames: n, numberOfChannels: 1, timestamp: f.timestamp, data: acc });
    }
    try {
      const enc = this.encoder(src.sampleRate);
      if (enc) enc.encode(src);
    } catch { /* frame rusak / encoder ditutup */ }
    mono?.close();
  }

  private encoder(sampleRate: number): AudioEncoder | null {
    if (this.enc && this.enc.state === 'configured') return this.enc;
    try {
      const enc = new AudioEncoder({
        output: (chunk) => { const b = new Uint8Array(chunk.byteLength); chunk.copyTo(b); this.onPacket?.(b); },
        error: (e) => { this.encBroken = true; this.state = 'error'; this.error = 'Encoder suara gagal: ' + e.message; },
      });
      enc.configure({ codec: 'opus', sampleRate, numberOfChannels: 1, bitrate: XCFG.voice.bitrate });
      this.enc = enc;
      return enc;
    } catch (e) {
      this.encBroken = true; this.state = 'error'; this.error = 'Encoder suara tidak didukung: ' + String((e as Error)?.message ?? e);
      return null;
    }
  }

  /** Lepas mic (lampu mic browser mati) — dipanggil saat keluar room / voice dimatikan. */
  close() {
    this.gen++;
    this.talking = false;
    try { void this.reader?.cancel(); } catch { /* sudah selesai */ }
    this.reader = null;
    this.track?.stop(); this.track = null;
    try { if (this.enc && this.enc.state !== 'closed') this.enc.close(); } catch { /* sudah ditutup */ }
    this.enc = null; this.encBroken = false;
    if (this.state !== 'error' || this.error.startsWith('Mikrofon terputus')) { this.state = 'off'; this.error = ''; }
  }
}
