// Narrow regression for the removed exterior tab. Uses isolated browser storage
// and blocks model/search requests, without changing the running game's state.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'C:/Users/25293/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const base=process.env.GAME_TEST_URL||'http://127.0.0.1:4173';
const out=new URL('../test-results/scene-controls/',import.meta.url);
await mkdir(out,{recursive:true});
const errors=[],apiRequests=[],bundles=new Set();
const report={passed:false,base,phase:'browser-start',startedAt:new Date().toISOString(),checked:[],officialApiCalls:0};let browser,page;
try{
  browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce',serviceWorkers:'block'});
  await context.route('**/api/**',r=>{apiRequests.push(new URL(r.request().url()).pathname);return r.fulfill({status:503,json:{error:'Isolated UI verification'}});});
  page=await context.newPage();page.setDefaultTimeout(30000);page.on('pageerror',e=>errors.push(e.message));
  page.on('request',request=>{const path=new URL(request.url()).pathname;if(/\/assets\/(?:index|main|scene-preview)-.*\.js$/.test(path))bundles.add(path);});
  for(const [width,height] of [[1440,900],[844,390]]){
    report.phase=`${width}x${height}-scene-entry`;
    await page.setViewportSize({width,height});await page.goto(base);
    await page.locator('#scene[data-assets="ready"][data-reference-cells="40"]').waitFor();
    assert.equal(await page.locator('#scene').getAttribute('data-building-count'),'42');
    const before=await page.evaluate(()=>localStorage.getItem('four-seasons-life-v4'));
    await page.locator('#preview-town').click();await page.locator('[data-visit-cell="4"]').click();
    await page.waitForFunction(()=>Number(document.querySelector('#scene-preview')?.dataset.renderedFrames)>1);
    assert.equal(await page.locator('#scene-preview').getAttribute('data-renderer'),'webgl');
    assert.equal(await page.locator('#scene-preview').getAttribute('data-cell'),'4');
    assert.equal(await page.locator('#scene-preview').getAttribute('data-population-applied'),'true','The running 4173 app must mount the new scene population');
    assert.equal(await page.locator('#scene-preview').getAttribute('data-added-people'),'7','Scene 4 must contain all seven additional people');
    const labels=await page.locator('.scene-view-tabs button').allTextContents();
    assert.deepEqual(labels,['走进场景','地图位置 ↗']);
    assert.equal(await page.getByRole('button',{name:'建筑外观',exact:true}).count(),0);
    await page.screenshot({path:fileURLToPath(new URL(`scene-04-${width}.png`,out))});
    report.phase=`${width}x${height}-return-to-map`;
    await page.locator('#scene-on-map').click();await page.locator('#scene[data-camera-mode="landmark"]').waitFor();
    assert.equal(await page.locator('#dialog').isVisible(),false);
    assert.equal(await page.locator('canvas').count(),1);
    assert.equal(await page.evaluate(()=>localStorage.getItem('four-seasons-life-v4')),before);
    report.checked.push({width,height,labels,buildingsPreserved:42,cell:4,renderer:'webgl',populationApplied:true,addedPeople:7,exteriorButtonRemoved:true,savedUnchanged:true,mapWorks:true});
  }
  assert.deepEqual(errors,[]);report.phase='complete';report.passed=true;
}catch(error){report.failure={phase:report.phase,message:error.message,stack:error.stack};try{await page?.screenshot({path:fileURLToPath(new URL('failure.png',out)),timeout:5000});}catch{}process.exitCode=1;}
finally{report.errors=errors;report.interceptedAPICalls=apiRequests;report.loadedBundles=[...bundles].sort();report.finishedAt=new Date().toISOString();await browser?.close();await writeFile(new URL('report.json',out),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));}
