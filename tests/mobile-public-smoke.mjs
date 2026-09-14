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
const paritySelectors=['.topbar','.brand','.brand small','.status-strip','.player-badge','.money-resource','.mood-resource','.exp-resource','.journey-resource','#season-progress','.welcome-panel','.welcome-top','.welcome-layout','.welcome-story','.welcome-setup','.welcome-illustration img','.welcome-illustration i','.welcome-kicker','.welcome-panel h1','.intro-copy','.starter-resources','.welcome-name-field','.talent-picker',...coverSelectors,...talentValues.flatMap(value=>[`.talent-picker label:has(input[value="${value}"]) b`,`.talent-picker label:has(input[value="${value}"]) .talent-effect`,`.talent-picker label:has(input[value="${value}"]) .talent-note`]),'.welcome-actions','.welcome-fineprint','.bottom-tools','#journal-button','#rules-button','#sound-button','#view-follow','#view-overview','#zoom-out','#reset-view','#zoom-in','#town-gallery','.auto-setting','#all-sources'];
const snapshot=page=>page.evaluate(selectors=>selectors.map(selector=>{const node=document.querySelector(selector),css=getComputedStyle(node),r=node.getBoundingClientRect();return {selector,rect:r.toJSON(),fonts:Object.fromEntries(['fontFamily','fontSize','fontWeight','lineHeight'].map(key=>[key,css[key]]))};}),paritySelectors);
let desktopReference;
async function sameDesktopComposition(page,width,height){
  const scale=Math.min(width/1904,height/942),offset={left:(width-1904*scale)/2,top:(height-942*scale)/2};
  const stage=await page.locator('#app').evaluate(node=>({width:node.clientWidth,height:node.clientHeight,rect:node.getBoundingClientRect().toJSON()}));
  assert.equal(stage.width,1904);assert.equal(stage.height,942);
  const current=await snapshot(page);
  for(const [i,node]of current.entries()){
    assert.deepEqual(node.fonts,desktopReference[i].fonts,`${node.selector}: original desktop font settings`);
    for(const key of ['left','top','width','height'])assert.ok(Math.abs(node.rect[key]-(desktopReference[i].rect[key]*scale+(offset[key]||0)))<1.1,`${width}x${height}: ${node.selector} ${key} must scale with the desktop`);
  }
  report.checks.push({width,height,phase:'uniform-desktop-composition',scale,nodes:current.length,fontsUnchanged:true});
}
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
      const sx=p.offsetWidth?b.width/p.offsetWidth:1,sy=p.offsetHeight?b.height/p.offsetHeight:1;
      if(/auto|scroll|hidden|clip/.test(style.overflowX)){
        const fits=r.left>=b.left+p.clientLeft*sx-1&&r.right<=b.left+(p.clientLeft+p.clientWidth)*sx+1;
        if(!fits)clips.push({axis:'x',node:p.tagName+'.'+p.className,start:b.left+p.clientLeft,end:b.left+p.clientLeft+p.clientWidth});within=within&&fits;
      }
      if(/auto|scroll|hidden|clip/.test(style.overflowY)){
        const fits=r.top>=b.top+p.clientTop*sy-1&&r.bottom<=b.top+(p.clientTop+p.clientHeight)*sy+1;
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
async function fullContent(page,width,height){
  const selectors=['.brand>span:last-child','.brand small','.player-badge b','.player-badge small','.status-strip .eyebrow','#money-value','#mood-value','#mood-max','#exp-value','#exp-stars','#route-value','.journey-resource>small','.season-step',
    '.welcome-top .tiny-label','.welcome-kicker','.welcome-panel h1','.welcome-panel .intro-copy','.welcome-illustration i','.starter-resources b','.welcome-fineprint','.talent-effect','.talent-note',
    '#journal-button span','#rules-button span','#view-follow','#view-overview','#town-gallery','.auto-setting>span:last-child','#all-sources'];
  // Test full text lines, not just a visible outer card: clipped/hidden rules
  // would otherwise pass even though the phone no longer matches the desktop.
  const result=await page.evaluate(selectors=>selectors.flatMap(selector=>{
    const nodes=[...document.querySelectorAll(selector)];
    if(!nodes.length)return [{selector,visible:false,reason:'missing'}];
    return nodes.map(node=>{
      let visible=true,lines=0,clip={left:0,top:0,right:innerWidth,bottom:innerHeight};
      for(let p=node;p;p=p.parentElement){
        const css=getComputedStyle(p),r=p.getBoundingClientRect();
        if(css.display==='none'||css.visibility==='hidden'||css.opacity==='0')visible=false;
        if(css.display==='contents')continue;
        const sx=p.offsetWidth?r.width/p.offsetWidth:1,sy=p.offsetHeight?r.height/p.offsetHeight:1;
        if(/auto|scroll|hidden|clip/.test(css.overflowX)){clip.left=Math.max(clip.left,r.left+p.clientLeft*sx);clip.right=Math.min(clip.right,r.left+(p.clientLeft+p.clientWidth)*sx);}
        if(/auto|scroll|hidden|clip/.test(css.overflowY)){clip.top=Math.max(clip.top,r.top+p.clientTop*sy);clip.bottom=Math.min(clip.bottom,r.top+(p.clientTop+p.clientHeight)*sy);}
      }
      const walker=document.createTreeWalker(node,NodeFilter.SHOW_TEXT);let text;
      while(text=walker.nextNode()){
        if(!text.textContent.trim()||text.parentElement.closest('svg'))continue;
        const range=document.createRange();range.selectNodeContents(text);
        for(const r of range.getClientRects()){
          if(!r.width||!r.height)continue;lines++;
          if(r.left<clip.left-1||r.right>clip.right+1||r.top<clip.top-1||r.bottom>clip.bottom+1)visible=false;
        }
      }
      return {selector,visible:visible&&lines>0,lines};
    });
  }),selectors);
  assert.ok(result.every(row=>row.visible),`All desktop information must appear in full at ${width}x${height}: ${JSON.stringify(result.filter(row=>!row.visible))}`);
  assert.equal(await page.locator('.talent-brief:visible').count(),0);
  assert.equal(await page.locator('.talent-effect:visible').count(),3);
  assert.equal(await page.locator('.talent-note:visible').count(),3);
  assert.ok(await page.locator('.welcome-illustration img').isVisible());
  for(const selector of ['#zoom-out','#reset-view','#zoom-in'])assert.ok(await page.locator(selector).isVisible());
  report.checks.push({width,height,phase:'full-desktop-content',textBlocks:result.length});
}
let browser,page;
try{
  browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-proxy-server','--enable-webgl','--use-gl=angle','--use-angle=d3d11','--ignore-gpu-blocklist']});
  const ctx=await browser.newContext({viewport:{width:844,height:300},isMobile:true,hasTouch:true,deviceScaleFactor:1,reducedMotion:'reduce'});
  page=await ctx.newPage();page.setDefaultTimeout(90000);page.on('pageerror',e=>report.pageErrors.push(e.message));
  const readOnly=route=>{
    const url=new URL(route.request().url());
    if(url.origin!==base&&!['data:','blob:'].includes(url.protocol))return route.abort();
    if(!['GET','HEAD'].includes(route.request().method())){report.blockedWrites.push(url.pathname);return route.abort();}
    return route.continue();
  };
  await ctx.route('**/*',readOnly);
  const desktopCtx=await browser.newContext({viewport:{width:1904,height:942},reducedMotion:'reduce'});
  await desktopCtx.route('**/*',readOnly);
  const desktop=await desktopCtx.newPage();
  await desktop.goto(base,{timeout:90000,waitUntil:'domcontentloaded'});
  await desktop.locator('#scene[data-assets="ready"][data-renderer="webgl"]').waitFor({timeout:90000});
  await desktop.waitForFunction(()=>document.querySelector('#start-full')?.getAttribute('aria-busy')==='false',null,{timeout:30000});
  desktopReference=await snapshot(desktop);await desktopCtx.close();
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
    await fullContent(page,width,height);
    await sameDesktopComposition(page,width,height);
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
