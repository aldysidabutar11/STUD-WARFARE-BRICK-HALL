// src/main.ts — entry: init Rapier, Engine, state machine aplikasi (GDD §2.8)
import './ui/hud.css';
import * as THREE from 'three';
import { physics } from './physics/Physics';
import { Engine } from './core/Engine';
import { buildBrickHall } from './world/BrickHallBuilder';
import { Props } from './world/Props';
import { NavGraph } from './world/NavGraph';

async function boot() {
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  await physics.init();
  const engine = new Engine(canvas, 'MEDIUM');
  const map = buildBrickHall(engine.scene, engine.preset, engine.maxAnisotropy, false);
  const props = new Props(engine.scene, map.shelves, engine.preset.shadowMap > 0);
  physics.world.step();
  const nav = new NavGraph();
  const warn = nav.validate((ax, ay, az, bx, by, bz) => physics.losBlocked(ax, ay, az, bx, by, bz));
  console.log(`[nav] ${nav.nodes.length} node, ${nav.walkEdgeCount} jalur, ${nav.dropCount} drop, peringatan: ${warn.length}`, warn);
  console.log(`[map] tris ${map.triangles}, colliders ${map.colliders}, books ${props.books.length}`);
  document.getElementById('loading')!.classList.add('hidden');
  const q = new URLSearchParams(location.search);
  const cam = engine.camera;
  let t = 0;
  const loop = () => {
    t += 1 / 60;
    physics.world.step();
    props.fixedUpdate(1 / 60);
    const view = q.get('view');
    if (view === 'floor') { cam.position.set(-19.5, 4.4, -12); cam.lookAt(0, 3, 10); }
    else if (view === 'bridge') { cam.position.set(-8, 14.4, -34); cam.lookAt(-8, 13, 0); }
    else if (view === 'base') { cam.position.set(0, 14.4, -40); cam.lookAt(0, 11, 0); }
    else { const a = t * 0.1; cam.position.set(Math.sin(a) * 45, 24, Math.cos(a) * 45); cam.lookAt(0, 8, 0); }
    engine.render();
    (window as unknown as { __stats: unknown }).__stats = { calls: engine.renderer.info.render.calls, tris: engine.renderer.info.render.triangles };
    requestAnimationFrame(loop);
  };
  loop();
  void THREE;
}

boot().catch((e) => { console.error(e); document.querySelector('.ld-msg')!.textContent = 'Gagal memuat: ' + e; });
