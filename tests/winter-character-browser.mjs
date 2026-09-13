// Production WebGL visual QA from one replay-valid, already-played winter save.
// Before = temporarily disabling only CharacterContrast in this isolated page.
// This is not another full/new playthrough and does not alter user storage.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {createServer} from 'node:net';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {restore} from '../src/engine.js';
import {JOURNEY_STORAGE_KEY} from '../src/journey-storage.js';

const require=createRequire(import.meta.url),{chromium}=require('C:/Users/25293/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=fileURLToPath(new URL('../',import.meta.url)),out=new URL('../test-results/winter-character/',import.meta.url);
const previous=JSON.parse(await fs.readFile(new URL('../test-results/twenty-games/report-4-7-10-13-16-19.json',import.meta.url),'utf8')).games.find(g=>g.game===16);
const record=previous.trace.writes.find(write=>{const s=restore(write.record.game);return s?.phase==='ready'&&s.position===31;}).record;
assert.equal(restore(record.game).season,3);
await fs.mkdir(out,{recursive:true});
const report={passed:false,phase:'prepare',views:[],errors:[],glErrors:[],warnings:[],apiIntercepted:[],externalBlocked:[],method:{production:true,fixture:'Actual twenty-game run 16, replay-valid ready state at winter station 32; not a new/full playthrough.',comparison:'Same live 3D world/camera. Before temporarily disables only new helper, after enables it. Static pairs use reduced motion; one winter die/walk uses normal motion.',realModelCalls:0,realCLICalls:0,user4173Untouched:true}};
let server,browser,page;
const save=()=>fs.writeFile(new URL('browser-production.json',out),JSON.stringify(report,null,2));
async function shot(name){await page.screenshot({path:fileURLToPath(new URL(`${name}.png`,out))});}
async function measure(){return page.evaluate(()=>{const w=globalThis.__winterWorld,c=w.characterContrast,p=c.geometry.attributes.position;let maxContactError=0;for(let i=0;i<p.count;i++){const lx=p.getX(i),lz=p.getZ(i),a=c.shadow.rotation.y,x=c.shadow.position.x+lx*Math.cos(a)+lz*Math.sin(a),z=c.shadow.position.z-lx*Math.sin(a)+lz*Math.cos(a);maxContactError=Math.max(maxContactError,Math.abs(p.getY(i)-w.contactSurfaceY(x,z)-.003));}return{camera:w.camera.position.toArray(),target:w.controls.target.toArray(),position:w.character.position.toArray(),yaw:w.character.rotation.y,route:w.heading,season:w.state.season,u:w.u,mode:w.cameraMode,blend:w.daylight.blend,baseColor:c.bodyMaterial.color.getHexString(),emissive:c.bodyMaterial.emissive.getHexString(),contour:c.contour.value,opacity:c.material.opacity,patchSize:[c.geometry.parameters.width,c.geometry.parameters.height],maxContactError,shadowPosition:c.shadow.position.toArray(),shadowWorld:[c.shadow.matrixWorld.elements[12],c.shadow.matrixWorld.elements[13],c.shadow.matrixWorld.elements[14]],depthTest:c.material.depthTest,depthWrite:c.material.depthWrite,geometry:c.geometry.uuid,texture:c.texture.uuid,material:c.material.uuid,memory:{...w.renderer.info.memory},programs:w.renderer.info.programs.length,drawCalls:w.renderer.info.render.calls,game:localStorage.getItem('four-seasons-life-v4')};});}
try{
  const html=await fs.readFile(new URL('../dist/index.html',import.meta.url),'utf8'),assets=(await fs.readdir(new URL('../dist/assets/',import.meta.url))).filter(name=>/^main-.*\.(?:js|css)$/.test(name));
  report.build={indexSha256:createHash('sha256').update(html).digest('hex'),assets:await Promise.all(assets.map(async name=>({name,sha256:createHash('sha256').update(await fs.readFile(new URL(`../dist/assets/${name}`,import.meta.url))).digest('hex')})))};
  const probe=createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));const base=`http://127.0.0.1:${port}`;
  const disabledCli=fileURLToPath(new URL('disabled-cli.exe',out));await assert.rejects(fs.access(disabledCli),{code:'ENOENT'});
  server=spawn(process.execPath,['server.mjs','--production'],{cwd:root,windowsHide:true,env:{...process.env,PORT:String(port),ZHIHU_CLI_PATH:disabledCli},stdio:'ignore'});
  for(let i=0;i<100;i++){try{if((await fetch(base)).ok)break;}catch{}if(i===99)throw Error('Isolated production server unavailable');await delay(100);}report.server={base,isolated:true};
  browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--use-gl=angle','--use-angle=d3d11','--ignore-gpu-blocklist']});
  for(const [width,height]of [[1280,800],[844,390]]){
    const context=await browser.newContext({viewport:{width,height},reducedMotion:'reduce',serviceWorkers:'block'});
    await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin!==base&&!['data:','blob:'].includes(u.protocol)){report.externalBlocked.push(u.origin+u.pathname);return route.abort();}return route.continue();});
    await context.route('**/api/**',route=>{report.apiIntercepted.push(new URL(route.request().url()).pathname);return route.fulfill({status:503,json:{error:'Isolated winter appearance QA'}});});
    await context.routeWebSocket('**/*',socket=>socket.close());
    await context.route('**/assets/main-*.js',async route=>{const response=await route.fetch(),body=await response.text(),marker=/this\.frame\s*=\s*this\.frame\.bind\(this\)/;assert.ok(marker.test(body),'Actual production JourneyWorld read-only inspection handle');await route.fulfill({response,body:body.replace(marker,'this.frame=(globalThis.__winterWorld=this,this.frame.bind(this))')});});
    await context.addInitScript(({key,record})=>{localStorage.setItem(key,JSON.stringify(record));localStorage.setItem('four-seasons-music','off');localStorage.setItem('four-seasons-auto-depart','off');const entropy=crypto.getRandomValues.bind(crypto);crypto.getRandomValues=array=>{if(array instanceof Uint32Array&&array.length===1){array[0]=0;return array;}return entropy(array);};},{key:JOURNEY_STORAGE_KEY,record});
    page=await context.newPage();page.setDefaultTimeout(45000);page.on('pageerror',error=>report.errors.push(error.message));page.on('console',message=>{if(message.type()==='warning')report.warnings.push(message.text());if(message.type()==='error'&&/WebGL|shader|GL_INVALID|CONTEXT_LOST/i.test(message.text()))report.glErrors.push(message.text());});
    report.phase=`${width}-load`;await page.goto(base);await page.locator('#scene[data-renderer="webgl"][data-assets="ready"]').waitFor({timeout:120000});await page.locator('#start-full').click();await page.locator('#resume').click();await page.locator('.experience[data-stage="ready"]').waitFor();
    for(const mode of ['follow','near','overview'])for(const daylight of ['morning','sunset']){
      report.phase=`${width}-${daylight}-${mode}`;
      await page.evaluate(({mode,daylight})=>{const w=globalThis.__winterWorld;w.setTimeOfDay(daylight,{immediate:true});w.setCameraMode(mode==='overview'?'overview':'follow');if(mode==='near')w.zoom(.32);w.characterContrast.enabled=true;}, {mode,daylight});await page.waitForTimeout(350);
      const pair={width,height,mode,daylight};
      for(const enabled of [false,true]){
        await page.evaluate(enabled=>{const w=globalThis.__winterWorld;w.characterContrast.enabled=enabled;w.pausedFrameKey=null;w.renderer.render(w.scene,w.camera);},enabled);await page.waitForTimeout(150);
        const label=enabled?'after':'before',name=`${width}-${daylight}-${mode}-${label}`;await shot(name);pair[label]=await measure();pair[label].screenshot=`${name}.png`;
      }
      for(const field of ['camera','target','position','yaw','route','season','u','mode','game'])assert.deepEqual(pair.after[field],pair.before[field],`Comparison preserves ${field}`);
      assert.equal(pair.after.baseColor,'fffdf4');assert.equal(pair.after.emissive,'000000');assert.equal(pair.before.contour,0);assert.ok(pair.after.contour>0&&pair.after.contour<.7);assert.ok(pair.after.maxContactError<.00001);assert.equal(pair.after.depthTest,true);assert.equal(pair.after.depthWrite,false);assert.deepEqual(pair.after.patchSize,[1.9,1.55]);
      report.views.push(pair);await save();console.log(`WINTER VIEW ${width} ${daylight} ${mode}: before/after saved`);
    }
    await page.evaluate(()=>{const w=globalThis.__winterWorld;w.setCameraMode('follow');w.characterContrast.enabled=true;});await page.waitForTimeout(200);const warm=await measure();
    for(let i=0;i<12;i++)await page.evaluate(i=>{const w=globalThis.__winterWorld;w.setTimeOfDay(i%2?'morning':'sunset',{immediate:true});w.renderer.render(w.scene,w.camera);},i);
    const repeated=await measure();assert.deepEqual(repeated.memory,warm.memory);assert.equal(repeated.programs,warm.programs);assert.equal(repeated.geometry,warm.geometry);assert.equal(repeated.texture,warm.texture);assert.equal(repeated.material,warm.material);
    if(width===1280){
      report.phase='normal-winter-die-and-walk';await page.emulateMedia({reducedMotion:'no-preference'});
      await page.evaluate(()=>{const w=globalThis.__winterWorld;globalThis.__winterMotion={frames:[],events:[]};document.querySelector('#scene').addEventListener('worldstage',event=>__winterMotion.events.push({...event.detail,at:performance.now()}));const original=w.scene.onBeforeRender;w.scene.onBeforeRender=(...args)=>{original(...args);if(['dice','walking','turning','arrival'].includes(w.stage)){const c=w.characterContrast;__winterMotion.frames.push({at:performance.now(),stage:w.stage,actor:w.character.position.toArray(),shadow:c.shadow.position.toArray(),shadowWorld:[c.shadow.matrixWorld.elements[12],c.shadow.matrixWorld.elements[13],c.shadow.matrixWorld.elements[14]],yaw:w.character.rotation.y,heading:w.heading,opacity:c.material.opacity});}};});
      await page.locator('#continue-travel').click();await page.locator('#scene[data-stage="walking"]').waitFor();await page.waitForTimeout(550);await shot('1280-winter-walking');await page.locator('.experience[data-stage="choice"]').waitFor({timeout:120000});await page.waitForTimeout(650);await shot('1280-winter-cell-33-choice');
      const stored=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),JOURNEY_STORAGE_KEY),state=restore(stored.game);assert.equal(state.position,32);assert.equal(state.die,1);assert.equal(await page.locator('[data-choice]').count(),3);
      report.motion=await page.evaluate(()=>__winterMotion);assert.ok(report.motion.frames.some(f=>f.stage==='walking'));assert.ok(report.motion.frames.some(f=>f.stage==='dice'));
      for(const f of report.motion.frames){assert.ok(Math.abs(f.actor[0]-f.shadow[0])<.001);assert.ok(Math.abs(f.actor[2]-f.shadow[2])<.001);assert.ok(Math.abs(f.actor[0]-f.shadowWorld[0])<.001);assert.ok(Math.abs(f.actor[2]-f.shadowWorld[2])<.001);assert.equal(f.shadow[1],0);}
      // Return to spring in this same 3D instance via a legal existing replay
      // record; this is a presentation fixture, never a browser-played new game.
      const spring=restore(previous.trace.writes.find(write=>restore(write.record.game)?.phase==='ready'&&restore(write.record.game)?.season===0).record.game);
      // Functions on event options are not needed by the presentation-only
      // world. This JSON projection comes from a successfully restored state.
      await page.evaluate(saved=>{const w=globalThis.__winterWorld;w.characterContrast.enabled=true;w.setState(saved);w.renderer.render(w.scene,w.camera);},JSON.parse(JSON.stringify(spring)));
      const springView=await measure();assert.equal(springView.contour,0);report.springReset={contour:springView.contour,baseColor:springView.baseColor};
    }
    report.phase=`${width}-dispose`;const disposal=await page.evaluate(()=>{const w=globalThis.__winterWorld,c=w.characterContrast,counts={geometry:0,material:0,texture:0};for(const key of Object.keys(counts))c[key].addEventListener('dispose',()=>counts[key]++);w.dispose();w.dispose();return{counts,shadowAttached:!!c.shadow.parent,canvasCount:document.querySelectorAll('#scene canvas').length,contour:c.contour.value};});
    assert.deepEqual(disposal.counts,{geometry:1,material:1,texture:1});assert.equal(disposal.shadowAttached,false);assert.equal(disposal.canvasCount,0);assert.equal(disposal.contour,0);(report.lifecycles??=[]).push({width,repeatedResourcesStable:true,...disposal});await context.close();page=null;
  }
  assert.deepEqual(report.errors,[]);assert.deepEqual(report.glErrors,[]);assert.deepEqual(report.externalBlocked,[]);report.passed=true;report.phase='complete';
}catch(error){report.failure={phase:report.phase,message:error.message,stack:error.stack};if(page){try{await shot('failure');}catch{}}console.error(error);process.exitCode=1;}
finally{await save();try{await browser?.close();}finally{if(server&&server.exitCode===null&&server.signalCode===null)await new Promise(resolve=>{const timer=setTimeout(resolve,3000);server.once('exit',()=>{clearTimeout(timer);resolve();});server.kill();});}}
console.log(JSON.stringify({passed:report.passed,phase:report.phase,views:report.views.length,errors:report.errors,glErrors:report.glErrors}));
