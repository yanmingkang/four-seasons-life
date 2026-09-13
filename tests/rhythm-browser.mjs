// Isolated storage/server and real WebGL UI. No model or external network calls.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import fs from 'node:fs/promises';
import {newGame,land,choose,advance,previewChoice,snapshot,restore} from '../src/engine.js';
import {effortFor} from '../src/journey-rhythm.js';
import {KEY_DETAILS} from '../src/event-copy.js';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_PATH||'C:/Users/25293/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=fileURLToPath(new URL('../',import.meta.url)),out=new URL('../test-results/journey-rhythm/',import.meta.url);
await fs.mkdir(out,{recursive:true});
function fixture(number){
  let s=newGame('full',{enriched:true});
  // Arrive through replayable actions, never a manufactured balance or position.
  if(number===13){s=advance(choose(land(s,6),0));s=advance(choose(land(s,5),0));return snapshot(land(s,2));}
  while(s.position<number-1){
    s=land(s,Math.min(6,number-1-s.position));if(s.active.number===number)break;
    const options=s.active.options.map((o,i)=>({i,p:previewChoice(s,o)})).filter(e=>!e.p.disabled).sort((a,b)=>effortFor(s.active.number,a.i)-effortFor(s.active.number,b.i));
    s=advance(choose(s,options[0].i));assert.ok(!s.ended);
  }
  return snapshot(s);
}
const fixtures=Object.fromEntries([4,8,12,24,...Object.keys(KEY_DETAILS).map(Number)].map(n=>[n,fixture(n)]));
let early=newGame('full',{enriched:true,talent:'ambitious'});
while(!early.ended){
  early=land(early,1);
  const options=early.active.options.map((o,i)=>({i,p:previewChoice(early,o)})).filter(e=>!e.p.disabled).sort((a,b)=>effortFor(early.active.number,b.i)-effortFor(early.active.number,a.i));
  early=choose(early,options[0].i);if(!early.ended)early=advance(early);
}
assert.equal(early.ended,'mood');assert.ok(early.position<39);fixtures.early=snapshot(early);
const probe=createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
const production=process.argv.includes('--production');
const server=spawn(process.execPath,['server.mjs',...(production?['--production']:[])],{cwd:root,env:{...process.env,PORT:String(port),ZHIHU_CLI_PATH:'Z:/disabled-rhythm-test/cli.exe'},windowsHide:true,stdio:'ignore'}),base=`http://127.0.0.1:${port}`;
const report={passed:false,production,views:[],mockedModelRequests:0,realModelRequests:0,errors:[]};let browser;
try{
  for(let i=0;i<100;i++){try{if((await fetch(base)).ok)break;}catch{}if(i===99)throw Error('Test server unavailable');await new Promise(r=>setTimeout(r,100));}
  browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--use-gl=angle','--use-angle=d3d11','--ignore-gpu-blocklist']});
  for(const [width,height]of [[1440,900],[844,390]]){
    const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:1,reducedMotion:'reduce',serviceWorkers:'block'});
    await context.route('**/*',r=>{const u=new URL(r.request().url());return u.origin===base||['data:','blob:'].includes(u.protocol)?r.continue():r.abort();});
    await context.route('**/api/**',r=>{
      if(/\/api\/(narrate|practice)/.test(r.request().url())){
        report.mockedModelRequests++;
        const input=r.request().postDataJSON();
        assert.equal(input.kind,'summary','only the early-ending summary may be requested');
        assert.equal(restore(input.game)?.ended,'mood');
      }
      return r.fulfill({status:503,json:{error:'Isolated UI test'}});
    });
    await context.addInitScript(fixtures=>{
      localStorage.setItem('four-seasons-auto-depart','off');localStorage.setItem('four-seasons-music','off');
      const game=fixtures[new URL(location.href).searchParams.get('rhythm-case')];
      if(game)localStorage.setItem('four-seasons-life-v4',JSON.stringify({game,seconds:0}));
    },fixtures);
    const page=await context.newPage();page.setDefaultTimeout(25000);page.on('pageerror',e=>report.errors.push(e.message));
    const saved=async()=>restore(await page.evaluate(()=>JSON.parse(localStorage.getItem('four-seasons-life-v4')).game));
    async function inspect(name){
      await page.screenshot({path:fileURLToPath(new URL(`${name}-${width}${production?'-production':''}.png`,out))});
      const info=await page.evaluate(()=>({scrollWidth:document.documentElement.scrollWidth,width:innerWidth,renderer:document.querySelector('#scene').dataset.renderer,choices:document.querySelectorAll('[data-choice]').length,scene:document.querySelector('.event-scene')?.textContent,result:document.querySelector('.result-copy')?.textContent}));
      assert.equal(info.renderer,'webgl');assert.ok(info.scrollWidth<=info.width);report.views.push({name,width,height,...info});
    }
    for(const n of [4,6,8,11,12,13,15,18,22,24,27,31]){
      await page.goto(`${base}/?rhythm-case=${n}`);await page.locator('#scene[data-assets="ready"]').waitFor();await page.locator('#resume').click();
      await page.locator('.experience[data-stage="choice"]').waitFor();
      assert.equal(await page.locator('[data-choice]').count(),3);
      assert.equal(await page.locator('.choice-intention').count(),KEY_DETAILS[n]?3:0);
      const text=await page.locator('.options').innerText();assert.doesNotMatch(text,/[+−-]\s*\d|条件已满足|本局将暂歇/);
      await inspect(`choice-${n}`);
      if(height<500){
        const bounds=await page.locator('#story-panel').boundingBox();
        for(const b of await page.locator('[data-choice]').all()){
          const r=await b.boundingBox();assert.ok(r.y>=bounds.y&&r.y+r.height<=bounds.y+bounds.height,`all three choices visible: ${n}`);
        }
        if(n===18){await page.locator('.choice-context summary').click();assert.ok(await page.locator('.choice-context[open]').count());assert.doesNotMatch(await page.locator('.choice-context').innerText(),/[+−-]\s*\d|条件已满足/);await page.locator('.choice-context summary').click();}
      }
      if(n===13){
        assert.ok((await saved()).life.strain.fatigue>=4);
        const hint=page.locator('[data-open-inventory]');assert.equal(await hint.count(),1);await hint.click();
        await page.locator('#dialog[open]').waitFor();const before=await saved();
        await page.locator('[data-use-item="coffee"]').click();const after=await saved();
        assert.equal(after.life.strain.fatigue,Math.max(0,before.life.strain.fatigue-2));assert.equal(after.money,before.money-100);
        assert.equal(await page.locator('[data-use-item="coffee"]').isDisabled(),true);
        await page.locator('[data-use-item="mentor"]').click();assert.equal(await page.locator('#dialog .mentor-preview').count(),1);
        assert.doesNotMatch(await page.locator('#dialog .mentor-preview').innerText(),/资金|情绪|专业|\+\d|将暂歇/);
        await inspect('inventory-after-rest');await page.locator('#dialog-close').click();
        assert.equal(await page.locator('.decision-area .mentor-preview').count(),1);
        assert.equal(await page.locator('[data-open-inventory]').count(),0,'no repeated same-turn hint after use');
      }
      if([4,12,13,24].includes(n)){
        await page.locator('[data-choice="0"]').click();await page.locator('.experience[data-stage="feedback"]').waitFor();
        const current=await saved();assert.equal(current.phase,'feedback');assert.ok(current.history.at(-1).result);
        assert.match(await page.locator('.result-stats').innerText(),/情绪/);
        if(n===12||n===24){const before=restore(fixtures[n]);assert.equal(current.mood,Math.min(current.moodMax,before.mood+20+(before.seasonRecovery||0)));}
        await inspect(`feedback-${n}`);await page.locator('#next-button').click();await page.locator('.experience[data-stage="ready"]').waitFor();
      }
      assert.equal(await page.locator('#scene canvas').evaluate(c=>c.getContext('webgl2').getError()),0);
    }
    await page.goto(`${base}/?rhythm-case=early`);await page.locator('#scene[data-assets="ready"]').waitFor();await page.locator('#resume').click();
    await page.locator('.experience[data-stage="feedback"]').waitFor();
    assert.equal((await saved()).ended,'mood');assert.equal(await page.locator('[data-open-inventory]').count(),0);
    await inspect('early-ending-feedback');await page.locator('#next-button').click();
    await page.locator('.experience[data-stage="finished"]').waitFor();assert.ok(await page.locator('#view-summary').isVisible());
    assert.match(await page.locator('.ending-tag').innerText(),/未竟之书/);await inspect('early-ending-book');
    await context.close();
  }
  // The default memory ending uses settled records; AI is now only requested
  // when the player opens the preserved detailed report.
  assert.deepEqual(report.errors,[]);assert.equal(report.mockedModelRequests,0);report.passed=true;
}finally{
  await fs.writeFile(new URL(`browser${production?'-production':''}.json`,out),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));await browser?.close();server.kill();
}
