import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {eventTheme} from '../src/transitions.js';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'C:/Users/25293/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:4173';
const out=new URL('../test-results/',import.meta.url);await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const mockWorld=`
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const record=stage=>{window.__worldCalls.push({stage,question:!!document.querySelector('#event-heading'),time:performance.now()});};
export class World {
 constructor(container){this.container=container;this.ready=Promise.resolve();window.__worldCalls=[];container.dataset.renderer='mock';container.dataset.assets='ready';container.dataset.cameraMode='follow';const canvas=document.createElement('canvas');canvas.width=1000;canvas.height=700;container.appendChild(canvas);const ctx=canvas.getContext('2d');ctx.fillStyle='#a5b798';ctx.fillRect(0,0,1000,700);}
 setState(state){this.container.dataset.position=state.position;}
 async throwDice(die){record('throw-start');await pause(350);record('throw-end');}
 async walk(state,die){record('walk-start');await pause(250);record('walk-end');}
 async arrive(state){record('arrive-start');await pause(90);record('arrive-end');}
 setCameraMode(mode){this.container.dataset.cameraMode=mode;}setInteractionEnabled(enabled){this.container.dataset.interaction=String(enabled);}zoom(){}resetView(){}dispose(){}
}
export const fallbackWorld=(container)=>new World(container);
`;
const contexts=[];
async function setup({mobile=false,real=false,auto=true,reduced='reduce',die=2,seedSave=null}={}){
  const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:980},reducedMotion:reduced,acceptDownloads:true});contexts.push(context);
  // Keep each test page on its loaded revision while other agents refine the town.
  // This filters only Vite development reloads, never game or API messages.
  await context.routeWebSocket('**',socket=>{
    const server=socket.connectToServer();
    if(!socket.protocols().includes('vite-hmr'))return;
    server.onMessage(message=>{let body;try{body=JSON.parse(message.toString());}catch{}if(!['update','full-reload','prune'].includes(body?.type))socket.send(message);});
  });
  await context.addInitScript(({auto,die,seedSave})=>{crypto.getRandomValues=array=>{array[0]=Math.floor((die-.5)/6*4294967296);return array;};if(!auto)localStorage.setItem('four-seasons-auto-depart','off');if(seedSave)localStorage.setItem('four-seasons-life-v4',JSON.stringify({game:seedSave,seconds:12}));},{auto,die,seedSave});
  if(!real)await context.route('**/src/world.js*',route=>route.fulfill({status:200,contentType:'text/javascript',body:mockWorld}));
  const apiCalls=[];
  // Catch every API request, so a newly added endpoint cannot silently spend quota.
  await context.route('**/api/**',route=>{
    const path=new URL(route.request().url()).pathname;
    if(path==='/api/narrate'){
      const body=route.request().postDataJSON();assert.equal(body.game.version,4);assert.equal(Object.hasOwn(body.game,'money'),false);assert.equal(Object.hasOwn(body.game,'exp'),false);apiCalls.push(body);
      return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({mode:'live',text:body.kind==='summary'?'测试手记：每一种选择都有代价，也有值得留下的经验。':'<img src=x onerror="window.__xss=1"> 这是安全显示的测试回响。',model:'zhida-fast-1p5'})});
    }
    if(path==='/api/experience')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({mode:'curated',items:[]})});
    if(path==='/api/status')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({modelConfigured:false,searchConfigured:false})});
    return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'unmocked_endpoint_blocked_in_test'})});
  });
  const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(base,{waitUntil:'networkidle'});await page.locator('#start-demo').waitFor();
  return {context,page,errors,apiCalls};
}
// The test harness uses engine data to exercise a complete route. None of these
// preview values are rendered into the player's choice DOM.
async function balancedChoice(page){return page.evaluate(async()=>{
  const {restore,previewChoice}=await import('/src/engine.js');
  const state=restore(JSON.parse(localStorage.getItem('four-seasons-life-v4')).game);
  return state.active.options.map((option,index)=>({index,...previewChoice(state,option)})).filter(option=>!option.disabled).sort((a,b)=>(b.mood+Math.min(b.money/5000,1)*3+b.exp*.001)-(a.mood+Math.min(a.money/5000,1)*3+a.exp*.001))[0].index;
});}
async function assertBlindChoices(page){
  assert.equal(await page.locator('[data-choice]').count(),3);
  assert.equal(await page.locator('.choice-effects,.fatal-hint').count(),0);
  const content=await page.locator('.options').evaluate(element=>({text:element.textContent,attributes:[element,...element.querySelectorAll('*')].flatMap(node=>[...node.attributes].filter(attribute=>/^(aria-label|aria-description|title|data-(money|mood|exp|result))$/.test(attribute.name)).map(attribute=>attribute.value)).join(' ')}));
  assert.doesNotMatch(content.text+' '+content.attributes,/[+−-]\s*\d|条件已满足|条件未满足|需要 [\d,]+ 元/);
}
try{
  assert.equal(new Set(['挑战','治愈','抉择','机会','相遇'].map(kind=>eventTheme(kind).id)).size,5);
  {
    const {page,context,errors}=await setup({reduced:'no-preference'});
    assert.equal(await page.locator('#roll-button,.dice-dock,.dice-cube').count(),0);
    assert.equal(await page.locator('.scene-caption').count(),0);
    await page.locator('#start-demo').click();
    await page.waitForFunction(()=>window.__worldCalls.some(c=>c.stage==='throw-start'));
    assert.equal(await page.locator('#event-heading').count(),0);
    await page.locator('#cinematic-stage .cinematic').waitFor();
    assert.equal(await page.locator('#event-heading').count(),0);
    assert.equal(await page.locator('#cinematic-stage .cinematic').getAttribute('data-cinematic'),'cell-06');
    await page.keyboard.press('Space');
    assert.equal(await page.evaluate(()=>window.__worldCalls.filter(call=>call.stage==='throw-start').length),1);
    await page.locator('#event-heading').waitFor();
    assert.match(await page.locator('#event-sources').textContent(),/这段故事的知乎来处/);
    assert.match(await page.locator('.zhihu-story-bridge').textContent(),/知乎讨论启发 · 虚构情景/);
    assert.equal((await page.locator('#event-sources').textContent()).includes('真实经历过'),false);
    const trace=await page.evaluate(()=>window.__worldCalls);
    assert.deepEqual(trace.map(x=>x.stage),['throw-start','throw-end','walk-start','walk-end','arrive-start','arrive-end']);
    assert.ok(trace.every(x=>!x.question));
    assert.ok(await page.evaluate(last=>performance.now()-last,trace.at(-1).time)>=700);
    assert.equal(await page.locator('#scene').getAttribute('data-interaction'),'false');
    assert.equal(await page.locator('#view-overview').isDisabled(),true);
    await page.waitForTimeout(850);
    assert.equal(await page.evaluate(()=>window.__worldCalls.length),6);
    assert.deepEqual(errors,[]);await context.close();
    console.log('PASS automatic throw → walk → arrival → themed transition → question, no early prompt or double advance');
  }
  {
    const {page,context,errors}=await setup({auto:false});
    await page.locator('#start-demo').click();await page.waitForTimeout(800);
    assert.equal(await page.evaluate(()=>window.__worldCalls.length),0);
    await page.locator('#view-overview').click();assert.equal(await page.locator('#scene').getAttribute('data-camera-mode'),'overview');
    await page.locator('#view-follow').click();
    await page.locator('#rules-button').click();await page.locator('#dialog-content').evaluate(node=>{node.tabIndex=0;node.focus();});await page.keyboard.press('Space');await page.waitForTimeout(450);
    assert.equal(await page.evaluate(()=>window.__worldCalls.length),0);
    await page.locator('#dialog-close').click();await page.locator('#continue-travel').waitFor({state:'visible'});
    await page.locator('#travel-status').evaluate(node=>{node.tabIndex=0;node.focus();});await page.keyboard.press('Space');await page.locator('#event-heading').waitFor();
    assert.equal(await page.evaluate(()=>window.__worldCalls.filter(x=>x.stage==='throw-start').length),1);
    assert.deepEqual(errors,[]);await context.close();console.log('PASS auto-off, accessible continue, camera controls, dialog gating');
  }
  {
    const {page,context,errors}=await setup();
    await page.locator('#start-demo').click();await page.waitForFunction(()=>window.__worldCalls.some(c=>c.stage==='throw-start'));
    await page.locator('#rules-button').click();await page.waitForTimeout(900);
    assert.equal(await page.evaluate(()=>window.__worldCalls.some(c=>c.stage==='walk-start')),false);
    assert.equal(await page.locator('#event-heading').count(),0);
    await page.locator('#dialog-close').click();await page.locator('#event-heading').waitFor();
    assert.deepEqual(errors,[]);await context.close();console.log('PASS opening a dialog mid-throw blocks the next animation step');
  }
  {
    const {page,context,errors,apiCalls}=await setup({mobile:true});
    await page.screenshot({path:fileURLToPath(new URL('experience-mobile-welcome-mock.png',out))});
    assert.equal(await page.locator('#orientation-gate').isVisible(),true);
    assert.equal(await page.locator('#overlay-shell').evaluate(node=>node.inert),true);
    await page.keyboard.press('Space');await page.waitForTimeout(300);
    assert.equal(await page.evaluate(()=>window.__worldCalls.length),0);
    await page.setViewportSize({width:844,height:390});
    await page.locator('#orientation-gate').waitFor({state:'hidden'});
    await page.locator('#start-demo').click();
    let turns=0;
    for(;turns<12;){
      await page.locator('#event-heading').waitFor();
      if(turns===0){
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
        const panel=await page.locator('#story-panel').boundingBox();assert.ok(panel.x>=0&&panel.x+panel.width<=844);
        const hud=await page.locator('.status-strip').boundingBox(),travel=await page.locator('#travel-status').boundingBox();
        await page.screenshot({path:fileURLToPath(new URL('experience-mobile-event-mock.png',out))});
        assert.ok(panel.y>=hud.y+hud.height+3,`event overlaps HUD: ${JSON.stringify({panel,hud,travel})}`);assert.ok(panel.y+panel.height<=travel.y-3,`event overlaps travel controls: ${JSON.stringify({panel,hud,travel})}`);
        await page.locator('#event-sources').scrollIntoViewIfNeeded();
        assert.equal(await page.locator('#event-sources').isVisible(),true);
        await page.screenshot({path:fileURLToPath(new URL('experience-mobile-event-sources-mock.png',out))});
        await page.locator('#story-panel').evaluate(panel=>panel.scrollTop=0);
      }
      await assertBlindChoices(page);
      const choice=await balancedChoice(page);await page.locator(`[data-choice="${choice}"]`).click();turns++;
      assert.equal(await page.locator('.result-stats strong').count(),3,'settled feedback reveals all three actual resource changes');
      await page.locator('[data-ai-kind="event"][data-mode="live"]').waitFor({state:'attached'});
      assert.equal(await page.locator('.reflection-drawer').getAttribute('open'),null);
      await page.locator('.reflection-drawer summary').click();
      await page.locator('[data-ai-kind="event"][data-mode="live"]').waitFor();
      assert.equal(await page.locator('.ai-reflection img').count(),0);assert.equal(await page.evaluate(()=>window.__xss),undefined);
      await page.locator('#next-button').click();if(await page.locator('.report-hero').count())break;
    }
    await page.locator('[data-ai-kind="summary"][data-mode="live"]').waitFor();
    const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('four-seasons-life-v4')).game);
    assert.equal(saved.version,4);assert.equal(saved.phase,'finished');assert.equal(saved.moves.length,turns);
    assert.ok((await page.locator('.report-route').textContent()).includes('12 / 12'));
    assert.equal(await page.locator('.history-entry').count(),turns);
    assert.equal(apiCalls.filter(x=>x.kind==='summary').length,1);
    const pending=page.waitForEvent('download');await page.locator('#download-note').click();const download=await pending;const path=fileURLToPath(new URL('experience-summary-mock.txt',out));await download.saveAs(path);const text=await fs.readFile(path,'utf8');assert.match(text,/测试手记/);assert.match(text,/路线：12 \/ 12 站/);
    assert.deepEqual(errors,[]);await context.close();console.log(`PASS portrait gate and landscape scrolling, ${turns} actual three-way blind decisions to the 12-station finish, safe collapsed AI and downloadable v4 report`);
  }
  {
    const {page,context,errors,apiCalls}=await setup({die:6});
    assert.equal(await page.locator('#money-value').textContent(),'5,000');
    assert.equal(await page.locator('#mood-value').textContent(),'100');
    assert.equal(await page.locator('#exp-value').textContent(),'10');
    await page.locator('#start-full').click();
    let turns=0;
    while(turns<8){
      await page.locator('#event-heading').waitFor();
      await assertBlindChoices(page);
      const before=await page.evaluate(()=>JSON.parse(localStorage.getItem('four-seasons-life-v4')).game.moves.length);
      const choice=await balancedChoice(page);
      await page.locator(`[data-choice="${choice}"]`).evaluate(button=>{button.click();button.click();});
      turns++;
      const after=await page.evaluate(()=>JSON.parse(localStorage.getItem('four-seasons-life-v4')).game.moves.length);
      assert.equal(after,before+1,'repeated choice clicks must settle exactly once');
      await page.locator('[data-ai-kind="event"][data-mode="live"]').waitFor({state:'attached'});
      await page.locator('#next-button').click();if(await page.locator('.report-hero').count())break;
    }
    await page.locator('[data-ai-kind="summary"][data-mode="live"]').waitFor();
    const result=await page.evaluate(async()=>{const {restore}=await import('/src/engine.js');return restore(JSON.parse(localStorage.getItem('four-seasons-life-v4')).game);});
    assert.equal(result.total,40);assert.equal(result.position,39);assert.equal(result.ended,'complete');assert.equal(result.phase,'finished');assert.equal(turns,7);
    assert.equal(new Set(result.history.map(record=>record.tile)).size,turns);
    assert.match(await page.locator('.report-route').textContent(),/40 \/ 40/);
    assert.equal(apiCalls.filter(call=>call.kind==='summary').length,1);assert.deepEqual(errors,[]);
    await context.close();console.log('PASS 40-station route, six-sided movement, initial 5000/100/10 and duplicate-choice protection');
  }
  {
    const seedSave={version:4,mode:'full',name:'刘看山',talent:'defense',phase:'choice',moves:[{die:6,choice:1},{die:6,choice:0}],pendingDie:6};
    const {page,context,errors}=await setup({auto:false,seedSave});
    await page.locator('#resume').click();await page.locator('#event-heading').waitFor();
    assert.equal(await page.locator('#money-value').textContent(),'5,000');
    await page.locator('[data-choice="1"]').click();
    await page.locator('[data-ai-kind="event"][data-mode="live"]').waitFor({state:'attached'});
    const result=await page.evaluate(async()=>{const {restore}=await import('/src/engine.js');return restore(JSON.parse(localStorage.getItem('four-seasons-life-v4')).game);});
    assert.equal(result.money,0);assert.ok(result.mood>0);assert.equal(result.ended,null);
    assert.equal(await page.locator('#money-value').textContent(),'0');
    await page.locator('#next-button').click();await page.locator('#continue-travel').waitFor();
    assert.equal(await page.locator('.report-hero').count(),0);assert.deepEqual(errors,[]);
    await context.close();console.log('PASS spending the last 5000 does not end a healthy-mood journey');
  }
  {
    const seedSave={version:4,mode:'full',name:'刘看山',talent:'ambitious',phase:'choice',moves:[{die:4,choice:0},{die:3,choice:0},{die:3,choice:0},{die:5,choice:0}],pendingDie:5};
    const {page,context,errors}=await setup({auto:false,seedSave});
    await page.locator('#resume').click();await page.locator('#event-heading').waitFor();
    await assertBlindChoices(page);
    await page.locator('[data-choice="0"]').click();await page.locator('#next-button').click();
    await page.locator('[data-ai-kind="summary"][data-mode="live"]').waitFor();
    const result=await page.evaluate(async()=>{const {restore}=await import('/src/engine.js');return restore(JSON.parse(localStorage.getItem('four-seasons-life-v4')).game);});
    assert.equal(result.mood,0);assert.equal(result.ended,'mood');assert.equal(result.phase,'finished');assert.ok(result.position<39);
    assert.match(await page.locator('.report-badge').textContent(),/旅程暂歇/);assert.deepEqual(errors,[]);
    await context.close();console.log('PASS only exhausted mood triggers the early-ending report');
  }
  if(process.env.TEST_REAL_WORLD==='1'){
    const {page,context,errors}=await setup({real:true,reduced:'no-preference'});
    await page.waitForFunction(()=>document.querySelector('#scene').dataset.assets!=='loading',{},{timeout:30000});
    await page.screenshot({path:fileURLToPath(new URL('experience-welcome.png',out))});
    await page.locator('#start-demo').click();
    await page.locator('#arrival-transition').waitFor({state:'visible',timeout:50000});
    await page.waitForTimeout(240);
    await page.screenshot({path:fileURLToPath(new URL('experience-arrival.png',out))});
    await page.locator('#event-heading').waitFor({timeout:50000});
    await page.locator('#story-panel').evaluate(panel=>Promise.all(panel.getAnimations().map(animation=>animation.finished.catch(()=>{}))));
    assert.equal(await page.locator('#scene').getAttribute('data-renderer'),'pixel');
    assert.equal(await page.locator('#scene').getAttribute('data-camera-mode'),'follow');
    await page.screenshot({path:fileURLToPath(new URL('experience-event.png',out))});
    const panel=await page.locator('#story-panel').boundingBox(),hud=await page.locator('.status-strip').boundingBox();
    assert.ok(panel.y>=hud.y+hud.height+4);
    assert.equal(await page.locator('.scene-caption').count(),0);
    if(await page.locator('.world-location').count())assert.equal(await page.locator('.world-location').isVisible(),false);
    await page.setViewportSize({width:390,height:844});
    await page.locator('#orientation-gate').waitFor();
    assert.equal(await page.locator('#scene').evaluate(node=>node.inert),true);
    await page.setViewportSize({width:844,height:390});
    await page.locator('#orientation-gate').waitFor({state:'hidden'});
    await page.locator('#story-panel').evaluate(panel=>panel.scrollTop=0);
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    await page.screenshot({path:fileURLToPath(new URL('experience-mobile-event-real.png',out))});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    assert.deepEqual(errors,[]);await context.close();console.log('PASS real pixel-canvas scene automatic departure and arrival; all API calls mocked');
  }
  console.log('Immersive experience checks passed. No official API requests.');
}finally{await Promise.all(contexts.map(context=>context.close().catch(()=>{})));await browser.close();}
