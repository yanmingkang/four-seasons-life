// Isolated real JourneyWorld visual QA; no main.js and no narration API calls.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'C:/Users/25293/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const out = new URL('../test-results/', import.meta.url); await fs.mkdir(out, { recursive: true });
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:4173';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const apiRequests = [];
  await page.route('**/api/**', route => { apiRequests.push(new URL(route.request().url()).pathname);return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'API blocked in isolated dice integration test'})}); });
  await page.goto(`${base}/src/dice.js`);
  await page.setContent('<html><head><style>body{margin:0;background:#d7e0d4}#scene{position:absolute;inset:0}.world-label,.world-location{display:none}#caption{position:fixed;left:32px;top:24px;z-index:3;color:#fff;background:#173e36e6;padding:12px 18px;border-radius:9px;font:16px system-ui;pointer-events:none}</style></head><body><div id="scene"></div><div id="caption">3D 掷骰集成检查</div></body></html>');
  await page.evaluate(async () => {
    const { JourneyWorld } = await import('/src/journey-world.js');
    const { newGame } = await import('/src/engine.js');
    const { upwardFace } = await import('/src/dice.js');
    const world = new JourneyWorld(document.querySelector('#scene'), () => {});
    await world.ready; const initial=newGame('full'); world.setState(initial); world.renderer.setAnimationLoop(null);
    const callbacks = new Map(); let serial = 0;
    window.requestAnimationFrame = callback => { const id = ++serial; callbacks.set(id, callback); return id; };
    window.cancelAnimationFrame = id => callbacks.delete(id);
    const qa = window.diceQA = { world, callbacks, upwardFace, elapsed: 0, stages: [], done: false, rows: [], initial:{total:initial.total,money:initial.money,mood:initial.mood,exp:initial.exp} };
    document.querySelector('#scene').addEventListener('worldstage', event => qa.stages.push(event.detail.stage));
    qa.pending = world.throwDice(5).then(() => { qa.done = true; });
    await Promise.resolve(); await Promise.resolve();
    qa.began = performance.now();
    qa.advanceTo = target => {
      const render = world.renderer.render.bind(world.renderer); world.renderer.render = () => {};
      try {
        while (qa.elapsed < target) {
          qa.elapsed = Math.min(target, qa.elapsed + 1000 / 60);
          const now = qa.began + qa.elapsed;
          const queued = [...callbacks.values()]; callbacks.clear(); queued.forEach(callback => callback(now));
          world.frame(now);
        }
      } finally { world.renderer.render = render; }
      render(world.scene, world.camera);
      const point = world.dice.mesh.position.clone().project(world.camera);
      const row = { elapsed: Math.round(qa.elapsed), phase: world.dice.mesh.userData.phase, dieScreen: { x: point.x, y: point.y, z: point.z }, value: world.dice.mesh.userData.value, actual: upwardFace(world.dice.mesh.quaternion), inFrame: Math.abs(point.x) < 1 && Math.abs(point.y) < 1 && point.z < 1 };
      qa.rows.push(row); document.querySelector('#caption').textContent = `${row.phase} · ${Math.round(qa.elapsed)} ms`;
      return row;
    };
  });
  const rows = [];
  for (const [phase, elapsed] of [['windup', 450], ['flight', 1400], ['bounce', 2090], ['settled', 3200]]) {
    rows.push(await page.evaluate(time => window.diceQA.advanceTo(time), elapsed));
    await page.screenshot({ path: fileURLToPath(new URL(`dice-integrated-${phase}.png`, out)) });
  }
  const result = await page.evaluate(async () => {
    const qa = window.diceQA; qa.advanceTo(3800); await qa.pending;
    const actor = qa.world.character, fixed = [];
    for (let value = 1; value <= 6; value++) {
      await qa.world.dice.throw({ actor, value, heading: qa.world.heading, reduceMotion: true });
      fixed.push({ requested: value, actual: qa.upwardFace(qa.world.dice.mesh.quaternion) });
    }
    const result = { stages: qa.stages, models: qa.world.container.dataset.loadedModels, fixed, framesRemaining: qa.callbacks.size, initial:qa.initial };
    qa.world.dispose(); return result;
  });
  for (const row of rows) assert.ok(row.inFrame, `${row.phase} die left camera frame: ${JSON.stringify(row.dieScreen)}`);
  for (const { requested, actual } of result.fixed) assert.equal(requested, actual);
  assert.deepEqual(result.initial,{total:40,money:5000,mood:100,exp:10});
  assert.equal(result.framesRemaining, 0); assert.deepEqual(apiRequests, []); assert.deepEqual(errors, []);
  console.log(JSON.stringify({ ...result, rows, pageErrors: errors }, null, 2));
} finally { await browser.close(); }
