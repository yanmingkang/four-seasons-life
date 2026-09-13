// Real integrated world, a private ephemeral server and no business API calls.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import fs from 'node:fs/promises';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_PATH||'C:/Users/25293/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=fileURLToPath(new URL('../',import.meta.url)),out=new URL('../test-results/',import.meta.url);await fs.mkdir(out,{recursive:true});
const probe=createServer();await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
const server=spawn(process.execPath,['server.mjs'],{cwd:root,env:{...process.env,PORT:String(port),ZHIHU_CLI_PATH:'Z:/disabled-terrain-test/cli.exe'},windowsHide:true,stdio:'ignore'}),base=`http://127.0.0.1:${port}`;
const report={schemaVersion:1,createdAt:new Date().toISOString(),environment:'Headless Chromium, WebGL2, ANGLE SwiftShader (software rendering)',scope:'Same static camera and lighting; draw calls and image equivalence only. No FPS or device-speed claim.',caveat:'Larger merged bounds can submit more triangles than individually culled objects; fewer draw calls do not establish a frame-rate improvement.',comparisons:[],modeSwitches:[],views:[]};
let browser;
try{
  for(let i=0;i<100;i++){try{if((await fetch(base)).ok)break;}catch{}if(i===99)throw new Error('Isolated server failed to start');await new Promise(resolve=>setTimeout(resolve,100));}
  browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'});await context.route('**/api/**',route=>route.abort());
  await context.route(base+'/__terrain-world',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:'<!doctype html><style>html,body,#world{margin:0;width:100%;height:100%;overflow:hidden}#world>div{display:none}</style><div id="world"></div><dialog id="dialog"></dialog>'}));
  const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));await page.goto(base+'/__terrain-world');
  await page.evaluate(async()=>{
    const [{JourneyWorld},{newGame},THREE]=await Promise.all([import('/src/journey-world.js'),import('/src/engine.js'),import('/node_modules/three/build/three.module.js')]);window.THREE=THREE;
    window.world=new JourneyWorld(document.querySelector('#world'));world.setState(newGame('full'));await world.ready;
    const moving=new Set(world.art.wildlife.map(actor=>actor.group)),unique=[...new Set(world.art.visuals.filter(visual=>!moving.has(visual.group)).map(visual=>visual.group))],selected=new Set(unique);
    window.proxySources=unique.filter(group=>{for(let parent=group.parent;parent;parent=parent.parent)if(selected.has(parent))return false;return true;});
    // Count real render callbacks, not just the visible flag of a parent group.
    window.captureRender=({readPixels=false,frameTime=null}={})=>{
      const calls={originals:0,proxy:0,focusedBuilding:0},restore=[];
      const instrument=(group,key)=>group.traverse(object=>{if(!object.isMesh)return;const previous=object.onBeforeRender;restore.push(()=>{object.onBeforeRender=previous;});object.onBeforeRender=function(...args){calls[key]++;if(world.focusedBuilding&&proxySources.includes(world.focusedBuilding)){for(let parent=this;parent;parent=parent.parent)if(parent===world.focusedBuilding){calls.focusedBuilding++;break;}}return previous.apply(this,args);};});
      proxySources.forEach(group=>instrument(group,'originals'));instrument(world.art.overviewBatch.group,'proxy');
      try{
        if(frameTime===null)world.renderer.render(world.scene,world.camera);else world.frame(frameTime);
        const gl=world.renderer.getContext(),width=gl.drawingBufferWidth,height=gl.drawingBufferHeight,pixels=readPixels?new Uint8Array(width*height*4):null;if(pixels)gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
        return {pixels,stats:{draws:world.renderer.info.render.calls,triangles:world.renderer.info.render.triangles,width,height,calls,glError:gl.getError()}};
      }finally{restore.forEach(reset=>reset());}
    };
  });
  const original=await page.evaluate(()=>JSON.stringify(world.state));
  report.environmentStats=await page.evaluate(()=>world.art.environmentStats);
  for(const [width,height] of [[1440,900],[844,390]]){
    await page.setViewportSize({width,height});await page.evaluate(()=>{world.resize();world.setCameraMode('overview');});
    const comparison=await page.evaluate(()=>{
      world.setCameraMode('overview');world.lastOcclusion=0;world.frame(performance.now());
      const batch=world.art.overviewBatch;if(!batch)throw new Error('Integrated overview batch is required');
      const before={state:JSON.stringify(world.state),actor:world.character.position.toArray(),u:world.u,camera:world.camera.matrixWorld.toArray(),projection:world.camera.projectionMatrix.toArray()};
      // Disabling the proxy alone deliberately does not restore culled originals.
      // Restore this exact static overview's source roots for the reference draw.
      batch.setEnabled(false);proxySources.forEach(group=>{group.visible=true;});const baseline=captureRender({readPixels:true});
      batch.setEnabled(true);const optimized=captureRender({readPixels:true});
      let sum=0,max=0,changed=0,significant=0;
      for(let i=0;i<baseline.pixels.length;i+=4){let local=0;for(let channel=0;channel<3;channel++){const delta=Math.abs(baseline.pixels[i+channel]-optimized.pixels[i+channel]);sum+=delta;max=Math.max(max,delta);local=Math.max(local,delta);}if(local)changed++;if(local>12)significant++;}
      const count=baseline.pixels.length/4,after={state:JSON.stringify(world.state),actor:world.character.position.toArray(),u:world.u,camera:world.camera.matrixWorld.toArray(),projection:world.camera.projectionMatrix.toArray()};
      return {baseline:baseline.stats,optimized:optimized.stats,savedDrawCalls:baseline.stats.draws-optimized.stats.draws,reduction:1-optimized.stats.draws/baseline.stats.draws,pixelDifference:{meanAbsoluteRGB:sum/(count*3),maxChannel:max,changedFraction:changed/count,significantFraction:significant/count,significantThreshold:12},originalRootsVisible:proxySources.filter(group=>group.visible).length,proxyVisible:batch.group.visible,stateAndCameraUnchanged:JSON.stringify(before)===JSON.stringify(after),implementation:batch.stats};
    });
    assert.equal(comparison.baseline.width,Math.floor(width*Math.min(1,1080/width)));assert.equal(comparison.baseline.height,Math.floor(height*Math.min(1,1080/width)));assert.ok(comparison.reduction>.3,`${width}: integrated batching should materially reduce actual draw calls`);assert.ok(comparison.baseline.calls.originals>0);assert.equal(comparison.baseline.calls.proxy,0);assert.equal(comparison.optimized.calls.originals,0);assert.ok(comparison.optimized.calls.proxy>0);assert.equal(comparison.originalRootsVisible,0);assert.equal(comparison.proxyVisible,true);assert.equal(comparison.stateAndCameraUnchanged,true);assert.equal(comparison.baseline.glError,0);assert.equal(comparison.optimized.glError,0);
    assert.ok(comparison.pixelDifference.meanAbsoluteRGB<1,`${width}: average proxy image difference ${comparison.pixelDifference.meanAbsoluteRGB}`);assert.ok(comparison.pixelDifference.significantFraction<.01,`${width}: proxy changes over 1% of pixels significantly`);
    report.comparisons.push({viewport:{width,height},...comparison});console.log(JSON.stringify({viewport:{width,height},proxyComparison:comparison}));
    const switches=await page.evaluate(()=>{
      const results=[],before={state:JSON.stringify(world.state),actor:world.character.position.toArray(),u:world.u},batch=world.art.overviewBatch,originalBuildings=[...world.art.buildings];let frameTime=performance.now();
      for(let cycle=0;cycle<2;cycle++)for(const id of ['library','stadium','village','bookstall'])for(const mode of ['follow','landmark','overview']){
        if(mode==='landmark'){if(!world.focusLandmark(id))throw new Error(`Could not focus ${id}`);}else world.setCameraMode(mode);
        // A real mode switch must refresh visibility even inside the 150 ms
        // occlusion throttle. Do not clear lastOcclusion on behalf of production.
        const rendered=captureRender({frameTime:++frameTime}),all=[];world.scene.traverse(object=>{if(object.name==='overview-static-batch')all.push(object);});let focusedFaded=0;world.focusedBuilding?.traverse(object=>{if(world.faded.has(object))focusedFaded++;});
        results.push({cycle,mode,landmark:mode==='landmark'?id:null,proxyVisible:batch.group.visible,proxyCount:all.length,originalRootsVisible:proxySources.filter(group=>group.visible).length,focusedVisible:world.focusedBuilding?.visible??null,focusedIdentityPreserved:mode!=='landmark'||originalBuildings.includes(world.focusedBuilding),fadedOriginals:world.faded.size,focusedFaded,rendered:rendered.stats});
      }
      return {results,stateAndActorUnchanged:JSON.stringify(before)===JSON.stringify({state:JSON.stringify(world.state),actor:world.character.position.toArray(),u:world.u}),originalBuildingsPreserved:originalBuildings.every((building,index)=>world.art.buildings[index]===building)};
    });
    assert.equal(switches.stateAndActorUnchanged,true);assert.equal(switches.originalBuildingsPreserved,true);
    for(const result of switches.results){assert.equal(result.proxyCount,1);assert.equal(result.rendered.glError,0);assert.equal(result.proxyVisible,result.mode==='overview',`${width}: proxy remains in ${result.mode} after a mode switch inside the occlusion throttle`);assert.equal(result.focusedIdentityPreserved,true);if(result.mode==='overview'){assert.equal(result.originalRootsVisible,0);assert.equal(result.rendered.calls.originals,0);assert.ok(result.rendered.calls.proxy>0);assert.equal(result.fadedOriginals,0);}else{assert.equal(result.rendered.calls.proxy,0);assert.ok(result.originalRootsVisible>0);assert.ok(result.rendered.calls.originals>0);if(result.mode==='landmark'){assert.equal(result.focusedVisible,true);assert.equal(result.focusedFaded,0);assert.ok(result.rendered.calls.focusedBuilding>0,`${width}: ${result.landmark} originals were not restored`);}}}
    report.modeSwitches.push({viewport:{width,height},checks:switches.results.length,cycles:2,landmarks:['library','stadium','village','bookstall'],stateAndActorUnchanged:switches.stateAndActorUnchanged,originalBuildingsPreserved:switches.originalBuildingsPreserved,proxyCopies:1,duplicateOriginalAndProxyDraws:0,modes:Object.fromEntries(['follow','landmark','overview'].map(mode=>{const rows=switches.results.filter(row=>row.mode===mode),range=key=>[Math.min(...rows.map(row=>row.rendered.calls[key])),Math.max(...rows.map(row=>row.rendered.calls[key]))];return [mode,{checks:rows.length,originalRenderCallbacks:range('originals'),proxyRenderCallbacks:range('proxy'),focusedBuildingRenderCallbacks:range('focusedBuilding')}];}))});
    for(const [name,polar,yaw,zoom] of [['default',null,0,1],['far',null,0,.7],['low-north',1.3,0,.7],['low-south',1.3,Math.PI,.7],['high-east',.25,Math.PI/2,.7]]){
      await page.evaluate(({polar,yaw,zoom})=>{world.setCameraMode('overview');const radius=world.camera.position.distanceTo(world.controls.target);if(polar!==null){world.camera.position.copy(world.controls.target).add(new THREE.Vector3().setFromSphericalCoords(radius,polar,yaw));world.camera.lookAt(world.controls.target);world.userOrbit=true;world.controls.update();}world.camera.zoom=zoom;world.camera.updateProjectionMatrix();},{polar,yaw,zoom});
      await page.waitForTimeout(220);
      const stats=await page.evaluate(()=>{
        const terrain=world.scene.getObjectByName('continuous-ground-lod');if(!terrain)throw new Error('World terrain module has not been integrated');if(!world.art.skyDome)throw new Error('Scenery.skyDome is required');
        const sky=world.art.skyDome,positions=terrain.geometry.attributes.position,perimeter=[];world.camera.updateMatrixWorld(true);
        for(let i=positions.count-640;i<positions.count;i++){const p=new THREE.Vector3().fromBufferAttribute(positions,i).applyMatrix4(terrain.matrixWorld).project(world.camera);if(Math.abs(p.x)<=1&&Math.abs(p.y)<=1&&p.z>-1&&p.z<1)perimeter.push(i);}
        world.renderer.render(world.scene,world.camera);const gl=world.renderer.getContext(),pixels=[];
        for(const [u,v] of [[.01,.01],[.99,.01],[.01,.99],[.99,.99],[.5,.98]]){const pixel=new Uint8Array(4);gl.readPixels(Math.floor(gl.drawingBufferWidth*u),Math.floor(gl.drawingBufferHeight*v),1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);pixels.push([...pixel]);}
        return {perimeter,skyDistance:sky.position.distanceTo(world.camera.position),skyRadius:sky.geometry.parameters.radius*sky.scale.x,far:world.camera.far,fogNear:world.scene.fog.near,fogFar:world.scene.fog.far,triangles:world.renderer.info.render.triangles,draws:world.renderer.info.render.calls,pixels,glError:gl.getError()};
      });
      assert.deepEqual(stats.perimeter,[],`${width}/${name}: physical outer edge enters view`);assert.ok(stats.skyDistance<1e-6,`${width}/${name}: sky distance ${stats.skyDistance}`);assert.ok(stats.skyRadius<stats.far);assert.ok(stats.fogNear>140&&stats.fogFar<stats.far);assert.ok(stats.pixels.every(pixel=>pixel[3]===255&&pixel[0]+pixel[1]+pixel[2]>35));assert.equal(stats.glError,0);assert.equal(await page.evaluate(()=>JSON.stringify(world.state)),original);
      report.views.push({viewport:{width,height},name,draws:stats.draws,triangles:stats.triangles,visibleOuterEdgeVertices:stats.perimeter.length,skyDistance:stats.skyDistance,skyRadius:stats.skyRadius,cameraFar:stats.far,fog:[stats.fogNear,stats.fogFar],glError:stats.glError,darkOrTransparentEdgeSamples:stats.pixels.filter(pixel=>pixel[3]!==255||pixel[0]+pixel[1]+pixel[2]<=35).length});await page.screenshot({path:fileURLToPath(new URL(`world-expanded-${width}-${name}.png`,out))});console.log(JSON.stringify({width,height,name,...stats}));
    }
  }
  await page.evaluate(()=>world.dispose());assert.deepEqual(errors,[]);report.passed=true;report.browserErrors=errors;await fs.writeFile(new URL('world-environment-render.json',out),JSON.stringify(report,null,2)+'\n');console.log('PASS continuous terrain + stable sky/fog, same-camera proxy image/draw comparison, repeated follow/landmark/overview exclusivity at desktop/mobile. Game state unchanged; no APIs.');
}finally{await browser?.close();server.kill();}
