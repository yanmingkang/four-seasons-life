// Run only AFTER the production Worker has enabled its registered OAuth app.
// Real reads + one real login-start request; stop before the provider receives
// any navigation. All model/search requests are explicitly mocked unavailable.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

assert.equal(process.argv.length,2,'No target, credential or authorization arguments are accepted');
const BASE='https://zhihu-four-seasons.pages.dev';
const CALLBACK=BASE+'/api/auth/zhihu/callback',APP_ID='448';
const EXPECTED_ENTRY='/assets/index-cCWFC7bP.js';
const out=new URL('../test-results/zhihu-oauth-enabled-public/',import.meta.url);
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'C:/Users/25293/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const report={passed:false,startedAt:new Date().toISOString(),nativeChecks:[],cases:[],pageErrors:[],
  method:{stablePublicHttps:true,requireOAuthEnabled:true,isolatedBrowserStorage:true,existingServerUntouched:true,
    realLoginStartRequests:0,providerNavigationsBlocked:0,realProviderNavigations:0,realTokenExchanges:0,realUserProfileCalls:0,realModelCalls:0,realSearchCalls:0,
    scope:'Two fresh guest first-event checks, plus one isolated login click. Not complete playthroughs or successful real-user authorization.',
    interception:'Only public auth/status and a single auth/start reach the backend. All model/search APIs return synthetic 503. Every provider/external navigation is blocked before networking.',
    privacy:'No keys, tokens, cookies, existing browser profiles or player saves are inspected. Authorization URLs/state are used transiently for boolean checks only and never recorded.',
    network:'Isolated Chrome --no-proxy-server and D3D11; no system proxy, DNS, TLS or hosts changes.'}};
let browser,stage='initializing';
const contexts=new Set();
await fs.mkdir(out,{recursive:true});
const save=()=>fs.writeFile(new URL('report.json',out),JSON.stringify(report,null,2));
const check=(condition,message)=>assert.equal(Boolean(condition),true,message);
const nativeGet=path=>fetch(BASE+path,{method:'GET',redirect:'manual',signal:AbortSignal.timeout(30000)});
function assertAnonymousEnabled(body){
  assert.equal(body?.enabled,true,'Public OAuth must be enabled before running this smoke');
  assert.equal(body.authenticated,false,'This test must remain anonymous');
  check(body.provider==='zhihu'&&body.callbackUrl===CALLBACK,'Provider and callback must match the fixed public app');
  check(!body.profile,'Anonymous status must not expose profile data');
  check(!Object.keys(body).some(key=>/token|secret|app_key|appKey/i.test(key)),'Status must not expose credential fields');
}
function authorizationChecks(value){
  if(typeof value!=='string'||value.length>4096)return {valid:false};
  let url;try{url=new URL(value);}catch{return {valid:false};}
  const keys=['app_id','response_type','redirect_uri','state'];
  return {
    https:url.protocol==='https:',host:url.hostname==='openapi.zhihu.com',path:url.pathname==='/authorize',
    noCredentialsOrFragment:!url.username&&!url.password&&!url.port&&!url.hash,
    expectedAppId:url.searchParams.get('app_id')===APP_ID,expectedCallback:url.searchParams.get('redirect_uri')===CALLBACK,
    authorizationCodeFlow:url.searchParams.get('response_type')==='code',
    statePresentAndOpaque:/^[A-Za-z0-9_-]{32,256}$/.test(url.searchParams.get('state')||''),
    exactParameterSet:[...url.searchParams.keys()].length===keys.length&&keys.every(key=>url.searchParams.getAll(key).length===1),
  };
}
async function geometry(page,selector){
  const values=await page.locator(selector).evaluateAll(nodes=>nodes.map(node=>{
    const r=node.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
    return {within:r.left>=-1&&r.top>=-1&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1,
      uncovered:hit===node||node.contains(hit)};
  }));
  check(values.length>0&&values.every(value=>value.within&&value.uncovered),'Expected controls must remain visible and usable');
  return values;
}
async function setup(width,height,{loginProbe=false}={}){
  const row={id:`${loginProbe?'login-navigation':'guest'}-${width}x${height}`,width,height,passed:false,
    authStatusReads:0,mockedBusinessApis:[],unexpectedBlockedRequests:0,assetErrors:[],screenshots:[]};
  report.cases.push(row);await save();
  const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:1,serviceWorkers:'block',reducedMotion:'no-preference'});
  contexts.add(context);
  let resolveNavigation;
  const navigationSeen=new Promise(resolve=>{resolveNavigation=resolve;});
  await context.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());
    if(url.origin!==BASE&&!['data:','blob:'].includes(url.protocol)){
      if(loginProbe&&request.isNavigationRequest()&&url.origin==='https://openapi.zhihu.com'&&url.pathname==='/authorize'){
        report.method.providerNavigationsBlocked++;
        row.navigationChecks=authorizationChecks(request.url());
        await route.abort('blockedbyclient');resolveNavigation();return;
      }
      row.unexpectedBlockedRequests++;await route.abort('blockedbyclient');return;
    }
    if(url.pathname.startsWith('/api/')){
      if(url.pathname==='/api/auth/status'&&request.method()==='GET'&&!url.search){row.authStatusReads++;await route.continue();return;}
      if(loginProbe&&url.pathname==='/api/auth/zhihu/start'&&request.method()==='POST'&&!url.search&&report.method.realLoginStartRequests===0){
        report.method.realLoginStartRequests++;await route.continue();return;
      }
      if(['/api/narrate','/api/practice','/api/experience','/api/ai/status'].includes(url.pathname)){
        row.mockedBusinessApis.push({path:url.pathname,method:request.method(),status:503});
        await route.fulfill({status:503,json:{error:'Isolated enabled OAuth smoke: no model or search calls.'}});return;
      }
      row.unexpectedBlockedRequests++;await route.abort('blockedbyclient');return;
    }
    await route.continue();
  });
  await context.routeWebSocket('**/*',socket=>{row.unexpectedBlockedRequests++;socket.close();});
  await context.addInitScript(origin=>{if(location.origin===origin){
    localStorage.setItem('four-seasons-music','off');localStorage.setItem('four-seasons-auto-depart','off');
  }},BASE);
  const page=await context.newPage();page.setDefaultTimeout(90000);
  // Do not record raw exceptions: browser errors can contain redirected URLs.
  page.on('pageerror',()=>report.pageErrors.push({case:row.id,type:'pageerror'}));
  page.on('response',response=>{const url=new URL(response.url());
    if(url.origin===BASE&&!url.pathname.startsWith('/api/')&&response.status()>=400)row.assetErrors.push({path:url.pathname,status:response.status()});
  });
  const authResponse=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/auth/status'&&response.request().method()==='GET');
  void authResponse.catch(()=>{});
  await page.goto(BASE+'/',{waitUntil:'domcontentloaded',timeout:90000});
  const status=await authResponse;assert.equal(status.status(),200);assertAnonymousEnabled(await status.json());
  await page.locator('#scene[data-assets="ready"][data-renderer="webgl"]').waitFor();
  await page.locator('.experience[data-stage="welcome"]').waitFor();
  await page.locator('.welcome-account-slot [data-auth-action="login"]').waitFor();
  row.loginButtonVisible=await page.locator('.welcome-account-slot [data-auth-action="login"]').isVisible();
  check(row.loginButtonVisible,'Optional login control should appear');
  assert.equal(await page.locator('.welcome-actions button').count(),1,'Keep one main journey entry');
  row.loginGeometry=await geometry(page,'.welcome-account-slot [data-auth-action="login"]');
  row.entryGeometry=await geometry(page,'#start-full');
  return {page,context,row,navigationSeen};
}
try{
  stage='native-enabled-status';const status=await nativeGet('/api/auth/status');assert.equal(status.status,200);
  assertAnonymousEnabled(await status.json());
  report.nativeChecks.push({check:'anonymous-status',status:200,enabled:true,authenticated:false,expectedCallback:true});
  stage='native-missing-callback-parameters';const callback=await nativeGet('/api/auth/zhihu/callback');
  assert.equal(callback.status,400,'Missing code/state must be rejected before any provider request');
  check(/text\/html/i.test(callback.headers.get('content-type')||''),'Expected fixed safe callback page');
  check(callback.headers.get('referrer-policy')==='no-referrer','Callback must not leak its URL');
  check(/no-store/.test(callback.headers.get('cache-control')||''),'Callback must not be cached');
  await callback.arrayBuffer();report.nativeChecks.push({check:'missing-callback-parameters',status:400,rejected:true});
  stage='unchanged-public-frontend';const home=await nativeGet('/');assert.equal(home.status,200);
  check((await home.text()).includes(EXPECTED_ENTRY),'Existing audited frontend should remain deployed');
  report.nativeChecks.push({check:'unchanged-homepage-entry',status:200,expectedEntry:true});await save();
  browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-proxy-server','--enable-webgl','--use-gl=angle','--use-angle=d3d11','--ignore-gpu-blocklist']});
  for(const [width,height]of [[1280,800],[844,390]]){
    stage=`guest-${width}-load`;const {page,context,row}=await setup(width,height);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
    await page.screenshot({path:fileURLToPath(new URL(`cover-${width}.png`,out))});row.screenshots.push(`cover-${width}.png`);
    await page.locator('#character-name').fill(`公开试玩${width}`);
    stage=`guest-${width}-start`;await page.locator('#start-full').click();
    await page.locator('.experience[data-stage="ready"]').waitFor();
    assert.equal(await page.locator('#player-name').innerText(),`公开试玩${width}`);
    stage=`guest-${width}-first-event`;await page.locator('#continue-travel').click();
    await page.locator('.experience[data-stage="choice"]').waitFor();
    assert.equal(await page.locator('[data-choice]').count(),3);check(await page.locator('[data-choice]:enabled').count()>0,'At least one option must be usable');
    row.firstEvent={choiceCount:3,headingVisible:await page.locator('#event-heading').isVisible(),choiceGeometry:await geometry(page,'[data-choice]')};
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
    await page.screenshot({path:fileURLToPath(new URL(`event-${width}.png`,out))});row.screenshots.push(`event-${width}.png`);
    assert.equal(row.unexpectedBlockedRequests,0);assert.equal(row.assetErrors.length,0);check(row.authStatusReads>=1,'Expected real anonymous status read');
    row.passed=true;await save();await context.close();contexts.delete(context);
  }
  stage='single-controlled-login-load';const {page,context,row,navigationSeen}=await setup(1280,800,{loginProbe:true});
  stage='single-controlled-login-click';
  const responsePromise=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/auth/zhihu/start'&&response.request().method()==='POST',{timeout:20000});
  void responsePromise.catch(()=>{});
  // noWaitAfter avoids waiting for the deliberately blocked navigation to finish.
  await page.locator('.welcome-account-slot [data-auth-action="login"]').click({noWaitAfter:true});
  const startResponse=await responsePromise;assert.equal(startResponse.status(),200);
  const body=await startResponse.json();
  check(!Object.keys(body).some(key=>/token|secret|app_key|appKey/i.test(key)),'Login start must not expose credential fields');
  row.responseChecks=authorizationChecks(body.authorizationUrl);
  check(Object.values(row.responseChecks).every(Boolean),'Server-generated authorization target must match the registered app');
  let navigationTimer;
  try{await Promise.race([navigationSeen,new Promise((_,reject)=>{navigationTimer=setTimeout(()=>reject(new Error('Expected intercepted navigation')),20000);})]);}
  finally{clearTimeout(navigationTimer);}
  check(Object.values(row.navigationChecks||{valid:false}).every(Boolean),'Browser navigation target must match the registered app');
  assert.equal(report.method.realLoginStartRequests,1);assert.equal(report.method.providerNavigationsBlocked,1);
  assert.equal(row.unexpectedBlockedRequests,0);assert.equal(row.assetErrors.length,0);row.passed=true;
  await context.close();contexts.delete(context);
  assert.equal(report.pageErrors.length,0);report.passed=true;stage='complete';
}catch{
  // Fixed stage identifiers only; never print assertion inputs or browser URLs.
  report.failure={stage,message:'Enabled OAuth public smoke did not satisfy this check.'};process.exitCode=1;
}finally{
  for(const context of contexts)await context.close().catch(()=>{});
  await browser?.close().catch(()=>{});report.finishedAt=new Date().toISOString();await save();console.log(JSON.stringify(report));
}
