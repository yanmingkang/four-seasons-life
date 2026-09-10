import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs/promises';
import {newGame,land,choose,advance,previewChoice,snapshot} from '../src/engine.js';
import {mockWorldSource} from './helpers/mock-world.mjs';

const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'C:/Users/25293/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:4173';
const out=new URL('../test-results/',import.meta.url);
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const pageErrors=[];
const event=choose(land(newGame('demo'),2),1);
let ending=newGame('demo');
while(!ending.ended){
  const landed=land(ending,2);
  const index=landed.active.options.map((option,i)=>{
    const next=previewChoice(landed,option);
    return {i,disabled:next.disabled,score:next.mood};
  }).filter(o=>!o.disabled).sort((a,b)=>b.score-a.score)[0].i;
  ending=advance(choose(landed,index));
}

async function setup(game,respond){
  const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce',acceptDownloads:true});
  await context.route('**/api/**',route=>route.fulfill({status:503,json:{error:'unmocked_endpoint_blocked_in_test'}}));
  await context.addInitScript(game=>{localStorage.setItem('four-seasons-life-v4',JSON.stringify({game,seconds:10}));localStorage.setItem('four-seasons-auto-depart','off');},snapshot(game));
  await context.route('**/src/world.js*',route=>route.fulfill({status:200,contentType:'text/javascript',body:mockWorldSource}));
  await context.route('**/api/experience*',route=>route.fulfill({json:{mode:'curated',items:[]}}));
  const requests=[];
  // Every model call is intercepted. These tests must never use official quota.
  await context.route('**/api/narrate',async route=>{
    const payload=route.request().postDataJSON();
    assert.deepEqual(Object.keys(payload).sort(),['game','kind']);
    assert.ok(Array.isArray(payload.game.moves));
    assert.equal(payload.game.version,4);
    assert.equal(Object.hasOwn(payload.game,'money'),false);
    requests.push(payload);
    await respond(route,payload);
  });
  const page=await context.newPage();page.on('pageerror',error=>pageErrors.push(error.message));
  await page.goto(base,{waitUntil:'networkidle'});
  await page.locator('#resume').click();
  if(await page.locator('.reflection-drawer').count()) await page.locator('.reflection-drawer > summary').click();
  return {context,page,requests};
}

const deliver=(route,mode,text)=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({mode,text,model:'zhida-fast-1p5'})});
async function downloadText(page,filename){
  const pending=page.waitForEvent('download');
  await page.locator('#download-note').click();
  const download=await pending;
  const path=fileURLToPath(new URL(filename,out));
  await download.saveAs(path);
  return fs.readFile(path,'utf8');
}

try{
  {
    const malicious='<img src=x onerror="window.__aiXss=1"> 资金 999999，这只是被转义的测试文本。';
    const {context,page,requests}=await setup(event,route=>deliver(route,'live',malicious));
    await page.locator('[data-ai-kind="event"][data-mode="live"]').waitFor();
    assert.equal(await page.locator('.ai-reflection-text').textContent(),malicious);
    assert.equal(await page.locator('.ai-reflection img').count(),0);
    assert.equal(await page.evaluate(()=>window.__aiXss),undefined);
    assert.equal(Number((await page.locator('#money-value').textContent()).replace(/[^0-9]/g,'')),event.money);
    assert.equal(Number(await page.locator('#mood-value').textContent()),event.mood);
    assert.equal(requests.length,1);
    await page.screenshot({path:fileURLToPath(new URL('07-ai-feedback-mocked.png',out)),fullPage:true});
    await context.close();
    console.log('PASS event live, safe text, immutable resources, canonical payload');
  }
  {
    const {context,page}=await setup(event,route=>deliver(route,'fallback','预设备用：下次也给休息留些空间。'));
    await page.locator('[data-ai-kind="event"][data-mode="fallback"]').waitFor();
    assert.match(await page.locator('.ai-reflection-status').textContent(),/备用回顾/);
    assert.match(await page.locator('.ai-reflection-footnote').textContent(),/直答暂不可用.*预设回顾/);
    await context.close();
    console.log('PASS honest fallback label');
  }
  {
    let release;
    const gate=new Promise(resolve=>release=resolve);
    const {context,page}=await setup(event,async route=>{await gate;await deliver(route,'live','这条过期回响不应出现在下一页');});
    await page.locator('[data-ai-kind="event"][data-mode="loading"]').waitFor();
    await page.locator('#next-button').click();
    await page.locator('#continue-travel').waitFor({state:'visible'});
    release();
    await page.waitForTimeout(350);
    assert.equal(await page.locator('#story-panel .ai-reflection').count(),0);
    assert.equal((await page.locator('#story-panel').textContent()).includes('这条过期回响'),false);
    assert.equal(await page.locator('#continue-travel').isEnabled(),true);
    await context.close();
    console.log('PASS fast next step never waits for model; late output cannot overwrite page');
  }
  {
    let release;
    const gate=new Promise(resolve=>release=resolve);
    const finalText='测试模型手记：你在四季里权衡了预算和情绪，下一程仍可以尝试不同的节奏。';
    const {context,page,requests}=await setup(ending,async route=>{await gate;await deliver(route,'live',finalText);});
    await page.locator('[data-ai-kind="summary"][data-mode="loading"]').waitFor();
    const unfinished=await downloadText(page,'ai-summary-pending.txt');
    assert.match(unfinished,/AI 总结尚未生成/);
    assert.ok(unfinished.includes(ending.history[0].choiceLabel));
    await page.locator('#dialog-close').click();
    release();
    await page.waitForTimeout(350);
    assert.equal(await page.locator('#dialog').evaluate(dialog=>dialog.open),false);
    assert.equal((await page.locator('.ai-reflection-text').textContent()).includes(finalText),false);
    await page.locator('#view-summary').click();
    await page.locator('[data-ai-kind="summary"][data-mode="cache"]').waitFor();
    assert.equal(await page.locator('.ai-reflection-text').textContent(),finalText);
    assert.equal(requests.length,1);
    const complete=await downloadText(page,'ai-summary-complete.txt');
    assert.ok(complete.includes(finalText));
    assert.ok(complete.includes(ending.history[0].choiceLabel));
    assert.ok(!complete.includes('AI 总结尚未生成'));
    await page.locator('#dialog').evaluate(dialog=>{dialog.scrollTop=0;});
    await page.screenshot({path:fileURLToPath(new URL('08-ai-summary-mocked.png',out)),fullPage:true});
    await context.close();
    console.log('PASS closed dialog guard, summary cache/deduplication, pending/complete downloads');
  }
  {
    let release;
    const gate=new Promise(resolve=>release=resolve);
    const {context,page,requests}=await setup(ending,async route=>{await gate;await deliver(route,'live','旧一局的回响不能写进新旅程').catch(()=>{});});
    await page.locator('[data-ai-kind="summary"][data-mode="loading"]').waitFor();
    await page.locator('#dialog-close').click();
    await page.locator('#view-summary').click();
    assert.equal(requests.length,1);
    await page.locator('#report-restart').click();
    release();
    await page.waitForTimeout(350);
    assert.equal(await page.locator('#dialog').evaluate(dialog=>dialog.open),false);
    assert.equal(await page.locator('#story-panel .ai-reflection').count(),0);
    assert.equal(Number((await page.locator('#money-value').textContent()).replace(/[^0-9]/g,'')),5000);
    assert.equal(Number(await page.locator('#mood-value').textContent()),100);
    await context.close();
    console.log('PASS in-flight deduplication and new-journey cancellation');
  }
  {
    const {context,page}=await setup(event,route=>route.abort('failed'));
    await page.locator('[data-ai-kind="event"][data-mode="fallback"]').waitFor();
    assert.equal(await page.locator('.ai-reflection-text').textContent(),event.history.at(-1).lesson);
    assert.equal(await page.locator('#next-button').isEnabled(),true);
    await context.close();
    console.log('PASS network failure uses local fallback without blocking play');
  }
  assert.deepEqual(pageErrors,[]);
  console.log('All AI browser checks passed; 0 official model requests, 0 page errors.');
} finally {await browser.close();}
