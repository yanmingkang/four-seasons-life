// Actual WebGL + production UI, isolated storage and mocked auth/business APIs.
// These are viewport/fixture regressions, not physical-phone or live OAuth tests.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
import {newGame,land,choose,advance,snapshot,restore} from '../src/engine.js';
import {completeMemoryFixture} from './memory-fixtures.mjs';
import {JOURNEY_STORAGE_KEY} from '../src/journey-storage.js';
import {claimLegacy,LEGACY_KEY} from '../src/life-legacy.js';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH||'C:/Users/25293/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const out=fileURLToPath(new URL('../test-results/mobile-layout/',import.meta.url));
await fs.mkdir(out,{recursive:true});
const report={passed:false,cases:[],errors:[],realApiCalls:0,method:'Chrome touch viewports + actual WebGL; mocked auth/503 business APIs; legal saved fixtures; keyboard simulated via VisualViewport events, not physical iPhone/WeChat.'};
let vite,browser,page,phase='init';
const checks=[];
async function visible(selector){
  const result=await page.locator(selector).evaluate(node=>{
    const r=node.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
    const vv=window.visualViewport,top=vv?.offsetTop||0,left=vv?.offsetLeft||0,style=getComputedStyle(document.documentElement);
    const safe=side=>parseFloat(style.getPropertyValue('--game-safe-'+side))||0;
    return {selector:node.id||node.className,rect:r.toJSON(),within:r.width>0&&r.height>0&&r.top>=top+safe('top')-1&&r.left>=left+safe('left')-1&&r.bottom<=top+(vv?.height||innerHeight)-safe('bottom')+1&&r.right<=left+(vv?.width||innerWidth)-safe('right')+1,hit:node===hit||node.contains(hit)};
  });
  checks.push({phase,...result});assert.ok(result.within,`${phase}: ${selector} fits viewport`);assert.ok(result.hit,`${phase}: ${selector} not covered`);
}
const capture=name=>page.screenshot({path:`${out}/${name}.png`});
async function open(width,height,{game=null,legacy=false,keyboard=false,anonymous=false}={}){
  const ctx=await browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true,deviceScaleFactor:1,reducedMotion:'reduce'});
  const data=new Map(),storage={getItem:key=>data.get(key)||null,setItem:(key,value)=>data.set(key,value)};
  if(legacy)assert.ok(claimLegacy(completeMemoryFixture(),storage).claimed);
  await ctx.addInitScript(({key,game,legacyKey,legacyValue,keyboard})=>{
    localStorage.setItem('four-seasons-auto-depart','off');localStorage.setItem('four-seasons-music','off');
    if(game)localStorage.setItem(key,JSON.stringify({game,seconds:123,practiceInvitation:{version:1,seen:true,resolved:true,kind:'fallback'}}));
    if(legacyValue)localStorage.setItem(legacyKey,legacyValue);
    if(keyboard){
      const vv=new EventTarget();Object.assign(vv,{width:innerWidth,height:innerHeight,offsetTop:0,offsetLeft:0,scale:1});
      Object.defineProperty(window,'visualViewport',{value:vv,configurable:true});
      window.testKeyboard=(height,offsetTop=0)=>{Object.assign(vv,{height,offsetTop});vv.dispatchEvent(new Event('resize'));vv.dispatchEvent(new Event('scroll'));};
      document.addEventListener('DOMContentLoaded',()=>{vv.width=innerWidth;window.testKeyboard(innerHeight);},{once:true});
    }
  },{key:JOURNEY_STORAGE_KEY,game,legacyKey:LEGACY_KEY,legacyValue:data.get(LEGACY_KEY),keyboard});
  await ctx.route('**/*',route=>{
    const url=new URL(route.request().url());
    if(url.origin!==base&&!['blob:','data:'].includes(url.protocol))return route.abort();
    if(url.pathname==='/api/auth/status')return route.fulfill({json:{enabled:true,authenticated:!anonymous,provider:'zhihu',callbackUrl:base+'/api/auth/zhihu/callback',...(!anonymous?{profile:{name:'手机布局验收账户名字很长'}}:{})}});
    if(url.pathname.startsWith('/api/'))return route.fulfill({status:503,json:{error:'isolated_layout_no_live_api'}});
    return route.continue();
  });
  page=await ctx.newPage();page.setDefaultTimeout(30000);page.on('pageerror',e=>report.errors.push(e.message));
  await page.goto(base);await page.locator('#scene[data-assets="ready"][data-renderer="webgl"]').waitFor();
  await page.locator('#start-full').waitFor();
  return ctx;
}
async function resume(){await page.locator('#start-full').click();await page.locator('#resume').click();}
let base;
try{
  vite=await createServer({root:fileURLToPath(new URL('../',import.meta.url)),server:{host:'127.0.0.1',port:0}});await vite.listen();base=vite.resolvedUrls.local[0].replace(/\/$/,'');
  browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--use-gl=angle','--use-angle=d3d11','--ignore-gpu-blocklist']});
  for(const [width,height]of [[812,280],[667,280],[844,300],[844,390],[1280,800]]){
    phase=`welcome-${width}x${height}`;const ctx=await open(width,height,{legacy:true,anonymous:width===812});
    assert.equal(await page.locator('.welcome-actions button').count(),1);await visible('#start-full');
    assert.equal(await page.locator('.daylight-switch').isVisible(),false);
    await page.locator('#character-name').fill('手机长昵称十六个字符也要完整保留');
    for(const value of ['defense','ambitious','optimistic']){
      const input=page.locator(`input[name="talent"][value="${value}"]`);
      await page.locator(`.talent-picker label:has(input[value="${value}"])`).scrollIntoViewIfNeeded();await input.check();
      await visible(`.talent-picker label:has(input[value="${value}"])`);await visible('#start-full');
    }
    await page.locator('#inherit-next').uncheck();await visible('#inherit-next');await visible('#start-full');
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    await capture(phase+'-settings');
    await page.locator('#character-name').scrollIntoViewIfNeeded();await capture(phase);
    if(width===844&&height===390){
      await page.setViewportSize({width:390,height:844});await page.locator('#orientation-gate').waitFor();
      await page.setViewportSize({width,height});await page.locator('#orientation-gate').waitFor({state:'hidden'});await visible('#start-full');
      await page.locator('#start-full').click();await page.locator('.experience[data-stage="ready"]').waitFor();
      await visible('.daylight-switch');await page.locator('[data-daylight="sunset"]').click();
      await page.locator('#scene[data-time-of-day="sunset"]').waitFor();
      const record=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),JOURNEY_STORAGE_KEY);assert.ok(restore(record.game));
      assert.equal(record.game.talent,'optimistic');await capture('started-844');
    }
    report.cases.push(phase);await ctx.close();
  }
  phase='keyboard';const keyboardCtx=await open(844,390,{keyboard:true});await page.locator('#character-name').focus();
  for(const [height,offset]of [[220,0],[220,40],[390,0]]){
    await page.evaluate(([h,o])=>window.testKeyboard(h,o),[height,offset]);await page.waitForTimeout(150);
    await page.locator('#character-name').scrollIntoViewIfNeeded();await visible('#character-name');await visible('#start-full');await capture(`keyboard-${height}-${offset}`);
  }
  report.cases.push(phase);await keyboardCtx.close();
  phase='practice-keyboard';let practiceGame=newGame('full',{enriched:true,talent:'optimistic'});
  for(let i=0;i<2;i++)practiceGame=advance(choose(land(practiceGame,6),0));practiceGame=choose(land(practiceGame,1),0);
  const practiceCtx=await open(844,390,{game:snapshot(practiceGame),keyboard:true});await resume();await page.locator('#practice-open').click();
  const practiceInput=page.locator('.practice-form textarea');await practiceInput.fill('我们先核对记录，再确认各自负责的部分。');
  await page.evaluate(()=>window.testKeyboard(220,40));await page.waitForTimeout(150);await practiceInput.scrollIntoViewIfNeeded();
  await visible('#dialog');await visible('.practice-form textarea');await visible('#dialog-close');await capture(phase);
  for(let i=0;i<2;i++){
    if(i)await practiceInput.fill('我们一起整理时间线，今天确认交付负责人。');
    await page.locator('.practice-compose-meta .primary').click();
    await page.waitForFunction(count=>document.querySelectorAll('.practice-message.player').length===count,i+1);
  }
  await page.locator('.practice-form').waitFor({state:'hidden'});assert.match(await page.locator('.practice-round').innerText(),/完成/);
  const unchanged=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).game,JOURNEY_STORAGE_KEY);assert.deepEqual(unchanged,snapshot(practiceGame));
  report.cases.push(phase);await practiceCtx.close();
  for(const [width,height]of [[667,280],[844,300]]){
    let game=newGame('full',{enriched:true,talent:'optimistic'});for(let i=0;i<2;i++)game=advance(choose(land(game,6),0));game=land(game,6);
    phase=`hospital-${width}`;const ctx=await open(width,height,{game:snapshot(game)});await resume();
    await page.locator('.experience[data-stage="choice"]').waitFor();
    // Resume may replay the legitimate arrival video; the normal skip is a user control.
    const skip=page.locator('[data-cinematic-skip],#cinematic-skip');if(await skip.isVisible())await skip.click();
    assert.equal(await page.locator('.daylight-switch').isVisible(),false);
    const choices=page.locator('.choice');assert.equal(await choices.count(),3);
    for(let i=0;i<3;i++){await choices.nth(i).scrollIntoViewIfNeeded();await visible(`.choice:nth-child(${i+1})`);}
    await capture(phase);await choices.first().click();await page.locator('.experience[data-stage="feedback"]').waitFor();
    await page.locator('#next-button').scrollIntoViewIfNeeded();await visible('#next-button');await capture(phase+'-feedback');
    report.cases.push(phase);await ctx.close();
  }
  for(const [width,height]of [[667,280],[844,300]]){
    phase=`memories-${width}`;const ctx=await open(width,height,{game:snapshot(completeMemoryFixture())});
    if(width===844)await page.evaluate(()=>{document.documentElement.style.setProperty('--game-safe-left','44px');document.documentElement.style.setProperty('--game-safe-bottom','21px');});
    await resume();
    await page.locator('.memory-album').waitFor();
    for(let i=0;i<8;i++){
      await page.locator(`[data-memory-go="${i}"]`).click();
      await visible('[data-memory-step="1"]');await visible('[data-memory-go="7"]');await visible('#dialog-close');
      await page.locator('.memory-page img').evaluateAll(images=>Promise.all(images.map(img=>img.decode().catch(()=>{}))));
      await capture(`${phase}-${i}`);
    }
    const share=page.locator('#share-card');
    if(await share.count()){await share.click();await page.locator('.share-preview').waitFor();await visible('.share-actions');await capture(`${phase}-share`);}
    report.cases.push(phase);await ctx.close();
  }
  assert.deepEqual(report.errors,[]);report.passed=true;
}catch(error){report.failure={phase,message:error.message};if(page&&!page.isClosed())await capture('failure').catch(()=>{});throw error;}
finally{report.checks=checks;await fs.writeFile(`${out}/report.json`,JSON.stringify(report,null,2));await browser?.close();await vite?.close();}
console.log(JSON.stringify({passed:report.passed,cases:report.cases.length,checks:checks.length,realApiCalls:0}));
