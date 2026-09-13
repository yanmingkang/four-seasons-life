// Four bounded, production-only UI departures: two repaired films at two sizes.
// Earlier turns are explicit replay-valid fixtures, never claimed as full games.
// This does not edit media, call real APIs, patch shipped JS or accelerate time.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {createServer} from 'node:net';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
import {newGame,land,choose,advance,previewChoice,snapshot,restore} from '../src/engine.js';
import {CINEMATIC_MANIFEST,getCinematic} from '../src/cinematic-manifest.js';
import {EVENTS} from '../src/events.js';
import {JOURNEY_STORAGE_KEY} from '../src/journey-storage.js';

const root=fileURLToPath(new URL('../',import.meta.url));
const out=fileURLToPath(new URL('../test-results/repaired-cinematics/',import.meta.url));
const repaired='/cinematics/team-20260912-repaired-20260913';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'C:/Users/25293/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const report={passed:false,startedAt:new Date().toISOString(),phase:'prepare',http:[],cases:[],errors:[],method:{
  production:true,isolatedServer:true,user4173Untouched:true,allApisIntercepted:true,externalTrafficBlocked:true,realApiCalls:0,realCLICalls:0,
  scope:'Cell 08 and 31, each at 1280x800 and 844x390, four isolated one-departure regressions, not four complete games.',
  fixtures:'Legal engine histories to immediately before each target. The next one-step roll, walking, native movie and arrival at three choices use actual production UI.',
  randomness:'Only one-element Uint32 entropy uses face 1; production six-face conversion unchanged.',
  animation:'Normal speed, no skipped seasons/films or clock changes. Native loadeddata, decoded frames, ended and poster loading are recorded without replacing play().',
  range:'Existing production server intentionally sends a complete 200 response for Range. Verify complete bytes and correct headers, not a newly added 206 partial-response feature.',
}};
let browser,server,currentPage;
await fs.mkdir(out,{recursive:true});const save=()=>fs.writeFile(`${out}/browser-production.json`,JSON.stringify(report,null,2));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function seedBefore(cell){
  let state=newGame('full',{enriched:true,talent:'optimistic',name:'修补影片专项'});
  while(state.position<cell-2){
    state=land(state,Math.min(6,cell-2-state.position));
    // Fixture construction only; selecting recovery avoids unrelated early exit.
    const options=state.active.options.map((option,index)=>({index,preview:previewChoice(state,option)})).filter(option=>!option.preview.disabled).sort((a,b)=>b.preview.mood-a.preview.mood||b.preview.money-a.preview.money);
    state=advance(choose(state,options[0].index));assert.equal(state.ended,null);
  }
  assert.equal(state.position,cell-2);assert.equal(state.phase,'ready');assert.ok(restore(snapshot(state)));return state;
}
async function startServer(){
  const html=await fs.readFile(`${root}/dist/index.html`,'utf8');
  const names=(await fs.readdir(`${root}/dist/assets`)).filter(name=>/^(?:main|index)-.*\.(?:js|css)$/.test(name));
  report.build={indexSha256:hash(html),assets:await Promise.all(names.map(async name=>({name,sha256:hash(await fs.readFile(`${root}/dist/assets/${name}`))})))};
  const probe=createServer();await new Promise((resolve,reject)=>{probe.once('error',reject);probe.listen(0,'127.0.0.1',resolve);});const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
  const disabledCli=`${out}/disabled-cli.exe`;await assert.rejects(fs.access(disabledCli),{code:'ENOENT'});
  server=spawn(process.execPath,['server.mjs','--production'],{cwd:root,windowsHide:true,env:{...process.env,PORT:String(port),ZHIHU_CLI_PATH:disabledCli},stdio:'ignore'});
  let startupError;server.on('error',error=>{startupError=error;});const base=`http://127.0.0.1:${port}`;report.server={base,isolated:true};
  for(let attempt=0;attempt<100;attempt++){
    if(startupError)throw startupError;if(server.exitCode!==null)throw Error('Isolated production server exited');
    try{if((await fetch(base,{signal:AbortSignal.timeout(1000)})).ok)return base;}catch{}
    await delay(100);
  }
  throw Error('Isolated server unavailable');
}
async function verifyHttp(base,item){
  for(const [path,type]of [[item.src,'video/mp4'],[item.poster,'image/jpeg']]){
    const file=await fs.readFile(`${root}/public${path}`),compiled=await fs.readFile(`${root}/dist${path}`);
    assert.equal(hash(compiled),hash(file),'Production build contains the exact repaired asset');
    for(const [name,options]of [['GET',{}],['HEAD',{method:'HEAD'}],...(path===item.src?[['Range',{headers:{Range:'bytes=0-1023'}}]]:[])]){
      const response=await fetch(`${base}${path}`,options),body=Buffer.from(await response.arrayBuffer());
      const row={cell:item.cell,path,request:name,status:response.status,type:response.headers.get('content-type'),length:response.headers.get('content-length'),contentRange:response.headers.get('content-range'),receivedBytes:body.length,sha256:name==='HEAD'?null:hash(body)};report.http.push(row);
      assert.equal(response.status,200);assert.equal(row.type,type);assert.equal(Number(row.length),file.length);assert.equal(row.contentRange,null);
      if(name==='HEAD')assert.equal(body.length,0);else assert.equal(hash(body),hash(file));
    }
  }
}
async function readState(page){const saved=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).game,JOURNEY_STORAGE_KEY);const state=restore(saved);assert.ok(state,'Stored game is replay-valid');return state;}
async function capture(page,row,name){
  const path=`${out}/${row.name}-${name}.png`;await page.screenshot({path});row.screenshots.push(path);
}
async function playback(base,cell,width,height){
  const item=getCinematic(cell),seed=seedBefore(cell),row={name:`cell-${String(cell).padStart(2,'0')}-${width}x${height}`,cell,viewport:{width,height},passed:false,screenshots:[],requests:[],apiIntercepted:[],externalBlocked:[],fixture:snapshot(seed)};
  report.cases.push(row);report.phase=`${row.name}-load`;await save();
  const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:1,reducedMotion:'no-preference',serviceWorkers:'block'});
  await context.route('**/*',route=>{const request=route.request(),url=new URL(request.url());if(url.origin!==base&&!['data:','blob:'].includes(url.protocol)){row.externalBlocked.push(url.origin+url.pathname);return route.abort();}if(url.pathname.startsWith('/cinematics/'))row.requests.push({path:url.pathname,range:request.headers().range||null});return route.continue();});
  await context.route('**/api/**',route=>{row.apiIntercepted.push(new URL(route.request().url()).pathname);return route.fulfill({status:503,json:{error:'Isolated repaired-film regression; real APIs disabled'}});});
  await context.routeWebSocket('**/*',socket=>{row.externalBlocked.push(socket.url());socket.close();});
  await context.addInitScript(({key,game})=>{
    localStorage.setItem('four-seasons-auto-depart','off');localStorage.setItem('four-seasons-music','off');
    localStorage.setItem(key,JSON.stringify({game,seconds:0,practiceInvitation:{version:1,seen:true,resolved:true,kind:'fallback'}}));
    const random=crypto.getRandomValues.bind(crypto);crypto.getRandomValues=array=>{if(array instanceof Uint32Array&&array.length===1){array[0]=Math.floor(.5/6*2**32);return array;}return random(array);};
    const qa=window.__repairedCineQA={videos:[],nodes:[],posters:[],frames:[]},seen=new WeakSet(),seenPosters=new WeakSet();
    function observe(){
      for(const video of document.querySelectorAll('video.cine-video'))if(!seen.has(video)){
        seen.add(video);qa.nodes.push(video);const record={src:video.getAttribute('src'),poster:video.getAttribute('poster'),events:[],decodedFrames:0,lastMediaTime:0};qa.videos.push(record);
        for(const name of ['loadedmetadata','loadeddata','playing','ended','error'])video.addEventListener(name,()=>{
          record.events.push({name,at:performance.now(),time:video.currentTime,duration:video.duration,error:video.error?.code||null});
          record.src=video.currentSrc||record.src;record.width=video.videoWidth;record.height=video.videoHeight;record.duration=video.duration;
        });
        const frame=(_at,metadata)=>{record.decodedFrames++;record.lastMediaTime=metadata.mediaTime;if(video.isConnected)video.requestVideoFrameCallback(frame);};video.requestVideoFrameCallback?.(frame);
      }
      for(const poster of document.querySelectorAll('.cine-poster'))if(!seenPosters.has(poster)){
        seenPosters.add(poster);const record={src:poster.getAttribute('src'),loaded:poster.complete&&poster.naturalWidth>0,error:false,width:poster.naturalWidth,height:poster.naturalHeight};qa.posters.push(record);
        poster.addEventListener('load',()=>Object.assign(record,{loaded:true,width:poster.naturalWidth,height:poster.naturalHeight}));poster.addEventListener('error',()=>{record.error=true;});
      }
    }
    new MutationObserver(observe).observe(document,{subtree:true,childList:true});
    function frame(at){const root=document.querySelector('.cinematic');if(root)qa.frames.push({at,mode:root.dataset.mode,opacity:Number(getComputedStyle(root).opacity),className:root.className,choices:document.querySelectorAll('[data-choice]').length});requestAnimationFrame(frame);}requestAnimationFrame(frame);
    qa.snapshot=()=>({videos:qa.videos.map((record,index)=>({...record,released:{connected:qa.nodes[index].isConnected,src:qa.nodes[index].getAttribute('src'),paused:qa.nodes[index].paused}})),posters:qa.posters,frames:qa.frames});
  },{key:JOURNEY_STORAGE_KEY,game:snapshot(seed)});
  const page=currentPage=await context.newPage();page.setDefaultTimeout(60000);page.on('pageerror',error=>report.errors.push({case:row.name,message:error.message}));await page.goto(base);
  await page.locator('#scene[data-assets="ready"][data-renderer="webgl"]').waitFor();await page.locator('#start-full').click();await page.locator('#resume').click();await page.locator('.experience[data-stage="ready"]').waitFor();
  assert.deepEqual(snapshot(await readState(page)),snapshot(seed));await page.locator('#continue-travel').click();
  await page.waitForFunction(()=>{const video=document.querySelector('.cine-video');return video&&video.currentTime>.35&&!video.paused;});
  await page.waitForFunction(()=>{const poster=document.querySelector('.cine-poster');return poster?.complete&&poster.naturalWidth>0;});
  row.layout=await page.locator('.cinematic').evaluate(root=>{const video=root.querySelector('video'),rect=video.getBoundingClientRect(),skip=root.querySelector('.cine-skip'),button=skip.getBoundingClientRect();return {root:root.getBoundingClientRect().toJSON(),video:rect.toJSON(),objectFit:getComputedStyle(video).objectFit,width:video.videoWidth,height:video.videoHeight,src:new URL(video.currentSrc).pathname,poster:new URL(video.poster).pathname,skipHit:skip.contains(document.elementFromPoint(button.x+button.width/2,button.y+button.height/2)),pageOverflow:document.documentElement.scrollWidth>innerWidth};});
  assert.equal(row.layout.src,item.src);assert.equal(row.layout.poster,item.poster);assert.equal(row.layout.objectFit,'contain');assert.equal(row.layout.width,1280);assert.equal(row.layout.height,720);assert.equal(row.layout.skipHit,true);assert.equal(row.layout.pageOverflow,false);
  assert.ok(row.layout.root.left<=1&&row.layout.root.top<=1&&row.layout.root.right>=width-1&&row.layout.root.bottom>=height-1);
  await capture(page,row,'playing');report.phase=`${row.name}-native-ended`;await save();
  await page.locator('.experience[data-stage="choice"]').waitFor();
  await page.evaluate(async()=>{await Promise.all(document.querySelector('#story-panel').getAnimations({subtree:true}).filter(animation=>animation.effect?.getTiming().iterations!==Infinity).map(animation=>animation.finished.catch(()=>{})));});
  row.choices=await page.locator('[data-choice]').evaluateAll(nodes=>nodes.map(node=>({index:Number(node.dataset.choice),text:node.innerText,disabled:node.disabled})));
  assert.deepEqual(row.choices.map(choice=>choice.index),[0,1,2]);assert.ok(row.choices.some(choice=>!choice.disabled));assert.ok(row.choices.every(choice=>!/[+−-]\s*\d/.test(choice.text)));
  assert.equal(await page.locator('.choice-effects,.condition-note').count(),0);assert.equal(await page.locator('.cine-video').count(),0);assert.equal(await page.locator('#cinematic-stage').isVisible(),false);
  const final=await readState(page);assert.equal(final.position,cell-1);assert.equal(final.phase,'choice');assert.equal(final.history.length,seed.history.length);assert.equal(final.mood,seed.mood);assert.equal(final.money,seed.money);
  row.trace=await page.evaluate(()=>window.__repairedCineQA.snapshot());assert.equal(row.trace.videos.length,1);assert.equal(row.trace.posters.length,1);const video=row.trace.videos[0];
  assert.ok(video.events.some(event=>event.name==='loadeddata'));assert.ok(video.events.some(event=>event.name==='ended'),'Native end, not timeout or skip');assert.ok(!video.events.some(event=>event.name==='error'));
  assert.ok(Math.abs(video.duration-item.durationMs/1000)<.06);assert.ok(video.decodedFrames>10);assert.ok(video.lastMediaTime>=video.duration-.25);assert.deepEqual(video.released,{connected:false,src:null,paused:true});
  assert.ok(row.trace.posters[0].loaded&&!row.trace.posters[0].error);assert.ok(row.trace.posters[0].width>0&&row.trace.posters[0].height>0);
  assert.ok(row.trace.frames.some(frame=>frame.mode==='video')&&row.trace.frames.every(frame=>['loading','video'].includes(frame.mode)&&frame.choices===0),'Only normal loading/video states, no fallback or early choice overlay');assert.ok(row.trace.frames.some(frame=>frame.className.includes('is-leaving')&&frame.opacity<.9),'Natural tail fades before choice');
  assert.ok(row.requests.some(request=>request.path===item.src));assert.ok(row.requests.some(request=>request.path===item.poster));
  assert.equal(row.requests.some(request=>request.path===`/cinematics/team-20260912/${item.id}.mp4`),false,'Old original is not selected');
  row.final={cell,phase:final.phase,history:final.history.length,mood:final.mood,money:final.money};await capture(page,row,'three-choices');
  row.webgl=await page.locator('#scene canvas').evaluate(canvas=>{const gl=canvas.getContext('webgl2');return {lost:gl.isContextLost(),error:gl.getError()};});assert.deepEqual(row.webgl,{lost:false,error:0});
  row.passed=true;await save();await context.close();currentPage=null;console.log(`Repaired film ${row.name}: poster loaded, native ended, ${video.decodedFrames} decoded frames, three choices`);
}
try{
  assert.deepEqual(CINEMATIC_MANIFEST.map(item=>item.cell),[6,8,11,15,18,22,27,31]);assert.equal(EVENTS[12].cinematicId,null);assert.equal(getCinematic(13),null);
  for(const item of CINEMATIC_MANIFEST){const dir=[8,31].includes(item.cell)?repaired:'/cinematics/team-20260912';assert.equal(item.src,`${dir}/${item.id}.mp4`);assert.equal(item.poster,`${dir}/${item.id}-poster.jpg`);}
  const base=await startServer();for(const cell of [8,31])await verifyHttp(base,getCinematic(cell));
  browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--use-gl=angle','--use-angle=d3d11','--ignore-gpu-blocklist']});
  for(const cell of [8,31])for(const [width,height]of [[1280,800],[844,390]])await playback(base,cell,width,height);
  assert.deepEqual(report.errors,[]);report.passed=true;report.phase='complete';
}catch(error){
  report.errors.push({phase:report.phase,message:error.message,stack:error.stack});if(currentPage)await currentPage.screenshot({path:`${out}/failure.png`}).catch(()=>{});process.exitCode=1;
}finally{
  report.finishedAt=new Date().toISOString();await save();await browser?.close();server?.kill();
  console.log(JSON.stringify({passed:report.passed,cases:report.cases.map(row=>({name:row.name,passed:row.passed})),errors:report.errors,report:`${out}/browser-production.json`}));
}
