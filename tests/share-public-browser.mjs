// Explicit acceptance of an existing, owned password tunnel. No model calls.
// Private passcode is read locally, never included in URLs, screenshots or reports.
import {createRequire} from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
if(process.env.RUN_PUBLIC_SHARE_CHECK!=='1')throw new Error('Set RUN_PUBLIC_SHARE_CHECK=1 deliberately.');
const root=fileURLToPath(new URL('../',import.meta.url));
const active=JSON.parse((await fs.readFile(path.join(root,'.private-share/active.json'),'utf8')).replace(/^\uFEFF/,''));
const config=JSON.parse(await fs.readFile(path.join(active.runRoot,'config.json'),'utf8'));
const base=active.url;
assert.equal(active.status,'active');assert.equal(new URL(base).protocol,'https:');assert.equal(new URL(base).host,config.publicHost);
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'C:/Users/25293/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser=await chromium.launch({channel:'chrome',headless:true});
const output=path.join(root,'test-results');await fs.mkdir(output,{recursive:true});
const report={checkedAt:new Date().toISOString(),passed:false,scope:'Public HTTPS through this computer network, not a mainland cellular/no-proxy certification',officialModelCalls:0,pageErrors:[],cspErrors:[],assetErrors:[],assets:[],businessRequests:[]};
let page;
try{
  const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'});
  // Preserve native asset traffic. Isolate business APIs BEFORE navigation.
  // Only health and deliberately invalid practice input reach the actual backend.
  await context.addInitScript(()=>{
    const nativeFetch=window.fetch.bind(window);
    window.fetch=async(input,init)=>{
      const url=new URL(typeof input==='string'?input:input.url||String(input),location.href);
      if(url.origin!==location.origin||!url.pathname.startsWith('/api/'))return nativeFetch(input,init);
      if(url.pathname==='/api/health')return nativeFetch(input,init);
      if(url.pathname==='/api/practice'&&init?.method==='POST'&&init?.body==='{}')return nativeFetch(input,init);
      return new Response(JSON.stringify({mode:'fallback',configured:false,error:'Business API isolated during acceptance'}),{status:503,headers:{'Content-Type':'application/json'}});
    };
  });
  page=await context.newPage();page.setDefaultTimeout(30000);
  const isAsset=url=>/^\/(?:assets|art|characters|cinematics)\//.test(new URL(url).pathname);
  page.on('pageerror',e=>report.pageErrors.push(e.message));
  page.on('console',m=>{if(m.type()==='error'&&/Content Security Policy|violates.*directive/i.test(m.text()))report.cspErrors.push(m.text());});
  page.on('request',r=>{if(new URL(r.url()).pathname.startsWith('/api/'))report.businessRequests.push({path:new URL(r.url()).pathname,method:r.method()});});
  page.on('response',r=>{if(isAsset(r.url())){const item={path:new URL(r.url()).pathname,status:r.status()};report.assets.push(item);if(!r.ok())report.assetErrors.push(item);}});
  page.on('requestfailed',r=>{if(isAsset(r.url()))report.assetErrors.push({path:new URL(r.url()).pathname,error:r.failure()?.errorText});});
  const began=performance.now();
  await page.goto(base+'/__share/login',{waitUntil:'domcontentloaded',timeout:60000});
  assert.equal(new URL(page.url()).origin,base);
  assert.equal(await page.evaluate(async()=> (await fetch('/api/health')).status),401);
  assert.equal(await page.evaluate(async()=> (await fetch('/.env')).status),404);
  await page.locator('input[name=code]').waitFor();
  await page.screenshot({path:path.join(output,'share-public-login.png')});
  await page.locator('input[name=code]').fill('wrong-demo-code');await page.locator('button[type=submit]').click();
  await page.getByText('访问口令不正确，请稍后再试。',{exact:true}).waitFor();
  await page.locator('input[name=code]').fill(config.passcode);await page.locator('button[type=submit]').click();
  await page.locator('#start-sample').waitFor({timeout:60000});
  const session=(await context.cookies(base)).find(c=>c.name==='__Host-four_seasons_share');
  assert.ok(session?.secure&&session.httpOnly&&session.sameSite==='Strict');
  assert.equal(await page.evaluate(async()=> (await fetch('/api/health')).status),200);
  assert.equal(await page.evaluate(async()=> (await fetch('/api/practice',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status),400);
  await page.locator('#scene[data-renderer="pixel"][data-assets="ready"]').waitFor({timeout:60000});
  await page.waitForFunction(()=>['seasonal-sprites','code-fallback'].includes(document.querySelector('#scene')?.dataset.treeArt));
  report.scene=await page.locator('#scene').evaluate(n=>({...n.dataset}));
  assert.ok(report.assets.some(a=>a.path==='/art/season-trees-v2.png'&&a.status===200));
  assert.equal(await page.locator('#app').getAttribute('inert'),null);assert.equal(await page.locator('#boot-screen').isVisible(),false);
  report.loginToReadyMs=Math.round(performance.now()-began); // Includes wrong-code check, NOT pure load latency.
  await page.screenshot({path:path.join(output,'share-public-game.png')});
  await page.locator('#start-sample').click();assert.equal(await page.locator('[data-choice]').count(),3);
  await page.locator('[data-choice="0"]').click();await page.locator('#sample-practice').waitFor();
  await page.locator('#sample-skip').click();await page.locator('.zhihu-echo').waitFor();
  await page.locator('#sample-collect').click();assert.equal(await page.locator('.method-card').count(),1);
  await page.screenshot({path:path.join(output,'share-public-method.png')});
  await page.locator('#sample-home').click();await page.locator('#method-notebook').click();assert.equal(await page.locator('.method-card').count(),1);
  // A slow optional PNG may enhance the already-playable code-drawn scene.
  await page.waitForFunction(()=>document.querySelector('#scene')?.dataset.treeArt==='seasonal-sprites',null,{timeout:35000});
  report.scene=await page.locator('#scene').evaluate(n=>({...n.dataset}));
  report.resources=await page.evaluate(()=>performance.getEntriesByType('resource').filter(r=>r.name.includes('/art/')||r.name.includes('/characters/')).map(r=>({path:new URL(r.name).pathname,durationMs:Math.round(r.duration),bytes:r.decodedBodySize})));
  report.coreFlowPassed=true;
  assert.equal(await page.evaluate(async()=> (await fetch('/server.mjs')).status),404);
  await page.evaluate(()=>fetch('/__share/logout',{method:'POST',redirect:'manual'}));
  assert.equal(await page.evaluate(async()=> (await fetch('/api/health')).status),401);
  await page.goto(base,{waitUntil:'domcontentloaded',timeout:60000});await page.locator('input[name=code]').waitFor();
  assert.deepEqual(report.pageErrors,[]);assert.deepEqual(report.cspErrors,[]);assert.deepEqual(report.assetErrors,[]);
  assert.equal(report.scene.treeArt,'seasonal-sprites','The playable fallback must not hide a failed delivered-art check');
  assert.ok(report.businessRequests.every(r=>r.path==='/api/health'||(r.path==='/api/practice'&&r.method==='POST')));
  report.passed=true;console.log('PASS public password, protected native pixel assets, three-choice sample, sources, method collection, strict CSP and logout. Zero real model calls.');
}catch(error){
  report.failure=String(error.message).slice(0,1000);process.exitCode=1;
  // No failure screenshot: the login could still contain the private code.
  console.log(JSON.stringify({passed:false,failure:report.failure,pageErrors:report.pageErrors,assetErrors:report.assetErrors}));
}finally{await fs.writeFile(path.join(output,'share-public-browser.json'),JSON.stringify(report,null,2));await browser.close();}
