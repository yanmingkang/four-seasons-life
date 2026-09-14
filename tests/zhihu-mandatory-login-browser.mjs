// Mandatory-login acceptance against the actual game entry/UI. This owns its
// temporary Vite server and clean browser profiles; it never uses a real user,
// authorization code, OAuth cookie, API key or model/search service.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createServer as createViteServer} from 'vite';
import {newGame,land,choose,advance,snapshot,restore} from '../src/engine.js';
import {JOURNEY_STORAGE_KEY} from '../src/journey-storage.js';
import {ZHIHU_LOGIN_DRAFT_KEY} from '../src/zhihu-auth-ui.js';
import {mockWorldSource} from './helpers/mock-world.mjs';

const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'C:/Users/25293/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=fileURLToPath(new URL('../',import.meta.url));
const out=new URL('../test-results/zhihu-mandatory-login/',import.meta.url);
const report={passed:false,startedAt:new Date().toISOString(),stage:'prepare',cases:[],pageErrors:[],method:{
  isolatedViteServer:true,isolatedBrowserStorage:true,existingServerUntouched:true,allAuthResponsesMocked:true,
  realOAuthCalls:0,realModelCalls:0,realSearchCalls:0,providerNavigationsBlocked:0,
  viewports:[[1280,800],[844,390]],
  rendering:'Fresh login round-trip and first event use real WebGL at both viewports. Persistence/failure cases use the existing mock-world helper with the real game UI.',
  dice:'Test-only one-step Uint32 fixture reaches the first event; production dice code remains unchanged.',
  privacy:'Only fixed paths and boolean authorization checks are recorded. No complete authorize URLs, state values, cookies or user browser data are read or saved.',
  scope:'Entry, one event, saved-journey gating, logout, expiration and retry checks. Not additional complete games or a real provider authorization.'}};
let browser,vite,base,currentPage;
const contexts=new Set();
const ok=(condition,message)=>assert.equal(Boolean(condition),true,message);
const saveReport=()=>fs.writeFile(new URL('report.json',out),JSON.stringify(report,null,2));
const rawSave=page=>page.evaluate(key=>localStorage.getItem(key),JOURNEY_STORAGE_KEY);
const gameOf=async page=>JSON.parse(await rawSave(page))?.game;
const step=name=>{report.stage=name;};
const authUrl=()=>`https://openapi.zhihu.com/authorize?${new URLSearchParams({app_id:'448',response_type:'code',state:'a'.repeat(64),redirect_uri:base+'/api/auth/zhihu/callback'})}`;
function pendingJourney(){
  let state=newGame('full',{enriched:true,name:'已经走过的旅人',talent:'optimistic'});
  state=advance(choose(land(state,1),1));
  ok(state.phase==='ready'&&state.turn===1,'Fixture must contain one real settled event');
  const game=snapshot(state);ok(restore(game),'Fixture must be replay-valid');
  return {game,seconds:987,practiceInvitation:{version:1,seen:false,resolved:false,kind:null}};
}
async function geometry(page,selector){
  const values=await page.locator(selector).evaluateAll(nodes=>nodes.map(node=>{
    const r=node.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
    return {within:r.width>0&&r.height>0&&r.left>=-1&&r.top>=-1&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1,
      uncovered:hit===node||node.contains(hit)};
  }));
  ok(values.length>0&&values.every(value=>value.within&&value.uncovered),'Controls must be fully visible and unobscured');return values;
}
async function screenshot(run,name){
  const path=`${run.row.id}-${name}.png`;
  await run.page.screenshot({path:fileURLToPath(new URL(path,out))});run.row.screenshots.push(path);
}
async function assertWelcome(run,{name,save=undefined}={}){
  await run.page.locator('.experience[data-stage="welcome"]').waitFor();
  assert.equal(await run.page.locator('.welcome-actions button').count(),1,'Only one welcome journey entry');
  assert.equal(await run.page.locator('.welcome-actions #start-full').count(),1);
  assert.match(await run.page.locator('#start-full').innerText(),/走进我的四季/);
  assert.equal(await run.page.locator('[data-auth-action="login"]').count(),0,'No separate optional login control');
  ok(!(await run.page.locator('.welcome-panel').innerText()).includes('可选'),'Welcome must not call login optional');
  run.row.entryGeometry=await geometry(run.page,'#start-full');
  ok(await run.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'No horizontal overflow');
  if(name!==undefined)assert.equal(await run.page.locator('#character-name').inputValue(),name);
  if(save!==undefined)assert.equal(await rawSave(run.page),save,'Welcome must not create or overwrite a journey');
}
async function setup({id,width,height,mode='guest',record=null,world='mock',query=''}){
  step(`${id}-load`);
  const row={id,width,height,passed:false,world,requests:[],navigationChecks:[],unexpectedExternalRequests:0,assetErrors:[],screenshots:[]};
  report.cases.push(row);await saveReport();
  const control={mode,failStart:false,failLogout:false,businessUnauthorized:false};
  const raw=record?JSON.stringify(record,null,2):null;
  const context=await browser.newContext({viewport:{width,height},serviceWorkers:'block',reducedMotion:'reduce'});
  contexts.add(context);
  await context.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());
    if(url.origin!==base&&!['blob:','data:'].includes(url.protocol)){
      if(request.isNavigationRequest()&&url.origin==='https://openapi.zhihu.com'&&url.pathname==='/authorize'){
        report.method.providerNavigationsBlocked++;
        row.navigationChecks.push({https:url.protocol==='https:',expectedHost:url.hostname==='openapi.zhihu.com',expectedPath:url.pathname==='/authorize',
          expectedAppId:url.searchParams.get('app_id')==='448',expectedCallback:url.searchParams.get('redirect_uri')===base+'/api/auth/zhihu/callback',
          opaqueState:/^[A-Za-z0-9_-]{32,256}$/.test(url.searchParams.get('state')||''),codeFlow:url.searchParams.get('response_type')==='code'});
      }else row.unexpectedExternalRequests++;
      await route.abort('blockedbyclient');return;
    }
    if(url.pathname==='/src/world.js'&&world==='mock'){
      await route.fulfill({status:200,contentType:'text/javascript',body:mockWorldSource});return;
    }
    if(url.pathname.startsWith('/api/')){
      row.requests.push({path:url.pathname,method:request.method()});
      if(url.pathname==='/api/auth/status'){
        if(control.mode==='offline'){await route.fulfill({status:503,json:{error:'mock_status_unavailable'}});return;}
        const authenticated=control.mode==='user';
        await route.fulfill({json:{enabled:control.mode!=='disabled',provider:'zhihu',callbackUrl:base+'/api/auth/zhihu/callback',authenticated,
          ...(authenticated?{profile:{name:'知乎账号名字不覆盖玩家'}}:{})}});return;
      }
      if(url.pathname==='/api/auth/zhihu/start'){
        await route.fulfill({status:control.failStart?503:200,json:control.failStart?{error:'mock_login_unavailable'}:{authorizationUrl:authUrl()}});return;
      }
      if(url.pathname==='/api/auth/logout'){
        if(!control.failLogout)control.mode='guest';
        await route.fulfill({status:control.failLogout?503:200,json:{ok:!control.failLogout}});return;
      }
      if(control.businessUnauthorized){control.mode='guest';await route.fulfill({status:401,json:{error:'zhihu_login_required'}});return;}
      await route.fulfill({status:503,json:{error:'isolated_test_no_business_api'}});return;
    }
    await route.continue();
  });
  await context.routeWebSocket('**/*',socket=>socket.close());
  await context.addInitScript(({origin,key,raw})=>{
    if(location.origin!==origin)return;
    if(raw!==null&&localStorage.getItem('mandatory-login-fixture-seeded')===null){localStorage.setItem(key,raw);localStorage.setItem('mandatory-login-fixture-seeded','yes');}
    localStorage.setItem('four-seasons-auto-depart','off');localStorage.setItem('four-seasons-music','off');
    const original=crypto.getRandomValues.bind(crypto);
    crypto.getRandomValues=array=>{if(array instanceof Uint32Array&&array.length===1){array[0]=0;return array;}return original(array);};
  },{origin:base,key:JOURNEY_STORAGE_KEY,raw});
  const page=currentPage=await context.newPage();page.setDefaultTimeout(45000);
  page.on('pageerror',()=>report.pageErrors.push({id,type:'pageerror'}));
  page.on('response',response=>{const url=new URL(response.url());if(url.origin===base&&!url.pathname.startsWith('/api/')&&response.status()>=400)row.assetErrors.push({path:url.pathname,status:response.status()});});
  const run={page,context,row,control,raw,record};
  await openGame(run,query);await assertWelcome(run,{save:raw});return run;
}
async function openGame(run,query=''){
  const statusSeen=run.page.waitForResponse(response=>new URL(response.url()).pathname==='/api/auth/status');void statusSeen.catch(()=>{});
  await run.page.goto(base+'/'+query,{waitUntil:'domcontentloaded'});await statusSeen;
  await run.page.locator('.experience[data-stage="welcome"]').waitFor();
  await run.page.locator(`#scene[data-assets="ready"][data-renderer="${run.row.world==='real'?'webgl':'mock'}"]`).waitFor();
  await run.page.locator('#start-full:enabled').waitFor();
}
const starts=run=>run.row.requests.filter(request=>request.path==='/api/auth/zhihu/start').length;
async function expectAuthNavigation(run){
  const before=run.row.navigationChecks.length,beforeStarts=starts(run);
  const blockedDocument=run.page.waitForEvent('domcontentloaded',{timeout:10000});void blockedDocument.catch(()=>{});
  await run.page.locator('#start-full').click({noWaitAfter:true});
  const limit=Date.now()+10000;
  while(run.row.navigationChecks.length===before&&Date.now()<limit)await new Promise(resolve=>setTimeout(resolve,25));
  assert.equal(run.row.navigationChecks.length,before+1,'One user action starts exactly one intercepted authorization');
  assert.equal(starts(run),beforeStarts+1);ok(Object.values(run.row.navigationChecks.at(-1)).every(Boolean),'Authorization target must match the configured local fixture');
  // Let Chrome finish its deliberately aborted navigation before simulating
  // the callback; otherwise that old navigation can cancel the next goto.
  await blockedDocument;
}
async function refreshFocus(run){
  const response=run.page.waitForResponse(value=>new URL(value.url()).pathname==='/api/auth/status');void response.catch(()=>{});
  await run.page.evaluate(()=>window.dispatchEvent(new Event('focus')));await response;
}
async function assertNoAutoNavigation(run,expected){
  // A bounded observation is intentional: distinguish a user-requested retry
  // from callback/focus handlers that start an automatic redirect loop.
  await run.page.waitForTimeout(500);assert.equal(starts(run),expected,'There must be no automatic authorization redirect');
}
async function startFresh(run,name){
  await run.page.locator('#character-name').fill(name);await run.page.locator('#start-full').click();
  await run.page.locator('.experience[data-stage="ready"]').waitFor();
  const game=await gameOf(run.page);assert.equal(restore(game).name,name);assert.equal(restore(game).turn,0);
  assert.equal(await run.page.locator('#player-name').innerText(),name);return game;
}
async function resumeSaved(run,expected){
  await run.page.locator('#start-full').click();await run.page.locator('#dialog.journey-entry-dialog[open]').waitFor();
  await run.page.locator('#resume').click();await run.page.locator(`.experience[data-stage="${restore(expected).phase}"]`).waitFor();
  assert.deepEqual(await gameOf(run.page),expected,'Resuming must retain replay-valid progress');
  assert.equal(await run.page.locator('#player-name').innerText(),restore(expected).name);
}
async function openAccount(run){
  await run.page.locator('#rules-button').click();await run.page.locator('#dialog[open]').waitFor();
  const account=run.page.locator('.rules-account-slot .zhihu-account-name');await account.waitFor();
  assert.equal(await account.innerText(),'知乎 · 知乎账号名字不覆盖玩家','Rules must expose the authenticated account');
  const button=run.page.locator('.rules-account-slot [data-auth-action="logout"]');await button.waitFor();
  assert.equal(await button.isEnabled(),true,'The visible account must offer logout');
  run.row.accountGeometry=await geometry(run.page,'.rules-account-slot .zhihu-account-name,.rules-account-slot [data-auth-action="logout"]');
  return button;
}
async function assertWelcomeAccount(run){
  // The short landscape cover hides its title strip, including this slot.
  // Check the mounted identity, then verify its user-visible rules entry.
  const account=run.page.locator('.welcome-account-slot .zhihu-account-name');await account.waitFor({state:'attached'});
  assert.equal(await account.textContent(),'知乎 · 知乎账号名字不覆盖玩家','Callback/focus must mount the authenticated account');
  await openAccount(run);await run.page.locator('#dialog-close').click();await run.page.locator('#dialog[open]').waitFor({state:'hidden'});
}
async function logout(run){
  const button=await openAccount(run);await button.click();await run.page.locator('.experience[data-stage="welcome"]').waitFor();
  assert.equal(await run.page.locator('#dialog[open]').count(),0,'Logout closes in-game dialogs');
}
async function finish(run){
  assert.equal(run.row.unexpectedExternalRequests,0);assert.equal(run.row.assetErrors.length,0);run.row.passed=true;
  await saveReport();await run.context.close();contexts.delete(run.context);currentPage=null;
  console.log(JSON.stringify({case:run.row.id,passed:true}));
}

try{
  await fs.mkdir(out,{recursive:true});
  vite=await createViteServer({root,configFile:false,logLevel:'error',server:{host:'127.0.0.1',port:0,strictPort:true}});await vite.listen();
  base=`http://127.0.0.1:${vite.httpServer.address().port}`;
  browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-proxy-server','--enable-webgl','--use-gl=angle','--use-angle=d3d11','--ignore-gpu-blocklist']});
  for(const [width,height]of report.method.viewports){
    {
      const run=await setup({id:`fresh-roundtrip-${width}`,width,height,world:'real'}),name=`我起的旅人名${width}`;
      step(`${run.row.id}-anonymous-main-entry`);await run.page.locator('#character-name').fill(name);await screenshot(run,'anonymous-cover');
      await expectAuthNavigation(run);
      run.control.mode='user';await openGame(run,'?auth=success');
      step(`${run.row.id}-authenticated-cover-account`);await assertWelcomeAccount(run);
      await assertWelcome(run,{name,save:null});
      assert.equal(await run.page.evaluate(key=>sessionStorage.getItem(key),ZHIHU_LOGIN_DRAFT_KEY),null,'One-use player setup draft is consumed');
      await assertNoAutoNavigation(run,1);await screenshot(run,'authenticated-cover');
      step(`${run.row.id}-authenticated-first-event`);await startFresh(run,name);
      await run.page.locator('#continue-travel').click();await run.page.locator('.experience[data-stage="choice"]').waitFor();
      assert.equal(await run.page.locator('[data-choice]').count(),3);run.row.choiceGeometry=await geometry(run.page,'[data-choice]');
      const game=await gameOf(run.page);await screenshot(run,'first-event');
      step(`${run.row.id}-logout-preserves-progress`);await logout(run);await assertWelcome(run,{name});
      assert.deepEqual(await gameOf(run.page),game,'Logout must retain the just-reached event');
      await run.page.keyboard.press('Space');await assertNoAutoNavigation(run,1);
      assert.deepEqual(await gameOf(run.page),game);assert.equal(await run.page.locator('[data-choice]').count(),0);
      run.row.checks={singleEntry:true,noOptionalLogin:true,anonymousCannotStart:true,userGestureOnlyRedirect:true,playerNameRestored:true,
        accountNameDoesNotOverride:true,authenticatedFirstEventThreeChoices:true,logoutReturnsToCover:true,logoutPreservesSave:true,noPostLogoutPlay:true};
      await finish(run);
    }
    {
      const record=pendingJourney(),run=await setup({id:`saved-expiration-${width}`,width,height,record});
      step(`${run.row.id}-anonymous-cannot-resume`);assert.equal(await run.page.locator('#resume').count(),0);
      await expectAuthNavigation(run);await openGame(run);await assertWelcome(run,{save:run.raw});await assertNoAutoNavigation(run,1);
      run.control.mode='user';await refreshFocus(run);await assertWelcomeAccount(run);
      step(`${run.row.id}-authenticated-resume`);await resumeSaved(run,record.game);
      assert.deepEqual(JSON.parse(await rawSave(run.page)).practiceInvitation,record.practiceInvitation);
      step(`${run.row.id}-expiration-focus`);run.control.mode='guest';await refreshFocus(run);await assertWelcome(run);
      assert.deepEqual(await gameOf(run.page),record.game);await run.page.keyboard.press('Space');await assertNoAutoNavigation(run,1);
      assert.deepEqual(await gameOf(run.page),record.game);assert.equal(await run.page.locator('#continue-travel').isVisible(),false);
      step(`${run.row.id}-login-resume-after-expiration`);run.control.mode='user';await openGame(run);await resumeSaved(run,record.game);
      step(`${run.row.id}-status-outage-during-play`);run.control.mode='offline';await refreshFocus(run);await assertWelcome(run);
      assert.deepEqual(await gameOf(run.page),record.game);await assertNoAutoNavigation(run,1);
      await screenshot(run,'paused-cover');
      run.row.checks={anonymousCannotResume:true,anonymousEntryPreservesExactSaveBytes:true,authenticatedResumePreservesGame:true,
        invitationMetadataPreserved:true,accountNameDoesNotOverride:true,expirationReturnsToCover:true,expirationStopsDice:true,
        expiredSaveResumable:true,statusOutagePausesGame:true,noAutomaticRedirect:true};await finish(run);
    }
    {
      const run=await setup({id:`unavailable-retry-${width}`,width,height,mode:'offline'});
      step(`${run.row.id}-unavailable-entry`);await run.page.locator('#start-full').click();await assertWelcome(run,{save:null});
      await assertNoAutoNavigation(run,0);await run.page.locator('#start-full:enabled').waitFor();
      step(`${run.row.id}-failed-callback`);run.control.mode='guest';await openGame(run,'?auth=failed');
      await assertWelcome(run,{save:null});await assertNoAutoNavigation(run,0);
      step(`${run.row.id}-failed-login-start`);run.control.failStart=true;
      const startResponse=run.page.waitForResponse(value=>new URL(value.url()).pathname==='/api/auth/zhihu/start');void startResponse.catch(()=>{});
      await run.page.locator('#start-full').click();assert.equal((await startResponse).status(),503);
      await run.page.locator('#start-full:enabled').waitFor();await assertWelcome(run,{save:null});await assertNoAutoNavigation(run,1);
      step(`${run.row.id}-explicit-retry`);run.control.failStart=false;await expectAuthNavigation(run);
      await openGame(run);await assertWelcome(run,{save:null});await assertNoAutoNavigation(run,2);
      run.row.checks={status503FailsClosed:true,failedCallbackDoesNotStartOrRedirect:true,failedLoginStartFailsClosed:true,
        entryRemainsRetryable:true,explicitRetryStartsOneAuthorization:true,noAnonymousSave:true,noAutomaticRedirect:true};await finish(run);
    }
    {
      const run=await setup({id:`logout-failure-${width}`,width,height,mode:'user',record:pendingJourney()});
      await resumeSaved(run,run.record.game);run.control.failLogout=true;
      step(`${run.row.id}-lock-before-server-confirmation`);await logout(run);await assertWelcome(run);
      assert.deepEqual(await gameOf(run.page),run.record.game);
      // An unconfirmed logout intentionally suppresses ordinary refreshes;
      // focus must not revive the still-valid remote session behind the user.
      await run.page.evaluate(()=>window.dispatchEvent(new Event('focus')));await assertWelcome(run);
      await run.page.keyboard.press('Space');await assertNoAutoNavigation(run,0);assert.deepEqual(await gameOf(run.page),run.record.game);
      run.row.checks={failedLogoutKeepsGameLocked:true,progressPreserved:true,focusDoesNotSilentlyResume:true,noAutomaticRedirect:true};await finish(run);
    }
    {
      const state=choose(land(newGame('full',{enriched:true,name:'回响验收旅人',talent:'optimistic'}),1),1);
      const record={game:snapshot(state),seconds:45,practiceInvitation:{version:1,seen:false,resolved:false,kind:null}};
      const run=await setup({id:`business-401-${width}`,width,height,mode:'user',record});await resumeSaved(run,record.game);
      step(`${run.row.id}-reject-business-after-expiration`);run.control.businessUnauthorized=true;
      const business=run.page.waitForResponse(value=>new URL(value.url()).pathname==='/api/narrate');void business.catch(()=>{});
      await run.page.locator('.reflection-drawer > summary').click();assert.equal((await business).status(),401);
      await assertWelcome(run);assert.deepEqual(await gameOf(run.page),record.game);await assertNoAutoNavigation(run,0);
      assert.equal(await run.page.locator('#next-button').count(),0);await run.page.keyboard.press('Space');
      assert.deepEqual(await gameOf(run.page),record.game);run.row.checks={business401ReturnsToCover:true,settledChoicePreserved:true,
        noAnonymousFeedbackContinuation:true,noAutomaticRedirect:true,noRealNarration:true};await finish(run);
    }
  }
  {
    const run=await setup({id:'portrait-expiration-dialog',width:844,height:390,mode:'user',record:pendingJourney()});
    await resumeSaved(run,run.record.game);await run.page.locator('#rules-button').click();await run.page.locator('#dialog[open]').waitFor();
    step(`${run.row.id}-rotate-open-dialog`);await run.page.setViewportSize({width:390,height:844});
    await run.page.locator('#orientation-gate:not([hidden])').waitFor();assert.equal(await run.page.locator('#dialog[open]').count(),0);
    run.control.mode='guest';await refreshFocus(run);
    await run.page.waitForFunction(()=>document.querySelector('.experience')?.dataset.stage==='welcome');
    step(`${run.row.id}-return-landscape`);await run.page.setViewportSize({width:844,height:390});
    await run.page.locator('#orientation-gate[hidden]').waitFor({state:'attached'});await assertWelcome(run);
    assert.equal(await run.page.locator('#dialog[open]').count(),0);assert.equal(await run.page.locator('#dialog-content > *').count(),0);
    assert.deepEqual(await gameOf(run.page),run.record.game);await assertNoAutoNavigation(run,0);await screenshot(run,'landscape-paused');
    run.row.checks={portraitDialogClosed:true,expiredPortraitReturnsToCover:true,landscapeDoesNotReviveStaleDialog:true,
      staleDialogContentsRemoved:true,progressPreserved:true,noAutomaticRedirect:true};await finish(run);
  }
  {
    const run=await setup({id:'storage-failure-memory-recovery',width:1280,height:800,mode:'user',record:pendingJourney()});
    await resumeSaved(run,run.record.game);
    await run.page.evaluate(key=>{
      window.__mandatoryStorageBlocked=true;const original=Storage.prototype.setItem;
      Storage.prototype.setItem=function(name,value){if(this===localStorage&&name===key&&window.__mandatoryStorageBlocked)throw new DOMException('Isolated write failure','QuotaExceededError');return original.call(this,name,value);};
    },JOURNEY_STORAGE_KEY);
    step(`${run.row.id}-unsaved-settlement`);await run.page.locator('#continue-travel').click();await run.page.locator('.experience[data-stage="choice"]').waitFor();
    await run.page.locator('[data-choice="1"]').click();await run.page.locator('.experience[data-stage="feedback"]').waitFor();
    const expected=snapshot(choose(land(restore(run.record.game),1),1));assert.equal(await run.page.locator('#round-value').innerText(),'2');
    assert.deepEqual(await gameOf(run.page),run.record.game,'Blocked writes retain the old disk snapshot');
    step(`${run.row.id}-expired-with-memory-only-progress`);run.control.mode='guest';await refreshFocus(run);await assertWelcome(run);
    assert.match(await run.page.locator('#toast').innerText(),/当前页面|不要关闭|暂存/,'Memory-only progress must be described truthfully');
    const attempted=run.page.waitForResponse(value=>new URL(value.url()).pathname==='/api/auth/zhihu/start');void attempted.catch(()=>{});
    await run.page.locator('#start-full').click();await attempted;await run.page.locator('#start-full:enabled').waitFor();
    await assertWelcome(run);await assertNoAutoNavigation(run,1);assert.equal(run.row.navigationChecks.length,0,'Memory-only journey must block leaving for OAuth');
    assert.match(await run.page.locator('#toast').innerText(),/存储|未写入/,'Blocked navigation explains the storage prerequisite');
    step(`${run.row.id}-same-page-memory-resume`);run.control.mode='user';await refreshFocus(run);
    await run.page.locator('#start-full').click();await run.page.locator('#resume').click();await run.page.locator('.experience[data-stage="feedback"]').waitFor();
    assert.equal(await run.page.locator('#round-value').innerText(),'2','Resume prefers new in-memory progress to the old disk save');
    assert.deepEqual(await gameOf(run.page),run.record.game);
    step(`${run.row.id}-storage-restored-before-login`);run.control.mode='guest';await refreshFocus(run);await assertWelcome(run);
    await run.page.evaluate(()=>{window.__mandatoryStorageBlocked=false;});await expectAuthNavigation(run);
    run.control.mode='user';await openGame(run,'?auth=success');assert.deepEqual(await gameOf(run.page),expected,'Navigation waits until current progress can be persisted');
    await resumeSaved(run,expected);assert.equal(await run.page.locator('#round-value').innerText(),'2');
    run.row.checks={writeFailureDoesNotEraseOldSave:true,memoryOnlyNoticeTruthful:true,failedPersistenceBlocksAuthorizationNavigation:true,
      samePageResumeUsesNewMemoryState:true,restoredStoragePersistsBeforeNavigation:true,reloadResumesLatestSettlement:true};await finish(run);
  }
  assert.equal(report.pageErrors.length,0);report.passed=true;step('complete');
}catch(error){
  report.failure={stage:report.stage,kind:error.name,message:'Mandatory-login acceptance failed at this fixed checkpoint.',
    ...(error.code==='ERR_ASSERTION'?{assertion:String(error.message).split('\n')[0].replace(/https?:\S+/g,'[URL]').slice(0,180)}:{})};process.exitCode=1;
  if(currentPage)try{
    if(new URL(currentPage.url()).origin===base){await currentPage.screenshot({path:fileURLToPath(new URL('failure.png',out))});report.failure.screenshot='failure.png';
      report.failure.ui=await currentPage.evaluate(()=>({stage:document.querySelector('.experience')?.dataset.stage,dialogOpen:Boolean(document.querySelector('#dialog')?.open),entryDisabled:Boolean(document.querySelector('#start-full')?.disabled)}));}
  }catch{}
}finally{
  for(const context of contexts)await context.close().catch(()=>{});await browser?.close().catch(()=>{});await vite?.close().catch(()=>{});
  report.finishedAt=new Date().toISOString();await saveReport();console.log(JSON.stringify(report));
}
