// Targeted regression, not a new full-game playthrough. Two legal prior turns
// are seeded; the real UI rolls six, walks, plays cell 18 and settles a choice.
// All APIs are intercepted and the user's 4173 service is never touched.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {createServer} from 'node:net';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
import {newGame,land,choose,advance,snapshot,restore} from '../src/engine.js';
import {createInvitationProgress} from '../src/practice-invitation.js';
import {JOURNEY_STORAGE_KEY} from '../src/journey-storage.js';
import {DAYLIGHT_STORAGE_KEY} from '../src/world-daylight.js';

const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'C:/Users/25293/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=fileURLToPath(new URL('../',import.meta.url));
const out=fileURLToPath(new URL('../test-results/daylight-card-visibility/',import.meta.url));
const report={passed:false,startedAt:new Date().toISOString(),cases:[],errors:[],phase:'prepare',method:{
  isolatedProduction:true,user4173Untouched:true,allApisIntercepted:true,realApiCalls:0,realCLICalls:0,
  fixture:'Replay-valid cell 6/A and cell 12/A prior choices, then an actual UI six-face roll to cell 18. These are targeted fixtures, not additional complete games.',
  animation:'Normal motion; real dice, six-step walk and complete cell 18 video; no production code injection or clock acceleration.',
  viewport:'Windows Chrome native D3D11, 1280x800 / 844x390 / 667x375; small viewports are not physical phones.',
  beforeEvidence:'test-results/twenty-games/game-14-turn-7-cell-18-choice.png',
}};
let server,browser,currentPage;
await fs.mkdir(out,{recursive:true});
const save=()=>fs.writeFile(`${out}/browser-production.json`,JSON.stringify(report,null,2));

function fixture(){
  let state=newGame('full',{enriched:true,talent:'defense',name:'日照遮挡专项'});
  for(let turn=0;turn<2;turn++)state=advance(choose(land(state,6),0));
  assert.equal(state.position,11);assert.equal(state.turn,2);assert.equal(state.phase,'ready');
  assert.ok(restore(snapshot(state)));return snapshot(state);
}
async function startServer(){
  const html=await fs.readFile(`${root}/dist/index.html`,'utf8');
  const assets=(await fs.readdir(`${root}/dist/assets`)).filter(name=>/^main-.*\.(?:js|css)$/.test(name)).map(name=>`/assets/${name}`);
  report.build={indexSha256:createHash('sha256').update(html).digest('hex'),assets};
  const cssPaths=report.build.assets.filter(path=>path.endsWith('.css'));
  assert.ok(cssPaths.length>0);
  const css=(await Promise.all(cssPaths.map(path=>fs.readFile(`${root}/dist${path}`,'utf8')))).join('\n');
  assert.match(css,/\.experience:is\(\[data-stage=\"?choice\"?\],\[data-stage=\"?feedback\"?\]\)>\.daylight-switch\{display:none\}/,'Build must contain the new card-stage visibility rule');
  const probe=createServer();await new Promise((resolve,reject)=>{probe.once('error',reject);probe.listen(0,'127.0.0.1',resolve);});
  const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
  const disabledCli=`${out}/disabled-cli.exe`;await assert.rejects(fs.access(disabledCli),{code:'ENOENT'});
  server=spawn(process.execPath,['server.mjs','--production'],{cwd:root,windowsHide:true,env:{...process.env,PORT:String(port),ZHIHU_CLI_PATH:disabledCli},stdio:'ignore'});
  let startupError;server.on('error',error=>{startupError=error;});
  const base=`http://127.0.0.1:${port}`;report.server={base,isolated:true};
  for(let i=0;i<100;i++){
    if(startupError)throw startupError;if(server.exitCode!==null)throw Error('Isolated server exited');
    try{if((await fetch(base,{signal:AbortSignal.timeout(1000)})).ok)return base;}catch{}
    await delay(100);
  }
  throw Error('Isolated production server did not become available');
}
async function stage(page,name){await page.locator(`.experience[data-stage="${name}"]`).waitFor();}
async function settleLight(page){await page.locator('#scene[data-daylight-transition="settled"]').waitFor();}
async function readGame(page){
  const record=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),JOURNEY_STORAGE_KEY);
  assert.ok(restore(record?.game),'Game remains replay-valid');return record.game;
}
async function capture(page,row,name){
  await page.evaluate(async()=>{
    const roots=[document.querySelector('#story-panel'),document.querySelector('#dialog-content')].filter(Boolean);
    const animations=roots.flatMap(root=>root.getAnimations({subtree:true})).filter(animation=>animation.effect?.getTiming().iterations!==Infinity);
    await Promise.all(animations.map(animation=>animation.finished.catch(()=>{})));
  });
  const path=`${out}/${row.name}-${name}.png`;await page.screenshot({path});row.screenshots.push(path);return path;
}
async function switchState(page){return page.locator('.daylight-switch').evaluate(node=>({
  display:getComputedStyle(node).display,visibility:getComputedStyle(node).visibility,inert:node.inert,rect:node.getBoundingClientRect().toJSON(),
  selected:[...node.querySelectorAll('button')].filter(button=>button.getAttribute('aria-pressed')==='true').map(button=>button.dataset.daylight),
  rectangles:node.getClientRects().length,
}));}
async function switchVisible(page,row,label,expected='sunset'){
  const data=await switchState(page);assert.equal(data.display,'flex',`${label}: displayed`);assert.equal(data.visibility,'visible',`${label}: visible`);
  assert.ok(data.rect.width>0&&data.rect.height>0);assert.deepEqual(data.selected,[expected]);
  const hit=await page.locator(`[data-daylight="${expected}"]`).evaluate(button=>{const box=button.getBoundingClientRect();return document.elementFromPoint(box.x+box.width/2,box.y+box.height/2)?.closest('button')===button;});
  assert.ok(hit,`${label}: selected lighting can be clicked`);row.checks.push({label,...data,hit});return data;
}
async function switchHidden(page,row,label,{keyboard=true}={}){
  const data=await switchState(page);assert.equal(data.display,'none',`${label}: absent from layout`);assert.equal(data.rectangles,0);assert.equal(data.rect.width,0);assert.equal(data.rect.height,0);
  assert.deepEqual(data.selected,['sunset'],`${label}: selected lighting not reset`);
  const focus=await page.locator('[data-daylight="sunset"]').evaluate(button=>{button.focus();return document.activeElement===button;});assert.equal(focus,false,`${label}: hidden button cannot receive programmatic focus`);
  const point=await page.evaluate(({x,y})=>document.elementFromPoint(x,y)?.closest('.daylight-switch')!==null,row.mapSwitchPoint);
  assert.equal(point,false,`${label}: old switch position no longer hits switch`);
  const tabs=[];
  if(keyboard){
    const anchor=page.locator('#event-heading');if(await anchor.count())await anchor.focus();
    for(let step=0;step<12;step++){
      await page.keyboard.press('Tab');
      const active=await page.evaluate(()=>({id:document.activeElement?.id,tag:document.activeElement?.tagName,daylight:!!document.activeElement?.closest('.daylight-switch')}));
      assert.equal(active.daylight,false,`${label}: Tab excludes both lighting buttons`);tabs.push(active);
    }
  }
  row.checks.push({label,...data,programmaticFocus:false,pointerHit:false,tabs});
}
async function promptVisible(page,row){
  await page.locator('.choice-prompt').scrollIntoViewIfNeeded();
  const data=await page.locator('.choice-prompt').evaluate(node=>{
    const walker=document.createTreeWalker(node,NodeFilter.SHOW_TEXT),characters=[];
    while(walker.nextNode()){
      const text=walker.currentNode;
      for(let index=0;index<text.length;index++){
        if(!text.textContent[index].trim())continue;
        const range=document.createRange();range.setStart(text,index);range.setEnd(text,index+1);
        const box=range.getBoundingClientRect(),hit=document.elementFromPoint(box.x+box.width/2,box.y+box.height/2);
        characters.push({char:text.textContent[index],rect:box.toJSON(),visible:box.width>0&&box.height>0&&box.left>=0&&box.right<=innerWidth&&box.top>=0&&box.bottom<=innerHeight,unoccluded:hit===node||node.contains(hit),hit:hit?{tag:hit.tagName,id:hit.id,className:hit.className}:null});
      }
    }
    return {text:node.textContent,rect:node.getBoundingClientRect().toJSON(),characters};
  });
  row.prompt=data;assert.equal(data.text,'病房和汇报都在等待，你怎样协调这段时间？');
  assert.ok(data.characters.length>0);assert.ok(data.characters.every(character=>character.visible&&character.unoccluded),'Every hospital-prompt character is inside the viewport and unoccluded');
}
async function buttonsVisible(page,row,selectors,label){
  const buttons=[];
  for(const selector of selectors){
    await page.locator(selector).scrollIntoViewIfNeeded();
    const data=await page.locator(selector).evaluate(node=>{
      const rect=node.getBoundingClientRect(),hit=document.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2);
      return {text:node.textContent.trim(),disabled:node.disabled,rect:rect.toJSON(),inViewport:rect.left>=0&&rect.right<=innerWidth&&rect.top>=0&&rect.bottom<=innerHeight,hit:hit===node||node.contains(hit)};
    });
    assert.ok(data.inViewport&&data.hit,`${label}: ${selector} visible and hit-testable`);buttons.push({selector,...data});
  }
  row.checks.push({label,buttons});
}
async function runCase(base,width,height){
  const row={name:`${width}x${height}`,viewport:{width,height},passed:false,screenshots:[],checks:[],apiIntercepted:[],externalBlocked:[]};report.cases.push(row);report.phase=`${row.name}-load`;await save();
  const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:1,reducedMotion:'no-preference',serviceWorkers:'block'});
  await context.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin!==base&&!['data:','blob:'].includes(url.protocol)){row.externalBlocked.push(url.href);return route.abort();}return route.continue();});
  await context.route('**/api/**',route=>{row.apiIntercepted.push(new URL(route.request().url()).pathname);return route.fulfill({status:503,json:{error:'Isolated lighting-card regression, no real API'}});});
  await context.routeWebSocket('**/*',socket=>{row.externalBlocked.push(socket.url());socket.close();});
  const seeded=fixture();row.fixture={game:seeded,priorChoices:['cell-06/A','cell-12/A'],nextRealUiDie:6};
  await context.addInitScript(({key,game,progress})=>{
    if(localStorage.getItem(key)===null)localStorage.setItem(key,JSON.stringify({game,seconds:0,practiceInvitation:progress}));
    localStorage.setItem('four-seasons-auto-depart','off');localStorage.setItem('four-seasons-music','off');
    const random=crypto.getRandomValues.bind(crypto);
    crypto.getRandomValues=array=>{if(array instanceof Uint32Array&&array.length===1){array[0]=Math.floor(5.5/6*2**32);return array;}return random(array);};
  },{key:JOURNEY_STORAGE_KEY,game:seeded,progress:createInvitationProgress()});
  const page=currentPage=await context.newPage();page.setDefaultTimeout(90000);page.on('pageerror',error=>report.errors.push({case:row.name,message:error.message}));
  await page.goto(base);await page.locator('#scene[data-assets="ready"][data-renderer="webgl"]').waitFor();await settleLight(page);
  row.renderer=await page.locator('#scene canvas').evaluate(canvas=>{const gl=canvas.getContext('webgl2'),extension=gl.getExtension('WEBGL_debug_renderer_info');return extension?gl.getParameter(extension.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);});
  await switchVisible(page,row,'welcome-morning','morning');
  await page.locator('[data-daylight="sunset"]').click();await settleLight(page);await switchVisible(page,row,'welcome-sunset');
  await page.locator('#start-full').click();await page.locator('#resume').click();await stage(page,'ready');await settleLight(page);
  const mapSwitch=await switchVisible(page,row,'resumed-map');row.mapSwitchPoint={x:mapSwitch.rect.x+mapSwitch.rect.width/2,y:mapSwitch.rect.y+mapSwitch.rect.height/2};
  const initial=await readGame(page);assert.deepEqual(initial,seeded);
  await page.locator('#view-overview').click();await delay(600);
  for(const lighting of ['morning','sunset']){await page.locator(`[data-daylight="${lighting}"]`).click();await settleLight(page);await switchVisible(page,row,`overview-${lighting}`,lighting);}
  assert.deepEqual(await readGame(page),initial,'Overview lighting changes no game state');
  await page.locator('#view-follow').click();await delay(600);
  // Enter a landmark using only existing navigation; explore is not a choice card.
  await page.locator('#town-gallery').click();await page.locator('[data-town-season="1"]').click();await page.locator('[data-visit-cell="18"]').click();await page.locator('#scene-on-map').click();await stage(page,'explore');await delay(650);
  await switchVisible(page,row,'landmark-explore');await capture(page,row,'landmark-sunset');await page.locator('#town-return').click();await stage(page,'ready');
  await page.locator('#rules-button').click();await page.locator('#dialog[open]').waitFor();
  const focusInDialog=await page.locator('[data-daylight="sunset"]').evaluate(button=>{button.focus();return document.activeElement===button;});assert.equal(focusInDialog,false,'Native modal prevents background switch focus');
  await page.locator('#dialog-close').click();await stage(page,'ready');
  await page.setViewportSize({width:390,height:844});await page.locator('#orientation-gate:not([hidden])').waitFor();
  const portrait=await switchState(page);assert.equal(portrait.visibility,'hidden');assert.equal(portrait.inert,true);row.checks.push({label:'portrait-gate',...portrait});
  await page.setViewportSize({width,height});await page.locator('#orientation-gate[hidden]').waitFor({state:'attached'});await switchVisible(page,row,'portrait-return');
  assert.deepEqual(await readGame(page),initial,'Browsing, dialog and orientation changes no game state');
  report.phase=`${row.name}-actual-cell-18`;await save();
  await page.locator('#continue-travel').click();await page.locator('.cine-video').waitFor();
  await page.locator('.cine-video').evaluate(video=>{
    window.__daylightCine={duration:video.duration,ended:false,error:null};
    video.addEventListener('ended',()=>{window.__daylightCine.ended=true;},{once:true});
    video.addEventListener('error',()=>{window.__daylightCine.error=video.error?.code??'unknown';},{once:true});
  });
  await capture(page,row,'hospital-video');await stage(page,'choice');
  row.video=await page.evaluate(()=>window.__daylightCine);assert.equal(row.video.ended,true,'Hospital movie naturally completed');assert.equal(row.video.error,null);
  const pending=await readGame(page);assert.equal(restore(pending).position,17);assert.equal(restore(pending).die,6);
  await switchHidden(page,row,'choice');await promptVisible(page,row);
  const choices=await page.locator('[data-choice]').evaluateAll(nodes=>nodes.map(node=>({index:Number(node.dataset.choice),disabled:node.disabled,label:node.querySelector('strong').textContent})));
  assert.deepEqual(choices.map(choice=>choice.index),[0,1,2]);assert.equal(choices.some(choice=>choice.disabled),false);row.choices=choices;
  assert.equal(await page.locator('.choice-effects,.condition-note').count(),0,'No outcome preview added');
  await buttonsVisible(page,row,['[data-choice="0"]','[data-choice="1"]','[data-choice="2"]'],'three-choice-hit-test');
  await page.locator('.choice-prompt').scrollIntoViewIfNeeded();await capture(page,row,'cell-18-choice-fixed');
  await page.locator('[data-choice="2"]').click();await stage(page,'feedback');await page.locator('[data-practice-invitation="fallback"]').waitFor();
  await switchHidden(page,row,'feedback');await buttonsVisible(page,row,['#invitation-practice-open','#invitation-skip'],'feedback-invitation');
  await capture(page,row,'feedback-invitation-fixed');const settled=await readGame(page);
  assert.deepEqual(settled,snapshot(choose(restore(pending),2)),'Lighting fix adds no settlement');
  await page.locator('#invitation-practice-open').click();await page.locator('#dialog.practice-dialog[open] .practice-room').waitFor();
  await switchHidden(page,row,'practice-modal',{keyboard:false});await capture(page,row,'practice-opening');
  assert.deepEqual(await readGame(page),settled,'Opening rehearsal does not alter resources');
  await page.locator('.practice-exit').click();await stage(page,'feedback');await switchHidden(page,row,'feedback-after-practice');
  await page.locator('#next-button').click();await stage(page,'ready');await settleLight(page);await switchVisible(page,row,'map-after-feedback');
  assert.deepEqual(await readGame(page),snapshot(advance(restore(settled))),'Return is only the existing advance');
  const returned=await readGame(page);
  for(const lighting of ['morning','sunset']){await page.locator(`[data-daylight="${lighting}"]`).click();await settleLight(page);await switchVisible(page,row,`returned-${lighting}`,lighting);}
  assert.deepEqual(await readGame(page),returned,'Restored lighting remains cosmetic');
  assert.equal(await page.evaluate(key=>localStorage.getItem(key),DAYLIGHT_STORAGE_KEY),'sunset');await capture(page,row,'map-restored-sunset');
  await page.reload();await page.locator('#scene[data-assets="ready"]').waitFor();await settleLight(page);await switchVisible(page,row,'reload-sunset');
  assert.deepEqual(await readGame(page),returned,'Reload persists the same game');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No horizontal overflow');
  row.passed=true;await save();await context.close();currentPage=null;console.log(`Lighting card ${row.name}: passed, prompt ${row.prompt.characters.length} characters unobscured, 3 choices, natural video end, returned sunset`);
}
try{
  const base=await startServer();browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--use-gl=angle','--use-angle=d3d11','--ignore-gpu-blocklist']});
  for(const [width,height] of [[1280,800],[844,390],[667,375]])await runCase(base,width,height);
  assert.deepEqual(report.errors,[]);report.passed=true;report.phase='complete';
}catch(error){
  report.errors.push({phase:report.phase,message:error.message,stack:error.stack});
  if(currentPage)await currentPage.screenshot({path:`${out}/failure.png`}).catch(()=>{});
  process.exitCode=1;
}finally{
  report.finishedAt=new Date().toISOString();await save();await browser?.close();server?.kill();
  console.log(JSON.stringify({passed:report.passed,cases:report.cases.map(row=>({name:row.name,passed:row.passed})),errors:report.errors,report:`${out}/browser-production.json`}));
}
