// src/main.ts — entry: init Rapier, Engine, state machine aplikasi (GDD §2.8)
import './ui/hud.css';
import { blackbox } from './core/BlackBox';
import { Game } from './game/Game';
import { ctx } from './game/ctx';

// kotak hitam: error JS, tab tersembunyi, halaman berakhir, detak — sebelum apa pun dibangun
blackbox.install();
{
  // parameter alur login (kode PKCE sekali pakai, id alur, error) tidak ikut tercatat di laporan teknis yang bisa disalin pemain
  const q = new URLSearchParams(location.search);
  for (const k of ['code', 'sb_flow_id', 'error', 'error_code', 'error_description', 'type']) q.delete(k);
  const qs = q.toString();
  blackbox.log('boot', location.pathname + (qs ? `?${qs}` : ''));
}
const game = new Game();
Object.assign(window as object, { __game: game, __ctx: ctx });
game.boot().catch((e) => {
  console.error(e);
  const msg = document.querySelector('.ld-msg');
  if (msg) msg.textContent = 'Gagal memuat: ' + (e instanceof Error ? e.message : String(e));
});
