// Share preview acceptance only: replay-valid ending from an actual recorded UI
// game, isolated storage/server, native WebGL, and no external/model requests.
// Run only after the production build containing the share preview changes.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {createServer} from 'node:net';
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {restore,snapshot} from '../src/engine.js';
import {getMemoryAlbum} from '../src/memory-album.js';
import {JOURNEY_STORAGE_KEY} from '../src/journey-storage.js';
import {earlyMemoryFixture} from './memory-fixtures.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const out=new URL('../test-results/share-preview/',import.meta.url);
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'C:/Users/25293/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const report={passed:false,phase:'prepare',startedAt:new Date().toISOString(),views:[],errors:[],apiIntercepted:[],externalBlocked:[],
  method:{production:true,isolatedServer:true,user4173Untouched:true,isolatedStorage:true,realModelCalls:0,realCLICalls:0,
    titleAssertions:process.env.SHARE_PREVIEW_EXPECT_TITLES==='1',
    newGameUI:false,fixture:'Recorded real-UI game 5 from fifteen-games; current engine snapshot/restore validated.',
    viewports:[[1280,800],[844,390]],additionalFixture:'Desktop earlyMemoryFixture, existing detailed-report share route, and 667x375 cover-only check; fixtures, not newly played UI games.',
    inProgressShare:'Not exercised: the current in-progress journal has no visible share entry.',
    reducedMotion:true,graphics:'native D3D11',scope:'Share preview and ending UI, not another played journey.'}};
let server,browser,currentPage,serverError,serverLog='';
await fs.mkdir(out,{recursive:true});
const saveReport=()=>fs.writeFile(new URL('browser-production.json',out),JSON.stringify(report,null,2));

async function startServer(){
  const index=await fs.readFile(new URL('../dist/index.html',import.meta.url),'utf8');
  report.build={indexSha256:createHash('sha256').update(index).digest('hex'),assets:[...index.matchAll(/(?:src|href)="(\/assets\/[^\"]+)"/g)].map(match=>match[1])};
  report.build.mainAssets=await Promise.all((await fs.readdir(new URL('../dist/assets/',import.meta.url))).filter(name=>/^main-.*\.(?:js|css)$/.test(name)).map(async name=>{
    const bytes=await fs.readFile(new URL(`../dist/assets/${name}`,import.meta.url));return {path:`/assets/${name}`,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
  }));
  const probe=createServer();await new Promise((resolve,reject)=>{probe.once('error',reject);probe.listen(0,'127.0.0.1',resolve);});
  const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
  const disabledCli=fileURLToPath(new URL('disabled-cli.exe',out));await assert.rejects(fs.access(disabledCli),{code:'ENOENT'});
  server=spawn(process.execPath,['server.mjs','--production'],{cwd:root,windowsHide:true,
    env:{...process.env,PORT:String(port),ZHIHU_CLI_PATH:disabledCli},stdio:['ignore','pipe','pipe']});
  server.on('error',error=>{serverError=error;});
  for(const stream of [server.stdout,server.stderr])stream.on('data',data=>{serverLog=(serverLog+data).slice(-8000);});
  const base=`http://127.0.0.1:${port}`;report.server={base,production:true};
  for(let i=0;i<100;i++){
    if(serverError)throw serverError;if(server.exitCode!==null)throw Error(`Owned server stopped: ${serverLog}`);
    try{if((await fetch(base,{signal:AbortSignal.timeout(1000)})).ok)return base;}catch{}
    await delay(100);
  }
  throw Error(`Owned server unavailable: ${serverLog}`);
}

async function settleDialog(page){
  await page.locator('#dialog').evaluate(async node=>{await Promise.all(node.getAnimations({subtree:true})
    .filter(animation=>animation.effect?.getTiming().iterations!==Infinity).map(animation=>animation.finished.catch(()=>{})));});
}
async function actionsGeometry(page,label){
  const geometry=await page.evaluate(()=>({width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,
    dialog:document.querySelector('#dialog').getBoundingClientRect().toJSON(),
    actions:[...document.querySelectorAll('.share-actions a[download],#back-to-report')].map(node=>{
      const r=node.getBoundingClientRect(),points=[[r.left+3,r.top+3],[r.right-3,r.top+3],[r.left+3,r.bottom-3],[r.right-3,r.bottom-3],[r.x+r.width/2,r.y+r.height/2]];
      return {text:node.textContent.trim(),rect:r.toJSON(),visible:r.width>0&&r.height>0&&r.left>=0&&r.top>=0&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1,
        hit:points.every(([x,y])=>{const hit=document.elementFromPoint(x,y);return hit===node||node.contains(hit);})};
    })}));
  assert.equal(geometry.actions.length,2,`${label}: download and return exist`);
  assert.ok(geometry.scrollWidth<=geometry.width,`${label}: no page horizontal overflow`);
  for(const action of geometry.actions){assert.ok(action.visible,`${label}: ${action.text} fully in viewport`);assert.ok(action.hit,`${label}: ${action.text} unoccluded`);}
  return {label,...geometry};
}
async function previewGeometry(page){
  const geometry=await page.locator('.share-preview').evaluate(img=>{
    let scroll=img.parentElement;
    while(scroll&&scroll.id!=='dialog'){
      if(/auto|scroll/.test(getComputedStyle(scroll).overflowY))break;
      scroll=scroll.parentElement;
    }
    const r=img.getBoundingClientRect();
    return {naturalWidth:img.naturalWidth,naturalHeight:img.naturalHeight,rect:r.toJSON(),
      scroll:scroll?{tag:scroll.tagName,id:scroll.id,className:scroll.className,clientWidth:scroll.clientWidth,scrollWidth:scroll.scrollWidth,clientHeight:scroll.clientHeight,scrollHeight:scroll.scrollHeight,scrollTop:scroll.scrollTop,rect:scroll.getBoundingClientRect().toJSON()}:null};
  });
  assert.ok(geometry.scroll,'Preview has a scroll container');
  assert.ok(geometry.scroll.scrollWidth<=geometry.scroll.clientWidth+1,'Preview does not overflow horizontally');
  return geometry;
}
async function waitShare(page,legacy=false){
  await page.locator('#dialog.share-dialog[open] .share-preview').waitFor();
  await page.locator('.share-preview').evaluate(img=>img.decode());await settleDialog(page);
  const size=await page.locator('.share-preview').evaluate(img=>[img.naturalWidth,img.naturalHeight]);
  if(legacy){assert.equal(size[0],900);assert.ok(size[1]>1440,'Existing detailed report retains its long original bitmap');}
  else assert.deepEqual(size,[1000,2250]);
  assert.equal(await page.locator('[data-share-zoom]').getAttribute('aria-pressed'),'true');
  return page.locator('.share-preview').getAttribute('src');
}
async function assertRevoked(page,url){
  await page.waitForFunction(url=>window.__sharePreviewQA.revoked.includes(url),url);
}
async function nativeDialogControl(browser){
  // Chrome may tab from a native modal to browser chrome. In that state the DOM
  // reports BODY plus document.hasFocus() === false, then Tab returns to modal.
  const context=await browser.newContext();await context.route('**/*',route=>route.abort());
  try{
    const page=await context.newPage();
    await page.setContent('<button id="outside">Outside</button><dialog id="modal"><button id="first">First</button><button id="last">Last</button></dialog>');
    await page.evaluate(()=>document.querySelector('#modal').showModal());await page.locator('#first').focus();const trace=[];
    for(let i=0;i<6;i++){await page.keyboard.press('Tab');trace.push(await page.evaluate(()=>({tag:document.activeElement.tagName,id:document.activeElement.id,documentFocused:document.hasFocus(),inside:document.querySelector('#modal').contains(document.activeElement)})));}
    assert.ok(trace.every(focus=>focus.inside||(focus.tag==='BODY'&&!focus.documentFocused)));
    for(let i=0;i<trace.length-1;i++)if(!trace[i].inside)assert.ok(trace[i+1].inside,'Native modal returns from browser chrome on next Tab');
    return trace;
  }finally{await context.close();}
}

try{
  const recorded=JSON.parse(await fs.readFile(new URL('../test-results/fifteen-games/report-2-5-8-11-14.json',import.meta.url),'utf8'));
  const original=recorded.games.find(game=>game.game===5);assert.equal(original?.passed,true);
  const fixture=snapshot(original.final),state=restore(fixture);assert.ok(state);assert.equal(state.phase,'finished');assert.equal(state.ended,'complete');
  assert.equal(state.history.length,original.turns.length);const album=getMemoryAlbum(state);
  report.fixture={game:5,ending:state.ended,turns:state.turn,albumTitle:album.title,history:state.history.map(h=>({eventId:h.eventId,choice:h.choice}))};
  report.phase='server-start';const base=await startServer();
  browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--use-gl=angle','--use-angle=d3d11','--ignore-gpu-blocklist']});
  report.nativeDialogControl=await nativeDialogControl(browser);
  const cases=report.method.viewports.map(([width,height])=>({width,height,kind:'complete',fixture}));
  cases.push({width:1280,height:800,kind:'early',fixture:snapshot(earlyMemoryFixture())});
  cases.push({width:1280,height:800,kind:'legacy',fixture});
  cases.push({width:667,height:375,kind:'compact-cover',fixture,coverOnly:true});
  for(const scenario of cases){
    const {width,height,kind,fixture}=scenario,state=restore(fixture);assert.ok(state);const album=getMemoryAlbum(state);
    const label=kind==='complete'?String(width):`${kind}-${width}`;
    const row={width,height,kind,ending:state.ended,turns:state.turn,passed:false,geometry:[],shareUrls:[],keyboard:[]};report.views.push(row);
    const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:1,reducedMotion:'reduce',serviceWorkers:'block',acceptDownloads:true});
    await context.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin!==base&&!['data:','blob:'].includes(url.protocol)){report.externalBlocked.push(url.href);return route.abort();}return route.continue();});
    await context.route('**/api/**',route=>{report.apiIntercepted.push(new URL(route.request().url()).pathname);return route.fulfill({status:503,json:{error:'Isolated share preview acceptance; no real API'}});});
    await context.routeWebSocket('**/*',socket=>{report.externalBlocked.push(socket.url());socket.close();});
    await context.addInitScript(({key,game})=>{
      localStorage.setItem(key,JSON.stringify({game,seconds:0}));localStorage.setItem('four-seasons-auto-depart','off');localStorage.setItem('four-seasons-music','off');
      const qa=window.__sharePreviewQA={created:[],revoked:[],backgroundClicksWhileModal:[]},create=URL.createObjectURL.bind(URL),revoke=URL.revokeObjectURL.bind(URL);
      URL.createObjectURL=blob=>{const url=create(blob);qa.created.push({url,type:blob.type,size:blob.size});return url;};
      URL.revokeObjectURL=url=>{qa.revoked.push(url);return revoke(url);};
      document.addEventListener('click',event=>{const dialog=document.querySelector('#dialog');if(dialog?.open&&!dialog.contains(event.target))qa.backgroundClicksWhileModal.push(event.target.id||event.target.tagName);},true);
    },{key:JOURNEY_STORAGE_KEY,game:fixture});
    const page=currentPage=await context.newPage();page.setDefaultTimeout(30000);page.on('pageerror',error=>report.errors.push({width,message:error.message}));
    report.phase=`${label}-load`;await saveReport();await page.goto(base);
    await page.locator('#scene[data-assets="ready"][data-renderer="webgl"]').waitFor();
    await page.locator('#start-full').click();await page.locator('#resume').click();await page.locator('.memory-album').waitFor();await settleDialog(page);
    row.albumCoverText=await page.locator('.memory-album').innerText();
    row.albumCover=await page.locator('.memory-cover').evaluate(node=>{
      const title=node.querySelector('.memory-title-stamp'),reason=node.querySelector('.memory-copy .memory-soft');
      const r=reason.getBoundingClientRect(),visible={top:Math.max(0,r.top),bottom:Math.min(innerHeight,r.bottom),left:Math.max(0,r.left),right:Math.min(innerWidth,r.right)},clipping=[];
      for(let ancestor=reason.parentElement;ancestor;ancestor=ancestor.parentElement){
        const style=getComputedStyle(ancestor),box=ancestor.getBoundingClientRect();
        if(/hidden|clip|auto|scroll/.test(style.overflowY)){visible.top=Math.max(visible.top,box.top+ancestor.clientTop);visible.bottom=Math.min(visible.bottom,box.top+ancestor.clientTop+ancestor.clientHeight);clipping.push({className:ancestor.className,overflowY:style.overflowY,top:box.top,bottom:box.top+ancestor.clientTop+ancestor.clientHeight});}
        if(/hidden|clip|auto|scroll/.test(style.overflowX)){visible.left=Math.max(visible.left,box.left+ancestor.clientLeft);visible.right=Math.min(visible.right,box.left+ancestor.clientLeft+ancestor.clientWidth);}
      }
      return {title:title.innerText,reason:reason.innerText,titleRect:title.getBoundingClientRect().toJSON(),reasonRect:r.toJSON(),reasonVisible:visible,clipping,reasonDisplay:getComputedStyle(reason).display,reasonFontSize:getComputedStyle(reason).fontSize};
    });
    row.expectedAlbumCover={title:album.title,reason:album.titleReason||album.subtitle};
    if(process.env.SHARE_PREVIEW_EXPECT_TITLES==='1'){
      assert.equal(row.albumCover.title,album.title);assert.equal(row.albumCover.reason,album.titleReason||album.subtitle);
      if(kind==='complete')assert.notEqual(row.albumCover.title,'东山再起患难伴侣','Recorded game 5 had no low-point recovery and ended in a cold war');
      assert.ok(row.albumCover.reasonRect.width>0&&row.albumCover.reasonRect.height>0,'Title reason is rendered, not hidden');
      assert.ok(row.albumCover.reasonVisible.bottom-row.albumCover.reasonVisible.top>=row.albumCover.reasonRect.height-1,'Whole title reason fits in the visible cover area');
    }
    await page.screenshot({path:fileURLToPath(new URL(`${label}-album-cover.png`,out))});
    if(scenario.coverOnly){row.coverOnly=true;row.passed=true;await saveReport();await context.close();currentPage=null;console.log(`Cover ${width}x${height}: title and entire reason visible`);continue;}
    const savedBefore=await page.evaluate(key=>JSON.stringify(JSON.parse(localStorage.getItem(key)).game),JOURNEY_STORAGE_KEY);
    if(kind==='legacy'){await page.locator('[data-memory-details]').click();assert.equal(await page.locator('[data-review-cell]').count(),10);}
    else await page.locator(`[data-memory-go="${album.pages.length-1}"]`).click();
    report.phase=`${label}-initial-reading`;await page.locator('#share-card').click();row.shareUrls.push(await waitShare(page,kind==='legacy'));
    row.initialFocus=await page.evaluate(()=>({id:document.activeElement.id,inside:document.querySelector('#dialog').contains(document.activeElement)}));
    assert.ok(row.initialFocus.inside,'Focus moves into the rendered share preview');
    assert.match(await page.locator('.share-caption').innerText(),/不是外网试玩地址/);
    row.reading=await previewGeometry(page);assert.ok(row.reading.scroll&&row.reading.scroll.id!=='dialog','Long image has its own central scroll region');
    assert.ok(row.reading.scroll.scrollHeight>row.reading.scroll.clientHeight+20,'Default reading mode scrolls vertically');
    row.geometry.push(await actionsGeometry(page,'initial-reading'));
    await page.screenshot({path:fileURLToPath(new URL(`${label}-reading.png`,out))});
    // The actual PNG, not the display dimensions, remains unchanged.
    const downloading=page.waitForEvent('download');await page.locator('.share-actions a[download]').click();
    const download=await downloading,downloadPath=fileURLToPath(new URL(`${label}-share.png`,out));await download.saveAs(downloadPath);
    const png=await fs.readFile(downloadPath);assert.deepEqual([...png.subarray(0,8)],[137,80,78,71,13,10,26,10]);
    row.download={bytes:png.length,width:png.readUInt32BE(16),height:png.readUInt32BE(20)};
    assert.deepEqual([row.download.width,row.download.height],[row.reading.naturalWidth,row.reading.naturalHeight],'Downloaded bitmap matches the unchanged original image');
    report.phase=`${label}-fit`;const zoom=page.locator('[data-share-zoom]');await zoom.click();assert.equal(await zoom.getAttribute('aria-pressed'),'false');
    row.fit=await previewGeometry(page);assert.ok(row.reading.rect.width>row.fit.rect.width*1.05,'Reading mode is visibly larger than whole-image fit');
    assert.ok(row.fit.rect.top>=row.fit.scroll.rect.top-1&&row.fit.rect.bottom<=row.fit.scroll.rect.bottom+1,'Fit shows the whole image in its central region');
    row.geometry.push(await actionsGeometry(page,'fit'));await page.screenshot({path:fileURLToPath(new URL(`${label}-fit.png`,out))});
    // Clicking the image itself switches back to reading size.
    const imageButton=page.locator('button').filter({has:page.locator('.share-preview')});assert.equal(await imageButton.count(),1);
    await imageButton.click();assert.equal(await zoom.getAttribute('aria-pressed'),'true');
    row.geometry.push(await actionsGeometry(page,'image-enlarged'));
    const scroll=await previewGeometry(page);await page.mouse.move(scroll.scroll.rect.x+scroll.scroll.rect.width/2,scroll.scroll.rect.y+scroll.scroll.rect.height/2);
    await page.mouse.wheel(0,3000);
    await page.waitForFunction(()=>{let el=document.querySelector('.share-preview')?.parentElement;while(el&&el.id!=='dialog'){if(/auto|scroll/.test(getComputedStyle(el).overflowY))return el.scrollTop>0;el=el.parentElement;}return false;});
    row.scrolled=await previewGeometry(page);row.geometry.push(await actionsGeometry(page,'reading-scrolled'));
    await page.screenshot({path:fileURLToPath(new URL(`${label}-reading-scrolled.png`,out))});
    report.phase=`${label}-keyboard`;
    await page.locator('#dialog-close').focus();
    for(let i=0;i<12;i++){
      await page.keyboard.press('Tab');const focus=await page.evaluate(()=>{const el=document.activeElement;return {inside:document.querySelector('#dialog').contains(el),tag:el.tagName,documentFocused:document.hasFocus(),id:el.id,zoom:el.matches('[data-share-zoom]'),image:el.matches('[data-share-image]'),download:el.matches('.share-actions a[download]')};});
      row.keyboard.push(focus);
      assert.ok(focus.inside||(focus.tag==='BODY'&&!focus.documentFocused),'Tab never focuses a background game element (browser chrome is allowed)');
      if(i>0&&!row.keyboard[i-1].inside)assert.ok(focus.inside,'Next Tab returns from browser chrome into the modal');
    }
    assert.ok(row.keyboard.some(f=>f.zoom));assert.ok(row.keyboard.some(f=>f.image));assert.ok(row.keyboard.some(f=>f.download));assert.ok(row.keyboard.some(f=>f.id==='back-to-report'));
    await zoom.focus();await page.keyboard.press('Enter');assert.equal(await zoom.getAttribute('aria-pressed'),'false');
    await page.keyboard.press('Space');assert.equal(await zoom.getAttribute('aria-pressed'),'true');
    row.backgroundFocusProbe=await page.evaluate(()=>{const target=document.querySelector('#view-summary');target.focus();return {attempted:target.id,focused:document.activeElement.id,inside:document.querySelector('#dialog').contains(document.activeElement)};});
    assert.ok(row.backgroundFocusProbe.inside,'Native modal makes background summary button unfocusable');
    await page.keyboard.press('Enter');assert.equal(await zoom.getAttribute('aria-pressed'),'false','Enter stays on the modal control, not the background');
    await page.keyboard.press('Space');assert.equal(await zoom.getAttribute('aria-pressed'),'true');
    row.geometry.push(await actionsGeometry(page,'keyboard-enlarged'));
    report.phase=`${label}-return`;await page.locator('#back-to-report').click();
    if(kind==='legacy'){await page.locator('#dialog.report-dialog[open]').waitFor();assert.equal(await page.locator('[data-review-cell]').count(),10);}
    else {await page.locator('.memory-album').waitFor();assert.equal(await page.locator('.memory-album').getAttribute('data-memory-page'),String(album.pages.length-1));}
    await assertRevoked(page,row.shareUrls[0]);
    // Reopen after return, close with Escape, and reopen after actual closure.
    await page.locator('#share-card').click();row.shareUrls.push(await waitShare(page,kind==='legacy'));assert.notEqual(row.shareUrls[1],row.shareUrls[0]);
    report.phase=`${label}-escape`;await zoom.focus();await page.keyboard.press('Escape');await page.locator('#dialog[open]').waitFor({state:'hidden'});await assertRevoked(page,row.shareUrls[1]);
    await page.locator('#view-summary').click();await page.locator('.memory-album').waitFor();
    if(kind==='legacy')await page.locator('[data-memory-details]').click();
    await page.locator('#share-card').click();row.shareUrls.push(await waitShare(page,kind==='legacy'));
    row.geometry.push(await actionsGeometry(page,'reopened-after-escape'));
    await page.locator('#dialog-close').click();await page.locator('#dialog[open]').waitFor({state:'hidden'});await assertRevoked(page,row.shareUrls[2]);
    row.objectUrls=await page.evaluate(()=>window.__sharePreviewQA);assert.ok(row.shareUrls.every(url=>row.objectUrls.revoked.includes(url)));
    assert.deepEqual(row.objectUrls.backgroundClicksWhileModal,[],'Keyboard cannot activate background game controls');
    assert.equal(await page.evaluate(key=>JSON.stringify(JSON.parse(localStorage.getItem(key)).game),JOURNEY_STORAGE_KEY),savedBefore,'Share viewing does not mutate the replay-valid game');
    row.passed=true;await saveReport();await context.close();currentPage=null;
    console.log(`Share preview ${kind} ${width}x${height}: passed, PNG ${row.download.width}x${row.download.height}, ${row.shareUrls.length} share URLs released`);
  }
  assert.deepEqual(report.errors,[]);assert.deepEqual(report.externalBlocked,[]);report.phase='complete';report.passed=true;
}catch(error){
  report.failure={phase:report.phase,message:error.message,stack:error.stack};
  if(currentPage){try{await currentPage.screenshot({path:fileURLToPath(new URL('failure.png',out))});report.failureUI=await currentPage.evaluate(()=>({activeElement:document.activeElement?.outerHTML.slice(0,1000),dialog:document.querySelector('#dialog')?.getBoundingClientRect().toJSON(),text:document.querySelector('#dialog-content')?.innerText}));}catch{}}
  throw error;
}finally{
  report.finishedAt=new Date().toISOString();await saveReport();
  try{await browser?.close();}finally{if(server&&server.exitCode===null&&server.signalCode===null)await new Promise(resolve=>{const timeout=setTimeout(resolve,3000);server.once('exit',()=>{clearTimeout(timeout);resolve();});server.kill();});}
}
console.log(JSON.stringify({passed:report.passed,views:report.views.length,errors:report.errors,apiIntercepted:report.apiIntercepted.length,realModelCalls:0}));
