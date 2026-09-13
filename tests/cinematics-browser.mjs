import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {CINEMATIC_MANIFEST} from '../src/cinematic-manifest.js';

// Isolated static harness. Uses actual delivered videos, never the game API.
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'C:/Users/25293/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const project=new URL('../',import.meta.url),out=new URL('../test-results/',import.meta.url);
await mkdir(out,{recursive:true});const requests=[];
const harness=`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/src/cinematics.css"><link rel="stylesheet" href="/src/cinematic-player.css"><style>html,body{margin:0;width:100%;height:100%;font-family:system-ui,sans-serif;background:#b2c7a5}#cinematic-stage{position:fixed;inset:0}#cinematic-stage[hidden]{display:none}</style><body><button id="before">棋盘</button><div id="cinematic-stage" hidden><div id="layer"></div></div><script type="module">import * as api from '/src/cinematics.js';window.cine=api;window.paused=false;window.current=true;window.start=(event,options={})=>{window.done=null;window.startedAt=performance.now();window.result=api.playCinematic(document.querySelector('#cinematic-stage'),event,{isCurrent:()=>window.current,isPaused:()=>window.paused,reducedMotion:false,...options}).then(result=>window.done={...result,elapsed:performance.now()-window.startedAt});};</script></body></html>`;
const server=createServer(async(req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;requests.push(pathname);
  if(pathname==='/'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(harness);return;}
  const allowed=new Map([['/src/cinematics.js','text/javascript'],['/src/cinematic-manifest.js','text/javascript'],['/src/cinematics.css','text/css'],['/src/cinematic-player.css','text/css'],['/characters/idle.gif','image/gif'],...CINEMATIC_MANIFEST.map(item=>[item.src,'video/mp4']),...CINEMATIC_MANIFEST.map(item=>[item.poster,'image/jpeg'])]);
  if(!allowed.has(pathname)){res.writeHead(404);res.end('Not found');return;}
  const source=pathname.startsWith('/characters/')||pathname.startsWith('/cinematics/')?`public${pathname}`:pathname.slice(1);
  try{const data=await readFile(new URL(source,project));res.writeHead(200,{'Content-Type':allowed.get(pathname),'Content-Length':data.length});res.end(data);}catch{res.writeHead(500);res.end('Asset unavailable');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({channel:'chrome',headless:true});const contexts=[],report=[];
async function setup({width=1440,height=900,broken=false,mediaScript}={}){
  const context=await browser.newContext({viewport:{width,height}});contexts.push(context);
  await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
  if(broken)await context.route('**/cinematics/**/*.mp4',route=>route.fulfill({status:404,body:'Not found'}));
  if(mediaScript)await context.addInitScript(mediaScript);
  const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));await page.goto(base);await page.waitForFunction(()=>window.cine);return {page,errors,context};
}
try{
  {
    const {page,errors}=await setup();
    for(const item of CINEMATIC_MANIFEST){
      const metadata=await page.evaluate(async src=>{
        const v=document.createElement('video');v.muted=true;v.preload='auto';v.src=src;v.style.cssText='position:fixed;inset:0;width:320px;height:180px';document.body.append(v);
        await new Promise((resolve,reject)=>{v.onloadeddata=resolve;v.onerror=()=>reject(new Error('Decode failed: '+src));});
        const info={src,duration:v.duration,width:v.videoWidth,height:v.videoHeight};v.removeAttribute('src');v.load();v.remove();return info;
      },item.src);
      assert.equal(metadata.width,item.width);assert.equal(metadata.height,item.height);assert.ok(Math.abs(metadata.duration*1000-item.durationMs)<40);report.push(metadata);
      await page.evaluate(cell=>window.start(cell),item.cell);await page.waitForFunction(()=>document.querySelector('.cinematic')?.dataset.mode==='video');await page.waitForFunction(()=>document.querySelector('.cine-video')?.currentTime>.15);assert.equal(await page.locator('.cinematic').getAttribute('data-production'),'team-supplied');
      if(item.cell===6){await page.waitForTimeout(600);await page.screenshot({path:fileURLToPath(new URL('cinematic-meeting-desktop.png',out))});}
      await page.getByRole('button',{name:'跳过，进入选择'}).click();await page.waitForFunction(()=>window.done);assert.equal((await page.evaluate(()=>window.done)).status,'skipped');assert.equal(await page.locator('.cine-video').count(),0);assert.equal(await page.locator('#layer').isVisible(),false);
    }
    assert.deepEqual(errors,[]);console.log('PASS eight delivered MP4 files decode at their full declared duration, play, and skip cleanly');
    await page.evaluate(()=>window.start(18));await page.waitForFunction(()=>window.done,null,{timeout:13000});const done=await page.evaluate(()=>window.done);assert.equal(done.mode,'video');assert.equal(done.status,'completed');assert.ok(done.elapsed>=8000&&done.elapsed<13000,JSON.stringify(done));
    await page.evaluate(()=>window.start(13));await page.waitForFunction(()=>window.done);assert.equal((await page.evaluate(()=>window.done)).status,'not-found');await page.evaluate(()=>window.start(6,{reducedMotion:true}));await page.waitForFunction(()=>window.done);assert.equal((await page.evaluate(()=>window.done)).reason,'reduced-motion');console.log('PASS natural eight-second completion, removed cell 13 and reduced-motion bypass');
  }
  {
    const {page,errors}=await setup();await page.evaluate(()=>window.start(11));await page.waitForFunction(()=>document.querySelector('.cinematic')?.dataset.mode==='video');await page.waitForTimeout(400);
    await page.evaluate(()=>{window.paused=true;});await page.waitForTimeout(120);const before=await page.locator('video').evaluate(v=>v.currentTime);await page.waitForTimeout(1450);const after=await page.locator('video').evaluate(v=>v.currentTime);assert.ok(Math.abs(after-before)<.08);assert.equal(await page.evaluate(()=>window.done),null);
    await page.evaluate(()=>{window.paused=false;});await page.waitForFunction(()=>window.done,null,{timeout:6500});assert.ok((await page.evaluate(()=>window.done.elapsed))>5300);assert.deepEqual(errors,[]);
    await page.evaluate(()=>{window.start(6);window.firstResult=window.result;window.start(11);});assert.equal((await page.evaluate(()=>window.firstResult)).status,'cancelled');assert.equal(await page.locator('.cinematic').count(),1);
    await page.evaluate(()=>window.cine.cancelCinematic(document.querySelector('#cinematic-stage')));assert.equal((await page.evaluate(()=>window.result)).status,'cancelled');await page.evaluate(()=>{window.start(6);window.current=false;});await page.waitForFunction(()=>window.done);assert.equal((await page.evaluate(()=>window.done)).status,'cancelled');assert.equal(await page.locator('video').count(),0);console.log('PASS real video pause/resume, replacement, explicit cancellation and stale-round cleanup');
  }
  {
    const {page,errors}=await setup({broken:true});await page.evaluate(()=>window.start(6));await page.waitForFunction(()=>document.querySelector('.cinematic')?.dataset.mode==='storyboard');assert.equal(await page.locator('.cine-video').count(),0);assert.equal(await page.locator('.cine-placeholder-label').textContent(),'短片暂未加载，继续这一刻');await page.waitForFunction(()=>window.done,null,{timeout:5000});assert.equal((await page.evaluate(()=>window.done)).status,'completed');assert.deepEqual(errors,[]);console.log('PASS unavailable or undecodable footage falls back without trapping the player');
  }
  {
    const {page,errors}=await setup({mediaScript:()=>{Object.defineProperty(HTMLMediaElement.prototype,'src',{configurable:true,get(){return '';},set(){}});HTMLMediaElement.prototype.play=function(){return new Promise(()=>{});};}});
    await page.evaluate(()=>window.start(6));await page.waitForFunction(()=>document.querySelector('.cinematic')?.dataset.mode==='storyboard',null,{timeout:6500});assert.equal(await page.locator('video').count(),0);await page.waitForFunction(()=>window.done,null,{timeout:5000});assert.equal((await page.evaluate(()=>window.done)).mode,'storyboard');assert.deepEqual(errors,[]);console.log('PASS unresolved media promises use a bounded active-budget fallback');
  }
  {
    const {page,errors}=await setup({mediaScript:()=>{
      const play=HTMLMediaElement.prototype.play;let attempts=0;
      HTMLMediaElement.prototype.play=function(){
        window.playAttempts=++attempts;
        if(attempts===1)return new Promise((resolve,reject)=>setTimeout(()=>reject(new DOMException('Earlier pause aborted play','AbortError')),650));
        return play.call(this);
      };
    }});
    await page.evaluate(()=>window.start(6));await page.evaluate(()=>window.paused=true);await page.waitForTimeout(120);await page.evaluate(()=>window.paused=false);
    await page.waitForFunction(()=>document.querySelector('.cinematic')?.dataset.mode==='video');assert.equal(await page.evaluate(()=>window.playAttempts),2);
    await page.waitForFunction(()=>window.done,null,{timeout:8500});assert.equal((await page.evaluate(()=>window.done)).mode,'video');assert.deepEqual(errors,[]);
    console.log('PASS resume retries a late AbortError from an earlier pending play, without false fallback');
  }
  {
    const {page,errors}=await setup({mediaScript:()=>{
      const play=HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play=function(){
        if(!this.muted&&!window.blockedOnce){window.blockedOnce=true;return Promise.reject(new DOMException('Gesture needed for sound','NotAllowedError'));}
        return play.call(this);
      };
    }});
    await page.evaluate(()=>{window.soundPref=true;window.audioSignals=[];window.start(6,{isSoundEnabled:()=>window.soundPref,onSoundToggle:()=>window.soundPref=!window.soundPref,onAudioChange:value=>window.audioSignals.push(value)});});
    await page.waitForFunction(()=>document.querySelector('.cinematic')?.dataset.mode==='video');assert.equal(await page.locator('video').evaluate(video=>video.muted),true);
    assert.equal(await page.locator('.cine-sound').textContent(),'开启声音');await page.locator('.cine-sound').click();
    assert.equal(await page.locator('video').evaluate(video=>video.muted),false);assert.equal(await page.evaluate(()=>window.soundPref),true);
    await page.locator('.cine-sound').click();assert.equal(await page.locator('video').evaluate(video=>video.muted),true);assert.equal(await page.evaluate(()=>window.soundPref),false);
    await page.locator('.cine-skip').click();await page.waitForFunction(()=>window.done);assert.deepEqual(await page.evaluate(()=>window.audioSignals),[true,false]);assert.deepEqual(errors,[]);
    console.log('PASS denied audible autoplay retries silently; a gesture restores sound, mute and cleanup notify BGM correctly');
  }
  {
    const {page,errors}=await setup({width:844,height:390});await page.evaluate(()=>window.start(18));await page.waitForFunction(()=>document.querySelector('.cinematic')?.dataset.mode==='video');await page.waitForTimeout(400);await page.screenshot({path:fileURLToPath(new URL('cinematic-care-landscape.png',out))});
    const bounds=await page.locator('.cine-card').boundingBox();assert.ok(bounds.x>=0&&bounds.y>=0&&bounds.x+bounds.width<=845&&bounds.y+bounds.height<=391,JSON.stringify(bounds));await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.className),'cine-sound');await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.className),'cine-skip');await page.keyboard.press('Escape');await page.waitForFunction(()=>window.done);assert.equal((await page.evaluate(()=>window.done)).status,'skipped');assert.deepEqual(errors,[]);console.log('PASS narrow landscape playback, focus containment and Escape skip');
  }
  await writeFile(new URL('cinematic-video-validation.json',out),JSON.stringify({localOnly:true,files:report},null,2));assert.ok(requests.every(path=>!path.startsWith('/api/')));console.log('PASS all checks isolated locally without business API calls');
}finally{await Promise.all(contexts.map(context=>context.close()));await browser.close();await new Promise(resolve=>server.close(resolve));}
