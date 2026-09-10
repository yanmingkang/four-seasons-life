// Persistence QA uses a mock world and intercepted APIs, not visual acceptance testing.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { newGame, land, choose, advance, snapshot, restore, previewChoice } from '../src/engine.js';
import { mockWorldSource } from './helpers/mock-world.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'C:/Users/25293/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:4173';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const contexts = [], errors = [];
const storageKey = 'four-seasons-life-v4';

async function setup(entries) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
  contexts.push(context);
  await context.route('**/api/**',route=>route.fulfill({status:503,json:{error:'unmocked_endpoint_blocked_in_test'}}));
  await context.route('**/src/world.js*', route => route.fulfill({ status: 200, contentType: 'text/javascript', body: mockWorldSource }));
  await context.route('**/api/narrate', route => route.fulfill({ json: { mode: 'fallback', model: 'zhida-fast-1p5', text: '存档测试的预设回顾，不消耗模型额度。' } }));
  await context.route('**/api/experience*', route => route.fulfill({ json: { mode: 'curated', items: [] } }));
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base, { waitUntil: 'networkidle' });
  // Seed once, not on every reload: later reloads must read what the app actually saved.
  await page.evaluate(entries => {
    localStorage.setItem('four-seasons-auto-depart', 'off');
    for (const [key, value] of Object.entries(entries)) localStorage.setItem(key, value);
  }, entries);
  await page.reload({ waitUntil: 'networkidle' });
  return page;
}

async function savedGame(page) { return page.evaluate(key => JSON.parse(localStorage.getItem(key)).game, storageKey); }
async function assertResources(page, state) {
  assert.equal(Number((await page.locator('#money-value').textContent()).replace(/[^0-9]/g, '')), state.money);
  assert.equal(Number(await page.locator('#mood-value').textContent()), state.mood);
  assert.equal(Number(await page.locator('#round-value').textContent()), state.turn);
  assert.equal(Number(await page.locator('#exp-value').textContent()),state.exp);
}

try {
  {
    const legacy = JSON.stringify({ game: { version: 1, mode: 'full', phase: 'ready', moves: [], pendingDie: null }, seconds: 15 });
    const previous = JSON.stringify({game:{version:2,mode:'full',phase:'ready',moves:[],pendingDie:null}});
    const v3 = JSON.stringify({game:{...snapshot(newGame('full')),version:3},seconds:19});
    const page = await setup({ 'four-seasons-life-v1': legacy, 'four-seasons-life-v2': previous, 'four-seasons-life-v3': v3 });
    assert.equal(await page.locator('#resume').count(), 0);
    await page.locator('#start-demo').click();
    const game = await savedGame(page);
    assert.equal(game.version, 4); assert.equal(game.mode, 'demo');
    assert.equal(await page.evaluate(() => localStorage.getItem('four-seasons-life-v1')), legacy);
    assert.equal(await page.evaluate(() => localStorage.getItem('four-seasons-life-v2')), previous);
    assert.equal(await page.evaluate(() => localStorage.getItem('four-seasons-life-v3')), v3);
    console.log('PASS v1/v2/v3 remain unchanged and cannot silently become a v4 route');
  }
  {
    const pending=land(newGame('full'),3);
    const oldSlot=JSON.stringify({game:snapshot(pending),seconds:27});
    const page=await setup({'four-seasons-life-v3':oldSlot});
    assert.equal(await page.evaluate(key=>localStorage.getItem(key),storageKey),oldSlot);
    await page.locator('#resume').click();
    await page.locator('#event-heading').waitFor();
    assert.equal(await page.locator('[data-choice]').count(),3);
    await assertResources(page,pending);
    await page.locator('[data-choice="2"]').click();
    assert.deepEqual(restore(await savedGame(page)),choose(pending,2));
    assert.equal(await page.evaluate(()=>localStorage.getItem('four-seasons-life-v3')),oldSlot);
    await page.reload({waitUntil:'networkidle'});
    await page.locator('#resume').click();await page.locator('#next-button').waitFor();
    await assertResources(page,choose(pending,2));
    assert.equal(await page.evaluate(()=>localStorage.getItem('four-seasons-life-v3')),oldSlot);
    console.log('PASS misplaced v4 is copied safely; third-choice progress resumes from new v4 slot');
  }
  {
    const pending = land(advance(choose(land(newGame('demo'), 1), 0)), 3);
    const game = { ...snapshot(pending), money: 999999, mood: 1 };
    const page = await setup({ [storageKey]: JSON.stringify({ game, seconds: 35 }) });
    await page.locator('#resume').click();
    await page.locator('#event-heading').waitFor();
    assert.equal(await page.locator('#event-heading').textContent(), pending.active.title);
    await assertResources(page, pending);
    await page.locator('[data-choice="0"]').click();
    const settled = choose(pending, 0);
    assert.deepEqual(restore(await savedGame(page)), settled);
    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('#resume').click();
    await page.locator('#next-button').waitFor();
    await assertResources(page, settled);
    assert.deepEqual(restore(await savedGame(page)), settled);
    await page.locator('#next-button').click();
    const ready = advance(settled);
    assert.deepEqual(restore(await savedGame(page)), ready);
    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('#resume').click();
    await page.locator('#continue-travel').waitFor({ state: 'visible' });
    await assertResources(page, ready);
    assert.deepEqual(restore(await savedGame(page)), ready);
    console.log('PASS choice → feedback → ready reloads preserve one settlement and continuous route position');
  }
  {
    let state = newGame('full');
    while (!state.ended) {
      const landed=land(state,6);
      const options=landed.active.options.map((o,i)=>({i,...previewChoice(landed,o)})).filter(o=>!o.disabled).sort((a,b)=>b.mood-a.mood);
      state=advance(choose(landed,options[0].i));
    }
    const page = await setup({ [storageKey]: JSON.stringify({ game: snapshot(state), seconds: 180 }) });
    for (let cycle = 0; cycle < 2; cycle++) {
      await page.locator('#resume').click();
      await page.locator('.report-hero').waitFor();
      assert.equal(await page.locator('.history-entry').count(), state.turn);
      assert.match(await page.locator('.report-route').textContent(), /40 \/ 40/);
      await assertResources(page, state);
      assert.deepEqual(restore(await savedGame(page)), state);
      if (!cycle) await page.reload({ waitUntil: 'networkidle' });
    }
    console.log('PASS finished v4 route reopens the same report without replaying another action');
  }
  assert.deepEqual(errors, []);
  console.log('Persistence checks passed with a mock world and zero official API calls.');
} finally {
  await Promise.all(contexts.map(context => context.close().catch(() => {})));
  await browser.close();
}
