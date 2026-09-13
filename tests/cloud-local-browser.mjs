// The parent owns this already-running workerd. This test does not start/stop
// any service, touch 4173, intercept API responses or use real credentials.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs/promises';
import { newGame, land, choose, advance, previewChoice, snapshot, restore } from '../src/engine.js';
import { JOURNEY_STORAGE_KEY } from '../src/journey-storage.js';

const BASE = 'http://127.0.0.1:8789';
const out = fileURLToPath(new URL('../test-results/cloud-local/', import.meta.url));
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'C:/Users/25293/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const report = { passed: false, startedAt: new Date().toISOString(), cases: [], errors: [],
  method: { base: BASE, alreadyRunningWorkerd: true, user4173Untouched: true, isolatedBrowserStorage: true,
    graphics: 'Windows Chrome native D3D11 WebGL; 1440x900 and 844x390; normal animation speed.',
    apiResponsesMocked: false, externalTrafficBlocked: true, realProviderCalls: 0,
    fixtureScope: 'Two real first-event departures, then replay-valid cell-13 feedback and complete-game fixtures; not full-game playthroughs.',
    dice: 'Only test-context one-element Uint32Array draws return six, to target cell-6 native film. Product scripts and session randomness are unchanged.',
    privacy: 'No cookies, keys, visitor identifiers, IP headers, session tokens or full API bodies are saved.',
  } };
let browser;
const contexts = new Set();
await fs.mkdir(out, { recursive: true });
const onlyViewport = process.argv[2];
assert.ok(!onlyViewport || ['1440x900', '844x390'].includes(onlyViewport), 'Optional argument must name one of the two approved viewports');
if (onlyViewport) {
  const previous = JSON.parse(await fs.readFile(`${out}/browser.json`, 'utf8'));
  report.cases = previous.cases.filter(row => row.passed && row.name !== onlyViewport);
  report.retainedEvidence = { fromStartedAt: previous.startedAt, fromFinishedAt: previous.finishedAt,
    viewports: report.cases.map(row => row.name) };
  report.testCorrections = ['Canonical cell IDs use cell-06, not cell-6.',
    'Replay fixture installation must occur after old-page beforeunload saves.',
    'Compact landscape hides the bottom all-sources tool; use the visible event-sources choice action instead.'];
}
const save = () => fs.writeFile(`${out}/browser.json`, JSON.stringify(report, null, 2));

function safeChoice(state) {
  return state.active.options.map((option, index) => ({ index, p: previewChoice(state, option) }))
    .filter(option => !option.p.disabled).sort((a, b) => b.p.mood - a.p.mood || b.p.money - a.p.money)[0].index;
}
function practiceFixture(phase = 'feedback') {
  let state = newGame('full', { name: '云端陪练专项', talent: 'defense', enriched: true });
  for (const die of [6, 6]) { state = land(state, die); state = advance(choose(state, safeChoice(state))); }
  state = land(state, 1);
  if (phase === 'feedback') state = choose(state, 0);
  assert.equal(state.active.id, 'cell-13'); assert.equal(state.phase, phase); assert.ok(restore(snapshot(state)));
  return state;
}
function completedFixture() {
  let state = newGame('full', { name: '云端总结专项', talent: 'optimistic', enriched: true });
  while (!state.ended) { state = land(state, 6); state = advance(choose(state, safeChoice(state))); }
  assert.equal(state.ended, 'complete'); assert.ok(restore(snapshot(state)));
  return state;
}
async function screenshot(run, name) {
  const path = `${out}/${run.row.name}-${name}.png`;
  await run.page.screenshot({ path }); run.row.screenshots.push(path);
}
async function storedState(page) {
  const game = await page.evaluate(key => JSON.parse(localStorage.getItem(key) || 'null')?.game, JOURNEY_STORAGE_KEY);
  const state = restore(game); assert.ok(state, 'Browser save is replay-valid');
  return { game, state };
}
async function unchanged(run, expected, label) {
  const actual = await storedState(run.page);
  assert.deepEqual(actual.game, snapshot(expected), `${label}: game resources/history unchanged`);
  return { turn: actual.state.turn, phase: actual.state.phase, resourcesUnchanged: true };
}
async function fixture(run, state) {
  // Old-page beforeunload saves its real game. Install the fixture only after
  // that lifecycle finishes, in the next document's one-shot init script.
  await run.page.evaluate(({ key, game }) => sessionStorage.setItem('cloud-local-next-fixture', JSON.stringify({ key, record: { game, seconds: 0,
    practiceInvitation: { version: 1, seen: true, resolved: true, kind: 'natural' } } })), { key: JOURNEY_STORAGE_KEY, game: snapshot(state) });
  await run.page.reload({ waitUntil: 'domcontentloaded' });
  await run.page.locator('#scene[data-assets="ready"][data-renderer="webgl"]').waitFor();
  await run.page.locator('#start-full').click(); await run.page.locator('#resume').click();
  await unchanged(run, state, 'Fixture loaded after old-page unload');
}
async function checkPanel(run, locator) {
  const box = await locator.boundingBox();
  assert.ok(box && box.x >= -1 && box.y >= -1 && box.x + box.width <= run.row.width + 1 && box.y + box.height <= run.row.height + 1, 'Panel stays in the viewport');
  assert.equal(await run.page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, 'No horizontal page overflow');
}
async function setup(width, height) {
  const row = { name: `${width}x${height}`, width, height, passed: false, stage: 'load', screenshots: [], api: [], videos: [], externalBlocked: [], assetErrors: [], requestFailures: [] };
  report.cases.push(row); await save();
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1,
    reducedMotion: 'no-preference', serviceWorkers: 'block', acceptDownloads: true });
  contexts.add(context);
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== BASE && !['data:', 'blob:'].includes(url.protocol)) {
      row.externalBlocked.push({ path: url.pathname, type: route.request().resourceType() }); return route.abort();
    }
    // Same-origin GET/POST and all response bytes remain native and unmodified.
    return route.continue();
  });
  await context.routeWebSocket('**/*', socket => {
    const url = new URL(socket.url());
    if (url.origin.replace(/^ws/, 'http') === BASE) { socket.connectToServer(); return; }
    row.externalBlocked.push({ path: url.pathname, type: 'websocket' }); socket.close();
  });
  await context.addInitScript(() => {
    const pendingFixture = sessionStorage.getItem('cloud-local-next-fixture');
    if (pendingFixture) {
      const value = JSON.parse(pendingFixture);
      localStorage.setItem(value.key, JSON.stringify(value.record));
      sessionStorage.removeItem('cloud-local-next-fixture');
    }
    localStorage.setItem('four-seasons-auto-depart', 'off');
    localStorage.setItem('four-seasons-music', 'off');
    const qa = window.__cloudLocalQA = { dice: [], videos: [] };
    const original = crypto.getRandomValues.bind(crypto);
    crypto.getRandomValues = values => {
      if (values instanceof Uint32Array && values.length === 1) { values[0] = Math.floor((5.5 / 6) * 4294967296); qa.dice.push(6); return values; }
      return original(values);
    };
    const tracked = new WeakSet();
    const track = video => {
      if (tracked.has(video)) return; tracked.add(video);
      const row = { events: [], decodedFrames: 0 }; qa.videos.push(row);
      for (const type of ['loadedmetadata', 'playing', 'ended', 'error']) video.addEventListener(type, () => {
        let path; try { path = new URL(video.currentSrc || video.src).pathname; } catch { path = ''; }
        row.path = path; row.width = video.videoWidth; row.height = video.videoHeight;
        row.events.push({ type, seconds: video.currentTime, duration: Number.isFinite(video.duration) ? video.duration : null, errorCode: video.error?.code || null });
      });
      const frame = (_time, metadata) => { row.decodedFrames++; row.lastMediaTime = metadata.mediaTime; if (video.isConnected) video.requestVideoFrameCallback?.(frame); };
      video.requestVideoFrameCallback?.(frame);
    };
    new MutationObserver(() => document.querySelectorAll('#cinematic-stage video').forEach(track))
      .observe(document, { childList: true, subtree: true });
  });
  const page = await context.newPage(), responses = [];
  page.setDefaultTimeout(65_000);
  page.on('pageerror', error => report.errors.push({ case: row.name, message: error.message }));
  page.on('response', response => {
    const url = new URL(response.url());
    if (url.origin !== BASE) return;
    if (/\/(?:assets|art|characters|cinematics|models)\//.test(url.pathname) && !response.ok()) row.assetErrors.push({ path: url.pathname, status: response.status() });
    if (!url.pathname.startsWith('/api/')) return;
    responses.push((async () => {
      const entry = { path: url.pathname, method: response.request().method(), status: response.status() };
      let input; try { input = response.request().postDataJSON(); } catch {}
      if (input?.kind === 'event' || input?.kind === 'summary') entry.kind = input.kind;
      try {
        const body = await response.json();
        if (typeof body.mode === 'string') entry.mode = body.mode;
        if (typeof body.configured === 'boolean') entry.configured = body.configured;
        if (Number.isInteger(body.turn)) entry.turn = body.turn;
        if (typeof body.done === 'boolean') entry.done = body.done;
        if (typeof body.text === 'string') entry.textChars = body.text.length;
        if (typeof body.npc === 'string') entry.npcChars = body.npc.length;
        if (typeof body.tip === 'string') entry.tipChars = body.tip.length;
        if (Array.isArray(body.items)) entry.items = body.items.length;
      } catch { entry.jsonReadable = false; }
      row.api.push(entry);
    })());
  });
  page.on('requestfailed', request => {
    const url = new URL(request.url());
    if (url.origin === BASE) row.requestFailures.push({ path: url.pathname, error: request.failure()?.errorText });
  });
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.locator('#scene[data-assets="ready"][data-renderer="webgl"]').waitFor();
  const run = { row, context, page, responses };
  return run;
}

async function firstEvent(run) {
  const { row, page } = run; row.stage = 'first-event';
  await save();
  await page.locator('#start-full').waitFor();
  assert.equal(await page.locator('#start-demo,#start-sample,#resume').count(), 0);
  assert.equal(await page.locator('#orientation-gate').isVisible(), false);
  const scene = await page.locator('#scene').evaluate(node => ({ routeLength: Number(node.dataset.routeLength), renderer: node.dataset.renderer, assets: node.dataset.assets }));
  assert.equal(scene.routeLength, 40); assert.equal(scene.renderer, 'webgl');
  row.graphics = await page.locator('#scene canvas').evaluate(canvas => {
    const gl = canvas.getContext('webgl2'), extension = gl?.getExtension('WEBGL_debug_renderer_info');
    const renderer = extension ? String(gl.getParameter(extension.UNMASKED_RENDERER_WEBGL)) : '';
    return { webgl2: !!gl, contextLost: gl?.isContextLost(), nativeD3D11: /D3D11|Direct3D11/i.test(renderer), width: canvas.width, height: canvas.height };
  });
  assert.equal(row.graphics.webgl2, true); assert.equal(row.graphics.contextLost, false); assert.equal(row.graphics.nativeD3D11, true);
  row.route = scene; await screenshot(run, 'cover');
  await page.locator('#character-name').fill('云端本地试玩'); await page.locator('#start-full').click();
  const chapter = page.locator('.chapter-continue');
  await chapter.waitFor(); await chapter.click();
  await page.locator('#continue-travel').waitFor({ state: 'visible' }); await screenshot(run, 'ready');
  await page.locator('#continue-travel').click();
  await page.locator('.cinematic[data-mode="video"] video').waitFor({ state: 'visible' });
  await screenshot(run, 'native-film');
  await page.locator('.experience[data-stage="choice"]').waitFor();
  row.videos = await page.evaluate(() => window.__cloudLocalQA.videos);
  assert.equal(row.videos.length, 1); const film = row.videos[0];
  assert.match(film.path, /cell-06\.mp4$/); assert.ok(film.events.some(event => event.type === 'playing'));
  const ended = film.events.find(event => event.type === 'ended');
  assert.ok(ended && Math.abs(ended.seconds - ended.duration) < .15, 'Native video reaches its actual ended event');
  assert.ok(film.decodedFrames > 20); assert.deepEqual([film.width, film.height], [1280, 720]);
  assert.equal(await page.locator('[data-choice]').count(), 3); await checkPanel(run, page.locator('#story-panel'));
  await screenshot(run, 'choice');
  // A visible available option; no outcome-based selection is used here.
  await page.locator('[data-choice]:not(:disabled)').first().click();
  await page.locator('.experience[data-stage="feedback"]').waitFor();
  const current = await storedState(page);
  assert.equal(current.state.turn, 1); assert.equal(current.state.history[0].eventId, 'cell-06');
  await page.locator('.reflection-drawer > summary').click();
  await page.locator('[data-ai-kind="event"][data-mode="fallback"]').waitFor();
  assert.match(await page.locator('.ai-reflection-status').innerText(), /备用|预设/);
  row.firstEvent = { turn: 1, event: current.state.history[0].eventId, die: current.state.history[0].die, choices: 3, nativeFilmEnded: true, eventFallbackVisible: true };
  await screenshot(run, 'event-fallback');
}

async function practiceAndSearch(run) {
  const { row, page } = run, state = practiceFixture(); row.stage = 'practice-fixture';
  await save();
  await fixture(run, state); await page.locator('#practice-open').click(); await page.locator('.practice-room').waitFor();
  const messages = ['请先一起核对已确认的交接节点。', '我把待确认事项发出来，再请相关同事逐项确认。'];
  for (let turn = 1; turn <= 2; turn++) {
    const response = page.waitForResponse(response => new URL(response.url()).pathname === '/api/practice' && response.request().method() === 'POST');
    await page.locator('#practice-message').fill(messages[turn - 1]); await page.locator('.practice-form [type="submit"]').click();
    const reply = await response, body = await reply.json();
    assert.equal(reply.status(), 200, 'Real workerd, not browser error recovery');
    assert.equal(body.mode, 'fallback'); assert.equal(body.turn, turn); assert.equal(body.done, turn === 2);
    if (turn === 1) await page.locator('.practice-round').filter({ hasText: '第 2 / 2 轮' }).waitFor();
    else await page.locator('.practice-tip:not([hidden])').waitFor();
    await unchanged(run, state, `Round ${turn}`);
  }
  assert.equal(await page.locator('.practice-message.player').count(), 2);
  assert.equal(await page.locator('.practice-message.npc').count(), 3);
  assert.equal(await page.locator('.practice-form').isVisible(), false);
  assert.match(await page.locator('.practice-tip small').innerText(), /预设.*非实时 AI/);
  assert.equal(await page.locator('.practice-message.npc span').filter({ hasText: '预设练习 · 非实时 AI' }).count(), 2);
  await checkPanel(run, page.locator('#dialog')); await screenshot(run, 'two-rounds-backend-fallback');
  await page.locator('.practice-exit').click(); await page.locator('.experience[data-stage="feedback"]').waitFor();
  assert.equal(await page.evaluate(texts => Object.values(localStorage).some(value => texts.some(text => value.includes(text))), messages), false);
  row.practice = { fixtureCell: 13, actualBackendTurns: 2, responseModes: ['fallback', 'fallback'], tipShown: true,
    typedMessagesNotInBrowserSave: true, ...await unchanged(run, state, 'Practice closed') };
  row.stage = 'search'; await save();
  let searchState = state, sourceEntry = 'all-sources';
  if (await page.locator('#all-sources').isVisible()) await page.locator('#all-sources').click();
  else {
    // The compact layout intentionally hides footer tools. Exercise the real,
    // visible event source action without forcing a hidden click or changing UI.
    searchState = practiceFixture('choice'); sourceEntry = 'event-sources';
    await fixture(run, searchState);
    await page.locator('#event-sources').click();
  }
  await page.locator('#dialog.sources-dialog[open]').waitFor();
  const card = page.locator('.source-card').first(), button = card.locator('.find-more');
  const response = page.waitForResponse(response => new URL(response.url()).pathname === '/api/experience');
  await button.click(); const reply = await response, body = await reply.json();
  assert.equal(reply.status(), 200); assert.equal(body.mode, 'curated'); assert.ok(body.items.length > 0);
  await button.filter({ hasText: '重新检索' }).waitFor();
  assert.match(await card.locator('.more-results').innerText(), /实时检索暂不可用.*已整理/);
  assert.ok(await card.locator('.more-results a').count() > 0);
  assert.equal(await button.isEnabled(), true); await card.scrollIntoViewIfNeeded(); await screenshot(run, 'search-curated');
  row.search = { status: 200, mode: body.mode, curatedItems: body.items.length, retryEnabled: true, sourceLinksNotOpened: true, sourceEntry };
  await page.locator('#dialog-close').click(); await unchanged(run, searchState, 'Search closed');
}

async function ending(run) {
  const { row, page } = run, state = completedFixture(); row.stage = 'ending-fixture';
  await save();
  await fixture(run, state); await page.locator('.memory-album').waitFor();
  await page.waitForFunction(() => [...document.querySelectorAll('.memory-photo img')].every(img => img.complete && img.naturalWidth > 0));
  await checkPanel(run, page.locator('#dialog')); await screenshot(run, 'memory-cover');
  const response = page.waitForResponse(response => {
    if (new URL(response.url()).pathname !== '/api/narrate') return false;
    try { return response.request().postDataJSON()?.kind === 'summary'; } catch { return false; }
  });
  await page.locator('[data-memory-details]').click();
  const reply = await response, body = await reply.json(); assert.equal(reply.status(), 200); assert.equal(body.mode, 'fallback');
  const card = page.locator('[data-ai-kind="summary"][data-mode="fallback"]'); await card.waitFor();
  assert.match(await card.locator('.ai-reflection-status').innerText(), /备用|预设/);
  assert.ok((await card.locator('.ai-reflection-text').innerText()).length > 30);
  await card.scrollIntoViewIfNeeded(); await screenshot(run, 'summary-backend-fallback');
  await page.locator('#back-to-memories').click(); await page.locator('.memory-album').waitFor();
  const pages = page.locator('[data-memory-go]'), count = await pages.count();
  for (let i = 1; i < count; i++) {
    await page.locator(`[data-memory-go="${i}"]`).click();
    await page.waitForFunction(() => [...document.querySelectorAll('.memory-photo img')].every(img => img.complete && img.naturalWidth > 0));
  }
  await page.locator('#share-card').waitFor(); await screenshot(run, 'memory-final');
  row.ending = { fixtureEnded: state.ended, fixtureTurns: state.turn, summaryStatus: 200, summaryMode: 'fallback',
    memoryPages: count, allPageImagesLoaded: true, shareEntryEnabled: await page.locator('#share-card').isEnabled(),
    ...await unchanged(run, state, 'Summary and memory pages') };
}

try {
  const health = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(5000), redirect: 'error' });
  assert.equal(health.status, 200); assert.equal((await health.json()).game, 'four-seasons-life');
  const status = await fetch(`${BASE}/api/ai/status`, { headers: { Origin: BASE }, signal: AbortSignal.timeout(5000), redirect: 'error' });
  assert.equal(status.status, 200); const statusBody = await status.json();
  assert.equal(statusBody.configured, false, 'Stop before business calls if a real model secret appears');
  report.preflight = { healthStatus: 200, aiStatus: 200, configured: false, transport: statusBody.transport };
  browser = await chromium.launch({ channel: 'chrome', headless: true,
    args: ['--enable-webgl', '--use-gl=angle', '--use-angle=d3d11', '--ignore-gpu-blocklist'] });
  for (const [width, height] of [[1440, 900], [844, 390]]) {
    if (onlyViewport && `${width}x${height}` !== onlyViewport) continue;
    let run;
    try {
      run = await setup(width, height);
      await firstEvent(run); await practiceAndSearch(run); await ending(run);
      await Promise.all(run.responses);
      assert.equal(run.row.api.filter(item => item.path === '/api/practice').length, 2);
      assert.ok(run.row.api.filter(item => item.path === '/api/narrate').every(item => item.status === 200 && item.mode === 'fallback'));
      assert.deepEqual(run.row.assetErrors, []); assert.deepEqual(run.row.externalBlocked, []);
      run.row.stage = 'complete'; run.row.passed = true;
    } catch (error) {
      if (run) { run.row.failure = { stage: run.row.stage, message: error.message }; await screenshot(run, 'failure').catch(() => {}); }
      report.errors.push({ case: `${width}x${height}`, message: error.message });
    } finally {
      if (run) { await Promise.all(run.responses); await run.context.close(); contexts.delete(run.context); }
      await save(); console.log(`Cloud local ${width}x${height}: ${run?.row.passed ? 'passed' : 'FAILED'}`);
    }
  }
  report.passed = report.errors.length === 0 && report.cases.length === 2 && report.cases.every(row => row.passed);
} catch (error) { report.errors.push({ message: error.message }); }
finally {
  for (const context of contexts) await context.close().catch(() => {});
  await browser?.close(); report.finishedAt = new Date().toISOString(); await save();
  if (!report.passed) process.exitCode = 1;
  console.log(JSON.stringify({ passed: report.passed, cases: report.cases.map(row => ({ name: row.name, passed: row.passed })), errors: report.errors, report: `${out}/browser.json` }));
}
