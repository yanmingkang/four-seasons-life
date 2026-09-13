import {createRequire} from 'node:module';
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {snapshot} from '../src/engine.js';
import {completeMemoryFixture,earlyMemoryFixture} from '../tests/memory-fixtures.mjs';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/25293/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const base='http://127.0.0.1:4174',out=new URL('../test-results/memory-album/',import.meta.url);await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--use-gl=angle','--use-angle=d3d11','--ignore-gpu-blocklist']});
try{
  for(const [width,height]of [[1440,900],[844,390]]){
    const context=await browser.newContext({viewport:{width,height},reducedMotion:'reduce'});
    await context.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());
    await context.route('**/api/**',r=>r.fulfill({status:503,json:{error:'Local inspection only'}}));
    await context.addInitScript(game=>{localStorage.setItem('four-seasons-life-v4',JSON.stringify({game,seconds:0}));localStorage.setItem('four-seasons-auto-depart','off');localStorage.setItem('four-seasons-music','off');},snapshot(completeMemoryFixture()));
    const page=await context.newPage();page.on('pageerror',error=>console.log(error.message));await page.goto(base);await page.locator('#resume').click();
    await page.locator('.memory-album').waitFor();await page.screenshot({path:fileURLToPath(new URL(`cover-${width}.png`,out))});
    for(const i of [1,5,6,7]){await page.locator(`[data-memory-go="${i}"]`).click();await page.screenshot({path:fileURLToPath(new URL(`page-${i}-${width}.png`,out))});}
    if(width===1440){await page.locator('#share-card').click();await page.locator('.share-preview').waitFor();const download=page.waitForEvent('download');await page.locator('.share-actions a[download]').click();await (await download).saveAs(fileURLToPath(new URL('share-complete.png',out)));}
    await context.close();
  }
}finally{await browser.close();}
