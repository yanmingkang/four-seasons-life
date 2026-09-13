// Five isolated real-3D public UI games. No game fixtures, forced dice,
// accelerated clocks, user cookies, real OAuth or business API requests.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs/promises';
import {restore} from '../src/engine.js';
import {JOURNEY_STORAGE_KEY} from '../src/journey-storage.js';
const require=createRequire(import.meta.url);
const {chromium}=require('C:/Users/25293/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const BASE='https://zhihu-four-seasons.pages.dev';
const out=fileURLToPath(new URL('../test-results/five-games-mandatory-20260913/',import.meta.url));
const career=[1,1,2,2,1,0,1,2,0,0,0,1,0,2,0,0,0,1,1,0,1,0,1,1,0,1,0,2,1,1,0,1,1,0,0,1,0,2,2,2];
const boundary=[2,0,0,1,2,1,0,1,2,1,2,0,1,0,1,2,1,2,2,1,0,0,2,0,2,2,1,0,2,2,1,0,1,1,0,2,1,1,0,1];
const fixtures=[
  {game:1,strategy:'cyclic',talent:'defense',viewport:{width:1280,height:800},practice:true,ai:true},
  {game:2,strategy:'career',talent:'ambitious',viewport:{width:1280,height:800}},
  {game:3,strategy:'boundary',talent:'optimistic',viewport:{width:844,height:390}},
  {game:4,strategy:'mixed',talent:'defense',viewport:{width:844,height:390},practice:true},
  {game:5,strategy:'support',talent:'ambitious',viewport:{width:1280,height:800}},
];
const report={passed:false,startedAt:new Date().toISOString(),phase:'prepare',games:[],method:{
  base:BASE,publicProduction:true,actualWebGL:true,isolatedBrowserContexts:true,noUserProfileAccess:true,
  nativeCryptoDice:true,noGameStorageWritten:true,normalClock:true,normalAnimations:true,allFilmsUnskipped:true,
  auth:'Only this isolated browser context receives a synthetic authenticated status; not a real login test.',
  apis:'All business APIs return an injected immediate 503; no model, search, token or profile requests reach servers.',
  timings:'Wall-clock UI automation including normal films and screenshots, excluding human reading. Injected API fallback times are not real AI latency.',
  policies:'Cyclic ABC, visible-label career map, boundary/rest map, mixed alternation, career with visible inventory support; no hidden payoff optimization.',
  sequential:true,realBusinessCalls:0,realAuthStartCalls:0,systemSettingsChanged:false,
}};
await fs.mkdir(out,{recursive:true});
let write=Promise.resolve();
const save=()=>{const body=JSON.stringify(report,null,2);write=write.then(()=>fs.writeFile(`${out}/report.json`,body));return write;};
const resources=s=>({mood:s.mood,money:s.money,exp:s.exp,fatigue:s.life?.strain?.fatigue||0});
let browser;
async function play(fixture){
  const row={...fixture,passed:false,completed:false,turns:[],screenshots:[],issues:[],pageErrors:[],resourceFailures:[],normalMediaAborts:[],apiMocked:[],externalBlocked:[],support:[],practiceEntries:[]};
  report.games.push(row);const context=await browser.newContext({viewport:fixture.viewport,deviceScaleFactor:1,reducedMotion:'no-preference',serviceWorkers:'block',ignoreHTTPSErrors:false});let page;
  const current=async()=>{const record=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)||'null'),JOURNEY_STORAGE_KEY);const state=restore(record?.game);assert.ok(state,'Replay-valid UI save');return {record,state};};
  const now=()=>page.evaluate(()=>performance.now());
  async function shot(label){const file=`game-${fixture.game}-${label}.png`;await page.screenshot({path:`${out}/${file}`,timeout:20000});row.screenshots.push(file);}
  async function click(selector){await page.locator(selector).scrollIntoViewIfNeeded();await page.locator(selector).click();}
  async function geometry(locator){return locator.evaluate(node=>{const r=node.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {text:node.innerText,rect:r.toJSON(),visible:r.width>0&&r.height>0&&r.top>=-1&&r.left>=-1&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1,hit:hit===node||node.contains(hit)};});}
  async function practice(entry,kind){
    const before=await current(),start=await now();await click(entry);await page.locator('.practice-room').waitFor();const rounds=[];
    await shot(`turn-${before.state.turn}-practice-open`);
    for(let turn=1;turn<=2;turn++){
      await page.locator('#practice-message').fill(turn===1?'先确认交付范围与分工，我们一起核对记录。':'把还需确认的事记下来，再约一个双方方便的时间。');
      const startRound=await now();await click('.practice-form [type="submit"]');
      if(turn===1)await page.locator('.practice-round').filter({hasText:'第 2 / 2 轮'}).waitFor();else await page.locator('.practice-round').filter({hasText:'练习完成'}).waitFor();
      rounds.push({turn,injected503ToUIReadyMilliseconds:await now()-startRound});
    }
    const text=await page.locator('.practice-room').innerText();await shot(`turn-${before.state.turn}-practice-done`);await click('.practice-exit');
    const after=await current();row.practiceResult={kind,rounds,text,unchanged:JSON.stringify(before.record.game)===JSON.stringify(after.record.game),milliseconds:await now()-start};
    if(!row.practiceResult.unchanged||!/非实时 AI/.test(text))row.issues.push({type:'practice-fallback-invalid'});
  }
  try{
    await context.route('**/*',route=>{
      const req=route.request(),u=new URL(req.url());
      if(u.origin!==BASE&&!['data:','blob:'].includes(u.protocol)){row.externalBlocked.push({origin:u.origin,path:u.pathname,type:req.resourceType()});return route.abort();}
      if(u.pathname.startsWith('/api/')){
        row.apiMocked.push({path:u.pathname,method:req.method(),at:Date.now()});
        if(u.pathname==='/api/auth/status')return route.fulfill({json:{enabled:true,authenticated:true,provider:'zhihu',callbackUrl:BASE+'/api/auth/zhihu/callback',profile:{name:'隔离试玩账号'}}});
        if(u.pathname==='/api/ai/status')return route.fulfill({json:{configured:true,available:true,model:'zhida-fast-1p5',fallback:true}});
        return route.fulfill({status:503,json:{error:'Intentional offline 5-game audit; no live API calls.'}});
      }
      return route.continue();
    });
    await context.routeWebSocket('**/*',socket=>{row.externalBlocked.push({type:'websocket'});socket.close();});
    await context.addInitScript(base=>{
      if(location.origin!==base)return;
      localStorage.setItem('four-seasons-auto-depart','off');localStorage.setItem('four-seasons-music','off');
      const qa=window.__fiveGames={videos:[],stages:[],visibility:[],frameGaps:{count:0,over100:0,over250:0,max:0}},seen=new WeakSet();let lastStage,lastFrame;
      document.addEventListener('visibilitychange',()=>qa.visibility.push({hidden:document.hidden,at:performance.now()}));
      function frame(at){const stage=document.querySelector('.experience')?.dataset.stage;if(['ready','casting','walking','arriving','transition'].includes(stage)){if(lastFrame!==undefined){const gap=at-lastFrame;qa.frameGaps.count++;qa.frameGaps.max=Math.max(qa.frameGaps.max,gap);if(gap>100)qa.frameGaps.over100++;if(gap>250)qa.frameGaps.over250++;}lastFrame=at;}else lastFrame=undefined;requestAnimationFrame(frame);}requestAnimationFrame(frame);
      new MutationObserver(()=>{
        const stage=document.querySelector('.experience')?.dataset.stage;if(stage&&stage!==lastStage){qa.stages.push({stage,at:performance.now()});lastStage=stage;}
        for(const v of document.querySelectorAll('.cinematic video'))if(!seen.has(v)){
          seen.add(v);const entry={cell:v.closest('.cinematic')?.dataset.cinematic,events:[],frames:0};qa.videos.push(entry);
          for(const type of ['loadedmetadata','playing','waiting','stalled','error','ended'])v.addEventListener(type,()=>{entry.path=new URL(v.currentSrc||v.src).pathname;entry.events.push({type,at:performance.now(),time:v.currentTime,duration:Number.isFinite(v.duration)?v.duration:null,error:v.error?.code||null});});
          const decoded=()=>{entry.frames++;if(v.isConnected)v.requestVideoFrameCallback?.(decoded);};v.requestVideoFrameCallback?.(decoded);
        }
      }).observe(document,{subtree:true,childList:true,attributes:true,attributeFilter:['data-stage','data-mode']});
    },BASE);
    page=await context.newPage();page.setDefaultTimeout(45000);page.setDefaultNavigationTimeout(60000);
    page.on('pageerror',e=>row.pageErrors.push(e.message));
    page.on('response',r=>{const u=new URL(r.url());if(u.origin===BASE&&r.status()>=400&&!u.pathname.startsWith('/api/'))row.resourceFailures.push({path:u.pathname,status:r.status()});});
    page.on('requestfailed',r=>{const u=new URL(r.url()),error=r.failure()?.errorText;if(u.origin!==BASE||u.pathname.startsWith('/api/'))return;if(/ERR_ABORTED/.test(error||'')&&/\/cinematics\//.test(u.pathname))row.normalMediaAborts.push({path:u.pathname,error});else row.resourceFailures.push({path:u.pathname,error});});
    report.phase=`game-${fixture.game}-load`;await save();const load=performance.now();
    const response=await page.goto(BASE,{waitUntil:'domcontentloaded'});assert.equal(response.status(),200);
    await page.locator('#scene[data-assets="ready"][data-renderer="webgl"]').waitFor({timeout:120000});row.loadMilliseconds=Math.round(performance.now()-load);
    row.graphics=await page.locator('#scene canvas').evaluate(c=>{const gl=c.getContext('webgl2'),e=gl?.getExtension('WEBGL_debug_renderer_info');return {webgl2:!!gl,lost:gl?.isContextLost(),error:gl?.getError(),renderer:e?gl.getParameter(e.UNMASKED_RENDERER_WEBGL):null};});assert.ok(row.graphics.webgl2&&!row.graphics.lost);
    row.entryScript=await page.locator('script[type="module"]').getAttribute('src');assert.equal(await page.evaluate(k=>localStorage.getItem(k),JOURNEY_STORAGE_KEY),null);
    assert.equal(await page.locator('.welcome-actions button').count(),1);await page.locator('#character-name').fill(`五局试玩${fixture.game}`);await page.locator(`input[name="talent"][value="${fixture.talent}"]`).check();await shot('cover');
    row.startedAt=new Date().toISOString();row.start=await now();await click('#start-full');await page.locator('.experience[data-stage="ready"]').waitFor({timeout:120000});row.initialReadyMilliseconds=await now()-row.start;
    const initial=(await current()).state;row.initial=resources(initial);assert.equal(initial.position,-1);const filmShots=new Set(),seasonShots=new Set();
    for(let turn=1;turn<=40;turn++){
      report.phase=`game-${fixture.game}-turn-${turn}`;await save();const before=(await current()).state;assert.equal(before.phase,'ready');
      if(!seasonShots.has(before.season)){await shot(`season-${before.season}-map`);seasonShots.add(before.season);}
      const start=await now();await click('#continue-travel');const deadline=Date.now()+120000;
      while(await page.locator('.experience').getAttribute('data-stage')!=='choice'){
        if(Date.now()>deadline)throw Error(`Travel stuck at turn ${turn}`);
        const film=await page.locator('.cinematic video').evaluateAll(ns=>ns[0]?{cell:ns[0].closest('.cinematic')?.dataset.cinematic,time:ns[0].currentTime,ready:ns[0].readyState}:null);
        if(film?.time>1&&film.ready>=2&&!filmShots.has(film.cell)){await shot(`turn-${turn}-film-${film.cell}`);filmShots.add(film.cell);}
        await page.waitForTimeout(200);
      }
      const choiceAt=await now(),arrived=(await current()).state,cell=arrived.position+1;await page.waitForTimeout(650);
      const options=await page.locator('[data-choice]').evaluateAll(ns=>ns.map(n=>({index:Number(n.dataset.choice),text:n.innerText,disabled:n.disabled})));assert.equal(options.length,3);
      const layout=[];for(const option of options){const button=page.locator(`[data-choice="${option.index}"]`);await button.scrollIntoViewIfNeeded();await page.waitForTimeout(100);const geo=await geometry(button);layout.push({...geo,index:option.index});if(!option.disabled&&(!geo.visible||!geo.hit))row.issues.push({type:'choice-occluded',cell,geometry:geo});}
      if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1))row.issues.push({type:'horizontal-overflow',cell});
      if(await page.locator('.choice-effects,.condition-note').count())row.issues.push({type:'exact-payoff-before-choice',cell});
      if(fixture.strategy==='support'){
        await click('#inventory-button');await page.locator('#dialog.inventory-dialog[open]').waitFor();const items=await page.locator('[data-use-item]').evaluateAll(ns=>ns.map(n=>({id:n.dataset.useItem,disabled:n.disabled})));const usable=items.find(i=>['coffee','earplugs'].includes(i.id)&&!i.disabled);
        if(usable){const b=(await current()).state;await click(`[data-use-item="${usable.id}"]`);row.support.push({turn,id:usable.id,before:resources(b),after:resources((await current()).state)});}await click('#dialog-close');
      }
      const preferred=fixture.strategy==='cyclic'?(turn-1)%3:fixture.strategy==='boundary'?boundary[cell-1]:fixture.strategy==='mixed'?(turn%2?career[cell-1]:boundary[cell-1]):career[cell-1];
      const choice=options.find(o=>o.index===preferred&&!o.disabled)||options.find(o=>!o.disabled);const choiceText=await page.locator('#story-panel').innerText();
      if(turn===1||[6,8,11,13,15,18,22,27,31].includes(cell)||arrived.mood<=30||!row.turns.some(t=>t.season===arrived.season))await shot(`turn-${turn}-cell-${cell}-choice`);
      const clickedAt=await now();await click(`[data-choice="${choice.index}"]`);await page.locator('.experience[data-stage="feedback"]').waitFor();await page.waitForTimeout(650);const after=(await current()).state;assert.equal(after.turn,turn);
      if(fixture.ai&&turn===1){
        const aiStart=await now();await click('.reflection-drawer > summary');await page.locator('[data-ai-kind="event"][data-mode="fallback"]').waitFor();row.eventFallback={injected503ToUIMilliseconds:await now()-aiStart,text:await page.locator('[data-ai-kind="event"]').innerText()};await shot('event-offline-fallback');
      }
      const natural=await page.locator('#practice-open').count(),fallback=await page.locator('#invitation-practice-open').count();
      if(natural||fallback){const kind=fallback?'fallback':'natural';row.practiceEntries.push({turn,cell,kind});if(fixture.practice&&!row.practiceResult)await practice(fallback?'#invitation-practice-open':'#practice-open',kind);}
      const feedbackText=await page.locator('#story-panel').innerText();await click(await page.locator('#invitation-skip').count()?'#invitation-skip':'#next-button');await page.locator(`.experience[data-stage="${after.ended?'finished':'ready'}"]`).waitFor({timeout:120000});const advanced=await now();
      row.turns.push({turn,cell,die:arrived.die,season:arrived.season,title:arrived.active.title,choice:choice.index,choiceText,feedbackText,options,layout,before:resources(before),after:resources(after),ended:after.ended,timing:{travelMilliseconds:choiceAt-start,choiceDecisionMilliseconds:clickedAt-choiceAt,totalTurnMilliseconds:advanced-start}});
      console.log(`FIVE game=${fixture.game} strategy=${fixture.strategy} turn=${turn} die=${arrived.die} cell=${cell} mood=${after.mood} money=${after.money} fatigue=${after.life?.strain?.fatigue}${after.ended?' END='+after.ended:''}`);await save();
      if(!after.ended)continue;
      row.completed=true;row.ending=after.ended;row.endingCell=cell;row.durationMilliseconds=Math.round(advanced-row.start);row.minimumMood=Math.min(initial.mood,...row.turns.flatMap(t=>[t.before.mood,t.after.mood]));row.final=resources(after);
      report.phase=`game-${fixture.game}-memories`;await page.locator('#dialog.memory-dialog[open]').waitFor();await page.waitForTimeout(650);await shot('ending');row.endingText=await page.locator('.memory-album').innerText();row.title=await page.locator('.memory-title-stamp').innerText();
      const pageCount=await page.locator('[data-memory-go]').count();row.memories=[];
      for(let i=0;i<pageCount;i++){
        await click(`[data-memory-go="${i}"]`);await page.waitForTimeout(300);const images=await page.locator('.memory-photo img').evaluateAll(ns=>Promise.all(ns.map(async img=>{try{await img.decode();return {src:img.getAttribute('src'),loaded:img.naturalWidth>0};}catch{return {src:img.getAttribute('src'),loaded:false};}})));row.memories.push({i,images});if(images.some(i=>!i.loaded))row.issues.push({type:'memory-image-failed',page:i});
      }
      await shot('ending-last-page');await click('#share-card');await page.locator('.share-preview').evaluate(img=>img.decode());row.shareDimensions=await page.locator('.share-preview').evaluate(img=>({width:img.naturalWidth,height:img.naturalHeight}));
      const download=await geometry(page.locator('.share-actions a[download]'));row.shareDownload=download;if(!download.visible||!download.hit)row.issues.push({type:'share-download-occluded',geometry:download});await click('[data-share-zoom]');await shot('share-fit');await click('#back-to-report');await page.locator('.memory-album').waitFor();
      if(fixture.ai){
        const detail=page.getByRole('button',{name:/详细手记/});const summaryStart=await now();await detail.click();await page.locator('[data-ai-kind="summary"][data-mode="fallback"]').waitFor();row.summaryFallback={injected503ToUIMilliseconds:await now()-summaryStart,text:await page.locator('[data-ai-kind="summary"]').innerText()};await shot('summary-offline-fallback');await click('#back-to-memories');await page.locator('.memory-album').waitFor();
      }
      break;
    }
    assert.ok(row.completed,'Reached natural terminal state');row.trace=await page.evaluate(()=>window.__fiveGames);
    for(const film of row.trace.videos)if(!film.events.some(e=>e.type==='ended'))row.issues.push({type:'film-not-natively-ended',cell:film.cell,events:film.events});
    row.passed=!row.issues.length&&!row.pageErrors.length&&!row.resourceFailures.length&&!row.externalBlocked.length;
  }catch(error){row.failure={phase:report.phase,message:error.message,stack:error.stack};if(page){row.failureUI=await page.evaluate(()=>({stage:document.querySelector('.experience')?.dataset.stage,text:document.body.innerText.slice(-5000),trace:window.__fiveGames})).catch(()=>null);await shot('failure').catch(()=>{});}console.error(`FIVE FAILURE game=${fixture.game} ${error.message}`);}
  finally{row.finishedAt=new Date().toISOString();await context.close();await save();console.log(`FIVE COMPLETE ${JSON.stringify({game:fixture.game,completed:row.completed,passed:row.passed,turns:row.turns.length,ending:row.ending,ms:row.durationMilliseconds,minimumMood:row.minimumMood,issues:row.issues.length,failure:row.failure?.message})}`);}
}
try{
  browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--use-gl=angle','--use-angle=d3d11','--ignore-gpu-blocklist']});
  for(const fixture of fixtures)await play(fixture);
  report.completed=report.games.filter(g=>g.completed).length;report.passed=report.completed===5&&report.games.every(g=>g.passed);report.phase='complete';
}catch(error){report.failure={phase:report.phase,message:error.message};}
finally{await browser?.close();report.finishedAt=new Date().toISOString();await save();console.log('FIVE SUMMARY '+JSON.stringify({passed:report.passed,completed:report.completed,games:report.games.map(g=>({game:g.game,ending:g.ending,cell:g.endingCell,turns:g.turns.length,ms:g.durationMilliseconds,mood:g.minimumMood,passed:g.passed,failure:g.failure?.message}))}));}
if(!report.passed)process.exitCode=1;
