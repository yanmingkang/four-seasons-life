// Optional account UI acceptance only: isolated browser, mocked OAuth endpoints,
// no real authorizations, API charges, user storage or existing server changes.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createServer as createViteServer} from 'vite';
import {JOURNEY_STORAGE_KEY} from '../src/journey-storage.js';
import {ZHIHU_LOGIN_DRAFT_KEY} from '../src/zhihu-auth-ui.js';

const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_PATH||'C:/Users/25293/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=fileURLToPath(new URL('../',import.meta.url)),out=new URL('../test-results/zhihu-auth-ui/',import.meta.url);
const report={passed:false,startedAt:new Date().toISOString(),cases:[],pageErrors:[],realOAuthCalls:0,realModelCalls:0,existingServerUntouched:true};
let browser,vite,currentPage;
const markup=`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><link rel="stylesheet" href="/src/zhihu-auth.css"></head><body><input id="name" value="我的旅人"><main class="welcome-top"><div id="account"></div><button id="start">走进我的四季</button></main><div id="notice" role="status"></div><script type="module">
import {createZhihuAuthUI} from '/src/zhihu-auth-ui.js';
window.navigationTargets=[];window.authNotices=[];window.beforeCount=0;
window.auth=createZhihuAuthUI({navigate:url=>navigationTargets.push(url),beforeNavigate:()=>{beforeCount++;},notify:text=>{authNotices.push(text);document.querySelector('#notice').textContent=text;}});
auth.mount(document.querySelector('#account'));await auth.refresh();window.uiReady=true;
</script></body></html>`;
const server=createServer(async(req,res)=>{
  const path=new URL(req.url,'http://localhost').pathname;
  if(['/src/zhihu-auth-ui.js','/src/zhihu-auth.css'].includes(path)){
    res.writeHead(200,{'Content-Type':path.endsWith('.css')?'text/css':'text/javascript'});res.end(await fs.readFile(new URL('..'+path,import.meta.url)));return;
  }
  res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(markup);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const harness=`http://127.0.0.1:${server.address().port}`;
const authorizationUrl=origin=>'https://openapi.zhihu.com/authorize?'+new URLSearchParams({app_id:'ui-mock-app',response_type:'code',state:'a'.repeat(64),redirect_uri:origin+'/api/auth/zhihu/callback'});
async function scenario({id,status={enabled:true,authenticated:false},startUrl,failStart=false,failLogout=false,query='',width=844,height=390}){
  const context=await browser.newContext({viewport:{width,height},serviceWorkers:'block',reducedMotion:'reduce'}),requests=[];
  await context.route('**/*',route=>{
    const req=route.request(),url=new URL(req.url());
    if(url.origin!==harness)return route.abort();
    if(url.pathname.startsWith('/api/')){
      requests.push({path:url.pathname,method:req.method()});
      if(url.pathname==='/api/auth/status')return route.fulfill({status:status===null?503:200,json:status??{error:'mock_unavailable'}});
      if(url.pathname==='/api/auth/zhihu/start')return route.fulfill({status:failStart?503:200,json:{authorizationUrl:startUrl??authorizationUrl(harness)}});
      if(url.pathname==='/api/auth/logout')return route.fulfill({status:failLogout?503:200,json:{ok:!failLogout}});
      return route.abort();
    }
    return route.continue();
  });
  await context.addInitScript(()=>{localStorage.setItem('untouched-save','keep-my-game');sessionStorage.setItem('untouched-draft','keep-this');});
  const page=currentPage=await context.newPage();page.on('pageerror',error=>report.pageErrors.push({id,message:error.message}));
  await page.goto(harness+query);await page.waitForFunction(()=>window.uiReady);
  return {page,context,requests,id};
}
async function finish(run){
  assert.deepEqual(await run.page.evaluate(()=>({name:document.querySelector('#name').value,local:localStorage.getItem('untouched-save'),session:sessionStorage.getItem('untouched-draft'),localCount:localStorage.length,sessionCount:sessionStorage.length})),{name:'我的旅人',local:'keep-my-game',session:'keep-this',localCount:1,sessionCount:1});
  report.cases.push({id:run.id,passed:true,requests:run.requests});await run.context.close();currentPage=null;
}
try{
  await fs.mkdir(out,{recursive:true});
  browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-proxy-server','--enable-webgl','--use-gl=angle','--use-angle=d3d11','--ignore-gpu-blocklist']});
  for(const status of [{enabled:false,authenticated:false},null]){
    const run=await scenario({id:status?'disabled-guest':'unavailable-guest',status});assert.equal(await run.page.locator('#account').isVisible(),false);assert.equal(await run.page.locator('#start').isEnabled(),true);assert.deepEqual(await run.page.evaluate(()=>authNotices),[]);await finish(run);
  }
  {
    const run=await scenario({id:'enabled-manual-login'});assert.equal(await run.page.locator('[data-auth-action="login"]').count(),1);assert.deepEqual(await run.page.evaluate(()=>navigationTargets),[]);
    await run.page.locator('[data-auth-action="login"]').click();await run.page.waitForFunction(()=>navigationTargets.length===1);
    assert.equal(await run.page.evaluate(()=>beforeCount),1);assert.equal(run.requests.filter(r=>r.path.endsWith('/start')).length,1);assert.equal(run.requests.at(-1).method,'POST');await finish(run);
  }
  for(const [id,startUrl,failStart]of [['failure-guest',null,true],['reject-external','https://evil.example/authorize',false],['reject-javascript','javascript:alert(1)',false],['reject-other-callback',authorizationUrl('https://evil.example'),false]]){
    const run=await scenario({id,startUrl,failStart});await run.page.locator('[data-auth-action="login"]').click();await run.page.waitForFunction(()=>authNotices.length>0);
    assert.deepEqual(await run.page.evaluate(()=>navigationTargets),[]);assert.equal(await run.page.evaluate(()=>beforeCount),0);assert.equal(await run.page.locator('#start').isEnabled(),true);assert.equal(await run.page.locator('[data-auth-action="login"]').isEnabled(),true);await finish(run);
  }
  {
    const run=await scenario({id:'confirmed-callback-profile-escaped',status:{enabled:true,authenticated:true,profile:{name:'<img src=x onerror=alert(1)>'}},query:'/?auth=success&view=map#keep'});
    assert.equal(await run.page.locator('.zhihu-account-name').innerText(),'知乎 · <img src=x onerror=alert(1)>');assert.equal(await run.page.locator('#account img').count(),0);assert.equal(new URL(run.page.url()).search,'?view=map');assert.equal(new URL(run.page.url()).hash,'#keep');
    assert.deepEqual(await run.page.evaluate(()=>authNotices),['知乎账号已连接。']);await run.page.locator('[data-auth-action="logout"]').click();await run.page.locator('[data-auth-action="login"]').waitFor();assert.equal(run.requests.at(-1).method,'POST');await finish(run);
  }
  {
    const run=await scenario({id:'callback-failure-with-guest',query:'/?auth=failed&keep=1'});assert.match(await run.page.locator('#notice').innerText(),/游客/);assert.equal(new URL(run.page.url()).search,'?keep=1');assert.deepEqual(await run.page.evaluate(()=>navigationTargets),[]);await finish(run);
  }
  {
    const run=await scenario({id:'unconfirmed-success-is-not-login',query:'/?auth=success'});assert.match(await run.page.locator('#notice').innerText(),/尚未完成/);assert.equal(await run.page.locator('[data-auth-action="logout"]').count(),0);await finish(run);
  }
  {
    const run=await scenario({id:'logout-failure-keeps-identity',status:{enabled:true,authenticated:true,profile:{name:'测试知友'}},failLogout:true});await run.page.locator('[data-auth-action="logout"]').click();await run.page.waitForFunction(()=>authNotices.length>0);assert.match(await run.page.locator('.zhihu-account-name').innerText(),/测试知友/);await finish(run);
  }
  {
    const run=await scenario({id:'stale-status-cannot-undo-logout',status:{enabled:true,authenticated:true,profile:{name:'测试知友'}}});
    let held,requested;
    const pending=new Promise(resolve=>{requested=resolve;});
    await run.context.route('**/api/auth/status',route=>{held=route;requested();});
    await run.page.evaluate(()=>{window.pendingAuth=auth.refresh();});await pending;
    await run.page.locator('[data-auth-action="logout"]').click();await run.page.locator('[data-auth-action="login"]').waitFor();
    await held.fulfill({json:{enabled:true,authenticated:true,profile:{name:'测试知友'}}});
    await run.page.evaluate(()=>window.pendingAuth);assert.equal(await run.page.locator('[data-auth-action="logout"]').count(),0);assert.equal(await run.page.locator('[data-auth-action="login"]').isVisible(),true);await finish(run);
  }
  // Mount in the actual game too, at both normal and short landscape sizes.
  // Vite and all contexts are owned by this test and are closed in finally.
  vite=await createViteServer({root,configFile:false,logLevel:'error',server:{host:'127.0.0.1',port:0,strictPort:true}});await vite.listen();
  const game=`http://127.0.0.1:${vite.httpServer.address().port}`;
  for(const [width,height]of [[1280,800],[844,390]]){
    const context=await browser.newContext({viewport:{width,height},serviceWorkers:'block',reducedMotion:'reduce'}),id=`game-cover-${width}`;
    await context.route('**/*',route=>{
      const url=new URL(route.request().url());if(url.origin!==game&&!['blob:','data:'].includes(url.protocol))return route.abort();
      if(url.pathname==='/api/auth/status')return route.fulfill({json:{enabled:true,authenticated:true,profile:{name:'知乎账号昵称不覆盖旅人'}}});
      if(url.pathname==='/api/auth/logout')return route.fulfill({json:{ok:true}});
      if(url.pathname.startsWith('/api/'))return route.fulfill({status:503,json:{error:'mock_no_real_api'}});
      return route.continue();
    });
    await context.addInitScript(({draftKey})=>{localStorage.setItem('four-seasons-music','off');localStorage.setItem('four-seasons-auto-depart','off');sessionStorage.setItem(draftKey,JSON.stringify({name:'我起的旅人名',talent:'optimistic',expires:Date.now()+600000}));},{draftKey:ZHIHU_LOGIN_DRAFT_KEY});
    const page=currentPage=await context.newPage();page.setDefaultTimeout(60000);page.on('pageerror',error=>report.pageErrors.push({id,message:error.message}));
    await page.goto(game+'/?auth=success');await page.locator('#character-name').waitFor();await page.locator('.welcome-account-slot .zhihu-account-name').waitFor();
    assert.equal(await page.locator('#character-name').inputValue(),'我起的旅人名');assert.equal(await page.locator('input[name="talent"]:checked').inputValue(),'optimistic');
    assert.equal(await page.evaluate(key=>sessionStorage.getItem(key),ZHIHU_LOGIN_DRAFT_KEY),null);assert.equal(await page.evaluate(key=>localStorage.getItem(key),JOURNEY_STORAGE_KEY),null);
    assert.equal(await page.locator('.welcome-actions button').count(),1);
    const geometry=await page.locator('#start-full').evaluate(node=>{const r=node.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {within:r.top>=0&&r.left>=0&&r.right<=innerWidth&&r.bottom<=innerHeight,uncovered:node===hit||node.contains(hit)};});assert.deepEqual(geometry,{within:true,uncovered:true});
    const accountGeometry=await page.locator('.welcome-account-slot button').evaluate(node=>{const r=node.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {within:r.top>=0&&r.left>=0&&r.right<=innerWidth&&r.bottom<=innerHeight,uncovered:node===hit||node.contains(hit)};});assert.deepEqual(accountGeometry,{within:true,uncovered:true});
    await page.locator('#toast.visible').waitFor({state:'hidden'});
    await page.screenshot({path:fileURLToPath(new URL(`cover-${width}.png`,out))});
    await page.locator('#rules-button').click();await page.locator('.rules-account-slot [data-auth-action="logout"]').waitFor();await page.locator('.rules-account-slot [data-auth-action="logout"]').click();await page.locator('.rules-account-slot [data-auth-action="login"]').waitFor();
    await page.locator('#dialog-close').click();assert.equal(await page.locator('#character-name').inputValue(),'我起的旅人名');
    report.cases.push({id,passed:true,geometry,accountGeometry,draftRestored:true,nicknameUnchanged:true,singleJourneyEntry:true,accountInsideRules:true});await context.close();currentPage=null;
  }
  assert.deepEqual(report.pageErrors,[]);report.passed=true;
}catch(error){report.failure=error.message;if(currentPage)try{await currentPage.screenshot({path:fileURLToPath(new URL('failure.png',out))});}catch{}throw error;}
finally{
  await browser?.close();await vite?.close();await new Promise(resolve=>server.close(resolve));report.finishedAt=new Date().toISOString();await fs.writeFile(new URL('report.json',out),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}
