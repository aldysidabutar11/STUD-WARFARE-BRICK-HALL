// src/main.ts — entry: init Rapier, Engine, state machine aplikasi (GDD §2.8)
import './ui/hud.css';
import { Game } from './game/Game';
import { ctx } from './game/ctx';

const game = new Game();
Object.assign(window as object, { __game: game, __ctx: ctx });
game.boot().catch((e) => {
  console.error(e);
  const msg = document.querySelector('.ld-msg');
  if (msg) msg.textContent = 'Gagal memuat: ' + (e instanceof Error ? e.message : String(e));
});
