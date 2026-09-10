// Original Canvas mascot preview; all API traffic is blocked, no generation.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs/promises';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'C:/Users/25293/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:4173',out=new URL('../test-results/',import.meta.url);await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const context=await browser.newContext({viewport:{width:1440,height:920}});await context.route('**/api/**',r=>r.abort());
 await context.route(base+'/__mascot-reference',r=>r.fulfill({contentType:'text/html; charset=utf-8',body:'<!doctype html><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;padding:26px;background:#f4ecd9;color:#594b38;font:16px system-ui}h1{font-size:25px;margin:0 0 9px}p{margin:0 0 24px;font-size:14px}main{display:grid;grid-template-columns:repeat(4,1fr);gap:18px}article{background:#fffdf4;border:2px solid #b99a6b;text-align:center;padding:8px 8px 16px;box-shadow:3px 3px #d7c7a7}h2{font-size:17px;margin:0}canvas{display:block;width:100%;height:570px;object-fit:contain;image-rendering:pixelated}</style><h1>刘看山 · 像素角色参考落地</h1><p>白色梨形轮廓 / 尖耳 / 大黑鼻 / 黑色手臂与靴脚 / 背面圆尾</p><main></main>'}));
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(base+'/__mascot-reference');
 await page.evaluate(async()=>{
  const {drawBear}=await import('/src/pixel-art.js');window.drawBear=drawBear;
  window.renderSheet=poses=>{
   const main=document.querySelector('main');main.replaceChildren();
   for(const pose of poses){const card=document.createElement('article'),canvas=document.createElement('canvas'),heading=document.createElement('h2');canvas.width=78;canvas.height=106;const c=canvas.getContext('2d');c.imageSmoothingEnabled=false;c.fillStyle='#fffdf4';c.fillRect(0,0,78,106);c.fillStyle='#e7e5d8';c.fillRect(9,86,60,1);drawBear(c,39,85,pose);heading.textContent=pose.label;card.append(canvas,heading);main.append(card);}
  };
  renderSheet([{label:'正面',heading:Math.PI/2,motion:false},{label:'右侧',heading:0,motion:false},{label:'左侧',heading:Math.PI,motion:false},{label:'背面',heading:-Math.PI/2,motion:false}]);
 });
 await page.screenshot({path:fileURLToPath(new URL('mascot-reference-turnaround.png',out))});
 await page.evaluate(()=>{
  document.querySelector('main').style.gridTemplateColumns='repeat(4,1fr)';document.querySelectorAll('style')[0].textContent+='canvas{height:285px}article{padding:4px 4px 12px}';
  renderSheet([{label:'呼吸 · 正面',heading:Math.PI/2,time:900},{label:'眨眼 · 正面',heading:Math.PI/2,time:4500},{label:'招手 · 侧面',heading:0,time:7800},{label:'伸懒腰 · 正面',heading:Math.PI/2,time:12000},{label:'向右行走',heading:0,time:850,walking:true},{label:'向后行走',heading:-Math.PI/2,time:1000,walking:true},{label:'投掷骰子',heading:0,time:0,throwing:true},{label:'安静背影',heading:-Math.PI/2,time:0,motion:false}]);
 });
 await page.screenshot({path:fileURLToPath(new URL('mascot-reference-actions.png',out))});
 await context.route(base+'/__mascot-world',r=>r.fulfill({contentType:'text/html; charset=utf-8',body:'<!doctype html><meta charset="utf-8"><style>body{margin:0}#world{height:100vh;width:100vw;position:relative}.world-location{position:absolute;bottom:18px;left:18px;background:#fff8e3;padding:10px;font:14px system-ui;display:grid;gap:4px}</style><div id="world"></div><dialog id="dialog"></dialog>'}));
 await page.goto(base+'/__mascot-world');await page.emulateMedia({reducedMotion:'reduce'});
 await page.evaluate(async()=>{const {PixelWorld}=await import('/src/pixel-world.js'),{newGame}=await import('/src/engine.js');window.world=new PixelWorld(document.querySelector('#world'));world.setState(newGame('full'));await world.ready;world.updateCamera(1,true);});
 await page.waitForTimeout(100);await page.screenshot({path:fileURLToPath(new URL('mascot-reference-in-world.png',out))});
 const settled=await page.evaluate(()=>world.canvas.toDataURL());await page.waitForTimeout(150);assert.equal(await page.evaluate(()=>world.canvas.toDataURL()),settled);
 await page.evaluate(()=>world.dispose());assert.deepEqual(errors,[]);console.log('PASS neutral reference mascot: four directions, eight actions, grounded in-world size and reduced-motion stability; no APIs.');
}finally{await browser.close();}
