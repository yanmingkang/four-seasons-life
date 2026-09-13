// Fresh browser contexts only; never modify the user's browser save or call AI.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {newGame,snapshot} from '../src/engine.js';
import {JOURNEY_STORAGE_KEY} from '../src/journey-storage.js';
const require=createRequire(import.meta.url);
const {chromium}=require('C:/Users/25293/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--use-gl=angle','--use-angle=d3d11','--ignore-gpu-blocklist']});
const base=process.env.GAME_TEST_URL||'http://127.0.0.1:4173';
const errors=[],results=[];
try{
  for(const scenario of [
    {id:'blank-full',input:'',expected:'旅人',mode:'full'},
    {id:'whitespace-full',input:'   ',expected:'旅人',mode:'full'},
    {id:'custom-full',input:'  小晴  ',expected:'小晴',mode:'full'},
    {id:'old-save',old:true,expected:'刘看山'},
  ]){
    const context=await browser.newContext({viewport:{width:1280,height:800},serviceWorkers:'block'});
    await context.route('**/*',route=>{
      const url=new URL(route.request().url());
      if(url.pathname.startsWith('/api/'))return route.fulfill({status:503,json:{error:'Local UI test; no real API'}});
      if(url.origin!==base&&!['data:','blob:'].includes(url.protocol))return route.abort();
      return route.continue();
    });
    const oldGame=scenario.old?snapshot(newGame('full',{name:'刘看山',enriched:true})):null;
    await context.addInitScript(({key,oldGame})=>{
      localStorage.setItem('four-seasons-auto-depart','off');
      localStorage.setItem('four-seasons-music','off');
      if(oldGame)localStorage.setItem(key,JSON.stringify({game:oldGame,seconds:0}));
    },{key:JOURNEY_STORAGE_KEY,oldGame});
    const page=await context.newPage();page.setDefaultTimeout(45000);
    page.on('pageerror',error=>errors.push(error.message));
    await page.goto(base);
    const input=page.locator('#character-name');await input.waitFor();
    assert.equal(await input.inputValue(),'');
    assert.equal(await input.getAttribute('placeholder'),'填写你的昵称（选填）');
    assert.equal(await page.locator('#player-name').textContent(),'旅人');
    if(scenario.old){
      await page.locator('#start-full').click();
      await page.locator('#resume').click();
      assert.equal(await page.locator('#player-name').textContent(),scenario.expected);
      const record=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),JOURNEY_STORAGE_KEY);
      assert.deepEqual(record.game,oldGame);
    }else{
      await input.fill(scenario.input);
      await page.locator('#start-'+scenario.mode).click();
      await page.waitForFunction(key=>localStorage.getItem(key)!==null,JOURNEY_STORAGE_KEY);
      const record=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),JOURNEY_STORAGE_KEY);
      assert.equal(record.game.name,scenario.expected);
      assert.equal(await page.locator('#player-name').textContent(),scenario.expected);
      assert.equal(record.game.mode,scenario.mode);
    }
    results.push({case:scenario.id,passed:true});
    await context.close();
  }
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({passed:true,cases:results,pageErrors:errors,realModelCalls:0}));
}finally{await browser.close();}
