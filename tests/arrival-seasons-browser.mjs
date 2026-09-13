// Real HUD + WebGL seasonal arrival QA on an owned local source server.
// Two cases enter through the actual departure button. Remaining visual cases
// restore replay-valid choice saves and invoke the real transition through a
// browser-response-only main-module handle. Production files are never patched.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {createServer} from 'node:net';
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {newGame,land,choose,advance,previewChoice,snapshot,restore} from '../src/engine.js';
import {EVENTS} from '../src/events.js';
import {LIFE_CHAPTERS} from '../src/season-chapters.js';
import {eventTheme} from '../src/transitions.js';
import {JOURNEY_STORAGE_KEY} from '../src/journey-storage.js';

const root=fileURLToPath(new URL('../',import.meta.url)),out=new URL('../test-results/arrival-seasons/',import.meta.url);
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_PATH||'C:/Users/25293/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const report={passed:false,phase:'prepare',startedAt:new Date().toISOString(),cases:[],errors:[],apiIntercepted:[],externalBlocked:[],
  method:{sourceIntegration:true,productionBundle:false,isolatedServer:true,isolatedStorage:true,user4173Untouched:true,realModelCalls:0,realCLICalls:0,
    fixtures:'Replay-valid full-game engine saves. Desktop winter 31→32 (die 1) and spring→summer 10→12 (die 2) are actual departure-button journeys; other cases are explicitly visual transition fixtures, not full playthroughs.',
    injection:'Only the intercepted main.js HTTP response exposes state/world/transition handles and wraps the actual arrival call to record its arguments; no checkout changes or mocked world.',
    dice:'Only one-element Uint32Array crypto calls are fixed to the case die. Other crypto is native.',viewport:[[1440,900],[844,390]]}};
let server,browser,currentPage,serverError,serverLog='';
await fs.mkdir(out,{recursive:true});
const save=()=>fs.writeFile(new URL('browser-source.json',out),JSON.stringify(report,null,2));
function safeChoice(state){return state.active.options.map((option,index)=>({index,result:previewChoice(state,option)})).filter(option=>!option.result.disabled).sort((a,b)=>b.result.mood-a.result.mood||b.result.money-a.result.money)[0].index;}
function readyAt(position){let state=newGame('full',{enriched:true,talent:'optimistic',name:'四季到站验收'});while(state.position<position){const pending=land(state,Math.min(6,position-state.position));state=advance(choose(pending,safeChoice(pending)));assert.equal(state.ended,null);}assert.equal(state.phase,'ready');assert.equal(state.position,position);assert.ok(restore(snapshot(state)));return state;}
function seedFor(test){const state=readyAt(test.actual?test.before:test.target-1);return test.actual?state:land(state,1);}
async function startServer(){
  report.source=await Promise.all(['src/transitions.js','src/main.js','src/arrival-seasons.css'].map(async path=>({path,sha256:createHash('sha256').update(await fs.readFile(new URL(`../${path}`,import.meta.url))).digest('hex')})));
  const probe=createServer();await new Promise((resolve,reject)=>{probe.once('error',reject);probe.listen(0,'127.0.0.1',resolve);});const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
  const disabledCli=fileURLToPath(new URL('disabled-cli.exe',out));await assert.rejects(fs.access(disabledCli),{code:'ENOENT'});
  server=spawn(process.execPath,['server.mjs'],{cwd:root,windowsHide:true,env:{...process.env,PORT:String(port),ZHIHU_CLI_PATH:disabledCli},stdio:['ignore','pipe','pipe']});server.on('error',error=>{serverError=error;});
  for(const stream of [server.stdout,server.stderr])stream.on('data',data=>{serverLog=(serverLog+data).slice(-8000);});
  const base=`http://127.0.0.1:${port}`;report.server={base,owned:true};
  for(let i=0;i<100;i++){if(serverError)throw serverError;if(server.exitCode!==null)throw Error(`Owned server stopped: ${serverLog}`);try{if((await fetch(base,{signal:AbortSignal.timeout(1000)})).ok)return base;}catch{}await delay(100);}
  throw Error(`Owned server unavailable: ${serverLog}`);
}
async function shot(page,name){await page.screenshot({path:fileURLToPath(new URL(`${name}.png`,out))});}
async function measure(page){return page.locator('#arrival-transition').evaluate(root=>{
  const facts=node=>{const style=getComputedStyle(node),rect=node.getBoundingClientRect();return {text:node.textContent,rect:rect.toJSON(),font:style.fontFamily,fontSize:parseFloat(style.fontSize),opacity:Number(style.opacity),animationName:style.animationName,borderRadius:style.borderRadius,clipPath:style.clipPath,transform:style.transform};};
  const overlap=(a,b)=>a.x<b.right&&a.right>b.x&&a.y<b.bottom&&a.bottom>b.y;
  const text=[...root.querySelectorAll('.arrival-mark,.arrival-caption,.arrival-title')].map(facts);
  const hud=[...document.querySelectorAll('.status-strip,.topbar,.map-controls,.journey-settings,.daylight-switch,.travel-status')].filter(node=>{const style=getComputedStyle(node),r=node.getBoundingClientRect();return !node.hidden&&style.display!=='none'&&style.visibility!=='hidden'&&Number(style.opacity)>.15&&r.width>0&&r.height>0;}).map(node=>({className:node.className,rect:node.getBoundingClientRect().toJSON()}));
  return {season:root.dataset.season,theme:root.dataset.theme,reduced:root.dataset.reduced,paused:root.dataset.paused,hidden:root.hidden,classes:root.className,
    atmosphereCount:root.querySelector('.arrival-atmosphere')?.children.length,shape:facts(root.querySelector('.arrival-shape')),text,
    activeAnimations:root.getAnimations({subtree:true}).filter(animation=>animation.playState==='running').map(animation=>({name:animation.animationName,duration:animation.effect.getTiming().duration})),
    clipped:text.filter(item=>item.rect.left<0||item.rect.top<0||item.rect.right>innerWidth+1||item.rect.bottom>innerHeight+1).map(item=>item.text),
    collisions:text.flatMap(item=>hud.filter(box=>overlap(item.rect,box.rect)).map(box=>({text:item.text,hud:box.className}))),pageOverflow:document.documentElement.scrollWidth>innerWidth};
  });}
function assertVisual(data,test){
  assert.equal(data.hidden,false);assert.equal(data.season,String(test.season));assert.equal(data.theme,eventTheme(EVENTS[test.target].kind).id);assert.equal(data.atmosphereCount,12);
  assert.equal(data.text[0].text,['花','光','叶','雪'][test.season]);assert.ok(data.text[1].text.includes(LIFE_CHAPTERS[test.season].stage));assert.ok(data.text[2].text.length>2&&data.text[2].text.length<=24);
  assert.ok(data.text[0].fontSize>=(test.height<550?32:46));assert.ok(data.text[1].fontSize>=11);assert.ok(data.text[2].fontSize>=18);assert.ok(data.text.every(item=>item.rect.width>0&&item.rect.height>0&&item.opacity>.65));
  assert.deepEqual(data.clipped,[],'Arrival text stays inside viewport');assert.deepEqual(data.collisions,[],'Arrival text does not overlap HUD controls');assert.equal(data.pageOverflow,false);
  if(test.season===3){assert.doesNotMatch(data.shape.animationName,/leaf/i);assert.notEqual(data.shape.borderRadius,'2% 90% 5% 90%');assert.doesNotMatch(data.text.map(item=>item.text).join(' '),/叶/);}
  if(test.reduced)assert.equal(data.activeAnimations.length,0,'Reduced-motion transition has no running CSS animation');else assert.ok(data.activeAnimations.length>0,'Normal transition really animates');
}
async function runCase(base,test){
  const seed=seedFor(test),row={...test,passed:false,seededPosition:seed.position,seededHistory:seed.history.length};report.cases.push(row);report.phase=`${test.name}-load`;await save();
  const context=await browser.newContext({viewport:{width:test.width,height:test.height},reducedMotion:test.reduced?'reduce':'no-preference',serviceWorkers:'block'});
  await context.route('**/*',async route=>{
    const url=new URL(route.request().url());if(url.origin!==base){report.externalBlocked.push(url.origin+url.pathname);return route.abort();}
    if(url.pathname.startsWith('/api/')){report.apiIntercepted.push({case:test.name,path:url.pathname});return route.fulfill({status:503,contentType:'application/json',body:'{"error":"offline_arrival_test"}'});}
    if(url.pathname==='/src/main.js'){
      const response=await route.fetch();let body=await response.text();assert.equal((body.match(/await arrivalTransition\(/g)||[]).length,1,'One actual main arrival call is instrumented');
      body=body.replace('await arrivalTransition(','await window.__arrivalQA.invoke(arrivalTransition,');
      body+='\nwindow.__arrivalMain={getState:()=>state,getWorld:()=>world,renderStory,hideOverlay,setStage,transition:arrivalTransition};\n';
      return route.fulfill({response,body});
    }return route.continue();
  });
  // Keep the owned Vite client's local handshake valid (closing it before open
  // creates a test-induced pageerror), but never accept a source hot reload.
  // All other sockets remain blocked, including any game/API websocket.
  await context.routeWebSocket('**/*',socket=>{
    const url=new URL(socket.url()),owned=new URL(base);
    if(url.hostname===owned.hostname&&url.port===owned.port&&socket.protocols().includes('vite-hmr')){
      const local=socket.connectToServer();local.onMessage(message=>{let payload;try{payload=JSON.parse(message.toString());}catch{}if(!['update','full-reload','prune'].includes(payload?.type))socket.send(message);});return;
    }
    report.externalBlocked.push(socket.url());socket.close();
  });
  await context.addInitScript(({key,game,die})=>{
    localStorage.setItem('four-seasons-auto-depart','off');localStorage.setItem('four-seasons-music','off');localStorage.setItem(key,JSON.stringify({game,seconds:30,practiceInvitation:{version:1,seen:true,resolved:true,kind:'fallback'}}));
    const qa=window.__arrivalQA={calls:[],samples:[],events:[],diceCalls:0,pause:false,source:'main',done:false};
    const native=crypto.getRandomValues.bind(crypto);crypto.getRandomValues=array=>{if(array instanceof Uint32Array&&array.length===1){qa.diceCalls++;array[0]=Math.floor(((die-.5)/6)*4294967296);return array;}return native(array);};
    qa.invoke=async(fn,container,kind,isCurrent,options)=>{
      const call={source:qa.source,kind,season:options?.season,startedAt:performance.now(),activeSeason:window.__arrivalMain?.getState()?.active?.season};qa.calls.push(call);
      try{return await fn(container,kind,isCurrent,options);}finally{call.finishedAt=performance.now();call.wallMilliseconds=call.finishedAt-call.startedAt;qa.done=true;}
    };
    document.addEventListener('worldstage',event=>{if(event.target.id==='scene')qa.events.push({at:performance.now(),...event.detail});},true);
    const tick=now=>{const root=document.querySelector('#arrival-transition');if(root&&!root.hidden)qa.samples.push({at:now,season:root.dataset.season,theme:root.dataset.theme,paused:root.dataset.paused,mark:root.querySelector('.arrival-mark')?.textContent,experience:document.querySelector('.experience')?.dataset.stage});requestAnimationFrame(tick);};requestAnimationFrame(tick);
  },{key:JOURNEY_STORAGE_KEY,game:snapshot(seed),die:test.die||1});
  const page=currentPage=await context.newPage();page.setDefaultTimeout(40000);page.on('pageerror',error=>report.errors.push({case:test.name,message:error.message}));
  await page.goto(base);await page.waitForFunction(()=>Boolean(window.__arrivalMain)&&document.querySelector('#scene')?.dataset.assets==='ready');
  assert.equal(await page.locator('#scene').getAttribute('data-renderer'),'webgl');await page.locator('#start-full').click();await page.locator('#resume').click();
  await page.locator(`.experience[data-stage="${test.actual?'ready':'choice'}"]`).waitFor();
  report.phase=`${test.name}-transition`;
  if(test.actual){
    await page.locator('#continue-travel').click();
    if(seed.season!==test.season){await page.locator('.chapter-continue').waitFor();await page.locator('.chapter-continue').click();row.chapterConfirmed=true;}
  }else await page.evaluate(()=>{
    const h=window.__arrivalMain,qa=window.__arrivalQA,state=h.getState();qa.source='visual-fixture';h.hideOverlay();h.setStage('transition','这一站，有新的生活片段。','');
    qa.promise=qa.invoke(h.transition,document.querySelector('#arrival-transition'),state.active.kind,()=>true,{season:state.active.season,isPaused:()=>qa.pause}).then(()=>h.renderStory());
  });
  await page.waitForFunction(()=>window.__arrivalQA.calls.length>0&&!document.querySelector('#arrival-transition').hidden);
  if(test.pause){
    await page.waitForTimeout(170);await page.locator('#rules-button').click();await page.locator('#dialog[open]').waitFor();await page.waitForTimeout(100);
    const before=await page.locator('#arrival-transition').evaluate(node=>({hidden:node.hidden,paused:node.dataset.paused,mark:node.querySelector('.arrival-mark').textContent}));
    await page.waitForTimeout(1250);const after=await page.locator('#arrival-transition').evaluate(node=>({hidden:node.hidden,paused:node.dataset.paused,mark:node.querySelector('.arrival-mark').textContent}));
    assert.deepEqual(after,before);assert.equal(after.hidden,false);assert.equal(after.paused,'true');row.pause={actualDialog:true,heldMilliseconds:1250,transitionStayedVisible:true};await page.locator('#dialog-close').click();await page.waitForTimeout(140);
  }else await page.waitForTimeout(test.reduced?40:350);
  row.visual=await measure(page);await shot(page,`${test.name}-arrival`);assertVisual(row.visual,test);
  await page.locator('.experience[data-stage="choice"]').waitFor();assert.equal(await page.locator('[data-choice]').count(),3);assert.ok(await page.locator('[data-choice]:not(:disabled)').count()>0);assert.equal(await page.locator('#arrival-transition').isVisible(),false);
  const state=await page.evaluate(()=>window.__arrivalMain.getState());assert.equal(state.position,test.target);assert.equal(state.active.season,test.season);
  const saved=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).game,JOURNEY_STORAGE_KEY);assert.ok(restore(saved));
  if(test.actual){assert.equal(state.die,test.die);assert.equal(state.history.length,seed.history.length);}else assert.deepEqual(saved,snapshot(seed),'Visual fixtures cannot modify game snapshot');
  await page.waitForTimeout(150);await shot(page,`${test.name}-choice`);
  row.trace=await page.evaluate(()=>({calls:window.__arrivalQA.calls,samples:window.__arrivalQA.samples,events:window.__arrivalQA.events,diceCalls:window.__arrivalQA.diceCalls}));
  assert.equal(row.trace.calls.length,1);assert.equal(row.trace.calls[0].season,test.season);assert.equal(row.trace.calls[0].activeSeason,test.season);
  assert.ok(row.trace.calls[0].wallMilliseconds>=(test.reduced?340:1080));
  if(test.actual){assert.equal(row.trace.diceCalls,1);assert.ok(row.trace.events.some(event=>event.stage==='walking'));assert.ok(row.trace.events.some(event=>event.stage==='arrived'));}else assert.equal(row.trace.diceCalls,0);
  row.webgl=await page.evaluate(()=>{const gl=window.__arrivalMain.getWorld().renderer.getContext();return {lost:gl.isContextLost(),error:gl.getError()};});assert.deepEqual(row.webgl,{lost:false,error:0});row.passed=true;await save();await context.close();currentPage=null;console.log(`Arrival seasons ${test.name}: passed`);
}
try{
  const base=await startServer();browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--use-gl=angle','--use-angle=d3d11','--ignore-gpu-blocklist']});
  const cases=[
    {name:'winter-1440-actual',season:3,target:31,before:30,actual:true,die:1,pause:true,width:1440,height:900},
    {name:'summer-1440-cross-season',season:1,target:11,before:9,actual:true,die:2,width:1440,height:900},
    {name:'spring-1440',season:0,target:0,width:1440,height:900},{name:'autumn-1440',season:2,target:20,width:1440,height:900},
    ...[0,1,2,3].map((season)=>({name:`${['spring','summer','autumn','winter'][season]}-844`,season,target:[0,11,20,31][season],width:844,height:390,reduced:season===3}))
  ];
  for(const test of cases)await runCase(base,test);
  assert.deepEqual(report.errors,[]);assert.deepEqual(report.externalBlocked,[]);report.passed=true;report.phase='complete';console.log(JSON.stringify({passed:true,cases:report.cases.length,actualDepartures:2,pageErrors:report.errors.length,realModelCalls:0}));
}catch(error){report.failure={phase:report.phase,name:error.name,message:error.message,stack:error.stack};if(currentPage)try{await shot(currentPage,'failure');}catch{}console.error(JSON.stringify(report.failure));process.exitCode=1;
}finally{report.finishedAt=new Date().toISOString();await save();await browser?.close();server?.kill();}
