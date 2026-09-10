// Explicit opt-in: this manual integration check consumes up to ONE real model call.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs/promises';
import {newGame,land,choose,advance,previewChoice,snapshot} from '../src/engine.js';
if(process.env.RUN_LIVE_MODEL!=='1')throw new Error('Set RUN_LIVE_MODEL=1 to authorize one official model request.');
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:4173';
await fs.mkdir(new URL('../test-results/',import.meta.url),{recursive:true});
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'C:/Users/25293/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
let state=newGame('full');
while(state.phase!=='finished'){
  state=land(state,2);
  const options=state.active.options.map((o,i)=>{const p=previewChoice(state,o);return{i,disabled:p.disabled,score:p.mood};}).filter(o=>!o.disabled);
  // Use only affordable actions and preserve mood while preparing a completed fixture.
  const pick=options.sort((a,b)=>b.score-a.score)[0].i;
  state=advance(choose(state,pick));
}
const browser=await chromium.launch({headless:true,channel:'chrome',args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
  const page=await browser.newPage({viewport:{width:1560,height:1080},reducedMotion:'reduce'});
  let requests=0;const errors=[];page.on('pageerror',e=>errors.push(e.message));
  page.on('request',r=>{if(r.url().includes('/api/narrate'))requests++;});
  await page.addInitScript(game=>{localStorage.setItem('four-seasons-life-v3',JSON.stringify({game,seconds:380}));localStorage.setItem('four-seasons-auto-depart','off');},snapshot(state));
  await page.goto(base,{waitUntil:'networkidle'});
  await page.locator('#resume').click();
  const card=page.locator('[data-ai-kind="summary"]');
  await card.waitFor();await page.waitForFunction(()=>document.querySelector('[data-ai-kind="summary"]').dataset.mode!=='loading',null,{timeout:55000});
  const mode=await card.getAttribute('data-mode');assert.ok(['live','cache'].includes(mode),`Expected real model, got ${mode}`);assert.equal(requests,1);
  await page.locator('#dialog').evaluate(d=>d.scrollTop=0);
  await page.screenshot({path:fileURLToPath(new URL('../test-results/official-model-summary.png',import.meta.url)),fullPage:true});
  const downloadPromise=page.waitForEvent('download');await page.locator('#download-note').click();
  await(await downloadPromise).saveAs(fileURLToPath(new URL('../test-results/official-model-note.txt',import.meta.url)));
  assert.deepEqual(errors,[]);console.log(JSON.stringify({mode,requests,turns:state.turn,ending:state.ended,text:await card.locator('.ai-reflection-text').textContent(),errors},null,2));
}finally{await browser.close();}
