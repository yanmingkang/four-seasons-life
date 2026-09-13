// Real WebGL / actual UI. Separate server, storage and mock API; no paid calls.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import fs from 'node:fs/promises';
import {newGame,snapshot} from '../src/engine.js';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_PATH||'C:/Users/25293/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=fileURLToPath(new URL('../',import.meta.url)),out=new URL('../test-results/building-names-removed/world-signage/',import.meta.url);
await fs.mkdir(out,{recursive:true});
const probe=createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
const production=process.argv.includes('--production');
const server=spawn(process.execPath,['server.mjs',...(production?['--production']:[])],{cwd:root,env:{...process.env,PORT:String(port),ZHIHU_CLI_PATH:'Z:/disabled-signage-test/cli.exe'},windowsHide:true,stdio:'ignore'}),base=`http://127.0.0.1:${port}`;
const report={passed:false,production,startedAt:new Date().toISOString(),apiCalls:0,apiIntercepted:[],externalBlocked:[],views:[],errors:[],method:{isolatedServer:true,isolatedStorage:true,user4173Untouched:true,realModelCalls:0,fixtures:'Actual gallery, camera and choice UI. Demo save is a rendering regression fixture, not a complete game.'}};let browser,currentPage;
try{
  if(production){const html=await fs.readFile(new URL('../dist/index.html',import.meta.url),'utf8');report.build={indexSha256:createHash('sha256').update(html).digest('hex'),entry:html.match(/\/assets\/[^" ]+\.js/)?.[0]};}
  for(let i=0;i<100;i++){try{if((await fetch(base)).ok)break;}catch{}if(i===99)throw Error('Test server unavailable');await new Promise(r=>setTimeout(r,100));}
  browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--use-gl=angle','--use-angle=d3d11','--ignore-gpu-blocklist']});
  for(const [width,height,dpr] of [[1440,900,1],[844,390,2]]){
    const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:dpr,reducedMotion:'reduce',serviceWorkers:'block'});
    await context.route('**/*',r=>{const u=new URL(r.request().url());if(u.origin!==base&&!['data:','blob:'].includes(u.protocol)){report.externalBlocked.push(u.origin+u.pathname);return r.abort();}if(u.pathname.startsWith('/api/')){report.apiIntercepted.push(u.pathname);return r.fulfill({status:503,json:{error:'Isolated signage test; no model calls'}});}return r.continue();});
    await context.routeWebSocket('**/*',ws=>ws.close());
    await context.addInitScript(()=>{
      localStorage.setItem('four-seasons-auto-depart','off');localStorage.setItem('four-seasons-music','off');
      const original=crypto.getRandomValues.bind(crypto);crypto.getRandomValues=array=>{if(array instanceof Uint32Array&&array.length===1){array[0]=0;return array;}return original(array);};
    });
    const page=await context.newPage();currentPage=page;page.setDefaultTimeout(20000);page.on('pageerror',e=>report.errors.push(e.message));
    await page.goto(base);await page.locator('#scene[data-renderer="webgl"][data-assets="ready"]').waitFor();
    async function inspect(name){
      await page.waitForTimeout(500);
      const info=await page.evaluate(()=>{
        const scene=document.querySelector('#scene'),canvas=scene.querySelector('canvas');
        const labels=[...scene.querySelectorAll('.world-signage .world-name,.world-signage .world-label')].filter(e=>e.checkVisibility({visibilityProperty:true}));
        return {camera:scene.dataset.cameraMode,textLayer:scene.dataset.textLayer,canvasWidth:canvas.width,cssWidth:canvas.clientWidth,
          buildingCount:scene.querySelectorAll('.world-name--building').length,stemCount:scene.querySelectorAll('.world-name-stem').length,seasonCount:scene.querySelectorAll('.world-signage .world-label').length,
          labels:labels.map(e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return {text:e.textContent,kind:e.dataset.kind,font:s.fontFamily,size:parseFloat(s.fontSize),x:r.x,y:r.y,width:r.width,height:r.height,pointer:s.pointerEvents,image:s.imageRendering};})};
      });
      await page.screenshot({path:fileURLToPath(new URL(`${name}-${width}.png`,out))});report.views.push({name,width,height,dpr,...info});
      assert.equal(info.textLayer,'css-resolution');
      assert.equal(info.buildingCount,0,`${name}: no building-name DOM, including hidden nodes`);
      assert.equal(info.stemCount,0,`${name}: no building-name leader lines`);
      assert.equal(info.seasonCount,4,`${name}: four overview chapters are retained`);
      assert.equal(info.labels.length,info.camera==='overview'?4:0,`${name}: only overview shows four chapter labels`);
      assert.equal(await page.locator('.world-name--station,.world-name--sign').count(),0,`${name}: road-sign lettering must stay on 3D plaques`);
      for(const [i,label] of info.labels.entries()){
        assert.ok(label.font.includes('Microsoft YaHei'));assert.ok(label.size>=14);assert.equal(label.pointer,'none');assert.equal(label.image,'auto');
        assert.ok(label.x>=0&&label.y>=0&&label.x+label.width<=width&&label.y+label.height<=height,`${name}: clipped ${label.text}`);
        for(const other of info.labels.slice(i+1))assert.ok(label.x+label.width<=other.x||other.x+other.width<=label.x||label.y+label.height<=other.y||other.y+other.height<=label.y,`${name}: overlap`);
      }
      return info;
    }
    // The official cover has one journey entry; town inspection belongs to the
    // running game. Physical road signs must no longer have floating callouts.
    await page.locator('#start-full').click();await page.locator('.experience[data-stage="ready"]').waitFor();
    assert.equal(await page.locator('.world-name--station,.world-name--sign').count(),0,'road and gate text belongs on the actual 3D plaques');
    // Inspect one real building from each of the four seasons through existing UI.
    for(const [season,cell,id] of [[0,1,'library'],[0,9,'reference-cell-09'],[1,18,'reference-cell-18'],[2,29,'reference-cell-29'],[3,40,'reference-cell-40']]){
      await page.locator('#town-gallery').click();
      await page.locator(`[data-town-season="${season}"]`).click();await page.locator(`[data-visit-cell="${cell}"]`).click();await page.locator('#scene-on-map').click();
      await page.locator(`#scene[data-focused-landmark="${id}"]`).waitFor();
      const info=await inspect(`focus-${cell}`);assert.equal(info.buildingCount,0,`Focused building ${cell} remains unnamed on the scene`);
    }
    await page.locator('#view-overview').click();const overview=await inspect('overview');
    assert.equal(overview.labels.length,4,'all four seasons remain legible, without building callouts');
    if(await page.locator('#zoom-in').isVisible())await page.locator('#zoom-in').click();
    else{await page.mouse.move(width*.6,height*.6);await page.mouse.wheel(0,-100);}
    await inspect('overview-zoom');
    await page.locator('#view-follow').click();await inspect('follow');
    const rect=await page.locator('#scene canvas').boundingBox();await page.mouse.move(rect.x+rect.width*.52,rect.y+rect.height*.55);await page.mouse.down();await page.mouse.move(rect.x+rect.width*.67,rect.y+rect.height*.56,{steps:12});await page.mouse.up();
    assert.equal(await page.locator('#scene').getAttribute('data-camera-orbit'),'user');await inspect('follow-rotated');
    if(await page.locator('#reset-view').isVisible())await page.locator('#reset-view').click();else await page.locator('#view-follow').click();
    await page.mouse.wheel(0,200);await inspect('follow-zoom');
    await page.locator('#town-gallery').click();assert.equal(await page.locator('.world-signage').isVisible(),false);await page.locator('#dialog-close').click();await inspect('after-dialog');
    await page.locator('#town-return').click();await page.locator('.experience[data-stage="ready"]').waitFor();
    await page.emulateMedia({reducedMotion:'no-preference'});await page.locator('#continue-travel').click();
    await page.locator('#scene[data-stage="walking"]').waitFor();assert.equal(await page.locator('.world-signage').isVisible(),true,'passive text survives locked movement');
    await page.locator('.experience[data-stage="choice"]').waitFor();assert.equal(await page.locator('.world-signage').isVisible(),false,'choice card hides background labels');
    assert.equal(await page.locator('[data-choice]').count(),3);await page.locator('[data-choice]:not(:disabled)').first().click();await page.locator('#next-button').click();await page.locator('.experience[data-stage="ready"]').waitFor();
    await inspect('arrived-first-station');
    await page.emulateMedia({reducedMotion:'reduce'});
    // Demo numbering differs from source event indices. The town gallery still
    // permits viewing non-route buildings, without recreating building names.
    // Seed at document start: the real page saves its current game on unload.
    await context.addInitScript(game=>localStorage.setItem('four-seasons-life-v4',JSON.stringify({game,seconds:0})),snapshot(newGame('demo',{enriched:true})));
    await page.reload();await page.locator('#scene[data-assets="ready"]').waitFor();await page.locator('#start-full').click();await page.locator('#dialog.journey-entry-dialog[open]').waitFor();await page.locator('#resume').click();await page.locator('.experience[data-stage="ready"]').waitFor();
    assert.equal(await page.locator('#scene').getAttribute('data-route-length'),'12');
    assert.equal(await page.locator('.world-name--station').count(),0,'demo must not recreate floating station numbers');
    assert.equal(await page.locator('.world-name--sign').count(),0,'demo must not recreate floating gate text');
    await page.locator('#town-gallery').click();await page.locator('[data-town-season="0"]').click();await page.locator('[data-visit-cell="4"]').click();await page.locator('#scene-on-map').click();
    const demo=await inspect('demo-off-route-building');assert.equal(demo.buildingCount,0);assert.equal(demo.labels.length,0);
    assert.equal(await page.locator('#scene canvas').evaluate(c=>c.getContext('webgl2').getError()),0);
    await context.close();
  }
  assert.deepEqual(report.errors,[]);report.passed=true;
}catch(error){report.failure={name:error.name,message:error.message,stack:error.stack};if(currentPage&&!currentPage.isClosed())try{await currentPage.screenshot({path:fileURLToPath(new URL('failure.png',out))});}catch{}process.exitCode=1;
}finally{report.finishedAt=new Date().toISOString();await fs.writeFile(new URL('report.json',out),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,production,views:report.views.map(v=>({name:v.name,width:v.width,labels:v.labels.length,buildingCount:v.buildingCount,stemCount:v.stemCount})),errors:report.errors,failure:report.failure},null,2));await browser?.close();server.kill();}
