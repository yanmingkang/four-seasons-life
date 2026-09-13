// Single welcome entry and explicit saved-journey choice. Isolated production
// server/browser, replay-valid fixtures and no real API/model/CLI calls.
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
import {completeMemoryFixture} from './memory-fixtures.mjs';

const root=fileURLToPath(new URL('../',import.meta.url)),out=new URL('../test-results/single-entry/',import.meta.url);
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_PATH||'C:/Users/25293/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const report={passed:false,phase:'prepare',startedAt:new Date().toISOString(),cases:[],errors:[],apiIntercepted:[],externalBlocked:[],
  method:{production:true,isolatedServer:true,isolatedStorage:true,user4173Untouched:true,realModelCalls:0,realCLICalls:0,
    fixtures:'Replay-valid ongoing full/demo fixtures, recorded completed game 2, and a completed demo engine fixture. Not additional full playthroughs.',
    cancellation:'Pretty-printed original journey record compared byte for byte before and after entry/cancellation.',
    resume:'Original game snapshot, mode, name, history and top-level practiceInvitation are preserved.',
    newGame:'Only an explicit new-journey click may replace an existing save; all new starts must be full, 40 cells.',reducedMotion:true}};
let server,browser,currentPage,serverError,serverLog='';
await fs.mkdir(out,{recursive:true});
const saveReport=()=>fs.writeFile(new URL('browser-production.json',out),JSON.stringify(report,null,2));
const invitation={version:1,seen:true,resolved:true,kind:'fallback'};
function ongoing(mode){
  let state=newGame(mode,{enriched:true,name:mode==='demo'?'旧体验旅人':'旧完整旅人',talent:'optimistic',lifeSchema:mode==='demo'?2:3});
  for(let turn=0;turn<2;turn++){
    state=land(state,1);const available=state.active.options.map((option,index)=>({index,p:previewChoice(state,option)})).filter(option=>!option.p.disabled);
    state=choose(state,(available.find(option=>option.index===1)||available[0]).index);
    if(turn===0||mode==='full')state=advance(state);
  }
  return snapshot(state);
}
function recordFor(game){assert.ok(restore(game));return {game,seconds:987,practiceInvitation:{...invitation}};}
async function startServer(){
  const index=await fs.readFile(new URL('../dist/index.html',import.meta.url),'utf8'),names=(await fs.readdir(new URL('../dist/assets/',import.meta.url))).filter(name=>/^main-.*\.(?:js|css)$/.test(name));
  report.build={indexSha256:createHash('sha256').update(index).digest('hex'),mainAssets:await Promise.all(names.map(async name=>({path:`/assets/${name}`,sha256:createHash('sha256').update(await fs.readFile(new URL(`../dist/assets/${name}`,import.meta.url))).digest('hex')})))};
  const probe=createServer();await new Promise((resolve,reject)=>{probe.once('error',reject);probe.listen(0,'127.0.0.1',resolve);});const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
  const disabledCli=fileURLToPath(new URL('disabled-cli.exe',out));await assert.rejects(fs.access(disabledCli),{code:'ENOENT'});
  server=spawn(process.execPath,['server.mjs','--production'],{cwd:root,windowsHide:true,env:{...process.env,PORT:String(port),ZHIHU_CLI_PATH:disabledCli},stdio:['ignore','pipe','pipe']});
  server.on('error',error=>{serverError=error;});for(const stream of [server.stdout,server.stderr])stream.on('data',data=>{serverLog=(serverLog+data).slice(-8000);});
  const base=`http://127.0.0.1:${port}`;report.server={base,isolated:true};
  for(let i=0;i<100;i++){if(serverError)throw serverError;if(server.exitCode!==null)throw Error(`Owned server stopped: ${serverLog}`);try{if((await fetch(base,{signal:AbortSignal.timeout(1000)})).ok)return base;}catch{}await delay(100);}
  throw Error(`Owned server unavailable: ${serverLog}`);
}
const rawSave=page=>page.evaluate(key=>localStorage.getItem(key),JOURNEY_STORAGE_KEY);
async function readRecord(page){const record=JSON.parse(await rawSave(page));assert.ok(restore(record?.game),'Stored journey is replay-valid');return record;}
async function capture(page,name){
  await page.evaluate(async()=>{const nodes=[document.querySelector('#story-panel'),document.querySelector('#dialog-content')].filter(Boolean);await Promise.all(nodes.flatMap(node=>node.getAnimations({subtree:true})).filter(animation=>animation.effect?.getTiming().iterations!==Infinity).map(animation=>animation.finished.catch(()=>{})));});
  await page.screenshot({path:fileURLToPath(new URL(`${name}.png`,out))});
}
async function buttonVisible(page,selector,label){
  const locator=page.locator(selector);assert.equal(await locator.count(),1,`${label}: one ${selector}`);
  const data=await locator.evaluate(node=>{const r=node.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {text:node.innerText,rect:r.toJSON(),visible:r.width>0&&r.height>0&&r.left>=0&&r.top>=0&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1,hit:hit===node||node.contains(hit)};});
  if(!data.visible||!data.hit)report.failedButton={selector,label,...data};assert.ok(data.visible,`${label}: button fully visible`);assert.ok(data.hit,`${label}: button unoccluded`);return data;
}
async function welcomeOnly(page,row){
  await page.locator('.experience[data-stage="welcome"]').waitFor();assert.equal(await page.locator('.welcome-actions button').count(),1,'Welcome has exactly one button');
  assert.equal(await page.locator('.welcome-actions #start-full').count(),1);assert.match(await page.locator('#start-full').innerText(),/走进我的四季/);
  // Existing in-game controls and a closed decision dialog may keep these IDs
  // elsewhere in the DOM; none may remain a separate welcome action.
  for(const selector of ['#start-sample','#start-demo','#preview-town','#method-notebook','#resume'])assert.equal(await page.locator(`.welcome-actions ${selector}`).count(),0,`${selector} is not a separate welcome entry`);
  row.welcomeButton=await buttonVisible(page,'#start-full',row.name);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Welcome has no horizontal page overflow');
}
async function setup(base,{name,width,height,record=null}){
  const row={name,width,height,passed:false,oldMode:record?.game.mode||null,geometry:[]};report.cases.push(row);report.phase=`${name}-load`;await saveReport();
  const originalRaw=record?JSON.stringify(record,null,2):null;
  const context=await browser.newContext({viewport:{width,height},reducedMotion:'reduce',serviceWorkers:'block'});
  await context.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin!==base&&!['data:','blob:'].includes(url.protocol)){report.externalBlocked.push(url.href);return route.abort();}return route.continue();});
  await context.route('**/api/**',route=>{report.apiIntercepted.push({name,path:new URL(route.request().url()).pathname});return route.fulfill({status:503,json:{error:'Isolated single-entry acceptance; no real API'}});});
  await context.routeWebSocket('**/*',socket=>{report.externalBlocked.push(socket.url());socket.close();});
  await context.addInitScript(({key,raw})=>{if(raw!==null&&localStorage.getItem(key)===null)localStorage.setItem(key,raw);localStorage.setItem('four-seasons-auto-depart','off');localStorage.setItem('four-seasons-music','off');}, {key:JOURNEY_STORAGE_KEY,raw:originalRaw});
  const page=currentPage=await context.newPage();page.setDefaultTimeout(60000);page.on('pageerror',error=>report.errors.push({name,message:error.message}));await page.goto(base);
  await page.locator('#scene[data-assets="ready"][data-renderer="webgl"]').waitFor();await welcomeOnly(page,row);
  assert.equal(await rawSave(page),originalRaw,'Loading the single-entry welcome preserves the old save bytes');await capture(page,`${name}-welcome`);
  return {page,row,context,record,originalRaw};
}
async function entryDialog(run){
  const {page,row,originalRaw}=run;report.phase=`${row.name}-entry-dialog`;await page.locator('#start-full').click();await page.locator('#dialog.journey-entry-dialog[open]').waitFor();
  assert.equal(await rawSave(page),originalRaw,'Opening the decision dialog must not alter the old save');
  row.entryText=await page.locator('#dialog-content').innerText();assert.match(row.entryText,/替换|覆盖/,'Explicit warning explains replacing the old save');
  row.geometry.push(await buttonVisible(page,'#resume',`${row.name}-resume`),await buttonVisible(page,'#start-new-journey',`${row.name}-new`),await buttonVisible(page,'#dialog-close',`${row.name}-cancel`));
  await capture(page,`${row.name}-confirm`);
}
async function cancelAndVerify(run){
  await entryDialog(run);await run.page.locator('#dialog-close').click();await run.page.locator('#dialog[open]').waitFor({state:'hidden'});
  assert.equal(await rawSave(run.page),run.originalRaw,'Cancel retains every byte of the original record');await welcomeOnly(run.page,run.row);run.row.cancelByteIdentical=true;
}
async function verifyStarted(run,name){
  const {page,row}=run;await page.locator('.experience[data-stage="ready"]').waitFor();const record=await readRecord(page),state=restore(record.game);
  assert.equal(state.mode,'full');assert.equal(state.total,40);assert.equal(state.name,name);assert.equal(state.turn,0);assert.equal(state.history.length,0);assert.equal(state.position,-1);
  assert.deepEqual(record.practiceInvitation,{version:1,seen:false,resolved:false,kind:null});assert.equal(await page.locator('#dialog[open]').count(),0);
  assert.equal(await page.locator('#journal-button').isVisible(),true,'In-game journal remains available');assert.ok(await page.locator('.map-controls button').count()>0,'In-game map controls remain available');
  row.newGame={mode:state.mode,total:state.total,name:state.name,talent:state.talent,turn:state.turn,metadata:record.practiceInvitation};await capture(page,`${row.name}-started`);
}
async function finish(run){run.row.passed=true;await saveReport();await run.context.close();currentPage=null;console.log(`Single entry ${run.row.name}: passed`);}

try{
  const base=await startServer();browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--use-gl=angle','--use-angle=d3d11','--ignore-gpu-blocklist']});
  for(const [width,height]of [[1280,800],[844,390]]){
    const run=await setup(base,{name:`fresh-${width}`,width,height});const name=`新旅人${width}`;await run.page.locator('#character-name').fill(name);report.phase=`fresh-${width}-start`;
    if(width===844){
      const picker=run.page.locator('.talent-picker'),bounds=await picker.boundingBox();
      assert.ok(bounds&&bounds.width>0&&bounds.height>0);await run.page.mouse.move(bounds.x+bounds.width/2,bounds.y+bounds.height/2);await run.page.mouse.wheel(0,800);
      await run.page.waitForFunction(()=>document.querySelector('.talent-picker').scrollTop>0);
      await run.page.locator('input[name="talent"][value="optimistic"]').check();
      run.row.thirdTalent=await picker.evaluate(node=>({scrollTop:node.scrollTop,scrollHeight:node.scrollHeight,clientHeight:node.clientHeight,selected:node.querySelector('input:checked').value}));
      assert.equal(run.row.thirdTalent.selected,'optimistic');run.row.geometry.push(await buttonVisible(run.page,'#start-full','844 after scrolling to third talent'));await capture(run.page,'fresh-844-third-talent');
    }
    await run.page.locator('#start-full').click();assert.equal(await run.page.locator('.journey-entry-dialog[open]').count(),0,'No save starts directly, without a chooser');await verifyStarted(run,name);if(width===844)assert.equal(run.row.newGame.talent,'optimistic');await finish(run);
  }
  const old={full:recordFor(ongoing('full')),demo:recordFor(ongoing('demo'))};
  for(const [mode,width,height]of [['full',1280,800],['demo',844,390]]){
    const run=await setup(base,{name:`resume-${mode}-${width}`,width,height,record:old[mode]});await run.page.locator('#character-name').fill('取消时的新昵称');await cancelAndVerify(run);
    await entryDialog(run);report.phase=`${run.row.name}-resume`;await run.page.locator('#resume').click();const expected=restore(old[mode].game);
    await run.page.locator(`.experience[data-stage="${expected.phase}"]`).waitFor();const after=await readRecord(run.page),actual=restore(after.game);
    assert.deepEqual(after.game,old[mode].game);assert.deepEqual(after.practiceInvitation,old[mode].practiceInvitation);assert.equal(actual.mode,mode);assert.equal(actual.name,expected.name);assert.deepEqual(actual.history,expected.history);
    assert.equal(await run.page.locator('#player-name').innerText(),expected.name);run.row.resumed={mode:actual.mode,name:actual.name,turns:actual.turn,phase:actual.phase,metadata:after.practiceInvitation};await capture(run.page,`${run.row.name}-resumed`);await finish(run);
  }
  for(const [mode,width,height]of [['full',844,390],['demo',1280,800]]){
    const run=await setup(base,{name:`replace-${mode}-${width}`,width,height,record:old[mode]});const name=`新起点${mode==='full'?'四季':'体验'}`;await run.page.locator('#character-name').fill(name);await cancelAndVerify(run);
    await entryDialog(run);report.phase=`${run.row.name}-explicit-new`;await run.page.locator('#start-new-journey').click();await verifyStarted(run,name);assert.notEqual(await rawSave(run.page),run.originalRaw);run.row.explicitReplacement=true;await finish(run);
  }
  const recorded=JSON.parse(await fs.readFile(new URL('../test-results/fifteen-games/report-2-5-8-11-14.json',import.meta.url),'utf8'));const actualEnd=recorded.games.find(game=>game.game===2);assert.equal(actualEnd?.passed,true);
  for(const [mode,width,height,game]of [['full',1280,800,snapshot(actualEnd.final)],['demo',844,390,snapshot(completeMemoryFixture('demo'))]]){
    const record=recordFor(game),run=await setup(base,{name:`finished-${mode}-${width}`,width,height,record});await cancelAndVerify(run);await entryDialog(run);
    report.phase=`${run.row.name}-memories`;await run.page.locator('#resume').click();await run.page.locator('#dialog.memory-dialog[open] .memory-album').waitFor();
    const after=await readRecord(run.page);assert.deepEqual(after.game,record.game);assert.deepEqual(after.practiceInvitation,record.practiceInvitation);const state=restore(after.game),album=getMemoryAlbum(state);
    assert.equal(state.mode,mode);assert.equal(state.phase,'finished');assert.equal(await run.page.locator('.memory-title-stamp').innerText(),album.title);assert.ok((await run.page.locator('.memory-kicker').innerText()).includes(album.mode));
    await run.page.locator('.memory-photo img').evaluateAll(images=>Promise.all(images.map(img=>img.decode())));run.row.resumedEnding={mode:state.mode,name:state.name,turns:state.turn,title:album.title};await capture(run.page,`${run.row.name}-memories`);await finish(run);
  }
  assert.deepEqual(report.errors,[]);assert.deepEqual(report.externalBlocked,[]);report.phase='complete';report.passed=true;
}catch(error){
  report.failure={phase:report.phase,message:error.message,stack:error.stack};if(currentPage){try{await capture(currentPage,'failure');report.failureUI=await currentPage.evaluate(()=>({stage:document.querySelector('.experience')?.dataset.stage,dialogOpen:document.querySelector('#dialog')?.open,text:document.body.innerText.slice(-6000)}));}catch{}}throw error;
}finally{
  report.finishedAt=new Date().toISOString();await saveReport();try{await browser?.close();}finally{if(server&&server.exitCode===null&&server.signalCode===null)await new Promise(resolve=>{const timeout=setTimeout(resolve,3000);server.once('exit',()=>{clearTimeout(timeout);resolve();});server.kill();});}
}
console.log(JSON.stringify({passed:report.passed,cases:report.cases.length,errors:report.errors,realModelCalls:0}));
