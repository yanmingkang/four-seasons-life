import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';

// Isolated static harness: never starts the game server or sends model/API traffic.
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'C:/Users/25293/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const project=new URL('../',import.meta.url),out=new URL('../test-results/',import.meta.url);
await mkdir(out,{recursive:true});
const manifestText=await readFile(new URL('src/cinematic-manifest.js',project),'utf8');
const requests=[];
const harness=`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/src/cinematics.css"><style>html,body{margin:0;width:100%;height:100%;font-family:system-ui,sans-serif;background:#b2c7a5}#layer{position:fixed;inset:0}#layer[hidden]{display:none}</style><body><button id="before">棋盘</button><div id="layer" hidden></div><script type="module">import * as api from '/src/cinematics.js';window.cine=api;window.paused=false;window.current=true;window.start=(event,options={})=>{window.done=null;window.startedAt=performance.now();window.result=api.playCinematic(document.querySelector('#layer'),event,{isCurrent:()=>window.current,isPaused:()=>window.paused,reducedMotion:false,...options}).then(result=>window.done={...result,elapsed:performance.now()-window.startedAt});};</script></body></html>`;
const server=createServer(async(req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;requests.push(pathname);
  if(pathname==='/'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(harness);return;}
  const allowed=new Map([
    ['/src/cinematics.js','text/javascript'],['/src/cinematic-manifest.js','text/javascript'],['/src/cinematics.css','text/css'],['/characters/idle.gif','image/gif'],
  ]);
  if(!allowed.has(pathname)){res.writeHead(404);res.end('Not found');return;}
  const source=pathname.startsWith('/characters/')?`public${pathname}`:pathname.slice(1);
  try{const data=await readFile(new URL(source,project));res.writeHead(200,{'Content-Type':allowed.get(pathname)});res.end(data);}catch{res.writeHead(500);res.end('Asset unavailable');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({channel:'chrome',headless:true});
const contexts=[];
async function setup({width=1440,height=900,video=false,mediaScript}={}){
  const context=await browser.newContext({viewport:{width,height}});contexts.push(context);
  if(video)await context.route('**/src/cinematic-manifest.js',route=>route.fulfill({status:200,contentType:'text/javascript',body:manifestText.replace('durationMs:4000,src:null','durationMs:4000,src:item.cell===6?"/cinematics/test.mp4":null')}));
  if(mediaScript)await context.addInitScript(mediaScript);
  const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(base);await page.waitForFunction(()=>window.cine);return {page,errors,context};
}
try{
  {
    const {page,errors}=await setup();
    for(const cell of [6,11,13,15,18,22,27,31]){
      await page.evaluate(cell=>window.start({cinematicId:`cell-${String(cell).padStart(2,'0')}`}),cell);
      await page.locator('.cine-placeholder-label').filter({hasText:'正式动画待替换'}).waitFor();
      assert.equal(await page.locator('.cine-video').count(),0);
      assert.ok(await page.locator('.cine-furniture .cine-prop').count()>=2);
      await page.waitForTimeout(cell===6?900:80);
      if(cell===6)await page.screenshot({path:fileURLToPath(new URL('cinematic-meeting-desktop.png',out))});
      await page.getByRole('button',{name:'跳过，进入选择'}).click();
      await page.waitForFunction(()=>window.done);
      assert.equal((await page.evaluate(()=>window.done)).status,'skipped');
      assert.equal(await page.locator('#layer').isVisible(),false);
      assert.equal(await page.locator('.cinematic').count(),0);
    }
    assert.equal(requests.some(path=>path.startsWith('/cinematics/')),false);assert.deepEqual(errors,[]);
    console.log('PASS eight distinct storyboards, labelled placeholders, accessible skip and zero video requests');
    await page.evaluate(()=>window.start(6));await page.waitForFunction(()=>window.done,null,{timeout:6500});
    const done=await page.evaluate(()=>window.done);assert.equal(done.status,'completed');assert.ok(done.elapsed>=3900&&done.elapsed<=5500,JSON.stringify(done));
    console.log('PASS default cutscene completes in four seconds');
    await page.evaluate(()=>window.start(8));await page.waitForFunction(()=>window.done);assert.equal((await page.evaluate(()=>window.done)).status,'not-found');
    await page.evaluate(()=>window.start(6,{reducedMotion:true}));await page.waitForFunction(()=>window.done);assert.equal((await page.evaluate(()=>window.done)).reason,'reduced-motion');
    assert.equal(await page.locator('.cinematic').count(),0);
    console.log('PASS normal cells and reduced-motion setting bypass footage');
  }
  {
    const {page,errors}=await setup();
    await page.evaluate(()=>{window.paused=true;window.start(6);});await page.waitForTimeout(1600);
    assert.equal(await page.evaluate(()=>window.done),null);
    const progress=await page.locator('.cine-progress').evaluate(node=>Number(node.style.getPropertyValue('--cine-progress')||0));assert.ok(progress<.02);
    await page.evaluate(()=>{window.paused=false;});await page.waitForFunction(()=>window.done,null,{timeout:6500});
    assert.ok((await page.evaluate(()=>window.done.elapsed))>=5400);assert.deepEqual(errors,[]);
    console.log('PASS pause freezes active timing and resumes without auto-skipping');
    await page.evaluate(()=>{window.start(6);window.firstResult=window.result;window.start(11);});
    assert.equal((await page.evaluate(()=>window.firstResult)).status,'cancelled');
    assert.equal(await page.locator('.cinematic').count(),1);
    assert.equal(await page.locator('.cinematic').getAttribute('data-cinematic'),'cell-11');
    await page.evaluate(()=>window.cine.cancelCinematic(document.querySelector('#layer')));
    assert.equal((await page.evaluate(()=>window.result)).status,'cancelled');assert.equal(await page.locator('.cinematic').count(),0);
    await page.evaluate(()=>window.start(6));await page.evaluate(()=>{window.current=false;});await page.waitForFunction(()=>window.done);
    assert.equal((await page.evaluate(()=>window.done)).status,'cancelled');
    console.log('PASS replacement, explicit restart and stale-round cancellation settle cleanly');
  }
  {
    const {page,errors}=await setup({video:true});
    await page.evaluate(()=>window.start(6));await page.waitForTimeout(1500);
    assert.equal(await page.locator('.cine-video').count(),0);assert.equal(await page.locator('.cinematic').getAttribute('data-mode'),'storyboard');
    await page.waitForFunction(()=>window.done,null,{timeout:5500});
    assert.equal((await page.evaluate(()=>window.done)).status,'completed');assert.deepEqual(errors,[]);
    console.log('PASS missing or undecodable video falls back and cannot trap the player');
  }
  {
    const {page,errors}=await setup({video:true,mediaScript:()=>{
      Object.defineProperty(HTMLMediaElement.prototype,'src',{configurable:true,get(){return '';},set(){}});
      HTMLMediaElement.prototype.play=function(){return new Promise(()=>{});};
    }});
    await page.evaluate(()=>window.start(6));await page.waitForTimeout(1450);
    assert.equal(await page.locator('.cine-video').count(),0);
    assert.equal(await page.locator('.cinematic').getAttribute('data-mode'),'storyboard');
    await page.waitForFunction(()=>window.done,null,{timeout:5000});
    assert.equal((await page.evaluate(()=>window.done)).status,'completed');assert.deepEqual(errors,[]);
    console.log('PASS unresolved media play/metadata promises have a one-second active-budget fallback');
  }
  {
    const {page,errors}=await setup({video:true,mediaScript:()=>{
      Object.defineProperty(HTMLMediaElement.prototype,'src',{configurable:true,get(){return '';},set(){}});
      Object.defineProperty(HTMLMediaElement.prototype,'duration',{configurable:true,get(){return 1;}});
      Object.defineProperty(HTMLMediaElement.prototype,'ended',{configurable:true,get(){return this.dataset.testEnded==='true';}});
      HTMLMediaElement.prototype.play=function(){queueMicrotask(()=>{this.dataset.testEnded='true';this.dispatchEvent(new Event('loadedmetadata'));this.dispatchEvent(new Event('playing'));});return Promise.resolve();};
    }});
    await page.evaluate(()=>window.start(6));await page.waitForFunction(()=>document.querySelector('.cinematic')?.dataset.mode==='video');
    await page.waitForTimeout(1700);assert.equal(await page.evaluate(()=>window.done),null);
    await page.waitForFunction(()=>window.done,null,{timeout:4000});
    const done=await page.evaluate(()=>window.done);assert.equal(done.mode,'video');assert.ok(done.elapsed>=2900&&done.elapsed<=4200,JSON.stringify(done));assert.deepEqual(errors,[]);
    console.log('PASS short delivered video retains its final frame to the three-second minimum');
  }
  {
    const {page,errors}=await setup({width:844,height:390});await page.evaluate(()=>window.start(18));
    await page.waitForTimeout(900);await page.screenshot({path:fileURLToPath(new URL('cinematic-care-landscape.png',out))});
    const bounds=await page.locator('.cine-card').boundingBox();assert.ok(bounds.x>=0&&bounds.y>=0&&bounds.x+bounds.width<=845&&bounds.y+bounds.height<=391,JSON.stringify(bounds));
    await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.className),'cine-skip');
    await page.keyboard.press('Escape');await page.waitForFunction(()=>window.done);
    assert.equal((await page.evaluate(()=>window.done)).status,'skipped');assert.deepEqual(errors,[]);
    console.log('PASS narrow landscape layout, focus containment and Escape skip');
  }
  assert.ok(requests.every(path=>!path.startsWith('/api/')));console.log('PASS all tests were offline/local and sent no model requests');
}finally{
  await Promise.all(contexts.map(context=>context.close()));await browser.close();await new Promise(resolve=>server.close(resolve));
}
