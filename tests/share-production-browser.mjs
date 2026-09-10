// Independent local production + gateway QA. Never uses the sharing configuration
// or live credentials; the official CLI is disabled and AI requests are mocked.
import http from 'node:http';
import net from 'node:net';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { setTimeout as delay } from 'node:timers/promises';
import assert from 'node:assert/strict';
import { createShareGateway } from '../server/share-gateway.mjs';
import { SAVE_VERSION } from '../src/engine.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const out = path.join(root, 'test-results');
await fs.mkdir(out, { recursive: true });
const forbiddenPorts = new Set([4173, 4174, 4175, 20491]);
async function freePort() {
  const probe = net.createServer(); probe.listen(0, '127.0.0.1'); await once(probe, 'listening');
  const port = probe.address().port; await new Promise(resolve => probe.close(resolve));
  return forbiddenPorts.has(port) ? freePort() : port;
}
const productionPort = await freePort(), productionOrigin = `http://127.0.0.1:${productionPort}`;
const child = spawn(process.execPath, ['server.mjs', '--production'], {
  cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, PORT: String(productionPort), GAME_DIST_ROOT: path.join(root, 'dist'), ZHIHU_CLI_PATH: path.join(out, 'intentionally-missing-cli-share-production.exe') },
});
let childOutput = '', childFailure = '';
child.stdout.on('data', chunk => { childOutput += chunk; }); child.stderr.on('data', chunk => { childFailure += chunk; });
const passcode = 'local-production-fixture-only';
let gateway, browser;
const report = { officialApiCalls: 0, mockAiCalls: 0, unmockedBrowserApiRequests: [], assetResponses: [], assetErrors: [], pageErrors: [], chunkedAssets: [] };
try {
  for (let attempt = 0; attempt < 100 && !childOutput.includes(productionOrigin); attempt++) {
    if (child.exitCode !== null) throw new Error(`Isolated production server exited: ${childFailure}`);
    await delay(20);
  }
  assert.ok(childOutput.includes(productionOrigin), 'Own production process started');
  const status = await (await fetch(`${productionOrigin}/api/ai/status`)).json(); assert.equal(status.configured, false);
  const index = await fs.readFile(path.join(root, 'dist', 'index.html'), 'utf8');
  const scriptPath = index.match(/src="(\/assets\/[^" ]+\.js)"/)[1];
  const assetRoot=path.join(root,'dist','assets');
  const bundle=(await Promise.all((await fs.readdir(assetRoot)).filter(name=>name.endsWith('.js')).map(name=>fs.readFile(path.join(assetRoot,name),'utf8')))).join('\n');
  report.bundle = scriptPath;
  assert.ok(bundle.includes('/art/season-trees-v2.png'), 'Build includes the delivered seasonal-tree atlas integration');
  gateway = createShareGateway({ passcode, upstream: productionOrigin, secureCookies: false });
  gateway.listen(0, '127.0.0.1'); await once(gateway, 'listening');
  const gatewayPort = gateway.address().port; assert.ok(!forbiddenPorts.has(gatewayPort));
  const base = `http://127.0.0.1:${gatewayPort}`;
  const require = createRequire(import.meta.url);
  const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'C:/Users/25293/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1365, height: 900 }, reducedMotion: 'reduce' });
  await context.addInitScript(() => { crypto.getRandomValues = array => { array[0] = 1073741824; return array; }; });
  await context.exposeBinding('__recordMockNarration', (_source, payload) => {
    assert.equal(payload.game.version, SAVE_VERSION); report.mockAiCalls++;
    return { mode: 'live', model: 'zhida-fast-1p5', text: '本地测试回响：在资金、情绪与专业之间，你做出了自己的选择。这里是模拟回答，没有调用官方模型。' };
  });
  // Keep static downloads native. Chromium + Playwright routing through this
  // local gateway produced spurious ERR_ABORTED after complete binary reads.
  // The byte-level diagnosis is preserved in diagnose-production-assets.mjs.
  await context.addInitScript(() => {
    const nativeFetch=window.fetch.bind(window);
    window.fetch=async (input,init)=>{
      const url=new URL(typeof input==='string'?input:input.url||String(input),location.href);
      if(url.origin!==location.origin||!url.pathname.startsWith('/api/'))return nativeFetch(input,init);
      let body;
      if(url.pathname==='/api/narrate')body=await window.__recordMockNarration(await new Request(input,init).json());
      else if(url.pathname==='/api/experience')body={mode:'curated',items:[]};
      else body={configured:false,mode:'test',ok:true};
      return new Response(JSON.stringify(body),{status:200,headers:{'Content-Type':'application/json'}});
    };
  });
  const page = await context.newPage();
  page.on('pageerror', error => report.pageErrors.push(error.message));
  const isAsset = url => /^\/(?:assets|art|characters|cinematics)\//.test(new URL(url).pathname);
  page.on('request', request => { if (new URL(request.url()).pathname.startsWith('/api/')) report.unmockedBrowserApiRequests.push(request.url()); });
  page.on('response', response => {
    if (!isAsset(response.url())) return;
    const item = { path: new URL(response.url()).pathname, status: response.status(), type: response.headers()['content-type'] };
    report.assetResponses.push(item); if (!response.ok()) report.assetErrors.push(item);
  });
  page.on('requestfailed', request => { if (isAsset(request.url())) report.assetErrors.push({ path: new URL(request.url()).pathname, error: request.failure()?.errorText }); });
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  assert.equal(new URL(page.url()).pathname, '/__share/login');
  await page.locator('input[name="code"]').fill(passcode);
  await Promise.all([page.waitForURL(`${base}/`), page.locator('button[type="submit"]').click()]);
  await page.locator('#start-demo').waitFor({ timeout: 60000 });
  await page.locator('#scene[data-renderer="pixel"][data-assets="ready"][data-tree-art="seasonal-sprites"]').waitFor({ timeout: 15000 });
  report.scene = await page.locator('#scene').evaluate(node => ({ ...node.dataset }));
  assert.equal(report.scene.renderer, 'pixel'); assert.equal(report.scene.assets, 'ready');
  assert.ok(Number(report.scene.treeSpriteCount) > 0, 'Generated sprites are used in the rendered scene');
  assert.equal(await page.locator('#scene canvas.pixel-world-canvas').count(), 1);
  const canvas = await page.locator('#scene canvas').evaluate(node => ({ width: node.width, height: node.height, smoothing: node.getContext('2d').imageSmoothingEnabled }));
  assert.ok(canvas.width > 0 && canvas.height > 0); assert.equal(canvas.smoothing, false); report.canvas = canvas;
  assert.ok(report.assetResponses.some(item => item.path === '/art/season-trees-v2.png' && item.status === 200 && item.type === 'image/png'), 'Authenticated browser actually downloaded the delivered PNG, with no hidden fallback');
  await page.screenshot({ path: path.join(out, 'share-production-local-welcome.png') });
  // Exercise the exact empty-chunked conversion against actual production bytes.
  const cookies = await context.cookies(base), cookie = cookies.map(value => `${value.name}=${value.value}`).join('; ');
  for (const assetPath of ['/art/season-trees-v2.png', '/characters/wave.gif', scriptPath]) {
    const result = await new Promise((resolve, reject) => {
      const req = http.request(`${base}${assetPath}`, { headers: { cookie, 'transfer-encoding': 'chunked' }, agent: false }, res => {
        let bytes = 0; res.on('data', chunk => { bytes += chunk.length; }); res.on('end', () => resolve({ path: assetPath, status: res.statusCode, bytes }));
      }); req.on('error', reject); req.end();
    });
    assert.equal(result.status, 200); assert.ok(result.bytes > 0); report.chunkedAssets.push(result);
  }
  const atlasHead = await fetch(`${base}/art/season-trees-v2.png`, { method: 'HEAD', headers: { cookie } });
  assert.equal(atlasHead.status, 200); assert.equal(atlasHead.headers.get('content-type'), 'image/png');
  assert.equal((await atlasHead.arrayBuffer()).byteLength, 0);
  assert.ok(Number(atlasHead.headers.get('content-length')) > 0);
  await page.locator('#start-demo').click(); await page.locator('#event-heading').waitFor({ timeout: 60000 });
  report.question = await page.locator('#event-heading').textContent(); report.choiceCount = await page.locator('[data-choice]').count();
  assert.equal(report.choiceCount, 3);
  const choiceMarkup = await page.locator('.options').innerHTML();
  assert.doesNotMatch(choiceMarkup, /choice-effects|fatal-hint|条件已满足|条件未满足|[+−-]\s*\d/, 'Choices do not reveal resource deltas or threshold branches');
  await page.locator('#story-panel').evaluate(panel => Promise.all(panel.getAnimations().map(animation => animation.finished.catch(() => {}))));
  await page.screenshot({ path: path.join(out, 'share-production-local-question.png') });
  await page.locator('[data-choice="0"]').click(); await page.locator('.reflection-drawer > summary').click(); await page.locator('[data-ai-kind="event"][data-mode="live"]').waitFor();
  assert.equal(report.mockAiCalls, 1);
  await page.screenshot({ path: path.join(out, 'share-production-local-feedback.png') });
  assert.deepEqual(report.assetErrors, []); assert.deepEqual(report.pageErrors, []); assert.deepEqual(report.unmockedBrowserApiRequests, []);
  report.passed = true;
  console.log(JSON.stringify({ ...report, assetResponses: `${report.assetResponses.length} successful static requests` }, null, 2));
} catch (error) { report.passed = false; report.failure = error.message; throw error; }
finally {
  await fs.writeFile(path.join(out, 'share-production-local.json'), JSON.stringify(report, null, 2));
  await browser?.close();
  if (gateway) { gateway.closeAllConnections(); await new Promise(resolve => gateway.close(resolve)); }
  if (child.exitCode === null) { const exited = once(child, 'exit'); child.kill(); await exited; }
}
