// Twenty fresh production UI journeys, split by argv: 1,4,7,... .
// No saved-game fixture, time acceleration, forced landings or skipped films.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {createServer} from 'node:net';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
import {restore,getLifeReport} from '../src/engine.js';
import {EVENTS} from '../src/events.js';
import {JOURNEY_STORAGE_KEY} from '../src/journey-storage.js';
import {getMemoryAlbum} from '../src/memory-album.js';

const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_PATH||'C:/Users/25293/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=fileURLToPath(new URL('../',import.meta.url)),out=new URL('../test-results/twenty-games/',import.meta.url);
// Frozen from visible option labels before play. Subjective intentions, not
// optimal/safe choices; disabled options use only the UI's visible availability.
const career=[1,1,2,2,1,0,1,2,0,0,0,1,0,2,0,0,0,1,1,0,1,0,1,1,0,1,0,2,1,1,0,1,1,0,0,1,0,2,2,2];
const boundary=[2,0,0,1,2,1,0,1,2,1,2,0,1,0,1,2,1,2,2,1,0,0,2,0,2,2,1,0,2,2,1,0,1,1,0,2,1,1,0,1];
const fixtures=Array.from({length:20},(_,i)=>({game:i+1,seed:(20260913+i*2654435761)>>>0,choiceSeed:(20260913+i*1013904223)>>>0,
  talent:['defense','ambitious','optimistic'][i%3],strategy:i<8?'random':i<12?'career':i<16?'boundary':'support',
  viewport:i<12?(i%2?[1440,900]:[1280,800]):(i%2?[667,375]:[844,390]),practice:i%3===0?'offline-two-rounds':'skip'}));
const selectedNumbers=(process.argv[2]||fixtures.map(f=>f.game).join(',')).split(',').map(Number);
assert.ok(selectedNumbers.length&&selectedNumbers.every(n=>Number.isInteger(n)&&n>=1&&n<=20),'argv contains game numbers 1–20');
assert.equal(new Set(selectedNumbers).size,selectedNumbers.length,'No duplicate journeys');
const selected=fixtures.filter(f=>selectedNumbers.includes(f.game)),stamp=selected.map(f=>f.game).join('-');
const reportURL=new URL(`report-${stamp}.json`,out);
const report={passed:false,phase:'prepare',startedAt:new Date().toISOString(),games:[],method:{production:true,newGameUI:true,seededSave:false,
  gameStorageNeverWrittenByTest:true,normalMotion:true,clockAcceleration:false,mandatoryAnimationsSkipped:false,realModelCalls:0,realCLICalls:0,
  allApisIntercepted:true,externalTrafficBlocked:true,isolatedServer:true,user4173Untouched:true,concurrencyPerShard:1,graphics:'native Chrome ANGLE d3d11',
  randomness:'20260913-derived independent Mulberry32 seeds; only single Uint32 crypto entropy is seeded. Production fair six-face conversion is unchanged. No forced destinations.',
  choicePolicy:'8 random / 4 career / 4 boundary-rest / 4 visible-support. Support uses the career visible-label map plus at most one enabled coffee/earplugs per turn and visible mood<=40 companion listen. No hidden payoff or forecast consulted.',
  timings:'Measured automatic UI execution, includes screenshots and 650ms choice stability wait; not human reading or human playtime.',
  performance:'Ordinary-map read-only RAF heading/frame-gap observations after the pilot. Three native browsers may run concurrently; not a standalone-device FPS benchmark. Pilot retains discrete worldstage heading observations.',
  practice:'Optional entry observed naturally. Every third-index game completes at most one two-round API-503 fallback rehearsal; others skip. No live AI-quality claim.',
  coverage:'Only actual visited seasons and clips are counted; early endings retain unwritten seasons. Independent new full-mode journeys, not legal seeded end-state fixtures.',
  fixtures,semanticMap:EVENTS.map((e,i)=>({cell:i+1,title:e.title,career:{index:career[i],label:e.options[career[i]].label},boundary:{index:boundary[i],label:e.options[boundary[i]].label}}))}};
let server,browser,serverError,serverLog='';
await fs.mkdir(out,{recursive:true});
let reportWrite=Promise.resolve();
const saveReport=()=>{const content=JSON.stringify(report,null,2);reportWrite=reportWrite.then(()=>fs.writeFile(reportURL,content));return reportWrite;};
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
async function startServer(){
  const html=await fs.readFile(new URL('../dist/index.html',import.meta.url),'utf8');
  const names=(await fs.readdir(new URL('../dist/assets/',import.meta.url))).filter(name=>/^(?:main|index)-.*\.(?:js|css)$/.test(name));
  report.build={indexSha256:hash(html),assets:await Promise.all(names.map(async name=>({name,sha256:hash(await fs.readFile(new URL(`../dist/assets/${name}`,import.meta.url)))}))),source:[]};
  for(const name of ['main.js','engine.js','events.js','cinematics.js','cinematic-manifest.js','practice-invitation.js','memory-album.js','share-preview.js']){
    try{report.build.source.push({name,sha256:hash(await fs.readFile(new URL(`../src/${name}`,import.meta.url)))});}catch(error){if(error.code!=='ENOENT')throw error;}
  }
  const probe=createServer();await new Promise((resolve,reject)=>{probe.once('error',reject);probe.listen(0,'127.0.0.1',resolve);});const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
  const disabledCli=fileURLToPath(new URL(`disabled-cli-${stamp}.exe`,out));await assert.rejects(fs.access(disabledCli),{code:'ENOENT'});
  server=spawn(process.execPath,['server.mjs','--production'],{cwd:root,windowsHide:true,env:{...process.env,PORT:String(port),ZHIHU_CLI_PATH:disabledCli},stdio:['ignore','pipe','pipe']});
  server.on('error',error=>{serverError=error;});for(const stream of [server.stdout,server.stderr])stream.on('data',data=>{serverLog=(serverLog+data).slice(-8000);});
  const base=`http://127.0.0.1:${port}`;report.server={base,production:true,isolated:true};
  for(let i=0;i<100;i++){if(serverError)throw serverError;if(server.exitCode!==null)throw Error(`Owned server stopped: ${serverLog}`);try{if((await fetch(base,{signal:AbortSignal.timeout(1000)})).ok)return base;}catch{}await delay(100);}
  throw Error(`Owned server unavailable: ${serverLog}`);
}
function rng(seed){let t=seed>>>0;return()=>{t=(t+0x6D2B79F5)>>>0;let x=t;x=Math.imul(x^(x>>>15),x|1);x^=x+Math.imul(x^(x>>>7),x|61);return((x^(x>>>14))>>>0)/4294967296;};}
async function current(page){const record=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),JOURNEY_STORAGE_KEY);const game=restore(record?.game);assert.ok(game,'UI save must remain replay-valid');return{record,game};}
const now=page=>page.evaluate(()=>performance.now());
const resources=s=>({money:s.money,mood:s.mood,exp:s.exp,fatigue:s.life?.strain?.fatigue});
function chooseIndex(f,cell,options,random){const enabled=options.filter(o=>!o.disabled);assert.ok(enabled.length,'At least one visible enabled choice');if(f.strategy==='random')return enabled[Math.floor(random()*enabled.length)].index;const preferred=(f.strategy==='boundary'?boundary:career)[cell-1];return enabled.find(o=>o.index===preferred)?.index??enabled.find(o=>o.index>preferred)?.index??enabled[0].index;}
async function geometry(locator){return locator.evaluate(node=>{const r=node.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return{text:node.innerText,rect:r.toJSON(),visible:r.width>0&&r.height>0&&r.left>=-1&&r.top>=-1&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1,hit:hit===node||node.contains(hit),disabled:!!node.disabled};});}
async function playGame(base,fixture){
  const row={...fixture,passed:false,completed:false,turns:[],supportActions:[],practiceEntries:[],practiceSessions:[],screenshots:[],issues:[],errors:[],glErrors:[],consoleWarnings:[],resourceFailures:[],apiIntercepted:[],externalBlocked:[],inspectionMilliseconds:0};report.games.push(row);
  const context=await browser.newContext({viewport:{width:fixture.viewport[0],height:fixture.viewport[1]},reducedMotion:'no-preference',serviceWorkers:'block',acceptDownloads:true});
  let page;
  try{
    await context.route('**/*',route=>{const request=route.request(),url=new URL(request.url());if(url.origin!==base&&!['data:','blob:'].includes(url.protocol)){row.externalBlocked.push({url:url.origin+url.pathname,method:request.method()});return route.abort('blockedbyclient');}return route.continue();});
    await context.route('**/api/**',route=>{const request=route.request();let input;try{input=request.postDataJSON();}catch{}row.apiIntercepted.push({url:new URL(request.url()).pathname,at:Date.now(),...(new URL(request.url()).pathname==='/api/practice'?{input}: {})});return route.fulfill({status:503,json:{error:'Isolated twenty-game playtest. Real APIs disabled.'}});});
    await context.routeWebSocket('**/*',socket=>{row.externalBlocked.push({url:socket.url(),method:'websocket'});socket.close();});
    await context.addInitScript(({key,seed})=>{
      localStorage.setItem('four-seasons-auto-depart','off');localStorage.setItem('four-seasons-music','off');
      const qa=window.__twentyGames={stageChanges:[],worldStages:[],mediaChanges:[],videos:[],diceEntropy:[],writes:[],visibility:[],arrivals:[],headingFrames:[],frameGaps:{count:0,total:0,max:0,over100:0,over250:0}};
      let lastFrame;
      function sampleFrame(at){const scene=document.querySelector('#scene'),stage=document.querySelector('.experience')?.dataset.stage;if(['ready','casting','landed','walking','arriving','transition'].includes(stage)&&scene){const dt=lastFrame===undefined?0:at-lastFrame;if(dt){qa.frameGaps.count++;qa.frameGaps.total+=dt;qa.frameGaps.max=Math.max(qa.frameGaps.max,dt);if(dt>100)qa.frameGaps.over100++;if(dt>250)qa.frameGaps.over250++;}qa.headingFrames.push({at,dt,stage,worldStage:scene.dataset.stage,characterHeading:Number(scene.dataset.characterHeading),routeHeading:Number(scene.dataset.routeHeading)});lastFrame=at;}else lastFrame=undefined;requestAnimationFrame(sampleFrame);}requestAnimationFrame(sampleFrame);
      document.addEventListener('visibilitychange',()=>qa.visibility.push({at:performance.now(),hidden:document.hidden}));
      let t=seed>>>0;const entropy=crypto.getRandomValues.bind(crypto);crypto.getRandomValues=array=>{if(array instanceof Uint32Array&&array.length===1){t=(t+0x6D2B79F5)>>>0;let x=t;x=Math.imul(x^(x>>>15),x|1);x^=x+Math.imul(x^(x>>>7),x|61);array[0]=(x^(x>>>14))>>>0;qa.diceEntropy.push({at:performance.now(),value:array[0]});return array;}return entropy(array);};
      const set=Storage.prototype.setItem;Storage.prototype.setItem=function(name,value){if(this===localStorage&&name===key){try{qa.writes.push({at:performance.now(),record:JSON.parse(value)});}catch{}}return set.call(this,name,value);};
      document.addEventListener('worldstage',e=>{if(e.target.id==='scene')qa.worldStages.push({...e.detail,at:performance.now()});},true);
      const seenVideos=new WeakSet();let lastStage,lastMedia,lastArrivalActive=false;
      function observe(){
        const stage=document.querySelector('.experience')?.dataset.stage;if(stage&&stage!==lastStage){qa.stageChanges.push({stage,at:performance.now()});lastStage=stage;}
        const cine=document.querySelector('.cinematic'),chapter=document.querySelector('.season-chapter');const media=chapter?`season-${chapter.dataset.season}`:cine?`cine-${cine.dataset.cinematic}-${cine.dataset.mode}`:'none';if(media!==lastMedia){qa.mediaChanges.push({media,at:performance.now()});lastMedia=media;}
        const arrival=document.querySelector('.arrival-transition:not([hidden])'),season=Number(arrival?.dataset.season),arrivalActive=!!arrival&&Number.isInteger(season)&&season>=0&&season<4;
        if(arrivalActive&&!lastArrivalActive)qa.arrivals.push({at:performance.now(),season,theme:arrival.dataset.theme,text:arrival.innerText});lastArrivalActive=arrivalActive;
        for(const video of document.querySelectorAll('video.cine-video'))if(!seenVideos.has(video)){
          seenVideos.add(video);const data={at:performance.now(),src:video.currentSrc||video.src,cell:video.closest('.cinematic')?.dataset.cinematic,events:[],decodedFrames:0,lastMediaTime:0};qa.videos.push(data);
          for(const event of ['loadstart','loadedmetadata','loadeddata','play','playing','pause','waiting','stalled','suspend','error','ended','emptied'])video.addEventListener(event,()=>{data.events.push({event,at:performance.now(),time:video.currentTime,duration:Number.isFinite(video.duration)?video.duration:null,readyState:video.readyState,error:video.error?{code:video.error.code,message:video.error.message}:null});if(event==='loadedmetadata'){data.duration=video.duration;data.width=video.videoWidth;data.height=video.videoHeight;}if(event==='ended'){data.ended=true;data.endedTime=video.currentTime;data.duration=video.duration;}});
          const frame=(at,meta)=>{data.decodedFrames++;data.lastMediaTime=meta.mediaTime;if(video.isConnected)video.requestVideoFrameCallback(frame);};if(video.requestVideoFrameCallback)video.requestVideoFrameCallback(frame);
        }
      }
      new MutationObserver(observe).observe(document,{subtree:true,childList:true,attributes:true,attributeFilter:['data-stage','data-mode','data-season','data-theme','hidden']});
    },{key:JOURNEY_STORAGE_KEY,seed:fixture.seed});
    page=await context.newPage();page.setDefaultTimeout(45000);page.on('pageerror',error=>row.errors.push(error.message));
    page.on('console',message=>{if(message.type()==='warning')row.consoleWarnings.push(message.text());if(message.type()==='error'&&/WebGL|GL_INVALID|CONTEXT_LOST|Failed to create.*context/i.test(message.text()))row.glErrors.push(message.text());});
    page.on('response',response=>{if(response.status()>=400&&!new URL(response.url()).pathname.startsWith('/api/'))row.resourceFailures.push({url:new URL(response.url()).pathname,status:response.status()});});
    page.on('requestfailed',request=>{const url=new URL(request.url());if(url.origin===base&&!url.pathname.startsWith('/api/')&&!/ERR_ABORTED/.test(request.failure()?.errorText||''))row.resourceFailures.push({url:url.pathname,error:request.failure()?.errorText});});
    async function shot(label){const start=await now(page),filename=`game-${String(fixture.game).padStart(2,'0')}-${label}.png`;await page.screenshot({path:fileURLToPath(new URL(filename,out)),timeout:20000});row.screenshots.push(filename);row.inspectionMilliseconds+=(await now(page))-start;}
    async function issue(type,details={}){row.issues.push({phase:report.phase,type,...details});}
    async function click(selector){const target=page.locator(selector);await target.scrollIntoViewIfNeeded();await target.click();}
    async function inspectChoices(){
      // Real CSS entrance completes before hit testing. Offscreen cards may be
      // normally scrolled; only still-clipped/occluded controls are flagged.
      await page.waitForTimeout(650);const layout={initial:[],scrolled:[],horizontalOverflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1)};
      for(const target of await page.locator('[data-choice]').all())layout.initial.push(await geometry(target));
      for(const target of await page.locator('[data-choice]').all()){await target.scrollIntoViewIfNeeded();await page.waitForTimeout(120);const g=await geometry(target);layout.scrolled.push(g);if(!g.disabled&&(!g.visible||!g.hit))await issue('choice-unreachable-after-normal-scroll',{geometry:g});}
      if(layout.horizontalOverflow)await issue('horizontal-page-overflow');return layout;
    }
    async function practice(entry,kind){
      const before=await current(page),openingAt=await now(page);await click(entry);await page.locator('#dialog.practice-dialog[open] .practice-room').waitFor();
      const session={kind,openingText:await page.locator('.practice-room').innerText(),startedAt:openingAt};row.practiceSessions.push(session);await shot(`turn-${before.game.turn}-practice-${kind}`);
      for(let turn=1;turn<=2;turn++){await page.locator('#practice-message').fill(turn===1?'先确认这次交付的范围、分工和一起核对的时间。':'我们把仍需确认的事情记下来，再约一个双方都方便的时间。');await click('.practice-form [type="submit"]');if(turn===1)await page.locator('.practice-round').filter({hasText:'第 2 / 2 轮'}).waitFor();else await page.locator('.practice-tip:not([hidden])').waitFor();}
      session.completeText=await page.locator('.practice-room').innerText();session.fallbackLabeled=/预设.*非实时 AI|非实时 AI.*预设/s.test(session.completeText);if(!session.fallbackLabeled)await issue('practice-fallback-label-not-found',{text:session.completeText});
      await click('.practice-exit');const after=await current(page);session.gameUnchanged=JSON.stringify(before.record.game)===JSON.stringify(after.record.game);if(!session.gameUnchanged)await issue('practice-mutated-game');session.milliseconds=(await now(page))-openingAt;row.practiceDone=true;
    }
    async function optionalSupport(){
      const start=await now(page);await click('#inventory-button');await page.locator('#dialog.inventory-dialog[open]').waitFor();const items=await page.locator('[data-use-item]').evaluateAll(nodes=>nodes.map(n=>({id:n.dataset.useItem,disabled:n.disabled,text:n.closest('.inventory-item')?.innerText})));row.supportActions.push({turn:(await current(page)).game.turn+1,type:'inventory-inspection',items});
      const usable=items.find(item=>['coffee','earplugs'].includes(item.id)&&!item.disabled);if(usable){const before=(await current(page)).game;await click(`[data-use-item="${usable.id}"]`);const after=(await current(page)).game;row.supportActions.push({turn:after.turn+1,type:'manual-item',id:usable.id,before:resources(before),after:resources(after)});}
      await click('#dialog-close');
      if(Number(await page.locator('#mood-value').innerText())<=40&&await page.locator('#companion-button').isVisible()){
        await click('#companion-button');const listen=page.locator('[data-companion="listen"]');if(await listen.isEnabled()){const before=(await current(page)).game;await click('[data-companion="listen"]');const after=(await current(page)).game;row.supportActions.push({turn:after.turn+1,type:'companion-listen',before:resources(before),after:resources(after)});}await click('#dialog-close');
      }
      row.inspectionMilliseconds+=(await now(page))-start;
    }
    report.phase=`game-${fixture.game}-load`;await saveReport();const load=Date.now();await page.goto(base);await page.locator('#scene[data-assets="ready"][data-renderer="webgl"]').waitFor({timeout:120000});row.loadMilliseconds=Date.now()-load;
    row.webgl=await page.locator('#scene canvas').evaluate(canvas=>{const gl=canvas.getContext('webgl2'),debug=gl.getExtension('WEBGL_debug_renderer_info');return{webgl2:gl instanceof WebGL2RenderingContext,contextLost:gl.isContextLost(),error:gl.getError(),renderer:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER)};});
    assert.equal(row.webgl.webgl2,true);assert.equal(row.webgl.contextLost,false);assert.equal(row.webgl.error,0);assert.equal(await page.evaluate(key=>localStorage.getItem(key),JOURNEY_STORAGE_KEY),null,'Fresh game, no seeded save');
    row.welcomeButtonCount=await page.locator('.welcome-actions button').count();if(row.welcomeButtonCount!==1)await issue('welcome-not-single-entry',{count:row.welcomeButtonCount});
    await page.locator('#character-name').fill(`二十局${fixture.game}`);await page.locator(`input[name="talent"][value="${fixture.talent}"]`).check();await shot('welcome');
    row.startedAt=new Date().toISOString();row.startPerformance=await now(page);await click('#start-full');await page.locator('.experience[data-stage="ready"]').waitFor({timeout:120000});row.initialChapterMilliseconds=(await now(page))-row.startPerformance;
    row.initial=(await current(page)).game;assert.equal(row.initial.position,-1);assert.equal(row.initial.turn,0);assert.equal(row.initial.mode,'full');assert.equal(row.initial.total,40);
    const random=rng(fixture.choiceSeed),mapSeasonShots=new Set(),arrivalSeasonShots=new Set(),filmShots=new Set();
    for(let turn=1;turn<=40;turn++){
      report.phase=`game-${fixture.game}-turn-${turn}`;const before=(await current(page)).game;assert.equal(before.phase,'ready');
      if(!mapSeasonShots.has(before.season)){await page.waitForTimeout(650);await shot(`season-${before.season}-stable-map`);mapSeasonShots.add(before.season);}
      const start=await now(page);await click('#continue-travel');const travelDeadline=Date.now()+120000;
      while(await page.locator('.experience').getAttribute('data-stage')!=='choice'){
        if(Date.now()>travelDeadline)throw Error(`Travel stuck before choices at turn ${turn}`);
        const view=await page.evaluate(()=>{const c=document.querySelector('.cinematic'),v=c?.querySelector('video'),a=document.querySelector('.arrival-transition:not([hidden])'),season=Number(a?.dataset.season);return{stage:document.querySelector('.experience')?.dataset.stage,film:c?{cell:c.dataset.cinematic,mode:c.dataset.mode,time:v?.currentTime,ready:v?.readyState}:null,arrival:a&&Number.isInteger(season)&&season>=0&&season<4?{season}:null};});
        if(view.film?.time>1&&view.film.ready>=2&&!filmShots.has(view.film.cell)){await shot(`turn-${turn}-film-${view.film.cell}`);filmShots.add(view.film.cell);}
        if(view.arrival&&!arrivalSeasonShots.has(view.arrival.season)){await page.waitForTimeout(280);if(await page.locator(`.arrival-transition:not([hidden])[data-season="${view.arrival.season}"]`).count()){await shot(`season-${view.arrival.season}-arrival`);arrivalSeasonShots.add(view.arrival.season);}}
        await page.waitForTimeout(200);
      }
      const choiceVisible=await now(page),arrived=(await current(page)).game,cell=arrived.position+1;
      const layout=await inspectChoices();const nudgeText=await page.locator('[data-open-inventory]').count()?await page.locator('[data-open-inventory]').innerText():null;
      if(fixture.strategy==='support')await optionalSupport();
      const pending=(await current(page)).game,options=await page.locator('[data-choice]').evaluateAll(nodes=>nodes.map(n=>({index:Number(n.dataset.choice),text:n.innerText,disabled:n.disabled})));
      if(options.length!==3)await issue('not-three-options',{cell,options});assert.ok(options.length,'No options');
      if(await page.locator('.choice-effects,.condition-note').count())await issue('exact-choice-payoff-present',{cell});
      const choiceText=await page.locator('#story-panel').innerText(),choice=chooseIndex(fixture,cell,options,random);
      await page.locator(`[data-choice="${choice}"]`).scrollIntoViewIfNeeded();await page.waitForTimeout(120);
      if(turn===1||[6,8,11,13,15,18,22,27,31].includes(cell)||pending.mood<=30||!row.turns.some(t=>t.season===pending.season))await shot(`turn-${turn}-cell-${cell}-choice`);
      const clicked=await now(page);await click(`[data-choice="${choice}"]`);await page.locator('.experience[data-stage="feedback"]').waitFor();await page.waitForTimeout(650);const feedbackVisible=await now(page);
      const settled=await current(page),after=settled.game,feedbackText=await page.locator('#story-panel').innerText();assert.equal(after.turn,turn);assert.equal(after.history.at(-1).choice,choice);
      let advanceSelector='#next-button';const fallback=await page.locator('#invitation-practice-open').count(),natural=await page.locator('#practice-open').count();
      if(fallback||natural){const kind=fallback?'fallback':'natural';row.practiceEntries.push({turn,cell,kind,metadata:settled.record.practiceInvitation,text:await page.locator(fallback?'[data-practice-invitation="fallback"]':'.practice-invite').innerText()});await shot(`turn-${turn}-invitation-${kind}`);
        if(fixture.practice==='offline-two-rounds'&&!row.practiceDone)await practice(fallback?'#invitation-practice-open':'#practice-open',kind);else if(fallback)advanceSelector='#invitation-skip';
      }
      const advancing=await now(page);await click(advanceSelector);await page.locator(`.experience[data-stage="${after.ended?'finished':'ready'}"]`).waitFor({timeout:120000});const advanced=await now(page),final=(await current(page)).game;
      row.turns.push({turn,cell,season:pending.season,die:pending.die,choice,options,layout,nudgeText,eventTitle:pending.active.title,
        choiceVisibleText:choiceText,choiceTextCharacters:choiceText.replace(/\s/g,'').length,feedbackVisibleText:feedbackText,feedbackTextCharacters:feedbackText.replace(/\s/g,'').length,
        timing:{start,choiceVisible,clicked,feedbackVisible,advancing,advanced,travelMilliseconds:choiceVisible-start,autoChoiceDecisionMilliseconds:clicked-choiceVisible,choiceRenderMilliseconds:feedbackVisible-clicked,autoFeedbackReadMilliseconds:advancing-feedbackVisible,advanceMilliseconds:advanced-advancing},
        before:resources(before),beforeChoice:resources(pending),after:resources(after),ended:after.ended,history:after.history.at(-1),life:after.life,practiceInvitation:settled.record.practiceInvitation});
      console.log(`TWENTY game=${fixture.game} strategy=${fixture.strategy} turn=${turn} die=${pending.die} cell=${cell} mood=${after.mood} fatigue=${after.life?.strain?.fatigue} money=${after.money}${after.ended?` END=${after.ended}`:''}`);await saveReport();
      if(!after.ended)continue;
      row.completed=true;row.ending=after.ended;row.endingCell=cell;row.final=final;row.endingReachedMilliseconds=advanced-row.startPerformance;row.durationMilliseconds=advanced-row.startPerformance;
      row.minimumMood=Math.min(row.initial.mood,...row.turns.flatMap(t=>[t.before.mood,t.after.mood]));row.minimumMoney=Math.min(row.initial.money,...row.turns.flatMap(t=>[t.before.money,t.after.money]));row.maximumFatigue=Math.max(...row.turns.map(t=>t.after.fatigue||0));
      report.phase=`game-${fixture.game}-memories`;await page.locator('#dialog.memory-dialog[open]').waitFor();await page.waitForTimeout(650);row.endingVisibleText=await page.locator('#dialog-content').innerText();await shot('ending');
      if(await page.locator('[data-memory-practice]').count()){row.practiceEntries.push({turn,cell,kind:'ending',metadata:(await current(page)).record.practiceInvitation});if(fixture.practice==='offline-two-rounds'&&!row.practiceDone)await practice('[data-memory-practice]','ending');}
      const album=getMemoryAlbum(final),lifeReport=getLifeReport(final);row.title=album.title;row.titleReason=album.titleReason;row.titleId=lifeReport.titleId;row.titleEvidence=lifeReport.titleEvidence;row.renderedTitle=await page.locator('.memory-title-stamp').innerText();if(row.renderedTitle!==album.title)await issue('memory-title-mismatch',{rendered:row.renderedTitle,expected:album.title});row.memoryPages=[];
      for(let i=0;i<album.pages.length;i++){
        await click(`[data-memory-go="${i}"]`);await page.waitForTimeout(350);const text=await page.locator('.memory-album').innerText();const moment=album.pages[i].moment;
        const grounded=!moment||final.history.some(h=>h.number===moment.number||h.cell===moment.number||h.eventNumber===moment.number||h.title===moment.title);if(!grounded)await issue('memory-not-in-actual-history',{page:i,moment});
        const imgs=await page.locator('.memory-photo img').evaluateAll(async nodes=>Promise.all(nodes.map(async img=>{try{await img.decode();return{src:img.getAttribute('src'),loaded:img.naturalWidth>0};}catch{return{src:img.getAttribute('src'),loaded:false};}})));
        row.memoryPages.push({i,kind:album.pages[i].kind,text,imgs,grounded});if(imgs.some(img=>!img.loaded))await issue('memory-photo-failed',{page:i});if(i===0||album.pages[i].kind==='choice'||i===album.pages.length-1)await shot(`memory-${i}-${album.pages[i].kind}`);
      }
      report.phase=`game-${fixture.game}-share`;await click('#share-card');await page.locator('.share-preview').waitFor();await page.locator('.share-preview').evaluate(img=>img.decode());await page.waitForTimeout(350);
      const share={image:await page.locator('.share-preview').evaluate(img=>({width:img.naturalWidth,height:img.naturalHeight})),initialMode:await page.locator('.share-view').getAttribute('data-zoom'),actions:[]};row.share=share;
      for(const selector of ['.share-actions a[download]','#back-to-report','[data-share-zoom]']){const g=await geometry(page.locator(selector));share.actions.push({selector,...g});if(!g.visible||!g.hit)await issue('share-action-occluded',{selector,geometry:g});}
      if(share.image.width!==1000||share.image.height!==2250)await issue('unexpected-share-bitmap',{image:share.image});
      share.detail=await page.locator('.share-preview').boundingBox();await shot('share-detail');
      const viewport=page.locator('.share-viewport'),box=await viewport.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.wheel(0,1000);await page.waitForTimeout(250);share.scrollTop=await viewport.evaluate(n=>n.scrollTop);if(share.scrollTop<=0)await issue('share-detail-not-scrollable');
      await click('[data-share-zoom]');share.fitMode=await page.locator('.share-view').getAttribute('data-zoom');share.fit=await page.locator('.share-preview').boundingBox();await shot('share-fit');
      await click('[data-share-image]');share.zoomBack=await page.locator('.share-view').getAttribute('data-zoom');if(share.initialMode!=='detail'||share.fitMode!=='fit'||share.zoomBack!=='detail'||share.detail.width<=share.fit.width)await issue('share-zoom-not-working',{share});
      const downloadPromise=page.waitForEvent('download');await click('.share-actions a[download]');const download=await downloadPromise;const filename=`game-${String(fixture.game).padStart(2,'0')}-share.png`;await download.saveAs(fileURLToPath(new URL(filename,out)));const png=await fs.readFile(new URL(filename,out));share.download={filename,suggestedFilename:download.suggestedFilename(),bytes:png.length,width:png.readUInt32BE(16),height:png.readUInt32BE(20)};
      await click('#back-to-report');await page.locator('.memory-album').waitFor();share.returnedToAlbum=true;
      row.trace=await page.evaluate(()=>window.__twentyGames);row.stagesMilliseconds={};for(let i=0;i<row.trace.stageChanges.length;i++){const item=row.trace.stageChanges[i],next=row.trace.stageChanges[i+1]?.at??advanced,from=Math.max(item.at,row.startPerformance),to=Math.min(next,advanced);if(to>from)row.stagesMilliseconds[item.stage]=(row.stagesMilliseconds[item.stage]||0)+to-from;}
      row.cinematics={videos:row.trace.videos.length,ended:row.trace.videos.filter(v=>v.ended).length,errors:row.trace.videos.flatMap(v=>v.events.filter(e=>e.event==='error').map(e=>({src:v.src,...e}))),fallbackTransitions:row.trace.mediaChanges.filter(m=>/cine-.*-(?:placeholder|fallback|storyboard)/.test(m.media))};
      for(const v of row.trace.videos)if(!v.ended)await issue('film-did-not-reach-native-ended',{src:v.src,events:v.events});
      if(row.trace.diceEntropy.length!==turn)await issue('dice-entropy-count-mismatch',{entropy:row.trace.diceEntropy.length,turn});
      if(row.trace.visibility.some(e=>e.hidden))await issue('background-visibility-pause-observed');
      if(row.errors.length)await issue('page-errors',{errors:row.errors});if(row.glErrors.length)await issue('webgl-console-errors',{errors:row.glErrors});if(row.resourceFailures.length)await issue('resource-load-failures',{failures:row.resourceFailures});
      const endGL=await page.locator('#scene canvas').evaluate(canvas=>{const gl=canvas.getContext('webgl2');return{lost:gl.isContextLost(),error:gl.getError()};});row.finalWebgl=endGL;if(endGL.lost||endGL.error)await issue('final-webgl-failure',endGL);
      row.finishedAt=new Date().toISOString();row.passed=row.issues.length===0;await saveReport();console.log(`TWENTY GAME COMPLETE ${JSON.stringify({game:fixture.game,completed:true,passed:row.passed,turns:row.turns.length,ending:row.ending,cell,title:row.title,videos:row.cinematics,issues:row.issues.length})}`);return;
    }
    throw Error('Forty valid dice throws did not reach a terminal UI');
  }catch(error){
    row.failure={phase:report.phase,message:error.message,stack:error.stack};
    if(page){try{row.failureUI=await page.evaluate(()=>({stage:document.querySelector('.experience')?.dataset.stage,scene:{...document.querySelector('#scene')?.dataset},text:document.body.innerText.slice(-7000),trace:window.__twentyGames}));row.trace=row.failureUI.trace;await page.screenshot({path:fileURLToPath(new URL(`game-${String(fixture.game).padStart(2,'0')}-failure.png`,out)),timeout:20000});}catch(captureError){row.captureError=captureError.message;}}
    console.error(`TWENTY GAME FAILURE ${fixture.game}: ${row.failure.phase}: ${error.message}`);await saveReport();
  }finally{await context.close();}
}
try{
  const base=await startServer();browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--use-gl=angle','--use-angle=d3d11','--ignore-gpu-blocklist']});
  for(const fixture of selected)await playGame(base,fixture);
  report.phase='complete';report.passed=report.games.length===selected.length&&report.games.every(g=>g.passed);report.completed=report.games.filter(g=>g.completed).length;
}catch(error){report.failure={phase:report.phase,message:error.message,stack:error.stack};console.error(error);}
finally{report.finishedAt=new Date().toISOString();await saveReport();try{await browser?.close();}finally{if(server&&server.exitCode===null&&server.signalCode===null)await new Promise(resolve=>{const timeout=setTimeout(resolve,3000);server.once('exit',()=>{clearTimeout(timeout);resolve();});server.kill();});}}
console.log('TWENTY SHARD SUMMARY '+JSON.stringify({stamp,passed:report.passed,completed:report.completed,games:report.games.map(g=>({game:g.game,completed:g.completed,passed:g.passed,turns:g.turns.length,ending:g.ending,issues:g.issues.length,failure:g.failure?.message}))}));
if(report.failure||report.games.some(g=>g.failure))process.exitCode=1;
