// src/net/Peer.ts — satu koneksi WebRTC host↔klien dengan 2 DataChannel: 'r' reliable berurutan (JSON: lobby, event penting)
// dan 'u' UNRELIABLE tanpa urutan & tanpa retransmit (biner: perintah & snapshot) — paket hilang tidak menahan paket berikutnya
// (beda dengan WebSocket/TCP). Klien = pemrakarsa (membuat kanal + offer); host menjawab.
import type { SignalKind } from './Signaling';
import { blackbox } from '../core/BlackBox';

/** Uji jaringan buruk (debug, di URL kedua sisi): ?netlag=ms&netjitter=ms&netloss=% — kirim ditunda (reliable tetap berurutan),
 *  paket unreliable dibuang acak. Ping ≈ 2 × netlag bila dipasang di host & klien. */
const NETSIM = (() => {
  if (typeof location === 'undefined') return null;
  const q = new URLSearchParams(location.search);
  const lag = Number(q.get('netlag') ?? 0) || 0, jit = Number(q.get('netjitter') ?? 0) || 0, loss = (Number(q.get('netloss') ?? 0) || 0) / 100;
  return lag > 0 || jit > 0 || loss > 0 ? { lag, jit, loss } : null;
})();

export class Peer {
  readonly pc: RTCPeerConnection;
  private rel: RTCDataChannel | null = null;
  private unr: RTCDataChannel | null = null;
  private pendingIce: RTCIceCandidateInit[] = [];
  private remoteSet = false;
  private opened = false;
  private closed = false;
  private relAt = 0;   // NETSIM: jadwal kirim reliable terakhir (urutan dijaga)
  onOpen: (() => void) | null = null;
  onClose: (() => void) | null = null;
  onRel: ((msg: Record<string, unknown>) => void) | null = null;
  onUnr: ((buf: ArrayBuffer) => void) | null = null;

  constructor(readonly remoteId: string, private signal: (kind: SignalKind, data: unknown) => void, ice: RTCIceServer[],
    private readonly initiator: boolean) {
    this.pc = new RTCPeerConnection({ iceServers: ice });
    this.pc.onicecandidate = (ev) => { if (ev.candidate) this.signal('ice', ev.candidate.toJSON()); };
    this.pc.onconnectionstatechange = () => {
      const s = this.pc.connectionState;
      // kotak hitam: urutan status (connecting → connected → disconnected → failed …) menjelaskan putusnya koneksi
      blackbox.log('koneksi', `${this.initiator ? 'ke host' : 'dari teman'} ${remoteId.slice(0, 6)}: ${s}`);
      if (s === 'failed' || s === 'closed') this.close();
    };
    if (initiator) {
      this.attach(this.pc.createDataChannel('r', { ordered: true }));
      this.attach(this.pc.createDataChannel('u', { ordered: false, maxRetransmits: 0 }));
    } else this.pc.ondatachannel = (ev) => this.attach(ev.channel);
  }

  private attach(ch: RTCDataChannel) {
    ch.binaryType = 'arraybuffer';
    if (ch.label === 'r') {
      this.rel = ch;
      ch.onmessage = (ev) => {
        if (typeof ev.data !== 'string') return;
        let msg: unknown;
        try { msg = JSON.parse(ev.data); } catch { return; }   // pesan rusak dari jaringan: abaikan
        // penanganan pesan DI LUAR try: error di logika room/match = bug → tetap terlihat (konsol + kotak hitam), dulu ikut ditelan
        // sebagai "pesan rusak" sehingga keadaan bisa rusak diam-diam
        if (msg && typeof msg === 'object') this.onRel?.(msg as Record<string, unknown>);
      };
    } else {
      this.unr = ch;
      ch.onmessage = (ev) => { if (ev.data instanceof ArrayBuffer) this.onUnr?.(ev.data); };
    }
    ch.onopen = () => this.checkOpen();
    ch.onclose = () => this.close();
    this.checkOpen();
  }

  private checkOpen() {
    if (this.opened || this.rel?.readyState !== 'open' || this.unr?.readyState !== 'open') return;
    this.opened = true; this.onOpen?.();
  }

  get open() { return this.opened && !this.closed; }
  /** Data unreliable yang belum terkirim (byte) — host melewati snapshot bila jaringan klien tersumbat. */
  get backlog() { return this.unr?.bufferedAmount ?? 0; }

  /** Klien: buat offer. */
  async start() {
    if (!this.initiator) return;
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    this.signal('offer', this.pc.localDescription?.toJSON() ?? offer);
  }

  async onSignal(kind: SignalKind, data: unknown) {
    try {
      if (kind === 'offer' && !this.initiator) {
        await this.pc.setRemoteDescription(data as RTCSessionDescriptionInit);
        this.remoteSet = true; await this.flushIce();
        const ans = await this.pc.createAnswer();
        await this.pc.setLocalDescription(ans);
        this.signal('answer', this.pc.localDescription?.toJSON() ?? ans);
      } else if (kind === 'answer' && this.initiator) {
        await this.pc.setRemoteDescription(data as RTCSessionDescriptionInit);
        this.remoteSet = true; await this.flushIce();
      } else if (kind === 'ice') {
        const c = data as RTCIceCandidateInit;
        if (this.remoteSet) await this.pc.addIceCandidate(c); else this.pendingIce.push(c);
      }
    } catch { /* kandidat / deskripsi tidak valid: koneksi akan gagal & ditutup sendiri */ }
  }

  private async flushIce() {
    const list = this.pendingIce; this.pendingIce = [];
    for (const c of list) { try { await this.pc.addIceCandidate(c); } catch { /* abaikan */ } }
  }

  sendRel(msg: Record<string, unknown>) {
    if (this.rel?.readyState !== 'open') return;
    const data = JSON.stringify(msg);
    if (!NETSIM) { this.rel.send(data); return; }
    const now = performance.now(), at = Math.max(this.relAt, now + NETSIM.lag + Math.random() * NETSIM.jit);
    this.relAt = at;
    setTimeout(() => { if (this.rel?.readyState === 'open') this.rel.send(data); }, at - now);
  }

  sendUnr(buf: ArrayBuffer) {
    if (this.unr?.readyState !== 'open') return;
    if (!NETSIM) { this.unr.send(buf); return; }
    if (Math.random() < NETSIM.loss) return;
    setTimeout(() => { if (this.unr?.readyState === 'open') this.unr.send(buf); }, NETSIM.lag + Math.random() * NETSIM.jit);
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    try { this.rel?.close(); this.unr?.close(); this.pc.close(); } catch { /* sudah tertutup */ }
    this.onClose?.();
  }
}
