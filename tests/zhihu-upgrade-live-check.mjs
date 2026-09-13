// Explicit, bounded acceptance of the real installed CLI through the game HTTP
// handlers. Not part of the automatic unit suite; no user saves are loaded.
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { newGame, land, choose, advance, snapshot, restore } from '../src/engine.js';
import { validateNarrativeInput } from '../server/ai-core.mjs';
import { validatePracticeInput } from '../server/practice.mjs';

if (!process.argv.includes('--live')) throw Error('Requires --live: at most four Zhihu answer calls and one search.');
const root=fileURLToPath(new URL('../',import.meta.url));
const out=fileURLToPath(new URL('../test-results/zhihu-upgrade/',import.meta.url));
const cli=process.env.ZHIHU_CLI_PATH || `${process.env.LOCALAPPDATA}/ZhihuCLI/current/zhihu-cli.exe`;
const report={startedAt:new Date().toISOString(),passed:false,cases:[],checks:[],method:{
  realTransport:'isolated game HTTP server -> installed official Zhihu CLI',
  provider:'知乎直答',model:'zhida-fast-1p5',maxRealAnswerCalls:4,maxRealSearchCalls:1,
  cacheRepeats:true,invalidTurnsNeverGenerate:true,user4173Untouched:true,userSavesRead:false,
  credentialsModified:false,rawResponsesSaved:false,fictionalInputOnly:true,
  scope:'Targeted replay-valid fixtures, not a complete browser playthrough. Real service results and offline missing-CLI fallbacks are reported separately.',
}};
const children=new Set();
await fs.mkdir(out,{recursive:true});
const save=()=>fs.writeFile(`${out}/live.json`,JSON.stringify(report,null,2));
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function check(name,ok){report.checks.push({name,passed:!!ok});}
let state=newGame('full',{name:'升级验收旅人',talent:'defense',enriched:true,lifeSchema:4});
let eventGame;
for(const [index,[die,choice]] of [[6,2],[6,0],[1,0],[6,0],[6,2],[6,1],[6,1],[6,0]].entries()){
  state=choose(land(state,die),choice);
  if(index===2)eventGame=snapshot(state);
  state=advance(state);
}
const summaryGame=snapshot(state),initialHash=digest({eventGame,summaryGame});
assert.equal(restore(eventGame).history.at(-1).eventId,'cell-13');
assert.equal(state.ended,'complete');
validateNarrativeInput({kind:'event',game:eventGame});
validateNarrativeInput({kind:'summary',game:summaryGame});
const messages=['我不是在判断谁的态度，想先核对双方确认过的交付节点，没确认的地方一起补齐。','我可以先整理待确认事项，想请两边各约一位了解情况的同事，明天下午一起核对，可以吗？'];
validatePracticeInput({game:eventGame,clientId:randomUUID(),turn:1,message:messages[0]});
report.fixture={lifeSchema:4,event:'cell-13',ending:state.ended,turns:state.turn,digest:initialHash};

async function start(cliPath){
  const probe=createServer();await new Promise((resolve,reject)=>{probe.once('error',reject);probe.listen(0,'127.0.0.1',resolve);});
  const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
  const child=spawn(process.execPath,['server.mjs','--production'],{cwd:root,windowsHide:true,stdio:'ignore',env:{...process.env,PORT:String(port),ZHIHU_CLI_PATH:cliPath}});
  children.add(child);let failed=false;child.on('error',()=>{failed=true;});
  const base=`http://127.0.0.1:${port}`;
  for(let n=0;n<100;n++){
    if(failed||child.exitCode!==null)throw Error('Isolated server startup failed');
    try{if((await fetch(`${base}/api/health`,{signal:AbortSignal.timeout(500)})).ok)return base;}catch{}
    await delay(100);
  }
  throw Error('Isolated server health timeout');
}
async function request(base,name,path,payload){
  const row={name,path,startedAt:new Date().toISOString()};report.cases.push(row);
  const started=performance.now();
  try{
    const response=await fetch(`${base}${path}`,{method:payload?'POST':'GET',headers:payload?{'Content-Type':'application/json'}:{},body:payload?JSON.stringify(payload):undefined,signal:AbortSignal.timeout(55000)});
    const body=await response.json();
    Object.assign(row,{status:response.status,elapsedMs:Math.round(performance.now()-started),mode:body.mode,model:body.model,textLength:body.text?.length,npcLength:body.npc?.length,tipLength:body.tip?.length,turn:body.turn,done:body.done,itemCount:body.items?.length});
    if(body.items)row.validZhihuLinks=body.items.every(item=>{try{const url=new URL(item.url);return url.protocol==='https:'&&['www.zhihu.com','zhuanlan.zhihu.com'].includes(url.hostname)&&typeof item.title==='string'&&!!item.title;}catch{return false;}});
    await save();console.log(JSON.stringify(row));
    if(process.argv.includes('--review-text')&&body.mode==='live')console.log(JSON.stringify({review:name,text:body.text,npc:body.npc,tip:body.tip,items:body.items?.map(({title,author,url})=>({title,author,url}))}));
    return {body,status:response.status,row};
  }catch(error){row.elapsedMs=Math.round(performance.now()-started);row.error=error.name==='TimeoutError'?'local-test-http-timeout':'local-test-transport-or-json-error';await save();return {body:{},status:0,row};}
}
async function narrativeChecks(base,prefix,expected){
  for(const [kind,game] of [['event',eventGame],['summary',summaryGame]]){
    const payload={kind,game};
    const first=await request(base,`${prefix}-${kind}`,'/api/narrate',payload);
    check(`${prefix}-${kind}-mode`,first.status===200&&first.body.mode===expected&&first.body.text?.length>=8);
    const repeat=await request(base,`${prefix}-${kind}-repeat`,'/api/narrate',payload);
    check(`${prefix}-${kind}-cache`,repeat.status===200&&repeat.body.mode===(expected==='live'?'cache':'fallback')&&repeat.body.text===first.body.text);
  }
}
async function practiceChecks(base,prefix,expected){
  const clientId=randomUUID(),firstPayload={game:eventGame,clientId,turn:1,message:messages[0]};
  const first=await request(base,`${prefix}-practice-1`,'/api/practice',firstPayload);
  check(`${prefix}-practice-1`,first.status===200&&first.body.mode===expected&&first.body.turn===1&&first.body.done===false&&first.body.npc?.length>=4&&!Object.hasOwn(first.body,'tip'));
  const repeat1=await request(base,`${prefix}-practice-1-repeat`,'/api/practice',firstPayload);
  check(`${prefix}-practice-1-cache`,repeat1.body.mode===(expected==='live'?'cache':'fallback')&&repeat1.body.npc===first.body.npc&&repeat1.body.sessionId===first.body.sessionId);
  if(!first.body.sessionId){check(`${prefix}-practice-session`,false);return;}
  const secondPayload={game:eventGame,clientId,sessionId:first.body.sessionId,turn:2,message:messages[1]};
  const second=await request(base,`${prefix}-practice-2`,'/api/practice',secondPayload);
  check(`${prefix}-practice-2`,second.status===200&&second.body.mode===expected&&second.body.turn===2&&second.body.done===true&&second.body.npc?.length>=4&&second.body.tip?.length>=4&&second.body.sessionId===first.body.sessionId);
  const repeat2=await request(base,`${prefix}-practice-2-repeat`,'/api/practice',secondPayload);
  check(`${prefix}-practice-2-cache`,repeat2.body.mode===(expected==='live'?'cache':'fallback')&&repeat2.body.npc===second.body.npc&&repeat2.body.tip===second.body.tip);
  const third=await request(base,`${prefix}-practice-3-rejected`,'/api/practice',{...secondPayload,turn:3});
  check(`${prefix}-no-third-turn`,third.status===400);
  const tamper=await request(base,`${prefix}-settled-turn-edit-rejected`,'/api/practice',{...secondPayload,message:'修改已经结算的练习内容'});
  check(`${prefix}-settled-turn-immutable`,tamper.status===400);
}
async function searchChecks(base,prefix,expected){
  const first=await request(base,`${prefix}-search`,'/api/experience?source=records');
  check(`${prefix}-search`,first.status===200&&first.body.mode===expected&&first.body.items?.length>0&&first.row.validZhihuLinks);
  const repeat=await request(base,`${prefix}-search-repeat`,'/api/experience?source=records');
  check(`${prefix}-search-cache-or-curated`,repeat.status===200&&repeat.body.mode===(expected==='live'?'cache':'curated')&&digest(first.body.items)===digest(repeat.body.items));
}
try{
  await fs.access(cli);const live=await start(cli);
  report.liveServer={base:live,cliPath:cli};await save();
  await narrativeChecks(live,'live','live');
  await practiceChecks(live,'live','live');
  await searchChecks(live,'live','live');
  const missing=`${out}/deliberately-absent-cli.exe`;await assert.rejects(fs.access(missing),{code:'ENOENT'});
  const offline=await start(missing);report.offlineServer={base:offline,realApiCalls:0,missingCli:true};
  await narrativeChecks(offline,'offline','fallback');
  await practiceChecks(offline,'offline','fallback');
  await searchChecks(offline,'offline','curated');
  check('fixture-and-resources-unchanged',initialHash===digest({eventGame,summaryGame}));
  report.passed=report.checks.every(item=>item.passed);
}catch{report.error='Acceptance harness failed; see completed cases, not raw errors or secrets.';}
finally{
  for(const child of children){child.kill();await Promise.race([new Promise(resolve=>child.once('exit',resolve)),delay(2000)]);}
  report.finishedAt=new Date().toISOString();await save();
  console.log(JSON.stringify({passed:report.passed,failedChecks:report.checks.filter(item=>!item.passed),report:`${out}/live.json`}));
}
process.exitCode=report.passed?0:1;
