// Normal browser/Canvas verification; no business or model API requests.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs/promises';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'C:/Users/25293/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:4173';
const out=new URL('../test-results/',import.meta.url);await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
  const context=await browser.newContext({viewport:{width:1440,height:900}});
  await context.route('**/api/**',r=>r.abort());
  await context.route(base+'/__season-test',r=>r.fulfill({contentType:'text/html; charset=utf-8',body:'<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/src/season-chapters.css"><style>body{margin:0;background:#bad3c3}#world{width:100vw;height:100vh;position:relative}.world-location{position:absolute;bottom:20px;left:20px;display:grid;background:#fff1cf;padding:12px;color:#68533c;font:14px sans-serif;gap:3px}</style></head><body><button id="start" style="position:absolute;z-index:3">开始</button><div id="world"></div><div id="chapter" hidden></div><dialog id="dialog">暂停</dialog></body></html>'}));
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(base+'/__season-test');
  await page.evaluate(async()=>{
    const {PixelWorld}=await import('/src/pixel-world.js'),{newGame}=await import('/src/engine.js');window.chapterModule=await import('/src/season-chapters.js');
    window.world=new PixelWorld(document.querySelector('#world'));window.newGame=newGame;window.chapter=document.querySelector('#chapter');world.setState(newGame('full'));await world.ready;
    window.testCurrent=true;window.testPaused=false;window.entered=[];window.results=[];
    window.playTest=index=>{window.task=chapterModule.playSeasonChapter(chapter,index,{isCurrent:()=>testCurrent,isPaused:()=>testPaused,onEnter:i=>entered.push(i)}).then(success=>results.push(success));};
  });
  for(let season=0;season<4;season++){
    await page.evaluate(season=>{const state=newGame('full');Object.assign(state,{position:season*10,season,turn:season+1});world.setState(state);world.pan={x:0,y:0};world.updateCamera(1,true);},season);
    await page.waitForTimeout(180);
    assert.equal(await page.locator('#world').getAttribute('data-season'),String(season));
    assert.equal(await page.locator('#world').getAttribute('data-weather'),['blossoms','fireflies','leaves','snow'][season]);
    await page.screenshot({path:fileURLToPath(new URL(`season-weather-${season}.png`,out))});
    await page.evaluate(season=>playTest(season),season);await page.waitForTimeout(450);
    await page.screenshot({path:fileURLToPath(new URL(`season-chapter-${season}.png`,out))});
    await page.getByRole('button',{name:'走进这一季 →'}).click();await page.evaluate(()=>task);
  }
  assert.deepEqual(await page.evaluate(()=>entered),[0,1,2,3]);
  assert.deepEqual(await page.evaluate(()=>results),[true,true,true,true]);
  await page.evaluate(()=>{world.setCameraMode('overview');world.updateCamera(1,true);});await page.waitForTimeout(100);await page.screenshot({path:fileURLToPath(new URL('season-weather-overview.png',out))});

  // Paused time cannot consume a chapter, nor bypass pause through its button.
  await page.evaluate(()=>{testPaused=true;playTest(1);});await page.waitForTimeout(150);
  const pausedBefore=await page.evaluate(()=>({progress:chapter.firstChild.style.getPropertyValue('--chapter-progress'),entered:[...entered]}));
  await page.waitForTimeout(350);await page.getByRole('button',{name:'走进这一季 →'}).click();
  assert.deepEqual(await page.evaluate(()=>({progress:chapter.firstChild.style.getPropertyValue('--chapter-progress'),entered:[...entered]})),pausedBefore);
  await page.evaluate(()=>testPaused=false);await page.waitForTimeout(100);await page.keyboard.press('Escape');await page.evaluate(()=>task);
  assert.equal(await page.locator('.season-chapter').count(),0);

  // Invalidated work and explicit cancel remove DOM, settle once, and never revive.
  await page.evaluate(()=>{playTest(2);testCurrent=false;});await page.waitForTimeout(100);await page.evaluate(()=>task);
  assert.equal(await page.evaluate(()=>results.at(-1)),false);assert.equal(await page.locator('.season-chapter').count(),0);
  await page.evaluate(()=>{testCurrent=true;playTest(3);chapterModule.cancelSeasonChapter(chapter);});await page.evaluate(()=>task);await page.waitForTimeout(100);
  assert.equal(await page.evaluate(()=>results.at(-1)),false);assert.equal(await page.locator('.season-chapter').count(),0);

  // Portrait and a modal freeze active time. Background visibility is handled by the same gate.
  await page.evaluate(()=>playTest(0));await page.waitForTimeout(100);await page.setViewportSize({width:600,height:900});await page.waitForTimeout(100);
  const portrait=await page.evaluate(()=>chapter.firstChild.style.getPropertyValue('--chapter-progress'));await page.waitForTimeout(120);
  assert.equal(await page.evaluate(()=>chapter.firstChild.style.getPropertyValue('--chapter-progress')),portrait);
  await page.setViewportSize({width:1440,height:900});await page.evaluate(()=>document.querySelector('#dialog').showModal());await page.waitForTimeout(100);
  const modal=await page.evaluate(()=>chapter.firstChild.style.getPropertyValue('--chapter-progress'));await page.waitForTimeout(120);
  assert.equal(await page.evaluate(()=>chapter.firstChild.style.getPropertyValue('--chapter-progress')),modal);
  await page.evaluate(()=>{document.querySelector('#dialog').close();chapterModule.cancelSeasonChapter(chapter);});

  // Reduced motion keeps the chapter readable and static, with a three-second cap.
  await page.emulateMedia({reducedMotion:'reduce'});await page.evaluate(()=>playTest(3));await page.waitForTimeout(80);
  assert.equal(await page.locator('.season-chapter').getAttribute('data-reduced'),'true');
  assert.equal(await page.locator('.chapter-particle').first().evaluate(node=>getComputedStyle(node).animationName),'none');
  await page.waitForFunction(()=>chapter.hidden,{timeout:5000});assert.equal(await page.evaluate(()=>results.at(-1)),true);
  await page.evaluate(()=>world.dispose());assert.deepEqual(errors,[]);
  console.log('PASS four chapter/weather scenes, all-season overview, single enter callbacks, skip/Escape, pause/portrait/modal gates, cancellation and reduced-motion cap. No API calls.');
}finally{await browser.close();}
