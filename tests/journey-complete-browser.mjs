// Real new-game UI playthrough against an isolated production server.
// Only browser dice entropy is fixed. No game snapshot is seeded and no real
// model, CLI, external HTTP, or external WebSocket traffic is permitted.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {createServer} from 'node:net';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
import {restore} from '../src/engine.js';
import {JOURNEY_STORAGE_KEY} from '../src/journey-storage.js';
import {LIFE_CHAPTERS} from '../src/season-chapters.js';
import {REVIEW_CELLS} from '../src/life-report-view.js';

const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'C:/Users/25293/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=fileURLToPath(new URL('../',import.meta.url));
const out=new URL('../test-results/full-playthrough/',import.meta.url);
const cells=[6,12,18,24,30,36,40],choices=[1,1,0,1,2,0,0];
const screenshotMode=process.env.FULL_PLAYTHROUGH_SCREENSHOTS==='key'?'key':'all';
const keyShots=new Set(['first-3d-dice-throw','first-3d-walk','scene-18','resumed-cell-18','complete-summary','ten-decision-review','share-preview','finished-journey','failure']);
const errors=[],outsideRequests=[],apiRequests=[],documents=[];
const report={passed:false,phase:'server-start',startedAt:new Date().toISOString(),
  fixture:{newGameViaUI:true,seededGame:false,dice:6,choices,landingCells:cells,
    randomness:'Browser crypto.getRandomValues fixture for one-element Uint32Array only; production random unchanged',
    animation:'First throw and walk use ordinary motion; later turns use reduced motion'},
  screenshotMode,realModelCalls:0,realCLICalls:0,turns:[],chapters:[],checkpoints:[]};
let server,browser,page,serverError,serverLog='',previousState;
await fs.mkdir(out,{recursive:true});

async function startServer(){
  const indexURL=new URL('../dist/index.html',import.meta.url);
  const [indexHTML,indexStat]=await Promise.all([fs.readFile(indexURL,'utf8'),fs.stat(indexURL)]);
  report.build={indexModifiedAt:indexStat.mtime.toISOString(),indexSha256:createHash('sha256').update(indexHTML).digest('hex'),
    scripts:[...indexHTML.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map(match=>match[1])};
  const probe=createServer();
  await new Promise((resolve,reject)=>{probe.once('error',reject);probe.listen(0,'127.0.0.1',resolve);});
  const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
  const disabledCLI=fileURLToPath(new URL('../test-results/full-playthrough/disabled-cli.exe',import.meta.url));
  await assert.rejects(fs.access(disabledCLI),{code:'ENOENT'});
  server=spawn(process.execPath,['server.mjs','--production'],{cwd:root,windowsHide:true,
    env:{...process.env,PORT:String(port),ZHIHU_CLI_PATH:disabledCLI},stdio:['ignore','pipe','pipe']});
  server.on('error',error=>{serverError=error;});
  for(const stream of [server.stdout,server.stderr])stream.on('data',data=>{serverLog=(serverLog+data).slice(-12000);});
  const base=`http://127.0.0.1:${port}`;
  for(let n=0;n<100;n++){
    if(serverError)throw serverError;
    if(server.exitCode!==null)throw Error(`Isolated server exited: ${serverLog}`);
    try{if((await fetch(base,{signal:AbortSignal.timeout(1000)})).ok)return base;}catch{}
    await delay(100);
  }
  throw Error(`Isolated production server did not start: ${serverLog}`);
}

async function shot(name){if(screenshotMode==='key'&&!keyShots.has(name))return;await page.screenshot({path:fileURLToPath(new URL(`${name}.png`,out))});}
async function saved(){
  const record=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),JOURNEY_STORAGE_KEY);
  assert.ok(record?.game,'A real UI journey must have a save');
  const state=restore(record.game);assert.ok(state,'Save must replay through the production engine');
  return {record,state};
}
async function checkpoint(label){
  const {record,state}=await saved();
  if(previousState){
    assert.ok(state.position>=previousState.position,`${label}: position must not go backwards`);
    assert.ok(state.turn>=previousState.turn,`${label}: turn must not go backwards`);
    assert.deepEqual(state.history.slice(0,previousState.history.length),previousState.history,`${label}: settled history is append-only`);
  }
  previousState=state;
  report.checkpoints.push({label,phase:state.phase,cell:state.position+1,turn:state.turn,money:state.money,mood:state.mood,seconds:record.seconds});
  assert.ok(state.money>=0&&state.mood>0,`${label}: selected fixture must remain viable`);
  return {record,state};
}
async function webgl(){
  await page.locator('#scene[data-assets="ready"][data-renderer="webgl"][data-reference-cells="40"]').waitFor();
  const result=await page.locator('#scene').evaluate(scene=>{
    const canvas=scene.querySelector('canvas'),gl=canvas?.getContext('webgl2');
    return {renderer:scene.dataset.renderer,assets:scene.dataset.assets,referenceCells:Number(scene.dataset.referenceCells),
      canvasCount:scene.querySelectorAll('canvas').length,webgl2:gl instanceof WebGL2RenderingContext,
      contextLost:gl?.isContextLost(),error:gl?.getError(),buffer:[gl?.drawingBufferWidth,gl?.drawingBufferHeight]};
  });
  assert.equal(result.webgl2,true);assert.equal(result.contextLost,false);assert.equal(result.error,0);
  assert.equal(result.canvasCount,1);assert.ok(result.buffer.every(n=>n>0));return result;
}
async function chapter(season){
  const card=page.locator(`.season-chapter[data-season="${season}"]`);await card.waitFor();
  assert.equal(await card.locator('.chapter-title').innerText(),LIFE_CHAPTERS[season].stage);
  assert.equal(await card.getAttribute('data-weather'),LIFE_CHAPTERS[season].weather);
  assert.equal(await page.locator('[data-choice]').count(),0);
  await shot(`season-${season+1}`);
  report.chapters.push({season,name:LIFE_CHAPTERS[season].name,stage:LIFE_CHAPTERS[season].stage});
  await card.locator('.chapter-continue').click();
}
async function collectDocument(){documents.push(await page.evaluate(()=>window.__journeyQA));}

try{
  const base=await startServer();report.server={base,isolated:true,production:true,cliDisabled:true,playerPort4173Untouched:true};
  browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce',serviceWorkers:'block',acceptDownloads:true});
  await context.route('**/*',route=>{
    const url=new URL(route.request().url());
    if(url.origin!==base&&!['data:','blob:'].includes(url.protocol)){outsideRequests.push(url.href);return route.abort();}
    return route.continue();
  });
  await context.route('**/api/**',route=>{
    apiRequests.push({path:new URL(route.request().url()).pathname,method:route.request().method()});
    return route.fulfill({json:{mode:'fallback',text:'完整试玩的离线预设回顾，不调用真实模型。',available:false,items:[]}});
  });
  await context.routeWebSocket('**/*',socket=>{outsideRequests.push(socket.url());socket.close();});
  await context.addInitScript(key=>{
    localStorage.setItem('four-seasons-auto-depart','off');localStorage.setItem('four-seasons-music','off');
    const qa=window.__journeyQA={worldStages:[],writes:[],diceEntropyCalls:0};
    const originalRandom=crypto.getRandomValues.bind(crypto);
    crypto.getRandomValues=array=>{
      if(array instanceof Uint32Array&&array.length===1){array[0]=0xffffffff;qa.diceEntropyCalls++;return array;}
      return originalRandom(array);
    };
    const originalSet=Storage.prototype.setItem;
    Storage.prototype.setItem=function(name,value){
      if(this===localStorage&&name===key){try{qa.writes.push(JSON.parse(value));}catch{}}
      return originalSet.call(this,name,value);
    };
    document.addEventListener('worldstage',event=>{
      const scene=event.target;if(scene.id!=='scene')return;
      qa.worldStages.push({...event.detail,at:performance.now(),x:scene.dataset.characterX,z:scene.dataset.characterZ});
    },true);
  },JOURNEY_STORAGE_KEY);
  page=await context.newPage();page.setDefaultTimeout(30000);page.on('pageerror',error=>errors.push(error.message));
  report.phase='fresh-welcome';await page.goto(base);report.initialWorld=await webgl();
  assert.equal(await page.evaluate(key=>localStorage.getItem(key),JOURNEY_STORAGE_KEY),null,'No completed or pending fixture may be seeded');
  assert.equal(await page.locator('#resume').count(),0);
  await page.locator('#character-name').fill('四季完整试玩');
  await page.locator('input[name="talent"][value="defense"]').check();await shot('welcome');
  await page.locator('#start-full').click();await chapter(0);await page.locator('.experience[data-stage="ready"]').waitFor();
  const initial=await checkpoint('new-game');assert.equal(initial.state.position,-1);assert.equal(initial.state.turn,0);assert.equal(initial.state.total,40);
  assert.equal(initial.state.enriched,true);

  let currentSeason=0;
  for(let index=0;index<cells.length;index++){
    const cell=cells[index],nextSeason=Math.floor((cell-1)/10);
    report.phase=`turn-${index+1}-travel-to-${cell}`;
    const startEvents=await page.evaluate(()=>window.__journeyQA.worldStages.length);
    if(index===0)await page.emulateMedia({reducedMotion:'no-preference'});
    await page.locator('#continue-travel').click();
    if(index===0){
      // Observe durable emitted events: software WebGL can skip a brief DOM
      // stage between Playwright polls even though the animation did run.
      await page.waitForFunction(()=>window.__journeyQA.worldStages.some(event=>event.stage==='windup'));await shot('first-3d-dice-throw');
      await page.waitForFunction(()=>window.__journeyQA.worldStages.some(event=>event.stage==='walking'));
      await page.waitForTimeout(650);await shot('first-3d-walk');
      // Keep the entire first walk animated; following turns use accessibility motion reduction.
      await page.waitForFunction(()=>window.__journeyQA.worldStages.some(event=>event.stage==='arrived'&&event.position===5));
      await page.emulateMedia({reducedMotion:'reduce'});
      if(await page.locator('.cine-skip').isVisible())await page.locator('.cine-skip').click();
    }
    if(nextSeason>currentSeason){await chapter(nextSeason);currentSeason=nextSeason;}
    await page.locator('.experience[data-stage="choice"]').waitFor();
    const before=await checkpoint(`cell-${cell}-choice`);
    assert.equal(before.state.position+1,cell);assert.equal(before.state.phase,'choice');assert.equal(before.state.die,6);
    assert.equal(await page.locator('[data-choice]').count(),3);
    assert.equal(await page.locator('.choice-effects,.condition-note').count(),0);
    assert.doesNotMatch(await page.locator('.options').innerText(),/[+−-]\s*\d|(?:资金|情绪|专业)\s*[+−-]?\s*\d|\d+\s*元/);
    assert.equal(await page.locator('#scene').getAttribute('data-position'),String(cell-1));
    assert.equal(await page.locator('#scene').getAttribute('data-season'),String(nextSeason));
    assert.equal(await page.locator('#scene').getAttribute('data-weather'),LIFE_CHAPTERS[nextSeason].weather);
    const events=await page.evaluate(start=>window.__journeyQA.worldStages.slice(start),startEvents);
    assert.ok(events.some(event=>event.stage==='settled'&&event.value===6));
    assert.ok(events.some(event=>event.stage==='walking'));
    assert.ok(events.some(event=>event.stage==='arrived'&&event.position===cell-1));
    if(index===0){
      assert.ok(events.some(event=>event.stage==='windup'));assert.ok(events.some(event=>event.stage==='bounce'));
      const positions=new Set(events.filter(event=>event.stage==='walking').map(event=>`${event.x},${event.z}`));
      assert.ok(positions.size>=3,'Animated world character must occupy multiple real route positions');
    }
    await shot(`choice-${String(cell).padStart(2,'0')}`);
    await page.locator('#look-at-scene').click();
    await page.waitForFunction(()=>Number(document.querySelector('#scene-preview')?.dataset.triangles)>100);
    const preview=await page.locator('#scene-preview').evaluate(element=>({...element.dataset}));
    assert.equal(preview.renderer,'webgl');assert.equal(Number(preview.cell),cell);assert.equal(preview.renderStyle,'outlined-pixel-3d');
    await shot(`scene-${String(cell).padStart(2,'0')}`);
    assert.deepEqual((await saved()).record.game,before.record.game,'Looking at the integrated 3D scene must not change the journey');
    await page.locator('#dialog-close').click();assert.equal(await page.locator('canvas').count(),1);

    if(index===2){
      report.phase='refresh-and-resume-cell-18';await collectDocument();
      await page.reload();await webgl();await page.locator('#resume').click();await page.locator('.experience[data-stage="choice"]').waitFor();
      const resumed=await checkpoint('resume-cell-18');
      assert.deepEqual(resumed.record.game,before.record.game,'Reload/resume must restore the same pending choice');
      assert.ok(resumed.record.seconds>=before.record.seconds);assert.equal(await page.locator('[data-choice]').count(),3);
      report.reload={count:1,cell:18,sameSnapshot:true,historyLength:resumed.state.history.length};await shot('resumed-cell-18');
    }
    report.phase=`turn-${index+1}-choose-${choices[index]}`;
    const selected=page.locator(`[data-choice="${choices[index]}"]`);assert.equal(await selected.isEnabled(),true);
    const choiceText=await selected.innerText();await selected.click();await page.locator('#next-button').waitFor();
    const after=await checkpoint(`cell-${cell}-feedback`);
    assert.equal(after.state.turn,index+1);assert.equal(after.state.history.at(-1).choice,choices[index]);
    assert.equal(after.state.phase,'feedback');await shot(`feedback-${String(cell).padStart(2,'0')}`);
    report.turns.push({turn:index+1,cell,season:nextSeason,die:6,choice:choices[index],choiceText,
      money:after.state.money,mood:after.state.mood,exp:after.state.exp,worldStages:events,scene:preview});
    await page.locator('#next-button').click();
    await page.locator(`.experience[data-stage="${index===cells.length-1?'finished':'ready'}"]`).waitFor();
    await checkpoint(`cell-${cell}-advanced`);
    console.log(`Completed ${index+1}/${cells.length} actual UI choices; reached station ${cell}/40.`);
    await fs.writeFile(new URL('report.json',out),JSON.stringify({...report,errors},null,2));
  }

  report.phase='successful-summary';const finished=await checkpoint('finished');
  assert.equal(finished.state.phase,'finished');assert.equal(finished.state.ended,'complete');assert.equal(finished.state.position,39);
  assert.deepEqual(finished.state.history.map(record=>record.tile+1),cells);assert.deepEqual(finished.state.history.map(record=>record.choice),choices);
  assert.deepEqual(report.chapters.map(row=>row.season),[0,1,2,3]);
  await page.locator('[data-memory-details]').click();await page.locator('#dialog.report-dialog[open]').waitFor();
  assert.ok(await page.locator('.ending-reflection.complete').isVisible());assert.ok(await page.locator('.life-report').isVisible());
  assert.equal(await page.locator('.ending-season-chapters article').count(),4);
  assert.match(await page.locator('.report-badge').innerText(),/四季通关.*完整旅程/);
  assert.match(await page.locator('.report-route').innerText(),/40 \/ 40 站.*7 段经历/);
  const review=await page.locator('[data-review-cell]').evaluateAll(elements=>elements.map(element=>({cell:Number(element.dataset.reviewCell),visited:element.classList.contains('visited'),text:element.textContent})));
  assert.deepEqual(review.map(row=>row.cell),REVIEW_CELLS);
  assert.deepEqual(review.filter(row=>row.visited).map(row=>row.cell),REVIEW_CELLS.filter(cell=>cells.includes(cell)));
  for(const row of review.filter(row=>!row.visited))assert.match(row.text,/没有触发事件或记录选择/);
  report.summary={ending:finished.state.ended,history:finished.state.history.length,seasonChapters:4,reviewCells:review.map(({cell,visited})=>({cell,visited})),money:finished.state.money,mood:finished.state.mood,exp:finished.state.exp};
  await shot('complete-summary');await page.locator('.ten-decision-review').scrollIntoViewIfNeeded();await shot('ten-decision-review');
  const notePending=page.waitForEvent('download');await page.locator('#download-note').click();const note=await notePending;
  await note.saveAs(fileURLToPath(new URL('journey-note.txt',out)));const noteText=await fs.readFile(await note.path(),'utf8');
  assert.match(noteText,/结局：四季通关/);assert.match(noteText,/10 大关键选择回溯/);assert.match(noteText,/路线：40 \/ 40 站/);
  report.phase='share-png';await page.locator('#share-card').click();await page.locator('.share-preview').waitFor({timeout:20000});await shot('share-preview');
  const downloadLink=page.locator('a[download]');assert.match(await downloadLink.innerText(),/下载人生长图/);
  const pngPending=page.waitForEvent('download');await downloadLink.click();const png=await pngPending;
  const pngPath=fileURLToPath(new URL('journey-share.png',out));await png.saveAs(pngPath);const bytes=await fs.readFile(pngPath);
  assert.deepEqual([...bytes.subarray(0,8)],[137,80,78,71,13,10,26,10]);
  const dimensions={width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20),bytes:bytes.length};
  assert.equal(dimensions.width,900);assert.ok(dimensions.height>1440&&dimensions.height<10000);assert.ok(dimensions.bytes>10000);
  report.share={...dimensions,path:pngPath};
  await page.locator('#back-to-report').click();await page.locator('#dialog.report-dialog[open]').waitFor();
  assert.equal(await page.locator('[data-review-cell]').count(),10);assert.deepEqual((await saved()).record.game,finished.record.game);
  await page.locator('#dialog-close').click();await page.locator('#view-summary').waitFor();assert.equal(await page.locator('#new-journey').isVisible(),true);
  await shot('finished-journey');report.finalWorld=await webgl();await collectDocument();

  report.phase='save-audit';let previousSave;
  for(const doc of documents)for(const write of doc.writes){
    const state=restore(write.game);assert.ok(state,'Every save written during play must restore');
    if(previousSave){assert.ok(state.position>=previousSave.position);assert.ok(state.turn>=previousSave.turn);assert.deepEqual(state.history.slice(0,previousSave.history.length),previousSave.history);}
    previousSave=state;
  }
  report.saveAudit={documents:documents.length,writes:documents.reduce((sum,doc)=>sum+doc.writes.length,0),appendOnly:true};
  report.diceEntropyCalls=documents.reduce((sum,doc)=>sum+doc.diceEntropyCalls,0);assert.equal(report.diceEntropyCalls,7);
  assert.deepEqual(errors,[],'No uncaught browser errors');assert.deepEqual(outsideRequests,[],'No external requests');
  report.phase='complete';report.passed=true;
  console.log(`PASS real WebGL full journey, 7 actual UI choices, four seasons, refresh/resume, 10-decision review and PNG ${dimensions.width}x${dimensions.height}. Real model calls: 0; test dice fixed to 6.`);
}catch(error){
  report.failure={phase:report.phase,message:error.message,stack:error.stack};
  if(page){try{report.failure.ui=await page.evaluate(()=>({stage:document.querySelector('.experience')?.dataset.stage,scene:{...document.querySelector('#scene')?.dataset},worldStages:window.__journeyQA?.worldStages,dialog:document.querySelector('#dialog')?.textContent?.slice(0,1500)}));await shot('failure');}catch{}}
  throw error;
}finally{
  report.finishedAt=new Date().toISOString();report.errors=errors;report.apiRequestsIntercepted=apiRequests;report.outsideRequestsBlocked=outsideRequests;
  await fs.writeFile(new URL('report.json',out),JSON.stringify(report,null,2));
  try{await browser?.close();}finally{
    if(server&&server.exitCode===null&&server.signalCode===null)await new Promise(resolve=>{const timeout=setTimeout(resolve,3000);server.once('exit',()=>{clearTimeout(timeout);resolve();});server.kill();});
  }
}
