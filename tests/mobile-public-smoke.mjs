// Read-only verification of the stable public build; no login or paid AI calls.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH||'C:/Users/25293/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const base='https://zhihu-four-seasons.pages.dev';
const out=fileURLToPath(new URL('../test-results/mobile-public/',import.meta.url));await fs.mkdir(out,{recursive:true});
const expected=(await fs.readFile(new URL('../dist/index.html',import.meta.url),'utf8')).match(/src="(\/assets\/index-[^"]+\.js)"/)[1];
const report={passed:false,expectedEntry:expected,checks:[],pageErrors:[],blockedWrites:[],realModelCalls:0,realAuthorizationFlows:0,network:'Only this isolated browser uses --no-proxy-server; system configuration unchanged.'};
const talentValues=['defense','ambitious','optimistic'];
const coverSelectors=[...talentValues.map(value=>`.talent-picker label:has(input[value="${value}"])`),'#character-name','#start-full'];
async function checkCover(page,width,height){
  // Check the whole form before selecting anything. Locator.check/scrollIntoView
  // can otherwise make a clipped option reachable and disguise a bad first view.
  const checks=await page.evaluate(selectors=>selectors.map(selector=>{
    const node=document.querySelector(selector),r=node.getBoundingClientRect();
    const clips=[];
    let within=r.width>0&&r.height>0&&r.left>=0&&r.top>=0&&r.right<=innerWidth&&r.bottom<=innerHeight;
    for(let p=node.parentElement;p;p=p.parentElement){
      const style=getComputedStyle(p),b=p.getBoundingClientRect();
      if(style.display==='contents')continue;
      if(/auto|scroll|hidden|clip/.test(style.overflowX)){
        const fits=r.left>=b.left+p.clientLeft-1&&r.right<=b.left+p.clientLeft+p.clientWidth+1;
        if(!fits)clips.push({axis:'x',node:p.tagName+'.'+p.className,start:b.left+p.clientLeft,end:b.left+p.clientLeft+p.clientWidth});within=within&&fits;
      }
      if(/auto|scroll|hidden|clip/.test(style.overflowY)){
        const fits=r.top>=b.top+p.clientTop-1&&r.bottom<=b.top+p.clientTop+p.clientHeight+1;
        if(!fits)clips.push({axis:'y',node:p.tagName+'.'+p.className,start:b.top+p.clientTop,end:b.top+p.clientTop+p.clientHeight});within=within&&fits;
      }
    }
    const hit=[.15,.5,.85].every(x=>[.15,.5,.85].every(y=>{
      const target=document.elementFromPoint(r.left+r.width*x,r.top+r.height*y);return node===target||node.contains(target);
    }));
    return {selector,within,hit,clips,rect:{left:r.left,top:r.top,right:r.right,bottom:r.bottom},viewport:{width:innerWidth,height:innerHeight,clientWidth:document.documentElement.clientWidth,clientHeight:document.documentElement.clientHeight,visualWidth:visualViewport?.width,visualHeight:visualViewport?.height,scale:visualViewport?.scale}};
  }),coverSelectors);
  const viewport=checks[0].viewport;
  assert.ok(Math.abs((viewport.scale??1)-1)<.01&&Math.abs(viewport.width-width)<=1&&Math.abs(viewport.height-height)<=1,
    `${width}x${height}: resizing must reflow, not shrink the previous page: ${JSON.stringify(viewport)}`);
  assert.ok(checks.every(check=>check.within&&check.hit),`${width}x${height}: entire cover visible without scrolling: ${JSON.stringify(checks)}`);
  report.checks.push({width,height,phase:'all-visible-before-input',checks});
}
const scrollOffsets=page=>page.evaluate(()=>[document.documentElement,document.body,...document.querySelectorAll('.welcome-panel,.welcome-panel *')].map(node=>[node.scrollLeft,node.scrollTop]));
let browser,page;
try{
  browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-proxy-server','--enable-webgl','--use-gl=angle','--use-angle=d3d11','--ignore-gpu-blocklist']});
  const ctx=await browser.newContext({viewport:{width:844,height:300},isMobile:true,hasTouch:true,deviceScaleFactor:1,reducedMotion:'reduce'});
  page=await ctx.newPage();page.setDefaultTimeout(90000);page.on('pageerror',e=>report.pageErrors.push(e.message));
  await ctx.route('**/*',route=>{
    const url=new URL(route.request().url());
    if(url.origin!==base&&!['data:','blob:'].includes(url.protocol))return route.abort();
    if(!['GET','HEAD'].includes(route.request().method())){report.blockedWrites.push(url.pathname);return route.abort();}
    return route.continue();
  });
  const start=Date.now(),response=await page.goto(base,{timeout:90000,waitUntil:'domcontentloaded'});
  assert.equal(response.status(),200);assert.ok((await response.text()).includes(expected),'Worker homepage must serve the new build');
  await page.locator('#scene[data-assets="ready"][data-renderer="webgl"]').waitFor();report.firstSceneMs=Date.now()-start;
  const auth=await page.evaluate(async()=>{
    const response=await fetch('/api/auth/status?mobile-check='+Date.now(),{signal:AbortSignal.timeout(20000)}),body=await response.json();
    return {status:response.status,enabled:body.enabled,authenticated:body.authenticated,correctCallback:body.callbackUrl===location.origin+'/api/auth/zhihu/callback'};
  });report.auth=auth;assert.deepEqual(auth,{status:200,enabled:true,authenticated:false,correctCallback:true});
  for(const [width,height]of [[844,300],[667,280],[844,390]]){
    await page.setViewportSize({width,height});await page.waitForTimeout(300);
    assert.equal(await page.locator('.daylight-switch').isVisible(),false);
    await checkCover(page,width,height);
    const placeholderFits=await page.locator('#character-name').evaluate(input=>{
      const style=getComputedStyle(input),placeholder=getComputedStyle(input,'::placeholder');
      const ctx=document.createElement('canvas').getContext('2d');ctx.font=placeholder.font||style.font;
      return ctx.measureText(input.placeholder).width<=input.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight);
    });assert.ok(placeholderFits,'The short nickname prompt fits without truncation');
    const before=await scrollOffsets(page);
    for(const value of talentValues){
      const box=await page.locator(`.talent-picker label:has(input[value="${value}"])`).boundingBox();
      await page.mouse.click(box.x+box.width/2,box.y+box.height/2);
      assert.ok(await page.locator(`input[name="talent"][value="${value}"]`).isChecked());
      assert.deepEqual(await scrollOffsets(page),before,'Choosing a talent must not scroll the page or a card');
      report.checks.push({width,height,talent:value,selectedWithoutScrolling:true});
    }
    await page.screenshot({path:`${out}/cover-${width}x${height}.png`});
  }
  assert.deepEqual(report.pageErrors,[]);report.passed=true;
}catch(error){report.failure=error.message;await page?.screenshot({path:`${out}/failure.png`}).catch(()=>{});throw error;}
finally{await fs.writeFile(`${out}/report.json`,JSON.stringify(report,null,2));await browser?.close();}
console.log(JSON.stringify(report));
