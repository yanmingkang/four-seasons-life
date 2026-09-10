import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'C:/Users/25293/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:4173';
const out=new URL('../test-results/',import.meta.url);await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
  const page=await browser.newPage({viewport:{width:1440,height:810},reducedMotion:'reduce'}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/**',r=>r.abort());
  // A blank local harness imports the real world without importing game UI or AI.
  await page.route(base+'/__world-polish',r=>r.fulfill({contentType:'text/html',body:'<html><head><style>html,body,#scene{margin:0;width:100%;height:100%;overflow:hidden}#scene>div{display:none}canvas{display:block}</style></head><body><div id="scene"></div></body></html>'}));
  await page.goto(base+'/__world-polish');
  await page.evaluate(async()=>{
    const [{JourneyWorld},{newGame},{routeFor},{EVENTS}]=await Promise.all([import('/src/journey-world.js'),import('/src/engine.js'),import('/src/route.js'),import('/src/events.js')]);
    window.world=new JourneyWorld(document.querySelector('#scene'));window.newGame=newGame;window.routeFor=routeFor;window.events=EVENTS;await world.ready;
  });
  const assets=await page.locator('#scene').getAttribute('data-assets');assert.equal(assets,'ready');
  for(const [season,name] of ['spring','summer','autumn','winter'].entries()){
    await page.evaluate(season=>{const chapter=events.flatMap((e,i)=>e.season===season?[i]:[]),state={...newGame('full'),position:chapter[Math.floor(chapter.length/2)],season};world.setState(state);world.setCameraMode('follow');},season);
    await page.waitForTimeout(350);
    await page.screenshot({path:fileURLToPath(new URL(`polish-${name}.png`,out))});
    const stats=await page.evaluate(()=>{const draws=world.renderer.info.render.calls;world.renderer.shadowMap.enabled=false;world.renderer.render(world.scene,world.camera);const mainDraws=world.renderer.info.render.calls;world.renderer.shadowMap.enabled=true;return {draws,mainDraws,triangles:world.renderer.info.render.triangles,feet:world.character.position.y+.058,ground:world.walkingSurfaceY(world.character.position.x,world.character.position.z),faded:world.faded.size};});
    assert.ok(Math.abs(stats.feet-stats.ground)<.001);console.log(name,stats);
  }
  await page.evaluate(()=>world.setCameraMode('overview'));await page.waitForTimeout(350);
  await page.screenshot({path:fileURLToPath(new URL('polish-overview.png',out))});
  const worldContract=await page.evaluate(()=>{
    let minimumSpacing=Infinity;for(let i=0;i<world.tiles.length;i++)for(let j=i+1;j<world.tiles.length;j++)minimumSpacing=Math.min(minimumSpacing,world.tiles[i].position.distanceTo(world.tiles[j].position));
    return {tiles:world.tiles.length,cinematicMarkers:world.tiles.filter(t=>t.sign.getObjectByName('cinematic-marker')).length,minimumSpacing,details:world.art.detailCounts,routeLength:world.curve.getLength()};
  });assert.equal(worldContract.tiles,40);assert.equal(worldContract.cinematicMarkers,8);assert.ok(worldContract.minimumSpacing>3.5);assert.ok(worldContract.details.flowers>250);assert.ok(worldContract.details.fences>=10);assert.equal(worldContract.details.bridges,2);assert.equal(worldContract.details.birds+worldContract.details.butterflies,12);console.log('world-contract',worldContract);
  const labels=await page.evaluate(()=>{world.setState(newGame('demo'));return world.tiles.filter(t=>t.group.visible).map(t=>t.label);});
  assert.deepEqual(labels,Array.from({length:12},(_,i)=>i+1));
  const restored=await page.evaluate(()=>{world.setState(newGame('full'));return world.tiles.map(t=>t.label);});
  assert.deepEqual(restored,Array.from({length:40},(_,i)=>i+1));
  const ending=await page.evaluate(async()=>{const {stationU}=await import('/src/journey-world.js');world.setState({...newGame('full'),position:39,season:3});return {position:world.currentPosition,u:world.u,endU:stationU(39),gate:Boolean(world.scene.getObjectByName('four-seasons-finish-gate'))};});assert.equal(ending.position,39);assert.equal(ending.u,ending.endU);assert.equal(ending.gate,true);
  const canal=await page.evaluate(async()=>{const {surfaceY,CANAL_CENTER_X}=await import('/src/scenery.js');return [-61,-40,0,30,51].map(z=>surfaceY(CANAL_CENTER_X,z));});
  assert.ok(canal.every(y=>y<-.05));
  const checkpoints=await page.evaluate(async()=>{const {surfaceY}=await import('/src/scenery.js');world.setCameraMode('follow');return events.map((event,index)=>{world.setState({...newGame('full'),position:index,season:event.season});return {index,finite:[...world.character.position,...world.camera.position].every(Number.isFinite),cameraClearance:world.camera.position.y-surfaceY(world.camera.position.x,world.camera.position.z)};});});
  assert.ok(checkpoints.every(p=>p.finite&&p.cameraClearance>=2.19));
  if(process.env.TEST_WORLD_MOTION==='1'){
    await page.emulateMedia({reducedMotion:'no-preference'});
    const result=await page.evaluate(async()=>{
      world.setState(newGame('full'));world.setCameraMode('follow');const start=performance.now();await world.walk(newGame('full'),2);
      return {duration:performance.now()-start,u:world.u,stage:world.stage,feet:world.character.position.y+.058,ground:world.walkingSurfaceY(world.character.position.x,world.character.position.z)};
    });
    assert.ok(result.duration>=3500&&result.duration<8000,JSON.stringify(result));assert.equal(result.stage,'idle');assert.ok(Math.abs(result.feet-result.ground)<.001);console.log('motion',result);
  }
  assert.deepEqual(errors,[]);await page.evaluate(()=>world.dispose());
  console.log('PASS real forty-station landscape world, eight cinematic markers, garden details, canal depth, logical labels and foot contact; no API calls.');
}finally{await browser.close();}
