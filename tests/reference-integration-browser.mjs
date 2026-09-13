// Real local browser, isolated storage/server, no upstream API requests.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import {newGame,snapshot} from '../src/engine.js';
import {REFERENCE_SCENE_LIFE} from '../src/reference-scene-population.js';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_PATH||'C:/Users/25293/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=fileURLToPath(new URL('../',import.meta.url)),out=new URL('../test-results/reference-integration/',import.meta.url);
await fs.mkdir(out,{recursive:true});
const probe=createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
const server=spawn(process.execPath,['server.mjs','--production'],{cwd:root,env:{...process.env,PORT:String(port),ZHIHU_CLI_PATH:'Z:/disabled-reference-test/cli.exe'},windowsHide:true,stdio:'ignore'}),base=`http://127.0.0.1:${port}`;
const original=JSON.stringify({game:snapshot(newGame('full',{name:'场景存档验收'})),seconds:91});
const screenshotMode=process.env.REFERENCE_SCREENSHOTS==='key'?'key':'all';
const errors=[],report={passed:false,startedAt:new Date().toISOString(),phase:'server-start',cells:[],officialApiCalls:0,screenshotMode,screenshots:[]};let browser,page;
try{
  const index=await fs.readFile(new URL('../dist/index.html',import.meta.url),'utf8');
  report.build={indexModifiedAt:(await fs.stat(new URL('../dist/index.html',import.meta.url))).mtime.toISOString(),indexSha256:createHash('sha256').update(index).digest('hex')};
  for(let i=0;i<100;i++){try{if((await fetch(base)).ok)break;}catch{}if(i===99)throw Error('Isolated server did not start');await new Promise(r=>setTimeout(r,100));}
  browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'});
  await context.route('**/api/**',route=>route.fulfill({status:503,json:{error:'offline integration QA'}}));
  await context.addInitScript(original=>{localStorage.setItem('four-seasons-life-v4',original);localStorage.setItem('four-seasons-auto-depart','off');localStorage.setItem('four-seasons-music','off');},original);
  page=await context.newPage();page.setDefaultTimeout(30000);page.on('pageerror',e=>errors.push(e.message));
  const originals=[];page.on('request',r=>{if(r.url().includes('/art/first-edition/'))originals.push(r.url());});
  report.phase='initial-load';const start=Date.now();await page.goto(base);await page.locator('#scene[data-assets="ready"][data-reference-cells="40"]').waitFor();report.readyMs=Date.now()-start;
  assert.equal(originals.length,0);report.buildings=Number(await page.locator('#scene').getAttribute('data-building-count'));
  await page.locator('#character-name').fill('看过建筑后仍保留');await page.locator('#preview-town').click();
  assert.equal(await page.locator('[data-visit-cell]').count(),10);assert.equal(originals.length,0);
  await page.screenshot({path:fileURLToPath(new URL('gallery.png',out))});
  const shots=new Set(screenshotMode==='key'?[1,4,13,18,22,28,38,40]:Array.from({length:40},(_,i)=>i+1));
  for(let cell=1;cell<=40;cell++){
    report.phase=`scene-${cell}`;
    await page.locator(`[data-town-season="${Math.floor((cell-1)/10)}"]`).click();
    await page.locator(`[data-visit-cell="${cell}"]`).click();
    const viewer=page.locator('#scene-preview');await page.waitForFunction(()=>Number(document.querySelector('#scene-preview')?.dataset.triangles)>50);
    assert.equal(await page.locator('#reference-compare').count(),0);assert.doesNotMatch(await page.locator('#dialog').innerText(),/建筑外观|原图对照|拖拽旋转|滚轮缩放/);assert.equal(await page.locator('#dialog .scene-view-tabs > #scene-preview').count(),0,'canvas must be separate from controls');
    assert.equal(await viewer.getAttribute('data-renderer'),'webgl');assert.equal(await viewer.getAttribute('data-cell'),String(cell));
    assert.equal(await viewer.getAttribute('data-population-applied'),'true',`daily life is mounted in scene ${cell}`);
    assert.equal(Number(await viewer.getAttribute('data-added-people')),REFERENCE_SCENE_LIFE[cell].people);
    assert.equal(await viewer.getAttribute('data-render-style'),'outlined-pixel-3d');
    const triangles=Number(await viewer.getAttribute('data-triangles'));assert.ok(triangles>100);
    assert.equal(await page.locator('canvas').count(),2,'one live board, one disposable scene');
    if(shots.has(cell)){
      const screenshot=`scene-${String(cell).padStart(2,'0')}.png`;
      await page.screenshot({path:fileURLToPath(new URL(screenshot,out))});report.screenshots.push(screenshot);
    }
    assert.equal(await page.locator('[data-scene-view="exterior"]').count(),0,'建筑外观入口已移除');
    if(cell===1){
      const area=await viewer.boundingBox(),before=await viewer.getAttribute('data-camera');
      await page.mouse.move(area.x+area.width*.6,area.y+area.height*.55);await page.mouse.down();await page.mouse.move(area.x+area.width*.3,area.y+area.height*.55,{steps:12});await page.mouse.up();await page.waitForTimeout(180);
      const after=await viewer.getAttribute('data-camera');assert.notEqual(after,before,'actual orbit camera responds to drag');report.orbit=true;
      assert.equal(originals.length,0);assert.equal(await page.locator('#reference-compare').count(),0,'scene cards no longer render an original comparison panel');
    }
    assert.equal(await page.evaluate(()=>localStorage.getItem('four-seasons-life-v4')),original);
    report.cells.push({cell,sceneTriangles:triangles,renderer:await viewer.getAttribute('data-renderer'),style:await viewer.getAttribute('data-render-style'),populationApplied:true,addedPeople:Number(await viewer.getAttribute('data-added-people'))});
    await page.locator('#back-to-town').click();assert.equal(await page.locator('canvas').count(),1);
    if(cell%10===0){console.log(`Verified ${cell}/40 scene entries.`);await fs.writeFile(new URL('report.json',out),JSON.stringify({...report,errors},null,2));}
  }
  report.deferredOriginals=originals.length;assert.equal(originals.length,0);
  report.phase='character-and-map';await page.locator('#view-character-reference').click();await page.waitForFunction(()=>Number(document.querySelector('#scene-preview')?.dataset.triangles)>100);await page.screenshot({path:fileURLToPath(new URL('character.png',out))});await page.locator('#back-to-town').click();
  await page.locator('[data-town-season="3"]').click();await page.locator('[data-visit-cell="40"]').click();await page.locator('#scene-on-map').click();await page.locator('#scene[data-focused-landmark="reference-cell-40"]').waitFor();assert.equal(await page.locator('canvas').count(),1);
  await page.screenshot({path:fileURLToPath(new URL('map-palace.png',out))});
  await page.locator('#view-overview').click();await page.waitForTimeout(200);await page.screenshot({path:fileURLToPath(new URL('overview.png',out))});
  await page.locator('#town-return').click();assert.equal(await page.locator('#character-name').inputValue(),'看过建筑后仍保留');
  report.phase='saved-game-return';await page.locator('#resume').click();await page.locator('.experience[data-stage="ready"]').waitFor();await page.locator('#continue-travel').click();await page.locator('.experience[data-stage="choice"]').waitFor();
  assert.equal(await page.locator('[data-choice]').count(),3);assert.doesNotMatch(await page.locator('.options').innerText(),/[+−-]\s*\d|\d+\s*元/);
  const choiceSave=await page.evaluate(()=>localStorage.getItem('four-seasons-life-v4'));
  await page.locator('#look-at-scene').click();await page.waitForFunction(()=>Number(document.querySelector('#scene-preview')?.dataset.triangles)>100);await page.locator('#scene-on-map').click();
  assert.equal(await page.locator('#overlay-shell').isHidden(),true);assert.equal(await page.locator('#scene').evaluate(el=>el.inert),false,'choice preview must allow real map orbit');
  assert.equal(await page.evaluate(()=>localStorage.getItem('four-seasons-life-v4')),choiceSave);await page.locator('#town-return').click();assert.equal(await page.locator('[data-choice]').count(),3);
  await page.locator('[data-choice]:not(:disabled)').first().click();await page.locator('#next-button').waitFor();
  assert.equal(await page.locator('#scene canvas').evaluate(c=>c.getContext('webgl2').getError()),0);
  report.gameplayRestored=true;
  // Feedback intentionally locks background map controls. Start the mobile
  // inspection through the welcome-page entry, as a player would after reload.
  report.phase='orientation';await page.setViewportSize({width:844,height:390});await page.reload();await page.locator('#scene[data-assets="ready"][data-reference-cells="40"]').waitFor();await page.locator('#preview-town').click();await page.locator('[data-town-season="1"]').click();await page.locator('[data-visit-cell="18"]').click();await page.waitForFunction(()=>Number(document.querySelector('#scene-preview')?.dataset.triangles)>100);await page.screenshot({path:fileURLToPath(new URL('landscape-mobile.png',out))});
  await page.setViewportSize({width:390,height:844});await page.locator('#orientation-gate').waitFor();await page.waitForTimeout(100);const pausedFrames=await page.locator('#scene-preview').getAttribute('data-rendered-frames');await page.waitForTimeout(200);assert.equal(await page.locator('#scene-preview').getAttribute('data-rendered-frames'),pausedFrames,'hidden portrait preview must not render');
  await page.setViewportSize({width:844,height:390});await page.waitForFunction(previous=>Number(document.querySelector('#scene-preview')?.dataset.renderedFrames)>Number(previous),pausedFrames);report.portraitPause=true;
  assert.equal(await page.locator('#dialog').evaluate(el=>el.scrollWidth<=el.clientWidth+2),true);assert.deepEqual(errors,[]);report.errors=errors;report.phase='complete';report.passed=true;console.log(JSON.stringify(report,null,2));
}catch(error){report.failure={phase:report.phase,message:error.message,stack:error.stack};try{await page?.screenshot({path:fileURLToPath(new URL('failure.png',out)),timeout:5000});}catch{}throw error;
}finally{report.finishedAt=new Date().toISOString();await fs.writeFile(new URL('report.json',out),JSON.stringify({...report,errors},null,2));await browser?.close();server.kill();}
