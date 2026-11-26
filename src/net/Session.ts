// src/net/Session.ts — sesi room online. HOST: mendengar kode room di signaling, menerima teman (WebRTC), room (Lobby) dipegang
// host & disiarkan ke klien; aksi klien (pindah tim, siap, loadout, keluar) divalidasi host. KLIEN: bergabung lewat kode, menerima
// cermin room, mengirim aksi. Saat match: biner perintah/snapshot lewat kanal unreliable; event penting lewat kanal reliable.
import { cleanVariant, type Variant } from '../entities/variants';
import { Lobby } from '../game/Lobby';
import { cleanLoadout, type Loadout } from '../combat/Loadout';
import { Peer } from './Peer';
import { MSG, decodeCommands, decodeSnapshot, msgType, type Command, type Snapshot } from './protocol';
import type { SignalMsg, Signaling } from './Signaling';
import type { Team } from '../entities/BlockyCharacter';
import { XCFG } from '../config/extraConfig';
import { parsePlan, type Plan } from './Migration';

export interface Profile { name: string; variant: Variant; weapon: string; scope: string; pistol: string; pscope: string; melee: string }
export type JoinFail = 'notfound' | 'full' | 'started' | 'timeout' | 'failed';

export { cleanLoadout };

// ───────────────────────────── HOST
export interface HostHooks {
  lobby(): Lobby | null;
  inMatch(): boolean;
  onLobbyChanged(): void;
  onCommands(pid: string, cmds: Command[]): void;
  /** Pemain terputus / keluar (room: sudah dikeluarkan dari Lobby; match: slot diambil alih bot). left = keluar dengan sengaja. */
  onPeerLeft(pid: string, left: boolean): void;
  /** Pemain mengganti loadout/karakter (room: sudah dicatat di Lobby; match: berlaku pada spawn berikutnya). */
  onLoadout(pid: string, lo: Loadout, variant: Variant): void;
  /** Ping teman diperbarui (tiap XCFG.net.pingEvery detik). */
  onPings(): void;
  /** Pemain lama (pid sudah ada di room, bukan pemain lokal, sedang tidak tersambung) boleh bergabung ulang — juga di tengah
   *  match (sambung ulang setelah koneksi putus / pindah host). */
  canRejoin(pid: string): boolean;
  /** Pemain bergabung ulang dengan pid lamanya. Match berjalan → Game mengirim susunan + cadangan untuk melanjutkan. */
  onPeerRejoined(pid: string): void;
  /** Teman melapor AFK (pause / tab tersembunyi ≥ afkAfter detik) atau kembali. */
  onAfk(pid: string, on: boolean): void;
  /** Host baru hasil pindah host bertemu host lain di kode yang sama dengan klaim lebih kuat → mengalah ke pemenang (pid). */
  onYield?(winner: string): void;
  /** Teman mengirim chat (mentah dari jaringan — Game memvalidasi, membatasi laju & meneruskan ke penerima). */
  onChat?(pid: string, scope: unknown, text: unknown, quick: boolean): void;
  /** Paket suara dari teman (biner MSG.VOICE; Game/VoiceSystem memvalidasi & meneruskan ke penerima yang berhak). */
  onVoice?(pid: string, buf: ArrayBuffer): void;
}

/** Klaim host baru hasil pindah host (disiarkan di signaling): lebih banyak teman tersambung menang; seri → urutan pengganti
 *  lebih awal; seri → pid. Murni (diuji). */
export interface HostClaim { pid: string; rank: number; peers: number }
export function claimBeats(a: HostClaim, b: HostClaim): boolean {
  return a.peers !== b.peers ? a.peers > b.peers : a.rank !== b.rank ? a.rank < b.rank : a.pid < b.pid;
}
export function parseClaim(d: unknown): HostClaim | null {
  const r = d as Record<string, unknown> | null;
  if (!r || typeof r !== 'object' || typeof r.pid !== 'string' || !/^p\d{1,6}$/.test(r.pid)) return null;
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : -1);
  return { pid: r.pid, rank: n(r.rank), peers: Math.max(0, n(r.peers)) };
}

/** rtt = ping terhaluskan (ms), −1 = belum terukur. */
interface HostPeer { peer: Peer; pid: string | null; rtt: number; left?: boolean }

export class NetHost {
  private readonly peers = new Map<string, HostPeer>();
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  /** Host baru hasil pindah host: pid & urutan pengganti kita (null = host pembuat room — kodenya baru, tidak mungkin bentrok). */
  claim: { pid: string; rank: number } | null = null;
  private claimTimer: ReturnType<typeof setInterval> | null = null;
  private yielded = false;
  constructor(readonly sig: Signaling, private hooks: HostHooks, private ice: RTCIceServer[]) {}

  async open(code: string) {
    await this.sig.join(code, (m) => this.onSignal(m));
    this.pingTimer ??= setInterval(() => this.pingRound(), XCFG.net.pingEvery * 1000);
    if (this.claim) { this.beacon(); this.claimTimer ??= setInterval(() => this.beacon(), XCFG.net.claimEvery * 1000); }
  }

  private myClaim(): HostClaim | null { return this.claim ? { ...this.claim, peers: this.connected } : null; }
  /** Siarkan klaim host di kanal room (dua pengganti yang naik bersamaan saling menemukan). */
  private beacon() { const c = this.myClaim(); if (c && !this.yielded) this.sig.send('*', 'host', c); }

  /** Ping: kirim waktu lokal ke tiap teman (dibalas apa adanya → RTT), lalu siarkan ping terakhir semua teman. */
  private pingRound() {
    const now = performance.now();
    for (const e of this.peers.values()) if (e.pid && e.peer.open) e.peer.sendRel({ t: 'png', ts: now });
    const p = this.pings();
    if (Object.keys(p).length) { this.sendAll({ t: 'pings', p }); this.hooks.onPings(); }
  }

  /** Ping tiap teman terhubung (ms, dibulatkan). */
  pings(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const e of this.peers.values()) if (e.pid && e.peer.open && e.rtt >= 0) out[e.pid] = Math.round(e.rtt);
    return out;
  }
  ping(pid: string): number | null { for (const e of this.peers.values()) if (e.pid === pid && e.rtt >= 0) return Math.round(e.rtt); return null; }

  /** Jumlah teman terhubung (sudah masuk room). */
  get connected() { let n = 0; for (const e of this.peers.values()) if (e.pid && e.peer.open) n++; return n; }

  private onSignal(m: SignalMsg) {
    if (m.kind === 'host') {
      const other = parseClaim(m.data), mine = this.myClaim();
      if (!other || !mine || this.yielded || other.pid === mine.pid) return;
      if (claimBeats(other, mine)) { this.yielded = true; this.hooks.onYield?.(other.pid); }
      else this.beacon();   // kita menang → segera beri tahu (yang kalah tidak perlu menunggu siaran berikutnya)
      return;
    }
    if (m.kind === 'hello') {
      const L = this.hooks.lobby();
      if (!L) return;
      // pemain lama yang bergabung ulang (pid-nya masih di room) selalu diterima — juga di tengah match / room penuh
      const rj = (m.data as { rejoin?: unknown } | undefined)?.rejoin;
      if (typeof rj === 'string' && this.rejoinable(rj)) this.sig.send(m.from, 'welcome', { code: L.code });
      else if (this.hooks.inMatch()) this.sig.send(m.from, 'deny', 'started');
      else if (L.full) this.sig.send(m.from, 'deny', 'full');
      else this.sig.send(m.from, 'welcome', { code: L.code });
      return;
    }
    if (m.kind === 'offer') {
      let e = this.peers.get(m.from);
      if (!e) {
        const peer = new Peer(m.from, (k, d) => this.sig.send(m.from, k, d), this.ice, false);
        e = { peer, pid: null, rtt: -1 };
        this.peers.set(m.from, e);
        this.wire(m.from, e);
      }
      void e.peer.onSignal('offer', m.data);
    } else if (m.kind === 'ice') void this.peers.get(m.from)?.peer.onSignal('ice', m.data);
    else if (m.kind === 'bye') this.peers.get(m.from)?.peer.close();
  }

  private wire(id: string, e: HostPeer) {
    e.peer.onRel = (msg) => this.onRel(e, msg);
    e.peer.onUnr = (buf) => {
      if (!e.pid) return;
      const t = msgType(buf);
      if (t === MSG.CMD) this.hooks.onCommands(e.pid, decodeCommands(buf));
      else if (t === MSG.VOICE) this.hooks.onVoice?.(e.pid, buf);
    };
    e.peer.onClose = () => {
      this.peers.delete(id);
      if (!e.pid) return;
      // di tengah match pemain tetap tercatat di room (slotnya dimainkan bot) → bisa bergabung ulang; di room biasa dikeluarkan
      if (!this.hooks.inMatch() || e.left) this.hooks.lobby()?.leave(e.pid);
      this.hooks.onPeerLeft(e.pid, !!e.left);
      this.broadcastLobby(); this.hooks.onLobbyChanged();
    };
  }

  private onRel(e: HostPeer, msg: Record<string, unknown>) {
    const L = this.hooks.lobby();
    if (!L) return;
    if (msg.t === 'join' && !e.pid) {
      const rj = typeof msg.rejoin === 'string' ? msg.rejoin : null;
      if (rj && this.rejoinable(rj)) {
        // koneksi lama pid ini masih dianggap hidup (ICE baru menyatakan putus ±30 s) → basi: dibuang tanpa "teman keluar"
        for (const [id2, e2] of this.peers) if (e2 !== e && e2.pid === rj) { this.peers.delete(id2); e2.peer.onClose = null; e2.peer.close(); }
        const p = L.find(rj)!, lo = cleanLoadout(msg.weapon, msg.scope, msg.pistol, msg.pscope, msg.melee);
        p.variant = cleanVariant(msg.variant); Object.assign(p, lo); p.host = false;
        e.pid = rj;
        e.peer.sendRel({ t: 'you', pid: rj });
        this.broadcastLobby(); this.hooks.onLobbyChanged();
        this.hooks.onPeerRejoined(rj);
        return;
      }
      if (this.hooks.inMatch() || L.full) { e.peer.sendRel({ t: 'deny', reason: this.hooks.inMatch() ? 'started' : 'full' }); return; }
      const p = L.join(String(msg.name ?? 'Teman'));
      if (!p) { e.peer.sendRel({ t: 'deny', reason: 'full' }); return; }
      const lo = cleanLoadout(msg.weapon, msg.scope, msg.pistol, msg.pscope, msg.melee);
      p.variant = cleanVariant(msg.variant); Object.assign(p, lo);
      e.pid = p.id;
      e.peer.sendRel({ t: 'you', pid: p.id });
      this.broadcastLobby(); this.hooks.onLobbyChanged();
      return;
    }
    if (!e.pid) return;
    if (msg.t === 'pong') {
      const rtt = performance.now() - Number(msg.ts);
      if (rtt >= 0 && rtt < 10000) e.rtt = e.rtt < 0 ? rtt : e.rtt * 0.6 + rtt * 0.4;
      return;
    }
    if (msg.t === 'act') {
      const p = L.find(e.pid);
      if (!p) return;
      if (msg.a === 'team' && (msg.team === 'blue' || msg.team === 'red')) L.switchTeam(e.pid, msg.team as Team);
      else if (msg.a === 'ready') L.setReady(e.pid, !!msg.ready);
      else if (msg.a === 'afk') { this.hooks.onAfk(e.pid, !!msg.on); return; }
      else if (msg.a === 'chat') { this.hooks.onChat?.(e.pid, msg.scope, msg.text, msg.quick === true); return; }
      else if (msg.a === 'loadout') {
        const lo = cleanLoadout(msg.weapon, msg.scope, msg.pistol, msg.pscope, msg.melee);
        Object.assign(p, lo); p.variant = cleanVariant(msg.variant);
        this.hooks.onLoadout(e.pid, lo, p.variant);
      }
      this.broadcastLobby(); this.hooks.onLobbyChanged();
    } else if (msg.t === 'leave') { e.left = true; e.peer.close(); }
  }

  /** pid sedang tersambung ke host ini. */
  private connectedPid(pid: string) { for (const e of this.peers.values()) if (e.pid === pid && e.peer.open) return true; return false; }
  /** pid lama yang boleh bergabung ulang (ada di room, bukan pemain lokal). Koneksi lamanya boleh masih tampak hidup: yang
   *  bergabung ulang adalah pemiliknya yang kehilangan host (koneksi lama itu basi & dibuang saat 'join'). */
  private rejoinable(pid: string) { return this.hooks.canRejoin(pid); }

  /** Kembali ke room setelah match: pemain yang tidak tersambung lagi dikeluarkan dari room. */
  prune() {
    const L = this.hooks.lobby();
    if (!L) return;
    const gone = L.players.filter(p => !p.local && !p.sim && !this.connectedPid(p.id)).map(p => p.id);
    for (const pid of gone) L.leave(pid);
    if (gone.length) { this.broadcastLobby(); this.hooks.onLobbyChanged(); }
  }

  /** Rencana pengganti host ke semua teman. */
  sendPlan(plan: Plan) { this.sendAll({ t: 'plan', code: plan.code, order: plan.order }); }

  /** Serah-terima host: rencana (pengganti pilihan di urutan pertama) + cadangan + susunan match ke semua, lalu room ditutup
   *  setelah jeda singkat agar pesan sampai. Teman yang menerima 'handover' tidak menganggap 'bye' sebagai room ditutup. */
  handover(plan: Plan, save: unknown, start: unknown): Promise<void> {
    this.sendAll({ t: 'handover', plan, save, start });
    return new Promise((res) => setTimeout(() => { this.close(); res(); }, 400));
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

  /** Biner unreliable ke satu klien (dilewati bila antrean kirimnya menumpuk — data basi lebih buruk daripada tidak ada). */
  sendUnr(pid: string, buf: ArrayBuffer) {
    for (const e of this.peers.values()) if (e.pid === pid && e.peer.backlog < XCFG.net.backlogDrop) e.peer.sendUnr(buf);
  }

  /** Byte yang masih antre dikirim ke satu klien (upload host tersumbat → kurangi laju snapshot klien itu). */
  backlog(pid: string): number { for (const e of this.peers.values()) if (e.pid === pid) return e.peer.backlog; return 0; }

  /** id pemain room yang sedang terhubung. */
  pids(): string[] { const out: string[] = []; for (const e of this.peers.values()) if (e.pid && e.peer.open) out.push(e.pid); return out; }

  kick(pid: string) {
    for (const e of this.peers.values()) if (e.pid === pid) { e.peer.sendRel({ t: 'kicked' }); setTimeout(() => e.peer.close(), 150); }
  }

  close() {
    if (this.pingTimer) { clearInterval(this.pingTimer); this.pingTimer = null; }
    if (this.claimTimer) { clearInterval(this.claimTimer); this.claimTimer = null; }
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
  /** Ping semua pemain diperbarui host. */
  onPings(): void;
  /** Rencana pengganti host / cadangan pertandingan / serah-terima host dari host (pindah host). */
  onPlan?(plan: Plan): void;
  onSave?(raw: unknown): void;
  onHandover?(plan: Plan | null, save: unknown, start: unknown): void;
  /** Pesan chat dari host (divalidasi Game lewat parseChat) / chat kita ditolak host (alasan untuk ditampilkan). */
  onChat?(msg: Record<string, unknown>): void;
  onChatDeny?(reason: string): void;
  /** Paket suara dari host (sudah disaring host). */
  onVoice?(buf: ArrayBuffer): void;
}

export class NetClient {
  pid: string | null = null;
  lobby: Lobby | null = null;
  /** Ping tiap pemain room ke host (ms), dari host. */
  pings: Record<string, number> = {};
  private peer: Peer | null = null;
  private hostId: string | null = null;
  private ended = false;
  /** Waktu pesan terakhir dari host (ms) + pemeriksa "host diam" (koneksi P2P baru dinyatakan gagal ±30 s). */
  private lastRx = 0;
  private watch: ReturnType<typeof setInterval> | null = null;
  constructor(readonly sig: Signaling, private hooks: ClientHooks, private ice: RTCIceServer[]) {}

  get connected() { return !!this.peer?.open && !!this.pid; }
  /** Detik sejak pesan terakhir dari host (overlay "koneksi tersendat"). */
  get silence() { return this.lastRx ? (performance.now() - this.lastRx) / 1000 : 0; }

  /** Gabung room lewat kode: hello → welcome dari host → WebRTC → join → cermin room.
   *  helloSec = batas menunggu host menjawab (kode salah / room sudah ditutup); timeoutSec = batas total termasuk WebRTC. */
  join(code: string, profile: Profile, timeoutSec: number, helloSec = timeoutSec, rejoin: string | null = null): Promise<{ ok: true } | { ok: false; reason: JoinFail }> {
    return new Promise<{ ok: true } | { ok: false; reason: JoinFail }>((resolve) => {
      let done = false, subscribed = false;
      const finish = (r: { ok: true } | { ok: false; reason: JoinFail }) => {
        if (done) return;
        done = true; clearTimeout(timer); clearTimeout(helloTimer); clearInterval(resend);
        if (!r.ok) this.close(false);
        resolve(r);
      };
      // alasan gagal: 'failed' = kanal signaling tidak tersambung (internet KITA), 'notfound' = tersambung tapi tidak ada host
      // yang menjawab, 'timeout' = host menjawab tapi WebRTC tidak tersambung (pindah host membedakan ketiganya)
      const noHost = (): JoinFail => (subscribed ? 'notfound' : 'failed');
      let timer = setTimeout(() => finish({ ok: false, reason: this.hostId ? 'timeout' : noHost() }), timeoutSec * 1000);
      const helloTimer = setTimeout(() => { if (!this.hostId) finish({ ok: false, reason: noHost() }); }, helloSec * 1000);
      // hello diulang tiap helloEvery s: broadcast bisa hilang saat kanal baru tersambung, dan host baru hasil pindah host bisa
      // baru siap beberapa detik kemudian
      const hello = rejoin ? { name: profile.name, rejoin } : { name: profile.name };
      const resend = setInterval(() => { if (subscribed && !this.hostId && !done) this.sig.send('*', 'hello', hello); }, XCFG.net.helloEvery * 1000);
      const onSignal = (m: SignalMsg) => {
        if (m.kind === 'welcome' && !this.hostId) {
          this.hostId = m.from;
          // host ditemukan → waktu sambung WebRTC dihitung dari sini (jawaban bisa datang di akhir jendela hello)
          clearTimeout(timer);
          timer = setTimeout(() => finish({ ok: false, reason: 'timeout' }), Math.max(3, timeoutSec - helloSec) * 1000);
          const peer = new Peer(m.from, (k, d) => this.sig.send(m.from, k, d), this.ice, true);
          this.peer = peer;
          peer.onOpen = () => peer.sendRel({ t: 'join', ...profile, ...(rejoin ? { rejoin } : {}) });
          peer.onRel = (msg) => {
            this.lastRx = performance.now();
            if (msg.t === 'you') this.pid = String(msg.pid);
            else if (msg.t === 'deny') finish({ ok: false, reason: msg.reason === 'started' ? 'started' : 'full' });
            else if (msg.t === 'lobby' && this.pid) {
              this.lobby = Lobby.fromState(msg.state as never, this.pid);
              finish({ ok: true });
              this.hooks.onLobby();
            } else if (msg.t === 'png') peer.sendRel({ t: 'pong', ts: msg.ts });
            else if (msg.t === 'pings' && msg.p && typeof msg.p === 'object') {
              const p: Record<string, number> = {};
              for (const [k, v] of Object.entries(msg.p as Record<string, unknown>)) if (typeof v === 'number' && Number.isFinite(v)) p[k] = Math.max(0, Math.round(v));
              this.pings = p; this.hooks.onPings();
            } else if (msg.t === 'plan') { const pl = parsePlan(msg); if (pl) this.hooks.onPlan?.(pl); }
            else if (msg.t === 'save') this.hooks.onSave?.(msg.s);
            else if (msg.t === 'handover') this.hooks.onHandover?.(parsePlan(msg.plan), msg.save, msg.start);
            else if (msg.t === 'chat') this.hooks.onChat?.(msg);
            else if (msg.t === 'chatno') this.hooks.onChatDeny?.(String(msg.reason ?? ''));
            else if (msg.t === 'start') this.hooks.onStart(msg);
            else if (msg.t === 'ev') this.hooks.onEvent(msg);
            else if (msg.t === 'bye') this.end('host');
            else if (msg.t === 'kicked') this.end('kicked');
          };
          peer.onUnr = (buf) => {
            this.lastRx = performance.now();
            const t = msgType(buf);
            if (t === MSG.SNAP) { const s = decodeSnapshot(buf); if (s) this.hooks.onSnapshot(s); }
            else if (t === MSG.VOICE) this.hooks.onVoice?.(buf);
          };
          peer.onClose = () => { if (!done) finish({ ok: false, reason: 'timeout' }); else this.end('lost'); };
          void peer.start();
        } else if (m.kind === 'deny' && !done) finish({ ok: false, reason: m.data === 'started' ? 'started' : m.data === 'full' ? 'full' : 'failed' });
        else if (m.from === this.hostId && (m.kind === 'answer' || m.kind === 'ice')) void this.peer?.onSignal(m.kind, m.data);
      };
      this.sig.join(code, onSignal).then(() => { subscribed = true; this.sig.send('*', 'hello', hello); },
        () => finish({ ok: false, reason: 'failed' }));
    }).then((r) => {
      if (r.ok) {
        // host diam terlalu lama (laptop host mati / internetnya putus): ICE baru menyatakan gagal ±30 s → putuskan sendiri
        this.lastRx = performance.now();
        this.watch = setInterval(() => {
          if (!this.ended && performance.now() - this.lastRx > XCFG.net.hostSilence * 1000) this.end('lost');
        }, 1000);
      }
      return r;
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
  /** Paket suara ke host (kanal unreliable). */
  sendVoice(buf: ArrayBuffer) { this.peer?.sendUnr(buf); }

  /** Keluar room (memberi tahu host). */
  leave() { this.peer?.sendRel({ t: 'leave' }); this.close(true); }

  private close(sayBye: boolean) {
    this.ended = true;
    if (this.watch) { clearInterval(this.watch); this.watch = null; }
    if (sayBye && this.hostId) this.sig.send(this.hostId, 'bye');
    if (this.peer) { this.peer.onClose = null; this.peer.close(); this.peer = null; }
    this.sig.leave();
  }
}
