// src/ui/Chat.ts — tampilan chat (logika & validasi: game/Chat.ts):
//  • HUD saat match: feed kiri bawah (memudar setelah XCFG.chat.showSec), kotak ketik (Y semua / U tim; Enter kirim, Tab ganti
//    tim/semua, Esc batal), menu pesan cepat (H lalu 1–6)
//  • panel chat untuk layar room / hasil / pause: SATU elemen tetap yang dipasang ulang setiap menu digambar ulang (room digambar
//    ulang tiap ada perubahan) — ketikan tidak hilang; fokus dipulihkan Menus.refreshRoom lewat data-a="chatin".
// Teks selalu lewat textContent (tidak pernah innerHTML) → nama/teks dari jaringan tidak bisa menyisipkan HTML.
import { XCFG } from '../config/extraConfig';
import { QUICK, type ChatMsg, type ChatScope } from '../game/Chat';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
};
const scopeTag = (s: ChatScope) => (s === 'team' ? '[TIM]' : '[SEMUA]');

export class ChatUI {
  /** Kotak ketik HUD terbuka (Game: gerak & tembak berhenti, mouse-look tetap). */
  typing = false;
  /** Menu pesan cepat terbuka (angka 1–6 memilih pesan, bukan ganti senjata). */
  quickOpen = false;
  /** Pesan dari kotak ketik / panel (teks mentah; dibersihkan & divalidasi Game). */
  onSend: ((scope: ChatScope, text: string) => void) | null = null;
  /** Kotak ketik HUD tertutup; esc = dibatalkan dengan Esc (Chrome sekaligus melepas kunci mouse). */
  onClose: ((esc: boolean) => void) | null = null;

  private readonly feed = el('div', 'chat-feed');
  private readonly bar = el('div', 'chat-bar');
  private readonly barTag = el('span', 'chat-tag');
  private readonly input = el('input', 'chat-in');
  private readonly quick = el('div', 'chat-quick');
  private scope: ChatScope = 'team';
  private quickT = 0;
  /** Panel chat menu (room / hasil / pause). */
  readonly panel = el('div', 'chat-panel');
  private readonly pLog = el('div', 'cp-log');
  private readonly pIn = el('input', 'cp-in');
  private readonly pScope = el('button', 'cp-scope');
  private pScopeV: ChatScope = 'all';

  constructor(hudRoot: HTMLElement) {
    for (const i of [this.input, this.pIn]) { i.maxLength = 400; i.spellcheck = false; i.autocomplete = 'off'; i.type = 'text'; }
    this.bar.append(this.barTag, this.input, el('small', '', 'Enter kirim · Tab tim/semua · Esc batal'));
    this.bar.style.display = 'none';
    this.quick.style.display = 'none';
    this.quick.append(el('div', 'cq-h', 'PESAN CEPAT → TIM'),
      ...QUICK.map((q, i) => { const r = el('div', 'cq-i'); r.append(el('b', '', String(i + 1)), ' ', q.label); return r; }),
      el('small', '', 'Tekan 1–6 · H tutup'));
    hudRoot.append(this.feed, this.bar, this.quick);
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); const v = this.input.value; this.close(false); if (v.trim()) this.onSend?.(this.scope, v); }
      else if (e.key === 'Escape') { e.preventDefault(); this.close(true); }
      else if (e.key === 'Tab') { e.preventDefault(); this.setScope(this.scope === 'team' ? 'all' : 'team'); }
    });
    this.input.addEventListener('blur', () => { if (this.typing) this.close(false); });   // pindah jendela / klik di luar
    // panel menu
    this.pIn.placeholder = 'Ketik pesan… (Enter kirim)';
    this.pIn.dataset.a = 'chatin';
    this.pScope.type = 'button';
    this.pScope.title = 'Ganti: ke tim saja / ke semua (Tab)';
    const send = el('button', 'cp-send', 'Kirim'); send.type = 'button';
    const row = el('div', 'cp-row'); row.append(this.pScope, this.pIn, send);
    this.panel.append(this.pLog, row);
    const toggle = () => { this.pScopeV = this.pScopeV === 'team' ? 'all' : 'team'; this.paintPanel(); };
    const submit = () => { const v = this.pIn.value; if (!v.trim()) return; this.pIn.value = ''; this.onSend?.(this.pScopeV, v); };
    this.pScope.addEventListener('click', () => { toggle(); this.pIn.focus(); });
    send.addEventListener('click', () => { submit(); this.pIn.focus(); });
    this.pIn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); submit(); } else if (e.key === 'Tab') { e.preventDefault(); toggle(); }
    });
    this.paintPanel();
  }

  /** Pesan baru (sudah lolos mute/validasi): ke feed HUD dan panel menu. */
  add(m: ChatMsg) {
    const C = XCFG.chat, row = this.row(m);
    this.feed.append(row);
    while (this.feed.children.length > C.feedMax * 2) this.feed.firstElementChild!.remove();
    setTimeout(() => row.classList.add('old'), C.showSec * 1000);
    const atEnd = this.pLog.scrollHeight - this.pLog.scrollTop - this.pLog.clientHeight < 24;
    this.pLog.append(this.row(m));
    while (this.pLog.children.length > C.logMax) this.pLog.firstElementChild!.remove();
    if (atEnd) this.pLog.scrollTop = this.pLog.scrollHeight;
  }

  /** Baris pemberitahuan sistem (mis. chat semua dimatikan) — hanya untuk pemain ini. */
  note(text: string) {
    const r = el('div', 'chat-line sys', text);
    this.feed.append(r);
    setTimeout(() => r.classList.add('old'), XCFG.chat.showSec * 1000);
    const p = el('div', 'chat-line sys', text);
    this.pLog.append(p);
    this.pLog.scrollTop = this.pLog.scrollHeight;
  }

  /** Room baru / keluar: riwayat dihapus. */
  clear() { this.feed.replaceChildren(); this.pLog.replaceChildren(); this.close(false); this.closeQuick(); this.pIn.value = ''; }

  /** Pasang panel di menu (placeholder data-chat) — dipanggil setiap menu digambar ulang (pilihan tim/semua & ketikan tetap). */
  attachPanel(slot: Element) {
    slot.appendChild(this.panel);
    this.pLog.scrollTop = this.pLog.scrollHeight;
  }

  /** Kotak ketik HUD (Y semua / U tim). */
  open(scope: ChatScope) {
    this.closeQuick();
    this.typing = true;
    this.setScope(scope);
    this.input.value = '';
    this.bar.style.display = '';
    this.feed.classList.add('open');
    this.input.focus({ preventScroll: true });
  }

  close(esc: boolean) {
    if (!this.typing) return;
    this.typing = false;
    this.bar.style.display = 'none';
    this.feed.classList.remove('open');
    this.input.blur();
    this.onClose?.(esc);
  }

  toggleQuick(now: number) {
    if (this.quickOpen) { this.closeQuick(); return; }
    this.quickOpen = true; this.quickT = now; this.quick.style.display = '';
  }
  closeQuick() { this.quickOpen = false; this.quick.style.display = 'none'; }
  /** Per frame (detik): menu pesan cepat tertutup sendiri. */
  update(now: number) { if (this.quickOpen && now - this.quickT > XCFG.chat.quickTimeout) this.closeQuick(); }

  private setScope(s: ChatScope) { this.scope = s; this.barTag.textContent = scopeTag(s); this.barTag.className = 'chat-tag ' + s; }
  private paintPanel() { this.pScope.textContent = this.pScopeV === 'team' ? 'Ke: TIM' : 'Ke: SEMUA'; this.pScope.className = 'cp-scope ' + this.pScopeV; }

  private row(m: ChatMsg): HTMLElement {
    const r = el('div', 'chat-line' + (m.quick ? ' quick' : '') + (m.bot ? ' bot' : ''));
    const nm = el('b', m.team === 'red' ? 't-red' : 't-blue', (m.dead ? '☠ ' : '') + m.name + (m.bot ? ' (bot)' : ''));
    r.append(el('span', 'tg ' + m.scope, scopeTag(m.scope)), ' ', nm, ': ', el('span', 'tx', m.text));
    return r;
  }
}
