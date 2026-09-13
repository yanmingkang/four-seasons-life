// Reproducible native 3D renders, not image edits. No remote images or model API.
import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
const require=createRequire(import.meta.url);
const {chromium}=require('C:/Users/25293/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=fileURLToPath(new URL('../',import.meta.url));
const output=new URL('../public/art/ending-v1/',import.meta.url);await fs.mkdir(output,{recursive:true});
const server=await createServer({configFile:false,root,server:{host:'127.0.0.1',port:0,strictPort:true},logLevel:'error'});await server.listen();
const base=`http://127.0.0.1:${server.httpServer.address().port}`;
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--use-gl=angle','--use-angle=d3d11','--ignore-gpu-blocklist','--no-proxy-server']});
try{
  const context=await browser.newContext({viewport:{width:1200,height:800},deviceScaleFactor:1});
  await context.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());
  await context.route('**/api/**',r=>r.abort());
  await context.route('**/__ending_capture',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><html><body style="margin:0"><main id="capture"></main></body></html>'}));
  const page=await context.newPage();await page.goto(`${base}/__ending_capture`);
  for(const theme of ['cover','accompany','communicate','grow','rest']){
    const data=await page.evaluate(async theme=>{
      const THREE=await import('/node_modules/three/build/three.module.js');
      const {createEndingMemoryScene}=await import('/src/ending-memory-scene.js');
      const {createPixelSceneCamera}=await import('/src/scene-preview.js');
      const {EffectComposer}=await import('/node_modules/three/examples/jsm/postprocessing/EffectComposer.js');
      const {RenderPixelatedPass}=await import('/node_modules/three/examples/jsm/postprocessing/RenderPixelatedPass.js');
      const {OutputPass}=await import('/node_modules/three/examples/jsm/postprocessing/OutputPass.js');
      const room=createEndingMemoryScene({theme}),{camera}=createPixelSceneCamera(room.scene);
      const renderer=new THREE.WebGLRenderer({antialias:false,alpha:false,preserveDrawingBuffer:true});renderer.setSize(1200,800);renderer.setPixelRatio(1);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.12;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;
      const fit=camera.userData.pixelFrame,halfHeight=Math.max(fit.vertical,fit.horizontal/1.5)*1.05;Object.assign(camera,{left:-halfHeight*1.5,right:halfHeight*1.5,top:halfHeight,bottom:-halfHeight});camera.updateProjectionMatrix();
      const composer=new EffectComposer(renderer),pixel=new RenderPixelatedPass(2,room.scene,camera,{normalEdgeStrength:.14,depthEdgeStrength:.4}),output=new OutputPass();
      pixel.pixelatedMaterial.fragmentShader=pixel.pixelatedMaterial.fragmentShader.replace('gl_FragColor = texel * Strength;','gl_FragColor = texel * (depth < 0.99999 ? Strength : 1.0);');composer.addPass(pixel);composer.addPass(output);composer.setSize(1200,800);composer.render();composer.render();
      const data=renderer.domElement.toDataURL('image/png');pixel.dispose();output.dispose();composer.dispose();renderer.dispose();renderer.forceContextLoss();room.dispose();return data;
    },theme);
    const file=new URL(`${theme}.png`,output);await fs.writeFile(file,Buffer.from(data.split(',')[1],'base64'));console.log(`Rendered native ending art: ${fileURLToPath(file)}`);
  }
  const contactDir=new URL('../test-results/ending-native-art/',import.meta.url);await fs.mkdir(contactDir,{recursive:true});
  await page.setViewportSize({width:1800,height:900});
  await page.setContent(`<html><body style="margin:0;padding:24px;background:#f4f0e4;font:20px sans-serif"><main style="display:grid;grid-template-columns:repeat(3,1fr);gap:18px">${['cover','accompany','communicate','grow','rest'].map(theme=>`<figure style="margin:0"><img src="${base}/art/ending-v1/${theme}.png" style="width:100%;display:block"><figcaption style="padding:10px">${theme} · 游戏原生 3D 插画</figcaption></figure>`).join('')}</main></body></html>`);
  await page.locator('img').evaluateAll(images=>Promise.all(images.map(img=>img.decode())));
  await page.screenshot({path:fileURLToPath(new URL('contact-sheet.png',contactDir)),fullPage:true});
  console.log(`Contact sheet: ${fileURLToPath(new URL('contact-sheet.png',contactDir))}`);
}finally{await browser.close();await server.close();}
