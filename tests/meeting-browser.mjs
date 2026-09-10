// Real Canvas + meeting UI acceptance against an isolated local production
// process. All remote gameplay APIs are mocked and its official CLI is disabled.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {setTimeout as delay} from 'node:timers/promises';
import {newGame,land,choose,advance,previewChoice,snapshot} from '../src/engine.js';
import {JOURNEY_STORAGE_KEY} from '../src/journey-storage.js';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'C:/Users/25293/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=fileURLToPath(new URL('../',import.meta.url));
const out=new URL('../test-results/',import.meta.url);await fs.mkdir(out,{recursive:true});
async function freePort(){const probe=net.createServer();probe.listen(0,'127.0.0.1');await once(probe,'listening');const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));return [4173,4174,4175,20491].includes(port)?freePort():port;}
const port=await freePort(),base=`http://127.0.0.1:${port}`;
const child=spawn(process.execPath,['server.mjs','--production'],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,PORT:String(port),GAME_DIST_ROOT:path.join(root,'dist'),ZHIHU_CLI_PATH:path.join(root,'test-results','intentionally-missing-cli-meeting.exe')}});
let childOutput='',childFailure='',browser;
child.stdout.on('data',chunk=>{childOutput+=chunk;});child.stderr.on('data',chunk=>{childFailure+=chunk;});
const errors=[];
async function shot(page,name){await page.screenshot({path:fileURLToPath(new URL(name+'.png',out))});}
async function bounded(page,selector){const box=await page.locator(selector).boundingBox(),vp=page.viewportSize();assert.ok(box&&box.x>=0&&box.y>=0&&box.x+box.width<=vp.width+1&&box.y+box.height<=vp.height+1,JSON.stringify({selector,box,vp}));}
try{
  for(let attempt=0;attempt<100&&!childOutput.includes(base);attempt++){if(child.exitCode!==null)throw new Error(`Isolated meeting server exited: ${childFailure}`);await delay(20);}
  assert.ok(childOutput.includes(base),'Own production process started');
  assert.equal((await(await fetch(base+'/api/ai/status')).json()).configured,false,'Official CLI is disabled for acceptance');
  browser=await chromium.launch({channel:'chrome',headless:true});
  const context=await browser.newContext({viewport:{width:1600,height:900},reducedMotion:'reduce'});
  await context.route(base+'/__meeting-seed',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>Local acceptance fixture</title>'}));
  await context.addInitScript(()=>localStorage.setItem('four-seasons-auto-depart','off'));
  await context.route('**/api/**',route=>route.fulfill({json:route.request().url().includes('narrate')?{mode:'fallback',text:'界面验收：本段为测试回顾，不消耗模型额度。'}:{mode:'curated',items:[],available:false}}));
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base,{waitUntil:'networkidle'});await page.locator('#scene[data-renderer="pixel"][data-assets="ready"][data-tree-art="seasonal-sprites"]').waitFor({timeout:15000});
  assert.equal(await page.locator('#scene canvas').count(),1);
  await bounded(page,'#story-panel');await bounded(page,'.status-strip');
  await shot(page,'meeting-welcome-desktop');
  await page.locator('#character-name').fill('四季体验员');await page.locator('input[value="ambitious"]').check();await page.locator('#start-full').click();
  await page.locator('#view-overview').click();await page.waitForTimeout(500);await shot(page,'meeting-map-desktop');
  assert.equal(await page.locator('#player-name').textContent(),'四季体验员');
  let pending=newGame('full',{name:'四季体验员',talent:'ambitious'});
  for(const die of [6,6]){const landed=land(pending,die);const choice=landed.active.options.map((o,i)=>({i,...previewChoice(landed,o)})).filter(o=>!o.disabled).sort((a,b)=>b.mood-a.mood)[0];pending=advance(choose(landed,choice.i));}
  pending=land(pending,1);assert.equal(pending.position,12);
  await page.goto(base+'/__meeting-seed');
  await page.evaluate(({game,key})=>localStorage.setItem(key,JSON.stringify({game,seconds:120})),{game:snapshot(pending),key:JOURNEY_STORAGE_KEY});
  await page.goto(base,{waitUntil:'networkidle'});await page.locator('#resume').click();await page.locator('#event-heading').waitFor();await shot(page,'meeting-choice-desktop');
  assert.equal(await page.locator('[data-choice]').count(),3);await bounded(page,'#story-panel');
  assert.doesNotMatch(await page.locator('.options').innerHTML(),/choice-effects|fatal-hint|条件已满足|条件未满足|[+−-]\s*\d/,'No resource or threshold spoilers before choosing');
  await page.emulateMedia({reducedMotion:'no-preference'});await page.locator('[data-choice="0"]').click();
  await page.locator('.burst-heart.loss').waitFor();assert.equal(await page.locator('.burst-heart.loss .resource-particle').count(),5);
  await shot(page,'meeting-feedback-desktop');await page.waitForTimeout(1600);assert.equal(await page.locator('.resource-burst').count(),0);
  await page.emulateMedia({reducedMotion:'reduce'});await page.setViewportSize({width:844,height:390});await page.waitForTimeout(250);await bounded(page,'#story-panel');await bounded(page,'.status-strip');await shot(page,'meeting-feedback-landscape');
  await page.setViewportSize({width:667,height:375});await page.waitForTimeout(150);await bounded(page,'#story-panel');await bounded(page,'.status-strip');await bounded(page,'.exp-resource');await bounded(page,'.journey-resource');
  await page.setViewportSize({width:844,height:390});
  await page.locator('#rules-button').click();assert.equal(await page.locator('#dialog').evaluate(d=>d.open),true);
  const before=await page.evaluate(key=>localStorage.getItem(key),JOURNEY_STORAGE_KEY);
  await page.setViewportSize({width:390,height:844});await page.locator('#orientation-gate').waitFor();assert.equal(await page.locator('#dialog').evaluate(d=>d.open),false);await shot(page,'meeting-rotate-prompt');
  await page.waitForTimeout(800);assert.equal(await page.evaluate(key=>localStorage.getItem(key),JOURNEY_STORAGE_KEY),before);
  await page.setViewportSize({width:1024,height:1366});await page.locator('#orientation-gate').waitFor();assert.equal(await page.locator('#overlay-shell').evaluate(e=>e.inert),true);
  await page.setViewportSize({width:844,height:390});await page.waitForFunction(()=>document.querySelector('#dialog').open,{},{timeout:10000});await page.locator('#dialog-close').click();
  await page.setViewportSize({width:1600,height:900});await page.emulateMedia({reducedMotion:'reduce'});
  let ending=newGame('full',{name:'四季体验员',talent:'optimistic'});
  while(!ending.ended){const landed=land(ending,1);const selected=landed.active.options.map((o,i)=>({i,...previewChoice(landed,o)})).filter(o=>!o.disabled).sort((a,b)=>b.mood-a.mood)[0];ending=advance(choose(landed,selected.i));}
  assert.equal(ending.ended,'complete');assert.equal(ending.turn,40);assert.equal(ending.moodMax,110);
  await page.goto(base+'/__meeting-seed');await page.evaluate(({game,key})=>localStorage.setItem(key,JSON.stringify({game,seconds:480})),{game:snapshot(ending),key:JOURNEY_STORAGE_KEY});await page.goto(base,{waitUntil:'networkidle'});await page.locator('#resume').click();await page.locator('.report-hero').waitFor();
  assert.equal(await page.locator('.history-entry').count(),40);assert.match(await page.locator('.report-numbers').textContent(),/110/);assert.equal(await page.locator('.life-chart').count(),1);await shot(page,'meeting-summary-desktop');
  assert.deepEqual(errors,[]);console.log('PASS real Canvas seasonal sprites, welcome/map, name/talent, three spoiler-free choices, broken-heart cleanup, wide/narrow layouts, modal-safe rotation pause, v4 save, 40-turn report and dynamic mood max. All APIs mocked; official CLI disabled.');
  await context.close();
}finally{await browser?.close();if(child.exitCode===null){const exited=once(child,'exit');child.kill();await exited;}}
