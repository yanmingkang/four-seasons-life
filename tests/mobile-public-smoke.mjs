// Read-only verification of the stable public build; no login or paid AI calls.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH||'C:/Users/25293/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const base='https://zhihu-four-seasons.pages.dev';
const out=fileURLToPath(new URL('../test-results/mobile-public/',import.meta.url));await fs.mkdir(out,{recursive:true});
const expected=(await fs.readFile(new URL('../dist/index.html',import.meta.url),'utf8')).match(/src="(\/assets\/index-[^"]+\.js)"/)[1];
const report={passed:false,expectedEntry:expected,checks:[],pageErrors:[],blockedWrites:[],realModelCalls:0,realAuthorizationFlows:0,network:'Only this isolated browser uses --no-proxy-server; system configuration unchanged.'};
let browser,page;
try{
  browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-proxy-server','--enable-webgl','--use-gl=angle','--use-angle=d3d11','--ignore-gpu-blocklist']});
  const ctx=await browser.newContext({viewport:{width:844,height:300},isMobile:true,hasTouch:true,deviceScaleFactor:1,reducedMotion:'reduce'});
  page=await ctx.newPage();page.setDefaultTimeout(90000);page.on('pageerror',e=>report.pageErrors.push(e.message));
  await ctx.route('**/*',route=>{
    const url=new URL(route.request().url());
    if(url.origin!==base&&!['data:','blob:'].includes(url.protocol))return route.abort();
    if(!['GET','HEAD'].includes(route.request().method())){report.blockedWrites.push(url.pathname);return route.abort();}
    return route.continue();
  });
  const start=Date.now(),response=await page.goto(base,{timeout:90000,waitUntil:'domcontentloaded'});
  assert.equal(response.status(),200);assert.ok((await response.text()).includes(expected),'Worker homepage must serve the new build');
  await page.locator('#scene[data-assets="ready"][data-renderer="webgl"]').waitFor();report.firstSceneMs=Date.now()-start;
  const auth=await page.evaluate(async()=>{
    const response=await fetch('/api/auth/status?mobile-check='+Date.now(),{signal:AbortSignal.timeout(20000)}),body=await response.json();
    return {status:response.status,enabled:body.enabled,authenticated:body.authenticated,correctCallback:body.callbackUrl===location.origin+'/api/auth/zhihu/callback'};
  });report.auth=auth;assert.deepEqual(auth,{status:200,enabled:true,authenticated:false,correctCallback:true});
  for(const [width,height]of [[844,300],[667,280],[844,390]]){
    await page.setViewportSize({width,height});await page.waitForTimeout(300);
    assert.equal(await page.locator('.daylight-switch').isVisible(),false);
    for(const value of ['defense','ambitious','optimistic']){
      await page.locator(`.talent-picker label:has(input[value="${value}"])`).scrollIntoViewIfNeeded();await page.locator(`input[value="${value}"]`).check();
      const checks=await page.locator('#start-full').evaluate(node=>{const r=node.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {within:r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth,hit:node===hit||node.contains(hit)};});
      assert.ok(checks.within&&checks.hit);report.checks.push({width,height,talent:value,...checks});
    }
    await page.locator('#character-name').scrollIntoViewIfNeeded();
    await page.screenshot({path:`${out}/cover-${width}x${height}.png`});
  }
  assert.deepEqual(report.pageErrors,[]);report.passed=true;
}catch(error){report.failure=error.message;await page?.screenshot({path:`${out}/failure.png`}).catch(()=>{});throw error;}
finally{await fs.writeFile(`${out}/report.json`,JSON.stringify(report,null,2));await browser?.close();}
console.log(JSON.stringify(report));
