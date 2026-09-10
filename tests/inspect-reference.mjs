import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const require=createRequire(import.meta.url);
const {chromium}=require('C:/Users/25293/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const video='C:/Users/25293/Documents/xwechat_files/wxid_y6gn47zomc7222_8051/msg/video/2026-09/11ae6bde4ee351200db9b60e30352e97.mp4';
const size=statSync(video).size;
const server=createServer((req,res)=>{
  if(req.url!='/video'){res.writeHead(200,{'Content-Type':'text/html'});res.end('<html style="background:#222"><body style="margin:0"><video muted style="width:100vw;height:100vh;object-fit:contain" src="/video"></video></body></html>');return;}
  const range=req.headers.range;
  if(range){const [a,b]=range.replace('bytes=','').split('-');const start=Number(a),end=b?Number(b):size-1;res.writeHead(206,{'Content-Type':'video/mp4','Content-Length':end-start+1,'Content-Range':`bytes ${start}-${end}/${size}`,'Accept-Ranges':'bytes'});createReadStream(video,{start,end}).pipe(res);}
  else{res.writeHead(200,{'Content-Type':'video/mp4','Content-Length':size,'Accept-Ranges':'bytes'});createReadStream(video).pipe(res);}
});
await new Promise(r=>server.listen(4189,'127.0.0.1',r));
let browser;
try{
  const out=new URL('../test-results/reference/',import.meta.url);await mkdir(out,{recursive:true});
  browser=await chromium.launch({headless:true,channel:'chrome'});
  const page=await browser.newPage({viewport:{width:1000,height:650}});await page.goto('http://127.0.0.1:4189');
  await page.waitForFunction(()=>document.querySelector('video').readyState>=2);
  const metadata=await page.$eval('video',v=>({duration:v.duration,width:v.videoWidth,height:v.videoHeight}));console.log(metadata);
  for(let i=0;i<7;i++){
    const time=Math.min(metadata.duration-.1,.1+(metadata.duration-.2)*i/6);
    await page.$eval('video',(v,t)=>new Promise(r=>{v.addEventListener('seeked',r,{once:true});v.currentTime=t;}),time);
    await page.screenshot({path:fileURLToPath(new URL(`frame-${i}.png`,out))});console.log(`frame-${i}.png at ${time.toFixed(2)}s`);
  }
}finally{await browser?.close();server.close();}
