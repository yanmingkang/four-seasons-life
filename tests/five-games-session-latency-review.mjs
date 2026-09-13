// Read-only product review: all auth/business traffic and the world are mocked.
// Runs the actual main.js and auth controller in an isolated browser profile.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
import {JOURNEY_STORAGE_KEY} from '../src/journey-storage.js';
import {mockWorldSource} from './helpers/mock-world.mjs';
const require=createRequire(import.meta.url);
const {chromium}=require('C:/Users/25293/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=fileURLToPath(new URL('../',import.meta.url));
const report={passed:false,method:{realMain:true,world:'mock',allAuthMocked:true,realOAuthCalls:0,realModelCalls:0,realSearchCalls:0,periodicCheck:'One actual registered 60000ms callback invoked by test; request timeout remains production 8000ms.'},pageErrors:[],externalRequests:0,cases:[]};
let vite,browser,context,base,statusCalls=0,authStarts=0,stallNext=false;
try{
  vite=await createServer({root,configFile:false,logLevel:'error',server:{host:'127.0.0.1',port:0,strictPort:true}});await vite.listen();
  base=`http://127.0.0.1:${vite.httpServer.address().port}`;
  browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-proxy-server']});
  context=await browser.newContext({viewport:{width:1280,height:800},reducedMotion:'reduce',serviceWorkers:'block'});
  await context.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.origin!==base){report.externalRequests++;await route.abort();return;}
    if(url.pathname==='/src/world.js'){await route.fulfill({contentType:'text/javascript',body:mockWorldSource});return;}
    if(url.pathname==='/api/auth/status'){
      statusCalls++;
      if(stallNext){stallNext=false;await new Promise(resolve=>setTimeout(resolve,10000));}
      await route.fulfill({json:{enabled:true,provider:'zhihu',callbackUrl:base+'/api/auth/zhihu/callback',authenticated:true,profile:{name:'模拟有效账号'}}}).catch(()=>{});return;
    }
    if(url.pathname==='/api/auth/zhihu/start')authStarts++;
    if(url.pathname.startsWith('/api/')){await route.fulfill({status:503,json:{error:'no_real_api'}});return;}
    await route.continue();
  });
  await context.routeWebSocket('**/*',socket=>socket.close());
  await context.addInitScript(()=>{
    localStorage.setItem('four-seasons-auto-depart','off');localStorage.setItem('four-seasons-music','off');
    const random=crypto.getRandomValues.bind(crypto);crypto.getRandomValues=array=>{if(array instanceof Uint32Array&&array.length===1){array[0]=0;return array;}return random(array);};
    const interval=window.setInterval.bind(window);window.__reviewPeriodicChecks=[];
    window.setInterval=(callback,ms,...args)=>{if(ms===60000)window.__reviewPeriodicChecks.push(()=>callback(...args));return interval(callback,ms,...args);};
  });
  const page=await context.newPage();page.setDefaultTimeout(20000);page.on('pageerror',error=>report.pageErrors.push(error.name));
  await page.goto(base,{waitUntil:'domcontentloaded'});
  await page.locator('#scene[data-renderer="mock"][data-assets="ready"]').waitFor();await page.locator('#start-full:enabled').waitFor();
  assert.equal(await page.locator('#character-name').inputValue(),'');
  const bootCalls=statusCalls,beforeStart=statusCalls;
  await page.locator('#start-full').click();await page.locator('.experience[data-stage="ready"]').waitFor();
  assert.equal(await page.locator('#player-name').innerText(),'旅人');assert.equal(statusCalls-beforeStart,2);
  report.cases.push({id:'fresh-empty-name',bootStatusRequests:bootCalls,buttonStatusRequests:statusCalls-beforeStart,playerName:'旅人',passed:true});
  await page.locator('#continue-travel').click();await page.locator('.experience[data-stage="choice"]').waitFor();
  await page.locator('[data-choice="1"]').click();await page.locator('.experience[data-stage="feedback"]').waitFor();
  const gameBefore=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).game,JOURNEY_STORAGE_KEY);
  assert.equal(await page.evaluate(()=>window.__reviewPeriodicChecks.length),1);
  const beforeStall=statusCalls;stallNext=true;const stalledAt=performance.now();
  await page.evaluate(()=>window.__reviewPeriodicChecks[0]());
  await page.locator('.experience[data-stage="welcome"]').waitFor();
  const pausedAfterMs=Math.round(performance.now()-stalledAt);
  assert.ok(pausedAfterMs>=7900&&pausedAfterMs<10500);assert.equal(statusCalls-beforeStall,1);
  assert.deepEqual(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).game,JOURNEY_STORAGE_KEY),gameBefore);
  assert.equal(authStarts,0);assert.match(await page.locator('#start-full').innerText(),/登录暂不可用/);
  const toast=await page.locator('#toast').innerText();assert.match(toast,/请登录知乎后继续/);
  report.cases.push({id:'single-background-status-stall',backendStillAuthenticated:true,configuredRequestDeadlineMs:8000,measuredReturnToCoverMs:pausedAfterMs,savePreserved:true,authStartCalls:authStarts,coverSubtitle:await page.locator('#start-full small').innerText(),toast,passed:true});
  const beforeResume=statusCalls;
  await page.locator('#start-full').click();await page.locator('#dialog.journey-entry-dialog[open]').waitFor();
  const entryChecks=statusCalls-beforeResume;
  await page.locator('#resume').click();await page.locator('.experience[data-stage="feedback"]').waitFor();
  assert.equal(entryChecks,1);assert.equal(statusCalls-beforeResume,2);assert.equal(authStarts,0);
  assert.deepEqual(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).game,JOURNEY_STORAGE_KEY),gameBefore);
  report.cases.push({id:'valid-session-resume-after-network-stall',entryStatusRequests:entryChecks,resumeStatusRequests:statusCalls-beforeResume-entryChecks,totalStatusRequests:statusCalls-beforeResume,newAuthorizationRequired:false,savedChoiceRestored:true,passed:true});
  assert.equal(report.pageErrors.length,0);assert.equal(report.externalRequests,0);report.passed=true;
}catch(error){report.failure={name:error.name,message:error.message.replace(/https?:\/\/\S+/g,'[URL]').slice(0,250)};process.exitCode=1;}
finally{await context?.close();await browser?.close();await vite?.close();await fs.mkdir(new URL('../test-results/',import.meta.url),{recursive:true});await fs.writeFile(new URL('../test-results/five-games-session-latency-review.json',import.meta.url),JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
