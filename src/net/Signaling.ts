// src/net/Signaling.ts — "perkenalan" WebRTC (siapa host room, tukar offer/answer/ICE). Pesan sedikit (puluhan per pemain per
// match) → aman di kuota gratis. Dua implementasi: Supabase Realtime (lewat internet; butuh VITE_SUPABASE_URL & VITE_SUPABASE_ANON_KEY)
// dan BroadcastChannel (antar-tab di browser yang sama — untuk uji lokal tanpa akun apa pun). Data gameplay TIDAK lewat sini (P2P).
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';

export type SignalKind = 'hello' | 'welcome' | 'deny' | 'offer' | 'answer' | 'ice' | 'bye' | 'host';
export interface SignalMsg { from: string; to: string; kind: SignalKind; data?: unknown }

export interface Signaling {
  /** id unik peserta ini di room signaling. */
  readonly id: string;
  /** Label untuk UI. */
  readonly label: string;
  /** true = lewat internet (teman di perangkat lain); false = hanya tab lain di browser ini. */
  readonly internet: boolean;
  join(room: string, on: (m: SignalMsg) => void): Promise<void>;
  send(to: string, kind: SignalKind, data?: unknown): void;
  leave(): void;
}

const newId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const channelName = (room: string) => 'sw-room-' + room;

/** Uji lokal: tab-tab pada origin yang sama (dev server) saling menemukan lewat BroadcastChannel. */
export class LocalSignaling implements Signaling {
  readonly id = newId();
  readonly label = 'Antar-tab (uji lokal)';
  readonly internet = false;
  private ch: BroadcastChannel | null = null;
  async join(room: string, on: (m: SignalMsg) => void) {
    this.leave();
    this.ch = new BroadcastChannel(channelName(room));
    this.ch.onmessage = (ev: MessageEvent<SignalMsg>) => {
      const m = ev.data;
      if (!m || m.from === this.id || (m.to !== '*' && m.to !== this.id)) return;
      on(m);
    };
  }
  send(to: string, kind: SignalKind, data?: unknown) { this.ch?.postMessage({ from: this.id, to, kind, data } satisfies SignalMsg); }
  leave() { this.ch?.close(); this.ch = null; }
}

/** Internet: Supabase Realtime Broadcast (kanal per kode room). Kunci anon memang publik (dipakai di browser).
 *  Pustaka Supabase dimuat saat pertama kali online (chunk terpisah — tidak memperbesar muatan awal game). */
export class SupabaseSignaling implements Signaling {
  readonly id = newId();
  readonly label = 'Online (Supabase)';
  readonly internet = true;
  private client: SupabaseClient | null = null;
  private ch: RealtimeChannel | null = null;
  private gen = 0;   // leave() saat pustaka masih dimuat → join dibatalkan
  constructor(private url: string, private key: string) {}
  async join(room: string, on: (m: SignalMsg) => void): Promise<void> {
    this.leave();
    const gen = this.gen;
    if (!this.client) {
      const { createClient } = await import('@supabase/supabase-js');
      this.client ??= createClient(this.url, this.key, { auth: { persistSession: false, autoRefreshToken: false } });
    }
    if (gen !== this.gen) throw new Error('signaling dibatalkan');
    const ch = this.client.channel(channelName(room), { config: { broadcast: { self: false } } });
    this.ch = ch;
    ch.on('broadcast', { event: 'sig' }, (msg) => {
      const m = msg.payload as SignalMsg | undefined;
      if (!m || m.from === this.id || (m.to !== '*' && m.to !== this.id)) return;
      on(m);
    });
    return new Promise((resolve, reject) => {
      ch.subscribe((status, err) => {
        if (status === 'SUBSCRIBED') resolve();
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') reject(err ?? new Error(status));
      });
    });
  }
  send(to: string, kind: SignalKind, data?: unknown) {
    void this.ch?.send({ type: 'broadcast', event: 'sig', payload: { from: this.id, to, kind, data } satisfies SignalMsg });
  }
  leave() { this.gen++; if (this.ch && this.client) { void this.client.removeChannel(this.ch); this.ch = null; } }
}

/** Apakah build ini bisa main lewat internet (Supabase dikonfigurasi & tidak dipaksa uji lokal lewat ?signal=local). */
export function onlineConfigured(): boolean {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined, key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  const forceLocal = typeof location !== 'undefined' && new URLSearchParams(location.search).get('signal') === 'local';
  return !!url && !!key && !forceLocal;
}

/** Supabase bila dikonfigurasi (env build), selain itu antar-tab. */
export function createSignaling(): Signaling {
  if (onlineConfigured()) return new SupabaseSignaling(import.meta.env.VITE_SUPABASE_URL as string, import.meta.env.VITE_SUPABASE_ANON_KEY as string);
  return new LocalSignaling();
}

/** Server ICE: STUN publik gratis + TURN opsional dari env (VITE_TURN_URL/USERNAME/CREDENTIAL) untuk NAT ketat. */
export function iceServers(stun: readonly string[]): RTCIceServer[] {
  const list: RTCIceServer[] = [{ urls: [...stun] }];
  const url = import.meta.env.VITE_TURN_URL as string | undefined;
  if (url) list.push({ urls: url.split(',').map(s => s.trim()), username: import.meta.env.VITE_TURN_USERNAME as string | undefined,
    credential: import.meta.env.VITE_TURN_CREDENTIAL as string | undefined });
  return list;
}
