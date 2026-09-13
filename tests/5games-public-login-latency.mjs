// Read-only production checks except one bounded OAuth initiation. Never visits
// the provider or reads the developer's browser profile / credential storage.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url);
const {chromium}=require('C:/Users/25293/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const BASE='https://zhihu-four-seasons.pages.dev',CALLBACK=BASE+'/api/auth/zhihu/callback';
const out=new URL('../test-results/five-games-login-latency-20260913/',import.meta.url);
const report={passed:false,startedAt:new Date().toISOString(),scope:'Anonymous production availability, status latency and one blocked OAuth navigation. Does not establish a signed-in session or measure provider authorization / AI latency.',method:{isolatedBrowser:true,defaultDirectNetwork:true,machineSettingsChanged:false,providerRequests:0,tokenExchanges:0,userProfileRequests:0,modelRequests:0,searchRequests:0,loginStarts:0,statusRequests:0,statusLimit:8,cacheNote:'Safety interception disables browser HTTP cache. Repeat load reuses the browser connection but is not an ordinary warm-cache benchmark.'},native:[],loads:[],statuses:[],login:null,pageErrors:0,assetErrors:[],unexpectedBlocked:[],screenshots:[]};
report.method.renderTimingNote='Other bounded game tests may share this machine. Scene readiness timings are observed experience here, not an exclusive-device graphics benchmark.';
let browser,stage='init';
const contexts=new Set(),networkTasks=new Set(),requestRows=new WeakMap();
const ms=value=>Math.round(value*10)/10;
const save=()=>fs.writeFile(new URL('report.json',out),JSON.stringify(report,null,2));
await fs.mkdir(out,{recursive:true});
function authShape(body){return body?.enabled===true&&body.authenticated===false&&body.provider==='zhihu'&&body.callbackUrl===CALLBACK&&!body.profile&&!Object.keys(body).some(key=>/token|secret|app.?key/i.test(key));}
function authURL(value){let u;try{u=new URL(value);}catch{return {valid:false};}const keys=['app_id','redirect_uri','response_type','state'];return {https:u.protocol==='https:',host:u.host==='openapi.zhihu.com',path:u.pathname==='/authorize',appId:u.searchParams.get('app_id')==='448',callback:u.searchParams.get('redirect_uri')===CALLBACK,flow:u.searchParams.get('response_type')==='code',stateOpaque:/^[A-Za-z0-9_-]{32,256}$/.test(u.searchParams.get('state')||''),exactKeys:[...u.searchParams.keys()].length===4&&keys.every(k=>u.searchParams.getAll(k).length===1),noFragmentOrCredentials:!u.hash&&!u.username&&!u.password};}
function snapshot(){const btn=document.querySelector('#start-full'),r=btn?.getBoundingClientRect(),hit=r&&document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {welcome:document.querySelector('.experience')?.dataset.stage==='welcome',noJourney:!Object.keys(localStorage).some(key=>/^four-seasons-life-v\d+$/.test(key)),noChoice:document.querySelectorAll('[data-choice]').length===0,singleEntry:document.querySelectorAll('.welcome-actions button').length===1,noOptionalEntry:document.querySelectorAll('[data-auth-action="login"],#start-demo,#start-sample').length===0,entryEnabled:Boolean(btn&&!btn.disabled),loginRequired:btn?.innerText.includes('登录知乎后')===true,entryVisible:Boolean(r&&r.left>=-1&&r.top>=-1&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1),entryUncovered:hit===btn||Boolean(btn?.contains(hit)),noHorizontalOverflow:document.documentElement.scrollWidth<=innerWidth+1};}
async function contextFor(viewport,{allowLogin=false}={}){
  const context=await browser.newContext({viewport,serviceWorkers:'block',deviceScaleFactor:1});contexts.add(context);
  let resolveNav;const navigation=new Promise(resolve=>{resolveNav=resolve;});
  await context.route('**/*',async route=>{
    const req=route.request(),u=new URL(req.url());
    if(u.origin!==BASE&&!['data:','blob:'].includes(u.protocol)){
      if(allowLogin&&req.isNavigationRequest()&&u.origin==='https://openapi.zhihu.com'&&u.pathname==='/authorize'){
        report.login.navigation=authURL(req.url());report.login.navigationAtMs=ms(performance.now()-report.login.monotonicStart);report.login.navigationBlocked=true;
        // Inspect no DOM here: navigation may have destroyed its execution context.
        await route.abort('blockedbyclient');resolveNav();return;
      }
      report.unexpectedBlocked.push({path:u.pathname,method:req.method(),external:true});await route.abort('blockedbyclient');return;
    }
    if(u.pathname.startsWith('/api/')){
      if(u.pathname==='/api/auth/status'&&req.method()==='GET'&&report.method.statusRequests<8){report.method.statusRequests++;await route.continue();return;}
      if(allowLogin&&u.pathname==='/api/auth/zhihu/start'&&req.method()==='POST'&&!u.search&&report.method.loginStarts===0){report.method.loginStarts++;await route.continue();return;}
      report.unexpectedBlocked.push({path:u.pathname,method:req.method(),external:false});await route.abort('blockedbyclient');return;
    }
    await route.continue();
  });
  await context.routeWebSocket('**/*',socket=>socket.close());
  await context.addInitScript(()=>{localStorage.setItem('four-seasons-music','off');localStorage.setItem('four-seasons-auto-depart','off');});
  const page=await context.newPage();page.setDefaultTimeout(45000);
  page.on('pageerror',()=>report.pageErrors++);
  page.on('request',req=>{const u=new URL(req.url());if(u.pathname!=='/api/auth/status')return;const row={label:`status-${report.statuses.length+1}`,status:null,headersMs:null,bodyMs:null,validAnonymousBody:false,queryGuard:u.searchParams.getAll('check').length===1&&/^[a-z0-9]+-\d+$/.test(u.searchParams.get('check')||''),start:performance.now()};report.statuses.push(row);requestRows.set(req,row);});
  page.on('response',response=>{const u=new URL(response.url());if(u.origin===BASE&&!u.pathname.startsWith('/api/')&&response.status()>=400)report.assetErrors.push({path:u.pathname,status:response.status()});const row=requestRows.get(response.request());if(!row)return;row.status=response.status();row.headersMs=ms(performance.now()-row.start);const task=(async()=>{try{const raw=await response.text();row.bodyMs=ms(performance.now()-row.start);row.bodyBytes=Buffer.byteLength(raw);row.validAnonymousBody=authShape(JSON.parse(raw));}catch{row.bodyError=true;row.bodyMs=ms(performance.now()-row.start);}delete row.start;})();networkTasks.add(task);task.finally(()=>networkTasks.delete(task));});
  page.on('requestfailed',req=>{const row=requestRows.get(req);if(row){row.requestFailed=true;row.failureCode=req.failure()?.errorText||'failed';}});
  return {context,page,navigation};
}
async function load(page,label,{reload=false}={}){
  stage=label;const started=performance.now(),row={label};report.loads.push(row);await save();
  const mainReady=reload?null:page.waitForSelector('#start-full',{state:'visible',timeout:45000}).then(()=>{row.mainVisibleMs=ms(performance.now()-started);});
  void mainReady?.catch(()=>{});
  // An existing DOM can fulfill selectors before reload. Clear only the test
  // observation by waiting after navigation for reload timings instead.
  if(reload){await page.reload({waitUntil:'domcontentloaded',timeout:45000});row.domContentLoadedMs=ms(performance.now()-started);await page.locator('#start-full').waitFor({state:'visible'});row.mainVisibleMs=ms(performance.now()-started);}else{await page.goto(BASE+'/',{waitUntil:'domcontentloaded',timeout:45000});row.domContentLoadedMs=ms(performance.now()-started);await mainReady;}
  await page.locator('#scene[data-assets="ready"][data-renderer="webgl"]').waitFor();row.sceneReadyMs=ms(performance.now()-started);
  await page.waitForFunction(()=>{const e=document.querySelector('#start-full');return e&&!e.disabled&&e.innerText.includes('登录知乎后');});row.loginReadyMs=ms(performance.now()-started);
  row.snapshot=await page.evaluate(snapshot);assert.ok(Object.values(row.snapshot).every(Boolean),label+' anonymous cover check');
  row.slowestStaticResources=await page.evaluate(()=>performance.getEntriesByType('resource').filter(r=>{const u=new URL(r.name);return u.origin===location.origin&&!u.pathname.startsWith('/api/');}).sort((a,b)=>b.duration-a.duration).slice(0,5).map(r=>({path:new URL(r.name).pathname,durationMs:Math.round(r.duration),transferBytes:r.transferSize,decodedBytes:r.decodedBodySize})));
  const filename=label+'.png';await page.screenshot({path:fileURLToPath(new URL(filename,out))});report.screenshots.push(filename);row.passed=true;await save();return row;
}
try{
  if(process.env.FIVE_GAMES_BROWSER_ONLY!=='1'){
  stage='native-home';let t=performance.now();const home=await fetch(BASE+'/',{redirect:'manual',signal:AbortSignal.timeout(20000)});const headers=ms(performance.now()-t),html=await home.text();assert.equal(home.status,200);const visitorCookie=home.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ');report.native.push({check:'home',status:home.status,headersMs:headers,bodyMs:ms(performance.now()-t),entryHash:html.match(/src="(\/assets\/index-[A-Za-z0-9_-]+\.js)"/)?.[1]});
  for(const [path,method] of [['/api/narrate','POST'],['/api/practice','POST'],['/api/experience?source=__five_games_invalid__','GET'],['/api/ai/status','GET']]){
    stage='anonymous-gate-'+path.split('?')[0];t=performance.now();const response=await fetch(BASE+path,{method,headers:{Cookie:visitorCookie,Origin:BASE,Accept:'application/json',...(method==='POST'?{'Content-Type':'application/json'}:{})},...(method==='POST'?{body:'{}'}:{}),redirect:'manual',signal:AbortSignal.timeout(15000)});const h=ms(performance.now()-t),body=await response.json();report.native.push({check:'anonymous-business-denial',path:path.split('?')[0],status:response.status,headersMs:h,bodyMs:ms(performance.now()-t),authRequired:body.code==='AUTH_REQUIRED'});assert.equal(response.status,401);assert.equal(body.code,'AUTH_REQUIRED');
  }
  }else{
    const first=JSON.parse(await fs.readFile(new URL('first-native-report.json',out),'utf8'));assert.equal(first.method.loginStarts,0);assert.equal(first.method.statusRequests,0);report.native=first.native;report.initialNativeFailure=first.failure;report.method.nativeRetried=false;
  }
  browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-proxy-server','--enable-webgl','--use-gl=angle','--use-angle=d3d11','--ignore-gpu-blocklist']});
  const desktop=await contextFor({width:1280,height:800});await load(desktop.page,'desktop-cold');await load(desktop.page,'desktop-repeat',{reload:true});
  // Two extra status body samples, unique public counters, no credentials read.
  stage='two-status-body-samples';for(let i=1;i<=2;i++)await desktop.page.evaluate(async n=>{const r=await fetch('/api/auth/status?check='+Date.now().toString(36)+'-'+(800+n),{credentials:'same-origin',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(8000)});const b=await r.json();if(r.status!==200||b.authenticated!==false)throw new Error('Anonymous status expected');},i);
  await desktop.context.close();contexts.delete(desktop.context);
  const mobile=await contextFor({width:844,height:390},{allowLogin:true});await load(mobile.page,'short-landscape-cold');
  stage='login-pre-navigation-snapshot';report.login={beforeClick:await mobile.page.evaluate(snapshot),monotonicStart:performance.now(),postStatus:null,navigationBlocked:false};assert.ok(Object.values(report.login.beforeClick).every(Boolean));
  const resultPromise=mobile.page.waitForResponse(r=>new URL(r.url()).pathname==='/api/auth/zhihu/start'&&r.request().method()==='POST',{timeout:20000});void resultPromise.catch(()=>{});
  stage='one-login-start';await mobile.page.locator('#start-full').click({noWaitAfter:true});const result=await resultPromise;report.login.postStatus=result.status();report.login.postHeadersMs=ms(performance.now()-report.login.monotonicStart);const body=await result.json();report.login.postBodyMs=ms(performance.now()-report.login.monotonicStart);report.login.response=authURL(body.authorizationUrl);assert.equal(result.status(),200);assert.ok(Object.values(report.login.response).every(Boolean));
  stage='blocked-provider-navigation';let timer;try{await Promise.race([mobile.navigation,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Navigation not observed')),12000);})]);}finally{clearTimeout(timer);}assert.ok(Object.values(report.login.navigation).every(Boolean));assert.equal(report.method.loginStarts,1);
  assert.equal(report.pageErrors,0);assert.equal(report.assetErrors.length,0);assert.equal(report.unexpectedBlocked.length,0);report.passed=true;stage='complete';
}catch(error){report.failure={stage,type:error?.name||'Error',safeMessage:'This step did not complete its bounded public verification.'};process.exitCode=1;}
finally{
  for(const context of contexts)await context.close().catch(()=>{});await browser?.close().catch(()=>{});await Promise.allSettled([...networkTasks]);for(const row of report.statuses)delete row.start;if(report.login)delete report.login.monotonicStart;
  report.finishedAt=new Date().toISOString();await save();console.log(JSON.stringify(report,null,2));
}
