// Two isolated, one-choice production regressions, NOT two complete games.
// New rules must be entered by the actual new-game UI (no seeded game storage).
// The old-rule case explicitly restores a legal schema-3 initial save.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {createServer} from 'node:net';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
import {newGame,land,choose,snapshot,restore} from '../src/engine.js';
import {LIFE_SCHEMA} from '../src/life-systems.js';
import {EVENTS} from '../src/events.js';
import {JOURNEY_STORAGE_KEY} from '../src/journey-storage.js';

const root=fileURLToPath(new URL('../',import.meta.url));
const out=fileURLToPath(new URL('../test-results/negative-mood/',import.meta.url));
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'C:/Users/25293/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const report={passed:false,startedAt:new Date().toISOString(),phase:'prepare',cases:[],errors:[],method:{
  production:true,isolatedServer:true,user4173Untouched:true,allApisIntercepted:true,externalTrafficBlocked:true,realApiCalls:0,realCLICalls:0,
  cases:'Two one-choice targeted regressions, not complete playthroughs. New schema uses only the real fresh-start UI. Old schema is a legal initial-state fixture explicitly seeded into another isolated context.',
  randomness:'Only single Uint32 crypto entropy set to the middle of face 4. Production six-face conversion unchanged. This is targeted deterministic coverage, not a random timing sample.',
  animation:'Normal motion, no acceleration or skipping; real dice and four-step walking.',
  graphics:'Windows Chrome native ANGLE D3D11, 1280x800. No real-phone, real-AI or balance-distribution claim.',
}};
let browser,server,currentPage;
await fs.mkdir(out,{recursive:true});const save=()=>fs.writeFile(`${out}/browser-production.json`,JSON.stringify(report,null,2));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
async function startServer(){
  const html=await fs.readFile(`${root}/dist/index.html`,'utf8');
  const names=(await fs.readdir(`${root}/dist/assets`)).filter(name=>/^(?:main|index)-.*\.(?:js|css)$/.test(name));
  report.build={indexSha256:hash(html),assets:await Promise.all(names.map(async name=>({name,sha256:hash(await fs.readFile(`${root}/dist/assets/${name}`))})))};
  const probe=createServer();await new Promise((resolve,reject)=>{probe.once('error',reject);probe.listen(0,'127.0.0.1',resolve);});const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
  const disabledCli=`${out}/disabled-cli.exe`;await assert.rejects(fs.access(disabledCli),{code:'ENOENT'});
  server=spawn(process.execPath,['server.mjs','--production'],{cwd:root,windowsHide:true,env:{...process.env,PORT:String(port),ZHIHU_CLI_PATH:disabledCli},stdio:'ignore'});
  let startupError;server.on('error',error=>{startupError=error;});const base=`http://127.0.0.1:${port}`;report.server={base,isolated:true};
  for(let attempt=0;attempt<100;attempt++){
    if(startupError)throw startupError;if(server.exitCode!==null)throw Error('Isolated server exited');
    try{if((await fetch(base,{signal:AbortSignal.timeout(1000)})).ok)return base;}catch{}
    await delay(100);
  }
  throw Error('Isolated production server unavailable');
}
async function current(page){
  const record=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),JOURNEY_STORAGE_KEY),state=restore(record?.game);
  assert.ok(state,'UI save remains replay-valid');return {record,state};
}
async function capture(page,row,name){
  await page.evaluate(async()=>{await Promise.all(document.getAnimations().filter(animation=>animation.effect?.getTiming().iterations!==Infinity).map(animation=>animation.finished.catch(()=>{})));});
  const path=`${out}/${row.name}-${name}.png`;await page.screenshot({path});row.screenshots.push(path);
}
async function play(base,{name,schema,expectedMood,expectedDelta,oldSave}){
  const row={name,schema,expectedMood,expectedDelta,oldSaveSeeded:!!oldSave,passed:false,apiIntercepted:[],externalBlocked:[],screenshots:[]};report.cases.push(row);report.phase=`${name}-load`;await save();
  const context=await browser.newContext({viewport:{width:1280,height:800},deviceScaleFactor:1,reducedMotion:'no-preference',serviceWorkers:'block'});
  await context.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin!==base&&!['data:','blob:'].includes(url.protocol)){row.externalBlocked.push(url.origin+url.pathname);return route.abort();}return route.continue();});
  await context.route('**/api/**',route=>{row.apiIntercepted.push(new URL(route.request().url()).pathname);return route.fulfill({status:503,json:{error:'Isolated negative-mood regression; real APIs disabled'}});});
  await context.routeWebSocket('**/*',socket=>{row.externalBlocked.push(socket.url());socket.close();});
  await context.addInitScript(({key,oldSave})=>{
    localStorage.setItem('four-seasons-auto-depart','off');localStorage.setItem('four-seasons-music','off');
    if(oldSave&&localStorage.getItem(key)===null)localStorage.setItem(key,JSON.stringify({game:oldSave,seconds:0}));
    const random=crypto.getRandomValues.bind(crypto);crypto.getRandomValues=array=>{if(array instanceof Uint32Array&&array.length===1){array[0]=Math.floor(3.5/6*2**32);return array;}return random(array);};
  },{key:JOURNEY_STORAGE_KEY,oldSave});
  const page=currentPage=await context.newPage();page.setDefaultTimeout(60000);page.on('pageerror',error=>report.errors.push({name,message:error.message}));await page.goto(base);
  await page.locator('#scene[data-assets="ready"][data-renderer="webgl"]').waitFor();
  row.renderer=await page.locator('#scene canvas').evaluate(canvas=>{const gl=canvas.getContext('webgl2'),debug=gl.getExtension('WEBGL_debug_renderer_info');return debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);});
  if(!oldSave){
    assert.equal(await page.evaluate(key=>localStorage.getItem(key),JOURNEY_STORAGE_KEY),null,'New case has no seeded journey');
    await page.locator('#character-name').fill('新规则专项');await page.locator('input[name="talent"][value="defense"]').check();
  }
  await page.locator('#start-full').click();if(oldSave)await page.locator('#resume').click();
  await page.locator('.experience[data-stage="ready"]').waitFor();const initial=await current(page);
  assert.equal(initial.state.life.schema,schema);assert.equal(initial.record.game.extension.schema,schema);
  assert.equal(initial.state.mood,100);assert.equal(initial.state.history.length,0);assert.equal(initial.state.position,-1);assert.deepEqual(initial.state.life.strain,{fatigue:0,streak:0});
  row.initial={snapshot:initial.record.game,mood:initial.state.mood,strain:initial.state.life.strain};
  report.phase=`${name}-roll-and-choice`;await save();await page.locator('#continue-travel').click();await page.locator('.experience[data-stage="choice"]').waitFor();
  const pending=await current(page);assert.equal(pending.state.position,3);assert.equal(pending.state.die,4);assert.equal(pending.state.active.id,'cell-04');
  assert.equal(pending.state.mood,100);assert.deepEqual(pending.state.life.strain,{fatigue:0,streak:0});
  row.options=await page.locator('[data-choice]').evaluateAll(nodes=>nodes.map(node=>({index:Number(node.dataset.choice),text:node.innerText,disabled:node.disabled})));
  assert.deepEqual(row.options.map(option=>option.index),[0,1,2]);assert.ok(row.options.every(option=>!option.disabled));
  assert.equal(await page.locator('.choice-effects,.condition-note').count(),0,'No option outcome figures introduced');
  assert.ok(row.options.every(option=>!/[+−-]\s*\d/.test(option.text)),'No signed resource payoffs in visible choices');
  assert.equal(await page.locator('#mood-value').textContent(),'100');await capture(page,row,'cell-04-choices');
  await page.locator('[data-choice="0"]').click();await page.locator('.experience[data-stage="feedback"]').waitFor();
  const settled=await current(page),history=settled.state.history.at(-1);
  assert.equal(settled.state.life.schema,schema);assert.equal(settled.record.game.extension.schema,schema);assert.equal(settled.state.mood,expectedMood);
  assert.equal(settled.state.turn,1);assert.equal(history.eventId,'cell-04');assert.equal(history.choice,0);assert.equal(history.moodDelta,expectedDelta);assert.equal(history.before.mood,100);assert.equal(history.after.mood,expectedMood);
  assert.deepEqual(settled.state.life.strain,{fatigue:1,streak:1});assert.doesNotMatch(history.talentNote,/累积疲惫：本次额外消耗/,'First turn has no accumulated-fatigue penalty');
  assert.deepEqual(settled.record.game,snapshot(choose(pending.state,0)),'Browser settlement matches the versioned engine');
  assert.equal(await page.locator('#mood-value').textContent(),String(expectedMood));
  const result=page.locator('.result-stats>div').nth(1);await result.scrollIntoViewIfNeeded();
  row.feedbackText=await result.innerText();assert.equal((await result.locator('strong').innerText()).replace('−','-'),String(expectedDelta));assert.match(await result.locator('small').innerText(),new RegExp(`^${expectedMood}\\s*/\\s*100$`));
  row.settled={snapshot:settled.record.game,mood:settled.state.mood,strain:settled.state.life.strain,history};await capture(page,row,'feedback');
  report.phase=`${name}-reload`;await save();await page.reload();await page.locator('#scene[data-assets="ready"]').waitFor();await page.locator('#start-full').click();await page.locator('#resume').click();await page.locator('.experience[data-stage="feedback"]').waitFor();
  const restored=await current(page);assert.deepEqual(restored.record.game,settled.record.game,'Refresh does not rewrite or upgrade this save');assert.deepEqual(restored.state.history,settled.state.history,'Refresh replays identical historical outcome');
  assert.equal(restored.state.life.schema,schema);assert.equal(restored.state.mood,expectedMood);assert.equal(await page.locator('#mood-value').textContent(),String(expectedMood));
  row.reloaded={schema:restored.state.life.schema,mood:restored.state.mood,history:restored.state.history};await capture(page,row,'reloaded-feedback');
  row.passed=true;await save();await context.close();currentPage=null;console.log(`Negative mood ${name}: schema ${schema}, first choice ${expectedDelta}, 100 → ${expectedMood}, reload preserved`);
}
try{
  assert.equal(LIFE_SCHEMA,4,'Run only after source and production build move to schema 4');
  const original=EVENTS[3].options[0];assert.equal(original.label,'补充确认，再发更新纪要');assert.equal(original.mood,-15,'Shared event data stays unchanged for old journals');
  const oldInitial=newGame('full',{enriched:true,lifeSchema:3,talent:'defense',name:'旧规则专项'}),oldResult=choose(land(oldInitial,4),0);
  assert.equal(oldResult.mood,85);assert.equal(oldResult.history[0].moodDelta,-15);assert.equal(restore(snapshot(oldResult)).mood,85);
  report.baseline={cell:4,choice:0,label:original.label,originalMood:original.mood,verifiedOldSchema:3,verifiedOldFinalMood:oldResult.mood};
  const base=await startServer();browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--use-gl=angle','--use-angle=d3d11','--ignore-gpu-blocklist']});
  await play(base,{name:'new-ui-schema-4',schema:4,expectedMood:80,expectedDelta:-20});
  await play(base,{name:'old-save-schema-3',schema:3,expectedMood:85,expectedDelta:-15,oldSave:snapshot(oldInitial)});
  assert.deepEqual(report.errors,[]);report.passed=true;report.phase='complete';
}catch(error){
  report.errors.push({phase:report.phase,message:error.message,stack:error.stack});if(currentPage)await currentPage.screenshot({path:`${out}/failure.png`}).catch(()=>{});process.exitCode=1;
}finally{
  report.finishedAt=new Date().toISOString();await save();await browser?.close();server?.kill();
  console.log(JSON.stringify({passed:report.passed,cases:report.cases.map(row=>({name:row.name,passed:row.passed})),errors:report.errors,report:`${out}/browser-production.json`}));
}
