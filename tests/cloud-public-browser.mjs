// Public static/browser acceptance only. Business endpoints are intentionally
// intercepted with 503; the parent separately verifies real provider responses.
// Run only after publication is confirmed: node tests/cloud-public-browser.mjs [--pages] [--direct|--explicit-proxy]
// The fixed Pages candidate still requires project creation/ownership and
// deployment confirmation. Selecting --pages does not establish publication.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs/promises';
import { newGame, land, choose, advance, previewChoice, snapshot, restore } from '../src/engine.js';
import { JOURNEY_STORAGE_KEY } from '../src/journey-storage.js';

const flags = process.argv.slice(2);
assert.ok(flags.every(flag => ['--pages', '--direct', '--explicit-proxy'].includes(flag)) && new Set(flags).size === flags.length, 'Only approved target/network flags are accepted; arbitrary URLs are not allowed');
const usePages = flags.includes('--pages');
const direct = flags.includes('--direct');
const BASE = usePages ? 'https://zhihu-four-seasons.pages.dev' : 'https://zhihu-four-seasons.sishi-life-005336.workers.dev';
const out = fileURLToPath(new URL(usePages ? '../test-results/cloud-pages-public/' : '../test-results/cloud-public/', import.meta.url));
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'C:/Users/25293/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const proxyServer = process.env.CLOUD_PUBLIC_PROXY || (flags.includes('--explicit-proxy') ? 'http://127.0.0.1:11888' : '');
assert.ok(!proxyServer || proxyServer === 'http://127.0.0.1:11888', 'Only the parent-confirmed existing local proxy may be selected; do not change system settings');
assert.ok(!(direct && proxyServer), '--direct and an explicit proxy (flag or environment) are mutually exclusive');
const artifactMode = direct ? 'direct-' : proxyServer ? 'explicit-proxy-' : '';
const reportName = direct ? 'browser-direct.json' : proxyServer ? 'browser-explicit-proxy.json' : 'browser.json';
const report = { passed: false, startedAt: new Date().toISOString(), cases: [], errors: [], method: {
  base: BASE, hostingTarget: usePages ? 'pages' : 'workers', publicStaticAssetsNative: true, apiResponsesMocked: true, mockedBusinessStatus: 503,
  realProviderCalls: 0, serverStartedOrStopped: false, user4173Untouched: true, isolatedBrowserStorage: true,
  graphics: 'Windows Chrome native D3D11; 1440x900 and 844x390; normal-speed animation.',
  scope: 'A real new-game first event per viewport; replay-valid fixtures for two-round fallback practice, sources and ending. Not full-game playthroughs.',
  dice: 'Only the isolated test context sets single Uint32Array draws to six, targeting the original cell-06 video; no product changes.',
  limitations: 'No real provider/API availability, audio or unvisited films acceptance. Native public images/video and the downloaded PNG are real.',
  privacy: 'No cookies, keys, visitor IDs, IPs, session tokens, complete API bodies or user saves recorded.'
} };
report.method.networkMode = direct ? 'Isolated Chrome --no-proxy-server; system settings and TLS validation unchanged. Evidence is limited to this machine/network.'
  : proxyServer ? 'Explicit existing localhost proxy; does not prove mainland direct access.' : 'Chrome default network settings; proxy use not asserted.';
let browser;
const contexts = new Set();
await fs.mkdir(out, { recursive: true });
const save = () => fs.writeFile(`${out}/${reportName}`, JSON.stringify(report, null, 2));

function safeChoice(state) {
  return state.active.options.map((option, index) => ({ index, p: previewChoice(state, option) }))
    .filter(option => !option.p.disabled).sort((a, b) => b.p.mood - a.p.mood || b.p.money - a.p.money)[0].index;
}
function practiceFixture(phase = 'feedback') {
  let state = newGame('full', { name: '公网陪练专项', talent: 'defense', enriched: true });
  for (const die of [6, 6]) { state = land(state, die); state = advance(choose(state, safeChoice(state))); }
  state = land(state, 1);
  if (phase === 'feedback') state = choose(state, 0);
  assert.equal(state.active.id, 'cell-13'); assert.equal(state.phase, phase); assert.ok(restore(snapshot(state)));
  return state;
}
function completedFixture() {
  let state = newGame('full', { name: '公网回忆专项', talent: 'optimistic', enriched: true });
  while (!state.ended) { state = land(state, 6); state = advance(choose(state, safeChoice(state))); }
  assert.equal(state.ended, 'complete'); assert.ok(restore(snapshot(state)));
  return state;
}
async function screenshot(run, label) {
  // Await finite dialog entry transitions naturally; do not disable animation.
  await run.page.locator('#dialog').evaluate(async node => {
    const animations = node.getAnimations({ subtree: true }).filter(animation => Number.isFinite(animation.effect?.getTiming().iterations));
    await Promise.all(animations.map(animation => animation.finished.catch(() => {})));
  });
  const path = `${out}/${run.row.name}-${artifactMode}${label}.png`;
  await run.page.screenshot({ path }); run.row.screenshots.push(path);
}
async function storedState(page) {
  const game = await page.evaluate(key => JSON.parse(localStorage.getItem(key) || 'null')?.game, JOURNEY_STORAGE_KEY);
  const state = restore(game); assert.ok(state, 'Save must pass command replay');
  return { game, state };
}
async function unchanged(run, expected, label) {
  const actual = await storedState(run.page);
  assert.deepEqual(actual.game, snapshot(expected), `${label}: resources and history unchanged`);
}
async function fixture(run, state) {
  await run.page.evaluate(({ key, game }) => sessionStorage.setItem('cloud-public-next-fixture', JSON.stringify({ key,
    record: { game, seconds: 0, practiceInvitation: { version: 1, seen: true, resolved: true, kind: 'natural' } } })),
  { key: JOURNEY_STORAGE_KEY, game: snapshot(state) });
  await run.page.reload({ waitUntil: 'domcontentloaded' });
  await run.page.locator('#scene[data-assets="ready"][data-renderer="webgl"]').waitFor();
  await run.page.locator('#start-full').click(); await run.page.locator('#resume').click();
  await unchanged(run, state, 'Fixture installed after previous document unload');
}
async function inViewport(run, locator) {
  const box = await locator.boundingBox(), { width, height } = run.row;
  assert.ok(box && box.x >= -1 && box.y >= -1 && box.x + box.width <= width + 1 && box.y + box.height <= height + 1);
  assert.equal(await run.page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
}
async function setup(width, height) {
  const row = { name: `${width}x${height}`, width, height, passed: false, stage: 'load', screenshots: [], apiMocked: [],
    assetErrors: [], externalBlocked: [], unapprovedApis: [], requestFailures: [], nativeDocuments: [] };
  report.cases.push(row); await save();
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1,
    reducedMotion: 'no-preference', serviceWorkers: 'block', acceptDownloads: true });
  contexts.add(context);
  await context.route('**/*', route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== BASE && !['blob:', 'data:'].includes(url.protocol)) {
      row.externalBlocked.push({ path: url.pathname, type: request.resourceType() }); return route.abort();
    }
    if (['/api/narrate', '/api/practice', '/api/experience'].includes(url.pathname)) {
      const entry = { path: url.pathname, method: request.method(), status: 503, mocked: true };
      let input; try { input = request.postDataJSON(); } catch {}
      if (['event', 'summary'].includes(input?.kind)) entry.kind = input.kind;
      if (Number.isInteger(input?.turn)) entry.turn = input.turn;
      row.apiMocked.push(entry);
      return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Public browser acceptance: deliberate business API failure.' }) });
    }
    if (url.pathname.startsWith('/api/') && !['/api/health', '/api/ai/status'].includes(url.pathname)) {
      row.unapprovedApis.push(url.pathname); return route.abort();
    }
    return route.continue();
  });
  await context.routeWebSocket('**/*', socket => { row.externalBlocked.push({ path: new URL(socket.url()).pathname, type: 'websocket' }); socket.close(); });
  await context.addInitScript(({ allowedOrigin }) => {
    if (location.origin !== allowedOrigin) return; // Chrome network-error documents have no usable web storage.
    const pending = sessionStorage.getItem('cloud-public-next-fixture');
    if (pending) {
      const { key, record } = JSON.parse(pending); localStorage.setItem(key, JSON.stringify(record));
      sessionStorage.removeItem('cloud-public-next-fixture');
    }
    localStorage.setItem('four-seasons-auto-depart', 'off'); localStorage.setItem('four-seasons-music', 'off');
    const qa = window.__cloudPublicQA = { videos: [] }, original = crypto.getRandomValues.bind(crypto);
    crypto.getRandomValues = values => {
      if (values instanceof Uint32Array && values.length === 1) { values[0] = Math.floor((5.5 / 6) * 4294967296); return values; }
      return original(values);
    };
    const tracked = new WeakSet();
    new MutationObserver(() => document.querySelectorAll('#cinematic-stage video').forEach(video => {
      if (tracked.has(video)) return; tracked.add(video);
      const row = { events: [], decodedFrames: 0 }; qa.videos.push(row);
      for (const type of ['loadedmetadata', 'playing', 'ended', 'error']) video.addEventListener(type, () => {
        row.path = new URL(video.currentSrc || video.src).pathname; row.width = video.videoWidth; row.height = video.videoHeight;
        row.events.push({ type, seconds: video.currentTime, duration: Number.isFinite(video.duration) ? video.duration : null, errorCode: video.error?.code || null });
      });
      const frame = (_time, metadata) => { row.decodedFrames++; row.lastMediaTime = metadata.mediaTime; if (video.isConnected) video.requestVideoFrameCallback?.(frame); };
      video.requestVideoFrameCallback?.(frame);
    })).observe(document, { childList: true, subtree: true });
  }, { allowedOrigin: BASE });
  const page = await context.newPage(); page.setDefaultTimeout(90_000); page.setDefaultNavigationTimeout(90_000);
  page.on('pageerror', error => report.errors.push({ case: row.name, message: error.message }));
  page.on('response', response => {
    const url = new URL(response.url()); if (url.origin !== BASE) return;
    if (/\/(?:assets|art|characters|cinematics|models)\//.test(url.pathname) && !response.ok()) row.assetErrors.push({ path: url.pathname, status: response.status() });
    if (response.request().resourceType() === 'document') row.nativeDocuments.push({ path: url.pathname, status: response.status() });
  });
  page.on('requestfailed', request => {
    const url = new URL(request.url()); if (url.origin === BASE) row.requestFailures.push({ path: url.pathname, error: request.failure()?.errorText });
  });
  const started = performance.now();
  try {
    const response = await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    assert.equal(response.status(), 200); assert.equal(new URL(page.url()).origin, BASE);
  // Use the same native browser network path as the actual game. A separate
  // Node fetch can have different system-proxy routing and is not browser proof.
  row.health = await page.evaluate(async () => {
    const response = await fetch('/api/health', { signal: AbortSignal.timeout(30_000), redirect: 'error' });
    const body = await response.json(); return { status: response.status, game: body.game };
  });
  assert.deepEqual(row.health, { status: 200, game: 'four-seasons-life' });
  await page.locator('#scene[data-assets="ready"][data-renderer="webgl"]').waitFor();
  row.sceneReadyMilliseconds = Math.round(performance.now() - started);
  } catch (error) {
    row.failure = { stage: 'load', message: error.message };
    const path = `${out}/${row.name}-${artifactMode}load-failure.png`;
    await page.screenshot({ path }).then(() => row.screenshots.push(path)).catch(() => {});
    throw error;
  }
  return { row, context, page };
}
async function firstEvent(run) {
  const { row, page } = run; row.stage = 'first-event'; await save();
  assert.equal(await page.locator('#start-full').count(), 1);
  assert.equal(await page.locator('#start-demo,#start-sample,#resume').count(), 0);
  assert.equal(await page.locator('#orientation-gate').isVisible(), false);
  assert.equal(await page.locator('#scene').getAttribute('data-route-length'), '40');
  row.graphics = await page.locator('#scene canvas').evaluate(canvas => {
    const gl = canvas.getContext('webgl2'), ext = gl?.getExtension('WEBGL_debug_renderer_info');
    return { webgl2: !!gl, contextLost: gl?.isContextLost(), nativeD3D11: /D3D11|Direct3D11/i.test(ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '') };
  });
  assert.deepEqual(row.graphics, { webgl2: true, contextLost: false, nativeD3D11: true });
  await screenshot(run, 'cover'); await page.locator('#character-name').fill('公网试玩专项'); await page.locator('#start-full').click();
  await page.locator('.chapter-continue').click(); await page.locator('#continue-travel').click();
  await page.locator('.cinematic[data-mode="video"] video').waitFor({ state: 'visible' }); await screenshot(run, 'native-film');
  await page.locator('.experience[data-stage="choice"]').waitFor();
  row.videos = await page.evaluate(() => window.__cloudPublicQA.videos);
  assert.equal(row.videos.length, 1); const film = row.videos[0], end = film.events.find(event => event.type === 'ended');
  assert.match(film.path, /cell-06\.mp4$/); assert.ok(film.events.some(event => event.type === 'playing'));
  assert.ok(end && Math.abs(end.seconds - end.duration) < .15); assert.ok(film.decodedFrames > 20);
  assert.deepEqual([film.width, film.height], [1280, 720]);
  assert.equal(await page.locator('[data-choice]').count(), 3); await inViewport(run, page.locator('#story-panel'));
  await screenshot(run, 'choice'); await page.locator('[data-choice]:not(:disabled)').first().click();
  await page.locator('.experience[data-stage="feedback"]').waitFor();
  const { state } = await storedState(page); assert.equal(state.turn, 1); assert.equal(state.history[0].eventId, 'cell-06');
  await page.locator('.reflection-drawer > summary').click(); await page.locator('[data-ai-kind="event"][data-mode="fallback"]').waitFor();
  row.firstEvent = { turn: 1, cell: 6, choices: 3, nativeFilmEnded: true, browserFallbackAfterMock503: true };
  await screenshot(run, 'event-fallback');
}
async function practiceAndSearch(run) {
  const { row, page } = run, state = practiceFixture(); row.stage = 'practice-fixture'; await save();
  await fixture(run, state); await page.locator('#practice-open').click();
  const messages = ['请先一起核对已确认的交接节点。', '我把待确认事项发出来，再请相关同事逐项确认。'];
  for (let index = 0; index < messages.length; index++) {
    await page.locator('#practice-message').fill(messages[index]); await page.locator('.practice-form [type="submit"]').click();
    if (!index) await page.locator('.practice-round').filter({ hasText: '第 2 / 2 轮' }).waitFor();
    else await page.locator('.practice-tip:not([hidden])').waitFor();
    await unchanged(run, state, `Practice round ${index + 1}`);
  }
  assert.equal(row.apiMocked.filter(item => item.path === '/api/practice').length, 1, 'First 503 makes round two local-only');
  assert.equal(await page.locator('.practice-message.player').count(), 2); assert.equal(await page.locator('.practice-message.npc').count(), 3);
  assert.match(await page.locator('.practice-tip small').innerText(), /预设练习.*非实时 AI/);
  await inViewport(run, page.locator('#dialog')); await screenshot(run, 'practice-mock503');
  await page.locator('.practice-exit').click(); await unchanged(run, state, 'Practice closed');
  assert.equal(await page.evaluate(texts => Object.values(localStorage).some(value => texts.some(text => value.includes(text))), messages), false);
  row.practice = { uiRounds: 2, mockedApiRequests: 1, secondRoundLocalOnly: true, tipVisible: true, resourcesUnchanged: true, messagesNotInSave: true };
  row.stage = 'search-choice-fixture'; await save();
  const choiceState = practiceFixture('choice'); await fixture(run, choiceState); await page.locator('#event-sources').click();
  const card = page.locator('.source-card').first(), link = card.locator(':scope > a'), button = card.locator('.find-more');
  const href = await link.getAttribute('href'); assert.match(href, /^https:\/\/(www\.zhihu\.com|zhuanlan\.zhihu\.com)\//);
  await button.click(); await button.filter({ hasText: '重试检索' }).waitFor();
  assert.match(await card.locator('.more-results').innerText(), /暂时无法实时检索.*原文仍可直接查看/);
  assert.equal(await card.locator('.more-results a').count(), 0); assert.equal(await link.getAttribute('href'), href);
  assert.equal(await button.isEnabled(), true); await card.scrollIntoViewIfNeeded(); await screenshot(run, 'search-mock503');
  row.search = { mockedStatus: 503, retryVisible: true, originalSourcePreserved: true, externalSourceNotOpened: true, inventedResults: 0 };
  await page.locator('#dialog-close').click(); await unchanged(run, choiceState, 'Search closed');
}
async function endingAndShare(run) {
  const { row, page } = run, state = completedFixture(); row.stage = 'ending-fixture'; await save();
  await fixture(run, state); await page.locator('.memory-album').waitFor();
  const loadedImages = () => page.waitForFunction(() => [...document.querySelectorAll('.memory-photo img')].every(img => img.complete && img.naturalWidth > 0));
  await loadedImages(); await inViewport(run, page.locator('#dialog')); await screenshot(run, 'memory-cover');
  await page.locator('[data-memory-details]').click();
  const summary = page.locator('[data-ai-kind="summary"][data-mode="fallback"]'); await summary.waitFor();
  assert.match(await summary.locator('.ai-reflection-status').innerText(), /备用|预设/); await summary.scrollIntoViewIfNeeded();
  await screenshot(run, 'summary-mock503'); await page.locator('#back-to-memories').click();
  const count = await page.locator('[data-memory-go]').count(); assert.equal(count, 8);
  for (let index = 0; index < count; index++) { await page.locator(`[data-memory-go="${index}"]`).click(); await loadedImages(); }
  await screenshot(run, 'memory-final'); await page.locator('#share-card').click();
  await page.locator('#dialog.share-dialog[open] .share-preview').waitFor(); await page.locator('.share-preview').evaluate(img => img.decode());
  const dimensions = await page.locator('.share-preview').evaluate(img => [img.naturalWidth, img.naturalHeight]);
  assert.ok(dimensions[0] >= 800 && dimensions[1] > dimensions[0]); await inViewport(run, page.locator('#dialog'));
  await screenshot(run, 'share-detail'); await page.locator('[data-share-zoom]').click();
  assert.equal(await page.locator('.share-view').getAttribute('data-zoom'), 'fit'); await screenshot(run, 'share-fit');
  const downloadPromise = page.waitForEvent('download'); await page.locator('.share-actions a[download]').click();
  const download = await downloadPromise, path = `${out}/${row.name}-${artifactMode}share.png`; await download.saveAs(path);
  const png = await fs.readFile(path); assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], dimensions);
  row.ending = { fixtureEnded: state.ended, fixtureTurns: state.turn, browserSummaryFallbackAfterMock503: true,
    memoryPages: count, allImagesLoaded: true, resourcesUnchanged: true };
  row.share = { actualBrowserDownload: true, path, bytes: png.length, width: dimensions[0], height: dimensions[1], previewModes: ['detail', 'fit'] };
  await page.locator('#back-to-report').click(); await page.locator('.memory-album').waitFor(); await unchanged(run, state, 'Summary and downloaded share');
}
try {
  assert.equal(new URL(BASE).protocol, 'https:');
  report.preflight = { https: true, healthCheckedThroughEachNativeBrowser: true, noProviderCall: true };
  browser = await chromium.launch({ channel: 'chrome', headless: true, ...(proxyServer ? { proxy: { server: proxyServer } } : {}),
    args: ['--enable-webgl', '--use-gl=angle', '--use-angle=d3d11', '--ignore-gpu-blocklist', ...(direct ? ['--no-proxy-server'] : [])] });
  for (const [width, height] of [[1440, 900], [844, 390]]) {
    let run;
    try {
      run = await setup(width, height); await firstEvent(run); await practiceAndSearch(run); await endingAndShare(run);
      assert.equal(run.row.apiMocked.filter(item => item.path === '/api/narrate').length, 2);
      assert.equal(run.row.apiMocked.filter(item => item.path === '/api/experience').length, 1);
      assert.deepEqual(run.row.assetErrors, []); assert.deepEqual(run.row.externalBlocked, []); assert.deepEqual(run.row.unapprovedApis, []);
      run.row.stage = 'complete'; run.row.passed = true;
    } catch (error) {
      if (run) { run.row.failure = { stage: run.row.stage, message: error.message }; await screenshot(run, 'failure').catch(() => {}); }
      report.errors.push({ case: `${width}x${height}`, message: error.message });
    } finally {
      if (run) { await run.context.close(); contexts.delete(run.context); } await save();
      console.log(`Cloud public ${width}x${height}: ${run?.row.passed ? 'passed' : 'FAILED'}`);
    }
    if (!run && report.cases.at(-1)?.failure?.stage === 'load') {
      report.stoppedEarly = 'Initial public page/health/scene load failed; do not repeat a second viewport on the same unavailable network path.';
      break;
    }
  }
  report.passed = report.errors.length === 0 && report.cases.length === 2 && report.cases.every(row => row.passed);
} catch (error) { report.errors.push({ message: error.message }); }
finally {
  for (const context of contexts) await context.close().catch(() => {});
  await browser?.close(); report.finishedAt = new Date().toISOString(); await save(); if (!report.passed) process.exitCode = 1;
  console.log(JSON.stringify({ passed: report.passed, cases: report.cases.map(row => ({ name: row.name, passed: row.passed })), errors: report.errors, report: `${out}/${reportName}` }));
}
