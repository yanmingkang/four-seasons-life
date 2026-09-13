// One actual public new-game journey. No fixtures, forced dice, accelerated
// animation, real business API calls, user saves or TLS exceptions. --direct
// disables proxy use only in this isolated Chrome, never system settings.
// Optional --pages selects the proposed fixed Pages hostname. Wait for project
// creation/ownership and deployment confirmation; the flag is not that proof.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs/promises';
import {restore} from '../src/engine.js';
import {JOURNEY_STORAGE_KEY} from '../src/journey-storage.js';

const flags=process.argv.slice(2);
assert.ok(flags.every(flag=>['--pages','--direct'].includes(flag))&&new Set(flags).size===flags.length,'Only optional --pages and --direct are accepted; arbitrary URLs are not allowed.');
const usePages=flags.includes('--pages');
const useDirect=flags.includes('--direct');
const BASE=usePages?'https://zhihu-four-seasons.pages.dev':'https://zhihu-four-seasons.sishi-life-005336.workers.dev';
const out=fileURLToPath(new URL(usePages?'../test-results/cloud-pages-public/':'../test-results/cloud-public/',import.meta.url));
const reportName=useDirect?'full-game-direct.json':'full-game.json';
const screenshotPrefix=useDirect?'full-game-direct':'full-game';
const require=createRequire(import.meta.url);
const {chromium}=require('C:/Users/25293/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const report={passed:false,phase:'prepare',startedAt:new Date().toISOString(),turns:[],screenshots:[],issues:[],pageErrors:[],resourceFailures:[],businessMocked:[],otherApiMocked:[],externalBlocked:[],normalMediaAborts:[],method:{
  base:BASE,hostingTarget:usePages?'pages':'workers',newGameUI:true,isolatedStorage:true,gameStorageNeverWrittenByTest:true,viewport:{width:1280,height:800},
  dice:'Native unchanged crypto RNG; no seeding, fixed dice or forced landings.',
  choices:'Predeclared A/B/C cyclic order; if disabled use first enabled option. No hidden payoff inspection.',
  normalAnimationSpeed:true,mandatoryAnimationsSkipped:false,proxyOverride:useDirect,ignoreHTTPSErrors:false,
  browserProxy:useDirect?'disabled-for-this-test':'default-network-settings',systemProxySettingsChanged:false,
  realBusinessCalls:0,allApisIntercepted:true,externalBlocked:true,user4173Untouched:true,
  timing:'Automatic UI execution, including screenshots and a 650ms card entrance wait. Not human reading/play time.',
  audio:'Muted through the normal saved sound preference; music quality not assessed.',
  optionalActions:'No inventory, companion boosts, optional practice or original-link navigation. Ending album and share inspected.',
  privacy:'No credentials, cookies, session tokens, raw API payloads or user saves recorded.'
}};
await fs.mkdir(out,{recursive:true});
const save=()=>fs.writeFile(`${out}/${reportName}`,`${JSON.stringify(report,null,2)}\n`);
let browser,context,page;
const clock=()=>page.evaluate(()=>performance.now());
async function current(){
  const game=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)||'null')?.game,JOURNEY_STORAGE_KEY);
  const state=restore(game);assert.ok(state,'Game save must pass canonical replay');return state;
}
const resources=state=>({money:state.money,mood:state.mood,moodMax:state.moodMax,exp:state.exp,fatigue:state.life?.strain?.fatigue||0});
async function shot(label){const name=`${screenshotPrefix}-${label}.png`;await page.screenshot({path:`${out}/${name}`,timeout:20000});report.screenshots.push(name);}
async function click(selector){await page.locator(selector).scrollIntoViewIfNeeded();await page.locator(selector).click();}

try{
  browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--use-gl=angle','--use-angle=d3d11','--ignore-gpu-blocklist',...(useDirect?['--no-proxy-server']:[])]});
  context=await browser.newContext({viewport:report.method.viewport,deviceScaleFactor:1,reducedMotion:'no-preference',serviceWorkers:'block',ignoreHTTPSErrors:false});
  await context.route('**/*',route=>{
    const request=route.request(),url=new URL(request.url());
    if(url.origin!==BASE&&!['data:','blob:'].includes(url.protocol)){report.externalBlocked.push({path:url.pathname,type:request.resourceType()});return route.abort();}
    if(['/api/narrate','/api/practice','/api/experience'].includes(url.pathname)){
      report.businessMocked.push({path:url.pathname,method:request.method(),status:503});
      return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Deliberate offline API response for public playthrough audit.'})});
    }
    if(url.pathname.startsWith('/api/')){
      report.otherApiMocked.push(url.pathname);
      const body=url.pathname==='/api/ai/status'?{model:'zhida-fast-1p5',configured:true,available:true,fallback:true,note:'Offline public browser audit'}:{error:'API disabled in this audit'};
      return route.fulfill({status:url.pathname==='/api/ai/status'?200:503,contentType:'application/json',body:JSON.stringify(body)});
    }
    return route.continue();
  });
  await context.routeWebSocket('**/*',socket=>{report.externalBlocked.push({path:new URL(socket.url()).pathname,type:'websocket'});socket.close();});
  await context.addInitScript(base=>{
    // Chrome's network-error document has a restricted opaque origin; do not
    // mistake instrumentation there for a game localStorage failure.
    if(location.origin!==base)return;
    localStorage.setItem('four-seasons-auto-depart','off');localStorage.setItem('four-seasons-music','off');
    const qa=window.__publicFullGame={videos:[],chapters:[],stages:[]},seen=new WeakSet();let lastStage,lastChapter;
    new MutationObserver(()=>{
      const stage=document.querySelector('.experience')?.dataset.stage;
      if(stage&&stage!==lastStage){qa.stages.push({stage,at:performance.now()});lastStage=stage;}
      const chapter=document.querySelector('.season-chapter');
      if(chapter&&chapter!==lastChapter){qa.chapters.push({season:Number(chapter.dataset.season),at:performance.now()});lastChapter=chapter;}
      for(const video of document.querySelectorAll('.cinematic video'))if(!seen.has(video)){
        seen.add(video);const entry={cell:video.closest('.cinematic')?.dataset.cinematic,events:[],decodedFrames:0};qa.videos.push(entry);
        for(const type of ['loadedmetadata','playing','waiting','error','ended'])video.addEventListener(type,()=>{
          entry.path=new URL(video.currentSrc||video.src).pathname;entry.width=video.videoWidth;entry.height=video.videoHeight;
          entry.events.push({type,time:video.currentTime,duration:Number.isFinite(video.duration)?video.duration:null,errorCode:video.error?.code||null});
        });
        const frame=()=>{entry.decodedFrames++;if(video.isConnected)video.requestVideoFrameCallback?.(frame);};video.requestVideoFrameCallback?.(frame);
      }
    }).observe(document,{subtree:true,childList:true,attributes:true,attributeFilter:['data-stage','data-mode']});
  },BASE);
  page=await context.newPage();page.setDefaultTimeout(45000);page.setDefaultNavigationTimeout(90000);
  page.on('pageerror',error=>report.pageErrors.push(error.message));
  page.on('response',response=>{const url=new URL(response.url());if(url.origin===BASE&&response.status()>=400&&!url.pathname.startsWith('/api/'))report.resourceFailures.push({path:url.pathname,status:response.status()});});
  page.on('requestfailed',request=>{const url=new URL(request.url()),error=request.failure()?.errorText;if(url.origin!==BASE||url.pathname.startsWith('/api/'))return;
    if(/ERR_ABORTED/.test(error||'')&&/\/cinematics\//.test(url.pathname))report.normalMediaAborts.push({path:url.pathname,error});else report.resourceFailures.push({path:url.pathname,error});});
  report.phase='public-load';await save();const load=performance.now();
  const response=await page.goto(BASE,{waitUntil:'domcontentloaded'});report.documentStatus=response?.status();assert.equal(report.documentStatus,200);assert.equal(new URL(page.url()).origin,BASE);
  await page.locator('#scene[data-assets="ready"][data-renderer="webgl"]').waitFor({timeout:120000});report.loadMilliseconds=Math.round(performance.now()-load);
  report.graphics=await page.locator('#scene canvas').evaluate(canvas=>{const gl=canvas.getContext('webgl2'),ext=gl?.getExtension('WEBGL_debug_renderer_info');return {webgl2:!!gl,contextLost:gl?.isContextLost(),renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):null};});
  assert.equal(report.graphics.webgl2,true);assert.equal(report.graphics.contextLost,false);
  assert.equal(await page.evaluate(key=>localStorage.getItem(key),JOURNEY_STORAGE_KEY),null,'No saved-game fixture');
  assert.equal(await page.locator('#resume').count(),0);assert.equal(await page.locator('#start-full').count(),1);
  await page.locator('#character-name').fill('公网旅人');await shot('cover');report.defaultTalent=await page.locator('input[name="talent"]:checked').getAttribute('value');
  report.startedGameAt=new Date().toISOString();report.startPerformance=await clock();await click('#start-full');
  await page.locator('.experience[data-stage="ready"]').waitFor({timeout:120000});const initial=await current();assert.equal(initial.position,-1);assert.equal(initial.total,40);report.initial=resources(initial);
  const seasons=new Set(),films=new Set();
  for(let turn=1;turn<=40;turn++){
    report.phase=`turn-${turn}`;await save();const before=await current();assert.equal(before.phase,'ready');
    if(!seasons.has(before.season)){await page.waitForTimeout(650);await shot(`season-${before.season}-map`);seasons.add(before.season);}
    const start=await clock();await click('#continue-travel');const deadline=Date.now()+120000;
    while(await page.locator('.experience').getAttribute('data-stage')!=='choice'){
      if(Date.now()>deadline)throw Error(`Travel did not reach an event at turn ${turn}`);
      const film=await page.locator('.cinematic video').evaluateAll(nodes=>nodes[0]?{cell:nodes[0].closest('.cinematic')?.dataset.cinematic,time:nodes[0].currentTime,ready:nodes[0].readyState}:null);
      if(film?.time>1&&film.ready>=2&&!films.has(film.cell)){await shot(`turn-${turn}-film-${film.cell}`);films.add(film.cell);}
      await page.waitForTimeout(200);
    }
    const choiceVisible=await clock(),arrived=await current();await page.waitForTimeout(650);
    const options=await page.locator('[data-choice]').evaluateAll(nodes=>nodes.map(node=>({index:Number(node.dataset.choice),text:node.innerText,disabled:node.disabled})));
    assert.equal(options.length,3);const desired=(turn-1)%3,choice=options.find(item=>item.index===desired&&!item.disabled)||options.find(item=>!item.disabled);assert.ok(choice);
    assert.equal(await page.locator('.choice-effects,.condition-note').count(),0,'No exact payoff shown before choosing');
    const visibleText=await page.locator('#story-panel').innerText();
    if(turn===1||arrived.mood<=30||!report.turns.some(item=>item.season===arrived.season))await shot(`turn-${turn}-cell-${arrived.position+1}-choice`);
    const chosenAt=await clock();await click(`[data-choice="${choice.index}"]`);await page.locator('.experience[data-stage="feedback"]').waitFor();await page.waitForTimeout(650);
    const settled=await current();assert.equal(settled.turn,turn);assert.equal(settled.history.at(-1).choice,choice.index);
    const feedbackText=await page.locator('#story-panel').innerText();
    const fallbackInvitation=await page.locator('#invitation-skip').count();
    await click(fallbackInvitation?'#invitation-skip':'#next-button');await page.locator(`.experience[data-stage="${settled.ended?'finished':'ready'}"]`).waitFor({timeout:120000});
    const advanced=await clock();report.turns.push({turn,cell:arrived.position+1,die:arrived.die,season:arrived.season,title:arrived.active.title,choice:choice.index,options,before:resources(before),after:resources(settled),ended:settled.ended||null,
      timing:{travelMilliseconds:choiceVisible-start,automaticChoiceMilliseconds:chosenAt-choiceVisible,totalTurnMilliseconds:advanced-start},choiceText:visibleText,feedbackText,skippedOptionalInvitation:!!fallbackInvitation});
    console.log(`PUBLIC_FULL turn=${turn} die=${arrived.die} cell=${arrived.position+1} mood=${settled.mood} money=${settled.money}${settled.ended?' END='+settled.ended:''}`);await save();
    if(!settled.ended)continue;
    report.ending=settled.ended;report.endingCell=arrived.position+1;report.totalTurns=turn;report.durationMilliseconds=Math.round(advanced-report.startPerformance);report.final=resources(settled);
    report.minimumMood=Math.min(initial.mood,...report.turns.flatMap(item=>[item.before.mood,item.after.mood]));
    report.phase='ending-album';await page.locator('#dialog.memory-dialog[open]').waitFor();await page.waitForTimeout(650);
    await page.locator('.memory-photo img').evaluateAll(nodes=>Promise.all(nodes.map(img=>img.decode())));await shot('ending-album');
    report.endingText=await page.locator('.memory-album').innerText();report.memoryPages=[];
    const pages=await page.locator('[data-memory-go]').count();
    for(let index=0;index<pages;index++){
      await click(`[data-memory-go="${index}"]`);await page.waitForTimeout(300);
      const images=await page.locator('.memory-photo img').evaluateAll(nodes=>Promise.all(nodes.map(async img=>{try{await img.decode();return{path:img.getAttribute('src'),loaded:img.naturalWidth>0};}catch{return{path:img.getAttribute('src'),loaded:false};}})));
      report.memoryPages.push({index,images});if(images.some(img=>!img.loaded))report.issues.push({type:'memory-image-failure',page:index});
    }
    await shot('ending-last-page');await click('#share-card');await page.locator('.share-preview').evaluate(img=>img.decode());await page.waitForTimeout(350);
    report.shareDimensions=await page.locator('.share-preview').evaluate(img=>({width:img.naturalWidth,height:img.naturalHeight}));await click('[data-share-zoom]');await shot('share-fit');
    await click('#back-to-report');await page.locator('.memory-album').waitFor();break;
  }
  assert.ok(report.ending,'One actual game must reach a natural terminal state');
  report.trace=await page.evaluate(()=>window.__publicFullGame);
  for(const film of report.trace.videos)if(!film.events.some(event=>event.type==='ended'))report.issues.push({type:'video-did-not-natively-end',cell:film.cell,events:film.events});
  report.horizontalOverflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);
  if(report.horizontalOverflow)report.issues.push({type:'horizontal-overflow'});
  report.passed=!report.pageErrors.length&&!report.resourceFailures.length&&!report.issues.length&&!report.externalBlocked.length;report.phase='complete';
}catch(error){report.failure={phase:report.phase,message:error.message};if(page)await shot('failure').catch(()=>{});}
finally{
  await context?.close().catch(()=>{});await browser?.close().catch(()=>{});report.finishedAt=new Date().toISOString();await save();
  console.log(JSON.stringify({passed:report.passed,ending:report.ending,turns:report.totalTurns,durationMilliseconds:report.durationMilliseconds,failure:report.failure,report:`${out}/${reportName}`}));if(!report.passed)process.exitCode=1;
}
