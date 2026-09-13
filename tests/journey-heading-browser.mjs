// Real production UI regression for arrival -> next throw -> departure heading.
// A replay-valid engine save starts at station 7; only the two later rounds are
// played through the browser. Every rendered RAF and every worldstage event is
// sampled, including transient stationary stages between throw and walking.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {createServer} from 'node:net';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
import {newGame,land,choose,advance,previewChoice,snapshot,restore} from '../src/engine.js';
import {JOURNEY_STORAGE_KEY} from '../src/journey-storage.js';

const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'C:/Users/25293/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=fileURLToPath(new URL('../',import.meta.url));
const out=new URL('../test-results/journey-heading/',import.meta.url);
const errors=[],apiRequests=[],outsideRequests=[];
const limits={steadyErrorRadians:.02,movingErrorRadians:Math.PI/4,angularSpeedDegreesPerSecond:270,angularStepToleranceDegrees:1,extraRotationDegrees:45};
const report={passed:false,phase:'server-start',startedAt:new Date().toISOString(),realModelCalls:0,realCLICalls:0,
  fixture:{source:'Replay-valid enriched engine snapshot at station 7; prior stops are seeded, not claimed as UI gameplay',
    dice:[1,2],actualUIStations:[8,10],normalMotion:true,randomness:'Browser-only one-element Uint32Array crypto fixture'},limits,rounds:[]};
let server,browser,page,serverError,serverLog='',trace;
await fs.mkdir(out,{recursive:true});

function safeChoice(state){
  const available=state.active.options.map((option,index)=>({index,result:previewChoice(state,option)}))
    .filter(({result})=>!result.disabled).sort((a,b)=>b.result.mood-a.result.mood||b.result.money-a.result.money);
  assert.ok(available.length);return available[0].index;
}
function readyAt(position){
  let state=newGame('full',{name:'朝向连续性回归',enriched:true});
  while(state.position<position){const pending=land(state,Math.min(6,position-state.position));state=advance(choose(pending,safeChoice(pending)));}
  assert.equal(state.position,position);assert.equal(state.phase,'ready');assert.ok(restore(snapshot(state)));return state;
}
const seed=readyAt(6);report.fixture.seededHistoryLength=seed.history.length;

async function startServer(){
  const indexURL=new URL('../dist/index.html',import.meta.url);
  const [html,stat]=await Promise.all([fs.readFile(indexURL,'utf8'),fs.stat(indexURL)]);
  report.build={indexModifiedAt:stat.mtime.toISOString(),indexSha256:createHash('sha256').update(html).digest('hex'),
    scripts:[...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map(match=>match[1])};
  const probe=createServer();await new Promise((resolve,reject)=>{probe.once('error',reject);probe.listen(0,'127.0.0.1',resolve);});
  const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
  const disabledCLI=fileURLToPath(new URL('../test-results/journey-heading/disabled-cli.exe',import.meta.url));
  await assert.rejects(fs.access(disabledCLI),{code:'ENOENT'});
  server=spawn(process.execPath,['server.mjs','--production'],{cwd:root,windowsHide:true,
    env:{...process.env,PORT:String(port),ZHIHU_CLI_PATH:disabledCLI},stdio:['ignore','pipe','pipe']});
  server.on('error',error=>{serverError=error;});
  for(const stream of [server.stdout,server.stderr])stream.on('data',data=>{serverLog=(serverLog+data).slice(-10000);});
  const base=`http://127.0.0.1:${port}`;
  for(let attempt=0;attempt<100;attempt++){
    if(serverError)throw serverError;if(server.exitCode!==null)throw Error(`Isolated server exited: ${serverLog}`);
    try{if((await fetch(base,{signal:AbortSignal.timeout(1000)})).ok)return base;}catch{}await delay(100);
  }
  throw Error(`Isolated server did not start: ${serverLog}`);
}
const shot=name=>page.screenshot({path:fileURLToPath(new URL(`${name}.png`,out))});
async function readGame(){const saved=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),JOURNEY_STORAGE_KEY);const state=restore(saved?.game);assert.ok(state);return state;}
async function mark(label,round){await page.evaluate(({label,round})=>{const qa=window.__headingQA;qa.label=label;if(round!==undefined)qa.round=round;qa.capture('checkpoint');},{label,round});}
async function pose(){return page.locator('#scene').evaluate(scene=>({x:scene.dataset.characterX,z:scene.dataset.characterZ,
  characterHeading:scene.dataset.characterHeading,routeHeading:scene.dataset.routeHeading,stage:scene.dataset.stage,
  dialogOpen:Boolean(document.querySelector('#dialog[open]'))}));}

try{
  const base=await startServer();report.server={base,isolated:true,production:true,cliDisabled:true,playerPort4173Untouched:true};
  browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'no-preference',serviceWorkers:'block'});
  await context.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin!==base&&!['data:','blob:'].includes(url.protocol)){outsideRequests.push(url.href);return route.abort();}return route.continue();});
  await context.route('**/api/**',route=>{apiRequests.push(new URL(route.request().url()).pathname);return route.fulfill({json:{mode:'fallback',text:'朝向回归离线预设，不调用真实模型。',available:false,items:[]}});});
  await context.routeWebSocket('**/*',socket=>{outsideRequests.push(socket.url());socket.close();});
  await context.addInitScript(({key,game})=>{
    localStorage.setItem('four-seasons-auto-depart','off');localStorage.setItem('four-seasons-music','off');
    localStorage.setItem(key,JSON.stringify({game,seconds:15}));
    const qa=window.__headingQA={armed:false,round:0,label:'loading',samples:[],events:[],dice:[1,2],diceEntropyCalls:0};
    const originalRandom=crypto.getRandomValues.bind(crypto);
    crypto.getRandomValues=array=>{
      if(array instanceof Uint32Array&&array.length===1){
        const die=qa.dice[qa.diceEntropyCalls++];if(!die)throw Error('Unexpected third test dice request');
        array[0]=Math.floor(((die-.5)/6)*4294967296);return array;
      }
      return originalRandom(array);
    };
    qa.capture=(source,detail={})=>{
      if(!qa.armed)return;
      const scene=document.querySelector('#scene');if(!scene)return;
      const characterHeading=Number(detail.characterHeading??scene.dataset.characterHeading);
      const routeHeading=Number(detail.routeHeading??scene.dataset.routeHeading);
      if(!Number.isFinite(characterHeading)||!Number.isFinite(routeHeading))return;
      qa.samples.push({at:performance.now(),frameTime:qa.frameTime??null,source,round:qa.round,label:qa.label,stage:detail.stage??scene.dataset.stage,
        diceStage:scene.dataset.diceStage,experience:document.querySelector('.experience')?.dataset.stage,
        characterHeading,routeHeading,x:Number(scene.dataset.characterX),z:Number(scene.dataset.characterZ),
        dialogOpen:Boolean(document.querySelector('#dialog[open]')),boardDraws:Number(scene.dataset.boardDraws||0)});
    };
    document.addEventListener('worldstage',event=>{
      if(event.target.id!=='scene'||!qa.armed)return;
      qa.events.push({...event.detail,at:performance.now(),round:qa.round,label:qa.label});qa.capture('worldstage',event.detail);
    },true);
    // Heading mutations additionally preserve changes made later in the same
    // RAF, including the small turn-to-align just before the arrived event.
    qa.observer=new MutationObserver(records=>{if(records.some(record=>record.target.id==='scene'))qa.capture('heading-update');});
    qa.observer.observe(document,{subtree:true,attributes:true,attributeFilter:['data-character-heading']});
    const frame=time=>{qa.frameTime=time;qa.capture('frame');qa.raf=requestAnimationFrame(frame);};qa.raf=requestAnimationFrame(frame);
  },{key:JOURNEY_STORAGE_KEY,game:snapshot(seed)});
  page=await context.newPage();page.setDefaultTimeout(30000);page.on('pageerror',error=>errors.push(error.message));
  report.phase='restore-starting-station';await page.goto(base);
  await page.locator('#scene[data-assets="ready"][data-renderer="webgl"]').waitFor();
  await page.locator('#resume').click();await page.locator('.experience[data-stage="ready"]').waitFor();
  await page.waitForFunction(()=>{const scene=document.querySelector('#scene');return Number.isFinite(Number(scene?.dataset.characterHeading))&&Number.isFinite(Number(scene?.dataset.routeHeading));});
  assert.equal((await readGame()).position,6);
  report.webgl=await page.locator('#scene canvas').evaluate(canvas=>{const gl=canvas.getContext('webgl2');return {webgl2:gl instanceof WebGL2RenderingContext,contextLost:gl.isContextLost(),error:gl.getError()};});
  assert.deepEqual(report.webgl,{webgl2:true,contextLost:false,error:0});
  await page.evaluate(()=>{const qa=window.__headingQA;qa.armed=true;qa.label='station-7-ready';qa.capture('checkpoint');});
  await page.waitForTimeout(200);

  for(const [index,die] of [1,2].entries()){
    const round=index+1,target=index===0?7:9;
    report.phase=`round-${round}-throw-and-walk`;await mark(`round-${round}-throw`,round);
    await page.locator('#continue-travel').click();
    await page.waitForFunction(round=>window.__headingQA.events.some(event=>event.round===round&&event.stage==='windup'),round);
    if(round===1)await shot('first-throw');
    await page.waitForFunction(round=>window.__headingQA.events.some(event=>event.round===round&&event.stage==='walking'),round);
    if(round===2){
      report.phase='bend-walk-pause';await page.locator('#rules-button').click();await page.locator('#dialog[open]').waitFor();
      await page.waitForTimeout(150);const paused=await pose();assert.equal(paused.stage,'walking','Pause must interrupt real movement, before arrival');
      assert.equal(paused.dialogOpen,true);await mark('bend-walk-paused',round);await page.waitForTimeout(400);
      assert.deepEqual(await pose(),paused,'Position and heading must stay fixed while the rules dialog pauses walking');await shot('bend-walk-paused');
      report.pause={stage:paused.stage,heldMilliseconds:400,poseUnchanged:true};
      await page.locator('#dialog-close').click();await mark('bend-walk-resumed',round);
    }
    report.phase=`round-${round}-arrival`;
    await page.waitForFunction(({round,target})=>window.__headingQA.events.some(event=>event.round===round&&event.stage==='arrived'&&event.position===target),{round,target});
    await page.locator('.experience[data-stage="choice"]').waitFor();await mark(`round-${round}-arrived`,round);await page.waitForTimeout(180);
    const landed=await readGame();assert.equal(landed.position,target);assert.equal(landed.die,die);assert.equal(await page.locator('[data-choice]').count(),3);
    const choice=safeChoice(landed);await page.locator(`[data-choice="${choice}"]`).click();await page.locator('#next-button').waitFor();
    await mark(`round-${round}-feedback`,round);await page.locator('#next-button').click();await page.locator('.experience[data-stage="ready"]').waitFor();
    await mark(`round-${round}-ready-again`,round);await page.waitForTimeout(180);
    const state=await readGame();assert.equal(state.history.length,seed.history.length+round);assert.equal(state.position,target);
    report.rounds.push({round,die,cell:target+1,choice,historyLength:state.history.length});await shot(`round-${round}-ready`);
    console.log(`Heading round ${round}/2: rolled ${die}, arrived station ${target+1}, selected and returned to ready.`);
  }

  report.phase='analyze-frame-and-transition-samples';
  trace=await page.evaluate(()=>{const qa=window.__headingQA;qa.armed=false;cancelAnimationFrame(qa.raf);qa.observer.disconnect();return {samples:qa.samples,events:qa.events,diceEntropyCalls:qa.diceEntropyCalls};});
  await fs.writeFile(new URL('trace.json',out),JSON.stringify(trace,null,2));
  const wrap=value=>Math.atan2(Math.sin(value),Math.cos(value)),deg=value=>value*180/Math.PI;
  let maxSteadyError=0,maxMovingError=0,maxStationaryStep=0,maxRawStep=0,routeSweep=0;
  const violations=[],byStage={},byRound={};
  for(let index=0;index<trace.samples.length;index++){
    const row=trace.samples[index],error=Math.abs(wrap(row.characterHeading-row.routeHeading));
    const moving=['walking','turning'].includes(row.stage);
    byStage[row.stage]??={samples:0,maxErrorDegrees:0};byStage[row.stage].samples++;
    byStage[row.stage].maxErrorDegrees=Math.max(byStage[row.stage].maxErrorDegrees,deg(error));
    if(moving)maxMovingError=Math.max(maxMovingError,error);else maxSteadyError=Math.max(maxSteadyError,error);
    if(error>(moving?limits.movingErrorRadians:limits.steadyErrorRadians))violations.push({kind:moving?'excessive-moving-lag':'stationary-or-dice-misalignment',index,errorDegrees:deg(error),row});
    if(!index)continue;
    const previous=trace.samples[index-1],delta=Math.abs(row.characterHeading-previous.characterHeading);
    const routeDelta=Math.abs(wrap(row.routeHeading-previous.routeHeading)),distance=Math.hypot(row.x-previous.x,row.z-previous.z);
    maxRawStep=Math.max(maxRawStep,delta);
    if(delta>Math.PI/2)violations.push({kind:'abrupt-yaw-jump',index,deltaDegrees:deg(delta),previous,row});
    if(row.round===2&&previous.round===2)routeSweep+=routeDelta;
    if(distance<.01&&routeDelta<.02)maxStationaryStep=Math.max(maxStationaryStep,delta);
    if(row.round&&row.round===previous.round){
      byRound[row.round]??={characterTravel:0,routeTravel:0};byRound[row.round].characterTravel+=delta;byRound[row.round].routeTravel+=routeDelta;
    }
  }
  // Events in the same RAF may be only microseconds apart. Measure angular
  // speed between the last captured poses of distinct animation-frame times,
  // not between two lifecycle callbacks belonging to one visual frame.
  const grouped=new Map();for(const row of trace.samples)if(Number.isFinite(row.frameTime))grouped.set(row.frameTime,row);
  const timedFrames=[...grouped.values()].sort((a,b)=>a.frameTime-b.frameTime);
  let maxAngularSpeed=0,maxFrameStep=0,maxFrameGap=0;
  for(let index=1;index<timedFrames.length;index++){
    const previous=timedFrames[index-1],row=timedFrames[index],dt=(row.frameTime-previous.frameTime)/1000;
    const step=deg(Math.abs(row.characterHeading-previous.characterHeading));
    maxAngularSpeed=Math.max(maxAngularSpeed,step/dt);maxFrameStep=Math.max(maxFrameStep,step);maxFrameGap=Math.max(maxFrameGap,dt);
    if(step>limits.angularSpeedDegreesPerSecond*dt+limits.angularStepToleranceDegrees)violations.push({kind:'angular-speed-limit',stepDegrees:step,seconds:dt,degreesPerSecond:step/dt,previous,row});
  }
  const travel=Object.entries(byRound).map(([round,value])=>({round:Number(round),characterTravelDegrees:deg(value.characterTravel),routeTravelDegrees:deg(value.routeTravel)}));
  for(const row of travel)if(row.characterTravelDegrees>row.routeTravelDegrees+limits.extraRotationDegrees)violations.push({kind:'unnecessary-rotation',...row});
  const frameSamples=trace.samples.filter(row=>row.source==='frame');
  report.metrics={sampleCount:trace.samples.length,frameCount:frameSamples.length,eventCount:trace.events.length,
    maxSteadyErrorDegrees:deg(maxSteadyError),maxMovingErrorDegrees:deg(maxMovingError),maxStationaryStepDegrees:deg(maxStationaryStep),maxRawStepDegrees:deg(maxRawStep),
    maxAngularSpeedDegreesPerSecond:maxAngularSpeed,maxFrameStepDegrees:maxFrameStep,maxFrameGapSeconds:maxFrameGap,
    secondRoundRouteSweepDegrees:deg(routeSweep),byStage,travel,violations:violations.slice(0,10)};
  assert.ok(frameSamples.length>=12,'Enough actual animation frames must be sampled');
  for(const round of [1,2]){
    const events=trace.events.filter(event=>event.round===round);
    // Bounce visibility has its own dice tests; software WebGL can legitimately
    // advance across that brief phase while preserving this heading sequence.
    for(const stage of ['windup','throw','settled','walking','arrived'])assert.ok(events.some(event=>event.stage===stage),`Round ${round}: missing real ${stage} stage`);
    assert.ok(events.some(event=>event.stage==='idle'&&event.value===[1,2][round-1]),`Round ${round}: missing throw-to-idle transition`);
    const walking=frameSamples.filter(row=>row.round===round&&row.stage==='walking');
    assert.ok(new Set(walking.map(row=>`${row.x},${row.z}`)).size>=3,`Round ${round} must sample multiple real walking positions`);
  }
  assert.ok(routeSweep>Math.PI/3,'The second real walk must cover at least a 60-degree route bend');
  assert.ok(trace.samples.some(row=>row.round===2&&row.routeHeading>2.6)&&trace.samples.some(row=>row.round===2&&row.routeHeading< -2.4),'The route bend must cross the +pi/-pi angle boundary');
  assert.deepEqual(violations,[],'Steady stages align; moving stages remain bounded without abrupt flips or extra rotations');
  assert.equal(trace.diceEntropyCalls,2);assert.deepEqual(errors,[]);assert.deepEqual(outsideRequests,[]);
  report.phase='complete';report.passed=true;console.log(JSON.stringify(report,null,2));
}catch(error){
  report.failure={phase:report.phase,message:error.message,stack:error.stack};
  try{if(page){trace??=await page.evaluate(()=>({samples:window.__headingQA?.samples,events:window.__headingQA?.events}));await fs.writeFile(new URL('trace.json',out),JSON.stringify(trace,null,2));await shot('failure');}}catch{}
  throw error;
}finally{
  report.errors=errors;report.apiRequestsIntercepted=apiRequests;report.outsideRequestsBlocked=outsideRequests;report.finishedAt=new Date().toISOString();
  await fs.writeFile(new URL('report.json',out),JSON.stringify(report,null,2));
  try{await browser?.close();}finally{if(server&&server.exitCode===null&&server.signalCode===null)await new Promise(resolve=>{const timeout=setTimeout(resolve,3000);server.once('exit',()=>{clearTimeout(timeout);resolve();});server.kill();});}
}
