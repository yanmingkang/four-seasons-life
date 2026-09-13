// Decode only a user-specified local reference video, without uploading it.
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_PATH||'C:/Users/25293/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const source=path.resolve(process.argv[2]||'');
if(!process.argv[2]||path.extname(source).toLowerCase()!=='.mp4')throw Error('Supply one local MP4 path');
const stat=await fsp.stat(source),out=fileURLToPath(new URL('../test-results/world-reference-video/',import.meta.url));await fsp.mkdir(out,{recursive:true});
const server=http.createServer((req,res)=>{
  if(req.url==='/video'){
    const match=/^bytes=(\d+)-(\d*)$/.exec(req.headers.range||''),start=match?Number(match[1]):0,end=match&&match[2]?Math.min(Number(match[2]),stat.size-1):stat.size-1;
    if(start>end||start>=stat.size){res.writeHead(416);res.end();return;}
    res.writeHead(match?206:200,{'Content-Type':'video/mp4','Content-Length':end-start+1,'Accept-Ranges':'bytes',...(match?{'Content-Range':`bytes ${start}-${end}/${stat.size}`}:{})});fs.createReadStream(source,{start,end}).pipe(res);return;
  }
  if(req.url!=='/'){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end('<style>body{margin:0;background:#203028;color:white;font:16px system-ui}video{display:none}main{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;padding:8px}figure{margin:0}canvas{width:100%;display:block}figcaption{padding:6px}</style><video src="/video" preload="auto" muted></video><main></main>');
});await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{
  browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage({viewport:{width:1500,height:1000}});
  await page.goto(`http://127.0.0.1:${server.address().port}`);await page.waitForFunction(()=>document.querySelector('video').readyState>=2);
  const metadata=await page.evaluate(()=>{const v=document.querySelector('video');return{duration:v.duration,width:v.videoWidth,height:v.videoHeight};});
  for(const [index,fraction] of [.06,.22,.38,.54,.72,.9].entries()){
    const time=metadata.duration*fraction;
    await page.evaluate(async({time,index})=>{const video=document.querySelector('video');await new Promise(resolve=>{video.addEventListener('seeked',resolve,{once:true});video.currentTime=time;});const figure=document.createElement('figure'),c=document.createElement('canvas');c.width=video.videoWidth;c.height=video.videoHeight;c.getContext('2d').drawImage(video,0,0);c.id=`frame-${index}`;figure.append(c);const label=document.createElement('figcaption');label.textContent=`${time.toFixed(1)} s`;figure.append(label);document.querySelector('main').append(figure);},{time,index});
    await page.locator(`#frame-${index}`).screenshot({path:path.join(out,`frame-${index}.png`)});
  }
  await page.locator('main').screenshot({path:path.join(out,'contact-sheet.png')});
  await fsp.writeFile(path.join(out,'metadata.json'),JSON.stringify({...metadata,sourceName:path.basename(source),frames:6},null,2));console.log(JSON.stringify(metadata));
}finally{await browser?.close();await new Promise(r=>server.close(r));}
