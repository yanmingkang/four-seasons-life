import {createServer} from 'node:http';
import {readFile,mkdir,stat,writeFile,rename} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {resolveCinematicTheme} from '../src/cinematic-scenes-3d.js';

// Offline deterministic WebGL frame rendering, then H.264 encoding. This does
// not contact a video model, the game backend, or any third-party service.
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'C:/Users/25293/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const ffmpeg=process.env.FFMPEG_PATH||'C:/Users/25293/AppData/Roaming/TRAE SOLO CN/ModularData/ai-agent/vm/tools/app/ffmpeg/ffmpeg.exe';
// This legacy authoring utility is intentionally disconnected from the active
// team-film manifest and cannot overwrite supplied clips or their posters.
const LEGACY_CELLS=Object.freeze([6,11,13,15,18,22,27,31]);
const project=new URL('../',import.meta.url),out=new URL('../public/cinematics/procedural-preview/',import.meta.url),proof=new URL('../test-results/cinematic-production/procedural-preview/',import.meta.url);
const width=1280,height=720,fps=24,duration=4;
await mkdir(out,{recursive:true});await mkdir(proof,{recursive:true});
const harness=`<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:#000}canvas{display:block}</style><script type="importmap">{"imports":{"three":"/node_modules/three/build/three.module.js","three/addons/":"/node_modules/three/examples/jsm/"}}</script><script type="module">
import * as THREE from 'three';import {createCinematicScene3D} from '/src/cinematic-scenes-3d.js';
const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true,powerPreference:'high-performance'});renderer.setSize(${width},${height});renderer.setPixelRatio(1);renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1;document.body.append(renderer.domElement);let current;
window.select=options=>{current?.dispose();current=createCinematicScene3D(options);renderer.render(current.scene,current.camera);return {meshes:renderer.info.render.triangles}};
window.frame=t=>{current.update(t);renderer.render(current.scene,current.camera);return renderer.domElement.toDataURL('image/jpeg',.94).split(',')[1]};window.ready=true;</script>`;
const server=createServer(async(req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  if(pathname==='/'){res.writeHead(200,{'Content-Type':'text/html'});return res.end(harness);}
  const allowed=/^\/(?:src\/(?:cinematic-scenes-3d|reference-scene-environments-3d|reference-scene-population|reference-interior-details-3d|reference-depth-scenes-3d|reference-scene-batch|reference-surfaces|mascot-3d|pastoral-buildings)\.js|node_modules\/three\/(?:build\/three\.(?:module|core)\.js|examples\/jsm\/utils\/BufferGeometryUtils\.js))$/;
  if(!allowed.test(pathname)){res.writeHead(404);return res.end();}
  try{res.writeHead(200,{'Content-Type':'text/javascript'});res.end(await readFile(new URL(pathname.slice(1),project)));}catch{res.writeHead(500);res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width,height}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
const preview=process.argv.includes('--preview');const selected=process.argv.slice(2).filter(arg=>arg!=='--preview').map(Number);const records=[];
const items=(preview?selected:LEGACY_CELLS.filter(cell=>!selected.length||selected.includes(cell))).map(cell=>({cell,id:`cell-${String(cell).padStart(2,'0')}`,theme:resolveCinematicTheme(cell)}));
try{
  await page.goto(`http://127.0.0.1:${server.address().port}`);await page.waitForFunction(()=>window.ready);
  for(const item of items){
    const metrics=await page.evaluate(options=>window.select(options),{theme:item.theme,cell:item.cell});
    if(preview){const jpeg=await page.evaluate(t=>window.frame(t),1.5);await writeFile(new URL(`preview-${item.id}.jpg`,proof),Buffer.from(jpeg,'base64'));console.log(`Preview ${item.id} with ${metrics.meshes} triangles`);continue;}
    const file=new URL(`${item.id}.mp4`,out),pending=new URL(`${item.id}.pending.mp4`,out);
    // Leave the playable clip untouched until the entire replacement encodes.
    const process=spawn(ffmpeg,['-hide_banner','-loglevel','error','-y','-f','image2pipe','-vcodec','mjpeg','-framerate',String(fps),'-i','pipe:0','-an','-c:v','libx264','-preset','slow','-crf','23','-pix_fmt','yuv420p','-movflags','+faststart','-t',String(duration),fileURLToPath(pending)],{windowsHide:true,stdio:['pipe','ignore','pipe']});
    let encoderError='';process.stderr.on('data',chunk=>encoderError+=chunk);const finished=once(process,'close');
    for(let frame=0;frame<fps*duration;frame++){
      const jpeg=await page.evaluate(t=>window.frame(t),frame/fps);const bytes=Buffer.from(jpeg,'base64');
      if(frame===12||frame===84)await writeFile(new URL(`${item.id}-${frame===12?'start':'end'}.jpg`,proof),bytes);
      if(!process.stdin.write(bytes))await once(process.stdin,'drain');
    }
    process.stdin.end();const [code]=await finished;if(code!==0)throw new Error(encoderError||`ffmpeg exit ${code}`);
    await rename(pending,file);
    const bytes=(await stat(file)).size;records.push({id:item.id,theme:item.theme,durationSeconds:duration,width,height,fps,frames:fps*duration,bytes,triangles:metrics.meshes,source:'procedural-threejs',codec:'H.264'});
    console.log(`Rendered ${item.id}: ${width}x${height} ${duration}s ${bytes} bytes`);
  }
  if(errors.length)throw new Error(errors.join('\n'));
  if(!preview){
    const metadataFile=new URL('render-metadata.json',proof);let previous=[];
    if(selected.length)try{previous=JSON.parse(await readFile(metadataFile,'utf8')).records||[];}catch{}
    const refreshed=new Set(records.map(record=>record.id));
    const delivered=[...previous.filter(record=>!refreshed.has(record.id)),...records].sort((a,b)=>a.id.localeCompare(b.id));
    await writeFile(metadataFile,JSON.stringify({createdAt:new Date().toISOString(),renderer:'Three.js WebGL / deterministic frame clock',records:delivered},null,2));
  }
}finally{await browser.close();await new Promise(r=>server.close(r));}
