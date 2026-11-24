// src/net/Session.ts — sesi room online. HOST: mendengar kode room di signaling, menerima teman (WebRTC), room (Lobby) dipegang
// host & disiarkan ke klien; aksi klien (pindah tim, siap, loadout, keluar) divalidasi host. KLIEN: bergabung lewat kode, menerima
// cermin room, mengirim aksi. Saat match: biner perintah/snapshot lewat kanal unreliable; event penting lewat kanal reliable.
import { Lobby } from '../game/Lobby';
import { WEAPONS, SCOPES, scopeAllowed, type ScopeId, type WeaponId } from '../config/weaponsData';
import { Peer } from './Peer';
import { MSG, decodeCommands, decodeSnapshot, msgType, type Command, type Snapshot } from './protocol';
import type { SignalMsg, Signaling } from './Signaling';
import type { Team } from '../entities/BlockyCharacter';

export interface Profile { name: string; variant: 'm' | 'f'; weapon: string; scope: string }
export type JoinFail = 'notfound' | 'full' | 'started' | 'timeout' | 'failed';

/** Loadout dari jaringan divalidasi (senjata/optik yang ada & cocok). */
export function cleanLoadout(weapon: unknown, scope: unknown): { weapon: WeaponId; scope: ScopeId } {
  const w = (typeof weapon === 'string' && weapon in WEAPONS ? weapon : 'm416') as WeaponId;
  let s = (typeof scope === 'string' && scope in SCOPES ? scope : 'reddot') as ScopeId;
  if (!scopeAllowed(WEAPONS[w], s)) s = 'reddot';
  return { weapon: w, scope: s };
}

// ───────────────────────────── HOST
export interface HostHooks {
  lobby(): Lobby | null;
  inMatch(): boolean;
  onLobbyChanged(): void;
  onCommands(pid: string, cmds: Command[]): void;
  /** Pemain terputus / keluar (room: sudah dikeluarkan dari Lobby; match: slot diambil alih bot). */
  onPeerLeft(pid: string): void;
  /** Pemain mengganti loadout/karakter (room: sudah dicatat di Lobby; match: berlaku pada spawn berikutnya). */
  onLoadout(pid: string, lo: { weapon: WeaponId; scope: ScopeId }, variant: 'm' | 'f'): void;
}

interface HostPeer { peer: Peer; pid: string | null }

export class NetHost {
  private readonly peers = new Map<string, HostPeer>();
  constructor(readonly sig: Signaling, private hooks: HostHooks, private ice: RTCIceServer[]) {}

  async open(code: string) { await this.sig.join(code, (m) => this.onSignal(m)); }

  /** Jumlah teman terhubung (sudah masuk room). */
  get connected() { let n = 0; for (const e of this.peers.values()) if (e.pid && e.peer.open) n++; return n; }

  private onSignal(m: SignalMsg) {
    if (m.kind === 'hello') {
      const L = this.hooks.lobby();
      if (!L) return;
      if (this.hooks.inMatch()) this.sig.send(m.from, 'deny', 'started');
      else if (L.full) this.sig.send(m.from, 'deny', 'full');
      else this.sig.send(m.from, 'welcome', { code: L.code });
      return;
    }
    if (m.kind === 'offer') {
      let e = this.peers.get(m.from);
      if (!e) {
        const peer = new Peer(m.from, (k, d) => this.sig.send(m.from, k, d), this.ice, false);
        e = { peer, pid: null };
        this.peers.set(m.from, e);
        this.wire(m.from, e);
      }
      void e.peer.onSignal('offer', m.data);
    } else if (m.kind === 'ice') void this.peers.get(m.from)?.peer.onSignal('ice', m.data);
    else if (m.kind === 'bye') this.peers.get(m.from)?.peer.close();
  }

  private wire(id: string, e: HostPeer) {
    e.peer.onRel = (msg) => this.onRel(e, msg);
    e.peer.onUnr = (buf) => { if (e.pid && msgType(buf) === MSG.CMD) this.hooks.onCommands(e.pid, decodeCommands(buf)); };
    e.peer.onClose = () => {
      this.peers.delete(id);
      if (!e.pid) return;
      this.hooks.lobby()?.leave(e.pid);
      this.hooks.onPeerLeft(e.pid);
      this.broadcastLobby(); this.hooks.onLobbyChanged();
    };
  }

  private onRel(e: HostPeer, msg: Record<string, unknown>) {
    const L = this.hooks.lobby();
    if (!L) return;
    if (msg.t === 'join' && !e.pid) {
      if (this.hooks.inMatch() || L.full) { e.peer.sendRel({ t: 'deny', reason: this.hooks.inMatch() ? 'started' : 'full' }); return; }
      const p = L.join(String(msg.name ?? 'Teman'));
      if (!p) { e.peer.sendRel({ t: 'deny', reason: 'full' }); return; }
      const lo = cleanLoadout(msg.weapon, msg.scope);
      p.variant = msg.variant === 'f' ? 'f' : 'm'; p.weapon = lo.weapon; p.scope = lo.scope;
      e.pid = p.id;
      e.peer.sendRel({ t: 'you', pid: p.id });
      this.broadcastLobby(); this.hooks.onLobbyChanged();
      return;
    }
    if (!e.pid) return;
    if (msg.t === 'act') {
      const p = L.find(e.pid);
      if (!p) return;
      if (msg.a === 'team' && (msg.team === 'blue' || msg.team === 'red')) L.switchTeam(e.pid, msg.team as Team);
      else if (msg.a === 'ready') L.setReady(e.pid, !!msg.ready);
      else if (msg.a === 'loadout') {
        const lo = cleanLoadout(msg.weapon, msg.scope);
        p.weapon = lo.weapon; p.scope = lo.scope; p.variant = msg.variant === 'f' ? 'f' : 'm';
        this.hooks.onLoadout(e.pid, lo, p.variant);
      }
      this.broadcastLobby(); this.hooks.onLobbyChanged();
    } else if (msg.t === 'leave') e.peer.close();
  }

  broadcastLobby() {
    const L = this.hooks.lobby();
    if (!L) return;
    const state = L.toState();
    for (const e of this.peers.values()) if (e.pid) e.peer.sendRel({ t: 'lobby', state });
  }

  /** Pesan reliable ke satu klien. */
  sendTo(pid: string, msg: Record<string, unknown>) { for (const e of this.peers.values()) if (e.pid === pid) e.peer.sendRel(msg); }

  /** Pesan reliable ke semua klien di room. */
  sendAll(msg: Record<string, unknown>) { for (const e of this.peers.values()) if (e.pid) e.peer.sendRel(msg); }

  /** Biner unreliable ke satu klien (dilewati bila antrean kirimnya menumpuk). */
  sendUnr(pid: string, buf: ArrayBuffer) {
    for (const e of this.peers.values()) if (e.pid === pid && e.peer.backlog < 96 * 1024) e.peer.sendUnr(buf);
  }

  /** id pemain room yang sedang terhubung. */
  pids(): string[] { const out: string[] = []; for (const e of this.peers.values()) if (e.pid && e.peer.open) out.push(e.pid); return out; }

  kick(pid: string) {
    for (const e of this.peers.values()) if (e.pid === pid) { e.peer.sendRel({ t: 'kicked' }); setTimeout(() => e.peer.close(), 150); }
  }

  close() {
    this.sendAll({ t: 'bye' });
    for (const e of [...this.peers.values()]) { e.peer.onClose = null; e.peer.close(); }
    this.peers.clear();
    this.sig.leave();
  }
}

// ───────────────────────────── KLIEN
export interface ClientHooks {
  onLobby(): void;
  onStart(msg: Record<string, unknown>): void;
  onEvent(msg: Record<string, unknown>): void;
  onSnapshot(s: Snapshot): void;
  /** Koneksi berakhir: 'host' (host keluar / room ditutup), 'kicked', 'lost'. */
  onClosed(reason: 'host' | 'kicked' | 'lost'): void;
}

export class NetClient {
  pid: string | null = null;
  lobby: Lobby | null = null;
  private peer: Peer | null = null;
  private hostId: string | null = null;
  private ended = false;
  constructor(readonly sig: Signaling, private hooks: ClientHooks, private ice: RTCIceServer[]) {}

  get connected() { return !!this.peer?.open && !!this.pid; }

  /** Gabung room lewat kode: hello → welcome dari host → WebRTC → join → cermin room.
   *  helloSec = batas menunggu host menjawab (kode salah / room sudah ditutup); timeoutSec = batas total termasuk WebRTC. */
  join(code: string, profile: Profile, timeoutSec: number, helloSec = timeoutSec): Promise<{ ok: true } | { ok: false; reason: JoinFail }> {
    return new Promise((resolve) => {
      let done = false;
      const finish = (r: { ok: true } | { ok: false; reason: JoinFail }) => {
        if (done) return;
        done = true; clearTimeout(timer); clearTimeout(helloTimer); clearTimeout(resend);
        if (!r.ok) this.close(false);
        resolve(r);
      };
      const timer = setTimeout(() => finish({ ok: false, reason: this.hostId ? 'timeout' : 'notfound' }), timeoutSec * 1000);
      const helloTimer = setTimeout(() => { if (!this.hostId) finish({ ok: false, reason: 'notfound' }); }, helloSec * 1000);
      // hello diulang sekali (pesan broadcast bisa hilang saat kanal baru tersambung)
      const resend = setTimeout(() => { if (!this.hostId && !done) this.sig.send('*', 'hello', { name: profile.name }); }, Math.min(1500, helloSec * 400));
      const onSignal = (m: SignalMsg) => {
        if (m.kind === 'welcome' && !this.hostId) {
          this.hostId = m.from;
          const peer = new Peer(m.from, (k, d) => this.sig.send(m.from, k, d), this.ice, true);
          this.peer = peer;
          peer.onOpen = () => peer.sendRel({ t: 'join', ...profile });
          peer.onRel = (msg) => {
            if (msg.t === 'you') this.pid = String(msg.pid);
            else if (msg.t === 'deny') finish({ ok: false, reason: msg.reason === 'started' ? 'started' : 'full' });
            else if (msg.t === 'lobby' && this.pid) {
              this.lobby = Lobby.fromState(msg.state as never, this.pid);
              finish({ ok: true });
              this.hooks.onLobby();
            } else if (msg.t === 'start') this.hooks.onStart(msg);
            else if (msg.t === 'ev') this.hooks.onEvent(msg);
            else if (msg.t === 'bye') this.end('host');
            else if (msg.t === 'kicked') this.end('kicked');
          };
          peer.onUnr = (buf) => { if (msgType(buf) === MSG.SNAP) { const s = decodeSnapshot(buf); if (s) this.hooks.onSnapshot(s); } };
          peer.onClose = () => { if (!done) finish({ ok: false, reason: 'failed' }); else this.end('lost'); };
          void peer.start();
        } else if (m.kind === 'deny' && !done) finish({ ok: false, reason: m.data === 'started' ? 'started' : m.data === 'full' ? 'full' : 'failed' });
        else if (m.from === this.hostId && (m.kind === 'answer' || m.kind === 'ice')) void this.peer?.onSignal(m.kind, m.data);
      };
      this.sig.join(code, onSignal).then(() => this.sig.send('*', 'hello', { name: profile.name }),
        () => finish({ ok: false, reason: 'failed' }));
    });
  }

  private end(reason: 'host' | 'kicked' | 'lost') {
    if (this.ended) return;
    this.ended = true;
    this.close(false);
    this.hooks.onClosed(reason);
  }

  act(a: Record<string, unknown>) { this.peer?.sendRel({ t: 'act', ...a }); }
  sendCommands(buf: ArrayBuffer) { this.peer?.sendUnr(buf); }

  /** Keluar room (memberi tahu host). */
  leave() { this.peer?.sendRel({ t: 'leave' }); this.close(true); }

  private close(sayBye: boolean) {
    this.ended = true;
    if (sayBye && this.hostId) this.sig.send(this.hostId, 'bye');
    if (this.peer) { this.peer.onClose = null; this.peer.close(); this.peer = null; }
    this.sig.leave();
  }
}
