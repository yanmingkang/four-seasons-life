// Local real-Canvas acceptance. Business APIs are mocked before navigation.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs/promises';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'C:/Users/25293/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:4173';
const out=new URL('../test-results/',import.meta.url);await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const errors=[];
try{
  const context=await browser.newContext({viewport:{width:1600,height:900},reducedMotion:'reduce'});
  await context.route('**/api/**',r=>r.fulfill({json:{mode:'fallback',text:'测试回顾，不调用模型。',available:false,items:[]}}));
  await context.addInitScript(()=>localStorage.setItem('four-seasons-auto-depart','off'));
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base,{waitUntil:'networkidle'});
  await page.locator('#scene[data-landmark-art="local-sprites"][data-landmark-count="4"]').waitFor();
  await page.locator('#start-full').click();await page.locator('.chapter-continue').click();
  await page.locator('.season-chapter').waitFor({state:'detached'});
  await page.waitForTimeout(80);
  await page.screenshot({path:fileURLToPath(new URL('reference-style-game.png',out))});
  await page.setViewportSize({width:844,height:390});await page.waitForTimeout(80);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.screenshot({path:fileURLToPath(new URL('reference-style-mobile.png',out))});
  await page.setViewportSize({width:1600,height:900});
  await context.route(base+'/__landmark-world',r=>r.fulfill({contentType:'text/html; charset=utf-8',body:'<!doctype html><meta charset="utf-8"><style>body{margin:0}#world{height:100vh;width:100vw;position:relative}.world-location{position:absolute;bottom:18px;left:18px;background:#fff8e3;padding:10px;font:14px system-ui;display:grid;gap:4px}</style><div id="world"></div><dialog id="dialog"></dialog>'}));
  await page.goto(base+'/__landmark-world');
  const mount=()=>page.evaluate(async()=>{const {PixelWorld}=await import('/src/pixel-world.js'),{newGame}=await import('/src/engine.js');window.world=new PixelWorld(document.querySelector('#world'));world.setState(newGame('full'));await world.ready;world.updateCamera(1,true);return {...world.container.dataset};});
  const status=await mount();assert.equal(status.landmarkCount,'4');assert.equal(status.treeArt,'seasonal-sprites');
  const geometry=await page.evaluate(()=>({points:world.route.stations.map(p=>[p.x,p.y]),landmarks:world.art.objects.filter(o=>o.kind==='landmark').map(o=>({id:o.id,x:o.x,y:o.y,width:o.sprite.width,height:o.sprite.height}))}));
  assert.deepEqual(geometry.landmarks.map(o=>o.id).sort(),['bookstall','library','stadium','village']);
  for(const [i,name] of ['library','stadium','village'].entries()){
    await page.evaluate(i=>{world.setState({...world.state,position:i,turn:i,season:0});world.resetView();world.updateCamera(1,true);},i);
    await page.waitForTimeout(60);await page.screenshot({path:fileURLToPath(new URL(`reference-location-${name}.png`,out))});
  }
  await page.evaluate(()=>world.setCameraMode('overview'));await page.waitForTimeout(80);
  await page.screenshot({path:fileURLToPath(new URL('reference-four-seasons.png',out))});
  // Missing image must preserve native houses and the exact route.
  await page.evaluate(()=>world.dispose());await context.route('**/art/life-landmarks-v1.png',r=>r.abort());await page.reload();
  const fallback=await mount();assert.equal(fallback.landmarkArt,'code-fallback');assert.equal(fallback.landmarkCount,'0');
  assert.deepEqual(await page.evaluate(()=>world.route.stations.map(p=>[p.x,p.y])),geometry.points);
  assert.ok(await page.evaluate(()=>world.art.objects.some(o=>o.kind==='house')));
  // Disposed worlds must not receive a late async art mutation.
  await page.evaluate(()=>world.dispose());await context.unroute('**/art/life-landmarks-v1.png');
  await context.route('**/art/life-landmarks-v1.png',async r=>{await new Promise(resolve=>setTimeout(resolve,150));await r.continue();});
  await page.reload();
  const late=await page.evaluate(async()=>{const {PixelWorld}=await import('/src/pixel-world.js');const w=new PixelWorld(document.querySelector('#world')),before=w.art.objects;w.dispose();const result=await w.ready;return {same:before===w.art.objects,result,count:w.container.dataset.landmarkCount};});
  assert.equal(late.same,true);assert.equal(late.result.loaded,0);assert.equal(late.count,undefined);
  assert.deepEqual(errors,[]);
  await fs.writeFile(new URL('landmark-reference-browser.json',out),JSON.stringify({status,geometry,errors,api:'mocked'},null,2));
  console.log('PASS reference landmarks: real alpha atlas, four placements, unchanged route, desktop/mobile, missing-art fallback and late-disposal guard; no real APIs.');
}finally{await browser.close();}
