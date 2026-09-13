// Production UI acceptance with isolated saves, real WebGL and no real API calls.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createServer} from 'node:net';
import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {completeMemoryFixture,earlyMemoryFixture,hospitalMemoryFixture,titleMemoryFixture} from './memory-fixtures.mjs';
import {snapshot} from '../src/engine.js';
import {getMemoryAlbum} from '../src/memory-album.js';
import {MEMORY_ART} from '../src/memory-art.js';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/25293/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
assert.ok(process.argv.slice(2).every(flag=>['--pages','--titles'].includes(flag)),'Only the fixed Pages deployment and title acceptance are supported');
const publicMode=process.argv.includes('--pages');
const titleMode=process.argv.includes('--titles');
const out=new URL(`../test-results/${titleMode?'journey-title-browser':'memory-album'}${publicMode?'-public':''}/`,import.meta.url);await fs.mkdir(out,{recursive:true});
const root=fileURLToPath(new URL('../',import.meta.url));
let base='https://zhihu-four-seasons.pages.dev',server;
if(!publicMode){
  const probe=createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
  base=`http://127.0.0.1:${port}`;
  server=spawn(process.execPath,['server.mjs','--production'],{cwd:root,env:{...process.env,PORT:String(port),ZHIHU_CLI_PATH:'Z:/disabled-memory-test/cli.exe'},windowsHide:true,stdio:'ignore'});
}
const report={passed:false,production:true,base,publicMode,fixtureRecapsNotFullGames:true,views:[],downloads:[],errors:[],mockedModelRequests:0,realModelRequests:0};let browser;
try{
  for(let i=0;i<100;i++){try{if((await fetch(base)).ok)break;}catch{}if(i===99)throw Error('Test server unavailable');await new Promise(r=>setTimeout(r,100));}
  browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--use-gl=angle','--use-angle=d3d11','--ignore-gpu-blocklist','--no-proxy-server']});
  const cases=titleMode?[['mixed',titleMemoryFixture('mixed')],['keepsake',titleMemoryFixture('keepsake')],['hospital',hospitalMemoryFixture()],['early',earlyMemoryFixture()]]:publicMode?[['hospital',hospitalMemoryFixture()],['early',earlyMemoryFixture()]]:[['complete',completeMemoryFixture()],['early',earlyMemoryFixture()],['demo',completeMemoryFixture('demo')],['hospital',hospitalMemoryFixture()]];
  for(const [name,state]of cases){
    const album=getMemoryAlbum(state);
    if(name==='mixed')assert.equal(album.titleId,'mixed');
    if(name==='keepsake')assert.ok(album.commemorations.some(item=>item.id==='balanced'));
    for(const [width,height]of name==='demo'?[[1280,720],[667,375]]:[[1440,900],[844,390]]){
      const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:1,reducedMotion:'reduce',serviceWorkers:'block'});
      await context.route('**/*',r=>{const u=new URL(r.request().url());return u.origin===base||['blob:','data:'].includes(u.protocol)?r.continue():r.abort();});
      await context.route('**/api/**',r=>{if(/\/api\/(practice|narrate)/.test(r.request().url()))report.mockedModelRequests++;return r.fulfill({status:503,json:{error:'Isolated acceptance; no model call'}});});
      await context.addInitScript(game=>{localStorage.setItem('four-seasons-life-v4',JSON.stringify({game,seconds:0}));localStorage.setItem('four-seasons-auto-depart','off');localStorage.setItem('four-seasons-music','off');},snapshot(state));
      const page=await context.newPage();page.setDefaultTimeout(20000);page.on('pageerror',e=>report.errors.push(e.message));await page.goto(base);await page.locator('#start-full').click();await page.locator('#resume').click();await page.locator('.memory-album').waitFor();
      const savedBefore=await page.evaluate(()=>JSON.stringify(JSON.parse(localStorage.getItem('four-seasons-life-v4')).game));
      for(let i=0;i<album.pages.length;i++){
        await page.locator(`[data-memory-go="${i}"]`).click();
        await page.locator('.memory-photo img').evaluateAll(images=>Promise.all(images.map(img=>img.decode())));
        assert.equal(await page.locator('.memory-album').getAttribute('data-memory-kind'),album.pages[i].kind);
        const srcs=await page.locator('.memory-photo img').evaluateAll(images=>images.map(img=>img.getAttribute('src')));
        for(const src of srcs){
          if(src===album.pages[i].artwork?.src){
            assert.ok(Object.values(MEMORY_ART).some(art=>art.src===src));
            assert.equal(await page.locator('.memory-illustration').count(),1);
          }else assert.ok(state.history.some(h=>src===`/art/memories/${h.eventId}.webp`),`unvisited image ${src}`);
        }
        if(album.pages[i].kind==='cover'){
          assert.equal(srcs[0],MEMORY_ART.cover.src);
          assert.deepEqual(srcs.slice(1),album.coverMoment?[album.coverMoment.image]:[]);
          assert.equal(await page.locator('.memory-title-stamp').innerText(),album.title);
          assert.equal(await page.locator('.memory-cover .memory-soft').innerText(),album.titleReason||album.subtitle);
          assert.equal(await page.locator('.memory-commemoration').count(),album.commemorations.length);
          if(album.journeyTitle.reason){
            await page.locator('.memory-title-evidence summary').click();
            assert.ok((await page.locator('.memory-title-evidence').innerText()).includes(album.titleReason));
            for(const badge of album.commemorations)assert.ok((await page.locator('.memory-title-evidence').innerText()).includes(badge.reason));
            const proofBounds=await page.locator('.memory-navigation').evaluate(el=>({bottom:el.getBoundingClientRect().bottom,dialogBottom:el.closest('dialog').getBoundingClientRect().bottom}));
            assert.ok(proofBounds.bottom<=proofBounds.dialogBottom);
            const receiptVisible=await page.locator('.memory-title-proof').first().evaluate(el=>{
              const rect=el.getBoundingClientRect(),copy=el.closest('.memory-copy').getBoundingClientRect();
              return rect.top<copy.bottom&&rect.bottom>copy.top;
            });
            assert.ok(receiptVisible,'opening the title receipt brings its content into the copy viewport');
            await page.screenshot({path:fileURLToPath(new URL(`${name}-${width}-title-evidence.png`,out))});
            if(album.commemorations.length){
              const badgeProof=page.locator('.memory-title-proof').nth(1);
              await badgeProof.scrollIntoViewIfNeeded();
              assert.ok((await badgeProof.innerText()).includes(album.commemorations[0].reason));
              await page.screenshot({path:fileURLToPath(new URL(`${name}-${width}-commemoration-evidence.png`,out))});
            }
            await page.locator('.memory-title-evidence summary').click();
          }
        }
        if(name==='hospital'&&album.pages[i].kind==='choice')assert.deepEqual(srcs,['/art/memories/cell-18.webp']);
        if(name==='hospital'&&album.pages[i].kind==='method'){
          assert.deepEqual(srcs,['/art/ending-v1/accompany.png']);
          assert.equal(await page.locator('.memory-photo figcaption').innerText(),'给陪伴留个位置\n方法插画');
        }
        const bounds=await page.evaluate(()=>{
          const nav=document.querySelector('.memory-navigation').getBoundingClientRect(),d=document.querySelector('#dialog'),r=d.getBoundingClientRect();
          return {width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,navBottom:nav.bottom,dialogBottom:r.bottom,navVisible:nav.bottom<=r.bottom&&nav.top>=r.top};
        });
        assert.ok(bounds.scrollWidth<=width);assert.ok(bounds.navVisible,`${name}/${width}/page${i}: navigation offscreen ${JSON.stringify(bounds)}`);
        if(album.pages[i].kind==='method'&&album.method){assert.equal(await page.locator('.memory-source').getAttribute('href'),album.method.source.url);await page.locator('.memory-evidence summary').click();assert.match(await page.locator('.memory-evidence').innerText(),/非答主原话/);await page.locator('.memory-evidence summary').click();}
        if(album.pages[i].kind==='share')assert.equal(await page.locator('.memory-season-print.is-unwritten').count(),album.seasons.filter(s=>!s.moment).length);
        await page.screenshot({path:fileURLToPath(new URL(`${name}-${width}-page${i}-production.png`,out))});report.views.push({name,width,page:i,kind:album.pages[i].kind,images:srcs,...bounds});
      }
      // Focus survives replaced page content, so repeated keyboard navigation works.
      await page.locator('[data-memory-go="0"]').click();await page.keyboard.press('ArrowRight');await page.keyboard.press('ArrowRight');assert.equal(await page.locator('.memory-album').getAttribute('data-memory-page'),'2');await page.keyboard.press('ArrowLeft');assert.equal(await page.locator('.memory-album').getAttribute('data-memory-page'),'1');
      await page.locator('[data-memory-details]').click();assert.equal(await page.locator('[data-review-cell]').count(),10);assert.equal(await page.locator('.report-hero h2').innerText(),album.title);await page.locator('#back-to-memories').click();assert.equal(await page.locator('.memory-album').getAttribute('data-memory-page'),'1');
      await page.locator(`[data-memory-go="${album.pages.length-1}"]`).click();
      const notePromise=page.waitForEvent('download');await page.locator('#download-note').click();const note=await notePromise;const notePath=fileURLToPath(new URL(`${name}-${width}-note.txt`,out));await note.saveAs(notePath);assert.ok((await fs.readFile(notePath,'utf8')).includes(state.history[0].choiceLabel));
      await page.locator('#share-card').click();await page.locator('.share-preview').waitFor();await page.locator('.share-preview').evaluate(img=>img.decode());
      const imageSize=await page.locator('.share-preview').evaluate(img=>[img.naturalWidth,img.naturalHeight]);assert.deepEqual(imageSize,[1000,2250]);
      assert.match(await page.locator('.share-caption').innerText(),publicMode?/扫码打开游戏，走进你的四季/:/不是外网试玩地址/);
      const download=page.waitForEvent('download');await page.locator('.share-actions a[download]').click();await(await download).saveAs(fileURLToPath(new URL(`${name}-${width}-share-production.png`,out)));report.downloads.push({name,width,imageSize});
      await page.locator('#back-to-report').click();assert.equal(await page.locator('.memory-album').getAttribute('data-memory-page'),String(album.pages.length-1));
      assert.equal(await page.evaluate(()=>JSON.stringify(JSON.parse(localStorage.getItem('four-seasons-life-v4')).game)),savedBefore);
      if(name==='early'&&width===1440){
        // Failed scene loads retain text and still export an image.
        await context.route('**/art/memories/*.webp',r=>r.fulfill({status:404,body:''}));
        await context.route('**/art/ending-v1/*.png',r=>r.fulfill({status:404,body:''}));
        // Clear decoded resources with a fresh page load, not just a repeated
        // <img> URL which Chrome may satisfy from its in-memory image cache.
        await page.reload();await page.locator('#start-full').click();await page.locator('#resume').click();await page.locator('.memory-illustration .memory-photo-fallback:not([hidden])').waitFor();
        assert.equal(await page.locator('.memory-illustration img').getAttribute('src'),MEMORY_ART.cover.src);
        await page.locator(`[data-memory-go="${album.pages.findIndex(p=>p.kind==='method')}"]`).click();
        await page.locator('.memory-photo-fallback:not([hidden])').waitFor();
        assert.match(await page.locator('.memory-photo img').getAttribute('src'),/^\/art\/ending-v1\//);
        await page.locator(`[data-memory-go="${album.pages.length-1}"]`).click();await page.locator('#share-card').click();await page.locator('.share-preview').waitFor();assert.match(await page.locator('.share-caption').innerText(),/部分画面未载入/);
        await page.locator('.share-preview').evaluate(img=>img.decode());await page.screenshot({path:fileURLToPath(new URL('missing-image-production.png',out))});await page.locator('#back-to-report').click();
        // Close an in-flight export; it must not overwrite a subsequently opened recap.
        await context.unroute('**/art/memories/*.webp');await context.route('**/art/memories/*.webp',async r=>{await new Promise(resolve=>setTimeout(resolve,700));await r.fulfill({status:404,body:''});});
        await page.locator('#share-card').click();await page.locator('#dialog-close').click();await page.locator('#view-summary').click();await page.waitForTimeout(1200);assert.equal(await page.locator('.memory-album').count(),1);assert.equal(await page.locator('.share-preview').count(),0);
      }
      await context.close();
    }
  }
  assert.deepEqual(report.errors,[]);report.passed=true;
}finally{await fs.writeFile(new URL('browser-production.json',out),JSON.stringify(report,null,2));await browser?.close();server?.kill();}
console.log(JSON.stringify({passed:report.passed,views:report.views.length,downloads:report.downloads.length,errors:report.errors,mockedModelRequests:report.mockedModelRequests,realModelRequests:report.realModelRequests}));
