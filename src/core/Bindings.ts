// src/core/Bindings.ts — pemetaan aksi → tombol (bisa diubah di menu Kontrol, tersimpan di settings) + tata letak gamepad.
// Fitur pasca-MVP: rebind tombol & dukungan gamepad (GDD §1 "Pasca-MVP").

export type Action = 'forward' | 'back' | 'left' | 'right' | 'jump' | 'sprint' | 'crouch' | 'reload' | 'fireMode' | 'melee'
  | 'primary' | 'knife' | 'grenade' | 'flash' | 'lastWeapon' | 'drop' | 'pickup' | 'view' | 'shoulder' | 'scoreboard' | 'loadout'
  | 'chatAll' | 'chatTeam' | 'quickChat' | 'voiceTeam' | 'voiceAll';
export type Binds = Record<Action, string>;

export const ACTIONS: readonly { id: Action; label: string }[] = [
  { id: 'forward', label: 'Maju' }, { id: 'back', label: 'Mundur' }, { id: 'left', label: 'Geser kiri' }, { id: 'right', label: 'Geser kanan' },
  { id: 'jump', label: 'Lompat' }, { id: 'sprint', label: 'Sprint (tahan, hanya ke depan)' }, { id: 'crouch', label: 'Jongkok' },
  { id: 'reload', label: 'Reload' }, { id: 'fireMode', label: 'Ganti mode tembak' }, { id: 'melee', label: 'Pukul (melee)' },
  { id: 'primary', label: 'Senjata utama (slot 1)' }, { id: 'knife', label: 'Pisau (slot 2)' }, { id: 'grenade', label: 'Granat K-400 (slot 3)' },
  { id: 'flash', label: 'Flashbang (slot 4)' },
  { id: 'lastWeapon', label: 'Senjata sebelumnya' }, { id: 'drop', label: 'Buang senjata utama' },
  { id: 'pickup', label: 'Ambil / tukar senjata (tim sendiri)' }, { id: 'view', label: 'Ganti FPS / TPS' },
  { id: 'shoulder', label: 'Tukar bahu (TPS)' }, { id: 'scoreboard', label: 'Papan skor (tahan)' }, { id: 'loadout', label: 'Loadout' },
  { id: 'chatAll', label: 'Chat ke semua' }, { id: 'chatTeam', label: 'Chat ke tim' }, { id: 'quickChat', label: 'Pesan cepat ke tim (lalu 1–6)' },
  { id: 'voiceTeam', label: 'Voice ke tim (tahan)' }, { id: 'voiceAll', label: 'Voice ke semua (tahan)' },
];

export const DEFAULT_BINDS: Binds = {
  forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD', jump: 'Space', sprint: 'ShiftLeft', crouch: 'KeyC',
  reload: 'KeyR', fireMode: 'KeyB', melee: 'KeyF', primary: 'Digit1', knife: 'Digit2', grenade: 'Digit3', flash: 'Digit4', lastWeapon: 'KeyQ',
  drop: 'KeyG', pickup: 'KeyE', view: 'KeyV', shoulder: 'KeyX', scoreboard: 'Tab', loadout: 'KeyL',
  chatAll: 'KeyY', chatTeam: 'KeyU', quickChat: 'KeyH', voiceTeam: 'KeyT', voiceAll: 'KeyZ',
};

/** Versi skema tombol tersimpan. v2: slot 1/2/3 + Q senjata sebelumnya, tukar bahu Q → X, granat G → 3, G = buang senjata. */
export const BINDS_VERSION = 2;

/**
 * Migrasi binds tersimpan v1 → v2: tombol yang masih default lama dipindah ke default baru (bila tujuannya belum dipakai),
 * sehingga Q & G kosong untuk "senjata sebelumnya" & "buang senjata". Tombol yang sudah diubah pengguna tidak disentuh.
 */
export function migrateBinds(raw: unknown, fromVersion: number): unknown {
  if (fromVersion >= BINDS_VERSION || !raw || typeof raw !== 'object') return raw;
  const b = { ...(raw as Record<string, unknown>) };
  const used = (code: string) => Object.values(b).includes(code);
  if (b.shoulder === 'KeyQ' && !used('KeyX')) b.shoulder = 'KeyX';
  if (b.grenade === 'KeyG' && !used('Digit3')) b.grenade = 'Digit3';
  return b;
}

/** Tombol sistem/debug yang tidak bisa dipetakan ulang (klik kiri/kanan tetap tembak/ADS). */
export const RESERVED: ReadonlySet<string> = new Set(['Escape', 'F3', 'Backquote', 'F5', 'F11', 'F12', 'MetaLeft', 'MetaRight',
  'ContextMenu', 'Mouse0', 'Mouse2']);

const CODE_RE = /^[A-Za-z][A-Za-z0-9]{1,23}$/;
export const isBindable = (code: string) => CODE_RE.test(code) && !RESERVED.has(code);

/** Validasi binds tersimpan: kode tidak valid/duplikat dibuang; aksi kosong diisi default bila tombolnya masih bebas. */
export function validateBinds(raw: unknown): Binds {
  const src = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const out = {} as Binds;
  const used = new Set<string>();
  for (const { id } of ACTIONS) {
    const v = src[id];
    if (typeof v === 'string' && isBindable(v) && !used.has(v)) { out[id] = v; used.add(v); } else out[id] = '';
  }
  for (const { id } of ACTIONS) {
    if (out[id] || src[id] === '') continue; // string kosong eksplisit = sengaja tidak dipetakan
    const d = DEFAULT_BINDS[id];
    if (!used.has(d)) { out[id] = d; used.add(d); }
  }
  return out;
}

/** Pasang tombol untuk aksi; bila tombol sudah dipakai aksi lain, keduanya ditukar. */
export function rebind(b: Binds, action: Action, code: string): Binds {
  const next = { ...b };
  const other = ACTIONS.find(a => a.id !== action && next[a.id] === code);
  if (other) next[other.id] = b[action];
  next[action] = code;
  return next;
}

const LABELS: Record<string, string> = {
  Space: 'Spasi', ShiftLeft: 'Shift Kiri', ShiftRight: 'Shift Kanan', ControlLeft: 'Ctrl Kiri', ControlRight: 'Ctrl Kanan',
  AltLeft: 'Alt Kiri', AltRight: 'Alt Kanan', CapsLock: 'Caps Lock', Enter: 'Enter', Backspace: 'Backspace',
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Mouse1: 'Klik Tengah', Mouse3: 'Mouse 4', Mouse4: 'Mouse 5',
  Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/',
  Backslash: '\\',
};

export function keyLabel(code: string): string {
  if (!code) return '—';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'Num ' + code.slice(6);
  return LABELS[code] ?? code;
}

/** Gamepad "standard mapping" W3C — tata letak ala FPS konsol. */
export const PAD = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, BACK: 8, START: 9, L3: 10, R3: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 } as const;
export const PAD_ACTION: Partial<Record<Action, number>> = {
  jump: PAD.A, crouch: PAD.B, reload: PAD.X, grenade: PAD.RB, fireMode: PAD.LB, sprint: PAD.L3, melee: PAD.R3,
  scoreboard: PAD.BACK, view: PAD.UP, shoulder: PAD.RIGHT, loadout: PAD.LEFT, lastWeapon: PAD.Y, knife: PAD.DOWN,
};
export const PAD_HELP: [string, string][] = [
  ['Stik kiri / kanan', 'Gerak / bidik'], ['RT / LT', 'Tembak / ADS (pisau: tebas / tusuk; granat: lempar jauh / gelinding)'], ['A', 'Lompat'], ['B', 'Jongkok'],
  ['X', 'Reload / ambil senjata (dekat senjata tim)'], ['Y', 'Senjata sebelumnya'], ['RB', 'Granat K-400 · RB 2× cepat = flashbang'], ['LB', 'Ganti mode tembak'],
  ['L3', 'Sprint (toggle)'], ['R3', 'Pukul (melee)'], ['D-pad ↑ / →', 'FPS-TPS / tukar bahu'], ['D-pad ↓', 'Pisau'], ['D-pad ←', 'Loadout'],
  ['View (Back)', 'Papan skor'],
  ['Menu (Start)', 'Pause'], ['Di menu', 'D-pad pilih · A oke · B kembali'],
];
