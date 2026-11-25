// src/main.ts — entry: init Rapier, Engine, state machine aplikasi (GDD §2.8)
import './ui/hud.css';
import { blackbox } from './core/BlackBox';
import { Game } from './game/Game';
import { ctx } from './game/ctx';

// kotak hitam: error JS, tab tersembunyi, halaman berakhir, detak — sebelum apa pun dibangun
blackbox.install();
blackbox.log('boot', location.pathname + location.search);
const game = new Game();
Object.assign(window as object, { __game: game, __ctx: ctx });
game.boot().catch((e) => {
  console.error(e);
  const msg = document.querySelector('.ld-msg');
  if (msg) msg.textContent = 'Gagal memuat: ' + (e instanceof Error ? e.message : String(e));
});
