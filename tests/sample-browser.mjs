// Production sample acceptance, no real CLI calls. Original v4 save is a sentinel.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs/promises';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {newGame,snapshot} from '../src/engine.js';
import {METHOD_STORAGE_KEY} from '../src/method-cards.js';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'C:/Users/25293/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=fileURLToPath(new URL('../',import.meta.url)),out=new URL('../test-results/',import.meta.url);
const probe=net.createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
const base=`http://127.0.0.1:${port}`;
const server=spawn(process.execPath,['server.mjs','--production'],{cwd:root,env:{...process.env,PORT:String(port),ZHIHU_CLI_PATH:'D:/知乎黑客松/disabled-sample-test-cli.exe'},windowsHide:true,stdio:'ignore'});
const browser=await chromium.launch({channel:'chrome',headless:true});const errors=[],results=[];
const original=JSON.stringify({game:snapshot(newGame('full',{name:'原旅程保留',talent:'optimistic'})),seconds:63});
const reply=(route,input)=>route.fulfill({json:{mode:'live',model:'zhida-fast-1p5',sessionId:'s'.repeat(32),turn:input.turn,done:input.turn===2,npc:input.turn===1?'你提到了时间线，那我们先核对哪一项？':'我们先把各自确认的记录放在一起，尚未确定的部分再核对。',...(input.turn===2?{tip:'先指出一条可以核对的记录，再约定下次共同确认的时间。'}:{})}});
async function setup({width=1440,height=900,respond=reply}={}){
  const context=await browser.newContext({viewport:{width,height},reducedMotion:'reduce'}),requests=[];
  await context.route('**/api/**',r=>r.fulfill({status:503,json:{error:'Business API isolated by test'}}));
  await context.route('**/api/practice',async r=>{const input=r.request().postDataJSON();requests.push(input);await respond(r,input);});
  await context.addInitScript(({original})=>{if(localStorage.getItem('four-seasons-life-v4')===null)localStorage.setItem('four-seasons-life-v4',original);localStorage.setItem('four-seasons-auto-depart','off');},{original});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  const began=performance.now();await page.goto(base);await page.locator('#start-sample').waitFor();const firstReadyMs=Math.round(performance.now()-began);
  await page.locator('#start-sample').click();await page.locator('[data-sample-stage="choice"]').waitFor();
  assert.equal(await page.locator('[data-choice]').count(),3);assert.equal(requests.length,0);
  assert.match(await page.locator('.sample-heading').innerText(),/独立预设情境/);
  assert.doesNotMatch(await page.locator('.options').innerText(),/[+−-]\s*\d|\d+\s*元|情绪.*[加减]/);
  return {context,page,requests,firstReadyMs};
}
async function unchanged(page){assert.equal(await page.evaluate(()=>localStorage.getItem('four-seasons-life-v4')),original);}
try{
  for(let i=0;i<80;i++){try{if((await fetch(base+'/api/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,50));if(i===79)throw new Error('Own production server failed');}
  await fs.mkdir(out,{recursive:true});
  // Complete representative sequence and revisit the explicitly collected method.
  {
    const {context,page,requests,firstReadyMs}=await setup();await page.screenshot({path:fileURLToPath(new URL('sample-choice-desktop.png',out))});
    await page.locator('[data-choice="0"]').click();await page.locator('#sample-practice').waitFor();assert.equal(await page.locator('.zhihu-echo').count(),0);
    await page.locator('#sample-practice').click();await page.locator('#practice-message').fill('虚构练习标记：请先核对昨天的交付记录。');await page.locator('.practice-form [type=submit]').click();
    await page.locator('.practice-round').filter({hasText:'第 2 / 2 轮'}).waitFor();assert.equal(await page.locator('.zhihu-echo').count(),0);
    await page.screenshot({path:fileURLToPath(new URL('sample-practice-desktop.png',out))});
    await page.locator('#practice-message').fill('虚构练习标记：请先核对昨天的交付记录。');await page.locator('.practice-form [type=submit]').click();
    await page.locator('.practice-round').filter({hasText:'练习完成'}).waitFor();assert.equal(await page.locator('.practice-tip').isVisible(),false);
    assert.equal(requests.length,2);assert.deepEqual(requests[0].sample,{id:'cross-team-v1',choice:0});assert.equal(Object.hasOwn(requests[0],'game'),false);
    await unchanged(page);assert.equal(await page.evaluate(key=>localStorage.getItem(key),METHOD_STORAGE_KEY),null);
    await page.locator('.practice-exit').click();await page.locator('[data-sample-stage="lesson"]').waitFor();
    assert.equal(await page.locator('.zhihu-echo').isVisible(),true);assert.match(await page.locator('.method-action').innerText(),/共同确认/);
    await page.locator('.zhihu-echo-context > summary').click();assert.match(await page.locator('.zhihu-echo-context').innerText(),/北海皆非|知乎知了/);
    await page.locator('.zhihu-echo-context > summary').click();await page.locator('#sample-collect').click();await page.screenshot({path:fileURLToPath(new URL('sample-method-desktop.png',out))});
    const cards=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),METHOD_STORAGE_KEY);assert.equal(cards.length,1);assert.doesNotMatch(JSON.stringify(cards),/虚构练习标记|sessionId|clientId|rows|draft/);
    await page.locator('#sample-home').click();await page.locator('#method-notebook').click();assert.equal(await page.locator('.method-card').count(),1);await page.keyboard.press('Escape');
    await page.reload();await page.locator('#method-notebook').click();assert.equal(await page.locator('.method-card').count(),1);await unchanged(page);assert.equal(requests.length,2);
    results.push({flow:'complete-two-turns-source-method-reload',firstReadyMs,model:'mock',calls:2});await context.close();
  }
  // Other choices, skip without AI and narrow landscape.
  for(const [choice,width,height] of [[1,844,390],[2,667,375]]){
    const {context,page,requests}=await setup({width,height});await page.locator(`[data-choice="${choice}"]`).click();await page.locator('#sample-skip').click();
    assert.match(await page.locator('.method-card').innerText(),/预设方法/);assert.equal(requests.length,0);await page.locator('#sample-collect').scrollIntoViewIfNeeded();await page.locator('#sample-collect').click();
    const box=await page.locator('#dialog').boundingBox();assert.ok(box.x>=0&&box.y>=0&&box.x+box.width<=width+1&&box.y+box.height<=height+1);
    await page.screenshot({path:fileURLToPath(new URL(`sample-method-${width}.png`,out))});await unchanged(page);results.push({flow:'skip',choice,width,modelCalls:0});await context.close();
  }
  // One-turn skip is allowed and cannot present a made-up model coaching tip.
  {
    const {context,page,requests}=await setup();await page.locator('[data-choice="2"]').click();await page.locator('#sample-practice').click();
    await page.locator('#practice-message').fill('先共同核对一下记录。');await page.locator('.practice-form [type=submit]').click();await page.locator('.practice-round').filter({hasText:'第 2 / 2 轮'}).waitFor();
    await page.locator('.practice-exit').click();assert.match(await page.locator('.method-card').innerText(),/编辑整理的预设方法 · 非实时 AI/);assert.equal(requests.length,1);await unchanged(page);await context.close();
  }
  // Offline response remains useful, explicitly prewritten; close cancels late UI.
  {
    const {context,page,requests}=await setup({respond:r=>r.abort()});await page.locator('[data-choice="0"]').click();await page.locator('#sample-practice').click();
    for(let turn=1;turn<=2;turn++){await page.locator('#practice-message').fill('我希望把待确认的事情写清楚。');await page.locator('.practice-form [type=submit]').click();await page.locator('.practice-round').filter({hasText:turn===1?'第 2 / 2 轮':'练习完成'}).waitFor();}
    assert.match(await page.locator('.practice-status').innerText(),/预设/);await page.locator('.practice-exit').click();assert.match(await page.locator('.method-card').innerText(),/预设练习 · 非实时 AI/);assert.equal(requests.length,1);await unchanged(page);await context.close();
  }
  {
    let release;const wait=new Promise(r=>release=r);const {context,page}=await setup({respond:async(r,i)=>{await wait;await reply(r,i).catch(()=>{});}});
    await page.locator('[data-choice="1"]').click();await page.locator('#sample-practice').click();await page.locator('#practice-message').fill('取消中的样板请求。');await page.locator('.practice-form [type=submit]').click();
    await page.locator('.practice-form[aria-busy="true"]').waitFor();await page.keyboard.press('Escape');await page.locator('#method-notebook').click();release();await page.waitForTimeout(120);
    assert.equal(await page.locator('.sample-room').count(),0);assert.doesNotMatch(await page.locator('#dialog-content').innerText(),/取消中的/);await unchanged(page);await context.close();
  }
  assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,results,errors,officialModelCalls:0},null,2));
  await fs.writeFile(new URL('sample-browser.json',out),JSON.stringify({passed:true,results,errors,officialModelCalls:0},null,2));
}finally{await browser.close();server.kill();}
