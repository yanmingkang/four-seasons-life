// Real WebGL verification on its own local server. Every API request is blocked;
// the child server has an intentionally unavailable CLI and is the only process
// this test closes. The user's running app is never touched.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import fs from 'node:fs/promises';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_PATH||'C:/Users/25293/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=fileURLToPath(new URL('../',import.meta.url)),out=new URL('../test-results/',import.meta.url);await fs.mkdir(out,{recursive:true});
const probe=createServer();await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
const server=spawn(process.execPath,['server.mjs'],{cwd:root,env:{...process.env,PORT:String(port),ZHIHU_CLI_PATH:'Z:/disabled-browser-test/zhihu-cli.exe'},windowsHide:true,stdio:'ignore'}),base=`http://127.0.0.1:${port}`;
let browser;
try{
  for(let attempt=0;attempt<80;attempt++){try{if((await fetch(base)).ok)break;}catch{}if(attempt===79)throw new Error('Isolated server did not start');await new Promise(resolve=>setTimeout(resolve,125));}
  browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'no-preference'});await context.route('**/api/**',route=>route.abort());
  await context.route(base+'/__journey-3d',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:'<!doctype html><meta charset="utf-8"><style>body{margin:0}#world{position:relative;width:100vw;height:100vh}.world-label{display:none}.world-location{position:absolute;bottom:20px;left:20px;display:grid;gap:5px;padding:15px;background:#fff8e8ed;border:1px solid #b79563;font:16px system-ui;color:#52422f}</style><div id="world"></div><dialog id="dialog">暂停测试</dialog>'}));
  const page=await context.newPage(),errors=[];page.on('pageerror',error=>{errors.push(error.message);console.error('Browser runtime error:',error.message);});await page.goto(base+'/__journey-3d');
  await page.evaluate(async()=>{const {JourneyWorld}=await import('/src/journey-world.js'),{newGame}=await import('/src/engine.js');window.newGame=newGame;window.world=new JourneyWorld(document.querySelector('#world'));world.setState(newGame('full'));await world.ready;});
  await page.waitForTimeout(600);
  assert.equal(await page.locator('#world').getAttribute('data-renderer'),'webgl');
  assert.equal(await page.evaluate(()=>world.renderer.getContext() instanceof WebGL2RenderingContext),true);
  assert.equal(await page.evaluate(()=>world.tiles.length),40);
  assert.equal(await page.locator('#world').getAttribute('data-life-stage'),'初入社会');
  const first=await page.evaluate(()=>world.elapsed);await page.waitForFunction(first=>world.elapsed>first,first,{timeout:10000});
  await page.screenshot({path:fileURLToPath(new URL('journey-3d-follow.png',out))});
  await page.evaluate(()=>document.querySelector('#dialog').showModal());await page.waitForTimeout(100);
  const paused=await page.evaluate(()=>({time:world.elapsed,head:world.character.userData.rig.head.rotation.y,arm:world.arms[1].joint.rotation.z}));
  await page.waitForTimeout(400);assert.deepEqual(await page.evaluate(()=>({time:world.elapsed,head:world.character.userData.rig.head.rotation.y,arm:world.arms[1].joint.rotation.z})),paused);
  await page.evaluate(()=>document.querySelector('#dialog').close());await page.waitForTimeout(250);assert.ok(await page.evaluate(()=>world.elapsed)>paused.time);
  await page.emulateMedia({reducedMotion:'reduce'});await page.waitForTimeout(100);const reduced=await page.evaluate(()=>world.elapsed);await page.waitForTimeout(250);assert.equal(await page.evaluate(()=>world.elapsed),reduced);
  await page.emulateMedia({reducedMotion:'no-preference'});
  const before=await page.evaluate(()=>world.camera.position.toArray());await page.mouse.move(800,500);await page.mouse.down();await page.mouse.move(990,540,{steps:12});await page.mouse.up();await page.waitForTimeout(300);
  const after=await page.evaluate(()=>world.camera.position.toArray());assert.ok(Math.hypot(...after.map((v,i)=>v-before[i]))>1);assert.equal(await page.locator('#world').getAttribute('data-camera-orbit'),'user');
  await page.evaluate(async()=>{
    window.THREE=await import('/node_modules/three/build/three.module.js');
    window.checkFraming=box=>{
      const insets=world.cameraInsets(),width=world.container.clientWidth,height=world.container.clientHeight;world.camera.updateMatrixWorld(true);
      for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){
        const p=new THREE.Vector3(x,y,z).project(world.camera),px=(p.x+1)*width/2,py=(1-p.y)*height/2;
        if(px<insets.left-1||px>width-insets.right+1||py<insets.top-1||py>height-insets.bottom+1||p.z>=1)throw new Error(`Geometry clipped outside HUD-safe view at ${width}×${height}: ${px}, ${py}`);
      }
    };
  });
  for(const [width,height] of [[1440,900],[844,390]]){
    await page.setViewportSize({width,height});await page.evaluate(()=>world.setCameraMode('overview'));await page.waitForTimeout(200);assert.equal(await page.locator('#world').getAttribute('data-camera-mode'),'overview');
    await page.evaluate(()=>checkFraming(world.overviewBounds()));await page.screenshot({path:fileURLToPath(new URL(`journey-3d-overview-${width}.png`,out))});
    await page.mouse.move(width*.8,height*.45);await page.mouse.wheel(0,-320);await page.waitForFunction(()=>world.camera.zoom>1);assert.ok(await page.evaluate(()=>world.camera.zoom)<=1.18+1e-9);await page.evaluate(()=>world.setCameraMode('overview'));
    const gameBefore=await page.evaluate(()=>({position:world.character.position.toArray(),u:world.u,state:JSON.stringify(world.state)}));
    for(const id of ['library','stadium','village','bookstall']){
      assert.equal(await page.evaluate(id=>world.focusLandmark(id),id),true);await page.waitForTimeout(200);
      assert.equal(await page.locator('#world').getAttribute('data-camera-mode'),'landmark');assert.equal(await page.locator('#world').getAttribute('data-focused-landmark'),id);
      await page.evaluate(()=>checkFraming(new THREE.Box3().setFromObject(world.focusedBuilding)));await page.screenshot({path:fileURLToPath(new URL(`journey-3d-landmark-${id}-${width}.png`,out))});
      assert.deepEqual(await page.evaluate(()=>({position:world.character.position.toArray(),u:world.u,state:JSON.stringify(world.state)})),gameBefore);
    }
    const landmarkCamera=await page.evaluate(()=>world.camera.position.toArray());await page.mouse.move(width*.52,height*.5);await page.mouse.down();await page.mouse.move(width*.68,height*.6,{steps:10});await page.mouse.up();await page.waitForTimeout(120);assert.notDeepEqual(await page.evaluate(()=>world.camera.position.toArray()),landmarkCamera);
    await page.evaluate(()=>world.zoom(.15));assert.equal(await page.evaluate(()=>world.camera.zoom),1.15);
    await page.mouse.move(width*.8,height*.45);await page.mouse.wheel(0,160);await page.waitForFunction(()=>world.camera.zoom<1.15);
    const beforeDialogZoom=await page.evaluate(()=>world.camera.zoom);await page.evaluate(()=>document.querySelector('#dialog').showModal());await page.mouse.wheel(0,-320);await page.waitForTimeout(120);assert.equal(await page.evaluate(()=>world.camera.zoom),beforeDialogZoom);
    const pausedWheel=await page.evaluate(()=>{const wheel=new WheelEvent('wheel',{deltaY:-400,cancelable:true});world.renderer.domElement.dispatchEvent(wheel);return {prevented:wheel.defaultPrevented,zoom:world.camera.zoom};});assert.deepEqual(pausedWheel,{prevented:false,zoom:beforeDialogZoom});await page.evaluate(()=>document.querySelector('#dialog').close());
    assert.equal(await page.evaluate(()=>world.focusLandmark('missing')),false);
    await page.evaluate(()=>world.resetView());assert.equal(await page.locator('#world').getAttribute('data-camera-mode'),'follow');assert.equal(await page.locator('#world').getAttribute('data-focused-landmark'),null);
    const beforeFollow=await page.evaluate(()=>({factor:world.zoomFactor,u:world.u,state:JSON.stringify(world.state),die:world.dice.mesh.userData.value}));await page.mouse.wheel(0,-320);await page.waitForFunction(()=>world.zoomFactor<1);assert.ok(await page.evaluate(()=>world.zoomFactor)>=.82-1e-9);assert.equal(await page.evaluate(()=>world.camera.zoom),1);
    assert.deepEqual(await page.evaluate(()=>({u:world.u,state:JSON.stringify(world.state),die:world.dice.mesh.userData.value})),{u:beforeFollow.u,state:beforeFollow.state,die:beforeFollow.die});
    await page.evaluate(()=>world.setInteractionEnabled(false));const disabledWheel=await page.evaluate(()=>{const wheel=new WheelEvent('wheel',{deltaY:-400,cancelable:true});const before=world.zoomFactor;world.renderer.domElement.dispatchEvent(wheel);return {prevented:wheel.defaultPrevented,changed:world.zoomFactor!==before};});assert.deepEqual(disabledWheel,{prevented:false,changed:false});await page.evaluate(()=>world.setInteractionEnabled(true));
  }
  await page.setViewportSize({width:1440,height:900});await page.evaluate(()=>{world.focusLandmark('library');world.setCameraMode('overview');});assert.equal(await page.locator('#world').getAttribute('data-focused-landmark'),null);
  for(let season=0;season<4;season++)await page.evaluate(season=>{const state={...newGame('full'),season,position:season*10,turn:season+1};world.setState(state);if(world.container.dataset.weather!==['blossoms','fireflies','leaves','snow'][season])throw new Error('Chapter weather mismatch');},season);
  await page.evaluate(()=>{world.setCameraMode('follow');world.setState(newGame('full'));window.pendingWalk=world.walk(newGame('full'),2);});await page.waitForTimeout(180);await page.evaluate(()=>world.cancelAnimations());assert.equal(await page.evaluate(async()=>{await pendingWalk;return world.stage;}),'idle');
  const cancelled=await page.evaluate(()=>world.u);await page.waitForTimeout(250);assert.equal(await page.evaluate(()=>world.u),cancelled);
  await page.evaluate(()=>{world.setState(newGame('full'));window.pendingThrow=world.throwDice(5);});await page.waitForFunction(()=>world.dice.active);await page.waitForTimeout(180);
  await page.evaluate(()=>document.querySelector('#dialog').showModal());await page.waitForTimeout(100);const pausedDie=await page.evaluate(()=>world.dice.active.elapsed);await page.waitForTimeout(300);assert.equal(await page.evaluate(()=>world.dice.active.elapsed),pausedDie);
  await page.evaluate(()=>{world.setState(newGame('full'));document.querySelector('#dialog').close();});await page.evaluate(async()=>pendingThrow);assert.equal(await page.evaluate(()=>world.dice.active),null);assert.equal(await page.evaluate(()=>world.dice.mesh.visible),false);
  await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await page.evaluate(async()=>{await world.throwDice(2);return world.dice.mesh.userData.value;}),2);await page.emulateMedia({reducedMotion:'no-preference'});
  await page.evaluate(()=>world.setState(newGame('full')));await page.setViewportSize({width:450,height:850});await page.waitForTimeout(100);const portrait=await page.evaluate(()=>world.elapsed);await page.waitForTimeout(250);assert.equal(await page.evaluate(()=>world.elapsed),portrait);
  await page.setViewportSize({width:1440,height:900});await page.waitForTimeout(120);await page.evaluate(()=>world.dispose());assert.equal(await page.locator('#world canvas').count(),0);assert.deepEqual(errors,[]);
  console.log('PASS real WebGL, 40 cells, grounded idle motion, dialog/reduced/portrait pause, orbit drag, bounded native wheel zoom in all camera modes and disabled/dialog guards, HUD-safe full-map/4-landmark framing at 1440×900 and 844×390, unchanged game state on focus, chapter datasets, walk cancellation, dice pause/restart and disposal. No external APIs.');
}finally{await browser?.close();server.kill();}
