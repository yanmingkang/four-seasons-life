// Team-footage integration: real UI departures, real WebGL, native MP4 decode
// and playback through ended. Only local test servers and browser storage are
// used. The optional production smoke never injects a main-module handle.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {createServer} from 'node:net';
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {newGame,land,choose,advance,previewChoice,snapshot,restore} from '../src/engine.js';
import {EVENTS} from '../src/events.js';
import {CINEMATIC_MANIFEST} from '../src/cinematic-manifest.js';
import {JOURNEY_STORAGE_KEY} from '../src/journey-storage.js';

const root=fileURLToPath(new URL('../',import.meta.url)),out=new URL('../test-results/team-cinematics/',import.meta.url);
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_PATH||'C:/Users/25293/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const onlyBlockedAudio=process.env.TEAM_CINEMATICS_ONLY==='blocked-audio';
const report={passed:false,phase:'prepare',startedAt:new Date().toISOString(),cases:[],errors:[],apiIntercepted:[],externalBlocked:[],servers:[],
  method:{isolatedServer:true,isolatedStorage:true,user4173Untouched:true,realModelCalls:0,realCLICalls:0,allApisIntercepted:true,
    fixtures:'Replay-valid full-game ready saves; the tested next departure, dice, walk, arrival and three choices use the real game UI. Seeded earlier histories are not claimed as played.',
    playback:'Normal playback uses native HTMLVideoElement.play and requestVideoFrameCallback; ended, duration/currentTime and detached source release are recorded.',
    injection:'Source-server main response only adds read-only world/state/music access, a recorder around playCinematic, and the real new-game handler for one cancellation race. No world/video substitute except clearly labelled failure injections.',
    dice:'Only one-element Uint32Array crypto calls use case dice; production randomness code is unchanged.',productionRequested:process.env.TEAM_CINEMATICS_PRODUCTION==='1'}};
let browser,currentPage;
const servers=[];
await fs.mkdir(out,{recursive:true});
const save=()=>fs.writeFile(new URL(onlyBlockedAudio?'browser-blocked-audio.json':'browser.json',out),JSON.stringify(report,null,2));
const shot=(page,name)=>page.screenshot({path:fileURLToPath(new URL(`${name}.png`,out))});
function safeChoice(state){return state.active.options.map((option,index)=>({index,p:previewChoice(state,option)})).filter(option=>!option.p.disabled).sort((a,b)=>b.p.mood-a.p.mood||b.p.money-a.p.money)[0].index;}
function readyAt(position){let state=newGame('full',{name:'八段动画验收',talent:'optimistic',enriched:true});while(state.position<position){const pending=land(state,Math.min(6,position-state.position));state=advance(choose(pending,safeChoice(pending)));assert.equal(state.ended,null);}assert.equal(state.position,position);assert.equal(state.phase,'ready');assert.ok(restore(snapshot(state)));return state;}
async function startServer(production=false){
  const probe=createServer();await new Promise((resolve,reject)=>{probe.once('error',reject);probe.listen(0,'127.0.0.1',resolve);});const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
  const disabledCli=fileURLToPath(new URL('disabled-cli.exe',out));await assert.rejects(fs.access(disabledCli),{code:'ENOENT'});
  const child=spawn(process.execPath,['server.mjs',...(production?['--production']:[])],{cwd:root,windowsHide:true,env:{...process.env,PORT:String(port),ZHIHU_CLI_PATH:disabledCli},stdio:['ignore','pipe','pipe']});servers.push(child);
  let failure,log='';child.on('error',error=>{failure=error;});for(const stream of [child.stdout,child.stderr])stream.on('data',data=>{log=(log+data).slice(-8000);});
  const base=`http://127.0.0.1:${port}`;report.servers.push({base,production,owned:true});
  if(production){const html=await fs.readFile(new URL('../dist/index.html',import.meta.url),'utf8'),scripts=[...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map(match=>match[1]);report.productionBuild={indexSha256:createHash('sha256').update(html).digest('hex'),scripts,scriptHashes:await Promise.all(scripts.map(async path=>({path,sha256:createHash('sha256').update(await fs.readFile(new URL(`../dist${path}`,import.meta.url))).digest('hex')})))};}
  for(let i=0;i<100;i++){if(failure)throw failure;if(child.exitCode!==null)throw Error(`Owned server exited: ${log}`);try{if((await fetch(base,{signal:AbortSignal.timeout(1000)})).ok)return base;}catch{}await delay(100);}
  throw Error(`Owned server unavailable: ${log}`);
}
async function readGame(page){const saved=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).game,JOURNEY_STORAGE_KEY),state=restore(saved);assert.ok(state,'Browser save remains replay-valid');return state;}
async function setup(base,test){
  const seed=readyAt(test.before??test.cell-2),row={...test,passed:false,seededPosition:seed.position,seededHistory:seed.history.length,videoRequests:[]};report.cases.push(row);report.phase=`${test.name}-load`;await save();
  const context=await browser.newContext({viewport:{width:test.width||1440,height:test.height||900},reducedMotion:test.reduced?'reduce':'no-preference',serviceWorkers:'block'});
  await context.route('**/*',async route=>{
    const url=new URL(route.request().url());if(url.origin!==base){report.externalBlocked.push({case:test.name,url:url.origin+url.pathname});return route.abort();}
    if(url.pathname.startsWith('/api/')){report.apiIntercepted.push({case:test.name,path:url.pathname});return route.fulfill({status:503,contentType:'application/json',body:'{"error":"offline_team_cinematics_test"}'});}
    if(url.pathname.endsWith('.mp4')){row.videoRequests.push(url.pathname);if(test.fault==='404')return route.fulfill({status:404,contentType:'text/plain',body:'Deliberate missing test video'});}
    if(!test.production&&url.pathname==='/src/main.js'){
      const response=await route.fetch();let body=await response.text();assert.equal((body.match(/await playCinematic\(/g)||[]).length,1,'One actual main video call is observed');
      body=body.replace('await playCinematic(','await window.__teamQA.invoke(playCinematic,');
      body+='\nwindow.__teamMain={getState:()=>state,getWorld:()=>world,getMusic:()=>music?.getStatus(),newGame:()=>start("full")};\n';return route.fulfill({response,body});
    }return route.continue();
  });
  await context.routeWebSocket('**/*',socket=>{
    const url=new URL(socket.url()),owned=new URL(base);if(!test.production&&url.hostname===owned.hostname&&url.port===owned.port&&socket.protocols().includes('vite-hmr')){
      const local=socket.connectToServer();local.onMessage(message=>{let payload;try{payload=JSON.parse(message.toString());}catch{}if(!['update','full-reload','prune'].includes(payload?.type))socket.send(message);});return;
    }report.externalBlocked.push({case:test.name,url:socket.url()});socket.close();
  });
  await context.addInitScript(({key,game,dice,sound,fault,blockBgm})=>{
    localStorage.setItem('four-seasons-auto-depart','off');localStorage.setItem('four-seasons-music',sound?'on':'off');localStorage.setItem(key,JSON.stringify({game,seconds:30,practiceInvitation:{version:1,seen:true,resolved:true,kind:'fallback'}}));
    const qa=window.__teamQA={calls:[],records:[],nodes:[],frames:[],worldEvents:[],dice:[],domStates:[],maxConcurrent:0};
    if(blockBgm){
      const Native=globalThis.AudioContext;let contexts=0;
      class BlockedBgmContext extends Native {constructor(...args){super(...args);this.__testBlockedBgm=++contexts===1;}resume(){return this.__testBlockedBgm?Promise.reject(new DOMException('Deliberate BGM-only unlock rejection','NotAllowedError')):super.resume();}}
      globalThis.AudioContext=BlockedBgmContext;if(globalThis.webkitAudioContext)globalThis.webkitAudioContext=BlockedBgmContext;
    }
    const nativeRandom=crypto.getRandomValues.bind(crypto);crypto.getRandomValues=array=>{if(array instanceof Uint32Array&&array.length===1){const die=dice[qa.dice.length];if(!die)throw Error('Unexpected extra test dice');qa.dice.push(die);array[0]=Math.floor(((die-.5)/6)*4294967296);return array;}return nativeRandom(array);};
    const tracked=new WeakMap();
    qa.track=video=>{
      if(tracked.has(video))return tracked.get(video);
      const record={id:qa.records.length,createdAt:performance.now(),events:[],decodedFrames:0,maxCurrentTime:0,playCalls:0};qa.nodes.push(video);qa.records.push(record);tracked.set(video,record);
      for(const name of ['loadedmetadata','loadeddata','playing','pause','timeupdate','ended','error','emptied','volumechange','stalled','waiting'])video.addEventListener(name,()=>{
        const event={name,at:performance.now(),currentTime:video.currentTime,duration:Number.isFinite(video.duration)?video.duration:null,ended:video.ended,paused:video.paused,muted:video.muted,readyState:video.readyState,error:video.error?.code||null};record.events.push(event);
        if(video.currentSrc||video.getAttribute('src'))record.src=video.currentSrc||video.getAttribute('src');record.maxCurrentTime=Math.max(record.maxCurrentTime,video.currentTime);record.duration=Number.isFinite(video.duration)?video.duration:record.duration;record.width=video.videoWidth||record.width;record.height=video.videoHeight||record.height;
      },true);
      const frame=(_,metadata)=>{record.decodedFrames++;record.maxMediaTime=Math.max(record.maxMediaTime||0,metadata.mediaTime);if(video.isConnected)video.requestVideoFrameCallback(frame);};video.requestVideoFrameCallback?.(frame);return record;
    };
    const nativePlay=HTMLMediaElement.prototype.play;HTMLMediaElement.prototype.play=function(){if(this.tagName==='VIDEO'){const record=qa.track(this);record.playCalls++;if(fault==='codec-reject')return Promise.reject(new DOMException('Deliberate codec rejection fixture','NotSupportedError'));if(fault==='never-load')return new Promise(()=>{});}return nativePlay.call(this);};
    if(fault==='never-load'){
      const descriptor=Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype,'src');Object.defineProperty(HTMLMediaElement.prototype,'src',{...descriptor,set(value){if(this.tagName==='VIDEO'){qa.track(this).requestedSrc=String(value);return;}descriptor.set.call(this,value);}});
    }
    qa.invoke=async(fn,container,id,options)=>{const call={id,startedAt:performance.now(),options:Object.keys(options||{}),activeCell:window.__teamMain?.getState()?.active?.number};qa.calls.push(call);try{call.result=await fn(container,id,options);return call.result;}finally{call.finishedAt=performance.now();call.wallMilliseconds=call.finishedAt-call.startedAt;}};
    document.addEventListener('worldstage',event=>{if(event.target.id==='scene')qa.worldEvents.push({at:performance.now(),...event.detail});},true);
    const observer=new MutationObserver(()=>{for(const video of document.querySelectorAll('#cinematic-stage video'))qa.track(video);qa.maxConcurrent=Math.max(qa.maxConcurrent,document.querySelectorAll('#cinematic-stage video').length);});observer.observe(document,{childList:true,subtree:true});
    const frame=now=>{const root=document.querySelector('.cinematic'),video=document.querySelector('.cine-video');if(root){qa.domStates.push({at:now,classes:root.className,mode:root.dataset.mode,paused:root.dataset.paused,stage:document.querySelector('.experience')?.dataset.stage,choices:document.querySelectorAll('[data-choice]').length,videoTime:video?.currentTime??null,opacity:Number(getComputedStyle(root).opacity)});if(video)qa.track(video).maxCurrentTime=Math.max(qa.track(video).maxCurrentTime,video.currentTime);}requestAnimationFrame(frame);};requestAnimationFrame(frame);
    qa.snapshot=()=>({calls:qa.calls,records:qa.records.map((record,i)=>({...record,released:{connected:qa.nodes[i].isConnected,src:qa.nodes[i].getAttribute('src'),paused:qa.nodes[i].paused}})),worldEvents:qa.worldEvents,dice:qa.dice,domStates:qa.domStates,maxConcurrent:qa.maxConcurrent});
  },{key:JOURNEY_STORAGE_KEY,game:snapshot(seed),dice:test.dice||[test.die||1],sound:Boolean(test.sound),fault:test.fault,blockBgm:Boolean(test.blockBgm)});
  const page=currentPage=await context.newPage();page.setDefaultTimeout(45000);page.on('pageerror',error=>report.errors.push({case:test.name,message:error.message}));await page.goto(base);
  await page.locator('#scene[data-assets="ready"][data-renderer="webgl"]').waitFor();if(!test.production)await page.waitForFunction(()=>window.__teamMain);
  await page.locator('#start-full').click();await page.locator('#resume').click();await page.locator('.experience[data-stage="ready"]').waitFor();assert.equal((await readGame(page)).position,seed.position);
  return {page,context,row,seed};
}
async function depart(page,seed,test){
  await page.locator('#continue-travel').click();if(seed.season!==EVENTS[test.cell-1].season){await page.locator('.chapter-continue').waitFor();await page.locator('.chapter-continue').click();}
}
async function layout(page){return page.locator('.cinematic').evaluate(root=>{
  const video=root.querySelector('video'),style=getComputedStyle(video),r=video.getBoundingClientRect(),rect=root.getBoundingClientRect(),skip=root.querySelector('.cine-skip'),b=skip.getBoundingClientRect();
  const scale=Math.min(r.width/video.videoWidth,r.height/video.videoHeight),contentWidth=video.videoWidth*scale,contentHeight=video.videoHeight*scale,card=root.querySelector('.cine-card');
  return {root:rect.toJSON(),video:r.toJSON(),intrinsic:[video.videoWidth,video.videoHeight],objectFit:style.objectFit,contentWidth,contentHeight,displayAspect:contentWidth/contentHeight,
    skip:b.toJSON(),skipHit:skip.contains(document.elementFromPoint(b.x+b.width/2,b.y+b.height/2)),captionVisible:[...root.querySelectorAll('.cine-caption')].some(node=>getComputedStyle(node).display!=='none'&&node.getBoundingClientRect().height>0),
    text:root.innerText,cardBackground:card?getComputedStyle(card).backgroundColor:null,pageOverflow:document.documentElement.scrollWidth>innerWidth};
  });}
function assertLayout(data,test){
  const width=test.width||1440,height=test.height||900;assert.equal(data.objectFit,'contain');assert.ok(Math.abs(data.intrinsic[0]/data.intrinsic[1]-16/9)<.01);assert.ok(Math.abs(data.displayAspect-16/9)<.01);
  assert.ok(data.root.x<=1&&data.root.y<=1&&data.root.right>=width-1&&data.root.bottom>=height-1,'Cinematic covers the complete game area');
  assert.ok(data.video.width>=width*.9&&data.video.height>=height*.9,'Video occupies full game area, not a small story card');
  assert.ok(data.skip.x>=0&&data.skip.y>=0&&data.skip.right<=width+1&&data.skip.bottom<=height+1);assert.equal(data.skipHit,true);assert.equal(data.captionVisible,false);assert.equal(data.pageOverflow,false);
  assert.ok(data.text.length<100,'Video overlay stays concise');assert.doesNotMatch(data.text,/[+−-]\s*\d|情绪.*\d|资金.*\d|专业.*\d/);
}
async function waitChoice(page,test,row){
  await page.locator('.experience[data-stage="choice"]').waitFor();assert.equal(await page.locator('[data-choice]').count(),3);assert.ok(await page.locator('[data-choice]:not(:disabled)').count()>0);assert.equal(await page.locator('#cinematic-stage video').count(),0);
  assert.equal(await page.locator('#cinematic-stage').isVisible(),false);assert.equal(await page.locator('.cine-caption').count(),0);
  const state=await readGame(page);assert.equal(state.position,test.cell-1);assert.equal(state.active.number,test.cell);assert.doesNotMatch(await page.locator('.options').innerText(),/[+−-]\s*\d|条件已满足|条件未满足|需要 [\d,]+ 元/);
  row.final={cell:state.active.number,phase:state.phase,history:state.history.length};
}
async function finishCase(page,context,row){
  row.trace=await page.evaluate(()=>window.__teamQA.snapshot());assert.ok(row.trace.maxConcurrent<=1,'Never two live cutscene videos');
  for(const record of row.trace.records)assert.deepEqual(record.released,{connected:false,src:null,paused:true},'Every finished video releases its source');
  row.webgl=await page.locator('#scene canvas').evaluate(canvas=>{const gl=canvas.getContext('webgl2');return {lost:gl.isContextLost(),error:gl.getError()};});assert.deepEqual(row.webgl,{lost:false,error:0});
  row.passed=true;await save();await context.close();currentPage=null;console.log(`Team cinematics ${row.name}: passed`);
}
async function playbackCase(base,test){
  const {page,context,row,seed}=await setup(base,test);report.phase=`${test.name}-depart`;await depart(page,seed,test);await page.locator('.cine-video').waitFor();
  await page.waitForFunction(()=>{const v=document.querySelector('.cine-video');return v&&v.currentTime>.35&&!v.paused;});report.phase=`${test.name}-playback`;
  row.layout=await layout(page);await shot(page,`${test.name}-playing`);assertLayout(row.layout,test);
  if(test.sound){
    row.audio=await page.locator('.cine-video').evaluate(video=>({muted:video.muted,volume:video.volume,audioBytes:video.webkitAudioDecodedByteCount||0,music:window.__teamMain?.getMusic()}));
    if(test.silent){assert.equal(row.audio.audioBytes,0);assert.equal(row.audio.music.playing,true,'Silent cell 8 never interrupts the season BGM');row.audio.silentFilm=true;}
    else{
      assert.equal(row.audio.muted,false);assert.ok(row.audio.audioBytes>0,'The sound integration case has a decoded audio track');assert.equal(row.audio.music.playing,false,'BGM yields while the audible film plays');
      await page.locator('.cine-sound').click();await page.waitForFunction(()=>document.querySelector('.cine-video')?.muted===true);
      await page.locator('.cine-sound').click();await page.waitForFunction(()=>document.querySelector('.cine-video')?.muted===false);row.audio.settingRoundTrip=true;
    }
  }else assert.equal(await page.locator('.cine-video').evaluate(video=>video.muted),true);
  if(test.pause){
    await page.waitForFunction(()=>document.querySelector('.cine-video')?.currentTime>2);await page.setViewportSize({width:390,height:844});await page.locator('#orientation-gate').waitFor();await page.waitForTimeout(150);
    const before=await page.locator('.cine-video').evaluate(video=>({currentTime:video.currentTime,paused:video.paused,duration:video.duration}));assert.equal(before.paused,true);await page.waitForTimeout(1250);
    const after=await page.locator('.cine-video').evaluate(video=>({currentTime:video.currentTime,paused:video.paused,duration:video.duration}));assert.ok(Math.abs(after.currentTime-before.currentTime)<.08);assert.equal(after.paused,true);row.pause={heldMilliseconds:1250,before,after};
    await page.setViewportSize({width:test.width||1440,height:test.height||900});await page.locator('#orientation-gate').waitFor({state:'hidden'});await page.waitForFunction(()=>{const v=document.querySelector('.cine-video');return v&&!v.paused;});
  }
  await waitChoice(page,test,row);assert.equal(row.final.history,seed.history.length);await shot(page,`${test.name}-choice`);row.trace=await page.evaluate(()=>window.__teamQA.snapshot());
  assert.equal(row.trace.records.length,1);const record=row.trace.records[0],ended=record.events.find(event=>event.name==='ended');assert.ok(ended,'Native video reached ended, not only metadata or a fixed timeout');
  assert.ok(ended.currentTime>=record.duration-.12);assert.ok(record.decodedFrames>10,'Actual native decoded frames were presented');assert.ok(record.maxMediaTime>=record.duration-.25,'Decoded frames reached the real tail');assert.equal(new URL(record.src,base).pathname,CINEMATIC_MANIFEST.find(item=>item.cell===test.cell).src);
  if(test.cell===18)assert.ok(record.duration>8,'Hospital long clip is not capped at five seconds');
  assert.ok(row.trace.domStates.every(sample=>sample.choices===0),'No choices or outcomes leaked while footage was visible');
  const tail=row.trace.domStates.filter(sample=>sample.at>=ended.at);row.fade={postEndedFrames:tail.length,minOpacity:tail.length?Math.min(...tail.map(sample=>sample.opacity)):null,classes:[...new Set(tail.map(sample=>sample.classes))]};assert.ok(tail.length>0,'Ended video keeps a short fade-out before choice');assert.ok(tail.some(sample=>sample.classes.includes('is-leaving')));assert.ok(row.fade.minOpacity<.9,'Tail actually fades instead of only delaying cleanup');
  if(!test.production){assert.equal(row.trace.calls.length,1);assert.equal(row.trace.calls[0].activeCell,test.cell);assert.equal(row.trace.calls[0].result.status,'completed');assert.equal(row.trace.calls[0].result.mode,'video');}
  if(test.sound){await page.waitForFunction(()=>window.__teamMain.getMusic()?.playing===true);row.audio.restored=await page.evaluate(()=>window.__teamMain.getMusic());}
  await finishCase(page,context,row);
}
async function ordinaryCase(base,test){
  const {page,context,row,seed}=await setup(base,test);report.phase=`${test.name}-depart`;await depart(page,seed,test);await waitChoice(page,test,row);
  const trace=await page.evaluate(()=>window.__teamQA.snapshot());assert.equal(trace.calls.length,0);assert.equal(trace.records.length,0);assert.equal(row.videoRequests.length,0);assert.equal(row.final.history,seed.history.length);
  if(test.cell===13){const state=await readGame(page);await page.locator(`[data-choice="${safeChoice(state)}"]`).click();await page.locator('#practice-open').waitFor();row.naturalPracticeRetained=true;}
  await shot(page,`${test.name}-result`);await finishCase(page,context,row);
}
async function exitCase(base,test){
  const {page,context,row,seed}=await setup(base,test);report.phase=`${test.name}-depart`;await depart(page,seed,test);
  if(test.reduced){await waitChoice(page,test,row);const trace=await page.evaluate(()=>window.__teamQA.snapshot());assert.equal(trace.records.length,0);assert.equal(trace.calls[0].result.reason,'reduced-motion');}
  else if(test.fault){
    await page.locator('.cinematic').waitFor();await page.waitForFunction(()=>{const root=document.querySelector('.cinematic');return root?.dataset.mode==='storyboard'&&!root.querySelector('video');});await shot(page,`${test.name}-fallback`);await waitChoice(page,test,row);
    const trace=await page.evaluate(()=>window.__teamQA.snapshot());assert.equal(trace.calls[0].result.mode,'storyboard');assert.ok(trace.calls[0].wallMilliseconds<9500,'Failure does not trap the player');if(test.fault==='never-load')assert.ok(trace.calls[0].wallMilliseconds>=7000,'Never-load uses its load grace plus the local fallback, not an instant fake completion');row.fallbackMilliseconds=trace.calls[0].wallMilliseconds;
  }else{
    await page.waitForFunction(()=>document.querySelector('.cine-video')?.currentTime>.3);if(test.exit==='escape'){await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.querySelector('.cinematic').contains(document.activeElement)),true);await page.keyboard.press('Escape');}else await page.locator('.cine-skip').click();
    await waitChoice(page,test,row);assert.equal((await page.evaluate(()=>window.__teamQA.snapshot())).calls[0].result.status,'skipped');
  }
  assert.equal(row.final.history,seed.history.length);await shot(page,`${test.name}-choice`);await finishCase(page,context,row);
}
async function replacementCase(base){
  const test={name:'new-game-cancels-stale-film',cell:6,dice:[1,6],width:1440,height:900}, {page,context,row,seed}=await setup(base,test);report.phase=test.name;await depart(page,seed,test);
  await page.waitForFunction(()=>document.querySelector('.cine-video')?.currentTime>.4);await page.evaluate(()=>window.__teamMain.newGame());await page.locator('.chapter-continue').waitFor();
  assert.equal(await page.locator('.cine-video').count(),0);await page.locator('.chapter-continue').click();await page.locator('.experience[data-stage="ready"]').waitFor();const fresh=await readGame(page);assert.equal(fresh.position,-1);assert.equal(fresh.history.length,0);
  await page.locator('#continue-travel').click();await page.waitForFunction(()=>document.querySelector('.cine-video')?.currentTime>.4);assert.equal(await page.locator('.cine-video').count(),1);await page.locator('.cine-skip').click();await waitChoice(page,test,row);
  const trace=await page.evaluate(()=>window.__teamQA.snapshot());assert.equal(trace.calls.length,2);assert.equal(trace.calls[0].result.status,'cancelled');assert.equal(trace.calls[1].result.status,'skipped');assert.equal(trace.records.length,2);row.newGamePosition=fresh.position;await finishCase(page,context,row);
}
async function blockedAudioCase(base){
  const test={name:'bgm-blocked-film-mute',cell:6,sound:true,blockBgm:true,width:844,height:390},{page,context,row,seed}=await setup(base,test);report.phase=test.name;
  await page.waitForFunction(()=>window.__teamMain.getMusic()?.blocked===true);row.blockedMusic=await page.evaluate(()=>window.__teamMain.getMusic());await depart(page,seed,test);
  await page.waitForFunction(()=>{const video=document.querySelector('.cine-video');return video&&video.currentTime>.35&&!video.paused&&!video.muted;});
  await page.locator('.cine-sound').click();await page.waitForFunction(()=>document.querySelector('.cine-video')?.muted===true);
  assert.equal(await page.evaluate(()=>localStorage.getItem('four-seasons-music')),'off','Film mute uses global sound state even if BGM failed to unlock');
  row.mutedWhileBgmBlocked=true;await shot(page,`${test.name}-muted`);await page.locator('.cine-skip').click();await waitChoice(page,test,row);assert.equal(row.final.history,seed.history.length);await finishCase(page,context,row);
}
try{
  assert.deepEqual(CINEMATIC_MANIFEST.map(item=>item.cell),[6,8,11,15,18,22,27,31],'Team cutscene mapping must be ready before this test runs');assert.equal(EVENTS[12].cinematicId,null);assert.equal(EVENTS[7].cinematicId,'cell-08');
  report.source=await Promise.all(['src/main.js','src/cinematics.js','src/cinematics.css','src/cinematic-player.css','src/cinematic-manifest.js','src/events.js'].map(async path=>({path,sha256:createHash('sha256').update(await fs.readFile(new URL(`../${path}`,import.meta.url))).digest('hex')})));
  report.media=await Promise.all(CINEMATIC_MANIFEST.map(async item=>{const directory=[8,31].includes(item.cell)?'/cinematics/team-20260912-repaired-20260913':'/cinematics/team-20260912';assert.equal(item.src,`${directory}/${item.id}.mp4`);const data=await fs.readFile(new URL(`../public${item.src}`,import.meta.url));return {cell:item.cell,src:item.src,poster:item.poster,bytes:data.length,sha256:createHash('sha256').update(data).digest('hex')};}));
  const base=await startServer();browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--use-gl=angle','--use-angle=d3d11','--ignore-gpu-blocklist']});
  if(onlyBlockedAudio)await blockedAudioCase(base);else{
  for(const [index,item] of CINEMATIC_MANIFEST.entries())await playbackCase(base,{name:`cell-${String(item.cell).padStart(2,'0')}-${index%2?'844':'1440'}`,cell:item.cell,width:index%2?844:1440,height:index%2?390:900,sound:[6,8].includes(item.cell),silent:item.cell===8,pause:item.cell===18});
  await ordinaryCase(base,{name:'cell-13-no-film-practice-remains',cell:13,width:1440,height:900});await ordinaryCase(base,{name:'passing-cell-08-does-not-play',cell:9,before:6,die:2,width:844,height:390});
  for(const fault of ['404','codec-reject','never-load'])await exitCase(base,{name:`failure-${fault}`,cell:6,fault,width:844,height:390});
  await exitCase(base,{name:'skip-button',cell:8,width:844,height:390});await exitCase(base,{name:'escape-key',cell:6,width:1440,height:900,exit:'escape'});await exitCase(base,{name:'reduced-motion',cell:8,width:844,height:390,reduced:true});await replacementCase(base);
  if(report.method.productionRequested){const production=await startServer(true);await playbackCase(production,{name:'production-cell-08-844',cell:8,width:844,height:390,production:true});}else report.productionSkipped='Enable TEAM_CINEMATICS_PRODUCTION=1 after the final build exists.';
  }
  assert.deepEqual(report.errors,[]);assert.deepEqual(report.externalBlocked,[]);report.passed=true;report.phase='complete';console.log(JSON.stringify({passed:true,cases:report.cases.length,actualFilmsToEnded:report.cases.filter(row=>row.fade).length,pageErrors:0,realModelCalls:0}));
}catch(error){report.failure={phase:report.phase,name:error.name,message:error.message,stack:error.stack};if(currentPage)try{await shot(currentPage,'failure');}catch{}console.error(JSON.stringify(report.failure));process.exitCode=1;
}finally{report.finishedAt=new Date().toISOString();await save();await browser?.close();for(const server of servers)server.kill();}
