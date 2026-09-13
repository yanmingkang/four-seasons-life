// Reproducible stills of the game's own 3D scenes; no reference-image overlays.
// Requires the existing local Vite preview. Never calls the model API.
import {createRequire} from 'node:module';
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url);
const {chromium}=require('C:/Users/25293/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const base=process.env.MEMORY_PREVIEW_URL||'http://127.0.0.1:4174';
const out=new URL('../public/art/memories/',import.meta.url);await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--use-gl=angle','--use-angle=d3d11','--ignore-gpu-blocklist']});
try{
  const context=await browser.newContext({viewport:{width:1100,height:760},deviceScaleFactor:1,reducedMotion:'reduce'});
  await context.route('**/*',r=>{const u=new URL(r.request().url());return u.origin===base?r.continue():r.abort();});
  await context.route('**/api/**',r=>r.abort());
  await context.route('**/__memory_capture',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><html><body style="margin:0"><main id="capture" style="width:1100px;height:760px"></main></body></html>'}));
  const page=await context.newPage();await page.goto(`${base}/__memory_capture`);
  const cells=process.argv.slice(2).map(Number);if(!cells.length)cells.push(...Array.from({length:40},(_,i)=>i+1));
  for(const number of cells){
    const data=await page.evaluate(async number=>{
      const {EVENTS}=await import('/src/events.js'),{mountScenePreview}=await import('/src/scene-preview.js');
      return new Promise((resolve,reject)=>{
        const host=document.querySelector('#capture');host.replaceChildren();let cleanup;
        const timer=setTimeout(()=>{cleanup?.();reject(Error(`Scene ${number} unavailable`));},20000);
        cleanup=mountScenePreview(host,EVENTS[number-1],{captureFrame:canvas=>{
          const image=canvas.toDataURL('image/webp',.9);
          setTimeout(()=>{clearTimeout(timer);cleanup();resolve(image);},0);
        }});
      });
    },number);
    const file=new URL(`cell-${String(number).padStart(2,'0')}.webp`,out);
    await fs.writeFile(file,Buffer.from(data.split(',')[1],'base64'));console.log(`Captured 3D scene ${number}: ${fileURLToPath(file)}`);
  }
}finally{await browser.close();}
