// Live Canvas and UI acceptance; API traffic is intercepted, never billed.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs/promises';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'C:/Users/25293/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:4189';
const out=new URL('../test-results/',import.meta.url);await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const errors=[];
try{
  const context=await browser.newContext({viewport:{width:1600,height:900},reducedMotion:'reduce'});
  await context.route('**/api/**',r=>r.fulfill({json:{mode:'fallback',text:'测试回顾，不调用模型。',available:false,items:[]}}));
  await context.addInitScript(()=>localStorage.setItem('four-seasons-auto-depart','off'));
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base,{waitUntil:'networkidle'});
  await page.locator('#scene[data-tree-art="seasonal-sprites"]').waitFor();
  await page.screenshot({path:fileURLToPath(new URL('pastoral-welcome.png',out))});
  await page.locator('#start-full').click();await page.locator('#view-overview').click();
  await page.screenshot({path:fileURLToPath(new URL('pastoral-map.png',out))});
  await page.locator('#view-follow').click();await page.evaluate(()=>document.activeElement.blur());await page.keyboard.press('Space');
  await page.locator('#event-heading').waitFor({timeout:15000});
  assert.equal(await page.locator('[data-choice]').count(),3);
  assert.equal(await page.locator('.choice-effects,.condition-note').count(),0);
  assert.doesNotMatch(await page.locator('.options').innerText(),/[+-]\s*\d|情绪\s*\d|专业\s*\d/);
  await page.screenshot({path:fileURLToPath(new URL('pastoral-choice.png',out))});
  for(const size of [{width:844,height:390},{width:667,height:375}]){
    await page.setViewportSize(size);await page.waitForTimeout(80);
    const panel=await page.locator('#story-panel').boundingBox();
    assert.ok(panel.x>=0&&panel.y>=0&&panel.x+panel.width<=size.width+1&&panel.y+panel.height<=size.height+1);
    for(let i=0;i<3;i++){
      await page.locator(`[data-choice="${i}"]`).scrollIntoViewIfNeeded();
      const box=await page.locator(`[data-choice="${i}"]`).boundingBox();
      assert.ok(box.x>=0&&box.x+box.width<=size.width+1);
    }
    await page.screenshot({path:fileURLToPath(new URL(`pastoral-choice-${size.width}.png`,out))});
  }
  await page.setViewportSize({width:844,height:390});await page.screenshot({path:fileURLToPath(new URL('pastoral-choice-mobile.png',out))});
  await page.locator('.choice:not([disabled])').first().click();await page.locator('#next-button').waitFor();
  assert.equal(await page.locator('.result-stats>div').count(),3);
  await page.setViewportSize({width:1600,height:900});await page.screenshot({path:fileURLToPath(new URL('pastoral-feedback.png',out))});
  // Independent live renderer makes the actor observable without UI dimming.
  await context.route(base+'/__pastoral',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><style>body{margin:0}#world{height:100vh;width:100vw}</style><div id="world"></div><dialog id="dialog">暂停</dialog>'}));
  await page.goto(base+'/__pastoral');await page.emulateMedia({reducedMotion:'no-preference'});
  await page.evaluate(async()=>{const {PixelWorld}=await import('/src/pixel-world.js');const {newGame}=await import('/src/engine.js');window.world=new PixelWorld(document.querySelector('#world'));world.setState(newGame());await world.ready;world.resetView();});
  const spriteStatus=await page.evaluate(()=>({count:world.container.dataset.treeSpriteCount,kind:world.container.dataset.treeArt}));
  assert.ok(Number(spriteStatus.count)>0);assert.equal(spriteStatus.kind,'seasonal-sprites');
  const idle=await page.evaluate(async()=>{
    const {bearIdlePose}=await import('/src/pixel-art.js');
    const before={...world.character},a=bearIdlePose(0),b=bearIdlePose(2200),c=bearIdlePose(4500);
    return {before,after:world.character,poses:[a,b,c]};
  });
  assert.deepEqual(idle.before,idle.after);assert.notDeepEqual(idle.poses[0],idle.poses[1]);
  await page.waitForTimeout(180);await page.evaluate(()=>document.querySelector('#dialog').showModal());await page.waitForTimeout(80);
  const paused=await page.evaluate(()=>world.elapsed);await page.waitForTimeout(160);assert.equal(await page.evaluate(()=>world.elapsed),paused);
  await page.evaluate(()=>document.querySelector('#dialog').close());await page.emulateMedia({reducedMotion:'reduce'});await page.waitForTimeout(60);
  const still=await page.evaluate(()=>world.canvas.toDataURL());await page.waitForTimeout(150);assert.equal(await page.evaluate(()=>world.canvas.toDataURL()),still);
  // Image failure keeps code-drawn scenery; late completion must not revive disposed worlds.
  await page.evaluate(()=>world.dispose());await context.route('**/art/season-trees-v2.png',r=>r.abort());await page.reload();
  const fallback=await page.evaluate(async()=>{const {PixelWorld}=await import('/src/pixel-world.js');window.world=new PixelWorld(document.querySelector('#world'));await world.ready;return world.container.dataset.treeArt;});
  assert.equal(fallback,'code-fallback');await page.evaluate(()=>world.dispose());
  assert.deepEqual(errors,[]);console.log('PASS live seasonal sprites, 3 blind choices, post-choice stats, desktop/mobile bounds, grounded idle poses, pause/reduced-motion, image fallback; no real APIs.');
}finally{await browser.close();}
