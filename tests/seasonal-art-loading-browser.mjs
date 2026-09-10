// Isolated real-Canvas regression: delayed local PNG bytes, no application APIs.
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = fileURLToPath(new URL('../', import.meta.url)), out = path.join(root, 'test-results');
const report = { passed: false, officialApiCalls: 0, blockedApiRequests: [], pageErrors: [], cases: [] };
let browser, server, fault;
try {
  await fs.mkdir(out, { recursive: true });
  const atlas = await fs.readFile(path.join(root, 'public', 'art', 'season-trees-v2.png'));
  server = http.createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; img-src 'self'; style-src 'self' 'unsafe-inline'");
    try {
      const pathname = new URL(req.url, 'http://fixture').pathname;
      if (pathname.startsWith('/api/')) { report.blockedApiRequests.push(pathname); res.writeHead(503); res.end(); return; }
      if (pathname === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<!doctype html><meta charset="utf-8"><style>body{margin:0}#world{width:100vw;height:100vh;position:relative}.world-location{display:none}</style><div id="world"></div><dialog id="dialog"></dialog>'); return;
      }
      if (pathname === '/art/season-trees-v2.png') {
        const active = fault; if (active) active.requests++;
        if (active?.kind === 'hold') await active.gate;
        if (active?.kind === 'error') { res.writeHead(404); res.end(); return; }
        if (!res.destroyed) { res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': atlas.length }); res.end(atlas); }
        return;
      }
      if (/^\/src\/[a-z\d-]+\.js$/.test(pathname)) {
        const source = await fs.readFile(path.join(root, pathname));
        res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' }); res.end(source); return;
      }
      res.writeHead(404); res.end();
    } catch { if (!res.headersSent) res.writeHead(500); res.end(); }
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const port = server.address().port;
  assert.ok(![4173, 4174, 4175, 20491].includes(port));
  const base = `http://127.0.0.1:${port}`;
  const require = createRequire(import.meta.url);
  const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'C:/Users/25293/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const hold = () => {
    let release; const gate = new Promise(resolve => { release = resolve; });
    fault = { kind: 'hold', gate, release, requests: 0 }; return fault;
  };
  async function mount() {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    const page = await context.newPage(); page.setDefaultTimeout(10000);
    page.on('pageerror', error => report.pageErrors.push(error.message));
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.evaluate(async () => {
      const { PixelWorld } = await import('/src/pixel-world.js');
      const { newGame } = await import('/src/engine.js');
      const began = performance.now();
      window.world = new PixelWorld(document.querySelector('#world'));
      world.setState(newGame('full')); world.setCameraMode('overview');
      window.readyResult = world.ready.then(result => ({ result, elapsedMs: Math.round(performance.now() - began) }));
      window.canvasHash = () => {
        world.draw(); let hash = 2166136261;
        for (const value of world.ctx.getImageData(0, 0, world.width, world.height).data) hash = Math.imul(hash ^ value, 16777619);
        return hash >>> 0;
      };
    });
    return { context, page };
  }
  {
    const pending = hold(), { context, page } = await mount();
    try {
      const initial = await page.evaluate(() => readyResult);
      assert.ok(initial.elapsedMs >= 2900 && initial.elapsedMs < 4500, 'Readiness still falls back around three seconds');
      assert.ok(initial.result.failed >= 1, 'Initial fallback result honestly reports unavailable art');
      assert.equal(await page.locator('#world').getAttribute('data-tree-art'), 'code-fallback');
      assert.equal(await page.evaluate(() => world.art.objects.filter(object => object.kind === 'tree' && object.generatedArt).length), 0);
      assert.ok(pending.requests >= 1);
      const before = await page.evaluate(() => ({ hash: canvasHash(), route: world.route.stations.map(p => [p.x, p.y]) }));
      await page.screenshot({ path: path.join(out, 'seasonal-art-late-before.png') });
      pending.release();
      await page.locator('#world[data-tree-art="seasonal-sprites"]').waitFor();
      const after = await page.evaluate(() => ({
        hash: canvasHash(), route: world.route.stations.map(p => [p.x, p.y]),
        count: Number(world.container.dataset.treeSpriteCount),
        actualSprites: world.art.objects.filter(object => object.kind === 'tree' && object.generatedArt).length,
      }));
      assert.ok(after.count > 0); assert.equal(after.actualSprites, after.count);
      assert.notEqual(after.hash, before.hash, 'The actual canvas pixels change after successful late loading');
      assert.deepEqual(after.route, before.route, 'Enhancing scenery cannot change the walking route');
      assert.deepEqual(await page.evaluate(() => readyResult), initial, 'Already-resolved readiness keeps its original result');
      await page.screenshot({ path: path.join(out, 'seasonal-art-late-after.png') });
      report.cases.push({ name: 'late-success-upgrades-real-canvas', passed: true, initial, sprites: after.count, canvasChanged: true });
      await page.evaluate(() => world.dispose());
    } finally { pending.release(); await context.close(); }
  }
  {
    fault = { kind: 'error', requests: 0 };
    const { context, page } = await mount();
    try {
      const initial = await page.evaluate(() => readyResult);
      assert.equal(await page.locator('#world').getAttribute('data-tree-art'), 'code-fallback');
      assert.equal(await page.locator('#world').getAttribute('data-tree-sprite-count'), '0');
      assert.ok(initial.result.failed >= 1);
      assert.ok(await page.evaluate(() => canvasHash() > 0));
      report.cases.push({ name: 'image-error-preserves-rendered-fallback', passed: true, initial });
      await page.evaluate(() => world.dispose());
    } finally { await context.close(); }
  }
  for (const afterFallback of [false, true]) {
    const pending = hold(), { context, page } = await mount();
    try {
      if (afterFallback) await page.evaluate(() => readyResult);
      const disposed = await page.evaluate(() => {
        world.dispose(); world.dispose();
        return { dataset: { ...world.container.dataset }, count: world.art.objects.length, canvases: document.querySelectorAll('canvas').length, aborted: world.seasonTreesAbort.signal.aborted };
      });
      assert.equal(disposed.aborted, true); assert.equal(disposed.count, 0); assert.equal(disposed.canvases, 0);
      const initial = await page.evaluate(() => readyResult);
      if (!afterFallback) assert.equal(initial.result.loaded, 0);
      pending.release(); await page.waitForTimeout(250);
      assert.deepEqual(await page.evaluate(() => ({ dataset: { ...world.container.dataset }, count: world.art.objects.length, canvases: document.querySelectorAll('canvas').length, aborted: world.seasonTreesAbort.signal.aborted })), disposed);
      report.cases.push({ name: `dispose-${afterFallback ? 'after' : 'before'}-fallback-ignores-late-image`, passed: true });
    } finally { pending.release(); await context.close(); }
  }
  assert.deepEqual(report.pageErrors, []); assert.deepEqual(report.blockedApiRequests, []);
  report.passed = true;
} catch (error) { report.failure = error.stack || error.message; process.exitCode = 1; }
finally {
  fault?.release?.(); await browser?.close();
  if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  await fs.mkdir(out, { recursive: true });
  await fs.writeFile(path.join(out, 'seasonal-art-loading-browser.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
