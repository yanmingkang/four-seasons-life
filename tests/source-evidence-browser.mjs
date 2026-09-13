import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createServer} from 'node:net';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {mkdir,writeFile} from 'node:fs/promises';
import {EVENTS} from '../src/events.js';
import {SOURCES} from '../src/sources.js';

const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_PATH||'C:/Users/25293/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=fileURLToPath(new URL('../',import.meta.url)),out=new URL('../test-results/art-refinement/',import.meta.url);
await mkdir(out,{recursive:true});
const probe=createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
const server=spawn(process.execPath,['server.mjs','--production'],{cwd:root,env:{...process.env,PORT:String(port),ZHIHU_CLI_PATH:'Z:/disabled-evidence-check.exe'},windowsHide:true,stdio:'ignore'});
let browser;const errors=[],report={passed:false,officialApiCalls:0};
try{
  const base=`http://127.0.0.1:${port}`;
  for(let i=0;i<100;i++){try{if((await fetch(base)).ok)break;}catch{}if(i===99)throw Error('Server not ready');await new Promise(r=>setTimeout(r,100));}
  browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'});
  await context.route('**/api/**',route=>route.fulfill({status:503,json:{error:'isolated evidence test'}}));
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base);await page.locator('#scene[data-assets="ready"]').waitFor();
  await page.locator('#all-sources').click();const cards=page.locator('.source-card');
  const ids=[...new Set(EVENTS.flatMap(event=>event.sources))];
  assert.equal(await cards.count(),ids.length);assert.equal(ids.length,33);
  assert.match(await page.locator('#dialog').innerText(),/33 条独立来源/);
  assert.doesNotMatch(await page.locator('.source-list').innerText(),/作者待核对/);
  const links=await cards.locator(':scope > a').evaluateAll(nodes=>nodes.map(n=>n.href));
  assert.deepEqual(links,ids.map(id=>SOURCES[id].url));
  const first=cards.first();await first.locator('summary').click();assert.ok((await first.innerText()).includes(SOURCES[ids[0]].excerpt));
  assert.match(await first.innerText(),/未读取完整原文/);
  await page.screenshot({path:fileURLToPath(new URL('sources-desktop.png',out))});
  await page.setViewportSize({width:844,height:390});assert.equal(await page.locator('#dialog').evaluate(el=>el.scrollWidth<=el.clientWidth+2),true);
  await page.screenshot({path:fileURLToPath(new URL('sources-landscape.png',out))});
  assert.deepEqual(errors,[]);Object.assign(report,{passed:true,mappedSources:ids.length,missingAuthors:0,excerptVisible:true,landscapeFits:true});
  console.log(JSON.stringify(report,null,2));
}finally{await writeFile(new URL('source-browser-report.json',out),JSON.stringify({...report,errors},null,2));await browser?.close();server.kill();}
