// Explicit public acceptance. At most four live model calls and one search.
// No provider credentials are read here; only the deployed same-origin API runs.
// Optional --pages selects only the fixed proposed Pages hostname. Its project
// creation/ownership and deployment must be confirmed before running this file.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
import {randomUUID,createHash} from 'node:crypto';
import {newGame,land,choose,advance,snapshot} from '../src/engine.js';
import {CINEMATIC_MANIFEST} from '../src/cinematic-manifest.js';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'C:/Users/25293/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const flags=process.argv.slice(2);
assert.ok(flags.every(flag=>['--pages','--live','--review-text','--direct'].includes(flag))&&new Set(flags).size===flags.length,'Only --pages, --live, --review-text and --direct are accepted; arbitrary URLs are not allowed.');
if(!flags.includes('--live'))throw Error('Explicit --live is required (four model calls and one search maximum).');
const usePages=flags.includes('--pages');
const direct=flags.includes('--direct');
const base=usePages?'https://zhihu-four-seasons.pages.dev':'https://zhihu-four-seasons.sishi-life-005336.workers.dev';
const out=new URL(`../test-results/${usePages?'cloud-pages-public':'cloud-public'}/live${direct?'-direct':''}.json`,import.meta.url);
const report={passed:false,startedAt:new Date().toISOString(),base,checks:[],cases:[],method:{
  hostingTarget:usePages?'pages':'workers',
  browserProxy:direct?'disabled-only-in-isolated-test-browser':'system-default',
  transport:'Native Chrome HTTPS fetch to the selected fixed Cloudflare deployment; system network configuration unchanged',
  apiResponsesMocked:false,maxModelCalls:4,maxSearchCalls:1,fictionalInputsOnly:true,
  noRawCookiesOrSessionIdsSaved:true,noCredentialsRead:true,noAutomaticModelRetries:true,
  fullPlaythrough:false,oauthEnabled:false,mainlandDirectAccessNotEstablished:true,
}};
const save=()=>fs.writeFile(out,JSON.stringify(report,null,2));
const check=(name,ok,detail={})=>{report.checks.push({name,passed:!!ok,...detail});};
let browser,page;
async function send(name,path,body,headers={}){
  const row={name,path};report.cases.push(row);
  const result=await page.evaluate(async({path,body,headers})=>{
    const start=performance.now();
    try{
      const response=await fetch(path,{method:body?'POST':'GET',credentials:'same-origin',headers:{...(body?{'Content-Type':'application/json'}:{}),...headers},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(45000),redirect:'error'});
      const data=await response.json();
      return {status:response.status,ms:Math.round(performance.now()-start),data};
    }catch(e){return {status:0,ms:Math.round(performance.now()-start),error:e.name};}
  },{path,body,headers});
  const data=result.data||{};
  Object.assign(row,{status:result.status,ms:result.ms,error:result.error,mode:data.mode,model:data.model,textLength:data.text?.length,npcLength:data.npc?.length,tipLength:data.tip?.length,turn:data.turn,done:data.done,itemCount:data.items?.length});
  await save();console.log(JSON.stringify(row));
  return result;
}
try{
  await fs.mkdir(new URL('.',out),{recursive:true});
  browser=await chromium.launch({channel:'chrome',headless:true,args:direct?['--no-proxy-server']:[]});
  const context=await browser.newContext({serviceWorkers:'block'});page=await context.newPage();
  // Use a static same-origin document with the site's connect-src policy.
  // API JSON intentionally has default-src 'none', so it cannot host fetch tests.
  const document=await page.goto(base+'/share-card-licenses.txt',{waitUntil:'domcontentloaded',timeout:60000});
  assert.equal(document.status(),200,'Public HTTPS static document');
  const health=await send('health','/api/health');
  check('public-health',health.status===200&&health.data?.ok===true);
  const home=await page.evaluate(async()=>{const r=await fetch('/');const text=await r.text();return {status:r.status,csp:r.headers.get('Content-Security-Policy'),cache:r.headers.get('Cache-Control'),game:text.includes('知乎'),hasLocalAddress:/127\.0\.0\.1|localhost/.test(text)};});
  check('home-and-csp',home.status===200&&/connect-src 'self'/.test(home.csp||'')&&!home.hasLocalAddress,home);
  const cookies=await context.cookies(base);
  const visitor=cookies.find(c=>c.name==='__Host-four-seasons-visitor');
  check('secure-visitor-cookie',!!visitor&&visitor.httpOnly&&visitor.secure&&visitor.sameSite==='Lax');
  const status=await send('configured','/api/ai/status');
  check('backend-configured',status.status===200&&status.data?.configured===true);
  for(const clip of CINEMATIC_MANIFEST){
    const media=await page.evaluate(async clip=>{
      const video=await fetch(clip.src,{headers:{Range:'bytes=0-4095'}});const bytes=(await video.arrayBuffer()).byteLength;
      const poster=await fetch(clip.poster,{method:'HEAD'});
      return {status:video.status,bytes,type:video.headers.get('Content-Type'),range:video.headers.get('Content-Range'),poster:poster.status};
    },clip);
    check(`cell-${clip.cell}-media`,[200,206].includes(media.status)&&/video\/mp4/.test(media.type||'')&&media.poster===200&&(media.status===206?media.bytes===4096&&/^bytes 0-4095\//.test(media.range||''):media.bytes>4096),media);
  }
  const memory=await page.evaluate(async()=>{
    const failures=[];
    for(let cell=1;cell<=40;cell++){
      const r=await fetch(`/art/memories/cell-${String(cell).padStart(2,'0')}.webp`,{method:'HEAD'});
      if(r.status!==200||!/image\/webp/.test(r.headers.get('Content-Type')||''))failures.push({cell,status:r.status});
    }
    return failures;
  });check('all-40-memory-images',memory.length===0,{failures:memory});
  const privatePaths=await page.evaluate(async()=>{
    const results=[];
    for(const path of ['/.env','/server.mjs','/auth.json','/test-results/cloud-release.json','/RELEASE.json','/api/missing'])results.push({path,status:(await fetch(path)).status});
    return results;
  });check('private-paths-404',privatePaths.every(x=>x.status===404),{results:privatePaths});
  let state=newGame('full',{name:'公网验收旅人',talent:'defense',enriched:true,lifeSchema:4}),eventGame;
  for(const [index,[die,choice]] of [[6,2],[6,0],[1,0],[6,0],[6,2],[6,1],[6,1],[6,0]].entries()){
    state=choose(land(state,die),choice);if(index===2)eventGame=snapshot(state);state=advance(state);
  }
  assert.equal(state.ended,'complete');const summaryGame=snapshot(state);
  const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
  const original=digest({eventGame,summaryGame});
  for(const [kind,game] of [['event',eventGame],['summary',summaryGame]]){
    const payload={kind,game},r=await send(kind,'/api/narrate',payload);
    check(`${kind}-live`,r.status===200&&r.data?.mode==='live'&&r.data.text?.length>=8);
    // Repeats only after confirmed successful execution, never retry unknown POST.
    if(r.data?.mode==='live'){
      const cached=await send(`${kind}-cache`,'/api/narrate',payload);
      check(`${kind}-cache`,cached.status===200&&cached.data?.mode==='cache'&&cached.data.text===r.data.text);
      if(process.argv.includes('--review-text'))console.log(JSON.stringify({review:kind,text:r.data.text}));
    }
  }
  const clientId=randomUUID();
  const firstPayload={game:eventGame,clientId,turn:1,message:'我不是在判断谁的态度，想先核对双方确认过的交付节点，没确认的地方一起补齐。'};
  const first=await send('practice-one','/api/practice',firstPayload);
  check('practice-one-live',first.status===200&&first.data?.mode==='live'&&first.data.turn===1&&first.data.done===false&&!!first.data.npc&&!first.data.tip);
  if(first.data?.sessionId){
    const secondPayload={...firstPayload,turn:2,sessionId:first.data.sessionId,message:'我可以先整理待确认事项，想请两边各约一位了解情况的同事，明天下午一起核对，可以吗？'};
    const second=await send('practice-two','/api/practice',secondPayload);
    check('practice-two-live',second.status===200&&second.data?.mode==='live'&&second.data.turn===2&&second.data.done===true&&!!second.data.npc&&!!second.data.tip);
    if(process.argv.includes('--review-text'))console.log(JSON.stringify({review:'practice',one:first.data.npc,two:second.data?.npc,tip:second.data?.tip}));
    // A second isolated visitor must never access the first conversation.
    const other=await browser.newContext({serviceWorkers:'block'});const otherPage=await other.newPage();
    await otherPage.goto(base+'/share-card-licenses.txt',{waitUntil:'domcontentloaded',timeout:30000});
    const isolation=await otherPage.evaluate(async payload=>{await fetch('/');const r=await fetch('/api/practice',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});return {status:r.status,body:await r.json()};},secondPayload);
    check('visitor-session-isolation',isolation.status===400&&!isolation.body.npc&&!isolation.body.tip);
    await other.close();
    const third=await send('third-turn-rejected','/api/practice',{...secondPayload,turn:3});check('only-two-turns',third.status===400);
  }else check('practice-two-live',false,{reason:'No first-turn session; skipped to avoid blind retry'});
  const search=await send('search','/api/experience?source=records');
  check('search-live',search.status===200&&search.data?.mode==='live'&&search.data.items?.length>0&&search.data.items.every(x=>{try{return ['www.zhihu.com','zhuanlan.zhihu.com'].includes(new URL(x.url).hostname)&&!!x.title;}catch{return false;}}));
  const auth=await send('oauth-status','/api/auth/status');check('oauth-explicitly-disabled',auth.status===200&&auth.data?.enabled===false&&auth.data.callbackUrl===base+'/api/auth/zhihu/callback');
  const callback=await page.evaluate(async()=>{const r=await fetch('/api/auth/zhihu/callback?authorization_code=do-not-reflect&state=do-not-reflect');return {status:r.status,reflected:(await r.text()).includes('do-not-reflect')};});
  check('reserved-callback-not-fake-login',callback.status===503&&!callback.reflected);
  check('resources-and-history-unchanged',original===digest({eventGame,summaryGame}));
  report.passed=report.checks.every(x=>x.passed);
}catch(error){report.error=String(error.message).slice(0,500);}
finally{await browser?.close();report.finishedAt=new Date().toISOString();await save();console.log(JSON.stringify({passed:report.passed,error:report.error,failedChecks:report.checks.filter(x=>!x.passed)}));process.exitCode=report.passed?0:1;}
