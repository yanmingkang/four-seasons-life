// Ten fresh real-UI games. No seeded save, no speed-up, no hidden-score choice.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {createServer} from 'node:net';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
import {restore} from '../src/engine.js';
import {EVENTS} from '../src/events.js';
import {JOURNEY_STORAGE_KEY} from '../src/journey-storage.js';
import {getMemoryAlbum} from '../src/memory-album.js';

const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'C:/Users/25293/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=fileURLToPath(new URL('../',import.meta.url));
const fifteen=process.env.PLAYTEST_SUITE==='fifteen',gameCount=fifteen?15:10;
const out=new URL(fifteen?'../test-results/fifteen-games/':'../test-results/ten-games/',import.meta.url);
// Frozen before any game runs, from the three visible labels only. These are
// subjective intent choices, not an assertion about the best or safest answer.
const career=[1,1,2,2,1,0,1,2,0,0,0,1,0,2,0,0,0,1,1,0,1,0,1,1,0,1,0,2,1,1,0,1,1,0,0,1,0,2,2,2];
const boundary=[2,0,0,1,2,1,0,1,2,1,2,0,1,0,1,2,1,0,2,1,0,0,2,0,2,2,1,0,2,2,1,0,1,1,0,2,1,1,0,1];
if(fifteen)boundary[17]=2; // Visible wording: share caregiving shifts rather than stay up all night.
const fixtures=Array.from({length:gameCount},(_,i)=>{const paired=fifteen&&i>=12?i-6:i;return {game:i+1,seed:((fifteen?20260912:20260911)+paired*2654435761)>>>0,
  choiceSeed:(3141592653+paired*1013904223)>>>0,talent:['defense','ambitious','optimistic'][i%3],
  strategy:fifteen?(i<6?'random':i<9||i>=12?'career':'boundary'):(i<6?'random':i<8?'career':'boundary'),
  support:fifteen&&i>=12,viewport:fifteen&&i%3===2?[844,390]:[1280,800]};});
const selectedNumbers=(process.env.TEN_GAMES||fixtures.map(f=>f.game).join(',')).split(',').map(Number);
const selected=fixtures.filter(row=>selectedNumbers.includes(row.game));
const concurrency=Math.min(2,Math.max(1,Number(process.env.TEN_GAMES_CONCURRENCY)||1));
const graphics=fifteen||process.env.TEN_GAMES_GRAPHICS==='native'?'native':'swiftshader';
const report={passed:false,startedAt:new Date().toISOString(),phase:'server-start',games:[],
  method:{newGameUI:true,seededSave:false,normalMotion:true,mandatoryAnimationsSkipped:false,
    reducedMotion:false,clockAcceleration:false,viewport:[1280,800],music:false,autoDepart:false,concurrency,graphics,
    realModelCalls:0,realCLICalls:0,externalTrafficBlocked:true,manualItemsUsed:fifteen?'games 13–15: visible nudge, at most one usable coffee/earplugs each turn':false,manualCompanionActions:fifteen?'games 13–15: visible mood <= 40, choose listen when enabled':false,
    legacy:false,thinkWaitAddedMs:0,optionalPracticeAndSourcesAndSceneInspection:false,
    timing:'Click new game to visible real ending. Automatic choices without human reading; not a measured human playtime.',
    randomness:'Mulberry32 seeded Uint32 only for single-element crypto.getRandomValues; fair production six-face conversion unchanged.',
    disabledChoice:'If the preferred choice is disabled, random reselects uniformly among enabled; semantic picks next available index. This uses only visible availability.',
    automaticPassiveProtections:'All production automatic item/passive protections stay enabled and are logged.',fixtures,
    semanticMap:EVENTS.map((e,i)=>({cell:i+1,title:e.title,career:{index:career[i],label:e.options[career[i]].label},boundary:{index:boundary[i],label:e.options[boundary[i]].label}}))}};
let server,browser,serverError,serverLog='';
const activePages=new Map();
await fs.mkdir(out,{recursive:true});
const stamp=selected.map(f=>f.game).join('-');
const reportURL=new URL(selected.length===gameCount?'report.json':`report-${stamp}.json`,out);
let reportWrite=Promise.resolve();
const saveReport=()=>{const text=JSON.stringify(report,null,2);reportWrite=reportWrite.then(()=>fs.writeFile(reportURL,text));return reportWrite;};
function rng(seed){let t=seed>>>0;return()=>{t=(t+0x6D2B79F5)>>>0;let x=t;x=Math.imul(x^(x>>>15),x|1);x^=x+Math.imul(x^(x>>>7),x|61);return((x^(x>>>14))>>>0)/4294967296;};}
async function startServer(){
  const path=new URL('../dist/index.html',import.meta.url),html=await fs.readFile(path,'utf8'),stat=await fs.stat(path);
  report.build={indexModifiedAt:stat.mtime.toISOString(),indexSha256:createHash('sha256').update(html).digest('hex')};
  const probe=createServer();await new Promise((res,rej)=>{probe.once('error',rej);probe.listen(0,'127.0.0.1',res);});
  const port=probe.address().port;await new Promise(res=>probe.close(res));
  const cli=fileURLToPath(new URL('disabled-cli.exe',out));await assert.rejects(fs.access(cli),{code:'ENOENT'});
  server=spawn(process.execPath,['server.mjs','--production'],{cwd:root,windowsHide:true,
    env:{...process.env,PORT:String(port),ZHIHU_CLI_PATH:cli},stdio:['ignore','pipe','pipe']});
  server.on('error',error=>{serverError=error;});
  for(const stream of [server.stdout,server.stderr])stream.on('data',data=>{serverLog=(serverLog+data).slice(-10000);});
  const base=`http://127.0.0.1:${port}`;
  for(let i=0;i<100;i++){if(serverError)throw serverError;if(server.exitCode!==null)throw Error(`Server stopped: ${serverLog}`);
    try{if((await fetch(base,{signal:AbortSignal.timeout(1000)})).ok)return base;}catch{}await delay(100);}
  throw Error(`Server unavailable: ${serverLog}`);
}
async function state(page){const record=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),JOURNEY_STORAGE_KEY);const game=restore(record?.game);assert.ok(game,'Every UI save must replay via current production engine');return{record,game};}
async function now(page){return page.evaluate(()=>performance.now());}
function pickChoice(fixture,cell,choices,random){
  const enabled=choices.filter(row=>!row.disabled);assert.ok(enabled.length,'At least one option must remain enabled');
  if(fixture.strategy==='random')return enabled[Math.floor(random()*enabled.length)].index;
  const preferred=(fixture.strategy==='career'?career:boundary)[cell-1];
  return choices.find(row=>row.index===preferred&&!row.disabled)?.index??enabled.find(row=>row.index>preferred)?.index??enabled[0].index;
}
async function playGame(base,fixture){
  const context=await browser.newContext({viewport:{width:fixture.viewport[0],height:fixture.viewport[1]},reducedMotion:'no-preference',serviceWorkers:'block'});
  const row={...fixture,passed:false,concurrency,graphics,turns:[],supportActions:[],inspectionMilliseconds:0,errors:[],issues:[],apiIntercepted:[],externalBlocked:[]};report.games.push(row);
  await context.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin!==base&&!['data:','blob:'].includes(url.protocol)){row.externalBlocked.push(url.href);return route.abort();}return route.continue();});
  await context.route('**/api/**',route=>{row.apiIntercepted.push({url:new URL(route.request().url()).pathname,at:Date.now()});return fifteen?route.fulfill({status:503,json:{error:'Isolated playtest; real model requests disabled'}}):route.fulfill({json:{mode:'fallback',text:'自动试玩使用本地备用回顾，没有调用真实模型。',available:false,items:[]}});});
  await context.routeWebSocket('**/*',socket=>{row.externalBlocked.push(socket.url());socket.close();});
  await context.addInitScript(({key,seed})=>{
    localStorage.setItem('four-seasons-auto-depart','off');localStorage.setItem('four-seasons-music','off');
    const qa=window.__tenGames={stageChanges:[],worldStages:[],mediaChanges:[],diceEntropy:[],writes:[],visibility:[]};
    document.addEventListener('visibilitychange',()=>qa.visibility.push({at:performance.now(),hidden:document.hidden}));
    let t=seed>>>0;const original=crypto.getRandomValues.bind(crypto);
    crypto.getRandomValues=array=>{if(array instanceof Uint32Array&&array.length===1){t=(t+0x6D2B79F5)>>>0;let x=t;x=Math.imul(x^(x>>>15),x|1);x^=x+Math.imul(x^(x>>>7),x|61);array[0]=(x^(x>>>14))>>>0;qa.diceEntropy.push({at:performance.now(),value:array[0]});return array;}return original(array);};
    const originalSet=Storage.prototype.setItem;
    Storage.prototype.setItem=function(name,value){if(this===localStorage&&name===key){try{qa.writes.push({at:performance.now(),record:JSON.parse(value)});}catch{}}return originalSet.call(this,name,value);};
    document.addEventListener('worldstage',event=>{if(event.target.id==='scene')qa.worldStages.push({...event.detail,at:performance.now()});},true);
    let lastStage,lastMedia;
    new MutationObserver(()=>{
      const stage=document.querySelector('.experience')?.dataset.stage;
      if(stage&&stage!==lastStage){qa.stageChanges.push({stage,at:performance.now()});lastStage=stage;}
      const chapter=document.querySelector('.season-chapter'),cine=document.querySelector('.cinematic');
      const media=chapter?`season-${chapter.dataset.season}`:cine?`cine-${cine.dataset.cinematic}-${cine.dataset.mode}`:'none';
      if(media!==lastMedia){qa.mediaChanges.push({media,at:performance.now()});lastMedia=media;}
    }).observe(document,{subtree:true,childList:true,attributes:true,attributeFilter:['data-stage','data-mode']});
  },{key:JOURNEY_STORAGE_KEY,seed:fixture.seed});
  const page=await context.newPage();activePages.set(row,page);page.setDefaultTimeout(120000);page.on('pageerror',error=>row.errors.push(error.message));
  const loadStart=Date.now();report.phase=`game-${fixture.game}-load`;await saveReport();
  await page.goto(base);await page.locator('#scene[data-assets="ready"][data-renderer="webgl"]').waitFor();
  row.loadMilliseconds=Date.now()-loadStart;
  row.webgl=await page.locator('#scene canvas').evaluate(canvas=>{const gl=canvas.getContext('webgl2'),debug=gl.getExtension('WEBGL_debug_renderer_info');return{webgl2:gl instanceof WebGL2RenderingContext,contextLost:gl.isContextLost(),error:gl.getError(),renderer:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER)};});
  assert.equal(row.webgl.webgl2,true);assert.equal(row.webgl.contextLost,false);assert.equal(row.webgl.error,0);
  assert.equal(await page.evaluate(()=>document.hidden),false,'Game must remain visible for real-time animation');
  assert.equal(await page.evaluate(key=>localStorage.getItem(key),JOURNEY_STORAGE_KEY),null);
  assert.equal(await page.locator('#resume').count(),0);assert.equal(await page.locator('#inherit-next').count(),0);
  await page.locator('#character-name').fill(`试玩${fixture.game}`);await page.locator(`input[name="talent"][value="${fixture.talent}"]`).check();
  row.startedAt=new Date().toISOString();row.startPerformance=await now(page);await page.locator('#start-full').click();
  // Season cards, arrival effects and every mandatory cinematic expire naturally.
  await page.locator('.experience[data-stage="ready"]').waitFor();row.initialChapterMilliseconds=(await now(page))-row.startPerformance;
  row.initial=(await state(page)).game;assert.equal(row.initial.position,-1);assert.equal(row.initial.turn,0);
  const random=rng(fixture.choiceSeed);
  async function inspect(label){
    const start=await now(page);await page.screenshot({path:fileURLToPath(new URL(`game-${fixture.game}-${label}.png`,out))});
    const layout=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,stage:document.querySelector('.experience').dataset.stage,choiceRects:[...document.querySelectorAll('[data-choice]')].map(b=>({disabled:b.disabled,rect:b.getBoundingClientRect().toJSON(),hit:document.elementFromPoint(b.getBoundingClientRect().x+b.offsetWidth/2,b.getBoundingClientRect().y+b.offsetHeight/2)?.closest('[data-choice]')===b}))}));
    if(layout.scrollWidth>layout.width)row.issues.push({label,type:'horizontal-overflow',layout});
    if(layout.choiceRects.some(b=>!b.disabled&&!b.hit))row.issues.push({label,type:'choice-occluded-or-offscreen',layout});
    row.inspectionMilliseconds+=(await now(page))-start;
  }
  async function support(){
    const start=await now(page),nudge=page.locator('[data-open-inventory]');
    if(await nudge.count()){
      await nudge.click();await page.locator('#dialog.inventory-dialog[open]').waitFor();
      for(const id of ['coffee','earplugs']){const b=page.locator(`[data-use-item="${id}"]`);if(await b.count()&&await b.isEnabled()){const before=(await state(page)).game;await b.click();const after=(await state(page)).game;row.supportActions.push({turn:after.turn,cell:after.position+1,id,before:{money:before.money,mood:before.mood,fatigue:before.life.strain.fatigue},after:{money:after.money,mood:after.mood,fatigue:after.life.strain.fatigue}});break;}}
      await page.locator('#dialog-close').click();
    }
    if(Number(await page.locator('#mood-value').innerText())<=40&&await page.locator('#companion-button').isVisible()){
      await page.locator('#companion-button').click();const listen=page.locator('[data-companion="listen"]');
      if(await listen.isEnabled()){const before=(await state(page)).game;await listen.click();const after=(await state(page)).game;row.supportActions.push({turn:after.turn,cell:after.position+1,id:'companion-listen',before:{mood:before.mood},after:{mood:after.mood}});}
      await page.locator('#dialog-close').click();
    }
    row.inspectionMilliseconds+=(await now(page))-start;
  }
  for(let turn=1;turn<=40;turn++){
    report.phase=`game-${fixture.game}-turn-${turn}`;
    const before=(await state(page)).game;assert.equal(before.phase,'ready');
    const start=await now(page);await page.locator('#continue-travel').click();
    await page.locator('.experience[data-stage="choice"]').waitFor();const choiceVisible=await now(page);
    assert.equal(await page.evaluate(()=>document.hidden),false,'Concurrent page must not pause in the background');
    const arrived=(await state(page)).game,cell=arrived.position+1,nudgeText=await page.locator('[data-open-inventory]').count()?await page.locator('[data-open-inventory]').innerText():null;
    if(fifteen&&fixture.support)await support();
    if(fifteen&&(turn===1||[6,11,13,15,18,22,27,31].includes(cell)||arrived.mood<25))await inspect(`turn-${turn}-choice`);
    const pending=(await state(page)).game;
    const options=await page.locator('[data-choice]').evaluateAll(nodes=>nodes.map(node=>({index:Number(node.dataset.choice),text:node.innerText,disabled:node.disabled})));
    assert.equal(options.length,3);assert.equal(await page.locator('.choice-effects,.condition-note').count(),0);
    const choiceText=await page.locator('#story-panel').innerText();const choice=pickChoice(fixture,cell,options,random);
    const clicked=await now(page);await page.locator(`[data-choice="${choice}"]`).click();await page.locator('#next-button').waitFor();const feedbackVisible=await now(page);
    const after=(await state(page)).game,feedbackText=await page.locator('#story-panel').innerText();
    assert.equal(after.turn,turn);assert.equal(after.history.at(-1).choice,choice);
    const advancing=await now(page);await page.locator('#next-button').click();
    await page.locator(`.experience[data-stage="${after.ended?'finished':'ready'}"]`).waitFor();const advanced=await now(page);
    const final=(await state(page)).game;
    row.turns.push({turn,cell,season:pending.season,die:pending.die,choice,options,nudgeText,
      eventTitle:pending.active.title,choiceVisibleText:choiceText,choiceTextCharacters:choiceText.replace(/\s/g,'').length,
      feedbackVisibleText:feedbackText,feedbackTextCharacters:feedbackText.replace(/\s/g,'').length,
      timing:{start,choiceVisible,clicked,feedbackVisible,advancing,advanced,travelMilliseconds:choiceVisible-start,
        autoChoiceDecisionMilliseconds:clicked-choiceVisible,choiceRenderMilliseconds:feedbackVisible-clicked,
        autoFeedbackReadMilliseconds:advancing-feedbackVisible,advanceMilliseconds:advanced-advancing},
      before:{money:before.money,mood:before.mood,exp:before.exp,fatigue:before.life?.strain?.fatigue},beforeChoice:{money:pending.money,mood:pending.mood,exp:pending.exp,fatigue:pending.life?.strain?.fatigue},after:{money:after.money,mood:after.mood,exp:after.exp,fatigue:after.life?.strain?.fatigue},
      ended:after.ended,history:after.history.at(-1),life:after.life});
    console.log(`Game ${fixture.game}/${gameCount} ${fixture.strategy}/${fixture.talent}: turn ${turn}, rolled ${pending.die}, cell ${cell}, mood ${after.mood}, fatigue ${after.life?.strain?.fatigue}, money ${after.money}${after.ended?`, END=${after.ended}`:''}`);
    await saveReport();
    if(after.ended){
      row.endingReachedMilliseconds=advanced-row.startPerformance;
      await page.locator('#dialog.memory-dialog[open],#dialog.report-dialog[open]').waitFor();const end=await now(page);
      row.finishedAt=new Date().toISOString();row.finishPerformance=end;row.durationMilliseconds=end-row.startPerformance;
      row.ending=after.ended;row.endingCell=cell;row.final=final;
      row.minimumMood=Math.min(100,...row.turns.flatMap(item=>[item.before.mood,item.after.mood]));
      row.minimumMoney=Math.min(5000,...row.turns.flatMap(item=>[item.before.money,item.after.money]));
      row.trace=await page.evaluate(()=>window.__tenGames);
      row.stagesMilliseconds={};for(let i=0;i<row.trace.stageChanges.length;i++){
        const entry=row.trace.stageChanges[i],next=row.trace.stageChanges[i+1]?.at??end;
        const from=Math.max(entry.at,row.startPerformance),to=Math.min(next,end);
        if(to>from)row.stagesMilliseconds[entry.stage]=(row.stagesMilliseconds[entry.stage]||0)+(to-from);
      }
      assert.equal(row.trace.diceEntropy.length,turn);assert.equal(final.phase,'finished');
      assert.equal(row.trace.writes.some(write=>write.record.game.extension?.legacy),false);
      assert.equal(row.trace.visibility.some(event=>event.hidden),false,'No page may be background-paused');
      assert.deepEqual(row.errors,[]);assert.deepEqual(row.externalBlocked,[]);
      row.endingVisibleText=await page.locator('#dialog-content').innerText();
      await page.screenshot({path:fileURLToPath(new URL(`game-${String(fixture.game).padStart(2,'0')}-ending.png`,out))});
      if(fifteen){
        const album=getMemoryAlbum(final);row.memoryPages=[];
        for(let i=0;i<album.pages.length;i++){
          await page.locator(`[data-memory-go="${i}"]`).click();const text=await page.locator('.memory-album').innerText();
          const moment=album.pages[i].moment;if(moment)assert.ok(final.history.some(h=>h.number===moment.number||h.cell===moment.number||h.eventNumber===moment.number||h.title===moment.title),'Memory must come from actual history');
          const imgs=await page.locator('.memory-photo img').evaluateAll(async nodes=>Promise.all(nodes.map(async img=>{try{await img.decode();return{src:img.getAttribute('src'),loaded:img.naturalWidth>0};}catch{return{src:img.getAttribute('src'),loaded:false};}})));
          row.memoryPages.push({i,kind:album.pages[i].kind,text,imgs});if(imgs.some(img=>!img.loaded))row.issues.push({type:'memory-photo-failed',page:i});
        }
        if(fixture.game%5===0||after.ended==='mood'){
          await page.locator('#share-card').click();await page.locator('.share-preview').waitFor();await page.locator('.share-preview').evaluate(img=>img.decode());
          row.shareImage=await page.locator('.share-preview').evaluate(img=>({width:img.naturalWidth,height:img.naturalHeight}));
          assert.deepEqual(row.shareImage,{width:1000,height:2250});await inspect('share');
        }
        row.maximumFatigue=Math.max(...row.turns.map(t=>t.after.fatigue||0));
      }
      row.passed=true;await saveReport();await context.close();activePages.delete(row);return;
    }
  }
  throw Error(`Game ${fixture.game} exceeded 40 valid dice throws`);
}
try{
  const base=await startServer();report.server={base,isolated:true,production:true,user4173Untouched:true};
  const args=graphics==='native'?['--enable-webgl','--use-gl=angle','--use-angle=d3d11','--ignore-gpu-blocklist']:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'];
  browser=await chromium.launch({channel:'chrome',headless:true,args});
  let next=0;
  await Promise.all(Array.from({length:concurrency},async()=>{for(;;){const fixture=selected[next++];if(!fixture)return;await playGame(base,fixture);}}));
  report.phase='complete';report.passed=true;
  console.log('PLAYTEST SUMMARY '+JSON.stringify(report.games.map(game=>({game:game.game,strategy:game.strategy,talent:game.talent,seconds:Math.round(game.durationMilliseconds/100)/10,turns:game.turns.length,ending:game.ending,cell:game.endingCell,mood:game.final.mood,minMood:game.minimumMood,money:game.final.money}))));
}catch(error){
  report.failure={phase:report.phase,message:error.message,stack:error.stack};
  for(const [row,page] of activePages){try{row.failureUI=await page.evaluate(()=>({stage:document.querySelector('.experience')?.dataset.stage,scene:{...document.querySelector('#scene')?.dataset},text:document.body.innerText.slice(-3000),qa:window.__tenGames}));await page.screenshot({path:fileURLToPath(new URL(`failure-${stamp}-${row.game}.png`,out))});}catch{}}
  throw error;
}finally{
  report.finishedAt=new Date().toISOString();await saveReport();
  try{await browser?.close();}finally{if(server&&server.exitCode===null&&server.signalCode===null)await new Promise(resolve=>{const timeout=setTimeout(resolve,3000);server.once('exit',()=>{clearTimeout(timeout);resolve();});server.kill();});}
}
