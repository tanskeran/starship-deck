import { createHUD } from './ui.js';
import { createWorld } from './scene.js';

const hud = createHUD();
const canvas = document.getElementById('gl');

try {
  if (document.fonts && document.fonts.ready) await Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 800))]);
  const world = await createWorld(canvas, (p, label) => hud.bootProgress(p, label));
  window.__world = world;

  // 实测帧耗时，自动选择画质档位（也可用 ?q=0/1/2 强制指定）
  await hud.bootProgress(0.985, '性能校准 / PERFORMANCE CALIBRATION');
  const forced = new URLSearchParams(location.search).get('q');
  let qIndex;
  if (forced !== null && forced !== '') { qIndex = Math.max(0, Math.min(2, +forced || 0)); hud.setQualityLabel(world.setQuality(qIndex)); }
  else { const r = world.autoQuality(); qIndex = r.index; hud.setQualityLabel(r.name); }

  hud.onView = i => world.setView(i);
  hud.onQuality = () => world.setQuality(qIndex = (qIndex + 1) % 3);

  addEventListener('resize', () => world.resize(innerWidth, innerHeight));
  addEventListener('pointermove', e => world.pointer(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight * 2 - 1)));

  const tags = [];
  let last = performance.now(), t = 0;
  function loop(now) {
    requestAnimationFrame(loop);
    const dt = Math.min(.1, (now - last) / 1000); last = now; t += dt;
    world.render(dt, t);
    hud.tick(dt, t, world.project(tags));
  }

  world.setView(0, 3.6);
  await hud.bootDone();
  requestAnimationFrame(now => { last = now; loop(now); });
} catch (err) {
  console.error(err);
  hud.bootError('初始化失败 / INIT FAILED: ' + (err && err.message ? err.message : err));
}
