// Isolated browser/storage. API calls and off-origin requests cannot leave this test.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_PATH||'C:/Users/25293/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const production=process.argv.includes('--production');let server,base=process.env.TEST_BASE_URL||'http://127.0.0.1:4174';
const out=fileURLToPath(new URL(`../test-results/daylight/${production?'production/':''}`,import.meta.url));
if(production){
  const probe=createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
  base=`http://127.0.0.1:${port}`;server=spawn(process.execPath,['server.mjs','--production'],{cwd:fileURLToPath(new URL('../',import.meta.url)),env:{...process.env,PORT:String(port),ZHIHU_CLI_PATH:'Z:/disabled-daylight-test/cli.exe'},windowsHide:true,stdio:'ignore'});
  for(let i=0;i<100;i++){try{if((await fetch(base)).ok)break;}catch{}if(i===99){server.kill();throw Error('Isolated production server did not start');}await new Promise(r=>setTimeout(r,100));}
}
await fs.mkdir(out,{recursive:true});const report={passed:false,production,views:[],errors:[],realApiCalls:0};
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--use-gl=angle','--use-angle=d3d11','--ignore-gpu-blocklist']});
try{
  const context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1,serviceWorkers:'block'});
  await context.route('**/*',r=>{const u=new URL(r.request().url());return u.origin===base||['data:','blob:'].includes(u.protocol)?r.continue():r.abort();});
  await context.route('**/api/**',r=>r.fulfill({status:503,json:{error:'Isolated appearance test'}}));
  // Read-only inspection handle in this browser response, never in shipped code.
  await context.route(production?'**/assets/main-*.js':'**/src/journey-world.js*',async r=>{const response=await r.fetch();let body=await response.text();const marker=/this\.frame\s*=\s*this\.frame\.bind\(this\)/;assert.ok(marker.test(body));body=body.replace(marker,'this.frame=(globalThis.__daylightTestWorld=this,this.frame.bind(this))');await r.fulfill({response,body});});
  await context.addInitScript(()=>{localStorage.setItem('four-seasons-auto-depart','off');localStorage.setItem('four-seasons-music','off');});
  const page=await context.newPage();page.setDefaultTimeout(35000);page.on('pageerror',e=>report.errors.push(e.message));
  const settle=()=>page.locator('#scene[data-assets="ready"][data-daylight-transition="settled"]').waitFor();
  const state=()=>page.evaluate(()=>{const w=globalThis.__daylightTestWorld;return {camera:w.camera.position.toArray(),target:w.controls.target.toArray(),yaw:w.character.rotation.y,position:w.currentPosition,season:w.art.activeSeason,mode:w.cameraMode,sun:w.sun.color.getHexString(),offset:w.sun.position.clone().sub(w.sun.target.position).toArray(),lights:w.scene.children.filter(c=>c.isLight).length,memory:{...w.renderer.info.memory},blend:w.daylight.blend,game:localStorage.getItem('four-seasons-life-v4'),emitters:[...w.daylight.emitters].map(m=>m.emissiveIntensity)};});
  const shot=async name=>{await page.screenshot({path:`${out}/${name}.png`});const s=await state();const ui=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,control:document.querySelector('.daylight-switch').getBoundingClientRect().toJSON(),canvasFilter:getComputedStyle(document.querySelector('#scene canvas')).filter}));assert.ok(ui.scroll<=ui.width);if(!name.startsWith('welcome'))assert.equal(ui.canvasFilter,'none');report.views.push({name,...s,...ui});};
  await page.goto(base);await settle();assert.equal(await page.locator('#scene').getAttribute('data-time-of-day'),'morning');
  await page.locator('[data-daylight="sunset"]').click();await settle();assert.equal((await state()).blend,1);await shot('welcome-sunset');
  await page.locator('[data-daylight="morning"]').click();await settle();
  await page.emulateMedia({reducedMotion:'reduce'});await page.locator('#start-full').click();await page.locator('.experience[data-stage="ready"]').waitFor();await settle();
  await page.locator('#view-overview').click();await page.waitForTimeout(500);await shot('overview-morning');const before=await state();
  await page.emulateMedia({reducedMotion:'no-preference'});await page.locator('[data-daylight="sunset"]').click();
  await page.waitForFunction(()=>{const b=Number(document.querySelector('#scene').dataset.daylightBlend);return b>0&&b<1;});
  await settle();await shot('overview-sunset');const after=await state();
  for(const k of ['camera','target','position','season','game','mode'])assert.deepEqual(after[k],before[k],k);
  assert.notEqual(after.sun,before.sun);assert.notDeepEqual(after.offset,before.offset);assert.ok(after.emitters.length>0&&after.emitters.every(n=>n===1.35));
  assert.equal(await page.locator('[data-daylight="sunset"]').getAttribute('aria-pressed'),'true');
  // Keyboard activation and repeated toggles do not create geometry or textures.
  await page.locator('[data-daylight="morning"]').focus();await page.keyboard.press('Enter');await settle();assert.equal((await state()).blend,0);
  const warmed=await state();await page.emulateMedia({reducedMotion:'reduce'});
  for(let i=0;i<12;i++){await page.locator(`[data-daylight="${i%2?'morning':'sunset'}"]`).click();await settle();}
  const repeated=await state();assert.deepEqual(repeated.memory,warmed.memory);assert.equal(repeated.lights,warmed.lights);assert.equal(repeated.game,warmed.game);
  // Inspect a real building in each seasonal region, then both overview and follow.
  for(let season=0;season<4;season++){
    await page.evaluate(season=>{const w=globalThis.__daylightTestWorld,b=w.art.buildings.find(b=>b.userData.season===season)||w.art.buildings[season*10];w.focusLandmark(b.userData.buildingId);},season);
    for(const mode of ['morning','sunset']){await page.locator(`[data-daylight="${mode}"]`).click();await settle();await shot(`landmark-${season}-${mode}`);}
  }
  await page.locator('#view-follow').click();await page.waitForTimeout(500);await shot('follow-sunset');
  // A modal still freezes the map after the transition settles.
  await page.locator('#rules-button').click();const draws=await page.locator('#scene').getAttribute('data-board-draws');await page.waitForTimeout(500);assert.equal(await page.locator('#scene').getAttribute('data-board-draws'),draws);await page.locator('#dialog-close').click();
  await page.reload();await settle();assert.equal(await page.locator('#scene').getAttribute('data-time-of-day'),'sunset');assert.equal(await page.locator('[data-daylight="sunset"]').getAttribute('aria-pressed'),'true');
  await page.locator('#resume').click();await page.locator('.experience[data-stage="ready"]').waitFor();await page.locator('#view-overview').click();
  await page.setViewportSize({width:844,height:390});await page.waitForTimeout(500);await shot('landscape-sunset');
  const buttons=await page.locator('[data-daylight]').evaluateAll(bs=>bs.map(b=>({rect:b.getBoundingClientRect().toJSON(),font:parseFloat(getComputedStyle(b).fontSize),hit:document.elementFromPoint(b.getBoundingClientRect().x+b.offsetWidth/2,b.getBoundingClientRect().y+b.offsetHeight/2)?.closest('button')===b})));
  assert.ok(buttons.every(b=>b.hit&&b.font>=14&&b.rect.height>=32));
  assert.equal(await page.evaluate(()=>{const a=document.querySelector('.daylight-switch').getBoundingClientRect();return [...document.querySelectorAll('.topbar button')].some(e=>{const b=e.getBoundingClientRect();return b.width>0&&Math.min(a.right,b.right)>Math.max(a.left,b.left)&&Math.min(a.bottom,b.bottom)>Math.max(a.top,b.top);});}),false,'appearance control must not overlap navigation');
  await page.locator('[data-daylight="morning"]').click();await settle();await shot('landscape-morning');
  await page.setViewportSize({width:390,height:844});await page.locator('#orientation-gate:not([hidden])').waitFor();assert.equal(await page.locator('.daylight-switch').evaluate(e=>e.inert),true);
  assert.deepEqual(report.errors,[]);report.passed=true;await context.close();
}finally{await fs.writeFile(`${out}/browser.json`,JSON.stringify(report,null,2));await browser.close();server?.kill();console.log(JSON.stringify({passed:report.passed,views:report.views.length,errors:report.errors,report:`${out}/browser.json`}));}
