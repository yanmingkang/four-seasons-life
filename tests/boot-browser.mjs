// First-load production QA. All services are private loopback processes; browser
// APIs are mocked and the official CLI is disabled. No shared playtest is touched.
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import fs from 'node:fs/promises';
import path from 'node:path';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { newGame, snapshot } from '../src/engine.js';
import { JOURNEY_STORAGE_KEY } from '../src/journey-storage.js';
import { createShareGateway } from '../server/share-gateway.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const out = path.join(root, 'test-results');
const forbiddenPorts = new Set([4173, 4174, 4175, 20491]);
async function freePort() {
  const probe = net.createServer();
  probe.listen(0, '127.0.0.1'); await once(probe, 'listening');
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  return forbiddenPorts.has(port) ? freePort() : port;
}
const original = JSON.stringify({ game: snapshot(newGame('full', { name: '启动验收保留存档', talent: 'optimistic' })), seconds: 73 });
const sentinels = {
  [JOURNEY_STORAGE_KEY]: original,
  'four-seasons-life-v3': '{"legacy":"preserve these exact bytes"}',
  'four-seasons-auto-depart': 'off',
  'four-seasons-music': 'off',
  'boot-test-unrelated': 'keep: 启动重试不清空本机数据',
};
const report = { passed: false, officialApiCalls: 0, mockApiCalls: [], unmockedBrowserApiRequests: [], cases: [] };
let child, fixture, gateway, browser, fault = null;
let childOutput = '', childErrors = '';

async function assertStored(page) {
  const actual = await page.evaluate(keys => Object.fromEntries(keys.map(key => [key, localStorage.getItem(key)])), Object.keys(sentinels));
  assert.deepEqual(actual, sentinels, 'Existing localStorage must survive boot and manual reload byte-for-byte');
}
async function assertReady(page, { watchdog = true } = {}) {
  await page.locator('#boot-screen').waitFor({ state: 'hidden' });
  await page.locator('#start-full').waitFor();
  const state = await page.evaluate(() => ({
    hidden: document.querySelector('#boot-screen').hidden,
    boot: document.querySelector('#boot-screen').dataset.state,
    inert: document.querySelector('#app').inert,
    busy: document.querySelector('#app').hasAttribute('aria-busy'),
    startWired: typeof document.querySelector('#start-full').onclick === 'function',
    sampleWired: typeof document.querySelector('#start-sample').onclick === 'function',
    stage: document.querySelector('.experience').dataset.stage,
  }));
  assert.equal(state.hidden, true); assert.equal(state.inert, false); assert.equal(state.busy, false);
  assert.equal(state.startWired, true); assert.equal(state.sampleWired, true);
  assert.equal(state.stage, 'welcome', 'Reload must not automatically start or resume a journey');
  if (watchdog) assert.equal(state.boot, 'ready');
  await assertStored(page);
  return state;
}
async function assertFailure(page) {
  await page.locator('#boot-screen[data-state="error"]').waitFor();
  assert.equal(await page.locator('#boot-screen').isVisible(), true);
  assert.equal(await page.locator('#boot-retry').isVisible(), true);
  assert.equal(await page.locator('#app').evaluate(node => node.inert), true);
  assert.equal(await page.locator('#app').getAttribute('aria-busy'), 'true');
  assert.match(await page.locator('#boot-title').innerText(), /暂时没有打开/);
  await assertStored(page);
}
async function retry(page) {
  fault = null;
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
    page.locator('#boot-retry').click(),
  ]);
  return assertReady(page);
}

try {
  await fs.mkdir(out, { recursive: true });
  const index = await fs.readFile(path.join(root, 'dist', 'index.html'), 'utf8');
  const entryPath = index.match(/<script[^>]+type="module"[^>]+src="([^"]+)"/)[1];
  const entrySource = await fs.readFile(path.join(root, 'dist', entryPath), 'utf8');
  const importedMain = entrySource.match(/import\([`'"](\.\/main-[^`'"]+\.js)[`'"]\)/)?.[1];
  assert.ok(importedMain, 'Build must keep the recoverable dynamic main import');
  const mainPath = new URL(importedMain, `http://fixture${entryPath}`).pathname;
  const mainSource = await fs.readFile(path.join(root, 'dist', mainPath), 'utf8');
  report.assets = { entry: entryPath, main: mainPath };
  const productionPort = await freePort(), productionOrigin = `http://127.0.0.1:${productionPort}`;
  child = spawn(process.execPath, ['server.mjs', '--production'], {
    cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT: String(productionPort), GAME_DIST_ROOT: path.join(root, 'dist'), ZHIHU_CLI_PATH: path.join(out, 'intentionally-missing-cli-boot-test.exe') },
  });
  child.stdout.on('data', chunk => { childOutput += chunk; });
  child.stderr.on('data', chunk => { childErrors += chunk; });
  for (let attempt = 0; attempt < 100 && !childOutput.includes(productionOrigin); attempt++) {
    if (child.exitCode !== null) throw new Error(`Own production process exited: ${childErrors}`);
    await delay(40);
  }
  assert.ok(childOutput.includes(productionOrigin), 'Own production process started');
  const status = await (await fetch(`${productionOrigin}/api/ai/status`)).json();
  assert.equal(status.configured, false, 'Official CLI must be unavailable in this test process');

  // Native HTTP fault injection keeps binary asset downloads outside Playwright
  // routing, which has produced unrelated ERR_ABORTED responses with this gateway.
  fixture = http.createServer(async (req, res) => {
    try {
      const pathname = new URL(req.url, productionOrigin).pathname;
      if (pathname.startsWith('/api/')) {
        report.unmockedBrowserApiRequests.push(pathname);
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end('{"error":"Business APIs isolated by boot test"}'); return;
      }
      const active = fault?.path === pathname ? fault : null;
      if (active) {
        active.requests++;
        if (active.kind === 'hold') await active.gate;
        else if (active.kind === '404') { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('Boot test missing module'); return; }
        else if (active.kind === 'runtime') {
          res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' });
          // Real main renders and wires its controls, then its import rejects.
          res.end(`${mainSource}\nawait Promise.reject(new Error('BOOT_RUNTIME_FIXTURE'));\n`); return;
        }
      }
      if (res.destroyed) return;
      const upstream = http.request(`${productionOrigin}${req.url}`, { method: req.method, agent: false }, response => {
        res.writeHead(response.statusCode, response.headers); response.pipe(res);
        response.on('error', () => res.destroy());
      });
      upstream.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end(); });
      res.on('close', () => upstream.destroy());
      req.pipe(upstream);
    } catch { if (!res.headersSent) res.writeHead(500); res.end(); }
  });
  const fixturePort = await freePort();
  fixture.listen(fixturePort, '127.0.0.1'); await once(fixture, 'listening');
  const base = `http://127.0.0.1:${fixturePort}`;
  gateway = createShareGateway({ passcode: 'local-boot-fixture-only', upstream: base, secureCookies: false });
  const gatewayPort = await freePort();
  gateway.listen(gatewayPort, '127.0.0.1'); await once(gateway, 'listening');
  const secureBase = `http://127.0.0.1:${gatewayPort}`;
  const require = createRequire(import.meta.url);
  const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'C:/Users/25293/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
  browser = await chromium.launch({ channel: 'chrome', headless: true });

  async function run(name, body, { strictCsp = false } = {}) {
    const origin = strictCsp ? secureBase : base;
    const context = await browser.newContext({
      viewport: { width: 1365, height: 900 }, reducedMotion: 'reduce',
      // Seed once in the context, so a retry cannot hide deletion by reseeding.
      storageState: { cookies: [], origins: [{ origin, localStorage: Object.entries(sentinels).map(([name, value]) => ({ name, value })) }] },
    });
    const result = { name, passed: false, pageErrors: [], cspViolations: [] };
    report.cases.push(result);
    await context.exposeBinding('__bootMockApi', (_source, pathname) => {
      report.mockApiCalls.push({ case: name, pathname });
      return pathname === '/api/experience' ? { mode: 'curated', items: [] } : { configured: false, available: false, mode: 'test', ok: true };
    });
    await context.addInitScript(() => {
      window.__bootCspViolations = [];
      document.addEventListener('securitypolicyviolation', event => window.__bootCspViolations.push({ directive: event.effectiveDirective, blocked: event.blockedURI }));
      const nativeFetch = window.fetch.bind(window);
      window.fetch = async (input, init) => {
        const url = new URL(typeof input === 'string' ? input : input.url || String(input), location.href);
        if (!url.pathname.startsWith('/api/')) return nativeFetch(input, init);
        return new Response(JSON.stringify(await window.__bootMockApi(url.pathname)), { status: 200, headers: { 'Content-Type': 'application/json' } });
      };
    });
    const page = await context.newPage(); page.setDefaultTimeout(15000);
    page.on('pageerror', error => result.pageErrors.push(error.message));
    let documentLoads = 0;
    page.on('framenavigated', frame => { if (frame === page.mainFrame() && new URL(frame.url()).pathname === '/') documentLoads++; });
    try {
      if (strictCsp) {
        const login = await context.request.post(`${origin}/__share/login`, {
          form: { code: 'local-boot-fixture-only' }, headers: { Origin: origin }, maxRedirects: 0,
        });
        assert.equal(login.status(), 303);
      }
      await body({ page, result, origin, documentLoads: () => documentLoads });
      result.cspViolations = await page.evaluate(() => window.__bootCspViolations);
      assert.deepEqual(result.pageErrors, []);
      assert.deepEqual(result.cspViolations, []);
      assert.deepEqual(report.unmockedBrowserApiRequests, []);
      result.passed = true;
    } catch (error) {
      result.failure = error.stack || error.message;
      await page.screenshot({ path: path.join(out, `boot-${name}-failure.png`) }).catch(() => {});
    } finally {
      fault?.release?.(); fault = null;
      await context.close();
    }
    console.log(`${result.passed ? 'PASS' : 'FAIL'} ${name}${result.failure ? `: ${result.failure.split('\n')[0]}` : ''}`);
  }

  await run('normal-ready', async ({ page, result, origin }) => {
    const began = performance.now();
    await page.goto(origin, { waitUntil: 'domcontentloaded' });
    result.ready = await assertReady(page); result.firstReadyMs = Math.round(performance.now() - began);
    await page.locator('#rules-button').click(); assert.equal(await page.locator('#dialog').evaluate(node => node.open), true);
    await page.keyboard.press('Escape');
    await page.locator('#start-sample').click(); await page.locator('[data-sample-stage="choice"]').waitFor();
    assert.equal(await page.locator('[data-choice]').count(), 3); await assertStored(page);
    result.welcomeControlsWorked = true;
  });

  await run('slow-then-recovers', async ({ page, result, origin, documentLoads }) => {
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    fault = { path: mainPath, kind: 'hold', gate, release, requests: 0 };
    const began = performance.now();
    await page.goto(origin, { waitUntil: 'domcontentloaded' });
    await page.locator('#boot-screen[data-state="slow"]').waitFor({ timeout: 10000 });
    result.slowShownMs = Math.round(performance.now() - began);
    assert.ok(result.slowShownMs >= 5900, 'Exercise the real six-second watchdog');
    assert.ok(fault.requests >= 1); assert.equal(await page.locator('#boot-screen').isVisible(), true);
    assert.equal(await page.locator('#boot-retry').isVisible(), true);
    assert.equal(await page.locator('#app').evaluate(node => node.inert), true);
    assert.match(await page.locator('#boot-detail').innerText(), /继续等待/);
    await page.screenshot({ path: path.join(out, 'boot-slow.png') });
    release(); result.ready = await assertReady(page);
    assert.equal(documentLoads(), 1, 'Recovery must not reload the page');
    result.recoveredWithoutReload = true;
  });

  for (const [name, asset, kind, strictCsp] of [
    ['entry-404-manual-retry', entryPath, '404', false],
    ['main-404-manual-retry', mainPath, '404', false],
    ['runtime-rejection-manual-retry', mainPath, 'runtime', false],
    ['strict-csp-runtime-retry', mainPath, 'runtime', true],
  ]) {
    await run(name, async ({ page, result, origin, documentLoads }) => {
      fault = { path: asset, kind, requests: 0 };
      const response = await page.goto(origin, { waitUntil: 'domcontentloaded' });
      if (strictCsp) {
        result.csp = response.headers()['content-security-policy'];
        assert.match(result.csp, /(?:^|;\s*)script-src 'self';/);
      }
      await assertFailure(page); assert.ok(fault.requests >= 1);
      if (kind === 'runtime') {
        assert.equal(await page.locator('#start-full').evaluate(node => typeof node.onclick), 'function');
        result.partialMainRemainedInert = true;
      }
      const initialLoads = documentLoads(); await page.waitForTimeout(250);
      assert.equal(documentLoads(), initialLoads, 'Failure must wait for explicit manual reload');
      await page.screenshot({ path: path.join(out, `boot-${name}.png`) });
      result.readyAfterRetry = await retry(page);
      assert.equal(documentLoads(), initialLoads + 1);
      result.preservedStorage = true;
    }, { strictCsp });
  }

  await run('missing-watchdog-entry-success', async ({ page, result, origin }) => {
    fault = { path: '/boot-watchdog.js', kind: '404', requests: 0 };
    await page.goto(origin, { waitUntil: 'domcontentloaded' });
    result.ready = await assertReady(page, { watchdog: false });
    assert.ok(fault.requests >= 1);
    assert.equal(await page.evaluate(() => typeof window.__fourSeasonsBoot), 'undefined');
    await page.locator('#rules-button').click();
    assert.equal(await page.locator('#dialog').evaluate(node => node.open), true);
  });

  await run('strict-csp-ready', async ({ page, result, origin }) => {
    const response = await page.goto(origin, { waitUntil: 'domcontentloaded' });
    result.csp = response.headers()['content-security-policy'];
    assert.match(result.csp, /(?:^|;\s*)script-src 'self';/);
    result.ready = await assertReady(page);
    await page.locator('#start-sample').click(); await page.locator('[data-sample-stage="choice"]').waitFor();
    await assertStored(page);
    await page.screenshot({ path: path.join(out, 'boot-strict-csp-ready.png') });
  }, { strictCsp: true });

  assert.equal(report.cases.filter(result => !result.passed).length, 0, 'Every boot acceptance case must pass');
  assert.deepEqual(report.unmockedBrowserApiRequests, []);
  report.passed = true;
} catch (error) {
  report.failure = error.stack || error.message;
  process.exitCode = 1;
} finally {
  fault?.release?.();
  await browser?.close();
  for (const server of [gateway, fixture]) if (server) {
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  }
  if (child && child.exitCode === null) { const exited = once(child, 'exit'); child.kill(); await exited; }
  await fs.mkdir(out, { recursive: true });
  await fs.writeFile(path.join(out, 'boot-browser.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
