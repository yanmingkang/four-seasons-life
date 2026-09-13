// Bounded UI regression against the already-running local game. This script
// does not start/stop servers or use the user's browser profile or save slot.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {newGame,land,choose,advance,previewChoice,snapshot,restore} from '../src/engine.js';
import {JOURNEY_STORAGE_KEY} from '../src/journey-storage.js';
import {LIFE_CHAPTERS} from '../src/season-chapters.js';

const base='http://127.0.0.1:4173';
const out=new URL('../test-results/cover-season/',import.meta.url);
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'C:/Users/25293/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const report={passed:false,startedAt:new Date().toISOString(),base,cases:[],pageErrors:[],apiIntercepted:[],externalBlocked:[],webSocketsBlocked:[],method:{isolatedBrowserContexts:true,userProfileUsed:false,userSavedGameModified:false,serverStartedOrStopped:false,realApiCalls:0,fixtures:'Four replay-valid, engine-generated ready states, not additional full playthroughs. Resume uses the visible single entry and confirmation buttons.',viewports:[[1280,800]]}};
const metadata={version:1,seen:true,resolved:true,kind:'fallback'};
let browser,currentPage;
await fs.mkdir(out,{recursive:true});
const saveReport=()=>fs.writeFile(new URL('browser-local.json',out),JSON.stringify(report,null,2));
const pathOnly=url=>{const value=new URL(url);return `${value.origin}${value.pathname}`;};

function fixtures(){
  let game=newGame('full',{enriched:true,name:'季节标签验收',talent:'optimistic'});
  const result=[];
  for(const cell of [2,6,12,18,22,28,32]){
    game=land(game,cell-game.position-1);
    const options=game.active.options.map((option,index)=>({index,preview:previewChoice(game,option)})).filter(option=>!option.preview.disabled).sort((a,b)=>b.preview.mood-a.preview.mood||a.index-b.index);
    game=advance(choose(game,options[0].index));
    assert.equal(game.ended,null);assert.equal(game.phase,'ready');
    assert.deepEqual(restore(snapshot(game)),game);
    if([2,12,22,32].includes(cell))result.push({season:game.season,game:snapshot(game)});
  }
  assert.deepEqual(result.map(row=>row.season),[0,1,2,3]);
  return result;
}

async function inspect(page){
  return page.locator('#life-season').evaluate(node=>{
    const style=getComputedStyle(node),rect=node.getBoundingClientRect();
    return {stage:document.querySelector('.experience').dataset.stage,display:style.display,visibility:style.visibility,width:rect.width,height:rect.height,season:node.dataset.season,name:node.querySelector('#life-season-name').textContent,lifeStage:node.querySelector('#life-stage-name').textContent,music:node.querySelector('#season-music-label').textContent};
  });
}

async function capture(page,name){
  await page.screenshot({path:fileURLToPath(new URL(`${name}.png`,out))});
}

async function runCase({width,height,fixture}){
  const name=`${fixture?`season-${fixture.season}`:'empty'}-${width}`;
  const row={name,width,height,season:fixture?.season??null,passed:false};report.cases.push(row);
  const context=await browser.newContext({viewport:{width,height},serviceWorkers:'block',reducedMotion:'reduce'});
  const raw=fixture?JSON.stringify({game:fixture.game,seconds:0,practiceInvitation:metadata},null,2):null;
  try{
    await context.route('**/*',route=>{
      const url=new URL(route.request().url());
      if(url.origin!==base&&!['data:','blob:'].includes(url.protocol)){report.externalBlocked.push({name,url:pathOnly(url)});return route.abort();}
      return route.continue();
    });
    await context.route('**/api/**',route=>{report.apiIntercepted.push({name,path:new URL(route.request().url()).pathname});return route.fulfill({status:503,json:{error:'Isolated cover regression; API disabled'}});});
    await context.routeWebSocket('**/*',socket=>{
      const url=new URL(socket.url());
      // The live development server uses this same-origin root socket only
      // for Vite HMR. Closing it deliberately creates an unrelated page error.
      if(url.origin===base.replace('http:','ws:') && url.pathname==='/')return socket.connectToServer();
      report.webSocketsBlocked.push({name,url:pathOnly(url)});socket.close();
    });
    await context.addInitScript(({key,raw})=>{
      if(raw!==null)localStorage.setItem(key,raw);
      localStorage.setItem('four-seasons-auto-depart','off');
      localStorage.setItem('four-seasons-music','off');
    },{key:JOURNEY_STORAGE_KEY,raw});
    const page=currentPage=await context.newPage();page.setDefaultTimeout(60000);
    page.on('pageerror',error=>report.pageErrors.push({name,message:error.message}));
    const response=await page.goto(base);assert.equal(response.status(),200);
    await page.locator('.experience[data-stage="welcome"]').waitFor();
    assert.equal(await page.locator('.welcome-actions button').count(),1);
    assert.equal(await page.locator('#start-full').count(),1);
    assert.equal(await page.locator('#life-season').isVisible(),false);
    row.cover=await inspect(page);assert.equal(row.cover.display,'none');
    const stored=()=>page.evaluate(key=>localStorage.getItem(key),JOURNEY_STORAGE_KEY);
    assert.equal(await stored(),raw,'Cover does not alter the isolated saved record');
    if(fixture){
      await page.locator('#start-full').click();
      await page.locator('#dialog.journey-entry-dialog[open]').waitFor();
      row.confirmation=await inspect(page);
      assert.equal(row.confirmation.stage,'welcome');assert.equal(row.confirmation.display,'none');
      assert.equal(await page.locator('#life-season').isVisible(),false);
      assert.equal(await stored(),raw,'Confirmation has not replaced or replayed the isolated save');
      await page.locator('#resume').click();
      await page.locator('.experience[data-stage="ready"]').waitFor();
      await page.locator('#life-season').waitFor({state:'visible'});
      row.ready=await inspect(page);
      assert.equal(row.ready.stage,'ready');assert.notEqual(row.ready.display,'none');assert.equal(row.ready.visibility,'visible');
      assert.ok(row.ready.width>0&&row.ready.height>0);
      assert.equal(row.ready.name,LIFE_CHAPTERS[fixture.season].name);
      assert.equal(row.ready.lifeStage,LIFE_CHAPTERS[fixture.season].stage);
      assert.equal(row.ready.season,String(fixture.season));
      const after=JSON.parse(await stored());assert.deepEqual(after.game,fixture.game);
      assert.deepEqual(after.practiceInvitation,metadata);
    }
    row.passed=true;await saveReport();console.log(`${name}: cover hidden${fixture?', confirmation hidden, '+row.ready.name+' / '+row.ready.lifeStage+' visible':''}`);
  }finally{await context.close();currentPage=null;}
}

try{
  browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--use-gl=angle','--use-angle=d3d11','--ignore-gpu-blocklist']});
  const prepared=fixtures();
  for(const [width,height] of report.method.viewports){
    await runCase({width,height});
    for(const fixture of prepared)await runCase({width,height,fixture});
  }
  assert.deepEqual(report.pageErrors,[]);assert.deepEqual(report.externalBlocked,[]);
  report.passed=true;
}catch(error){
  report.failure={message:error.message,stack:error.stack};
  if(currentPage)try{await capture(currentPage,'failure');}catch{}
  throw error;
}finally{
  report.finishedAt=new Date().toISOString();await saveReport();await browser?.close();
}
console.log(JSON.stringify({passed:report.passed,cases:report.cases.length,realApiCalls:0}));
