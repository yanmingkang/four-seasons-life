// Read-only product acceptance: failures are injected only at the browser API
// boundary. No live CLI/API, product edits, external traffic or user 4173 access.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {createServer} from 'node:net';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
import {newGame,land,choose,advance,previewChoice,snapshot,restore,summarize} from '../src/engine.js';
import {JOURNEY_STORAGE_KEY} from '../src/journey-storage.js';

const root=fileURLToPath(new URL('../',import.meta.url)),out=fileURLToPath(new URL('../test-results/zhihu-upgrade/',import.meta.url));
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_PATH||'C:/Users/25293/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const report={passed:false,startedAt:new Date().toISOString(),cases:[],errors:[],method:{
  isolatedProduction:true,isolatedStorage:true,user4173Untouched:true,allApisIntercepted:true,externalTrafficBlocked:true,realApiCalls:0,realCLICalls:0,
  fixtures:'Replay-valid completed-journey and cell-13 feedback fixtures. These are targeted failure checks, not additional complete playthroughs.',
  timing:'No product or clock modification. Summary uses its real 50-second abort timer; search uses its real 15-second AbortSignal timeout. A held browser route never reaches the application server.',
  graphics:'Windows Chrome, 1280x800, native D3D11 WebGL. Summary timeout and rehearsal/search cases may run concurrently in independent contexts.',
  boundary:'Only offline fallback handling is accepted here. CLI upgrade and real service/model checks belong to the parent task.',
}};
let server,browser;const contexts=new Set();await fs.mkdir(out,{recursive:true});
let writes=Promise.resolve();const save=()=>{const text=JSON.stringify(report,null,2);writes=writes.then(()=>fs.writeFile(`${out}/fallback-browser.json`,text));return writes;};
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function chooseSafe(state){return state.active.options.map((option,index)=>({index,p:previewChoice(state,option)})).filter(option=>!option.p.disabled).sort((a,b)=>b.p.mood-a.p.mood||b.p.money-a.p.money)[0].index;}
function completedFixture(){let state=newGame('full',{enriched:true,talent:'optimistic',name:'离线总结专项'});while(!state.ended){state=land(state,6);state=advance(choose(state,chooseSafe(state)));}assert.equal(state.ended,'complete');assert.ok(restore(snapshot(state)));return state;}
function practiceFixture(){let state=newGame('full',{enriched:true,talent:'defense',name:'离线陪练专项'});for(const die of [6,6]){state=land(state,die);state=advance(choose(state,chooseSafe(state)));}state=choose(land(state,1),0);assert.equal(state.active.id,'cell-13');assert.equal(state.phase,'feedback');assert.ok(restore(snapshot(state)));return state;}
async function startServer(){
  const html=await fs.readFile(`${root}/dist/index.html`,'utf8'),assets=(await fs.readdir(`${root}/dist/assets`)).filter(name=>/^(?:main|index)-.*\.(?:js|css)$/.test(name));
  report.build={indexSha256:hash(html),assets:await Promise.all(assets.map(async name=>({name,sha256:hash(await fs.readFile(`${root}/dist/assets/${name}`))})))};
  const probe=createServer();await new Promise((resolve,reject)=>{probe.once('error',reject);probe.listen(0,'127.0.0.1',resolve);});const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
  const disabledCli=`${out}/disabled-fallback-cli.exe`;await assert.rejects(fs.access(disabledCli),{code:'ENOENT'});
  server=spawn(process.execPath,['server.mjs','--production'],{cwd:root,windowsHide:true,env:{...process.env,PORT:String(port),ZHIHU_CLI_PATH:disabledCli},stdio:'ignore'});
  let startupError;server.on('error',error=>{startupError=error;});const base=`http://127.0.0.1:${port}`;report.server={base,isolated:true};
  for(let attempt=0;attempt<100;attempt++){if(startupError)throw startupError;if(server.exitCode!==null)throw Error('Isolated server exited');try{if((await fetch(base,{signal:AbortSignal.timeout(1000)})).ok)return base;}catch{}await delay(100);}
  throw Error('Isolated production server unavailable');
}
async function setup(base,name,state,routePolicy){
  const row={name,passed:false,stage:'load',apiIntercepted:[],externalBlocked:[],failedRequests:[],screenshots:[],fixture:snapshot(state)};report.cases.push(row);await save();
  const context=await browser.newContext({viewport:{width:1280,height:800},deviceScaleFactor:1,reducedMotion:'no-preference',serviceWorkers:'block',acceptDownloads:true});contexts.add(context);
  const held=[];
  await context.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin!==base&&!['data:','blob:'].includes(url.protocol)){row.externalBlocked.push(url.origin+url.pathname);return route.abort();}return route.continue();});
  await context.route('**/api/**',route=>{
    const request=route.request(),url=new URL(request.url());let payload;try{payload=request.postDataJSON();}catch{}
    const entry={path:url.pathname,query:url.search,method:request.method(),at:Date.now(),payload};row.apiIntercepted.push(entry);
    if(routePolicy(entry,row)==='hold'){entry.failure='held-until-client-abort';held.push(route);return;}
    entry.failure='http-503';return route.fulfill({status:503,json:{error:'Isolated upgrade fallback test; no live API'}});
  });
  await context.routeWebSocket('**/*',socket=>{row.externalBlocked.push(socket.url());socket.close();});
  await context.addInitScript(({key,game})=>{
    if(localStorage.getItem(key)===null)localStorage.setItem(key,JSON.stringify({game,seconds:0,practiceInvitation:{version:1,seen:true,resolved:true,kind:'natural'}}));
    localStorage.setItem('four-seasons-auto-depart','off');localStorage.setItem('four-seasons-music','off');
  },{key:JOURNEY_STORAGE_KEY,game:snapshot(state)});
  const page=await context.newPage();page.setDefaultTimeout(65000);page.on('pageerror',error=>report.errors.push({case:name,message:error.message}));page.on('requestfailed',request=>{const url=new URL(request.url());if(url.pathname.startsWith('/api/'))row.failedRequests.push({path:url.pathname,at:Date.now(),error:request.failure()?.errorText});});
  await page.goto(base);await page.locator('#scene[data-assets="ready"][data-renderer="webgl"]').waitFor();await page.locator('#start-full').click();await page.locator('#resume').click();
  return {context,page,row,state,held};
}
async function unchanged(run,label){const game=await run.page.evaluate(key=>JSON.parse(localStorage.getItem(key)).game,JOURNEY_STORAGE_KEY);assert.deepEqual(game,snapshot(run.state),`${label}: game snapshot unchanged`);const restored=restore(game);assert.ok(restored);assert.deepEqual(restored.history,run.state.history,`${label}: replayed history unchanged`);return {money:restored.money,mood:restored.mood,exp:restored.exp,turn:restored.turn,phase:restored.phase};}
async function shot(run,name){await run.page.evaluate(async()=>{const root=document.querySelector('#dialog-content');await Promise.all((root?.getAnimations({subtree:true})||[]).filter(animation=>animation.effect?.getTiming().iterations!==Infinity).map(animation=>animation.finished.catch(()=>{})));});const path=`${out}/${run.row.name}-${name}.png`;await run.page.screenshot({path});run.row.screenshots.push(path);}
async function note(run,name){const pending=run.page.waitForEvent('download');await run.page.locator('#download-note').click();const download=await pending,path=`${out}/${run.row.name}-${name}.txt`;await download.saveAs(path);const text=await fs.readFile(path,'utf8');assert.ok(text.includes(run.state.history[0].choiceLabel));return {path,text};}
async function cleanup(run){for(const route of run.held)await route.abort('timedout').catch(()=>{});await run.context.close();contexts.delete(run.context);}
async function guarded(run,action){try{await action();run.row.passed=true;run.row.stage='complete';}catch(error){run.row.failure={stage:run.row.stage,message:error.message,stack:error.stack};report.errors.push({case:run.row.name,...run.row.failure});await shot(run,'failure').catch(()=>{});}finally{await save();await cleanup(run);console.log(`Fallback ${run.row.name}: ${run.row.passed?'passed':'FAILED'}`);}}
async function summaryCase(base,timeout=false){
  const state=completedFixture(),name=timeout?'summary-timeout':'summary-503';
  const run=await setup(base,name,state,entry=>timeout&&entry.path==='/api/narrate'?'hold':'503');
  await guarded(run,async()=>{
    const {page,row}=run;await page.locator('.memory-album').waitFor();await page.locator('[data-memory-details]').click();
    const card=page.locator('[data-ai-kind="summary"]');row.stage='request';
    if(timeout){
      await page.locator('[data-ai-kind="summary"][data-mode="loading"]').waitFor();
      await card.scrollIntoViewIfNeeded();await shot(run,'pending');const downloaded=await note(run,'pending-note');assert.match(downloaded.text,/AI 总结尚未生成/);row.pendingDownload={path:downloaded.path,historyPreserved:true};
      // Returning to the album and reopening must join the same in-flight call.
      await page.locator('#back-to-memories').click();await page.locator('[data-memory-details]').click();assert.equal(row.apiIntercepted.filter(entry=>entry.path==='/api/narrate').length,1);
    }
    await page.locator('[data-ai-kind="summary"][data-mode="fallback"]').waitFor();
    const request=row.apiIntercepted.find(entry=>entry.path==='/api/narrate');assert.ok(request);assert.equal(request.payload.kind,'summary');
    row.elapsedToFallbackMs=Date.now()-request.at;if(timeout)assert.ok(row.elapsedToFallbackMs>=49000&&row.elapsedToFallbackMs<65000,'Real 50-second client timeout completed');
    row.fallback={mode:await card.getAttribute('data-mode'),busy:await card.getAttribute('aria-busy'),status:await card.locator('.ai-reflection-status').innerText(),footnote:await card.locator('.ai-reflection-footnote').innerText(),text:await card.locator('.ai-reflection-text').innerText()};
    assert.equal(row.fallback.busy,'false');assert.match(row.fallback.status,/备用回顾.*预设/);assert.match(row.fallback.footnote,/直答暂不可用.*预设回顾/);
    const expected=summarize(state);assert.equal(row.fallback.text,`${expected.description}\n这一次，你更常选择${expected.style}。可以把具体取舍留给下一程参考。`);
    assert.doesNotMatch(row.fallback.status,/本次生成|已生成内容/);await card.scrollIntoViewIfNeeded();await shot(run,'fallback');
    const downloaded=await note(run,'fallback-note');assert.match(downloaded.text,/备用回顾.*预设内容/);assert.doesNotMatch(downloaded.text,/AI 总结尚未生成/);row.download={path:downloaded.path,fallbackLabel:true,historyPreserved:true};
    await page.locator('#back-to-memories').click();await page.locator('[data-memory-details]').click();await page.locator('[data-ai-kind="summary"][data-mode="fallback"]').waitFor();
    assert.equal(row.apiIntercepted.filter(entry=>entry.path==='/api/narrate').length,1,'No automatic retry or duplicate model request');row.resources=await unchanged(run,'Summary failure and reopening');
    await page.locator('#back-to-memories').click();await page.locator('.memory-album').waitFor();row.memoryAlbumUsable=true;
  });
}
async function practiceAndSearch(base){
  const run=await setup(base,'practice-and-search',practiceFixture(),(entry,row)=>entry.path==='/api/experience'&&row.apiIntercepted.filter(item=>item.path==='/api/experience').length===2?'hold':'503');
  await guarded(run,async()=>{
    const {page,row}=run;row.stage='practice';await page.locator('#practice-open').waitFor();await page.locator('#practice-open').click();await page.locator('.practice-room').waitFor();
    assert.equal(row.apiIntercepted.filter(entry=>entry.path==='/api/practice').length,0,'Opening practice is not a model call');
    const messages=['离线测试：请先一起核对已确认的时间线。','离线测试：我们把交接内容和下一次核对时间说清楚。'];
    for(let turn=0;turn<2;turn++){
      await page.locator('#practice-message').fill(messages[turn]);await page.locator('.practice-form [type="submit"]').click();
      if(turn===0)await page.locator('.practice-round').filter({hasText:'第 2 / 2 轮'}).waitFor();else await page.locator('.practice-tip:not([hidden])').waitFor();
      await unchanged(run,`Practice round ${turn+1}`);
    }
    const requests=row.apiIntercepted.filter(entry=>entry.path==='/api/practice');assert.equal(requests.length,1,'First 503 switches round two to local-only, no duplicate API call');assert.equal(requests[0].payload.turn,1);
    row.practice={status:await page.locator('.practice-status').innerText(),tipLabel:await page.locator('.practice-tip small').innerText(),tip:await page.locator('.practice-tip p').innerText(),chat:await page.locator('.practice-chat').innerText(),apiRequests:requests.length};
    assert.match(row.practice.status,/预设练习.*不会假装是实时 AI/);assert.match(row.practice.tipLabel,/预设练习.*非实时 AI/);assert.doesNotMatch(row.practice.chat,/知乎直答 · 本次回应|知乎直答 · 已生成回应/);
    assert.equal(await page.locator('.practice-message.player').count(),2);assert.equal(await page.locator('.practice-message.npc').count(),3);assert.equal(await page.locator('.practice-form').isVisible(),false);
    await shot(run,'two-rounds-local');await page.locator('.practice-exit').click();await page.locator('.experience[data-stage="feedback"]').waitFor();await unchanged(run,'Practice exit');
    assert.equal(await page.evaluate(messages=>Object.values(localStorage).some(value=>messages.some(message=>value.includes(message))),messages),false,'Typed test messages do not enter persisted data');
    row.stage='search';await page.locator('#all-sources').click();await page.locator('#dialog.sources-dialog[open]').waitFor();
    const card=page.locator('.source-card').first(),button=card.locator('.find-more'),link=card.locator(':scope>a'),href=await link.getAttribute('href');
    const url=new URL(href);assert.equal(url.protocol,'https:');assert.ok(['www.zhihu.com','zhuanlan.zhihu.com'].includes(url.hostname));row.source={href,title:await link.innerText(),id:await button.getAttribute('data-source'),failures:[]};
    for(let index=0;index<2;index++){
      await button.click();await button.filter({hasText:'重试检索'}).waitFor();const text=await card.locator('.more-results').innerText();
      assert.match(text,/暂时无法实时检索.*原文仍可直接查看/);assert.equal(await button.isEnabled(),true);assert.equal(await link.getAttribute('href'),href);
      assert.equal(await card.locator('.more-results a').count(),0,'Failure must not invent search results');
      const request=row.apiIntercepted.filter(entry=>entry.path==='/api/experience')[index],elapsed=Date.now()-request.at;
      if(index===1)assert.ok(elapsed>=14000&&elapsed<25000,'Actual search 15-second timeout');
      row.source.failures.push({kind:index?'timeout':'503',text,retryEnabled:true,originalLinkPreserved:true,elapsedMs:elapsed});
      await card.scrollIntoViewIfNeeded();await shot(run,index?'search-timeout':'search-503');
    }
    assert.equal(row.apiIntercepted.filter(entry=>entry.path==='/api/experience').length,2,'One user-initiated retry, no automatic request loop');
    row.resources=await unchanged(run,'Search failures');await page.locator('#dialog-close').click();await page.locator('#next-button').waitFor();assert.equal(await page.locator('#next-button').isEnabled(),true);row.canContinue=true;
  });
}
try{
  const base=await startServer();browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--use-gl=angle','--use-angle=d3d11','--ignore-gpu-blocklist']});
  await summaryCase(base,false);await Promise.all([summaryCase(base,true),practiceAndSearch(base)]);
  assert.deepEqual(report.errors,[]);assert.ok(report.cases.every(row=>row.passed));report.passed=true;
}catch(error){report.errors.push({message:error.message,stack:error.stack});process.exitCode=1;}
finally{for(const context of contexts)await context.close().catch(()=>{});await browser?.close();server?.kill();report.finishedAt=new Date().toISOString();await save();console.log(JSON.stringify({passed:report.passed,cases:report.cases.map(row=>({name:row.name,passed:row.passed})),errors:report.errors,report:`${out}/fallback-browser.json`}));}
