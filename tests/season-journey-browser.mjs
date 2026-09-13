// Integration acceptance: real main.js + JourneyWorld WebGL2 + AudioContext.
// The default server serves an isolated production build and has no CLI.
// Dice entropy and /api/** are
// intercepted; outside HTTP and WebSocket requests are blocked in every context.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs/promises';
import { newGame, land, choose, advance, previewChoice, snapshot, restore } from '../src/engine.js';
import { LIFE_CHAPTERS } from '../src/season-chapters.js';
import { JOURNEY_STORAGE_KEY } from '../src/journey-storage.js';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'C:/Users/25293/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = fileURLToPath(new URL('../', import.meta.url));
const requestedBase = process.env.TEST_BASE_URL ? new URL(process.env.TEST_BASE_URL) : null;
if (requestedBase) {
  assert(['http:', 'https:'].includes(requestedBase.protocol)
    && ['127.0.0.1', 'localhost', '[::1]'].includes(requestedBase.hostname)
    && !requestedBase.username && !requestedBase.password,
  'TEST_BASE_URL must be an HTTP(S) localhost URL without credentials.');
}
let base, origin, server, browser;
let serverError, serverLog = '';
const output = new URL('../test-results/', import.meta.url);
await fs.mkdir(output, { recursive: true });
const errors = [];
const apiRequests = [];
const outsideRequests = [];
const checks = [];
const rendererChecks = [];

async function startLocalServer() {
  await fs.access(new URL('../dist/index.html', import.meta.url));
  const probe = createServer();
  await new Promise((resolve, reject) => { probe.once('error', reject); probe.listen(0, '127.0.0.1', resolve); });
  const port = probe.address().port;
  await new Promise((resolve, reject) => probe.close((error) => error ? reject(error) : resolve()));
  const disabledCli = fileURLToPath(new URL('../__disabled_season_browser_cli__/zhihu-cli.exe', import.meta.url));
  await assert.rejects(fs.access(disabledCli), { code: 'ENOENT' }, 'The browser-test CLI path must not exist.');
  server = spawn(process.execPath, ['server.mjs', '--production'], {
    cwd: root, env: { ...process.env, PORT: String(port), ZHIHU_CLI_PATH: disabledCli },
    windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.on('error', (error) => { serverError = error; });
  for (const stream of [server.stdout, server.stderr]) {
    stream.on('data', (data) => { serverLog = `${serverLog}${data}`.slice(-12000); });
  }
  const address = `http://127.0.0.1:${port}`;
  for (let attempt = 0; attempt < 80; attempt++) {
    if (serverError) throw serverError;
    if (server.exitCode !== null) throw new Error(`Isolated server exited (${server.exitCode}): ${serverLog}`);
    try {
      if ((await fetch(address, { redirect: 'error', signal: AbortSignal.timeout(1000) })).ok) return address;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 125));
  }
  throw new Error(`Isolated server did not become ready: ${serverLog}`);
}

async function assertWebGL(page) {
  await page.waitForFunction(() => {
    const scene = document.querySelector('#scene');
    return scene?.dataset.renderer && scene.dataset.assets !== 'loading';
  }, null, { timeout: 20000 });
  const actual = await page.locator('#scene').evaluate((scene) => {
    const canvases = [...scene.querySelectorAll('canvas')];
    const canvas = canvases[0];
    const gl = canvas?.getContext('webgl2');
    return {
      renderer: scene.dataset.renderer, assets: scene.dataset.assets, scenery: scene.dataset.scenery,
      landmarks: (scene.dataset.landmarks || '').split(',').filter(Boolean).sort(),
      canvases: canvases.length,
      webgl2: typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext,
      contextLost: gl?.isContextLost() ?? null,
      drawingBuffer: gl ? [gl.drawingBufferWidth, gl.drawingBufferHeight] : [],
    };
  });
  assert.equal(actual.renderer, 'webgl', JSON.stringify(actual));
  assert.equal(actual.assets, 'ready', JSON.stringify(actual));
  assert.equal(actual.scenery, 'procedural-3d', JSON.stringify(actual));
  assert.deepEqual(actual.landmarks, ['bookstall', 'library', 'stadium', 'village']);
  assert.equal(actual.canvases, 1);
  assert.equal(actual.webgl2, true, 'The real main.js scene canvas must own a WebGL2 context.');
  assert.equal(actual.contextLost, false);
  assert(actual.drawingBuffer.every((dimension) => dimension > 0));
  rendererChecks.push(actual);
}

function readyAt(position, mode = 'full') {
  let state = newGame(mode, { name: '四季联动测试', talent: 'optimistic' });
  while (state.position < position) {
    const pending = land(state, Math.min(6, position - state.position));
    const option = pending.active.options.map((_, index) => ({ index, result: previewChoice(pending, pending.active.options[index]) }))
      .filter(({ result }) => !result.disabled)
      .sort((a, b) => b.result.mood - a.result.mood || b.result.money - a.result.money)[0];
    assert(option, 'Fixture must retain an affordable choice.');
    state = advance(choose(pending, option.index));
    assert(state.phase === 'ready' || state.phase === 'finished', 'Use valid engine transitions only.');
    if (state.phase === 'finished') break;
  }
  assert.equal(state.position, position);
  assert(restore(snapshot(state)), 'Snapshot must replay through the production engine.');
  return state;
}
async function fresh({ state, music = 'on' } = {}) {
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== origin && !['data:', 'blob:'].includes(url.protocol)) {
      outsideRequests.push(url.href);
      return route.abort();
    }
    if (url.pathname.startsWith('/api/')) {
      apiRequests.push({ method: route.request().method(), path: url.pathname });
      return route.fulfill({ json: { mode: 'fallback', text: '集成测试预设回顾，不调用真实模型。', available: false, items: [] } });
    }
    return route.continue();
  });
  await context.routeWebSocket('**/*', (socket) => {
    const url = new URL(socket.url());
    const httpOrigin = `${url.protocol === 'wss:' ? 'https:' : 'http:'}//${url.host}`;
    if (httpOrigin !== origin) {
      outsideRequests.push(url.href);
      return socket.close();
    }
    return socket.connectToServer();
  });
  await context.addInitScript(() => {
    localStorage.setItem('four-seasons-auto-depart', 'off');
    const original = crypto.getRandomValues.bind(crypto);
    crypto.getRandomValues = (array) => {
      if (window.__fixedDie && array instanceof Uint32Array && array.length === 1) {
        array[0] = window.__fixedDie === 1 ? 0 : 0xffffffff;
        return array;
      }
      return original(array);
    };
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(base, { waitUntil: 'networkidle' });
  // The app is still at welcome (no state), so beforeunload cannot overwrite this fixture.
  await page.evaluate(({ state, music, key }) => {
    localStorage.setItem('four-seasons-music', music);
    if (state) localStorage.setItem(key, JSON.stringify({ game: state, seconds: 12 }));
  }, { state: state ? snapshot(state) : null, music, key: JOURNEY_STORAGE_KEY });
  await page.reload({ waitUntil: 'networkidle' });
  await assertWebGL(page);
  if (state) {
    await page.locator('#resume').click();
    await page.waitForFunction(() => document.querySelector('.experience').dataset.stage !== 'welcome');
  }
  return { context, page };
}
async function musicPlaying(page, playing, season) {
  try { await page.waitForFunction(({ playing, season }) => {
    const button = document.querySelector('#sound-button');
    return button.dataset.playing === String(playing) && (season === undefined || button.dataset.season === String(season));
  }, { playing, season }, { timeout: 6000 }); } catch (error) {
    const diagnostic = await page.evaluate(() => ({ stage: document.querySelector('.experience').dataset.stage,
      music: { ...document.querySelector('#sound-button').dataset }, label: document.querySelector('#season-music-label').textContent,
      chapter: document.querySelector('.season-chapter')?.dataset.season, portrait: matchMedia('(orientation: portrait)').matches,
      hidden: document.hidden, dialog: document.querySelector('#dialog').open }));
    console.error('Music integration diagnostic:', JSON.stringify(diagnostic));
    throw error;
  }
}
async function assertChapter(page, season, { enabled = true, screenshot = false, pauseProbe = false } = {}) {
  const chapter = page.locator(`.season-chapter[data-season="${season}"]`);
  await chapter.waitFor({ state: 'visible', timeout: 10000 });
  assert.equal(await chapter.locator('.chapter-title').innerText(), LIFE_CHAPTERS[season].stage);
  assert.equal(await page.locator('[data-choice]').count(), 0, 'Choices must not appear over the chapter transition.');
  await musicPlaying(page, enabled, season);
  assert.equal(await page.locator('#life-season').getAttribute('data-season'), String(season));
  assert.equal(await page.locator('#life-stage-name').textContent(), LIFE_CHAPTERS[season].stage);
  assert.equal(await page.locator('#sound-button').getAttribute('data-enabled'), String(enabled));
  assert.equal(await chapter.getAttribute('data-weather'), LIFE_CHAPTERS[season].weather);
  if (screenshot) await page.screenshot({ path: fileURLToPath(new URL(`season-journey-chapter-${season}.png`, output)) });
  if (pauseProbe) {
    await page.setViewportSize({ width: 700, height: 1000 });
    await page.locator('#orientation-gate').waitFor({ state: 'visible' });
    await musicPlaying(page, false, season);
    await page.waitForTimeout(3200);
    assert.equal(await chapter.count(), 1, 'The 3-second chapter must not expire while portrait-paused.');
    assert.equal(await page.locator('[data-choice]').count(), 0);
    await page.setViewportSize({ width: 1600, height: 900 });
    await page.locator('#orientation-gate').waitFor({ state: 'hidden' });
    await musicPlaying(page, enabled, season);
  }
  await chapter.locator('.chapter-continue').click();
}
async function checkBlindOptions(page) {
  await page.locator('#event-heading').waitFor({ state: 'visible', timeout: 12000 });
  assert.equal(await page.locator('[data-choice]').count(), 3);
  assert.equal(await page.locator('.choice-effects,.condition-note').count(), 0);
  assert.doesNotMatch(await page.locator('.options').innerText(), /[+−-]\s*\d|(?:资金|情绪|专业)\s*[+−-]?\s*\d/);
  assert.equal(await page.locator('#season-chapter').isVisible(), false);
}
async function depart(page, die = 1) {
  await page.evaluate((die) => { window.__fixedDie = die; }, die);
  await page.locator('#continue-travel').click();
}

try {
  base = requestedBase ? requestedBase.href : await startLocalServer();
  origin = new URL(base).origin;
  browser = await chromium.launch({ channel: 'chrome', headless: true,
    args: ['--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  // A genuine new game presents spring first; modal/portrait pause the actual soundtrack.
  {
    const { context, page } = await fresh();
    await page.locator('#start-full').click();
    await assertChapter(page, 0, { screenshot: true, pauseProbe: true });
    await page.locator('.experience[data-stage="ready"]').waitFor();
    await musicPlaying(page, true, 0);
    await page.locator('#rules-button').click();
    await musicPlaying(page, false, 0);
    assert.equal(await page.locator('#dialog').getAttribute('open'), '');
    await page.locator('#dialog-close').click();
    await musicPlaying(page, true, 0);
    await page.setViewportSize({ width: 700, height: 1000 });
    await page.locator('#orientation-gate').waitFor({ state: 'visible' });
    await musicPlaying(page, false, 0);
    await page.setViewportSize({ width: 1600, height: 900 });
    await page.locator('#orientation-gate').waitFor({ state: 'hidden' });
    await musicPlaying(page, true, 0);
    await context.close();
    checks.push('real JourneyWorld WebGL2 new-game spring chapter + modal/portrait audio pause/resume');
  }

  // Restore three replay-valid snapshots just before the 10/20/30 boundaries.
  for (const [position, nextSeason] of [[9, 1], [19, 2], [29, 3]]) {
    const state = readyAt(position);
    const { context, page } = await fresh({ state });
    await musicPlaying(page, true, nextSeason - 1);
    await depart(page);
    await assertChapter(page, nextSeason, { screenshot: true });
    await checkBlindOptions(page);
    assert.equal(await page.locator('#scene').getAttribute('data-weather'), LIFE_CHAPTERS[nextSeason].weather);
    assert.equal(await page.locator('#scene').getAttribute('data-season'), String(nextSeason));
    assert.equal(await page.locator('#life-season').getAttribute('data-season'), String(nextSeason));
    await musicPlaying(page, true, nextSeason);
    // Pending landing must not count as an experienced, settled source-book page.
    await page.locator('#journal-button').click();
    const actualSources = await page.locator('.source-book-entry').evaluateAll((nodes) => nodes.map((node) => node.dataset.sourceId).sort());
    const expectedSources = [...new Set(state.history.flatMap((record) => record.sources))].sort();
    assert.deepEqual(actualSources, expectedSources);
    await page.locator('#dialog-close').click();
    await page.screenshot({ path: fileURLToPath(new URL(`season-journey-event-${nextSeason}.png`, output)) });
    await context.close();
    checks.push(`real full route boundary ${position + 1}→${position + 2}: chapter/music/weather ${LIFE_CHAPTERS[nextSeason].name}, 3 blind options, settled-only sources`);
  }

  // Six fair-die steps on the shorter route can cross two life stages: show both in order.
  {
    const { context, page } = await fresh({ state: readyAt(2, 'demo') });
    await depart(page, 6);
    await assertChapter(page, 1);
    await assertChapter(page, 2);
    await checkBlindOptions(page);
    assert.equal(await page.locator('#scene').getAttribute('data-weather'), 'leaves');
    await musicPlaying(page, true, 2);
    await context.close();
    checks.push('real demo route 6-point roll crosses summer then autumn in order before choices');
  }

  // Muting is a real user click and must survive both chapter switching and reload.
  {
    const { context, page } = await fresh({ state: readyAt(9) });
    await musicPlaying(page, true, 0);
    await page.locator('#sound-button').click();
    await musicPlaying(page, false, 0);
    assert.equal(await page.locator('#sound-button').getAttribute('data-enabled'), 'false');
    await depart(page);
    await assertChapter(page, 1, { enabled: false });
    await checkBlindOptions(page);
    assert.equal(await page.evaluate(() => localStorage.getItem('four-seasons-music')), 'off');
    await page.reload({ waitUntil: 'networkidle' });
    await assertWebGL(page);
    await page.locator('#resume').click();
    await checkBlindOptions(page);
    await musicPlaying(page, false, 1);
    assert.equal(await page.locator('#sound-button').getAttribute('data-enabled'), 'false');
    await context.close();
    checks.push('user mute remains disabled across season change and persisted reload/resume');
  }

  // Ending report is based only on actual replayed history, with duplicate references collapsed.
  {
    const finished = readyAt(39);
    assert.equal(finished.phase, 'finished');
    const expected = [...new Set(finished.history.flatMap((record) => record.sources))].sort();
    assert(finished.history.flatMap((record) => record.sources).length > expected.length, 'Fixture must exercise duplicate source removal.');
    const { context, page } = await fresh({ state: finished });
    await page.locator('#dialog.report-dialog[open]').waitFor();
    await musicPlaying(page, false, 3);
    const actual = await page.locator('.source-book-entry').evaluateAll((nodes) => nodes.map((node) => node.dataset.sourceId).sort());
    assert.deepEqual(actual, expected);
    assert.equal(new Set(actual).size, actual.length);
    assert.match(await page.locator('.journey-source-book > summary').innerText(), new RegExp(`${expected.length} 篇`));
    await page.locator('.journey-source-book > summary').click();
    await page.screenshot({ path: fileURLToPath(new URL('season-journey-report-sources.png', output)) });
    await page.locator('#dialog-close').click();
    await musicPlaying(page, false, 3);
    await context.close();
    checks.push('finished report and closed-report state stay silent; source book exactly equals deduplicated settled history');
  }
  assert.deepEqual(errors, [], 'No uncaught browser errors.');
  assert.deepEqual(outsideRequests, [], 'No outside browser requests.');
  const report = { passed: true, world: 'real JourneyWorld WebGL2 in every group; reduced-motion only', checks,
    server: { base, isolated: !requestedBase, cliDisabled: !requestedBase, mode: requestedBase ? 'external-localhost' : 'production' }, rendererChecks,
    apiRequestsIntercepted: apiRequests, outsideRequestsBlocked: outsideRequests, browserErrors: errors,
    billing: 'All /api/** requests fulfilled locally; no real CLI or model requests. Outside HTTP/WebSocket traffic blocked.', screenshots: 'season-journey-*.png' };
  await fs.writeFile(new URL('season-journey-browser.json', output), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
} finally {
  try { await browser?.close(); }
  finally {
    if (server && server.exitCode === null && server.signalCode === null) {
      await new Promise((resolve) => {
        const timeout = setTimeout(resolve, 3000);
        server.once('exit', () => { clearTimeout(timeout); resolve(); });
        server.kill();
      });
    }
  }
}
