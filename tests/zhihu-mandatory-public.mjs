// Run only after the mandatory-login frontend and Worker are both published.
// All contexts are new and anonymous. One login start is permitted; its Zhihu
// navigation is blocked BEFORE networking. No successful login is simulated.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

assert.equal(process.argv.length,2,'No target or credential arguments are accepted');
const BASE='https://zhihu-four-seasons.pages.dev',CALLBACK=BASE+'/api/auth/zhihu/callback',APP_ID='448';
const out=new URL('../test-results/zhihu-mandatory-public-cachefix/',import.meta.url);
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'C:/Users/25293/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const businessPaths=new Set(['/api/narrate','/api/practice','/api/experience','/api/ai/status']);
const report={passed:false,startedAt:new Date().toISOString(),nativeChecks:[],cases:[],pageErrors:[],method:{
  stablePublicHttps:true,isolatedAnonymousBrowserStorage:true,existingServerUntouched:true,
  realLoginStartRequests:0,providerNavigationsBlocked:0,realProviderNavigations:0,realTokenExchanges:0,
  realUserProfileCalls:0,realModelCalls:0,realSearchCalls:0,
  scope:'Real anonymous mandatory-login gate checks at two viewports, plus one intercepted login-start navigation. Not an authenticated gameplay acceptance or a successful authorization.',
  apiSafety:'Native business probes carry the visitor cookie from the public homepage and exact Origin. Invalid request bodies/source prevent model/search calls even if an old release is mistakenly deployed.',
  interception:'Browser allows same-origin static assets and auth/status. Exactly one auth/start is permitted in a separate context; every provider request is blocked before networking. Browser business calls are unexpected and blocked.',
  statusCacheGuard:'Browser status GET requires one non-private check parameter in the expected timestamp-counter format; OAuth callback and state are unchanged.',
  privacy:'No existing browser profile or player save is opened. Cookies, authorization URLs and state remain transient and are never printed, persisted or captured in screenshots.',
  network:'Isolated headless Chrome with --no-proxy-server and D3D11; no machine proxy, DNS, hosts or TLS changes.',
}};
let browser,stage='initializing';
const contexts=new Set();
await fs.mkdir(out,{recursive:true});
const save=()=>fs.writeFile(new URL('report.json',out),JSON.stringify(report,null,2));
const check=(value,message)=>assert.equal(Boolean(value),true,message);
const native=(path,options={})=>fetch(BASE+path,{...options,redirect:'manual',signal:AbortSignal.timeout(20000)});
function anonymousEnabled(body){
  check(body?.enabled===true&&body.authenticated===false,'Expected enabled, anonymous OAuth status');
  check(body.provider==='zhihu'&&body.callbackUrl===CALLBACK,'Expected fixed provider and callback');
  check(!body.profile,'Anonymous status must not expose a profile');
  check(!Object.keys(body).some(key=>/token|secret|app_key|appKey/i.test(key)),'No credential fields');
}
function validStatusQuery(url){
  return [...url.searchParams.keys()].length===1&&url.searchParams.getAll('check').length===1
    &&/^[a-z0-9]+-\d+$/.test(url.searchParams.get('check')||'');
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
function journeyState(){
  return {
    welcome:document.querySelector('.experience')?.dataset.stage==='welcome',
    noJourneySave:!Object.keys(localStorage).some(key=>/^four-seasons-life-v\d+$/.test(key)),
    noChoiceButtons:document.querySelectorAll('[data-choice]').length===0,
  };
}
async function assertWelcome(page,row){
  const state=await page.evaluate(journeyState);
  check(Object.values(state).every(Boolean),'An anonymous page must not start or persist a journey');
  row.journeyState=state;
  check(await page.locator('#start-full').isEnabled(),'The main entry should be ready to initiate login');
  check((await page.locator('#start-full').innerText()).includes('登录知乎后'),'Main entry must explain mandatory login');
  assert.equal(await page.locator('[data-auth-action="login"]').count(),0,'No separate optional login button');
  assert.equal(await page.locator('.welcome-actions button').count(),1,'Exactly one main journey entry');
  assert.equal(await page.locator('#start-demo, #start-sample').count(),0,'No guest/demo bypass entry');
  const geometry=await page.locator('#start-full').evaluate(node=>{
    const box=node.getBoundingClientRect(),hit=document.elementFromPoint(box.x+box.width/2,box.y+box.height/2);
    return {within:box.left>=-1&&box.top>=-1&&box.right<=innerWidth+1&&box.bottom<=innerHeight+1,
      uncovered:hit===node||node.contains(hit)};
  });
  check(geometry.within&&geometry.uncovered,'The main login entry must be visible and unobstructed');
  row.entryGeometry=geometry;
  check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'No horizontal document overflow');
}
async function setup(width,height,{loginProbe=false}={}){
  const row={id:`${loginProbe?'login-navigation':'anonymous'}-${width}x${height}`,width,height,passed:false,
    authStatusReads:0,unexpectedBlockedRequests:0,unexpectedBusinessRequests:[],assetErrors:[],screenshots:[]};
  report.cases.push(row);await save();
  const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:1,serviceWorkers:'block',reducedMotion:'no-preference'});
  contexts.add(context);
  let page,resolveNavigation;
  const navigationSeen=new Promise(resolve=>{resolveNavigation=resolve;});
  await context.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());
    if(url.origin!==BASE&&!['data:','blob:'].includes(url.protocol)){
      if(loginProbe&&request.isNavigationRequest()&&url.origin==='https://openapi.zhihu.com'&&url.pathname==='/authorize'){
        report.method.providerNavigationsBlocked++;
        row.navigationChecks=authorizationChecks(request.url());
        // The new provider document has not committed: inspect only booleans
        // from our isolated game page before deliberately aborting navigation.
        row.beforeNavigation=await page.evaluate(journeyState).catch(()=>({inspectionSucceeded:false}));
        await route.abort('blockedbyclient');resolveNavigation();return;
      }
      row.unexpectedBlockedRequests++;await route.abort('blockedbyclient');return;
    }
    if(url.pathname.startsWith('/api/')){
      if(url.pathname==='/api/auth/status'&&request.method()==='GET'&&validStatusQuery(url)){row.authStatusReads++;await route.continue();return;}
      if(loginProbe&&url.pathname==='/api/auth/zhihu/start'&&request.method()==='POST'&&!url.search&&report.method.realLoginStartRequests===0){
        report.method.realLoginStartRequests++;await route.continue();return;
      }
      if(businessPaths.has(url.pathname))row.unexpectedBusinessRequests.push({path:url.pathname,method:request.method()});
      row.unexpectedBlockedRequests++;await route.abort('blockedbyclient');return;
    }
    await route.continue();
  });
  await context.routeWebSocket('**/*',socket=>{row.unexpectedBlockedRequests++;socket.close();});
  await context.addInitScript(origin=>{if(location.origin===origin){
    localStorage.setItem('four-seasons-music','off');localStorage.setItem('four-seasons-auto-depart','off');
  }},BASE);
  page=await context.newPage();page.setDefaultTimeout(90000);
  page.on('pageerror',()=>report.pageErrors.push({case:row.id,type:'pageerror'}));
  page.on('response',response=>{const url=new URL(response.url());
    if(url.origin===BASE&&!url.pathname.startsWith('/api/')&&response.status()>=400)row.assetErrors.push({path:url.pathname,status:response.status()});
  });
  const statusPromise=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/auth/status'&&response.request().method()==='GET');
  void statusPromise.catch(()=>{});
  await page.goto(BASE+'/',{waitUntil:'domcontentloaded',timeout:90000});
  const status=await statusPromise;assert.equal(status.status(),200);anonymousEnabled(await status.json());
  await page.locator('#scene[data-assets="ready"][data-renderer="webgl"]').waitFor();
  await page.locator('.experience[data-stage="welcome"]').waitFor();
  await page.waitForFunction(()=>{const button=document.querySelector('#start-full');return button&&!button.disabled&&button.innerText.includes('登录知乎后');});
  await assertWelcome(page,row);
  return {page,context,row,navigationSeen};
}

try{
  stage='native-new-homepage';
  const localIndex=await fs.readFile(new URL('../dist/index.html',import.meta.url),'utf8');
  const expectedEntry=localIndex.match(/src="(\/assets\/index-[A-Za-z0-9_-]+\.js)"/)?.[1];
  check(expectedEntry,'Build the mandatory frontend before running this smoke');
  const home=await native('/');assert.equal(home.status,200);
  check((await home.text()).includes(expectedEntry),'Published homepage must match the latest local build');
  const visitorCookie=home.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ');
  check(/(?:^|; )__Host-four-seasons-visitor=v1\.[a-f0-9]{48}\.\d{10}\.[a-f0-9]{64}(?:;|$)/.test(visitorCookie),'Homepage must provide its signed visitor cookie');
  report.nativeChecks.push({check:'latest-homepage',status:200,expectedEntry:true,receivedSignedVisitorCookie:true});
  stage='native-anonymous-status';
  const status=await native('/api/auth/status',{headers:{Cookie:visitorCookie,Origin:BASE}});
  assert.equal(status.status,200);anonymousEnabled(await status.json());
  report.nativeChecks.push({check:'anonymous-status',status:200,enabled:true,authenticated:false,expectedCallback:true});
  stage='native-health';const health=await native('/api/health');assert.equal(health.status,200);check((await health.json()).ok,'Expected healthy public backend');
  report.nativeChecks.push({check:'public-health',status:200,ok:true});
  stage='native-missing-callback';const callback=await native('/api/auth/zhihu/callback');assert.equal(callback.status,400);
  check(callback.headers.get('referrer-policy')==='no-referrer'&&/no-store/.test(callback.headers.get('cache-control')||''),'Safe callback error headers');
  await callback.arrayBuffer();report.nativeChecks.push({check:'missing-callback-parameters',status:400,rejected:true});
  for(const [path,method]of [['/api/narrate','POST'],['/api/practice','POST'],['/api/experience?source=__mandatory_probe__','GET'],['/api/ai/status','GET']]){
    const label=path.split('?')[0];stage=`native-gate-${label}`;
    const response=await native(path,{method,headers:{Origin:BASE,Cookie:visitorCookie,Accept:'application/json',
      ...(method==='POST'?{'Content-Type':'application/json'}:{})},...(method==='POST'?{body:'{}'}:{})});
    assert.equal(response.status,401,'Anonymous business APIs must reject before validating business input');
    assert.deepEqual(await response.json(),{code:'AUTH_REQUIRED',error:'请先登录知乎账号再开始游戏'});
    check(/no-store/.test(response.headers.get('cache-control')||''),'Denial must not be cached');
    report.nativeChecks.push({check:'anonymous-business-gate',path:label,method,status:401,code:'AUTH_REQUIRED',withVisitorCookie:true});
  }
  await save();
  browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-proxy-server','--enable-webgl','--use-gl=angle','--use-angle=d3d11','--ignore-gpu-blocklist']});
  for(const [width,height]of [[1280,800],[844,390]]){
    stage=`anonymous-${width}-load`;const {page,context,row}=await setup(width,height);
    // Keyboard travel shortcuts must not bypass the initial login requirement.
    await page.locator('#start-full').blur();await page.keyboard.press('Space');
    await page.waitForTimeout(250);await assertWelcome(page,row);
    await page.screenshot({path:fileURLToPath(new URL(`cover-${width}.png`,out))});row.screenshots.push(`cover-${width}.png`);
    assert.equal(row.unexpectedBlockedRequests,0);assert.equal(row.unexpectedBusinessRequests.length,0);assert.equal(row.assetErrors.length,0);
    check(row.authStatusReads>=1,'Expected a real anonymous status read');row.passed=true;
    await save();await context.close();contexts.delete(context);
  }
  stage='single-main-entry-login-load';const {page,context,row,navigationSeen}=await setup(1280,800,{loginProbe:true});
  await page.locator('#character-name').fill('登录验收');
  stage='single-main-entry-login-click';
  const responsePromise=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/auth/zhihu/start'&&response.request().method()==='POST',{timeout:20000});
  void responsePromise.catch(()=>{});
  await page.locator('#start-full').click({noWaitAfter:true});
  const startResponse=await responsePromise;assert.equal(startResponse.status(),200);
  const body=await startResponse.json();
  check(!Object.keys(body).some(key=>/token|secret|app_key|appKey/i.test(key)),'Login start must not expose credential fields');
  row.responseChecks=authorizationChecks(body.authorizationUrl);
  check(Object.values(row.responseChecks).every(Boolean),'Authorization response must match the registered public application');
  let navigationTimer;
  try{await Promise.race([navigationSeen,new Promise((_,reject)=>{navigationTimer=setTimeout(()=>reject(new Error('Expected blocked authorization navigation')),20000);})]);}
  finally{clearTimeout(navigationTimer);}
  check(Object.values(row.navigationChecks||{valid:false}).every(Boolean),'Intercepted navigation must match the same app and callback');
  check(Object.values(row.beforeNavigation||{valid:false}).every(Boolean),'Redirecting to login must not start or save a game');
  assert.equal(report.method.realLoginStartRequests,1);assert.equal(report.method.providerNavigationsBlocked,1);
  assert.equal(row.unexpectedBlockedRequests,0);assert.equal(row.unexpectedBusinessRequests.length,0);assert.equal(row.assetErrors.length,0);
  row.passed=true;await context.close();contexts.delete(context);
  assert.equal(report.pageErrors.length,0);report.passed=true;stage='complete';
}catch{
  // Never serialize exception messages or URLs: they may contain OAuth state.
  report.failure={stage,message:'Mandatory-login public smoke did not satisfy this check.'};process.exitCode=1;
}finally{
  for(const context of contexts)await context.close().catch(()=>{});
  await browser?.close().catch(()=>{});report.finishedAt=new Date().toISOString();await save();console.log(JSON.stringify(report));
}
