import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs/promises';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {newGame,land,choose,advance,previewChoice,snapshot} from '../src/engine.js';
import {createPractice} from '../server/practice.mjs';
import {mockWorldSource} from './helpers/mock-world.mjs';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'C:/Users/25293/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
let base=process.env.TEST_BASE_URL,server;
if(!base){
  const listener=net.createServer();await new Promise(r=>listener.listen(0,'127.0.0.1',r));const port=listener.address().port;await new Promise(r=>listener.close(r));
  base=`http://127.0.0.1:${port}`;
  server=spawn(process.execPath,['server.mjs','--production'],{cwd:fileURLToPath(new URL('../',import.meta.url)),env:{...process.env,PORT:String(port),ZHIHU_CLI_PATH:'D:/知乎黑客松/disabled-practice-test-cli.exe'},windowsHide:true,stdio:'ignore'});
  let ready=false;for(let i=0;i<50;i++){try{ready=(await fetch(base+'/api/health')).ok;}catch{}if(ready)break;await new Promise(r=>setTimeout(r,100));}if(!ready){server.kill();throw new Error('Isolated production server did not start');}
}
const out=new URL('../test-results/',import.meta.url);await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});const errors=[];
function fixture(cell){let state=newGame('full');while(state.position<cell-1){const located=land(state,Math.min(6,cell-1-state.position));const pick=located.active.options.map((o,i)=>({i,p:previewChoice(located,o)})).filter(o=>!o.p.disabled).sort((a,b)=>b.p.mood-a.p.mood)[0].i;state=choose(located,pick);if(state.position<cell-1)state=advance(state);}return snapshot(state);}
async function setup(cell,respond){
  const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'}),requests=[];const game=fixture(cell);
  await context.route('**/api/**',r=>r.fulfill({status:503,json:{error:'No live API allowed in tests'}}));
  await context.route('**/src/world.js*',r=>r.fulfill({contentType:'text/javascript',body:mockWorldSource}));
  await context.route('**/api/practice',async r=>{const input=r.request().postDataJSON();requests.push(input);await respond(r,input);});
  await context.addInitScript(game=>{localStorage.setItem('four-seasons-life-v4',JSON.stringify({game,seconds:0}));localStorage.setItem('four-seasons-auto-depart','off');},game);
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(base,{waitUntil:'networkidle'});await page.locator('#resume').click();
  await page.locator('#practice-open').waitFor();assert.equal(await page.locator('#practice-open').count(),1);assert.equal(requests.length,0);await page.locator('#practice-open').click();assert.equal(requests.length,0);
  assert.match(await page.locator('.practice-boundary').innerText(),/不改变/);assert.match(await page.locator('#practice-privacy').innerText(),/知乎直答/);
  return {context,page,game,requests};
}
const response=(r,input,mode='live')=>r.fulfill({json:{mode,model:'zhida-fast-1p5',sessionId:'s'.repeat(32),turn:input.turn,done:input.turn===2,npc:input.turn===1?'你提到了核对记录，我们可以先确认哪一项？':'先把待确认的事项留下，再一起商量具体安排。',...(input.turn===2?{tip:'先约定一位整理记录的人，再约定下一次核对时间。'}:{})}});
try{
  for(const cell of [11,13]){
    const {context,page,game,requests}=await setup(cell,response);
    const before=await page.locator('.status-strip').innerText();
    await page.screenshot({path:fileURLToPath(new URL(`practice-cell-${cell}-opening.png`,out))});
    assert.equal(await page.locator('.practice-form [type="submit"]').isDisabled(),true);
    await page.locator('#practice-message').fill('我想先把需要一起确认的事项说清楚。');await page.locator('.practice-form [type="submit"]').click();
    await page.locator('.practice-round').filter({hasText:'第 2 / 2 轮'}).waitFor();assert.equal(requests.length,1);assert.equal(requests[0].turn,1);assert.equal(requests[0].sessionId,undefined);assert.equal(await page.locator('.practice-tip').isVisible(),false);
    // Repeat the same words in a different round: this is not a network retry.
    await page.locator('#practice-message').fill('我想先把需要一起确认的事项说清楚。');await page.locator('.practice-form [type="submit"]').click();await page.locator('.practice-tip').waitFor();
    assert.equal(requests.length,2);assert.equal(requests[1].turn,2);assert.equal(requests[1].clientId,requests[0].clientId);assert.equal(requests[1].sessionId,'s'.repeat(32));assert.equal(await page.locator('.practice-form').isVisible(),false);
    assert.equal(await page.locator('.practice-tip p').count(),1);assert.equal(await page.locator('.status-strip').innerText(),before);
    assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('four-seasons-life-v4')).game),game);
    assert.equal(await page.evaluate(()=>Object.values(localStorage).some(v=>v.includes('我想先把需要一起确认的事项说清楚'))),false);
    await page.screenshot({path:fileURLToPath(new URL(`practice-cell-${cell}-complete.png`,out))});
    await page.locator('.practice-exit').click();await page.locator('#practice-open').click();assert.equal(await page.locator('.practice-form').isVisible(),false);assert.equal(requests.length,2);
    await page.locator('.practice-exit').click();await page.locator('#next-button').click();assert.equal(await page.locator('.experience').getAttribute('data-stage'),'ready');await context.close();
  }
  // Literal rendering, offline fallback, portrait pause and small landscape.
  {
    const {context,page,requests}=await setup(13,async(r,input)=>input.turn===1?r.fulfill({json:{mode:'live',model:'zhida-fast-1p5',sessionId:'x'.repeat(32),turn:1,done:false,npc:'<img src=x onerror=alert(1)> 这段文字只能显示，不能执行。'}}):r.abort());
    await page.setViewportSize({width:844,height:390});await page.locator('#practice-message').fill('请先看已经确认的时间线。');
    await page.setViewportSize({width:390,height:844});await page.locator('#orientation-gate').waitFor();assert.equal(await page.locator('#dialog').evaluate(d=>d.open),false);assert.equal(requests.length,0);
    await page.setViewportSize({width:844,height:390});await page.locator('#practice-message').waitFor();assert.equal(await page.locator('#practice-message').inputValue(),'请先看已经确认的时间线。');
    await page.locator('.practice-form [type="submit"]').click();await page.locator('.practice-round').filter({hasText:'第 2 / 2 轮'}).waitFor();assert.equal(await page.locator('.practice-chat img').count(),0);assert.match(await page.locator('.practice-chat').innerText(),/<img/);
    await page.screenshot({path:fileURLToPath(new URL('practice-mobile-844.png',out))});
    await page.locator('#practice-message').fill('我们约个时间一起核对。');await page.locator('.practice-form [type="submit"]').click();await page.locator('.practice-tip').waitFor();assert.match(await page.locator('.practice-tip small').innerText(),/预设练习/);assert.match(await page.locator('.practice-status').innerText(),/非|不会假装/);
    await page.setViewportSize({width:667,height:375});await page.locator('.practice-exit').scrollIntoViewIfNeeded();const box=await page.locator('#dialog').boundingBox();assert.ok(box.x>=0&&box.y>=0&&box.x+box.width<=668&&box.y+box.height<=376);await page.screenshot({path:fileURLToPath(new URL('practice-mobile-667.png',out))});await context.close();
  }
  // Leaving during a request cannot repopulate a different dialog or save text.
  {
    let release;const gate=new Promise(r=>release=r);
    const {context,page,requests}=await setup(13,async(r,input)=>{await gate;await response(r,input).catch(()=>{});});
    await page.locator('#practice-message').fill('这句话随后会被取消。');await page.locator('.practice-form [type="submit"]').click();
    await page.waitForFunction(()=>document.querySelector('.practice-form').getAttribute('aria-busy')==='true');await page.waitForTimeout(40);
    await page.keyboard.press('Escape');await page.locator('#journal-button').click();release();await page.waitForTimeout(100);assert.equal(await page.locator('.practice-chat').count(),0);assert.doesNotMatch(await page.locator('#dialog-content').innerText(),/这句话随后会被取消/);assert.equal(requests.length,1);await context.close();
  }
  // The server may commit a first turn whose response was lost on close. An
  // edited draft must start fresh; acknowledged conversations still continue.
  {
    let release,committed,calls=0;
    const held=new Promise(r=>release=r),firstCommitted=new Promise(r=>committed=r),replies=[];
    const practice=createPractice({execute:async prompt=>JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify({
      npc:'我们可以先核对哪一条记录？',...(prompt.includes('"userTurn":2')?{tip:'先指出一条可核对的记录，再约定共同确认的时间。'}:{})
    })}}]})});
    const {context,page,game,requests}=await setup(13,async(r,input)=>{
      const index=calls++;
      try{
        const body=await practice.respond(input);replies[index]=body;
        if(index===0){committed();await held;}
        await r.fulfill({json:body}).catch(()=>{});
      }catch(error){await r.fulfill({status:400,json:{error:error.message}}).catch(()=>{});}
    });
    try{
      const draft='关闭前发送但尚未收到回应的原句。';
      await page.locator('#practice-message').fill(draft);await page.locator('.practice-form [type="submit"]').click();await firstCommitted;
      await page.keyboard.press('Escape');await page.locator('#practice-open').click();
      assert.equal(await page.locator('#practice-message').inputValue(),draft);
      await page.locator('#practice-message').fill('重新打开后，我想先确认交接时间。');await page.locator('.practice-form [type="submit"]').click();
      await page.locator('.practice-round').filter({hasText:'第 2 / 2 轮'}).waitFor();
      assert.equal(requests.length,2);assert.notEqual(requests[1].clientId,requests[0].clientId);assert.equal(requests[1].sessionId,undefined);
      assert.match(await page.locator('.practice-message.npc').last().innerText(),/知乎直答 · 本次回应/);
      release();await page.waitForTimeout(100);assert.doesNotMatch(await page.locator('.practice-chat').innerText(),/尚未收到回应的原句/);
      await page.keyboard.press('Escape');await page.locator('#practice-open').click();
      await page.locator('#practice-message').fill('请把待确认的事项列出来，我们再约核对时间。');await page.locator('.practice-form [type="submit"]').click();
      await page.locator('.practice-tip').waitFor();assert.equal(requests.length,3);
      assert.equal(requests[2].turn,2);assert.equal(requests[2].clientId,requests[1].clientId);assert.equal(requests[2].sessionId,replies[1].sessionId);
      assert.match(await page.locator('.practice-tip small').innerText(),/知乎直答 · 本次回应/);
      assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('four-seasons-life-v4')).game),game);
    }finally{release();practice.dispose();await context.close();}
  }
  assert.deepEqual(errors,[]);console.log('PASS two optional scenes, two turns, actual-choice openings, no score/save mutations, same-message new turn, safe text, explicit fallback, skip/cancel/reopen, 667/844 landscape and portrait resume; all APIs mocked.');
}finally{await browser.close();server?.kill();}
