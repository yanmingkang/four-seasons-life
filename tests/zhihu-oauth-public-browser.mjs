// Narrow public smoke test; run only after the parent confirms deployment.
// The only target is the existing stable HTTPS site. OAuth MUST still be
// unconfigured: this test never starts an authorization or sends a model call.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

assert.equal(process.argv.length,2,'This smoke test accepts no arbitrary target or credential arguments');
const BASE='https://zhihu-four-seasons.pages.dev';
const CALLBACK=BASE+'/api/auth/zhihu/callback';
const EXPECTED_ENTRY='/assets/index-cCWFC7bP.js';
const out=new URL('../test-results/zhihu-oauth-public/',import.meta.url);
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_PATH||'C:/Users/25293/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const report={passed:false,startedAt:new Date().toISOString(),base:BASE,expectedEntry:EXPECTED_ENTRY,nativeChecks:[],cases:[],pageErrors:[],
  method:{stablePublicHttps:true,requireOAuthDisabled:true,realAuthorizationAttempts:0,realModelCalls:0,realSearchCalls:0,isolatedChrome:true,isolatedBrowserStorage:true,existingServerUntouched:true,dice:'Unmodified random dice; one first-event smoke per viewport.',network:'Isolated Chrome --no-proxy-server, D3D11. System settings and TLS checks unchanged.',scope:'Public homepage, fixed inactive callback, optional-login guest fallback, first event only. Not a complete playthrough or live OAuth acceptance.',privacy:'No cookie values, tokens, app credentials, user profiles or existing saves are inspected or recorded.'}};
let browser,currentPage;
const contexts=new Set();
await fs.mkdir(out,{recursive:true});
const save=()=>fs.writeFile(new URL('report.json',out),JSON.stringify(report,null,2));
function safeError(error){return String(error?.message||'Public smoke failed').replace(/https?:\/\/[^\s)"']+/g,value=>{try{const url=new URL(value);return url.origin+url.pathname;}catch{return '[URL]';}}).slice(0,600);}
async function nativeGet(path){return fetch(BASE+path,{method:'GET',redirect:'manual',signal:AbortSignal.timeout(30000)});}
function assertInactive(body){
  assert.equal(body?.enabled,false,'Public OAuth must remain disabled until real registration is confirmed');
  assert.notEqual(body.authenticated,true,'Smoke test must not use a signed-in user');
  assert.equal(body.provider,'zhihu');assert.equal(body.callbackUrl,CALLBACK);
  assert.ok(!body.profile,'Disabled OAuth must not return a user profile');
  assert.ok(!Object.keys(body).some(key=>/token|secret|app_key|appKey/i.test(key)),'Auth status must not return credential fields');
}
async function within(page,selector){
  const result=await page.locator(selector).evaluate(node=>{
    const r=node.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
    return {within:r.left>=-1&&r.top>=-1&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1,uncovered:hit===node||node.contains(hit)};
  });assert.deepEqual(result,{within:true,uncovered:true},`${selector} must be visible and usable`);return result;
}
try{
  const status=await nativeGet('/api/auth/status');assert.equal(status.status,200);const statusBody=await status.json();assertInactive(statusBody);
  report.nativeChecks.push({path:'/api/auth/status',status:200,enabled:false,authenticated:false,callbackUrl:CALLBACK});
  const callback=await nativeGet('/api/auth/zhihu/callback');assert.equal(callback.status,503,'Unconfigured callback must fail closed');
  assert.match(callback.headers.get('content-type')||'',/text\/html/i);await callback.arrayBuffer();
  report.nativeChecks.push({path:'/api/auth/zhihu/callback',status:503,expectedUnavailable:true});
  const home=await nativeGet('/');assert.equal(home.status,200);const html=await home.text();assert.ok(html.includes(EXPECTED_ENTRY),'Stable homepage must reference the newly deployed OAuth build');
  const entry=await nativeGet(EXPECTED_ENTRY);assert.equal(entry.status,200);assert.ok((await entry.arrayBuffer()).byteLength>0);
  report.nativeChecks.push({path:'/',status:200,entry:EXPECTED_ENTRY},{path:EXPECTED_ENTRY,status:200});await save();

  browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-proxy-server','--enable-webgl','--use-gl=angle','--use-angle=d3d11','--ignore-gpu-blocklist']});
  for(const [width,height]of [[1280,800],[844,390]]){
    const row={id:`guest-${width}x${height}`,width,height,passed:false,stage:'load',nativeAuthReads:0,mockedBusinessApis:[],blockedRequests:[],assetErrors:[],screenshots:[]};report.cases.push(row);await save();
    const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:1,serviceWorkers:'block',reducedMotion:'no-preference'});contexts.add(context);
    await context.route('**/*',route=>{
      const req=route.request(),url=new URL(req.url());
      if(url.origin!==BASE&&!['blob:','data:'].includes(url.protocol)){row.blockedRequests.push({path:url.pathname,type:req.resourceType()});return route.abort();}
      if(url.pathname.startsWith('/api/')){
        if(url.pathname==='/api/auth/status'&&req.method()==='GET'&&!url.search){row.nativeAuthReads++;return route.continue();}
        if(['/api/narrate','/api/practice','/api/experience','/api/ai/status'].includes(url.pathname)){
          row.mockedBusinessApis.push({path:url.pathname,method:req.method(),status:503});return route.fulfill({status:503,json:{error:'Isolated public smoke: no real model or search calls.'}});
        }
        row.blockedRequests.push({path:url.pathname,type:'unapproved-api'});return route.abort();
      }
      return route.continue();
    });
    await context.routeWebSocket('**/*',socket=>{row.blockedRequests.push({path:new URL(socket.url()).pathname,type:'websocket'});socket.close();});
    await context.addInitScript(origin=>{if(location.origin===origin){localStorage.setItem('four-seasons-music','off');localStorage.setItem('four-seasons-auto-depart','off');}},BASE);
    const page=currentPage=await context.newPage();page.setDefaultTimeout(90000);
    page.on('pageerror',error=>report.pageErrors.push({case:row.id,message:safeError(error)}));
    page.on('response',response=>{const url=new URL(response.url());if(url.origin===BASE&&!url.pathname.startsWith('/api/')&&response.status()>=400)row.assetErrors.push({path:url.pathname,status:response.status()});});
    const authResponse=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/auth/status'&&response.request().method()==='GET');
    await page.goto(BASE+'/',{waitUntil:'domcontentloaded',timeout:90000});const nativeAuth=await authResponse;assert.equal(nativeAuth.status(),200);assertInactive(await nativeAuth.json());
    await page.locator('#scene[data-assets="ready"][data-renderer="webgl"]').waitFor();await page.locator('.experience[data-stage="welcome"]').waitFor();
    assert.ok((await page.content()).includes(EXPECTED_ENTRY));assert.equal(await page.locator('.welcome-account-slot').isVisible(),false);assert.equal(await page.locator('[data-auth-action]').count(),0);
    assert.equal(await page.locator('.welcome-actions button').count(),1);row.entryGeometry=await within(page,'#start-full');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
    await page.screenshot({path:fileURLToPath(new URL(`cover-${width}.png`,out))});row.screenshots.push(`cover-${width}.png`);
    await page.locator('#character-name').fill(`公网试玩${width}`);row.stage='start';await save();await page.locator('#start-full').click();
    await page.locator('.experience[data-stage="ready"]').waitFor();assert.equal(await page.locator('#player-name').innerText(),`公网试玩${width}`);
    row.stage='first-random-roll';await save();await page.locator('#continue-travel').click();await page.locator('.experience[data-stage="choice"]').waitFor();
    assert.equal(await page.locator('[data-choice]').count(),3);assert.ok(await page.locator('[data-choice]:enabled').count()>0);
    row.firstEvent={heading:(await page.locator('#event-heading').innerText()).slice(0,120),choiceCount:3};
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
    await page.screenshot({path:fileURLToPath(new URL(`event-${width}.png`,out))});row.screenshots.push(`event-${width}.png`);
    assert.deepEqual(row.blockedRequests,[]);assert.deepEqual(row.assetErrors,[]);assert.ok(row.nativeAuthReads>=1);row.stage='complete';row.passed=true;await save();
    await context.close();contexts.delete(context);currentPage=null;
  }
  assert.deepEqual(report.pageErrors,[]);report.passed=true;
}catch(error){report.failure=safeError(error);if(currentPage)try{await currentPage.screenshot({path:fileURLToPath(new URL('failure.png',out))});}catch{}throw error;}
finally{for(const context of contexts)await context.close();await browser?.close();report.finishedAt=new Date().toISOString();await save();console.log(JSON.stringify(report));}
