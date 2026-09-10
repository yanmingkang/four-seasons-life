// Temporary, local-only diagnostics. No gameplay model API is allowed through.
import fs from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {setTimeout as delay} from 'node:timers/promises';
import {createShareGateway} from '../server/share-gateway.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const out=path.join(root,'test-results');
const probe=net.createServer();probe.listen(0,'127.0.0.1');await once(probe,'listening');const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
const production=`http://127.0.0.1:${port}`;
const child=spawn(process.execPath,['server.mjs','--production'],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,PORT:String(port),GAME_DIST_ROOT:path.join(root,'dist'),ZHIHU_CLI_PATH:path.join(out,'intentionally-missing-asset-diagnosis.exe')}});
let childOutput='';child.stdout.on('data',chunk=>childOutput+=chunk);child.stderr.on('data',chunk=>childOutput+=chunk);
const passcode='asset-diagnosis-fixture';
const gateway=createShareGateway({passcode,upstream:production,secureCookies:false});
const gatewayRecords=[];
const isAsset=url=>/^\/(?:assets|models|characters)\//.test(new URL(url,'http://local').pathname);
gateway.on('request',(req,res)=>{
  if(!isAsset(req.url))return;
  const record={path:new URL(req.url,'http://local').pathname,start:Date.now(),bytes:0};gatewayRecords.push(record);
  const write=res.write,end=res.end;
  const count=chunk=>{if(chunk)record.bytes+=typeof chunk==='string'?Buffer.byteLength(chunk):chunk.byteLength;};
  res.write=function(chunk,...rest){count(chunk);return write.call(this,chunk,...rest);};
  res.end=function(chunk,...rest){count(chunk);return end.call(this,chunk,...rest);};
  res.on('finish',()=>{record.finish=Date.now();record.status=res.statusCode;record.contentLength=res.getHeader('content-length')??null;});
  res.on('close',()=>{record.close=Date.now();record.finished=res.writableFinished;});
});
gateway.listen(0,'127.0.0.1');await once(gateway,'listening');
const base=`http://127.0.0.1:${gateway.address().port}`;
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'C:/Users/25293/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
let browser;
const report={runs:[]};
try{
  for(let n=0;n<100&&!childOutput.includes(production);n++)await delay(30);
  if(!childOutput.includes(production))throw new Error('Own production process did not start');
  browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  for(const mode of ['gateway','gateway-no-routing','gateway-no-routing','direct']){
    const context=await browser.newContext({viewport:{width:1365,height:900},reducedMotion:'reduce'});
    if(mode!=='gateway-no-routing')await context.route('**/api/**',route=>route.fulfill({json:{mode:'fallback',text:'Diagnostic only; model disabled.',items:[],available:false}}));
    await context.addInitScript(()=>{
      localStorage.setItem('four-seasons-auto-depart','off');
      window.__assetReaderLog=[];
      const streams=new WeakMap(),readers=new WeakMap(),fetchNative=window.fetch;
      const isAsset=u=>/^\/(?:assets|models|characters)\//.test(new URL(u,location.href).pathname);
      window.fetch=function(input,...args){
        const url=typeof input==='string'?input:input.url;
        // Keep APIs mocked even in the no-CDP-routing comparison. This isolates
        // Playwright Fetch interception without authorizing any real API call.
        if(new URL(url,location.href).pathname.startsWith('/api/'))return Promise.resolve(new Response(JSON.stringify({mode:'fallback',text:'Diagnostic only; model disabled.',items:[],available:false}),{headers:{'content-type':'application/json'}}));
        if(!isAsset(url))return fetchNative.call(this,input,...args);
        const record={path:new URL(url,location.href).pathname,start:performance.now(),bytes:0,reads:0};window.__assetReaderLog.push(record);
        return fetchNative.call(this,input,...args).then(response=>{record.response=performance.now();record.status=response.status;record.contentLength=response.headers.get('content-length');if(response.body)streams.set(response.body,record);return response;},error=>{record.fetchError=error.name+':'+error.message;throw error;});
      };
      const getReader=ReadableStream.prototype.getReader;
      ReadableStream.prototype.getReader=function(...args){const reader=getReader.apply(this,args);if(streams.has(this))readers.set(reader,streams.get(this));return reader;};
      const read=ReadableStreamDefaultReader.prototype.read;
      ReadableStreamDefaultReader.prototype.read=function(...args){
        const record=readers.get(this);if(!record)return read.apply(this,args);
        return read.apply(this,args).then(result=>{record.reads++;record.bytes+=result.value?.byteLength||0;if(result.done)record.done=performance.now();return result;},error=>{record.readError=error.name+':'+error.message;throw error;});
      };
    });
    const page=await context.newPage(),cdp=await context.newCDPSession(page);
    const requests=new Map(),failed=[],pageErrors=[],responseTasks=[];
    await cdp.send('Network.enable',{maxTotalBufferSize:100000000,maxResourceBufferSize:10000000});
    cdp.on('Network.requestWillBeSent',e=>{if(isAsset(e.request.url))requests.set(e.requestId,{id:e.requestId,path:new URL(e.request.url).pathname,start:e.timestamp,requestWallTime:e.wallTime});});
    cdp.on('Network.responseReceived',e=>{const r=requests.get(e.requestId);if(r){r.response=e.timestamp;r.status=e.response.status;r.protocol=e.response.protocol;r.contentLength=e.response.headers['Content-Length']??null;r.transferEncoding=e.response.headers['Transfer-Encoding']??null;}});
    cdp.on('Network.dataReceived',e=>{const r=requests.get(e.requestId);if(r){r.dataBytes=(r.dataBytes||0)+e.dataLength;r.encodedDataBytes=(r.encodedDataBytes||0)+e.encodedDataLength;}});
    cdp.on('Network.loadingFinished',e=>{const r=requests.get(e.requestId);if(r){r.finished=e.timestamp;r.encodedDataLength=e.encodedDataLength;responseTasks.push(cdp.send('Network.getResponseBody',{requestId:e.requestId}).then(body=>{r.cdpBodyBytes=body.base64Encoded?Buffer.from(body.body,'base64').length:Buffer.byteLength(body.body);}).catch(error=>{r.bodyError=error.message;}));}});
    cdp.on('Network.loadingFailed',e=>{const r=requests.get(e.requestId);if(r){r.failed=e.timestamp;r.error=e.errorText;r.canceled=e.canceled;}});
    page.on('requestfailed',req=>{if(isAsset(req.url()))failed.push({path:new URL(req.url()).pathname,error:req.failure()?.errorText,time:Date.now()});});
    page.on('pageerror',e=>pageErrors.push(e.message));
    const startRecord=gatewayRecords.length;
    await page.goto(mode.startsWith('gateway')?base:production,{waitUntil:'domcontentloaded'});
    if(mode.startsWith('gateway')){await page.locator('input[name="code"]').fill(passcode);await Promise.all([page.waitForURL(base+'/'),page.locator('button[type="submit"]').click()]);}
    await page.waitForFunction(()=>['ready','partial','fallback'].includes(document.querySelector('#scene')?.dataset.assets),{},{timeout:65000});
    await page.waitForTimeout(1500);await Promise.all(responseTasks);
    const scene=await page.locator('#scene').evaluate(n=>({...n.dataset})),readerLog=await page.evaluate(()=>window.__assetReaderLog);
    const records=[...requests.values()];
    for(const record of records){record.expectedBytes=await fs.stat(path.join(root,'dist',record.path.slice(1))).then(s=>s.size,()=>null);}
    const run={mode,scene,failed,pageErrors,records,readerLog,gateway:gatewayRecords.slice(startRecord)};
    report.runs.push(run);
    console.log(JSON.stringify({mode,scene,failed,errors:records.filter(r=>r.error).map(r=>({...r,reader:readerLog.find(x=>x.path===r.path),gateway:run.gateway.find(x=>x.path===r.path)}))},null,2));
    await context.close();
  }
}finally{
  await fs.mkdir(out,{recursive:true});await fs.writeFile(path.join(out,'diagnose-production-assets.json'),JSON.stringify(report,null,2));
  await browser?.close();gateway.closeAllConnections();await new Promise(resolve=>gateway.close(resolve));
  if(child.exitCode===null){const exited=once(child,'exit');child.kill();await exited;}
}
