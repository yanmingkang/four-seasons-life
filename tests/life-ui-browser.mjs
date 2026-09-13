// Isolated production acceptance. All model/search traffic is intercepted;
// the player's 4173 process and localStorage are never touched.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs/promises';
import {spawn} from 'node:child_process';
import net from 'node:net';
import {once} from 'node:events';
import {setTimeout as delay} from 'node:timers/promises';
import {newGame,land,choose,advance,previewChoice,snapshot} from '../src/engine.js';
import {JOURNEY_STORAGE_KEY} from '../src/journey-storage.js';
import {LEGACY_KEY} from '../src/life-legacy.js';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/25293/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=fileURLToPath(new URL('../',import.meta.url)),out=new URL('../test-results/life-expansion/',import.meta.url);await fs.mkdir(out,{recursive:true});
const p=net.createServer();p.listen(0,'127.0.0.1');await once(p,'listening');const port=p.address().port;await new Promise(r=>p.close(r));const base=`http://127.0.0.1:${port}`;
const child=spawn(process.execPath,['server.mjs','--production'],{cwd:root,windowsHide:true,stdio:'ignore',env:{...process.env,PORT:String(port),ZHIHU_CLI_PATH:'D:/知乎黑客松/four-seasons-life/test-results/no-cli-for-life-qa.exe'}});
let browser;const errors=[],api=[];
function chooseSafely(s){const choices=s.active.options.map((o,i)=>({i,p:previewChoice(s,o)})).filter(x=>!x.p.disabled);return choose(s,choices.sort((a,b)=>b.p.mood-a.p.mood)[0].i);}
function choiceAt13(){let s=newGame('full',{enriched:true});for(const die of [6,6])s=advance(chooseSafely(land(s,die)));return land(s,1);}
function complete(){let s=newGame('full',{enriched:true});while(!s.ended){s=advance(chooseSafely(land(s,1)));}return s;}
function failureRoute(){
  let s=newGame('full',{enriched:true,talent:'ambitious'}),firstOden;
  while(!s.ended){
    s=land(s,1);
    const pick=s.active.options.map((option,i)=>({i,p:previewChoice(s,option),raw:option.mood,fill:option.fillMood})).filter(x=>!x.p.disabled).sort((a,b)=>(!!a.fill)-(!!b.fill)||a.raw-b.raw||a.p.mood-b.p.mood)[0];
    const after=choose(s,pick.i);
    if(!firstOden&&after.life.usedItems.some(item=>item.automatic))firstOden={before:s,index:pick.i,after};
    s=advance(after);
  }
  assert.equal(s.ended,'mood');return {firstOden,finished:s};
}
try{
  for(let i=0;i<100;i++){try{if((await fetch(base+'/api/health')).ok)break;}catch{}await delay(40);}
  browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'});
  await context.route('**/api/**',r=>{api.push(r.request().url());return r.fulfill({json:{mode:'fallback',text:'界面验收预设回顾，不调用真实模型。',available:false,items:[]}});});
  await context.route(base+'/__seed',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>QA fixture</title>'}));
  await context.addInitScript(()=>{localStorage.setItem('four-seasons-auto-depart','off');localStorage.setItem('four-seasons-music','off');});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  async function hudFits(){const stats=await page.locator('.status-strip').boundingBox(),nav=await page.locator('.topbar nav').boundingBox();assert.ok(stats.x+stats.width<=nav.x-2,JSON.stringify({stats,nav}));for(const selector of ['.money-resource','.mood-resource','.exp-resource','.journey-resource']){const box=await page.locator(selector).boundingBox();assert.ok(box.x>=stats.x&&box.x+box.width<=stats.x+stats.width+1,JSON.stringify({selector,box,stats}));}}
  const shot=name=>page.screenshot({path:fileURLToPath(new URL(name+'.png',out)),fullPage:false});
  async function seed(s){await page.goto(base+'/__seed');await page.evaluate(({key,game})=>{localStorage.removeItem('four-seasons-life-legacy-v1');localStorage.setItem(key,JSON.stringify({game,seconds:10}));}, {key:JOURNEY_STORAGE_KEY,game:snapshot(s)});await page.goto(base);await page.locator('#resume').click();}
  await page.goto(base);await page.locator('#start-full').waitFor();assert.ok(!await page.getByText('旧版存档保留',{exact:false}).count());assert.equal(await page.locator('#save-status').innerText(),'');await shot('welcome');
  await seed(choiceAt13());await page.locator('[data-choice="0"]').waitFor();assert.equal(await page.locator('[data-choice]').count(),3);assert.ok(await page.locator('#inventory-button').isVisible());await hudFits();
  const unchanged=await page.locator('#money-value').innerText();await page.locator('#inventory-button').click();assert.equal(await page.locator('[data-use-item]').count(),8);await shot('inventory');await page.locator('[data-use-item="mentor"]').click();assert.ok(await page.locator('.mentor-note').count());assert.equal(await page.locator('#dialog .mentor-options article').count(),3);await page.locator('#dialog-close').click();assert.equal(await page.locator('#money-value').innerText(),unchanged);assert.ok(await page.locator('.decision-area .mentor-note').isVisible());
  await page.locator('#companion-button').click();assert.equal(await page.locator('[data-companion]').count(),3);await page.locator('[data-companion="listen"]').click();assert.equal(await page.locator('[data-companion]:disabled').count(),3);await shot('companion');await page.locator('#dialog-close').click();
  await page.reload();await page.locator('#resume').click();await page.locator('[data-choice="0"]').waitFor();assert.ok(await page.locator('.decision-area .mentor-note').isVisible());await page.locator('#companion-button').click();assert.equal(await page.locator('[data-companion]:disabled').count(),3);await page.locator('#dialog-close').click();
  await page.locator('#look-at-scene').click();await page.locator('.scene-preview canvas').waitFor();await page.waitForTimeout(800);await shot('scene');await page.locator('#dialog-close').click();assert.equal(await page.locator('.scene-preview canvas').count(),0);await shot('choice');
  const calls=api.length;await page.locator('[data-choice="0"]').click();await page.locator('#next-button').waitFor();assert.equal(await page.locator('.reflection-drawer').getAttribute('open'),null);await page.waitForTimeout(200);assert.equal(api.length,calls,'collapsed AI does not call model');await shot('feedback');
  await page.locator('.reflection-drawer summary').click();await page.waitForTimeout(150);assert.equal(api.length,calls+1);assert.ok((await page.locator('.ai-reflection-status').textContent()).length>0);
  await page.setViewportSize({width:844,height:390});await hudFits();await shot('landscape');assert.equal(await page.locator('#orientation-gate').isVisible(),false);await page.locator('#inventory-button').click();assert.equal(await page.locator('.inventory-grid').count(),1);await shot('inventory-landscape');await page.locator('#dialog-close').click();
  await page.setViewportSize({width:667,height:375});await hudFits();await page.locator('#next-button').scrollIntoViewIfNeeded();await shot('narrow-landscape');
  await page.setViewportSize({width:1440,height:900});const finished=complete();assert.equal(finished.phase,'finished');await seed(finished);await page.locator('[data-memory-details]').click();await page.locator('#share-card').waitFor();assert.ok(await page.locator('.life-report').isVisible());assert.equal(await page.locator('[data-review-cell]').count(),10);assert.equal(await page.locator('.ending-season-chapters article').count(),4);await shot('report');
  await page.locator('#share-card').click();await page.locator('.share-preview').waitFor({timeout:15000});assert.match(await page.locator('.share-caption').innerText(),/不是外网试玩地址/);await shot('share');
  const href=await page.locator('a[download]').getAttribute('href');const blob=await page.evaluate(async href=>{const b=await(await fetch(href)).blob();const img=await createImageBitmap(b);return {type:b.type,size:b.size,width:img.width,height:img.height};},href);assert.equal(blob.type,'image/png');assert.equal(blob.width,900);assert.ok(blob.height>1440&&blob.height<10000,`ending PNG height: ${blob.height}`);assert.ok(blob.size>10000);await page.locator('#back-to-report').click();
  const failure=failureRoute();
  await seed(failure.firstOden.before);await page.locator(`[data-choice="${failure.firstOden.index}"]`).click();await page.locator('#next-button').waitFor();
  assert.equal(Number(await page.locator('#mood-value').innerText()),failure.firstOden.after.mood);
  await page.locator('#inventory-button').click();assert.match(await page.locator('.inventory-safety').innerText(),/剩余 1 次守护/);await shot('automatic-oden');await page.locator('#dialog-close').click();
  await seed(failure.finished);await page.locator('[data-memory-details]').click();await page.locator('.ending-reflection.unfinished').waitFor();assert.equal(await page.locator('[data-review-cell]').count(),10);assert.ok(await page.locator('.ending-source-reflection a').count());
  let legacy=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),LEGACY_KEY);assert.equal(legacy.proof.phase,'finished');
  assert.match(await page.locator('#dialog .inheritance-receipt').innerText(),/受挫抗体.*初始情绪与上限 \+10/);await shot('failure-report');
  const downloadEvent=page.waitForEvent('download');await page.locator('#download-note').click();const note=await downloadEvent;const noteText=await fs.readFile(await note.path(),'utf8');assert.match(noteText,/未竟之书/);assert.match(noteText,/10 大关键选择回溯/);
  await page.locator('#share-card').click();await page.locator('.share-preview').waitFor({timeout:15000});assert.match(await page.locator('a[download]').innerText(),/下载人生长图/);await shot('failure-share');await page.locator('#back-to-report').click();
  await page.locator('#dialog-close').click();await page.locator('#new-journey').click();assert.equal(await page.locator('#mood-value').innerText(),'110');assert.equal(await page.locator('#exp-value').innerText(),'10');
  await page.reload();await page.locator('#inherit-next').waitFor();assert.match(await page.locator('.life-inheritance').innerText(),/初始情绪与上限 \+10/);await page.locator('#inherit-next').uncheck();await page.locator('#start-full').click();assert.equal(await page.locator('#mood-value').innerText(),'100');
  const schema1=land(newGame('full',{enriched:true,lifeSchema:1}),6);await seed(schema1);await page.locator('#inventory-button').click();assert.match(await page.locator('.inventory-grid').innerText(),/冰美式/);await page.locator('#dialog-close').click();
  const old=land(newGame('full'),1);await seed(old);assert.equal(await page.locator('#inventory-button').isVisible(),false);assert.equal(await page.locator('[data-choice]').count(),3,'old save stays playable');
  assert.deepEqual(errors,[]);await fs.writeFile(new URL('acceptance.json',out),JSON.stringify({ok:true,errors,interceptedAPICalls:api.length,shareImage:blob,checked:['compact welcome','8 inventory actions','companion','canonical reload','3D vignette lifecycle','three nonspoiler choices','on-demand model','844x390 landscape','ending','portrait PNG+QR','legacy save']},null,2));
  console.log('PASS life expansion browser acceptance: inventory, companion, reload, 3D scene, cards, sharing, landscape and old saves; all AI mocked.');
}finally{await browser?.close();child.kill();}
