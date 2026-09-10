// Explicit manual live check of the SAME sample UI, at most two fictional inputs.
// Never imported by npm test, never silently retries a failed model response.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import net from 'node:net';
import {spawn} from 'node:child_process';
if(process.env.RUN_LIVE_SAMPLE!=='1')throw new Error('A real Zhihu two-turn check can consume quota. Set RUN_LIVE_SAMPLE=1 deliberately.');
const require=createRequire(import.meta.url);
const {chromium}=require('C:/Users/25293/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
// An owned isolated process uses the CURRENT backend without restarting the
// user's open game. No configurable public origin or extra model retries.
const probe=net.createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
const base=`http://127.0.0.1:${port}`;
const server=spawn(process.execPath,['server.mjs','--production'],{cwd:fileURLToPath(new URL('../',import.meta.url)),env:{...process.env,PORT:String(port)},windowsHide:true,stdio:'ignore'});
const browser=await chromium.launch({channel:'chrome',headless:true});const rounds=[];
const out=new URL('../test-results/',import.meta.url);await fs.mkdir(out,{recursive:true});
try{
  for(let i=0;i<80;i++){try{if((await fetch(base+'/api/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,50));if(i===79)throw new Error('Own production server failed');}
  const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'});let calls=0;
  await context.route('**/api/**',async route=>{
    const url=new URL(route.request().url());
    if(url.pathname==='/api/practice'&&route.request().method()==='POST'&&calls<2){calls++;return route.continue();}
    return route.fulfill({status:503,json:{error:'Unrelated API disabled in acceptance'}});
  });
  const page=await context.newPage();await page.goto(base);await page.locator('#start-sample').click();await page.locator('[data-choice="0"]').click();await page.locator('#sample-practice').click();
  const messages=['我不是在判断谁的态度，想先核对已经记录的交付时间，没确认的地方请大家补充。','我可以整理待确认事项，请双方各约一位了解情况的同事，明天下午一起核对，可以吗？'];
  for(let i=0;i<2;i++){
    await page.locator('#practice-message').fill(messages[i]);
    const responsePromise=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/practice',{timeout:28000});const began=performance.now();
    await page.locator('.practice-form [type=submit]').click();const response=await responsePromise;const data=await response.json();
    rounds.push({turn:i+1,httpStatus:response.status(),mode:data.mode,model:data.model,elapsedMs:Math.round(performance.now()-began),npc:data.npc||null,tip:data.tip||null});
    if(response.status()!==200||data.mode!=='live')break;
    await page.locator('.practice-round').filter({hasText:i===0?'第 2 / 2 轮':'练习完成'}).waitFor();
  }
  const passed=rounds.length===2&&rounds.every(r=>r.httpStatus===200&&r.mode==='live');
  if(passed){await page.locator('.practice-exit').click();await page.locator('#sample-collect').waitFor();assert.equal(await page.locator('.zhihu-echo').isVisible(),true);assert.equal(await page.locator('.method-card').count(),1);await page.screenshot({path:fileURLToPath(new URL('sample-live-method-guarded.png',out))});}
  const report={checkedAt:new Date().toISOString(),provider:'知乎官方CLI / 知乎直答',scope:'本机真实浏览器样板关，完全虚构台词，未验证外网',passed,calls,rounds};
  await fs.writeFile(new URL('sample-live-check-guarded.json',out),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));if(!passed)process.exitCode=1;
}finally{await browser.close();server.kill();}
