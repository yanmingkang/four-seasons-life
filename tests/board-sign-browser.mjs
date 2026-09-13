// Real JourneyWorld source integration, like journey-3d-browser.mjs. This owns
// its Vite server and browser; APIs/external origins/CLI are never contacted.
// Scene poses are rendering fixtures, not additional played game histories.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {createServer} from 'node:net';
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';

const root=fileURLToPath(new URL('../',import.meta.url)),out=new URL('../test-results/building-names-removed/board-sign/',import.meta.url);
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_PATH||'C:/Users/25293/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const report={passed:false,phase:'prepare',startedAt:new Date().toISOString(),errors:[],webglMessages:[],apiIntercepted:[],externalBlocked:[],routes:[],screenshots:[],
  method:{sourceIntegration:true,productionBundle:false,isolatedServer:true,isolatedStorage:true,user4173Untouched:true,realModelCalls:0,realCLICalls:0,canvasHook:'Calls native fillText and records canvas identity, text, font and measured extents; verifies the actual material image, not only userData.',fixtures:'newGame full/demo states and camera/position-only rendering poses; no additional gameplay claimed.'}};
let browser,server,page,serverError,serverLog='';
await fs.mkdir(out,{recursive:true});
const save=()=>fs.writeFile(new URL('browser-source.json',out),JSON.stringify(report,null,2));
async function shot(name){await page.screenshot({path:fileURLToPath(new URL(`${name}.png`,out))});report.screenshots.push(`${name}.png`);await save();}
async function startServer(){
  const paths=['src/scenery.js','src/journey-world.js','src/world-signage.js','src/world-signage.css','src/pastoral-buildings.js'];
  report.source=await Promise.all(paths.map(async path=>({path,sha256:createHash('sha256').update(await fs.readFile(new URL(`../${path}`,import.meta.url))).digest('hex')})));
  const probe=createServer();await new Promise((resolve,reject)=>{probe.once('error',reject);probe.listen(0,'127.0.0.1',resolve);});const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
  const disabledCli=fileURLToPath(new URL('disabled-cli.exe',out));await assert.rejects(fs.access(disabledCli),{code:'ENOENT'});
  server=spawn(process.execPath,['server.mjs'],{cwd:root,windowsHide:true,env:{...process.env,PORT:String(port),ZHIHU_CLI_PATH:disabledCli},stdio:['ignore','pipe','pipe']});
  server.on('error',error=>{serverError=error;});for(const stream of [server.stdout,server.stderr])stream.on('data',data=>{serverLog=(serverLog+data).slice(-8000);});
  const base=`http://127.0.0.1:${port}`;report.server={base,owned:true};
  for(let i=0;i<100;i++){if(serverError)throw serverError;if(server.exitCode!==null)throw Error(`Owned server stopped: ${serverLog}`);try{if((await fetch(base,{signal:AbortSignal.timeout(1000)})).ok)return base;}catch{}await delay(100);}
  throw Error(`Owned server unavailable: ${serverLog}`);
}
function checkBoard(row){
  assert.equal(row.signText,row.expected,`Metadata: ${row.expected}`);
  assert.equal(row.canvas.lastText,row.expected,`Actual texture: ${row.expected}`);
  assert.ok(/[\u3400-\u9fff]/u.test(row.canvas.lastText),'Actual texture includes Chinese');
  assert.ok(row.canvas.changedPixels>100,'Actual canvas has non-background pixels');
  assert.ok(row.canvas.textWidth<=row.canvas.width-20,'Complete text fits canvas horizontally');
  assert.ok(row.canvas.ascent+row.canvas.descent<=row.canvas.height,'Complete glyphs fit vertically');
  assert.equal(row.parented,true,'Both planes are real children of the sign');
  assert.equal(row.planeCount,2,'Sign has front and back text planes');
  assert.equal(row.sharedMaterial,true,'Front/back share one material');
  assert.equal(row.sharedGeometry,true,'Front/back share plane geometry');
  assert.ok(Math.abs(row.backRotationY-Math.PI)<1e-9,'Back plane faces backwards, not mirrored');
  assert.ok(row.frontZ>0&&row.backZ<0,'Planes sit on opposite real board faces');
  assert.equal(row.depthTest,true);assert.equal(row.depthWrite,true);assert.equal(row.toneMapped,false);
  assert.ok(Math.abs(row.canvas.width/row.canvas.height-row.planeAspect)<.025,'Canvas follows physical board aspect');
}
async function routeCheck(mode,label){
  report.phase=`route-${label}`;await page.evaluate(mode=>world.setState(newGame(mode)),mode);
  const state=await page.evaluate(()=>({mode:world.mode,route:routeFor(world.mode),rows:world.tiles.map(tile=>{
    const active=routeFor(world.mode).indexOf(tile.index),row=window.inspectSign(tile.sign);
    return {...row,index:tile.index,label:tile.label,expected:`${active+1} · ${stationName(EVENTS[tile.index])}`,groupVisible:tile.group.visible,signVisible:tile.sign.visible,routePosition:active,number:window.canvasFacts(tile.number.material.map.image).lastText};
  })}));
  report.routes.push({label,...state});
  assert.equal(state.rows.filter(row=>row.groupVisible).length,state.route.length);
  for(const row of state.rows){
    assert.equal(row.groupVisible,row.routePosition>=0);assert.equal(row.signVisible,row.groupVisible);
    if(row.routePosition<0)continue;
    assert.equal(row.label,row.routePosition+1);assert.equal(row.number,String(row.label).padStart(2,'0'));checkBoard(row);
  }
  assert.equal(await page.locator('.world-name--station,.world-name--sign').count(),0,'No floating station/gate duplicate labels');
  assert.equal(await page.locator('.world-name--building,.world-name-stem').count(),0,'No floating building names or leader lines, even hidden');
  await save();
}
async function closeSign(index,side=1,lateral=0){
  await page.evaluate(({index,side,lateral})=>{
    const tile=world.tiles[index];world.setState({...newGame('full'),position:index,season:EVENTS[index].season});world.setCameraMode('follow');
    world.userOrbit=true;world.container.dataset.cameraOrbit='user';world.controls.enableDamping=false;
    const center=tile.sign.localToWorld(new THREE.Vector3(0,1.95,0)),offset=new THREE.Vector3(lateral,2.4,side*6.5).applyQuaternion(tile.sign.getWorldQuaternion(new THREE.Quaternion()));
    world.camera.zoom=1;world.camera.position.copy(center).add(offset);world.controls.target.copy(center);world.camera.updateProjectionMatrix();world.controls.update();world.controls.enableDamping=true;world.signage.invalidate();
  },{index,side,lateral});await page.waitForTimeout(250);
}
try{
  const base=await startServer();report.phase='launch';
  browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--use-gl=angle','--use-angle=d3d11','--ignore-gpu-blocklist']});
  const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce',serviceWorkers:'block'});
  await context.route('**/*',route=>{
    const url=new URL(route.request().url());
    if(url.origin!==base){report.externalBlocked.push(url.origin+url.pathname);return route.abort();}
    if(url.pathname.startsWith('/api/')){report.apiIntercepted.push(url.pathname);return route.fulfill({status:503,contentType:'application/json',body:'{"error":"offline_board_sign_test"}'});}
    if(url.pathname==='/__board-sign')return route.fulfill({contentType:'text/html; charset=utf-8',body:'<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/src/world-signage.css"><style>body{margin:0;background:#cee0d4}#world{position:relative;width:100vw;height:100vh;overflow:hidden}.world-location{position:absolute;bottom:20px;left:20px;display:grid;gap:5px;padding:15px;background:#fff8e8ed;border:1px solid #b79563;font:16px system-ui;color:#52422f}</style><div id="world" class="scene"></div><dialog id="dialog">暂停测试</dialog>'});
    return route.continue();
  });
  await context.routeWebSocket('**/*',ws=>ws.close());
  await context.addInitScript(()=>{
    const original=CanvasRenderingContext2D.prototype.fillText,records=new WeakMap();
    window.__canvasDraws=[];
    CanvasRenderingContext2D.prototype.fillText=function(text,x,y,...rest){
      const metrics=this.measureText(String(text)),entry={text:String(text),x,y,font:this.font,textWidth:metrics.width,ascent:metrics.actualBoundingBoxAscent,descent:metrics.actualBoundingBoxDescent};
      if(!records.has(this.canvas))records.set(this.canvas,[]);records.get(this.canvas).push(entry);window.__canvasDraws.push(entry);
      return original.call(this,text,x,y,...rest);
    };
    window.canvasFacts=canvas=>{
      const recordsForCanvas=records.get(canvas)||[],last=recordsForCanvas.at(-1),data=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
      let changedPixels=0;for(let i=4;i<data.length;i+=4)if(Math.abs(data[i]-data[0])+Math.abs(data[i+1]-data[1])+Math.abs(data[i+2]-data[2])>30)changedPixels++;
      return {width:canvas.width,height:canvas.height,draws:recordsForCanvas,lastText:last?.text||'',...last,changedPixels};
    };
  });
  page=await context.newPage();page.setDefaultTimeout(30000);page.on('pageerror',error=>report.errors.push(error.message));page.on('console',message=>{if(/webgl|gl_invalid|context.lost|framebuffer/i.test(message.text())&&['error','warning'].includes(message.type()))report.webglMessages.push({type:message.type(),text:message.text()});});
  report.phase='load-world';await page.goto(`${base}/__board-sign`);
  await page.evaluate(async()=>{
    const [{JourneyWorld,stationName},{newGame},{EVENTS,SEASONS},{routeFor},THREE]=await Promise.all([import('/src/journey-world.js'),import('/src/engine.js'),import('/src/events.js'),import('/src/route.js'),import('/node_modules/three/build/three.module.js')]);
    Object.assign(window,{newGame,EVENTS,SEASONS,stationName,routeFor,THREE});window.world=new JourneyWorld(document.querySelector('#world'));world.setState(newGame('full'));await world.ready;
    window.inspectSign=sign=>{
      const panel=sign.userData.labelPanel,planes=sign.children.filter(child=>child.isMesh&&child.geometry===panel.geometry),back=planes.find(child=>child!==panel);
      return {signText:sign.userData.signText,canvas:window.canvasFacts(panel.material.map.image),parented:panel.parent===sign&&back?.parent===sign,planeCount:planes.length,sharedMaterial:panel.material===back?.material,sharedGeometry:panel.geometry===back?.geometry,backRotationY:back?.rotation.y,frontZ:panel.position.z,backZ:back?.position.z,planeAspect:panel.geometry.parameters.width/panel.geometry.parameters.height,depthTest:panel.material.depthTest,depthWrite:panel.material.depthWrite,toneMapped:panel.material.toneMapped,anisotropy:panel.material.map.anisotropy,mapUuid:panel.material.map.uuid,signPosition:sign.position.toArray(),signRotation:sign.rotation.toArray()};
    };
  });
  await page.waitForFunction(()=>world.container.dataset.boardDraws>0&&world.signage.entries.length===4);
  assert.equal(await page.locator('#world').getAttribute('data-renderer'),'webgl');
  report.renderer=await page.evaluate(()=>{const gl=world.renderer.getContext(),extension=gl.getExtension('WEBGL_debug_renderer_info');return {webgl2:gl instanceof WebGL2RenderingContext,renderer:extension?gl.getParameter(extension.UNMASKED_RENDERER_WEBGL):'unavailable',maxAnisotropy:world.renderer.capabilities.getMaxAnisotropy()};});assert.equal(report.renderer.webgl2,true);
  await shot('follow-start');
  await page.evaluate(()=>world.setState({...newGame('full'),position:5,season:0}));await page.waitForTimeout(250);await shot('follow-cell-06');console.log('EARLY SCREENSHOT test-results/building-names-removed/board-sign/follow-cell-06.png');
  await routeCheck('full','initial-full');
  report.phase='season-and-gates';
  report.otherSigns=await page.evaluate(()=>{
    const signs=[];world.scene.traverse(sign=>{if(sign.userData.signText&&!world.tiles.some(tile=>tile.sign===sign)){
      if(sign.userData.labelPanel)signs.push({...inspectSign(sign),kind:'season',expected:sign.userData.signText});
      else {const surfaces=[];sign.traverse(mesh=>{if(mesh.isMesh&&mesh.material?.map?.image instanceof HTMLCanvasElement)surfaces.push({canvas:canvasFacts(mesh.material.map.image),parented:mesh.parent===sign,depthTest:mesh.material.depthTest,depthWrite:mesh.material.depthWrite,toneMapped:mesh.material.toneMapped});});signs.push({kind:'gate',signText:sign.userData.signText,surfaces});}
    }});return signs;
  });
  assert.equal(report.otherSigns.filter(row=>row.kind==='season').length,3);assert.equal(report.otherSigns.filter(row=>row.kind==='gate').length,2);
  for(const row of report.otherSigns){if(row.kind==='season')checkBoard(row);else{
    assert.ok(row.surfaces.length>0,`${row.signText}: gate has physical canvas surface`);
    for(const surface of row.surfaces){assert.equal(surface.canvas.lastText,row.signText);assert.ok(surface.canvas.changedPixels>100);assert.equal(surface.parented,true);assert.equal(surface.depthTest,true);assert.equal(surface.depthWrite,true);}
  }}
  report.overlays=await page.evaluate(()=>({kinds:world.signage.entries.reduce((all,entry)=>(all[entry.kind]=(all[entry.kind]||0)+1,all),{}),buildingCount:document.querySelectorAll('.world-name--building').length,stemCount:document.querySelectorAll('.world-name-stem').length,seasonCount:document.querySelectorAll('.world-signage .world-label').length}));
  assert.equal(report.overlays.seasonCount,4);assert.equal(report.overlays.buildingCount,0);assert.equal(report.overlays.stemCount,0);assert.deepEqual(report.overlays.kinds,{season:4});
  report.buildingSurfaces=await page.evaluate(()=>world.art.buildings.map(building=>{
    const canvases=new Set(),textSurfaces=[];let meshes=0;
    building.traverse(mesh=>{if(!mesh.isMesh)return;meshes++;for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material]){const image=material?.map?.image;if(!(image instanceof HTMLCanvasElement)||canvases.has(image))continue;canvases.add(image);const facts=canvasFacts(image);if(facts.draws.length)textSurfaces.push(facts.draws.map(draw=>draw.text));}});
    return {id:building.userData.buildingId,name:building.userData.label,meshes,canvasTextures:canvases.size,textSurfaces};
  }));
  assert.ok(report.buildingSurfaces.length>0,'Real scene buildings exist');
  for(const building of report.buildingSurfaces){assert.ok(building.meshes>0,`${building.id}: 3D geometry remains`);assert.deepEqual(building.textSurfaces,[],`${building.id}: building-name text decals are absent`);}
  const bookstall=report.buildingSurfaces.find(building=>building.id==='bookstall');assert.ok(bookstall,'Bookstall remains part of the actual world');assert.equal(bookstall.canvasTextures,0,'Bookstall has no nameplate canvas texture');
  await routeCheck('demo','demo');await shot('demo-follow-start');await routeCheck('full','restored-full');
  assert.deepEqual(report.routes[0].rows.map(row=>row.canvas.lastText),report.routes[2].rows.map(row=>row.canvas.lastText),'All forty textures restored after demo');
  report.phase='close-views';await closeSign(5,1);await shot('cell-06-front');await closeSign(5,-1);await shot('cell-06-back');await closeSign(5,-1,6.5);await shot('cell-06-back-oblique');await closeSign(5,1);
  const beforeOrbit=await page.evaluate(()=>({camera:world.camera.position.toArray(),sign:inspectSign(world.tiles[5].sign)}));
  await page.mouse.move(750,430);await page.mouse.down();await page.mouse.move(860,465,{steps:10});await page.mouse.up();await page.waitForTimeout(250);
  const afterOrbit=await page.evaluate(()=>({camera:world.camera.position.toArray(),sign:inspectSign(world.tiles[5].sign)}));assert.notDeepEqual(afterOrbit.camera,beforeOrbit.camera);assert.deepEqual(afterOrbit.sign,beforeOrbit.sign);await shot('cell-06-rotated');
  report.orbit={cameraChanged:true,physicalSignUnchanged:true};
  await page.evaluate(()=>{world.userOrbit=false;world.resetView();});const beforeZoom=await page.evaluate(()=>({factor:world.zoomFactor,sign:inspectSign(world.tiles[5].sign)}));
  await page.mouse.move(1000,500);await page.mouse.wheel(0,-250);await page.waitForFunction(factor=>world.zoomFactor<factor,beforeZoom.factor);await page.waitForTimeout(250);
  assert.deepEqual(await page.evaluate(()=>inspectSign(world.tiles[5].sign)),beforeZoom.sign);report.zoom={before:beforeZoom.factor,after:await page.evaluate(()=>world.zoomFactor),physicalSignUnchanged:true};await shot('cell-06-follow-zoomed');
  const longest=await page.evaluate(()=>EVENTS.reduce((best,event,index)=>(stationName(event).length>stationName(EVENTS[best]).length?index:best),0));await closeSign(longest,1);await shot(`longest-cell-${String(longest+1).padStart(2,'0')}-front`);
  await closeSign(39,-1);await shot('cell-40-back');
  await closeSign(8,1);await shot('cell-09-road-sign-front');
  const directorFocused=await page.evaluate(()=>{world.setState({...newGame('full'),position:8,season:0});return world.focusLandmark('reference-cell-09');});
  assert.equal(directorFocused,true);await page.waitForTimeout(250);await shot('cell-09-director-building-1440');
  assert.equal(await page.locator('.world-name--building,.world-name-stem').count(),0);
  await page.setViewportSize({width:844,height:390});await page.waitForTimeout(250);await shot('cell-09-director-building-844');
  assert.equal(await page.locator('.world-name--building,.world-name-stem').count(),0);
  await page.setViewportSize({width:1440,height:900});
  report.phase='overview';await page.evaluate(()=>{world.setState(newGame('full'));world.setCameraMode('overview');});await page.waitForTimeout(250);await shot('overview-full');
  report.overlays.visibleOverview=await page.evaluate(()=>world.signage.entries.filter(entry=>getComputedStyle(entry.el).visibility==='visible').map(entry=>({kind:entry.kind,text:entry.el.innerText})));
  assert.equal(report.overlays.visibleOverview.length,4);assert.ok(report.overlays.visibleOverview.every(entry=>entry.kind==='season'));
  // Preserve all material canvases as a readable contact sheet, independent of
  // perspective size. Every tile is sourced from its live material texture.
  const atlas=await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=2048;canvas.height=10*256;const c=canvas.getContext('2d');c.fillStyle='#dfd4b9';c.fillRect(0,0,canvas.width,canvas.height);world.tiles.forEach((tile,i)=>{const image=tile.sign.userData.labelPanel.material.map.image;c.drawImage(image,(i%4)*512,Math.floor(i/4)*256+64,512,512*image.height/image.width);});return canvas.toDataURL('image/png');});
  await fs.writeFile(new URL('all-40-material-textures.png',out),Buffer.from(atlas.split(',')[1],'base64'));
  report.phase='final-check';report.glError=await page.evaluate(()=>world.renderer.getContext().getError());assert.equal(report.glError,0);assert.deepEqual(report.errors,[]);
  // ANGLE/D3D11 can report harmless compile-time sums below double precision.
  // Retain the complete warning and permit only this exact warning family;
  // console errors, other shader warnings and GL errors remain failures.
  const isPrecisionWarning=entry=>entry.type==='warning'&&entry.text.startsWith('THREE.WebGLProgram: Program Info Log:')&&entry.text.replace('THREE.WebGLProgram: Program Info Log:','').split(/\r?\n/).map(line=>line.replace(/\0/g,'').trim()).filter(Boolean).every(line=>/^\(\d+,\d+-\d+\): warning X4122: sum of .+ cannot be represented accurately in double precision$/.test(line));
  report.acceptedPrecisionWarnings=report.webglMessages.filter(isPrecisionWarning);report.webglErrors=report.webglMessages.filter(entry=>!isPrecisionWarning(entry));assert.deepEqual(report.webglErrors,[]);assert.deepEqual(report.apiIntercepted,[]);assert.deepEqual(report.externalBlocked,[]);
  report.localStorageItems=await page.evaluate(()=>localStorage.length);assert.equal(report.localStorageItems,0);
  await page.evaluate(()=>world.dispose());assert.equal(await page.locator('#world canvas').count(),0);assert.equal(await page.locator('.world-signage').count(),0);
  report.passed=true;report.phase='complete';console.log(JSON.stringify({passed:true,stationSigns:40,seasonSigns:3,gates:2,routes:report.routes.map(row=>row.label),pageErrors:report.errors.length,glError:report.glError,realModelCalls:0}));
}catch(error){report.failure={phase:report.phase,name:error.name,message:error.message,stack:error.stack};if(page)try{await shot('failure');}catch{}console.error(JSON.stringify(report.failure));process.exitCode=1;
}finally{report.finishedAt=new Date().toISOString();await save();await browser?.close();server?.kill();}
