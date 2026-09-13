// Actual default entry; isolated server/browser storage, no official model calls.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import fs from 'node:fs/promises';
import {newGame,snapshot} from '../src/engine.js';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_PATH||'C:/Users/25293/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=fileURLToPath(new URL('../',import.meta.url)),out=new URL('../test-results/',import.meta.url);
await fs.mkdir(out,{recursive:true});
const probe=createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
const server=spawn(process.execPath,['server.mjs'],{cwd:root,env:{...process.env,PORT:String(port),ZHIHU_CLI_PATH:'Z:/disabled-town-3d-test/cli.exe'},windowsHide:true,stdio:'ignore'}),base=`http://127.0.0.1:${port}`;
const original=JSON.stringify({game:snapshot(newGame('full',{name:'3D存档保留验收'})),seconds:91});
const errors=[],report={officialApiCalls:0,sizes:[],landmarks:[],passed:false};let browser;
try{
  for(let i=0;i<100;i++){try{if((await fetch(base)).ok)break;}catch{}if(i===99)throw Error('Own test server did not start');await new Promise(r=>setTimeout(r,100));}
  browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  for(const [width,height] of [[1440,900],[844,390]]){
    const context=await browser.newContext({viewport:{width,height},reducedMotion:'reduce'});
    await context.route('**/api/**',r=>r.fulfill({status:503,json:{error:'Isolated visual test; no model request'}}));
    await context.addInitScript(original=>{localStorage.setItem('four-seasons-life-v4',original);localStorage.setItem('four-seasons-auto-depart','off');localStorage.setItem('four-seasons-music','off');localStorage.setItem('town-qa-preserve','untouched');},original);
    const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
    const began=Date.now();await page.goto(base);await page.locator('#scene[data-renderer="webgl"][data-assets="ready"]').waitFor();
    assert.equal(await page.locator('#scene canvas').evaluate(c=>c.getContext('webgl2') instanceof WebGL2RenderingContext),true);
    assert.equal(await page.locator('#scene').getAttribute('data-scenery'),'procedural-3d');
    const readyMs=Date.now()-began;
    await page.locator('#character-name').fill('逛小镇前的名字');await page.locator('label:has(input[value="ambitious"])').click();
    await page.locator('#preview-town').click();await page.locator('[data-visit-cell="1"]').waitFor();
    assert.equal(await page.locator('[data-town-season]').count(),4);
    assert.equal(await page.locator('[data-visit-cell]').count(),10);
    assert.equal(await page.locator('.legacy-landmarks,.town-card').count(),0);
    assert.equal(await page.locator('#view-character-reference').isVisible(),true);
    await page.screenshot({path:fileURLToPath(new URL(`town-gallery-${width}.png`,out))});
    for(const [cell,id,title] of [[1,'library','大学图书馆'],[2,'stadium','校招体育馆'],[3,'village','城中村小楼'],[4,'reference-cell-04','开放式工位']]){
      if(cell!==1)await page.locator('#town-gallery').click();
      await page.locator('[data-town-season="0"]').click();
      await page.locator(`[data-visit-cell="${cell}"]`).click();
      assert.equal(await page.locator('#dialog-content h2').innerText(),title);
      await page.locator('#scene-on-map').click();
      await page.locator(`#scene[data-camera-mode="landmark"][data-focused-landmark="${id}"]`).waitFor();
      await page.waitForTimeout(180);
      assert.equal(await page.evaluate(()=>localStorage.getItem('four-seasons-life-v4')),original);
      assert.equal(await page.evaluate(()=>localStorage.getItem('town-qa-preserve')),'untouched');
      assert.equal(await page.locator('#scene').getAttribute('data-position'),'-1');
      assert.equal(await page.locator('#town-return').isVisible(),true);
      await page.screenshot({path:fileURLToPath(new URL(`town-live-${id}-${width}.png`,out))});
      report.landmarks.push({cell,id,width,savedUnchanged:true});
    }
    await page.locator('#view-overview').click();await page.screenshot({path:fileURLToPath(new URL(`town-live-overview-${width}.png`,out))});
    await page.locator('#town-return').click();await page.locator('#start-full').waitFor();
    assert.equal(await page.locator('#character-name').inputValue(),'逛小镇前的名字');assert.equal(await page.locator('input[value="ambitious"]').isChecked(),true);
    await page.locator('#resume').click();await page.locator('.experience[data-stage="ready"]').waitFor();
    // Town inspection pauses automatic progression without changing its preference.
    await page.locator('#town-gallery').click();await page.locator('[data-town-season="0"]').click();await page.locator('[data-visit-cell="1"]').click();await page.locator('#scene-on-map').click();await page.locator('label.auto-setting').click();assert.equal(await page.locator('#auto-depart').isChecked(),true);
    const before=await page.evaluate(()=>JSON.parse(localStorage.getItem('four-seasons-life-v4')).game);
    await page.waitForTimeout(850);assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('four-seasons-life-v4')).game),before);
    await page.locator('label.auto-setting').click();assert.equal(await page.locator('#auto-depart').isChecked(),false);await page.locator('#town-return').click();
    await page.locator('#continue-travel').click();
    await page.locator('.experience[data-stage="choice"]').waitFor({timeout:30000});
    assert.equal(await page.locator('[data-choice]').count(),3);
    assert.doesNotMatch(await page.locator('.options').innerText(),/[+−-]\s*\d|\d+\s*元|情绪.*[加减]/);
    await page.screenshot({path:fileURLToPath(new URL(`town-live-event-${width}.png`,out))});
    await page.locator('[data-choice]:not(:disabled)').first().click();await page.locator('#next-button').waitFor();assert.equal(await page.locator('.result-stats').isVisible(),true);
    assert.equal(await page.locator('#scene canvas').evaluate(c=>c.getContext('webgl2').getError()),0);
    report.sizes.push({width,height,readyMs,threeChoices:true,realWebGL:true});await context.close();
  }
  // Unsupported WebGL must be an honestly labelled usable fallback, not a
  // silent switch to an allegedly 3D Canvas2D map.
  const fallback=await browser.newContext({viewport:{width:1440,height:900}});
  await fallback.route('**/api/**',r=>r.abort());
  await fallback.addInitScript(()=>{const get=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...rest){return /webgl/.test(type)?null:get.call(this,type,...rest);};});
  const page=await fallback.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(base);await page.locator('#scene[data-renderer="fallback"]').waitFor();assert.match(await page.locator('.fallback-note').innerText(),/无法启用 3D/);await page.locator('#preview-town').click();await page.locator('#toast.visible').waitFor();assert.equal(await page.locator('#start-full').isVisible(),true);await fallback.close();
  assert.deepEqual(errors,[]);report.passed=true;report.errors=errors;console.log(JSON.stringify(report,null,2));
}finally{await fs.writeFile(new URL('town-3d-browser.json',out),JSON.stringify(report,null,2));await browser?.close();server.kill();}
