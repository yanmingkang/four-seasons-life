// Bounded public latency check after the user PERSONALLY logs into a clean window.
// Not one of the five complete playthroughs. No user profile, cookie, token,
// authorization URL, or real player save is exported or persisted by this test.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
import {setTimeout as delay} from 'node:timers/promises';
import {newGame,land,choose,advance,snapshot} from '../src/engine.js';
import {validateNarrativeInput} from '../server/ai-core.mjs';
import {validatePracticeInput} from '../server/practice.mjs';
const require=createRequire(import.meta.url);
const {chromium}=require('C:/Users/25293/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const BASE='https://zhihu-four-seasons.pages.dev';
const out=new URL('../test-results/five-games-live-latency-20260913/',import.meta.url);
const report={startedAt:new Date().toISOString(),stage:'prepare',authenticated:false,cases:[],method:{
  isolatedVisibleBrowser:true,userPersonallyAuthorizes:true,realBusinessResponses:true,
  maxModelCalls:3,maxSearchCalls:0,noAutomaticRetries:true,noCredentialsExported:true,
  noExistingPlayerDataRead:true,fixtureOnly:true,fullPlaythrough:false,
  systemNetworkUnchanged:true,network:'Default network, isolated Chrome no-proxy-server',
}};
await fs.mkdir(out,{recursive:true});
const save=()=>fs.writeFile(new URL('report.json',out),JSON.stringify(report,null,2));
let state=newGame('full',{name:'等待时间验收旅人',talent:'defense',enriched:true,lifeSchema:4}),eventGame;
for(const [index,[die,option]] of [[6,2],[6,0],[1,0],[6,0],[6,2],[6,1],[6,1],[6,0]].entries()){
  state=choose(land(state,die),option);if(index===2)eventGame=snapshot(state);state=advance(state);
}
assert.equal(state.ended,'complete');
const summaryGame=snapshot(state);
validateNarrativeInput({kind:'summary',game:summaryGame});
const clientId=crypto.randomUUID();
const messages=['我想先核对双方确认过的交付节点，不急着判断谁的责任，可以一起看看记录吗？','我来整理待确认事项，想请双方各找一位了解情况的同事，明天下午一起核对，可以吗？'];
validatePracticeInput({game:eventGame,clientId,turn:1,message:messages[0]});
let browser,page,authenticated=false;
async function send(name,path,payload){
  const result=await page.evaluate(async({path,payload})=>{
    const start=performance.now();let status,headersMs;
    try{
      const r=await fetch(path,{method:payload?'POST':'GET',credentials:'same-origin',cache:'no-store',
        headers:payload?{'Content-Type':'application/json'}:{},body:payload?JSON.stringify(payload):undefined,
        signal:AbortSignal.timeout(55000),redirect:'error'});
      status=r.status;headersMs=Math.round(performance.now()-start);const b=await r.json();
      // sessionId is the communication-practice session, NOT the OAuth session.
      return {status,headersMs,bodyMs:Math.round(performance.now()-start),mode:b.mode,model:b.model,
        textLength:b.text?.length,npcLength:b.npc?.length,tipLength:b.tip?.length,turn:b.turn,done:b.done,
        configured:b.configured,available:b.available,authenticated:b.authenticated,enabled:b.enabled,
        sessionId:path==='/api/practice'?b.sessionId:undefined};
    }catch(e){return{status:status||0,headersMs,bodyMs:Math.round(performance.now()-start),error:e.name};}
  },{path,payload});
  const {sessionId,...safe}=result;report.cases.push({name,...safe});await save();
  console.log(JSON.stringify({name,...safe}));return result;
}
try{
  browser=await chromium.launch({channel:'chrome',headless:false,args:['--no-proxy-server','--enable-webgl','--use-gl=angle','--use-angle=d3d11','--ignore-gpu-blocklist']});
  const context=await browser.newContext({viewport:{width:1200,height:780},serviceWorkers:'block'});
  await context.addInitScript(base=>{if(location.origin===base){localStorage.setItem('four-seasons-music','off');localStorage.setItem('four-seasons-auto-depart','off');}},BASE);
  page=await context.newPage();
  page.on('response',async r=>{
    try{const u=new URL(r.url());if(u.origin===BASE&&u.pathname==='/api/auth/status'&&r.status()===200){
      const body=await r.json();if(body.authenticated===true)authenticated=true;
    }}catch{}
  });
  report.stage='waiting-for-personal-login';await save();
  await page.goto(BASE,{waitUntil:'domcontentloaded',timeout:45000});
  console.log('VISIBLE_TEST_WINDOW_READY: Please personally sign in with the main journey entry. No password should be sent to the assistant.');
  const deadline=Date.now()+360000;
  while(!authenticated&&Date.now()<deadline&&!page.isClosed())await delay(500);
  if(!authenticated){report.stage='not-verified-user-login-not-completed';await save();}
  else{
    report.authenticated=true;report.stage='authenticated-targeted-api-latency';await save();
    await page.goto(BASE+'/share-card-licenses.txt',{waitUntil:'domcontentloaded',timeout:30000});
    const status=await send('signed-in-status','/api/auth/status?check='+Date.now().toString(36)+'-1');
    if(status.status!==200||status.authenticated!==true)throw new Error('Authentication no longer valid');
    const configured=await send('ai-availability','/api/ai/status');
    if(configured.status===200&&configured.configured&&configured.available){
      const first=await send('practice-round-1','/api/practice',{game:eventGame,clientId,turn:1,message:messages[0]});
      if(first.status===200&&first.sessionId&&first.turn===1&&!first.done){
        await send('practice-round-2','/api/practice',{game:eventGame,clientId,sessionId:first.sessionId,turn:2,message:messages[1]});
      }
      if(!report.cases.some(c=>[401,429].includes(c.status)||c.mode==='fallback'))
        await send('ending-summary','/api/narrate',{kind:'summary',game:summaryGame});
      else report.summarySkipped='Stopped after authorization, quota, or fallback response; no repeated live calls.';
    }else report.businessSkipped='AI service reported unavailable; no paid/business generation attempted.';
    report.stage='complete';
  }
}catch(e){report.stage='incomplete';report.errorKind=e.name;}
finally{report.finishedAt=new Date().toISOString();await save();await browser?.close().catch(()=>{});
  console.log(JSON.stringify({stage:report.stage,authenticated:report.authenticated,cases:report.cases.length}));}
