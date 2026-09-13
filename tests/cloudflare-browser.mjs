// Cloudflare Worker remote acceptance. TEST_BASE_URL is required.
// Browser API calls never reach the server: requests are intercepted with
// deterministic fixtures; Node only performs GET /api/health and static GETs.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs/promises';
import path from 'node:path';
import { newGame, snapshot } from '../src/engine.js';
import { METHOD_STORAGE_KEY } from '../src/method-cards.js';

if (!process.env.TEST_BASE_URL) throw new Error('TEST_BASE_URL is required, e.g. https://your-worker.workers.dev');
const target = new URL(process.env.TEST_BASE_URL);
assert.ok(['https:', 'http:'].includes(target.protocol), 'TEST_BASE_URL must be an HTTP(S) URL');
assert.ok(!target.username && !target.password && !target.search && !target.hash && target.pathname === '/', 'Use the Worker origin without credentials, a path, or query parameters');
const base = target.origin;
const root = fileURLToPath(new URL('../', import.meta.url));
const out = path.join(root, 'test-results');
await fs.mkdir(out, { recursive: true });
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'C:/Users/25293/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

const report = {
  base,
  passed: false,
  health: null,
  static: [],
  sample: null,
  journey: null,
  landscape: null,
  apiRequests: [],
  blockedRequests: [],
  officialModelCalls: 0,
  pageErrors: [],
  assetErrors: [],
};

async function getJson(url) {
  const response = await fetch(url, { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(30000) });
  assert.ok(response.status >= 200 && response.status < 400, `${url} returned ${response.status}`);
  return { response, body: await response.json() };
}

// Worker availability and static delivery are checked against the real URL.
async function checkDeployment() {
  const { response, body } = await getJson(`${base}/api/health`);
  assert.equal(response.status, 200);
  assert.ok(body && typeof body === 'object');
  report.health = { status: response.status, body };
  const home = await fetch(`${base}/`, { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(30000) });
  assert.equal(home.status, 200);
  const html = await home.text();
  assert.match(html, /<html/i);
  report.static.push({ path: '/', status: home.status, type: home.headers.get('content-type') });
  const script = html.match(/(?:src|href)="(\/assets\/[^" ]+\.js)"/i)?.[1];
  assert.ok(script, 'Production entry must reference a built JavaScript asset');
  for (const assetPath of [script, '/art/life-landmarks-v1.png', '/characters/idle.gif']) {
    const asset = await fetch(`${base}${assetPath}`, { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(30000) });
    assert.equal(asset.status, 200, `${assetPath} static asset`);
    assert.ok((await asset.arrayBuffer()).byteLength > 0);
    report.static.push({ path: assetPath, status: asset.status, type: asset.headers.get('content-type') });
  }
}

let browser;
const contexts = [];
const storageKey = 'four-seasons-life-v4';
const original = JSON.stringify({ game: snapshot(newGame('full', { name: '原旅程保留验收' })), seconds: 63 });

function practiceFixture(input) {
  const turn = input.turn;
  assert.ok(turn === 1 || turn === 2, 'Practice must send turn 1 or 2');
  assert.deepEqual(input.sample, { id: 'cross-team-v1', choice: 0 });
  assert.equal(Object.hasOwn(input, 'game'), false, 'Sample must not send the existing journey');
  return {
    mode: 'live', model: 'zhida-fast-1p5', sessionId: 'cloudflare-test-session-000000000000',
    turn, done: turn === 2,
    npc: turn === 1 ? '先把一条可核对的记录说清楚，我们再约定下一步。' : '很好，我们把责任人与时间点一起写下来。',
    ...(turn === 2 ? { tip: '先指出一条可以核对的记录，再约定下次共同确认的时间。' } : {}),
  };
}

async function setup(width, height) {
  const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce', serviceWorkers: 'block' });
  contexts.push(context);
  await context.addInitScript(({ storageKey, original }) => {
    // Seed exactly once per fresh isolated context; reload must use the actual
    // saved progress and method cards, never a newly injected fixture.
    if (localStorage.getItem('cloudflare-qa-initialized')) return;
    localStorage.setItem('cloudflare-qa-initialized', 'yes');
    localStorage.setItem(storageKey, original);
    localStorage.setItem('four-seasons-auto-depart', 'off');
    localStorage.setItem('four-seasons-music', 'off');
  }, { storageKey, original });
  await context.route('**/*', route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== base || request.method() !== 'GET') {
      report.blockedRequests.push({ method: request.method(), origin: url.origin, path: url.pathname });
      return route.abort();
    }
    return route.continue();
  });
  await context.route('**/api/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    report.apiRequests.push({ method: request.method(), path: url.pathname });
    if (url.pathname === '/api/practice') return route.fulfill({ status: 200, json: practiceFixture(request.postDataJSON() || {}) });
    if (url.pathname === '/api/narrate') return route.fulfill({ status: 200, json: { mode: 'live', model: 'zhida-fast-1p5', text: '模拟的知乎直答回响，不调用真实模型。' } });
    if (url.pathname === '/api/experience') return route.fulfill({ status: 200, json: { mode: 'curated', items: [] } });
    return route.fulfill({ status: 200, json: { configured: false, mode: 'test', ok: true } });
  });
  const page = await context.newPage();
  page.on('pageerror', error => report.pageErrors.push(error.message));
  const isAsset = value => /\/(?:assets|art|characters|cinematics)\//.test(new URL(value).pathname);
  page.on('requestfailed', request => { if (isAsset(request.url())) report.assetErrors.push({ path: new URL(request.url()).pathname, error: request.failure()?.errorText }); });
  page.on('response', response => { if (isAsset(response.url()) && !response.ok()) report.assetErrors.push({ path: new URL(response.url()).pathname, status: response.status() }); });
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.locator('#scene').waitFor();
  await page.locator('#scene[data-renderer="webgl"][data-assets="ready"]').waitFor({ timeout: 30000 });
  await page.locator('#start-sample').waitFor();
  return { context, page };
}

try {
  await checkDeployment();
  browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  // Desktop: verify the actual procedural 3D scene, then complete the two-turn
  // sample and collect its method card in local storage.
  {
    const { context, page } = await setup(1440, 900);
    const scene = await page.locator('#scene').evaluate(node => ({ ...node.dataset }));
    assert.equal(scene.renderer, 'webgl');
    assert.equal(scene.assets, 'ready');
    assert.equal(scene.scenery, 'procedural-3d');
    assert.equal(scene.mascot, 'liukanshan-procedural-3d');
    assert.equal(Number(scene.routeLength), 40);
    assert.deepEqual(scene.landmarks.split(',').sort(), ['bookstall', 'library', 'stadium', 'village', ...Array.from({ length: 37 }, (_, i) => `reference-cell-${String(i + 4).padStart(2, '0')}`)].sort());
    assert.equal(await page.locator('#scene canvas').count(), 1);
    const canvas = await page.locator('#scene canvas').evaluate(node => ({
      width: node.width, height: node.height,
      webgl2: node.getContext('webgl2') instanceof WebGL2RenderingContext,
      pixelated: node.style.imageRendering === 'pixelated', contextLost: node.getContext('webgl2').isContextLost(),
    }));
    assert.ok(canvas.width > 0 && canvas.height > 0 && canvas.webgl2);
    assert.equal(canvas.contextLost, false);
    await page.screenshot({ path: path.join(out, 'cloudflare-3d-desktop.png') });

    await page.locator('#preview-town').click();
    assert.equal(await page.locator('[data-town-season]').count(), 4);
    assert.equal(await page.locator('[data-visit-cell]').count(), 10);
    assert.equal(await page.locator('.legacy-landmarks,.town-card').count(), 0);
    assert.equal(await page.locator('#view-character-reference').isVisible(), true);
    await page.locator('[data-town-season="0"]').click();
    await page.locator('[data-visit-cell="1"]').click();
    assert.equal(await page.locator('#dialog-content h2').innerText(), '大学图书馆');
    await page.locator('#scene-on-map').click();
    await page.locator('#scene[data-camera-mode="landmark"][data-focused-landmark="library"]').waitFor();
    await page.screenshot({ path: path.join(out, 'cloudflare-3d-library.png') });
    await page.locator('#town-return').click();
    await page.locator('#start-sample').click();
    await page.locator('[data-sample-stage="choice"]').waitFor({ timeout: 30000 });
    assert.equal(await page.locator('[data-choice]').count(), 3);
    await page.locator('[data-choice="0"]').click();
    await page.locator('#sample-practice').click();
    for (let turn = 1; turn <= 2; turn++) {
      await page.locator('#practice-message').fill('先共同核对一条记录，再约定下一步。');
      await page.locator('.practice-form [type="submit"]').click();
      await page.locator('.practice-round').filter({ hasText: turn === 1 ? '第 2 / 2 轮' : '练习完成' }).waitFor({ timeout: 15000 });
    }
    assert.equal(await page.locator('.practice-status').count(), 1);
    await page.locator('.practice-exit').click();
    await page.locator('[data-sample-stage="lesson"]').waitFor();
    await page.locator('#sample-collect').click();
    const cards = await page.evaluate(key => JSON.parse(localStorage.getItem(key) || '[]'), METHOD_STORAGE_KEY);
    assert.equal(cards.length, 1);
    assert.match(cards[0].tip, /记录|确认/);
    assert.equal(cards[0].mode, 'live');
    assert.equal(cards[0].turns, 2);
    assert.doesNotMatch(JSON.stringify(cards), /sessionId|clientId|rows|draft|先共同核对/);
    assert.equal(await page.evaluate(key => localStorage.getItem(key), storageKey), original);
    assert.equal(report.apiRequests.filter(request => request.path === '/api/practice').length, 2);
    await page.screenshot({ path: path.join(out, 'cloudflare-sample-method.png') });
    await page.locator('#sample-home').click();
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('#method-notebook').click();
    assert.equal(await page.locator('.method-card').count(), 1);
    assert.equal(await page.evaluate(key => localStorage.getItem(key), storageKey), original);
    report.sample = { stage: 'lesson', choices: 3, turns: 2, methodCards: cards.length, retainedAfterReload: true, existingJourneyUnchanged: true };
    await context.close();
  }

  // Desktop journey: start a demo with automatic departure disabled, make one
  // real choice, reload, and resume from the saved v4 slot.
  {
    const { context, page } = await setup(1440, 900);
    await page.locator('#character-name').fill('Cloudflare 验收旅人');
    await page.locator('label:has(input[value="ambitious"])').click();
    await page.locator('#start-demo').click();
    await page.locator('#continue-travel').waitFor({ state: 'visible', timeout: 60000 });
    await page.locator('#continue-travel').click();
    await page.locator('.experience[data-stage="choice"]').waitFor({ timeout: 30000 });
    assert.equal(await page.locator('[data-choice]').count(), 3);
    await page.locator('[data-choice="0"]').click();
    await page.locator('#next-button').waitFor({ timeout: 30000 });
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('four-seasons-life-v4') || 'null'));
    assert.ok(saved?.game?.version === 4 && saved.game.phase === 'feedback');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('#resume').waitFor({ timeout: 15000 });
    await page.locator('#resume').click();
    await page.locator('#next-button').waitFor({ timeout: 30000 });
    assert.equal(await page.locator('#player-name').textContent(), 'Cloudflare 验收旅人');
    assert.deepEqual(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).game, storageKey), saved.game);
    await page.screenshot({ path: path.join(out, 'cloudflare-save-resume.png') });
    report.journey = { renderer: 'webgl', choices: 3, savedVersion: saved.game.version, resumed: true };
    await context.close();
  }

  // Narrow landscape viewport: controls and 3D canvas remain inside the view.
  {
    const { context, page } = await setup(844, 390);
    assert.equal(await page.locator('#orientation-gate').isVisible(), false);
    const box = await page.locator('#scene canvas').boundingBox();
    assert.ok(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= 845 && box.y + box.height <= 391);
    await page.screenshot({ path: path.join(out, 'cloudflare-landscape.png') });
    await page.locator('#start-sample').click();
    await page.locator('[data-choice="1"]').click();
    await page.locator('#sample-skip').click();
    await page.locator('#sample-collect').scrollIntoViewIfNeeded();
    await page.locator('#sample-collect').click();
    const dialog = await page.locator('#dialog').boundingBox();
    assert.ok(dialog && dialog.x >= 0 && dialog.y >= 0 && dialog.x + dialog.width <= 845 && dialog.y + dialog.height <= 391);
    await page.screenshot({ path: path.join(out, 'cloudflare-landscape-method.png') });
    report.landscape = { width: 844, height: 390, canvas: box, dialog, methodCollected: true };
    await context.close();
  }

  assert.deepEqual(report.pageErrors, []);
  assert.deepEqual(report.assetErrors, []);
  assert.deepEqual(report.blockedRequests, []);
  report.passed = true;
  await fs.writeFile(path.join(out, 'cloudflare-browser.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  report.failure = error.message;
  await fs.writeFile(path.join(out, 'cloudflare-browser.json'), JSON.stringify(report, null, 2));
  throw error;
} finally {
  for (const context of contexts) await context.close().catch(() => {});
  await browser?.close();
}
