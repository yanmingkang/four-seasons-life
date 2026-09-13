// Invitation UX acceptance, not additional full playthroughs. Restore legal
// engine fixtures, make the third choice through real WebGL UI, and isolate all
// APIs. Run only after the invitation production build is ready.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {createServer} from 'node:net';
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {newGame,land,choose,advance,previewChoice,snapshot,restore} from '../src/engine.js';
import {getMemoryAlbum} from '../src/memory-album.js';
import {JOURNEY_STORAGE_KEY} from '../src/journey-storage.js';

const root=fileURLToPath(new URL('../',import.meta.url)),out=new URL('../test-results/practice-invitation/',import.meta.url);
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_PATH||'C:/Users/25293/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const REHEARSAL='cross-team-invite-v1';
const report={passed:false,phase:'prepare',startedAt:new Date().toISOString(),cases:[],errors:[],externalBlocked:[],
  method:{production:true,isolatedServer:true,user4173Untouched:true,realModelCalls:0,realCLICalls:0,allApisIntercepted:true,
    fixtures:'Legal two-settlement engine fixtures; third settlement is actual UI. Natural-entry continuations and ending fixtures are explicitly seeded, not extra played games.',
    animation:'Normal production animation for third-turn dice, walk, arrival and choice; no speed-up.',
    skip:'Continue travel performs only the normal engine advance from feedback to ready; compare against advance(original), not an unchanged phase.',
    dice:'Single-element Uint32 crypto fixture gives one step; production six-face conversion unchanged.',
    viewport:[[1280,800],[844,390]]}};
let server,browser,currentPage,serverError,serverLog='';
await fs.mkdir(out,{recursive:true});
const saveReport=()=>fs.writeFile(new URL('browser-production.json',out),JSON.stringify(report,null,2));
function enabledChoice(state){const choices=state.active.options.map((option,index)=>({index,disabled:previewChoice(state,option).disabled}));return (choices.find(choice=>choice.index===1&&!choice.disabled)||choices.find(choice=>!choice.disabled)).index;}
function twoSettlements(){let state=newGame('full',{enriched:true,talent:'defense',name:'邀请验收'});for(let i=0;i<2;i++){state=land(state,1);state=advance(choose(state,enabledChoice(state)));}assert.equal(state.turn,2);assert.equal(state.phase,'ready');return snapshot(state);}
function naturalBeforeThird(){let state=newGame('full',{enriched:true,talent:'defense',name:'自然入口先行验收'});state=land(state,5);state=advance(choose(state,enabledChoice(state)));state=land(state,6);state=choose(state,enabledChoice(state));assert.equal(state.turn,2);assert.equal(state.position,10);return snapshot(state);}
function earlyUnseenFixture(){
  // A legal old-save fixture with no natural practice event. This is generated
  // by the engine, not represented as a human or browser playthrough.
  let state=newGame('full',{enriched:true,talent:'ambitious',name:'未见邀请早退验收'});
  while(!state.ended){let next=state.position+2;if([11,13].includes(next))next++;
    state=land(state,next-1-state.position);
    const options=state.active.options.map((option,index)=>({index,p:previewChoice(state,option)})).filter(option=>!option.p.disabled).sort((a,b)=>a.p.mood-b.p.mood);
    state=advance(choose(state,options[0].index));
  }
  assert.equal(state.ended,'mood');assert.equal(state.history.some(record=>['cell-11','cell-13'].includes(record.eventId)),false);return snapshot(state);
}
function settledAt(saved,target){let state=restore(saved);assert.ok(state);if(state.phase==='feedback')state=advance(state);while(state.position<target-1){state=land(state,Math.min(6,target-1-state.position));state=choose(state,enabledChoice(state));if(state.position<target-1)state=advance(state);}assert.equal(state.phase,'feedback');assert.equal(state.position,target-1);return snapshot(state);}
async function startServer(){
  const index=await fs.readFile(new URL('../dist/index.html',import.meta.url),'utf8');
  const assets=(await fs.readdir(new URL('../dist/assets/',import.meta.url))).filter(name=>/^main-.*\.(?:js|css)$/.test(name));
  report.build={indexSha256:createHash('sha256').update(index).digest('hex'),mainAssets:await Promise.all(assets.map(async name=>{
    const bytes=await fs.readFile(new URL(`../dist/assets/${name}`,import.meta.url));return {path:`/assets/${name}`,sha256:createHash('sha256').update(bytes).digest('hex')};
  }))};
  const probe=createServer();await new Promise((resolve,reject)=>{probe.once('error',reject);probe.listen(0,'127.0.0.1',resolve);});const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
  const disabledCli=fileURLToPath(new URL('disabled-cli.exe',out));await assert.rejects(fs.access(disabledCli),{code:'ENOENT'});
  server=spawn(process.execPath,['server.mjs','--production'],{cwd:root,windowsHide:true,env:{...process.env,PORT:String(port),ZHIHU_CLI_PATH:disabledCli},stdio:['ignore','pipe','pipe']});
  server.on('error',error=>{serverError=error;});for(const stream of [server.stdout,server.stderr])stream.on('data',data=>{serverLog=(serverLog+data).slice(-8000);});
  const base=`http://127.0.0.1:${port}`;report.server={base,isolated:true};
  for(let i=0;i<100;i++){if(serverError)throw serverError;if(server.exitCode!==null)throw Error(`Owned server stopped: ${serverLog}`);try{if((await fetch(base,{signal:AbortSignal.timeout(1000)})).ok)return base;}catch{}await delay(100);}
  throw Error(`Owned server unavailable: ${serverLog}`);
}
async function readRecord(page){const record=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),JOURNEY_STORAGE_KEY);assert.ok(restore(record?.game),'Stored game remains replay-valid');return record;}
function projection(game){const state=restore(game);assert.ok(state);return {money:state.money,mood:state.mood,exp:state.exp,position:state.position,turn:state.turn,die:state.die,phase:state.phase,history:state.history,title:getMemoryAlbum(state).title};}
async function unchanged(page,before,label){const after=await readRecord(page);assert.deepEqual(after.game,before.game,`${label}: complete game snapshot unchanged`);assert.deepEqual(projection(after.game),projection(before.game),`${label}: resources/history/dice/title unchanged`);return after;}
async function visibleButtons(page,selectors,label){
  const result=[];
  for(const selector of selectors){const locator=page.locator(selector);assert.equal(await locator.count(),1,`${label}: one ${selector}`);
    const data=await locator.evaluate(node=>{const r=node.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {text:node.innerText,rect:r.toJSON(),visible:r.width>0&&r.height>0&&r.left>=0&&r.top>=0&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1,hit:hit?.closest('button,a')===node,hitTarget:hit?{tag:hit.tagName,id:hit.id,className:hit.className}:null};});
    if(!data.visible||!data.hit)report.failedButton={label,selector,...data};
    assert.ok(data.visible,`${label}: ${selector} fully in viewport`);assert.ok(data.hit,`${label}: ${selector} unoccluded`);result.push({selector,...data});
  }
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${label}: no horizontal page overflow`);return {label,buttons:result};
}
async function capture(page,name){
  // Wait for real finite CSS entrances rather than photographing their first
  // transparent frame. This does not skip or speed up production animation.
  await page.evaluate(async()=>{const roots=[document.querySelector('#story-panel'),document.querySelector('#dialog-content')].filter(Boolean);await Promise.all(roots.flatMap(root=>root.getAnimations({subtree:true})).filter(animation=>animation.effect?.getTiming().iterations!==Infinity).map(animation=>animation.finished.catch(()=>{})));});
  await page.screenshot({path:fileURLToPath(new URL(`${name}.png`,out))});
}
async function setup(base,{name,game,width=1280,height=800,metadata,mode='mock-live'}){
  const row={name,width,height,mode,passed:false,requests:[],apiIntercepted:[],geometry:[],snapshots:[]};report.cases.push(row);report.phase=`${name}-load`;await saveReport();
  const context=await browser.newContext({viewport:{width,height},reducedMotion:'no-preference',serviceWorkers:'block'});
  await context.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin!==base&&!['data:','blob:'].includes(url.protocol)){report.externalBlocked.push(url.href);return route.abort();}return route.continue();});
  await context.route('**/api/**',route=>{row.apiIntercepted.push(new URL(route.request().url()).pathname);return route.fulfill({status:503,json:{error:'Isolated invitation acceptance; no real API'}});});
  await context.route('**/api/practice',route=>{
    const input=route.request().postDataJSON();row.requests.push(input);
    if(mode==='503')return route.fulfill({status:503,json:{error:'Deliberately offline invitation test'}});
    return route.fulfill({json:{mode:'live',model:'zhida-fast-1p5',sessionId:'invitation-test-session-00000001',turn:input.turn,done:input.turn===2,npc:input.turn===1?'可以先说清交付内容和需要共同确认的时间。':'我们把待确认的分工记下来，再约一个回看的时间。',...(input.turn===2?{tip:'先确认交付内容，再约定共同核对的时间。'}:{})}});
  });
  await context.routeWebSocket('**/*',socket=>{report.externalBlocked.push(socket.url());socket.close();});
  await context.addInitScript(({key,game,metadata})=>{
    // Do not overwrite metadata/game during reload: persistence is under test.
    if(localStorage.getItem(key)===null)localStorage.setItem(key,JSON.stringify({game,seconds:0,...(metadata?{practiceInvitation:metadata}:{})}));
    localStorage.setItem('four-seasons-auto-depart','off');localStorage.setItem('four-seasons-music','off');
    const original=crypto.getRandomValues.bind(crypto);crypto.getRandomValues=array=>{if(array instanceof Uint32Array&&array.length===1){array[0]=0;return array;}return original(array);};
    window.__invitationQA={writes:[]};const set=Storage.prototype.setItem;Storage.prototype.setItem=function(name,value){if(this===localStorage&&name===key){try{window.__invitationQA.writes.push(JSON.parse(value));}catch{}}return set.call(this,name,value);};
  },{key:JOURNEY_STORAGE_KEY,game,metadata});
  const page=currentPage=await context.newPage();page.setDefaultTimeout(90000);page.on('pageerror',error=>report.errors.push({name,message:error.message}));await page.goto(base);
  await page.locator('#scene[data-assets="ready"][data-renderer="webgl"]').waitFor();await page.locator('#start-full').click();await page.locator('#resume').click();
  row.initialGame=game;return {context,page,row};
}
async function thirdSettlement(run,{expectedCell=3,expectFallback=true}={}){
  const {page,row}=run;report.phase=`${row.name}-third-settlement`;await page.locator('.experience[data-stage="ready"]').waitFor();
  assert.equal(await page.locator('[data-practice-invitation="fallback"]').count(),0);assert.equal(row.requests.length,0);
  await page.locator('#continue-travel').click();await page.locator('.experience[data-stage="choice"]').waitFor();
  const pending=await readRecord(page),state=restore(pending.game);assert.equal(state.turn,2);assert.equal(state.position,expectedCell-1);assert.ok(![11,13].includes(state.position+1));
  assert.equal(await page.locator('[data-practice-invitation="fallback"]').count(),0);
  const choices=await page.locator('[data-choice]').evaluateAll(nodes=>nodes.map(node=>({index:Number(node.dataset.choice),disabled:node.disabled})));assert.equal(choices.length,3);
  const choice=choices.find(option=>!option.disabled).index;await page.locator(`[data-choice="${choice}"]`).click();
  await page.locator('.experience[data-stage="feedback"]').waitFor();if(expectFallback)await page.locator('[data-practice-invitation="fallback"]').waitFor();
  const settled=await readRecord(page);assert.deepEqual(settled.game,snapshot(choose(state,choice)),'Invitation adds no extra settlement');
  assert.equal(restore(settled.game).turn,3);assert.equal(await page.locator('#dialog[open]').count(),0,'Invitation is inline, never auto-opens a practice dialog');
  assert.equal(typeof settled.practiceInvitation,'object','Invitation metadata is outside game snapshot');
  if(!expectFallback){assert.equal(await page.locator('[data-practice-invitation="fallback"]').count(),0,'An earlier natural entry prevents a new third-turn fallback');assert.equal(settled.practiceInvitation.kind,'natural');row.metadataAfterThird=settled.practiceInvitation;await capture(page,`${row.name}-third-no-fallback`);return settled;}
  row.invitationText=await page.locator('[data-practice-invitation="fallback"]').innerText();row.metadataOnShow=settled.practiceInvitation;
  row.geometry.push(await visibleButtons(page,['#invitation-practice-open','#invitation-skip'],`${row.name}-invitation`));await capture(page,`${row.name}-invitation`);
  row.snapshots.push({stage:'third-settled',game:settled.game,practiceInvitation:settled.practiceInvitation});return settled;
}
async function refreshWithoutRepeat(run,before,{pending=false}={}){
  const {page,row}=run;report.phase=`${row.name}-refresh`;await page.reload();await page.locator('#start-full').click();await page.locator('#resume').click();
  await page.locator(`.experience[data-stage="${restore(before.game).phase}"]`).waitFor();assert.equal(await page.locator('[data-practice-invitation="fallback"]').count(),pending?1:0,pending?'Reload retains the same unresolved card':'Accepted or skipped invitation does not reappear');
  assert.equal(await page.locator('#dialog[open]').count(),0);const after=await unchanged(page,before,'Refresh');
  assert.deepEqual(after.practiceInvitation,before.practiceInvitation,'Refresh does not create a new invitation or reset its status');
  assert.equal(after.practiceInvitation.seen,true);assert.equal(after.practiceInvitation.resolved,!pending);row.metadataAfterRefresh=after.practiceInvitation;return after;
}
async function rehearse(run,before,{entry='#invitation-practice-open',offline=false}={}){
  const {page,row}=run;report.phase=`${row.name}-practice-open`;assert.equal(row.requests.length,0);await page.locator(entry).click();
  await page.locator('#dialog.practice-dialog[open] .practice-room').waitFor();assert.equal(row.requests.length,0,'Opening an invitation does not send API data');
  row.practiceOpening=await page.locator('#dialog-content').innerText();assert.match(row.practiceOpening,/独立.*预设|预设.*独立/s,'UI identifies the independent preset');
  assert.match(row.practiceOpening,/不改变/);await unchanged(page,before,'Opening rehearsal');
  await capture(page,`${row.name}-practice-opening`);
  const messages=['邀请测试：先确认这次交付范围和需要谁一起核对。','邀请测试：我们约定核对时间，并把还没确认的安排留下。'];
  for(let turn=1;turn<=2;turn++){
    report.phase=`${row.name}-practice-turn-${turn}`;await page.locator('#practice-message').fill(messages[turn-1]);
    row.geometry.push(await visibleButtons(page,['.practice-form [type="submit"]','.practice-exit'],`${row.name}-practice-turn-${turn}`));
    await page.locator('.practice-form [type="submit"]').click();
    if(turn===1)await page.locator('.practice-round').filter({hasText:'第 2 / 2 轮'}).waitFor();else await page.locator('.practice-tip').waitFor();
    await unchanged(page,before,`Rehearsal turn ${turn}`);
  }
  assert.equal(row.requests.length,offline?1:2,'Offline second turn stays local; successful mock sends two turns');
  for(const [index,input]of row.requests.entries()){
    assert.deepEqual(input.rehearsal,{id:REHEARSAL});assert.equal(Object.hasOwn(input,'game'),false);assert.equal(Object.hasOwn(input,'sample'),false);assert.equal(input.turn,index+1);
  }
  if(!offline){assert.equal(row.requests[1].clientId,row.requests[0].clientId);assert.equal(row.requests[1].sessionId,'invitation-test-session-00000001');}
  if(offline){assert.match(await page.locator('.practice-tip small').innerText(),/预设练习.*非实时 AI/);assert.match(await page.locator('.practice-status').innerText(),/预设|不会假装/);}
  assert.equal(await page.locator('.practice-form').isVisible(),false);row.practiceComplete=await page.locator('#dialog-content').innerText();await capture(page,`${row.name}-practice-complete`);
  await page.locator('.practice-exit').click();const after=await unchanged(page,before,'Exiting rehearsal');
  assert.equal(after.practiceInvitation.seen,true);assert.equal(after.practiceInvitation.resolved,true,'Accepting the independent invitation resolves its one-time offer');
  assert.equal(await page.evaluate(messages=>Object.values(localStorage).some(value=>messages.some(message=>value.includes(message))),messages),false,'Typed practice messages never enter localStorage');
  row.metadataAfterPractice=after.practiceInvitation;return after;
}
async function finishCase(run){run.row.passed=true;await saveReport();await run.context.close();currentPage=null;console.log(`Practice invitation ${run.row.name}: passed, ${run.row.requests.length} mocked practice requests`);}

try{
  const base=await startServer();browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--use-gl=angle','--use-angle=d3d11','--ignore-gpu-blocklist']});
  // Successful independent preset: the actual third UI settlement offers it.
  const normal=await setup(base,{name:'third-complete-1280',game:twoSettlements()});
  const normalBefore=await thirdSettlement(normal);const normalAfter=await rehearse(normal,normalBefore);await refreshWithoutRepeat(normal,normalAfter);await finishCase(normal);
  // A dismissal survives reload and cannot remove later natural scene entries.
  const skip=await setup(base,{name:'third-skip-844',game:twoSettlements(),width:844,height:390});
  const skipBefore=await thirdSettlement(skip);report.phase='third-skip-844-dismiss';await skip.page.locator('#invitation-skip').click();
  await skip.page.locator('.experience[data-stage="ready"]').waitFor();assert.equal(await skip.page.locator('[data-practice-invitation="fallback"]').count(),0);
  const skipExpected={...skipBefore,game:snapshot(advance(restore(skipBefore.game)))};
  const skipAfter=await unchanged(skip.page,skipExpected,'Skip only advances the existing feedback');
  skip.row.skipTransition={from:'feedback',to:'ready',matchesNormalAdvance:true};
  assert.equal(skipAfter.practiceInvitation.seen,true);assert.equal(skipAfter.practiceInvitation.resolved,true);
  assert.equal(skip.row.requests.length,0);await refreshWithoutRepeat(skip,skipAfter);await finishCase(skip);
  // Merely seeing the invitation retains the same pending card across reload;
  // it must not manufacture a new invitation, auto-open or reset its metadata.
  const seen=await setup(base,{name:'third-seen-refresh',game:twoSettlements()});const seenBefore=await thirdSettlement(seen);await refreshWithoutRepeat(seen,seenBefore,{pending:true});assert.equal(seen.row.requests.length,0);await finishCase(seen);
  // The natural scene is shown at settlement 2; settlement 3 is then a real UI
  // roll/walk/choice at ordinary cell 12, not a seeded third result.
  const priorNatural=await setup(base,{name:'natural-before-third',game:naturalBeforeThird()});await priorNatural.page.locator('#practice-open').waitFor();
  priorNatural.row.naturalBefore=await readRecord(priorNatural.page);assert.equal(priorNatural.row.naturalBefore.practiceInvitation.kind,'natural');
  await priorNatural.page.locator('#next-button').click();await thirdSettlement(priorNatural,{expectedCell:12,expectFallback:false});await finishCase(priorNatural);
  for(const cell of [11,13]){
    const natural=await setup(base,{name:`natural-${cell}-after-skip`,game:settledAt(skipAfter.game,cell),metadata:skipAfter.practiceInvitation});
    report.phase=`natural-${cell}-entry`;await natural.page.locator('.experience[data-stage="feedback"]').waitFor();await natural.page.locator('#practice-open').waitFor();
    assert.equal(await natural.page.locator('[data-practice-invitation="fallback"]').count(),0);assert.equal(await natural.page.locator('#practice-open').count(),1);
    const before=await readRecord(natural.page);await natural.page.locator('#practice-open').click();await natural.page.locator('.practice-room').waitFor();
    natural.row.practiceOpening=await natural.page.locator('.practice-context').innerText();assert.ok(natural.row.practiceOpening.includes(restore(before.game).history.at(-1).choiceLabel),'Natural practice still uses the actual settled choice');
    assert.equal(natural.row.requests.length,0);await natural.page.locator('.practice-exit').click();await unchanged(natural.page,before,'Natural practice open/close');await capture(natural.page,`natural-${cell}-entry`);await finishCase(natural);
  }
  const recorded=JSON.parse(await fs.readFile(new URL('../test-results/fifteen-games/report-2-5-8-11-14.json',import.meta.url),'utf8'));const completed=recorded.games.find(game=>game.game===2);assert.equal(completed?.passed,true);
  assert.equal(completed.final.history.some(record=>['cell-11','cell-13'].includes(record.eventId)),false);
  for(const [name,game,width,height,exercise]of [['ending-complete-1280',snapshot(completed.final),1280,800,true],['ending-early-844',earlyUnseenFixture(),844,390,false]]){
    const ending=await setup(base,{name,game,width,height,mode:'503'});await ending.page.locator('.memory-album').waitFor();
    report.phase=`${name}-cover`;assert.equal(await ending.page.locator('.practice-room').count(),0);assert.equal(await ending.page.locator('[data-memory-practice]').count(),1);
    ending.row.geometry.push(await visibleButtons(ending.page,['[data-memory-practice]'],`${name}-cover`));await capture(ending.page,`${name}-cover`);
    const album=getMemoryAlbum(restore(game)),before=await readRecord(ending.page);await ending.page.locator(`[data-memory-go="${album.pages.length-1}"]`).click();
    assert.equal(await ending.page.locator('[data-memory-practice]').count(),1);ending.row.geometry.push(await visibleButtons(ending.page,['[data-memory-practice]'],`${name}-last-page`));await capture(ending.page,`${name}-last-page`);
    if(exercise){await rehearse(ending,before,{entry:'[data-memory-practice]',offline:true});await ending.page.locator('.memory-album').waitFor();}
    else await unchanged(ending.page,before,'Optional ending invitation');
    await finishCase(ending);
  }
  for(const closeMethod of ['button','Escape']){
    const run=await setup(base,{name:`memory-close-${closeMethod}`,game:snapshot(completed.final),mode:'503'});await run.page.locator('.memory-album').waitFor();
    const album=getMemoryAlbum(restore(run.row.initialGame)),index=closeMethod==='button'?0:album.pages.length-1;
    await run.page.locator(`[data-memory-go="${index}"]`).click();const before=await readRecord(run.page);report.phase=`${run.row.name}-open`;
    await run.page.locator('[data-memory-practice]').click();await run.page.locator('.practice-room').waitFor();
    if(closeMethod==='button')await run.page.locator('#dialog-close').click();else await run.page.keyboard.press('Escape');
    await run.page.locator('.memory-album').waitFor();assert.equal(await run.page.locator('.memory-album').getAttribute('data-memory-page'),String(index));
    assert.equal(await run.page.locator('[data-memory-practice]').count(),0,'Accepting then closing does not repeat the optional entry');
    const after=await unchanged(run.page,before,`${closeMethod} returns to original memory page`);assert.equal(after.practiceInvitation.resolved,true);assert.equal(run.row.requests.length,0);
    run.row.returnedPage=index;await capture(run.page,`${run.row.name}-returned`);
    if(closeMethod==='Escape'){
      report.phase=`${run.row.name}-new-game`;await run.page.locator(`[data-memory-go="${album.pages.length-1}"]`).click();await run.page.locator('#report-restart').click();
      await run.page.locator('.experience[data-stage="ready"]').waitFor();const restarted=await readRecord(run.page),state=restore(restarted.game);
      assert.deepEqual(restarted.practiceInvitation,{version:1,seen:false,resolved:false,kind:null});assert.equal(state.turn,0);assert.equal(state.history.length,0);assert.equal(state.position,-1);
      assert.equal(await run.page.locator('.practice-room').count(),0);assert.equal(await run.page.locator('[data-practice-invitation="fallback"]').count(),0);
      run.row.restart={actualUIClick:true,metadata:restarted.practiceInvitation,game:restarted.game};await capture(run.page,'new-game-invitation-reset');
    }
    await finishCase(run);
  }
  assert.deepEqual(report.errors,[]);assert.deepEqual(report.externalBlocked,[]);report.phase='complete';report.passed=true;
}catch(error){
  report.failure={phase:report.phase,message:error.message,stack:error.stack};
  if(currentPage){try{await capture(currentPage,'failure');report.failureUI=await currentPage.evaluate(()=>({stage:document.querySelector('.experience')?.dataset.stage,dialogOpen:document.querySelector('#dialog')?.open,text:document.body.innerText.slice(-7000),record:JSON.parse(localStorage.getItem('four-seasons-life-v4'))}));}catch{}}
  throw error;
}finally{
  report.finishedAt=new Date().toISOString();await saveReport();try{await browser?.close();}finally{if(server&&server.exitCode===null&&server.signalCode===null)await new Promise(resolve=>{const timeout=setTimeout(resolve,3000);server.once('exit',()=>{clearTimeout(timeout);resolve();});server.kill();});}
}
console.log(JSON.stringify({passed:report.passed,cases:report.cases.length,errors:report.errors,realModelCalls:0}));
