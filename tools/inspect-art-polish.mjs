import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';

// Read-only rendering harness: no gameplay server, storage or provider calls.
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_PATH||'C:/Users/25293/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const stage=process.argv.includes('--before')?'before':'after';
const root=new URL('../',import.meta.url),out=new URL(`../test-results/art-polish/${stage}/`,import.meta.url);
await mkdir(out,{recursive:true});
const html=`<!doctype html><meta charset="utf-8"><style>body{margin:0}canvas{display:block}</style><script type="importmap">{"imports":{"three":"/node_modules/three/build/three.module.js","three/addons/":"/node_modules/three/examples/jsm/"}}</script><script type="module">
import * as THREE from 'three';import {createReferenceDiorama} from '/src/reference-diorama.js';import {createCinematicScene3D,resolveCinematicTheme} from '/src/cinematic-scenes-3d.js';
const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(1200,900);renderer.setPixelRatio(1);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;document.body.append(renderer.domElement);let room;
window.inspect=(cell,view)=>{room?.dispose();room=view==='building'?createReferenceDiorama({cell,season:Math.floor((cell-1)/10)}):createCinematicScene3D({cell,theme:resolveCinematicTheme(cell),cameraMotion:false});room.camera.aspect=4/3;room.camera.updateProjectionMatrix();room.update(1.5);renderer.render(room.scene,room.camera);return {triangles:renderer.info.render.triangles,calls:renderer.info.render.calls,geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures,webglError:renderer.getContext().getError()};};window.ready=true;</script>`;
const server=createServer(async(req,res)=>{
  const path=new URL(req.url,'http://localhost').pathname;
  if(path==='/'){res.writeHead(200,{'Content-Type':'text/html'});return res.end(html);}
  if(!/^\/(src\/[a-z0-9-]+\.js|node_modules\/three\/(build\/three\.(core|module)\.js|examples\/jsm\/[a-zA-Z0-9_/-]+\.js))$/.test(path)){res.writeHead(404);return res.end();}
  try{res.writeHead(200,{'Content-Type':'text/javascript'});res.end(await readFile(new URL(path.slice(1),root)));}catch{res.writeHead(404);res.end();}
});
let browser;const errors=[],report={passed:false,views:[],officialApiCalls:0};
try{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const page=await browser.newPage({viewport:{width:1200,height:900}});page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);await page.waitForFunction(()=>window.ready);
  for(const [view,cells] of [['building',[1,2,4,10,14,16,20,23,26,29,38]],['scene',[6,8,10,14,15,16,18,23,25,26,27]]])for(const cell of cells){
    const metrics=await page.evaluate(([cell,view])=>window.inspect(cell,view),[cell,view]);
    assert.equal(metrics.webglError,0);assert.ok(metrics.triangles>100);
    const name=`after-${view}-${String(cell).padStart(2,'0')}.png`;
    await page.screenshot({path:fileURLToPath(new URL(name,out))});report.views.push({cell,view,...metrics,file:name});
  }
  assert.deepEqual(errors,[]);report.passed=true;console.log(JSON.stringify(report,null,2));
}finally{await writeFile(new URL('render-report.json',out),JSON.stringify({...report,errors},null,2));await browser?.close();server.close();}

